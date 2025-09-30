import { useEffect, useState } from 'react';
import TaskDetailsHeader from './TaskDetailsHeader';
import { TaskFollowUpSection } from './TaskFollowUpSection';
import { TaskTitleDescription } from './TaskDetails/TaskTitleDescription';
import type { TaskAttempt } from 'shared/types';
import {
  getBackdropClasses,
  getTaskPanelClasses,
  getTaskPanelInnerClasses,
} from '@/lib/responsive-config';
import type { TaskWithAttemptStatus } from 'shared/types';
import type { TabType } from '@/types/tabs';
import DiffTab from '@/components/tasks/TaskDetails/DiffTab.tsx';
import LogsTab from '@/components/tasks/TaskDetails/LogsTab.tsx';
import ProcessesTab from '@/components/tasks/TaskDetails/ProcessesTab.tsx';
import TabNavigation from '@/components/tasks/TaskDetails/TabNavigation.tsx';
import TaskDetailsToolbar from './TaskDetailsToolbar.tsx';
import GitOperations from './Toolbar/GitOperations.tsx';
import { useBranchStatus } from '@/hooks/useBranchStatus';
import TodoPanel from '@/components/tasks/TodoPanel';
import { TabNavContext } from '@/contexts/TabNavigationContext';
import { ProcessSelectionProvider } from '@/contexts/ProcessSelectionContext';
import { ReviewProvider } from '@/contexts/ReviewProvider';
import { EntriesProvider } from '@/contexts/EntriesContext';
import { RetryUiProvider } from '@/contexts/RetryUiContext';
import { AttemptHeaderCard } from './AttemptHeaderCard';
import { inIframe } from '@/vscode/bridge';
import { TaskRelationshipViewer } from './TaskRelationshipViewer';
import { useTaskViewManager } from '@/hooks/useTaskViewManager.ts';

interface TaskDetailsPanelProps {
  task: TaskWithAttemptStatus | null;
  projectHasDevScript?: boolean;
  projectId: string;
  onClose: () => void;
  onEditTask?: (task: TaskWithAttemptStatus) => void;
  onDeleteTask?: (taskId: string) => void;
  onNavigateToTask?: (taskId: string) => void;
  hideBackdrop?: boolean;
  className?: string;
  hideHeader?: boolean;
  isFullScreen?: boolean;
  onNewAttempt?: () => void;
  selectedAttempt: TaskAttempt | null;
  attempts: TaskAttempt[];
  tasksById?: Record<string, TaskWithAttemptStatus>;
}

