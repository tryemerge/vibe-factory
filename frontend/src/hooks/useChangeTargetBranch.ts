import { useMutation, useQueryClient } from '@tanstack/react-query';
import { attemptsApi } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/queryKeys';
import type {
  ChangeTargetBranchRequest,
  ChangeTargetBranchResponse,
} from 'shared/types';

export function useChangeTargetBranch(
  attemptId: string,
  projectId: string,
  onSuccess?: (data: ChangeTargetBranchResponse) => void,
  onError?: (err: unknown) => void
) {
  const queryClient = useQueryClient();

  return useMutation<ChangeTargetBranchResponse, unknown, string>({
    mutationFn: async (newTargetBranch) => {
      const payload: ChangeTargetBranchRequest = {
        new_target_branch: newTargetBranch,
      };
      return attemptsApi.change_target_branch(attemptId, payload);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.branchStatus(attemptId),
      });

      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.projectBranches(projectId),
      });

      onSuccess?.(data);
    },
    onError: (err) => {
      console.error('Failed to change target branch:', err);
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.branchStatus(attemptId),
      });
      onError?.(err);
    },
  });
}
