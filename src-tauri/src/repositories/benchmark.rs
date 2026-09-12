use crate::domain::benchmark::{
    BenchmarkDetail, BenchmarkDocument, BenchmarkDraft, BenchmarkMount, BenchmarkSummary,
    BenchmarkTag,
};
use crate::models::benchmark::{case, definition, draft, mount, tag, version};
use sea_orm::sea_query::{Expr, ExprTrait, OnConflict, Query};
use sea_orm::TransactionTrait;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, Condition, DatabaseConnection, DbErr,
    EntityTrait, FromQueryResult, JoinType, Order, QueryFilter, QueryOrder, QuerySelect,
    RelationTrait, Select,
};

/// Catalog operations share one SQLite transaction boundary and use SeaORM entities.
#[derive(Clone)]
pub(crate) struct BenchmarkRepository {
    /// Application database connection pool.
    database: DatabaseConnection,
}
impl BenchmarkRepository {
    /// Uses the application's existing connection pool.
    pub(crate) fn new(database: DatabaseConnection) -> Self {
        Self { database }
    }

    /// Returns classifications without loading benchmark documents.
    pub(crate) async fn tags(&self) -> Result<Vec<BenchmarkTag>, DbErr> {
        Ok(tag::Entity::find()
            .order_by_asc(tag::Column::IsSystem)
            .order_by_asc(tag::Column::Name)
            .all(&self.database)
            .await?
            .into_iter()
            .map(|row| BenchmarkTag {
                id: row.id,
                name: row.name,
                icon: row.icon,
                is_system: row.is_system,
            })
            .collect())
    }

    /// Database uniqueness also protects simultaneous tag creation.
    pub(crate) async fn create_tag(&self, value: BenchmarkTag) -> Result<BenchmarkTag, DbErr> {
        tag::ActiveModel {
            id: Set(value.id.clone()),
            name: Set(value.name.clone()),
            icon: Set(value.icon.clone()),
            is_system: Set(false),
        }
        .insert(&self.database)
        .await?;
        Ok(value)
    }

    /// Conditional updates reject stale editors without overwriting another save.
    pub(crate) async fn save_draft(
        &self,
        value: BenchmarkDraft,
        expected: Option<i64>,
    ) -> Result<Option<BenchmarkDraft>, DbErr> {
        let content = serde_json::to_string(&value.document)
            .map_err(|error| DbErr::Json(error.to_string()))?;
        match expected {
            None => {
                draft::ActiveModel {
                    id: Set(value.id.clone()),
                    benchmark_id: Set(value.benchmark_id.clone()),
                    revision: Set(1),
                    content_json: Set(content),
                    updated_at_ms: Set(value.updated_at_ms),
                }
                .insert(&self.database)
                .await?;
            }
            Some(revision) => {
                let updated = draft::Entity::update_many()
                    .col_expr(draft::Column::ContentJson, Expr::value(content))
                    .col_expr(draft::Column::Revision, Expr::value(value.revision))
                    .col_expr(draft::Column::UpdatedAtMs, Expr::value(value.updated_at_ms))
                    .filter(draft::Column::Id.eq(&value.id))
                    .filter(draft::Column::Revision.eq(revision))
                    .exec(&self.database)
                    .await?;
                if updated.rows_affected != 1 {
                    return Ok(None);
                }
            }
        }
        Ok(Some(value))
    }

    /// Draft lists omit document bodies so opening the catalog remains bounded.
    pub(crate) async fn draft_ids(&self, page: u32) -> Result<Vec<String>, DbErr> {
        draft::Entity::find()
            .select_only()
            .column(draft::Column::Id)
            .order_by_desc(draft::Column::UpdatedAtMs)
            .order_by_asc(draft::Column::Id)
            .limit(30)
            .offset(u64::from(page) * 30)
            .into_tuple()
            .all(&self.database)
            .await
    }

