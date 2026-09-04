'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Plus, Edit, Calendar, RefreshCw, X, Loader2, UserMinus, UserCheck } from 'lucide-react';
import { Button } from '@laas-portal/ui';
import { getAccessToken } from '../../../../lib/auth';

interface UserRow {
  id: string;
  email: string;
  username: string;
  fullName: string | null;
  systemRole: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
  status: 'ACTIVE' | 'DISABLED' | 'PENDING';
  createdAt: string;
  avatar: string | null;
}

interface UsersResponse {
  data: UserRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-red-50 text-red-600 border border-red-100/50 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  INSTRUCTOR: 'bg-purple-50 text-purple-600 border border-purple-100/50 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  STUDENT: 'bg-blue-50 text-blue-600 border border-blue-100/50 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-600 border border-emerald-100/50 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  DISABLED: 'bg-slate-50 text-slate-500 border border-slate-100/50 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  PENDING: 'bg-amber-50 text-amber-600 border border-amber-100/50 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
};

function initials(name: string | null, username: string) {
  const n = name || username;
  return n.slice(0, 2).toUpperCase();
}

export default function AdminUsersPage() {
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = getAccessToken();
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (roleFilter !== 'ALL') params.set('systemRole', roleFilter);

      const res = await fetch(`/api/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setResult(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-500">Manage system users, roles, and statuses</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchUsers} className="p-2 h-auto" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setShowCreateModal(true)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add User
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search users by name, email..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-primary focus:ring-4 focus:ring-primary/10 outline-none transition-all duration-200"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 bg-white rounded-xl text-sm px-4 py-2.5 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all duration-200 cursor-pointer"
        >
          <option value="ALL">All Roles</option>
          <option value="ADMIN">Admin</option>
          <option value="INSTRUCTOR">Instructor</option>
          <option value="STUDENT">Student</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 font-semibold text-gray-600">User Info</th>
                <th className="px-6 py-3 font-semibold text-gray-600">Role</th>
                <th className="px-6 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-6 py-3 font-semibold text-gray-600">Join Date</th>
                <th className="px-6 py-3 font-semibold text-gray-600 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">Loading...</td></tr>
              ) : !result?.data.length ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">No users found</td></tr>
              ) : (
                result.data.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                          {initials(user.fullName, user.username)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{user.fullName || user.username}</div>
                          <div className="text-gray-500 text-xs">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.systemRole] ?? 'bg-gray-100 text-gray-600'}`}>
                        {user.systemRole}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[user.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-600 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="outline"
                        onClick={() => setEditingUserId(user.id)}
                        className="p-2 h-auto text-blue-600 hover:text-blue-700 border-blue-200"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {result && result.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100 text-sm text-gray-600">
            <span>Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, result.total)} of {result.total}</span>
            <div className="flex gap-2">
              <Button variant="outline" className="px-3 py-1 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <Button variant="outline" className="px-3 py-1 text-xs" disabled={page >= result.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onDone={() => {
            setShowCreateModal(false);
            fetchUsers();
          }}
        />
      )}
      {editingUserId && (
        <EditUserModal
          userId={editingUserId}
          onClose={() => setEditingUserId(null)}
          onDone={() => {
            setEditingUserId(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

interface CreateUserModalProps {
  onClose: () => void;
  onDone: () => void;
}

function CreateUserModal({ onClose, onDone }: CreateUserModalProps) {
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    phone: '',
    studentCode: '',
    organization: '',
    department: '',
    systemRole: 'STUDENT',
    status: 'ACTIVE',
    initialPassword: '',
    adminNotes: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.email) {
      setError('Vui lòng nhập đầy đủ Username và Email.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const token = getAccessToken();
      const body: Record<string, unknown> = {
        fullName: form.fullName || undefined,
        username: form.username,
        email: form.email,
        phone: form.phone || undefined,
        studentCode: form.studentCode || undefined,
        organization: form.organization || undefined,
        department: form.department || undefined,
        systemRole: form.systemRole,
        status: form.status,
        adminNotes: form.adminNotes || undefined,
        initialPassword: form.initialPassword || undefined,
      };
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể tạo người dùng');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900] text-sm bg-white";

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Tạo người dùng mới</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Role & Status */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Vai trò & Trạng thái
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Vai trò hệ thống</label>
                <select value={form.systemRole} onChange={set('systemRole')} className={inputCls}>
                  <option value="STUDENT">Student</option>
                  <option value="INSTRUCTOR">Instructor</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Trạng thái ban đầu</label>
                <select value={form.status} onChange={set('status')} className={inputCls}>
                  <option value="ACTIVE">Active</option>
                  <option value="PENDING">Pending</option>
                </select>
              </div>
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Basic Info */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Thông tin cơ bản
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Row 1 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Họ và tên</label>
                <input type="text" value={form.fullName} onChange={set('fullName')} className={inputCls} placeholder="e.g. Nguyễn Văn A" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Email *</label>
                <input type="email" required value={form.email} onChange={set('email')} className={inputCls} placeholder="e.g. anguyen@example.com" />
              </div>

              {/* Row 2 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tên đăng nhập *</label>
                <input type="text" required value={form.username} onChange={set('username')} minLength={3} className={inputCls} placeholder="e.g. anguyen" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Mật khẩu khởi tạo</label>
                <input type="password" value={form.initialPassword} onChange={set('initialPassword')} minLength={8} className={inputCls} placeholder="••••••••" />
              </div>

              {/* Row 3 */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Số điện thoại</label>
                <input type="text" value={form.phone} onChange={set('phone')} className={inputCls} placeholder="e.g. 090..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tổ chức</label>
                <input type="text" value={form.organization} onChange={set('organization')} className={inputCls} />
              </div>

              {/* Row 4 */}
              {form.systemRole === 'STUDENT' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Mã số học viên</label>
                  <input type="text" value={form.studentCode} onChange={set('studentCode')} className={inputCls} placeholder="e.g. 22127300" />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white pt-4 pb-1 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
            <Button type="button" variant="outline" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Tạo người dùng'}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

interface EditUserModalProps {
  userId: string;
  onClose: () => void;
  onDone: () => void;
}

interface UserDetail {
  id: string;
  email: string;
  username: string;
  fullName: string | null;
  phone: string | null;
  systemRole: string;
  status: string;
  studentCode: string | null;
  organization: string | null;
  department: string | null;
  adminNotes: string | null;
}

function EditUserModal({ userId, onClose, onDone }: EditUserModalProps) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    studentCode: '',
    organization: '',
    department: '',
    systemRole: 'STUDENT',
    status: 'ACTIVE',
    adminNotes: '',
  });

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    const token = getAccessToken();
    setLoading(true);
    setError('');
    fetch(`/api/users/${userId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (!r.ok) throw new Error(`Server error ${r.status}`);
        return r.json();
      })
      .then((data: UserDetail) => {
        setUser(data);
        setForm({
          fullName: data.fullName ?? '',
          phone: data.phone ?? '',
          studentCode: data.studentCode ?? '',
          organization: data.organization ?? '',
          department: data.department ?? '',
          systemRole: data.systemRole,
          status: data.status,
          adminNotes: data.adminNotes ?? '',
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Không thể tải thông tin người dùng'))
      .finally(() => setLoading(false));
  }, [userId]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fullName: form.fullName || undefined,
          phone: form.phone || undefined,
          studentCode: form.studentCode || undefined,
          organization: form.organization || undefined,
          department: form.department || undefined,
          systemRole: form.systemRole,
          status: form.status,
          adminNotes: form.adminNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Error ${res.status}`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể lưu thay đổi');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async () => {
    if (!userId || !user) return;
    const newStatus = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const token = getAccessToken();
    const endpoint = newStatus === 'DISABLED' ? `/api/users/${userId}/lock` : `/api/users/${userId}/unlock`;
    setError('');
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Không thể thay đổi trạng thái tài khoản');
      setUser((u) => u ? { ...u, status: newStatus } : u);
      setForm((f) => ({ ...f, status: newStatus }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    }
  };

  const inputCls = "w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900] text-sm bg-white";

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Chỉnh sửa người dùng</h2>
            {user && <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center p-10">
            <Loader2 className="w-8 h-8 animate-spin text-[#FF6900]" />
          </div>
        ) : (
          <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-6">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Basic Info */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Thông tin cơ bản
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Họ và tên</label>
                  <input type="text" value={form.fullName} onChange={set('fullName')} className={inputCls} placeholder="e.g. Nguyễn Văn A" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Số điện thoại</label>
                  <input type="text" value={form.phone} onChange={set('phone')} className={inputCls} placeholder="e.g. 090..." />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Email (Không thể thay đổi)</label>
                  <input type="email" readOnly disabled value={user?.email ?? ''} className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-400 text-sm cursor-not-allowed outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Mã số học viên</label>
                  <input type="text" value={form.studentCode} onChange={set('studentCode')} className={inputCls} placeholder="e.g. 22127300" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tổ chức</label>
                  <input type="text" value={form.organization} onChange={set('organization')} className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Phòng ban / Khoa</label>
                  <input type="text" value={form.department} onChange={set('department')} className={inputCls} />
                </div>
              </div>
            </div>

            <hr className="border-gray-100" />

            {/* Role & Status */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Vai trò & Trạng thái
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Vai trò hệ thống</label>
                  <select value={form.systemRole} onChange={set('systemRole')} className={inputCls}>
                    <option value="STUDENT">Student</option>
                    <option value="INSTRUCTOR">Instructor</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Trạng thái</label>
                  <select value={form.status} onChange={set('status')} className={inputCls}>
                    <option value="ACTIVE">Active</option>
                    <option value="DISABLED">Disabled</option>
                    <option value="PENDING">Pending</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Ghi chú quản trị viên</label>
                  <textarea rows={2} value={form.adminNotes} onChange={set('adminNotes')} className="w-full px-4 py-2 border border-gray-300 rounded-lg outline-none focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900] text-sm bg-white" placeholder="Ghi chú nội bộ..." />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white pt-4 pb-1 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={toggleStatus}
                className={user?.status === 'ACTIVE'
                  ? 'text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 flex items-center gap-2 text-xs py-1.5'
                  : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 flex items-center gap-2 text-xs py-1.5'}
              >
                {user?.status === 'ACTIVE' ? (
                  <><UserMinus className="w-4 h-4" /> Suspend User</>
                ) : (
                  <><UserCheck className="w-4 h-4" /> Activate User</>
                )}
              </Button>

              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={onClose}>
                  Hủy
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Lưu thay đổi'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}

