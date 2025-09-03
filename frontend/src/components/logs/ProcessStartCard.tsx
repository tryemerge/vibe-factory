import { Cog, Play, Terminal, Code, ChevronDown, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessStartPayload, ExecutorAction } from '@/types/logs';

interface ProcessStartCardProps {
  payload: ProcessStartPayload;
  isCollapsed: boolean;
  onToggle: (processId: string) => void;
}

const extractPromptFromAction = (
  action?: ExecutorAction | null
): string | null => {
  console.log(action);
  if (!action) return null;
  const t = action.typ as any;
  if (t && typeof t.prompt === 'string' && t.prompt.trim()) return t.prompt;
  return null;
};

function ProcessStartCard({
  payload,
  isCollapsed,
  onToggle,
}: ProcessStartCardProps) {
  const getProcessIcon = (runReason: string) => {
    switch (runReason) {
      case 'setupscript':
        return <Cog className="h-4 w-4" />;
      case 'cleanupscript':
        return <Terminal className="h-4 w-4" />;
      case 'codingagent':
        return <User className="h-4 w-4" />;
      case 'devserver':
        return <Play className="h-4 w-4" />;
      default:
        return <Cog className="h-4 w-4" />;
    }
  };

  const getProcessLabel = (p: ProcessStartPayload) => {
    if (p.runReason === 'codingagent') {
      const prompt = extractPromptFromAction(p.action);
      return prompt || 'Coding Agent';
    }
    switch (p.runReason) {
      case 'setupscript':
        return 'Setup Script';
      case 'cleanupscript':
        return 'Cleanup Script';
      case 'devserver':
        return 'Dev Server';
      default:
        return p.runReason;
    }
  };

  const handleClick = () => {
    onToggle(payload.processId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(payload.processId);
    }
  };

  const label = getProcessLabel(payload);
  const shouldTruncate = isCollapsed && payload.runReason === 'codingagent';

  return (
    <div className="pl-4 4 pb-2 w-full">
      <div
        className="px-3 p-2 cursor-pointer select-none hover:bg-muted/70 transition-colors border rounded-md w-full"
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-2 text-foreground min-w-0 flex-1">
            <div className="flex-shrink-0">
              {getProcessIcon(payload.runReason)}
            </div>
            <span
              className={cn(
                'font-medium',
                shouldTruncate ? 'truncate' : 'whitespace-normal break-words'
              )}
              title={shouldTruncate ? label : undefined}
            >
              {label}
            </span>
          </div>

          <div
            className={cn(
              'ml-auto text-xs px-2 py-1 rounded-full',
              payload.status === 'running'
                ? 'bg-blue-100 text-blue-700'
                : payload.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : payload.status === 'failed'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-gray-100 text-gray-700'
            )}
          >
            {payload.status}
          </div>

          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              isCollapsed && '-rotate-90'
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default ProcessStartCard;
