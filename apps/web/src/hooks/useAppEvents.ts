// WebSocket client (ticket 12).
//
// Subscribes to /ws, forwards the app events to the notification bell (toast)
// and invalidates the React Query caches that the event affects. If the socket
// cannot connect, the app keeps working on the 30 s polling intervals — the
// hook retries with a backoff.
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { useToast } from '@avc/ui/hooks/useToast';

export type AppEventType =
  | 'order_assigned'
  | 'pit_alert'
  | 'damage_reported'
  | 'maintenance_due';

export interface AppEventPayload {
  id: string;
  type: AppEventType;
  title: string;
  message?: string;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  site_id?: string | null;
  data?: Record<string, unknown>;
  created_at: string;
}

export type WebSocketStatus = 'connecting' | 'open' | 'closed';

/**
 * Opens the WebSocket while the user is signed in. Returns the connection
 * status so the UI can show it.
 */
export function useAppEvents(): WebSocketStatus {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WebSocketStatus>('closed');
  const retryRef = useRef(0);
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);
  // The toast hook throws when no ToastProvider is mounted — keep a safe wrapper.
  const toastRef = useRef<(toast: any) => void>(() => undefined);
  try {
    toastRef.current = useToast().showToast;
  } catch {
    toastRef.current = () => undefined;
  }

  useEffect(() => {
    if (!user) {
      setStatus('closed');
      return;
    }

    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      setStatus('connecting');
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${protocol}://${window.location.host}/ws?token=${encodeURIComponent(token)}`;

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch {
        scheduleRetry();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setStatus('open');
      };

      socket.onmessage = (message) => {
        let payload: any;
        try {
          payload = JSON.parse(message.data as string);
        } catch {
          return;
        }
        if (payload?.type !== 'event' || !payload.event) return;

        const event = payload.event as AppEventPayload;
        handleEvent(event);

        // Refresh what the event affects.
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        switch (event.type) {
          case 'order_assigned':
            queryClient.invalidateQueries({ queryKey: ['transportOrders'] });
            queryClient.invalidateQueries({ queryKey: ['driverShift'] });
            queryClient.invalidateQueries({ queryKey: ['driverShiftState'] });
            break;
          case 'pit_alert':
            queryClient.invalidateQueries({ queryKey: ['sitePits'] });
            queryClient.invalidateQueries({ queryKey: ['siteDashboard'] });
            break;
          case 'damage_reported':
            queryClient.invalidateQueries({ queryKey: ['damageReports'] });
            queryClient.invalidateQueries({ queryKey: ['siteMaintenance'] });
            queryClient.invalidateQueries({ queryKey: ['incidents'] });
            break;
          case 'maintenance_due':
            queryClient.invalidateQueries({ queryKey: ['siteMaintenance'] });
            queryClient.invalidateQueries({ queryKey: ['maintenance'] });
            break;
        }
      };

      socket.onclose = () => {
        setStatus('closed');
        scheduleRetry();
      };
      socket.onerror = () => {
        socket.close();
      };
    };

    const handleEvent = (event: AppEventPayload) => {
      const type =
        event.type === 'pit_alert' || event.type === 'maintenance_due'
          ? 'warning'
          : 'info';
      try {
        toastRef.current({
          type,
          title: event.title,
          message: event.message,
          duration: 6000,
        });
      } catch {
        // No toast provider mounted — the notification bell still shows it.
      }
    };

    const scheduleRetry = () => {
      if (disposed) return;
      // Exponential backoff, capped at 30 s.
      const delay = Math.min(30000, 1000 * Math.pow(2, retryRef.current));
      retryRef.current = Math.min(retryRef.current + 1, 5);
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(connect, delay);
    };

    connect();

    return () => {
      disposed = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [user, queryClient]);

  return status;
}
