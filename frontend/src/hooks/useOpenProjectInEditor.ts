import { useCallback } from 'react';
import { projectsApi } from '@/lib/api';
import { showModal, DialogType } from '@/lib/modals';
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
      } catch (err) {
        console.error('Failed to open project in editor:', err);
        if (!editorType) {
          if (onShowEditorDialog) {
            onShowEditorDialog();
          } else {
            showModal(DialogType.ProjectEditorSelection, {
              selectedProject: project,
            } as Record<string, unknown>);
          }
        }
      }
    },
    [project, onShowEditorDialog]
  );
}
