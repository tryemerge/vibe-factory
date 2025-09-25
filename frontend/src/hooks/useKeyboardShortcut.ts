import { useEffect, useRef, useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  useKeyboardShortcutsRegistry,
  type ShortcutConfig,
} from '@/contexts/keyboard-shortcuts-context';

export interface KeyboardShortcutOptions {
  enableOnContentEditable?: boolean;
  preventDefault?: boolean;
}

/**
 * Create a stable identity for keys to prevent unnecessary re-registrations
 */
function keysIdentity(keys: string | string[]) {
  if (Array.isArray(keys)) {
    // normalize: lower-case and sort for a stable order
    return keys.map(k => k.toLowerCase()).sort().join('|');
  }
  return keys.toLowerCase();
}

export function useKeyboardShortcut(
  config: ShortcutConfig,
  options: KeyboardShortcutOptions = {}
): void {
  const { register } = useKeyboardShortcutsRegistry();
  const unregisterRef = useRef<(() => void) | null>(null);

  const { keys, callback, when = true, description, group, scope } = config;
  const { enableOnContentEditable = false, preventDefault = false } = options;

  // Stable identity for keys
  const keysId = useMemo(() => keysIdentity(keys), [keys]);

  // Provide a stable array reference for useHotkeys
  const memoKeys = useMemo(() => keys, [keysId]);

  // Keep latest callback/when without forcing re-register
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const whenRef = useRef(when);
  useEffect(() => {
    whenRef.current = when;
  }, [when]);

  // Register once per identity fields (no direct 'config' usage here)
  useEffect(() => {
    const unregister = register({
      keys,
      description,
      group,
      scope,
      // delegate to latest refs
      callback: (e: KeyboardEvent) => callbackRef.current?.(e as KeyboardEvent),
      when: () => {
        const w = whenRef.current;
        return typeof w === 'function' ? !!w() : !!w;
      },
    });
    unregisterRef.current = unregister;

    return () => {
      unregisterRef.current?.();
      unregisterRef.current = null;
    };
  }, [register, keysId, description, group, scope]);

  // Bind the actual keyboard handling
  useHotkeys(
    memoKeys,
    (event) => {
      const w = whenRef.current;
      const enabled = typeof w === 'function' ? !!w() : !!w;
      if (enabled) callbackRef.current?.(event as KeyboardEvent);
    },
    {
      enabled: true, // we gate inside handler via whenRef
      enableOnContentEditable,
      preventDefault,
      scopes: scope ? [scope] : ['*'],
    },
    [keysId, scope] // depend on identity, not array reference
  );
}
