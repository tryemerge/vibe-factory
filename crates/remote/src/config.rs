use std::env;

use thiserror::Error;

// Default activity items returned in a single query
const DEFAULT_ACTIVITY_DEFAULT_LIMIT: i64 = 200;
// Max activity items that can be requested in a single query
const DEFAULT_ACTIVITY_MAX_LIMIT: i64 = 500;

#[derive(Debug, Clone)]
pub struct RemoteServerConfig {
    pub database_url: String,
    pub listen_addr: String,
    pub activity_channel: String,
    pub activity_default_limit: i64,
    pub activity_max_limit: i64,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("environment variable `{0}` is not set")]
    MissingVar(&'static str),
}

impl RemoteServerConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let database_url = env::var("SERVER_DATABASE_URL")
            .or_else(|_| env::var("DATABASE_URL"))
            .map_err(|_| ConfigError::MissingVar("SERVER_DATABASE_URL"))?;

        let listen_addr =
            env::var("SERVER_LISTEN_ADDR").unwrap_or_else(|_| "0.0.0.0:8081".to_string());

        let activity_channel =
            env::var("SERVER_ACTIVITY_CHANNEL").unwrap_or_else(|_| "activity".to_string());

        let activity_default_limit = DEFAULT_ACTIVITY_DEFAULT_LIMIT;
        let activity_max_limit = DEFAULT_ACTIVITY_MAX_LIMIT;

        Ok(Self {
            database_url,
            listen_addr,
            activity_channel,
            activity_default_limit,
            activity_max_limit,
        })
    }
}
