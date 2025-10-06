use std::sync::Arc;

use sqlx::PgPool;

use crate::activity::ActivityBroker;

#[derive(Clone)]
pub struct AppState {
    inner: Arc<AppStateInner>,
}

struct AppStateInner {
    pool: PgPool,
    broker: ActivityBroker,
}

impl AppState {
    pub fn new(pool: PgPool, broker: ActivityBroker) -> Self {
        Self {
            inner: Arc::new(AppStateInner { pool, broker }),
        }
    }

    pub fn pool(&self) -> &PgPool {
        &self.inner.pool
    }

    pub fn broker(&self) -> &ActivityBroker {
        &self.inner.broker
    }
}
