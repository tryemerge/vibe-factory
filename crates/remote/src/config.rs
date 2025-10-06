use std::env;

use thiserror::Error;

#[derive(Debug, Clone)]
pub struct SharedServerConfig {
    pub database_url: String,
    pub listen_addr: String,
    pub activity_channel: String,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("environment variable `{0}` is not set")]
    MissingVar(&'static str),
}

impl SharedServerConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database_url = env::var("SERVER_DATABASE_URL")
            .or_else(|_| env::var("DATABASE_URL"))
            .map_err(|_| ConfigError::MissingVar("SERVER_DATABASE_URL"))?;

        let listen_addr =
            env::var("SERVER_LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8081".to_string());

        let activity_channel =
            env::var("SERVER_ACTIVITY_CHANNEL").unwrap_or_else(|_| "activity".to_string());

        Ok(Self {
            database_url,
            listen_addr,
            activity_channel,
        })
    }
}
