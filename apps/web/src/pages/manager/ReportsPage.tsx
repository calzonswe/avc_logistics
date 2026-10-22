// Reports Page
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { Button } from '@avc/ui/components/Button';
import { Card } from '@avc/ui/components/Card';
import { Loader } from '../../components/Loader';
import { Download, BarChart, TrendingUp, Users, Truck, Container, Wrench } from 'lucide-react';
import { formatDate } from '@avc/ui/utils';

export function ReportsPage() {
  const [dateRange, setDateRange] = useState({
    from: '',
    to: '',
  });

  const { data: utilization, isLoading: utilLoading } = useQuery({
    queryKey: ['reportUtilization', dateRange],
    queryFn: () =>
      api
        .post('/reports/container-utilization', dateRange)
        .then((r) => r.data),
  });

  const { data: efficiency, isLoading: effLoading } = useQuery({
    queryKey: ['reportEfficiency', dateRange],
    queryFn: () =>
      api
        .post('/reports/driver-efficiency', dateRange)
        .then((r) => r.data),
  });

  const { data: throughput, isLoading: tputLoading } = useQuery({
    queryKey: ['reportThroughput', dateRange],
    queryFn: () =>
      api
        .get('/reports/throughput', {
          params: dateRange,
        })
        .then((r) => r.data),
  });

  const { data: compliance, isLoading: compLoading } = useQuery({
    queryKey: ['reportCompliance', dateRange],
    queryFn: () =>
      api
        .get('/reports/maintenance-compliance', {
          params: dateRange,
        })
        .then((r) => r.data),
  });

  const isLoading = utilLoading || effLoading || tputLoading || compLoading;

  const handleExport = (type: string) => {
    // TODO: Implement export
    alert(`Export ${type} - kommer snart`);
  };

  if (isLoading) return <Loader message="Laddar rapporter..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Rapporter</h1>
        <div className="flex gap-4">
          <div className="flex gap-2">
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              className="border rounded-lg px-3 py-2"
            />
            <span className="self-center text-gray-500">–</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              className="border rounded-lg px-3 py-2"
            />
          </div>
          <Button variant="secondary" onClick={() => handleExport('utilization')} icon={<Download className="w-4 h-4" />}>
            Exportera
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <ReportCard
          title="Containrar som behöver transport"
          value={utilization?.report?.reduce((sum, s) => sum + s.containers.filter((c: any) => c.fill_level >= 75).length, 0) || 0}
          icon={<Container className="w-6 h-6" />}
          color="text-orange-600"
          bgColor="bg-orange-50"
        />
        <ReportCard
          title="Aktiva transportorder"
          value={throughput?.statusCounts?.find((s: any) => s.status === 'in_progress')?.count || 0}
          icon={<Truck className="w-6 h-6" />}
          color="text-blue-600"
          bgColor="bg-blue-50"
        />
        <ReportCard
          title="Förareffektivitet"
          value={efficiency?.report?.length || 0}
          icon={<Users className="w-6 h-6" />}
          color="text-green-600"
          bgColor="bg-green-50"
        />
        <ReportCard
          title="Underhållsförsenade"
          value={compliance?.statusCounts?.find((s: any) => s.status !== 'completed')?.count || 0}
          icon={<Wrench className="w-6 h-6" />}
          color="text-red-600"
          bgColor="bg-red-50"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold mb-4">Containerutnyttjande per plats</h2>
          {utilization?.report && utilization.report.length > 0 ? (
            <div className="space-y-4">
              {utilization.report.map((site: any) => (
                <div key={site.siteId} className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium">{site.siteName} ({site.containers.length} containrar)</h3>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {Object.entries(site.byFillLevel as Record<string, number>).map(([level, count]) => (
                      <span
                        key={level}
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          level === '100' ? 'bg-red-100 text-red-800' :
                          level === '75' ? 'bg-orange-100 text-orange-800' :
                          level === '50' ? 'bg-yellow-100 text-yellow-800' :
                          level === '25' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {level}%: {count}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Ingen data</p>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-4">Förareffektivitet</h2>
          {efficiency?.report && efficiency.report.length > 0 ? (
            <div className="space-y-2">
              {efficiency.report.map((driver: any) => (
                <div key={driver.driverId} className="p-3 bg-gray-50 rounded-lg flex justify-between">
                  <span className="font-medium">{driver.driverName}</span>
                  <span className="text-gray-600">
                    {driver.ordersCompleted} order, {driver.avgDurationHours.toFixed(1)}h genomsnitt
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Ingen data</p>
          )}
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold mb-4">Transportorder genomströmning</h2>
          {throughput?.statusCounts && throughput.statusCounts.length > 0 ? (
            <div className="space-y-2">
              {throughput.statusCounts.map((s: any) => (
                <div key={s.status} className="flex justify-between p-2 bg-gray-50 rounded">
                  <span className="capitalize">{s.status.replace('_', ' ')}</span>
                  <span className="font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Ingen data</p>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold mb-4">Underhållsefterlevnad</h2>
          {compliance?.statusCounts && compliance.statusCounts.length > 0 ? (
            <div className="space-y-2">
              {compliance.statusCounts.map((s: any) => (
                <div key={s.status} className="flex justify-between p-2 bg-gray-50 rounded">
                  <span className="capitalize">{s.status.replace('_', ' ')}</span>
                  <span className="font-medium">{s.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500">Ingen data</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function ReportCard({
  title,
  value,
  icon,
  color,
  bgColor,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${bgColor} ${color}`}>{icon}</div>
      </div>
    </Card>
  );
}