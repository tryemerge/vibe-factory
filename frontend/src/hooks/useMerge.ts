import { useCallback } from 'react';
import { attemptsApi } from '@/lib/api';

export function useMerge(
  attemptId: string | undefined,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  return useCallback(async () => {
    if (!attemptId) return;

    try {
      await attemptsApi.merge(attemptId);
      onSuccess?.();
    } catch (err) {
      console.error('Failed to merge:', err);
      onError?.(err);
    }
  }, [attemptId, onSuccess, onError]);
}
