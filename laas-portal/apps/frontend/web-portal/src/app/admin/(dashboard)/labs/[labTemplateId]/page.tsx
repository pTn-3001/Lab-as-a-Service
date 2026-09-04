'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useParams } from 'next/navigation';

type LabTemplateDetail = {
  id: string;
  code: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: string | null;
  difficulty?: string | null;
  status: string;
  version: number;
  tags?: string[] | null;
  updatedAt: string;
  createdAt: string;
};

type ModuleSummary = {
  id: string;
  name: string;
  orderNo: number;
  estimatedMinutes?: number | null;
  status: string;
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

export default function LabTemplateDetailPage() {
  const params = useParams<{ labTemplateId: string }>();
  const labTemplateId = Array.isArray(params.labTemplateId)
    ? params.labTemplateId[0]
    : params.labTemplateId;

  const [lab, setLab] = useState<LabTemplateDetail | null>(null);
  const [modules, setModules] = useState<ModuleSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!labTemplateId) return;

    const controller = new AbortController();

    const loadData = async () => {
      try {
        setIsLoading(true);
        setErrorMessage('');

        const [labRes, modulesRes] = await Promise.all([
          fetch(`/api/lab-templates/${labTemplateId}`, {
            signal: controller.signal,
            cache: 'no-store',
          }),
          fetch(`/api/lab-templates/${labTemplateId}/modules`, {
            signal: controller.signal,
            cache: 'no-store',
          }),
        ]);

        const labPayload = (await labRes.json()) as ApiResponse<LabTemplateDetail>;
        const modulesPayload = (await modulesRes.json()) as ApiResponse<ModuleSummary[]>;

        if (!labRes.ok || !labPayload.success || !labPayload.data) {
          throw new Error(labPayload.message ?? 'Không thể tải chi tiết lab');
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
  }, [labTemplateId]);

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-600">Đang tải chi tiết lab...</div>;
  }

  if (errorMessage || !lab) {
    return (
      <div className="space-y-4 p-6">
        <p className="text-sm text-red-600">{errorMessage || 'Không tìm thấy lab template'}</p>
        <Link
          href="/admin/labs"
          className="inline-flex rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const tags = Array.isArray(lab.tags) ? lab.tags : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lab.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            Mã: {lab.code} • Slug: {lab.slug}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/labs"
            className="inline-flex rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Quay lại
          </Link>
          <Link
            href={`/admin/labs/${lab.id}/edit`}
            className="inline-flex rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            Chỉnh sửa
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Thông tin cơ bản</h2>
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-gray-500">Mô tả:</span> {lab.description || '--'}
            </p>
            <p>
              <span className="text-gray-500">Danh mục:</span> {lab.category || '--'}
            </p>
            <p>
              <span className="text-gray-500">Độ khó:</span> {lab.difficulty || '--'}
            </p>
            <p>
              <span className="text-gray-500">Tags:</span>{' '}
              {tags.length > 0 ? tags.join(', ') : '--'}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">Trạng thái</h2>
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-gray-500">Status:</span> {lab.status}
            </p>
            <p>
              <span className="text-gray-500">Version:</span> {lab.version}
            </p>
            <p>
              <span className="text-gray-500">Cập nhật:</span> {formatDate(lab.updatedAt)}
            </p>
            <p>
              <span className="text-gray-500">Tạo lúc:</span> {formatDate(lab.createdAt)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Danh sách module ({modules.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-6 py-3">Tên module</th>
                <th className="px-6 py-3">Order</th>
                <th className="px-6 py-3">Thời lượng</th>
                <th className="px-6 py-3">Trạng thái</th>
                <th className="px-6 py-3">Cập nhật</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {modules.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Chưa có module nào.
                  </td>
                </tr>
              )}
              {modules.map((moduleItem) => (
                <tr key={moduleItem.id}>
                  <td className="px-6 py-3 font-medium text-gray-900">{moduleItem.name}</td>
                  <td className="px-6 py-3 text-gray-700">{moduleItem.orderNo}</td>
                  <td className="px-6 py-3 text-gray-700">
                    {moduleItem.estimatedMinutes ? `${moduleItem.estimatedMinutes} phút` : '--'}
                  </td>
                  <td className="px-6 py-3 text-gray-700">{moduleItem.status}</td>
                  <td className="px-6 py-3 text-gray-500">{formatDate(moduleItem.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
