'use client';

import {
  ChevronDown,
  Edit,
  Lightbulb,
  Loader2,
  Lock,
  Network,
  Plus,
  Server,
  Settings,
  Trash,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { InstructorLayout } from '@laas-portal/ui';
import { Dialog } from '../../../../../components/dialog';
import { getStoredUser } from '../../../../../lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type NetworkZone = {
  id: string;
  name: string;
  note: string;
  cidr: string;
  gateway: string;
  dhcpStart: string;
  dhcpEnd: string;
  dnsServers: string[];
  hasInternet: boolean;
  connectedZoneIds: string[];
};

type GlanceImage = {
  name: string;
  laasImageType?: string;
  vmUsername?: string;
  vmPassword?: string;
  networkType?: string;
  networkCidr?: string;
  staticIp?: string;
};

type VmConfig = {
  id: string;
  nodeName: string;
  note: string;
  zoneIds: string[];
  zoneId: string;
  networkType: 'dhcp' | 'static';
  staticIp: string;
  operatingSystem: string;
  flavor: string;
  initialUsername: string;
  initialPassword: string;
  ansibleRepoUrl: string;
  command: string;
};

type Checkpoint = {
  id: string;
  name: string;
  description: string;
  points: number;
  vmId?: string;
  checkScript: string;
  hintCommand?: string;
};

type ModuleItem = {
  id: string;
  name: string;
  description?: string;
  orderNo: number;
  estimatedMinutes?: number;
  objectives?: string[];
  definitionJson?: {
    networkZones?: NetworkZone[];
    vmConfigs?: VmConfig[];
    checkpoints?: Checkpoint[];
  };
};

