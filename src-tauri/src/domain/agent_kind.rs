/// Supported local Agent product.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum AgentKind {
    Codex,
    Claude,
    OpenCode,
    WorkBuddy,
}

impl AgentKind {
    /// Returns the stable database and IPC identifier for this Agent.
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::OpenCode => "opencode",
            Self::WorkBuddy => "workbuddy",
        }
    }

    /// Parses a trusted persisted Agent identifier.
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "codex" => Some(Self::Codex),
            "claude" => Some(Self::Claude),
            "opencode" => Some(Self::OpenCode),
            "workbuddy" => Some(Self::WorkBuddy),
            _ => None,
        }
    }
}
