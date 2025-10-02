use rmcp::{
    ServiceExt,
    transport::{
        stdio,
        streamable_http_server::{StreamableHttpService, session::local::LocalSessionManager},
    },
};
use server::mcp::task_server::TaskServer;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{port_file::read_port_file, sentry::sentry_layer};

fn use_http() -> bool {
    std::env::args().any(|arg| arg == "--http")
}

fn main() -> anyhow::Result<()> {
    let environment = if cfg!(debug_assertions) {
        "dev"
    } else {
        "production"
    };
    let _guard = sentry::init((
        "https://1065a1d276a581316999a07d5dffee26@o4509603705192449.ingest.de.sentry.io/4509605576441937",
        sentry::ClientOptions {
            release: sentry::release_name!(),
            environment: Some(environment.into()),
            ..Default::default()
        },
    ));
    sentry::configure_scope(|scope| {
        scope.set_tag("source", "mcp");
    });
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            tracing_subscriber::registry()
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(std::io::stderr)
                        .with_filter(EnvFilter::new("debug")),
                )
                .with(sentry_layer())
                .init();

            let version = env!("CARGO_PKG_VERSION");
            tracing::debug!("[MCP] Starting MCP task server version {version}...");

            // Read backend port from port file or environment variable
            let base_url = if let Ok(url) = std::env::var("VIBE_BACKEND_URL") {
                tracing::info!("[MCP] Using backend URL from VIBE_BACKEND_URL: {}", url);
                url
            } else {
                let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());

                // Get port from environment variables or fall back to port file
                let port = match std::env::var("BACKEND_PORT").or_else(|_| std::env::var("PORT")) {
                    Ok(port_str) => {
                        tracing::info!("[MCP] Using port from environment: {}", port_str);
                        port_str.parse::<u16>().map_err(|e| {
                            anyhow::anyhow!("Invalid port value '{}': {}", port_str, e)
                        })?
                    }
                    Err(_) => {
                        let port = read_port_file("vibe-kanban").await?;
                        tracing::info!("[MCP] Using port from port file: {}", port);
                        port
                    }
                };

                let url = format!("http://{}:{}", host, port);
                tracing::info!("[MCP] Using backend URL: {}", url);
                url
            };

            if use_http() {
                let host =
                    std::env::var("VIBE_MCP_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
                let port: u16 = std::env::var("VIBE_MCP_PORT")
                    .ok()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(8000);

                let bind_addr = format!("{}:{}", host, port);
                tracing::info!("[MCP] HTTP mode enabled; binding to {}", bind_addr);

                let service = StreamableHttpService::new(
                    {
                        let base_url = base_url.clone();
                        move || Ok(TaskServer::new(&base_url))
                    },
                    LocalSessionManager::default().into(),
                    Default::default(),
                );

                let router = axum::Router::new().nest_service("/mcp", service);
                let tcp_listener = tokio::net::TcpListener::bind(&bind_addr).await?;

                axum::serve(tcp_listener, router)
                    .with_graceful_shutdown(async {
                        tokio::signal::ctrl_c()
                            .await
                            .expect("failed to install Ctrl+C handler");
                    })
                    .await?;
            } else {
                let service = TaskServer::new(&base_url)
                    .serve(stdio())
                    .await
                    .inspect_err(|e| {
                        tracing::error!("serving error: {:?}", e);
                        sentry::capture_error(e);
                    })?;

                service.waiting().await?;
            }

            Ok(())
        })
}
