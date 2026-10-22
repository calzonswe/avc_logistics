// Push notification settings (ticket 13).
//
// Shown in the driver/worker apps: the worker or driver can allow the app to
// send OS notifications (a pit alert or a new order). Without VAPID keys or
// push support the card explains that the feature is unavailable — the app
// keeps working.
import { usePushSubscription } from '../hooks/usePushSubscription';
import { Button } from '@avc/ui/components/Button';
import { Card } from '@avc/ui/components/Card';
import { BellRing, BellOff, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PushSettings() {
  const { t } = useTranslation();
  const { state, error, subscribe, unsubscribe, supported } = usePushSubscription();

  if (state === 'unsupported') {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <BellOff className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <h3 className="font-medium text-gray-900">{t('push.title')}</h3>
            <p className="text-sm text-gray-500">
              {t('push.unsupported')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (state === 'disabled') {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <BellOff className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <h3 className="font-medium text-gray-900">{t('push.title')}</h3>
            <p className="text-sm text-gray-500">
              {t('push.disabled')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-gray-900 flex items-center gap-2">
            <BellRing className="w-4 h-4" /> {t('push.title')}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {state === 'subscribed' ? t('push.activeDescription') : t('push.description')}
          </p>
          {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
          {state === 'denied' && (
            <p className="text-sm text-amber-700 mt-1">
              {t('push.denied')}
            </p>
          )}
        </div>
        {state === 'subscribed' ? (
          <Button variant="secondary" onClick={unsubscribe} icon={<Check className="w-4 h-4" />}>
            {t('push.active')}
          </Button>
        ) : (
          <Button onClick={subscribe} disabled={state === 'denied'} icon={<BellRing className="w-4 h-4" />}>
            {t('push.enable')}
          </Button>
        )}
      </div>
    </Card>
  );
}