export function TaskDetailsPanel({
  task,
  projectHasDevScript,
  projectId,
  onClose,
  onEditTask,
  onDeleteTask,
  onNavigateToTask,
  hideBackdrop = false,
  className,
  isFullScreen,
  selectedAttempt,
  attempts,
  tasksById,
}: TaskDetailsPanelProps) {
  // Attempt number, find the current attempt number
  const attemptNumber =
    attempts.length -
    attempts.findIndex((attempt) => attempt.id === selectedAttempt?.id);

  // Tab and collapsible state
  const [activeTab, setActiveTab] = useState<TabType>('logs');

  // Handler for jumping to diff tab in full screen
  const { toggleFullscreen } = useTaskViewManager();
  const { data: branchStatus } = useBranchStatus(selectedAttempt?.id);

  const jumpToDiffFullScreen = () => {
    toggleFullscreen(true);
    setActiveTab('diffs');
  };

  const jumpToLogsTab = () => {
    setActiveTab('logs');
  };

  // Reset to logs tab when task changes
  useEffect(() => {
    if (task?.id) {
      setActiveTab('logs');
    }
  }, [task?.id]);

  return (
    <>
      {!task ? null : (
        <TabNavContext.Provider value={{ activeTab, setActiveTab }}>
          <ProcessSelectionProvider>
            <ReviewProvider>
              <EntriesProvider key={selectedAttempt?.id}>
                {/* Backdrop - only on smaller screens (overlay mode) */}
                {!hideBackdrop && (
                  <div
                    className={getBackdropClasses(isFullScreen || false)}
                    onClick={onClose}
                  />
                )}

                {/* Panel */}
                <div
                  className={
                    className || getTaskPanelClasses(isFullScreen || false)
                  }
                >
                  <div className={getTaskPanelInnerClasses()}>
                    {!inIframe() && (
                      <TaskDetailsHeader
                        task={task}
                        onClose={onClose}
                        onEditTask={onEditTask}
                        onDeleteTask={onDeleteTask}
                        hideCloseButton={hideBackdrop}
                        isFullScreen={isFullScreen}
                      />
                    )}

                    {isFullScreen ? (
                      <div className="flex-1 min-h-0 flex">
                        {/* Sidebar */}
                        <aside
                          className={`w-[28rem] shrink-0 border-r overflow-y-auto ${inIframe() ? 'hidden' : ''}`}
                        >
                          {/* Fullscreen sidebar shows title and description above edit/delete */}
                          <div className="space-y-2 p-3">
                            <TaskTitleDescription task={task} />
                          </div>

                          {/* Current Attempt / Actions */}
                          <TaskDetailsToolbar
                            task={task}
                            projectHasDevScript={projectHasDevScript}
                            attempts={attempts}
                            selectedAttempt={selectedAttempt}
                          />

                          {/* Independent Git Operations Section */}
                          {selectedAttempt && branchStatus && (
                            <GitOperations
                              selectedAttempt={selectedAttempt}
                              task={task}
                              branchStatus={branchStatus}
                            />
                          )}

                          {/* Task Breakdown (TODOs) */}
                          <TodoPanel />

                          {/* Task Relationships */}
                          <TaskRelationshipViewer
                            selectedAttempt={selectedAttempt}
                            onNavigateToTask={onNavigateToTask}
                            task={task}
                            tasksById={tasksById}
                          />
                        </aside>

                        {/* Main content */}
                        <main className="flex-1 min-h-0 min-w-0 flex flex-col">
                          {selectedAttempt && (
                            <RetryUiProvider attemptId={selectedAttempt.id}>
                              <>
                                <TabNavigation
                                  activeTab={activeTab}
                                  setActiveTab={setActiveTab}
                                  selectedAttempt={selectedAttempt}
                                />

                                <div className="flex-1 flex flex-col min-h-0">
                                  {activeTab === 'diffs' ? (
                                    <DiffTab
                                      selectedAttempt={selectedAttempt}
                                    />
                                  ) : activeTab === 'processes' ? (
                                    <ProcessesTab
                                      attemptId={selectedAttempt?.id}
                                    />
                                  ) : (
                                    <LogsTab
                                      selectedAttempt={selectedAttempt}
                                    />
                                  )}
                                </div>

                                <TaskFollowUpSection
                                  task={task}
                                  selectedAttemptId={selectedAttempt?.id}
                                  jumpToLogsTab={jumpToLogsTab}
                                />
                              </>
                            </RetryUiProvider>
                          )}
                        </main>
                      </div>
                    ) : (
                      <>
                        {attempts.length === 0 ? (
                          <TaskDetailsToolbar
                            task={task}
                            projectHasDevScript={projectHasDevScript}
                            attempts={attempts}
                            selectedAttempt={selectedAttempt}
                          />
                        ) : (
                          selectedAttempt && (
                            <>
                              <AttemptHeaderCard
                                attemptNumber={attemptNumber}
                                totalAttempts={attempts.length}
                                selectedAttempt={selectedAttempt}
                                task={task}
                                projectId={projectId}
                                // onCreateNewAttempt={() => {
                                //   // TODO: Implement create new attempt
                                //   console.log('Create new attempt');
                                // }}
                                onJumpToDiffFullScreen={jumpToDiffFullScreen}
                              />

                              <RetryUiProvider attemptId={selectedAttempt.id}>
                                <>
                                  <LogsTab selectedAttempt={selectedAttempt} />
                                  <TaskFollowUpSection
                                    task={task}
                                    selectedAttemptId={selectedAttempt.id}
                                    jumpToLogsTab={jumpToLogsTab}
                                  />
                                </>
                              </RetryUiProvider>
                            </>
                          )
                        )}
                      </>
                    )}
                  </div>
                </div>
              </EntriesProvider>
            </ReviewProvider>
          </ProcessSelectionProvider>
        </TabNavContext.Provider>
      )}
    </>
  );
}
