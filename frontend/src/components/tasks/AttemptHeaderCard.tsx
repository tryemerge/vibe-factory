import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import type { TaskAttempt } from 'shared/types';

interface AttemptHeaderCardProps {
  attemptNumber: number;
  totalAttempts: number;
  selectedAttempt: TaskAttempt | null;
  onStartDevServer?: () => void;
  onRebase?: () => void;
  onCreatePR?: () => void;
  onMerge?: () => void;
  onCreateNewAttempt?: () => void;
}

export function AttemptHeaderCard({
  attemptNumber,
  totalAttempts,
  selectedAttempt,
  onStartDevServer,
  onRebase,
  onCreatePR,
  onMerge,
  onCreateNewAttempt,
}: AttemptHeaderCardProps) {
  return (
    <Card className="border-b border-dashed bg-secondary p-3 flex text-sm text-muted-foreground">
      <div className="flex-1 flex gap-6">
        <p>Attempt &middot; <span className="text-primary">{attemptNumber}/{totalAttempts}</span></p>
        <p>Profile &middot; <span className="text-primary">{selectedAttempt?.profile}</span></p>
        {selectedAttempt?.branch && <p className="max-w-30 truncate">Branch &middot; <span className="text-primary">{selectedAttempt.branch}</span></p>}
      </div>
      <div className="flex">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onStartDevServer} disabled={!onStartDevServer}>
              Start dev server
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRebase} disabled={!onRebase}>
              Rebase
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreatePR} disabled={!onCreatePR}>
              Create PR
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMerge} disabled={!onMerge}>
              Merge
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateNewAttempt} disabled={!onCreateNewAttempt}>
              Create new attempt
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
