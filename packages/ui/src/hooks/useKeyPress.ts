// useKeyPress Hook - Keyboard event handling
import { useEffect } from 'react';

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