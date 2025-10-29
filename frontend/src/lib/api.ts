// Import all necessary types from shared types

import {
  ApprovalStatus,
  ApiResponse,
  BranchStatus,
  CheckTokenResponse,
  Config,
  CommitInfo,
  CreateFollowUpAttempt,
  CreateGitHubPrRequest,
  CreateTask,
  CreateAndStartTaskRequest,
  CreateTaskAttemptBody,
  CreateTaskTemplate,
  DeviceFlowStartResponse,
  DevicePollStatus,
  DirectoryListResponse,
  DirectoryEntry,
  EditorType,
  ExecutionProcess,
  GitBranch,
  Project,
  CreateProject,
  RepositoryInfo,
  SearchResult,
  ShareTaskResponse,
  Task,
  TaskAttempt,
  TaskRelationships,
  TaskTemplate,
  TaskWithAttemptStatus,
  AssignSharedTaskResponse,
  UpdateProject,
  UpdateTask,
  UpdateTaskTemplate,
  UserSystemInfo,
  GitHubServiceError,
  UpdateRetryFollowUpDraftRequest,
  McpServerQuery,
  UpdateMcpServersBody,
  GetMcpServerResponse,
  ImageResponse,
  DraftResponse,
  UpdateFollowUpDraftRequest,
  GitOperationError,
  ApprovalResponse,
  RebaseTaskAttemptRequest,
  ChangeTargetBranchRequest,
  ChangeTargetBranchResponse,
} from 'shared/types';

// Re-export types for convenience
export type { RepositoryInfo } from 'shared/types';
export type {
  UpdateFollowUpDraftRequest,
  UpdateRetryFollowUpDraftRequest,
} from 'shared/types';

class ApiError<E = unknown> extends Error {
  public status?: number;
  public error_data?: E;

  constructor(
    message: string,
    public statusCode?: number,
    public response?: Response,
    error_data?: E
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = statusCode;
    this.error_data = error_data;
  }
}

let lastRegisteredClerkToken: string | null = null;
let registerTokenPromise: Promise<void> | null = null;
let clearTokenPromise: Promise<void> | null = null;

const makeRequest = async (url: string, options: RequestInit = {}) => {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const headersWithAuth = await buildAuthHeaders(headers);

  return fetch(url, {
    ...options,
    headers: headersWithAuth,
  });
};

async function buildAuthHeaders(base?: HeadersInit): Promise<Headers> {
  const headers = base instanceof Headers ? base : new Headers(base ?? {});
  const token = await getClerkToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-Clerk-Token', token);
    await registerClerkSession(token);
  } else {
    await maybeClearClerkSession();
  }

  return headers;
}

async function getClerkToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const clerk = window.Clerk;
  if (!clerk?.session) return null;

  try {
    const token = await clerk.session.getToken();
    return token ?? null;
  } catch (error) {
    console.warn('Failed to acquire Clerk token', error);
    return null;
  }
}

export async function refreshClerkSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  const clerk = window.Clerk;

  if (!clerk?.session) {
    await maybeClearClerkSession();
    return;
  }

  try {
    const token = await clerk.session.getToken({ skipCache: true });

    if (token) {
      await registerClerkSession(token);
    } else {
      await maybeClearClerkSession();
    }
  } catch (error) {
    console.warn('Failed to refresh Clerk session token', error);
  }
}

async function registerClerkSession(token: string): Promise<void> {
  if (!token) return;

  if (registerTokenPromise) {
    await registerTokenPromise;
  }

  if (token === lastRegisteredClerkToken) {
    return;
  }

  registerTokenPromise = (async () => {
    try {
      const response = await fetch('/api/auth/clerk/session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        console.warn(
          'Failed to register Clerk session',
          response.status,
          await safeParseJson(response)
        );
        return;
      }

      lastRegisteredClerkToken = token;
    } catch (error) {
      console.warn('Unable to register Clerk session', error);
    } finally {
      registerTokenPromise = null;
    }
  })();

  await registerTokenPromise;
}

async function maybeClearClerkSession(): Promise<void> {
  if (!lastRegisteredClerkToken) {
    return;
  }

  if (clearTokenPromise) {
    await clearTokenPromise;
    return;
  }

  clearTokenPromise = (async () => {
    try {
      const response = await fetch('/api/auth/clerk/session', {
        method: 'DELETE',
      });

      if (!response.ok) {
        console.warn(
          'Failed to clear Clerk session',
          response.status,
          await safeParseJson(response)
        );
        return;
      }

      lastRegisteredClerkToken = null;
    } catch (error) {
      console.warn('Unable to clear Clerk session', error);
    } finally {
      clearTokenPromise = null;
    }
  })();

  await clearTokenPromise;
}