    /// A missing draft is distinct from an empty editor document.
    pub(crate) async fn draft(&self, id: &str) -> Result<Option<BenchmarkDraft>, DbErr> {
        let row = draft::Entity::find_by_id(id).one(&self.database).await?;
        let Some(row) = row else {
            return Ok(None);
        };
        Ok(Some(BenchmarkDraft {
            id: row.id,
            benchmark_id: row.benchmark_id,
            revision: row.revision,
            document: serde_json::from_str(&row.content_json)
                .map_err(|error| DbErr::Json(error.to_string()))?,
            updated_at_ms: row.updated_at_ms,
        }))
    }

    /// A publication atomically consumes its reviewed draft and freezes every case.
    pub(crate) async fn publish(
        &self,
        value: &BenchmarkDraft,
        benchmark_id: &str,
        version_id: &str,
        now: i64,
    ) -> Result<Option<String>, DbErr> {
        let transaction = self.database.begin().await?;
        let claimed = draft::Entity::delete_many()
            .filter(draft::Column::Id.eq(&value.id))
            .filter(draft::Column::Revision.eq(value.revision))
            .exec(&transaction)
            .await?;
        if claimed.rows_affected != 1 {
            transaction.rollback().await?;
            return Ok(None);
        }
        let document = &value.document;
        if value.benchmark_id.is_some() {
            let updated = definition::Entity::update_many()
                .col_expr(definition::Column::Name, Expr::value(document.name.trim()))
                .col_expr(
                    definition::Column::Description,
                    Expr::value(document.description.trim()),
                )
                .col_expr(
                    definition::Column::TagId,
                    Expr::value(document.tag_id.clone()),
                )
                .col_expr(definition::Column::UpdatedAtMs, Expr::value(now))
                .filter(definition::Column::Id.eq(benchmark_id))
                .filter(definition::Column::Author.eq("myself"))
                .filter(definition::Column::Archived.eq(false))
                .exec(&transaction)
                .await?;
            if updated.rows_affected != 1 {
                transaction.rollback().await?;
                return Ok(None);
            }
        } else {
            definition::ActiveModel {
                id: Set(benchmark_id.to_string()),
                name: Set(document.name.trim().to_string()),
                description: Set(document.description.trim().to_string()),
                tag_id: Set(document.tag_id.clone().ok_or_else(|| {
                    DbErr::Custom("Published benchmark requires a tag".to_string())
                })?),
                author: Set("myself".to_string()),
                source: Set(document.source.clone()),
                archived: Set(false),
                created_at_ms: Set(now),
                updated_at_ms: Set(now),
            }
            .insert(&transaction)
            .await?;
        }
        let latest = version::Entity::find()
            .filter(version::Column::BenchmarkId.eq(benchmark_id))
            .order_by_desc(version::Column::Number)
            .one(&transaction)
            .await?;
        let mut number = 1;
        if let Some(latest) = latest {
            number = latest.number + 1;
            let previous: BenchmarkDocument = serde_json::from_str(&latest.content_json)
                .map_err(|error| DbErr::Json(error.to_string()))?;
            if previous.cases == document.cases
                && previous.schema_version == document.schema_version
            {
                transaction.commit().await?;
                return Ok(Some(latest.id));
            }
        }
        version::ActiveModel {
            id: Set(version_id.to_string()),
            benchmark_id: Set(benchmark_id.to_string()),
            number: Set(number),
            content_json: Set(
                serde_json::to_string(document).map_err(|error| DbErr::Json(error.to_string()))?
            ),
            created_at_ms: Set(now),
        }
        .insert(&transaction)
        .await?;
        for (position, case) in document.cases.iter().enumerate() {
            case::ActiveModel {
                id: Set(format!("{version_id}-case-{position}")),
                version_id: Set(version_id.to_string()),
                position: Set(position as i64),
                name: Set(case.name.trim().to_string()),
                content_json: Set(
                    serde_json::to_string(case).map_err(|error| DbErr::Json(error.to_string()))?
                ),
            }
            .insert(&transaction)
            .await?;
        }
        transaction.commit().await?;
        Ok(Some(version_id.to_string()))
    }

