use crate::domain::agent_kind::AgentKind;
use crate::domain::benchmark::BenchmarkDetail;
use crate::domain::benchmark_task::{
    BenchmarkCaseExecution, BenchmarkExecutionResult, BenchmarkTaskAgent, BenchmarkTaskCase,
    BenchmarkTaskConfiguration, BenchmarkTaskDetail,
};
use crate::domain::task::{Task, TaskKind, TaskPermissions, TaskStatus};
use crate::models::benchmark::{
    self as benchmark, case as benchmark_case, evaluation as benchmark_evaluation,
    execution as benchmark_execution, task as benchmark_task, task_agent, task_case, version,
};
use crate::models::task::{self as task, permissions};
use sea_orm::sea_query::{Expr, Query};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, DbErr, EntityTrait,
    QueryFilter, QueryOrder, TransactionTrait,
};
use std::collections::HashMap;

/// Transactional persistence for one top-level Benchmark Task and its execution matrix.
#[derive(Clone)]
pub(crate) struct BenchmarkTaskRepository {
    database: DatabaseConnection,
}

impl BenchmarkTaskRepository {
    pub(crate) fn new(database: DatabaseConnection) -> Self {
        Self { database }
    }

    /// Resolves an already committed idempotent request before mutable mount validation.
    pub(crate) async fn by_idempotency_key(
        &self,
        key: &str,
        request_json: &str,
    ) -> Result<Option<BenchmarkTaskDetail>, DbErr> {
        let row = benchmark_task::Entity::find()
            .filter(benchmark_task::Column::IdempotencyKey.eq(key))
            .one(&self.database)
            .await?;
        let Some(row) = row else {
            return Ok(None);
        };
        if row.request_json != request_json {
            return Err(DbErr::Custom("Benchmark idempotency conflict".into()));
        }
        self.get(&row.task_id).await
    }

    /// Writes the common Task identity and all N×M execution rows in one transaction.
    pub(crate) async fn create(
        &self,
        task: Task,
        configuration: &BenchmarkTaskConfiguration,
        benchmark: &BenchmarkDetail,
        idempotency_key: &str,
        request_json: &str,
    ) -> Result<BenchmarkTaskDetail, DbErr> {
        let transaction = self.database.begin().await?;
        task::ActiveModel {
            id: Set(task.id.clone()),
            workspace_id: Set(task.workspace_id.clone()),
            title: Set(task.title.clone()),
            kind: Set(task.kind.as_str().to_string()),
            status: Set(task.status.as_str().to_string()),
            configuration_locked_at_ms: Set(task.configuration_locked_at_ms),
            pinned_at_ms: Set(task.pinned_at_ms),
            created_at_ms: Set(task.created_at_ms),
            updated_at_ms: Set(task.updated_at_ms),
        }
        .insert(&transaction)
        .await?;
        permissions::ActiveModel {
            task_id: Set(task.id.clone()),
            file_access: Set(configuration.permissions.file_access.clone()),
            command_execution: Set(configuration.permissions.command_execution.clone()),
            created_at_ms: Set(task.created_at_ms),
        }
        .insert(&transaction)
        .await?;
        benchmark_task::ActiveModel {
            task_id: Set(task.id.clone()),
            version_id: Set(benchmark.version_id.clone()),
            idempotency_key: Set(idempotency_key.to_string()),
            request_json: Set(request_json.to_string()),
            rerun_of_task_id: Set(None),
            result_completeness: Set("incomplete".to_string()),
            completion_reason: Set(None),
            cancel_requested: Set(false),
        }
        .insert(&transaction)
        .await?;

        for (position, agent_kind) in configuration.agent_kinds.iter().enumerate() {
            task_agent::ActiveModel {
                id: Set(format!("{}-agent-{position}", task.id)),
                task_id: Set(task.id.clone()),
                agent_kind: Set(agent_kind.as_str().to_string()),
                position: Set(position as i64),
            }
            .insert(&transaction)
            .await?;
        }
        for (position, _) in benchmark.document.cases.iter().enumerate() {
            let task_case_id = format!("{}-case-{position}", task.id);
            task_case::ActiveModel {
                id: Set(task_case_id.clone()),
                task_id: Set(task.id.clone()),
                case_id: Set(format!("{}-case-{position}", benchmark.version_id)),
                version_id: Set(benchmark.version_id.clone()),
                position: Set(position as i64),
            }
            .insert(&transaction)
            .await?;
            for agent_position in 0..configuration.agent_kinds.len() {
                benchmark_execution::ActiveModel {
                    id: Set(format!("{}-execution-{position}-{agent_position}", task.id)),
                    task_id: Set(task.id.clone()),
                    task_case_id: Set(task_case_id.clone()),
                    task_agent_id: Set(format!("{}-agent-{agent_position}", task.id)),
                    phase: Set("queued".to_string()),
                    termination_reason: Set(None),
                    session_id: Set(None),
                    response_text: Set(None),
                    metrics_json: Set(None),
                    started_at_ms: Set(None),
                    finished_at_ms: Set(None),
                }
                .insert(&transaction)
                .await?;
            }
        }
        transaction.commit().await?;
        self.get(&task.id)
            .await?
            .ok_or_else(|| DbErr::Custom("Created benchmark task is missing".into()))
    }

