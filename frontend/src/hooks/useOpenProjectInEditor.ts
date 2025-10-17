import { useCallback } from 'react';
import { projectsApi } from '@/lib/api';
import NiceModal from '@ebay/nice-modal-react';
import { showError } from '@/lib/modals';
import type { EditorType, Project } from 'shared/types';

export function useOpenProjectInEditor(
  project: Project | null,
  onShowEditorDialog?: () => void
) {
  return useCallback(
    async (editorType?: EditorType) => {
      if (!project) return;

      try {
        await projectsApi.openEditor(project.id, editorType);
      } catch (err: any) {
        console.error('Failed to open project in editor:', err);

        // Show error message to user
        const message = err?.message || 'Failed to open project in editor';
        await showError({
          title: 'Cannot Open Editor',
          message,
        });

        // If no editor type was specified, show editor selection dialog
        if (!editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            NiceModal.show('project-editor-selection', {
              selectedProject: project,
            });
          }
        }
      }
    },
    [project, onShowEditorDialog]
  );
}
