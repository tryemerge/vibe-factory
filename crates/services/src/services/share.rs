mod config;

use std::{str::FromStr, sync::Arc};

use async_trait::async_trait;
use config::SharedTaskSyncConfig;
use db::{
    DBService,
    models::{
        shared_task::{SharedActivityCursor, SharedTask, SharedTaskInput},
        task::TaskStatus,
    },
};
use remote::{
    ClientMessage, ServerMessage,
    activity::{ActivityEvent, ActivityResponse},
    db::tasks::SharedTask as RemoteSharedTask,
};
use reqwest::Url;
use thiserror::Error;
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message as TungsteniteMessage;
use utils::ws::{WsClient, WsConfig, WsError, WsHandler, run_ws_client};

#[derive(Debug, Error)]
pub enum ShareError {
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Transport(#[from] reqwest::Error),
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
    #[error(transparent)]
    Url(#[from] url::ParseError),
    #[error(transparent)]
    WebSocket(#[from] WsError),
}

#[derive(Clone)]
struct ActivityProcessor {
    db: DBService,
    remote_base: SharedTaskSyncConfig,
    http_client: reqwest::Client,
}

impl ActivityProcessor {
    pub fn new(db: DBService, remote_base: SharedTaskSyncConfig) -> Self {
        Self {
            db,
            remote_base,
            http_client: reqwest::Client::new(),
        }
    }

    pub async fn process_event(&self, event: ActivityEvent) -> Result<(), ShareError> {
        if let Some(payload) = &event.payload {
            let remote_task: RemoteSharedTask = serde_json::from_value(payload.clone())?;
            let input = convert_remote_task(&remote_task, Some(event.seq));
            SharedTask::upsert(&self.db.pool, input).await?;
        } else {
            tracing::warn!(event_id = %event.event_id, "received activity event with empty payload");
        }

        SharedActivityCursor::upsert(&self.db.pool, event.organization_id, event.seq).await?;
        Ok(())
    }

    pub async fn catch_up(&self, mut last_seq: Option<i64>) -> Result<Option<i64>, ShareError> {
        loop {
            let events = self.fetch_activity(last_seq).await?;
            if events.is_empty() {
                break;
            }
            for ev in events.iter() {
                self.process_event(ev.clone()).await?;
                last_seq = Some(ev.seq);
            }
            if events.len() < (self.remote_base.activity_page_limit as usize) {
                break;
            }
        }
        Ok(last_seq)
    }

    async fn fetch_activity(&self, after: Option<i64>) -> Result<Vec<ActivityEvent>, ShareError> {
        let mut url = Url::parse(&self.remote_base.activity_endpoint())?;
        {
            let mut qp = url.query_pairs_mut();
            qp.append_pair("limit", &self.remote_base.activity_page_limit.to_string());
            if let Some(s) = after {
                qp.append_pair("after", &s.to_string());
            }
        }

        let resp = self.http_client.get(url).send().await?.error_for_status()?;
        let resp_body = resp.json::<ActivityResponse>().await?;
        Ok(resp_body.data)
    }
}

pub struct SharedTaskSync {
    db: DBService,
    processor: ActivityProcessor,
    remote_client: Option<Arc<WsClient>>,
    config: SharedTaskSyncConfig,
}

impl SharedTaskSync {
    pub fn spawn_if_configured(db: DBService) {
        if let Some(config) = SharedTaskSyncConfig::from_env() {
            tracing::info!(org_id = %config.organization_id, "starting shared task synchronizer");
            let processor = ActivityProcessor::new(db.clone(), config.clone());
            let sync = Self {
                db,
                processor,
                remote_client: None,
                config,
            };
            tokio::spawn(async move {
                if let Err(e) = sync.run().await {
                    tracing::error!(?e, "shared task sync terminated unexpectedly");
                }
            });
        } else {
            tracing::warn!("shared task sync not configured; skipping");
        }
    }

    pub async fn run(mut self) -> Result<(), ShareError> {
        let mut last_seq = SharedActivityCursor::get(&self.db.pool, self.config.organization_id)
            .await?
            .map(|cursor| cursor.last_seq);
        last_seq = self.processor.catch_up(last_seq).await.unwrap_or(last_seq);

        let ws_url = self.config.websocket_endpoint(last_seq);
        let remote = spawn_shared_remote(self.processor.clone(), &ws_url).await?;
        self.remote_client = Some(remote);

        // The WS client loop is running in background. Now you may optionally wait for shutdown or do other tasks:
        // For simplicity here we just yield forever:
        futures_util::future::pending::<()>().await;
        Ok(())
    }
}

struct SharedWsHandler {
    processor: ActivityProcessor,
    ack_tx: mpsc::UnboundedSender<TungsteniteMessage>,
}

#[async_trait]
impl WsHandler for SharedWsHandler {
    async fn handle_message(&mut self, msg: TungsteniteMessage) -> Result<(), WsError> {
        if let TungsteniteMessage::Text(txt) = msg {
            match serde_json::from_str::<ServerMessage>(&txt) {
                Ok(ServerMessage::Activity(event)) => {
                    self.processor
                        .process_event(event.clone())
                        .await
                        .map_err(|err| WsError::Handler(Box::new(err)))?;
                    let ack = ClientMessage::Ack { cursor: event.seq };
                    let ack_text = serde_json::to_string(&ack)
                        .map_err(|err| WsError::Handler(Box::new(err)))?;
                    self.ack_tx
                        .send(TungsteniteMessage::Text(ack_text.into()))
                        .map_err(|err| WsError::Send(err.to_string()))?;
                }
                Ok(ServerMessage::Error { message }) => {
                    tracing::warn!(?message, "received WS error message");
                }
                Err(err) => {
                    tracing::error!(raw = %txt, ?err, "unable to parse WS message");
                }
            }
        }
        Ok(())
    }

    async fn on_close(&mut self) -> Result<(), WsError> {
        tracing::info!("WebSocket closed, handler cleanup if needed");
        Ok(())
    }
}

async fn spawn_shared_remote(
    processor: ActivityProcessor,
    url: &str,
) -> Result<Arc<WsClient>, ShareError> {
    let ws_config = WsConfig {
        url: url.to_string(),
        autoreconnect: true,
        reconnect_base_delay: std::time::Duration::from_secs(1),
        reconnect_max_delay: std::time::Duration::from_secs(30),
        ping_interval: Some(std::time::Duration::from_secs(30)),
    };

    let (ack_tx, mut ack_rx) = mpsc::unbounded_channel();

    let handler = SharedWsHandler { processor, ack_tx };
    let client = Arc::new(run_ws_client(handler, ws_config).await?);

    let send_client = client.clone();
    tokio::spawn(async move {
        while let Some(msg) = ack_rx.recv().await {
            if let Err(err) = send_client.send(msg) {
                tracing::warn!(?err, "failed to send ack message");
            }
        }
    });

    Ok(client)
}

fn convert_remote_status(raw: &str) -> TaskStatus {
    let mut candidate = raw.trim().to_lowercase();
    if candidate.contains('_') {
        candidate = candidate.replace('_', "-");
    }
    if candidate.contains(' ') {
        candidate = candidate.replace(' ', "-");
    }
    TaskStatus::from_str(&candidate).unwrap_or(TaskStatus::Todo)
}

fn convert_remote_task(task: &RemoteSharedTask, last_event_seq: Option<i64>) -> SharedTaskInput {
    SharedTaskInput {
        id: task.id,
        organization_id: task.organization_id,
        title: task.title.clone(),
        description: if task.description.trim().is_empty() {
            None
        } else {
            Some(task.description.clone())
        },
        status: convert_remote_status(&task.status),
        assignee_member_id: task.assignee_member_id,
        version: task.version,
        last_event_seq,
        created_at: task.created_at,
        updated_at: task.updated_at,
    }
}
