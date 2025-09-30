import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/queryKeys';

export function useMerge(
  attemptId: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => attemptsApi.merge(attemptId),
    onSuccess: () => {
      // Refresh attempt-specific branch information
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.branchStatus(attemptId),
      });

      onSuccess?.();
    },
    onError: (err) => {
      console.error('Failed to merge:', err);
      onError?.(err);
    },
  });
}
