import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/queryKeys';

export function useAttemptBranch(attemptId?: string | null) {
  const query = useQuery({
    queryKey: QUERY_KEYS.attemptBranch(attemptId!),
    queryFn: async () => {
      const attempt = await attemptsApi.get(attemptId!);
      return attempt.branch ?? null;
    },
    enabled: !!attemptId,
  });

  return {
    branch: query.data ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  } as const;
}
