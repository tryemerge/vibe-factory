use std::path::PathBuf;

use async_trait::async_trait;
use command_group::AsyncGroupChild;
use enum_dispatch::enum_dispatch;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    actions::{
        coding_agent_follow_up::CodingAgentFollowUpRequest,
        coding_agent_initial::CodingAgentInitialRequest, script::ScriptRequest,
    },
    executors::ExecutorError,
};
pub mod coding_agent_follow_up;
pub mod coding_agent_initial;
pub mod script;

#[enum_dispatch]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[serde(tag = "type")]
#[ts(export)]
pub enum ExecutorActions {
    CodingAgentInitialRequest,
    CodingAgentFollowUpRequest,
    ScriptRequest,
}

#[async_trait]
#[enum_dispatch(ExecutorActions)]
pub trait ExecutorAction {
    async fn spawn(&self, current_dir: &PathBuf) -> Result<AsyncGroupChild, ExecutorError>;
}
