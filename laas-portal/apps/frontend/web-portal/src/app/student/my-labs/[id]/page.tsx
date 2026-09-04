'use client';

import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  ChevronRight,
  Clock,
  History,
  Play,
  RotateCcw,
} from 'lucide-react';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { StudentLayout } from '@laas-portal/ui';

import { ensureValidToken, getStoredUser } from '../../../../lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  difficulty?: string;
  tags?: string[];
  metadata?: any;
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

function readEnrolled(): EnrolledEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(getEnrolledKey());
    return raw ? (JSON.parse(raw) as EnrolledEntry[]) : [];
  } catch {
    return [];
  }
}

function updateLastModule(labTemplateId: string, moduleId: string) {
  try {
    const entries = readEnrolled();
    const idx = entries.findIndex((e) => e.labTemplateId === labTemplateId);
    if (idx >= 0) {
      entries[idx].lastModuleId = moduleId;
      localStorage.setItem(getEnrolledKey(), JSON.stringify(entries));
    }
  } catch {
    // ignore
  }
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

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

const DIFFICULTY_DOT: Record<string, string> = {
  Beginner: 'bg-green-500',
  Intermediate: 'bg-yellow-500',
  Advanced: 'bg-red-500',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyLabDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classLabId = searchParams.get('classLabId') ?? '';
  const groupId = searchParams.get('groupId') ?? '';

  const { id } = useParams<{ id: string }>();
  const labId = Array.isArray(id) ? id[0] : id;

  const [lab, setLab] = useState<LabTemplate | null>(null);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [sessions, setSessions] = useState<SessionHistoryItem[]>([]);
  const [grade, setGrade] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enrolledEntry, setEnrolledEntry] = useState<EnrolledEntry | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!labId) return;

    const entry = readEnrolled().find((e) => e.labTemplateId === labId) ?? null;
    setEnrolledEntry(entry);

    void (async () => {
      try {
        const token = await ensureValidToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        const [labRes, modRes] = await Promise.all([
          fetch(`/api/lab-templates/${labId}`, { cache: 'no-store', headers }),
          fetch(`/api/lab-templates/${labId}/modules`, { cache: 'no-store', headers }),
        ]);

        const labJson = (await labRes.json()) as { success?: boolean; data?: LabTemplate; message?: string };
        if (!labRes.ok || !labJson.success || !labJson.data) {
          throw new Error(labJson.message ?? 'Không thể tải thông tin lab');
        }
        setLab(labJson.data);

        const modJson = (await modRes.json()) as { success?: boolean; data?: ModuleItem[] };
        if (modRes.ok && modJson.success && Array.isArray(modJson.data)) {
          setModules(modJson.data.slice().sort((a, b) => a.orderNo - b.orderNo));
        }

        const currentUserId = getStoredUser()?.id;

        // Fetch session history for this lab
        if (currentUserId && labId) {
          try {
            const sessRes = await fetch(
              `/api/sessions?userId=${encodeURIComponent(currentUserId)}&limit=200`,
              {
                cache: 'no-store',
                headers,
              }
            );
            if (sessRes.ok) {
              const sessJson = await sessRes.json();
              if (sessJson?.success && Array.isArray(sessJson?.data)) {
                const moduleIds = new Set((modJson.data || []).map((m: any) => m.id));
                const labSessions = sessJson.data.filter(
                  (s: any) =>
                    s.module?.labTemplateId === labId ||
                    s.module?.labTemplate?.id === labId ||
                    (s.moduleId && moduleIds.has(s.moduleId))
                );
                setSessions(labSessions);
              }
            }
          } catch {}
        }

        // Auto-resolve classLabId & groupId if not provided in searchParams
        let effectiveClassLabId = classLabId;
        if (!effectiveClassLabId && labId) {
          try {
            const clRes = await fetch(`/api/class-labs/by-lab/${labId}`, {
              cache: 'no-store',
              headers,
            });
            if (clRes.ok) {
              const clJson = await clRes.json();
              if (clJson.success && Array.isArray(clJson.data) && clJson.data.length > 0) {
                const first = clJson.data[0];
                if (first?.id) {
                  effectiveClassLabId = first.id;
                }
              }
            }
          } catch {}
        }

        // Fetch student grade if classLabId is present
        const resolvedClId = effectiveClassLabId || classLabId;
        if (resolvedClId && currentUserId) {
          try {
            const gradeRes = await fetch(`/api/grades/student/${currentUserId}/class-lab/${resolvedClId}`, {
              cache: 'no-store',
              headers,
            });
            if (gradeRes.ok) {
              const gradeJson = await gradeRes.json();
              if (gradeJson.success && gradeJson.data) {
                setGrade(gradeJson.data);
              }
            }
          } catch {}
        }

        // If paid lab, check billing check endpoint
        if (labJson.data.metadata?.pricingType === 'PAID' && currentUserId) {
          const checkRes = await fetch(`/api/billing/payments/check?userId=${currentUserId}&labTemplateId=${labId}`, {
            cache: 'no-store',
            headers,
          });
          const checkJson = await checkRes.json();
          if (checkRes.ok && checkJson.success && !checkJson.purchased) {
            setShowPaymentModal(true);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu');
      } finally {
        setLoading(false);
      }
    })();
  }, [labId, classLabId, groupId]);

  const handleStartModule = async (moduleId: string) => {
    if (!labId) return;
    updateLastModule(labId, moduleId);
    setEnrolledEntry((prev) => prev ? { ...prev, lastModuleId: moduleId } : prev);

    let clId = classLabId;
    let gId = groupId;
    if (!clId) {
      try {
        const token = await ensureValidToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const clRes = await fetch(`/api/class-labs/by-lab/${labId}`, { headers });
        if (clRes.ok) {
          const clJson = await clRes.json();
          if (clJson.success && Array.isArray(clJson.data) && clJson.data.length > 0) {
            clId = clJson.data[0]?.id || '';
            gId = clJson.data[0]?.groupId || '';
          }
        }
      } catch {}
    }

    const classLabParam = clId ? `&classLabId=${clId}` : '';
    const groupParam = gId ? `&groupId=${gId}` : '';
    router.push(`/student/my-labs/${labId}/practice?moduleId=${moduleId}${classLabParam}${groupParam}`);
  };

  const handlePayment = async () => {
    setPaying(true);
    try {
      const token = await ensureValidToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/billing/payments', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: getStoredUser()?.id || 'anonymous',
          userEmail: getStoredUser()?.email || 'student@laas.local',
          labTemplateId: labId,
          labName: lab?.name || 'Lab Template',
          amount: lab?.metadata?.finalPrice || lab?.metadata?.price || 0,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setShowPaymentModal(false);
      } else {
        alert(json.message || 'Thanh toán thất bại, vui lòng thử lại.');
      }
    } catch (err) {
      alert('Đã xảy ra lỗi khi thanh toán.');
    } finally {
      setPaying(false);
    }
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
            <Link
              href={groupId ? `/student/classes/${groupId}` : '/student/my-labs'}
              className="text-orange-600 underline"
            >
              Quay lại lớp học
            </Link>
          </div>
        </div>
      </StudentLayout>
    );
  }

  const diffDot = DIFFICULTY_DOT[lab.difficulty ?? ''] ?? 'bg-gray-400';
  const totalMinutes = modules.reduce((sum, m) => sum + (m.estimatedMinutes ?? 0), 0);
  const lastModuleId = enrolledEntry?.lastModuleId;

  return (
    <StudentLayout>
      <div className="mx-auto max-w-4xl p-6 lg:p-8">
        {/* Back */}
        <Link
          href={groupId ? `/student/classes/${groupId}` : '/student/my-labs'}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {groupId ? 'Lớp học của tôi' : 'Lab của tôi'}
        </Link>

        {/* Lab header */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {lab.category && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {lab.category}
                  </span>
                )}
                {lab.difficulty && (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <span className={`inline-block h-2 w-2 rounded-full ${diffDot}`} />
                    {lab.difficulty}
                  </span>
                )}
              </div>

              <h1 className="mb-2 text-2xl font-bold text-gray-900">{lab.name}</h1>

              {lab.description && (
                <p className="mb-4 text-sm leading-relaxed text-gray-600">{lab.description}</p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  {modules.length} module
                </span>
                {totalMinutes > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {Math.round((totalMinutes / 60) * 10) / 10} giờ
                  </span>
                )}
                {enrolledEntry && (
                  <span className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Đã đăng ký {formatDate(enrolledEntry.enrolledAt)}
                  </span>
                )}
              </div>

              {lab.tags && lab.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {lab.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Module list */}
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Danh sách module</h2>

        {modules.length === 0 ? (
          <p className="text-sm text-gray-500">Lab này chưa có module nào.</p>
        ) : (
          <div className="space-y-3">
            {modules.map((mod) => {
              const isLastActive = mod.id === lastModuleId;
              const moduleCheckpoints = (mod as any).definitionJson?.checkpoints || [];
              const isCompleted = moduleCheckpoints.length > 0 && moduleCheckpoints.every((cp: any) => {
                const snapshot = grade?.checkpointSnapshots?.find((s: any) => s.checkpointId === cp.id);
                return snapshot?.status === 'COMPLETED';
              });

              return (
                <div
                  key={mod.id}
                  className={`rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
                    isLastActive && !isCompleted ? 'border-orange-300 ring-1 ring-orange-200' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Left */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          Module {mod.orderNo}
                        </span>
                        {isLastActive && !isCompleted && (
                          <span className="flex items-center gap-1 rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                            <RotateCcw className="h-3 w-3" />
                            Đang làm
                          </span>
                        )}
                        {isCompleted && (
                          <span className="flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                            <CheckCircle className="h-3 w-3" />
                            Đã hoàn thành
                          </span>
                        )}
                      </div>

                      <h3 className="mb-1 font-semibold text-gray-900">{mod.name}</h3>

                      {mod.description && (
                        <p className="mb-3 text-sm text-gray-500">{mod.description}</p>
                      )}

                      <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                        {mod.estimatedMinutes != null && mod.estimatedMinutes > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {mod.estimatedMinutes} phút
                          </span>
                        )}
                        {mod.objectives && mod.objectives.length > 0 && (
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3.5 w-3.5" />
                            {mod.objectives.length} mục tiêu
                          </span>
                        )}
                      </div>

                      {mod.objectives && mod.objectives.length > 0 && (
                        <ul className="mt-3 space-y-1">
                          {mod.objectives.map((obj, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                              <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-orange-400" />
                              {obj}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Action */}
                    {isCompleted ? (
                      <span className="flex shrink-0 items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700">
                        <CheckCircle className="h-4 w-4 text-green-600" />
                        Đã hoàn thành
                      </span>
                    ) : (
                      <button
                        onClick={() => handleStartModule(mod.id)}
                        className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all shadow-sm active:scale-[0.98] ${
                          isLastActive
                            ? 'bg-[#FF6900] hover:bg-[#E55E00] shadow-[#FF6900]/10 hover:shadow-md'
                            : 'bg-[#FF6900]/80 hover:bg-[#FF6900] shadow-sm hover:shadow-md'
                        }`}
                      >
                        <Play className="h-4 w-4" />
                        {isLastActive ? 'Tiếp tục' : 'Làm bài'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Practice History Section */}
        <div className="mt-10 border-t border-gray-200/70 pt-8">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-[#FF6900]" />
              <h2 className="text-lg font-bold text-gray-900">Lịch sử các phiên thực hành</h2>
            </div>
            {sessions.length > 0 && (
              <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-[#FF6900]">
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
      </div>
      {showPaymentModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center">
              {/* Payment Icon */}
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              <h3 className="text-lg font-bold text-slate-900">Yêu cầu thanh toán bài Lab</h3>
              <p className="mt-2 text-xs text-slate-500">
                Đây là bài lab trả phí. Để tiếp tục thực hành, vui lòng hoàn tất thanh toán.
              </p>
            </div>

            {/* Lab details & Cost */}
            <div className="my-5 rounded-xl bg-slate-50 p-4 border border-slate-100">
              <div className="flex justify-between text-xs text-slate-500 mb-2">
                <span>Tên bài Lab:</span>
                <span className="font-semibold text-slate-800 line-clamp-1 max-w-[200px]">{lab?.name}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500 mb-2">
                <span>Giá gốc:</span>
                <span className="font-medium text-slate-600">
                  {((lab?.metadata?.price || 0) as number).toLocaleString('vi-VN')} VNĐ
                </span>
              </div>
              {lab?.metadata?.discountPercent > 0 && (
                <div className="flex justify-between text-xs text-green-600 mb-2 font-medium">
                  <span>Giảm giá:</span>
                  <span>-{lab?.metadata?.discountPercent}%</span>
                </div>
              )}
              <div className="border-t border-slate-200/80 pt-2 flex justify-between text-sm font-semibold text-slate-900">
                <span>Tổng tiền:</span>
                <span className="text-orange-600 text-base font-bold">
                  {((lab?.metadata?.finalPrice || lab?.metadata?.price || 0) as number).toLocaleString('vi-VN')} VNĐ
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={handlePayment}
                disabled={paying}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 py-3 text-sm font-semibold text-white shadow transition-colors disabled:opacity-50"
              >
                {paying ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Đang xử lý...
                  </>
                ) : (
                  'Xác nhận Thanh toán'
                )}
              </button>
              <button
                onClick={() => router.push(groupId ? `/student/classes/${groupId}` : '/student/my-labs')}
                disabled={paying}
                className="w-full rounded-xl border border-slate-300 bg-white hover:bg-slate-50 py-2.5 text-sm font-medium text-slate-700 transition-colors disabled:opacity-50"
              >
                Quay lại
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentLayout>
  );
}
