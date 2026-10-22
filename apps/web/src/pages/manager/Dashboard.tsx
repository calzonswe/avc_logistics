// Manager Dashboard
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { Card } from '@avc/ui/components/Card';
import { FillLevelIndicator } from '@avc/ui/components/FillLevelIndicator';
import { StatusBadge } from '@avc/ui/components/StatusBadge';
import { Loader } from '../../components/Loader';
import { Truck, Box, Wrench, AlertTriangle, Users, Calendar } from 'lucide-react';
import { formatRelativeTime } from '@avc/ui/utils';
import type { ManagerOverview } from '@avc/shared-types';
import { useTranslation } from 'react-i18next';

export function ManagerDashboard() {
  const { t } = useTranslation();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get<ManagerOverview>('/dashboard/manager/overview').then((r) => r.data),
    refetchInterval: 30000,
  });

  if (isLoading) return <Loader fullScreen />;

  const statCards = [
    { label: t('manager.dashboard.totalContainers'), value: stats?.totalContainers || 0, icon: Box, color: 'bg-blue-100 text-blue-600' },
    { label: t('manager.dashboard.needsTransport'), value: stats?.containersNeedingTransport || 0, icon: Truck, color: 'bg-orange-100 text-orange-600' },
    { label: t('manager.dashboard.overdueMaintenance'), value: stats?.overdueMaintenance || 0, icon: Wrench, color: 'bg-red-100 text-red-600' },
    { label: t('manager.dashboard.openDamage'), value: stats?.openDamageReports || 0, icon: AlertTriangle, color: 'bg-yellow-100 text-yellow-600' },
    { label: t('manager.dashboard.pendingSwaps'), value: stats?.pendingSwapRequests || 0, icon: Users, color: 'bg-purple-100 text-purple-600' },
    { label: t('manager.dashboard.pitsToEmpty'), value: stats?.pitsNeedingAttention || 0, icon: Calendar, color: 'bg-green-100 text-green-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('manager.dashboard.title')}</h1>
          <p className="text-gray-500">{t('manager.dashboard.subtitle')}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-xl ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card>
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">{t('manager.dashboard.recentActivity')}</h2>
          </div>
          <div className="p-4">
            <p className="text-gray-500 text-sm">{t('manager.dashboard.activityComing')}</p>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card>
          <div className="p-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">{t('manager.dashboard.quickActions')}</h2>
          </div>
          <div className="p-4 grid grid-cols-2 gap-3">
            <button className="btn btn-outline text-left p-4 hover:bg-blue-50 border-blue-200">
              <div className="font-medium text-blue-700">{t('manager.dashboard.newOrder')}</div>
              <div className="text-sm text-gray-500">{t('manager.dashboard.planTransport')}</div>
            </button>
            <button className="btn btn-outline text-left p-4 hover:bg-green-50 border-green-200">
              <div className="font-medium text-green-700">{t('manager.dashboard.newContainer')}</div>
              <div className="text-sm text-gray-500">{t('manager.dashboard.registerContainer')}</div>
            </button>
            <button className="btn btn-outline text-left p-4 hover:bg-purple-50 border-purple-200">
              <div className="font-medium text-purple-700">{t('manager.dashboard.newMaintenance')}</div>
              <div className="text-sm text-gray-500">{t('manager.dashboard.scheduledMaintenance')}</div>
            </button>
            <button className="btn btn-outline text-left p-4 hover:bg-orange-50 border-orange-200">
              <div className="font-medium text-orange-700">{t('manager.dashboard.newReport')}</div>
              <div className="text-sm text-gray-500">{t('manager.dashboard.analyse')}</div>
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}