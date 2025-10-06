use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::activity::ActivityEvent;

pub struct ActivityRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> ActivityRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn fetch_since(
        &self,
        organization_id: Uuid,
        after_seq: Option<i64>,
        limit: i64,
    ) -> Result<Vec<ActivityEvent>, sqlx::Error> {
        let rows = sqlx::query_as::<_, ActivityRow>(
            r#"
            SELECT seq,
                   event_id,
                   organization_id,
                   task_id,
                   event_type,
                   task_version,
                   created_at,
                   payload
            FROM activity
            WHERE organization_id = $1
              AND ($2::bigint IS NULL OR seq > $2)
            ORDER BY seq ASC
            LIMIT $3
            "#,
        )
        .bind(organization_id)
        .bind(after_seq)
        .bind(limit)
        .fetch_all(self.pool)
        .await?;

        Ok(rows.into_iter().map(ActivityRow::into_event).collect())
    }
}

#[derive(sqlx::FromRow)]
struct ActivityRow {
    seq: i64,
    event_id: Uuid,
    organization_id: Uuid,
    task_id: Uuid,
    event_type: String,
    task_version: Option<i64>,
    created_at: DateTime<Utc>,
    payload: serde_json::Value,
}

impl ActivityRow {
    fn into_event(self) -> ActivityEvent {
        ActivityEvent::new(
            self.seq,
            self.event_id,
            self.organization_id,
            self.task_id,
            self.event_type,
            self.task_version,
            self.created_at,
            Some(self.payload),
        )
    }
}
