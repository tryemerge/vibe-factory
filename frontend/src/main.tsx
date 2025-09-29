import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './styles/index.css';
import { ClickToComponent } from 'click-to-react-component';
import { VibeKanbanWebCompanion } from 'vibe-kanban-web-companion';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';
import { registerModal, DialogType } from '@/lib/modals';
// Import modal type definitions
import './types/modals';
// Import and register modals
import {
  GitHubLoginDialog,
  CreatePRDialog,
  ConfirmDialog,
  DisclaimerDialog,
  OnboardingDialog,
  PrivacyOptInDialog,
  ProvidePatDialog,
  ReleaseNotesDialog,
  TaskFormDialog,
  EditorSelectionDialog,
  DeleteTaskConfirmationDialog,
  FolderPickerDialog,
  TaskTemplateEditDialog,
  RebaseDialog,
  CreateConfigurationDialog,
  DeleteConfigurationDialog,
  ProjectFormDialog,
  ProjectEditorSelectionDialog,
  RestoreLogsDialog,
} from './components/dialogs';

// Register modals
registerModal(DialogType.GitHubLogin, GitHubLoginDialog);
registerModal(DialogType.CreatePR, CreatePRDialog);
registerModal(DialogType.Confirm, ConfirmDialog);
registerModal(DialogType.Disclaimer, DisclaimerDialog);
registerModal(DialogType.Onboarding, OnboardingDialog);
registerModal(DialogType.PrivacyOptIn, PrivacyOptInDialog);
registerModal(DialogType.ProvidePat, ProvidePatDialog);
registerModal(DialogType.ReleaseNotes, ReleaseNotesDialog);
registerModal(DialogType.DeleteTaskConfirmation, DeleteTaskConfirmationDialog);
registerModal(DialogType.TaskForm, TaskFormDialog);
registerModal(DialogType.EditorSelection, EditorSelectionDialog);
registerModal(DialogType.FolderPicker, FolderPickerDialog);
registerModal(DialogType.TaskTemplateEdit, TaskTemplateEditDialog);
registerModal(DialogType.Rebase, RebaseDialog);
registerModal(DialogType.CreateConfiguration, CreateConfigurationDialog);
registerModal(DialogType.DeleteConfiguration, DeleteConfigurationDialog);
registerModal(DialogType.ProjectForm, ProjectFormDialog);
registerModal(DialogType.ProjectEditorSelection, ProjectEditorSelectionDialog);
registerModal(DialogType.RestoreLogs, RestoreLogsDialog);
// Install VS Code iframe keyboard bridge when running inside an iframe
import './vscode/bridge';

import {
  useLocation,
  useNavigationType,
  createRoutesFromChildren,
  matchRoutes,
} from 'react-router-dom';

Sentry.init({
  dsn: 'https://1065a1d276a581316999a07d5dffee26@o4509603705192449.ingest.de.sentry.io/4509605576441937',
  tracesSampleRate: 1.0,
  environment: import.meta.env.MODE === 'development' ? 'dev' : 'production',
  integrations: [
    Sentry.reactRouterV6BrowserTracingIntegration({
      useEffect: React.useEffect,
      useLocation,
      useNavigationType,
      createRoutesFromChildren,
      matchRoutes,
    }),
  ],
});
Sentry.setTag('source', 'frontend');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <Sentry.ErrorBoundary fallback={<p>An error has occurred</p>} showDialog>
        <ClickToComponent />
        <VibeKanbanWebCompanion />
        <App />
        {/* <ReactQueryDevtools initialIsOpen={false} /> */}
      </Sentry.ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>
);
