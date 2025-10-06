use std::sync::Arc;

use sqlx::PgPool;

use crate::{activity::ActivityBroker, config::RemoteServerConfig};

#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

struct AppStateInner {
    pool: PgPool,
    broker: ActivityBroker,
    config: RemoteServerConfig,
}

impl AppState {
    pub fn new(pool: PgPool, broker: ActivityBroker, config: RemoteServerConfig) -> Self {
        Self {
            inner: Arc::new(AppStateInner {
                pool,
                broker,
                config,
            }),
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.inner.pool
    }

    pub fn broker(&self) -> &ActivityBroker {
        &self.inner.broker
    }

    pub fn config(&self) -> &RemoteServerConfig {
        &self.inner.config
    }
}
