import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';
import type { RebaseTaskAttemptRequest } from 'shared/types';

export function useRebase(
  attemptId: string | undefined,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  return useCallback(
    async (newBaseBranch?: string) => {
      if (!attemptId) return;

      try {
        const data: RebaseTaskAttemptRequest = {
          new_base_branch: newBaseBranch || null,
        };
        await attemptsApi.rebase(attemptId, data);
        onSuccess?.();
      } catch (err) {
        console.error('Failed to rebase:', err);
        onError?.(err);
      }
    },
    [attemptId, onSuccess, onError]
  );
}
