// Notification bell — in-app notifications (ticket 11).
//
// The bell shows the unread count, opens a drawer with the user's
// notifications and lets the user mark them read. The recipients are
// role-scoped on the server (the API only ever returns the caller's own
// notifications), so the drawer only shows what this user may see.
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../utils/api';
import { Bell, Check, CheckCheck, X, AlertTriangle, Truck, Wrench, Package } from 'lucide-react';

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  message: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  pit_alert: AlertTriangle,
  maintenance_due: Wrench,
  order_assigned: Truck,
  damage_reported: Package,
};

const ICON_COLORS: Record<string, string> = {
  pit_alert: 'text-orange-600 bg-orange-50',
  maintenance_due: 'text-red-600 bg-red-50',
  order_assigned: 'text-blue-600 bg-blue-50',
  damage_reported: 'text-purple-600 bg-purple-50',
};

function timeAgo(iso: string, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return locale === 'sv' ? 'just nu' : 'just now';
  if (minutes < 60) return locale === 'sv' ? `${minutes} min sedan` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === 'sv' ? `${hours} tim sedan` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return locale === 'sv' ? `${days} dagar sedan` : `${days} d ago`;
  return new Date(iso).toLocaleDateString(locale);
}

export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const locale = i18n.language?.slice(0, 2) || 'sv';

  const { data: countData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then((r) => r.data.count as number),
    refetchInterval: 30000,
  });

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.get('/notifications', { params: { limit: 20 } }).then((r) => r.data.data as NotificationRow[]),
    enabled: open,
    refetchInterval: open ? 30000 : false,
  });

  const markRead = useMutation({
    mutationFn: (ids: string[]) => api.post('/notifications/read', { notification_ids: ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.post('/notifications/read-all', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Close the drawer when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = countData ?? 0;
  const rows = notifications ?? [];

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label={`${t('notifications.title')}${unread > 0 ? ` (${unread} ${t('notifications.unread', { count: unread }).replace(/^\d+\s*/, '')})` : ''}`}
        title={t('notifications.title')}
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white shadow-lg border border-gray-200 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">{t('notifications.title')}</h3>
            <div className="flex items-center gap-1">
              <button
                onClick={() => markAllRead.mutate()}
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                title={t('notifications.markAllRead')}
                disabled={unread === 0}
              >
                <CheckCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
                title={t('common.close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-gray-500 text-center py-8">{t('common.loading')}</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">{t('notifications.empty')}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {rows.map((notification) => {
                  const Icon = ICONS[notification.type] ?? Bell;
                  const iconColor = ICON_COLORS[notification.type] ?? 'text-gray-600 bg-gray-50';
                  return (
                    <li
                      key={notification.id}
                      className={`flex gap-3 px-4 py-3 ${notification.is_read ? 'bg-white' : 'bg-blue-50/40'}`}
                    >
                      <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                        {notification.message && (
                          <p className="text-xs text-gray-600 mt-0.5 break-words">{notification.message}</p>
                        )}
                        <p className="text-[11px] text-gray-400 mt-1">{timeAgo(notification.created_at, locale)}</p>
                      </div>
                      {!notification.is_read && (
                        <button
                          onClick={() => markRead.mutate([notification.id])}
                          className="shrink-0 p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title={t('notifications.markRead')}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
