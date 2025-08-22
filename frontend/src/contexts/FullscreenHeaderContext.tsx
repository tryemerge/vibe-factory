import React, { createContext, useContext, useMemo, useState } from 'react';

interface FullscreenHeaderContextValue {
  active: boolean;
  setActive: (v: boolean) => void;
  content: React.ReactNode | null;
  setContent: (node: React.ReactNode | null) => void;
}

const FullscreenHeaderContext =
  createContext<FullscreenHeaderContextValue | null>(null);

export function FullscreenHeaderProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(false);
  const [content, setContent] = useState<React.ReactNode | null>(null);

  const value = useMemo(
    () => ({ active, setActive, content, setContent }),
    [active, content]
  );

  return (
    <FullscreenHeaderContext.Provider value={value}>
      {children}
    </FullscreenHeaderContext.Provider>
  );
}

export function useFullscreenHeader() {
  const ctx = useContext(FullscreenHeaderContext);
  if (!ctx) throw new Error('useFullscreenHeader must be used within provider');
  return ctx;
}
