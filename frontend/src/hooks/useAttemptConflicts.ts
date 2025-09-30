import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/queryKeys';

export function useAttemptConflicts(attemptId: string) {
  const queryClient = useQueryClient();

  const abortConflicts = useCallback(async () => {
    await attemptsApi.abortConflicts(attemptId);
    await queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.branchStatus(attemptId),
    });
  }, [attemptId, queryClient]);

  return { abortConflicts } as const;
}
