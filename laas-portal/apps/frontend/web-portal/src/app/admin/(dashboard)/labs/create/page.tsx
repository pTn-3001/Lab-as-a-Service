'use client';

import {
  ArrowRight,
  ChevronDown,
  Copy,
  Edit,
  Lightbulb,
  Lock,
  Network,
  Plus,
  Server,
  Settings,
  Trash,
  Upload,
  X,
} from 'lucide-react';

import { type Dispatch, type JSX, type SetStateAction, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Badge } from '@laas-portal/ui';

const steps = [
  { id: 1, name: 'Thông Tin Cơ Bản', description: 'Khai báo thông tin lab' },
  { id: 2, name: 'Cấu Hình Module', description: 'Thiết lập tài nguyên' },
  { id: 3, name: 'Xác nhận', description: 'Kiểm tra và xác nhận thiết lập' },
];

type LabFormState = {
  name: string;
  description: string;
  category: string;
  difficulty: string;
  tags: string;
  imageUrl: string;
  accessType: 'PUBLIC' | 'RESTRICTED';
  pricingType: 'FREE' | 'PAID';
  price: number;
  discountPercent: number;
  finalPrice: number;
};

type ModuleDraft = {
  id: string;
  name: string;
  description: string;
  orderNo: number;
  estimatedMinutes: number;
  objectives: string[];
  definitionJson: Record<string, unknown>;
};

type ResourceSummary = {
  cpu: number;
  ram: number;
  disk: number;
  totalVm: number;
  totalNetwork: number;
};

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function buildLabCode(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `LAB-${y}${m}${d}-${h}${min}`;
}

function getBootVolumeSizeForFlavor(flavorName: string): number {
  const normalizedName = flavorName.trim().toLowerCase();
  const bootVolumeSizeByFlavor: Record<string, number> = {
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

  return bootVolumeSizeByFlavor[normalizedName] ?? 20;
}

function parseFlavorResources(flavorText: string): { cpu: number; ram: number; disk: number } {
  const match = flavorText.match(/(\d+)\s*vCPU,\s*(\d+)GB RAM,\s*(?:Cinder\s*)?(\d+)GB/i);
  if (!match) {
    return { cpu: 0, ram: 0, disk: 0 };
  }

  return {
    cpu: Number(match[1]) || 0,
    ram: Number(match[2]) || 0,
    disk: Number(match[3]) || 0,
  };
}

function summarizeResources(moduleDrafts: ModuleDraft[]): ResourceSummary {
  return moduleDrafts.reduce<ResourceSummary>(
    (acc, moduleDraft) => {
      const definition = moduleDraft.definitionJson as {
        vmConfigs?: VmConfig[];
        networkZones?: NetworkZone[];
      };

      const vmConfigs = definition.vmConfigs ?? [];
      const networkZones = definition.networkZones ?? [];

      for (const vm of vmConfigs) {
        const resource = parseFlavorResources(vm.flavor);
        acc.cpu += resource.cpu;
        acc.ram += resource.ram;
        acc.disk += resource.disk;
      }

      acc.totalVm += vmConfigs.length;
      acc.totalNetwork += networkZones.length;
      return acc;
    },
    {
      cpu: 0,
      ram: 0,
      disk: 0,
      totalVm: 0,
      totalNetwork: 0,
    }
  );
}

type GlanceImage = {
  name: string;
  laasImageType?: string;
  vmUsername?: string;
  vmPassword?: string;
  networkType?: string;
  networkCidr?: string;
  staticIp?: string;
};

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

function normalizeFlavorOption(flavor: {
  name: string;
  vcpus: number;
  ram: number;
  disk: number;
}): string {
  const ramGb = Math.max(1, Math.round(flavor.ram / 1024));
  return `${flavor.name} (${flavor.vcpus} vCPU, ${ramGb}GB RAM, ${getBootVolumeSizeForFlavor(flavor.name)}GB Disk)`;
}

const BLOCKED_NETWORK_CIDRS = new Set([
  '192.168.2.0/24',
  '10.22.12.0/24',
  '10.73.0.0/24',
  '169.254.0.0/16',
  '10.71.85.0/16',
  '127.0.0.0/8',
]);

function isValidIpv4Address(ipAddress: string): boolean {
  const octets = ipAddress.split('.');
  if (octets.length !== 4) return false;

  return octets.every((octet) => {
    if (octet.trim() === '') return false;
    const value = Number(octet);
    return Number.isInteger(value) && value >= 0 && value <= 255;
  });
}

function getCidrValidationError(cidr: string): string {
  const normalizedCidr = cidr.trim();
  if (!normalizedCidr) return 'CIDR là bắt buộc.';

  const [ipAddress, prefixText] = normalizedCidr.split('/');
  if (!ipAddress || !prefixText || normalizedCidr.split('/').length !== 2) {
    return 'CIDR không hợp lệ. Định dạng đúng: 192.168.10.0/24';
  }

  if (!isValidIpv4Address(ipAddress)) {
    return 'Địa chỉ IP trong CIDR không hợp lệ.';
  }

  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) {
    return 'Subnet mask phải nằm trong khoảng /0 đến /32.';
  }

  if (prefix < 24) {
    return 'Subnet mask phải từ /24 trở lên.';
  }

  if (BLOCKED_NETWORK_CIDRS.has(normalizedCidr)) {
    return 'CIDR này đang được hệ thống sử dụng, vui lòng chọn dải khác.';
  }

  return '';
}

function getGatewayFromCidr(cidr: string): string {
  const normalizedCidr = cidr.trim();
  const [ipAddress] = normalizedCidr.split('/');

  if (!ipAddress || !isValidIpv4Address(ipAddress)) {
    return '';
  }

  const octets = ipAddress.split('.');
  return `${octets[0]}.${octets[1]}.${octets[2]}.1`;
}

function createEmptyZone(index: number): NetworkZone {
  return {
    id: `zone-${index + 1}-${Date.now()}`,
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

function createEmptyVm(index: number, operatingSystem = '', flavor = ''): VmConfig {
  return {
    id: `vm-${index + 1}-${Date.now()}`,
    nodeName: '',
    note: '',
    zoneIds: [],
    zoneId: '',
    networkType: 'dhcp',
    staticIp: '',
    operatingSystem,
    flavor,
    initialUsername: '',
    initialPassword: '',
    ansibleRepoUrl: '',
    command: '',
  };
}

function ipv4ToInt(ipAddress: string): number | null {
  if (!isValidIpv4Address(ipAddress)) return null;
  const [a, b, c, d] = ipAddress.split('.').map(Number);
  return ((a << 24) >>> 0) + ((b << 16) >>> 0) + ((c << 8) >>> 0) + d;
}

function isIpv4InRange(ipAddress: string, startAddress: string, endAddress: string): boolean {
  const ip = ipv4ToInt(ipAddress);
  const start = ipv4ToInt(startAddress);
  const end = ipv4ToInt(endAddress);
  if (ip === null || start === null || end === null) return false;
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  return ip >= min && ip <= max;
}

function getDhcpRangeValidationError(zone: NetworkZone): string {
  const start = zone.dhcpStart.trim();
  const end = zone.dhcpEnd.trim();
  if (!start && !end) return '';
  if (!start || !end) return 'DHCP range cần đủ start và end.';
  if (!isValidIpv4Address(start) || !isValidIpv4Address(end)) {
    return 'DHCP start/end phải là IPv4 hợp lệ.';
  }

  const [zoneNetworkAddress] = zone.cidr.split('/');
  if (!isValidIpv4Address(zoneNetworkAddress || '')) {
    return '';
  }

  const zonePrefix = zoneNetworkAddress.split('.').slice(0, 3).join('.');
  const startPrefix = start.split('.').slice(0, 3).join('.');
  const endPrefix = end.split('.').slice(0, 3).join('.');
  if (zonePrefix !== startPrefix || zonePrefix !== endPrefix) {
    return 'DHCP range phải nằm trong cùng subnet của zone.';
  }

  return '';
}

function getVmStaticIpValidationError(vm: VmConfig, zones: NetworkZone[]): string {
  if (vm.networkType !== 'static') return '';
  if (vm.zoneIds.length === 0) return 'VM static phải chọn ít nhất một zone.';

  const basicError = getStaticIpValidationError(vm.staticIp, zones[0]);
  if (basicError) return basicError;

  for (const zone of zones) {
    const dhcpRangeError = getDhcpRangeValidationError(zone);
    if (dhcpRangeError) continue;

    if (zone.dhcpStart.trim() && zone.dhcpEnd.trim()) {
      if (isIpv4InRange(vm.staticIp.trim(), zone.dhcpStart.trim(), zone.dhcpEnd.trim())) {
        return `IP static của VM phải nằm ngoài DHCP range (${zone.dhcpStart} - ${zone.dhcpEnd}) của zone ${zone.name || zone.id}.`;
      }
    }
  }

  return '';
}

function getStaticIpValidationError(staticIp: string, zone: NetworkZone | undefined): string {
  const normalizedIp = staticIp.trim();
  if (!normalizedIp) return 'Vui lòng nhập địa chỉ IP tĩnh.';

  if (!isValidIpv4Address(normalizedIp)) {
    return 'Địa chỉ IP tĩnh không hợp lệ.';
  }

  const hostOctet = Number(normalizedIp.split('.')[3]);
  if (hostOctet === 1) {
    return 'Địa chỉ .1 được dành cho gateway, vui lòng chọn địa chỉ khác.';
  }

  if (!zone || !zone.cidr) {
    return '';
  }

  const [zoneNetworkAddress] = zone.cidr.split('/');
  if (!zoneNetworkAddress || !isValidIpv4Address(zoneNetworkAddress)) {
    return '';
  }

  const zonePrefix = zoneNetworkAddress.split('.').slice(0, 3).join('.');
  const ipPrefix = normalizedIp.split('.').slice(0, 3).join('.');

  if (zonePrefix !== ipPrefix) {
    return 'IP tĩnh phải thuộc cùng dải mạng với zone đã chọn.';
  }

  return '';
}

const DRAFT_SESSION_KEY = 'createLab_draft';

function loadDraft(): {
  currentStep: number;
  labForm: LabFormState;
  moduleDrafts: ModuleDraft[];
} | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      currentStep: number;
      labForm: LabFormState;
      moduleDrafts: ModuleDraft[];
    };
  } catch {
    return null;
  }
}

