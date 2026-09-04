'use client';

/**
 * Legacy redirect: Practice was moved from /student/labs/[id]/practice
 * to /student/my-labs/[id]/practice for correct navigation context.
 * This page redirects any old/bookmarked links to the new location.
 */

import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function RedirectContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const labId = Array.isArray(params.id) ? params.id[0] : params.id;
    const qs = searchParams.toString();
    const target = `/student/my-labs/${labId}/practice${qs ? `?${qs}` : ''}`;
    router.replace(target);
  }, [params, searchParams, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-900">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-green-500" />
        <p className="mt-3 text-sm text-gray-400">Đang chuyển hướng...</p>
      </div>
    </div>
  );
}

export default function LegacyPracticePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-gray-900">
          <Loader2 className="h-8 w-8 animate-spin text-green-500" />
        </div>
      }
    >
      <RedirectContent />
    </Suspense>
  );
}
