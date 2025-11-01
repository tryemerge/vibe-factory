import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { X, Send } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';

interface ProjectManagerTrayProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProjectManagerTray({
  isOpen,
  onClose,
}: ProjectManagerTrayProps) {
  const { projectId } = useProject();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = useCallback(async () => {
    if (!message.trim() || !projectId) return;

    setIsSending(true);
    try {
      // TODO: Implement actual AI agent communication
      // For now, this is a placeholder
      console.log('Project Manager Agent message:', {
        projectId,
        message,
      });

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setMessage('');
    } catch (error) {
      console.error('Failed to send manager agent message:', error);
    } finally {
      setIsSending(false);
    }
  }, [message, projectId]);

  if (!isOpen) return null;

  return (
    <div className="h-full flex flex-col bg-background border-r border-border w-96">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <h2 className="font-semibold text-lg">Manager Agent</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Info Section */}
      <div className="p-4 border-b border-border bg-muted/30 shrink-0">
        <p className="text-sm text-muted-foreground">
          Use the Manager Agent to create multiple tasks, organize work, and
          plan features at the project level.
        </p>
      </div>

      {/* Messages Area (placeholder for future chat history) */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted text-sm">
            <p className="font-medium mb-1">Example:</p>
            <p className="text-muted-foreground">
              &quot;Create tasks for implementing user authentication: OAuth
              setup, login endpoint, logout endpoint, session management, and
              integration tests&quot;
            </p>
          </div>
        </div>
      </div>

      {/* Input Area */}
      <div className="shrink-0 p-4 border-t border-border">
        <div className="space-y-2">
          <Textarea
            placeholder="Ask the Manager Agent to create tasks, break down features, or organize work..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="min-h-[100px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              ⌘+Enter to send
            </span>
            <Button
              onClick={handleSend}
              disabled={!message.trim() || isSending}
              size="sm"
            >
              <Send className="h-4 w-4 mr-2" />
              {isSending ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