function saveDraft(currentStep: number, labForm: LabFormState, moduleDrafts: ModuleDraft[]) {
  try {
    sessionStorage.setItem(
      DRAFT_SESSION_KEY,
      JSON.stringify({ currentStep, labForm, moduleDrafts })
    );
  } catch {
    // ignore quota / SSR errors
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_SESSION_KEY);
  } catch {
    // ignore
  }
}

const formatNumberWithCommas = (num: number | string) => {
  if (num === null || num === undefined || num === '') return '';
  const clean = String(num).replace(/,/g, '');
  const parsed = parseInt(clean, 10);
  if (isNaN(parsed)) return '';
  return parsed.toLocaleString('en-US');
};

export default function CreateLabPage(): JSX.Element {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [labForm, setLabForm] = useState<LabFormState>({
    name: '',
    description: '',
    category: '',
    difficulty: '',
    tags: '',
    imageUrl: '',
    accessType: 'PUBLIC',
    pricingType: 'FREE',
    price: 0,
    discountPercent: 0,
    finalPrice: 0,
  });
  const [moduleDrafts, setModuleDrafts] = useState<ModuleDraft[]>([]);

  // `hydrated` MUST be state (not a ref). It gates the save effect so the latter never
  // runs until the restore below has committed. Because `hydrated` flips to true inside
  // the SAME batched re-render that applies the restored values, the save effect's first
  // run always sees the restored data — never the blank initial values. Under React
  // Strict Mode (dev) effects run twice on mount; both setup passes observe hydrated=false
  // and skip, so a stale blank snapshot can never clobber a good draft.
  const [hydrated, setHydrated] = useState(false);

  // Restore the draft FIRST (runs once on mount). Always land on step 1 so the user
  // reviews basic info first — only form data is restored, not the saved step number.
  // (Restoring currentStep caused the page to skip to step 2 when a stale draft existed.)
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      if (draft.labForm) setLabForm((prev) => ({ ...prev, ...draft.labForm }));
      if (Array.isArray(draft.moduleDrafts)) setModuleDrafts(draft.moduleDrafts);
    }
    setHydrated(true);
  }, []);

  // Persist draft to sessionStorage — only AFTER hydration. `hydrated` is in the dep array,
  // so this effect re-subscribes once restore completes and always captures fresh values.
  useEffect(() => {
    if (!hydrated) return;
    saveDraft(currentStep, labForm, moduleDrafts);
  }, [hydrated, currentStep, labForm, moduleDrafts]);

  // Always-fresh snapshot of the draft, so the unload listener below can flush the LATEST
  // values without re-subscribing on every keystroke.
  const latestDraftRef = useRef({ currentStep, labForm, moduleDrafts });
  latestDraftRef.current = { currentStep, labForm, moduleDrafts };

  // Safety net: if a reload / tab-hide happens between a keystroke and the passive save
  // effect above (which runs after paint), flush synchronously so nothing is ever lost.
  useEffect(() => {
    const flush = () => {
      if (!hydrated) return;
      const { currentStep: s, labForm: f, moduleDrafts: m } = latestDraftRef.current;
      saveDraft(s, f, m);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hydrated]);

  const handleCreateLab = async () => {
    if (!labForm.name.trim()) {
      setSubmitError('Vui lòng nhập tên lab trước khi xác nhận.');
      return;
    }

    if (moduleDrafts.length === 0) {
      setSubmitError('Vui lòng thêm ít nhất một module trước khi xác nhận.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const slug = toSlug(labForm.name);
      const code = buildLabCode();

      const createLabResponse = await fetch('/api/lab-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          name: labForm.name.trim(),
          slug,
          description: labForm.description.trim() || undefined,
          category: labForm.category || undefined,
          difficulty: labForm.difficulty || undefined,
          status: 'DRAFT',
          accessType: labForm.accessType,
          tags: labForm.tags
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          metadata: {
            thumbnailUrl: labForm.imageUrl || undefined,
            pricingType: labForm.pricingType,
            price: labForm.pricingType === 'PAID' ? labForm.price : 0,
            discountPercent: labForm.pricingType === 'PAID' ? labForm.discountPercent : 0,
            finalPrice: labForm.pricingType === 'PAID' ? labForm.finalPrice : 0,
          },
          createdById: 'admin-portal-user',
          createdBySnapshot: {
            source: 'admin-portal',
          },
        }),
      });

      const createLabPayload = await createLabResponse.json();
      if (!createLabResponse.ok || !createLabPayload?.success) {
        throw new Error(createLabPayload?.message ?? 'Tạo lab template thất bại');
      }

      const labTemplateId =
        (createLabPayload?.data?.id as string | undefined) ??
        (createLabPayload?.id as string | undefined);
      if (!labTemplateId) {
        throw new Error(
          createLabPayload?.message
            ? `Không nhận được labTemplateId từ backend: ${createLabPayload.message}`
            : 'Không nhận được labTemplateId từ backend'
        );
      }

      for (const moduleDraft of moduleDrafts) {
        const moduleResponse = await fetch(`/api/lab-templates/${labTemplateId}/modules`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: moduleDraft.name,
            description: moduleDraft.description || undefined,
            orderNo: moduleDraft.orderNo,
            estimatedMinutes: moduleDraft.estimatedMinutes,
            objectives: moduleDraft.objectives,
            definitionJson: moduleDraft.definitionJson,
            createdById: 'admin-portal-user',
            createdBySnapshot: {
              source: 'admin-portal',
            },
          }),
        });

        const modulePayload = await moduleResponse.json();
        if (!moduleResponse.ok || !modulePayload?.success) {
          throw new Error(modulePayload?.message ?? `Tạo module ${moduleDraft.name} thất bại`);
        }
      }

      clearDraft();
      setSubmitSuccess('Tạo lab và module thành công. Đang chuyển về danh sách lab...');
      setTimeout(() => {
        router.push('/admin/labs');
      }, 900);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Tạo lab thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStepClick = (stepId: number) => {
    if (stepId === currentStep) return;
    if (stepId < currentStep) {
      setCurrentStep(stepId);
      return;
    }
    if (currentStep === 1) {
      if (!labForm.name.trim()) {
        setSubmitError('Tên lab là bắt buộc.');
        return;
      }
      if (!labForm.category || labForm.category === 'Chọn danh mục') {
        setSubmitError('Danh mục là bắt buộc.');
        return;
      }
      if (!labForm.difficulty || labForm.difficulty === 'Chọn độ khó') {
        setSubmitError('Độ khó là bắt buộc.');
        return;
      }
      setSubmitError('');
    }
    if (currentStep === 2 && stepId === 3) {
      // no validation required for step 2
    }
    setCurrentStep(stepId);
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!labForm.name.trim()) {
        setSubmitError('Tên lab là bắt buộc.');
        return;
      }
      if (!labForm.category || labForm.category === 'Chọn danh mục') {
        setSubmitError('Danh mục là bắt buộc.');
        return;
      }
      if (!labForm.difficulty || labForm.difficulty === 'Chọn độ khó') {
        setSubmitError('Độ khó là bắt buộc.');
        return;
      }
      setSubmitError('');
    }

    if (currentStep === 3) {
      if (labForm.pricingType === 'PAID' && (!labForm.price || labForm.price <= 0)) {
        setSubmitError('Vui lòng nhập giá gốc hợp lệ cho bài lab có phí.');
        return;
      }
    }

    if (currentStep < 3) {
      setCurrentStep((prev) => Math.min(prev + 1, 3));
      return;
    }

    void handleCreateLab();
  };

  return (
    <div className="mx-auto max-w-5xl pb-20">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tạo lab template mới</h1>
        <p className="text-sm text-gray-500">
          Thiết lập tài nguyên và cấu hình môi trường cho phòng lab
        </p>
      </div>

      {/* Hiển thị tiến trình */}
      <div className="relative mb-12">
        <div className="absolute left-0 top-5 h-0.5 w-full bg-gray-200"></div>
        {/* Thanh tiến trình */}
        <div
          className="absolute left-0 top-5 h-0.5 bg-primary transition-all duration-300"
          style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
        ></div>

        {/* Hiển thị bước hiện tại */}
        <div className="flex w-full justify-between">
          {steps.map((step) => {
            const isActive = step.id === currentStep;

            return (
              <div
                key={step.id}
                className="group flex cursor-pointer flex-col items-center"
                onClick={() => handleStepClick(step.id)}
              >
                <div
                  className={`z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white text-sm font-bold transition-colors ${
                    isActive ? 'border-primary text-primary' : 'border-gray-200 text-gray-400'
                  } `}
                >
                  {step.id}
                </div>
                <div className="mt-3 text-center">
                  <div
                    className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-gray-500'}`}
                  >
                    {step.name}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{step.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      {currentStep === 1 && <Step1BasicInfo labForm={labForm} setLabForm={setLabForm} />}
      {currentStep === 2 && (
        <Step2Modules moduleDrafts={moduleDrafts} setModuleDrafts={setModuleDrafts} />
      )}
      {currentStep === 3 && <Step3Confirmation labForm={labForm} setLabForm={setLabForm} moduleDrafts={moduleDrafts} />}

      {submitError && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div className="mt-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {submitSuccess}
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="mt-8 flex justify-end gap-3">
        {currentStep === 1 ? (
          <>
            <Link
              href="/admin/labs"
              onClick={clearDraft}
              className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Hủy
            </Link>
            <button
              onClick={handleNext}
              className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              Tiếp theo <ArrowRight className="h-4 w-4" />
            </button>
          </>
        ) : currentStep === 2 ? (
          <>
            <button
              onClick={() => setCurrentStep(1)}
              className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Quay lại
            </button>
            <button
              onClick={() => setCurrentStep(3)}
              className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90"
            >
              Tiếp theo <ArrowRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setCurrentStep(2)}
              disabled={isSubmitting}
              className="rounded-md border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Quay lại
            </button>
            <button
              onClick={handleNext}
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isSubmitting ? 'Đang tạo...' : 'Xác nhận'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Step1BasicInfo({
  labForm,
  setLabForm,
}: {
  labForm: LabFormState;
  setLabForm: Dispatch<SetStateAction<LabFormState>>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setLabForm((prev) => ({
        ...prev,
        imageUrl: reader.result as string,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updatedTags = labForm.tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== tagToRemove && t !== '')
      .join(', ');
    setLabForm((prev) => ({ ...prev, tags: updatedTags }));
  };

  const tagList = labForm.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    // Trên mobile 1 cột, trên desktop 3 cột
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Trên desktop chiếm 2/3 chiều ngang */}
      <div className="space-y-6 lg:col-span-2">
        {/* Basic Info Card */}
        <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <h3 className="mb-1 text-base font-semibold text-gray-900">Thông tin cơ bản</h3>
            <p className="mb-4 text-xs text-gray-500">Nhập thông tin chính về lab template</p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tên lab *</label>
                <input
                  type="text"
                  value={labForm.name}
                  onChange={(event) =>
                    setLabForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:bg-white"
                  placeholder="VD: Kubernetes Advanced Administration"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Mô tả</label>
                <textarea
                  rows={4}
                  value={labForm.description}
                  onChange={(event) =>
                    setLabForm((prev) => ({
                      ...prev,
                      description: event.target.value,
                    }))
                  }
                  className="w-full resize-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:bg-white"
                  placeholder="Giới thiệu chi tiết về lab"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Danh mục *</label>
                  <div className="relative">
                    <select
                      value={labForm.category}
                      onChange={(event) =>
                        setLabForm((prev) => ({
                          ...prev,
                          category: event.target.value,
                        }))
                      }
                      className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 outline-none transition-colors focus:border-primary focus:bg-white"
                    >
                      <option value="">Chọn danh mục</option>
                      <option value="DevOps">DevOps</option>
                      <option value="Cloud">Cloud</option>
                      <option value="Security">Security</option>
                      <option value="Network">Network</option>
                      <option value="Khác">Khác</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Độ khó *</label>
                  <div className="relative">
                    <select
                      value={labForm.difficulty}
                      onChange={(event) =>
                        setLabForm((prev) => ({
                          ...prev,
                          difficulty: event.target.value,
                        }))
                      }
                      className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 outline-none transition-colors focus:border-primary focus:bg-white"
                    >
                      <option value="">Chọn độ khó</option>
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Truy cập (Access) *</label>
                  <div className="relative">
                    <select
                      value={labForm.accessType}
                      onChange={(event) =>
                        setLabForm((prev) => ({
                          ...prev,
                          accessType: event.target.value as 'PUBLIC' | 'RESTRICTED',
                        }))
                      }
                      className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 outline-none transition-colors focus:border-primary focus:bg-white"
                    >
                      <option value="PUBLIC">Public (Công khai)</option>
                      <option value="RESTRICTED">Private (Chỉ định)</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Chi phí (Pricing) *</label>
                  <div className="relative">
                    <select
                      value={labForm.pricingType}
                      onChange={(event) =>
                        setLabForm((prev) => ({
                          ...prev,
                          pricingType: event.target.value as 'FREE' | 'PAID',
                        }))
                      }
                      className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500 outline-none transition-colors focus:border-primary focus:bg-white"
                    >
                      <option value="FREE">Free (Miễn phí)</option>
                      <option value="PAID">Paid (Có phí)</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {/* Upload Image Card */}
        <div className="h-fit rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Upload className="h-4 w-4" /> Ảnh minh họa
          </h3>
          <p className="mb-4 text-xs text-gray-500">Tải lên hình ảnh đại diện cho lab</p>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          {labForm.imageUrl ? (
            <div className="relative group h-48 w-full rounded-lg overflow-hidden border border-gray-200">
              <img
                src={labForm.imageUrl}
                alt="Lab illustration"
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setLabForm((prev) => ({ ...prev, imageUrl: '' }))}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-red-700"
                >
                  Xóa ảnh
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="group flex h-48 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-200 p-8 text-center transition-colors hover:border-primary hover:bg-primary/10"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 transition-all group-hover:bg-white group-hover:shadow-sm">
                <Upload className="h-5 w-5 text-gray-400 group-hover:text-primary" />
              </div>
              <p className="text-xs text-gray-500">Click để tải lên hoặc kéo thả file vào đây</p>
            </div>
          )}
        </div>

        {/* Tags Card */}
        <div className="h-fit rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Tag</h3>
          <input
            type="text"
            value={labForm.tags}
            onChange={(event) =>
              setLabForm((prev) => ({
                ...prev,
                tags: event.target.value,
              }))
            }
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:bg-white"
            placeholder="Nhập tag, cách nhau bởi dấu phẩy"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {tagList.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                {tag}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-red-500"
                  onClick={() => handleRemoveTag(tag)}
                />
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Step2Modules({
  moduleDrafts,
  setModuleDrafts,
}: {
  moduleDrafts: ModuleDraft[];
  setModuleDrafts: Dispatch<SetStateAction<ModuleDraft[]>>;
}) {
  const totalVMs = moduleDrafts.reduce((acc, m) => {
    const def = (m.definitionJson || {}) as any;
    const vmList = Array.isArray(def.vmConfigs) ? def.vmConfigs : [];
    return acc + vmList.length;
  }, 0);

  const totalNetworks = moduleDrafts.reduce((acc, m) => {
    const def = (m.definitionJson || {}) as any;
    const netList = Array.isArray(def.networkZones) ? def.networkZones : [];
    return acc + netList.length;
  }, 0);

  const totalResources = totalVMs + totalNetworks;

  const [showAddModuleModal, setShowAddModuleModal] = useState(false);
  const [currentTab, setCurrentTab] = useState('basic');
  const [networkZones, setNetworkZones] = useState<NetworkZone[]>([createEmptyZone(0)]);
  const [zoneCountInput, setZoneCountInput] = useState('1');
  const [osOptions, setOsOptions] = useState<GlanceImage[]>([]);
  const [flavorOptions, setFlavorOptions] = useState<string[]>([]);
  const [vmConfigs, setVmConfigs] = useState<VmConfig[]>([createEmptyVm(0, '', '')]);
  const [vmCountInput, setVmCountInput] = useState('1');
  const [isClient, setIsClient] = useState(false);
  const [moduleName, setModuleName] = useState('');
  const [moduleDescription, setModuleDescription] = useState('');
  const [moduleOrderNo, setModuleOrderNo] = useState(1);
  const [moduleEstimatedMinutes, setModuleEstimatedMinutes] = useState(60);
  const [moduleObjectives, setModuleObjectives] = useState('');
  const [moduleError, setModuleError] = useState('');
  const [checkpoints, setCheckpoints] = useState<
    Array<{
      id: string;
      name: string;
      description: string;
      points: number;
      vmId?: string;
      checkScript: string;
      hintCommand?: string;
    }>
  >([]);
  const [newCpName, setNewCpName] = useState('');
  const [newCpDesc, setNewCpDesc] = useState('');
  const [newCpPoints, setNewCpPoints] = useState(10);
  const [newCpVmId, setNewCpVmId] = useState('');
  const [newCpScript, setNewCpScript] = useState('');
  const [newCpHintCommand, setNewCpHintCommand] = useState('');

  useEffect(() => {
    setIsClient(true);

    let isActive = true;

    async function loadOpenstackOptions() {
      try {
        const imageResponse = await fetch('/api/images?userId=admin-portal-user', {
          method: 'GET',
          cache: 'no-store',
        });
        const imagePayload = (await imageResponse.json()) as {
          success?: boolean;
          data?: {
            images?: Array<{
              name?: unknown;
              laasImageType?: unknown;
              vmUsername?: unknown;
              vmPassword?: unknown;
              networkType?: unknown;
              networkCidr?: unknown;
              staticIp?: unknown;
            }>;
          };
        };
        if (imageResponse.ok && imagePayload?.success) {
          const images: GlanceImage[] = (imagePayload.data?.images ?? [])
            .map((item) => ({
              name: String(item.name ?? '').trim(),
              laasImageType: item.laasImageType ? String(item.laasImageType) : undefined,
              vmUsername: item.vmUsername ? String(item.vmUsername) : undefined,
              vmPassword: item.vmPassword ? String(item.vmPassword) : undefined,
              networkType: item.networkType ? String(item.networkType) : undefined,
              networkCidr: item.networkCidr ? String(item.networkCidr) : undefined,
              staticIp: item.staticIp ? String(item.staticIp) : undefined,
            }))
            .filter((img) => img.name);
          if (isActive && images.length > 0) setOsOptions(images);
        }

        const flavorResponse = await fetch('/api/flavors?userId=admin-portal-user', {
          method: 'GET',
          cache: 'no-store',
        });
        const flavorPayload = (await flavorResponse.json()) as {
          success?: boolean;
          data?: {
            flavors?: Array<{ name?: unknown; vcpus?: unknown; ram?: unknown; disk?: unknown }>;
          };
        };
        if (flavorResponse.ok && flavorPayload?.success) {
          const flavors = (flavorPayload.data?.flavors ?? [])
            .map((item) => ({
              name: String(item.name ?? ''),
              vcpus: Number(item.vcpus ?? 0),
              ram: Number(item.ram ?? 0),
              disk: Number(item.disk ?? 0),
            }))
            .filter((item) => item.name)
            .map(normalizeFlavorOption);
          if (isActive && flavors.length > 0) setFlavorOptions(flavors);
        }
      } catch {
        // Options remain empty when API is unavailable.
      }
    }

    void loadOpenstackOptions();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (osOptions.length === 0 && flavorOptions.length === 0) {
      return;
    }

    setVmConfigs((prevVms) => {
      const next = prevVms.map((vm) => ({
        ...vm,
        operatingSystem: vm.operatingSystem || osOptions[0]?.name || '',
        flavor: vm.flavor || flavorOptions[0] || '',
      }));
      // Bail out if nothing actually changed — avoids a spurious re-render cascade.
      const changed = next.some(
        (vm, i) =>
          vm.operatingSystem !== prevVms[i]?.operatingSystem || vm.flavor !== prevVms[i]?.flavor
      );
      return changed ? next : prevVms;
    });
  }, [osOptions, flavorOptions]);

  const tabs = [
    { id: 'basic', name: 'Cơ bản', icon: Settings },
    { id: 'network', name: 'Network', icon: Network },
    { id: 'vms', name: 'Virtual Machines', icon: Server },
    { id: 'checkpoint', name: 'Checkpoint', icon: Edit },
  ];

  const resetModuleForm = () => {
    setCurrentTab('basic');
    setNetworkZones([createEmptyZone(0)]);
    setZoneCountInput('1');
    setVmConfigs([createEmptyVm(0, osOptions[0]?.name ?? '', flavorOptions[0] ?? '')]);
    setVmCountInput('1');
    setModuleName('');
    setModuleDescription('');
    setModuleOrderNo(moduleDrafts.length + 2);
    setModuleEstimatedMinutes(60);
    setModuleObjectives('');
    setModuleError('');
    setCheckpoints([]);
    setNewCpName('');
    setNewCpDesc('');
    setNewCpPoints(10);
    setNewCpVmId('');
    setNewCpScript('');
  };

  const generateCpId = (name: string) =>
    'cp_' +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 40);

  const addCheckpoint = () => {
    const trimmed = newCpName.trim();
    if (!trimmed) return;
    const cpId = generateCpId(trimmed);
    if (checkpoints.some((c) => c.id === cpId)) return;
    setCheckpoints((prev) => [
      ...prev,
      {
        id: cpId,
        name: trimmed,
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

  const removeCheckpoint = (id: string) =>
    setCheckpoints((prev) => prev.filter((c) => c.id !== id));

  const syncZoneCount = (count: number) => {
    const safeCount = Math.max(1, count);
    setNetworkZones((prevZones) => {
      if (safeCount === prevZones.length) return prevZones;
      if (safeCount < prevZones.length) return prevZones.slice(0, safeCount);

      const nextZones = [...prevZones];
      while (nextZones.length < safeCount) {
        nextZones.push(createEmptyZone(nextZones.length));
      }
      return nextZones;
    });
  };

  const updateZoneField = <K extends keyof NetworkZone>(
    zoneId: string,
    field: K,
    value: NetworkZone[K]
  ) => {
    setNetworkZones((prevZones) =>
      prevZones.map((zone) => (zone.id === zoneId ? { ...zone, [field]: value } : zone))
    );
  };

  const toggleZoneConnection = (zoneId: string, targetZoneId: string) => {
    setNetworkZones((prevZones) =>
      prevZones.map((zone) => {
        if (zone.id !== zoneId) return zone;

        const isConnected = zone.connectedZoneIds.includes(targetZoneId);

        return {
          ...zone,
          connectedZoneIds: isConnected
            ? zone.connectedZoneIds.filter((id) => id !== targetZoneId)
            : [...zone.connectedZoneIds, targetZoneId],
        };
      })
    );
  };

  const updateZoneCidr = (zoneId: string, nextCidr: string) => {
    setNetworkZones((prevZones) =>
      prevZones.map((zone) => {
        if (zone.id !== zoneId) return zone;

        const previousDefaultGateway = getGatewayFromCidr(zone.cidr);
        const nextDefaultGateway = getGatewayFromCidr(nextCidr);
        const shouldAutoUpdateGateway = !zone.gateway || zone.gateway === previousDefaultGateway;

        return {
          ...zone,
          cidr: nextCidr,
          gateway: shouldAutoUpdateGateway ? nextDefaultGateway : zone.gateway,
        };
      })
    );
  };

  const syncVmCount = (count: number) => {
    const safeCount = Math.max(1, count);
    setVmConfigs((prevVms) => {
      if (safeCount === prevVms.length) return prevVms;
      if (safeCount < prevVms.length) return prevVms.slice(0, safeCount);

      const nextVms = [...prevVms];
      while (nextVms.length < safeCount) {
        nextVms.push(
          createEmptyVm(nextVms.length, osOptions[0]?.name ?? '', flavorOptions[0] ?? '')
        );
      }
      return nextVms;
    });
  };

  const updateVmField = <K extends keyof VmConfig>(vmId: string, field: K, value: VmConfig[K]) => {
    setVmConfigs((prevVms) =>
      prevVms.map((vm) => (vm.id === vmId ? { ...vm, [field]: value } : vm))
    );
  };

  useEffect(() => {
    const zoneIdSet = new Set(networkZones.map((zone) => zone.id));
    setVmConfigs((prevVms) => {
      const next = prevVms.map((vm) => ({
        ...vm,
        zoneIds: (Array.isArray(vm.zoneIds) ? vm.zoneIds : [vm.zoneId]).filter((zoneId) =>
          zoneIdSet.has(zoneId)
        ),
      }));
      // Bail out if zone membership hasn't actually changed.
      const changed = next.some(
        (vm, i) =>
          vm.zoneIds.length !== prevVms[i]?.zoneIds?.length ||
          vm.zoneIds.some((id, j) => id !== prevVms[i]?.zoneIds?.[j])
      );
      return changed ? next : prevVms;
    });
  }, [networkZones]);

  const handleAddModule = () => {
    if (!moduleName.trim()) {
      setModuleError('Vui lòng nhập tên module.');
      return;
    }

    const objectives = moduleObjectives
      .split('\n')
      .map((item) => item.replace(/^-\s*/, '').trim())
      .filter(Boolean);

    const zoneById = new Map(networkZones.map((zone) => [zone.id, zone]));

    for (const zone of networkZones) {
      const dhcpError = getDhcpRangeValidationError(zone);
      if (dhcpError) {
        setModuleError(`Zone ${zone.name || zone.id}: ${dhcpError}`);
        return;
      }

      if (zone.dnsServers.length > 5) {
        setModuleError(`Zone ${zone.name || zone.id}: chỉ cho phép tối đa 5 DNS.`);
        return;
      }
    }

    for (const vm of vmConfigs) {
      if (vm.zoneIds.length === 0) {
        setModuleError(`VM ${vm.nodeName || vm.id} phải chọn ít nhất một zone mạng.`);
        return;
      }

      const vmZones = vm.zoneIds
        .map((zoneId) => zoneById.get(zoneId))
        .filter((zone): zone is NetworkZone => Boolean(zone));

      if (vm.networkType === 'dhcp') {
        const zoneWithoutRange = vmZones.find(
          (zone) => !(zone.dhcpStart.trim() && zone.dhcpEnd.trim())
        );
        if (zoneWithoutRange) {
          setModuleError(
            `VM ${vm.nodeName || vm.id} dùng DHCP nhưng zone ${zoneWithoutRange.name || zoneWithoutRange.id} chưa có range start-end.`
          );
          return;
        }
      }

      const staticError = getVmStaticIpValidationError(vm, vmZones);
      if (staticError) {
        setModuleError(`VM ${vm.nodeName || vm.id}: ${staticError}`);
        return;
      }
    }

    const definitionJson = {
      networkZones,
      vmConfigs,
      checkpoints,
    };

    setModuleDrafts((prev) => [
      ...prev,
      {
        id: `module-${Date.now()}`,
        name: moduleName.trim(),
        description: moduleDescription.trim(),
        orderNo: moduleOrderNo,
        estimatedMinutes: moduleEstimatedMinutes,
        objectives,
        definitionJson,
      },
    ]);

    resetModuleForm();
    setShowAddModuleModal(false);
  };

  return (
    // Trên mobile 1 cột, trên desktop 3 cột
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      {/* Trên desktop chiếm 2/3 chiều ngang */}
      <div className="space-y-6 lg:col-span-2">
        {/* Notice */}
        <div className="flex items-center gap-3 rounded-lg border border-primary bg-[#FFFBEB] p-4">
          <Settings className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-primary">
              Mỗi module đại diện cho một phần của lab (máy ảo, network, storage...) và script cài
              đặt phần mềm cho từng module.
            </p>
          </div>
        </div>

        {/* Add Module Button */}
        <button
          onClick={() => setShowAddModuleModal(true)}
          className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white py-8 transition-colors hover:border-primary hover:bg-primary/10"
        >
          <Plus className="h-6 w-6 text-gray-400 group-hover:text-primary" />
          <span className="font-medium text-gray-600 group-hover:text-primary">
            Thêm module mới
          </span>
        </button>

        {/* Add Module Modal */}
        {showAddModuleModal &&
          isClient &&
          createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
                <div className="sticky top-0 z-10 border-b border-gray-200 bg-white p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-gray-900">Thêm Module Mới</h2>
                    <button
                      onClick={() => setShowAddModuleModal(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="mt-4 flex gap-2 border-b border-gray-200">
                    {tabs.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <button
                          key={tab.id}
                          onClick={() => setCurrentTab(tab.id)}
                          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                            currentTab === tab.id
                              ? 'border-primary text-primary'
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
                  {currentTab === 'basic' && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Tên module <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={moduleName}
                          onChange={(event) => setModuleName(event.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="VD: Web Server Configuration"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Mô tả
                        </label>
                        <textarea
                          rows={4}
                          value={moduleDescription}
                          onChange={(event) => setModuleDescription(event.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="Mô tả mục đích và nội dung của module..."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700">
                            Module Order
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={moduleOrderNo}
                            onChange={(event) => setModuleOrderNo(Number(event.target.value) || 1)}
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
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
                            onChange={(event) =>
                              setModuleEstimatedMinutes(Number(event.target.value) || 0)
                            }
                            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Objectives
                        </label>
                        <textarea
                          rows={3}
                          value={moduleObjectives}
                          onChange={(event) => setModuleObjectives(event.target.value)}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                          placeholder="- Objective 1&#10;- Objective 2&#10;- Objective 3"
                        />
                      </div>
                    </div>
                  )}

                  {currentTab === 'vms' && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          Số lượng máy ảo (VM) <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={vmCountInput}
                          onChange={(event) => {
                            const inputValue = event.target.value;
                            setVmCountInput(inputValue);

                            const count = Number(inputValue);
                            if (Number.isInteger(count) && count >= 1) {
                              syncVmCount(count);
                            }
                          }}
                          onBlur={() => {
                            const count = Number(vmCountInput);
                            if (!Number.isInteger(count) || count < 1) {
                              setVmCountInput(String(vmConfigs.length));
                            }
                          }}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      {vmConfigs.map((vm, index) => {
                        const selectedZones = networkZones.filter((zone) =>
                          vm.zoneIds.includes(zone.id)
                        );
                        const staticIpError = getVmStaticIpValidationError(vm, selectedZones);
                        const selectedImage = osOptions.find(
                          (img) => img.name === vm.operatingSystem
                        );
                        const isGolden = selectedImage?.laasImageType === 'custom';

                        return (
                          <div key={vm.id} className="rounded-lg border border-gray-200 p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <h4 className="font-semibold text-gray-900">Máy ảo #{index + 1}</h4>
                              {vmConfigs.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVmConfigs((prevVms) => {
                                      const nextVms = prevVms.filter((item) => item.id !== vm.id);
                                      setVmCountInput(String(nextVms.length));
                                      return nextVms;
                                    });
                                  }}
                                  className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                            <div className="space-y-4">
                              {isGolden && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                                  <div className="flex items-start gap-3">
                                    <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                                    <div className="flex-1 text-xs text-amber-800">
                                      <p className="font-semibold">Golden Image Mode</p>
                                      <p className="mt-0.5">
                                        Image này đã được cấu hình sẵn — các trường mạng và tài
                                        khoản đã bị khóa. Cloud-init đã bị tắt, bỏ qua bootstrap
                                        script.
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
                                  type="text"
                                  value={vm.nodeName}
                                  onChange={(event) =>
                                    updateVmField(vm.id, 'nodeName', event.target.value)
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder={`node-${index + 1}`}
                                />
                              </div>

                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                  Vai trò vận hành của node
                                </label>
                                <textarea
                                  rows={3}
                                  value={vm.note}
                                  onChange={(event) =>
                                    updateVmField(vm.id, 'note', event.target.value)
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder="VD: Control plane, worker node, database node..."
                                />
                              </div>

                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                  Zone mạng gán cho node <span className="text-red-500">*</span>
                                </label>
                                <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                                  {networkZones.map((zone, zoneIndex) => {
                                    const zoneLabel =
                                      zone.name.trim() || `Zone mạng #${zoneIndex + 1}`;
                                    const checked = vm.zoneIds.includes(zone.id);
                                    return (
                                      <label
                                        key={`${vm.id}-${zone.id}`}
                                        className="flex items-center gap-2 text-sm text-gray-700"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(event) => {
                                            const nextZoneIds = event.target.checked
                                              ? Array.from(new Set([...vm.zoneIds, zone.id]))
                                              : vm.zoneIds.filter((zoneId) => zoneId !== zone.id);
                                            updateVmField(vm.id, 'zoneIds', nextZoneIds);
                                          }}
                                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                                        />
                                        {zoneLabel}
                                      </label>
                                    );
                                  })}
                                </div>
                                {networkZones.length === 0 && (
                                  <p className="mt-1 text-xs text-gray-500">
                                    Chưa có zone mạng. Vui lòng cấu hình trong tab Network trước.
                                  </p>
                                )}
                                {vm.zoneIds.length === 0 && networkZones.length > 0 && (
                                  <p className="mt-1 text-xs text-red-500">
                                    VM phải chọn ít nhất một zone mạng.
                                  </p>
                                )}
                              </div>

                              <div>
                                <label className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700">
                                  Cơ chế cấp phát địa chỉ IP
                                  {isGolden && <Lock className="h-3 w-3 text-amber-500" />}
                                </label>
                                <select
                                  value={vm.networkType}
                                  disabled={isGolden}
                                  onChange={(event) =>
                                    updateVmField(
                                      vm.id,
                                      'networkType',
                                      event.target.value as 'dhcp' | 'static'
                                    )
                                  }
                                  className={`w-full rounded-lg border px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${isGolden ? 'cursor-not-allowed bg-amber-50 text-gray-500' : 'border-gray-300'}`}
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
                                    type="text"
                                    value={vm.staticIp}
                                    disabled={isGolden}
                                    onChange={(event) =>
                                      updateVmField(vm.id, 'staticIp', event.target.value)
                                    }
                                    className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                                      isGolden
                                        ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-gray-500'
                                        : staticIpError
                                          ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                                          : 'border-gray-300 focus:border-primary focus:ring-primary/20'
                                    }`}
                                    placeholder="192.168.10.10"
                                  />
                                  {!isGolden && staticIpError ? (
                                    <p className="mt-1 text-xs text-red-500">{staticIpError}</p>
                                  ) : !isGolden ? (
                                    <p className="mt-1 text-xs text-gray-500">
                                      Không sử dụng địa chỉ .1 vì được dành cho gateway.
                                    </p>
                                  ) : null}
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Hệ điều hành (OS)
                                  </label>
                                  {(() => {
                                    const baseImages = osOptions.filter(
                                      (img) => img.laasImageType !== 'custom'
                                    );
                                    const customImages = osOptions.filter(
                                      (img) => img.laasImageType === 'custom'
                                    );
                                    const osNameInList = osOptions.some(
                                      (img) => img.name === vm.operatingSystem
                                    );
                                    return (
                                      <select
                                        value={vm.operatingSystem}
                                        onChange={(event) => {
                                          const chosen = osOptions.find(
                                            (img) => img.name === event.target.value
                                          );
                                          updateVmField(
                                            vm.id,
                                            'operatingSystem',
                                            event.target.value
                                          );
                                          if (chosen?.laasImageType === 'custom') {
                                            if (chosen.networkType)
                                              updateVmField(
                                                vm.id,
                                                'networkType',
                                                chosen.networkType as 'dhcp' | 'static'
                                              );
                                            if (chosen.staticIp)
                                              updateVmField(vm.id, 'staticIp', chosen.staticIp);
                                            if (chosen.vmUsername)
                                              updateVmField(
                                                vm.id,
                                                'initialUsername',
                                                chosen.vmUsername
                                              );
                                            if (chosen.vmPassword)
                                              updateVmField(
                                                vm.id,
                                                'initialPassword',
                                                chosen.vmPassword
                                              );
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
                                          <option value={vm.operatingSystem}>
                                            {vm.operatingSystem}
                                          </option>
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
                                    onChange={(event) =>
                                      updateVmField(vm.id, 'flavor', event.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  >
                                    {flavorOptions.length === 0 && (
                                      <option value="">Chưa có Flavor từ OpenStack</option>
                                    )}
                                    {flavorOptions.map((flavorName) => (
                                      <option key={flavorName} value={flavorName}>
                                        {flavorName}
                                      </option>
                                    ))}
                                    {!flavorOptions.includes(vm.flavor) && (
                                      <option value={vm.flavor}>{vm.flavor}</option>
                                    )}
                                  </select>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700">
                                    Tài khoản khởi tạo ban đầu
                                    {isGolden && <Lock className="h-3 w-3 text-amber-500" />}
                                  </label>
                                  <input
                                    type="text"
                                    value={
                                      isGolden
                                        ? selectedImage?.vmUsername || ''
                                        : vm.initialUsername
                                    }
                                    disabled={isGolden}
                                    onChange={(event) =>
                                      updateVmField(vm.id, 'initialUsername', event.target.value)
                                    }
                                    className={`w-full rounded-lg border px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${isGolden ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-gray-500' : 'border-gray-300'}`}
                                    placeholder="admin"
                                  />
                                </div>

                                <div>
                                  <label className="mb-2 flex items-center gap-1 text-sm font-medium text-gray-700">
                                    Mật khẩu khởi tạo ban đầu
                                    {isGolden && <Lock className="h-3 w-3 text-amber-500" />}
                                  </label>
                                  <input
                                    type={isGolden ? 'text' : 'password'}
                                    value={
                                      isGolden
                                        ? selectedImage?.vmPassword || ''
                                        : vm.initialPassword
                                    }
                                    disabled={isGolden}
                                    onChange={(event) =>
                                      updateVmField(vm.id, 'initialPassword', event.target.value)
                                    }
                                    className={`w-full rounded-lg border px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${isGolden ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-gray-500' : 'border-gray-300'}`}
                                    placeholder="••••••••"
                                  />
                                </div>
                              </div>

                              {!isGolden && (
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Repository GitHub chứa Ansible bootstrap
                                  </label>
                                  <input
                                    type="url"
                                    value={vm.ansibleRepoUrl}
                                    onChange={(event) =>
                                      updateVmField(vm.id, 'ansibleRepoUrl', event.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="https://github.com/pTn-3001"
                                  />
                                </div>
                              )}

                              {!isGolden && (
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Command (auto inject vao /opt/laas/instructor/provision.sh)
                                  </label>
                                  <textarea
                                    rows={5}
                                    value={vm.command}
                                    onChange={(event) =>
                                      updateVmField(vm.id, 'command', event.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="echo 'Prepare environment'&#10;/usr/local/bin/checkpoint-signal cp_env_ready SUCCESS 'environment ready'"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => {
                          setVmConfigs((prevVms) => {
                            const nextVms = [
                              ...prevVms,
                              createEmptyVm(
                                prevVms.length,
                                osOptions[0]?.name ?? '',
                                flavorOptions[0] ?? ''
                              ),
                            ];
                            setVmCountInput(String(nextVms.length));
                            return nextVms;
                          });
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-3 text-sm font-medium text-gray-600 hover:border-primary hover:bg-primary/10 hover:text-primary"
                      >
                        <Plus className="h-4 w-4" />
                        Thêm máy ảo
                      </button>
                    </div>
                  )}

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
                          onChange={(event) => {
                            const inputValue = event.target.value;
                            setZoneCountInput(inputValue);

                            const count = Number(inputValue);
                            if (Number.isInteger(count) && count >= 1) {
                              syncZoneCount(count);
                            }
                          }}
                          onBlur={() => {
                            const count = Number(zoneCountInput);
                            if (!Number.isInteger(count) || count < 1) {
                              const fixedCount = networkZones.length;
                              setZoneCountInput(String(fixedCount));
                            }
                          }}
                          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      {networkZones.map((zone, index) => {
                        const cidrError = getCidrValidationError(zone.cidr);
                        const connectableZones = networkZones.filter((item) => item.id !== zone.id);

                        return (
                          <div key={zone.id} className="rounded-lg border border-gray-200 p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <h4 className="font-semibold text-gray-900">
                                Zone mạng #{index + 1}
                              </h4>
                              {networkZones.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextZones = networkZones.filter(
                                      (item) => item.id !== zone.id
                                    );
                                    const sanitizedZones = nextZones.map((item) => ({
                                      ...item,
                                      connectedZoneIds: item.connectedZoneIds.filter(
                                        (id) => id !== zone.id
                                      ),
                                    }));
                                    setNetworkZones(sanitizedZones);
                                    setZoneCountInput(String(sanitizedZones.length));
                                    setVmConfigs((prevVms) =>
                                      prevVms.map((vm) => ({
                                        ...vm,
                                        zoneIds: vm.zoneIds.filter((zoneId) => zoneId !== zone.id),
                                      }))
                                    );
                                  }}
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
                                  type="text"
                                  value={zone.name}
                                  onChange={(event) =>
                                    updateZoneField(zone.id, 'name', event.target.value)
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder={`zone-${index + 1}`}
                                />
                              </div>

                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                  Vai trò và phạm vi sử dụng của zone
                                </label>
                                <textarea
                                  rows={3}
                                  value={zone.note}
                                  onChange={(event) =>
                                    updateZoneField(zone.id, 'note', event.target.value)
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder="VD: Zone cho ứng dụng nội bộ hoặc zone DMZ"
                                />
                              </div>

                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                  CIDR <span className="text-red-500">*</span>
                                </label>
                                <input
                                  type="text"
                                  value={zone.cidr}
                                  onChange={(event) => updateZoneCidr(zone.id, event.target.value)}
                                  className={`w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 ${
                                    cidrError
                                      ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
                                      : 'border-gray-300 focus:border-primary focus:ring-primary/20'
                                  }`}
                                  placeholder="192.168.10.0/24"
                                />
                                {cidrError ? (
                                  <p className="mt-1 text-xs text-red-500">{cidrError}</p>
                                ) : (
                                  <p className="mt-1 text-xs text-gray-500">
                                    Subnet mask từ /24 đến /32.
                                  </p>
                                )}
                              </div>

                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                  Gateway
                                </label>
                                <input
                                  type="text"
                                  value={zone.gateway}
                                  onChange={(event) =>
                                    updateZoneField(zone.id, 'gateway', event.target.value)
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder="192.168.10.1"
                                />
                              </div>

                              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-gray-700">
                                    DHCP Start
                                  </label>
                                  <input
                                    type="text"
                                    value={zone.dhcpStart}
                                    onChange={(event) =>
                                      updateZoneField(zone.id, 'dhcpStart', event.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="192.168.10.100"
                                  />
                                </div>
                                <div>
                                  <label className="mb-2 block text-sm font-medium text-gray-700">
                                    DHCP End
                                  </label>
                                  <input
                                    type="text"
                                    value={zone.dhcpEnd}
                                    onChange={(event) =>
                                      updateZoneField(zone.id, 'dhcpEnd', event.target.value)
                                    }
                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    placeholder="192.168.10.200"
                                  />
                                </div>
                              </div>
                              {getDhcpRangeValidationError(zone) && (
                                <p className="-mt-2 text-xs text-red-500">
                                  {getDhcpRangeValidationError(zone)}
                                </p>
                              )}

                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                  DNS (tối đa 5, cách nhau bởi dấu phẩy)
                                </label>
                                <input
                                  type="text"
                                  value={zone.dnsServers.join(', ')}
                                  onChange={(event) => {
                                    const dnsServers = event.target.value
                                      .split(',')
                                      .map((item) => item.trim())
                                      .filter(Boolean)
                                      .slice(0, 5);
                                    updateZoneField(zone.id, 'dnsServers', dnsServers);
                                  }}
                                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                                  placeholder="8.8.8.8, 1.1.1.1"
                                />
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  id={`internet-${zone.id}`}
                                  type="checkbox"
                                  checked={zone.hasInternet}
                                  onChange={(event) =>
                                    updateZoneField(zone.id, 'hasInternet', event.target.checked)
                                  }
                                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                                />
                                <label
                                  htmlFor={`internet-${zone.id}`}
                                  className="text-sm font-medium text-gray-700"
                                >
                                  Cho phép truy cập Internet
                                </label>
                              </div>

                              <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                  Kết nối với các zone khác:
                                </label>
                                {connectableZones.length === 0 ? (
                                  <p className="text-xs text-gray-500">
                                    Chưa có zone nào khác để cấu hình kết nối.
                                  </p>
                                ) : (
                                  <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                                    {connectableZones.map((targetZone) => {
                                      const zoneNumber =
                                        networkZones.findIndex(
                                          (item) => item.id === targetZone.id
                                        ) + 1;
                                      const targetLabel =
                                        targetZone.name.trim() || `Zone mạng #${zoneNumber}`;

                                      return (
                                        <label
                                          key={`${zone.id}-${targetZone.id}`}
                                          className="flex items-center gap-2 text-sm text-gray-700"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={zone.connectedZoneIds.includes(targetZone.id)}
                                            onChange={() =>
                                              toggleZoneConnection(zone.id, targetZone.id)
                                            }
                                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
                                          />
                                          {targetLabel}
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => {
                          setNetworkZones((prevZones) => {
                            const nextZones = [...prevZones, createEmptyZone(prevZones.length)];
                            setZoneCountInput(String(nextZones.length));
                            return nextZones;
                          });
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-3 text-sm font-medium text-gray-600 hover:border-primary hover:bg-primary/10 hover:text-primary"
                      >
                        <Plus className="h-4 w-4" />
                        Thêm zone mạng
                      </button>
                    </div>
                  )}

                  {currentTab === 'checkpoint' && (
                    <div className="space-y-5">
                      {/* Header */}
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <div className="flex gap-3">
                          <Lightbulb className="h-5 w-5 flex-shrink-0 text-blue-600" />
                          <div className="text-sm text-blue-800">
                            <p className="font-semibold">
                              Checkpoint tự động kiểm tra (Heat WaitCondition)
                            </p>
                            <p className="mt-1">
                              Mỗi checkpoint tương ứng một <strong>WaitCondition</strong> riêng
                              trong Heat Template. Script check chạy định kỳ trên VM — khi điều kiện
                              thỏa mãn, gọi{' '}
                              <code className="rounded bg-blue-100 px-1 font-mono text-xs">
                                curl … {'${CP_ID}'}
                              </code>{' '}
                              để báo hiệu. Trường <em>Command</em> ở tab VM dùng để inject các lệnh
                              thêm khi boot máy (provision.sh), độc lập với script check.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Add form */}
                      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <p className="mb-3 text-sm font-medium text-gray-700">
                          Thêm checkpoint mới
                        </p>

                        {/* Row 1: name + description */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <input
                            value={newCpName}
                            onChange={(e) => setNewCpName(e.target.value)}
                            placeholder="Tên checkpoint (VD: Nginx Running)"
                            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                          <input
                            value={newCpDesc}
                            onChange={(e) => setNewCpDesc(e.target.value)}
                            placeholder="Mô tả (tuỳ chọn)"
                            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                        </div>

                        {/* Row 2: VM selector */}
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
                            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                          >
                            <option value="">— Chọn VM node —</option>
                            {vmConfigs.map((vm) => (
                              <option key={vm.id} value={vm.id}>
                                {vm.nodeName || `VM ${vmConfigs.indexOf(vm) + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Row 3: script check */}
                        <div className="mt-3">
                          <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <label className="text-sm text-gray-600">
                              Script check{' '}
                              <span className="text-gray-400">
                                (tạo file riêng, không dùng provision.sh)
                              </span>
                            </label>
                            {newCpName.trim() && (
                              <span className="font-mono text-xs text-gray-400">
                                →{' '}
                                <span className="text-primary">
                                  /var/cp_{generateCpId(newCpName).replace(/^cp_/, '')}.sh
                                </span>
                              </span>
                            )}
                          </div>
                          {newCpName.trim() && (
                            <p className="mb-1.5 font-mono text-xs text-gray-400">
                              Biến tín hiệu:{' '}
                              <span className="text-yellow-400">
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
                            placeholder={`#!/bin/bash\n# Kiểm tra điều kiện của checkpoint...\nwhile true; do\n  if systemctl is-active --quiet nginx; then\n    curl -X POST -d '{"status":"SUCCESS"}' \${CP_NGINX_RUNNING}\n    break\n  fi\n  sleep 5\ndone`}
                            className="w-full rounded-md border border-gray-200 bg-gray-900 px-3 py-2 font-mono text-xs text-green-400 outline-none focus:border-primary"
                            spellCheck={false}
                          />
                        </div>

                        {/* Row 4: hint command */}
                        <div className="mt-3">
                          <label className="mb-1 block text-sm text-gray-600">
                            Gợi ý (hint command){' '}
                            <span className="text-gray-400">
                              — hiển thị khi student nhấn bóng đèn
                            </span>
                          </label>
                          <textarea
                            value={newCpHintCommand}
                            onChange={(e) => setNewCpHintCommand(e.target.value)}
                            placeholder={
                              'VD:\n# Kiểm tra dịch vụ nginx\nsystemctl status nginx\n\n# Xem log\njournalctl -u nginx -n 20'
                            }
                            rows={5}
                            className="w-full resize-y rounded-md border border-gray-200 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                          />
                        </div>

                        {/* Row 5: points + add button */}
                        <div className="mt-3 flex items-center gap-3">
                          <label className="shrink-0 text-sm text-gray-600">Điểm:</label>
                          <input
                            type="number"
                            min={0}
                            value={newCpPoints}
                            onChange={(e) => setNewCpPoints(Number(e.target.value))}
                            className="w-20 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                          />
                          <button
                            onClick={addCheckpoint}
                            disabled={!newCpName.trim() || !newCpVmId}
                            className="ml-auto flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-40"
                          >
                            <Plus className="h-4 w-4" />
                            Thêm checkpoint
                          </button>
                        </div>
                        {newCpName.trim() && !newCpVmId && (
                          <p className="mt-2 text-xs text-amber-600">
                            Vui lòng chọn VM node để gán checkpoint này.
                          </p>
                        )}
                      </div>

                      {/* List */}
                      {checkpoints.length === 0 ? (
                        <p className="text-center text-sm text-gray-400">Chưa có checkpoint nào</p>
                      ) : (
                        <div className="space-y-3">
                          {checkpoints.map((cp, idx) => {
                            const assignedVm = vmConfigs.find((v) => v.id === cp.vmId);
                            const envVar = `CP_${cp.id.replace(/^cp_/, '').toUpperCase()}`;
                            return (
                              <div
                                key={cp.id}
                                className="rounded-lg border border-gray-200 bg-white p-4"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    {/* Title row */}
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
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
                                          {assignedVm.nodeName ||
                                            `VM ${vmConfigs.indexOf(assignedVm) + 1}`}
                                        </span>
                                      ) : (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                                          Chưa gán VM
                                        </span>
                                      )}
                                    </div>

                                    {cp.description && (
                                      <p className="mt-1 pl-8 text-xs text-gray-500">
                                        {cp.description}
                                      </p>
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

                                    {/* Script check */}
                                    <div className="mt-3 pl-8">
                                      <div className="mb-1 flex items-baseline gap-2">
                                        <p className="text-xs font-medium text-gray-500">
                                          Script check
                                        </p>
                                        <span className="font-mono text-xs text-primary">
                                          /var/cp_{cp.id.replace(/^cp_/, '')}.sh
                                        </span>
                                        {assignedVm && (
                                          <span className="text-xs text-gray-400">
                                            trên{' '}
                                            {assignedVm.nodeName ||
                                              `VM ${vmConfigs.indexOf(assignedVm) + 1}`}
                                          </span>
                                        )}
                                      </div>
                                      {cp.checkScript ? (
                                        <pre className="max-h-40 overflow-auto rounded bg-gray-900 px-3 py-2 font-mono text-xs leading-relaxed text-green-400">
                                          {cp.checkScript}
                                        </pre>
                                      ) : (
                                        <p className="text-xs italic text-gray-400">
                                          Chưa có script check
                                        </p>
                                      )}
                                    </div>

                                    {/* Signal variable */}
                                    <div className="mt-2 pl-8">
                                      <p className="mb-1 text-xs text-gray-400">
                                        Biến tín hiệu (Heat WaitConditionHandle):
                                      </p>
                                      <code className="block rounded bg-gray-900 px-3 py-2 font-mono text-xs text-yellow-300">
                                        {'curl -X POST -d \'{"status":"SUCCESS"}\' ${'}
                                        {envVar}
                                        {'}'}
                                      </code>
                                    </div>
                                  </div>

                                  <button
                                    onClick={() => removeCheckpoint(cp.id)}
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

                <div className="sticky bottom-0 border-t border-gray-200 bg-gray-50 p-6">
                  {moduleError && (
                    <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                      {moduleError}
                    </div>
                  )}
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowAddModuleModal(false)}
                      className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={handleAddModule}
                      className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90"
                    >
                      <Plus className="mr-2 inline h-4 w-4" />
                      Thêm Module
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )}

        {/* Module List */}
        <div className="space-y-4">
          {moduleDrafts.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm">
              Chưa có module nào. Vui lòng thêm module để gửi lên backend.
            </div>
          ) : (
            moduleDrafts.map((module, index) => (
              <div
                key={module.id}
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-primary hover:shadow-md"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-amber-100 text-sm font-bold text-amber-700">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{module.name}</h4>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="default" size="md" className="bg-blue-100 text-blue-700">
                          Đã cấu hình
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() =>
                        setModuleDrafts((prev) => prev.filter((item) => item.id !== module.id))
                      }
                      className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mb-4 rounded-lg bg-gray-50 p-4">
                  <p className="mb-2 text-xs text-gray-600">Mục đích:</p>
                  {module.objectives.length === 0 ? (
                    <p className="text-xs text-gray-600">Chưa có mục tiêu.</p>
                  ) : (
                    <ul className="list-disc space-y-1 pl-4 text-xs text-gray-600">
                      {module.objectives.map((objective) => (
                        <li key={objective}>{objective}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center text-xs font-medium text-gray-500">
                    <Settings className="mr-1 h-3.5 w-3.5" /> Tài nguyên: order {module.orderNo}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600">
                      <Server className="h-3 w-3" /> Ước tính {module.estimatedMinutes} phút
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Side Summary */}
      <div className="space-y-6">
        {/* Overview resources */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Tổng quan</h3>

          <div className="mb-4 space-y-3 border-b border-gray-100 pb-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tổng module:</span>
              <span className="font-medium text-gray-900">{moduleDrafts.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tổng tài nguyên:</span>
              <span className="font-medium text-gray-900">{totalResources}</span>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs text-gray-500">Phân bổ tài nguyên:</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-gray-600">
                  <Server className="h-4 w-4" /> Virtual Machine
                </span>
                <Badge variant="muted" size="md" className="bg-gray-100 text-gray-700">
                  {totalVMs}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-gray-600">
                  <Network className="h-4 w-4" /> Network
                </span>
                <Badge variant="muted" size="md" className="bg-gray-100 text-gray-700">
                  {totalNetworks}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="rounded-xl border border-primary bg-[#FFFBEB] p-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            <Lightbulb className="h-4 w-4" /> Best Practices
          </h3>
          <ul className="list-disc space-y-2 pl-4 text-xs text-primary">
            <li>Đặt tên module rõ ràng và có ý nghĩa</li>
            <li>Nhóm các tài nguyên liên quan trong cùng module</li>
            <li>Cấu hình Security Groups hợp lý</li>
            <li>Sử dụng script để tự động hóa cài đặt</li>
            <li>Test cấu hình trước khi deploy</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function Step3Confirmation({
  labForm,
  setLabForm,
  moduleDrafts,
}: {
  labForm: LabFormState;
  setLabForm: Dispatch<SetStateAction<LabFormState>>;
  moduleDrafts: ModuleDraft[];
}) {
  const resourceSummary = summarizeResources(moduleDrafts);
  const totalEstimatedMinutes = moduleDrafts.reduce(
    (sum, moduleDraft) => sum + moduleDraft.estimatedMinutes,
    0
  );
  const tags = labForm.tags
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const estimatedCostPerHour =
    resourceSummary.cpu * 400 + resourceSummary.ram * 80 + resourceSummary.disk * 5;
  const totalDurationInHours = totalEstimatedMinutes / 60;
  const estimatedCost = estimatedCostPerHour * totalDurationInHours;

  return (
    <div className="space-y-6">
      {/* Top Row: Lab Info & Module Info */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Lab Info Card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col h-full">
          <div className="border-b border-gray-100 p-6 pb-4">
            <h3 className="text-base font-semibold text-gray-900">Thông tin chung của lab</h3>
          </div>
          <div className="p-6 space-y-4 flex-1">
            <div>
              <span className="block text-xs text-gray-500">Tên lab:</span>
              <span className="text-sm font-medium text-primary">{labForm.name || '--'}</span>
            </div>
            <div>
              <span className="block text-xs text-gray-500">Mô tả ngắn:</span>
              <p className="mt-1 text-sm text-gray-700">
                {labForm.description || 'Chưa có mô tả.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-xs text-gray-500">Phân loại:</span>
                <span className="text-sm text-gray-900">{labForm.category || '--'}</span>
              </div>
              <div>
                <span className="block text-xs text-gray-500">Thời lượng:</span>
                <span className="text-sm text-gray-900">
                  {totalEstimatedMinutes > 0 ? `${totalEstimatedMinutes} phút` : '--'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-xs text-gray-500">Mức độ:</span>
                <Badge variant="advanced" size="md">
                  {labForm.difficulty || 'N/A'}
                </Badge>
              </div>
              <div>
                <span className="block text-xs text-gray-500">Tags:</span>
                <span className="text-sm text-gray-900">
                  {tags.length > 0 ? tags.join(', ') : '--'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modules Info Card */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col h-full">
          <div className="border-b border-gray-100 p-6 pb-4">
            <h3 className="text-base font-semibold text-gray-900">
              Module lab và nội dung chi tiết
            </h3>
          </div>
          <div className="p-6 pt-4 flex-1 flex flex-col max-h-[300px] overflow-y-auto">
            <div className="mb-3 flex items-center gap-2">
              <p className="text-xs text-gray-500">Tổng số module:</p>
              <span className="font-medium text-primary">{moduleDrafts.length} module</span>
            </div>

            <div className="space-y-3 pr-2 flex-1 overflow-y-auto">
              {moduleDrafts.length === 0 && (
                <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 text-sm text-gray-500">
                  Chưa có module nào để xác nhận.
                </div>
              )}

              {moduleDrafts.map((moduleDraft, index) => (
                <div
                  key={moduleDraft.id}
                  className="rounded-lg border border-gray-200 bg-gray-50/50 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-sm font-medium text-gray-900">{index + 1}.</div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">
                        {moduleDraft.name} ({moduleDraft.estimatedMinutes} phút)
                      </h4>
                      {moduleDraft.objectives.length > 0 ? (
                        <ul className="mt-2 space-y-1 text-xs text-gray-600">
                          {moduleDraft.objectives.map((objective) => (
                            <li
                              key={`${moduleDraft.id}-${objective}`}
                              className="flex list-inside list-disc items-center gap-1.5 pl-1"
                            >
                              {objective}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-gray-600">
                          Chưa có mục tiêu cho module này.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Resource Summary & Pricing */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Resource Summary */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="mb-6 text-base font-semibold text-gray-900">
            Tổng kết tài nguyên & chi phí
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
              <div className="mb-1 text-sm text-gray-500">Tổng CPU</div>
              <div className="text-primary-600 text-2xl font-semibold">{resourceSummary.cpu}</div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
              <div className="mb-1 text-sm text-gray-500">Tổng RAM</div>
              <div className="text-primary-600 text-2xl font-semibold">
                {resourceSummary.ram} GB
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 text-center">
              <div className="mb-1 text-sm text-gray-500">Tổng Disk</div>
              <div className="text-primary-600 text-2xl font-semibold">
                {resourceSummary.disk}GB
              </div>
            </div>
            <div className="bg-primary-50 rounded-lg border border-primary p-4 text-center">
              <div className="mb-1 text-sm font-medium text-gray-800">Ước tính chi phí</div>
              <div className="text-primary-600 text-2xl font-semibold">
                {estimatedCost.toLocaleString('vi-VN')}đ
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Card */}
        {labForm.pricingType === 'PAID' ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-1 text-base font-semibold text-gray-900">Định giá bài Lab</h3>
            <p className="mb-4 text-xs text-gray-500">Thiết lập giá bán và chương trình giảm giá dựa trên chi phí ước tính</p>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Giá gốc (VNĐ) *</label>
                <input
                  type="text"
                  value={formatNumberWithCommas(labForm.price) || ''}
                  onChange={(e) => {
                    const rawVal = e.target.value.replace(/,/g, '');
                    const val = rawVal ? Math.max(0, parseInt(rawVal, 10)) : 0;
                    const final = val * (1 - labForm.discountPercent / 100);
                    setLabForm((prev) => ({
                      ...prev,
                      price: val,
                      finalPrice: final,
                    }));
                  }}
                  className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:bg-white"
                  placeholder="Nhập giá gốc"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Giảm giá (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={labForm.discountPercent || ''}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, Number(e.target.value)));
                      const final = labForm.price * (1 - val / 100);
                      setLabForm((prev) => ({
                        ...prev,
                        discountPercent: val,
                        finalPrice: final,
                      }));
                    }}
                    className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:bg-white"
                    placeholder="VD: 10"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Giá sau giảm (VNĐ)</label>
                  <input
                    type="text"
                    value={formatNumberWithCommas(labForm.finalPrice) + ' VNĐ'}
                    disabled
                    className="w-full rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-sm text-gray-500 cursor-not-allowed font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col justify-center items-center text-center bg-gray-50/50">
            <div className="p-4 rounded-full bg-green-50 text-green-600 mb-3">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-gray-900">Bài Lab Miễn Phí</h3>
            <p className="text-xs text-gray-500 mt-1 max-w-sm">
              Bài lab này được cấu hình ở chế độ **Free (Miễn phí)**. Học viên có thể tham gia học mà không cần thanh toán.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
