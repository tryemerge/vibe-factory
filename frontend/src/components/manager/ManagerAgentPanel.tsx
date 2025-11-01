import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2 } from 'lucide-react';
import { tasksApi } from '@/lib/api';

interface ManagerAgentPanelProps {
  projectId: string;
}

export function ManagerAgentPanel({ projectId }: ManagerAgentPanelProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    if (!message.trim() || !projectId) return;

    setIsSending(true);
    setError(null);

    try {
      // For now, create a single task with the message
      // TODO: Later, integrate with AI to parse message and create multiple tasks
      await tasksApi.create({
        project_id: projectId,
        title: message.trim().substring(0, 100), // First 100 chars as title
        description: message.trim(),
      });

      setMessage('');
      // TODO: Show success feedback
    } catch (err) {
      console.error('Failed to send manager agent message:', err);
      setError('Failed to create task. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [message, projectId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="p-4 space-y-4">
      {/* Info Section */}
      <div className="p-3 rounded-lg bg-muted/30 text-sm">
        <p className="font-medium mb-1">Manager Agent</p>
        <p className="text-muted-foreground text-xs">
          Ask the agent to create tasks, break down features, or organize work
          at the project level.
        </p>
      </div>

      {/* Example */}
      <div className="p-3 rounded-lg border border-border text-sm">
        <p className="font-medium mb-1 text-xs text-muted-foreground">
          Example:
        </p>
        <p className="text-xs">
          &quot;Create tasks for implementing user authentication: OAuth setup,
          login endpoint, logout endpoint, session management, and integration
          tests&quot;
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Input Area */}
      <div className="space-y-2">
        <Textarea
          placeholder="Ask the Manager Agent to create tasks, break down features, or organize work..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[120px] resize-none"
          disabled={isSending}
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to send
          </span>
          <Button
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            size="sm"
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>

      {/* TODO: Add chat history here */}
      <div className="text-xs text-muted-foreground pt-4 border-t border-border">
        💡 Tip: The Manager Agent will create tasks based on your message. In
        the future, it will use AI to intelligently break down your requests
        into multiple tasks.
      </div>
    </div>
  );
}
