'use client';

import {
  AlertTriangle,
  CheckCircle,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  MonitorPlay,
  TerminalSquare,
  XCircle,
} from 'lucide-react';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { Button, Input, Label } from '@laas-portal/ui';

import { ensureValidToken } from '../../../../../lib/auth';

function CustomImageLiveConsoleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { sessionId } = useParams();

  const initialName = searchParams.get('name') || '';

  const [isLoading, setIsLoading] = useState(true);
  const [loadingMsg, setLoadingMsg] = useState('Đang cấp phát VM mẫu trên OpenStack…');
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [sessionStatus, setSessionStatus] = useState('STARTING');
  const [sshHost, setSshHost] = useState<string | null>(null);
  const [ttydUrl, setTtydUrl] = useState<string | null>(null);
  const [terminalFocused, setTerminalFocused] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [vmUsername, setVmUsername] = useState('instructor');
  const [vmPassword, setVmPassword] = useState('Laas@2026');

  const [publishName, setPublishName] = useState(initialName);
  const [publishDesc, setPublishDesc] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Phase 1: poll session API until VM has a floating IP assigned
  useEffect(() => {
    if (!sessionId) return;
    if (sshHost) return;

    let stopped = false;
    let intervalId: NodeJS.Timeout | null = null;

    const poll = async () => {
      if (stopped) return;
      try {
        const token = await ensureValidToken();
        if (!token) {
          stopped = true;
          if (intervalId) clearInterval(intervalId);
          router.push('/login');
          return;
        }
        const res = await fetch(`/api/image-builder/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (stopped) return;
        if (res.status === 401) {
          stopped = true;
          if (intervalId) clearInterval(intervalId);
          router.push('/login');
          return;
        }
        if (!res.ok) return;

        const payload = await res.json();
        if (stopped || !payload.session) return;

        const status: string = payload.session.status;
        setSessionStatus(status);

        if (payload.session.vmUsername) setVmUsername(payload.session.vmUsername);
        if (payload.session.vmPassword) setVmPassword(payload.session.vmPassword);

        if (status === 'FAILED') {
          setErrorMsg('Khởi tạo Stack VM mẫu thất bại trên OpenStack. Vui lòng liên hệ Admin.');
          setIsLoading(false);
          stopped = true;
          if (intervalId) clearInterval(intervalId);
          return;
        }

        const host: string | undefined = payload.sshHost || undefined;

        if (host) {
          setSshHost(host);
          setLoadingMsg(
            'Máy ảo đang được khởi tạo...\nQuá trình khởi tạo máy ảo thường mất 2-3 phút.'
          );
          stopped = true;
          if (intervalId) clearInterval(intervalId);
        } else if (status === 'RUNNING') {
          setLoadingMsg(
            'Máy ảo đang được khởi tạo...\nQuá trình khởi tạo máy ảo thường mất 2-3 phút.'
          );
        } else {
          setLoadingMsg('Đang cấp phát tài nguyên trên OpenStack (Heat Stack)…');
        }
      } catch (err) {
        console.error('[LiveConsole] Polling error:', err);
      }
    };

    void poll().then(() => {
      if (!stopped) {
        intervalId = setInterval(poll, 4000);
      }
    });

    return () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [sessionId, sshHost]);

  // Phase 2: once IP is assigned, poll ttyd proxy until it responds (ttyd is up)
  useEffect(() => {
    if (!sshHost || ttydUrl) return;

    let stopped = false;
    const proxyUrl = `/ttyd-proxy/${sessionId as string}/`;

    const check = async () => {
      if (stopped) return;
      try {
        const res = await fetch(proxyUrl, { cache: 'no-store' });
        if (res.ok && !stopped) {
          setTtydUrl(proxyUrl + '?theme=%7B%22background%22%3A%22%23111827%22%7D');
          setIsLoading(false);
          stopped = true;
        }
      } catch {
        // ttyd not ready yet, will retry
      }
    };

    void check();
    const id = setInterval(check, 5000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [sshHost, sessionId, ttydUrl]);

  const reloadTerminal = useCallback(() => {
    if (!sshHost) {
      window.location.reload();
      return;
    }
    setTtydUrl(null);
    setTimeout(
      () =>
        setTtydUrl(
          `/ttyd-proxy/${sessionId as string}/?theme=%7B%22background%22%3A%22%23111827%22%7D`
        ),
      200
    );
  }, [sshHost, sessionId]);

  const handleCopyCredentials = () => {
    navigator.clipboard.writeText(`Username: ${vmUsername}\nPassword: ${vmPassword}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishName.trim() || isSubmitting) return;
    setPublishError(null);
    setIsSubmitting(true);

    try {
      const token = await ensureValidToken();
      const res = await fetch(`/api/image-builder/${sessionId}/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: publishName.trim(),
          description: publishDesc.trim(),
          visibility,
        }),
      });
      const payload = await res.json();
      if (res.ok && payload.success) {
        router.push('/instructor/repository/images?published=1');
      } else {
        setPublishError(payload.message || 'Lỗi khi yêu cầu đóng gói Image.');
        setIsSubmitting(false);
      }
    } catch {
      setPublishError('Đã xảy ra lỗi hệ thống.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-gray-50 md:flex-row">
      {/* ── Terminal 75% ───────────────────────────────────────── */}
      <div className="flex flex-[3] flex-col border-r border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <TerminalSquare className="h-5 w-5 text-orange-600" />
            Live Console — VM Mẫu
          </h1>
          <div className="flex items-center gap-4">
            {ttydUrl && (
              <a
                href={ttydUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
              >
                Mở tab mới <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <Link
              href="/instructor/repository/images"
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Thoát
            </Link>
          </div>
        </div>

        {/* Terminal area */}
        <div className="relative flex-1 bg-[#111827]">
          {/* Loading overlay */}
          {isLoading && !errorMsg && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#111827] text-white">
              <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
              <p className="text-sm font-medium">{loadingMsg.split('\n')[0]}</p>
              {loadingMsg.includes('\n') && (
                <p className="max-w-xs text-center text-xs text-gray-400">
                  {loadingMsg.split('\n')[1]}
                </p>
              )}
            </div>
          )}

          {/* Error overlay */}
          {errorMsg && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[#111827] p-8 text-white">
              <XCircle className="h-12 w-12 text-red-500" />
              <p className="text-lg font-semibold text-red-300">Lỗi kết nối</p>
              <p className="max-w-md text-center text-sm text-gray-300">{errorMsg}</p>
              <div className="flex gap-3">
                {sshHost && (
                  <Button
                    onClick={reloadTerminal}
                    className="rounded-[6px] bg-[#FF6900] shadow-[0_0_1px_1px_rgba(0,0,0,0.05)] hover:bg-[#E55E00]"
                  >
                    Thử lại
                  </Button>
                )}
                <Link href="/instructor/repository/images">
                  <Button
                    variant="outline"
                    className="border-gray-600 text-gray-300 hover:bg-gray-800"
                  >
                    Quay lại
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* ttyd iframe */}
          {ttydUrl && (
            <>
              <iframe
                ref={iframeRef}
                src={ttydUrl}
                title="SSH Terminal"
                allow="clipboard-read; clipboard-write; fullscreen"
                className="absolute inset-0 h-full w-full border-none bg-[#111827]"
                onLoad={() => {
                  // Try to focus the iframe so keyboard events work immediately
                  iframeRef.current?.focus();
                  setTerminalFocused(true);
                }}
                onClick={() => setTerminalFocused(true)}
              />
              {/* Click-to-activate hint — disappears once user clicks inside */}
              {!terminalFocused && (
                <div
                  className="absolute inset-0 z-20 flex cursor-pointer items-end justify-center pb-6"
                  onClick={() => {
                    iframeRef.current?.focus();
                    setTerminalFocused(true);
                  }}
                >
                  <span className="rounded-full bg-black/70 px-4 py-1.5 text-xs text-gray-300 backdrop-blur-sm">
                    Nhấp vào terminal để bắt đầu gõ
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Control Panel 25% ──────────────────────────────────── */}
      <div className="flex flex-[1] flex-col overflow-y-auto bg-white">
        <div className="flex-1 space-y-6 p-5">
          {/* VM Status */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">
              Trạng thái VM
            </h3>
            <div className="flex items-center gap-2 text-sm">
              {sessionStatus === 'STARTING' ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-500" />
                  </span>
                  <span className="font-medium text-yellow-600">Đang khởi động…</span>
                </>
              ) : sessionStatus === 'RUNNING' ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                  </span>
                  <span className="font-medium text-green-600">Đang chạy</span>
                </>
              ) : sessionStatus === 'SNAPSHOTTING' ? (
                <>
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-blue-500" />
                  </span>
                  <span className="font-medium text-blue-600">Đang đóng gói…</span>
                </>
              ) : (
                <>
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className="font-medium text-red-600">
                    {sessionStatus === 'FAILED' ? 'Lỗi' : 'Kết thúc'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* SSH Info */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">
              Thông tin SSH
            </h3>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <dl className="space-y-1 font-mono text-xs text-gray-700">
                {sshHost && (
                  <div className="flex gap-2">
                    <dt className="text-gray-500">Floating IP:</dt>
                    <dd className="font-semibold text-orange-700">{sshHost}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="text-gray-500">User:</dt>
                  <dd className="font-semibold">{vmUsername}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-500">Pass:</dt>
                  <dd className="font-semibold">{vmPassword}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-gray-500">Port:</dt>
                  <dd className="font-semibold">22</dd>
                </div>
              </dl>
              <Button
                onClick={handleCopyCredentials}
                variant="outline"
                size="sm"
                className="mt-3 flex w-full items-center justify-center gap-1.5 text-xs"
              >
                {copied ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? 'Đã copy' : 'Copy thông tin đăng nhập'}
              </Button>
            </div>
            <div className="mt-2 flex gap-2 rounded-md border border-blue-100 bg-blue-50 p-2 text-xs text-blue-700">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                Terminal web SSH (ttyd) kết nối thẳng đến VM. Đăng nhập bằng username/password ở
                trên khi được nhắc.
              </p>
            </div>
          </div>

          {/* Guide */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">
              Hướng dẫn
            </h3>
            <ol className="list-inside list-decimal space-y-1.5 text-xs text-gray-600">
              <li>Chờ máy ảo khởi động (2–3 phút).</li>
              <li>Terminal SSH mở tự động khi máy ảo sẵn sàng.</li>
              <li>
                Dùng <code className="rounded bg-gray-100 px-1">sudo dnf install ...</code> để cài
                phần mềm.
              </li>
              <li>Nhấn Đóng gói khi hoàn tất cấu hình.</li>
            </ol>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2 border-t border-gray-200 bg-gray-50 p-4">
          <Button
            disabled={isLoading || sessionStatus !== 'RUNNING'}
            onClick={() => setShowPublishModal(true)}
            className="flex w-full items-center justify-center gap-2 rounded-[6px] bg-[#FF6900] py-4 text-sm font-bold text-white shadow-[0_0_1px_1px_rgba(0,0,0,0.05)] hover:bg-[#E55E00] disabled:opacity-50"
          >
            <MonitorPlay className="h-4 w-4" />
            ĐÓNG GÓI &amp; TẠO IMAGE
          </Button>
        </div>
      </div>

      {/* ── Publish Modal ──────────────────────────────────────── */}
      {showPublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="mb-1 text-xl font-bold text-gray-900">Đóng gói Image</h2>
            <p className="mb-5 text-sm text-gray-500">
              VM sẽ bị tắt, chụp Snapshot và tự động thu hồi sau khi hoàn thành.
            </p>

            {publishError && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {publishError}
              </div>
            )}

            <form onSubmit={handlePublishSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="pubName">
                  Tên Image <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="pubName"
                  value={publishName}
                  onChange={(e) => setPublishName(e.target.value)}
                  placeholder="VD: Ubuntu 22.04 + Docker"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pubDesc">Mô tả</Label>
                <textarea
                  id="pubDesc"
                  className="flex min-h-[70px] w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  placeholder="VD: Đã cài Docker 24.0, docker-compose…"
                  value={publishDesc}
                  onChange={(e) => setPublishDesc(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Chế độ chia sẻ</Label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-gray-50">
                  <input
                    type="radio"
                    name="vis"
                    value="private"
                    className="mt-0.5"
                    checked={visibility === 'private'}
                    onChange={(e) => setVisibility(e.target.value)}
                  />
                  <div>
                    <div className="text-sm font-semibold">Private — Chỉ mình tôi</div>
                    <div className="text-xs text-gray-500">Chỉ bạn thấy và dùng image này.</div>
                  </div>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-gray-50">
                  <input
                    type="radio"
                    name="vis"
                    value="public"
                    className="mt-0.5"
                    checked={visibility === 'public'}
                    onChange={(e) => setVisibility(e.target.value)}
                  />
                  <div>
                    <div className="text-sm font-semibold">Public — Chia sẻ cho mọi người</div>
                    <div className="text-xs text-gray-500">
                      Gửi yêu cầu duyệt để tất cả instructor cùng dùng.
                    </div>
                  </div>
                </label>
              </div>

              {visibility === 'public' && (
                <div className="flex gap-2 rounded-md border border-amber-100 bg-amber-50 p-2 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    Image sẽ ở trạng thái <strong>Chờ duyệt</strong> cho đến khi Admin phê duyệt.
                    Trong thời gian đó chỉ bạn có thể dùng.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowPublishModal(false);
                    setPublishError(null);
                  }}
                  disabled={isSubmitting}
                >
                  Hủy
                </Button>
                <Button
                  type="submit"
                  className="min-w-40 rounded-[6px] bg-[#FF6900] shadow-[0_0_1px_1px_rgba(0,0,0,0.05)] hover:bg-[#E55E00]"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang đóng gói…
                    </>
                  ) : (
                    'Xác nhận'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomImageLiveConsole(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-gray-50 text-gray-500">
          Đang tải console...
        </div>
      }
    >
      <CustomImageLiveConsoleContent />
    </Suspense>
  );
}
