import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for detecting clicks outside an element
 */
export function useClickOutside<T extends HTMLElement>(
  handler: (event: MouseEvent | TouchEvent) => void
): React.RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler(event);
    };

    document.addEventListener('mousedown', listener);
    document.addEventListener('touchstart', listener);

    return () => {
      document.removeEventListener('mousedown', listener);
      document.removeEventListener('touchstart', listener);
    };
  }, [handler]);

  return ref;
}

/**
 * Hook for detecting key presses
 */
export function useKeyPress(
  targetKey: string | string[],
  handler: (event: KeyboardEvent) => void,
  options?: { preventDefault?: boolean; stopPropagation?: boolean; target?: Window | Document | HTMLElement }
): void {
  const { preventDefault = false, stopPropagation = false, target = window } = options || {};

  useEffect(() => {
    const keys = Array.isArray(targetKey) ? targetKey : [targetKey];

    const listener = (event: KeyboardEvent) => {
      if (keys.includes(event.key)) {
        if (preventDefault) event.preventDefault();
        if (stopPropagation) event.stopPropagation();
        handler(event);
      }
    };

    target.addEventListener('keydown', listener as EventListener);
    return () => target.removeEventListener('keydown', listener as EventListener);
  }, [targetKey, handler, preventDefault, stopPropagation, target]);
}

/**
 * Hook for Escape key
 */
export function useEscapeKey(handler: () => void, enabled = true): void {
  useKeyPress('Escape', useCallback((e) => handler(), [handler]), { target: window });
}

/**
 * Hook for Enter key
 */
export function useEnterKey(handler: () => void, enabled = true): void {
  useKeyPress('Enter', useCallback((e) => handler(), [handler]), { target: window });
}