async function safeParseJson(response: Response): Promise<unknown> {
  try {
    return await response.clone().json();
  } catch {
    return null;
  }
}

export interface FollowUpResponse {
  message: string;
  actual_attempt_id: string;
  created_new_attempt: boolean;
}

export type Ok<T> = { success: true; data: T };
export type Err<E> = { success: false; error: E | undefined; message?: string };

// Result type for endpoints that need typed errors
export type Result<T, E> = Ok<T> | Err<E>;

// Special handler for Result-returning endpoints
const handleApiResponseAsResult = async <T, E>(
  response: Response
): Promise<Result<T, E>> => {
  if (!response.ok) {
    // HTTP error - no structured error data
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      errorMessage = response.statusText || errorMessage;
    }

    return {
      success: false,
      error: undefined,
      message: errorMessage,
    };
  }

  const result: ApiResponse<T, E> = await response.json();

  if (!result.success) {
    return {
      success: false,
      error: result.error_data || undefined,
      message: result.message || undefined,
    };
  }

  return { success: true, data: result.data as T };
};

const handleApiResponse = async <T, E = T>(response: Response): Promise<T> => {
  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch {
      // Fallback to status text if JSON parsing fails
      errorMessage = response.statusText || errorMessage;
    }

    console.error('[API Error]', {
      message: errorMessage,
      status: response.status,
      response,
      endpoint: response.url,
      timestamp: new Date().toISOString(),
    });
    throw new ApiError<E>(errorMessage, response.status, response);
  }

  const result: ApiResponse<T, E> = await response.json();

  if (!result.success) {
    // Check for error_data first (structured errors), then fall back to message
    if (result.error_data) {
      console.error('[API Error with data]', {
        error_data: result.error_data,
        message: result.message,
        status: response.status,
        response,
        endpoint: response.url,
        timestamp: new Date().toISOString(),
      });
      // Throw a properly typed error with the error data
      throw new ApiError<E>(
        result.message || 'API request failed',
        response.status,
        response,
        result.error_data
      );
    }

    console.error('[API Error]', {
      message: result.message || 'API request failed',
      status: response.status,
      response,
      endpoint: response.url,
      timestamp: new Date().toISOString(),
    });
    throw new ApiError<E>(
      result.message || 'API request failed',
      response.status,
      response
    );
  }

  return result.data as T;
};

