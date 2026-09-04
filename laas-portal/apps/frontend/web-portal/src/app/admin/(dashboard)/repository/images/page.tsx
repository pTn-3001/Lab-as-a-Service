'use client';

import { Check, ChevronRight, Copy, Eye, FileText, HardDrive, Loader2, Terminal, Upload, XCircle } from 'lucide-react';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Badge, Button, SearchBar } from '@laas-portal/ui';
import { Dialog } from '../../../../../components/dialog';
import { ensureValidToken } from '../../../../../lib/auth';

type OpenStackImageRow = {
  id: string;
  name: string;
  status: string;
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

export default function ImagesPage(): React.ReactElement {
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
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Inspect drawer state
  const [drawerSession, setDrawerSession] = useState<PendingApprovalRow | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectError, setInspectError] = useState('');
  const [inspectTab, setInspectTab] = useState<string>('os');
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<InspectFileItem | null>(null);
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
  type DialogKind =
    | { type: 'approve-confirm'; sessionId: string }
    | { type: 'reject-reason'; sessionId: string; note: string }
    | { type: 'message'; title: string; message: string; variant: 'success' | 'error' }
    | { type: 'approve-result'; glanceImageId: string; imageId?: string; imageVersionId?: string };
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
    return () => { isActive = false; };
  }, []);

  // Load repository images
  useEffect(() => {
    let isActive = true;

    async function loadImages() {
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

        if (isActive) {
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
            latestVersionGlanceImageId: item.latestVersionGlanceImageId ? String(item.latestVersionGlanceImageId) : null,
            createdBy: String(item.createdById ?? ''),
            createdAt: String(item.createdAt ?? ''),
          })) as ImageRow[];
          setRepoImages(normalized);
        }
      } catch (error) {
        if (isActive) {
          setLoadError(
            error instanceof Error ? error.message : 'Không thể tải danh sách image repository'
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadImages();

    return () => {
      isActive = false;
    };
  }, []);

  const reloadOpenstackImages = async () => {
    setIsOpenstackLoading(true);
    setOpenstackLoadError('');
    try {
      const response = await fetch('/api/images', { method: 'GET', cache: 'no-store' });
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
        createdAt: item.createdAt ?? item.created_at ? String(item.createdAt ?? item.created_at) : undefined,
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

  useEffect(() => {
    let isActive = true;
    async function loadPending() {
      setIsPendingLoading(true);
      setPendingError('');
      try {
        const res = await fetch('/api/image-builder/pending', { cache: 'no-store' });
        const payload = (await res.json()) as { success?: boolean; data?: PendingApprovalRow[] };
        if (!res.ok || !payload.success) throw new Error('Không thể tải danh sách chờ duyệt');
        if (isActive) setPendingApprovals(payload.data ?? []);
      } catch (e) {
        if (isActive) setPendingError(e instanceof Error ? e.message : 'Lỗi');
      } finally {
        if (isActive) setIsPendingLoading(false);
      }
    }
    void loadPending();
    return () => { isActive = false; };
  }, []);

  const filteredOsImages = openstackImages.filter((image) => {
    const query = searchQuery.toLowerCase();
    const isNameMatch = image.name.toLowerCase().includes(query);
    const isIdMatch = image.id.toLowerCase().includes(query);

    const matchedRepoImage = repoImages.find(
      (ri) => ri.latestVersionGlanceImageId === image.id
    );
    const creatorUser = matchedRepoImage
      ? (usersMap[matchedRepoImage.createdBy] || matchedRepoImage.createdBy)
      : 'openstack';
    const isCreatorMatch = creatorUser.toLowerCase().includes(query);

    return isNameMatch || isIdMatch || isCreatorMatch;
  });

  const refreshImages = async () => {
    const response = await fetch('/api/repository-images', {
      method: 'GET',
      cache: 'no-store',
    });
    const payload = (await response.json()) as {
      success?: boolean;
      data?: { images?: Array<Record<string, unknown>> };
    };
    if (!response.ok || !payload?.success) {
      throw new Error('Không thể tải lại repository images');
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
      latestVersionGlanceImageId: item.latestVersionGlanceImageId ? String(item.latestVersionGlanceImageId) : null,
      createdBy: String(item.createdById ?? ''),
      createdAt: String(item.createdAt ?? ''),
    })) as ImageRow[];
    setRepoImages(normalized);
  };

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
          createdById: 'admin-portal-user',
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
              createdById: 'admin-portal-user',
              versionNumber: 1,
            }),
          }
        );

        const createVersionPayload = await createVersionResponse.json();
        if (!createVersionResponse.ok || !createVersionPayload?.id) {
          throw new Error(createVersionPayload?.message ?? 'Không thể tạo version đầu tiên');
        }
      }

      await refreshImages();
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
            requestedById: 'admin-portal-user',
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
      await refreshImages();
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
      const json = (await res.json()) as { success?: boolean; data?: InspectResult; message?: string };
      if (!res.ok || !json.success || !json.data) throw new Error(json.message || 'Lỗi khi kiểm tra');
      setInspectResult(json.data);
      setInspectTab(json.data.sshInspection.status === 'success' ? (json.data.sshInspection.files ? 'files' : 'os') : 'inspector');
    } catch (e) {
      setInspectError(e instanceof Error ? e.message : 'Lỗi không xác định');
    } finally {
      setInspectLoading(false);
    }
  };

  const handleApprove = (sessionId: string) => {
    setDialog({ type: 'approve-confirm', sessionId });
  };

  const executeApprove = async (sessionId: string) => {
    closeDialog();
    setApprovingId(sessionId);
    try {
      const res = await fetch(`/api/image-builder/${sessionId}/approve`, { method: 'POST', headers: await authHeaders() });
      const payload = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !payload.success) throw new Error(payload.message || 'Lỗi khi duyệt');
      setPendingApprovals((prev) => prev.filter((p) => p.id !== sessionId));
      setDialog({
        type: 'message',
        title: 'Đã tiếp nhận phê duyệt',
        message: 'Image đang được tạo trên OpenStack (khoảng 5–15 phút). Sau khi hoàn tất, image sẽ tự động xuất hiện trong catalog để instructor sử dụng.',
        variant: 'success',
      });
    } catch (e) {
      setDialog({ type: 'message', title: 'Lỗi', message: e instanceof Error ? e.message : 'Lỗi khi duyệt', variant: 'error' });
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = (sessionId: string) => {
    setDialog({ type: 'reject-reason', sessionId, note: '' });
  };

  const executeReject = async (sessionId: string, note: string) => {
    closeDialog();
    setApprovingId(sessionId);
    try {
      const res = await fetch(`/api/image-builder/${sessionId}/reject`, {
        method: 'POST',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ note }),
      });
      const payload = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !payload.success) throw new Error(payload.message || 'Lỗi khi từ chối');
      setPendingApprovals((prev) => prev.filter((p) => p.id !== sessionId));
    } catch (e) {
      setDialog({ type: 'message', title: 'Lỗi', message: e instanceof Error ? e.message : 'Lỗi khi từ chối', variant: 'error' });
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Quản lý Image
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Tạo image draft, tạo version và gửi diff để admin duyệt trước khi publish
          </p>
          {isLoading && (
            <p className="mt-2 text-xs text-blue-600">Đang đồng bộ image repository...</p>
          )}
          {loadError && (
            <p className="mt-2 text-xs text-red-600">Không thể tải danh sách image: {loadError}</p>
          )}
        </div>
      </div>

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
                Instructor đã hoàn thành cấu hình VM và yêu cầu tạo Image mới.
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
                    <th className="whitespace-nowrap px-4 py-3">Instructor</th>
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
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {req.userId.slice(0, 12)}…
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {req.updatedAt ? new Date(req.updatedAt).toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => void handleApprove(req.id)}
                            disabled={approvingId === req.id}
                            className="rounded-md bg-[#FF6900] px-3 py-1 text-xs font-medium text-white hover:bg-[#E55E00] transition-all active:scale-[0.98] disabled:opacity-50"
                          >
                            {approvingId === req.id ? 'Đang xử lý…' : 'Duyệt'}
                          </button>
                          <button
                            onClick={() => void handleReject(req.id)}
                            disabled={approvingId === req.id}
                            className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Từ chối
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Tổng Images</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{openstackImages.length}</p>
            </div>
            <div className="rounded-full bg-blue-100 p-3">
              <HardDrive className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {openstackImages.filter((i) => i.status === 'active').length}
              </p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <HardDrive className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Queued / Saving</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {openstackImages.filter((i) => i.status === 'queued' || i.status === 'saving').length}
              </p>
            </div>
            <div className="rounded-full bg-orange-100 p-3">
              <HardDrive className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Chờ duyệt</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{pendingApprovals.length}</p>
            </div>
            <div className="rounded-full bg-amber-100 p-3">
              <HardDrive className="h-6 w-6 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="flex-1">
          <SearchBar
            placeholder="Tìm kiếm image theo tên hoặc ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 font-medium text-gray-600">
              <tr>
                <th className="whitespace-nowrap px-6 py-4">Tên Image</th>
                <th className="whitespace-nowrap px-6 py-4">Người tạo / Ngày tạo</th>
                <th className="whitespace-nowrap px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isOpenstackLoading && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-400">
                    Đang tải danh sách image...
                  </td>
                </tr>
              )}
              {!isOpenstackLoading && openstackLoadError && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-red-500">
                    {openstackLoadError}
                  </td>
                </tr>
              )}
              {!isOpenstackLoading && !openstackLoadError && filteredOsImages.map((image) => {
                const matchedRepoImage = repoImages.find(
                  (ri) => ri.latestVersionGlanceImageId === image.id
                );
                const creatorUser = matchedRepoImage
                  ? (usersMap[matchedRepoImage.createdBy] || matchedRepoImage.createdBy)
                  : 'openstack';
                const dateRaw = matchedRepoImage?.createdAt || image.createdAt;
                const createdDate = dateRaw
                  ? new Date(dateRaw).toLocaleString('vi-VN')
                  : '—';

                return (
                  <tr key={image.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{image.name}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{creatorUser}</div>
                      <div className="text-xs text-gray-400">{createdDate}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="outline" className="text-xs font-medium uppercase">
                        {image.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {!isOpenstackLoading && !openstackLoadError && filteredOsImages.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-400">
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
                <label className="mb-2 block text-sm font-medium text-gray-700">Storage URL</label>
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
              <Button
                onClick={handleCreateImage}
                disabled={isSubmitting}
              >
                <Upload className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Đang tạo...' : 'Tạo Image'}
              </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}

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
              <Button
                onClick={handleAnalyzeDiff}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Đang phân tích...' : 'Phân tích diff'}
              </Button>
            </div>
            </div>
          </div>
        </Portal>
      )}

      {/* ── Dialogs ── */}

      {/* Approve confirmation */}
      <Dialog
        open={dialog?.type === 'approve-confirm'}
        title="Duyệt yêu cầu tạo Image"
        description="Xác nhận duyệt và tạo Image trên OpenStack? Quá trình snapshot VM sẽ bắt đầu ngay."
        onClose={closeDialog}
        actions={[
          { label: 'Hủy', onClick: closeDialog, variant: 'ghost' },
          {
            label: 'Duyệt',
            onClick: () => {
              if (dialog?.type === 'approve-confirm') void executeApprove(dialog.sessionId);
            },
            variant: 'primary',
          },
        ]}
      />

      {/* Reject reason input */}
      <Dialog
        open={dialog?.type === 'reject-reason'}
        title="Từ chối yêu cầu"
        onClose={closeDialog}
        actions={[
          { label: 'Hủy', onClick: closeDialog, variant: 'ghost' },
          {
            label: 'Từ chối',
            onClick: () => {
              if (dialog?.type === 'reject-reason') void executeReject(dialog.sessionId, dialog.note);
            },
            variant: 'danger',
          },
        ]}
      >
        <div className="mt-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Lý do từ chối <span className="text-gray-400">(tuỳ chọn)</span>
          </label>
          <textarea
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Nhập lý do từ chối..."
            value={dialog?.type === 'reject-reason' ? dialog.note : ''}
            onChange={(e) => {
              if (dialog?.type === 'reject-reason')
                setDialog({ ...dialog, note: e.target.value });
            }}
          />
        </div>
      </Dialog>

      {/* Success / error message */}
      <Dialog
        open={dialog?.type === 'message'}
        title={dialog?.type === 'message' ? dialog.title : ''}
        description={dialog?.type === 'message' ? dialog.message : ''}
        onClose={closeDialog}
        actions={[{ label: 'Đóng', onClick: closeDialog, variant: dialog?.type === 'message' && dialog.variant === 'error' ? 'danger' : 'primary' }]}
      />

      {/* Approve result — shows glanceImageId with copy button */}
      <Dialog
        open={dialog?.type === 'approve-result'}
        title="Image đã được duyệt"
        onClose={closeDialog}
        actions={[{ label: 'Đóng', onClick: closeDialog, variant: 'primary' }]}
      >
        {dialog?.type === 'approve-result' && (
          <div className="mt-3 space-y-4">
            <p className="text-sm text-gray-600">
              Image đã được duyệt và đăng vào catalog. Instructor có thể dùng UUID Glance dưới đây
              trong <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs">vmConfigs[].operatingSystem</code> khi tạo module lab.
            </p>
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Glance Image UUID</p>
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
                <code className="flex-1 break-all font-mono text-sm text-green-800">{dialog.glanceImageId}</code>
                <button
                  onClick={() => { void navigator.clipboard.writeText(dialog.glanceImageId); }}
                  className="shrink-0 rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
                  title="Copy UUID"
                >
                  Copy
                </button>
              </div>
            </div>
            {dialog.imageId && (
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Catalog Image ID</p>
                <code className="block break-all rounded bg-gray-100 px-3 py-2 font-mono text-xs text-gray-700">{dialog.imageId}</code>
              </div>
            )}
          </div>
        )}
      </Dialog>

      {/* ── Inspect drawer ── */}
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
            <div className="flex-1 overflow-y-auto p-6 space-y-6">

              {/* ── Metadata ── */}
              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Thông tin yêu cầu
                </h3>
                <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-gray-500">Tên Image</dt>
                  <dd className="font-medium text-gray-900">{drawerSession.pendingImageName || drawerSession.targetImageName}</dd>
                  <dt className="text-gray-500">Mô tả</dt>
                  <dd className="text-gray-700">{drawerSession.pendingImageDesc || '—'}</dd>
                  <dt className="text-gray-500">Visibility</dt>
                  <dd>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${drawerSession.pendingImageVisibility === 'public' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {drawerSession.pendingImageVisibility === 'public' ? 'Public' : 'Private'}
                    </span>
                  </dd>
                  <dt className="text-gray-500">Base Image ID</dt>
                  <dd className="break-all font-mono text-xs text-gray-600">{drawerSession.baseImageId}</dd>
                  <dt className="text-gray-500">Instructor ID</dt>
                  <dd className="font-mono text-xs text-gray-600">{drawerSession.userId}</dd>
                  <dt className="text-gray-500">Thời gian submit</dt>
                  <dd className="text-gray-700">{drawerSession.updatedAt ? new Date(drawerSession.updatedAt).toLocaleString('vi-VN') : '—'}</dd>
                </dl>
              </section>

              {/* ── VM Inspection ── */}
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
                    {inspectLoading
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang kiểm tra…</>
                      : <><Terminal className="h-3.5 w-3.5" /> Chạy kiểm tra</>
                    }
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

                {inspectResult && (() => {
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
                    if (d.unchanged !== undefined) lines.push(`\n=== KHÔNG ĐỔI: ${d.unchanged} packages ===`);
                    if (d.error) lines.push(`\n[Lưu ý] ${d.error}`);
                    return lines.join('\n') || 'Không có sự khác biệt';
                  };

                  type Tab = { id: string; label: string; content: string; badge?: string };
                  const tabs: Tab[] = [];

                  if (ssh.status === 'success') {
                    if (ssh.os) tabs.push({ id: 'os', label: 'OS Info', content: ssh.os });
                    if (ssh.packages) tabs.push({ id: 'pkg', label: 'Packages', content: ssh.packages, badge: String(ssh.packages.split('\n').filter(Boolean).length) });
                    if (ssh.recentPackages) tabs.push({ id: 'recent', label: 'Thay đổi', content: ssh.recentPackages });
                    if (ssh.services) tabs.push({ id: 'svc', label: 'Services', content: ssh.services });
                    if (ssh.files) {
                      tabs.push({ id: 'files', label: 'File', content: '', badge: String(ssh.files.length) });
                    } else if (ssh.disk) {
                      tabs.push({ id: 'disk', label: 'Disk', content: ssh.disk });
                    }
                    if (ssh.users) tabs.push({ id: 'users', label: 'Users', content: ssh.users });
                  }
                  if (pd && (pd.status === 'success' || pd.status === 'partial')) {
                    tabs.push({ id: 'pd', label: 'Package Diff', content: formatPackageDiff(pd), badge: pd.added?.length ? `+${pd.added.length}` : undefined });
                  }

                  const activeTab = tabs.find((t) => t.id === inspectTab) ?? tabs[0];

                  return (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      {/* SSH status bar */}
                      <div className={`flex items-center gap-2 px-4 py-2 text-xs font-medium ${ssh.status === 'success' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        <span className={`h-2 w-2 rounded-full ${ssh.status === 'success' ? 'bg-green-500' : 'bg-amber-400'}`} />
                        SSH: {ssh.status === 'success' ? `Kết nối thành công — ${inspectResult.session.sshHost}` : (ssh.error || ssh.status)}
                      </div>

                      {/* Tabs */}
                      {tabs.length > 0 && (
                        <>
                          <div className="flex flex-wrap gap-0 border-b border-gray-200 bg-gray-50">
                            {tabs.map((t) => (
                              <button
                                key={t.id}
                                onClick={() => setInspectTab(t.id)}
                                className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                                  activeTab?.id === t.id
                                    ? 'border-gray-900 text-gray-900 font-semibold'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                              >
                                {t.label}
                                {t.badge && (
                                  <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px]">{t.badge}</span>
                                )}
                              </button>
                            ))}
                          </div>

                          {activeTab?.id === 'files' ? (
                            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden text-xs">
                              {ssh.files && ssh.files.length > 0 ? (
                                <>
                                  {/* Fixed Header Bar */}
                                  <div className="grid grid-cols-[1fr_120px_100px] items-center bg-gray-100 px-4 py-3 font-bold uppercase tracking-wider text-[11px] text-gray-700 border-b border-gray-200">
                                    <div>Tên file & Đường dẫn</div>
                                    <div className="text-right">Kích thước</div>
                                    <div className="text-center">Hành động</div>
                                  </div>

                                  {/* Scrollable File Rows Body */}
                                  <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                                    {ssh.files.map((file: any, idx: number) => {
                                      const filePath = typeof file === 'string' ? file : (file?.path || file?.name || file?.filename || String(file || ''));
                                      const sizeNum = typeof file === 'object' && typeof file?.size === 'number' ? file.size : (Number(file?.size) || 0);
                                      const fileSizeStr = sizeNum <= 0 ? '0 KB' : sizeNum < 1024 ? `${sizeNum} B` : sizeNum < 1024 * 1024 ? `${(sizeNum / 1024).toFixed(1)} KB` : `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
                                      const normalizedFile: InspectFileItem = typeof file === 'string'
                                        ? { path: file, size: 0, content: '' }
                                        : { ...file, path: filePath, size: sizeNum };

                                      return (
                                        <div key={idx} className="grid grid-cols-[1fr_120px_100px] items-center px-4 py-3 bg-white hover:bg-gray-50/90 transition-colors">
                                          <div className="flex items-center gap-2 min-w-0 pr-2">
                                            <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                                            <span className="font-mono text-xs font-bold text-gray-900 break-all leading-relaxed" style={{ color: '#111827' }}>
                                              {filePath}
                                            </span>
                                          </div>
                                          <div className="text-right whitespace-nowrap">
                                            <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 inline-block">
                                              {fileSizeStr}
                                            </span>
                                          </div>
                                          <div className="text-center whitespace-nowrap">
                                            <button
                                              onClick={() => {
                                                setSelectedFileForPreview(normalizedFile);
                                                setCopiedPath(false);
                                                setCopiedContent(false);
                                              }}
                                              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF6900] px-3 py-1.5 text-xs font-sans font-medium text-white hover:bg-[#E55E00] active:scale-95 transition-all shadow-sm"
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
                                <div className="py-8 text-center text-gray-500 font-sans">
                                  Không phát hiện thấy file mới được tạo hoặc chỉnh sửa trong hệ thống.
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

                      {/* status bar for package diff */}
                      {(!pd || pd.status === 'unavailable') && (
                        <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400 space-y-1">
                          {pd?.status === 'unavailable' && <p>Package diff: {pd.error || 'Không có dữ liệu'}</p>}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </section>
            </div>

            {/* footer actions */}
            <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={closeDrawer}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Đóng
              </button>
              <button
                onClick={() => { closeDrawer(); void handleReject(drawerSession.id); }}
                disabled={approvingId === drawerSession.id}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Từ chối
              </button>
              <button
                onClick={() => { closeDrawer(); void handleApprove(drawerSession.id); }}
                disabled={approvingId === drawerSession.id}
                className="rounded-lg bg-[#FF6900] px-4 py-2 text-sm font-medium text-white hover:bg-[#E55E00] transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {approvingId === drawerSession.id ? 'Đang xử lý…' : 'Duyệt Image'}
              </button>
            </div>
          </div>
        </div>
        </Portal>
      )}
      {/* Modal preview nội dung file */}
      {selectedFileForPreview && (
        <Portal>
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-gray-900 shadow-2xl border border-gray-800 text-gray-100">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-6 py-4">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-5 w-5 text-blue-400 shrink-0" />
                  <h3 className="truncate font-mono text-sm font-semibold text-gray-100" title={selectedFileForPreview.path}>
                    {selectedFileForPreview.path}
                  </h3>
                  <span className="shrink-0 rounded bg-emerald-950/80 border border-emerald-500/30 px-2.5 py-0.5 font-mono text-xs font-medium text-emerald-400">
                    {selectedFileForPreview.size <= 0 ? '0 KB' : selectedFileForPreview.size < 1024 ? `${selectedFileForPreview.size} B` : selectedFileForPreview.size < 1024 * 1024 ? `${(selectedFileForPreview.size / 1024).toFixed(1)} KB` : `${(selectedFileForPreview.size / (1024 * 1024)).toFixed(1)} MB`}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedFileForPreview(null)}
                  className="rounded-full p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              {/* Toolbar action */}
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
                    className="flex items-center gap-1.5 rounded bg-gray-800 px-3 py-1.5 text-gray-200 hover:bg-gray-700 hover:text-white transition-colors"
                  >
                    {copiedPath ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
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
                      className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500 transition-colors shadow-sm"
                    >
                      {copiedContent ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedContent ? 'Đã copy nội dung' : 'Copy nội dung'}
                    </button>
                  )}
                </div>
              </div>

              {/* Content Viewer */}
              <div className="flex-1 overflow-auto p-4 bg-gray-950">
                {selectedFileForPreview.isBinary ? (
                  <div className="my-8 rounded-lg border border-amber-500/30 bg-amber-500/10 p-6 text-center text-amber-400 text-sm">
                    <p className="font-semibold">Tệp tin Binary hoặc không phải định dạng Text</p>
                    <p className="mt-1 text-xs text-amber-500">
                      Tệp tin này chứa dữ liệu nhị phân (ảnh, kho tệp nén, hoặc chương trình thực thi). Không thể hiển thị nội dung dạng mã bản rõ.
                    </p>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-all font-mono text-xs leading-5 text-green-400">
                    {selectedFileForPreview.content || '(Tệp tin rỗng)'}
                  </pre>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end border-t border-gray-800 bg-gray-950 px-6 py-3">
                <button
                  onClick={() => setSelectedFileForPreview(null)}
                  className="rounded-lg bg-gray-800 px-4 py-1.5 text-xs font-medium text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
