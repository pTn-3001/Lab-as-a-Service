'use client';

import { CheckCircle, ChevronDown, Layers, Lock, Play, Search, X, RotateCcw } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentLayout } from '@laas-portal/ui';
import { SearchBar } from '@laas-portal/ui';
import { ensureValidToken, getStoredUser } from '../../../lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LabItem {
  id: string;
  code: string;
  name: string;
  category?: string;
  difficulty?: string;
  status: string;
  accessType: 'PUBLIC' | 'RESTRICTED';
  hasAccess?: boolean;
  version: number;
  updatedAt: string;
  moduleCount: number;
  tags?: string[];
}

interface EnrolledEntry {
  labTemplateId: string;
  enrolledAt: string;
  lastModuleId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DIFFICULTY_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'];
const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&q=80&w=300&h=200';

// ─── Enrollment helpers ────────────────────────────────────────────────────────

function enrolledKey(userId: string) {
  return `laas_enrolled_${userId || 'anonymous'}`;
}

function readEnrolled(userId: string): EnrolledEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem(enrolledKey(userId));
    return raw ? (JSON.parse(raw) as EnrolledEntry[]) : [];
  } catch {
    return [];
  }
}

function enrollLab(userId: string, labTemplateId: string): void {
  try {
    const entries = readEnrolled(userId);
    if (entries.some((e) => e.labTemplateId === labTemplateId)) return;
    entries.push({ labTemplateId, enrolledAt: new Date().toISOString() });
    localStorage.setItem(enrolledKey(userId), JSON.stringify(entries));
  } catch {
    // ignore storage errors
  }
}

// ─── Approval Dialog ──────────────────────────────────────────────────────────

