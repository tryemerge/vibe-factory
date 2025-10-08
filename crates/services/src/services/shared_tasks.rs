use std::{str::FromStr, time::Duration};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use db::{
    DBService,
    models::{
        shared_task::{SharedActivityCursor, SharedTask, SharedTaskInput},
        task::TaskStatus,
    },
};
use futures_util::{SinkExt, StreamExt};
use reqwest::Client;
use serde::Deserialize;
use tokio::time::sleep;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tracing::{debug, error, info, warn};
use url::Url;
use uuid::Uuid;

const DEFAULT_ACTIVITY_LIMIT: u32 = 200;

#[derive(Clone)]
pub struct SharedTaskSyncConfig {
    api_base: Url,
    websocket_base: Url,
    organization_id: Uuid,
    activity_page_limit: u32,
}

impl SharedTaskSyncConfig {
    pub fn from_env() -> Option<Self> {
        let api_raw = std::env::var("VK_SHARED_API_BASE").ok()?;
        let org_raw = std::env::var("VK_SHARED_ORGANIZATION_ID").ok()?;

        let api_base = Url::parse(api_raw.trim()).ok()?;
        let organization_id = Uuid::parse_str(org_raw.trim()).ok()?;

        let websocket_base = match std::env::var("VK_SHARED_WS_URL") {
            Ok(raw) => Url::parse(raw.trim()).ok()?,
            Err(_) => {
                // Derive websocket URL by swapping scheme
                let mut url = api_base.clone();
                let scheme = match url.scheme() {
                    "http" => "ws",
                    "https" => "wss",
                    other @ ("ws" | "wss") => other,
                    other => {
                        warn!(%other, "unsupported VK_SHARED_API_BASE scheme for shared task sync");
                        return None;
                    }
                };
                url.set_scheme(scheme).ok()?;
                url.set_path("");
                url.set_query(None);
                url
            }
        };

        let activity_page_limit = std::env::var("VK_SHARED_ACTIVITY_LIMIT")
            .ok()
            .and_then(|v| v.parse::<u32>().ok())
            .filter(|v| *v > 0)
            .unwrap_or(DEFAULT_ACTIVITY_LIMIT);

        Some(Self {
            api_base,
            websocket_base,
            organization_id,
            activity_page_limit,
        })
    }

    fn activity_endpoint(&self) -> Url {
        let mut url = self.api_base.clone();
        let path = format!("/v1/organizations/{}/activity", self.organization_id);
        url.set_path(&path);
        url
    }

    fn websocket_endpoint(&self, cursor: Option<i64>) -> Result<Url> {
        let mut url = self.websocket_base.clone();
        if url.path().is_empty() || url.path() == "/" {
            url.set_path("/v1/ws");
        }

        {
            let mut pairs = url.query_pairs_mut();
            pairs.clear();
            pairs.append_pair("organization_id", &self.organization_id.to_string());
            if let Some(seq) = cursor {
                pairs.append_pair("cursor", &seq.to_string());
            }
        }

        Ok(url)
    }
}

pub struct SharedTaskSync {
    db: DBService,
    client: Client,
    config: SharedTaskSyncConfig,
}

impl SharedTaskSync {
    pub fn spawn_if_configured(db: DBService) {
        match SharedTaskSyncConfig::from_env() {
            Some(config) => {
                info!(
                    org_id = %config.organization_id,
                    "starting shared task synchroniser"
                );
                let sync = Self {
                    db,
                    client: Client::new(),
                    config,
                };

                tokio::spawn(async move {
                    if let Err(err) = sync.run().await {
                        error!(?err, "shared task sync terminated");
                    }
                });
            }
            None => {
                debug!("shared task sync not configured; skipping");
            }
        }
    }

    async fn run(self) -> Result<()> {
        let mut last_seq = self.load_cursor().await?;

        loop {
            match self.catch_up(last_seq).await {
                Ok(seq) => {
                    last_seq = seq;
                }
                Err(err) => {
                    warn!(?err, "failed to catch up shared tasks; retrying");
                    sleep(Duration::from_secs(5)).await;
                    continue;
                }
            }

            match self.listen(last_seq).await {
                Ok(updated_seq) => {
                    last_seq = updated_seq;
                }
                Err(err) => {
                    warn!(?err, "shared task websocket error; reconnecting");
                    sleep(Duration::from_secs(3)).await;
                }
            }
        }
    }

    async fn load_cursor(&self) -> Result<Option<i64>> {
        let record = SharedActivityCursor::get(&self.db.pool, self.config.organization_id).await?;
        Ok(record.map(|cursor| cursor.last_seq))
    }

    async fn catch_up(&self, mut last_seq: Option<i64>) -> Result<Option<i64>> {
        loop {
            let events = self.fetch_activity(last_seq).await?;
            if events.is_empty() {
                break;
            }

            last_seq = self.process_events(events, last_seq).await?;

            if self.config.activity_page_limit == 0
                || events.len() < self.config.activity_page_limit as usize
            {
                break;
            }
        }

        Ok(last_seq)
    }

