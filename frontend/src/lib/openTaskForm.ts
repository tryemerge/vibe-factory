import { showModal, DialogType } from '@/lib/modals';
import type { TaskFormDialogProps } from '@/components/dialogs/tasks/TaskFormDialog';

/**
 * Open the task form dialog programmatically
 * This replaces the previous TaskFormDialogContainer pattern
 */
export function openTaskForm(props: TaskFormDialogProps) {
  return showModal(DialogType.TaskForm, props as Record<string, unknown>);
}
