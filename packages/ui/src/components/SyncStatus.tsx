// Sync Status Indicator - Shows sync status in UI
import { useSync } from '../hooks/useSync.js';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';

export function SyncStatusIndicator() {
  const { status, forceSync } = useSync();
  const { t } = useTranslation();

  if (!status.isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg" title="Offline - Changes will sync when reconnected">
        <WifiOff className="w-4 h-4 text-orange-600 shrink-0" />
        <span className="text-sm font-medium text-orange-800 whitespace-nowrap">{t('sync.offline')}</span>
        {/* The counter is hidden on phones so the badge never pushes the layout
            wider than the screen. */}
        <span className="text-xs text-orange-600 hidden sm:inline">({status.pending} {t('sync.pending')})</span>
      </div>
    );
  }

  if (status.isSyncing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg" title="Syncing...">
        <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
        <span className="text-sm font-medium text-blue-800">{t('sync.syncing')}</span>
      </div>
    );
  }

  if (status.failed > 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg" title={`${status.failed} mutations failed after retries`}>
        <AlertCircle className="w-4 h-4 text-red-600" />
        <span className="text-sm font-medium text-red-800">{t('sync.failed', { count: status.failed })}</span>
        <button 
          onClick={forceSync}
          className="ml-1 text-xs text-red-600 hover:underline"
          title="Försök igen"
        >
          Försök igen
        </button>
      </div>
    );
  }

  if (status.pending > 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg" title={`${status.pending} changes pending sync`}>
        <RefreshCw className="w-4 h-4 text-yellow-600" />
        <span className="text-sm font-medium text-yellow-800">{t('sync.pending', { count: status.pending })}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg" title="All changes synced">
      <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
      <span className="text-sm font-medium text-green-800 whitespace-nowrap">{t('sync.synced')}</span>
      {status.lastSync && (
        <span className="text-xs text-green-600 hidden sm:inline">
          {new Date(status.lastSync).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}

export function SyncStatusButton() {
  const { status, forceSync } = useSync();

  return (
    <button
      onClick={forceSync}
      disabled={status.isSyncing}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
        status.isOnline
          ? status.isSyncing
            ? 'bg-blue-50 text-blue-700 cursor-wait'
            : status.failed > 0
              ? 'bg-red-50 text-red-700 hover:bg-red-100'
              : status.pending > 0
                ? 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
          : 'bg-orange-50 text-orange-700'
      }`}
      title={
        !status.isOnline
          ? 'Offline - Changes will sync when reconnected'
          : status.isSyncing
            ? 'Syncing...'
            : status.failed > 0
              ? `${status.failed} failed - click to retry`
              : status.pending > 0
                ? `${status.pending} pending - click to sync now`
                : 'All synced - click to force sync'
      }
    >
      {!status.isOnline && <WifiOff className="w-4 h-4" />}
      {status.isSyncing && <RefreshCw className="w-4 h-4 animate-spin" />}
      {status.failed > 0 && !status.isSyncing && <AlertCircle className="w-4 h-4" />}
      {status.pending > 0 && !status.failed && !status.isSyncing && <RefreshCw className="w-4 h-4" />}
      {status.pending === 0 && !status.failed && status.isOnline && <CheckCircle className="w-4 h-4" />}
      <span className="text-sm font-medium">
        {status.isSyncing 
          ? 'Synkroniserar...' 
          : !status.isOnline 
            ? 'Offline' 
            : status.failed > 0 
              ? `${status.failed} misslyckade` 
              : status.pending > 0 
                ? `${status.pending} väntar` 
                : 'Synkad'}
      </span>
    </button>
  );
}