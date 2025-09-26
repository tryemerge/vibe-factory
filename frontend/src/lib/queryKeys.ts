export const QUERY_KEYS = {
  branchStatus: (attemptId: string) => ['branchStatus', attemptId] as const,
  executionProcesses: (attemptId: string) =>
    ['executionProcesses', attemptId] as const,
  projectBranches: (projectId: string) =>
    ['projectBranches', projectId] as const,
  projectTemplates: (projectId: string) =>
    ['templates', 'project', projectId] as const,
  globalTemplates: () => ['templates', 'global'] as const,
} as const;