// Project Management APIs
export const projectsApi = {
  getAll: async (): Promise<Project[]> => {
    const response = await makeRequest('/api/projects');
    return handleApiResponse<Project[]>(response);
  },

  getById: async (id: string): Promise<Project> => {
    const response = await makeRequest(`/api/projects/${id}`);
    return handleApiResponse<Project>(response);
  },

  create: async (data: CreateProject): Promise<Project> => {
    const response = await makeRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Project>(response);
  },

  update: async (id: string, data: UpdateProject): Promise<Project> => {
    const response = await makeRequest(`/api/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Project>(response);
  },

  delete: async (id: string): Promise<void> => {
    const response = await makeRequest(`/api/projects/${id}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  openEditor: async (id: string, editorType?: EditorType): Promise<void> => {
    const requestBody: any = {};
    if (editorType) requestBody.editor_type = editorType;

    const response = await makeRequest(`/api/projects/${id}/open-editor`, {
      method: 'POST',
      body: JSON.stringify(
        Object.keys(requestBody).length > 0 ? requestBody : null
      ),
    });
    return handleApiResponse<void>(response);
  },

  getBranches: async (id: string): Promise<GitBranch[]> => {
    const response = await makeRequest(`/api/projects/${id}/branches`);
    return handleApiResponse<GitBranch[]>(response);
  },

  searchFiles: async (
    id: string,
    query: string,
    mode?: string,
    options?: RequestInit
  ): Promise<SearchResult[]> => {
    const modeParam = mode ? `&mode=${encodeURIComponent(mode)}` : '';
    const response = await makeRequest(
      `/api/projects/${id}/search?q=${encodeURIComponent(query)}${modeParam}`,
      options
    );
    return handleApiResponse<SearchResult[]>(response);
  },
};

// Task Management APIs
export const tasksApi = {
  getAll: async (projectId: string): Promise<TaskWithAttemptStatus[]> => {
    const response = await makeRequest(`/api/tasks?project_id=${projectId}`);
    return handleApiResponse<TaskWithAttemptStatus[]>(response);
  },

  getById: async (taskId: string): Promise<Task> => {
    const response = await makeRequest(`/api/tasks/${taskId}`);
    return handleApiResponse<Task>(response);
  },

  create: async (data: CreateTask): Promise<Task> => {
    const response = await makeRequest(`/api/tasks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Task>(response);
  },

  createAndStart: async (
    data: CreateAndStartTaskRequest
  ): Promise<TaskWithAttemptStatus> => {
    const response = await makeRequest(`/api/tasks/create-and-start`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskWithAttemptStatus>(response);
  },

  update: async (taskId: string, data: UpdateTask): Promise<Task> => {
    const response = await makeRequest(`/api/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<Task>(response);
  },

  delete: async (taskId: string): Promise<void> => {
    const response = await makeRequest(`/api/tasks/${taskId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  share: async (taskId: string): Promise<ShareTaskResponse> => {
    const response = await makeRequest(`/api/tasks/${taskId}/share`, {
      method: 'POST',
    });
    return handleApiResponse<ShareTaskResponse>(response);
  },

  transferAssignment: async (
    sharedTaskId: string,
    data: { new_assignee_user_id: string | null; version?: number | null }
  ): Promise<AssignSharedTaskResponse> => {
    const payload = {
      new_assignee_user_id: data.new_assignee_user_id,
      version: data.version ?? null,
    };

    const response = await makeRequest(
      `/api/shared-tasks/${sharedTaskId}/assign`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

    return handleApiResponse<AssignSharedTaskResponse>(response);
  },

  unshare: async (sharedTaskId: string): Promise<void> => {
    const response = await makeRequest(`/api/shared-tasks/${sharedTaskId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },
};

// Task Attempts APIs
export const attemptsApi = {
  getChildren: async (attemptId: string): Promise<TaskRelationships> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/children`
    );
    return handleApiResponse<TaskRelationships>(response);
  },

  getAll: async (taskId: string): Promise<TaskAttempt[]> => {
    const response = await makeRequest(`/api/task-attempts?task_id=${taskId}`);
    return handleApiResponse<TaskAttempt[]>(response);
  },

  get: async (attemptId: string): Promise<TaskAttempt> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}`);
    return handleApiResponse<TaskAttempt>(response);
  },

  create: async (data: CreateTaskAttemptBody): Promise<TaskAttempt> => {
    const response = await makeRequest(`/api/task-attempts`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskAttempt>(response);
  },

  stop: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}/stop`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  replaceProcess: async (
    attemptId: string,
    data: {
      process_id: string;
      prompt: string;
      variant?: string | null;
      force_when_dirty?: boolean;
      perform_git_reset?: boolean;
    }
  ): Promise<unknown> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/replace-process`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse(response);
  },

  followUp: async (
    attemptId: string,
    data: CreateFollowUpAttempt
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/follow-up`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<void>(response);
  },

  getDraft: async (
    attemptId: string,
    type: 'follow_up' | 'retry'
  ): Promise<DraftResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/draft?type=${encodeURIComponent(type)}`
    );
    return handleApiResponse<DraftResponse>(response);
  },

  saveDraft: async (
    attemptId: string,
    type: 'follow_up' | 'retry',
    data: UpdateFollowUpDraftRequest | UpdateRetryFollowUpDraftRequest
  ): Promise<DraftResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/draft?type=${encodeURIComponent(type)}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<DraftResponse>(response);
  },

  deleteDraft: async (
    attemptId: string,
    type: 'follow_up' | 'retry'
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/draft?type=${encodeURIComponent(type)}`,
      { method: 'DELETE' }
    );
    return handleApiResponse<void>(response);
  },

  setDraftQueue: async (
    attemptId: string,
    queued: boolean,
    expectedQueued?: boolean,
    expectedVersion?: number,
    type: 'follow_up' | 'retry' = 'follow_up'
  ): Promise<DraftResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/draft/queue?type=${encodeURIComponent(type)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          queued,
          expected_queued: expectedQueued,
          expected_version: expectedVersion,
        }),
      }
    );
    return handleApiResponse<DraftResponse>(response);
  },

  deleteFile: async (
    attemptId: string,
    fileToDelete: string
  ): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/delete-file?file_path=${encodeURIComponent(
        fileToDelete
      )}`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  openEditor: async (
    attemptId: string,
    editorType?: EditorType,
    filePath?: string
  ): Promise<void> => {
    const requestBody: { editor_type?: EditorType; file_path?: string } = {};
    if (editorType) requestBody.editor_type = editorType;
    if (filePath) requestBody.file_path = filePath;

    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/open-editor`,
      {
        method: 'POST',
        body: JSON.stringify(
          Object.keys(requestBody).length > 0 ? requestBody : null
        ),
      }
    );
    return handleApiResponse<void>(response);
  },

  getBranchStatus: async (attemptId: string): Promise<BranchStatus> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/branch-status`
    );
    return handleApiResponse<BranchStatus>(response);
  },

  merge: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/merge`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  push: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}/push`, {
      method: 'POST',
    });
    return handleApiResponse<void>(response);
  },

  rebase: async (
    attemptId: string,
    data: RebaseTaskAttemptRequest
  ): Promise<Result<void, GitOperationError>> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/rebase`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponseAsResult<void, GitOperationError>(response);
  },

  change_target_branch: async (
    attemptId: string,
    data: ChangeTargetBranchRequest
  ): Promise<ChangeTargetBranchResponse> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/change-target-branch`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
    return handleApiResponse<ChangeTargetBranchResponse>(response);
  },

  abortConflicts: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/conflicts/abort`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },

  createPR: async (
    attemptId: string,
    data: CreateGitHubPrRequest
  ): Promise<Result<string, GitHubServiceError>> => {
    const response = await makeRequest(`/api/task-attempts/${attemptId}/pr`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponseAsResult<string, GitHubServiceError>(response);
  },

  startDevServer: async (attemptId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/start-dev-server`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },
};

