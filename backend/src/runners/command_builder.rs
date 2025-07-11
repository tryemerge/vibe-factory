//! Safe cross-platform command building and execution

use std::{ffi::OsStr, path::Path};

use command_group::{AsyncCommandGroup, AsyncGroupChild};
use tokio::process::Command;
use uuid::Uuid;

use crate::executor::SpawnContext;

#[derive(Debug)]
pub enum CommandError {
    SpawnFailed {
        error: std::io::Error,
        context: SpawnContext,
    },
    ValidationError(String),
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CommandError::SpawnFailed { error, context } => {
                write!(f, "Failed to spawn {} process", context.executor_type)?;

                // Add task context if available
                if let Some(ref title) = context.task_title {
                    write!(f, " for task '{}'", title)?;
                } else if let Some(task_id) = context.task_id {
                    write!(f, " for task {}", task_id)?;
                }

                // Add command details
                write!(f, ": command '{}' ", context.command)?;
                if !context.args.is_empty() {
                    write!(f, "with args [{}] ", context.args.join(", "))?;
                }

                // Add working directory
                write!(f, "in directory '{}' ", context.working_dir)?;

                // Add additional context if provided
                if let Some(ref additional) = context.additional_context {
                    write!(f, "({}) ", additional)?;
                }

                // Finally, add the underlying error
                write!(f, "- {}", error)
            }
            CommandError::ValidationError(msg) => write!(f, "Command validation error: {}", msg),
        }
    }
}

impl std::error::Error for CommandError {}

/// Builder for creating and spawning commands with proper error handling
pub struct CommandBuilder {
    command: Command,
    runner_type: String,
    task_id: Option<Uuid>,
    task_title: Option<String>,
    additional_context: Option<String>,
}

impl CommandBuilder {
    /// Create a new command builder for a given program
    pub fn new<S: AsRef<OsStr>>(program: S) -> Self {
        let mut command = Command::new(program);
        // Set default options
        command
            .kill_on_drop(true)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        Self {
            command,
            runner_type: "Unknown".to_string(),
            task_id: None,
            task_title: None,
            additional_context: None,
        }
    }

    /// Create a command that runs a script through the appropriate shell
    pub fn shell_script(script: &str) -> Self {
        let (shell_cmd, shell_arg) = crate::utils::shell::get_shell_command();
        let builder = Self::new(shell_cmd);
        builder.arg(shell_arg).arg(script)
    }

    /// Add an argument to the command
    pub fn arg<S: AsRef<OsStr>>(mut self, arg: S) -> Self {
        self.command.arg(arg);
        self
    }

    /// Add multiple arguments to the command
    #[allow(dead_code)]
    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        self.command.args(args);
        self
    }

    /// Set the working directory
    pub fn current_dir<P: AsRef<Path>>(mut self, dir: P) -> Self {
        self.command.current_dir(dir);
        self
    }

    /// Set an environment variable
    #[allow(dead_code)]
    pub fn env<K, V>(mut self, key: K, val: V) -> Self
    where
        K: AsRef<OsStr>,
        V: AsRef<OsStr>,
    {
        self.command.env(key, val);
        self
    }

    /// Remove an environment variable
    #[allow(dead_code)]
    pub fn env_remove<K: AsRef<OsStr>>(mut self, key: K) -> Self {
        self.command.env_remove(key);
        self
    }

    /// Clear all environment variables
    #[allow(dead_code)]
    pub fn env_clear(mut self) -> Self {
        self.command.env_clear();
        self
    }

    /// Set stdin handling
    #[allow(dead_code)]
    pub fn stdin(mut self, stdin: std::process::Stdio) -> Self {
        self.command.stdin(stdin);
        self
    }

    /// Set the runner type for error context
    pub fn runner_type(mut self, runner_type: impl Into<String>) -> Self {
        self.runner_type = runner_type.into();
        self
    }

    /// Set task context for error reporting
    pub fn with_task(mut self, task_id: Uuid, task_title: Option<String>) -> Self {
        self.task_id = Some(task_id);
        self.task_title = task_title;
        self
    }

    /// Add additional context for error reporting
    pub fn with_context(mut self, context: impl Into<String>) -> Self {
        self.additional_context = Some(context.into());
        self
    }

    /// Spawn the command as a process group
    pub fn spawn(mut self) -> Result<AsyncGroupChild, CommandError> {
        let child = self.command.group_spawn().map_err(|e| {
            let mut context =
                SpawnContext::from(&self.command).with_executor_type(&self.runner_type);

            if let (Some(task_id), task_title) = (self.task_id, self.task_title.clone()) {
                context = context.with_task(task_id, task_title);
            }

            if let Some(additional) = self.additional_context.clone() {
                context = context.with_context(additional);
            }

            CommandError::SpawnFailed { error: e, context }
        })?;

        Ok(child)
    }

    /// Get a reference to the underlying command (for advanced use cases)
    #[allow(dead_code)]
    pub fn as_command(&self) -> &Command {
        &self.command
    }

    /// Get a mutable reference to the underlying command (for advanced use cases)
    #[allow(dead_code)]
    pub fn as_command_mut(&mut self) -> &mut Command {
        &mut self.command
    }
}

/// Helper trait for escaping shell arguments safely
#[allow(dead_code)]
trait ShellEscape {
    fn shell_escape(&self) -> String;
}

#[allow(dead_code)]
impl ShellEscape for str {
    fn shell_escape(&self) -> String {
        if cfg!(windows) {
            // Windows command escaping
            if self.contains(|c: char| c.is_whitespace() || "\"^%!<>&|()".contains(c)) {
                format!("\"{}\"", self.replace('"', "\"\""))
            } else {
                self.to_string()
            }
        } else {
            // Unix shell escaping using single quotes
            if self.is_empty() {
                "''".to_string()
            } else if self.contains('\'') {
                // Handle single quotes by ending quote, escaping quote, starting quote again
                format!("'{}'", self.replace('\'', "'\"'\"'"))
            } else if self
                .chars()
                .all(|c| c.is_alphanumeric() || "._-/=".contains(c))
            {
                // Safe characters don't need quoting
                self.to_string()
            } else {
                format!("'{}'", self)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shell_escape_unix() {
        if !cfg!(windows) {
            assert_eq!("hello".shell_escape(), "hello");
            assert_eq!("hello world".shell_escape(), "'hello world'");
            assert_eq!("it's".shell_escape(), "'it'\"'\"'s'");
            assert_eq!("$PATH".shell_escape(), "'$PATH'");
            assert_eq!("".shell_escape(), "''");
            assert_eq!("/path/to/file.txt".shell_escape(), "/path/to/file.txt");
        }
    }

    #[test]
    fn test_shell_escape_windows() {
        if cfg!(windows) {
            assert_eq!("hello".shell_escape(), "hello");
            assert_eq!("hello world".shell_escape(), "\"hello world\"");
            assert_eq!("path\\to\\file".shell_escape(), "path\\to\\file");
            assert_eq!("say \"hello\"".shell_escape(), "\"say \"\"hello\"\"\"");
        }
    }
}