type LabTemplateDetail = {
  id: string;
  code: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string | null;
  difficulty?: string | null;
  status?: string | null;
  accessType?: 'PUBLIC' | 'RESTRICTED';
  tags?: string[] | null;
  metadata?: Record<string, any> | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidIpv4Address(ip: string): boolean {
  const octets = ip.split('.');
  if (octets.length !== 4) return false;
  return octets.every((o) => {
    if (o.trim() === '') return false;
    const v = Number(o);
    return Number.isInteger(v) && v >= 0 && v <= 255;
  });
}

function getGatewayFromCidr(cidr: string): string {
  const [ip] = cidr.trim().split('/');
  if (!ip || !isValidIpv4Address(ip)) return '';
  const parts = ip.split('.');
  return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
}

const BLOCKED_CIDRS = new Set([
  '192.168.2.0/24',
  '10.22.12.0/24',
  '10.73.0.0/24',
  '169.254.0.0/16',
  '10.71.85.0/16',
  '127.0.0.0/8',
]);

function getCidrError(cidr: string): string {
  const c = cidr.trim();
  if (!c) return 'CIDR là bắt buộc.';
  const [ip, prefix] = c.split('/');
  if (!ip || !prefix || c.split('/').length !== 2) return 'Định dạng đúng: 192.168.10.0/24';
  if (!isValidIpv4Address(ip)) return 'Địa chỉ IP không hợp lệ.';
  const p = Number(prefix);
  if (!Number.isInteger(p) || p < 0 || p > 32) return 'Subnet mask phải trong khoảng /0 - /32.';
  if (p < 24) return 'Subnet mask phải từ /24 trở lên.';
  if (BLOCKED_CIDRS.has(c)) return 'CIDR này đang được hệ thống sử dụng.';
  return '';
}

function getDhcpError(zone: NetworkZone): string {
  const s = zone.dhcpStart.trim();
  const e = zone.dhcpEnd.trim();
  if (!s && !e) return '';
  if (!s || !e) return 'DHCP range cần đủ start và end.';
  if (!isValidIpv4Address(s) || !isValidIpv4Address(e))
    return 'DHCP start/end phải là IPv4 hợp lệ.';
  const [net] = zone.cidr.split('/');
  if (!isValidIpv4Address(net || '')) return '';
  const pre = net.split('.').slice(0, 3).join('.');
  if (s.split('.').slice(0, 3).join('.') !== pre || e.split('.').slice(0, 3).join('.') !== pre)
    return 'DHCP range phải nằm trong cùng subnet của zone.';
  return '';
}

function ipToInt(ip: string): number | null {
  if (!isValidIpv4Address(ip)) return null;
  const [a, b, c, d] = ip.split('.').map(Number);
  return ((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0) + d;
}

function getStaticIpError(vm: VmConfig, zones: NetworkZone[]): string {
  if (vm.networkType !== 'static') return '';
  if (vm.zoneIds.length === 0) return 'VM static phải chọn ít nhất một zone.';
  const ip = vm.staticIp.trim();
  if (!ip) return 'Vui lòng nhập địa chỉ IP tĩnh.';
  if (!isValidIpv4Address(ip)) return 'Địa chỉ IP tĩnh không hợp lệ.';
  if (Number(ip.split('.')[3]) === 1) return 'Địa chỉ .1 được dành cho gateway.';
  const zone = zones[0];
  if (zone?.cidr) {
    const [net] = zone.cidr.split('/');
    if (isValidIpv4Address(net || '')) {
      if (ip.split('.').slice(0, 3).join('.') !== net.split('.').slice(0, 3).join('.'))
        return 'IP tĩnh phải thuộc cùng dải mạng với zone.';
    }
  }
  for (const z of zones) {
    if (z.dhcpStart.trim() && z.dhcpEnd.trim()) {
      const v = ipToInt(ip);
      const lo = ipToInt(z.dhcpStart.trim());
      const hi = ipToInt(z.dhcpEnd.trim());
      if (
        v !== null &&
        lo !== null &&
        hi !== null &&
        v >= Math.min(lo, hi) &&
        v <= Math.max(lo, hi)
      )
        return `IP tĩnh trùng DHCP range (${z.dhcpStart} – ${z.dhcpEnd}).`;
    }
  }
  return '';
}

function createEmptyZone(idx: number): NetworkZone {
  return {
    id: `zone-${idx + 1}-${Date.now()}`,
    name: '',
    note: '',
    cidr: '',
    gateway: '',
    dhcpStart: '',
    dhcpEnd: '',
    dnsServers: [],
    hasInternet: false,
    connectedZoneIds: [],
  };
}

function createEmptyVm(idx: number, os = '', flavor = ''): VmConfig {
  return {
    id: `vm-${idx + 1}-${Date.now()}`,
    nodeName: '',
    note: '',
    zoneIds: [],
    zoneId: '',
    networkType: 'dhcp',
    staticIp: '',
    operatingSystem: os,
    flavor,
    initialUsername: '',
    initialPassword: '',
    ansibleRepoUrl: '',
    command: '',
  };
}

function getBootVolumeSize(flavor: string): number {
  const map: Record<string, number> = {
    'lab.nano': 5,
    'lab.micro': 10,
    'lab.small': 15,
    'lab.medium': 20,
    'lab.large': 40,
    'lab.xlarge': 80,
    'lab.2xlarge': 160,
    'lab.db-small': 30,
    'lab.db-medium': 60,
    'lab.db-large': 120,
    'lab.compute': 20,
    'lab.memory': 20,
    'lab.win-small': 60,
    'lab.win-med': 100,
  };
  return map[flavor.trim().toLowerCase()] ?? 20;
}

function normalizeFlavorOption(f: { name: string; vcpus: number; ram: number }): string {
  const ramGb = Math.max(1, Math.round(f.ram / 1024));
  return `${f.name} (${f.vcpus} vCPU, ${ramGb}GB RAM, ${getBootVolumeSize(f.name)}GB Disk)`;
}

function generateCpId(name: string): string {
  return (
    'cp_' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 40)
  );
}

function parseDefinition(raw: unknown): {
  networkZones: NetworkZone[];
  vmConfigs: VmConfig[];
  checkpoints: Checkpoint[];
} {
  let def = raw;
  if (typeof def === 'string') {
    try {
      def = JSON.parse(def);
    } catch {
      def = {};
    }
  }
  const obj = (def && typeof def === 'object' ? def : {}) as Record<string, unknown>;
  const networkZones: NetworkZone[] =
    Array.isArray(obj.networkZones) && obj.networkZones.length > 0
      ? (obj.networkZones as NetworkZone[])
      : [createEmptyZone(0)];
  const vmConfigs: VmConfig[] =
    Array.isArray(obj.vmConfigs) && obj.vmConfigs.length > 0
      ? (obj.vmConfigs as VmConfig[])
      : [createEmptyVm(0)];
  const checkpoints: Checkpoint[] = Array.isArray(obj.checkpoints)
    ? (obj.checkpoints as Checkpoint[])
    : [];

  return { networkZones, vmConfigs, checkpoints };
}

// ─── Module Editor Modal ───────────────────────────────────────────────────────

type ModalMode = 'add' | 'edit';

function ModuleEditorModal({
  mode,
  module,
  labTemplateId,
  existingModuleCount,
  onSaved,
  onClose,
}: {
  mode: ModalMode;
  module?: ModuleItem;
  labTemplateId: string;
  existingModuleCount: number;
  onSaved: (m: ModuleItem) => void;
  onClose: () => void;
}): React.JSX.Element {
  const [currentTab, setCurrentTab] = useState('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const initialDef = parseDefinition(module?.definitionJson);

  // Basic info
  const [moduleName, setModuleName] = useState(module?.name ?? '');
  const [moduleDescription, setModuleDescription] = useState(module?.description ?? '');
  const [moduleOrderNo, setModuleOrderNo] = useState(module?.orderNo ?? existingModuleCount + 1);
  const [moduleEstimatedMinutes, setModuleEstimatedMinutes] = useState(
    module?.estimatedMinutes ?? 60
  );
  const [moduleObjectives, setModuleObjectives] = useState(
    Array.isArray(module?.objectives)
      ? module.objectives.join('\n')
      : typeof module?.objectives === 'string'
        ? module.objectives
        : ''
  );

  // Network
  const [networkZones, setNetworkZones] = useState<NetworkZone[]>(initialDef.networkZones);
  const [zoneCountInput, setZoneCountInput] = useState(String(initialDef.networkZones.length));

  // VMs
  const [osOptions, setOsOptions] = useState<GlanceImage[]>([]);
  const [flavorOptions, setFlavorOptions] = useState<string[]>([]);
  const [vmConfigs, setVmConfigs] = useState<VmConfig[]>(initialDef.vmConfigs);
  const [vmCountInput, setVmCountInput] = useState(String(initialDef.vmConfigs.length));

  // Checkpoints
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>(initialDef.checkpoints);
  const [newCpName, setNewCpName] = useState('');
  const [newCpDesc, setNewCpDesc] = useState('');
  const [newCpPoints, setNewCpPoints] = useState(10);
  const [newCpVmId, setNewCpVmId] = useState('');
  const [newCpScript, setNewCpScript] = useState('');
  const [newCpHintCommand, setNewCpHintCommand] = useState('');

  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    if (module) {
      const def = parseDefinition(module.definitionJson);
      setModuleName(module.name ?? '');
      setModuleDescription(module.description ?? '');
      setModuleOrderNo(module.orderNo);
      setModuleEstimatedMinutes(module.estimatedMinutes ?? 60);
      setModuleObjectives(
        Array.isArray(module.objectives)
          ? module.objectives.join('\n')
          : typeof module.objectives === 'string'
            ? module.objectives
            : ''
      );
      setNetworkZones(def.networkZones);
      setZoneCountInput(String(def.networkZones.length));
      setVmConfigs(def.vmConfigs);
      setVmCountInput(String(def.vmConfigs.length));
      setCheckpoints(def.checkpoints);
    } else {
      setModuleName('');
      setModuleDescription('');
      setModuleOrderNo(existingModuleCount + 1);
      setModuleEstimatedMinutes(60);
      setModuleObjectives('');
      setNetworkZones([createEmptyZone(0)]);
      setZoneCountInput('1');
      setVmConfigs([createEmptyVm(0)]);
      setVmCountInput('1');
      setCheckpoints([]);
    }
  }, [module, existingModuleCount]);

  useEffect(() => {
    setIsClient(true);
    let active = true;

    async function loadOptions() {
      try {
        const [imgRes, flvRes, repoRes] = await Promise.all([
          fetch('/api/images?userId=admin-portal-user', { method: 'GET', cache: 'no-store' }),
          fetch('/api/flavors?userId=admin-portal-user', { method: 'GET', cache: 'no-store' }),
          fetch('/api/repository-images', { method: 'GET', cache: 'no-store' }).catch(() => null),
        ]);

        const customImageNames = new Set<string>();
        if (repoRes && repoRes.ok) {
          try {
            const repoPayload = (await repoRes.json()) as { data?: { images?: Array<Record<string, unknown>> } };
            const repoList = repoPayload.data?.images || [];
            for (const r of repoList) {
              if (r.name) customImageNames.add(String(r.name).trim().toLowerCase());
              if (r.slug) customImageNames.add(String(r.slug).trim().toLowerCase());
            }
          } catch {}
        }

        if (imgRes.ok) {
          const imgPayload = (await imgRes.json()) as {
            success?: boolean;
            data?: { images?: Array<Record<string, unknown>> };
          };
          if (imgPayload?.success && imgPayload.data?.images) {
            const imgs: GlanceImage[] = (imgPayload.data.images ?? [])
              .map((item) => {
                const name = String(item.name ?? '').trim();
                const lowerName = name.toLowerCase();
                const isCustom =
                  item.laasImageType === 'custom' ||
                  item['laas_image_type'] === 'custom' ||
                  customImageNames.has(lowerName) ||
                  lowerName.includes('-image') ||
                  lowerName.includes('custom') ||
                  lowerName.includes('bind');

                return {
                  name,
                  laasImageType: isCustom ? 'custom' : undefined,
                  vmUsername: item.vmUsername ? String(item.vmUsername) : undefined,
                  vmPassword: item.vmPassword ? String(item.vmPassword) : undefined,
                  networkType: item.networkType ? String(item.networkType) : undefined,
                  networkCidr: item.networkCidr ? String(item.networkCidr) : undefined,
                  staticIp: item.staticIp ? String(item.staticIp) : undefined,
                };
              })
              .filter((img) => img.name);
            if (active && imgs.length) setOsOptions(imgs);
          }
        }

        if (flvRes.ok) {
          const flvPayload = (await flvRes.json()) as {
            success?: boolean;
            data?: {
              flavors?: Array<{ name?: unknown; vcpus?: unknown; ram?: unknown; disk?: unknown }>;
            };
          };
          if (flvPayload?.success && flvPayload.data?.flavors) {
            const flavors = (flvPayload.data.flavors ?? [])
              .map((f) => ({
                name: String(f.name ?? ''),
                vcpus: Number(f.vcpus ?? 0),
                ram: Number(f.ram ?? 0),
                disk: Number(f.disk ?? 0),
              }))
              .filter((f) => f.name)
              .map(normalizeFlavorOption);
            if (active && flavors.length) setFlavorOptions(flavors);
          }
        }
      } catch {
        // options remain empty
      }
    }

    void loadOptions();
    return () => {
      active = false;
    };
  }, []);

  // Keep VM zone membership in sync when zones change.
  useEffect(() => {
    const zoneSet = new Set(networkZones.map((z) => z.id));
    setVmConfigs((prev) => {
      const next = prev.map((vm) => ({
        ...vm,
        zoneIds: (Array.isArray(vm.zoneIds) ? vm.zoneIds : []).filter((id) => zoneSet.has(id)),
      }));
      const changed = next.some((vm, i) => vm.zoneIds.length !== prev[i]?.zoneIds?.length);
      return changed ? next : prev;
    });
  }, [networkZones]);

  const tabs = [
    { id: 'basic', name: 'Cơ bản', icon: Settings },
    { id: 'network', name: 'Network', icon: Network },
    { id: 'vms', name: 'Virtual Machines', icon: Server },
    { id: 'checkpoint', name: 'Checkpoint', icon: Edit },
  ];

  // ── Zone helpers ──
  const updateZoneCidr = (zoneId: string, cidr: string) => {
    setNetworkZones((prev) =>
      prev.map((z) => {
        if (z.id !== zoneId) return z;
        const prevGw = getGatewayFromCidr(z.cidr);
        const nextGw = getGatewayFromCidr(cidr);
        return { ...z, cidr, gateway: !z.gateway || z.gateway === prevGw ? nextGw : z.gateway };
      })
    );
  };

  const updateZoneField = <K extends keyof NetworkZone>(
    id: string,
    field: K,
    val: NetworkZone[K]
  ) => setNetworkZones((prev) => prev.map((z) => (z.id === id ? { ...z, [field]: val } : z)));

  const toggleZoneConn = (zoneId: string, targetId: string) =>
    setNetworkZones((prev) =>
      prev.map((z) => {
        if (z.id !== zoneId) return z;
        const has = z.connectedZoneIds.includes(targetId);
        return {
          ...z,
          connectedZoneIds: has
            ? z.connectedZoneIds.filter((id) => id !== targetId)
            : [...z.connectedZoneIds, targetId],
        };
      })
    );

  const syncZoneCount = (count: number) => {
    const safe = Math.max(1, count);
    setNetworkZones((prev) => {
      if (safe === prev.length) return prev;
      if (safe < prev.length) return prev.slice(0, safe);
      const next = [...prev];
      while (next.length < safe) next.push(createEmptyZone(next.length));
      return next;
    });
  };

  const removeZone = (zoneId: string) => {
    const next = networkZones
      .filter((z) => z.id !== zoneId)
      .map((z) => ({ ...z, connectedZoneIds: z.connectedZoneIds.filter((id) => id !== zoneId) }));
    setNetworkZones(next);
    setZoneCountInput(String(next.length || 1));
    setVmConfigs((prev) =>
      prev.map((vm) => ({ ...vm, zoneIds: vm.zoneIds.filter((id) => id !== zoneId) }))
    );
  };

  // ── VM helpers ──
  const updateVmField = <K extends keyof VmConfig>(vmId: string, field: K, val: VmConfig[K]) =>
    setVmConfigs((prev) => prev.map((vm) => (vm.id === vmId ? { ...vm, [field]: val } : vm)));

  const syncVmCount = (count: number) => {
    const safe = Math.max(1, count);
    setVmConfigs((prev) => {
      if (safe === prev.length) return prev;
      if (safe < prev.length) return prev.slice(0, safe);
      const next = [...prev];
      while (next.length < safe)
        next.push(createEmptyVm(next.length, osOptions[0]?.name ?? '', flavorOptions[0] ?? ''));
      return next;
    });
  };

  // ── Checkpoint helpers ──
  const addCheckpoint = () => {
    const name = newCpName.trim();
    if (!name) return;
    const id = generateCpId(name);
    if (checkpoints.some((c) => c.id === id)) return;
    setCheckpoints((prev) => [
      ...prev,
      {
        id,
        name,
        description: newCpDesc.trim(),
        points: newCpPoints,
        vmId: newCpVmId || undefined,
        checkScript: newCpScript.trim(),
        hintCommand: newCpHintCommand.trim() || undefined,
      },
    ]);
    setNewCpName('');
    setNewCpDesc('');
    setNewCpPoints(10);
    setNewCpVmId('');
    setNewCpScript('');
    setNewCpHintCommand('');
  };

  // ── Save ──
  const handleSave = async () => {
    if (!moduleName.trim()) {
      setModalError('Vui lòng nhập tên module.');
      return;
    }

    for (const zone of networkZones) {
      const err = getDhcpError(zone);
      if (err) {
        setModalError(`Zone ${zone.name || zone.id}: ${err}`);
        return;
      }
      if (zone.dnsServers.length > 5) {
        setModalError(`Zone ${zone.name || zone.id}: tối đa 5 DNS.`);
        return;
      }
    }

    const zoneById = new Map(networkZones.map((z) => [z.id, z]));
    for (const vm of vmConfigs) {
      if (vm.zoneIds.length === 0) {
        setModalError(`VM ${vm.nodeName || vm.id}: cần chọn ít nhất một zone.`);
        return;
      }
      const vmZones = vm.zoneIds
        .map((id) => zoneById.get(id))
        .filter((z): z is NetworkZone => Boolean(z));
      if (vm.networkType === 'dhcp') {
        const missing = vmZones.find((z) => !(z.dhcpStart.trim() && z.dhcpEnd.trim()));
        if (missing) {
          setModalError(
            `VM ${vm.nodeName || vm.id}: zone ${missing.name || missing.id} chưa có DHCP range.`
          );
          return;
        }
      }
      const ipErr = getStaticIpError(vm, vmZones);
      if (ipErr) {
        setModalError(`VM ${vm.nodeName || vm.id}: ${ipErr}`);
        return;
      }
    }

    const objectives = moduleObjectives
      .split('\n')
      .map((l) => l.replace(/^-\s*/, '').trim())
      .filter(Boolean);
    const definitionJson = { networkZones, vmConfigs, checkpoints };
    const storedUser = getStoredUser();
    const currentUserId = storedUser?.id || 'instructor-user';

    const payload = {
      name: moduleName.trim(),
      description: moduleDescription.trim() || undefined,
      orderNo: moduleOrderNo,
      estimatedMinutes: moduleEstimatedMinutes,
      objectives,
      definitionJson,
      updatedById: currentUserId,
    };

    setIsSaving(true);
    setModalError('');
    try {
      let res: Response;
      if (mode === 'edit' && module?.id) {
        res = await fetch(`/api/modules/${module.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`/api/lab-templates/${labTemplateId}/modules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            createdById: currentUserId,
            createdBySnapshot: { source: 'instructor-portal' },
          }),
        });
      }
      const json = (await res.json()) as { success?: boolean; data?: ModuleItem; message?: string };
      if (!res.ok || !json.success) throw new Error(json.message ?? 'Lưu module thất bại');
      const savedMod: ModuleItem = {
        id: json.data?.id ?? module?.id ?? '',
        name: json.data?.name ?? moduleName.trim(),
        description: json.data?.description ?? (moduleDescription.trim() || undefined),
        orderNo: json.data?.orderNo ?? moduleOrderNo,
        estimatedMinutes: json.data?.estimatedMinutes ?? moduleEstimatedMinutes,
        objectives: json.data?.objectives ?? objectives,
        definitionJson: json.data?.definitionJson ?? definitionJson,
      };
      onSaved(savedMod);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Lưu thất bại');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isClient) return <></>;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
        {/* Header + Tabs */}
        <div className="sticky top-0 z-10 border-b border-gray-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">
              {mode === 'edit' ? 'Chỉnh sửa Module' : 'Thêm Module Mới'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="mt-4 flex gap-2 border-b border-gray-200">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCurrentTab(tab.id)}
                  className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                    currentTab === tab.id
                      ? 'border-orange-500 text-orange-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {/* ── Basic tab ── */}
          {currentTab === 'basic' && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Tên module <span className="text-red-500">*</span>
                </label>
                <input
                  value={moduleName}
                  onChange={(e) => setModuleName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="VD: Web Server Configuration"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Mô tả</label>
                <textarea
                  rows={4}
                  value={moduleDescription}
                  onChange={(e) => setModuleDescription(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="Mô tả mục đích và nội dung của module..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Order</label>
                  <input
                    type="number"
                    min="1"
                    value={moduleOrderNo}
                    onChange={(e) => setModuleOrderNo(Number(e.target.value) || 1)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Thời gian ước tính (phút)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={moduleEstimatedMinutes}
                    onChange={(e) => setModuleEstimatedMinutes(Number(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Objectives</label>
                <textarea
                  rows={3}
                  value={moduleObjectives}
                  onChange={(e) => setModuleObjectives(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  placeholder="- Objective 1&#10;- Objective 2"
                />
              </div>
            </div>
          )}

          {/* ── Network tab ── */}
          {currentTab === 'network' && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Số lượng zone mạng <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={zoneCountInput}
                  onChange={(e) => {
                    setZoneCountInput(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 1) syncZoneCount(n);
                  }}
                  onBlur={() => {
                    const n = Number(zoneCountInput);
                    if (!Number.isInteger(n) || n < 1)
                      setZoneCountInput(String(networkZones.length));
                  }}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
              </div>
              {networkZones.map((zone, idx) => {
                const cidrErr = getCidrError(zone.cidr);
                const connectable = networkZones.filter((z) => z.id !== zone.id);
                return (
                  <div key={zone.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">Zone mạng #{idx + 1}</h4>
                      {networkZones.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeZone(zone.id)}
                          className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Tên zone mạng
                        </label>
                        <input
                          value={zone.name}
                          onChange={(e) => updateZoneField(zone.id, 'name', e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          placeholder={`zone-${idx + 1}`}
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Vai trò / phạm vi sử dụng
                        </label>
                        <textarea
                          rows={2}
                          value={zone.note}
                          onChange={(e) => updateZoneField(zone.id, 'note', e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          placeholder="VD: Zone cho ứng dụng nội bộ"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          CIDR <span className="text-red-500">*</span>
                        </label>
                        <input
                          value={zone.cidr}
                          onChange={(e) => updateZoneCidr(zone.id, e.target.value)}
                          className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                            cidrErr
                              ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                              : 'border-gray-300 focus:border-orange-500 focus:ring-orange-200'
                          }`}
                          placeholder="192.168.10.0/24"
                        />
                        {cidrErr ? (
                          <p className="mt-1 text-xs text-red-500">{cidrErr}</p>
                        ) : (
                          <p className="mt-1 text-xs text-gray-500">Subnet mask từ /24 đến /32.</p>
                        )}
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Gateway
                        </label>
                        <input
                          value={zone.gateway}
                          onChange={(e) => updateZoneField(zone.id, 'gateway', e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          placeholder="192.168.10.1"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            DHCP Start
                          </label>
                          <input
                            value={zone.dhcpStart}
                            onChange={(e) => updateZoneField(zone.id, 'dhcpStart', e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                            placeholder="192.168.10.100"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            DHCP End
                          </label>
                          <input
                            value={zone.dhcpEnd}
                            onChange={(e) => updateZoneField(zone.id, 'dhcpEnd', e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                            placeholder="192.168.10.200"
                          />
                        </div>
                      </div>
                      {getDhcpError(zone) && (
                        <p className="-mt-2 text-xs text-red-500">{getDhcpError(zone)}</p>
                      )}
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          DNS (tối đa 5, cách nhau dấu phẩy)
                        </label>
                        <input
                          value={zone.dnsServers.join(', ')}
                          onChange={(e) => {
                            const dns = e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean)
                              .slice(0, 5);
                            updateZoneField(zone.id, 'dnsServers', dns);
                          }}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                          placeholder="8.8.8.8, 1.1.1.1"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id={`internet-${zone.id}`}
                          type="checkbox"
                          checked={zone.hasInternet}
                          onChange={(e) =>
                            updateZoneField(zone.id, 'hasInternet', e.target.checked)
                          }
                          className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-200"
                        />
                        <label
                          htmlFor={`internet-${zone.id}`}
                          className="text-sm font-medium text-gray-700"
                        >
                          Cho phép truy cập Internet
                        </label>
                      </div>
                      {connectable.length > 0 && (
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Kết nối với các zone khác
                          </label>
                          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                            {connectable.map((tz) => {
                              const n = networkZones.findIndex((z) => z.id === tz.id) + 1;
                              return (
                                <label
                                  key={`${zone.id}-${tz.id}`}
                                  className="flex items-center gap-2 text-sm text-gray-700"
                                >
                                  <input
                                    type="checkbox"
                                    checked={zone.connectedZoneIds.includes(tz.id)}
                                    onChange={() => toggleZoneConn(zone.id, tz.id)}
                                    className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-200"
                                  />
                                  {tz.name.trim() || `Zone mạng #${n}`}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setNetworkZones((prev) => {
                    const next = [...prev, createEmptyZone(prev.length)];
                    setZoneCountInput(String(next.length));
                    return next;
                  });
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-3 text-sm font-medium text-gray-600 hover:border-orange-500 hover:bg-orange-50 hover:text-orange-600"
              >
                <Plus className="h-4 w-4" /> Thêm zone mạng
              </button>
            </div>
          )}

          {/* ── VMs tab ── */}
          {currentTab === 'vms' && (
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Số lượng VM <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={vmCountInput}
                  onChange={(e) => {
                    setVmCountInput(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 1) syncVmCount(n);
                  }}
                  onBlur={() => {
                    const n = Number(vmCountInput);
                    if (!Number.isInteger(n) || n < 1) setVmCountInput(String(vmConfigs.length));
                  }}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {vmConfigs.map((vm, idx) => {
                const selectedZones = networkZones.filter((z) =>
                  (Array.isArray(vm.zoneIds) ? vm.zoneIds : []).includes(z.id)
                );
                const ipErr = getStaticIpError(vm, selectedZones);
                const selectedImage = osOptions.find((img) => img.name === vm.operatingSystem);
                const isGolden =
                  selectedImage?.laasImageType === 'custom' ||
                  vm.operatingSystem.toLowerCase().includes('-image') ||
                  vm.operatingSystem.toLowerCase().includes('bind') ||
                  vm.operatingSystem.toLowerCase().includes('custom');

                return (
                  <div key={vm.id} className="rounded-lg border border-gray-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="font-semibold text-gray-900">Máy ảo #{idx + 1}</h4>
                      {vmConfigs.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setVmConfigs((prev) => {
                              const next = prev.filter((v) => v.id !== vm.id);
                              setVmCountInput(String(next.length));
                              return next;
                            })
                          }
                          className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      )}
                    </div>

                    <div className="space-y-4">
                      {/* Golden Image Mode Alert */}
                      {isGolden && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                          <div className="flex items-start gap-3">
                            <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                            <div className="flex-1 text-xs text-amber-800">
                              <p className="font-semibold">Golden Image Mode</p>
                              <p className="mt-0.5">
                                Image này đã được cấu hình sẵn — các trường mạng và tài khoản đã bị khóa. Cloud-init đã bị tắt, bỏ qua bootstrap script.
                              </p>
                              {selectedImage?.networkCidr && (
                                <p className="mt-1.5 font-mono">
                                  Zone mạng phải dùng CIDR:{' '}
                                  <span className="rounded bg-amber-200 px-1 py-0.5 font-bold text-amber-900">
                                    {selectedImage.networkCidr}
                                  </span>
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setCurrentTab('network')}
                              className="flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
                            >
                              <Network className="h-3.5 w-3.5" />
                              Cấu hình zone mạng phù hợp
                            </button>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Tên node
                        </label>
                        <input
                          value={vm.nodeName}
                          onChange={(e) => updateVmField(vm.id, 'nodeName', e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder={`node-${idx + 1}`}
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Vai trò vận hành
                        </label>
                        <textarea
                          rows={2}
                          value={vm.note}
                          onChange={(e) => updateVmField(vm.id, 'note', e.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="VD: Control plane, worker node, database..."
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Zone mạng <span className="text-red-500">*</span>
                        </label>
                        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                          {networkZones.map((z, zi) => (
                            <label
                              key={`${vm.id}-${z.id}`}
                              className="flex items-center gap-2 text-sm text-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={(Array.isArray(vm.zoneIds) ? vm.zoneIds : []).includes(z.id)}
                                onChange={(e) =>
                                  updateVmField(
                                    vm.id,
                                    'zoneIds',
                                    e.target.checked
                                      ? Array.from(new Set([...(Array.isArray(vm.zoneIds) ? vm.zoneIds : []), z.id]))
                                      : (Array.isArray(vm.zoneIds) ? vm.zoneIds : []).filter((id) => id !== z.id)
                                  )
                                }
                                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                              />
                              {z.name.trim() || `Zone mạng #${zi + 1}`}
                            </label>
                          ))}
                        </div>
                        {(Array.isArray(vm.zoneIds) ? vm.zoneIds : []).length === 0 && networkZones.length > 0 && (
                          <p className="mt-1 text-xs text-red-500">
                            VM phải chọn ít nhất một zone.
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Hệ điều hành
                          </label>
                          {(() => {
                            const baseImages = osOptions.filter((img) => img.laasImageType !== 'custom');
                            const customImages = osOptions.filter((img) => img.laasImageType === 'custom');
                            const osNameInList = osOptions.some((img) => img.name === vm.operatingSystem);
                            return (
                              <select
                                value={vm.operatingSystem}
                                onChange={(event) => {
                                  const chosen = osOptions.find((img) => img.name === event.target.value);
                                  updateVmField(vm.id, 'operatingSystem', event.target.value);
                                  if (chosen?.laasImageType === 'custom') {
                                    if (chosen.networkType) {
                                      updateVmField(vm.id, 'networkType', chosen.networkType as 'dhcp' | 'static');
                                    }
                                    if (chosen.staticIp) {
                                      updateVmField(vm.id, 'staticIp', chosen.staticIp);
                                    }
                                    if (chosen.vmUsername) {
                                      updateVmField(vm.id, 'initialUsername', chosen.vmUsername);
                                    }
                                    if (chosen.vmPassword) {
                                      updateVmField(vm.id, 'initialPassword', chosen.vmPassword);
                                    }
                                  }
                                }}
                                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              >
                                {osOptions.length === 0 && (
                                  <option value="">Chưa có OS từ OpenStack</option>
                                )}
                                {baseImages.length > 0 && (
                                  <optgroup label="— Base image —">
                                    {baseImages.map((img) => (
                                      <option key={img.name} value={img.name}>
                                        {img.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {customImages.length > 0 && (
                                  <optgroup label="— Custom image —">
                                    {customImages.map((img) => (
                                      <option key={img.name} value={img.name}>
                                        🔒 {img.name}
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                {!osNameInList && vm.operatingSystem && (
                                  <option value={vm.operatingSystem}>{vm.operatingSystem}</option>
                                )}
                              </select>
                            );
                          })()}
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Flavor tài nguyên
                          </label>
                          <select
                            value={vm.flavor}
                            onChange={(e) => updateVmField(vm.id, 'flavor', e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            {flavorOptions.length === 0 && (
                              <option value="">Chưa có Flavor từ OpenStack</option>
                            )}
                            {flavorOptions.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                            {vm.flavor && !flavorOptions.includes(vm.flavor) && (
                              <option value={vm.flavor}>{vm.flavor}</option>
                            )}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700">
                          Cơ chế cấp phát IP
                          {isGolden && <Lock className="h-3 w-3 text-amber-500" />}
                        </label>
                        <select
                          value={vm.networkType}
                          disabled={isGolden}
                          onChange={(e) =>
                            updateVmField(vm.id, 'networkType', e.target.value as 'dhcp' | 'static')
                          }
                          className={`w-full rounded-lg border px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                            isGolden ? 'cursor-not-allowed bg-amber-50 text-gray-500' : 'border-gray-300'
                          }`}
                        >
                          <option value="dhcp">DHCP (cấp phát động)</option>
                          <option value="static">Static IP (cấu hình tĩnh)</option>
                        </select>
                      </div>

                      {vm.networkType === 'static' && (
                        <div>
                          <label className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700">
                            Địa chỉ IP tĩnh
                            {isGolden && <Lock className="h-3 w-3 text-amber-500" />}
                          </label>
                          <input
                            value={isGolden ? (selectedImage?.staticIp || vm.staticIp) : vm.staticIp}
                            disabled={isGolden}
                            onChange={(e) => updateVmField(vm.id, 'staticIp', e.target.value)}
                            className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                              isGolden
                                ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-gray-500'
                                : ipErr
                                  ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                                  : 'border-gray-300 focus:border-primary focus:ring-primary/20'
                            }`}
                            placeholder="192.168.10.10"
                          />
                          {!isGolden && ipErr && <p className="mt-1 text-xs text-red-500">{ipErr}</p>}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700">
                            Username khởi tạo
                            {isGolden && <Lock className="h-3 w-3 text-amber-500" />}
                          </label>
                          <input
                            value={isGolden ? (selectedImage?.vmUsername || vm.initialUsername) : vm.initialUsername}
                            disabled={isGolden}
                            onChange={(e) =>
                              updateVmField(vm.id, 'initialUsername', e.target.value)
                            }
                            className={`w-full rounded-lg border px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                              isGolden ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-gray-500' : 'border-gray-300'
                            }`}
                            placeholder="admin"
                          />
                        </div>
                        <div>
                          <label className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700">
                            Password khởi tạo
                            {isGolden && <Lock className="h-3 w-3 text-amber-500" />}
                          </label>
                          <input
                            type={isGolden ? 'text' : 'password'}
                            value={isGolden ? (selectedImage?.vmPassword || vm.initialPassword) : vm.initialPassword}
                            disabled={isGolden}
                            onChange={(e) =>
                              updateVmField(vm.id, 'initialPassword', e.target.value)
                            }
                            className={`w-full rounded-lg border px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                              isGolden ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-gray-500' : 'border-gray-300'
                            }`}
                            placeholder="••••••••"
                          />
                        </div>
                      </div>

                      {!isGolden && (
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Ansible repo URL
                          </label>
                          <input
                            type="url"
                            value={vm.ansibleRepoUrl}
                            onChange={(e) => updateVmField(vm.id, 'ansibleRepoUrl', e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="https://github.com/..."
                          />
                        </div>
                      )}

                      {!isGolden && (
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Command (inject vào provision.sh)
                          </label>
                          <textarea
                            rows={5}
                            value={vm.command}
                            onChange={(e) => updateVmField(vm.id, 'command', e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="echo 'Prepare environment'"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() =>
                  setVmConfigs((prev) => {
                    const next = [
                      ...prev,
                      createEmptyVm(prev.length, osOptions[0]?.name ?? '', flavorOptions[0] ?? ''),
                    ];
                    setVmCountInput(String(next.length));
                    return next;
                  })
                }
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-3 text-sm font-medium text-gray-600 hover:border-primary hover:bg-primary/10 hover:text-primary"
              >
                <Plus className="h-4 w-4" /> Thêm máy ảo
              </button>
            </div>
          )}

          {/* ── Checkpoint tab ── */}
          {currentTab === 'checkpoint' && (
            <div className="space-y-5">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex gap-3">
                  <Lightbulb className="h-5 w-5 flex-shrink-0 text-blue-600" />
                  <div className="text-sm text-blue-800">
                    <p className="font-semibold">
                      Checkpoint tự động kiểm tra (Heat WaitCondition)
                    </p>
                    <p className="mt-1">
                      Mỗi checkpoint tương ứng một <strong>WaitCondition</strong> trong Heat Template. Script check chạy định kỳ trên VM — khi điều kiện thỏa mãn, gọi{' '}
                      <code className="rounded bg-blue-100 px-1 font-mono text-xs">
                        {'curl … ${CP_ID}'}
                      </code>{' '}
                      để hoàn thành checkpoint.
                    </p>
                  </div>
                </div>
              </div>

              {/* Add checkpoint form */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <p className="mb-3 text-sm font-medium text-gray-700">Thêm checkpoint mới</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    value={newCpName}
                    onChange={(e) => setNewCpName(e.target.value)}
                    placeholder="Tên checkpoint (VD: Nginx Running)"
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
                  />
                  <input
                    value={newCpDesc}
                    onChange={(e) => setNewCpDesc(e.target.value)}
                    placeholder="Mô tả (tuỳ chọn)"
                    className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
                  />
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-sm text-gray-600">
                    VM node{' '}
                    <span className="text-gray-400">
                      — cloud-init sẽ tạo file check riêng trên VM này
                    </span>
                  </label>
                  <select
                    value={newCpVmId}
                    onChange={(e) => setNewCpVmId(e.target.value)}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
                  >
                    <option value="">— Chọn VM node —</option>
                    {vmConfigs.map((vm, i) => (
                      <option key={vm.id} value={vm.id}>
                        {vm.nodeName || `VM ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex flex-wrap items-baseline gap-2">
                    <label className="text-sm text-gray-600">
                      Script check
                    </label>
                    {newCpName.trim() && (
                      <span className="font-mono text-xs text-gray-400">
                        →{' '}
                        <span className="text-orange-600 font-medium">
                          /var/cp_{generateCpId(newCpName).replace(/^cp_/, '')}.sh
                        </span>
                      </span>
                    )}
                  </div>
                  {newCpName.trim() && (
                    <p className="mb-1.5 font-mono text-xs text-gray-400">
                      Biến tín hiệu:{' '}
                      <span className="text-yellow-600 font-semibold">
                        {'${CP_'}
                        {generateCpId(newCpName).replace(/^cp_/, '').toUpperCase()}
                        {'}'}
                      </span>
                    </p>
                  )}
                  <textarea
                    rows={7}
                    value={newCpScript}
                    onChange={(e) => setNewCpScript(e.target.value)}
                    placeholder={`#!/bin/bash\nwhile true; do\n  if systemctl is-active --quiet nginx; then\n    curl -X POST -d '{"status":"SUCCESS"}' \${CP_NGINX_RUNNING}\n    break\n  fi\n  sleep 5\ndone`}
                    className="w-full rounded-md border border-gray-200 bg-gray-900 px-3 py-2 font-mono text-xs text-green-400 outline-none focus:border-orange-500"
                    spellCheck={false}
                  />
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-sm text-gray-600">Gợi ý lệnh (Hint command)</label>
                  <textarea
                    value={newCpHintCommand}
                    onChange={(e) => setNewCpHintCommand(e.target.value)}
                    placeholder={
                      'VD:\n# Kiểm tra dịch vụ nginx\nsystemctl status nginx\n\n# Xem log\njournalctl -u nginx -n 20'
                    }
                    rows={4}
                    className="w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-orange-500"
                  />
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="shrink-0 text-sm text-gray-600">Điểm:</label>
                  <input
                    type="number"
                    min={0}
                    value={newCpPoints}
                    onChange={(e) => setNewCpPoints(Number(e.target.value))}
                    className="w-20 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
                  />
                  <button
                    onClick={addCheckpoint}
                    disabled={!newCpName.trim() || !newCpVmId}
                    className="ml-auto flex items-center gap-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-40"
                  >
                    <Plus className="h-4 w-4" /> Thêm checkpoint
                  </button>
                </div>
                {newCpName.trim() && !newCpVmId && (
                  <p className="mt-2 text-xs text-amber-600">
                    Vui lòng chọn VM node để gán checkpoint này.
                  </p>
                )}
              </div>

              {/* Checkpoint list */}
              {checkpoints.length === 0 ? (
                <p className="text-center text-sm text-gray-400">Chưa có checkpoint nào</p>
              ) : (
                <div className="space-y-3">
                  {checkpoints.map((cp, idx) => {
                    const assignedVm = vmConfigs.find((v) => v.id === cp.vmId);
                    const envVar = `CP_${cp.id.replace(/^cp_/, '').toUpperCase()}`;
                    return (
                      <div key={cp.id} className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                                {idx + 1}
                              </span>
                              <span className="font-medium text-gray-900">{cp.name}</span>
                              {cp.points > 0 && (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                                  {cp.points} điểm
                                </span>
                              )}
                              {assignedVm ? (
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                                  {assignedVm.nodeName || `VM ${vmConfigs.indexOf(assignedVm) + 1}`}
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                                  Chưa gán VM
                                </span>
                              )}
                            </div>
                            {cp.description && (
                              <p className="mt-1 pl-8 text-xs text-gray-500">{cp.description}</p>
                            )}
                            {cp.hintCommand && (
                              <div className="mt-2 pl-8">
                                <p className="mb-1 flex items-center gap-1 text-xs text-gray-400">
                                  <Lightbulb className="h-3 w-3" /> Hint command:
                                </p>
                                <code className="block whitespace-pre-wrap rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
                                  {cp.hintCommand}
                                </code>
                              </div>
                            )}
                            <div className="mt-3 pl-8">
                              <div className="mb-1 flex items-baseline gap-2">
                                <p className="text-xs font-medium text-gray-500">Script check</p>
                                <span className="font-mono text-xs text-orange-600">
                                  /var/cp_{cp.id.replace(/^cp_/, '')}.sh
                                </span>
                              </div>
                              {cp.checkScript ? (
                                <pre className="max-h-40 overflow-auto rounded bg-gray-900 px-3 py-2 font-mono text-xs leading-relaxed text-green-400">
                                  {cp.checkScript}
                                </pre>
                              ) : (
                                <p className="text-xs italic text-gray-400">Chưa có script check</p>
                              )}
                            </div>
                            <div className="mt-2 pl-8">
                              <p className="mb-1 text-xs text-gray-400">
                                Biến tín hiệu:
                              </p>
                              <code className="block rounded bg-gray-900 px-3 py-2 font-mono text-xs text-yellow-300">
                                {'curl -X POST -d \'{"status":"SUCCESS"}\' ${'}
                                {envVar}
                                {'}'}
                              </code>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              setCheckpoints((prev) => prev.filter((c) => c.id !== cp.id))
                            }
                            className="ml-2 flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 border-t border-gray-200 bg-gray-50 p-6">
          {modalError && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {modalError}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="rounded-lg bg-orange-600 px-6 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {isSaving ? 'Đang lưu...' : mode === 'edit' ? 'Cập nhật Module' : 'Thêm Module'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const formatNumberWithCommas = (num: number | string) => {
  if (num === null || num === undefined || num === '') return '';
  const clean = String(num).replace(/,/g, '');
  const parsed = parseInt(clean, 10);
  if (isNaN(parsed)) return '';
  return parsed.toLocaleString('en-US');
};

export default function EditInstructorLabTemplatePage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const labTemplateId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [activeTab, setActiveTab] = useState<'info' | 'modules'>('info');
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  // ── Basic info state ──
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    difficulty: '',
    status: 'DRAFT',
    accessType: 'PUBLIC' as 'PUBLIC' | 'RESTRICTED',
    tags: '',
    pricingType: 'FREE' as 'FREE' | 'PAID',
    price: 0,
    discountPercent: 0,
    finalPrice: 0,
  });
  const [existingMetadata, setExistingMetadata] = useState<any>({});
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [infoSuccess, setInfoSuccess] = useState('');

  // ── Access management state (RESTRICTED mode) ──
  type AccessUser = {
    userId: string;
    email?: string;
    fullName?: string;
    username?: string;
    grantedAt?: string;
  };
  const [accessUsers, setAccessUsers] = useState<AccessUser[]>([]);
  const [isLoadingAccess, setIsLoadingAccess] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<AccessUser[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [isGranting, setIsGranting] = useState(false);
  const [accessMsg, setAccessMsg] = useState('');

  // ── Modules state ──
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [isLoadingModules, setIsLoadingModules] = useState(false);
  const [modulesError, setModulesError] = useState('');
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [editingModule, setEditingModule] = useState<ModuleItem | undefined>(undefined);
  const [modalMode, setModalMode] = useState<ModalMode>('add');
  const [deleteModuleTarget, setDeleteModuleTarget] = useState<ModuleItem | null>(null);

  const modulesFetchedRef = useRef(false);

  // Load lab template detail on mount
  useEffect(() => {
    if (!labTemplateId) return;
    const ctrl = new AbortController();

    async function load() {
      try {
        setIsLoading(true);
        setPageError('');
        const res = await fetch(`/api/lab-templates/${labTemplateId}`, {
          signal: ctrl.signal,
          cache: 'no-store',
        });
        const payload = (await res.json()) as {
          success?: boolean;
          data?: LabTemplateDetail;
          message?: string;
        };
        if (!res.ok || !payload.success || !payload.data) {
          throw new Error(payload.message ?? 'Không thể tải bài lab template');
        }
        const d = payload.data;
        const meta = d.metadata || {};
        setExistingMetadata(meta);
        setForm({
          name: d.name ?? '',
          description: d.description ?? '',
          category: d.category ?? '',
          difficulty: d.difficulty ?? '',
          status: d.status ?? 'DRAFT',
          accessType: d.accessType ?? 'PUBLIC',
          tags: Array.isArray(d.tags) ? d.tags.join(', ') : '',
          pricingType: meta.pricingType || 'FREE',
          price: meta.price || 0,
          discountPercent: meta.discountPercent || 0,
          finalPrice: meta.finalPrice || 0,
        });
      } catch (err) {
        if ((err as { name?: string }).name !== 'AbortError') {
          setPageError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
        }
      } finally {
        setIsLoading(false);
      }
    }

    void load();
    return () => ctrl.abort();
  }, [labTemplateId]);

  // Load modules when switching to modules tab
  const loadModules = async () => {
    if (!labTemplateId) return;
    setIsLoadingModules(true);
    setModulesError('');
    try {
      const res = await fetch(`/api/lab-templates/${labTemplateId}/modules`, { cache: 'no-store' });
      const payload = (await res.json()) as {
        success?: boolean;
        data?: ModuleItem[];
        message?: string;
      };
      if (!res.ok || !payload.success) throw new Error(payload.message ?? 'Không thể tải modules');
      const list = Array.isArray(payload.data) ? payload.data : [];
      setModules(list.slice().sort((a, b) => a.orderNo - b.orderNo));
    } catch (err) {
      setModulesError(err instanceof Error ? err.message : 'Không thể tải modules');
    } finally {
      setIsLoadingModules(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'modules' && !modulesFetchedRef.current) {
      modulesFetchedRef.current = true;
      void loadModules();
    }
  }, [activeTab]);

  // ── Save basic info ──
  const handleSaveInfo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!labTemplateId) return;
    setIsSavingInfo(true);
    setInfoError('');
    setInfoSuccess('');
    try {
      const storedUser = getStoredUser();
      const currentUserId = storedUser?.id || 'instructor-user';

      const res = await fetch(`/api/lab-templates/${labTemplateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim() || undefined,
          difficulty: form.difficulty.trim() || undefined,
          status: form.status,
          accessType: form.accessType,
          tags: form.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          metadata: {
            ...existingMetadata,
            pricingType: form.pricingType,
            price: form.pricingType === 'PAID' ? form.price : 0,
            discountPercent: form.pricingType === 'PAID' ? form.discountPercent : 0,
            finalPrice: form.pricingType === 'PAID' ? form.finalPrice : 0,
          },
          updatedById: currentUserId,
        }),
      });
      const payload = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !payload.success) throw new Error(payload.message ?? 'Cập nhật thất bại');
      setInfoSuccess('Cập nhật thông tin bài lab thành công. Đang chuyển hướng...');
      setTimeout(() => {
        router.push('/instructor/labs');
      }, 1000);
    } catch (err) {
      setInfoError(err instanceof Error ? err.message : 'Cập nhật thất bại');
    } finally {
      setIsSavingInfo(false);
    }
  };

  // ── Access management ──
  const loadAccessUsers = async () => {
    if (!labTemplateId) return;
    setIsLoadingAccess(true);
    try {
      const res = await fetch(`/api/lab-access/${labTemplateId}/users`, { cache: 'no-store' });
      const payload = (await res.json()) as { success?: boolean; data?: AccessUser[] };
      if (res.ok && payload.success) setAccessUsers(payload.data ?? []);
    } catch {
      /* ignore */
    } finally {
      setIsLoadingAccess(false);
    }
  };

  const searchUsers = async (q: string) => {
    setUserSearchQuery(q);
    if (q.trim().length < 2) {
      setUserSearchResults([]);
      return;
    }
    setIsSearchingUsers(true);
    try {
      const res = await fetch(`/api/users?search=${encodeURIComponent(q.trim())}&limit=10`, {
        cache: 'no-store',
      });
      const payload = (await res.json()) as { success?: boolean; data?: { items?: AccessUser[] } };
      if (res.ok && payload.success) setUserSearchResults(payload.data?.items ?? []);
    } catch {
      setUserSearchResults([]);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const grantUser = async (user: AccessUser) => {
    if (!labTemplateId) return;
    setIsGranting(true);
    setAccessMsg('');
    try {
      const res = await fetch(`/api/lab-access/${labTemplateId}/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.userId }),
      });
      if (res.ok) {
        setAccessUsers((prev) =>
          prev.some((u) => u.userId === user.userId) ? prev : [...prev, user]
        );
        setUserSearchResults([]);
        setUserSearchQuery('');
        setAccessMsg('Đã cấp quyền thành công.');
        setTimeout(() => setAccessMsg(''), 2500);
      }
    } catch {
      /* ignore */
    } finally {
      setIsGranting(false);
    }
  };

  const revokeUser = async (userId: string) => {
    if (!labTemplateId) return;
    try {
      const res = await fetch(`/api/lab-access/${labTemplateId}/revoke?userId=${userId}`, {
        method: 'DELETE',
      });
      if (res.ok) setAccessUsers((prev) => prev.filter((u) => u.userId !== userId));
    } catch {
      /* ignore */
    }
  };

  // ── Module CRUD ──
  const openAddModal = () => {
    setModalMode('add');
    setEditingModule(undefined);
    setShowModuleModal(true);
  };

  const openEditModal = (mod: ModuleItem) => {
    setModalMode('edit');
    setEditingModule(mod);
    setShowModuleModal(true);
  };

  const handleModuleSaved = (saved: ModuleItem) => {
    setModules((prev) => {
      const exists = prev.findIndex((m) => m.id === saved.id);
      const next =
        exists >= 0 ? prev.map((m) => (m.id === saved.id ? saved : m)) : [...prev, saved];
      return next.slice().sort((a, b) => a.orderNo - b.orderNo);
    });
    setShowModuleModal(false);
  };

  const handleDeleteModule = (mod: ModuleItem) => {
    setDeleteModuleTarget(mod);
  };

  const executeDeleteModule = async (mod: ModuleItem) => {
    setDeleteModuleTarget(null);
    try {
      const res = await fetch(`/api/modules/${mod.id}`, { method: 'DELETE' });
      const payload = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !payload.success) throw new Error(payload.message ?? 'Xóa thất bại');
      setModules((prev) => prev.filter((m) => m.id !== mod.id));
    } catch (err) {
      setModulesError(err instanceof Error ? err.message : 'Xóa module thất bại');
    }
  };

  if (isLoading) {
    return (
      <InstructorLayout basePath="/instructor">
        <div className="p-6 lg:p-8">
          <div className="flex h-48 items-center justify-center text-sm text-gray-500">
            Đang tải dữ liệu bài lab...
          </div>
        </div>
      </InstructorLayout>
    );
  }

  if (pageError) {
    return (
      <InstructorLayout basePath="/instructor">
        <div className="p-6 lg:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {pageError}
            <button
              onClick={() => router.push('/instructor/labs')}
              className="ml-4 font-semibold underline hover:no-underline"
            >
              Quay lại danh sách
            </button>
          </div>
        </div>
      </InstructorLayout>
    );
  }

  return (
    <InstructorLayout basePath="/instructor">
      <div className="p-6 lg:p-8 space-y-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Chỉnh sửa bài Lab</h1>
            <p className="mt-1 text-sm text-gray-500">
              Cập nhật thông tin và cấu hình các module của bài lab
            </p>
          </div>
          <Link
            href="/instructor/labs"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
          >
            ← Quay lại danh sách
          </Link>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-2">
            {(
              [
                { id: 'info', label: '1. Thông tin cơ bản' },
                { id: 'modules', label: '2. Cấu hình Modules' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Tab: Thông tin cơ bản ── */}
        {activeTab === 'info' && (
          <form
            onSubmit={handleSaveInfo}
            className="space-y-5 rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Tên bài Lab <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Mô tả chi tiết</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Danh mục</label>
                <div className="relative">
                  <select
                    value={form.category}
                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                    className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  >
                    <option value="">Chọn danh mục</option>
                    <option>DevOps</option>
                    <option>Cloud</option>
                    <option>Security</option>
                    <option>Networking</option>
                    <option>Database</option>
                    <option>Khác</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Độ khó</label>
                <div className="relative">
                  <select
                    value={form.difficulty}
                    onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value }))}
                    className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  >
                    <option value="">Chọn độ khó</option>
                    <option>Beginner</option>
                    <option>Intermediate</option>
                    <option>Advanced</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Trạng thái bài lab</label>
                <div className="relative">
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                    className="w-full appearance-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
                  >
                    <option value="DRAFT">Draft (Bản nháp)</option>
                    <option value="REVIEW">Review (Gửi duyệt)</option>
                    <option value="PUBLISHED">Published (Xuất bản)</option>
                    <option value="ARCHIVED">Archived (Lưu trữ)</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-1">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Chế độ chia sẻ</label>
                <div className="flex gap-3">
                  {(['PUBLIC', 'RESTRICTED'] as const).map((type) => (
                    <label
                      key={type}
                      className={`flex flex-1 cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-colors ${
                        form.accessType === type
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="accessType"
                        value={type}
                        checked={form.accessType === type}
                        onChange={() => {
                          setForm((p) => ({ ...p, accessType: type }));
                          if (type === 'RESTRICTED') void loadAccessUsers();
                        }}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {type === 'PUBLIC' ? 'Public' : 'Private (Restricted)'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {type === 'PUBLIC'
                            ? 'Tất cả sinh viên đều có thể sử dụng bài lab này.'
                            : 'Chỉ sinh viên được cấp quyền mới có thể sử dụng.'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* ── User access panel (RESTRICTED only) ── */}
            {form.accessType === 'RESTRICTED' && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-orange-600" />
                  <h3 className="text-sm font-semibold text-orange-800">
                    Danh sách sinh viên được cấp quyền
                  </h3>
                </div>

                {/* Search & add */}
                <div className="relative mb-3">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        value={userSearchQuery}
                        onChange={(e) => void searchUsers(e.target.value)}
                        placeholder="Tìm theo email hoặc tên sinh viên..."
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                      />
                      {isSearchingUsers && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" />
                      )}
                    </div>
                  </div>
                  {userSearchResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                      {userSearchResults.map((u) => (
                        <button
                          key={u.userId}
                          type="button"
                          disabled={isGranting || accessUsers.some((a) => a.userId === u.userId)}
                          onClick={() => void grantUser(u)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-orange-50 disabled:opacity-50"
                        >
                          <span>
                            <span className="font-medium text-gray-900">
                              {u.fullName ?? u.username ?? u.userId}
                            </span>
                            {u.email && <span className="ml-2 text-xs text-gray-500">{u.email}</span>}
                          </span>
                          {accessUsers.some((a) => a.userId === u.userId) ? (
                            <span className="text-xs text-green-600">Đã có quyền</span>
                          ) : (
                            <UserPlus className="h-4 w-4 text-orange-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {accessMsg && <p className="mb-2 text-xs font-medium text-green-700">{accessMsg}</p>}

                {/* Current users list */}
                {isLoadingAccess ? (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang tải danh sách...
                  </div>
                ) : accessUsers.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    Chưa có sinh viên nào được cấp quyền. Tìm kiếm và thêm ở trên.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {accessUsers.map((u) => (
                      <div
                        key={u.userId}
                        className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-sm shadow-sm"
                      >
                        <div>
                          <span className="font-medium text-gray-900">
                            {u.fullName ?? u.username ?? u.userId}
                          </span>
                          {u.email && <span className="ml-2 text-xs text-gray-500">{u.email}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => void revokeUser(u.userId)}
                          className="ml-2 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Thu hồi quyền"
                        >
                          <Lock className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Pricing section ── */}
            <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900">Chi phí / Định giá</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Chế độ thanh toán *</label>
                  <select
                    value={form.pricingType}
                    onChange={(e) => {
                      const val = e.target.value as 'FREE' | 'PAID';
                      setForm((prev) => ({
                        ...prev,
                        pricingType: val,
                        finalPrice: val === 'FREE' ? 0 : prev.price * (1 - prev.discountPercent / 100)
                      }));
                    }}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none"
                  >
                    <option value="FREE">Free (Miễn phí)</option>
                    <option value="PAID">Paid (Có phí)</option>
                  </select>
                </div>
                {form.pricingType === 'PAID' && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Giá gốc (VNĐ) *</label>
                    <input
                      type="text"
                      value={formatNumberWithCommas(form.price) || ''}
                      onChange={(e) => {
                        const rawVal = e.target.value.replace(/,/g, '');
                        const val = rawVal ? Math.max(0, parseInt(rawVal, 10)) : 0;
                        setForm((prev) => ({
                          ...prev,
                          price: val,
                          finalPrice: val * (1 - prev.discountPercent / 100),
                        }));
                      }}
                      placeholder="Nhập giá gốc"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {form.pricingType === 'PAID' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Giảm giá (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.discountPercent || ''}
                      onChange={(e) => {
                        const pct = Math.min(100, Math.max(0, Number(e.target.value)));
                        setForm((prev) => ({
                          ...prev,
                          discountPercent: pct,
                          finalPrice: prev.price * (1 - pct / 100),
                        }));
                      }}
                      placeholder="VD: 10"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Giá sau giảm (VNĐ)</label>
                    <input
                      type="text"
                      value={formatNumberWithCommas(form.finalPrice) + ' VNĐ'}
                      disabled
                      className="w-full rounded-md border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-500 cursor-not-allowed font-semibold focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Tags</label>
              <input
                value={form.tags}
                onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))}
                placeholder="vd: linux, devops, networking"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">Phân cách bằng dấu phẩy.</p>
            </div>

            {infoError && <p className="text-sm text-red-600">{infoError}</p>}
            {infoSuccess && <p className="text-sm text-green-600">{infoSuccess}</p>}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSavingInfo}
                className="rounded-lg bg-orange-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60 shadow-sm"
              >
                {isSavingInfo ? 'Đang lưu...' : 'Lưu thông tin'}
              </button>
            </div>
          </form>
        )}

        {/* ── Tab: Modules ── */}
        {activeTab === 'modules' && (
          <div className="space-y-5">
            {modulesError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {modulesError}
              </div>
            )}

            {/* Action bar */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                {isLoadingModules ? 'Đang tải module...' : `Tổng cộng: ${modules.length} module`}
              </p>
              <button
                onClick={openAddModal}
                className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 shadow-sm"
              >
                <Plus className="h-4 w-4" /> Thêm module mới
              </button>
            </div>

            {/* Module list */}
            {!isLoadingModules && modules.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center">
                <p className="text-sm text-gray-500">
                  Chưa có module nào. Nhấn "Thêm module mới" để bắt đầu cấu hình.
                </p>
              </div>
            )}

            {!isLoadingModules && modules.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Tên module
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Zones
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                        VMs
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Checkpoints
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {modules.map((mod) => {
                      const zones = mod.definitionJson?.networkZones ?? [];
                      const vms = mod.definitionJson?.vmConfigs ?? [];
                      const cps = mod.definitionJson?.checkpoints ?? [];
                      return (
                        <tr key={mod.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <span className="flex h-7 w-7 items-center justify-center rounded bg-amber-100 text-xs font-bold text-amber-700">
                              {mod.orderNo}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-900">{mod.name}</p>
                            {mod.description && (
                              <p className="mt-0.5 line-clamp-1 text-xs text-gray-400">
                                {mod.description}
                              </p>
                            )}
                            {mod.estimatedMinutes != null && mod.estimatedMinutes > 0 && (
                              <p className="mt-0.5 text-xs text-gray-400">
                                {mod.estimatedMinutes} phút
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                              <Network className="h-3 w-3" /> {zones.length}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                              <Server className="h-3 w-3" /> {vms.length}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${cps.length > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                            >
                              ✓ {cps.length}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => openEditModal(mod)}
                                className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                                title="Chỉnh sửa module"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => void handleDeleteModule(mod)}
                                className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                title="Xóa module"
                              >
                                <Trash className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Module editor modal */}
        {showModuleModal && labTemplateId && (
          <ModuleEditorModal
            mode={modalMode}
            module={editingModule}
            labTemplateId={labTemplateId}
            existingModuleCount={modules.length}
            onSaved={handleModuleSaved}
            onClose={() => setShowModuleModal(false)}
          />
        )}

        <Dialog
          open={deleteModuleTarget !== null}
          title="Xóa module"
          description={`Xóa module "${deleteModuleTarget?.name}"? Thao tác này không thể hoàn tác.`}
          onClose={() => setDeleteModuleTarget(null)}
          actions={[
            { label: 'Hủy', onClick: () => setDeleteModuleTarget(null), variant: 'ghost' },
            {
              label: 'Xóa',
              onClick: () => {
                if (deleteModuleTarget) void executeDeleteModule(deleteModuleTarget);
              },
              variant: 'danger',
            },
          ]}
        />
      </div>
    </InstructorLayout>
  );
}
