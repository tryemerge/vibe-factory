import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { agentsApi } from '@/lib/api';
import type { Agent, ContextFile, CreateAgent, UpdateAgent } from 'shared/types';
import NiceModal, { useModal } from '@ebay/nice-modal-react';

export interface AgentFormDialogProps {
  agent?: Agent | null;
}

const EXECUTOR_TYPES = [
  'CLAUDE_CODE',
  'GEMINI',
  'AMP',
  'CODEX',
  'OPENCODE',
  'CURSOR_AGENT',
  'QWEN_CODE',
  'COPILOT',
];

export const AgentFormDialog = NiceModal.create<AgentFormDialogProps>(
  ({ agent }) => {
    const modal = useModal();
    const queryClient = useQueryClient();
    const isEditMode = Boolean(agent);

    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [executor, setExecutor] = useState('CLAUDE_CODE');
    const [description, setDescription] = useState('');
    const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);

    useEffect(() => {
      if (agent) {
        setName(agent.name);
        setRole(agent.role);
        setSystemPrompt(agent.system_prompt);
        setExecutor(agent.executor);
        setDescription(agent.description || '');

        if (agent.context_files) {
          try {
            const parsed = JSON.parse(agent.context_files);
            setContextFiles(parsed || []);
          } catch (e) {
            console.error('Failed to parse context files:', e);
            setContextFiles([]);
          }
        }
      } else {
        // Reset for create mode
        setName('');
        setRole('');
        setSystemPrompt('');
        setExecutor('CLAUDE_CODE');
        setDescription('');
        setContextFiles([]);
      }
    }, [agent, modal.visible]);

    const createMutation = useMutation({
      mutationFn: (data: CreateAgent) => agentsApi.create(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['agents'] });
        modal.hide();
      },
    });

    const updateMutation = useMutation({
      mutationFn: ({ id, data }: { id: string; data: UpdateAgent }) =>
        agentsApi.update(id, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['agents'] });
        modal.hide();
      },
    });

    const handleAddContextFile = () => {
      setContextFiles([...contextFiles, { pattern: '', instruction: null }]);
    };

    const handleRemoveContextFile = (index: number) => {
      setContextFiles(contextFiles.filter((_, i) => i !== index));
    };

    const handleContextFileChange = (
      index: number,
      field: 'pattern' | 'instruction',
      value: string
    ) => {
      const updated = [...contextFiles];
      if (field === 'instruction') {
        updated[index].instruction = value || null;
      } else {
        updated[index].pattern = value;
      }
      setContextFiles(updated);
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!name.trim() || !role.trim() || !systemPrompt.trim()) {
        return;
      }

      const data = {
        name: name.trim(),
        role: role.trim(),
        system_prompt: systemPrompt.trim(),
        executor: executor || null,
        description: description.trim() || null,
        context_files: contextFiles.length > 0 ? contextFiles : null,
        capabilities: null,
        tools: null,
      };

      if (isEditMode && agent) {
        await updateMutation.mutateAsync({ id: agent.id, data });
      } else {
        await createMutation.mutateAsync(data);
      }
    };

    const isSubmitting = createMutation.isPending || updateMutation.isPending;

    return (
      <Dialog open={modal.visible} onOpenChange={(open) => !open && modal.hide()}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? 'Edit Agent' : 'Create New Agent'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-sm font-medium">
                Name *
              </Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Backend Specialist"
                className="mt-1.5"
                disabled={isSubmitting}
                required
              />
            </div>

            <div>
              <Label htmlFor="role" className="text-sm font-medium">
                Role *
              </Label>
              <Input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g., backend, frontend, fullstack"
                className="mt-1.5"
                disabled={isSubmitting}
                required
              />
            </div>

            <div>
              <Label htmlFor="executor" className="text-sm font-medium">
                Executor *
              </Label>
              <Select
                value={executor}
                onValueChange={setExecutor}
                disabled={isSubmitting}
              >
                <SelectTrigger className="mt-1.5" id="executor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXECUTOR_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="system-prompt" className="text-sm font-medium">
                System Prompt *
              </Label>
              <Textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are an expert backend developer specializing in..."
                className="mt-1.5 min-h-[100px]"
                disabled={isSubmitting}
                required
              />
            </div>

            <div>
              <Label htmlFor="description" className="text-sm font-medium">
                Description
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of this agent's purpose"
                className="mt-1.5"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Context Files</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddContextFile}
                  disabled={isSubmitting}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Context File
                </Button>
              </div>

              {contextFiles.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4 border rounded-md bg-muted/50">
                  No context files configured. Click "Add Context File" to add file
                  patterns.
                </div>
              ) : (
                <div className="space-y-3">
                  {contextFiles.map((file, index) => (
                    <div
                      key={index}
                      className="border rounded-lg p-3 space-y-2 bg-muted/30"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">
                            Pattern (glob)
                          </Label>
                          <Input
                            value={file.pattern}
                            onChange={(e) =>
                              handleContextFileChange(
                                index,
                                'pattern',
                                e.target.value
                              )
                            }
                            placeholder="e.g., crates/**/*.rs, src/**/*.tsx"
                            className="mt-1"
                            disabled={isSubmitting}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-5"
                          onClick={() => handleRemoveContextFile(index)}
                          disabled={isSubmitting}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Instruction (optional)
                        </Label>
                        <Input
                          value={file.instruction || ''}
                          onChange={(e) =>
                            handleContextFileChange(
                              index,
                              'instruction',
                              e.target.value
                            )
                          }
                          placeholder="How should the agent use these files?"
                          className="mt-1"
                          disabled={isSubmitting}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => modal.hide()}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? isEditMode
                    ? 'Updating...'
                    : 'Creating...'
                  : isEditMode
                  ? 'Update Agent'
                  : 'Create Agent'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    );
  }
);
