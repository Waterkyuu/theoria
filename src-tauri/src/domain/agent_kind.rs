/// Supported local Agent product.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum AgentKind {
    Codex,
    Claude,
    OpenCode,
    Qoder,
    Trae,
    WorkBuddy,
}

impl AgentKind {
    /// Returns the stable database and IPC identifier for this Agent.
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::OpenCode => "opencode",
            Self::Qoder => "qoder",
            Self::Trae => "trae",
            Self::WorkBuddy => "workbuddy",
        }
    }

    /// Parses a trusted persisted Agent identifier.
    pub(crate) fn parse(value: &str) -> Option<Self> {
        match value {
            "codex" => Some(Self::Codex),
            "claude" => Some(Self::Claude),
            "opencode" => Some(Self::OpenCode),
            "qoder" => Some(Self::Qoder),
            "trae" => Some(Self::Trae),
            "workbuddy" => Some(Self::WorkBuddy),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AgentKind;

    #[test]
    fn round_trips_qoder_and_trae_identifiers() {
        assert_eq!(AgentKind::parse("qoder"), Some(AgentKind::Qoder));
        assert_eq!(AgentKind::Qoder.as_str(), "qoder");
        assert_eq!(AgentKind::parse("trae"), Some(AgentKind::Trae));
        assert_eq!(AgentKind::Trae.as_str(), "trae");
    }
}
