'use client';

import {
  AlertCircle,
  CheckCircle,
  Cpu,
  HardDrive,
  Loader2,
  MemoryStick,
  Radio,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Wrench,
  XCircle,
} from 'lucide-react';

import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@laas-portal/ui';
import { getAccessToken } from '../../../../lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface OpenStackServiceItem {
  binary: string;
  state: string;
  status: string;
  zone?: string;
  updatedAt?: string;
}

interface HypervisorRecord {
  id: string | number;
  hostname: string;
  hostIp: string;
  state: 'up' | 'down';
  status: 'enabled' | 'disabled';
  vcpus: number;
  vcpusUsed: number;
  memoryMb: number;
  memoryMbUsed: number;
  localGb: number;
  localGbUsed: number;
  runningVms: number;
  cpuModel?: string;
  uptime?: string;
  nodeType?: 'compute' | 'controller' | 'network';
  services?: OpenStackServiceItem[];
}

type ServerStatus = 'online' | 'offline' | 'maintenance' | 'warning';

interface ServerRow {
  id: string | number;
  hostname: string;
  ip: string;
  status: ServerStatus;
  nodeType: 'compute' | 'controller' | 'network';
  cpu: { usagePct: number; cores: number; model?: string };
  ram: { usagePct: number; totalGb: number; usedGb: number };
  disk: { usagePct: number; totalGb: number; usedGb: number };
  activeVMs: number;
  uptime?: string;
  services?: OpenStackServiceItem[];
}

interface ClusterStats {
  total: number;
  online: number;
  offline: number;
  maintenance: number;
  warning: number;
  controllersCount: number;
  networkCount: number;
  computesCount: number;
  cpuCores: number;
  cpuUsedCores: number;
  cpuUsedPct: number;
  ramTotalGb: number;
  ramUsedGb: number;
  ramUsedPct: number;
  diskTotalGb: number | string;
  diskUsedGb: number;
  diskUsedPct: number;
  totalVMs: number;
  totalVolumesUsed?: number;
  maxTotalVolumes?: number;
}