    /// Filters and pagination happen in the database, not after loading document bodies.
    pub(crate) async fn list(
        &self,
        search: &str,
        tag_id: Option<&str>,
        author: Option<&str>,
        page: u32,
    ) -> Result<Vec<BenchmarkSummary>, DbErr> {
        let mut query = summary_query().filter(definition::Column::Archived.eq(false));
        if !search.is_empty() {
            let pattern = format!(
                "%{}%",
                search
                    .replace('\\', "\\\\")
                    .replace('%', "\\%")
                    .replace('_', "\\_")
            );
            query = query.filter(
                Condition::any()
                    .add(
                        Expr::col((definition::Entity, definition::Column::Name))
                            .like(sea_orm::sea_query::LikeExpr::new(&pattern).escape('\\')),
                    )
                    .add(
                        Expr::col((definition::Entity, definition::Column::Description))
                            .like(sea_orm::sea_query::LikeExpr::new(&pattern).escape('\\')),
                    ),
            );
        }
        if let Some(tag) = tag_id {
            query = query.filter(definition::Column::TagId.eq(tag));
        }
        if let Some(author) = author {
            query = query.filter(definition::Column::Author.eq(author));
        }
        Ok(query
            .order_by_desc(definition::Column::CreatedAtMs)
            .order_by_asc(definition::Column::Id)
            .limit(30)
            .offset(u64::from(page) * 30)
            .into_model::<SummaryRow>()
            .all(&self.database)
            .await?
            .into_iter()
            .map(Into::into)
            .collect())
    }

    /// Workspace and catalog details share a selected immutable content version.
    pub(crate) async fn detail(
        &self,
        id: &str,
        selected: Option<&str>,
    ) -> Result<Option<BenchmarkDetail>, DbErr> {
        let summary = summary_query()
            .filter(definition::Column::Id.eq(id))
            .into_model::<SummaryRow>()
            .one(&self.database)
            .await?;
        let Some(summary) = summary else {
            return Ok(None);
        };
        let summary: BenchmarkSummary = summary.into();
        let version = version::Entity::find_by_id(selected.unwrap_or(&summary.version_id))
            .filter(version::Column::BenchmarkId.eq(id))
            .one(&self.database)
            .await?;
        let Some(version) = version else {
            return Ok(None);
        };
        let mut document: BenchmarkDocument = serde_json::from_str(&version.content_json)
            .map_err(|error| DbErr::Json(error.to_string()))?;
        document.name = summary.name.clone();
        document.description = summary.description.clone();
        document.tag_id = Some(summary.tag_id.clone());
        Ok(Some(BenchmarkDetail {
            summary,
            version_id: version.id,
            version_number: version.number,
            document,
        }))
    }

    /// Repeating Mount never silently upgrades an existing workspace relationship.
    pub(crate) async fn mount(
        &self,
        value: BenchmarkMount,
    ) -> Result<Option<BenchmarkMount>, DbErr> {
        let transaction = self.database.begin().await?;
        let definition = definition::Entity::find_by_id(&value.benchmark_id)
            .one(&transaction)
            .await?;
        let Some(definition) = definition else {
            transaction.rollback().await?;
            return Ok(None);
        };
        if definition.archived {
            transaction.rollback().await?;
            return Ok(None);
        }
        mount::Entity::insert(mount::ActiveModel {
            id: Set(value.id),
            workspace_id: Set(value.workspace_id.clone()),
            benchmark_id: Set(value.benchmark_id.clone()),
            version_id: Set(value.version_id),
            created_at_ms: Set(value.created_at_ms),
        })
        .on_conflict(
            OnConflict::columns([mount::Column::WorkspaceId, mount::Column::BenchmarkId])
                .do_nothing()
                .to_owned(),
        )
        .exec_without_returning(&transaction)
        .await?;
        let row = mount::Entity::find()
            .filter(mount::Column::WorkspaceId.eq(value.workspace_id))
            .filter(mount::Column::BenchmarkId.eq(value.benchmark_id))
            .one(&transaction)
            .await?
            .ok_or_else(|| DbErr::Custom("Inserted mount is missing".to_string()))?;
        transaction.commit().await?;
        Ok(Some(mount_from_model(row)))
    }

