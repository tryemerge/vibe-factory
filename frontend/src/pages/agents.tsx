import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { agentsApi } from '@/lib/api';
import type { Agent } from 'shared/types';
import { showModal } from '@/lib/modals';

export function AgentsPage() {
  const queryClient = useQueryClient();

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
  });

  const deleteMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.delete(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const handleCreateAgent = async () => {
    await showModal('agent-form', {});
  };

  const handleEditAgent = async (agent: Agent) => {
    await showModal('agent-form', { agent });
  };

  const handleDeleteAgent = async (agent: Agent) => {
    if (confirm(`Delete agent "${agent.name}"?`)) {
      await deleteMutation.mutateAsync(agent.id);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center text-muted-foreground">
          Loading agents...
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Factory Floor Agents</h1>
          <p className="text-muted-foreground mt-2">
            Configure specialized agents with custom context and executors
          </p>
        </div>
        <Button onClick={handleCreateAgent}>
          <Plus className="h-4 w-4 mr-2" />
          Create Agent
        </Button>
      </div>

      {agents && agents.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center space-y-4">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold">No agents yet</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first agent to get started
                </p>
              </div>
              <Button onClick={handleCreateAgent}>
                <Plus className="h-4 w-4 mr-2" />
                Create Agent
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents?.map((agent) => (
            <Card key={agent.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    <CardDescription className="line-clamp-1">
                      {agent.role}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="ml-2">
                    {agent.executor}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {agent.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {agent.description}
                  </p>
                )}

                {agent.system_prompt && (
                  <div className="text-xs space-y-1">
                    <div className="font-medium text-muted-foreground">
                      System Prompt
                    </div>
                    <div className="bg-muted p-2 rounded text-muted-foreground line-clamp-3">
                      {agent.system_prompt}
                    </div>
                  </div>
                )}

                {agent.context_files && (
                  <div className="text-xs">
                    <span className="font-medium text-muted-foreground">
                      Context Files:{' '}
                    </span>
                    <span className="text-muted-foreground">
                      {JSON.parse(agent.context_files).length} configured
                    </span>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEditAgent(agent)}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteAgent(agent)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
