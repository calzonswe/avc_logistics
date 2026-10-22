// Main Entry Point
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App';
import { AuthProvider } from './components/AuthProvider';
import { registerSW } from './utils/registerSW';
import { startSyncService, setApiClient } from '@avc/ui/lib/syncService';
import { ToastProvider } from '@avc/ui/hooks/useToast';
import './i18n';
import { api } from './utils/api';
import './index.css';

// Create Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Register Service Worker (production build only — see utils/registerSW.ts)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  registerSW();
} else if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  // A service worker registered by an earlier session keeps serving the cached
  // bundle (a browser "cache clear" does NOT unregister it), which can leave
  // the dev app on a stale/blank page. Clean it up on every dev load.
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
  }
}

// Configure sync service with API client
setApiClient(api);

// Start offline sync service
startSyncService();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ToastProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </React.StrictMode>
);