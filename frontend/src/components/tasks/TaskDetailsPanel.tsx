import { useEffect, useState } from 'react';
import TaskDetailsHeader from './TaskDetailsHeader';
import { TaskFollowUpSection } from './TaskFollowUpSection';
import { EditorSelectionDialog } from './EditorSelectionDialog';
import {
  getBackdropClasses,
  getTaskPanelClasses,
} from '@/lib/responsive-config';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { TabType } from '@/types/tabs';
import DiffTab from '@/components/tasks/TaskDetails/DiffTab.tsx';
import LogsTab from '@/components/tasks/TaskDetails/LogsTab.tsx';
import ProcessesTab from '@/components/tasks/TaskDetails/ProcessesTab.tsx';
import DeleteFileConfirmationDialog from '@/components/tasks/DeleteFileConfirmationDialog.tsx';
import TabNavigation from '@/components/tasks/TaskDetails/TabNavigation.tsx';
import TaskDetailsProvider from '../context/TaskDetailsContextProvider.tsx';
import TaskDetailsToolbar from './TaskDetailsToolbar.tsx';
import { Edit } from 'lucide-react';
import { TabNavContext } from '@/contexts/TabNavigationContext';
import { ProcessSelectionProvider } from '@/contexts/ProcessSelectionContext';

interface TaskDetailsPanelProps {
  task: TaskWithAttemptStatus | null;
  projectHasDevScript?: boolean;
  projectId: string;
  onClose: () => void;
  onEditTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  isDialogOpen?: boolean;
  hideBackdrop?: boolean;
  className?: string;
  hideHeader?: boolean;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  forceCreateAttempt?: boolean;
  onLeaveForceCreateAttempt?: () => void;
}

export function TaskDetailsPanel({
  task,
  projectHasDevScript,
  projectId,
  onClose,
  onEditTask,
  onDeleteTask,
  isDialogOpen = false,
  hideBackdrop = false,
  className,
  hideHeader = false,
  isFullScreen = false,
  onToggleFullScreen,
  forceCreateAttempt,
  onLeaveForceCreateAttempt,
}: TaskDetailsPanelProps) {
  const [showEditorDialog, setShowEditorDialog] = useState(false);

  // Tab and collapsible state
  const [activeTab, setActiveTab] = useState<TabType>('logs');

  // Reset to logs tab when task changes
  useEffect(() => {
    if (task?.id) {
      setActiveTab('logs');
    }
  }, [task?.id]);

  // Handle ESC key locally to prevent global navigation
  useEffect(() => {
    if (isDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, isDialogOpen]);

  return (
    <>
      {!task ? null : (
        <TaskDetailsProvider
          key={task.id}
          task={task}
          projectId={projectId}
          setShowEditorDialog={setShowEditorDialog}
          projectHasDevScript={projectHasDevScript}
        >
          <TabNavContext.Provider value={{ activeTab, setActiveTab }}>
            <ProcessSelectionProvider>
              {/* Backdrop - only on smaller screens (overlay mode) */}
              {!hideBackdrop && (
                <div className={getBackdropClasses()} onClick={onClose} />
              )}

              {/* Panel */}
              <div className={className || getTaskPanelClasses()}>
                <div className="flex flex-col h-full">
                  {!hideHeader && (
                    <TaskDetailsHeader
                      onClose={onClose}
                      onEditTask={onEditTask}
                      onDeleteTask={onDeleteTask}
                      hideCloseButton={hideBackdrop}
                      isFullScreen={isFullScreen}
                      onToggleFullScreen={onToggleFullScreen}
                    />
                  )}

                  {isFullScreen ? (
                    <div className="flex-1 min-h-0 flex">
                      {/* Sidebar */}
                      <aside className="w-96 shrink-0 border-r overflow-y-auto p-4 space-y-4">
                        {/* Description + Edit */}
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground">
                            {task.description ? (
                              <p className="whitespace-pre-wrap">
                                {task.description}
                              </p>
                            ) : (
                              <p className="italic">No description provided</p>
                            )}
                          </div>
                          {onEditTask && (
                            <div>
                              <button
                                className="inline-flex items-center h-8 w-8 justify-center rounded-md hover:bg-accent"
                                onClick={() => onEditTask(task)}
                                title="Edit task"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Current Attempt / Actions */}
                        <TaskDetailsToolbar
                          variant="sidebar"
                          forceCreateAttempt={forceCreateAttempt}
                          onLeaveForceCreateAttempt={onLeaveForceCreateAttempt}
                        />
                      </aside>

                      {/* Main content */}
                      <main className="flex-1 min-h-0 flex flex-col">
                        <TabNavigation
                          activeTab={activeTab}
                          setActiveTab={setActiveTab}
                        />

                        <div className="flex-1 flex flex-col min-h-0">
                          {activeTab === 'diffs' ? (
                            <DiffTab />
                          ) : activeTab === 'processes' ? (
                            <ProcessesTab />
                          ) : (
                            <LogsTab />
                          )}
                        </div>

                        <TaskFollowUpSection />
                      </main>
                    </div>
                  ) : (
                    <>
                      <TaskDetailsToolbar />

                      <TabNavigation
                        activeTab={activeTab}
                        setActiveTab={setActiveTab}
                      />

                      {/* Tab Content */}
                      <div className="flex-1 flex flex-col min-h-0">
                        {activeTab === 'diffs' ? (
                          <DiffTab />
                        ) : activeTab === 'processes' ? (
                          <ProcessesTab />
                        ) : (
                          <LogsTab />
                        )}
                      </div>

                      <TaskFollowUpSection />
                    </>
                  )}
                </div>
              </div>

              <EditorSelectionDialog
                isOpen={showEditorDialog}
                onClose={() => setShowEditorDialog(false)}
              />

              <DeleteFileConfirmationDialog />
            </ProcessSelectionProvider>
          </TabNavContext.Provider>
        </TaskDetailsProvider>
      )}
    </>
  );
}
