import { Outlet, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/navbar';
import { ManagerAgentPanel } from '@/components/manager/ManagerAgentPanel';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useProject } from '@/contexts/project-context';

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const [isManagerTrayOpen, setIsManagerTrayOpen] = useState(false);
  const { projectId } = useProject();

  return (
    <>
      <DevBanner />
      {!shouldHideNavbar && (
        <Navbar
          onToggleManagerTray={() => setIsManagerTrayOpen(!isManagerTrayOpen)}
          isManagerTrayOpen={isManagerTrayOpen}
        />
      )}
      <div className="flex-1 min-h-0 overflow-hidden flex">
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
        {isManagerTrayOpen && projectId && (
          <div className="w-96 border-l-4 border-border bg-background flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
              <h2 className="font-semibold text-lg">Manager Agent</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsManagerTrayOpen(false)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <ManagerAgentPanel projectId={projectId} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
