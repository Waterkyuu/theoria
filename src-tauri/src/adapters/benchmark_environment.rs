use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DependencyState {
    Missing,
    Unavailable,
    VersionMismatch,
    WrongEngine,
    Ready,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BenchmarkEnvironment {
    /// Whether the selected runner matches the pinned release.
    pub(crate) harbor: DependencyState,
    /// Distinguishes missing CLI, inaccessible engine, and Windows container mode.
    pub(crate) docker: DependencyState,
    /// Cached Python verifier image, independent of public benchmark images.
    pub(crate) verifier_image: DependencyState,
    /// Official installation entry selected for this host.
    pub(crate) docker_install_url: &'static str,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum EnvironmentAction {
    InstallHarbor,
    StartDocker,
    PrepareVerifier,
}

/// Includes bundled CLI locations that are often absent from desktop application PATHs.
pub(crate) fn docker_executable() -> std::path::PathBuf {
    let bundled = match std::env::consts::OS {
        "macos" => Some(std::path::PathBuf::from(
            "/Applications/Docker.app/Contents/Resources/bin/docker",
        )),
        "windows" => std::env::var_os("ProgramFiles").map(|root| {
            std::path::PathBuf::from(root).join("Docker/Docker/resources/bin/docker.exe")
        }),
        _ => None,
    };
    bundled
        .filter(|path| path.is_file())
        .unwrap_or_else(|| "docker".into())
}

/// Read-only checks do not install tools, start Docker, or download images.
pub(crate) fn inspect(app_data: &Path) -> BenchmarkEnvironment {
    inspect_paths(&super::harbor::executable(app_data), &docker_executable())
}

fn inspect_paths(harbor: &Path, docker: &Path) -> BenchmarkEnvironment {
    let cancellation = std::sync::atomic::AtomicBool::new(false);
    let probe = |executable: &Path, arguments: &[&str]| {
        super::process::run_owned_command(
            std::process::Command::new(executable)
                .args(arguments)
                .stdout(std::process::Stdio::piped()),
            std::time::Duration::from_secs(10),
            &cancellation,
        )
    };
    let harbor = match probe(harbor, &["--version"]) {
        Ok(bytes)
            if String::from_utf8_lossy(&bytes)
                .split_whitespace()
                .any(|part| part == super::harbor::HARBOR_VERSION) =>
        {
            DependencyState::Ready
        }
        Ok(_) => DependencyState::VersionMismatch,
        Err(crate::error::AppError::BenchmarkVerifierUnavailable) => DependencyState::Missing,
        Err(_) => DependencyState::Unavailable,
    };
    let docker_state = match probe(docker, &["info", "--format", "{{.OSType}}"]) {
        Ok(bytes) if bytes.trim_ascii() == b"linux" => DependencyState::Ready,
        Ok(_) => DependencyState::WrongEngine,
        Err(crate::error::AppError::BenchmarkVerifierUnavailable) => DependencyState::Missing,
        Err(_) => DependencyState::Unavailable,
    };
    let verifier_image = if docker_state == DependencyState::Ready {
        if probe(
            docker,
            &[
                "image",
                "inspect",
                super::benchmark_verifier::VERIFIER_IMAGE,
            ],
        )
        .is_ok()
        {
            DependencyState::Ready
        } else {
            DependencyState::Missing
        }
    } else {
        DependencyState::Unavailable
    };
    BenchmarkEnvironment {
        harbor,
        docker: docker_state,
        verifier_image,
        docker_install_url: match std::env::consts::OS {
            "macos" => "https://docs.docker.com/desktop/setup/install/mac-install/",
            "windows" => "https://docs.docker.com/desktop/setup/install/windows-install/",
            _ => "https://docs.docker.com/desktop/setup/install/linux/",
        },
    }
}

/// Mutations are fixed actions, invoked only by an explicit setup button.
pub(crate) fn repair(
    app_data: &Path,
    action: EnvironmentAction,
) -> Result<BenchmarkEnvironment, crate::error::AppError> {
    use crate::error::AppError;
    use std::process::{Command, Stdio};
    use std::time::Duration;
    let cancellation = std::sync::atomic::AtomicBool::new(false);
    let docker = docker_executable();
    let (mut command, timeout) = match action {
        EnvironmentAction::InstallHarbor => {
            let root = app_data.join("benchmark-tools");
            let uv = bootstrap_uv(&root)?;
            let mut command = Command::new(uv);
            command
                .args([
                    "tool",
                    "install",
                    "--python",
                    "3.13",
                    "--managed-python",
                    "--no-config",
                    "--force",
                    &format!("harbor=={}", super::harbor::HARBOR_VERSION),
                ])
                .env("UV_TOOL_DIR", root.join("environments"))
                .env("UV_TOOL_BIN_DIR", root.join("bin"))
                .env("UV_PYTHON_INSTALL_DIR", root.join("python"));
            (command, Duration::from_secs(900))
        }
        EnvironmentAction::StartDocker => {
            let mut command = Command::new(&docker);
            command.args(["desktop", "start", "--detach"]);
            (command, Duration::from_secs(30))
        }
        EnvironmentAction::PrepareVerifier => {
            let mut command = Command::new(&docker);
            command.args(["pull", super::benchmark_verifier::VERIFIER_IMAGE]);
            (command, Duration::from_secs(600))
        }
    };
    super::process::run_owned_command(command.stdout(Stdio::null()), timeout, &cancellation)
        .map_err(|_| AppError::BenchmarkVerifierUnavailable)?;
    let state = inspect(app_data);
    if matches!(action, EnvironmentAction::InstallHarbor) && state.harbor != DependencyState::Ready
        || matches!(action, EnvironmentAction::PrepareVerifier)
            && state.verifier_image != DependencyState::Ready
    {
        return Err(AppError::BenchmarkVerifierUnavailable);
    }
    Ok(state)
}

/// Bootstraps a fixed, checksum-verified package manager without shell profiles or global installs.
fn bootstrap_uv(root: &Path) -> Result<std::path::PathBuf, crate::error::AppError> {
    use crate::error::AppError;
    use sha2::{Digest, Sha256};
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::Duration;
    let binary = root
        .join("bootstrap")
        .join(format!("uv{}", std::env::consts::EXE_SUFFIX));
    if binary.is_file() {
        return Ok(binary);
    }
    let (target, checksum) = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => (
            "aarch64-apple-darwin.tar.gz",
            "fcf0a9ea6599c6ae28a4c854ac6da76f2c889354d7c36ce136ef071f7ab9721f",
        ),
        ("macos", "x86_64") => (
            "x86_64-apple-darwin.tar.gz",
            "171eb8c518313e157c5b4cec7b4f743bc6bab1bd23e09b646679a02d096a047f",
        ),
        ("linux", "x86_64") => (
            "x86_64-unknown-linux-gnu.tar.gz",
            "30ccbf0a66dc8727a02b0e245c583ee970bdafecf3a443c1686e1b30ec4939e8",
        ),
        ("linux", "aarch64") => (
            "aarch64-unknown-linux-gnu.tar.gz",
            "f71040c59798f79c44c08a7a1c1af7de95a8d334ea924b47b67ad6b9632be270",
        ),
        ("windows", "x86_64") => (
            "x86_64-pc-windows-msvc.zip",
            "eb02fd95d8e0eed462b4a67ecdd320d865b38c560bffcda9a0b87ec944bdf036",
        ),
        ("windows", "aarch64") => (
            "aarch64-pc-windows-msvc.zip",
            "79e1398ec98681b1b0494ed3485b0f4565e98a7db109a3f205d0fcdc6a1992f7",
        ),
        _ => return Err(AppError::BenchmarkVerifierUnavailable),
    };
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|_| AppError::BenchmarkVerifierUnavailable)?;
    let response = client
        .get(format!(
            "https://github.com/astral-sh/uv/releases/download/0.9.26/uv-{target}"
        ))
        .send()
        .and_then(reqwest::blocking::Response::error_for_status)
        .map_err(|_| AppError::BenchmarkVerifierUnavailable)?;
    let mut bytes = Vec::new();
    response
        .take(32 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| AppError::BenchmarkVerifierUnavailable)?;
    if bytes.len() > 32 * 1024 * 1024 || format!("{:x}", Sha256::digest(&bytes)) != checksum {
        return Err(AppError::BenchmarkVerifierUnavailable);
    }
    let extraction = root.join("uv-download");
    std::fs::create_dir_all(&extraction).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    let archive = root.join(if target.ends_with(".zip") {
        "uv.zip"
    } else {
        "uv.tar.gz"
    });
    std::fs::write(&archive, bytes).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    let mut extract = Command::new("tar");
    extract.arg("-xf").arg(&archive).arg("-C").arg(&extraction);
    super::process::run_owned_command(
        extract.stdout(Stdio::null()),
        Duration::from_secs(30),
        &std::sync::atomic::AtomicBool::new(false),
    )?;
    let source = if target.ends_with(".zip") {
        extraction.join("uv.exe")
    } else {
        extraction
            .join(format!("uv-{}", target.trim_end_matches(".tar.gz")))
            .join("uv")
    };
    std::fs::create_dir_all(root.join("bootstrap"))
        .map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    std::fs::rename(source, &binary).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    std::fs::remove_dir_all(extraction).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    std::fs::remove_file(archive).map_err(|_| AppError::BenchmarkAssetUnavailable)?;
    Ok(binary)
}

