use std::{path::Path, process::Stdio, sync::Arc};

use async_trait::async_trait;
use command_group::AsyncCommandGroup;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::{io::AsyncWriteExt, process::Command};
use ts_rs::TS;
use workspace_utils::{msg_store::MsgStore, shell::get_shell_command};

use crate::{
    command::{CmdOverrides, CommandBuilder, apply_overrides},
    executors::{
        AppendPrompt, ExecutorError, SpawnedChild, StandardCodingAgentExecutor,
        claude::{ClaudeLogProcessor, HistoryStrategy},
    },
    logs::{stderr_processor::normalize_stderr_logs, utils::EntryIndexProvider},
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub enum Autonomy {
    Default,
    Low,
    // TODO make this the default option
    Medium,
    High,
    SkipPermissionsUnsafe,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Droid {
    pub append_prompt: AppendPrompt,
    // TODO: add relevant options to configure the execution mode
    pub autonomy: Autonomy,
    #[serde(flatten)]
    pub cmd: CmdOverrides,
}

impl Droid {
    fn build_command_builder(&self) -> CommandBuilder {
        // TODO add model selection
        let mut builder = CommandBuilder::new("droid exec").params(["--output-format=stream-json"]);
        let autonomy_args: Vec<&str> = match self.autonomy {
            Autonomy::Default => vec![],
            Autonomy::Low => vec!["--auto", "low"],
            Autonomy::Medium => vec!["--auto", "medium"],
            Autonomy::High => vec!["--auto", "high"],
            Autonomy::SkipPermissionsUnsafe => vec!["--skip-permissions-unsafe"],
        };
        builder = builder.extend_params(autonomy_args);

        apply_overrides(builder, &self.cmd)
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Droid {
    async fn spawn(&self, current_dir: &Path, prompt: &str) -> Result<SpawnedChild, ExecutorError> {
        // TODO do we need to handle upgrades?
        let (shell_cmd, shell_arg) = get_shell_command();
        let droid_command = self.build_command_builder().build_initial();
        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&droid_command);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so droid sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    async fn spawn_follow_up(
        &self,
        current_dir: &Path,
        prompt: &str,
        session_id: &str,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Use shell command for cross-platform compatibility
        let (shell_cmd, shell_arg) = get_shell_command();
        let continue_cmd = self
            .build_command_builder()
            .build_follow_up(&["--session-id".to_string(), session_id.to_string()]);

        let combined_prompt = self.append_prompt.combine_prompt(prompt);

        let mut command = Command::new(shell_cmd);
        command
            .kill_on_drop(true)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .current_dir(current_dir)
            .arg(shell_arg)
            .arg(&continue_cmd);

        let mut child = command.group_spawn()?;

        // Feed the prompt in, then close the pipe so droid sees EOF
        if let Some(mut stdin) = child.inner().stdin.take() {
            stdin.write_all(combined_prompt.as_bytes()).await?;
            stdin.shutdown().await?;
        }

        Ok(child.into())
    }

    fn normalize_logs(&self, msg_store: Arc<MsgStore>, current_dir: &Path) {
        // TODO implement this

        // Process stderr logs using the standard stderr processor
        normalize_stderr_logs(msg_store, entry_index_provider);
    }

    // MCP configuration methods
    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        dirs::home_dir().map(|home| home.join(".factory").join("mcp.json"))
    }
}
