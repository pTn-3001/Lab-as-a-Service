'use client';

import {
  BookOpen,
  CheckCircle,
  ChevronLeft,
  Clock,
  History,
  Lock,
  PlayCircle,
  Tag,
} from 'lucide-react';

import React, { useEffect, useState } from 'react';

import Link from 'next/link';
import { getStoredUser } from '../../../../lib/auth';
import { useParams, useRouter } from 'next/navigation';

import { Badge, Button, StudentLayout } from '@laas-portal/ui';

// ─── Constants ────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabTemplate {
  id: string;
  code: string;
  name: string;
  description?: string;
  category?: string;
  difficulty?: string;
  accessType?: 'PUBLIC' | 'RESTRICTED';
  tags?: string[];
  status?: string;
  moduleCount?: number;
}

interface ModuleItem {
  id: string;
  name: string;
  description?: string;
  orderNo: number;
  estimatedMinutes?: number;
  objectives?: string[];
}

interface SessionHistoryItem {
  id: string;
  moduleId?: string;
  module?: {
    id: string;
    name: string;
    orderNo: number;
    labTemplate?: { id: string; name: string };
  };
  status: string;
  startedAt?: string;
  endedAt?: string;
  CheckpointProgress?: Array<{
    id: string;
    checkpointId: string;
    status: string;
    completedAt?: string;
  }>;
}

interface EnrolledEntry {
  labTemplateId: string;
  enrolledAt: string;
  lastModuleId?: string;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function getEnrolledKey(): string {
  const userId = getStoredUser()?.id ?? 'anonymous';
  return `laas_enrolled_${userId}`;
}

function getEnrolled(): EnrolledEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(getEnrolledKey());
    return raw ? (JSON.parse(raw) as EnrolledEntry[]) : [];
  } catch {
    return [];
  }
}

function saveEnrolled(entries: EnrolledEntry[]) {
  try {
    localStorage.setItem(getEnrolledKey(), JSON.stringify(entries));
  } catch {
    // ignore
  }
}

function isEnrolled(labTemplateId: string): boolean {
  return getEnrolled().some((e) => e.labTemplateId === labTemplateId);
}

function enroll(labTemplateId: string, firstModuleId?: string) {
  const existing = getEnrolled();
  if (existing.some((e) => e.labTemplateId === labTemplateId)) return;
  saveEnrolled([
    ...existing,
    {
      labTemplateId,
      enrolledAt: new Date().toISOString(),
      lastModuleId: firstModuleId,
    },
  ]);
}

// ─── Difficulty badge colors ──────────────────────────────────────────────────

const DIFFICULTY_COLOR: Record<string, string> = {
  Beginner: 'bg-green-100 text-green-700',
  Intermediate: 'bg-yellow-100 text-yellow-700',
  Advanced: 'bg-red-100 text-red-700',
};