    /// Loads bounded relationship pages without copying inputs into workspace sources.
    pub(crate) async fn mounts(
        &self,
        workspace: &str,
        page: u32,
    ) -> Result<Vec<BenchmarkMount>, DbErr> {
        Ok(mount::Entity::find()
            .filter(mount::Column::WorkspaceId.eq(workspace))
            .order_by_desc(mount::Column::CreatedAtMs)
            .order_by_asc(mount::Column::Id)
            .limit(30)
            .offset(u64::from(page) * 30)
            .all(&self.database)
            .await?
            .into_iter()
            .map(mount_from_model)
            .collect())
    }

    /// Unmount cannot remove immutable versions or evaluation history.
    pub(crate) async fn unmount(&self, workspace: &str, id: &str) -> Result<(), DbErr> {
        mount::Entity::delete_many()
            .filter(mount::Column::Id.eq(id))
            .filter(mount::Column::WorkspaceId.eq(workspace))
            .exec(&self.database)
            .await?;
        Ok(())
    }
}

/// Projects latest version metadata in one query; cases are counted without loading their content.
fn summary_query() -> Select<definition::Entity> {
    let latest = Query::select()
        .column((version::Entity, version::Column::Id))
        .from(version::Entity)
        .and_where(
            Expr::col((version::Entity, version::Column::BenchmarkId))
                .equals((definition::Entity, definition::Column::Id)),
        )
        .order_by(version::Column::Number, Order::Desc)
        .limit(1)
        .to_owned();
    let count = Query::select()
        .expr(Expr::col((case::Entity, case::Column::Id)).count())
        .from(case::Entity)
        .and_where(
            Expr::col((case::Entity, case::Column::VersionId))
                .equals((version::Entity, version::Column::Id)),
        )
        .to_owned();
    definition::Entity::find()
        .select_only()
        .columns([
            definition::Column::Id,
            definition::Column::Name,
            definition::Column::Description,
            definition::Column::TagId,
            definition::Column::Author,
            definition::Column::Source,
            definition::Column::Archived,
            definition::Column::CreatedAtMs,
        ])
        .column_as(
            Expr::col((version::Entity, version::Column::Id)),
            "version_id",
        )
        .column_as(
            Expr::col((version::Entity, version::Column::Number)),
            "version_number",
        )
        .column_as(Expr::from(count), "case_count")
        .join(JoinType::InnerJoin, definition::Relation::Versions.def())
        .filter(version::Column::Id.in_subquery(latest))
}

/// Converts a relationship row without exposing unrelated workspace metadata.
fn mount_from_model(row: mount::Model) -> BenchmarkMount {
    BenchmarkMount {
        id: row.id,
        workspace_id: row.workspace_id,
        benchmark_id: row.benchmark_id,
        version_id: row.version_id,
        created_at_ms: row.created_at_ms,
    }
}

/// Typed projection of catalog metadata and the latest version.
#[derive(Debug, FromQueryResult)]
struct SummaryRow {
    /// Stable definition identifier.
    id: String,
    /// Current catalog title.
    name: String,
    /// Current catalog description.
    description: String,
    /// Exactly one local classification.
    tag_id: String,
    /// Platform or myself, assigned by the application.
    author: String,
    /// Optional source attribution.
    source: Option<String>,
    /// Whether new mounts are disabled.
    archived: bool,
    /// Latest published immutable version.
    version_id: String,
    /// Monotonic content version number.
    version_number: i64,
    /// Number of cases in the latest version.
    case_count: i64,
    /// Definition creation time in UTC milliseconds.
    created_at_ms: i64,
}

impl From<SummaryRow> for BenchmarkSummary {
    fn from(row: SummaryRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            description: row.description,
            tag_id: row.tag_id,
            author: row.author,
            source: row.source,
            archived: row.archived,
            version_id: row.version_id,
            version_number: row.version_number,
            case_count: row.case_count,
            created_at_ms: row.created_at_ms,
        }
    }
}
