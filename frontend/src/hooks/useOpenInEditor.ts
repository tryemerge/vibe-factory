import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import NiceModal from '@ebay/nice-modal-react';
import { showError } from '@/lib/modals';
import type { EditorType } from 'shared/types';

type OpenEditorOptions = {
  editorType?: EditorType;
  filePath?: string;
};

export function useOpenInEditor(
  attemptId?: string,
  onShowEditorDialog?: () => void
) {
  return useCallback(
    async (options?: OpenEditorOptions): Promise<void> => {
      if (!attemptId) return;

      const { editorType, filePath } = options ?? {};

      try {
        const result = await attemptsApi.openEditor(
          attemptId,
          editorType,
          filePath
        );

        if (result === undefined && !editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            NiceModal.show('editor-selection', {
              selectedAttemptId: attemptId,
              filePath,
            });
          }
        }
      } catch (err: any) {
        console.error('Failed to open editor:', err);
        
        // Show error message to user
        const message = err?.message || 'Failed to open editor';
        await showError({
          title: 'Cannot Open Editor',
          message,
        });
        
        // If no editor type was specified, show editor selection dialog
        if (!editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            NiceModal.show('editor-selection', {
              selectedAttemptId: attemptId,
              filePath,
            });
          }
        }
      }
    },
    [attemptId, onShowEditorDialog]
  );
}
