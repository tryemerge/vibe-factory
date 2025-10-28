import * as React from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { className, checked = false, onCheckedChange, disabled, id, ...props },
    ref
  ) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        onCheckedChange?.(!checked);
      }
    };

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={id ? `${id}-label` : undefined}
        ref={ref}
        className={cn(
          'inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-foreground' : 'bg-input',
          className
        )}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        onKeyDown={handleKeyDown}
        {...props}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform',
            checked
              ? 'translate-x-4 bg-background'
              : 'translate-x-0 bg-muted-foreground'
          )}
        />
      </button>
    );
  }
);
Switch.displayName = 'Switch';

export { Switch };
