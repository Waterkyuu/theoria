use crate::domain::task::{Task, TaskDetail};
use crate::error::AppError;
use crate::repositories::task::TaskRepository;

/// Restores immutable Task conditions and scoped History from local storage.
#[derive(Clone)]
pub(crate) struct TaskService {
    /// Persisted Task aggregate boundary.
    repository: TaskRepository,
}

impl TaskService {
    /// Creates a Task service over the shared repository.
    pub(crate) fn new(repository: TaskRepository) -> Self {
        Self { repository }
    }

    /// Lists global Recent or one Workspace History as distinct scopes.
    pub(crate) async fn list(&self, workspace_id: Option<&str>) -> Result<Vec<Task>, AppError> {
        self.repository
            .list(workspace_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)
    }

    /// Restores one Task including all locked conditions and collected results.
    pub(crate) async fn get(&self, task_id: &str) -> Result<TaskDetail, AppError> {
        self.repository
            .get(task_id)
            .await
            .map_err(|_| AppError::TaskDatabaseFailed)?
            .ok_or(AppError::TaskNotFound)
    }
}
