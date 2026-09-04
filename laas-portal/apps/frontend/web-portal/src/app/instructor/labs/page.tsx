'use client';

import {
  CheckCircle,
  Clock,
  Copy,
  Edit,
  Eye,
  Filter,
  Layers,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Trash,
  X,
  XCircle,
} from 'lucide-react';

import { Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { InstructorLayout, SearchBar } from '@laas-portal/ui';
import { ensureValidToken, getStoredUser } from '../../../lib/auth';

type LabTemplate = {
  id: string;
  code: string;
  name: string;
  category: string;
  status: string;
  difficulty: string;
  accessType: string;
  moduleCount: number;
  updatedAt: string;
  createdAt: string;
  createdById: string;
  metadata?: any;
  tags?: any;
  description?: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

type ModuleSummary = {
  id: string;
  name: string;
  orderNo: number;
  estimatedMinutes?: number | null;
};

type ModuleDetail = {
  id: string;
  name: string;
  description?: string | null;
  orderNo: number;
  estimatedMinutes?: number | null;
  objectives?: string[] | null;
  definitionJson: Record<string, unknown>;
};

type LabTemplateDetail = {
  id: string;
  name: string;
  code: string;
  slug: string;
  description?: string | null;
  category?: string | null;
  difficulty?: string | null;
  tags?: string[] | null;
};

type ArtifactModule = {
  id: string;
  name: string;
  orderNo: number;
  estimatedMinutes?: number | null;
  heatTemplate: {
    fileName?: string | null;
    contentText?: string | null;
  } | null;
  cloudInitFiles: Array<{
    nodeName?: string | null;
    fileName?: string | null;
    contentText?: string | null;
  }>;
};

type ArtifactInitPayload = {
  lab: {
    id: string;
    code: string;
    name: string;
  };
  modules: ArtifactModule[];
};

type ActionState = {
  type: 'success' | 'error';
  message: string;
};

type InitializedStackRef = {
  moduleId: string;
  moduleName: string;
  stackId: string;
  stackName: string;
  sessionId?: string;
};

type HeatStackIdentity = {
  stackName: string;
  stackId: string;
};

const statusLabelMap: Record<string, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Active',
  ARCHIVED: 'Archived',
  REVIEW: 'Pending Approval',
};

const placeholderThumbnail =
  'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=300&h=200';

function formatDate(dateInput: string): string {
  const date = new Date(dateInput);
  return Number.isNaN(date.getTime()) ? '--/--/----' : date.toLocaleDateString('vi-VN');
}

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
  const sec = String(now.getSeconds()).padStart(2, '0');
  return `LAB-${y}${m}${d}-${h}${min}${sec}`;
}

function toResourceName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  );
}

function buildStackName(labCode: string, moduleOrderNo: number, moduleName: string): string {
  return toResourceName(`${labCode}-m${moduleOrderNo}-${moduleName}-${Date.now()}`);
}

function normalizeHeatTemplateForOpenStack(templateText: string): string {
  let normalized = templateText.replace(
    /security_groups:\s*\[allow-all\]/g,
    'security_groups: [default]'
  );

  if (!normalized.includes('OS::Neutron::FloatingIPAssociation')) {
    return normalized;
  }

  const ensureSharedRouterParameter = (input: string): string => {
    if (input.includes('\n  shared_router_id:')) {
      return input;
    }

    const resourcesIndex = input.indexOf('\nresources:');
    if (resourcesIndex < 0) {
      return input;
    }

    const parameterBlock = ['  shared_router_id:', '    type: string', '    default: ""', ''].join(
      '\n'
    );

    return input.slice(0, resourcesIndex) + parameterBlock + input.slice(resourcesIndex);
  };

  const ensureCreateRouterCondition = (input: string): string => {
    if (input.includes('\n  create_router:')) {
      return input;
    }

    const resourcesIndex = input.indexOf('\nresources:');
    if (resourcesIndex < 0) {
      return input;
    }

    const conditionLines = [
      '  create_router:',
      '    equals:',
      '      - { get_param: shared_router_id }',
      '      - ""',
      '',
    ].join('\n');

    if (input.includes('\nconditions:')) {
      return input.slice(0, resourcesIndex) + conditionLines + input.slice(resourcesIndex);
    }

    const conditionsBlock = `conditions:\n${conditionLines}`;
    return input.slice(0, resourcesIndex) + conditionsBlock + input.slice(resourcesIndex);
  };

  normalized = ensureSharedRouterParameter(normalized);
  normalized = ensureCreateRouterCondition(normalized);

  const networkAliasRegex = /^\s{2}([a-z0-9-]+)_network:\s*$/gm;
  const zoneAliases = Array.from(normalized.matchAll(networkAliasRegex)).map((match) => match[1]);

  for (const alias of zoneAliases) {
    const routerToken = `  ${alias}_router:`;
    const subnetToken = `  ${alias}_subnet:`;

    if (normalized.includes(routerToken)) {
      continue;
    }

    const subnetIndex = normalized.indexOf(subnetToken);
    if (subnetIndex < 0) {
      continue;
    }

    const afterSubnet = subnetIndex + subnetToken.length;
    const nextResourceMatch = /\n\s{2}[a-z0-9-][a-z0-9-_]*:\s*\n/g.exec(
      normalized.slice(afterSubnet)
    );

    const insertionIndex = nextResourceMatch
      ? afterSubnet + nextResourceMatch.index + 1
      : normalized.indexOf('\noutputs:') >= 0
        ? normalized.indexOf('\noutputs:')
        : normalized.length;

    const routerBlock = [
      `  ${alias}_router:`,
      '    type: OS::Neutron::Router',
      '    condition: create_router',
      '    properties:',
      `      name: "${alias}-router"`,
      '      external_gateway_info:',
      '        network: { get_param: provider_network }',
      '',
      `  ${alias}_router_interface:`,
      '    type: OS::Neutron::RouterInterface',
      '    properties:',
      '      router_id:',
      '        if:',
      '          - create_router',
      `          - { get_resource: ${alias}_router }`,
      '          - { get_param: shared_router_id }',
      `      subnet: { get_resource: ${alias}_subnet }`,
      '',
    ].join('\n');

    normalized =
      normalized.slice(0, insertionIndex) + routerBlock + normalized.slice(insertionIndex);
  }

  for (const alias of zoneAliases) {
    const routerDefinitionRegex = new RegExp(
      `(^\\s{2}${alias}_router:\\s*\\n\\s{4}type:\\s+OS::Neutron::Router\\s*\\n)(?!\\s{4}condition:\\s*create_router\\s*\\n)`,
      'm'
    );

    normalized = normalized.replace(routerDefinitionRegex, `$1    condition: create_router\n`);

    const unconditionalRouterIdLine = `      router_id: { get_resource: ${alias}_router }`;
    if (normalized.includes(unconditionalRouterIdLine)) {
      normalized = normalized.replace(
        unconditionalRouterIdLine,
        [
          '      router_id:',
          '        if:',
          '          - create_router',
          `          - { get_resource: ${alias}_router }`,
          '          - { get_param: shared_router_id }',
        ].join('\n')
      );
    }

    const assocRegex = new RegExp(
      `(^\\s{2}([a-z0-9-]+)_floating_ip_assoc:\\s*\\n\\s{4}type:\\s+OS::Neutron::FloatingIPAssociation\\s*\\n)(?!\\s{4}depends_on:)`,
      'gm'
    );

    normalized = normalized.replace(assocRegex, (fullMatch, prefix, vmAlias) => {
      const portToken = `${vmAlias}_port`;
      const routerInterface = `${alias}_router_interface`;

      if (!normalized.includes(routerInterface) || !normalized.includes(portToken)) {
        return fullMatch;
      }

      return `${prefix}    depends_on:\n      - ${routerInterface}\n`;
    });
  }

  return normalized;
}

