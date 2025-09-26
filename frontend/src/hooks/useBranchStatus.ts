import { useQuery } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/queryKeys';

export function useBranchStatus(attemptId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.branchStatus(attemptId!),
    queryFn: () => attemptsApi.getBranchStatus(attemptId!),
    enabled: !!attemptId,
    // Poll faster to promptly reflect rebase/abort transitions
    refetchInterval: 5000,
  });
}