#[cfg(test)]
mod tests {
    use super::{inspect_paths, DependencyState};
    use std::path::PathBuf;

    static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

    fn fixture() -> (PathBuf, PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "theoria-environment-{}-{}",
            std::process::id(),
            SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        std::fs::create_dir_all(&root).expect("fixture directory");
        let docker = root.join(format!(
            "environment-docker{}",
            std::env::consts::EXE_SUFFIX
        ));
        assert!(std::process::Command::new("rustc")
            .arg(
                std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("tests/fixtures/benchmark-docker.rs")
            )
            .arg("-o")
            .arg(&docker)
            .status()
            .expect("compile portable engine")
            .success());
        let harbor = root.join(format!(
            "environment-harbor{}",
            std::env::consts::EXE_SUFFIX
        ));
        std::fs::copy(&docker, &harbor).expect("runner fixture");
        (root, harbor, docker)
    }

    #[test]
    fn distinguishes_runner_versions_engine_access_and_cached_images() {
        let (root, harbor, docker) = fixture();
        let ready = inspect_paths(&harbor, &docker);
        assert_eq!(ready.harbor, DependencyState::Ready);
        assert_eq!(ready.docker, DependencyState::Ready);
        assert_eq!(ready.verifier_image, DependencyState::Ready);
        std::fs::write(harbor.with_extension("state"), "wrong_version").expect("version fixture");
        std::fs::write(docker.with_extension("state"), "windows").expect("engine fixture");
        let wrong = inspect_paths(&harbor, &docker);
        assert_eq!(wrong.harbor, DependencyState::VersionMismatch);
        assert_eq!(wrong.docker, DependencyState::WrongEngine);
        assert_eq!(wrong.verifier_image, DependencyState::Unavailable);
        std::fs::write(docker.with_extension("state"), "stopped").expect("stopped engine");
        assert_eq!(
            inspect_paths(&harbor, &docker).docker,
            DependencyState::Unavailable
        );
        std::fs::write(docker.with_extension("state"), "missing_image").expect("image fixture");
        assert_eq!(
            inspect_paths(&harbor, &docker).verifier_image,
            DependencyState::Missing
        );
        assert_eq!(
            inspect_paths(&root.join("absent"), &root.join("absent")).docker,
            DependencyState::Missing
        );
        std::fs::remove_dir_all(root).expect("cleanup");
    }
    #[test]
    fn installs_only_into_the_application_owned_tool_directory() {
        let (root, fixture, _) = fixture();
        let bootstrap = root.join("benchmark-tools/bootstrap");
        std::fs::create_dir_all(&bootstrap).expect("private bootstrap");
        let uv = bootstrap.join(format!("uv{}", std::env::consts::EXE_SUFFIX));
        std::fs::copy(fixture, &uv).expect("owned installer fixture");
        let report = super::repair(&root, super::EnvironmentAction::InstallHarbor)
            .expect("install private Harbor");
        assert_eq!(report.harbor, DependencyState::Ready);
        let audit = std::fs::read_to_string(bootstrap.join("uv.audit")).expect("install audit");
        assert!(audit.contains("harbor==0.26.0"));
        assert!(audit.contains(
            &root
                .join("benchmark-tools/environments")
                .to_string_lossy()
                .to_string()
        ));
        assert!(super::super::harbor::executable(&root).starts_with(&root));
        std::fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    #[ignore = "downloads pinned uv, Python and Harbor from upstream"]
    fn prepares_a_real_private_harbor_without_global_installation() {
        let root = std::env::temp_dir().join(format!("theoria-real-setup-{}", std::process::id()));
        let result = super::repair(&root, super::EnvironmentAction::InstallHarbor);
        assert_eq!(
            result.expect("private setup").harbor,
            DependencyState::Ready
        );
        std::fs::remove_dir_all(root).expect("private setup cleanup");
    }
}
