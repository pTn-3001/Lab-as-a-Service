'use client';

import { BookOpen, CheckCircle, ChevronRight, Clock, Play, Trash2 } from 'lucide-react';

import React, { useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { StudentLayout } from '@laas-portal/ui';

import { ensureValidToken, getStoredUser } from '../../../lib/auth';
import { Dialog } from '../../../components/dialog';

// ─── Constants ────────────────────────────────────────────────────────────────

const STUDENT_ID = getStoredUser()?.id ?? 'anonymous';
const ENROLLED_KEY = `laas_enrolled_${STUDENT_ID}`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EnrolledEntry {
  labTemplateId: string;
  enrolledAt: string;
  lastModuleId?: string;
}

interface LabTemplate {
  id: string;
  name: string;
  description?: string;
  category?: string;
  difficulty?: string;
  accessType?: string;
  tags?: string[];
  moduleCount?: number;
}

interface LabWithMeta {
  entry: EnrolledEntry;
  lab: LabTemplate | null;
  loading: boolean;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function readEnrolled(): EnrolledEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(ENROLLED_KEY);
    return raw ? (JSON.parse(raw) as EnrolledEntry[]) : [];
  } catch {
    return [];
  }
}

function writeEnrolled(entries: EnrolledEntry[]) {
  try {
    localStorage.setItem(ENROLLED_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
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

const DIFFICULTY_DOT: Record<string, string> = {
  Beginner: 'bg-green-500',
  Intermediate: 'bg-yellow-500',
  Advanced: 'bg-red-500',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyLabsPage() {
  const router = useRouter();
  const [items, setItems] = useState<LabWithMeta[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
    const entries = readEnrolled();

    if (entries.length === 0) {
      setItems([]);
      return;
    }

    // Initialise with loading state
    setItems(entries.map((entry) => ({ entry, lab: null, loading: true })));

    // Fetch lab details concurrently
    void (async () => {
      const token = await ensureValidToken();
      entries.forEach((entry, idx) => {
        fetch(`/api/lab-templates/${entry.labTemplateId}`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
          .then((r) => r.json())
          .then((json: { success?: boolean; data?: LabTemplate }) => {
            setItems((prev) => {
              const next = [...prev];
              next[idx] = {
                entry,
                lab: json.success && json.data ? json.data : null,
                loading: false,
              };
              return next;
            });
          })
          .catch(() => {
            setItems((prev) => {
              const next = [...prev];
              next[idx] = { entry, lab: null, loading: false };
              return next;
            });
          });
      });
    })();
  }, []);

  const handleRemove = (labTemplateId: string) => {
    setRemoveTarget(labTemplateId);
  };

  const executeRemove = () => {
    if (!removeTarget) return;
    const targetEntry = readEnrolled().find((e) => e.labTemplateId === removeTarget);

    // Remove from UI and enrolled list immediately
    const updated = readEnrolled().filter((e) => e.labTemplateId !== removeTarget);
    writeEnrolled(updated);
    setItems((prev) => prev.filter((i) => i.entry.labTemplateId !== removeTarget));
    setRemoveTarget(null);

    // Fire-and-forget: stop the active session so re-launch creates a fresh stack
    if (targetEntry?.lastModuleId) {
      const moduleId = targetEntry.lastModuleId;
      const sessionKey = `lab_session:${moduleId}`;
      void (async () => {
        // 1. Find the session ID — localStorage first, then API
        let sessionIdToStop = localStorage.getItem(sessionKey);
        if (!sessionIdToStop) {
          try {
            const user = getStoredUser();
            const token = await ensureValidToken();
            const res = await fetch(
              `/api/sessions/active?userId=${encodeURIComponent(user?.id ?? '')}&moduleId=${encodeURIComponent(moduleId)}`,
              { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} },
            );
            const json = (await res.json()) as { success?: boolean; data?: { id: string } | null };
            if (json.success && json.data?.id) sessionIdToStop = json.data.id;
          } catch { /* ignore */ }
        }
        // 2. Stop the session in the backend
        if (sessionIdToStop) {
          try {
            const token = await ensureValidToken();
            await fetch(`/api/sessions/${encodeURIComponent(sessionIdToStop)}/stop`, {
              method: 'POST',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
          } catch { /* ignore */ }
        }
        // 3. Always clear localStorage regardless of API result
        localStorage.removeItem(sessionKey);
      })();
    }
  };

  const handleContinue = (item: LabWithMeta) => {
    const { entry } = item;
    if (entry.lastModuleId) {
      router.push(
        `/student/my-labs/${entry.labTemplateId}/practice?moduleId=${entry.lastModuleId}`
      );
    } else {
      router.push(`/student/my-labs/${entry.labTemplateId}`);
    }
  };

  if (!isClient) return null;

  const stats = {
    total: items.length,
    withModule: items.filter((i) => Boolean(i.entry.lastModuleId)).length,
  };

  return (
    <StudentLayout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="mb-1 text-2xl font-bold text-gray-900">Lab của tôi</h1>
          <p className="text-sm text-gray-500">Các lab bạn đã đăng ký học</p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1 text-sm text-gray-500">Tổng số lab</p>
                <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100">
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1 text-sm text-gray-500">Đang thực hành</p>
                <p className="text-3xl font-bold text-gray-900">{stats.withModule}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-100">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1 text-sm text-gray-500">Hoàn thành</p>
                <p className="text-3xl font-bold text-gray-900">0</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Empty state */}
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Play className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Chưa có lab nào</h3>
            <p className="mb-6 text-sm text-gray-500">
              Bắt đầu học bằng cách chọn một lab từ danh sách
            </p>
            <Link
              href="/student/labs"
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-orange-600"
            >
              Khám phá lab
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        )}

        {/* Lab list */}
        <div className="space-y-4">
          {items.map((item) => {
            const { entry, lab, loading } = item;
            const diffDot = DIFFICULTY_DOT[lab?.difficulty ?? ''] ?? 'bg-gray-400';

            return (
              <div
                key={entry.labTemplateId}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                {loading ? (
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 animate-pulse rounded-lg bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
                      <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200" />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-5">
                    {/* Icon / placeholder */}
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-900 to-blue-700 text-2xl text-white">
                      🖥
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        {lab?.category && (
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                            {lab.category}
                          </span>
                        )}
                        {lab?.difficulty && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <span className={`inline-block h-2 w-2 rounded-full ${diffDot}`} />
                            {lab.difficulty}
                          </span>
                        )}
                      </div>

                      <h3 className="mb-1 font-semibold text-gray-900">
                        <Link
                          href={`/student/my-labs/${entry.labTemplateId}`}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {lab?.name ?? entry.labTemplateId}
                        </Link>
                      </h3>

                      {lab?.description && (
                        <p className="mb-3 line-clamp-2 text-sm text-gray-500">
                          {lab.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs text-gray-400">
                          Đăng ký: {formatDate(entry.enrolledAt)}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRemove(entry.labTemplateId)}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Xóa khỏi danh sách"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <Link
                            href={`/student/my-labs/${entry.labTemplateId}`}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Chi tiết
                          </Link>
                          <button
                            onClick={() => handleContinue(item)}
                            className="flex items-center gap-1.5 rounded-lg bg-[#FF6900] px-4 py-1.5 text-sm font-medium text-white transition-all shadow-sm hover:shadow-md hover:bg-[#E55E00] active:scale-[0.98]"
                          >
                            {entry.lastModuleId ? 'Tiếp tục' : 'Bắt đầu'}
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Dialog
        open={removeTarget !== null}
        title="Xóa lab khỏi danh sách"
        description="Bạn có chắc muốn xóa lab này khỏi danh sách của mình không?"
        onClose={() => setRemoveTarget(null)}
        actions={[
          { label: 'Hủy', onClick: () => setRemoveTarget(null), variant: 'ghost' },
          { label: 'Xóa', onClick: executeRemove, variant: 'danger' },
        ]}
      />
    </StudentLayout>
  );
}
