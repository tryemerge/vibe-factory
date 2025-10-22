import { useTranslation } from 'react-i18next';
import { useProject } from '@/contexts/project-context';
import { useTaskAttempts } from '@/hooks/useTaskAttempts';
import { useTaskAttempt } from '@/hooks/useTaskAttempt';
import { useNavigateWithSearch } from '@/hooks';
import { paths } from '@/lib/paths';
import type { TaskWithAttemptStatus, TaskAttempt } from 'shared/types';
import { NewCardContent } from '../ui/new-card';
import { Button } from '../ui/button';
import { PlusIcon } from 'lucide-react';
import NiceModal from '@ebay/nice-modal-react';
import MarkdownRenderer from '@/components/ui/markdown-renderer';

interface TaskPanelProps {
  task: TaskWithAttemptStatus | null;
}

const TaskPanel = ({ task }: TaskPanelProps) => {
  const { t } = useTranslation('tasks');
  const navigate = useNavigateWithSearch();
  const { projectId } = useProject();

  const {
    data: attempts = [],
    isLoading: isAttemptsLoading,
    isError: isAttemptsError,
  } = useTaskAttempts(task?.id);

  const { data: parentAttempt, isLoading: isParentLoading } = useTaskAttempt(
    task?.parent_task_attempt || undefined
  );

  const formatTimeAgo = (iso: string) => {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const absSec = Math.round(Math.abs(diffMs) / 1000);

    const rtf =
      typeof Intl !== 'undefined' && (Intl as any).RelativeTimeFormat
        ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
        : null;

    const to = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
      rtf
        ? rtf.format(-value, unit)
        : `${value} ${unit}${value !== 1 ? 's' : ''} ago`;

    if (absSec < 60) return to(Math.round(absSec), 'second');
    const mins = Math.round(absSec / 60);
    if (mins < 60) return to(mins, 'minute');
    const hours = Math.round(mins / 60);
    if (hours < 24) return to(hours, 'hour');
    const days = Math.round(hours / 24);
    if (days < 30) return to(days, 'day');
    const months = Math.round(days / 30);
    if (months < 12) return to(months, 'month');
    const years = Math.round(months / 12);
    return to(years, 'year');
  };

  const displayedAttempts = [...attempts].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const latestAttempt = displayedAttempts[0] ?? null;

  if (!task) {
    return (
      <div className="text-muted-foreground">
        {t('taskPanel.noTaskSelected')}
      </div>
    );
  }

  const titleContent = `# ${task.title || 'Task'}`;
  const descriptionContent = task.description || '';

  return (
    <>
      <NewCardContent>
        <div className="p-6 flex flex-col h-full max-h-[calc(100vh-8rem)]">
          <div className="space-y-3 overflow-y-auto flex-shrink min-h-0">
            <MarkdownRenderer content={titleContent} />
            {descriptionContent && (
              <MarkdownRenderer content={descriptionContent} />
            )}
          </div>

          <div className="mt-6 flex-shrink-0 space-y-4">
            {task.parent_task_attempt && (
              <ParentAttemptTable
                parentAttempt={parentAttempt}
                isLoading={isParentLoading}
                navigateToAttempt={(attempt) => {
                  if (projectId) {
                    navigate(
                      paths.attempt(projectId, attempt.task_id, attempt.id)
                    );
                  }
                }}
                formatTimeAgo={formatTimeAgo}
              />
            )}

            <AttemptsTable
              attempts={displayedAttempts}
              isLoading={isAttemptsLoading}
              isError={isAttemptsError}
              onCreate={() => {
                NiceModal.show('create-attempt', {
                  taskId: task.id,
                  latestAttempt,
                });
              }}
              navigateToAttempt={(attempt) => {
                if (projectId && task.id) {
                  navigate(paths.attempt(projectId, task.id, attempt.id));
                }
              }}
              formatTimeAgo={formatTimeAgo}
              t={t}
            />
          </div>
        </div>
      </NewCardContent>
    </>
  );
};

function AttemptRow({
  attempt,
  onClick,
  formatTimeAgo,
}: {
  attempt: TaskAttempt;
  onClick: () => void;
  formatTimeAgo: (iso: string) => string;
}) {
  return (
    <tr
      className="border-t cursor-pointer hover:bg-muted"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <td className="py-2 pr-4">{attempt.executor || 'Base Agent'}</td>
      <td className="py-2 pr-4">{attempt.branch || '—'}</td>
      <td className="py-2 pr-0 text-right">
        {formatTimeAgo(attempt.created_at)}
      </td>
    </tr>
  );
}

function ParentAttemptTable({
  parentAttempt,
  isLoading,
  navigateToAttempt,
  formatTimeAgo,
}: {
  parentAttempt: TaskAttempt | undefined;
  isLoading: boolean;
  navigateToAttempt: (attempt: TaskAttempt) => void;
  formatTimeAgo: (iso: string) => string;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="uppercase text-muted-foreground">
        <tr>
          <th colSpan={3} className="text-left">
            Parent Attempt
          </th>
        </tr>
      </thead>
      <tbody>
        {isLoading ? (
          <tr>
            <td colSpan={3} className="py-2 border-t">
              <div className="h-5 w-full bg-muted/30 rounded animate-pulse" />
            </td>
          </tr>
        ) : parentAttempt ? (
          <AttemptRow
            attempt={parentAttempt}
            formatTimeAgo={formatTimeAgo}
            onClick={() => navigateToAttempt(parentAttempt)}
          />
        ) : null}
      </tbody>
    </table>
  );
}

function AttemptsTable({
  attempts,
  isLoading,
  isError,
  onCreate,
  navigateToAttempt,
  formatTimeAgo,
  t,
}: {
  attempts: TaskAttempt[];
  isLoading: boolean;
  isError: boolean;
  onCreate: () => void;
  navigateToAttempt: (attempt: TaskAttempt) => void;
  formatTimeAgo: (iso: string) => string;
  t: (key: string, options?: any) => string;
}) {
  if (isLoading) {
    return (
      <div className="text-muted-foreground">
        {t('taskPanel.loadingAttempts')}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="text-destructive">
        {t('taskPanel.errorLoadingAttempts')}
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead className="uppercase text-muted-foreground">
        <tr>
          <th colSpan={3}>
            <div className="w-full flex text-left">
              <span className="flex-1">
                {t('taskPanel.attemptsCount', { count: attempts.length })}
              </span>
              <span>
                <Button variant="icon" onClick={onCreate}>
                  <PlusIcon size={16} />
                </Button>
              </span>
            </div>
          </th>
        </tr>
      </thead>
      <tbody>
        {attempts.length === 0 ? (
          <tr>
            <td colSpan={3} className="py-2 text-muted-foreground border-t">
              {t('taskPanel.noAttempts')}
            </td>
          </tr>
        ) : (
          attempts.map((attempt) => (
            <AttemptRow
              key={attempt.id}
              attempt={attempt}
              formatTimeAgo={formatTimeAgo}
              onClick={() => navigateToAttempt(attempt)}
            />
          ))
        )}
      </tbody>
    </table>
  );
}

export default TaskPanel;
