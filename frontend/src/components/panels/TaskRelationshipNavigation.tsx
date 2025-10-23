import { ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import type { TaskAttempt, TaskWithAttemptStatus } from 'shared/types';
import { useNavigateWithSearch } from '@/hooks';
import { useTaskRelationships } from '@/hooks/useTaskRelationships';
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
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();

  const { data: relationships } = useTaskRelationships(attempt?.id, {
    enabled: !!attempt?.id,
  });

  const parentTask = relationships?.parent_task;
  const children = relationships?.children ?? [];

  const truncateTitle = (title: string, maxLength = 10) => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  const handleNavigateToParent = () => {
    if (projectId && parentTask && task.parent_task_attempt) {
      navigate(
        paths.attempt(projectId, parentTask.id, task.parent_task_attempt)
      );
    }
  };

  const handleNavigateToChild = (childId: string) => {
    if (projectId) {
      navigate(paths.task(projectId, childId) + '/attempts/latest');
    }
  };

  // Don't render anything if no relationships exist
  if (!parentTask && children.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      {parentTask && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleNavigateToParent}
              aria-label={`Navigate to parent: ${parentTask.title}`}
            >
              <ArrowUp className="h-4 w-4 mr-1" />
              {truncateTitle(parentTask.title)}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="max-w-xs">{parentTask.title}</div>
          </TooltipContent>
        </Tooltip>
      )}
      {children.map((child) => (
        <Tooltip key={child.id}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleNavigateToChild(child.id)}
              aria-label={`Navigate to child: ${child.title}`}
            >
              <ArrowDown className="h-4 w-4 mr-1" />
              {truncateTitle(child.title)}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="max-w-xs">{child.title}</div>
          </TooltipContent>
        </Tooltip>
      ))}
    </TooltipProvider>
  );
};
