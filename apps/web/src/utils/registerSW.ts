// Service Worker Registration
//
// The SW only exists in a production build (vite-plugin-pwa emits /sw.js).
// Registering it in dev fails (the dev server answers /sw.js with index.html)
// and — worse — a SW registered earlier keeps serving the cached bundle, so a
// browser "cache clear" does not help and the app can render a stale/blank
// page. Dev must never register it.
export async function registerSW() {
  if (!import.meta.env.PROD) {
    return undefined;
  }
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available
              if (confirm('En ny version är tillgänglig. Ladda om för att uppdatera?')) {
                window.location.reload();
              }
            }
          });
        }
      });

      console.log('Service Worker registered:', registration.scope);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
}

export function requestBackgroundSync(tag: string) {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then((registration) => {
      return (registration as any).sync.register(tag);
    });
  }
}

export function checkOnlineStatus(): boolean {
  return navigator.onLine;
}

export function onOnlineChange(callback: (isOnline: boolean) => void) {
  window.addEventListener('online', () => callback(true));
  window.addEventListener('offline', () => callback(false));
}