function formatDuration(startStr?: string, endStr?: string) {
  if (!startStr) return '—';
  const start = new Date(startStr).getTime();
  const end = endStr ? new Date(endStr).getTime() : Date.now();
  const diffMinutes = Math.max(1, Math.round((end - start) / 60000));
  if (diffMinutes < 60) return `${diffMinutes} phút`;
  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  return `${hours} giờ ${mins > 0 ? `${mins} phút` : ''}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LabDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const labId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [lab, setLab] = useState<LabTemplate | null>(null);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enrolled, setEnrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<'modules' | 'overview'>('modules');

  useEffect(() => {
    if (!labId) return;

    setEnrolled(isEnrolled(labId));

    async function load() {
      try {
        const userId = getStoredUser()?.id ?? '';
        const [labRes, modRes, sessRes] = await Promise.all([
          fetch(`/api/lab-templates/${labId}`, { cache: 'no-store' }),
          fetch(`/api/lab-templates/${labId}/modules`, { cache: 'no-store' }),
          userId ? fetch(`/api/sessions?userId=${encodeURIComponent(userId)}&labTemplateId=${encodeURIComponent(labId)}`, { cache: 'no-store' }).catch(() => null) : null,
        ]);

        const labJson = (await labRes.json()) as {
          success?: boolean;
          data?: LabTemplate;
          message?: string;
        };
        if (!labRes.ok || !labJson.success || !labJson.data) {
          throw new Error(labJson.message ?? 'Không thể tải thông tin lab');
        }
        setLab(labJson.data);

        const modJson = (await modRes.json()) as {
          success?: boolean;
          data?: ModuleItem[];
          message?: string;
        };
        if (modRes.ok && modJson.success && Array.isArray(modJson.data)) {
          setModules(modJson.data.slice().sort((a, b) => a.orderNo - b.orderNo));
        }

        if (sessRes && sessRes.ok) {
          const sessJson = await sessRes.json().catch(() => null);
          if (sessJson?.success && Array.isArray(sessJson.data)) {
            setSessions(sessJson.data);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [labId]);

  const handleStartLab = () => {
    if (!labId) return;
    const firstModule = modules[0];
    enroll(labId, firstModule?.id);
    setEnrolled(true);
    router.push('/student/my-labs');
  };

  const handleStartModule = (moduleId: string) => {
    if (!labId) return;
    // Update lastModuleId in enrollment
    const existing = getEnrolled();
    const idx = existing.findIndex((e) => e.labTemplateId === labId);
    if (idx >= 0) {
      existing[idx].lastModuleId = moduleId;
      saveEnrolled(existing);
    } else {
      enroll(labId, moduleId);
    }
    setEnrolled(true);
    router.push(`/student/my-labs/${labId}/practice?moduleId=${moduleId}`);
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-orange-500" />
        </div>
      </StudentLayout>
    );
  }

  if (error || !lab) {
    return (
      <StudentLayout>
        <div className="p-6 text-center text-sm text-red-600">
          {error || 'Không tìm thấy lab'}
          <div className="mt-4">
            <Link href="/student/labs" className="text-orange-600 underline">
              Quay lại danh sách lab
            </Link>
          </div>
        </div>
      </StudentLayout>
    );
  }

  const difficultyClass = DIFFICULTY_COLOR[lab.difficulty ?? ''] ?? 'bg-gray-100 text-gray-700';
  const totalMinutes = modules.reduce((sum, m) => sum + (m.estimatedMinutes ?? 0), 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

  return (
    <StudentLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Hero */}
        <div className="bg-[#10B981] text-white">
          <div className="mx-auto max-w-7xl px-6 py-6 lg:py-8">
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-3">
              {/* Left */}
              <div className="space-y-4 lg:col-span-2">
                <Link
                  href="/student/labs"
                  className="inline-flex items-center text-white/90 transition-colors hover:text-white"
                >
                  <ChevronLeft className="mr-1 h-5 w-5" />
                  <span className="font-medium">Quay lại danh sách lab</span>
                </Link>

                <div className="flex flex-wrap gap-2">
                  {lab.category && (
                    <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-medium text-white">
                      {lab.category}
                    </span>
                  )}
                  {lab.difficulty && (
                    <span className={`rounded-full px-3 py-1 text-sm font-medium ${difficultyClass}`}>
                      {lab.difficulty}
                    </span>
                  )}
                  {lab.accessType === 'RESTRICTED' && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/90 px-3 py-1 text-sm font-medium text-white">
                      <Lock className="h-3.5 w-3.5" /> Restricted
                    </span>
                  )}
                </div>

                <div>
                  <h1 className="mb-3 text-3xl font-bold lg:text-4xl">{lab.name}</h1>
                  {lab.description && (
                    <p className="max-w-2xl text-lg leading-relaxed text-white/90">
                      {lab.description}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-6 text-sm font-medium text-white/90">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    <span>{modules.length} module</span>
                  </div>
                  {totalMinutes > 0 && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      <span>{totalHours} giờ</span>
                    </div>
                  )}
                  {lab.tags && lab.tags.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Tag className="h-5 w-5" />
                      <span>{lab.tags.slice(0, 3).join(', ')}</span>
                    </div>
                  )}
                </div>

                {enrolled && (
                  <div className="flex items-center gap-2 text-sm text-white/90">
                    <CheckCircle className="h-4 w-4 text-white" />
                    Bạn đã đăng ký lab này
                  </div>
                )}
              </div>

              {/* Right card */}
              <div className="hidden lg:block">
                <div className="overflow-hidden rounded-xl bg-white shadow-xl">
                  <div className="relative flex aspect-video items-center justify-center bg-[#091E42]">
                    <img
                      src="https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&q=80&w=600&h=400"
                      alt={lab.name}
                      className="h-full w-full object-cover opacity-70"
                    />
                  </div>
                  <div className="p-6">
                    {enrolled ? (
                      <Button
                        onClick={() => router.push('/student/my-labs')}
                        className="h-12 w-full bg-orange-500 text-lg font-bold text-white hover:bg-orange-600"
                      >
                        <PlayCircle className="mr-2 h-6 w-6" />
                        Tiếp tục học
                      </Button>
                    ) : (
                      <Button
                        onClick={handleStartLab}
                        className="h-12 w-full bg-orange-500 text-lg font-bold text-white hover:bg-orange-600"
                      >
                        <PlayCircle className="mr-2 h-6 w-6" />
                        Bắt đầu lab
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="mx-auto max-w-7xl px-6 py-8">
          {/* Tabs */}
          <div className="mb-8 flex gap-2">
            {(['modules', 'overview'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'border border-gray-200 bg-white text-gray-900 shadow-sm'
                    : 'bg-transparent text-gray-500 hover:bg-gray-100'
                }`}
              >
                {tab === 'modules' ? 'Modules' : 'Tổng quan'}
              </button>
            ))}
          </div>

          {activeTab === 'modules' && (
            <>
              <div className="space-y-4">
                {modules.length === 0 && (
                  <p className="text-sm text-gray-500">Lab này chưa có module nào.</p>
                )}
                {modules.map((mod) => (
                  <div
                    key={mod.id}
                    className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-md"
                    onClick={() => handleStartModule(mod.id)}
                  >
                    <div className="absolute right-6 top-6">
                      <Badge
                        variant="outline"
                        className="border-gray-200 bg-gray-50 text-gray-500"
                      >
                        Module {mod.orderNo}
                      </Badge>
                    </div>

                    <h3 className="mb-2 pr-24 text-lg font-bold text-gray-900 transition-colors group-hover:text-green-600">
                      Module {mod.orderNo}: {mod.name}
                    </h3>

                    {mod.description && (
                      <p className="mb-4 text-gray-600">{mod.description}</p>
                    )}

                    <div className="flex items-center gap-6 text-sm text-gray-500">
                      {mod.estimatedMinutes != null && mod.estimatedMinutes > 0 && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span>{mod.estimatedMinutes} phút</span>
                        </div>
                      )}
                      {mod.objectives && mod.objectives.length > 0 && (
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-4 w-4" />
                          <span>{mod.objectives.length} mục tiêu</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Practice History Section */}
              <div className="mt-10 border-t border-gray-200/70 pt-8">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-5 w-5 text-orange-600" />
                    <h2 className="text-lg font-bold text-gray-900">Lịch sử các phiên thực hành</h2>
                  </div>
                  {sessions.length > 0 && (
                    <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-600">
                      {sessions.length} phiên đã ghi nhận
                    </span>
                  )}
                </div>

                {sessions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-6 text-center text-sm text-gray-500">
                    <History className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    Chưa có phiên thực hành nào được ghi nhận cho bài lab này.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                          <tr>
                            <th className="px-4 py-3">Bài Lab</th>
                            <th className="px-4 py-3">Module</th>
                            <th className="px-4 py-3">Thời gian bắt đầu</th>
                            <th className="px-4 py-3">Thời lượng</th>
                            <th className="px-4 py-3">Checkpoints</th>
                            <th className="px-4 py-3 text-right">Trạng thái / Kết quả</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {sessions.map((s) => {
                            const completedCps = (s.CheckpointProgress || []).filter((cp) => cp.status === 'COMPLETED').length;
                            const totalCps = (s.CheckpointProgress || []).length;
                            const durationStr = s.startedAt && s.endedAt
                              ? formatDuration(s.startedAt, s.endedAt)
                              : s.status === 'RUNNING'
                              ? 'Đang thực hiện'
                              : 'Không xác định';

                            return (
                              <tr key={s.id} className="hover:bg-gray-50/70 transition-colors">
                                <td className="px-4 py-3 font-medium text-gray-900">
                                  {s.module?.labTemplate?.name || lab?.name || 'Lab'}
                                </td>
                                <td className="px-4 py-3 text-gray-700">
                                  {s.module ? `Module ${s.module.orderNo}: ${s.module.name}` : 'Toàn bài'}
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                  {s.startedAt ? new Date(s.startedAt).toLocaleString('vi-VN') : '—'}
                                </td>
                                <td className="px-4 py-3 text-gray-600 text-xs">
                                  {durationStr}
                                </td>
                                <td className="px-4 py-3">
                                  {totalCps > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700">
                                      <span className={completedCps === totalCps ? 'text-green-600 font-bold' : 'text-orange-600 font-bold'}>
                                        {completedCps}/{totalCps}
                                      </span>
                                      đạt
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                      s.status === 'RUNNING'
                                        ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                                        : s.status === 'STOPPED'
                                        ? totalCps > 0 && completedCps === totalCps
                                          ? 'bg-green-50 text-green-700 border border-green-200/60'
                                          : 'bg-gray-100 text-gray-700'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                    }`}
                                  >
                                    {s.status === 'RUNNING'
                                      ? 'Đang chạy'
                                      : s.status === 'STOPPED'
                                      ? (totalCps > 0 && completedCps === totalCps ? 'Hoàn thành' : 'Đã dừng')
                                      : s.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'overview' && (
            <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
              <h2 className="text-lg font-semibold text-gray-900">Thông tin lab</h2>
              {lab.description && <p className="text-gray-600">{lab.description}</p>}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Danh mục: </span>
                  <span className="font-medium text-gray-900">{lab.category ?? '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Độ khó: </span>
                  <span className="font-medium text-gray-900">{lab.difficulty ?? '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Số module: </span>
                  <span className="font-medium text-gray-900">{modules.length}</span>
                </div>
                <div>
                  <span className="text-gray-500">Tổng thời gian: </span>
                  <span className="font-medium text-gray-900">
                    {totalMinutes > 0 ? `${totalHours} giờ` : '—'}
                  </span>
                </div>
              </div>
              {lab.tags && lab.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {lab.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Mobile CTA */}
          <div className="mt-8 lg:hidden">
            {enrolled ? (
              <Button
                onClick={() => router.push('/student/my-labs')}
                className="h-12 w-full bg-orange-500 text-lg font-bold text-white hover:bg-orange-600"
              >
                <PlayCircle className="mr-2 h-6 w-6" />
                Tiếp tục học
              </Button>
            ) : (
              <Button
                onClick={handleStartLab}
                className="h-12 w-full bg-orange-500 text-lg font-bold text-white hover:bg-orange-600"
              >
                <PlayCircle className="mr-2 h-6 w-6" />
                Bắt đầu lab
              </Button>
            )}
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