interface CinderLimits {
  maxTotalVolumeGigabytes: number;
  totalGigabytesUsed: number;
  maxTotalVolumes: number;
  totalVolumesUsed: number;
  poolTotalGb?: number;
  poolFreeGb?: number;
  poolAllocatedGb?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

function mbToGb(mb: number): number {
  return Math.round((mb / 1024) * 10) / 10;
}

function deriveStatus(h: HypervisorRecord): ServerStatus {
  if (h.state === 'down') return 'offline';
  if (h.status === 'disabled') return 'maintenance';
  const cpuPct = pct(h.vcpusUsed, h.vcpus);
  const ramPct = pct(h.memoryMbUsed, h.memoryMb);
  const diskPct = pct(h.localGbUsed, h.localGb);
  if (cpuPct >= 90 || ramPct >= 90 || diskPct >= 90) return 'warning';
  return 'online';
}

function toServerRow(h: HypervisorRecord): ServerRow {
  const totalRamGb = mbToGb(h.memoryMb);
  const usedRamGb = mbToGb(h.memoryMbUsed);
  const hLower = h.hostname.toLowerCase();
  let nodeType: 'compute' | 'controller' | 'network' = 'compute';
  if (h.nodeType === 'network' || hLower.includes('net-') || hLower.includes('network')) {
    nodeType = 'network';
  } else if (h.nodeType === 'controller' || hLower.includes('control')) {
    nodeType = 'controller';
  }

  return {
    id: h.id,
    hostname: h.hostname,
    ip: h.hostIp,
    status: deriveStatus(h),
    nodeType,
    cpu: {
      usagePct: pct(h.vcpusUsed, h.vcpus),
      cores: h.vcpus,
      model: h.cpuModel,
    },
    ram: {
      usagePct: pct(h.memoryMbUsed, h.memoryMb),
      totalGb: totalRamGb,
      usedGb: usedRamGb,
    },
    disk: {
      usagePct: pct(h.localGbUsed, h.localGb),
      totalGb: h.localGb,
      usedGb: h.localGbUsed,
    },
    activeVMs: h.runningVms,
    uptime: h.uptime,
    services: h.services,
  };
}

function buildClusterStats(rows: ServerRow[], cinder?: CinderLimits | null): ClusterStats {
  const online = rows.filter((r) => r.status === 'online').length;
  const offline = rows.filter((r) => r.status === 'offline').length;
  const maintenance = rows.filter((r) => r.status === 'maintenance').length;
  const warning = rows.filter((r) => r.status === 'warning').length;

  const controllersCount = rows.filter((r) => r.nodeType === 'controller').length;
  const networkCount = rows.filter((r) => r.nodeType === 'network').length;
  const computesCount = rows.filter((r) => r.nodeType === 'compute').length;

  // CPU and RAM allocation metrics ONLY from compute nodes (where VMs are created)
  const computeRows = rows.filter((r) => r.nodeType === 'compute');
  const cpuCores = computeRows.reduce((s, r) => s + r.cpu.cores, 0);
  const cpuUsedCores = computeRows.reduce(
    (s, r) => s + Math.round((r.cpu.usagePct / 100) * r.cpu.cores),
    0
  );

  const ramTotalGb = computeRows.reduce((s, r) => s + r.ram.totalGb, 0);
  const ramUsedGb = computeRows.reduce((s, r) => s + r.ram.usedGb, 0);

  // Ceph Storage Cluster / Cinder Volume Usage (where volumes are created and attached to VMs)
  let diskTotalGb: number | string = 0;
  let diskUsedGb = 0;
  let diskUsedPct = 0;

  if (cinder) {
    if (cinder.poolTotalGb && cinder.poolTotalGb > 0) {
      diskTotalGb = Math.round(cinder.poolTotalGb);
      diskUsedGb = Math.round(cinder.totalGigabytesUsed);
      diskUsedPct = pct(diskUsedGb, diskTotalGb);
    } else if (cinder.maxTotalVolumeGigabytes > 0) {
      diskTotalGb = Math.round(cinder.maxTotalVolumeGigabytes);
      diskUsedGb = Math.round(cinder.totalGigabytesUsed);
      diskUsedPct = pct(diskUsedGb, diskTotalGb);
    } else if (cinder.maxTotalVolumeGigabytes === -1) {
      diskTotalGb = 'Unlimited';
      diskUsedGb = Math.round(cinder.totalGigabytesUsed);
      diskUsedPct = Math.min(100, Math.round((diskUsedGb / Math.max(100, diskUsedGb * 1.5)) * 100));
    } else {
      diskTotalGb = Math.round(computeRows.reduce((s, r) => s + r.disk.totalGb, 0));
      diskUsedGb = Math.round(cinder.totalGigabytesUsed || computeRows.reduce((s, r) => s + r.disk.usedGb, 0));
      diskUsedPct = typeof diskTotalGb === 'number' && diskTotalGb > 0 ? pct(diskUsedGb, diskTotalGb) : 0;
    }
  } else {
    const rawTotal = Math.round(computeRows.reduce((s, r) => s + r.disk.totalGb, 0));
    diskTotalGb = rawTotal;
    diskUsedGb = Math.round(computeRows.reduce((s, r) => s + r.disk.usedGb, 0));
    diskUsedPct = rawTotal > 0 ? pct(diskUsedGb, rawTotal) : 0;
  }

  return {
    total: rows.length,
    online,
    offline,
    maintenance,
    warning,
    controllersCount,
    networkCount,
    computesCount,
    cpuCores,
    cpuUsedCores,
    cpuUsedPct: pct(cpuUsedCores, cpuCores),
    ramTotalGb: Math.round(ramTotalGb * 10) / 10,
    ramUsedGb: Math.round(ramUsedGb * 10) / 10,
    ramUsedPct: pct(ramUsedGb, ramTotalGb),
    diskTotalGb,
    diskUsedGb,
    diskUsedPct,
    totalVMs: rows.reduce((s, r) => s + r.activeVMs, 0),
    totalVolumesUsed: cinder?.totalVolumesUsed,
    maxTotalVolumes: cinder?.maxTotalVolumes,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UsageBar({ pct: p, label }: { pct: number; label: string }) {
  const color = p >= 90 ? 'bg-red-500' : p >= 75 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(100, Math.max(0, p))}%` }} />
      </div>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: ServerStatus }) {
  const map: Record<ServerStatus, { style: string; icon: React.ReactNode; label: string }> = {
    online: {
      style: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <CheckCircle className="h-3.5 w-3.5" />,
      label: 'Hoạt động',
    },
    offline: {
      style: 'bg-red-50 text-red-700 border-red-200',
      icon: <XCircle className="h-3.5 w-3.5" />,
      label: 'Offline',
    },
    maintenance: {
      style: 'bg-blue-50 text-blue-700 border-blue-200',
      icon: <Wrench className="h-3.5 w-3.5" />,
      label: 'Bảo trì',
    },
    warning: {
      style: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      label: 'Cảnh báo',
    },
  };
  const { style, icon, label } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${style}`}
    >
      {icon}
      {label}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InfrastructurePage() {
  const [rows, setRows] = useState<ServerRow[]>([]);
  const [cluster, setCluster] = useState<ClusterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ServerStatus | 'controller' | 'compute' | 'network'>('all');

  const fetchData = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError('');

    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const [hypervisorRes, cinderRes] = await Promise.all([
        fetch('/api/openstack/hypervisors', { headers, cache: 'no-store' }),
        fetch('/api/openstack/volume-limits', { headers, cache: 'no-store' }).catch(() => null),
      ]);

      const json = (await hypervisorRes.json()) as {
        success?: boolean;
        data?: { hypervisors: HypervisorRecord[] };
        message?: string;
      };

      if (!json.success || !json.data) {
        throw new Error(json.message ?? 'Không thể lấy dữ liệu OpenStack hypervisors');
      }

      let cinder: CinderLimits | null = null;
      if (cinderRes && cinderRes.ok) {
        try {
          const cinderJson = (await cinderRes.json()) as {
            success?: boolean;
            data?: Record<string, any>;
          };
          if (cinderJson?.success && cinderJson.data) {
            cinder = {
              maxTotalVolumeGigabytes: Number(cinderJson.data.maxTotalVolumeGigabytes ?? 0),
              totalGigabytesUsed: Number(cinderJson.data.totalGigabytesUsed ?? 0),
              maxTotalVolumes: Number(cinderJson.data.maxTotalVolumes ?? 0),
              totalVolumesUsed: Number(cinderJson.data.totalVolumesUsed ?? 0),
              poolTotalGb: cinderJson.data.poolTotalGb ? Number(cinderJson.data.poolTotalGb) : undefined,
              poolFreeGb: cinderJson.data.poolFreeGb ? Number(cinderJson.data.poolFreeGb) : undefined,
              poolAllocatedGb: cinderJson.data.poolAllocatedGb ? Number(cinderJson.data.poolAllocatedGb) : undefined,
            };
          }
        } catch { }
      }

      const serverRows = (json.data.hypervisors || []).map(toServerRow);
      setRows(serverRows);
      setCluster(buildClusterStats(serverRows, cinder));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối tới hệ thống OpenStack');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchData(true);
  }, [fetchData]);

