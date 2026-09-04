'use client';

import {
  Edit,
  Layers,
  Network,
  Server,
} from 'lucide-react';

import React, { useEffect, useState } from 'react';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { InstructorLayout } from '@laas-portal/ui';

type LabTemplateDetail = {
  id: string;
  code: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string | null;
  difficulty?: string | null;
  status: string;
  accessType?: 'PUBLIC' | 'RESTRICTED';
  version: number;
  tags?: string[] | null;
  metadata?: Record<string, any> | null;
  updatedAt: string;
  createdAt: string;
};

type ModuleSummary = {
  id: string;
  name: string;
  orderNo: number;
  estimatedMinutes?: number | null;
  status: string;
  description?: string | null;
  objectives?: string[] | null;
  definitionJson?: {
    networkZones?: any[];
    vmConfigs?: any[];
    checkpoints?: any[];
  } | null;
  updatedAt: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '--' : date.toLocaleString('vi-VN');
}

export default function InstructorLabDetailPage() {
  const params = useParams<{ id: string }>();
  const labId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [lab, setLab] = useState<LabTemplateDetail | null>(null);
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!labId) return;

    const controller = new AbortController();

    const loadData = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');

        const [labRes, modulesRes] = await Promise.all([
          fetch(`/api/lab-templates/${labId}`, {
            signal: controller.signal,
            cache: 'no-store',
          }),
          fetch(`/api/lab-templates/${labId}/modules`, {
            signal: controller.signal,
            cache: 'no-store',
          }),
        ]);

        const labPayload = (await labRes.json()) as ApiResponse<LabTemplateDetail>;
        const modulesPayload = (await modulesRes.json()) as ApiResponse<ModuleSummary[]>;

        if (!labRes.ok || !labPayload.success || !labPayload.data) {
          throw new Error(labPayload.message ?? 'Không thể tải chi tiết bài lab');
        }

        if (!modulesRes.ok || !modulesPayload.success) {
          throw new Error(modulesPayload.message ?? 'Không thể tải danh sách module');
        }

        setLab(labPayload.data);
        setModules(modulesPayload.data ?? []);
      } catch (error) {
        if ((error as { name?: string }).name !== 'AbortError') {
          setErrorMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu');
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadData();
    return () => controller.abort();
  }, [labId]);

  if (isLoading) {
    return (
      <InstructorLayout basePath="/instructor">
        <div className="p-6 lg:p-8">
          <div className="flex h-64 items-center justify-center text-sm text-gray-500">
            Đang tải chi tiết bài lab...
          </div>
        </div>
      </InstructorLayout>
    );
  }

  if (errorMessage || !lab) {
    return (
      <InstructorLayout basePath="/instructor">
        <div className="p-6 lg:p-8">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <p className="text-sm font-medium text-red-700">
              {errorMessage || 'Không tìm thấy bài lab template'}
            </p>
            <div className="mt-4">
              <Link
                href="/instructor/labs"
                className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                ← Quay lại danh sách
              </Link>
            </div>
          </div>
        </div>
      </InstructorLayout>
    );
  }

  const tags = Array.isArray(lab.tags) ? lab.tags : [];
  const meta = lab.metadata || {};
  const isPaid = meta.pricingType === 'PAID';
  const price = Number(meta.price || 0);
  const finalPrice = Number(meta.finalPrice || (isPaid ? price : 0));
  const approvalStatus = meta.approvalStatus || (lab.status === 'PUBLISHED' ? 'APPROVED' : 'PENDING');
  const adminNote = meta.adminNote || meta.rejectionReason || '';

  return (
    <InstructorLayout basePath="/instructor">
      <div className="p-6 lg:p-8 space-y-6">
        {/* Breadcrumbs & Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <nav className="mb-2 flex items-center gap-2 text-sm text-gray-500">
              <Link href="/instructor/labs" className="hover:text-blue-600">
                Lab Templates
              </Link>
              <span>/</span>
              <span className="text-gray-900 font-medium">{lab.name}</span>
            </nav>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{lab.name}</h1>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  lab.status === 'PUBLISHED'
                    ? 'bg-green-100 text-green-800'
                    : lab.status === 'REVIEW'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {lab.status === 'PUBLISHED'
                  ? 'Đã xuất bản'
                  : lab.status === 'REVIEW'
                  ? 'Chờ duyệt'
                  : 'Bản nháp'}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Mã code: <span className="font-mono text-gray-700">{lab.code}</span> • Slug:{' '}
              <span className="font-mono text-gray-700">{lab.slug}</span>
            </p>
          </div>

          <div className="flex gap-3">
            <Link
              href="/instructor/labs"
              className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ← Quay lại
            </Link>
            <Link
              href={`/instructor/labs/${lab.id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 shadow-sm"
            >
              <Edit className="h-4 w-4" />
              Chỉnh sửa bài Lab
            </Link>
          </div>
        </div>

        {/* Admin note / Rejection feedback alert if present */}
        {adminNote && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <h4 className="text-sm font-semibold text-red-900 mb-1">
              Phản hồi từ Quản trị viên (Admin Note):
            </h4>
            <p className="text-sm text-red-800">{adminNote}</p>
          </div>
        )}

        {/* Info Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Info */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Thông tin bài Lab</h2>
            <div className="space-y-3 text-sm">
              <div>
                <span className="font-medium text-gray-500">Mô tả:</span>
                <p className="mt-1 text-gray-800 whitespace-pre-line">{lab.description || 'Chưa có mô tả'}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <span className="font-medium text-gray-500">Danh mục:</span>
                  <p className="mt-0.5 font-medium text-gray-900">{lab.category || '--'}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500">Độ khó:</span>
                  <p className="mt-0.5 font-medium text-gray-900">{lab.difficulty || '--'}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-500">Chế độ chia sẻ:</span>
                  <p className="mt-0.5 font-medium text-gray-900">
                    {lab.accessType === 'RESTRICTED' ? 'Private (Giới hạn)' : 'Public (Công khai)'}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500">Định giá:</span>
                  <p className="mt-0.5 font-medium text-gray-900">
                    {isPaid ? (
                      <span className="text-emerald-700 font-semibold">
                        {finalPrice.toLocaleString('vi-VN')} VNĐ
                        {price > finalPrice && (
                          <span className="ml-1 text-xs text-gray-400 line-through">
                            {price.toLocaleString('vi-VN')} VNĐ
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-blue-700 font-semibold">Miễn phí</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="pt-2">
                <span className="font-medium text-gray-500">Tags:</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {tags.length > 0 ? (
                    tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-700 font-medium"
                      >
                        #{tag}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400">Không có tags</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Status and Metadata */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Trạng thái & Quản trị</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Phê duyệt:</span>
                <span
                  className={`font-semibold ${
                    approvalStatus === 'APPROVED'
                      ? 'text-green-600'
                      : approvalStatus === 'REJECTED'
                      ? 'text-red-600'
                      : 'text-amber-600'
                  }`}
                >
                  {approvalStatus === 'APPROVED'
                    ? 'Đã duyệt'
                    : approvalStatus === 'REJECTED'
                    ? 'Bị từ chối'
                    : 'Đang chờ duyệt'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Phiên bản:</span>
                <span className="font-mono font-semibold text-gray-900">v{lab.version}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Tổng modules:</span>
                <span className="font-semibold text-gray-900">{modules.length}</span>
              </div>
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <div>
                  <span className="text-xs text-gray-500">Cập nhật lần cuối:</span>
                  <p className="text-xs text-gray-700">{formatDate(lab.updatedAt)}</p>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Ngày tạo:</span>
                  <p className="text-xs text-gray-700">{formatDate(lab.createdAt)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modules Table */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-gray-600" />
              <h2 className="text-base font-semibold text-gray-900">
                Danh sách Module cấu hình ({modules.length})
              </h2>
            </div>
            <Link
              href={`/instructor/labs/${lab.id}/edit`}
              className="text-xs text-orange-600 hover:text-orange-700 font-medium"
            >
              Chỉnh sửa modules trong trang Edit →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 font-medium text-gray-600">
                <tr>
                  <th className="px-6 py-3">Thứ tự</th>
                  <th className="px-6 py-3">Tên Module</th>
                  <th className="px-6 py-3">Thời lượng</th>
                  <th className="px-6 py-3 text-center">Tài nguyên (Zones / VMs)</th>
                  <th className="px-6 py-3 text-center">Checkpoints</th>
                  <th className="px-6 py-3">Cập nhật</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {modules.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      Chưa có module nào.
                    </td>
                  </tr>
                ) : (
                  modules.map((moduleItem) => {
                    const zones = moduleItem.definitionJson?.networkZones ?? [];
                    const vms = moduleItem.definitionJson?.vmConfigs ?? [];
                    const checkpoints = moduleItem.definitionJson?.checkpoints ?? [];

                    return (
                      <tr key={moduleItem.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-mono font-semibold text-gray-700">
                          #{moduleItem.orderNo}
                        </td>
                        <td className="px-6 py-4">
                          <p className="font-semibold text-gray-900">{moduleItem.name}</p>
                          {moduleItem.description && (
                            <p className="text-xs text-gray-500 line-clamp-1 mt-0.5">
                              {moduleItem.description}
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-700">
                          {moduleItem.estimatedMinutes ? `${moduleItem.estimatedMinutes} phút` : '--'}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 mr-2">
                            <Network className="h-3 w-3" /> {zones.length} zones
                          </span>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                            <Server className="h-3 w-3" /> {vms.length} VMs
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                            ✓ {checkpoints.length}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-gray-500">
                          {formatDate(moduleItem.updatedAt)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </InstructorLayout>
  );
}
