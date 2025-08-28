import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ClickableFilePathProps {
  path: string;
  line?: number;
  onClick: (path: string, line?: number) => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function ClickableFilePath({
  path,
  line,
  onClick,
  disabled = false,
  className,
  children,
}: ClickableFilePathProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || loading) return;

    try {
      setLoading(true);
      await onClick(path, line);
    } catch (error) {
      console.error('Failed to open file:', error);
    } finally {
      setLoading(false);
    }
  };

  const content = children ?? <code className="text-sm">{path}</code>;

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center text-primary hover:text-primary/80',
        'underline decoration-dotted hover:decoration-solid',
        'transition-colors duration-150',
        disabled && 'opacity-50 cursor-not-allowed',
        loading && 'opacity-75',
        className
      )}
      title={
        disabled
          ? 'File no longer exists'
          : loading
            ? 'Opening...'
            : 'Click to open in IDE'
      }
    >
      {loading ? (
        <>
          <span className="animate-spin mr-1 text-xs">⟳</span>
          {content}
        </>
      ) : (
        content
      )}
    </button>
  );
}
