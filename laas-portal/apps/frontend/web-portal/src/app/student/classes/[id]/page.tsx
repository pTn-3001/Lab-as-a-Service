'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  FlaskConical,
  GraduationCap,
  Loader2,
  MapPin,
  Play,
  Users,
} from 'lucide-react';
import { Button, StudentLayout } from '@laas-portal/ui';
import { getAccessToken, getStoredUser } from '../../../../lib/auth';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ClassGroup {
  id: string;
  name: string;
  code: string;
  description: string;
  semester: string;
  schedule: string;
  location: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  maxStudents: number;
  instructor: { id: string; fullName: string; email: string };
  _count: { students: number };
}

interface LabTemplate {
  id: string;
  name: string;
  description?: string;
  modules?: {
    id: string;
    name: string;
    orderNo: number;
    definitionJson: any;
  }[];
}

interface ClassLab {
  id: string;
  labTemplateId: string;
  deadline: string;
  isRequired: boolean;
  labTemplate: LabTemplate;
}

interface LabGrade {
  classLabId: string;
  earnedPoints: number;
  totalPoints: number;
  percentage: number;
  completedCheckpoints: number;
  totalCheckpoints: number;
  status: string;
  checkpointSnapshots: unknown[];
}

type Tab = 'labs' | 'info';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isOverdue(deadline: string) {
  return new Date(deadline) < new Date();
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function StudentClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);

  const [group, setGroup] = useState<ClassGroup | null>(null);
  const [classLabs, setClassLabs] = useState<ClassLab[]>([]);
  const [grades, setGrades] = useState<Record<string, LabGrade>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('labs');
  const [expandedLabs, setExpandedLabs] = useState<Record<string, boolean>>({});

  const toggleLabExpand = (clId: string) => {
    setExpandedLabs((prev) => ({ ...prev, [clId]: !prev[clId] }));
  };

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const [activeSessionLabIds, setActiveSessionLabIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [groupRes, labsRes] = await Promise.all([
          fetch(`/api/groups/${id}`, { headers: authHeaders() }),
          fetch(`/api/class-labs/by-group/${id}`, { headers: authHeaders() }),
        ]);
        if (groupRes.ok) setGroup(await groupRes.json());

        let currentClassLabs: ClassLab[] = [];
        if (labsRes.ok) {
          const data = await labsRes.json();
          currentClassLabs = data.data ?? data;
          setClassLabs(currentClassLabs);
        }

        // Fetch grades & sessions
        const userId = getStoredUser()?.id;
        if (userId) {
          const [gradesRes, sessRes] = await Promise.all([
            fetch(`/api/grades/my-grades/${id}`, {
              headers: { ...authHeaders(), 'x-user-id': userId },
            }).catch(() => null),
            fetch(`/api/sessions?userId=${userId}&limit=200`, {
              headers: authHeaders(),
            }).catch(() => null),
          ]);

          const gradeList: LabGrade[] = gradesRes && gradesRes.ok ? ((await gradesRes.json())?.data ?? []) : [];
          const sessList: any[] = sessRes && sessRes.ok ? ((await sessRes.json())?.data ?? []) : [];

          const activeIds = new Set<string>();
          for (const s of sessList) {
            if (s.status === 'RUNNING' || s.status === 'STARTING') {
              if (s.module?.labTemplateId) activeIds.add(s.module.labTemplateId);
              if (s.module?.labTemplate?.id) activeIds.add(s.module.labTemplate.id);
            }
          }
          setActiveSessionLabIds(activeIds);

          const map: Record<string, LabGrade> = {};
          gradeList.forEach((g) => { map[g.classLabId] = g; });

          // Enhance / populate map with session checkpoint progress
          for (const cl of currentClassLabs) {
            const existingGrade = map[cl.id];
            const modules = cl.labTemplate?.modules ?? [];
            let templateTotalCheckpoints = 0;
            let templateTotalPoints = 0;
            const allCps: { id: string; name: string; points: number }[] = [];

            for (const mod of modules) {
              const cps = mod.definitionJson?.checkpoints ?? [];
              for (const cp of cps) {
                const pts = cp.points && cp.points > 0 ? cp.points : 10;
                templateTotalCheckpoints += 1;
                templateTotalPoints += pts;
                allCps.push({
                  id: cp.id,
                  name: cp.name ? `[${mod.name}] ${cp.name}` : `Checkpoint`,
                  points: pts,
                });
              }
            }

            const studentCompletedCpSet = new Set<string>();
            let hasAnySessionForLab = false;
            for (const s of sessList) {
              const matchesLab = s.module?.labTemplateId === cl.labTemplateId || s.module?.labTemplate?.id === cl.labTemplateId;
              if (matchesLab) {
                hasAnySessionForLab = true;
                for (const cp of (s.CheckpointProgress || [])) {
                  if (cp.status === 'COMPLETED') studentCompletedCpSet.add(cp.checkpointId);
                }
              }
            }

            const snapshotMap = new Map(((existingGrade?.checkpointSnapshots || []) as any[]).map((s: any) => [s.checkpointId, s]));
            const mergedSnapshots = allCps.map((cp) => {
              const ex = snapshotMap.get(cp.id);
              const isComp = ex?.status === 'COMPLETED' || studentCompletedCpSet.has(cp.id);
              return {
                checkpointId: cp.id,
                checkpointName: ex?.checkpointName || cp.name,
                points: ex?.points || cp.points,
                status: isComp ? 'COMPLETED' : (ex?.status || 'PENDING'),
              };
            });

            const completedCp = mergedSnapshots.filter((s) => s.status === 'COMPLETED').length;
            const earnedPts = mergedSnapshots.filter((s) => s.status === 'COMPLETED').reduce((acc, s) => acc + (s.points || 10), 0);
            const totalCp = templateTotalCheckpoints > 0 ? templateTotalCheckpoints : (existingGrade?.totalCheckpoints || 0);
            const totalPts = templateTotalPoints > 0 ? templateTotalPoints : (existingGrade?.totalPoints || 0);
            const pct = totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : (totalCp > 0 ? Math.round((completedCp / totalCp) * 100) : 0);

            const isCurrentlyActive = activeIds.has(cl.labTemplateId) || activeIds.has(cl.labTemplate?.id);
            let status = 'NOT_STARTED';
            if (existingGrade?.status === 'GRADED') {
              status = 'GRADED';
            } else if ((completedCp === totalCp && totalCp > 0) || existingGrade?.status === 'COMPLETED') {
              status = 'COMPLETED';
            } else if (isCurrentlyActive) {
              status = 'IN_PROGRESS';
            } else if (completedCp > 0 || hasAnySessionForLab || existingGrade) {
              status = 'FINISHED';
            }

            if (completedCp > 0 || hasAnySessionForLab || existingGrade) {
              map[cl.id] = {
                classLabId: cl.id,
                earnedPoints: earnedPts,
                totalPoints: totalPts,
                percentage: pct,
                completedCheckpoints: completedCp,
                totalCheckpoints: totalCp,
                status,
                checkpointSnapshots: mergedSnapshots,
              };
            }
          }

          setGrades(map);
        }
      } catch (err) {
        console.error('Error loading class data/grades:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, authHeaders]);

  if (loading) {
    return (
      <StudentLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </StudentLayout>
    );
  }

  if (!group) {
    return (
      <StudentLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-gray-600">Không tìm thấy lớp học</p>
          <Link href="/student/classes"><Button>Quay lại</Button></Link>
        </div>
      </StudentLayout>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'labs', label: 'Virtual Labs', icon: <FlaskConical className="w-4 h-4" /> },
    { key: 'info', label: 'Thông tin lớp', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <StudentLayout>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Back */}
        <Link
          href="/student/classes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách lớp
        </Link>

        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                {group.code}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-gray-400" />
                {group.instructor?.fullName ?? '—'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                {group.semester}
              </span>
              {group.schedule && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-gray-400" />
                  {group.schedule}
                </span>
              )}
              {group.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-gray-400" />
                  {group.location}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-4 h-4 text-gray-400" />
                {group._count.students} sinh viên
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-1 -mb-px">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === t.key
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.icon}
                {t.label}
                {t.key === 'labs' && classLabs.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{classLabs.length}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab: Labs */}
        {activeTab === 'labs' && (
          <div className="space-y-3">
            {classLabs.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center py-16 text-gray-400">
                <FlaskConical className="w-10 h-10 mb-2" />
                <p className="text-sm">Chưa có lab nào được giao</p>
              </div>
            ) : (
              classLabs.map((cl) => {
                const overdue = isOverdue(cl.deadline);
                const grade = grades[cl.id];
                const hasGrade = !!grade;
                const pct = grade?.percentage ?? 0;
                const isCurrentlyActive = activeSessionLabIds.has(cl.labTemplateId) || activeSessionLabIds.has(cl.labTemplate?.id);
                const isDone = hasGrade && grade.status !== 'NOT_STARTED';

                return (
                  <div key={cl.id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-medium text-gray-900">{cl.labTemplate.name}</h3>
                          {cl.isRequired && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                              <AlertCircle className="w-3 h-3" />Bắt buộc
                            </span>
                          )}
                          {isCurrentlyActive && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                              Đang làm
                            </span>
                          )}
                        </div>
                        {cl.labTemplate.description && (
                          <p className="text-sm text-gray-500 line-clamp-2 mb-2">{cl.labTemplate.description}</p>
                        )}
                        <div className="flex items-center gap-1.5 text-xs">
                          {overdue ? (
                            <span className="text-red-500 inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />Hạn: {formatDate(cl.deadline)} (Quá hạn)
                            </span>
                          ) : (
                            <span className="text-gray-500 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />Hạn: {formatDate(cl.deadline)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action: Button if active/not started, or Badge if already done */}
                      {isCurrentlyActive ? (
                        <Link href={`/student/my-labs/${cl.labTemplateId}?classLabId=${cl.id}&groupId=${id}`} className="shrink-0">
                          <Button className="inline-flex items-center gap-2 text-sm">
                            <Play className="w-4 h-4" />
                            Tiếp tục
                          </Button>
                        </Link>
                      ) : isDone ? (
                        <div className="shrink-0">
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60 shadow-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            {grade.status === 'COMPLETED' || grade.status === 'GRADED' ? 'Hoàn thành' : 'Đã làm'}
                          </span>
                        </div>
                      ) : (
                        <Link href={`/student/my-labs/${cl.labTemplateId}?classLabId=${cl.id}&groupId=${id}`} className="shrink-0">
                          <Button className="inline-flex items-center gap-2 text-sm">
                            <Play className="w-4 h-4" />
                            Làm lab
                          </Button>
                        </Link>
                      )}
                    </div>
                    {hasGrade && (
                      <div className="pt-2 border-t border-gray-100 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500">
                            Checkpoint: {grade.completedCheckpoints}/{grade.totalCheckpoints}
                          </span>
                          <span className="font-semibold text-gray-900">
                            {grade.earnedPoints}/{grade.totalPoints} điểm ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-500"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        {/* Toggle Button */}
                        {grade.checkpointSnapshots && grade.checkpointSnapshots.length > 0 && (
                          <div className="mt-2">
                            <button
                              onClick={() => toggleLabExpand(cl.id)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors focus:outline-none"
                            >
                              <span>{expandedLabs[cl.id] ? 'Ẩn chi tiết checkpoints' : 'Xem chi tiết checkpoints'}</span>
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                expandedLabs[cl.id] ? 'rotate-180' : ''
                              }`} />
                            </button>
                          </div>
                        )}

                        {/* Checkpoint list breakdown */}
                        {grade.checkpointSnapshots && grade.checkpointSnapshots.length > 0 && expandedLabs[cl.id] && (
                          <div className="mt-2.5 pt-2.5 border-t border-gray-100/50 space-y-4">
                            {cl.labTemplate.modules && cl.labTemplate.modules.length > 0 ? (
                              cl.labTemplate.modules.map((mod) => {
                                const moduleCps = mod.definitionJson?.checkpoints || [];
                                const moduleSnapshots = moduleCps.map((cp: any) => {
                                  const snapshots = (grade.checkpointSnapshots || []) as any[];
                                  const snapshot = snapshots.find((s: any) => s.checkpointId === cp.id);
                                  return {
                                    checkpointId: cp.id,
                                    checkpointName: cp.name || cp.checkpointName,
                                    points: cp.points || 0,
                                    status: snapshot?.status || 'PENDING',
                                  };
                                });
                                const completedCount = moduleSnapshots.filter((s: any) => s.status === 'COMPLETED').length;
                                const earned = moduleSnapshots.filter((s: any) => s.status === 'COMPLETED').reduce((sum: number, s: any) => sum + s.points, 0);
                                const total = moduleSnapshots.reduce((sum: number, s: any) => sum + s.points, 0);

                                return (
                                  <div key={mod.id} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs font-semibold text-gray-700 bg-gray-50 px-2.5 py-1 rounded">
                                      <span>Module {mod.orderNo}: {mod.name}</span>
                                      <span className="text-[10px] text-gray-500 font-medium">
                                        Đạt {completedCount}/{moduleCps.length} cp ({earned}/{total}đ)
                                      </span>
                                    </div>
                                    {moduleSnapshots.length === 0 ? (
                                      <p className="text-[11px] text-gray-400 italic pl-4">Không có checkpoint</p>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs pl-2">
                                        {moduleSnapshots.map((cp: any) => (
                                          <div key={cp.checkpointId} className="flex items-center justify-between py-1 px-2.5 rounded bg-gray-50 border border-gray-100/30">
                                            <span className="text-gray-700 truncate mr-2 font-medium">
                                              • {cp.checkpointName} <span className="text-gray-400 text-[10px]">({cp.points}đ)</span>
                                            </span>
                                            <span className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-full ${
                                              cp.status === 'COMPLETED'
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-gray-100 text-gray-400'
                                            }`}>
                                              {cp.status === 'COMPLETED' ? 'Hoàn thành' : 'Chưa đạt'}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            ) : (
                              // Fallback flat list if modules data is not loaded
                              <div>
                                <p className="text-[11px] font-bold text-gray-400 mb-1.5 uppercase tracking-wider">Chi tiết checkpoints:</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                                  {grade.checkpointSnapshots.map((cp: any) => (
                                    <div key={cp.checkpointId} className="flex items-center justify-between py-1 px-2.5 rounded bg-gray-50 border border-gray-100/30">
                                      <span className="text-gray-700 truncate mr-2 font-medium">
                                        • {cp.checkpointName} <span className="text-gray-400 text-[10px]">({cp.points}đ)</span>
                                      </span>
                                      <span className={`text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded-full ${
                                        cp.status === 'COMPLETED'
                                          ? 'bg-emerald-50 text-emerald-700'
                                          : 'bg-gray-100 text-gray-400'
                                      }`}>
                                        {cp.status === 'COMPLETED' ? 'Hoàn thành' : 'Chưa đạt'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab: Info */}
        {activeTab === 'info' && (
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Thông tin lớp học</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
              {[
                ['Tên lớp', group.name],
                ['Mã lớp', group.code],
                ['Học kỳ', group.semester],
                ['Giảng viên', group.instructor?.fullName ?? '—'],
                ['Email giảng viên', group.instructor?.email ?? '—'],
                ['Lịch học', group.schedule || '—'],
                ['Phòng học', group.location || '—'],
                ['Ngày bắt đầu', formatDate(group.startDate)],
                ['Ngày kết thúc', formatDate(group.endDate)],
                ['Sĩ số', `${group._count.students}/${group.maxStudents}`],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">{value}</dd>
                </div>
              ))}
            </dl>
            {group.description && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-900 mb-2">Mô tả</h4>
                <p className="text-sm text-gray-600 whitespace-pre-line">{group.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}

