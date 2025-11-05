import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useDraggable } from '@dnd-kit/core';
import { Bot, Plus, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { agentsApi } from '@/lib/api';
import type { Agent } from 'shared/types';
import { cn } from '@/lib/utils';

interface AgentPaletteProps {
  className?: string;
}

interface DraggableAgentCardProps {
  agent: Agent;
}

function DraggableAgentCard({ agent }: DraggableAgentCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `agent-${agent.id}`,
    data: {
      type: 'agent',
      agent,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'p-3 border rounded-lg cursor-grab active:cursor-grabbing',
        'hover:shadow-md transition-all',
        'bg-background',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h4 className="font-medium text-sm line-clamp-1">{agent.name}</h4>
          </div>
          <Badge variant="secondary" className="text-xs shrink-0">
            {agent.executor}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {agent.role}
        </p>
      </div>
    </div>
  );
}

export function AgentPalette({ className }: AgentPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
  });

  // Filter agents based on search query
  const filteredAgents = useMemo(() => {
    if (!agents) return [];
    if (!searchQuery.trim()) return agents;

    const query = searchQuery.toLowerCase();
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.role.toLowerCase().includes(query) ||
        agent.executor.toLowerCase().includes(query) ||
        (agent.description && agent.description.toLowerCase().includes(query))
    );
  }, [agents, searchQuery]);

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Agent Palette
          </span>
          <Link to="/agents">
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              New
            </Button>
          </Link>
        </CardTitle>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search agents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-8 h-9"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            Loading agents...
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className="text-center space-y-4 py-8">
            {searchQuery ? (
              <>
                <p className="text-sm text-muted-foreground">
                  No agents match "{searchQuery}"
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                >
                  Clear search
                </Button>
              </>
            ) : (
              <>
                <Bot className="h-8 w-8 mx-auto text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">No agents yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create your first agent to get started
                  </p>
                </div>
                <Link to="/agents">
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Agent
                  </Button>
                </Link>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAgents.map((agent) => (
              <DraggableAgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
