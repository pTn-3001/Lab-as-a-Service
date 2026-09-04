'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { saveAuth, getWorkspaceUrl } from '../../../lib/auth';
import type { AuthResult } from '../../../lib/auth';

function OAuthCallbackContent() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');
    const userRaw = params.get('user');

    if (!accessToken || !refreshToken || !userRaw) {
      router.replace('/?error=oauth_failed');
      return;
    }

    try {
      const user = JSON.parse(userRaw);
      const result: AuthResult = {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: '1h',
        user,
      };
      saveAuth(result);
      router.replace(getWorkspaceUrl(user.systemRole));
    } catch {
      router.replace('/?error=oauth_failed');
    }
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#152c43]">
      <div className="text-center text-white">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        <p className="text-sm">Đang xử lý đăng nhập...</p>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#152c43]">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          <p className="text-sm">Đang tải...</p>
        </div>
      </div>
    }>
      <OAuthCallbackContent />
    </Suspense>
  );
}
