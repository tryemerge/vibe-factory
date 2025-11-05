import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Circle,
} from 'lucide-react';
import type { Workflow } from 'shared/types';
import { cn } from '@/lib/utils';

interface WorkflowToolbarProps {
  workflows: Workflow[];
  selectedWorkflowId: string | null;
  onSelectWorkflow: (workflowId: string) => void;
  onNewWorkflow: () => void;
  onSave: () => void;
  onDelete: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onAutoLayout: () => void;
  onExportJson: () => void;
  hasUnsavedChanges?: boolean;
  disabled?: boolean;
}

export function WorkflowToolbar({
  workflows,
  selectedWorkflowId,
  onSelectWorkflow,
  onNewWorkflow,
  onSave,
  onDelete,
  onZoomIn,
  onZoomOut,
  onAutoLayout,
  onExportJson,
  hasUnsavedChanges = false,
  disabled = false,
}: WorkflowToolbarProps) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // Detect if user is on Mac for keyboard shortcut display
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0);
  }, []);

  useEffect(() => {
    // Handle Ctrl+S / Cmd+S keyboard shortcut
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (!disabled && selectedWorkflowId) {
          onSave();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, selectedWorkflowId, onSave]);

  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId);
  const saveShortcut = isMac ? '⌘S' : 'Ctrl+S';

  return (
    <div className="flex items-center gap-2 p-4 border-b bg-background">
      {/* Workflow Selector */}
      <div className="flex items-center gap-2">
        <Select
          value={selectedWorkflowId || undefined}
          onValueChange={onSelectWorkflow}
          disabled={disabled}
        >
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Select a workflow..." />
          </SelectTrigger>
          <SelectContent>
            {workflows.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                No workflows available
              </div>
            ) : (
              workflows.map((workflow) => (
                <SelectItem key={workflow.id} value={workflow.id}>
                  {workflow.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>

        {/* New Workflow Button */}
        <Button
          onClick={onNewWorkflow}
          disabled={disabled}
          size="sm"
          variant="outline"
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Workflow
        </Button>
      </div>

      {/* Divider */}
      <div className="h-8 w-px bg-border" />

      {/* Save Button with Unsaved Indicator */}
      <Button
        onClick={onSave}
        disabled={disabled || !selectedWorkflowId}
        size="sm"
        variant="outline"
        className="gap-2 relative"
        title={`Save workflow (${saveShortcut})`}
      >
        {hasUnsavedChanges && (
          <Circle className="h-2 w-2 fill-orange-500 text-orange-500 absolute -top-1 -right-1" />
        )}
        <Save className="h-4 w-4" />
        Save
      </Button>

      {/* Delete Button */}
      <Button
        onClick={onDelete}
        disabled={disabled || !selectedWorkflowId}
        size="sm"
        variant="destructive"
        className="gap-2"
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>

      {/* Divider */}
      <div className="h-8 w-px bg-border" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <Button
          onClick={onZoomOut}
          disabled={disabled || !selectedWorkflowId}
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          onClick={onZoomIn}
          disabled={disabled || !selectedWorkflowId}
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>

      {/* Divider */}
      <div className="h-8 w-px bg-border" />

      {/* Auto Layout Button */}
      <Button
        onClick={onAutoLayout}
        disabled={disabled || !selectedWorkflowId}
        size="sm"
        variant="outline"
        className="gap-2"
      >
        <Maximize2 className="h-4 w-4" />
        Auto Layout
      </Button>

      {/* Export Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            disabled={disabled || !selectedWorkflowId}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onExportJson}>
            Export as JSON
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="text-muted-foreground">
            Export as Image (coming soon)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Workflow Info */}
      {selectedWorkflow && (
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <span className={cn(hasUnsavedChanges && 'text-orange-500')}>
            {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
          </span>
        </div>
      )}
    </div>
  );
}
