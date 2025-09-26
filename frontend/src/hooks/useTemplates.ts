import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { templatesApi } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/queryKeys';

interface UseTemplatesOptions {
  includeProject?: boolean;
  includeGlobal?: boolean;
  enabled?: boolean;
}

export function useTemplates(
  projectId?: string,
  options: UseTemplatesOptions = {}
) {
  const {
    includeProject = true,
    includeGlobal = true,
    enabled = true,
  } = options;

  const queries = useQueries({
    queries: [
      {
        queryKey: QUERY_KEYS.projectTemplates(projectId!),
        queryFn: () => templatesApi.listByProject(projectId!),
        enabled: enabled && includeProject && !!projectId,
        staleTime: 60000, // Templates don't change frequently
      },
      {
        queryKey: QUERY_KEYS.globalTemplates(),
        queryFn: () => templatesApi.listGlobal(),
        enabled: enabled && includeGlobal,
        staleTime: 60000, // Templates don't change frequently
      },
    ],
  });

  const [projectQuery, globalQuery] = queries;

  // Combine templates with project templates first (existing logic)
  const templates = useMemo(() => {
    const projectTemplates = projectQuery.data || [];
    const globalTemplates = globalQuery.data || [];

    if (includeProject && includeGlobal) {
      return [...projectTemplates, ...globalTemplates];
    } else if (includeProject) {
      return projectTemplates;
    } else if (includeGlobal) {
      return globalTemplates;
    }
    return [];
  }, [projectQuery.data, globalQuery.data, includeProject, includeGlobal]);

  const isLoading =
    (includeProject && projectQuery.isLoading) ||
    (includeGlobal && globalQuery.isLoading);

  const error = projectQuery.error || globalQuery.error;

  return {
    templates,
    loading: isLoading,
    error: error as Error | null,
    refetch: () => {
      const promises = [];
      if (includeProject && projectQuery.refetch)
        promises.push(projectQuery.refetch());
      if (includeGlobal && globalQuery.refetch)
        promises.push(globalQuery.refetch());
      return Promise.all(promises);
    },
  };
}