    async fn listen(&self, mut last_seq: Option<i64>) -> Result<Option<i64>> {
        let ws_url = self.config.websocket_endpoint(last_seq)?;
        debug!(url = %ws_url, "connecting shared task websocket");
        let (mut socket, _response) = connect_async(ws_url)
            .await
            .context("failed to connect to shared task websocket")?;

        while let Some(msg) = socket.next().await {
            match msg {
                Ok(Message::Text(payload)) => match serde_json::from_str::<WsMessage>(&payload) {
                    Ok(WsMessage::Activity(event)) => {
                        let seq_hint = event.seq;
                        last_seq = self.catch_up(last_seq).await?;

                        if let Some(seq) = last_seq.or(Some(seq_hint)) {
                            let ack = WsAck::from_cursor(seq)?;
                            if let Err(err) = socket.send(Message::Text(ack)).await {
                                warn!(?err, "failed to ack shared task message");
                            }
                        }
                    }
                    Ok(WsMessage::Error { message }) => {
                        warn!(%message, "shared task websocket error message");
                    }
                    Err(err) => {
                        warn!(?err, "failed to parse shared task websocket payload");
                    }
                },
                Ok(Message::Ping(p)) => {
                    socket.send(Message::Pong(p)).await.ok();
                }
                Ok(Message::Pong(_)) => {}
                Ok(Message::Close(_)) => {
                    debug!("shared task websocket closed by server");
                    break;
                }
                Ok(Message::Binary(_)) => {}
                Err(err) => {
                    return Err(err.into());
                }
            }
        }

        Ok(last_seq)
    }

    async fn fetch_activity(&self, after: Option<i64>) -> Result<Vec<ActivityEvent>> {
        let mut url = self.config.activity_endpoint();
        {
            let mut pairs = url.query_pairs_mut();
            pairs.append_pair("limit", &self.config.activity_page_limit.to_string());
            if let Some(cursor) = after {
                pairs.append_pair("after", &cursor.to_string());
            }
        }

        let response = self
            .client
            .get(url)
            .send()
            .await
            .context("failed to request activity stream")?;

        let response = response.error_for_status()?;
        let body: ActivityResponse = response
            .json()
            .await
            .context("failed to parse activity response")?;
        Ok(body.data)
    }

    async fn process_events(
        &self,
        events: Vec<ActivityEvent>,
        mut last_seq: Option<i64>,
    ) -> Result<Option<i64>> {
        for event in events {
            self.apply_event(&event).await?;
            last_seq = Some(event.seq);
            SharedActivityCursor::upsert(&self.db.pool, self.config.organization_id, event.seq)
                .await?;
        }

        Ok(last_seq)
    }

    async fn apply_event(&self, event: &ActivityEvent) -> Result<()> {
        if let Some(payload) = &event.payload {
            let remote_task: RemoteTask = serde_json::from_value(payload.clone())
                .context("failed to parse remote task payload")?;

            if remote_task.shared.unwrap_or(true) {
                let input = remote_task.into_input(Some(event.seq));
                SharedTask::upsert(&self.db.pool, input).await?;
            } else {
                SharedTask::remove(&self.db.pool, remote_task.id).await?;
            }
        } else {
            SharedTask::remove(&self.db.pool, event.task_id).await?;
        }

        Ok(())
    }
}

#[derive(Debug, Deserialize)]
struct ActivityResponse {
    data: Vec<ActivityEvent>,
}

#[derive(Debug, Deserialize)]
struct ActivityEvent {
    seq: i64,
    #[allow(dead_code)]
    event_id: Uuid,
    organization_id: Uuid,
    task_id: Uuid,
    #[allow(dead_code)]
    event_type: String,
    #[allow(dead_code)]
    task_version: Option<i64>,
    created_at: DateTime<Utc>,
    payload: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct RemoteTask {
    id: Uuid,
    organization_id: Uuid,
    title: String,
    description: String,
    status: String,
    assignee_member_id: Option<Uuid>,
    version: i64,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    #[serde(default)]
    shared: Option<bool>,
}

impl RemoteTask {
    fn into_input(self, last_event_seq: Option<i64>) -> SharedTaskInput {
        let RemoteTask {
            id,
            organization_id,
            title,
            description,
            status,
            assignee_member_id,
            version,
            created_at,
            updated_at,
            shared: _,
        } = self;

        SharedTaskInput {
            id,
            organization_id,
            title,
            description: if description.trim().is_empty() {
                None
            } else {
                Some(description)
            },
            status: parse_remote_status(&status),
            assignee_member_id,
            version,
            last_event_seq,
            created_at,
            updated_at,
        }
    }
}

fn parse_remote_status(raw: &str) -> TaskStatus {
    let mut candidate = raw.trim().to_lowercase();
    if candidate.contains('_') {
        candidate = candidate.replace('_', "-");
    }

    if candidate.contains(' ') {
        candidate = candidate.replace(' ', "-");
    }

    TaskStatus::from_str(&candidate).unwrap_or(TaskStatus::Todo)
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", content = "data")]
enum WsMessage {
    #[serde(rename = "activity")]
    Activity(ActivityEvent),
    #[serde(rename = "error")]
    Error { message: String },
}

#[derive(Debug, serde::Serialize)]
struct WsAck {
    #[serde(rename = "type")]
    kind: &'static str,
    data: WsAckData,
}

#[derive(Debug, serde::Serialize)]
struct WsAckData {
    cursor: i64,
}

impl WsAck {
    fn new(cursor: i64) -> Self {
        Self {
            kind: "ack",
            data: WsAckData { cursor },
        }
    }
}

impl WsAck {
    fn to_string(&self) -> Result<String> {
        serde_json::to_string(self).context("failed to serialise websocket ack")
    }

    fn from_cursor(cursor: i64) -> Result<String> {
        WsAck::new(cursor).to_string()
    }
}
