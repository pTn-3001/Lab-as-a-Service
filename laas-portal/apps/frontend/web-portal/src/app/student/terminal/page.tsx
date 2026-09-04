'use client';

import { AlertTriangle, ExternalLink, Loader2, TerminalSquare } from 'lucide-react';

import { useState, Suspense } from 'react';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { openGuacamoleConnection } from '../../../lib/guacamole-actions';

function TerminalPageContent() {
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const host = searchParams.get('host')?.trim() ?? '';
  const port = searchParams.get('port')?.trim() || '2201';
  const username = searchParams.get('username')?.trim() || undefined;

  const handleOpenGuacamole = async () => {
    setIsLoading(true);
    setError(null);

    const newTab = window.open('about:blank', '_blank');

    try {
      const result = await openGuacamoleConnection({
        host,
        port: Number(port),
        connectionName: `SSH_${host}_${Date.now()}`,
        clientOrigin: window.location.origin,
        username,
      });

      if (!result.success) {
        throw new Error(result.message);
      }

      if (newTab && !newTab.closed) {
        newTab.location.href = result.guacamoleUrl;
      } else {
        window.location.href = result.guacamoleUrl;
      }
    } catch (err) {
      if (newTab && !newTab.closed) newTab.close();
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  if (!host) {
    return (
      <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <span>
            Thiếu thông tin kết nối để mở terminal. Vui lòng quay lại trang lab và bấm SSH lại.
          </span>
        </div>
        <Link
          href="/student/my-labs"
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
            Guacamole quickconnect to VM host {host}:{port}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenGuacamole}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-md bg-orange-700 px-4 py-2 text-sm font-medium text-white hover:bg-orange-800 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang mở...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                Mở Guacamole
              </>
            )}
          </button>
          <Link
            href="/student/my-labs"
            className="inline-flex items-center rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Quay lại danh sách lab
          </Link>
        </div>
      </div>

      {error && (
        <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div>
              <p className="font-medium">Lỗi kết nối Guacamole</p>
              <p className="mt-1 text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Hướng dẫn</h2>
        <ul className="space-y-2 text-sm text-gray-600">
          <li>1. Click &quot;Mở Guacamole&quot; ở trên để mở Guacamole client</li>
          <li>2. Guacamole sẽ kết nối sẵn tới VM host/port đã chọn</li>
          <li>3. Đăng nhập bằng credentials của VM trong cửa sổ Guacamole, ví dụ: node1 / 1234</li>
        </ul>
      </div>
    </div>
  );
}

export default function TerminalPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Đang tải terminal...</div>}>
      <TerminalPageContent />
    </Suspense>
  );
}
