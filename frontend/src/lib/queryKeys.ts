export const QUERY_KEYS = {
  // Attempt-related
  attemptBranch: (attemptId: string) => ['attemptBranch', attemptId] as const,
  branchStatus: (attemptId: string) => ['branchStatus', attemptId] as const,
  executionProcesses: (attemptId: string) =>
    ['executionProcesses', attemptId] as const,
  taskAttempts: (taskId: string) => ['taskAttempts', taskId] as const,

  // Process-related
  processDetails: (processId: string) => ['processDetails', processId] as const,

  // Project-related
  project: (projectId: string) => ['project', projectId] as const,
  projectBranches: (projectId: string) =>
    ['projectBranches', projectId] as const,
  projectTemplates: (projectId: string) =>
    ['templates', 'project', projectId] as const,

  // Task-related
  projectTasks: (projectId: string) => ['tasks', projectId] as const,
  task: (taskId: string) => ['task', taskId] as const,

  // Templates
  globalTemplates: () => ['templates', 'global'] as const,

  // Profiles
  profiles: () => ['profiles'] as const,
} as const;
