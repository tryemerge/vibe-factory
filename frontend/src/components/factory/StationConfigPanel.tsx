import { useEffect, useState } from 'react';
import { WorkflowStation, Agent } from 'shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { X, Save, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StationConfigPanelProps {
  station: WorkflowStation | null;
  agents: Agent[];
  onUpdate: (stationId: string, updates: Partial<WorkflowStation>) => void;
  onDelete: (stationId: string) => void;
  onClose: () => void;
  className?: string;
}

export function StationConfigPanel({
  station,
  agents,
  onUpdate,
  onDelete,
  onClose,
  className,
}: StationConfigPanelProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [agentId, setAgentId] = useState<string>('');
  const [stationPrompt, setStationPrompt] = useState('');
  const [outputContextKeys, setOutputContextKeys] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Load station data when it changes
  useEffect(() => {
    if (station) {
      setName(station.name);
      setDescription(station.description || '');
      setAgentId(station.agent_id || '');
      setStationPrompt(station.station_prompt || '');
      setOutputContextKeys(station.output_context_keys || '');
      setHasChanges(false);
    }
  }, [station]);

  // Mark changes
  useEffect(() => {
    if (!station) return;

    const changed =
      name !== station.name ||
      description !== (station.description || '') ||
      agentId !== (station.agent_id || '') ||
      stationPrompt !== (station.station_prompt || '') ||
      outputContextKeys !== (station.output_context_keys || '');

    setHasChanges(changed);
  }, [name, description, agentId, stationPrompt, outputContextKeys, station]);

  const handleSave = () => {
    if (!station) return;

    onUpdate(station.id, {
      name,
      description: description || null,
      agent_id: agentId || null,
      station_prompt: stationPrompt || null,
      output_context_keys: outputContextKeys || null,
    });
    setHasChanges(false);
  };

  const handleDelete = () => {
    if (!station) return;
    if (confirm(`Delete station "${station.name}"?`)) {
      onDelete(station.id);
      onClose();
    }
  };

  if (!station) {
    return (
      <div
        className={cn(
          'w-80 border-l bg-muted/30 flex items-center justify-center',
          className
        )}
      >
        <div className="text-center text-sm text-muted-foreground p-4">
          Select a station to configure
        </div>
      </div>
    );
  }

  const selectedAgent = agents.find((a) => a.id === agentId);

  return (
    <div className={cn('w-80 border-l bg-card flex flex-col', className)}>
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <h2 className="font-semibold text-sm">Station Configuration</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="station-name">Station Name</Label>
          <Input
            id="station-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Design Review"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="station-description">Description</Label>
          <Textarea
            id="station-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this station does..."
            rows={3}
          />
        </div>

        {/* Agent Selection */}
        <div className="space-y-2">
          <Label htmlFor="station-agent">Agent</Label>
          <Select value={agentId} onValueChange={setAgentId}>
            <SelectTrigger id="station-agent">
              <SelectValue placeholder="Select an agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No Agent</SelectItem>
              {agents.map((agent) => (
                <SelectItem key={agent.id} value={agent.id}>
                  {agent.name} - {agent.role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedAgent && (
            <p className="text-xs text-muted-foreground">
              {selectedAgent.description}
            </p>
          )}
        </div>

        {/* Station Prompt */}
        <div className="space-y-2">
          <Label htmlFor="station-prompt">Station Prompt</Label>
          <Textarea
            id="station-prompt"
            value={stationPrompt}
            onChange={(e) => setStationPrompt(e.target.value)}
            placeholder="Additional instructions for this station's agent..."
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Custom instructions that will be added to the agent's prompt when
            executing this station.
          </p>
        </div>

        {/* Output Context Keys */}
        <div className="space-y-2">
          <Label htmlFor="output-context">Output Context Keys</Label>
          <Input
            id="output-context"
            value={outputContextKeys}
            onChange={(e) => setOutputContextKeys(e.target.value)}
            placeholder='["design_doc", "api_spec"]'
          />
          <p className="text-xs text-muted-foreground">
            JSON array of context keys this station will produce (e.g., files,
            decisions, artifacts).
          </p>
        </div>

        {/* Position Info */}
        <div className="pt-4 border-t space-y-2">
          <div className="text-xs text-muted-foreground">
            <div>Position: {String(station.position)}</div>
            <div>
              Coordinates: ({station.x_position.toFixed(0)},{' '}
              {station.y_position.toFixed(0)})
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 border-t flex items-center gap-2">
        <Button
          onClick={handleSave}
          disabled={!hasChanges}
          className="flex-1"
          size="sm"
        >
          <Save className="h-4 w-4 mr-1" />
          Save Changes
        </Button>
        <Button
          onClick={handleDelete}
          variant="destructive"
          size="sm"
          className="px-2"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