// Extra helpers
export const commitsApi = {
  getInfo: async (attemptId: string, sha: string): Promise<CommitInfo> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/commit-info?sha=${encodeURIComponent(
        sha
      )}`
    );
    return handleApiResponse<CommitInfo>(response);
  },
  compareToHead: async (
    attemptId: string,
    sha: string
  ): Promise<{
    head_oid: string;
    target_oid: string;
    ahead_from_head: number;
    behind_from_head: number;
    is_linear: boolean;
  }> => {
    const response = await makeRequest(
      `/api/task-attempts/${attemptId}/commit-compare?sha=${encodeURIComponent(
        sha
      )}`
    );
    return handleApiResponse(response);
  },
};

// Execution Process APIs
export const executionProcessesApi = {
  getExecutionProcesses: async (
    attemptId: string
  ): Promise<ExecutionProcess[]> => {
    const response = await makeRequest(
      `/api/execution-processes?task_attempt_id=${attemptId}`
    );
    return handleApiResponse<ExecutionProcess[]>(response);
  },

  getDetails: async (processId: string): Promise<ExecutionProcess> => {
    const response = await makeRequest(`/api/execution-processes/${processId}`);
    return handleApiResponse<ExecutionProcess>(response);
  },

  stopExecutionProcess: async (processId: string): Promise<void> => {
    const response = await makeRequest(
      `/api/execution-processes/${processId}/stop`,
      {
        method: 'POST',
      }
    );
    return handleApiResponse<void>(response);
  },
};

// File System APIs
export const fileSystemApi = {
  list: async (path?: string): Promise<DirectoryListResponse> => {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await makeRequest(
      `/api/filesystem/directory${queryParam}`
    );
    return handleApiResponse<DirectoryListResponse>(response);
  },

  listGitRepos: async (path?: string): Promise<DirectoryEntry[]> => {
    const queryParam = path ? `?path=${encodeURIComponent(path)}` : '';
    const response = await makeRequest(
      `/api/filesystem/git-repos${queryParam}`
    );
    return handleApiResponse<DirectoryEntry[]>(response);
  },
};

// Config APIs (backwards compatible)
export const configApi = {
  getConfig: async (): Promise<UserSystemInfo> => {
    const response = await makeRequest('/api/info');
    return handleApiResponse<UserSystemInfo>(response);
  },
  saveConfig: async (config: Config): Promise<Config> => {
    const response = await makeRequest('/api/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
    return handleApiResponse<Config>(response);
  },
};

// GitHub Device Auth APIs
export const githubAuthApi = {
  checkGithubToken: async (): Promise<CheckTokenResponse> => {
    const response = await makeRequest('/api/auth/github/check');
    return handleApiResponse<CheckTokenResponse>(response);
  },
  start: async (): Promise<DeviceFlowStartResponse> => {
    const response = await makeRequest('/api/auth/github/device/start', {
      method: 'POST',
    });
    return handleApiResponse<DeviceFlowStartResponse>(response);
  },
  poll: async (): Promise<DevicePollStatus> => {
    const response = await makeRequest('/api/auth/github/device/poll', {
      method: 'POST',
    });
    return handleApiResponse<DevicePollStatus>(response);
  },
};

// GitHub APIs (only available in cloud mode)
export const githubApi = {
  listRepositories: async (page: number = 1): Promise<RepositoryInfo[]> => {
    const response = await makeRequest(`/api/github/repositories?page=${page}`);
    return handleApiResponse<RepositoryInfo[]>(response);
  },
};

// Task Templates APIs
export const templatesApi = {
  list: async (): Promise<TaskTemplate[]> => {
    const response = await makeRequest('/api/templates');
    return handleApiResponse<TaskTemplate[]>(response);
  },

  listGlobal: async (): Promise<TaskTemplate[]> => {
    const response = await makeRequest('/api/templates?global=true');
    return handleApiResponse<TaskTemplate[]>(response);
  },

  listByProject: async (projectId: string): Promise<TaskTemplate[]> => {
    const response = await makeRequest(
      `/api/templates?project_id=${projectId}`
    );
    return handleApiResponse<TaskTemplate[]>(response);
  },

  get: async (templateId: string): Promise<TaskTemplate> => {
    const response = await makeRequest(`/api/templates/${templateId}`);
    return handleApiResponse<TaskTemplate>(response);
  },

  create: async (data: CreateTaskTemplate): Promise<TaskTemplate> => {
    const response = await makeRequest('/api/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskTemplate>(response);
  },

  update: async (
    templateId: string,
    data: UpdateTaskTemplate
  ): Promise<TaskTemplate> => {
    const response = await makeRequest(`/api/templates/${templateId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return handleApiResponse<TaskTemplate>(response);
  },

  delete: async (templateId: string): Promise<void> => {
    const response = await makeRequest(`/api/templates/${templateId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },
};

// MCP Servers APIs
export const mcpServersApi = {
  load: async (query: McpServerQuery): Promise<GetMcpServerResponse> => {
    const params = new URLSearchParams(query);
    const response = await makeRequest(`/api/mcp-config?${params.toString()}`);
    return handleApiResponse<GetMcpServerResponse>(response);
  },
  save: async (
    query: McpServerQuery,
    data: UpdateMcpServersBody
  ): Promise<void> => {
    const params = new URLSearchParams(query);
    // params.set('profile', profile);
    const response = await makeRequest(`/api/mcp-config?${params.toString()}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[API Error] Failed to save MCP servers', {
        message: errorData.message,
        status: response.status,
        response,
        timestamp: new Date().toISOString(),
      });
      throw new ApiError(
        errorData.message || 'Failed to save MCP servers',
        response.status,
        response
      );
    }
  },
};

