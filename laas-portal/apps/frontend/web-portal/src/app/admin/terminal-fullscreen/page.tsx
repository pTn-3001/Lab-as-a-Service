'use client';

import { useEffect, useState, Suspense } from 'react';

import { useSearchParams } from 'next/navigation';

function TerminalFullscreenPageContent() {
  const searchParams = useSearchParams();

  const host = searchParams.get('host')?.trim() ?? '';
  const port = searchParams.get('port')?.trim() || '22';

  const [iframeSrc, setIframeSrc] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!host) return;

    const fetchGuacamoleUrl = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const query = new URLSearchParams({
          host,
          port,
          connectionName: `SSH_${host}_${Date.now()}`,
        });

        const response = await fetch(`/api/guacamole/quickconnect?${query.toString()}`);
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.message || 'Failed to create Guacamole connection');
        }

        setIframeSrc(data.guacamoleUrl);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMessage);
        console.error('Failed to fetch Guacamole URL:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchGuacamoleUrl();
  }, [host, port]);

  if (!host) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-red-400">Missing required connection parameters.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-gray-400">Đang kết nối tới Guacamole...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-red-400">Lỗi kết nối: {error}</p>
        </div>
      </div>
    );
  }

  if (!iframeSrc) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-900">
        <div className="text-center">
          <p className="text-gray-400">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-black">
      <iframe
        title="Guacamole Terminal Full Screen"
        src={iframeSrc}
        className="h-full w-full"
        referrerPolicy="no-referrer"
        allow="fullscreen"
      />
    </div>
  );
}

export default function TerminalFullscreenPage() {
  return (
    <Suspense fallback={<div className="flex h-screen w-full items-center justify-center bg-gray-900 text-gray-400">Đang tải terminal...</div>}>
      <TerminalFullscreenPageContent />
    </Suspense>
  );
}
