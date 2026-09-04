'use client';

import {
  Check,
  ChevronRight,
  Copy,
  Eye,
  FileText,
  HardDrive,
  Loader2,
  Plus,
  RefreshCw,
  Terminal,
  Upload,
  XCircle,
} from 'lucide-react';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import Link from 'next/link';

import { Button, SearchBar } from '@laas-portal/ui';

import { Dialog } from '../../../../../components/dialog';
import { ensureValidToken } from '../../../../../lib/auth';

type OpenStackImageRow = {
  id: string;
  name: string;
  status: string;
  visibility?: string;
  baseImage?: string;
  description?: string;
  createdAt?: string;
};

type PendingApprovalRow = {
  id: string;
  userId: string;
  pendingImageName: string;
  pendingImageDesc: string;
  pendingImageVisibility: string;
  targetImageName: string;
  baseImageId: string;
  updatedAt: string;
};

type InspectSession = {
  id: string;
  userId: string;
  baseImageId: string;
  flavorId: string;
  targetImageName: string;
  pendingImageName: string | null;
  pendingImageDesc: string | null;
  pendingImageVisibility: string;
  status: string;
  sshHost: string | null;
  vmUsername: string | null;
  glanceImageId: string | null;
  createdAt: string;
  updatedAt: string;
};

type InspectFileItem = {
  path: string;
  size: number;
  mtime?: string;
  content: string;
  isBinary?: boolean;
};

type SshSection = {
  status: 'success' | 'error' | 'unavailable';
  error?: string;
  os?: string;
  packages?: string;
  recentPackages?: string;
  services?: string;
  disk?: string;
  files?: InspectFileItem[];
  users?: string;
};

type PackageDiff = {
  status: string;
  added?: string[];
  removed?: string[];
  unchanged?: number;
  error?: string;
};

type InspectResult = {
  session: InspectSession;
  sshInspection: SshSection;
  virtInspector: { status: string; xml?: string; error?: string };
  packageDiff: PackageDiff;
};

type ImageRow = {
  id: string;
  name: string;
  description: string;
  status: string;
  slug: string;
  versionCount: number;
  latestVersionId: string | null;
  latestVersionNumber: number | null;
  latestVersionStatus: string | null;
  latestVersionGlanceImageId: string | null;
  createdBy: string;
  createdAt: string;
};

type DiffResult = {
  backend?: string;
  status?: string;
  message?: string;
  stdout?: string;
  stderr?: string;
};

type CreateImageForm = {
  name: string;
  slug: string;
  description: string;
  storageUrl: string;
};

const EMPTY_IMAGE_FORM: CreateImageForm = {
  name: '',
  slug: '',
  description: '',
  storageUrl: '',
};

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

