'use client';

import {
  Activity,
  CheckCircle,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCcw,
  StopCircle,
  Trash2,
  XCircle,
} from 'lucide-react';

import React, { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';

type SessionModule = {
  id: string;
  name: string;
  labTemplate: { id: string; name: string } | null;
};

type LabSession = {
  id: string;
  userId: string;
  moduleId: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  openstackStackId: string | null;
  module: SessionModule | null;
};

type ApiResponse = {
  success: boolean;
  data?: LabSession[];
  message?: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  STARTING: { label: 'Đang khởi động', color: 'text-yellow-700 bg-yellow-50 border-yellow-200', icon: Loader2 },
  RUNNING: { label: 'Đang chạy', color: 'text-green-700 bg-green-50 border-green-200', icon: Activity },
  STOPPED: { label: 'Đã dừng', color: 'text-gray-600 bg-gray-50 border-gray-200', icon: XCircle },
  COMPLETED: { label: 'Hoàn thành', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: CheckCircle },
  ERROR: { label: 'Lỗi', color: 'text-red-700 bg-red-50 border-red-200', icon: XCircle },
};

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diffMs = end - start;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}g ${minutes % 60}p`;
  return `${minutes}p`;
}

const STATUS_FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'STARTING', label: 'Đang khởi động' },
  { value: 'RUNNING', label: 'Đang chạy' },
  { value: 'STOPPED', label: 'Đã dừng' },
];

export default function AdminSessionsPage(): React.JSX.Element {
  const [sessions, setSessions] = useState<LabSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('RUNNING');
  const [actionId, setActionId] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const qs = status ? `?status=${encodeURIComponent(status)}&limit=100` : '?limit=100';
      const res = await fetch(`/api/sessions${qs}`, { cache: 'no-store' });
      const payload = (await res.json()) as ApiResponse;
      if (!res.ok || !payload.success) throw new Error(payload.message ?? 'Lỗi tải dữ liệu');
      setSessions(payload.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể kết nối đến server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(statusFilter);
  }, [load, statusFilter]);

  const handleStop = async (sessionId: string) => {
    if (!confirm('Bạn có chắc chắn muốn DỪNG phiên thực hành này?')) return;
    setActionId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/stop`, { method: 'POST' });
      if (!res.ok) throw new Error('Không thể dừng session');
      await load(statusFilter);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi khi dừng session');
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (!confirm('XÁC NHẬN XÓA: Phiên lab này sẽ bị xóa vĩnh viễn khỏi Database. Tiếp tục?')) return;
    setActionId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Không thể xóa session');
      await load(statusFilter);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi khi xóa session');
    } finally {
      setActionId(null);
    }
  };

  const runningCount = sessions.filter((s) => s.status === 'RUNNING').length;

  return (
    <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Lab Sessions</h1>
            <p className="mt-1 text-sm text-gray-500">
              Quản lý và theo dõi các phiên thực hành lab đang chạy
            </p>
          </div>
          <div className="flex items-center gap-3">
            {runningCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                {runningCount} đang chạy
              </span>
            )}
            <button
              onClick={() => void load(statusFilter)}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCcw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Làm mới
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === f.value
                  ? 'border-orange-300 bg-orange-50 text-orange-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-20 text-center">
            <Clock className="mb-3 h-12 w-12 text-gray-300" />
            <p className="text-base font-medium text-gray-500">Không có session nào</p>
            <p className="mt-1 text-sm text-gray-400">
              {statusFilter ? `Không có session với trạng thái "${statusFilter}"` : 'Chưa có session nào được tạo'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Lab / Module
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Student ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Trạng thái
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Bắt đầu
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Thời lượng
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map((session) => {
                  const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG['STOPPED'];
                  const StatusIcon = cfg.icon;
                  const labTemplate = session.module?.labTemplate;
                  const practiceUrl = labTemplate && session.moduleId
                    ? `/student/labs/${labTemplate.id}/practice?moduleId=${session.moduleId}`
                    : null;
                  const isActing = actionId === session.id;

                  return (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="font-medium text-gray-900">
                          {labTemplate?.name ?? <span className="italic text-gray-400">Không rõ</span>}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {session.module?.name ?? session.moduleId ?? '—'}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-xs text-gray-600">{session.userId}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${cfg.color}`}
                        >
                          <StatusIcon
                            className={`h-3 w-3 ${session.status === 'STARTING' ? 'animate-spin' : ''}`}
                          />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatDateTime(session.startedAt)}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatDuration(session.startedAt, session.endedAt)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {practiceUrl && session.status === 'RUNNING' && (
                            <Link
                              href={practiceUrl}
                              target="_blank"
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              title="Mở lại phiên lab"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              Mở
                            </Link>
                          )}
                          {(session.status === 'RUNNING' || session.status === 'STARTING') && (
                            <button
                              onClick={() => void handleStop(session.id)}
                              disabled={isActing}
                              className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                              title="Dừng phiên lab"
                            >
                              <StopCircle className="h-3.5 w-3.5" />
                              Dừng
                            </button>
                          )}
                          <button
                            onClick={() => void handleDelete(session.id)}
                            disabled={isActing}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                            title="Xóa session khỏi CSDL"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Xóa
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
  );
}
