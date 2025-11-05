import { useMemo, useState } from 'react';
import { Agent } from 'shared/types';
import { Input } from '@/components/ui/input';
import { Search, Bot, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface AgentPaletteProps {
  agents: Agent[];
  onCreateAgent?: () => void;
  className?: string;
}

export interface AgentPaletteItemProps {
  agent: Agent;
}

function AgentPaletteItem({ agent }: AgentPaletteItemProps) {
  const onDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData('application/vibe-agent', agent.id);
    event.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'group relative p-3 rounded-md border bg-card cursor-grab active:cursor-grabbing',
        'hover:bg-accent hover:border-accent-foreground/20 transition-colors',
        'touch-none select-none'
      )}
    >
      <div className="flex items-start gap-2">
        <div className="shrink-0 mt-0.5">
          <Bot className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{agent.name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {agent.role}
          </div>
          {agent.description && (
            <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {agent.description}
            </div>
          )}
        </div>
      </div>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded border">
          Drag to canvas
        </div>
      </div>
    </div>
  );
}

export function AgentPalette({
  agents,
  onCreateAgent,
  className,
}: AgentPaletteProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) return agents;

    const query = searchQuery.toLowerCase();
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.role.toLowerCase().includes(query) ||
        agent.description?.toLowerCase().includes(query)
    );
  }, [agents, searchQuery]);

  return (
    <TooltipProvider>
      <div
        className={cn(
          'w-64 border-r bg-muted/30 flex flex-col shrink-0',
          className
        )}
      >
        {/* Header */}
        <div className="p-3 border-b bg-card flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">Agent Palette</h2>
            <p className="text-xs text-muted-foreground">
              {agents.length} agents
            </p>
          </div>
          {onCreateAgent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onCreateAgent}
                  className="h-7 w-7"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Create New Agent</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Search */}
        <div className="p-2 border-b bg-card">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search agents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>

        {/* Agent List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {filteredAgents.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground p-4">
              {searchQuery.trim()
                ? 'No agents found'
                : 'No agents available'}
            </div>
          ) : (
            filteredAgents.map((agent) => (
              <AgentPaletteItem key={agent.id} agent={agent} />
            ))
          )}
        </div>

        {/* Help Text */}
        <div className="p-3 border-t bg-card text-xs text-muted-foreground">
          Drag agents onto the canvas to create workflow stations
        </div>
      </div>
    </TooltipProvider>
  );
}