  const filtered = rows.filter((r) => {
    const matchSearch =
      r.hostname.toLowerCase().includes(searchQuery.toLowerCase()) || r.ip.includes(searchQuery);
    if (!matchSearch) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'controller') return r.nodeType === 'controller';
    if (statusFilter === 'network') return r.nodeType === 'network';
    if (statusFilter === 'compute') return r.nodeType === 'compute';
    return r.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Hạ tầng OpenStack</h1>
          <p className="mt-1 text-sm text-gray-500">
            Giám sát các Node điều khiển (Controller), Network Nodes, Compute Nodes và Cinder Storage
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchData(false)}
            disabled={loading || refreshing}
            className="text-xs"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Làm mới
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Cluster Overview Cards */}
      {loading && !cluster ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-2xl border border-gray-100 bg-gray-100"
            />
          ))}
        </div>
      ) : cluster ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-gray-200/70 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Tổng số Nodes</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{cluster.total}</p>
              </div>
              <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
                <Server className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                ● {cluster.online} Online
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                {cluster.controllersCount} Controller
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 font-medium text-teal-700">
                {cluster.networkCount} Network
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 font-medium text-sky-700">
                {cluster.computesCount} Compute
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200/70 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">vCPU Allocation</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{cluster.cpuUsedPct}%</p>
              </div>
              <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
                <Cpu className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4">
              <UsageBar
                pct={cluster.cpuUsedPct}
                label={`${cluster.cpuUsedCores} / ${cluster.cpuCores} vCPUs đã cấp`}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200/70 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">RAM Usage</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{cluster.ramUsedPct}%</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
                <MemoryStick className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4">
              <UsageBar
                pct={cluster.ramUsedPct}
                label={`${cluster.ramUsedGb} / ${cluster.ramTotalGb} GB`}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200/70 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Cinder Volume Usage</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {typeof cluster.diskTotalGb === 'number' && cluster.diskTotalGb > 0
                    ? `${cluster.diskUsedPct}%`
                    : `${cluster.diskUsedGb} GB`}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
                <HardDrive className="h-6 w-6" />
              </div>
            </div>
            <div className="mt-4">
              <UsageBar
                pct={cluster.diskUsedPct}
                label={
                  typeof cluster.diskTotalGb === 'number'
                    ? `${cluster.diskUsedGb} / ${cluster.diskTotalGb} GB`
                    : `${cluster.diskUsedGb} GB`
                }
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200/70 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { key: 'all', label: `Tất cả` },
              { key: 'controller', label: `Controller` },
              { key: 'network', label: `Network` },
              { key: 'compute', label: `Compute` },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo hostname, IP..."
            className="w-full rounded-xl border border-gray-300 py-2 pl-9 pr-4 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 md:w-72"
          />
        </div>
      </div>

      {/* Node Cards List */}
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((server) => {
            const isController = server.nodeType === 'controller';
            const isNetwork = server.nodeType === 'network';
            const cleanHostname = server.hostname
              .replace(/\.local/g, '')
              .replace(/\(Controller Node\)/gi, '')
              .replace(/\(Network Node\)/gi, '')
              .replace(/\(Compute Node\)/gi, '')
              .trim();

            return (
              <div
                key={server.id}
                className={`rounded-2xl border bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md ${
                  isController
                    ? 'border-indigo-100 bg-gradient-to-br from-white to-indigo-50/20'
                    : isNetwork
                    ? 'border-teal-100 bg-gradient-to-br from-white to-teal-50/20'
                    : 'border-gray-200/80'
                }`}
              >
                <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 pb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                          isController
                            ? 'bg-indigo-100 text-indigo-700'
                            : isNetwork
                            ? 'bg-teal-100 text-teal-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {isController ? (
                          <ShieldCheck className="h-4 w-4" />
                        ) : isNetwork ? (
                          <Radio className="h-4 w-4" />
                        ) : (
                          <Server className="h-4 w-4" />
                        )}
                      </div>
                      <h3 className="text-base font-bold text-gray-900">{cleanHostname}</h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          isController
                            ? 'bg-indigo-100 text-indigo-800'
                            : isNetwork
                            ? 'bg-teal-100 text-teal-800'
                            : 'bg-sky-100 text-sky-800'
                        }`}
                      >
                        {isController ? 'Controller Node' : isNetwork ? 'Network Node' : 'Compute Node'}
                      </span>
                      <StatusBadge status={server.status} />
                    </div>
                  </div>
                </div>

                {isController || isNetwork ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-600">vCPU Allocation</span>
                        <span className="font-bold text-gray-900">{server.cpu.usagePct}%</span>
                      </div>
                      <UsageBar pct={server.cpu.usagePct} label={`${server.cpu.cores} vCPUs tổng cộng`} />
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-600">Bộ nhớ RAM</span>
                        <span className="font-bold text-gray-900">{server.ram.usagePct}%</span>
                      </div>
                      <UsageBar
                        pct={server.ram.usagePct}
                        label={`${server.ram.usedGb} / ${server.ram.totalGb} GB`}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-600">vCPU Allocation</span>
                        <span className="font-bold text-gray-900">{server.cpu.usagePct}%</span>
                      </div>
                      <UsageBar pct={server.cpu.usagePct} label={`${server.cpu.cores} vCPUs tổng cộng`} />
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-600">Bộ nhớ RAM</span>
                        <span className="font-bold text-gray-900">{server.ram.usagePct}%</span>
                      </div>
                      <UsageBar
                        pct={server.ram.usagePct}
                        label={`${server.ram.usedGb} / ${server.ram.totalGb} GB`}
                      />
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-600">Local Disk</span>
                        <span className="font-bold text-gray-900">{server.disk.usagePct}%</span>
                      </div>
                      <UsageBar
                        pct={server.disk.usagePct}
                        label={`${server.disk.usedGb} / ${server.disk.totalGb} GB`}
                      />
                    </div>

                    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-600">VMs đang chạy</span>
                        <span className="font-bold text-blue-600">{server.activeVMs} VMs</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full bg-blue-600 transition-all"
                          style={{
                            width: `${Math.min((server.activeVMs / Math.max(server.cpu.cores, 1)) * 100, 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {server.activeVMs} máy ảo phân bổ trên compute node
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!loading && filtered.length === 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
              <Server className="mx-auto h-12 w-12 text-gray-300" />
              <h3 className="mt-4 text-base font-bold text-gray-900">
                {rows.length === 0 ? 'Chưa phát hiện OpenStack Node nào' : 'Không tìm thấy kết quả phù hợp'}
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                {rows.length === 0
                  ? 'Kiểm tra kết nối OpenStack API trong orchestration-service.'
                  : 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
