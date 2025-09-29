import NiceModal from '@ebay/nice-modal-react';
import type {
  FolderPickerDialogProps,
  TaskTemplateEditDialogProps,
  TaskTemplateEditResult,
  ProjectFormDialogProps,
  ProjectFormDialogResult,
} from '@/components/dialogs';

/**
 * Dialog type constants for type-safe modal management
 */
export const DialogType = {
  // Authentication dialogs
  GitHubLogin: 'github-login',
  ProvidePat: 'provide-pat',
  
  // Global/Onboarding dialogs
  Disclaimer: 'disclaimer',
  Onboarding: 'onboarding',
  PrivacyOptIn: 'privacy-opt-in',
  ReleaseNotes: 'release-notes',
  
  // Task dialogs
  TaskForm: 'task-form',
  CreatePR: 'create-pr',
  DeleteTaskConfirmation: 'delete-task-confirmation',
  EditorSelection: 'editor-selection',
  TaskTemplateEdit: 'task-template-edit',
  Rebase: 'rebase-dialog',
  RestoreLogs: 'restore-logs',
  
  // Project dialogs
  ProjectForm: 'project-form',
  ProjectEditorSelection: 'project-editor-selection',
  
  // Settings dialogs
  CreateConfiguration: 'create-configuration',
  DeleteConfiguration: 'delete-configuration',
  
  // Shared dialogs
  Confirm: 'confirm',
  FolderPicker: 'folder-picker',
} as const;

export type DialogId = typeof DialogType[keyof typeof DialogType];

/**
 * Typed wrapper around NiceModal.show with better TypeScript support
 * @param modal - Modal ID from DialogType constants
 * @param props - Props to pass to the modal
 * @returns Promise that resolves with the modal's result
 */
export function showModal<T = void>(
  modal: DialogId,
  props: Record<string, unknown> = {}
): Promise<T> {
  return NiceModal.show<T>(modal, props) as Promise<T>;
}

/**
 * Show folder picker dialog
 * @param props - Props for folder picker
 * @returns Promise that resolves with selected path or null if cancelled
 */
export function showFolderPicker(
  props: FolderPickerDialogProps = {}
): Promise<string | null> {
  return showModal<string | null>(
    DialogType.FolderPicker,
    props as Record<string, unknown>
  );
}

/**
 * Show task template edit dialog
 * @param props - Props for template edit dialog
 * @returns Promise that resolves with 'saved' or 'canceled'
 */
export function showTaskTemplateEdit(
  props: TaskTemplateEditDialogProps
): Promise<TaskTemplateEditResult> {
  return showModal<TaskTemplateEditResult>(
    DialogType.TaskTemplateEdit,
    props as Record<string, unknown>
  );
}

/**
 * Show project form dialog
 * @param props - Props for project form dialog
 * @returns Promise that resolves with 'saved' or 'canceled'
 */
export function showProjectForm(
  props: ProjectFormDialogProps = {}
): Promise<ProjectFormDialogResult> {
  return showModal<ProjectFormDialogResult>(
    DialogType.ProjectForm,
    props as Record<string, unknown>
  );
}

/**
 * Register a modal with NiceModal
 * @param id - Modal ID from DialogType constants
 * @param component - Modal component to register
 */
export function registerModal(id: DialogId, component: any): void {
  NiceModal.register(id, component);
}

/**
 * Hide a modal by ID
 */
export function hideModal(modal: DialogId): void {
  NiceModal.hide(modal);
}

/**
 * Remove a modal by ID
 */
export function removeModal(modal: DialogId): void {
  NiceModal.remove(modal);
}

/**
 * Hide all currently visible modals
 */
export function hideAllModals(): void {
  // NiceModal doesn't have a direct hideAll, so we'll implement as needed
  console.log('Hide all modals - implement as needed');
}

/**
 * Common modal result types for standardization
 */
export type ConfirmResult = 'confirmed' | 'canceled';
export type DeleteResult = 'deleted' | 'canceled';
export type SaveResult = 'saved' | 'canceled';

/**
 * Error handling utility for modal operations
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}
