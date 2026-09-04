'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Calendar,
  ChevronRight,
  Clock,
  GraduationCap,
  Loader2,
  Users,
} from 'lucide-react';
import { StudentLayout } from '@laas-portal/ui';
import { getAccessToken } from '../../../lib/auth';

interface ClassGroup {
  id: string;
  name: string;
  code: string;
  semester: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  maxStudents: number;
  instructor: { id: string; fullName: string; email: string };
  _count: { students: number };
}

function getStatus(g: ClassGroup): { label: string; color: string } {
  if (!g.isActive) return { label: 'Không hoạt động', color: 'bg-gray-50 text-gray-500 border border-gray-100/50' };
  const now = new Date();
  const start = new Date(g.startDate);
  const end = new Date(g.endDate);
  if (start > now) return { label: 'Sắp tới', color: 'bg-blue-50 text-blue-600 border border-blue-100/50' };
  if (end < now) return { label: 'Kết thúc', color: 'bg-emerald-50 text-emerald-600 border border-emerald-100/50' };
  return { label: 'Đang hoạt động', color: 'bg-green-50 text-green-600 border border-green-100/50' };
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function StudentClassesPage() {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const token = getAccessToken();
      const res = await fetch('/api/groups/my-classes?role=STUDENT', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(Array.isArray(data) ? data : data.data ?? []);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <StudentLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Lớp học của tôi</h1>
          <p className="mt-1 text-sm text-gray-500">Các lớp học bạn đang tham gia</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
            <BookOpen className="w-12 h-12" />
            <p className="text-sm">Bạn chưa được đăng ký vào lớp học nào</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => {
              const status = getStatus(g);
              return (
                <Link
                  key={g.id}
                  href={`/student/classes/${g.id}`}
                  className="group bg-white border border-gray-100/80 rounded-2xl p-5 flex flex-col gap-3 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 group-hover:text-green-600 truncate transition-colors">
                        {g.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">{g.code}</p>
                    </div>
                    <span className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.color}`}>
                      {status.label}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="truncate">{g.instructor?.fullName ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>{g.semester}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>{formatDate(g.startDate)} – {formatDate(g.endDate)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>{g._count.students} sinh viên</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end pt-2 border-t border-gray-100">
                    <span className="text-xs font-medium text-green-600 group-hover:text-green-700 inline-flex items-center gap-1">
                      Xem lớp học
                      <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
