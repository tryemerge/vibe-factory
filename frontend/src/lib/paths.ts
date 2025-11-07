export const paths = {
  projects: () => '/projects',
  projectTasks: (projectId: string) => `/projects/${projectId}/tasks`,
  task: (projectId: string, taskId: string) =>
    `/projects/${projectId}/tasks/${taskId}`,
  attempt: (projectId: string, taskId: string, attemptId: string) =>
    `/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}`,
  attemptFull: (projectId: string, taskId: string, attemptId: string) =>
    `/projects/${projectId}/tasks/${taskId}/attempts/${attemptId}/full`,
  factory: (projectId: string) => `/projects/${projectId}/factory`,
  factoryTask: (projectId: string, taskId: string) =>
    `/projects/${projectId}/factory/${taskId}`,
  factoryAttempt: (projectId: string, taskId: string, attemptId: string) =>
    `/projects/${projectId}/factory/${taskId}/attempts/${attemptId}`,
};
