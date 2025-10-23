import { useTranslation } from 'react-i18next';
import { ArrowUp, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { useNavigateWithSearch } from '@/hooks';
import { useTaskChildren } from '@/hooks/useTaskChildren';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useProject } from '@/contexts/project-context';
import { paths } from '@/lib/paths';

interface TaskRelationshipNavigationProps {
  task: TaskWithAttemptStatus;
  attempt?: TaskAttempt | null;
}

export const TaskRelationshipNavigation = ({
  task,
  attempt,
}: TaskRelationshipNavigationProps) => {
  const { t } = useTranslation('tasks');
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

  // Don't render anything if no relationships exist
  if (!hasParent && !hasChildren) {
    return null;
  }

  return (
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
  );
};
