mod en_us;
mod zh_cn;

use std::sync::atomic::{AtomicU8, Ordering};

const EN_US: u8 = 0;
const ZH_CN: u8 = 1;
static ACTIVE_LOCALE: AtomicU8 = AtomicU8::new(EN_US);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ErrorMessageKey {
    ClaudeNotInstalled,
    ClaudeProbeFailed,
    ClaudeProtocolFailed,
    ClaudeNeedsInput,
    ClaudeTaskFailed,
    ClaudeTimedOut,
    CodexProbeFailed,
    CodexProtocolFailed,
    CodexNeedsInput,
    CodexTaskFailed,
    CodexTimedOut,
    OpenCodeNotInstalled,
    OpenCodeProbeFailed,
    OpenCodeProtocolFailed,
    OpenCodeNeedsInput,
    OpenCodeTaskFailed,
    OpenCodeTimedOut,
    QoderNotInstalled,
    QoderProbeFailed,
    QoderProtocolFailed,
    QoderNeedsInput,
    QoderTaskFailed,
    QoderTimedOut,
    ProcessProbeFailed,
    WorkBuddyNotInstalled,
    WorkBuddyConfigReadFailed,
    WorkBuddyProbeFailed,
    WorkBuddyProtocolFailed,
    WorkBuddyNeedsInput,
    WorkBuddyTaskFailed,
    WorkBuddyTimedOut,
    InvalidQuery,
    InvalidComparison,
    ComparisonDatabaseFailed,
    ComparisonNotFound,
    InvalidWorkspace,
    WorkspaceDatabaseFailed,
    WorkspaceFilesystemFailed,
    InvalidSkill,
    SkillDatabaseFailed,
    SkillFilesystemFailed,
    TaskDatabaseFailed,
    InvalidTask,
    TaskNotFound,
    TaskPreparationFailed,
    TaskResultFailed,
    UnsafeWorkspaceLink,
    WorkerFailed,
}

pub(crate) fn set_locale(locale: &str) {
    let locale = if locale.eq_ignore_ascii_case("zh-CN") || locale.starts_with("zh") {
        ZH_CN
    } else {
        EN_US
    };
    ACTIVE_LOCALE.store(locale, Ordering::Relaxed);
}

pub(crate) fn message(key: ErrorMessageKey) -> &'static str {
    message_for_locale(key, current_locale())
}

pub(crate) fn message_for_locale(key: ErrorMessageKey, locale: &str) -> &'static str {
    if locale.eq_ignore_ascii_case("zh-CN") || locale.starts_with("zh") {
        zh_cn::message(key)
    } else {
        en_us::message(key)
    }
}

fn current_locale() -> &'static str {
    match ACTIVE_LOCALE.load(Ordering::Relaxed) {
        ZH_CN => "zh-CN",
        _ => "en-US",
    }
}