    /// Restores a Benchmark Task without loading work-task inputs.
    pub(crate) async fn get(&self, task_id: &str) -> Result<Option<BenchmarkTaskDetail>, DbErr> {
        let task_row = task::Entity::find_by_id(task_id)
            .one(&self.database)
            .await?;
        let Some(task_row) = task_row else {
            return Ok(None);
        };
        let kind = TaskKind::parse(&task_row.kind)
            .ok_or_else(|| DbErr::Custom("Invalid task kind".into()))?;
        if kind != TaskKind::Benchmark {
            return Err(DbErr::Custom("Expected a benchmark task".into()));
        }
        let task = Task {
            id: task_row.id,
            workspace_id: task_row.workspace_id,
            title: task_row.title,
            kind,
            status: TaskStatus::parse(&task_row.status)
                .ok_or_else(|| DbErr::Custom("Invalid task status".into()))?,
            configuration_locked_at_ms: task_row.configuration_locked_at_ms,
            pinned_at_ms: task_row.pinned_at_ms,
            created_at_ms: task_row.created_at_ms,
            updated_at_ms: task_row.updated_at_ms,
        };
        let extension = benchmark_task::Entity::find_by_id(task_id)
            .one(&self.database)
            .await?
            .ok_or_else(|| DbErr::Custom("Benchmark task extension is missing".into()))?;
        let version = version::Entity::find_by_id(&extension.version_id)
            .one(&self.database)
            .await?
            .ok_or_else(|| DbErr::Custom("Benchmark task version is missing".into()))?;
        let definition = benchmark::Entity::find_by_id(&version.benchmark_id)
            .one(&self.database)
            .await?
            .ok_or_else(|| DbErr::Custom("Benchmark definition is missing".into()))?;
        let permission = permissions::Entity::find_by_id(task_id)
            .one(&self.database)
            .await?
            .ok_or_else(|| DbErr::Custom("Task permissions are missing".into()))?;

        let agents = task_agent::Entity::find()
            .filter(task_agent::Column::TaskId.eq(task_id))
            .order_by_asc(task_agent::Column::Position)
            .all(&self.database)
            .await?
            .into_iter()
            .map(|row| {
                Ok(BenchmarkTaskAgent {
                    id: row.id,
                    agent_kind: AgentKind::parse(&row.agent_kind)
                        .ok_or_else(|| DbErr::Custom("Invalid benchmark agent".into()))?,
                    position: usize::try_from(row.position)
                        .map_err(|_| DbErr::Custom("Invalid agent position".into()))?,
                })
            })
            .collect::<Result<Vec<_>, DbErr>>()?;

        let task_case_rows = task_case::Entity::find()
            .filter(task_case::Column::TaskId.eq(task_id))
            .order_by_asc(task_case::Column::Position)
            .all(&self.database)
            .await?;
        let case_ids = task_case_rows
            .iter()
            .map(|row| row.case_id.clone())
            .collect::<Vec<_>>();
        let case_rows = benchmark_case::Entity::find()
            .filter(benchmark_case::Column::Id.is_in(case_ids))
            .all(&self.database)
            .await?;
        let mut cases_by_id = case_rows
            .into_iter()
            .map(|row| (row.id.clone(), row))
            .collect::<HashMap<_, _>>();
        let cases = task_case_rows
            .into_iter()
            .map(|row| {
                let content = cases_by_id
                    .remove(&row.case_id)
                    .ok_or_else(|| DbErr::Custom("Benchmark task case is missing".into()))?
                    .content_json;
                Ok(BenchmarkTaskCase {
                    id: row.id,
                    case_id: row.case_id,
                    position: usize::try_from(row.position)
                        .map_err(|_| DbErr::Custom("Invalid case position".into()))?,
                    content: serde_json::from_str(&content)
                        .map_err(|error| DbErr::Json(error.to_string()))?,
                })
            })
            .collect::<Result<Vec<_>, DbErr>>()?;

        let execution_rows = benchmark_execution::Entity::find()
            .filter(benchmark_execution::Column::TaskId.eq(task_id))
            .order_by_asc(benchmark_execution::Column::TaskCaseId)
            .order_by_asc(benchmark_execution::Column::TaskAgentId)
            .all(&self.database)
            .await?;
        let execution_ids = execution_rows
            .iter()
            .map(|row| row.id.clone())
            .collect::<Vec<_>>();
        let evaluation_rows = benchmark_evaluation::Entity::find()
            .filter(benchmark_evaluation::Column::ExecutionId.is_in(execution_ids))
            .all(&self.database)
            .await?;
        let mut evaluations_by_execution = evaluation_rows
            .into_iter()
            .map(|row| (row.execution_id.clone(), row))
            .collect::<HashMap<_, _>>();
        let executions = execution_rows
            .into_iter()
            .map(|row| {
                let evaluation = evaluations_by_execution.remove(&row.id);
                BenchmarkCaseExecution {
                    id: row.id,
                    task_case_id: row.task_case_id,
                    task_agent_id: row.task_agent_id,
                    phase: row.phase,
                    termination_reason: row.termination_reason,
                    session_id: row.session_id,
                    response_text: row.response_text,
                    metrics_json: row.metrics_json,
                    started_at_ms: row.started_at_ms,
                    finished_at_ms: row.finished_at_ms,
                    verdict: evaluation.as_ref().map(|value| value.verdict.clone()),
                    report_json: evaluation.map(|value| value.report_json),
                }
            })
            .collect();

        Ok(Some(BenchmarkTaskDetail {
            task,
            benchmark_id: definition.id,
            benchmark_name: definition.name,
            version_id: extension.version_id,
            version_number: version.number,
            rerun_of_task_id: extension.rerun_of_task_id,
            result_completeness: extension.result_completeness,
            completion_reason: extension.completion_reason,
            cancel_requested: extension.cancel_requested,
            permissions: TaskPermissions {
                file_access: permission.file_access,
                command_execution: permission.command_execution,
            },
            agents,
            cases,
            executions,
        }))
    }

