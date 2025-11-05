import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import type {
  StationTransition,
  WorkflowStation,
  CreateStationTransition,
  UpdateStationTransition,
} from 'shared/types';

// Condition types available for transitions
const CONDITION_TYPES = [
  { value: 'always', label: 'Always' },
  { value: 'on_approval', label: 'On Approval' },
  { value: 'on_rejection', label: 'On Rejection' },
  { value: 'on_tests_pass', label: 'On Tests Pass' },
  { value: 'on_tests_fail', label: 'On Tests Fail' },
] as const;

export interface TransitionConfigDialogProps {
  transition?: StationTransition | null; // For editing existing transition
  sourceStation: WorkflowStation;
  targetStation: WorkflowStation;
  onSave: (
    data: CreateStationTransition | UpdateStationTransition
  ) => Promise<void>;
  onRemove?: () => Promise<void>; // Only available when editing existing transition
}

export const TransitionConfigDialog =
  NiceModal.create<TransitionConfigDialogProps>(
    ({ transition, sourceStation, targetStation, onSave, onRemove }) => {
      const modal = useModal();
      const [label, setLabel] = useState('');
      const [conditionType, setConditionType] = useState<string>('always');
      const [conditionValue, setConditionValue] = useState('');
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [isRemoving, setIsRemoving] = useState(false);
      const [jsonError, setJsonError] = useState<string | null>(null);

      const isEditMode = Boolean(transition);

      // Check if this transition creates a loopback (target station comes before source in workflow order)
      const isLoopback = targetStation.position < sourceStation.position;

      useEffect(() => {
        if (transition) {
          // Edit mode - populate with existing transition data
          setLabel(transition.label || '');
          setConditionType(transition.condition_type || 'always');
          setConditionValue(transition.condition_value || '');
        } else {
          // Create mode - reset to defaults
          setLabel('');
          setConditionType('always');
          setConditionValue('');
        }
        setJsonError(null);
      }, [transition, modal.visible]);

      // Validate JSON when condition value changes
      const validateConditionValue = useCallback((value: string) => {
        if (!value.trim()) {
          setJsonError(null);
          return true;
        }

        try {
          JSON.parse(value);
          setJsonError(null);
          return true;
        } catch (e) {
          setJsonError(e instanceof Error ? e.message : 'Invalid JSON format');
          return false;
        }
      }, []);

      const handleConditionValueChange = useCallback(
        (value: string) => {
          setConditionValue(value);
          validateConditionValue(value);
        },
        [validateConditionValue]
      );

      const handleSubmit = useCallback(async () => {
        if (isSubmitting) return;

        // Validate JSON before submitting
        if (conditionValue.trim() && !validateConditionValue(conditionValue)) {
          return;
        }

        setIsSubmitting(true);
        try {
          if (isEditMode && transition) {
            // Update existing transition
            const updateData: UpdateStationTransition = {
              condition: null, // Deprecated field
              label: label.trim() || null,
              condition_type: conditionType || null,
              condition_value: conditionValue.trim() || null,
            };
            await onSave(updateData);
          } else {
            // Create new transition
            const createData: CreateStationTransition = {
              workflow_id: sourceStation.workflow_id,
              source_station_id: sourceStation.id,
              target_station_id: targetStation.id,
              condition: null, // Deprecated field
              label: label.trim() || null,
              condition_type: conditionType || null,
              condition_value: conditionValue.trim() || null,
            };
            await onSave(createData);
          }
          modal.hide();
        } catch (error) {
          console.error('Failed to save transition:', error);
        } finally {
          setIsSubmitting(false);
        }
      }, [
        isSubmitting,
        isEditMode,
        transition,
        label,
        conditionType,
        conditionValue,
        sourceStation,
        targetStation,
        onSave,
        modal,
        validateConditionValue,
      ]);

      const handleRemove = useCallback(async () => {
        if (!onRemove || isRemoving) return;

        setIsRemoving(true);
        try {
          await onRemove();
          modal.hide();
        } catch (error) {
          console.error('Failed to remove transition:', error);
        } finally {
          setIsRemoving(false);
        }
      }, [onRemove, isRemoving, modal]);

      return (
        <Dialog
          open={modal.visible}
          onOpenChange={(open) => !open && modal.hide()}
        >
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>
                {isEditMode ? 'Edit Transition' : 'Create Transition'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Station Info */}
              <div className="rounded-md bg-muted p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{sourceStation.name}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{targetStation.name}</span>
                </div>
              </div>

              {/* Loopback Warning */}
              {isLoopback && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Warning: This transition creates a loopback. The target
                    station "{targetStation.name}" (position{' '}
                    {Number(targetStation.position)}) comes before the source
                    station "{sourceStation.name}" (position{' '}
                    {Number(sourceStation.position)}) in the workflow order.
                    This may cause tasks to repeat stations.
                  </AlertDescription>
                </Alert>
              )}

              {/* Label Input */}
              <div>
                <Label
                  htmlFor="transition-label"
                  className="text-sm font-medium"
                >
                  Label
                </Label>
                <Input
                  id="transition-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g., 'Approved', 'Tests Passed' (optional)"
                  className="mt-1.5"
                  disabled={isSubmitting || isRemoving}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Optional label to display on the transition arrow
                </p>
              </div>

              {/* Condition Type Dropdown */}
              <div>
                <Label htmlFor="condition-type" className="text-sm font-medium">
                  Condition Type
                </Label>
                <Select
                  value={conditionType}
                  onValueChange={setConditionType}
                  disabled={isSubmitting || isRemoving}
                >
                  <SelectTrigger className="mt-1.5" id="condition-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Determines when this transition should be taken
                </p>
              </div>

              {/* Condition Value JSON Textarea */}
              <div>
                <Label
                  htmlFor="condition-value"
                  className="text-sm font-medium"
                >
                  Condition Value (JSON)
                </Label>
                <Textarea
                  id="condition-value"
                  value={conditionValue}
                  onChange={(e) => handleConditionValueChange(e.target.value)}
                  placeholder='{"key": "value"}'
                  className={`mt-1.5 font-mono text-sm ${jsonError ? 'border-destructive' : ''}`}
                  rows={4}
                  disabled={isSubmitting || isRemoving}
                />
                {jsonError ? (
                  <p className="text-xs text-destructive mt-1">{jsonError}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Optional JSON expression for complex conditional logic
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
                <div>
                  {isEditMode && onRemove && (
                    <Button
                      variant="destructive"
                      onClick={handleRemove}
                      disabled={isSubmitting || isRemoving}
                    >
                      {isRemoving ? 'Removing...' : 'Remove Transition'}
                    </Button>
                  )}
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    onClick={() => modal.hide()}
                    disabled={isSubmitting || isRemoving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || isRemoving || !!jsonError}
                  >
                    {isSubmitting
                      ? isEditMode
                        ? 'Updating...'
                        : 'Creating...'
                      : isEditMode
                        ? 'Update Transition'
                        : 'Create Transition'}
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      );
    }
  );