// Profiles API
export const profilesApi = {
  load: async (): Promise<{ content: string; path: string }> => {
    const response = await makeRequest('/api/profiles');
    return handleApiResponse<{ content: string; path: string }>(response);
  },
  save: async (content: string): Promise<string> => {
    const response = await makeRequest('/api/profiles', {
      method: 'PUT',
      body: content,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return handleApiResponse<string>(response);
  },
};

// Images API
export const imagesApi = {
  upload: async (file: File): Promise<ImageResponse> => {
    const formData = new FormData();
    formData.append('image', file);

    const headers = await buildAuthHeaders();

    const response = await fetch('/api/images/upload', {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        `Failed to upload image: ${errorText}`,
        response.status,
        response
      );
    }

    return handleApiResponse<ImageResponse>(response);
  },

  uploadForTask: async (taskId: string, file: File): Promise<ImageResponse> => {
    const formData = new FormData();
    formData.append('image', file);

    const headers = await buildAuthHeaders();

    const response = await fetch(`/api/images/task/${taskId}/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new ApiError(
        `Failed to upload image: ${errorText}`,
        response.status,
        response
      );
    }

    return handleApiResponse<ImageResponse>(response);
  },

  delete: async (imageId: string): Promise<void> => {
    const response = await makeRequest(`/api/images/${imageId}`, {
      method: 'DELETE',
    });
    return handleApiResponse<void>(response);
  },

  getTaskImages: async (taskId: string): Promise<ImageResponse[]> => {
    const response = await makeRequest(`/api/images/task/${taskId}`);
    return handleApiResponse<ImageResponse[]>(response);
  },

  getImageUrl: (imageId: string): string => {
    return `/api/images/${imageId}/file`;
  },
};

// Approval API
export const approvalsApi = {
  respond: async (
    approvalId: string,
    payload: ApprovalResponse,
    signal?: AbortSignal
  ): Promise<ApprovalStatus> => {
    const res = await makeRequest(`/api/approvals/${approvalId}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    });

    return handleApiResponse<ApprovalStatus>(res);
  },
};
