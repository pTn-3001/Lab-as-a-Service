'use client';

import { type JSX, Suspense, useEffect, useRef, useState } from 'react';

import { AlertTriangle, ExternalLink, Loader2, RefreshCcw, TerminalSquare } from 'lucide-react';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { openGuacamoleConnection } from '../../../../lib/guacamole-actions';

function TerminalPageContent(): JSX.Element {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasAutoConnected = useRef(false);

  const host = searchParams.get('host')?.trim() ?? '';
  const port = searchParams.get('port')?.trim() || '22';
  const username = searchParams.get('username')?.trim() || undefined;
  const password = searchParams.get('password')?.trim() || undefined;

  const connect = async () => {
    if (!host) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await openGuacamoleConnection({
        host,
        port: Number(port),
        connectionName: `SSH_${host}_${Date.now()}`,
        clientOrigin: window.location.origin,
        username,
        password,
      });
      if (!result.success) throw new Error(result.message);
      // Redirect current tab — this page was already opened in a new tab from the resources page.
      window.location.href = result.guacamoleUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
    }
  };

  // Auto-connect once on mount when all credentials are present in URL.
  // Deps intentionally empty: URL params are fixed at page load; connect is stable via ref guard.
  useEffect(() => {
    if (host && username && password && !hasAutoConnected.current) {
      hasAutoConnected.current = true;
      void connect();
    }
  }, []);

  if (!host) {
    return (
      <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>Thiếu thông tin kết nối. Vui lòng quay lại trang tài nguyên và bấm SSH lại.</span>
        </div>
        <Link
          href="/admin/labs"
          className="inline-flex items-center rounded-md border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100"
        >
          Quay lại danh sách lab
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
            <TerminalSquare className="h-6 w-6 text-orange-700" />
            Terminal SSH
          </h1>
          <p className="text-sm text-gray-500">
            {host}:{port}{username ? ` — ${username}` : ''}
          </p>
        </div>
        <button
          onClick={() => void connect()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-md bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang kết nối...
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4" />
              {error ? <><RefreshCcw className="h-4 w-4" /> Thử lại</> : 'Mở Guacamole'}
            </>
          )}
        </button>
      </div>

      {isLoading && !error && (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin text-orange-600" />
          <span>Đang tạo kết nối Guacamole và chuyển hướng…</span>
        </div>
      )}

      {error && (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <p className="font-medium">Lỗi kết nối Guacamole</p>
              <p className="mt-1 text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TerminalPage(): JSX.Element {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Đang tải terminal...</div>}>
      <TerminalPageContent />
    </Suspense>
  );
}
