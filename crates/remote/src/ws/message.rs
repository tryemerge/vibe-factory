use serde::{Deserialize, Serialize};

use crate::activity::ActivityEvent;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum InboundMessage {
    #[serde(rename = "ack")]
    Ack { cursor: i64 },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum OutboundMessage {
    #[serde(rename = "activity")]
    Activity(ActivityEvent),
    #[serde(rename = "error")]
    Error { message: String },
}
