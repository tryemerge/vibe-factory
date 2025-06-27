import { useState, useEffect } from 'react';
import { makeRequest } from '@/lib/api';
import type { ApiResponse, Project, ExecutionProcessSummary } from 'shared/types';

export function useProjectsWithDevServers() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDevServers, setProjectDevServers] = useState<Map<string, ExecutionProcessSummary[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const fetchProjects = async () => {
    try {
      const response = await makeRequest('/api/projects');
      const data: ApiResponse<Project[]> = await response.json();
      if (data.success && data.data) {
        setProjects(data.data);
        return data.data;
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    }
    return [];
  };

  const fetchProjectDevServers = async (projects: Project[]) => {
    const devServerMap = new Map<string, ExecutionProcessSummary[]>();
    
    // Fetch dev servers for each project
    await Promise.all(
      projects.map(async (project) => {
        try {
          const response = await makeRequest(`/api/projects/${project.id}/running-dev-servers`);
          if (response.ok) {
            const result: ApiResponse<ExecutionProcessSummary[]> = await response.json();
            if (result.success && result.data) {
              devServerMap.set(project.id, result.data);
            }
          }
        } catch (error) {
          console.error(`Failed to fetch dev servers for project ${project.id}:`, error);
        }
      })
    );
    
    setProjectDevServers(devServerMap);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const projectsData = await fetchProjects();
      if (projectsData.length > 0) {
        await fetchProjectDevServers(projectsData);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    
    // Poll for updates every 10 seconds
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, []);

  // Function to check if a project has running dev servers
  const hasRunningDevServers = (projectId: string): boolean => {
    const devServers = projectDevServers.get(projectId);
    return Boolean(devServers && devServers.length > 0);
  };

  // Get running dev servers count for a project
  const getRunningDevServersCount = (projectId: string): number => {
    const devServers = projectDevServers.get(projectId);
    return devServers ? devServers.length : 0;
  };

  return {
    projects,
    projectDevServers,
    hasRunningDevServers,
    getRunningDevServersCount,
    loading,
    refetch: fetchAll,
  };
}