export default function InstructorImagesPage(): React.ReactElement {
  const [openstackImages, setOpenstackImages] = useState<OpenStackImageRow[]>([]);
  const [repoImages, setRepoImages] = useState<ImageRow[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isOpenstackLoading, setIsOpenstackLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [openstackLoadError, setOpenstackLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<ImageRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffBaseVersionId, setDiffBaseVersionId] = useState('');
  const [imageForm, setImageForm] = useState<CreateImageForm>(EMPTY_IMAGE_FORM);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalRow[]>([]);
  const [isPendingLoading, setIsPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Inspect drawer state
  const [drawerSession, setDrawerSession] = useState<PendingApprovalRow | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState('');
  const [inspectTab, setInspectTab] = useState<string>('os');
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<InspectFileItem | null>(
    null
  );
  const [copiedPath, setCopiedPath] = useState(false);
  const [copiedContent, setCopiedContent] = useState(false);

  const copyToClipboard = async (text: string): Promise<boolean> => {
    if (!text) return false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}

    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch {
      return false;
    }
  };

  // Dialog state
  type DialogKind = {
    type: 'message';
    title: string;
    message: string;
    variant: 'success' | 'error';
  };
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const closeDialog = () => setDialog(null);

  // Load users map
  useEffect(() => {
    let isActive = true;
    async function loadUsers() {
      try {
        const token = await ensureValidToken();
        const res = await fetch('/api/users?limit=1000', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        const list = json.data || [];
        const map: Record<string, string> = {};
        for (const u of list) {
          map[u.id] = u.username || u.fullName || u.email;
        }
        if (isActive) setUsersMap(map);
      } catch {}
    }
    void loadUsers();
    return () => {
      isActive = false;
    };
  }, []);

  // Load repository images
  const refreshRepoImages = async () => {
    setIsLoading(true);
    setLoadError('');

    try {
      const response = await fetch('/api/repository-images', {
        method: 'GET',
        cache: 'no-store',
      });

      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        data?: {
          images?: Array<Record<string, unknown>>;
        };
      };

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || 'Không thể tải danh sách image repository');
      }

      const raw = payload.data?.images ?? [];
      const normalized = raw.map((item) => ({
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        description: String(item.description ?? ''),
        status: String(item.status ?? ''),
        slug: String(item.slug ?? ''),
        versionCount: Number(item.versionCount ?? 0),
        latestVersionId: item.latestVersionId ? String(item.latestVersionId) : null,
        latestVersionNumber: item.latestVersionNumber ? Number(item.latestVersionNumber) : null,
        latestVersionStatus: item.latestVersionStatus ? String(item.latestVersionStatus) : null,
        latestVersionGlanceImageId: item.latestVersionGlanceImageId
          ? String(item.latestVersionGlanceImageId)
          : null,
        createdBy: String(item.createdById ?? ''),
        createdAt: String(item.createdAt ?? ''),
      })) as ImageRow[];
      setRepoImages(normalized);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Không thể tải danh sách image repository'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshRepoImages();
  }, []);

  const [updatingVisId, setUpdatingVisId] = useState<string | null>(null);

  const handleUpdateVisibility = async (glanceImageId: string, newVisibility: string) => {
    setUpdatingVisId(glanceImageId);
    try {
      const token = await ensureValidToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      // 1. Update OpenStack Glance image visibility
      const orchRes = await fetch(`/api/images/${glanceImageId}/visibility`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ visibility: newVisibility }),
      });

      const orchJson = (await orchRes.json()) as { success?: boolean; message?: string };
      if (!orchRes.ok || (orchJson.success !== undefined && !orchJson.success)) {
        throw new Error(orchJson.message || 'Không thể cập nhật quyền truy cập image trong OpenStack');
      }

      // 2. Update Database catalog image if matching repoImage exists
      const matchedRepo = repoImages.find(
        (ri) => ri.latestVersionGlanceImageId === glanceImageId
      );
      if (matchedRepo?.id) {
        await fetch(`/api/repository-images/${matchedRepo.id}/visibility`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ visibility: newVisibility }),
        }).catch(() => {});
      }

      // 3. Update local state
      setOpenstackImages((prev) =>
        prev.map((img) =>
          img.id === glanceImageId ? { ...img, visibility: newVisibility } : img
        )
      );
      setSubmitMessage(`Đã cập nhật Access Type của image sang ${newVisibility === 'public' ? 'Public' : 'Private'}`);
      setTimeout(() => setSubmitMessage(''), 3000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Không thể cập nhật Access Type');
      setTimeout(() => setSubmitError(''), 4000);
    } finally {
      setUpdatingVisId(null);
    }
  };

  const reloadOpenstackImages = async () => {
    setIsOpenstackLoading(true);
    setOpenstackLoadError('');
    try {
      const token = await ensureValidToken();
      const response = await fetch('/api/images?userId=admin-portal-user', {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        data?: { images?: Array<Record<string, unknown>> };
      };
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || 'Không thể tải danh sách OpenStack images');
      }
      const normalized = (payload.data?.images ?? []).map((item) => ({
        id: String(item.id ?? item.image_id ?? ''),
        name: String(item.name ?? item.image_name ?? 'unknown'),
        status: String(item.status ?? 'unknown'),
        visibility: String(item.visibility ?? 'public'),
        baseImage: String(item.osDistro ?? item.baseImage ?? item.base_image ?? item.os ?? ''),
        description: String(item.description ?? ''),
        createdAt:
          (item.createdAt ?? item.created_at)
            ? String(item.createdAt ?? item.created_at)
            : undefined,
      })) as OpenStackImageRow[];
      setOpenstackImages(normalized);
    } catch (error) {
      setOpenstackLoadError(
        error instanceof Error ? error.message : 'Không thể tải danh sách OpenStack images'
      );
      setOpenstackImages([]);
    } finally {
      setIsOpenstackLoading(false);
    }
  };

  useEffect(() => {
    void reloadOpenstackImages();
  }, []);

  const reloadPending = async () => {
    setIsPendingLoading(true);
    setPendingError('');
    try {
      const res = await fetch('/api/image-builder/pending', { cache: 'no-store' });
      const payload = (await res.json()) as { success?: boolean; data?: PendingApprovalRow[] };
      if (!res.ok || !payload.success) throw new Error('Không thể tải danh sách chờ duyệt');
      setPendingApprovals(payload.data ?? []);
    } catch (e) {
      setPendingError(e instanceof Error ? e.message : 'Lỗi');
    } finally {
      setIsPendingLoading(false);
    }
  };

  useEffect(() => {
    void reloadPending();
  }, []);

  const handleRefreshAll = () => {
    void reloadOpenstackImages();
    void refreshRepoImages();
    void reloadPending();
  };

  const filteredOsImages = openstackImages.filter((image) => {
    const query = searchQuery.toLowerCase();
    const isNameMatch = image.name.toLowerCase().includes(query);
    const isIdMatch = image.id.toLowerCase().includes(query);

    const matchedRepoImage = repoImages.find((ri) => ri.latestVersionGlanceImageId === image.id);
    const creatorUser = matchedRepoImage
      ? usersMap[matchedRepoImage.createdBy] || matchedRepoImage.createdBy
      : 'openstack';
    const isCreatorMatch = creatorUser.toLowerCase().includes(query);

    return isNameMatch || isIdMatch || isCreatorMatch;
  });

  const handleCreateImage = async () => {
    setIsSubmitting(true);
    setSubmitError('');
    setSubmitMessage('');

    try {
      const name = imageForm.name.trim();
      const slug = imageForm.slug.trim() || toSlug(name);
      if (!name) {
        throw new Error('Tên image là bắt buộc');
      }

      const createImageResponse = await fetch('/api/repository-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          description: imageForm.description.trim() || undefined,
          createdById: 'instructor-portal-user',
        }),
      });

      const createImagePayload = await createImageResponse.json();
      if (!createImageResponse.ok || !createImagePayload?.id) {
        throw new Error(createImagePayload?.message ?? 'Không thể tạo image');
      }

      if (imageForm.storageUrl.trim()) {
        const createVersionResponse = await fetch(
          `/api/repository-images/${createImagePayload.id}/versions`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storageUrl: imageForm.storageUrl.trim(),
              createdById: 'instructor-portal-user',
              versionNumber: 1,
            }),
          }
        );

        const createVersionPayload = await createVersionResponse.json();
        if (!createVersionResponse.ok || !createVersionPayload?.id) {
          throw new Error(createVersionPayload?.message ?? 'Không thể tạo version đầu tiên');
        }
      }

      await refreshRepoImages();
      setImageForm(EMPTY_IMAGE_FORM);
      setShowUploadModal(false);
      setSubmitMessage('Đã tạo image repository thành công.');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Không thể tạo image');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnalyzeDiff = async () => {
    if (!selectedImage?.latestVersionId) {
      setSubmitError('Image này chưa có version để phân tích diff.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitMessage('');

    try {
      const response = await fetch(
        `/api/repository-images/${selectedImage.latestVersionId}/diff-analysis`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            baseVersionId: diffBaseVersionId.trim() || undefined,
            storageUrl: undefined,
            requestedById: 'instructor-portal-user',
          }),
        }
      );

      const payload = (await response.json()) as {
        success?: boolean;
        data?: DiffResult;
        message?: string;
      };
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message ?? 'Không thể phân tích diff');
      }

      setDiffResult(payload.data ?? null);
      setSubmitMessage('Đã phân tích diff cho image version hiện tại.');
      await refreshRepoImages();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Không thể phân tích diff');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openDrawer = (req: PendingApprovalRow) => {
    setDrawerSession(req);
    setInspectResult(null);
    setInspectError('');
    setInspectTab('os');
  };

  const closeDrawer = () => {
    setDrawerSession(null);
    setInspectResult(null);
    setInspectError('');
  };

  const authHeaders = async (extra?: Record<string, string>): Promise<Record<string, string>> => {
    const token = await ensureValidToken();
    return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
  };

  const runInspect = async () => {
    if (!drawerSession) return;
    setInspectLoading(true);
    setInspectError('');
    setInspectResult(null);

    try {
      const res = await fetch(`/api/image-builder/${drawerSession.id}/inspect`, {
        headers: await authHeaders(),
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: InspectResult;
        message?: string;
      };
      if (!res.ok || !json.success || !json.data)
        throw new Error(json.message || 'Lỗi khi kiểm tra');
      setInspectResult(json.data);
      setInspectTab(
        json.data.sshInspection.status === 'success'
          ? json.data.sshInspection.files
            ? 'files'
            : 'os'
          : 'inspector'
      );
    } catch (e) {
      setInspectError(e instanceof Error ? e.message : 'Lỗi không xác định');
    } finally {
      setInspectLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Custom Images</h1>
          <p className="mt-1 text-sm text-gray-500">
            Các image đã được admin duyệt
          </p>
          {isLoading && (
            <p className="mt-2 text-xs text-blue-600">Đang đồng bộ image repository...</p>
          )}
          {loadError && (
            <p className="mt-2 text-xs text-red-600">Không thể tải danh sách image: {loadError}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefreshAll}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </button>
          <Link href="/instructor/repository/images/builder">
            <Button className="flex items-center gap-2 bg-[#FF6900] text-white hover:bg-[#E55E00]">
              <Plus className="h-4 w-4" />
              Tạo Custom Image mới
            </Button>
          </Link>
        </div>
      </div>

      {/* Pending Approval section */}
      {(isPendingLoading || pendingApprovals.length > 0 || !!pendingError) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-900">
                {pendingApprovals.length > 0 && (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                    {pendingApprovals.length}
                  </span>
                )}
                Yêu cầu đóng gói chờ duyệt
              </h2>
              <p className="mt-1 text-sm text-amber-700">
                Các phiên đóng gói VM đang chờ Admin xem xét và xuất bản thành Glance Image.
              </p>
              {isPendingLoading && <p className="mt-2 text-xs text-amber-600">Đang tải...</p>}
              {pendingError && <p className="mt-2 text-xs text-red-600">{pendingError}</p>}
            </div>
          </div>

          {pendingApprovals.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-lg border border-amber-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-amber-100 bg-amber-50 text-amber-800">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3">Tên Image yêu cầu</th>
                    <th className="whitespace-nowrap px-4 py-3">Mô tả</th>
                    <th className="whitespace-nowrap px-4 py-3">Visibility</th>
                    <th className="whitespace-nowrap px-4 py-3">Thời gian</th>
                    <th className="whitespace-nowrap px-4 py-3">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-50">
                  {pendingApprovals.map((req) => (
                    <tr
                      key={req.id}
                      className="cursor-pointer hover:bg-amber-50"
                      onClick={() => openDrawer(req)}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">
                        <span className="flex items-center gap-1">
                          {req.pendingImageName || req.targetImageName}
                          <ChevronRight className="h-3.5 w-3.5 text-amber-400" />
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">
                        {req.pendingImageDesc || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            req.pendingImageVisibility === 'public'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {req.pendingImageVisibility === 'public' ? 'Public' : 'Private'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {req.updatedAt ? new Date(req.updatedAt).toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => openDrawer(req)}
                          className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                        >
                          Xem chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tổng custom images</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{openstackImages.length}</p>
            </div>
            <div className="rounded-full bg-orange-100 p-3">
              <HardDrive className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Do tôi tạo</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{openstackImages.length}</p>
            </div>
            <div className="rounded-full bg-purple-100 p-3">
              <HardDrive className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Đang hiển thị</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{filteredOsImages.length}</p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <HardDrive className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex-1">
          <SearchBar
            placeholder="Tìm theo tên, mô tả, hoặc UUID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* OpenStack Images Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 font-medium text-gray-600">
              <tr>
                <th className="whitespace-nowrap px-6 py-4">TÊN IMAGE</th>
                <th className="whitespace-nowrap px-6 py-4">BASE IMAGE</th>
                <th className="whitespace-nowrap px-6 py-4">NGÀY TẠO</th>
                <th className="whitespace-nowrap px-6 py-4">ACCESS TYPE</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isOpenstackLoading && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-[#FF6900]" />
                      Đang tải danh sách image...
                    </div>
                  </td>
                </tr>
              )}
              {!isOpenstackLoading && openstackLoadError && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-red-500">
                    {openstackLoadError}
                  </td>
                </tr>
              )}
              {!isOpenstackLoading &&
                !openstackLoadError &&
                filteredOsImages.map((image) => {
                  const matchedRepoImage = repoImages.find(
                    (ri) => ri.latestVersionGlanceImageId === image.id
                  );
                  const dateRaw = matchedRepoImage?.createdAt || image.createdAt;
                  const createdDate = dateRaw ? new Date(dateRaw).toISOString().split('T')[0] : '—';
                  const baseImageName =
                    image.baseImage ||
                    (image.name.toLowerCase().includes('centos')
                      ? 'CentOS-Stream-9-raw'
                      : image.name.toLowerCase().includes('ubuntu')
                      ? 'Ubuntu-22.04'
                      : 'CentOS-Stream-9-raw');

                  return (
                    <tr key={image.id} className="transition-colors hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        <div>
                          <div className="font-semibold text-gray-900">{image.name}</div>
                          <div className="mt-0.5 text-xs text-gray-500">
                            {image.description || matchedRepoImage?.description || 'Custom image'}
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-400">v1</span>
                            <code className="max-w-[200px] truncate rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                              {image.id}
                            </code>
                            <button
                              onClick={() => {
                                void copyToClipboard(image.id).then((ok) => {
                                  if (ok) {
                                    setCopiedId(image.id);
                                    setTimeout(() => setCopiedId(null), 2000);
                                  }
                                });
                              }}
                              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                              title="Copy UUID"
                            >
                              {copiedId === image.id ? (
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {baseImageName}
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-gray-600">
                        {createdDate}
                      </td>
                      <td className="px-6 py-4">
                        <select
                          value={image.visibility || 'public'}
                          disabled={updatingVisId === image.id}
                          onChange={(e) => void handleUpdateVisibility(image.id, e.target.value)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm outline-none transition-colors hover:border-gray-400 focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900] disabled:opacity-50"
                        >
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              {!isOpenstackLoading && !openstackLoadError && filteredOsImages.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-sm text-gray-400">
                    Không có image nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-4">
          <span className="text-xs text-gray-500">
            Hiển thị {filteredOsImages.length} trên tổng số {openstackImages.length} images
          </span>
        </div>
      </div>

      {submitMessage && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {submitMessage}
        </div>
      )}

      {submitError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      {/* Upload/Create Image Modal */}
      {showUploadModal && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
                <h3 className="text-lg font-semibold text-gray-900">Tạo Image Draft</h3>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedImage(null);
                  }}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 p-6">
                {selectedImage ? (
                  <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                    Tạo version mới dựa trên image: {selectedImage.name}
                  </div>
                ) : null}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Tên image</label>
                  <input
                    type="text"
                    value={imageForm.name}
                    onChange={(event) =>
                      setImageForm((prev) => ({
                        ...prev,
                        name: event.target.value,
                        slug: prev.slug || toSlug(event.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="ubuntu-22.04-lts-custom"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Slug</label>
                  <input
                    type="text"
                    value={imageForm.slug}
                    onChange={(event) =>
                      setImageForm((prev) => ({
                        ...prev,
                        slug: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="ubuntu-22-04-lts-custom"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Mô tả</label>
                  <textarea
                    rows={3}
                    value={imageForm.description}
                    onChange={(event) =>
                      setImageForm((prev) => ({
                        ...prev,
                        description: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Mô tả image cho lab và workflow phê duyệt"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Storage URL
                  </label>
                  <input
                    type="text"
                    value={imageForm.storageUrl}
                    onChange={(event) =>
                      setImageForm((prev) => ({
                        ...prev,
                        storageUrl: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="file:///var/lib/images/ubuntu-custom.qcow2"
                  />
                </div>
              </div>

              <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
                <Button variant="outline" onClick={() => setShowUploadModal(false)}>
                  Hủy
                </Button>
                <Button onClick={handleCreateImage} disabled={isSubmitting}>
                  <Upload className="mr-2 h-4 w-4" />
                  {isSubmitting ? 'Đang tạo...' : 'Tạo Image'}
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Diff Analysis Modal */}
      {showDiffModal && selectedImage && (
        <Portal>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
                <h3 className="text-lg font-semibold text-gray-900">Phân tích Diff</h3>
                <button
                  onClick={() => setShowDiffModal(false)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 p-6">
                <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  Target image: {selectedImage.name}
                  <div className="text-xs text-gray-500">
                    Latest version: {selectedImage.latestVersionId ?? 'N/A'}
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Base version ID
                  </label>
                  <input
                    type="text"
                    value={diffBaseVersionId}
                    onChange={(event) => setDiffBaseVersionId(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="image-version-id-base"
                  />
                </div>
                {diffResult && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700">
                    <div className="font-semibold text-gray-900">Kết quả phân tích</div>
                    <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5">
                      {JSON.stringify(diffResult, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
                <Button variant="outline" onClick={() => setShowDiffModal(false)}>
                  Đóng
                </Button>
                <Button onClick={handleAnalyzeDiff} disabled={isSubmitting}>
                  {isSubmitting ? 'Đang phân tích...' : 'Phân tích diff'}
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Inspect drawer */}
      {drawerSession && (
        <Portal>
          <div className="fixed inset-0 z-[100] flex">
            {/* dim overlay */}
            <div className="flex-1 bg-black/40" onClick={closeDrawer} />

            {/* panel */}
            <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
              {/* header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-gray-900">
                    {drawerSession.pendingImageName || drawerSession.targetImageName}
                  </h2>
                  <p className="mt-0.5 text-xs text-amber-600">Yêu cầu đóng gói custom image</p>
                </div>
                <button
                  onClick={closeDrawer}
                  className="ml-4 shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              {/* scrollable body */}
              <div className="flex-1 space-y-6 overflow-y-auto p-6">
                {/* Metadata */}
                <section>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Thông tin yêu cầu
                  </h3>
                  <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-gray-500">Tên Image</dt>
                    <dd className="font-medium text-gray-900">
                      {drawerSession.pendingImageName || drawerSession.targetImageName}
                    </dd>
                    <dt className="text-gray-500">Mô tả</dt>
                    <dd className="text-gray-700">{drawerSession.pendingImageDesc || '—'}</dd>
                    <dt className="text-gray-500">Visibility</dt>
                    <dd>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${drawerSession.pendingImageVisibility === 'public' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}
                      >
                        {drawerSession.pendingImageVisibility === 'public' ? 'Public' : 'Private'}
                      </span>
                    </dd>
                    <dt className="text-gray-500">Base Image ID</dt>
                    <dd className="break-all font-mono text-xs text-gray-600">
                      {drawerSession.baseImageId}
                    </dd>
                    <dt className="text-gray-500">Thời gian submit</dt>
                    <dd className="text-gray-700">
                      {drawerSession.updatedAt
                        ? new Date(drawerSession.updatedAt).toLocaleString('vi-VN')
                        : '—'}
                    </dd>
                  </dl>
                </section>

                {/* VM Inspection */}
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Kiểm tra thay đổi trên VM
                    </h3>
                    <button
                      onClick={() => void runInspect()}
                      disabled={inspectLoading}
                      className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                    >
                      {inspectLoading ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang kiểm tra…
                        </>
                      ) : (
                        <>
                          <Terminal className="h-3.5 w-3.5" /> Chạy kiểm tra
                        </>
                      )}
                    </button>
                  </div>

                  {inspectError && (
                    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {inspectError}
                    </div>
                  )}

                  {!inspectResult && !inspectLoading && !inspectError && (
                    <p className="text-sm text-gray-400">
                      Bấm "Chạy kiểm tra" để SSH vào VM và thu thập thông tin thay đổi.
                    </p>
                  )}

                  {inspectResult &&
                    (() => {
                      const ssh = inspectResult.sshInspection;
                      const pd = inspectResult.packageDiff;

                      const formatPackageDiff = (d: PackageDiff): string => {
                        const lines: string[] = [];
                        if (d.added?.length) {
                          lines.push(`=== THÊM MỚI (${d.added.length}) ===`);
                          d.added.forEach((p) => lines.push(`+ ${p}`));
                        }
                        if (d.removed?.length) {
                          lines.push(`\n=== ĐÃ XÓA (${d.removed.length}) ===`);
                          d.removed.forEach((p) => lines.push(`- ${p}`));
                        }
                        if (d.unchanged !== undefined)
                          lines.push(`\n=== KHÔNG ĐỔI: ${d.unchanged} packages ===`);
                        if (d.error) lines.push(`\n[Lưu ý] ${d.error}`);
                        return lines.join('\n') || 'Không có sự khác biệt';
                      };

                      type Tab = { id: string; label: string; content: string; badge?: string };
                      const tabs: Tab[] = [];

                      if (ssh.status === 'success') {
                        if (ssh.os) tabs.push({ id: 'os', label: 'OS Info', content: ssh.os });
                        if (ssh.packages)
                          tabs.push({
                            id: 'pkg',
                            label: 'Packages',
                            content: ssh.packages,
                            badge: String(ssh.packages.split('\n').filter(Boolean).length),
                          });
                        if (ssh.recentPackages)
                          tabs.push({
                            id: 'recent',
                            label: 'Thay đổi',
                            content: ssh.recentPackages,
                          });
                        if (ssh.services)
                          tabs.push({ id: 'svc', label: 'Services', content: ssh.services });
                        if (ssh.files) {
                          tabs.push({
                            id: 'files',
                            label: 'File',
                            content: '',
                            badge: String(ssh.files.length),
                          });
                        } else if (ssh.disk) {
                          tabs.push({ id: 'disk', label: 'Disk', content: ssh.disk });
                        }
                        if (ssh.users)
                          tabs.push({ id: 'users', label: 'Users', content: ssh.users });
                      }
                      if (pd && (pd.status === 'success' || pd.status === 'partial')) {
                        tabs.push({
                          id: 'pd',
                          label: 'Package Diff',
                          content: formatPackageDiff(pd),
                          badge: pd.added?.length ? `+${pd.added.length}` : undefined,
                        });
                      }

                      const activeTab = tabs.find((t) => t.id === inspectTab) ?? tabs[0];

                      return (
                        <div className="overflow-hidden rounded-xl border border-gray-200">
                          <div
                            className={`flex items-center gap-2 px-4 py-2 text-xs font-medium ${ssh.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${ssh.status === 'success' ? 'bg-green-500' : 'bg-amber-400'}`}
                            />
                            SSH:{' '}
                            {ssh.status === 'success'
                              ? `Kết nối thành công — ${inspectResult.session.sshHost}`
                              : ssh.error || ssh.status}
                          </div>

                          {tabs.length > 0 && (
                            <>
                              <div className="flex flex-wrap gap-0 border-b border-gray-200 bg-gray-50">
                                {tabs.map((t) => (
                                  <button
                                    key={t.id}
                                    onClick={() => setInspectTab(t.id)}
                                    className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                                      activeTab?.id === t.id
                                        ? 'border-gray-900 font-semibold text-gray-900'
                                        : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                                  >
                                    {t.label}
                                    {t.badge && (
                                      <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px]">
                                        {t.badge}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>

                              {activeTab?.id === 'files' ? (
                                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white text-xs shadow-sm">
                                  {ssh.files && ssh.files.length > 0 ? (
                                    <>
                                      <div className="grid grid-cols-[1fr_120px_100px] items-center border-b border-gray-200 bg-gray-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-gray-700">
                                        <div>Tên file & Đường dẫn</div>
                                        <div className="text-right">Kích thước</div>
                                        <div className="text-center">Hành động</div>
                                      </div>

                                      <div className="max-h-72 divide-y divide-gray-100 overflow-y-auto">
                                        {ssh.files.map((file: any, idx: number) => {
                                          const filePath =
                                            typeof file === 'string'
                                              ? file
                                              : file?.path ||
                                                file?.name ||
                                                file?.filename ||
                                                String(file || '');
                                          const sizeNum =
                                            typeof file === 'object' &&
                                            typeof file?.size === 'number'
                                              ? file.size
                                              : Number(file?.size) || 0;
                                          const fileSizeStr =
                                            sizeNum <= 0
                                              ? '0 KB'
                                              : sizeNum < 1024
                                                ? `${sizeNum} B`
                                                : sizeNum < 1024 * 1024
                                                  ? `${(sizeNum / 1024).toFixed(1)} KB`
                                                  : `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
                                          const normalizedFile: InspectFileItem =
                                            typeof file === 'string'
                                              ? { path: file, size: 0, content: '' }
                                              : { ...file, path: filePath, size: sizeNum };

                                          return (
                                            <div
                                              key={idx}
                                              className="grid grid-cols-[1fr_120px_100px] items-center bg-white px-4 py-3 transition-colors hover:bg-gray-50/90"
                                            >
                                              <div className="flex min-w-0 items-center gap-2 pr-2">
                                                <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                                                <span
                                                  className="break-all font-mono text-xs font-bold leading-relaxed text-gray-900"
                                                  style={{ color: '#111827' }}
                                                >
                                                  {filePath}
                                                </span>
                                              </div>
                                              <div className="whitespace-nowrap text-right">
                                                <span className="inline-block rounded border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-700">
                                                  {fileSizeStr}
                                                </span>
                                              </div>
                                              <div className="whitespace-nowrap text-center">
                                                <button
                                                  onClick={() => {
                                                    setSelectedFileForPreview(normalizedFile);
                                                    setCopiedPath(false);
                                                    setCopiedContent(false);
                                                  }}
                                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF6900] px-3 py-1.5 font-sans text-xs font-medium text-white shadow-sm transition-all hover:bg-[#E55E00] active:scale-95"
                                                >
                                                  <Eye className="h-3.5 w-3.5" /> Xem
                                                </button>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="py-8 text-center font-sans text-gray-500">
                                      Không phát hiện thấy file mới được tạo hoặc chỉnh sửa trong hệ
                                      thống.
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all bg-gray-950 p-4 text-[11px] leading-5 text-green-400">
                                  {activeTab?.content || ''}
                                </pre>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                </section>
              </div>

              {/* footer actions */}
              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-4">
                <button
                  onClick={closeDrawer}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* File Preview Modal */}
      {selectedFileForPreview && (
        <Portal>
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900 text-gray-100 shadow-2xl">
              <div className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-6 py-4">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-5 w-5 shrink-0 text-blue-400" />
                  <h3
                    className="truncate font-mono text-sm font-semibold text-gray-100"
                    title={selectedFileForPreview.path}
                  >
                    {selectedFileForPreview.path}
                  </h3>
                  <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-950/80 px-2.5 py-0.5 font-mono text-xs font-medium text-emerald-400">
                    {selectedFileForPreview.size <= 0
                      ? '0 KB'
                      : selectedFileForPreview.size < 1024
                        ? `${selectedFileForPreview.size} B`
                        : selectedFileForPreview.size < 1024 * 1024
                          ? `${(selectedFileForPreview.size / 1024).toFixed(1)} KB`
                          : `${(selectedFileForPreview.size / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedFileForPreview(null)}
                  className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-200"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <div className="flex items-center justify-end border-b border-gray-800 bg-gray-900/80 px-6 py-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      void copyToClipboard(selectedFileForPreview.path).then((ok) => {
                        if (ok) {
                          setCopiedPath(true);
                          setTimeout(() => setCopiedPath(false), 2000);
                        }
                      });
                    }}
                    className="flex items-center gap-1.5 rounded bg-gray-800 px-3 py-1.5 text-gray-200 transition-colors hover:bg-gray-700 hover:text-white"
                  >
                    {copiedPath ? (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedPath ? 'Đã copy đường dẫn' : 'Copy path'}
                  </button>
                  {!selectedFileForPreview.isBinary && (
                    <button
                      onClick={() => {
                        void copyToClipboard(selectedFileForPreview.content || '').then((ok) => {
                          if (ok) {
                            setCopiedContent(true);
                            setTimeout(() => setCopiedContent(false), 2000);
                          }
                        });
                      }}
                      className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 font-medium text-white shadow-sm transition-colors hover:bg-blue-500"
                    >
                      {copiedContent ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedContent ? 'Đã copy nội dung' : 'Copy nội dung'}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-auto bg-gray-950 p-4">
                {selectedFileForPreview.isBinary ? (
                  <div className="my-8 rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-center text-sm text-amber-400">
                    <p className="font-semibold">Tệp tin Binary hoặc không phải định dạng Text</p>
                    <p className="mt-1 text-xs text-amber-500">
                      Tệp tin này chứa dữ liệu nhị phân. Không thể hiển thị nội dung dạng mã bản rõ.
                    </p>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-5 text-green-400">
                    {selectedFileForPreview.content || '(Tệp tin rỗng)'}
                  </pre>
                )}
              </div>

              <div className="flex items-center justify-end border-t border-gray-800 bg-gray-950 px-6 py-3">
                <button
                  onClick={() => setSelectedFileForPreview(null)}
                  className="rounded-lg bg-gray-800 px-4 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-700"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Message Dialog */}
      <Dialog
        open={dialog?.type === 'message'}
        title={dialog?.type === 'message' ? dialog.title : ''}
        description={dialog?.type === 'message' ? dialog.message : ''}
        onClose={closeDialog}
        actions={[
          {
            label: 'Đóng',
            onClick: closeDialog,
            variant:
              dialog?.type === 'message' && dialog.variant === 'error' ? 'danger' : 'primary',
          },
        ]}
      />
    </div>
  );
}
