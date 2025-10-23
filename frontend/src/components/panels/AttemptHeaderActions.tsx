import { useTranslation } from 'react-i18next';
import { Eye, FileDiff, X, ArrowUp, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import type { LayoutMode } from '../layout/TasksLayout';
import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { ActionsDropdown } from '../ui/ActionsDropdown';
import { usePostHog } from 'posthog-js/react';
import { useNavigateWithSearch } from '@/hooks';
import { useTaskChildren } from '@/hooks/useTaskChildren';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useProject } from '@/contexts/project-context';
import { paths } from '@/lib/paths';

interface AttemptHeaderActionsProps {
  onClose: () => void;
  mode?: LayoutMode;
  onModeChange?: (mode: LayoutMode) => void;
  task: TaskWithAttemptStatus;
  attempt?: TaskAttempt | null;
}

export const AttemptHeaderActions = ({
  onClose,
  mode,
  onModeChange,
  task,
  attempt,
}: AttemptHeaderActionsProps) => {
  const { t } = useTranslation('tasks');
  const posthog = usePostHog();
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();

  // Fetch parent task attempt if exists
  const { data: parentAttempt } = useTaskAttempt(
    task.parent_task_attempt || undefined
  );

  // Fetch children tasks if attempt exists
  const { data: children = [] } = useTaskChildren(attempt?.id, {
    enabled: !!attempt?.id,
  });

  const hasParent = !!task.parent_task_attempt && !!parentAttempt;
  const hasChildren = children.length > 0;

  const handleNavigateToParent = () => {
    if (projectId && parentAttempt) {
      navigate(
        paths.attempt(projectId, parentAttempt.task_id, parentAttempt.id)
      );
    }
  };

  const handleNavigateToNextChild = () => {
    if (projectId && children.length > 0) {
      const firstChild = children[0];
      navigate(paths.task(projectId, firstChild.id) + '/attempts/latest');
    }
  };

  return (
    <>
      {typeof mode !== 'undefined' && onModeChange && (
        <TooltipProvider>
          <ToggleGroup
            type="single"
            value={mode ?? ''}
            onValueChange={(v) => {
              const newMode = (v as LayoutMode) || null;

              // Track view navigation
              if (newMode === 'preview') {
                posthog?.capture('preview_navigated', {
                  trigger: 'button',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              } else if (newMode === 'diffs') {
                posthog?.capture('diffs_navigated', {
                  trigger: 'button',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              } else if (newMode === null) {
                // Closing the view (clicked active button)
                posthog?.capture('view_closed', {
                  trigger: 'button',
                  from_view: mode ?? 'attempt',
                  timestamp: new Date().toISOString(),
                  source: 'frontend',
                });
              }

              onModeChange(newMode);
            }}
            className="inline-flex gap-4"
            aria-label="Layout mode"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="preview"
                  aria-label="Preview"
                  active={mode === 'preview'}
                >
                  <Eye className="h-4 w-4" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('attemptHeaderActions.preview')}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <ToggleGroupItem
                  value="diffs"
                  aria-label="Diffs"
                  active={mode === 'diffs'}
                >
                  <FileDiff className="h-4 w-4" />
                </ToggleGroupItem>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t('attemptHeaderActions.diffs')}
              </TooltipContent>
            </Tooltip>
          </ToggleGroup>
        </TooltipProvider>
      )}
      {typeof mode !== 'undefined' && onModeChange && (
        <div className="h-4 w-px bg-border" />
      )}
      {(hasParent || hasChildren) && (
        <>
          <TooltipProvider>
            {hasParent && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNavigateToParent}
                    aria-label={t('attemptHeaderActions.parent')}
                  >
                    <ArrowUp className="h-4 w-4 mr-1" />
                    {t('attemptHeaderActions.parent')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t('attemptHeaderActions.parentTooltip')}
                </TooltipContent>
              </Tooltip>
            )}
            {hasChildren && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleNavigateToNextChild}
                    aria-label={t('attemptHeaderActions.nextChild')}
                  >
                    {t('attemptHeaderActions.nextChild')}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t('attemptHeaderActions.nextChildTooltip')}
                </TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
          <div className="h-4 w-px bg-border" />
        </>
      )}
      <ActionsDropdown task={task} attempt={attempt} />
      <Button variant="icon" aria-label="Close" onClick={onClose}>
        <X size={16} />
      </Button>
    </>
  );
};
