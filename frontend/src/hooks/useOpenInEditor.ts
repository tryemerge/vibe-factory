import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import type { EditorType } from 'shared/types';

export function useOpenInEditor(
  attemptId: string | undefined,
  onShowEditorDialog?: () => void
) {
  return useCallback(
    async (editorType?: EditorType) => {
      if (!attemptId) return;

      try {
        const result = await attemptsApi.openEditor(attemptId, editorType);

        if (result === undefined && !editorType && onShowEditorDialog) {
          onShowEditorDialog();
        }
      } catch (err) {
        console.error('Failed to open editor:', err);
        if (!editorType && onShowEditorDialog) {
          onShowEditorDialog();
        }
      }
    },
    [attemptId, onShowEditorDialog]
  );
}
