import { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { WorkflowStation, UpdateWorkflowStation } from 'shared/types';
import { useWorkflowStations } from '@/hooks/useWorkflowStations';
import { AgentSelector } from '@/components/agents/AgentSelector';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NewCardContent, NewCardHeader } from '@/components/ui/new-card';

interface StationConfigPanelProps {
  station: WorkflowStation | null;
  isOpen: boolean;
  onClose: () => void;
}

export function StationConfigPanel({
  station,
  isOpen,
  onClose,
}: StationConfigPanelProps) {
  const { updateStation, deleteStation, isSaving } = useWorkflowStations({
    workflowId: station?.workflow_id,
    onSaveSuccess: () => onClose(),
    onSaveError: (error) => {
      console.error('Failed to save station:', error);
      alert(`Failed to save station: ${error}`);
    },
  });

  // Form state
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState<string | null>(null);
  const [stationPrompt, setStationPrompt] = useState('');
  const [outputContextKeys, setOutputContextKeys] = useState('');
  const [xPosition, setXPosition] = useState('0');
  const [yPosition, setYPosition] = useState('0');
  const [isTerminator, setIsTerminator] = useState(false);

  // Validation state
  const [errors, setErrors] = useState<{
    name?: string;
    xPosition?: string;
    yPosition?: string;
  }>({});

  // Load station data when it changes
  useEffect(() => {
    if (station) {
      setName(station.name || '');
      setAgentId(station.agent_id);
      setStationPrompt(station.station_prompt || '');
      setOutputContextKeys(station.output_context_keys || '');
      setXPosition(String(station.x_position || 0));
      setYPosition(String(station.y_position || 0));
      setIsTerminator(station.is_terminator || false);
      setErrors({});
    }
  }, [station]);

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (!name.trim()) {
      newErrors.name = 'Station name is required';
    }

    const x = parseFloat(xPosition);
    if (isNaN(x)) {
      newErrors.xPosition = 'X position must be a valid number';
    }

    const y = parseFloat(yPosition);
    if (isNaN(y)) {
      newErrors.yPosition = 'Y position must be a valid number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle save
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !station) {
      return;
    }

    const data: UpdateWorkflowStation = {
      name: name.trim(),
      position: null, // Position in workflow sequence (not changed here)
      description: null, // Description field (not in this form)
      x_position: parseFloat(xPosition),
      y_position: parseFloat(yPosition),
      agent_id: agentId,
      station_prompt: stationPrompt.trim() || null,
      output_context_keys: outputContextKeys.trim() || null,
      is_terminator: isTerminator,
    };

    updateStation({ id: station.id, data });
  };

  // Handle remove
  const handleRemove = () => {
    if (!station) return;

    if (
      confirm(
        `Are you sure you want to delete station "${station.name}"? This action cannot be undone.`
      )
    ) {
      deleteStation(station.id);
    }
  };

  if (!isOpen || !station) {
    return null;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          'fixed inset-y-0 right-0 w-full md:w-[500px] z-50',
          'bg-background border-l shadow-xl',
          'transform transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <NewCardHeader
            actions={
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                disabled={isSaving}
              >
                <X className="h-4 w-4" />
              </Button>
            }
          >
            <h2 className="text-lg font-semibold">Configure Station</h2>
          </NewCardHeader>

          {/* Form */}
          <NewCardContent className="flex-1 overflow-y-auto">
            <form onSubmit={handleSave} className="p-4 space-y-4">
              {/* Station Name */}
              <div>
                <Label htmlFor="station-name" className="text-sm font-medium">
                  Station Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="station-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Code Review"
                  disabled={isSaving}
                  className={
                    errors.name ? 'border-destructive mt-1.5' : 'mt-1.5'
                  }
                />
                {errors.name && (
                  <p className="text-sm text-destructive mt-1">{errors.name}</p>
                )}
              </div>

              {/* Agent Selector */}
              <AgentSelector
                value={agentId}
                onChange={setAgentId}
                disabled={isSaving}
                label="Agent"
                placeholder="Select agent (optional)"
                allowNull={true}
              />

              {/* Station Prompt */}
              <div>
                <Label htmlFor="station-prompt" className="text-sm font-medium">
                  Station Prompt
                </Label>
                <Textarea
                  id="station-prompt"
                  value={stationPrompt}
                  onChange={(e) => setStationPrompt(e.target.value)}
                  placeholder="Enter instructions for this station..."
                  disabled={isSaving}
                  className="mt-1.5 min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Instructions that will be provided to the agent at this
                  station
                </p>
              </div>

              {/* Output Context Keys */}
              <div>
                <Label
                  htmlFor="output-context-keys"
                  className="text-sm font-medium"
                >
                  Output Context Keys
                </Label>
                <Input
                  id="output-context-keys"
                  value={outputContextKeys}
                  onChange={(e) => setOutputContextKeys(e.target.value)}
                  placeholder="e.g., review_result, code_quality_score"
                  disabled={isSaving}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Comma-separated keys for data this station produces
                </p>
              </div>

              {/* Terminator Status */}
              <div className="flex items-start gap-3 p-3 border rounded-md bg-muted/30">
                <input
                  id="is-terminator"
                  type="checkbox"
                  checked={isTerminator}
                  onChange={(e) => setIsTerminator(e.target.checked)}
                  disabled={isSaving}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <div className="flex-1">
                  <Label htmlFor="is-terminator" className="text-sm font-medium cursor-pointer">
                    Workflow Terminator
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mark this station as a workflow terminator. When execution reaches this station,
                    it can trigger final actions like PR creation or workflow completion.
                  </p>
                </div>
              </div>

              {/* Position Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="x-position" className="text-sm font-medium">
                    X Position <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="x-position"
                    type="number"
                    step="any"
                    value={xPosition}
                    onChange={(e) => setXPosition(e.target.value)}
                    placeholder="0"
                    disabled={isSaving}
                    className={
                      errors.xPosition ? 'border-destructive mt-1.5' : 'mt-1.5'
                    }
                  />
                  {errors.xPosition && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.xPosition}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="y-position" className="text-sm font-medium">
                    Y Position <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="y-position"
                    type="number"
                    step="any"
                    value={yPosition}
                    onChange={(e) => setYPosition(e.target.value)}
                    placeholder="0"
                    disabled={isSaving}
                    className={
                      errors.yPosition ? 'border-destructive mt-1.5' : 'mt-1.5'
                    }
                  />
                  {errors.yPosition && (
                    <p className="text-sm text-destructive mt-1">
                      {errors.yPosition}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={isSaving} className="flex-1">
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleRemove}
                  disabled={isSaving}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isSaving ? 'Removing...' : 'Remove'}
                </Button>
              </div>
            </form>
          </NewCardContent>
        </div>
      </div>
    </>
  );
}
