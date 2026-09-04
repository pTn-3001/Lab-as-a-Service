'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function RequestsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/instructor/labs?tab=requests');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="text-sm font-medium">Đang chuyển hướng đến danh sách yêu cầu lab...</p>
      </div>
    </div>
  );
}
