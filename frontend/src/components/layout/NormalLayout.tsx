import { Outlet, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { DevBanner } from '@/components/DevBanner';
import { Navbar } from '@/components/layout/navbar';
import { ProjectManagerTray } from '@/components/manager/ProjectManagerTray';

export function NormalLayout() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view');
  const shouldHideNavbar = view === 'preview' || view === 'diffs';
  const [isManagerTrayOpen, setIsManagerTrayOpen] = useState(false);

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
        <ProjectManagerTray
          isOpen={isManagerTrayOpen}
          onClose={() => setIsManagerTrayOpen(false)}
        />
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </>
  );
}
