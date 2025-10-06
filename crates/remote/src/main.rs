use remote::{Server, SharedServerConfig, init_tracing};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();
    let config = SharedServerConfig::from_env()?;
    Server::run(config).await
}
