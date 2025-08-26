import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';

export function usePush(
  attemptId: string | undefined,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  return useCallback(
    async () => {
      if (!attemptId) return;

      try {
        await attemptsApi.push(attemptId);
        onSuccess?.();
      } catch (err) {
        console.error('Failed to push:', err);
        onError?.(err);
      }
    },
    [attemptId, onSuccess, onError]
  );
}
