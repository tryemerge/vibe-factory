import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import { showModal, DialogType } from '@/lib/modals';
import type { EditorType, TaskAttempt } from 'shared/types';

export function useOpenInEditor(
  attempt: TaskAttempt | null,
  onShowEditorDialog?: () => void
) {
  return useCallback(
    async (editorType?: EditorType) => {
      if (!attempt) return;

      try {
        const result = await attemptsApi.openEditor(attempt.id, editorType);

        if (result === undefined && !editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            showModal(DialogType.EditorSelection, {
              selectedAttempt: attempt,
            } as Record<string, unknown>);
          }
        }
      } catch (err) {
        console.error('Failed to open editor:', err);
        if (!editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            showModal(DialogType.EditorSelection, {
              selectedAttempt: attempt,
            } as Record<string, unknown>);
          }
        }
      }
    },
    [attempt, onShowEditorDialog]
  );
}
