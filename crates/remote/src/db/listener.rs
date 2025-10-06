use std::time::Duration;

use anyhow::Context;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use sqlx::{PgPool, postgres::PgListener};
use tokio::time::sleep;
use uuid::Uuid;

use crate::activity::{ActivityBroker, ActivityEvent};

pub struct ActivityListener {
    pool: PgPool,
    broker: ActivityBroker,
    channel: String,
}

impl ActivityListener {
    pub fn new(pool: PgPool, broker: ActivityBroker, channel: String) -> Self {
        Self {
            pool,
            broker,
            channel,
        }
    }

    pub async fn run(self) {
        let mut backoff = Duration::from_secs(1);
        let max_backoff = Duration::from_secs(30);

        let pool = self.pool;
        let broker = self.broker;
        let channel = self.channel;

        loop {
            match listen_loop(&pool, &broker, &channel).await {
                Ok(_) => {
                    backoff = Duration::from_secs(1);
                }
                Err(error) => {
                    tracing::error!(?error, "activity listener error; retrying");
                    sleep(backoff).await;
                    backoff = (backoff * 2).min(max_backoff);
                }
            }
        }
    }
}

async fn listen_loop(pool: &PgPool, broker: &ActivityBroker, channel: &str) -> anyhow::Result<()> {
    let mut listener = PgListener::connect_with(pool)
        .await
        .context("failed to create LISTEN connection")?;
    listener
        .listen(channel)
        .await
        .with_context(|| format!("failed to LISTEN on channel {channel}"))?;

    loop {
        let notification = listener
            .recv()
            .await
            .context("failed to receive LISTEN notification")?;

        let payload: NotificationEnvelope = serde_json::from_str(notification.payload())
            .with_context(|| format!("invalid notification payload: {}", notification.payload()))?;

        let event = ActivityEvent::new(
            payload.seq,
            payload.event_id,
            payload.organization_id,
            payload.task_id,
            payload.event_type,
            payload.task_version,
            payload.created_at,
            None,
        );

        broker.publish(event);
    }
}

#[derive(Debug, Deserialize)]
struct NotificationEnvelope {
    seq: i64,
    event_id: Uuid,
    organization_id: Uuid,
    task_id: Uuid,
    event_type: String,
    task_version: Option<i64>,
    created_at: DateTime<Utc>,
}
