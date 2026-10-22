// Push subscription (ticket 13).
//
// Asks for the notification permission, subscribes with the VAPID public key
// and stores the subscription on the server. Missing VAPID keys or a browser
// without push support disable the feature — the app keeps working.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';

export type PushState = 'unsupported' | 'disabled' | 'denied' | 'default' | 'granted' | 'subscribed';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

export function usePushSubscription() {
  const [state, setState] = useState<PushState>('default');
  const [error, setError] = useState<string | null>(null);
  const [vapidKey, setVapidKey] = useState('');

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  useEffect(() => {
    if (!supported) {
      setState('unsupported');
      return;
    }

    // The VAPID public key and the "is push configured" flag come from the API
    // (the private key never leaves the server).
    api
      .get('/push/config')
      .then((r) => {
        const enabled = Boolean(r.data?.enabled && r.data?.public_key);
        setVapidKey(enabled ? r.data.public_key : '');
        if (!enabled) {
          setState('disabled');
          return;
        }
        if (Notification.permission === 'denied') {
          setState('denied');
          return;
        }
        if (Notification.permission === 'granted') {
          api
            .get('/push/subscription')
            .then((res) => setState(res.data?.subscribed ? 'subscribed' : 'granted'))
            .catch(() => setState('granted'));
          return;
        }
        setState('default');
      })
      .catch(() => setState('disabled'));
  }, [supported]);

  const subscribe = useCallback(async () => {
    setError(null);
    if (!supported) {
      setState('unsupported');
      return false;
    }
    if (!vapidKey) {
      setState('disabled');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'default');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }));

      await api.post('/push/subscribe', subscription.toJSON());
      setState('subscribed');
      return true;
    } catch (err: any) {
      setError(err?.message ?? 'Kunde inte aktivera push-notis');
      setState('default');
      return false;
    }
  }, [supported, vapidKey]);

  const unsubscribe = useCallback(async () => {
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
      await api.post('/push/unsubscribe', {}).catch(() => undefined);
      setState('granted');
    } catch (err: any) {
      setError(err?.message ?? 'Kunde inte stänga av push-notis');
    }
  }, []);

  return { state, error, subscribe, unsubscribe, supported, vapidConfigured: Boolean(vapidKey) };
}
