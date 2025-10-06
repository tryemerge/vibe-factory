use std::net::SocketAddr;

use anyhow::Context;

use crate::{AppState, activity::ActivityBroker, config::SharedServerConfig, db, routes};

pub struct Server;

impl Server {
    pub async fn run(config: SharedServerConfig) -> anyhow::Result<()> {
        let pool = db::pool::create_pool(&config.database_url)
            .await
            .context("failed to create postgres pool")?;

        db::migrate::run(&pool)
            .await
            .context("failed to run database migrations")?;

        let broker = ActivityBroker::default();
        let state = AppState::new(pool.clone(), broker.clone());

        let listener =
            db::ActivityListener::new(pool.clone(), broker, config.activity_channel.clone());
        tokio::spawn(listener.run());

        let router = routes::router(state);
        let addr: SocketAddr = config
            .listen_addr
            .parse()
            .context("listen address is invalid")?;
        let tcp_listener = tokio::net::TcpListener::bind(addr)
            .await
            .context("failed to bind tcp listener")?;

        tracing::info!(%addr, "shared sync server listening");

        let make_service = router.into_make_service();

        axum::serve(tcp_listener, make_service)
            .await
            .context("shared sync server failure")?;

        Ok(())
    }
}