    /// Marks a newly created task as runnable after its complete plan is visible.
    pub(crate) async fn mark_running(&self, task_id: &str, now: i64) -> Result<(), DbErr> {
        task::Entity::update_many()
            .col_expr(task::Column::Status, Expr::value("running"))
            .col_expr(task::Column::UpdatedAtMs, Expr::value(now))
            .filter(task::Column::Id.eq(task_id))
            .filter(task::Column::Status.eq("preparing"))
            .exec(&self.database)
            .await?;
        Ok(())
    }

    /// Claims one queued matrix cell so duplicate scheduler wakeups cannot start it twice.
    pub(crate) async fn claim_execution(&self, execution_id: &str) -> Result<bool, DbErr> {
        let cancelled_tasks = Query::select()
            .column(benchmark_task::Column::TaskId)
            .from(benchmark_task::Entity)
            .and_where(benchmark_task::Column::CancelRequested.eq(true))
            .to_owned();
        let updated = benchmark_execution::Entity::update_many()
            .col_expr(benchmark_execution::Column::Phase, Expr::value("preparing"))
            .filter(benchmark_execution::Column::Id.eq(execution_id))
            .filter(benchmark_execution::Column::Phase.eq("queued"))
            .filter(benchmark_execution::Column::TaskId.not_in_subquery(cancelled_tasks))
            .exec(&self.database)
            .await?;
        Ok(updated.rows_affected == 1)
    }

    /// Records the moment an Agent receives one case.
    pub(crate) async fn mark_execution_running(
        &self,
        execution_id: &str,
        now: i64,
    ) -> Result<(), DbErr> {
        benchmark_execution::Entity::update_many()
            .col_expr(benchmark_execution::Column::Phase, Expr::value("running"))
            .col_expr(benchmark_execution::Column::StartedAtMs, Expr::value(now))
            .filter(benchmark_execution::Column::Id.eq(execution_id))
            .filter(benchmark_execution::Column::Phase.eq("preparing"))
            .exec(&self.database)
            .await?;
        Ok(())
    }

