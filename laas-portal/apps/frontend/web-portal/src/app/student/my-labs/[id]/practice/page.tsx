'use client';

import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  Clock,
  Lightbulb,
  Loader2,
  LogOut,
  Network,
  RotateCw,
  Server,
  TerminalSquare,
  Trophy,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import { ensureValidToken, getStoredUser } from '../../../../../lib/auth';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VmConfig {
  id: string;
  nodeName: string;
  note?: string;
  operatingSystem?: string;
  flavor?: string;
  networkType?: 'dhcp' | 'static';
  staticIp?: string;
  zoneIds?: string[];
}

interface NetworkZone {
  id: string;
  name: string;
  cidr?: string;
  hasInternet?: boolean;
}

interface Checkpoint {
  id: string;
  name: string;
  description?: string;
  points?: number;
  vmId?: string;
  hintCommand?: string;
}

interface ModuleDetail {
  id: string;
  name: string;
  description?: string;
  orderNo: number;
  estimatedMinutes?: number;
  objectives?: string[];
  definitionJson?: {
    networkZones?: NetworkZone[];
    vmConfigs?: VmConfig[];
    checkpoints?: Checkpoint[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Completion Dialog ────────────────────────────────────────────────────────

function CompletionDialog({
  earnedPoints,
  totalPoints,
  completed,
  total,
  onClose,
  onExit,
}: {
  earnedPoints: number;
  totalPoints: number;
  completed: number;
  total: number;
  onClose: () => void;
  onExit: () => void;
}) {
  const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg">
          <Trophy className="h-10 w-10 text-white" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">
          {completed === total ? 'Chúc mừng! 🎉' : 'Kết quả Lab'}
        </h2>
        <p className="mb-6 text-sm text-gray-500">
          {completed === total
            ? 'Bạn đã hoàn thành tất cả checkpoint!'
            : `Bạn đã hoàn thành ${completed}/${total} checkpoint`}
        </p>

        <div className="mb-6 flex items-center justify-center gap-8">
          <div className="text-center">
            <p className="text-3xl font-extrabold text-emerald-600">{earnedPoints}</p>
            <p className="text-xs text-gray-400">Điểm đạt được</p>
          </div>
          <div className="h-10 w-px bg-gray-200" />
          <div className="text-center">
            <p className="text-3xl font-extrabold text-gray-300">{totalPoints}</p>
            <p className="text-xs text-gray-400">Tổng điểm</p>
          </div>
          <div className="h-10 w-px bg-gray-200" />
          <div className="text-center">
            <p className="text-3xl font-extrabold text-blue-600">{percentage}%</p>
            <p className="text-xs text-gray-400">Tỷ lệ</p>
          </div>
        </div>

        <div className="flex justify-center gap-3">
          {completed < total && (
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Tiếp tục làm
            </button>
          )}
          <button
            onClick={onExit}
            className="rounded-lg bg-[#FF6900] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#E55E00] shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
          >
            Thoát Lab
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Exit Confirmation Dialog ─────────────────────────────────────────────────

function ExitDialog({
  completed,
  total,
  earnedPoints,
  totalPoints,
  onConfirm,
  onCancel,
  stopping,
}: {
  completed: number;
  total: number;
  earnedPoints: number;
  totalPoints: number;
  onConfirm: () => void;
  onCancel: () => void;
  stopping: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orange-100">
          <LogOut className="h-7 w-7 text-orange-600" />
        </div>
        <h2 className="mb-2 text-center text-lg font-bold text-gray-900">Thoát Lab?</h2>
        <p className="mb-4 text-center text-sm text-gray-500">
          Session sẽ bị dừng và máy ảo sẽ được giải phóng. Tiến trình checkpoint đã được lưu tự động.
        </p>
        <div className="mb-5 rounded-lg bg-gray-50 p-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Checkpoint:</span>
            <span className="font-semibold text-gray-900">{completed}/{total} hoàn thành</span>
          </div>
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-gray-500">Điểm:</span>
            <span className="font-semibold text-emerald-600">{earnedPoints}/{totalPoints}</span>
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={stopping}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            onClick={onConfirm}
            disabled={stopping}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {stopping ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Đang dừng...
              </>
            ) : (
              'Xác nhận thoát'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Smart Terminal Frame Component ──────────────────────────────────────────

interface TerminalFrameProps {
  proxyPath: string;
  isActive: boolean;
  label: string;
}

function TerminalFrame({ proxyPath, isActive, label }: TerminalFrameProps) {
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [attempt, setAttempt] = useState(1);
  const [key, setKey] = useState(0);

  // Single probe: try to reach the ttyd proxy endpoint.
  // Timeout is 8s to accommodate backend proxyHttp retry loop (4 attempts × 2.5s + 1s delay each).
  const probe = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(proxyPath, {
        method: 'GET',
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, [proxyPath]);

  // Initial connection check with retries.
  const checkConnection = useCallback(async (): Promise<boolean> => {
    setStatus('checking');
    const maxRetries = 30;
    for (let i = 1; i <= maxRetries; i++) {
      setAttempt(i);
      if (await probe()) {
        setStatus('ready');
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    setStatus('error');
    return false;
  }, [probe]);

  useEffect(() => {
    let isMounted = true;
    let bgTimer: ReturnType<typeof setInterval> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const clearTimers = () => {
      if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    };

    const runCheck = async () => {
      const success = await checkConnection();

      if (success && isMounted) {
        // Fix 5: Heartbeat — periodically verify the proxy is still reachable.
        // If it goes down (ttyd restart, VM reboot), auto-transition back to checking.
        heartbeatTimer = setInterval(async () => {
          if (!isMounted) return;
          const alive = await probe();
          if (!alive && isMounted) {
            clearTimers();
            // Re-run the full check to reconnect
            runCheck();
          }
        }, 15000);
      } else if (!success && isMounted) {
        // Background retry: keep trying silently even after showing error UI.
        bgTimer = setInterval(async () => {
          if (!isMounted) return;
          const alive = await probe();
          if (alive && isMounted) {
            if (bgTimer) { clearInterval(bgTimer); bgTimer = null; }
            setStatus('ready');
            // Start heartbeat once ready
            heartbeatTimer = setInterval(async () => {
              if (!isMounted) return;
              const stillAlive = await probe();
              if (!stillAlive && isMounted) {
                clearTimers();
                runCheck();
              }
            }, 15000);
          }
        }, 5000);
      }
    };

    void runCheck();

    return () => {
      isMounted = false;
      clearTimers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const handleReload = () => {
    setKey((prev) => prev + 1);
  };

  return (
    <div className={`absolute inset-0 h-full w-full ${isActive ? 'block' : 'hidden'}`}>
      {status === 'ready' && (
        <iframe
          key={key}
          src={proxyPath}
          className="h-full w-full border-none"
          title={`Terminal: ${label}`}
          allow="clipboard-read; clipboard-write"
          allowFullScreen
        />
      )}

      {status === 'checking' && (
        <div className="flex h-full flex-col items-center justify-center bg-[#0d1117] text-gray-300">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-blue-500" />
          <p className="text-sm font-medium text-white">Đang kết nối... ({attempt}/30)</p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex h-full flex-col items-center justify-center bg-[#0d1117] px-4 text-center text-gray-300">
          <AlertCircle className="mb-3 h-10 w-10 text-amber-500" />
          <h3 className="text-base font-semibold text-white">Chưa thể kết nối tới Terminal</h3>
          <p className="mt-1 max-w-md text-xs text-gray-400">
            Dịch vụ Terminal trên máy ảo chưa phản hồi hoặc đang trong quá trình khởi động hệ thống.
          </p>
          <p className="mt-1 max-w-md text-xs text-gray-500">
            Hệ thống đang tự động thử kết nối lại...
          </p>
          <button
            onClick={handleReload}
            className="mt-4 flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500"
          >
            <RotateCw className="h-3.5 w-3.5" />
            Thử kết nối lại
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Practice page content ────────────────────────────────────────────────────

function PracticeContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const labId = Array.isArray(params.id) ? params.id[0] : params.id;
  const moduleId = searchParams.get('moduleId') ?? '';
  const initialHost = searchParams.get('host') ?? '';
  // Class context — present when launched from a class's virtual lab section
  const classLabId = searchParams.get('classLabId') ?? '';
  const groupId = searchParams.get('groupId') ?? '';
  const [resolvedClassLabId, setResolvedClassLabId] = useState(classLabId);
  const [resolvedGroupId, setResolvedGroupId] = useState(groupId);

  // Auto-resolve classLabId & groupId if user is enrolled in a class assigned this lab
  useEffect(() => {
    if (resolvedClassLabId && resolvedGroupId) return;
    if (!labId) return;
    (async () => {
      try {
        const token = await ensureValidToken();
        const res = await fetch(`/api/class-labs/by-lab/${labId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const first = json.data[0];
            if (first?.id && first?.groupId) {
              setResolvedClassLabId(first.id);
              setResolvedGroupId(first.groupId);
            }
          }
        }
      } catch {}
    })();
  }, [labId, resolvedClassLabId, resolvedGroupId]);

  // Module state
  const [module, setModule] = useState<ModuleDetail | null>(null);
  const [moduleLoading, setModuleLoading] = useState(Boolean(moduleId));

  // Terminal tabs — each opened VM gets its own tab
  interface TerminalTab { vmId: string; proxyPath: string; label: string }
  const [openTabs, setOpenTabs] = useState<TerminalTab[]>(
    initialHost ? [{ vmId: '__initial__', proxyPath: `/ttyd-proxy/${initialHost}/`, label: initialHost }] : []
  );
  const [activeTabId, setActiveTabId] = useState<string | null>(initialHost ? '__initial__' : null);
  const [reloadSignal, setReloadSignal] = useState<Record<string, number>>({});

  const triggerReloadTab = (vmId: string) => {
    setReloadSignal((prev) => ({ ...prev, [vmId]: (prev[vmId] ?? 0) + 1 }));
  };

  // Checkpoint progress
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'STARTING' | 'RUNNING' | null>(null);
  const [launchingSeconds, setLaunchingSeconds] = useState(0);
  const [stackId, setStackId] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [cpStatuses, setCpStatuses] = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAutoConnected = useRef(false);

  // Score tracking
  const [earnedPoints, setEarnedPoints] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCheckpoints, setTotalCheckpoints] = useState(0);

  // UI
  const [activeTab, setActiveTab] = useState<'progress' | 'resources'>('progress');
  const [shownHints, setShownHints] = useState<Set<string>>(new Set());
  const [timeElapsed, setTimeElapsed] = useState(0);

  // Dialogs
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [stopping, setStopping] = useState(false);
  const completionShownRef = useRef(false);

  // ── Load module ──
  useEffect(() => {
    if (!moduleId) return;
    setModuleLoading(true);
    fetch(`/api/modules/${moduleId}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json: { success?: boolean; data?: ModuleDetail }) => {
        if (json.success && json.data) setModule(json.data);
      })
      .catch(() => {})
      .finally(() => setModuleLoading(false));
  }, [moduleId]);

  // ── Fetch or create active session ──
  useEffect(() => {
    if (!moduleId) return;
    void (async () => {
      try {
        const user = getStoredUser();
        if (!user?.id) return;
        const token = await ensureValidToken();
        const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        const storageKey = `lab_session:${moduleId}`;

        // 1. localStorage: only used for RUNNING sessions to survive reload without re-fetching
        const storedSessionId = localStorage.getItem(storageKey);
        if (storedSessionId) {
          const verifyRes = await fetch(`/api/sessions/${storedSessionId}`, {
            cache: 'no-store',
            headers: authHeaders,
          });
          if (verifyRes.ok) {
            const verifyJson = (await verifyRes.json()) as {
              success?: boolean;
              data?: { id: string; status?: string } | null;
            };
            if (verifyJson.success && verifyJson.data?.status === 'RUNNING') {
              setSessionId(verifyJson.data.id);
              setSessionStatus('RUNNING');
              return;
            }
          }
          localStorage.removeItem(storageKey);
        }

        // 2. Server-side check: find a fresh active session
        const res = await fetch(
          `/api/sessions/active?userId=${encodeURIComponent(user.id)}&moduleId=${encodeURIComponent(moduleId)}`,
          { cache: 'no-store', headers: authHeaders },
        );
        const json = (await res.json()) as {
          success?: boolean;
          data?: { id: string; status?: string; startedAt?: string } | null;
        };
        if (json.success && json.data?.id) {
          const status = (json.data.status as 'STARTING' | 'RUNNING') ?? 'RUNNING';
          setSessionId(json.data.id);
          setSessionStatus(status);
          if (status === 'STARTING' && json.data.startedAt) {
            const elapsed = Math.floor((Date.now() - new Date(json.data.startedAt).getTime()) / 1000);
            setLaunchingSeconds(Math.max(0, elapsed));
          }
          if (status === 'RUNNING') {
            localStorage.setItem(storageKey, json.data.id);
          }
          return;
        }

        // 3. No active session — create one
        setSessionStatus('STARTING');
        const createRes = await fetch('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ moduleId, userId: user.id }),
        });
        const createJson = (await createRes.json()) as {
          success?: boolean;
          data?: { session?: { id: string } };
        };
        const newId = createJson.data?.session?.id;
        if (newId) setSessionId(newId);
      } catch {}
    })();
  }, [moduleId]);

  // ── Poll session status while stack is launching ──
  useEffect(() => {
    if (!sessionId || sessionStatus === 'RUNNING') return;
    const poll = async () => {
      try {
        const token = await ensureValidToken();
        const res = await fetch(`/api/sessions/${sessionId}`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = (await res.json()) as { success?: boolean; data?: { status?: string; openstackStackId?: string } };
        if (json.data?.openstackStackId) {
          setStackId(json.data.openstackStackId);
        }
        if (json.data?.status === 'RUNNING') {
          setSessionStatus('RUNNING');
          if (moduleId) localStorage.setItem(`lab_session:${moduleId}`, sessionId);
        }
      } catch {}
    };
    void poll();
    const id = setInterval(() => void poll(), 5000);
    return () => clearInterval(id);
  }, [sessionId, sessionStatus, moduleId]);

  // ── Load stackId when sessionId is set ──
  useEffect(() => {
    if (!sessionId) return;
    const fetchSession = async () => {
      try {
        const token = await ensureValidToken();
        const res = await fetch(`/api/sessions/${sessionId}`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();
        if (json.success && json.data) {
          setStackId(json.data.openstackStackId || null);
        }
      } catch {}
    };
    void fetchSession();
  }, [sessionId]);

  // ── Count seconds spent in STARTING state ──
  useEffect(() => {
    if (sessionStatus !== 'STARTING') return;
    const id = setInterval(() => setLaunchingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [sessionStatus]);


  // ── Sync grade to grading-service ──
  const syncGradeToService = useCallback(async (customStatuses?: Record<string, string>, overrideStatus?: string) => {
    const cId = resolvedClassLabId || classLabId;
    const gId = resolvedGroupId || groupId;
    if (!cId || !gId) return; // Only sync if launched from or matched to class context
    try {
      const user = getStoredUser();
      if (!user?.id) return;
      const token = await ensureValidToken();
      const checkpointDefs = module?.definitionJson?.checkpoints ?? [];
      const currentMap = customStatuses || cpStatuses;
      const checkpointsPayload = checkpointDefs.map((cp) => ({
        id: cp.id,
        name: module?.name ? `[${module.name}] ${cp.name}` : cp.name,
        points: cp.points && cp.points > 0 ? cp.points : 10,
        status: currentMap[cp.id] ?? 'PENDING',
        completedAt: currentMap[cp.id] === 'COMPLETED' ? new Date().toISOString() : undefined,
      }));
      const completedCount = checkpointsPayload.filter((c) => c.status === 'COMPLETED').length;
      const totalCount = checkpointsPayload.length;
      const derivedStatus = overrideStatus || (completedCount === totalCount && totalCount > 0 ? 'COMPLETED' : 'IN_PROGRESS');

      await fetch('/api/grades/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          classLabId: cId,
          groupId: gId,
          studentId: user.id,
          labTemplateId: labId,
          sessionId,
          status: derivedStatus,
          checkpoints: checkpointsPayload,
        }),
      });
    } catch { /* fire-and-forget */ }
  }, [resolvedClassLabId, classLabId, resolvedGroupId, groupId, labId, sessionId, module, cpStatuses]);

  // Initial grade sync when entering practice session with class context
  useEffect(() => {
    const cId = resolvedClassLabId || classLabId;
    const gId = resolvedGroupId || groupId;
    if (cId && gId && module?.definitionJson?.checkpoints?.length) {
      void syncGradeToService();
    }
  }, [resolvedClassLabId, classLabId, resolvedGroupId, groupId, module, syncGradeToService]);

  // ── Poll checkpoint progress every 5s ──
  useEffect(() => {
    if (!sessionId) return;

    const fetchStatuses = async () => {
      try {
        const token = await ensureValidToken();
        const res = await fetch(`/api/sessions/${sessionId}/checkpoints`, {
          cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: {
            checkpoints: Array<{ id: string; status: string }>;
            total?: number;
            completed?: number;
            totalPoints?: number;
            earnedPoints?: number;
          };
        };
        if (json.success && json.data?.checkpoints) {
          const map: Record<string, string> = {};
          for (const cp of json.data.checkpoints) map[cp.id] = cp.status;
          setCpStatuses(map);
          // Update score tracking
          if (json.data.totalPoints != null) setTotalPoints(json.data.totalPoints);
          if (json.data.earnedPoints != null) setEarnedPoints(json.data.earnedPoints);
          if (json.data.total != null) setTotalCheckpoints(json.data.total);
          if (json.data.completed != null) setCompletedCount(json.data.completed);

          // Realtime auto sync grade if any checkpoint completed
          if (json.data.completed && json.data.completed > 0) {
            void syncGradeToService(map);
          }
        }
      } catch {}
    };

    void fetchStatuses();
    pollRef.current = setInterval(() => void fetchStatuses(), 5_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId, syncGradeToService]);

  // ── Detect completion → show dialog ──
  useEffect(() => {
    if (
      totalCheckpoints > 0 &&
      completedCount === totalCheckpoints &&
      !completionShownRef.current
    ) {
      completionShownRef.current = true;
      setShowCompletionDialog(true);
      void syncGradeToService();
    }
  }, [completedCount, totalCheckpoints, syncGradeToService]);

  // ── Timer ──
  useEffect(() => {
    if (sessionStatus !== 'RUNNING') return;
    const id = setInterval(() => setTimeElapsed((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [sessionStatus]);

  // ── Warn before page unload if session is running ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (sessionStatus === 'RUNNING') {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sessionStatus]);

  // ── Auto-connect when session becomes RUNNING ──
  useEffect(() => {
    if (sessionStatus !== 'RUNNING') return;
    if (hasAutoConnected.current) return;
    const vmList = module?.definitionJson?.vmConfigs;
    if (!Array.isArray(vmList) || vmList.length === 0) return;
    if (!sessionId) return;

    hasAutoConnected.current = true;
    setActiveTab('resources');

    if (vmList.length === 1 && vmList[0]) {
      const vm = vmList[0];
      const proxyPath = `/ttyd-proxy/${sessionId}/${encodeURIComponent(vm.nodeName || vm.id)}/?theme=%7B%22background%22%3A%22%23111827%22%7D`;
      setOpenTabs((prev) => {
        if (prev.some((t) => t.vmId === vm.id)) return prev;
        return [...prev, { vmId: vm.id, proxyPath, label: vm.nodeName || 'VM' }];
      });
      setActiveTabId(vm.id);
    }
  }, [sessionStatus, module, sessionId]);

  // ── Open terminal tab for a VM ──
  const connectToVm = (vm: VmConfig) => {
    const proxyPath = sessionId
      ? `/ttyd-proxy/${sessionId}/${encodeURIComponent(vm.nodeName || vm.id)}/?theme=%7B%22background%22%3A%22%23111827%22%7D`
      : vm.networkType === 'static' && vm.staticIp
        ? `/ttyd-proxy/${vm.staticIp}/?theme=%7B%22background%22%3A%22%23111827%22%7D`
        : null;

    if (!proxyPath) return;

    setOpenTabs((prev) => {
      if (prev.some((t) => t.vmId === vm.id)) return prev;
      return [...prev, { vmId: vm.id, proxyPath, label: vm.nodeName || 'VM' }];
    });
    setActiveTabId(vm.id);
  };

  const closeTab = (vmId: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.vmId !== vmId);
      if (activeTabId === vmId) {
        setActiveTabId(next.length > 0 ? (next[next.length - 1]?.vmId ?? null) : null);
      }
      return next;
    });
  };

  // ── Stop session and exit ──
  const handleExitLab = useCallback(async () => {
    setIsExiting(true);
    setStopping(true);
    try {
      // Sync grade first with exit status (best-effort)
      const currentCps = module?.definitionJson?.checkpoints ?? [];
      const compCount = currentCps.filter((cp: any) => cpStatuses[cp.id] === 'COMPLETED').length;
      const totalCp = currentCps.length;
      const finalStatus = compCount === totalCp && totalCp > 0 ? 'COMPLETED' : 'FINISHED';
      await syncGradeToService(undefined, finalStatus);

      const user = getStoredUser();
      const token = await ensureValidToken();
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      // Delete OpenStack Stack
      if (stackId) {
        await fetch(`/api/stacks/${stackId}/cleanup?userId=${encodeURIComponent(user?.id || '')}`, {
          method: 'POST',
          headers: authHeaders,
        }).catch(() => {});
      }

      // Stop Session
      if (sessionId) {
        await fetch(`/api/sessions/${sessionId}/stop`, {
          method: 'POST',
          headers: authHeaders,
        }).catch(() => {});
        localStorage.removeItem(`lab_session:${moduleId}`);
      }
    } catch (err) {
      console.error('Lỗi khi thoát lab:', err);
    } finally {
      setStopping(false);
      setIsExiting(false);
      setShowExitDialog(false);
      setShowCompletionDialog(false);
      const cId = resolvedClassLabId || classLabId;
      const gId = resolvedGroupId || groupId;
      const classLabParam = cId ? `classLabId=${cId}` : '';
      const groupParam = gId ? `groupId=${gId}` : '';
      const qs = [classLabParam, groupParam].filter(Boolean).join('&');

      const exitLink = labId
        ? `/student/my-labs/${labId}${qs ? `?${qs}` : ''}`
        : (gId ? `/student/classes/${gId}` : '/student/my-labs');
      router.push(exitLink);
    }
  }, [sessionId, moduleId, labId, router, syncGradeToService, groupId, resolvedGroupId, stackId, classLabId, resolvedClassLabId]);

  // ── Auto-stop when time is up ──
  useEffect(() => {
    if (!module?.estimatedMinutes || module.estimatedMinutes <= 0) return;
    const timeLimitSeconds = module.estimatedMinutes * 60;
    if (timeElapsed >= timeLimitSeconds && sessionStatus === 'RUNNING') {
      // Time's up — show completion dialog
      if (!completionShownRef.current) {
        completionShownRef.current = true;
        setShowCompletionDialog(true);
      }
    }
  }, [timeElapsed, module, sessionStatus]);

  // ── Shorthand data ──
  const zones = module?.definitionJson?.networkZones ?? [];
  const vms = module?.definitionJson?.vmConfigs ?? [];
  const checkpoints = module?.definitionJson?.checkpoints ?? [];
  const objectives = module?.objectives ?? [];

  // Time limit info
  const timeLimitSeconds = (module?.estimatedMinutes ?? 0) * 60;
  const timeRemaining = timeLimitSeconds > 0 ? Math.max(0, timeLimitSeconds - timeElapsed) : -1;
  const isTimeWarning = timeRemaining >= 0 && timeRemaining <= 300; // 5 min warning

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-900">
      {/* ── Header ── */}
      <div className="flex flex-shrink-0 items-center justify-between bg-[#1E2939] px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={labId ? `/student/my-labs/${labId}` : '/student/my-labs'}
            className="flex items-center gap-1.5 text-sm text-white/80 transition-colors hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Quay lại
          </Link>
          <div className="h-5 w-px bg-gray-600" />
          <div className="min-w-0">
            <p className="truncate text-xs text-gray-400">
              {moduleLoading ? 'Đang tải...' : (module?.name ?? 'Module')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Score badge */}
          {totalCheckpoints > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-600/20 px-3 py-1 text-xs font-medium text-emerald-400">
              <CheckCircle className="h-3.5 w-3.5" />
              {completedCount}/{totalCheckpoints} CP · {earnedPoints}/{totalPoints} pts
            </span>
          )}

          {openTabs.length > 0 ? (
            <span className="flex items-center gap-1.5 rounded-full bg-green-600/20 px-3 py-1 text-xs font-medium text-green-400">
              <Wifi className="h-3.5 w-3.5" />
              {openTabs.length} terminal{openTabs.length > 1 ? 's' : ''}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-gray-700 px-3 py-1 text-xs font-medium text-gray-400">
              <WifiOff className="h-3.5 w-3.5" /> Chưa kết nối
            </span>
          )}

          {/* Time display */}
          <span className={`flex items-center gap-1.5 text-sm ${isTimeWarning ? 'text-red-400 animate-pulse font-bold' : 'text-gray-300'}`}>
            <Clock className="h-4 w-4" />
            {timeRemaining >= 0 ? `Còn ${formatTime(timeRemaining)}` : formatTime(timeElapsed)}
          </span>

          {/* Exit button */}
          <button
            onClick={() => setShowExitDialog(true)}
            className="flex items-center gap-1.5 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            Thoát Lab
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Left panel ── */}
        <div className="flex w-[30%] flex-shrink-0 flex-col overflow-hidden border-r border-gray-700 bg-white">
          {/* Module info */}
          <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
            {moduleLoading ? (
              <div className="space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-gray-200" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
              </div>
            ) : module ? (
              <>
                <h2 className="mb-1 font-semibold text-gray-900 line-clamp-2">
                  Module {module.orderNo}: {module.name}
                </h2>
                {module.estimatedMinutes != null && module.estimatedMinutes > 0 && (
                  <p className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    {module.estimatedMinutes} phút ước tính
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">
                {moduleId ? 'Không thể tải module' : 'Chưa chọn module'}
              </p>
            )}
          </div>

          {/* Tabs */}
          <div className="flex p-1.5 bg-slate-100/70 rounded-xl mx-4 my-4 gap-1.5 border border-slate-200/30">
            {(
              [
                { id: 'progress', label: 'Tiến độ', icon: Lightbulb },
                { id: 'resources', label: 'Tài nguyên', icon: Server },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-semibold transition-all duration-300 ${
                  activeTab === id
                    ? 'bg-white text-green-700 shadow-sm border border-slate-200/50'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/30'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* ─ Tiến độ ─ */}
            {activeTab === 'progress' && (
              <div className="space-y-5">
                {(module?.description || objectives.length > 0) && (
                  <div>
                    {module?.description && (
                      <p className="mb-3 text-sm text-gray-600">{module.description}</p>
                    )}
                    {objectives.length > 0 && (
                      <>
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Mục tiêu học tập
                        </h3>
                        <ol className="space-y-2">
                          {objectives.map((obj, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">
                                {i + 1}
                              </span>
                              <p className="text-sm leading-relaxed text-gray-700">{obj}</p>
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                  </div>
                )}

                <div>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Checkpoint ({checkpoints.length})
                  </h3>
                  {checkpoints.length === 0 ? (
                    <p className="text-sm text-gray-400">Module này chưa có checkpoint.</p>
                  ) : (
                    <div className="space-y-3">
                      {(() => {
                        const firstPendingIdx = checkpoints.findIndex(
                          (c) => (cpStatuses[c.id] ?? 'PENDING') !== 'COMPLETED',
                        );
                        return checkpoints.map((cp, idx) => {
                          const assignedVm = vms.find((v) => v.id === cp.vmId);
                          const hintVisible = shownHints.has(cp.id);
                          const status = cpStatuses[cp.id] ?? 'PENDING';
                          const isCompleted = status === 'COMPLETED';
                          const isCurrent = idx === firstPendingIdx;
                          return (
                            <div
                              key={cp.id}
                              className={`transition-all duration-300 ${
                                isCompleted
                                  ? 'bg-emerald-50/20 border-0 py-3 px-4 rounded-2xl'
                                  : isCurrent
                                  ? 'bg-slate-50 border-0 shadow-sm shadow-slate-900/[0.03] py-4 px-4 rounded-2xl ring-1 ring-slate-100'
                                  : 'bg-transparent border-0 py-3 px-1'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                {isCompleted ? (
                                  <CheckCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                                ) : isCurrent ? (
                                  <div className="mt-1 flex-shrink-0 flex items-center justify-center w-5 h-5">
                                    <span className="relative flex h-2.5 w-2.5">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                    </span>
                                  </div>
                                ) : (
                                  <div className="mt-1.5 flex-shrink-0 flex items-center justify-center w-5 h-5">
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <p
                                      className={`text-sm font-semibold ${
                                        isCompleted ? 'text-emerald-800' : 'text-gray-900'
                                      }`}
                                    >
                                      {cp.name}
                                    </p>
                                    {cp.hintCommand && !isCompleted && (
                                      <button
                                        onClick={() =>
                                          setShownHints((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(cp.id)) next.delete(cp.id);
                                            else next.add(cp.id);
                                            return next;
                                          })
                                        }
                                        title="Xem gợi ý"
                                        className={`flex-shrink-0 rounded p-1 transition-colors ${
                                          hintVisible
                                            ? 'text-yellow-500 hover:text-yellow-600'
                                            : 'text-gray-400 hover:text-yellow-500'
                                        }`}
                                      >
                                        <Lightbulb className="h-4 w-4" />
                                      </button>
                                    )}
                                  </div>
                                  {cp.description && (
                                    <p className="mt-0.5 text-xs text-gray-500">{cp.description}</p>
                                  )}
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {cp.points != null && cp.points > 0 && (
                                      <span
                                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                                          isCompleted
                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100/50'
                                            : 'bg-emerald-50/50 text-emerald-700 border-emerald-100/30'
                                        }`}
                                      >
                                        {cp.points} điểm
                                      </span>
                                    )}
                                    {assignedVm && (
                                      <span className="rounded-full bg-violet-50 text-violet-600 border border-violet-100/50 px-2.5 py-0.5 text-xs font-semibold">
                                        {assignedVm.nodeName || 'VM'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {hintVisible && cp.hintCommand && !isCompleted && (
                                <div className="mt-3 rounded-lg border border-amber-200/80 bg-gradient-to-br from-amber-50 to-yellow-50 overflow-hidden shadow-sm">
                                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100/60 border-b border-amber-200/60">
                                    <Lightbulb className="h-3 w-3 text-amber-600" />
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Gợi ý lệnh</span>
                                  </div>
                                  <div className="overflow-auto max-h-32 px-3 py-2 scrollbar-thin">
                                    <code className="block whitespace-pre font-mono text-xs leading-relaxed text-slate-800">
                                      {cp.hintCommand}
                                    </code>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─ Tài nguyên ─ */}
            {activeTab === 'resources' && (
              <div className="space-y-4">
                {/* Network Zones */}
                {zones.length > 0 && (
                  <div>
                    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      <Network className="h-3.5 w-3.5" /> Network zones ({zones.length})
                    </h3>
                    <div className="space-y-2">
                      {zones.map((z) => (
                        <div
                          key={z.id}
                          className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs"
                        >
                          <p className="font-medium text-gray-900">{z.name || z.id}</p>
                          {z.cidr && <p className="mt-0.5 font-mono text-gray-500">{z.cidr}</p>}
                          {z.hasInternet && (
                            <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
                              Internet
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* VMs */}
                <div>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    <Server className="h-3.5 w-3.5" /> Máy ảo ({vms.length})
                  </h3>
                  {vms.length === 0 ? (
                    <p className="text-sm text-gray-400">Chưa có VM nào.</p>
                  ) : (
                    <div className="space-y-2">
                      {vms.map((vm) => {
                        const ip = vm.networkType === 'static' ? (vm.staticIp ?? '') : '';
                        const canConnect = Boolean(sessionId || ip);
                        const isOpen = openTabs.some((t) => t.vmId === vm.id);
                        const isActive = isOpen && activeTabId === vm.id;
                        return (
                          <div
                            key={vm.id}
                            className={`rounded-lg border p-3 transition-colors ${
                              isActive
                                ? 'border-green-400 bg-green-50'
                                : isOpen
                                ? 'border-blue-300 bg-blue-50'
                                : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900">
                                  {vm.nodeName || 'VM'}
                                </p>
                                {vm.note && (
                                  <p className="text-xs text-gray-500 line-clamp-1">{vm.note}</p>
                                )}
                                {vm.operatingSystem && (
                                  <p className="mt-0.5 text-xs text-gray-500">
                                    {vm.operatingSystem}
                                  </p>
                                )}
                                {ip ? (
                                  <p className="mt-1 font-mono text-xs text-gray-600">{ip}</p>
                                ) : (
                                  <p className="mt-1 text-xs italic text-gray-400">IP động (DHCP)</p>
                                )}
                              </div>
                              <button
                                onClick={() => connectToVm(vm)}
                                disabled={!canConnect || sessionStatus === 'STARTING'}
                                className={`flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-all shadow-sm active:scale-[0.97] ${
                                  isActive
                                    ? 'bg-[#FF6900] text-white ring-2 ring-orange-400 ring-offset-1'
                                    : isOpen
                                    ? 'bg-slate-700 text-white hover:bg-slate-800'
                                    : sessionStatus === 'STARTING'
                                    ? 'cursor-not-allowed bg-yellow-100 text-yellow-700'
                                    : canConnect
                                    ? 'bg-[#FF6900] text-white hover:bg-[#E55E00]'
                                    : 'cursor-not-allowed bg-gray-200 text-gray-400'
                                }`}
                              >
                                {sessionStatus === 'STARTING' ? (
                                  <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                                ) : (
                                  <TerminalSquare className="mr-1 inline h-3 w-3" />
                                )}
                                {isActive ? 'Đang xem' : isOpen ? 'Chuyển' : sessionStatus === 'STARTING' ? 'Đang khởi động...' : 'SSH'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: ttyd terminals (75%) ── */}
        <div className="relative flex flex-1 flex-col overflow-hidden bg-[#111827]">
          {openTabs.length === 0 ? (
            sessionStatus === 'STARTING' ? (
              /* Lab is launching */
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-900/20">
                  <Loader2 className="h-8 w-8 animate-spin text-yellow-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Đang khởi động lab</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Máy ảo đang được tạo, thường mất 2–5 phút. Trang sẽ tự cập nhật khi sẵn sàng.
                </p>
                <p className="mt-1 text-xs text-gray-600">{formatTime(launchingSeconds)}</p>
              </div>
            ) : (
              /* Placeholder: prompt student to select a VM */
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-800">
                  <TerminalSquare className="h-8 w-8 text-gray-400" />
                </div>
                <h2 className="text-xl font-bold text-white">Chọn VM để kết nối</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Mở tab{' '}
                  <button
                    className="font-medium text-green-400 underline underline-offset-2 hover:text-green-300"
                    onClick={() => setActiveTab('resources')}
                  >
                    Tài nguyên
                  </button>{' '}
                  và nhấn <strong className="text-white">SSH</strong> trên máy ảo muốn kết nối
                </p>
              </div>
            )
          ) : (
            <>
              {/* Tab bar */}
              <div className="flex flex-shrink-0 items-center gap-0 overflow-x-auto bg-[#0a0f18] px-2 pt-2">
                {openTabs.map((tab) => (
                  <div
                    key={tab.vmId}
                    className={`group flex cursor-pointer items-center gap-1.5 rounded-t-md border-t border-l border-r px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeTabId === tab.vmId
                        ? 'border-gray-600 bg-[#111827] text-white'
                        : 'border-transparent bg-gray-800 text-gray-400 hover:bg-[#111827] hover:text-gray-200'
                    }`}
                    onClick={() => setActiveTabId(tab.vmId)}
                  >
                    <TerminalSquare className="h-3 w-3 flex-shrink-0" />
                    <span className="max-w-[120px] truncate">{tab.label}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerReloadTab(tab.vmId);
                      }}
                      className="ml-1 flex-shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-gray-600 group-hover:opacity-100"
                      title="Tải lại terminal"
                    >
                      <RotateCw className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.vmId); }}
                      className="flex-shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-gray-600 group-hover:opacity-100"
                      title="Đóng terminal"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Terminal iframes */}
              <div className="relative flex-1 overflow-hidden">
                {openTabs.map((tab) => (
                  <TerminalFrame
                    key={`${tab.vmId}-${reloadSignal[tab.vmId] ?? 0}`}
                    proxyPath={tab.proxyPath}
                    isActive={activeTabId === tab.vmId}
                    label={tab.label}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showExitDialog && (
        <ExitDialog
          completed={completedCount}
          total={totalCheckpoints}
          earnedPoints={earnedPoints}
          totalPoints={totalPoints}
          onConfirm={handleExitLab}
          onCancel={() => setShowExitDialog(false)}
          stopping={stopping}
        />
      )}
      {showCompletionDialog && (
        <CompletionDialog
          earnedPoints={earnedPoints}
          totalPoints={totalPoints}
          completed={completedCount}
          total={totalCheckpoints}
          onClose={() => setShowCompletionDialog(false)}
          onExit={handleExitLab}
        />
      )}
      {isExiting && (
        <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-gray-900/90 text-white">
          <Loader2 className="mb-4 h-12 w-12 animate-spin text-[#FF6900]" />
          <h3 className="text-lg font-semibold">Đang giải phóng tài nguyên...</h3>
          <p className="mt-1 text-sm text-gray-400">Hệ thống đang thực hiện xóa stack trên OpenStack để thu hồi tài nguyên.</p>
        </div>
      )}
    </div>
  );
}

// ─── Exported page (wrapped in Suspense for useSearchParams) ──────────────────

export default function LabPracticePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-900">
          <Loader2 className="h-8 w-8 animate-spin text-green-500" />
        </div>
      }
    >
      <PracticeContent />
    </Suspense>
  );
}