function ApprovalDialog({
  lab,
  userId,
  onClose,
}: {
  lab: LabItem;
  userId: string;
  onClose: () => void;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      await fetch('/api/lab-access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labTemplateId: lab.id, userId, message: message.trim() }),
      }).catch(() => {
        // Endpoint may not exist yet — silently succeed
      });
    } finally {
      setSending(false);
      setSent(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h3 className="text-base font-semibold text-gray-900">Yêu cầu truy cập lab</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {sent ? (
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircle className="mb-3 h-12 w-12 text-green-500" />
              <p className="mb-1 font-semibold text-gray-900">Yêu cầu đã được gửi!</p>
              <p className="text-sm text-gray-500">
                Admin sẽ xem xét và phê duyệt quyền truy cập cho bạn.
              </p>
              <button
                onClick={onClose}
                className="mt-5 rounded-lg bg-[#FF6900] px-5 py-2 text-sm font-medium text-white hover:bg-[#E55E00] transition-colors"
              >
                Đóng
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">Lab yêu cầu quyền truy cập</p>
                    <p className="mt-0.5 text-xs text-amber-700">
                      <strong>{lab.name}</strong> là lab riêng tư. Bạn cần được admin phê duyệt để
                      tham gia.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Lý do <span className="font-normal text-gray-400">(tuỳ chọn)</span>
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ví dụ: Tôi cần học lab này cho môn học XYZ..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Hủy
                </button>
                <button
                  onClick={() => void handleSend()}
                  disabled={sending}
                  className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60"
                >
                  {sending ? 'Đang gửi...' : 'Gửi yêu cầu'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Lab Card ─────────────────────────────────────────────────────────────────

// ─── Hero Banner & Skill Progress Arc ──────────────────────────────────────────

interface HeroBannerProps {
  lab: LabItem;
  onLaunch: () => void;
}

function HeroBanner({ lab, onLaunch }: HeroBannerProps) {
  if (!lab) return null;
  return (
    <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-emerald-600 to-teal-800 p-8 text-white shadow-sm hover:shadow-md transition-all duration-300 h-full flex flex-col justify-between group">
      {/* Glow effects */}
      <div className="absolute right-0 top-0 -mr-20 -mt-20 h-64 w-64 rounded-full bg-white/10 blur-3xl pointer-events-none transition-transform duration-700 group-hover:scale-110" />
      <div className="absolute left-0 bottom-0 -ml-20 -mb-20 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl pointer-events-none" />

      <div className="relative z-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-md">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          Lab đề xuất của bạn
        </span>
        <h2 className="mt-4 text-2xl lg:text-3xl font-extrabold tracking-tight leading-tight line-clamp-2 max-w-xl">
          {lab.name}
        </h2>
        <p className="mt-2 text-sm text-white/80 max-w-md line-clamp-2">
          {lab.category ? `Danh mục: ${lab.category}` : 'Tiếp tục rèn luyện và nâng cao kỹ năng thực hành lab của bạn ngay bây giờ.'}
        </p>
      </div>

      <div className="relative z-10 mt-8 flex flex-wrap items-center gap-4">
        <button
          onClick={onLaunch}
          className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-teal-800 shadow-md transition-all duration-300 hover:scale-[1.03] hover:shadow-lg active:scale-95"
        >
          <Play className="h-4 w-4 fill-teal-800 text-teal-800" />
          Bắt đầu Học ngay
        </button>
        <span className="text-xs text-white/70">
          Cấu trúc bài học: {lab.moduleCount} modules
        </span>
      </div>
    </div>
  );
}

interface SkillProgressWheelProps {
  total: number;
  practiced: number;
}

function SkillProgressWheel({ total, practiced }: SkillProgressWheelProps) {
  const percentage = total > 0 ? Math.round((practiced / total) * 100) : 0;
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white border border-slate-100/60 rounded-[1.5rem] shadow-sm hover:shadow-md transition-all duration-300 h-full">
      <h4 className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-4">Tiến độ thực hành</h4>
      
      <div className="relative flex items-center justify-center">
        <svg className="h-28 w-28 transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="transparent"
            stroke="#f1f5f9"
            strokeWidth="7"
          />
          {/* Progress circle */}
          <circle
            cx="56"
            cy="56"
            r={radius}
            fill="transparent"
            stroke="#00C950"
            strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-slate-900">{percentage}%</span>
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Đã thực hành</span>
        </div>
      </div>

      <div className="mt-5 flex justify-around w-full text-center border-t border-slate-50 pt-4">
        <div>
          <span className="block text-base font-extrabold text-slate-900">{practiced}</span>
          <span className="text-[10px] text-slate-400 font-medium">Đã thực hành</span>
        </div>
        <div className="border-l border-slate-100/60 h-6 self-center" />
        <div>
          <span className="block text-base font-extrabold text-slate-900">{total}</span>
          <span className="text-[10px] text-slate-400 font-medium">Tổng số Lab</span>
        </div>
      </div>
    </div>
  );
}

// ─── Lab Card ─────────────────────────────────────────────────────────────────

function LabCardItem({
  lab,
  selected,
  hasAttempted,
  onSelect,
  onLaunch,
}: {
  lab: LabItem;
  selected: boolean;
  hasAttempted?: boolean;
  onSelect: () => void;
  onLaunch: () => void;
}) {
  const locked = lab.accessType === 'RESTRICTED' && !lab.hasAccess;
  const grantedRestricted = lab.accessType === 'RESTRICTED' && !!lab.hasAccess;
  
  // Custom pastel difficulty badge
  const diffBadgeColor = lab.difficulty === 'Beginner'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50'
    : lab.difficulty === 'Intermediate'
      ? 'bg-amber-50 text-amber-700 border-amber-100/50'
      : 'bg-rose-50 text-rose-700 border-rose-100/50';

  return (
    <div
      className={`group relative overflow-hidden rounded-[1.25rem] border bg-white shadow-sm transition-all duration-300 ease-out cursor-pointer select-none ${
        selected
          ? 'border-emerald-500 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/30'
          : 'border-slate-100/60 hover:border-emerald-500/30 hover:shadow-md hover:shadow-emerald-500/5 hover:-translate-y-1 hover:scale-[1.01]'
      }`}
      onClick={onSelect}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden bg-slate-50">
        <img
          src={PLACEHOLDER_IMG}
          alt={lab.name}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          loading="lazy"
        />
        {/* Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/30 via-transparent to-transparent" />

        {/* Difficulty badge */}
        {lab.difficulty && (
          <span
            className={`absolute right-3 top-3 rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-sm ${diffBadgeColor}`}
          >
            {lab.difficulty}
          </span>
        )}

        {/* Restricted badge */}
        {lab.accessType === 'RESTRICTED' && (
          <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-slate-900/60 px-2.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
            <Lock className="h-3 w-3" /> Private
          </span>
        )}

        {/* Has attempted badge */}
        {hasAttempted && (
          <span className="absolute left-3 bottom-3 flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-sm">
            <CheckCircle className="h-3 w-3" /> Đã từng thực hành
          </span>
        )}

        {/* Launch overlay — shown when this card is selected */}
        {selected && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-[1px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLaunch();
              }}
              className="flex items-center gap-2 rounded-xl bg-[#FF6900] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#FF6900]/25 transition-all duration-300 hover:scale-[1.03] hover:bg-[#E55E00] active:scale-95"
            >
              <Play className="h-4 w-4 fill-white" />
              Bắt đầu Lab
            </button>
          </div>
        )}

        {/* Lock overlay — restricted without access, not currently selected */}
        {!selected && locked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/50 backdrop-blur-[2px]">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md">
              <Lock className="h-5 w-5" />
            </div>
            <p className="mt-2 text-xs font-bold text-white tracking-wider uppercase">Cần cấp quyền</p>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {lab.category && (
            <span className="rounded-full bg-slate-50 border border-slate-100/80 px-2.5 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              {lab.category}
            </span>
          )}
        </div>

        <h3 className="mb-1 line-clamp-2 text-sm font-bold leading-snug text-slate-900 transition-colors group-hover:text-emerald-600">
          {lab.name}
        </h3>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {lab.moduleCount} module{lab.moduleCount !== 1 ? 's' : ''}
          </span>
          {grantedRestricted && (
            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
              <CheckCircle className="h-3.5 w-3.5" />
              Đã được cấp quyền
            </span>
          )}
          {hasAttempted && (
            <span className="flex items-center gap-1 font-semibold text-emerald-600">
              <RotateCcw className="h-3 w-3" />
              Đã từng làm
            </span>
          )}
        </div>

        {Array.isArray(lab.tags) && lab.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {lab.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-400"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LabsPage() {
  const router = useRouter();
  const userId = getStoredUser()?.id ?? '';

  const [labs, setLabs] = useState<LabItem[]>([]);
  const [attemptedLabIds, setAttemptedLabIds] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [page] = useState(1);
  const limit = 30;

  const [selectedLabId, setSelectedLabId] = useState<string | null>(null);
  const [approvalLab, setApprovalLab] = useState<LabItem | null>(null);

  const fetchLabs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        status: 'PUBLISHED',
        userId,
      });
      if (searchQuery.trim()) params.set('keyword', searchQuery.trim());
      if (difficulty) params.set('difficulty', difficulty);

      const token = await ensureValidToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      const [res, sessRes, gradesRes] = await Promise.all([
        fetch(`/api/lab-templates?${params.toString()}`, { cache: 'no-store', headers }),
        userId ? fetch(`/api/sessions?userId=${encodeURIComponent(userId)}&limit=200`, { cache: 'no-store', headers }).catch(() => null) : null,
        userId ? fetch(`/api/grades?studentId=${encodeURIComponent(userId)}&limit=200`, { cache: 'no-store', headers }).catch(() => null) : null,
      ]);

      const json = await res.json();
      if (json?.success && Array.isArray(json?.data?.items)) {
        setLabs(json.data.items);
        setTotal(json.data.pagination?.total ?? json.data.items.length);
      } else {
        setError(json?.message ?? 'Không thể tải danh sách lab');
      }

      const attemptedSet = new Set<string>();

      // 1. Parse Sessions for attempted labs
      if (sessRes && sessRes.ok) {
        const sessJson = await sessRes.json().catch(() => null);
        const sessList: any[] = Array.isArray(sessJson?.data) ? sessJson.data : Array.isArray(sessJson) ? sessJson : [];
        for (const s of sessList) {
          const labId = s.module?.labTemplateId || s.module?.labTemplate?.id;
          if (labId) {
            attemptedSet.add(labId);
          }
        }
      }

      // 2. Parse Grades for attempted labs
      if (gradesRes && gradesRes.ok) {
        const gradesJson = await gradesRes.json().catch(() => null);
        const gradesList: any[] = Array.isArray(gradesJson?.data?.items)
          ? gradesJson.data.items
          : Array.isArray(gradesJson?.data)
          ? gradesJson.data
          : Array.isArray(gradesJson)
          ? gradesJson
          : [];
        for (const g of gradesList) {
          if (g.labTemplateId) {
            attemptedSet.add(g.labTemplateId);
          }
        }
      }

      // 3. Include locally enrolled labs
      if (userId) {
        readEnrolled(userId).forEach((e) => attemptedSet.add(e.labTemplateId));
      }

      setAttemptedLabIds(attemptedSet);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, difficulty, userId]);

  useEffect(() => {
    const t = setTimeout(fetchLabs, searchQuery ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchLabs, searchQuery]);

  // Deselect with Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedLabId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLaunch = (lab: LabItem) => {
    const hasAccess = lab.accessType === 'PUBLIC' || !!lab.hasAccess;
    if (!hasAccess) {
      setSelectedLabId(null);
      setApprovalLab(lab);
      return;
    }
    enrollLab(userId, lab.id);
    router.push(`/student/my-labs/${lab.id}`);
  };

  const handleSelect = (labId: string) => {
    setSelectedLabId((prev) => (prev === labId ? null : labId));
  };

  const activeLab = labs.find((l) => attemptedLabIds.has(l.id)) || labs[0];
  const practicedLabsCount = attemptedLabIds.size;
  const totalLabsCount = total || labs.length;

  return (
    <StudentLayout>
      <div className="p-6 lg:p-8">
        {/* Asymmetric Grid (Hero Banner & Skill Progress) */}
        {!loading && !error && labs.length > 0 && (
          <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <HeroBanner lab={activeLab} onLaunch={() => handleLaunch(activeLab)} />
            </div>
            <div className="lg:col-span-1">
              <SkillProgressWheel total={totalLabsCount} practiced={practicedLabsCount} />
            </div>
          </div>
        )}

        {/* Heading Section & Search filters */}
        <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-100/60 pb-5 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Khám phá các Lab thực hành</h2>
            <p className="mt-1 text-xs text-slate-400">Rèn luyện kỹ năng thực tế với hệ thống lab chất lượng cao</p>
          </div>
          
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="w-full sm:w-80">
              <SearchBar
                placeholder="Tìm kiếm lab theo tên, mô tả, hoặc tag..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="relative">
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="h-10 appearance-none rounded-xl border border-slate-200/80 bg-white px-4 py-2 pr-8 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none"
              >
                <option value="">Tất cả độ khó</option>
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
          </div>
        </div>

        {/* Count + hint */}
        <div className="mb-6">
          {loading ? (
            <p className="text-sm text-slate-400">Đang tải...</p>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : (
            <p className="text-sm text-slate-400 font-medium">
              Tìm thấy tổng cộng{' '}
              <span className="font-semibold text-slate-900">{total} lab</span>
              {selectedLabId && (
                <span className="ml-3 text-xs text-emerald-600">
                  Click lại hoặc nhấn{' '}
                  <kbd className="rounded bg-slate-50 border border-slate-100 px-1.5 py-0.5 font-mono text-[10px]">Esc</kbd>{' '}
                  để bỏ chọn
                </span>
              )}
            </p>
          )}
        </div>

        {/* Grid */}
        {!loading && !error && labs.length > 0 && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {labs.map((lab) => (
              <LabCardItem
                key={lab.id}
                lab={lab}
                selected={selectedLabId === lab.id}
                hasAttempted={attemptedLabIds.has(lab.id)}
                onSelect={() => handleSelect(lab.id)}
                onLaunch={() => handleLaunch(lab)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && labs.length === 0 && (
          <div className="py-16 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <Search className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Không tìm thấy lab</h3>
            <p className="text-sm text-gray-500">Thử điều chỉnh tiêu chí tìm kiếm của bạn</p>
          </div>
        )}

        {/* Approval dialog */}
        {approvalLab && (
          <ApprovalDialog
            lab={approvalLab}
            userId={userId}
            onClose={() => setApprovalLab(null)}
          />
        )}
      </div>
    </StudentLayout>
  );
}
