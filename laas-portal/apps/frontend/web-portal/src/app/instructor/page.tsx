'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  BookOpen,
  Calendar,
  CheckCircle,
  Clock,
  Database,
  FlaskConical,
  GraduationCap,
  HardDrive,
  Loader2,
  Users,
} from 'lucide-react';
import { InstructorLayout } from '@laas-portal/ui';
import { getAccessToken } from '../../lib/auth';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon: React.ElementType;
  color: string;
}

function StatCard({ title, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-100/60 bg-white p-6 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</p>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 leading-none">{value}</div>
        </div>
        <div className={`rounded-xl p-3 ${color} shadow-sm`}>
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
      </div>
    </div>
  );
}

interface RecentActivity {
  id: string;
  type: 'submission' | 'completion' | 'running' | 'stopped';
  student: string;
  lab: string;
  time: string;
  status: string;
  statusCode: string;
}

interface UpcomingDeadline {
  id: string;
  lab: string;
  class: string;
  deadline: string;
  deadlineText: string;
  submitted: number;
  total: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatRelativeTime(dateStr?: string) {
  if (!dateStr) return 'Vừa xong';
  const now = Date.now();
  const time = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - time) / 1000);
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} ngày trước`;
  return new Date(dateStr).toLocaleDateString('vi-VN');
}

function formatDeadlineText(deadlineStr?: string) {
  if (!deadlineStr) return 'Không có hạn';
  const now = new Date().getTime();
  const dl = new Date(deadlineStr).getTime();
  const diffHours = Math.round((dl - now) / (1000 * 60 * 60));
  if (diffHours < 0) {
    const overdueDays = Math.abs(Math.round(diffHours / 24));
    return overdueDays === 0 ? 'Quá hạn hôm nay' : `Quá hạn ${overdueDays} ngày`;
  }
  if (diffHours < 24) return `Còn ${Math.max(1, diffHours)} giờ`;
  const days = Math.round(diffHours / 24);
  return `Còn ${days} ngày`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function InstructorDashboard() {
  const [stats, setStats] = useState({
    totalClasses: 0,
    totalStudents: 0,
    activeLabs: 0,
    activeSessions: 0,
  });
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [deadlines, setDeadlines] = useState<UpcomingDeadline[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      setLoading(true);
      try {
        const token = getAccessToken();
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        // 1. Fetch instructor classes, all users, and recent sessions in parallel
        const [groupsRes, usersRes, studentsRes, sessionsRes] = await Promise.all([
          fetch('/api/groups/my-classes?role=INSTRUCTOR', { cache: 'no-store', headers }).catch(() => null),
          fetch('/api/users?limit=1000', { cache: 'no-store', headers }).catch(() => null),
          fetch('/api/users/students/list?limit=1000', { cache: 'no-store', headers }).catch(() => null),
          fetch('/api/sessions?limit=100', { cache: 'no-store', headers }).catch(() => null),
        ]);

        const groupsData = groupsRes && groupsRes.ok ? await groupsRes.json() : null;
        const rawGroupsList: any[] = Array.isArray(groupsData)
          ? groupsData
          : Array.isArray(groupsData?.data)
          ? groupsData.data
          : [];

        const usersData = usersRes && usersRes.ok ? await usersRes.json() : null;
        const usersList: any[] = Array.isArray(usersData?.data)
          ? usersData.data
          : Array.isArray(usersData?.items)
          ? usersData.items
          : Array.isArray(usersData)
          ? usersData
          : [];

        const studentsData = studentsRes && studentsRes.ok ? await studentsRes.json() : null;
        const studentsList: any[] = Array.isArray(studentsData?.data)
          ? studentsData.data
          : Array.isArray(studentsData?.items)
          ? studentsData.items
          : Array.isArray(studentsData)
          ? studentsData
          : [];

        const sessionsData = sessionsRes && sessionsRes.ok ? await sessionsRes.json() : null;
        const sessionsList: any[] = Array.isArray(sessionsData?.data)
          ? sessionsData.data
          : Array.isArray(sessionsData)
          ? sessionsData
          : [];

        // Build comprehensive user lookup map (userId -> fullName)
        const userMap = new Map<string, string>();
        for (const u of usersList) {
          if (u?.id) {
            userMap.set(u.id, u.fullName || u.username || u.email);
          }
        }
        for (const s of studentsList) {
          if (s?.id) {
            userMap.set(s.id, s.fullName || s.username || s.email);
          }
        }

        // 2. Fetch group details to get student lists and classLabs for all groups
        const groupDetailPromises = rawGroupsList.map(async (g) => {
          const [detailRes, labsRes] = await Promise.all([
            fetch(`/api/groups/${g.id}`, { cache: 'no-store', headers }).catch(() => null),
            fetch(`/api/class-labs/by-group/${g.id}`, { cache: 'no-store', headers }).catch(() => null),
          ]);

          const detailJson = detailRes && detailRes.ok ? await detailRes.json().catch(() => null) : null;
          const detail = detailJson?.data || detailJson || g;

          const labsJson = labsRes && labsRes.ok ? await labsRes.json().catch(() => null) : null;
          const labsList = Array.isArray(labsJson?.data) ? labsJson.data : Array.isArray(labsJson) ? labsJson : [];

          // Add group students to userMap
          for (const s of (detail.students || [])) {
            if (s?.id) {
              userMap.set(s.id, s.fullName || s.username || s.email);
            }
          }

          return {
            ...detail,
            labs: labsList,
          };
        });

        const detailedGroups = await Promise.all(groupDetailPromises);

        // Filter active classes (isActive === true and endDate >= now or not set)
        const now = new Date();
        const activeGroups = detailedGroups.filter((g) => {
          if (g.isActive === false) return false;
          if (g.endDate) {
            const end = new Date(g.endDate);
            if (end < now) return false;
          }
          return true;
        });

        // 3. Compute stats
        const totalClasses = rawGroupsList.length;
        const allUniqueStudents = new Set<string>();
        for (const g of detailedGroups) {
          for (const s of (g.students || [])) {
            if (s?.id) allUniqueStudents.add(s.id);
          }
        }
        const totalStudents = allUniqueStudents.size > 0
          ? allUniqueStudents.size
          : rawGroupsList.reduce((sum, g) => sum + (g._count?.students ?? 0), 0);

        let totalAssignedLabs = 0;
        const allDeadlines: UpcomingDeadline[] = [];

        // Collect upcoming deadlines for all ACTIVE classes
        for (const g of activeGroups) {
          totalAssignedLabs += (g.labs || []).length;
          const studentCount = (g.students || []).length || g._count?.students || 0;

          for (const cl of (g.labs || [])) {
            if (cl.deadline) {
              const labTemplateId = cl.labTemplateId || cl.labTemplate?.id;
              const completedCount = sessionsList.filter(
                (sess) =>
                  (sess.module?.labTemplateId === labTemplateId || sess.module?.labTemplate?.id === labTemplateId) &&
                  sess.status === 'COMPLETED'
              ).length;

              allDeadlines.push({
                id: cl.id,
                lab: cl.labTemplate?.name || cl.name || 'Lab',
                class: g.name,
                deadline: cl.deadline,
                deadlineText: formatDeadlineText(cl.deadline),
                submitted: Math.min(completedCount, Math.max(studentCount, 1)),
                total: Math.max(studentCount, 1),
              });
            }
          }
        }

        // Sort deadlines: future/upcoming first (ascending date), then past
        allDeadlines.sort((a, b) => {
          const timeA = new Date(a.deadline).getTime();
          const timeB = new Date(b.deadline).getTime();
          const nowMs = now.getTime();
          const isAFuture = timeA >= nowMs;
          const isBFuture = timeB >= nowMs;
          if (isAFuture && !isBFuture) return -1;
          if (!isAFuture && isBFuture) return 1;
          return timeA - timeB;
        });

        // 4. Process Recent Activities with resolved student names
        const recentActs: RecentActivity[] = sessionsList.slice(0, 10).map((sess) => {
          const studentName = userMap.get(sess.userId) || sess.user?.fullName || sess.user?.username || 'Học viên';
          const labName = sess.module?.labTemplate?.name || sess.module?.name || 'Bài thực hành';
          const time = formatRelativeTime(sess.startedAt || sess.createdAt);

          let type: 'submission' | 'completion' | 'running' | 'stopped' = 'running';
          let status = 'Đang chạy';
          if (sess.status === 'COMPLETED') {
            type = 'completion';
            status = 'Hoàn thành';
          } else if (sess.status === 'STOPPED') {
            type = 'stopped';
            status = 'Đã dừng';
          } else if (sess.status === 'STARTING') {
            type = 'running';
            status = 'Đang khởi tạo';
          }

          return {
            id: sess.id,
            type,
            student: studentName,
            lab: labName,
            time,
            status,
            statusCode: sess.status || 'RUNNING',
          };
        });

        const activeSessions = sessionsList.filter((s) => s.status === 'RUNNING' || s.status === 'STARTING').length;

        if (isMounted) {
          setStats({
            totalClasses,
            totalStudents,
            activeLabs: totalAssignedLabs,
            activeSessions,
          });
          setDeadlines(allDeadlines);
          setActivities(recentActs);
        }
      } catch (err) {
        console.error('Error fetching instructor dashboard stats:', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    void loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <InstructorLayout>
      <div className="p-6 lg:p-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Chào mừng trở lại! Đây là tổng quan về các hoạt động giảng dạy của bạn.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Tổng số lớp"
            value={loading ? <Loader2 className="w-6 h-6 animate-spin text-blue-400 my-1" /> : stats.totalClasses}
            icon={BookOpen}
            color="bg-blue-50/50 border border-blue-100/30 text-blue-600"
          />
          <StatCard
            title="Tổng học viên"
            value={loading ? <Loader2 className="w-6 h-6 animate-spin text-emerald-400 my-1" /> : stats.totalStudents}
            icon={Users}
            color="bg-emerald-50/50 border border-emerald-100/30 text-emerald-600"
          />
          <StatCard
            title="Lab đã giao"
            value={loading ? <Loader2 className="w-6 h-6 animate-spin text-purple-400 my-1" /> : stats.activeLabs}
            icon={FlaskConical}
            color="bg-purple-50/50 border border-purple-100/30 text-purple-600"
          />
          <StatCard
            title="Đang thực hành"
            value={loading ? <Loader2 className="w-6 h-6 animate-spin text-orange-400 my-1" /> : stats.activeSessions}
            icon={Activity}
            color="bg-orange-50/50 border border-orange-100/30 text-orange-600"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent Activities */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-100/60 bg-white shadow-sm hover:shadow-md transition-all duration-300">
              <div className="border-b border-slate-100/60 p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">Hoạt động gần đây</h2>
                  <p className="text-xs text-slate-400 mt-1">Các phiên thực hành mới nhất của học viên</p>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-sm">
                  <Clock className="w-8 h-8 mb-2 opacity-40" />
                  <p>Chưa có hoạt động thực hành nào gần đây</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50/80 px-6 max-h-[460px] overflow-y-auto">
                  {activities.map((activity) => (
                    <div key={activity.id} className="py-4 hover:bg-slate-50/30 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex gap-3.5 items-center">
                          <div
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                              activity.type === 'completion'
                                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100/30'
                                : activity.type === 'running'
                                ? 'bg-blue-50 text-blue-600 border border-blue-100/30'
                                : 'bg-slate-50 text-slate-500 border border-slate-100/50'
                            }`}
                          >
                            {activity.type === 'completion' ? (
                              <CheckCircle className="h-4.5 w-4.5" strokeWidth={1.5} />
                            ) : activity.type === 'running' ? (
                              <FlaskConical className="h-4.5 w-4.5" strokeWidth={1.5} />
                            ) : (
                              <Clock className="h-4.5 w-4.5" strokeWidth={1.5} />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-slate-900">
                              {activity.student}{' '}
                              <span className="font-normal text-slate-500">
                                {activity.type === 'completion'
                                  ? 'đã hoàn thành phiên lab'
                                  : activity.type === 'running'
                                  ? 'đang thực hành lab'
                                  : 'đã kết thúc phiên lab'}
                              </span>
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">{activity.lab}</p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                              activity.type === 'completion'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100/40'
                                : activity.type === 'running'
                                ? 'bg-blue-50 text-blue-700 border-blue-100/40'
                                : 'bg-slate-50 text-slate-600 border-slate-200/40'
                            }`}
                          >
                            {activity.status}
                          </span>
                          <span className="text-[10px] text-slate-400">{activity.time}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-50 p-4">
                <Link
                  href="/instructor/classes"
                  className="block text-center text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-wider"
                >
                  Xem chi tiết các lớp học →
                </Link>
              </div>
            </div>
          </div>

          {/* Upcoming Deadlines */}
          <div className="lg:col-span-1">
            <div className="rounded-2xl border border-slate-100/60 bg-white shadow-sm hover:shadow-md transition-all duration-300">
              <div className="border-b border-slate-100/60 p-6">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 tracking-tight">
                  <Calendar className="h-4.5 w-4.5 text-blue-500" strokeWidth={1.5} />
                  Deadline sắp tới
                </h2>
                <p className="text-xs text-slate-400 mt-1">Từ các lớp học đang hoạt động</p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : deadlines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 text-sm">
                  <Calendar className="w-8 h-8 mb-2 opacity-40" />
                  <p>Chưa có hạn nộp lab nào được giao</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50/80 px-6 max-h-[460px] overflow-y-auto">
                  {deadlines.map((deadline) => {
                    const pct = deadline.total > 0 ? Math.round((deadline.submitted / deadline.total) * 100) : 0;
                    return (
                      <div key={deadline.id} className="py-4">
                        <h3 className="font-semibold text-sm text-slate-900 truncate">{deadline.lab}</h3>
                        <p className="mt-0.5 text-xs text-slate-400">{deadline.class}</p>
                        <div className="mt-2 flex items-center gap-1.5 text-xs">
                          <Clock className="h-3.5 w-3.5 text-amber-500" strokeWidth={1.5} />
                          <span className="font-semibold text-amber-600 bg-amber-50 border border-amber-100/30 rounded px-1.5 py-0.5 text-[11px]">
                            {deadline.deadlineText}
                          </span>
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-slate-400">
                            <span>Đã hoàn thành</span>
                            <span className="font-bold text-slate-900">
                              {deadline.submitted}/{deadline.total}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-1.5 rounded-full bg-blue-500 transition-all duration-500 ease-out"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="border-t border-slate-50 p-4">
                <Link
                  href="/instructor/classes"
                  className="block text-center text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors uppercase tracking-wider"
                >
                  Xem danh sách lớp học →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <h2 className="mb-4 text-base font-bold text-slate-900 tracking-tight">Thao tác nhanh</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Link
              href="/instructor/labs/new"
              className="flex items-center gap-3 rounded-2xl border border-slate-100/60 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
            >
              <div className="rounded-xl bg-blue-50/50 border border-blue-100/30 p-3 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-300">
                <FlaskConical className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors">Tạo Lab mới</p>
                <p className="text-xs text-slate-400">Tạo lab template</p>
              </div>
            </Link>

            <Link
              href="/instructor/classes"
              className="flex items-center gap-3 rounded-2xl border border-slate-100/60 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
            >
              <div className="rounded-xl bg-emerald-50/50 border border-emerald-100/30 p-3 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                <GraduationCap className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-900 group-hover:text-emerald-600 transition-colors">Quản lý Lớp học</p>
                <p className="text-xs text-slate-400">Giao lab & chấm điểm</p>
              </div>
            </Link>

            <Link
              href="/instructor/labs"
              className="flex items-center gap-3 rounded-2xl border border-slate-100/60 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
            >
              <div className="rounded-xl bg-purple-50/50 border border-purple-100/30 p-3 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors duration-300">
                <Database className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-900 group-hover:text-purple-600 transition-colors">Lab Templates</p>
                <p className="text-xs text-slate-400">Danh sách bài lab</p>
              </div>
            </Link>

            <Link
              href="/instructor/repository/images"
              className="flex items-center gap-3 rounded-2xl border border-slate-100/60 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
            >
              <div className="rounded-xl bg-orange-50/50 border border-orange-100/30 p-3 text-orange-600 group-hover:bg-orange-600 group-hover:text-white transition-colors duration-300">
                <HardDrive className="h-5 w-5" strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-900 group-hover:text-orange-600 transition-colors">Quản lý Images</p>
                <p className="text-xs text-slate-400">VM & OS templates</p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </InstructorLayout>
  );
}
