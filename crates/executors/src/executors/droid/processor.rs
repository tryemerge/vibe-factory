use std::{path::Path, sync::Arc};

use futures::{Stream, StreamExt, future};
use workspace_utils::msg_store::MsgStore;

use super::{
    events::{ProcessorState, process_event},
    patch_emitter::{IndexProviderLike, PatchEmitter},
    types::DroidJson,
};
use crate::logs::{
    NormalizedEntry, NormalizedEntryType,
    utils::{EntryIndexProvider, patch::ConversationPatch},
};

impl IndexProviderLike for EntryIndexProvider {
    fn next(&self) -> usize {
        EntryIndexProvider::next(self)
    }
}

/// Represents the result of attempting to parse a line
enum ParsedLine {
    DroidJson(DroidJson),
    UnparsedContent(String),
}

/// Parse lines into structured data
fn parse_lines(lines: impl Stream<Item = String>) -> impl Stream<Item = ParsedLine> {
    async_stream::stream! {
        let mut lines = std::pin::pin!(lines);

        while let Some(line) = lines.next().await {
            let trimmed = line.trim();

            match serde_json::from_str::<DroidJson>(trimmed) {
                Ok(droid_json) => yield ParsedLine::DroidJson(droid_json),
                Err(_) => yield ParsedLine::UnparsedContent(trimmed.to_string()),
            }
        }
    }
}

/// Process parsed items and emit patches
async fn process_parsed_items(
    parsed_items: impl Stream<Item = ParsedLine>,
    msg_store: Arc<MsgStore>,
    worktree_path: &Path,
    entry_index_provider: EntryIndexProvider,
) {
    let mut parsed_items = std::pin::pin!(parsed_items);
    let mut session_id_extracted = false;
    let mut state = ProcessorState::default();
    let mut patch_emitter = PatchEmitter::new();

    while let Some(item) = parsed_items.next().await {
        match item {
            ParsedLine::DroidJson(droid_json) => {
                if !session_id_extracted && let Some(session_id) = droid_json.session_id() {
                    msg_store.push_session_id(session_id.to_string());
                    session_id_extracted = true;
                }

                let (new_state, events) = process_event(state, &droid_json, worktree_path);
                state = new_state;

                let patches = patch_emitter.emit_patches(events, &entry_index_provider);
                for patch in patches {
                    msg_store.push_patch(patch);
                }
            }
            ParsedLine::UnparsedContent(content) => {
                let entry = NormalizedEntry {
                    timestamp: None,
                    entry_type: NormalizedEntryType::SystemMessage,
                    content,
                    metadata: None,
                };

                let patch_id = entry_index_provider.next();
                let patch = ConversationPatch::add_normalized_entry(patch_id, entry);
                msg_store.push_patch(patch);
            }
        }
    }
}

/// Async processor for streaming droid JSON output
pub struct DroidLogProcessor;

impl DroidLogProcessor {
    pub fn process_logs(
        msg_store: Arc<MsgStore>,
        worktree_path: &Path,
        entry_index_provider: EntryIndexProvider,
    ) {
        let worktree_path = worktree_path.to_path_buf();
        tokio::spawn(async move {
            let stream = msg_store.stdout_lines_stream();
            let lines = stream.filter_map(|l| future::ready(l.ok()));
            let parsed_items = parse_lines(lines);

            process_parsed_items(
                parsed_items,
                msg_store,
                &worktree_path,
                entry_index_provider,
            )
            .await;
        });
    }
}
