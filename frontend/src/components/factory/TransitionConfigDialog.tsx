import { useEffect, useState } from 'react';
import { StationTransition } from 'shared/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
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
import { Save, Trash2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface TransitionConfigDialogProps {
  transition: StationTransition | null;
  sourceStationName?: string;
  targetStationName?: string;
  open: boolean;
  onUpdate: (
    transitionId: string,
    updates: Partial<StationTransition>
  ) => void;
  onDelete: (transitionId: string) => void;
  onClose: () => void;
}

const CONDITION_TYPES = [
  { value: 'always', label: 'Always', description: 'Always follow this path' },
  {
    value: 'success',
    label: 'On Success',
    description: 'Only when station completes successfully',
  },
  {
    value: 'failure',
    label: 'On Failure',
    description: 'Only when station fails',
  },
  {
    value: 'conditional',
    label: 'Conditional',
    description: 'Based on custom condition',
  },
];

export function TransitionConfigDialog({
  transition,
  sourceStationName,
  targetStationName,
  open,
  onUpdate,
  onDelete,
  onClose,
}: TransitionConfigDialogProps) {
  const [label, setLabel] = useState('');
  const [conditionType, setConditionType] = useState('always');
  const [conditionValue, setConditionValue] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  // Load transition data when it changes
  useEffect(() => {
    if (transition) {
      setLabel(transition.label || '');
      setConditionType(transition.condition_type || 'always');
      setConditionValue(transition.condition_value || '');
      setHasChanges(false);
    }
  }, [transition]);

  // Mark changes
  useEffect(() => {
    if (!transition) return;

    const changed =
      label !== (transition.label || '') ||
      conditionType !== (transition.condition_type || 'always') ||
      conditionValue !== (transition.condition_value || '');

    setHasChanges(changed);
  }, [label, conditionType, conditionValue, transition]);

  const handleSave = () => {
    if (!transition) return;

    onUpdate(transition.id, {
      label: label || null,
      condition_type: conditionType || null,
      condition_value: conditionValue || null,
    });
    setHasChanges(false);
    onClose();
  };

  const handleDelete = () => {
    if (!transition) return;
    if (
      confirm(
        `Delete transition from "${sourceStationName}" to "${targetStationName}"?`
      )
    ) {
      onDelete(transition.id);
      onClose();
    }
  };

  const selectedCondition = CONDITION_TYPES.find(
    (c) => c.value === conditionType
  );

  const isLoopback =
    transition &&
    transition.source_station_id === transition.target_station_id;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configure Transition</DialogTitle>
          <DialogDescription>
            {sourceStationName && targetStationName && (
              <span>
                From <strong>{sourceStationName}</strong> to{' '}
                <strong>{targetStationName}</strong>
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Loopback Warning */}
          {isLoopback && (
            <Alert variant="default">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This is a loopback transition. The station will loop back to
                itself based on the condition.
              </AlertDescription>
            </Alert>
          )}

          {/* Label */}
          <div className="space-y-2">
            <Label htmlFor="transition-label">Label</Label>
            <Input
              id="transition-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Approved, Needs Revision"
            />
            <p className="text-xs text-muted-foreground">
              Optional label displayed on the transition arrow
            </p>
          </div>

          {/* Condition Type */}
          <div className="space-y-2">
            <Label htmlFor="condition-type">Condition Type</Label>
            <Select value={conditionType} onValueChange={setConditionType}>
              <SelectTrigger id="condition-type">
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
            {selectedCondition && (
              <p className="text-xs text-muted-foreground">
                {selectedCondition.description}
              </p>
            )}
          </div>

          {/* Condition Value (only for conditional) */}
          {conditionType === 'conditional' && (
            <div className="space-y-2">
              <Label htmlFor="condition-value">Condition Expression</Label>
              <Textarea
                id="condition-value"
                value={conditionValue}
                onChange={(e) => setConditionValue(e.target.value)}
                placeholder='{"key": "approval_status", "operator": "equals", "value": "approved"}'
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                JSON expression evaluated against station context. The
                transition will be followed if this condition is true.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} className="mr-auto">
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges}>
            <Save className="h-4 w-4 mr-1" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
