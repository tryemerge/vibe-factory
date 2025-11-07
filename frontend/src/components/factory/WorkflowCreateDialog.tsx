import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import type { CreateWorkflow } from 'shared/types';

export interface WorkflowCreateDialogProps {
  projectId: string;
  onSave: (data: CreateWorkflow) => Promise<void>;
}

export const WorkflowCreateDialog = NiceModal.create<WorkflowCreateDialogProps>(
  ({ projectId, onSave }) => {
    const modal = useModal();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
      // Validate name
      if (!name.trim()) {
        setError('Workflow name is required');
        return;
      }

      setIsSaving(true);
      setError(null);

      try {
        await onSave({
          project_id: projectId,
          name: name.trim(),
          description: description.trim() || null,
        });
        modal.resolve();
        modal.hide();
      } catch (err) {
        console.error('Failed to create workflow:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to create workflow'
        );
      } finally {
        setIsSaving(false);
      }
    };

    const handleCancel = () => {
      modal.resolve();
      modal.hide();
    };

    return (
      <Dialog open={modal.visible} onOpenChange={() => handleCancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Workflow</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Workflow Name */}
            <div>
              <Label htmlFor="workflow-name" className="text-sm font-medium">
                Workflow Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="workflow-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="e.g., Code Review Process"
                disabled={isSaving}
                className={error ? 'border-destructive mt-1.5' : 'mt-1.5'}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSave();
                  }
                }}
              />
              {error && (
                <p className="text-sm text-destructive mt-1">{error}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <Label
                htmlFor="workflow-description"
                className="text-sm font-medium"
              >
                Description
              </Label>
              <Textarea
                id="workflow-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what this workflow does..."
                disabled={isSaving}
                className="mt-1.5 min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional description to help identify this workflow
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Creating...' : 'Create Workflow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
