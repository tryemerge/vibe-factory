use remote::{RemoteServerConfig, Server, init_tracing};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    init_tracing();
    let config = RemoteServerConfig::from_env()?;
    Server::run(config).await
}
