'use client';

import { BookOpen, Calendar, ChevronRight, Clock, Loader2, Users } from 'lucide-react';

import React, { useEffect, useState } from 'react';

import Link from 'next/link';

import { Button, InstructorLayout, SearchBar } from '@laas-portal/ui';
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
  _count: { students: number };
}

type StatusFilter = 'all' | 'active' | 'upcoming' | 'completed';

function getStatus(g: ClassGroup): 'active' | 'upcoming' | 'completed' | 'inactive' {
  if (!g.isActive) return 'inactive';
  const now = new Date();
  const start = new Date(g.startDate);
  const end = new Date(g.endDate);
  if (start > now) return 'upcoming';
  if (end < now) return 'completed';
  return 'active';
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function InstructorClassesPage() {
  const [groups, setGroups] = useState<ClassGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const token = getAccessToken();
      const res = await fetch('/api/groups/my-classes?role=INSTRUCTOR', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(Array.isArray(data) ? data : data.data ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const filtered = groups.filter((g) => {
    const matchSearch =
      g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.code.toLowerCase().includes(searchQuery.toLowerCase());
    const status = getStatus(g);
    const matchStatus = filterStatus === 'all' || filterStatus === status;
    return matchSearch && matchStatus;
  });

  return (
    <InstructorLayout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Lớp học của tôi</h1>
          <p className="mt-2 text-gray-600">Quản lý các lớp học và khóa học bạn đang phụ trách</p>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 lg:max-w-md">
            <SearchBar
              placeholder="Tìm kiếm lớp học..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            {(['all', 'active', 'upcoming', 'completed'] as const).map((s) => (
              <Button
                key={s}
                variant={filterStatus === s ? 'default' : 'outline'}
                onClick={() => setFilterStatus(s)}
                className="px-4"
              >
                {s === 'all' ? 'Tất cả' : s === 'active' ? 'Đang hoạt động' : s === 'upcoming' ? 'Sắp tới' : 'Kết thúc'}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((g) => {
                const status = getStatus(g);
                return (
                  <Link
                    key={g.id}
                    href={`/instructor/classes/${g.id}`}
                    className="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md"
                  >
                    <div className="mb-4 flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 truncate">
                          {g.name}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">{g.code}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                          status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : status === 'upcoming'
                              ? 'bg-blue-100 text-blue-800'
                              : status === 'completed'
                                ? 'bg-gray-100 text-gray-800'
                                : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {status === 'active' ? 'Đang hoạt động' : status === 'upcoming' ? 'Sắp tới' : status === 'completed' ? 'Kết thúc' : 'Không hoạt động'}
                      </span>
                    </div>

                    <div className="mb-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Users className="h-4 w-4" />
                        <span>{g._count.students}/{g.maxStudents} sinh viên</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>{g.semester}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="h-4 w-4" />
                        <span>{formatDate(g.startDate)} - {formatDate(g.endDate)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-gray-200 pt-4">
                      <span className="text-sm font-medium text-blue-600 group-hover:text-blue-700">
                        Xem chi tiết
                      </span>
                      <ChevronRight className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
                    </div>
                  </Link>
                );
              })}
            </div>

            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                  <BookOpen className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">Không tìm thấy lớp học</h3>
                <p className="text-gray-600">Thử điều chỉnh bộ lọc hoặc tìm kiếm khác</p>
              </div>
            )}
          </>
        )}
      </div>
    </InstructorLayout>
  );
}
