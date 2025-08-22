import { useCallback, useContext, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  TaskAttemptDataContext,
  TaskAttemptStoppingContext,
  TaskDetailsContext,
  TaskSelectedAttemptContext,
} from '@/components/context/taskDetailsContext';
import { attemptsApi, executionProcessesApi } from '@/lib/api';
import {
  GitBranch as GitBranchIcon,
  GitPullRequest,
  Play,
  Plus,
  RefreshCw,
  ScrollText,
  StopCircle,
} from 'lucide-react';

export function TaskAttemptActions({
  creatingPR,
  setShowCreatePRDialog,
  setError,
  onNewAttempt,
  variant = 'header',
  showStop = true,
  showNewAttempt = true,
}: {
  creatingPR: boolean;
  setShowCreatePRDialog: (open: boolean) => void;
  setError: (err: string | null) => void;
  onNewAttempt?: () => void;
  variant?: 'header' | 'card';
  showStop?: boolean;
  showNewAttempt?: boolean;
}) {
  const { task } = useContext(TaskDetailsContext);
  const { attemptData, isAttemptRunning, fetchAttemptData, branchStatus } =
    useContext(TaskAttemptDataContext);
  const { isStopping, setIsStopping } = useContext(TaskAttemptStoppingContext);
  const { selectedAttempt } = useContext(TaskSelectedAttemptContext);

  const runningDevServer = useMemo(() => {
    return attemptData.processes.find(
      (p) => p.run_reason === 'devserver' && p.status === 'running'
    );
  }, [attemptData.processes]);

  const latestDevServerProcess = useMemo(() => {
    return [...attemptData.processes]
      .filter((p) => p.run_reason === 'devserver')
      .sort(
        (a, b) =>
          new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      )[0];
  }, [attemptData.processes]);

  const [isStartingDevServer, setIsStartingDevServer] = useState(false);
  const [merging, setMerging] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [rebasing, setRebasing] = useState(false);
  const [pushSuccess, setPushSuccess] = useState(false);
  const [mergeSuccess, setMergeSuccess] = useState(false);

  const startDevServer = async () => {
    if (!task || !selectedAttempt) return;
    setIsStartingDevServer(true);
    try {
      await attemptsApi.startDevServer(selectedAttempt.id);
      fetchAttemptData(selectedAttempt.id);
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const stopDevServer = async () => {
    if (!task || !selectedAttempt || !runningDevServer) return;
    setIsStartingDevServer(true);
    try {
      await executionProcessesApi.stopExecutionProcess(runningDevServer.id);
      fetchAttemptData(selectedAttempt.id);
    } finally {
      setIsStartingDevServer(false);
    }
  };

  const handleViewDevServerLogs = () => {
    if (latestDevServerProcess) {
      // Consumers will wire jump via context; for now this is a no-op placeholder
      // or could dispatch a custom event if needed.
      // Left intentionally minimal to avoid deep coupling.
    }
  };

  const mergeInfo = useMemo(() => {
    if (!branchStatus?.merges)
      return {
        hasOpenPR: false,
        openPR: null,
        hasMergedPR: false,
        mergedPR: null,
        hasMerged: false,
        latestMerge: null,
      };

    const openPR = branchStatus.merges.find(
      (m) => m.type === 'pr' && m.pr_info.status === 'open'
    );
    const mergedPR = branchStatus.merges.find(
      (m) => m.type === 'pr' && m.pr_info.status === 'merged'
    );
    const merges = branchStatus.merges.filter(
      (m) =>
        m.type === 'direct' ||
        (m.type === 'pr' && m.pr_info.status === 'merged')
    );
    return {
      hasOpenPR: !!openPR,
      openPR,
      hasMergedPR: !!mergedPR,
      mergedPR,
      hasMerged: merges.length > 0,
      latestMerge: branchStatus.merges[0] || null,
    };
  }, [branchStatus?.merges]);

  const handlePushClick = async () => {
    if (!selectedAttempt?.id) return;
    try {
      setPushing(true);
      await attemptsApi.push(selectedAttempt.id);
      setError(null);
      setPushSuccess(true);
      setTimeout(() => setPushSuccess(false), 2000);
      fetchAttemptData(selectedAttempt.id);
    } catch (error: any) {
      setError(error?.message || 'Failed to push changes');
    } finally {
      setPushing(false);
    }
  };

  const performMerge = async () => {
    if (!selectedAttempt?.id) return;
    try {
      setMerging(true);
      await attemptsApi.merge(selectedAttempt.id);
      setError(null);
      setMergeSuccess(true);
      setTimeout(() => setMergeSuccess(false), 2000);
      fetchAttemptData(selectedAttempt.id);
    } catch (error: any) {
      setError(error?.message || 'Failed to merge changes');
    } finally {
      setMerging(false);
    }
  };

  const handleRebaseClick = async () => {
    if (!selectedAttempt?.id) return;
    try {
      setRebasing(true);
      await attemptsApi.rebase(selectedAttempt.id, { new_base_branch: null });
      setError(null);
      fetchAttemptData(selectedAttempt.id);
    } catch (err: any) {
      setError(err?.message || 'Failed to rebase branch');
    } finally {
      setRebasing(false);
    }
  };

  const handlePRButtonClick = async () => {
    if (!selectedAttempt?.id) return;
    if (mergeInfo.hasOpenPR) {
      await handlePushClick();
      return;
    }
    setShowCreatePRDialog(true);
  };

  const stopAllExecutions = useCallback(async () => {
    if (!selectedAttempt || !isAttemptRunning) return;
    try {
      setIsStopping(true);
      await attemptsApi.stop(selectedAttempt.id);
      await fetchAttemptData(selectedAttempt.id);
      setTimeout(() => fetchAttemptData(selectedAttempt.id), 1000);
    } finally {
      setIsStopping(false);
    }
  }, [selectedAttempt, isAttemptRunning, setIsStopping, fetchAttemptData]);

  const containerClasses =
    variant === 'header'
      ? 'ml-auto flex items-center gap-2 py-2 pr-4'
      : 'flex items-center justify-between gap-2 flex-wrap';

  return (
    <div className={containerClasses}>
      {/* Dev server actions */}
      <div className="flex items-center gap-2">
        <Button
          variant={runningDevServer ? 'destructive' : 'outline'}
          size="xs"
          onClick={runningDevServer ? stopDevServer : startDevServer}
          disabled={isStartingDevServer}
          className="gap-1"
        >
          {runningDevServer ? (
            <>
              <StopCircle className="h-3 w-3" /> Stop Dev
            </>
          ) : (
            <>
              <Play className="h-3 w-3" /> Dev
            </>
          )}
        </Button>
        {latestDevServerProcess && (
          <Button variant="outline" size="xs" onClick={handleViewDevServerLogs}>
            <ScrollText className="h-3 w-3 mr-1" /> Logs
          </Button>
        )}
      </div>

      {/* PR / Merge + New Attempt */}
      <div
        className={
          variant === 'header'
            ? 'flex items-center gap-2 ml-4'
            : 'flex items-center gap-2'
        }
      >
        <Button
          onClick={handlePRButtonClick}
          disabled={
            creatingPR ||
            pushing ||
            Boolean((branchStatus?.commits_behind ?? 0) > 0) ||
            isAttemptRunning ||
            (mergeInfo.hasOpenPR &&
              (branchStatus?.remote_commits_ahead || 0) === 0)
          }
          variant="outline"
          size="xs"
          className="gap-1 min-w-[120px]"
        >
          <GitPullRequest className="h-3 w-3" />
          {mergeInfo.hasOpenPR
            ? pushSuccess
              ? 'Pushed!'
              : pushing
                ? 'Pushing...'
                : (branchStatus?.remote_commits_ahead || 0) === 0
                  ? 'Push to PR'
                  : (branchStatus?.remote_commits_ahead || 0) === 1
                    ? 'Push 1 commit'
                    : `Push ${(branchStatus?.remote_commits_ahead as number) || 0} commits`
            : creatingPR
              ? 'Creating...'
              : 'Create PR'}
        </Button>
        <Button
          onClick={performMerge}
          disabled={
            mergeInfo.hasOpenPR ||
            merging ||
            Boolean((branchStatus?.commits_behind ?? 0) > 0) ||
            isAttemptRunning ||
            ((branchStatus?.commits_ahead ?? 0) === 0 &&
              !pushSuccess &&
              !mergeSuccess)
          }
          size="xs"
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 gap-1 min-w-[100px]"
        >
          <GitBranchIcon className="h-3 w-3" />
          {mergeSuccess ? 'Merged!' : merging ? 'Merging...' : 'Merge'}
        </Button>
        {(branchStatus?.commits_behind ?? 0) > 0 && (
          <Button
            onClick={handleRebaseClick}
            disabled={rebasing || isAttemptRunning}
            variant="outline"
            size="xs"
            className="gap-1"
          >
            <RefreshCw
              className={`h-3 w-3 ${rebasing ? 'animate-spin' : ''}`}
            />
            {rebasing ? 'Rebasing...' : 'Rebase'}
          </Button>
        )}
        {showNewAttempt && !isAttemptRunning && onNewAttempt && (
          <Button
            variant="outline"
            size="xs"
            className="gap-2"
            onClick={onNewAttempt}
          >
            <Plus className="h-4 w-4" />
            New Attempt
          </Button>
        )}
      </div>

      {/* Stop */}
      {showStop && (isStopping || isAttemptRunning) && (
        <Button
          variant="destructive"
          size="xs"
          onClick={stopAllExecutions}
          disabled={isStopping}
          className={variant === 'header' ? 'gap-2 ml-4' : 'gap-2'}
        >
          <StopCircle className="h-4 w-4" />
          {isStopping ? 'Stopping...' : 'Stop Attempt'}
        </Button>
      )}
    </div>
  );
}