    /// Saves one cell's output and optional score without allowing later callbacks to overwrite it.
    pub(crate) async fn finish_execution(
        &self,
        execution_id: &str,
        result: BenchmarkExecutionResult,
    ) -> Result<(), DbErr> {
        let transaction = self.database.begin().await?;
        let updated = benchmark_execution::Entity::update_many()
            .col_expr(benchmark_execution::Column::Phase, Expr::value("finished"))
            .col_expr(
                benchmark_execution::Column::TerminationReason,
                Expr::value(result.termination_reason),
            )
            .col_expr(
                benchmark_execution::Column::SessionId,
                Expr::value(result.session_id),
            )
            .col_expr(
                benchmark_execution::Column::ResponseText,
                Expr::value(result.response_text),
            )
            .col_expr(
                benchmark_execution::Column::MetricsJson,
                Expr::value(result.metrics_json),
            )
            .col_expr(
                benchmark_execution::Column::FinishedAtMs,
                Expr::value(result.finished_at_ms),
            )
            .filter(benchmark_execution::Column::Id.eq(execution_id))
            .filter(benchmark_execution::Column::Phase.is_in([
                "preparing",
                "running",
                "collecting",
                "evaluating",
                "stopping",
            ]))
            .exec(&transaction)
            .await?;
        if updated.rows_affected != 1 {
            transaction.rollback().await?;
            return Err(DbErr::Custom("Benchmark execution is not active".into()));
        }
        if let Some(report) = result.report {
            benchmark_evaluation::ActiveModel {
                execution_id: Set(execution_id.to_string()),
                verdict: Set(if report.passed { "passed" } else { "failed" }.to_string()),
                validator_version: Set(1),
                report_json: Set(serde_json::to_string(&report)
                    .map_err(|error| DbErr::Json(error.to_string()))?),
                created_at_ms: Set(result.finished_at_ms),
            }
            .insert(&transaction)
            .await?;
        }
        transaction.commit().await
    }

    /// Derives aggregate lifecycle and completeness from the persisted matrix.
    pub(crate) async fn refresh_status(&self, task_id: &str, now: i64) -> Result<(), DbErr> {
        let executions = benchmark_execution::Entity::find()
            .filter(benchmark_execution::Column::TaskId.eq(task_id))
            .all(&self.database)
            .await?;
        if executions.is_empty() {
            return Err(DbErr::Custom("Benchmark task matrix is missing".into()));
        }
        let extension = benchmark_task::Entity::find_by_id(task_id)
            .one(&self.database)
            .await?
            .ok_or_else(|| DbErr::Custom("Benchmark task extension is missing".into()))?;
        let execution_ids = executions
            .iter()
            .map(|execution| execution.id.clone())
            .collect::<Vec<_>>();
        let evaluations = benchmark_evaluation::Entity::find()
            .filter(benchmark_evaluation::Column::ExecutionId.is_in(execution_ids))
            .all(&self.database)
            .await?;
        let finished = executions
            .iter()
            .filter(|execution| execution.phase == "finished")
            .count();
        let countable = executions
            .iter()
            .filter(|execution| {
                evaluations
                    .iter()
                    .any(|evaluation| evaluation.execution_id == execution.id)
                    || matches!(
                        execution.termination_reason.as_deref(),
                        Some("timed_out" | "agent_error")
                    )
            })
            .count();
        let (status, completeness, reason) = if finished < executions.len() {
            ("running", "incomplete", None)
        } else if extension.cancel_requested {
            ("stopped", "incomplete", Some("cancelled"))
        } else if countable == executions.len() {
            ("completed", "complete", Some("normal"))
        } else {
            ("failed", "incomplete", Some("evaluation_error"))
        };
        let transaction = self.database.begin().await?;
        benchmark_task::Entity::update_many()
            .col_expr(
                benchmark_task::Column::ResultCompleteness,
                Expr::value(completeness),
            )
            .col_expr(
                benchmark_task::Column::CompletionReason,
                Expr::value(reason.map(str::to_string)),
            )
            .filter(benchmark_task::Column::TaskId.eq(task_id))
            .exec(&transaction)
            .await?;
        task::Entity::update_many()
            .col_expr(task::Column::Status, Expr::value(status))
            .col_expr(task::Column::UpdatedAtMs, Expr::value(now))
            .filter(task::Column::Id.eq(task_id))
            .exec(&transaction)
            .await?;
        transaction.commit().await
    }
}