function extractStackIdentityFromLinks(
  links?: Array<{ rel?: string; href?: string }>
): HeatStackIdentity | null {
  if (!Array.isArray(links)) {
    return null;
  }

  const selfLink = links.find((link) => link?.rel === 'self' && link?.href)?.href;
  if (!selfLink) {
    return null;
  }

  try {
    const url = new URL(selfLink);
    const parts = url.pathname.split('/').filter(Boolean);
    const stacksIndex = parts.findIndex((part) => part === 'stacks');
    if (stacksIndex < 0 || parts.length < stacksIndex + 3) {
      return null;
    }

    const stackName = decodeURIComponent(parts[stacksIndex + 1] ?? '').trim();
    const stackId = decodeURIComponent(parts[stacksIndex + 2] ?? '').trim();

    if (!stackName || !stackId) {
      return null;
    }

    return { stackName, stackId };
  } catch {
    return null;
  }
}

function InstructorLabsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'requests' ? 'requests' : 'all';

  const [tableData, setTableData] = useState<LabTemplate[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [isMutatingId, setIsMutatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LabTemplate | null>(null);
  const [editingLabId, setEditingLabId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionState, setActionState] = useState<ActionState | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'requests'>(initialTab);
  const [pendingCount, setPendingCount] = useState(0);
  const [drawerLab, setDrawerLab] = useState<LabTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [currentUserName, setCurrentUserName] = useState<string>('Instructor');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Load instructor profile
  useEffect(() => {
    let isActive = true;
    async function loadCurrentUser() {
      try {
        const stored = getStoredUser();
        if (stored?.id && isActive) {
          setCurrentUserId(stored.id);
          setCurrentUserName(stored.fullName || stored.username || 'Instructor');
        }

        const token = await ensureValidToken();
        const res = await fetch('/api/users/me', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const user = await res.json();
          if (user?.id && isActive) {
            setCurrentUserId(user.id);
            setCurrentUserName(user.fullName || user.username || 'Instructor');
          }
        }
      } catch {
        // ignore
      }
    }
    void loadCurrentUser();
    return () => {
      isActive = false;
    };
  }, []);

  const loadLabs = async (tab = activeTab, userId = currentUserId) => {
    try {
      setIsLoading(true);
      setErrorMessage('');

      // Fetch all templates to apply accurate instructor-specific filtering
      const response = await fetch('/api/lab-templates?limit=1000', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Không thể tải danh sách lab (HTTP ${response.status})`);
      }

      const payload = (await response.json()) as any;
      if (!payload.success || !payload.data) {
        throw new Error(payload.message ?? 'Dữ liệu trả về không hợp lệ!');
      }

      const allItems: LabTemplate[] = Array.isArray(payload.data)
        ? payload.data
        : (payload.data.items ?? []);

      // Filter templates created by this instructor
      const instructorLabs = userId
        ? allItems.filter((t) => t.createdById === userId)
        : allItems;

      // Calculate pending count for instructor's requests
      const pendingRequests = instructorLabs.filter(
        (t) => t.status === 'REVIEW' || t.metadata?.approvalStatus === 'PENDING'
      );
      setPendingCount(pendingRequests.length);

      let displayedLabs: LabTemplate[] = [];

      if (tab === 'all') {
        // Tab "Tất cả Lab Templates": Chỉ hiển thị lab do chính instructor tạo và đã được duyệt (PUBLISHED)
        displayedLabs = instructorLabs.filter(
          (t) => t.status === 'PUBLISHED' || t.metadata?.approvalStatus === 'APPROVED'
        );
      } else {
        // Tab "Yêu cầu phê duyệt": Hiển thị các yêu cầu của instructor đó (chờ duyệt, từ chối, v.v.)
        displayedLabs = instructorLabs.filter(
          (t) =>
            t.status === 'REVIEW' ||
            t.metadata?.approvalStatus === 'PENDING' ||
            t.metadata?.approvalStatus === 'REJECTED' ||
            t.metadata?.approvalStatus === 'APPROVED'
        );
      }

      setTableData(displayedLabs);
      setPagination({
        page: 1,
        limit: 100,
        total: displayedLabs.length,
        totalPages: 1,
      });
    } catch (error) {
      setTableData([]);
      setErrorMessage(error instanceof Error ? error.message : 'Không thể kết nối Lab Service');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLabs(activeTab, currentUserId);
  }, [activeTab, currentUserId]);

  const handleDeleteLab = async () => {
    if (!deleteTarget) {
      return;
    }

    try {
      setIsMutatingId(deleteTarget.id);
      setActionState(null);

      const response = await fetch(`/api/lab-templates/${deleteTarget.id}`, {
        method: 'DELETE',
      });

      const payload = (await response.json()) as ApiResponse<unknown>;
      if (!response.ok || !payload.success) {
        throw new Error(payload.message ?? 'Xóa bài lab thất bại');
      }

      setActionState({
        type: 'success',
        message: `Đã xóa thành công bài lab "${deleteTarget.name}".`,
      });
      setDeleteTarget(null);
      await loadLabs();
    } catch (error) {
      setActionState({
        type: 'error',
        message: error instanceof Error ? error.message : 'Xóa bài lab thất bại',
      });
    } finally {
      setIsMutatingId(null);
    }
  };

  const handleDuplicateLab = async (lab: LabTemplate) => {
    try {
      setIsMutatingId(lab.id);
      setActionState(null);

      const [labDetailRes, moduleListRes] = await Promise.all([
        fetch(`/api/lab-templates/${lab.id}`, { cache: 'no-store' }),
        fetch(`/api/lab-templates/${lab.id}/modules`, { cache: 'no-store' }),
      ]);

      const labDetailPayload = (await labDetailRes.json()) as ApiResponse<LabTemplateDetail>;
      const moduleListPayload = (await moduleListRes.json()) as ApiResponse<ModuleSummary[]>;

      if (!labDetailRes.ok || !labDetailPayload.success || !labDetailPayload.data) {
        throw new Error(labDetailPayload.message ?? 'Không thể tải dữ liệu bài lab để nhân bản');
      }

      if (!moduleListRes.ok || !moduleListPayload.success) {
        throw new Error(moduleListPayload.message ?? 'Không thể tải danh sách module để nhân bản');
      }

      const moduleDetails = await Promise.all(
        (moduleListPayload.data ?? []).map(async (moduleItem) => {
          const response = await fetch(`/api/modules/${moduleItem.id}`, { cache: 'no-store' });
          const payload = (await response.json()) as ApiResponse<ModuleDetail>;

          if (!response.ok || !payload.success || !payload.data) {
            throw new Error(payload.message ?? `Không thể tải module ${moduleItem.name}`);
          }

          return payload.data;
        })
      );

      const sourceLab = labDetailPayload.data;
      const duplicateName = `${sourceLab.name} (Copy)`;
      const duplicateSlug = `${toSlug(duplicateName)}-${Date.now()}`;

      const createLabResponse = await fetch('/api/lab-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: buildLabCode(),
          name: duplicateName,
          slug: duplicateSlug,
          description: sourceLab.description || undefined,
          category: sourceLab.category || undefined,
          difficulty: sourceLab.difficulty || undefined,
          tags: Array.isArray(sourceLab.tags) ? sourceLab.tags : [],
          status: 'DRAFT',
          createdById: currentUserId || 'instructor-user',
          createdBySnapshot: { source: 'instructor-portal', duplicateFrom: sourceLab.id },
        }),
      });

      const createLabPayload = (await createLabResponse.json()) as ApiResponse<{ id: string }>;
      if (!createLabResponse.ok || !createLabPayload.success) {
        throw new Error(createLabPayload.message ?? 'Không thể tạo bản sao lab');
      }

      const newLabId =
        (createLabPayload.data?.id as string | undefined) ??
        ((createLabPayload as unknown as { id?: string }).id as string | undefined);

      if (!newLabId) {
        throw new Error('Không nhận được mã bài lab mới sau khi nhân bản');
      }

      for (const moduleDetail of moduleDetails.sort((a, b) => a.orderNo - b.orderNo)) {
        const moduleCreateRes = await fetch(`/api/lab-templates/${newLabId}/modules`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: moduleDetail.name,
            description: moduleDetail.description || undefined,
            orderNo: moduleDetail.orderNo,
            estimatedMinutes: moduleDetail.estimatedMinutes ?? undefined,
            objectives: Array.isArray(moduleDetail.objectives) ? moduleDetail.objectives : [],
            definitionJson: moduleDetail.definitionJson,
            createdById: currentUserId || 'instructor-user',
            createdBySnapshot: {
              source: 'instructor-portal',
              duplicateFromModule: moduleDetail.id,
            },
          }),
        });

        const moduleCreatePayload = (await moduleCreateRes.json()) as ApiResponse<unknown>;
        if (!moduleCreateRes.ok || !moduleCreatePayload.success) {
          throw new Error(
            moduleCreatePayload.message ?? `Nhân bản module ${moduleDetail.name} thất bại`
          );
        }
      }

      setActionState({
        type: 'success',
        message: `Nhân bản bài lab "${lab.name}" thành công.`,
      });
      await loadLabs();
    } catch (error) {
      setActionState({
        type: 'error',
        message: error instanceof Error ? error.message : 'Nhân bản bài lab thất bại',
      });
    } finally {
      setIsMutatingId(null);
    }
  };

  const handleInitializeLab = async (lab: LabTemplate) => {
    try {
      setIsMutatingId(lab.id);
      setActionState(null);

      const artifactResponse = await fetch(`/api/lab-templates/${lab.id}/artifacts`, {
        cache: 'no-store',
      });
      const artifactPayload = (await artifactResponse.json()) as ApiResponse<ArtifactInitPayload>;

      if (!artifactResponse.ok || !artifactPayload.success || !artifactPayload.data) {
        throw new Error(artifactPayload.message ?? 'Không thể tải artifacts để khởi tạo bài lab');
      }

      const initializedModules: string[] = [];
      const initializedStacks: InitializedStackRef[] = [];
      const effectiveUserId = currentUserId || 'instructor-user';

      for (const moduleItem of artifactPayload.data.modules) {
        const heatTemplateText = moduleItem.heatTemplate?.contentText?.trim() ?? '';
        if (!heatTemplateText) continue;

        const normalizedHeatTemplateText = normalizeHeatTemplateForOpenStack(heatTemplateText);

        const files = moduleItem.cloudInitFiles.reduce<Record<string, string>>((acc, file) => {
          const fileName = file.fileName?.trim();
          const contentText = file.contentText ?? '';
          if (fileName && contentText) {
            acc[fileName.split('/').pop() ?? fileName] = contentText;
          }
          return acc;
        }, {});

        const stackName = buildStackName(
          artifactPayload.data.lab.code,
          moduleItem.orderNo,
          moduleItem.name
        );

        const sessionResponse = await fetch(`/api/sessions?userId=${effectiveUserId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            moduleId: moduleItem.id,
            userId: effectiveUserId,
            openstackStackId: 'DEFERRED',
            expiresAt: new Date(
              Date.now() + (moduleItem.estimatedMinutes ?? 30) * 60 * 1000
            ).toISOString(),
          }),
        });

        const sessionPayload = (await sessionResponse.json()) as ApiResponse<{
          session?: { id?: string };
        }>;

        if (!sessionResponse.ok || !sessionPayload.success || !sessionPayload.data?.session?.id) {
          throw new Error(
            sessionPayload.message ?? `Tạo phiên làm việc cho module ${moduleItem.name} thất bại`
          );
        }

        const sessionId = sessionPayload.data.session.id;

        const createStackResponse = await fetch(`/api/stacks?userId=${effectiveUserId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stackName,
            template: normalizedHeatTemplateText,
            files,
            disableRollback: true,
            timeoutMins: moduleItem.estimatedMinutes ?? 30,
            leaseMinutes: moduleItem.estimatedMinutes ?? 30,
            floatingIpReserveCount: 2,
            labSessionId: sessionId,
            tags: ['lab', `lab-${artifactPayload.data.lab.id}`, `module-${moduleItem.id}`],
          }),
        });

        const createStackPayload = (await createStackResponse.json()) as ApiResponse<unknown>;
        if (!createStackResponse.ok || !createStackPayload.success) {
          throw new Error(
            createStackPayload.message ?? `Khởi tạo module ${moduleItem.name} thất bại`
          );
        }

        const createdStack = (
          createStackPayload.data as
            | {
                stack?: {
                  id?: string;
                  name?: string;
                  links?: Array<{ rel?: string; href?: string }>;
                };
              }
            | undefined
        )?.stack;

        if (!createdStack?.id) {
          throw new Error(`Module ${moduleItem.name} không trả về stackId từ orchestration`);
        }

        const canonicalIdentity = extractStackIdentityFromLinks(createdStack?.links);

        initializedModules.push(moduleItem.name);
        initializedStacks.push({
          moduleId: moduleItem.id,
          moduleName: moduleItem.name,
          stackId: canonicalIdentity?.stackId || createdStack.id,
          stackName: canonicalIdentity?.stackName || createdStack.name?.trim() || stackName,
          sessionId,
        });
      }

      if (initializedModules.length === 0) {
        throw new Error('Không có module nào có cấu hình artifacts để khởi tạo');
      }

      setActionState({
        type: 'success',
        message: `Đã khởi tạo thành công ${initializedModules.length} module cho bài lab "${lab.name}".`,
      });

      router.push(`/instructor/labs/${lab.id}`);
    } catch (error) {
      setActionState({
        type: 'error',
        message: error instanceof Error ? error.message : 'Khởi tạo bài lab thất bại',
      });
    } finally {
      setIsMutatingId(null);
    }
  };

  // Filter and search
  const filteredData = tableData.filter((lab) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      lab.name.toLowerCase().includes(q) ||
      lab.code.toLowerCase().includes(q) ||
      (lab.category && lab.category.toLowerCase().includes(q)) ||
      (lab.description && lab.description.toLowerCase().includes(q));

    const matchesCategory =
      categoryFilter === 'ALL' ||
      (lab.category && lab.category.toUpperCase() === categoryFilter.toUpperCase());

    return matchesSearch && matchesCategory;
  });

  return (
    <InstructorLayout basePath="/instructor">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Lab Management</h1>
            <p className="mt-1 text-sm text-gray-500">
              Quản lý danh sách, cấu hình và tài nguyên các bài lab template của bạn
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            <button
              onClick={() => {
                setActiveTab('all');
                void loadLabs('all');
              }}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === 'all'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Tất cả Lab Templates
            </button>
            <button
              onClick={() => {
                setActiveTab('requests');
                void loadLabs('requests');
              }}
              className={`relative border-b-2 px-1 py-3 text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === 'requests'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Yêu cầu phê duyệt
              {pendingCount > 0 && (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                  {pendingCount}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Search & Actions bar */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <SearchBar
            placeholder="Tìm kiếm lab theo tên, mã lab, danh mục..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            containerClassName="max-w-lg flex-1"
          />
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
              >
                <Filter className="h-4 w-4" />
                {categoryFilter === 'ALL' ? 'Filters' : `Danh mục: ${categoryFilter}`}
              </button>
              {showFilterDropdown && (
                <div className="absolute right-0 z-20 mt-2 w-44 rounded-md border border-gray-100 bg-white shadow-lg ring-1 ring-black ring-opacity-5">
                  <div className="py-1">
                    {['ALL', 'DevOps', 'Security', 'Cloud', 'Network'].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => {
                          setCategoryFilter(cat);
                          setShowFilterDropdown(false);
                        }}
                        className={`block w-full text-left px-4 py-2 text-xs ${
                          categoryFilter === cat
                            ? 'bg-orange-50 font-semibold text-orange-600'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {cat === 'ALL' ? 'Tất cả danh mục' : cat}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/instructor/labs/new"
              className="flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-orange-700"
            >
              <Plus className="h-4 w-4" />
              Tạo Lab mới
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {actionState && (
            <div
              className={`border-b px-6 py-3 text-sm ${
                actionState.type === 'success'
                  ? 'border-green-100 bg-green-50 text-green-700'
                  : 'border-red-100 bg-red-50 text-red-700'
              }`}
            >
              {actionState.message}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 font-medium text-gray-600">
                <tr>
                  <th className="w-[400px] whitespace-nowrap px-6 py-4">Lab Name / Description</th>
                  <th className="whitespace-nowrap px-6 py-4">Danh mục</th>
                  <th className="whitespace-nowrap px-6 py-4">Độ khó</th>
                  <th className="whitespace-nowrap px-6 py-4">Status</th>
                  <th className="whitespace-nowrap px-6 py-4">Visibility</th>
                  <th className="whitespace-nowrap px-6 py-4">Pricing</th>
                  <th className="whitespace-nowrap px-6 py-4">Created by</th>
                  <th className="whitespace-nowrap px-6 py-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
                        <span>Đang tải danh sách lab templates...</span>
                      </div>
                    </td>
                  </tr>
                )}

                {!isLoading && errorMessage && (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-red-600">
                      {errorMessage}
                    </td>
                  </tr>
                )}

                {!isLoading && !errorMessage && filteredData.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-500">
                      {activeTab === 'requests'
                        ? 'Chưa có yêu cầu phê duyệt nào.'
                        : 'Chưa có lab template đã duyệt nào của bạn.'}
                    </td>
                  </tr>
                )}

                {!isLoading &&
                  !errorMessage &&
                  filteredData.map((lab) => {
                    const metadata = lab.metadata || {};
                    const isRejected = metadata.approvalStatus === 'REJECTED';
                    const isPending =
                      lab.status === 'REVIEW' || metadata.approvalStatus === 'PENDING';
                    const isPublished =
                      lab.status === 'PUBLISHED' || metadata.approvalStatus === 'APPROVED';

                    return (
                      <tr key={lab.id} className="group transition-colors hover:bg-gray-50/50">
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-4">
                            {/* Thumbnail */}
                            <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-md border border-gray-200">
                              <img
                                src={metadata.thumbnailUrl || placeholderThumbnail}
                                alt={lab.name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div>
                              <div
                                className="line-clamp-1 font-semibold text-gray-900"
                                title={lab.name}
                              >
                                {lab.name}
                              </div>
                              <div className="mt-2 flex items-center gap-3">
                                <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                                  <Layers className="h-3 w-3" /> {lab.moduleCount} Modules
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              lab.category === 'DevOps'
                                ? 'border-purple-100 bg-purple-50 text-purple-700'
                                : lab.category === 'Security'
                                  ? 'border-red-100 bg-red-50 text-red-700'
                                  : lab.category === 'Cloud'
                                    ? 'border-blue-100 bg-blue-50 text-blue-700'
                                    : 'border-gray-100 bg-gray-50 text-gray-700'
                            } `}
                          >
                            {lab.category || 'Khác'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              lab.difficulty === 'Beginner'
                                ? 'border-green-100 bg-green-50 text-green-700'
                                : lab.difficulty === 'Intermediate'
                                  ? 'border-yellow-100 bg-yellow-50 text-yellow-700'
                                  : 'border-red-100 bg-red-50 text-red-700'
                            }`}
                          >
                            {lab.difficulty || 'Beginner'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              isPublished
                                ? 'bg-green-100 text-green-700'
                                : isPending
                                  ? 'bg-amber-100 text-amber-700'
                                  : isRejected
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            <span
                              className={`mr-1.5 h-1.5 w-1.5 rounded-full ${
                                isPublished
                                  ? 'bg-green-600'
                                  : isPending
                                    ? 'bg-amber-600'
                                    : isRejected
                                      ? 'bg-red-600'
                                      : 'bg-gray-500'
                              }`}
                            ></span>
                            {isPublished
                              ? 'Active'
                              : isPending
                                ? 'Chờ duyệt'
                                : isRejected
                                  ? 'Từ chối'
                                  : statusLabelMap[lab.status] ?? lab.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              lab.accessType === 'RESTRICTED'
                                ? 'border-amber-100 bg-amber-50 text-amber-700'
                                : 'border-blue-100 bg-blue-50 text-blue-700'
                            }`}
                          >
                            {lab.accessType === 'RESTRICTED' ? 'Private' : 'Public'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          {(() => {
                            const meta = (lab.metadata as any) || {};
                            const pricingType = meta.pricingType || 'FREE';
                            const finalPrice = Number(meta.finalPrice || 0);
                            if (pricingType === 'PAID') {
                              return (
                                <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                  {finalPrice.toLocaleString('vi-VN')} VNĐ
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                                Free
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">
                            {currentUserName || 'Instructor'}
                          </div>
                          <div className="text-xs text-gray-400">
                            {lab.createdAt ? formatDate(lab.createdAt) : formatDate(lab.updatedAt)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(activeTab === 'requests' || isPending || isRejected) && (
                              <button
                                onClick={() => setDrawerLab(lab)}
                                className="rounded bg-orange-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-orange-700 transition-colors"
                              >
                                Xem yêu cầu
                              </button>
                            )}
                            <div className="opacity-0 transition-opacity group-hover:opacity-100">
                              <ActionMenu
                                labId={lab.id}
                                isMutating={isMutatingId === lab.id}
                                onEdit={() => setEditingLabId(lab.id)}
                                onDelete={() => {
                                  setDeleteTarget(lab);
                                }}
                                onDuplicate={() => {
                                  void handleDuplicateLab(lab);
                                }}
                                onInitialize={() => {
                                  void handleInitializeLab(lab);
                                }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-4">
            <span className="text-xs text-gray-500">
              Hiển thị {filteredData.length} trên tổng số {pagination.total || filteredData.length} bài lab
            </span>
            <div className="flex gap-2">
              <button
                className="rounded border border-gray-300 bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                disabled
              >
                Trước
              </button>
              <button
                className="rounded border border-gray-300 bg-white px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                disabled
              >
                Sau
              </button>
            </div>
          </div>
        </div>

        {/* Modals & Drawers */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-gray-900">Xác nhận xóa Lab</h3>
              <p className="mt-2 text-sm text-gray-600">
                Bạn có chắc chắn muốn xóa bài lab{' '}
                <span className="font-semibold text-gray-900">{deleteTarget.name}</span>?
              </p>
              <p className="mt-1 text-sm text-red-600">Hành động này không thể hoàn tác.</p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={isMutatingId === deleteTarget.id}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  onClick={() => {
                    void handleDeleteLab();
                  }}
                  disabled={isMutatingId === deleteTarget.id}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {isMutatingId === deleteTarget.id ? 'Đang xóa...' : 'Xác nhận xóa'}
                </button>
              </div>
            </div>
          </div>
        )}

        {editingLabId && (
          <EditLabModal
            labId={editingLabId}
            onClose={() => setEditingLabId(null)}
            onDone={() => {
              setEditingLabId(null);
              void loadLabs();
            }}
          />
        )}

        {drawerLab && (
          <InspectLabDrawer
            lab={drawerLab}
            onClose={() => setDrawerLab(null)}
            currentUserName={currentUserName}
          />
        )}
      </div>
    </InstructorLayout>
  );
}

export default function InstructorLabsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-50">
          <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
        </div>
      }
    >
      <InstructorLabsContent />
    </Suspense>
  );
}

function ActionMenu({
  labId,
  isMutating,
  onEdit,
  onDelete,
  onDuplicate,
  onInitialize,
}: {
  labId: string;
  isMutating: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onInitialize: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block text-left">
      <button
        disabled={isMutating}
        onClick={() => setIsOpen(!isOpen)}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md border border-gray-100 bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="py-1">
            <Link
              href={`/instructor/labs/${labId}`}
              className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Eye className="mr-3 h-4 w-4 text-gray-400" />
              Xem chi tiết
            </Link>
            <Link
              href={`/instructor/labs/${labId}/edit`}
              className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Edit className="mr-3 h-4 w-4 text-gray-400" />
              Sửa bài Lab
            </Link>
            <button
              onClick={() => {
                onInitialize();
                setIsOpen(false);
              }}
              className="flex w-full items-center px-4 py-2 text-sm text-green-700 hover:bg-green-50"
            >
              <Play className="mr-3 h-4 w-4" />
              Khởi tạo
            </button>
            <button
              onClick={() => {
                onDuplicate();
                setIsOpen(false);
              }}
              className="flex w-full items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Copy className="mr-3 h-4 w-4 text-gray-400" />
              Nhân bản
            </button>
            <div className="my-1 border-t border-gray-100"></div>
            <button
              onClick={() => {
                onDelete();
                setIsOpen(false);
              }}
              className="flex w-full items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash className="mr-3 h-4 w-4" />
              Xóa Lab
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

const formatNumberWithCommas = (num: number | string) => {
  if (num === null || num === undefined || num === '') return '';
  const clean = String(num).replace(/,/g, '');
  const parsed = parseInt(clean, 10);
  if (isNaN(parsed)) return '';
  return parsed.toLocaleString('en-US');
};

function EditLabModal({
  labId,
  onClose,
  onDone,
}: {
  labId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    category: '',
    difficulty: '',
    accessType: 'PUBLIC' as 'PUBLIC' | 'RESTRICTED',
    description: '',
    pricingType: 'FREE' as 'FREE' | 'PAID',
    price: 0,
    discountPercent: 0,
    finalPrice: 0,
  });
  const [existingMetadata, setExistingMetadata] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await fetch(`/api/lab-templates/${labId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Lỗi tải dữ liệu (HTTP ${res.status})`);
        const payload = await res.json();
        if (payload.success && payload.data) {
          const meta = payload.data.metadata || {};
          setExistingMetadata(meta);
          setForm({
            code: payload.data.code || '',
            name: payload.data.name || '',
            category: payload.data.category || '',
            difficulty: payload.data.difficulty || '',
            accessType: payload.data.accessType || 'PUBLIC',
            description: payload.data.description || '',
            pricingType: meta.pricingType || 'FREE',
            price: meta.price || 0,
            discountPercent: meta.discountPercent || 0,
            finalPrice: meta.finalPrice || 0,
          });
        } else {
          throw new Error(payload.message || 'Dữ liệu không hợp lệ');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
      } finally {
        setLoading(false);
      }
    })();
  }, [labId]);

  const set = (field: string, value: any) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async () => {
    if (!form.name || !form.code) {
      setError('Vui lòng điền đầy đủ thông tin bắt buộc.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/lab-templates/${labId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          category: form.category || undefined,
          difficulty: form.difficulty || undefined,
          accessType: form.accessType,
          metadata: {
            ...existingMetadata,
            pricingType: form.pricingType,
            price: form.pricingType === 'PAID' ? form.price : 0,
            discountPercent: form.pricingType === 'PAID' ? form.discountPercent : 0,
            finalPrice: form.pricingType === 'PAID' ? form.finalPrice : 0,
          },
        }),
      });
      const payload = await res.json();
      if (res.ok && payload.success) {
        onDone();
      } else {
        throw new Error(payload.message || 'Lỗi cập nhật bài lab');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Chỉnh sửa thông tin bài Lab</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
            </div>
          ) : (
            <>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Mã Lab (Không thể sửa)">
                  <input
                    value={form.code}
                    disabled
                    className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`}
                  />
                </Field>
                <Field label="Tên bài Lab *">
                  <input
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="VD: Lập trình mạng nâng cao"
                    className={inputCls}
                  />
                </Field>
                <Field label="Danh mục">
                  <select
                    value={form.category}
                    onChange={(e) => set('category', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Chọn danh mục</option>
                    <option value="Network">Network</option>
                    <option value="DevOps">DevOps</option>
                    <option value="Security">Security</option>
                    <option value="Cloud">Cloud</option>
                    <option value="Khác">Khác</option>
                  </select>
                </Field>
                <Field label="Độ khó">
                  <select
                    value={form.difficulty}
                    onChange={(e) => set('difficulty', e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Chọn độ khó</option>
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </Field>
                <Field label="Chế độ truy cập *">
                  <select
                    value={form.accessType}
                    onChange={(e) => set('accessType', e.target.value as any)}
                    className={inputCls}
                  >
                    <option value="PUBLIC">Public (Công khai)</option>
                    <option value="RESTRICTED">Private (Hạn chế)</option>
                  </select>
                </Field>
                <Field label="Chi phí *">
                  <select
                    value={form.pricingType}
                    onChange={(e) => {
                      const val = e.target.value as 'FREE' | 'PAID';
                      setForm((prev) => ({
                        ...prev,
                        pricingType: val,
                        finalPrice: val === 'FREE' ? 0 : prev.price * (1 - prev.discountPercent / 100),
                      }));
                    }}
                    className={inputCls}
                  >
                    <option value="FREE">Free (Miễn phí)</option>
                    <option value="PAID">Paid (Có phí)</option>
                  </select>
                </Field>
                {form.pricingType === 'PAID' && (
                  <>
                    <Field label="Giá gốc (VNĐ) *">
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
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Giảm giá (%)">
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
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Giá sau giảm (VNĐ)">
                      <input
                        type="text"
                        value={formatNumberWithCommas(form.finalPrice) + ' VNĐ'}
                        disabled
                        className={`${inputCls} bg-gray-50 text-gray-500 cursor-not-allowed`}
                      />
                    </Field>
                  </>
                )}
              </div>

              <Field label="Mô tả">
                <textarea
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  rows={4}
                  placeholder="Mô tả chi tiết bài Lab..."
                  className={`${inputCls} resize-none`}
                />
              </Field>
            </>
          )}
        </div>

        <div className="p-5 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={submit}
            disabled={loading || submitting}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Lưu thay đổi
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const FLAVOR_SPECS_MAP: Record<string, { cpu: number; ram: number; disk: number }> = {
  'laas.nano': { cpu: 1, ram: 1, disk: 5 },
  'laas.micro': { cpu: 1, ram: 2, disk: 10 },
  'laas.small': { cpu: 1, ram: 2, disk: 15 },
  'laas.medium': { cpu: 2, ram: 4, disk: 20 },
  'laas.large': { cpu: 4, ram: 8, disk: 40 },
  'laas.xlarge': { cpu: 8, ram: 16, disk: 80 },
  'laas.2xlarge': { cpu: 16, ram: 32, disk: 160 },
  'laas.db-small': { cpu: 2, ram: 4, disk: 30 },
  'laas.db-medium': { cpu: 4, ram: 8, disk: 60 },
  'laas.db-large': { cpu: 8, ram: 16, disk: 120 },
  'laas.compute': { cpu: 4, ram: 4, disk: 20 },
  'laas.memory': { cpu: 2, ram: 8, disk: 20 },
  'laas.win-small': { cpu: 2, ram: 4, disk: 60 },
  'laas.win-med': { cpu: 4, ram: 8, disk: 100 },
  'lab.nano': { cpu: 1, ram: 1, disk: 5 },
  'lab.micro': { cpu: 1, ram: 2, disk: 10 },
  'lab.small': { cpu: 1, ram: 2, disk: 15 },
  'lab.medium': { cpu: 2, ram: 4, disk: 20 },
  'lab.large': { cpu: 4, ram: 8, disk: 40 },
  'lab.xlarge': { cpu: 8, ram: 16, disk: 80 },
  'lab.2xlarge': { cpu: 16, ram: 32, disk: 160 },
  'lab.db-small': { cpu: 2, ram: 4, disk: 30 },
  'lab.db-medium': { cpu: 4, ram: 8, disk: 60 },
  'lab.db-large': { cpu: 8, ram: 16, disk: 120 },
  'lab.compute': { cpu: 4, ram: 4, disk: 20 },
  'lab.memory': { cpu: 2, ram: 8, disk: 20 },
  'lab.win-small': { cpu: 2, ram: 4, disk: 60 },
  'lab.win-med': { cpu: 4, ram: 8, disk: 100 },
  'm1.tiny': { cpu: 1, ram: 0.5, disk: 1 },
  'm1.small': { cpu: 1, ram: 2, disk: 20 },
  'm1.medium': { cpu: 2, ram: 4, disk: 40 },
  'm1.large': { cpu: 4, ram: 8, disk: 80 },
  'm1.xlarge': { cpu: 8, ram: 16, disk: 160 },
};

function InspectLabDrawer({
  lab,
  onClose,
  currentUserName,
}: {
  lab: LabTemplate;
  onClose: () => void;
  currentUserName: string;
}) {
  const [modules, setModules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadModules() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/lab-templates/${lab.id}/modules`, { cache: 'no-store' });
        if (res.ok) {
          const payload = await res.json();
          if (payload.success && Array.isArray(payload.data)) {
            setModules(payload.data);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    void loadModules();
  }, [lab.id]);

  const totalResources = modules.reduce(
    (acc, m) => {
      const def = (m.definitionJson || {}) as {
        vmConfigs?: Array<{ flavor: string }>;
        networkZones?: any[];
      };
      const vmConfigs = def.vmConfigs || [];
      const networkZones = def.networkZones || [];

      for (const vm of vmConfigs) {
        const flavorStr = vm.flavor || '';
        const match = flavorStr.match(/(\d+)\s*vCPU,\s*(\d+)GB RAM,\s*(?:Cinder\s*)?(\d+)GB/i);
        if (match) {
          acc.cpu += Number(match[1]) || 0;
          acc.ram += Number(match[2]) || 0;
          acc.disk += Number(match[3]) || 0;
        } else {
          const cleanName = flavorStr.split(' ')[0].trim().toLowerCase();
          const specs = FLAVOR_SPECS_MAP[cleanName];
          if (specs) {
            acc.cpu += specs.cpu;
            acc.ram += specs.ram;
            acc.disk += specs.disk;
          } else {
            acc.cpu += 1;
            acc.ram += 2;
            acc.disk += 20;
          }
        }
      }
      acc.vms += vmConfigs.length;
      acc.networks += networkZones.length;
      return acc;
    },
    { cpu: 0, ram: 0, disk: 0, vms: 0, networks: 0 }
  );

  const metadata = lab.metadata || {};
  const pricingType = metadata.pricingType || 'FREE';
  const price = Number(metadata.price || 0);
  const discountPercent = Number(metadata.discountPercent || 0);
  const finalPrice = Number(metadata.finalPrice || 0);
  const approvalStatus = metadata.approvalStatus || (lab.status === 'PUBLISHED' ? 'APPROVED' : 'PENDING');
  const isRejected = approvalStatus === 'REJECTED';
  const isApproved = approvalStatus === 'APPROVED' || lab.status === 'PUBLISHED';
  const isPending = approvalStatus === 'PENDING' || lab.status === 'REVIEW';

  const tags = Array.isArray(lab.tags) ? lab.tags : typeof lab.tags === 'string' ? lab.tags.split(',') : [];

  return createPortal(
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="absolute inset-0 bg-black/40 transition-opacity" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-gray-900">
              Yêu cầu phê duyệt: {lab.name}
            </h2>
            <p className="mt-0.5 text-xs text-orange-600 font-medium">
              Chi tiết cấu hình và trạng thái phê duyệt bài lab
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status Alert */}
          {isRejected && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-800 font-semibold text-sm">
                <XCircle className="h-5 w-5 text-red-600" />
                <span>Yêu cầu đã bị Admin từ chối</span>
              </div>
              {metadata.adminNote && (
                <div className="mt-1 text-xs text-red-700 bg-white/60 p-3 rounded border border-red-100">
                  <span className="font-semibold block mb-1">Lý do từ chối:</span>
                  <p className="whitespace-pre-wrap">{metadata.adminNote}</p>
                </div>
              )}
              {metadata.reviewedAt && (
                <p className="text-[11px] text-red-600">
                  Đã xử lý lúc {formatDate(metadata.reviewedAt)} bởi {metadata.reviewedBy || 'Admin'}
                </p>
              )}
            </div>
          )}

          {isPending && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                <Clock className="h-5 w-5 text-amber-600" />
                <span>Yêu cầu đang chờ Admin xem xét và phê duyệt</span>
              </div>
              <p className="mt-1 text-xs text-amber-700">
                Sau khi được duyệt, bài lab sẽ tự động hiển thị trong tab "Tất cả Lab Templates" và sẵn sàng gán vào lớp học.
              </p>
            </div>
          )}

          {isApproved && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2 text-green-800 font-semibold text-sm">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span>Bài lab đã được phê duyệt và phát hành</span>
              </div>
              {metadata.reviewedAt && (
                <p className="mt-1 text-xs text-green-700">
                  Phê duyệt lúc {formatDate(metadata.reviewedAt)} bởi {metadata.reviewedBy || 'Admin'}
                </p>
              )}
            </div>
          )}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Thông tin chung
            </h3>
            <div className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
              <span className="text-gray-500 font-medium">Người tạo:</span>
              <span className="text-gray-900 font-medium">{currentUserName || 'Instructor'}</span>

              <span className="text-gray-500 font-medium">Mã Lab:</span>
              <span className="font-mono text-gray-900 font-semibold">{lab.code}</span>

              <span className="text-gray-500 font-medium">Danh mục:</span>
              <span className="text-gray-900">{lab.category || 'Chưa phân loại'}</span>

              <span className="text-gray-500 font-medium">Độ khó:</span>
              <span className="text-gray-900">{lab.difficulty || 'Beginner'}</span>

              <span className="text-gray-500 font-medium">Tags:</span>
              <div className="flex flex-wrap gap-1">
                {tags.length > 0 ? (
                  tags.map((t: string) => (
                    <span key={t} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {t.trim()}
                    </span>
                  ))
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </div>

              <span className="text-gray-500 font-medium">Chế độ chia sẻ:</span>
              <span className="text-gray-900">
                {lab.accessType === 'RESTRICTED' ? 'Private' : 'Public'}
              </span>

              <span className="text-gray-500 font-medium">Mô tả:</span>
              <span className="text-gray-700 whitespace-pre-wrap">
                {lab.description || 'Chưa có mô tả'}
              </span>
            </div>
          </section>

          <hr className="border-gray-100" />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Định giá cấu hình
            </h3>
            {pricingType === 'PAID' ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="block text-xs text-gray-500">Giá gốc</span>
                    <span className="text-lg font-bold text-emerald-800">
                      {price.toLocaleString('vi-VN')} VNĐ
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500">Chiết khấu (%)</span>
                    <span className="text-lg font-bold text-emerald-800">
                      {discountPercent}%
                    </span>
                  </div>
                  <div className="col-span-2 border-t border-emerald-100/50 pt-2">
                    <span className="block text-xs text-gray-500">Giá bán thực tế</span>
                    <span className="text-xl font-extrabold text-emerald-600">
                      {finalPrice.toLocaleString('vi-VN')} VNĐ
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center">
                <span className="text-sm font-semibold text-gray-600">Bài Lab Miễn Phí (FREE)</span>
              </div>
            )}
          </section>

          <hr className="border-gray-100" />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Tổng tài nguyên (Ước tính)
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                <span className="block text-xs text-gray-500">CPU</span>
                <span className="text-lg font-bold text-gray-900">{totalResources.cpu} vCPUs</span>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                <span className="block text-xs text-gray-500">RAM</span>
                <span className="text-lg font-bold text-gray-900">{totalResources.ram} GB</span>
              </div>
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                <span className="block text-xs text-gray-500">Disk</span>
                <span className="text-lg font-bold text-gray-900">{totalResources.disk} GB</span>
              </div>
            </div>
          </section>

          <hr className="border-gray-100" />

          <section className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
              Chi tiết các Module ({modules.length})
            </h3>
            {isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
              </div>
            ) : modules.length === 0 ? (
              <p className="text-sm text-gray-500 italic">
                Không có module nào được tạo cho template này.
              </p>
            ) : (
              <div className="space-y-4">
                {modules.map((m: any, index: number) => {
                  const mDef = m.definitionJson || {};
                  const mVms = mDef.vmConfigs || [];

                  return (
                    <div
                      key={m.id}
                      className="rounded-lg border border-gray-200 bg-white p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                        <span className="text-sm font-bold text-gray-900">
                          {index + 1}. {m.name}
                        </span>
                        <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded">
                          Thời gian: {m.estimatedMinutes || 30} phút
                        </span>
                      </div>

                      {m.description && <p className="text-xs text-gray-600">{m.description}</p>}

                      {Array.isArray(m.objectives) && m.objectives.length > 0 && (
                        <div className="text-xs">
                          <span className="font-semibold text-gray-700">Mục tiêu:</span>
                          <ul className="list-disc pl-4 space-y-0.5 mt-1 text-gray-600">
                            {m.objectives.map((obj: string, oIdx: number) => (
                              <li key={oIdx}>{obj}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {mVms.length > 0 && (
                        <div className="text-xs space-y-1">
                          <span className="font-semibold text-gray-700">
                            Máy ảo ({mVms.length}):
                          </span>
                          <div className="grid gap-2 pl-2">
                            {mVms.map((vm: any, vIdx: number) => (
                              <div
                                key={vIdx}
                                className="bg-gray-50/50 p-2 rounded border border-gray-100"
                              >
                                <div className="font-bold text-gray-800">
                                  {vm.nodeName || vm.name}
                                </div>
                                <div className="text-gray-500 font-mono mt-0.5">
                                  Cấu hình: {vm.flavor}
                                </div>
                                <div className="text-gray-500 mt-0.5">
                                  Hệ điều hành: {vm.operatingSystem || vm.imageName || vm.imageId}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-between">
          <div>
            {isRejected && (
              <Link
                href={`/instructor/labs/${lab.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-md bg-orange-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-700 transition-colors"
              >
                <Edit className="h-4 w-4" />
                Chỉnh sửa bài lab
              </Link>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
