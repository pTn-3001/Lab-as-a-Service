'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  BookOpen,
  Calendar,
  ChevronRight,
  Clock,
  GraduationCap,
  Loader2,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@laas-portal/ui';
import { getAccessToken } from '../../../../lib/auth';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Instructor {
  id: string;
  fullName: string | null;
  email: string;
}

interface ClassGroup {
  id: string;
  name: string;
  code: string;
  semester: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  maxStudents: number;
  instructor: Instructor | null;
  _count: { students: number };
}

interface PaginatedResponse {
  data: ClassGroup[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getStatus(g: ClassGroup): { label: string; color: string } {
  if (!g.isActive) return { label: 'Không hoạt động', color: 'bg-gray-100 text-gray-700' };
  const now = new Date();
  const start = new Date(g.startDate);
  const end = new Date(g.endDate);
  if (start > now) return { label: 'Sắp tới', color: 'bg-blue-100 text-blue-700' };
  if (end < now) return { label: 'Kết thúc', color: 'bg-emerald-100 text-emerald-700' };
  return { label: 'Đang hoạt động', color: 'bg-green-100 text-green-700' };
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ------------------------------------------------------------------ */
/*  Create Class Modal                                                 */
/* ------------------------------------------------------------------ */

function CreateClassModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    description: '',
    schedule: '',
    startDate: '',
    endDate: '',
    maxStudents: 50,
  });
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [instructorId, setInstructorId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const token = getAccessToken();
      const res = await fetch('/api/users?systemRole=INSTRUCTOR&limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data.data ?? [];
        setInstructors(list);
      }
    })();
  }, []);

  const set = (field: string, value: string | number) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async () => {
    if (!form.name || !form.code || !form.startDate || !form.endDate || !instructorId) {
      setError('Vui lòng điền đầy đủ thông tin bắt buộc.');
      return;
    }
    setSubmitting(true);
    setError('');
    const token = getAccessToken();
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        instructorId,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      onDone();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? 'Có lỗi xảy ra');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Tạo lớp học mới</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Tên lớp *">
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="VD: Lập trình mạng nâng cao"
                className={inputCls}
              />
            </Field>
            <Field label="Mã lớp *">
              <input
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                placeholder="VD: NET2024A"
                className={inputCls}
              />
            </Field>
            <Field label="Ngày bắt đầu *">
              <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Ngày kết thúc *">
              <input type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Sĩ số tối đa">
              <input
                type="number"
                value={form.maxStudents}
                onChange={(e) => set('maxStudents', Number(e.target.value))}
                min={1}
                className={inputCls}
              />
            </Field>
            <Field label="Lịch học">
              <input
                value={form.schedule}
                onChange={(e) => set('schedule', e.target.value)}
                placeholder="VD: Thứ 2, 4: 7:30 - 9:30"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Giảng viên *">
            <select
              value={instructorId}
              onChange={(e) => setInstructorId(e.target.value)}
              className={inputCls}
            >
              <option value="">Chọn giảng viên</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.fullName ?? i.email} — {i.email}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Mô tả">
            <textarea
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              rows={3}
              placeholder="Mô tả ngắn về lớp học"
              className={`${inputCls} resize-none`}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200">
          <Button onClick={onClose} variant="outline">Huỷ</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tạo lớp'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

const inputCls =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AdminClassesPage() {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    const token = getAccessToken();
    const params = new URLSearchParams({
      page: String(page),
      limit: '12',
      ...(debouncedSearch && { search: debouncedSearch }),
    });
    const res = await fetch(`/api/groups?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data: PaginatedResponse = await res.json();
      setGroups(data.data ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
    }
    setLoading(false);
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Reset page on new search
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý lớp học</h1>
          <p className="mt-1 text-sm text-gray-500">
            {total} lớp học
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Tạo lớp mới
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Tìm kiếm tên, mã lớp..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
          <BookOpen className="w-12 h-12" />
          <p className="text-sm">Chưa có lớp học nào</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map((g) => {
              const status = getStatus(g);
              return (
                <Link
                  key={g.id}
                  href={`/admin/classes/${g.id}`}
                  className="group bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 truncate transition-colors">
                        {g.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">{g.code}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="truncate">{g.instructor?.fullName ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>{g.semester}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>{formatDate(g.startDate)} – {formatDate(g.endDate)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>
                        {g._count.students}
                        <span className="text-gray-400">/{g.maxStudents}</span>
                        {' '}sinh viên
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-2 border-t border-gray-100">
                    <span className="text-xs font-medium text-indigo-600 group-hover:text-indigo-700 inline-flex items-center gap-1">
                      Xem chi tiết
                      <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-sm"
              >
                Trước
              </Button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-sm"
              >
                Sau
              </Button>
            </div>
          )}
        </>
      )}

      {showCreate && (
        <CreateClassModal
          onClose={() => setShowCreate(false)}
          onDone={() => {
            setShowCreate(false);
            fetchGroups();
          }}
        />
      )}
    </div>
  );
}
