import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { agentsApi } from '@/lib/api';

interface AgentSelectorProps {
  value: string | null;
  onChange: (agentId: string | null) => void;
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  allowNull?: boolean;
}

export function AgentSelector({
  value,
  onChange,
  disabled = false,
  label = 'Agent',
  placeholder = 'Select agent (optional)',
  allowNull = true,
}: AgentSelectorProps) {
  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentsApi.list(),
  });

  const handleValueChange = (newValue: string) => {
    if (newValue === 'none' && allowNull) {
      onChange(null);
    } else {
      onChange(newValue);
    }
  };

  return (
    <div>
      <Label htmlFor="agent-selector" className="text-sm font-medium">
        {label}
      </Label>
      <Select
        value={value || 'none'}
        onValueChange={handleValueChange}
        disabled={disabled || isLoading}
      >
        <SelectTrigger className="mt-1.5" id="agent-selector">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowNull && (
            <SelectItem value="none">
              <span className="text-muted-foreground">No agent (default)</span>
            </SelectItem>
          )}
          {agents?.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{agent.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({agent.executor})
                </span>
              </div>
            </SelectItem>
          ))}
          {!isLoading && agents?.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              No agents configured
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
