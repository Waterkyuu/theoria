use crate::utils::debounce::EventDebouncer;
use notify::{recommended_watcher, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::ffi::OsStr;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Native outcomes produced by the OpenCode configuration watcher.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum OpenCodeConfigWatchEvent {
    Changed,
    Failed,
}

/// Owns native subscriptions for every local file in OpenCode's documented config precedence.
pub(crate) struct OpenCodeConfigWatcher {
    /// Live watcher handle retained for the application lifetime.
    _watcher: Mutex<RecommendedWatcher>,
    /// Debounce worker that collapses editor save bursts into one frontend refresh.
    _debouncer: EventDebouncer,
}

impl OpenCodeConfigWatcher {
    /// Watches existing parent directories so file creation and atomic replacement are observable.
    pub(crate) fn start(
        config_paths: Vec<PathBuf>,
        on_event: impl Fn(OpenCodeConfigWatchEvent) + Send + Sync + 'static,
    ) -> notify::Result<Option<Self>> {
        let mut watched_directories = config_paths
            .iter()
            .filter_map(|path| path.parent().map(Path::to_path_buf))
            .filter(|path| path.is_dir())
            .collect::<Vec<_>>();
        watched_directories.sort_unstable();
        watched_directories.dedup();
        if watched_directories.is_empty() {
            return Ok(None);
        }

        let on_event = Arc::new(on_event);
        let debounced_on_event = Arc::clone(&on_event);
        let (debouncer, debounce_trigger) = EventDebouncer::start(move || {
            debounced_on_event(OpenCodeConfigWatchEvent::Changed);
        })
        .map_err(notify::Error::io)?;
        let mut watcher = recommended_watcher(move |result: notify::Result<Event>| match result {
            Ok(event) if event_affects_config(&event, &config_paths) => {
                if debounce_trigger.signal_change().is_err() {
                    on_event(OpenCodeConfigWatchEvent::Failed);
                }
            }
            Ok(_) => {}
            Err(_) => on_event(OpenCodeConfigWatchEvent::Failed),
        })?;

        for directory in watched_directories {
            watcher.watch(&directory, RecursiveMode::NonRecursive)?;
        }

        Ok(Some(Self {
            _watcher: Mutex::new(watcher),
            _debouncer: debouncer,
        }))
    }
}

/// Collects file-backed OpenCode config layers; inline and remote layers remain polling-only.
pub(crate) fn opencode_config_paths() -> Vec<PathBuf> {
    opencode_config_paths_from(
        dirs::home_dir().as_deref(),
        std::env::current_dir().ok().as_deref(),
        std::env::var_os("OPENCODE_CONFIG").as_deref(),
        std::env::var_os("OPENCODE_CONFIG_DIR").as_deref(),
    )
}

fn opencode_config_paths_from(
    home_directory: Option<&Path>,
    current_directory: Option<&Path>,
    custom_config: Option<&OsStr>,
    custom_directory: Option<&OsStr>,
) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(home) = home_directory {
        add_json_config_candidates(&mut paths, &home.join(".config").join("opencode"));
    }
    if let Some(path) = custom_config {
        paths.push(PathBuf::from(path));
    }
    if let Some(directory) = custom_directory {
        add_json_config_candidates(&mut paths, Path::new(directory));
    }
    if let Some(current) = current_directory {
        for ancestor in current.ancestors() {
            add_json_config_candidates(&mut paths, ancestor);
            add_json_config_candidates(&mut paths, &ancestor.join(".opencode"));
            if ancestor.join(".git").exists() {
                break;
            }
        }
    }
    if let Some(directory) = managed_config_directory() {
        add_json_config_candidates(&mut paths, &directory);
    }

    paths.sort_unstable();
    paths.dedup();
    paths
}

fn add_json_config_candidates(paths: &mut Vec<PathBuf>, directory: &Path) {
    paths.push(directory.join("opencode.json"));
    paths.push(directory.join("opencode.jsonc"));
}

fn managed_config_directory() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        Some(PathBuf::from("/Library/Application Support/opencode"))
    }

    #[cfg(target_os = "linux")]
    {
        Some(PathBuf::from("/etc/opencode"))
    }

    #[cfg(target_os = "windows")]
    {
        std::env::var_os("ProgramData")
            .map(PathBuf::from)
            .map(|path| path.join("opencode"))
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

fn event_affects_config(event: &Event, config_paths: &[PathBuf]) -> bool {
    let mutating_event = matches!(
        event.kind,
        EventKind::Any | EventKind::Create(_) | EventKind::Modify(_) | EventKind::Remove(_)
    );
    mutating_event
        && event
            .paths
            .iter()
            .any(|changed_path| config_paths.iter().any(|path| path == changed_path))
}

#[cfg(test)]
mod tests {
    use super::{event_affects_config, opencode_config_paths_from};
    use notify::event::{AccessKind, AccessMode};
    use notify::{Event, EventKind};
    use std::ffi::OsStr;
    use std::path::{Path, PathBuf};

    #[test]
    fn collects_official_global_custom_and_project_config_paths() {
        let paths = opencode_config_paths_from(
            Some(Path::new("/home/test")),
            Some(Path::new("/work/project/app")),
            Some(OsStr::new("/custom/opencode-team.jsonc")),
            Some(OsStr::new("/custom/opencode")),
        );

        for expected in [
            "/home/test/.config/opencode/opencode.json",
            "/home/test/.config/opencode/opencode.jsonc",
            "/custom/opencode-team.jsonc",
            "/custom/opencode/opencode.json",
            "/custom/opencode/opencode.jsonc",
            "/work/project/app/opencode.json",
            "/work/project/app/opencode.jsonc",
            "/work/project/app/.opencode/opencode.json",
            "/work/project/app/.opencode/opencode.jsonc",
        ] {
            assert!(
                paths.contains(&PathBuf::from(expected)),
                "missing {expected}"
            );
        }
    }

    #[test]
    fn accepts_only_mutations_for_an_official_opencode_config_path() {
        let config_path = PathBuf::from("/home/test/.config/opencode/opencode.jsonc");
        let mutation = Event::new(EventKind::Any).add_path(config_path.clone());
        let read = Event::new(EventKind::Access(AccessKind::Close(AccessMode::Read)))
            .add_path(config_path.clone());
        let unrelated = Event::new(EventKind::Any)
            .add_path(PathBuf::from("/home/test/.config/opencode/auth.json"));

        assert!(event_affects_config(
            &mutation,
            std::slice::from_ref(&config_path)
        ));
        assert!(!event_affects_config(
            &read,
            std::slice::from_ref(&config_path)
        ));
        assert!(!event_affects_config(&unrelated, &[config_path]));
    }
}
