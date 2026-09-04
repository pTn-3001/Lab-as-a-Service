'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calendar,
  Clock,
  FlaskConical,
  GraduationCap,
  Loader2,
  Plus,
  Search,
  Trash2,
  Users,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button, InstructorLayout } from '@laas-portal/ui';
import { getAccessToken } from '../../../../lib/auth';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Student {
  id: string;
  fullName: string;
  email: string;
  username: string;
  studentCode: string;
  joinedAt?: string;
}

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
  students: Student[];
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
  groupId: string;
  labTemplateId: string;
  deadline: string;
  isRequired: boolean;
  labTemplate: LabTemplate;
}

interface CheckpointSnapshot {
  checkpointId: string;
  checkpointName: string;
  points: number;
  status: string;
  completedAt: string | null;
}

interface LabGrade {
  id?: string;
  studentId: string;
  classLabId: string;
  labTemplateId: string;
  earnedPoints: number;
  totalPoints: number;
  percentage: number;
  completedCheckpoints: number;
  totalCheckpoints: number;
  status: string;
  feedback: string | null;
  manualScore: number | null;
  checkpointSnapshots: CheckpointSnapshot[];
}

type Tab = 'overview' | 'students' | 'labs' | 'grades';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function InstructorClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);

  const [group, setGroup] = useState<ClassGroup | null>(null);
  const [classLabs, setClassLabs] = useState<ClassLab[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showLabModal, setShowLabModal] = useState(false);

  const fetchGroup = useCallback(async () => {
    const token = getAccessToken();
    const res = await fetch(`/api/groups/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setGroup(await res.json());
  }, [id]);

  const fetchClassLabs = useCallback(async () => {
    const token = getAccessToken();
    const res = await fetch(`/api/class-labs/by-group/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setClassLabs(data.data ?? data);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchGroup(), fetchClassLabs()]);
      setLoading(false);
    })();
  }, [fetchGroup, fetchClassLabs]);

  const removeStudent = async (sid: string) => {
    if (!confirm('Bạn có chắc muốn xoá sinh viên này khỏi lớp?')) return;
    const token = getAccessToken();
    const res = await fetch(`/api/groups/${id}/students/${sid}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchGroup();
  };

  const removeClassLab = async (clId: string) => {
    if (!confirm('Bạn có chắc muốn gỡ lab này khỏi lớp?')) return;
    const token = getAccessToken();
    const res = await fetch(`/api/class-labs/${clId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) fetchClassLabs();
  };

  if (loading) {
    return (
      <InstructorLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </InstructorLayout>
    );
  }

  if (!group) {
    return (
      <InstructorLayout>
        <div className="flex flex-col items-center justify-center h-96 gap-4">
          <AlertCircle className="w-12 h-12 text-red-400" />
          <p className="text-gray-600">Không tìm thấy lớp học</p>
          <Link href="/instructor/classes"><Button>Quay lại</Button></Link>
        </div>
      </InstructorLayout>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Tổng quan', icon: <BookOpen className="w-4 h-4" /> },
    { key: 'students', label: 'Học viên', icon: <Users className="w-4 h-4" /> },
    { key: 'labs', label: 'Virtual Labs', icon: <FlaskConical className="w-4 h-4" /> },
    { key: 'grades', label: 'Điểm số', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <InstructorLayout>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Back */}
        <Link
          href="/instructor/classes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Quay lại danh sách lớp
        </Link>

        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{group.name}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                  {group.code}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${group.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                  {group.isActive ? 'Đang học' : 'Không hoạt động'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-gray-600">
                <span className="inline-flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-gray-400" />
                  {group.instructor?.fullName ?? '—'}
                </span>
                {group.schedule && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-gray-400" />
                    {group.schedule}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  {formatDate(group.startDate)} – {formatDate(group.endDate)}
                </span>
              </div>
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
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <OverviewTab group={group} labCount={classLabs.length} />
        )}
        {activeTab === 'students' && (
          <StudentsTab group={group} onRemove={removeStudent} onOpenAdd={() => setShowAddStudent(true)} />
        )}
        {activeTab === 'labs' && (
          <LabsTab classLabs={classLabs} onRemove={removeClassLab} onAdd={() => setShowLabModal(true)} />
        )}
        {activeTab === 'grades' && (
          <GradesTab groupId={id} students={group.students} classLabs={classLabs} />
        )}

        {/* Modals */}
        {showAddStudent && (
          <AddStudentModal
            groupId={id}
            existingIds={group.students.map((s) => s.id)}
            onClose={() => setShowAddStudent(false)}
            onDone={() => { setShowAddStudent(false); fetchGroup(); }}
          />
        )}
        {showLabModal && (
          <AssignLabModal
            groupId={id}
            onClose={() => setShowLabModal(false)}
            onDone={() => { setShowLabModal(false); fetchClassLabs(); }}
          />
        )}
      </div>
    </InstructorLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components (reuse same UI as admin)                            */
/* ------------------------------------------------------------------ */

function OverviewTab({ group, labCount }: { group: ClassGroup; labCount: number }) {
  const stats = [
    { label: 'Sinh viên', value: group._count.students, max: group.maxStudents, icon: <Users className="w-5 h-5 text-indigo-600" />, bg: 'bg-indigo-50' },
    { label: 'Virtual Labs', value: labCount, icon: <FlaskConical className="w-5 h-5 text-purple-600" />, bg: 'bg-purple-50' },
    { label: 'Trạng thái', value: group.isActive ? 'Đang học' : 'Tạm dừng', icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />, bg: 'bg-emerald-50' },
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-lg ${s.bg}`}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {s.value}
                  {'max' in s && s.max != null && <span className="text-sm font-normal text-gray-400">/{s.max}</span>}
                </p>
                <p className="text-sm text-gray-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      {group.description && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Mô tả</h3>
          <p className="text-sm text-gray-600 whitespace-pre-line">{group.description}</p>
        </div>
      )}
    </div>
  );
}

function StudentsTab({ group, onRemove, onOpenAdd }: { group: ClassGroup; onRemove: (sid: string) => void; onOpenAdd: () => void }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Danh sách học viên ({group.students.length})</h3>
        <Button onClick={onOpenAdd} className="inline-flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />Thêm học viên
        </Button>
      </div>
      {group.students.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Users className="w-10 h-10 mb-2" /><p className="text-sm">Chưa có sinh viên nào</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Họ tên</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">MSSV</th>
                <th className="px-4 py-3">Ngày tham gia</th>
                <th className="px-4 py-3 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {group.students.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.fullName}</td>
                  <td className="px-4 py-3 text-gray-600">{s.email}</td>
                  <td className="px-4 py-3 text-gray-600">{s.studentCode}</td>
                  <td className="px-4 py-3 text-gray-600">{s.joinedAt ? formatDate(s.joinedAt) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => onRemove(s.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}



function LabsTab({ classLabs, onRemove, onAdd }: { classLabs: ClassLab[]; onRemove: (clId: string) => void; onAdd: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Virtual Labs ({classLabs.length})</h3>
        <Button onClick={onAdd} className="inline-flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4" />Giao Lab
        </Button>
      </div>
      {classLabs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center py-16 text-gray-400">
          <FlaskConical className="w-10 h-10 mb-2" /><p className="text-sm">Chưa có lab nào được giao</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classLabs.map((cl) => (
            <div key={cl.id} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-medium text-gray-900 line-clamp-2">{cl.labTemplate.name}</h4>
                <button onClick={() => onRemove(cl.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {cl.labTemplate.description && <p className="text-sm text-gray-500 line-clamp-2">{cl.labTemplate.description}</p>}
              <div className="flex items-center gap-3 mt-auto pt-2 border-t border-gray-100">
                {cl.isRequired ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600"><AlertCircle className="w-3.5 h-3.5" />Bắt buộc</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500"><CheckCircle2 className="w-3.5 h-3.5" />Không bắt buộc</span>
                )}
                <span className="text-xs text-gray-500 ml-auto">Hạn: {formatDate(cl.deadline)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GradesTab({ groupId, students, classLabs }: { groupId: string; students: Student[]; classLabs: ClassLab[] }) {
  const [grades, setGrades] = useState<LabGrade[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const token = getAccessToken();
    Promise.all([
      fetch(`/api/grades/class/${groupId}`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/sessions?limit=500`, {
        cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([gradesJson, sessJson]) => {
        const list = gradesJson?.success && Array.isArray(gradesJson?.data)
          ? gradesJson.data
          : Array.isArray(gradesJson?.data?.items)
          ? gradesJson.data.items
          : Array.isArray(gradesJson)
          ? gradesJson
          : [];
        setGrades(list);

        const sessList = sessJson?.success && Array.isArray(sessJson?.data)
          ? sessJson.data
          : Array.isArray(sessJson)
          ? sessJson
          : [];
        setSessions(sessList);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [groupId]);

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const labMap = new Map(classLabs.map((cl) => [cl.id, cl]));
  const token = getAccessToken();

  // Generate student x lab matrix
  const rows: LabGrade[] = [];
  for (const classLab of classLabs) {
    const modules = classLab.labTemplate?.modules ?? [];
    let templateTotalCheckpoints = 0;
    let templateTotalPoints = 0;
    const allTemplateCheckpoints: { id: string; name: string; points: number }[] = [];

    for (const mod of modules) {
      const cps = mod.definitionJson?.checkpoints ?? [];
      for (const cp of cps) {
        const pts = cp.points && cp.points > 0 ? cp.points : 10;
        templateTotalCheckpoints += 1;
        templateTotalPoints += pts;
        allTemplateCheckpoints.push({
          id: cp.id,
          name: cp.name ? `[${mod.name}] ${cp.name}` : `[Module ${mod.orderNo}] Checkpoint`,
          points: pts,
        });
      }
    }

    for (const student of students) {
      const match = grades.find((g) => g.studentId === student.id && g.classLabId === classLab.id);

      // Get all completed checkpoints for this student on this labTemplate from lab-service sessions
      const studentCompletedCpSet = new Set<string>();
      for (const s of sessions) {
        if (
          s.userId === student.id &&
          (s.module?.labTemplateId === classLab.labTemplateId || s.module?.labTemplate?.id === classLab.labTemplateId)
        ) {
          for (const cp of (s.CheckpointProgress || [])) {
            if (cp.status === 'COMPLETED') {
              studentCompletedCpSet.add(cp.checkpointId);
            }
          }
        }
      }

      const snapshotMap = new Map((match?.checkpointSnapshots || []).map((s: any) => [s.checkpointId, s]));

      const mergedSnapshots = allTemplateCheckpoints.map((cp) => {
        const existing = snapshotMap.get(cp.id);
        const isCompleted = existing?.status === 'COMPLETED' || studentCompletedCpSet.has(cp.id);
        return {
          checkpointId: cp.id,
          checkpointName: existing?.checkpointName || cp.name,
          points: existing?.points || cp.points,
          status: isCompleted ? 'COMPLETED' : (existing?.status || 'PENDING'),
          completedAt: existing?.completedAt || null,
        };
      });

      const totalCp = templateTotalCheckpoints > 0 ? templateTotalCheckpoints : (match?.totalCheckpoints || 0);
      const totalPts = templateTotalPoints > 0 ? templateTotalPoints : (match?.totalPoints || 0);
      const completedCp = mergedSnapshots.filter((s) => s.status === 'COMPLETED').length;
      const earnedPts = mergedSnapshots.filter((s) => s.status === 'COMPLETED').reduce((acc, s) => acc + (s.points || 10), 0);
      const pct = totalPts > 0 ? Math.round((earnedPts / totalPts) * 100) : (totalCp > 0 ? Math.round((completedCp / totalCp) * 100) : 0);

      const hasActiveSession = sessions.some(
        (s) =>
          s.userId === student.id &&
          (s.module?.labTemplateId === classLab.labTemplateId || s.module?.labTemplate?.id === classLab.labTemplateId) &&
          (s.status === 'RUNNING' || s.status === 'STARTING')
      );

      const hasAnySession = sessions.some(
        (s) =>
          s.userId === student.id &&
          (s.module?.labTemplateId === classLab.labTemplateId || s.module?.labTemplate?.id === classLab.labTemplateId)
      );

      let status = 'NOT_STARTED';
      if (match?.status === 'GRADED') {
        status = 'GRADED';
      } else if ((completedCp === totalCp && totalCp > 0) || match?.status === 'COMPLETED') {
        status = 'COMPLETED';
      } else if (hasActiveSession) {
        status = 'IN_PROGRESS';
      } else if (completedCp > 0 || hasAnySession || (match && match.status !== 'NOT_STARTED')) {
        status = 'FINISHED';
      }

      // Auto-sync to grading-service if progress was found from sessions that is newer than grading record
      if (studentCompletedCpSet.size > 0 && (!match || (match.completedCheckpoints || 0) < completedCp)) {
        void fetch('/api/grades/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            classLabId: classLab.id,
            groupId,
            studentId: student.id,
            labTemplateId: classLab.labTemplateId,
            status,
            checkpoints: mergedSnapshots.map((cp) => ({
              id: cp.checkpointId,
              name: cp.checkpointName,
              points: cp.points,
              status: cp.status,
              completedAt: cp.status === 'COMPLETED' ? new Date().toISOString() : undefined,
            })),
          }),
        }).catch(() => {});
      }

      rows.push({
        id: match?.id || `placeholder-${student.id}-${classLab.id}`,
        studentId: student.id,
        classLabId: classLab.id,
        labTemplateId: classLab.labTemplateId,
        earnedPoints: earnedPts,
        totalPoints: totalPts,
        completedCheckpoints: completedCp,
        totalCheckpoints: totalCp,
        percentage: pct,
        status,
        feedback: match?.feedback || null,
        manualScore: match?.manualScore || null,
        checkpointSnapshots: mergedSnapshots,
      });
    }
  }

  // Stats
  const activeRows = rows.filter((r) => r.status !== 'NOT_STARTED');
  const avgPercentage = activeRows.length > 0
    ? Math.round(activeRows.reduce((sum, g) => sum + g.percentage, 0) / activeRows.length)
    : 0;
  const completedCount = rows.filter((g) => g.status === 'COMPLETED' || g.status === 'GRADED' || (g.totalCheckpoints > 0 && g.completedCheckpoints === g.totalCheckpoints)).length;

  function statusBadge(status: string) {
    const map: Record<string, { label: string; color: string }> = {
      COMPLETED: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700' },
      FINISHED: { label: 'Đã làm', color: 'bg-amber-100 text-amber-700' },
      SUBMITTED: { label: 'Đã làm', color: 'bg-amber-100 text-amber-700' },
      IN_PROGRESS: { label: 'Đang làm', color: 'bg-blue-100 text-blue-700' },
      GRADED: { label: 'Đã chấm', color: 'bg-purple-100 text-purple-700' },
      NOT_STARTED: { label: 'Chưa làm', color: 'bg-gray-100 text-gray-500' },
    };
    const info = map[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${info.color}`}>
        {info.label}
      </span>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Tổng bài đã nộp/làm</p>
          <p className="text-2xl font-bold text-gray-900">{activeRows.length}/{rows.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Điểm trung bình</p>
          <p className="text-2xl font-bold text-indigo-600">{avgPercentage}%</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Hoàn thành</p>
          <p className="text-2xl font-bold text-green-600">{completedCount}/{rows.length}</p>
        </div>
      </div>

      {/* Table */}
      {students.length === 0 || classLabs.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl flex flex-col items-center justify-center py-16 text-gray-400">
          <BarChart3 className="w-10 h-10 mb-2" />
          <p className="text-sm">Chưa có dữ liệu điểm số</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Sinh viên</th>
                  <th className="px-4 py-3">Lab</th>
                  <th className="px-4 py-3">Checkpoint</th>
                  <th className="px-4 py-3">Điểm</th>
                  <th className="px-4 py-3">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((g, idx) => {
                  const student = studentMap.get(g.studentId);
                  const classLab = labMap.get(g.classLabId);
                  const checkpointPct = g.totalCheckpoints > 0
                    ? Math.round((g.completedCheckpoints / g.totalCheckpoints) * 100)
                    : 0;
                  const rowKey = `${g.studentId}-${g.classLabId}`;
                  const isExpanded = !!expandedRows[rowKey];

                  return (
                    <React.Fragment key={`${g.studentId}-${g.classLabId}-${idx}`}>
                      <tr
                        onClick={() => toggleRow(rowKey)}
                        className="hover:bg-gray-50 transition-colors cursor-pointer select-none"
                      >
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-gray-900">{student?.fullName ?? g.studentId}</p>
                            {student?.studentCode && (
                              <p className="text-xs text-gray-500">{student.studentCode}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {classLab?.labTemplate.name ?? g.labTemplateId}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-700 whitespace-nowrap">{g.completedCheckpoints}/{g.totalCheckpoints}</span>
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all"
                                style={{ width: `${checkpointPct}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">{g.earnedPoints}/{g.totalPoints}</span>
                          <span className="text-xs text-gray-500 ml-1">({g.percentage}%)</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-between">
                            {statusBadge(g.status)}
                            <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && g.checkpointSnapshots && g.checkpointSnapshots.length > 0 && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={5} className="px-4 py-4 border-t border-b border-slate-100">
                            <div className="pl-4">
                              <p className="text-[11px] font-bold text-slate-400 mb-2 uppercase tracking-wider">Chi tiết trạng thái Checkpoints:</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {g.checkpointSnapshots.map((cp) => (
                                  <div
                                    key={cp.checkpointId}
                                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-white p-2.5 text-xs shadow-sm"
                                  >
                                    <span className="font-semibold text-slate-700 truncate mr-2">
                                      • {cp.checkpointName}
                                    </span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-slate-400 text-[10px]">({cp.points}đ)</span>
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                          cp.status === 'COMPLETED'
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'bg-slate-100 text-slate-500'
                                        }`}
                                      >
                                        {cp.status === 'COMPLETED' ? 'Hoàn thành' : 'Chưa đạt'}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Modals                                                             */
/* ------------------------------------------------------------------ */

const inputCls = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

function AddStudentModal({ groupId, existingIds, onClose, onDone }: { groupId: string; existingIds: string[]; onClose: () => void; onDone: () => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed) { setResults([]); setSearchError(''); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError('');
      const token = getAccessToken();
      const res = await fetch(`/api/users?systemRole=STUDENT&search=${encodeURIComponent(trimmed)}&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const body = await res.json();
        const list = Array.isArray(body) ? body : Array.isArray(body.data) ? body.data : [];
        setResults(list.filter((u: Student) => !existingIds.includes(u.id)));
      } else {
        const body = await res.json().catch(() => ({}));
        setSearchError(body.message ?? `Lỗi ${res.status} — không thể tìm kiếm`);
      }
      setSearching(false);
    }, 350);
    return () => clearTimeout(timer);
  }, [search, existingIds]);

  const toggle = (sid: string) => setSelected((prev) => prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid]);

  const submit = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    const token = getAccessToken();
    await fetch(`/api/groups/${groupId}/students`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentIds: selected }),
    });
    setSubmitting(false);
    onDone();
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg h-[500px] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Thêm học viên</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        {/* Body */}
        <div className="flex flex-col flex-1 overflow-hidden p-5 gap-3 min-h-0">
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
            <input type="text" placeholder="Nhập tên, email hoặc MSSV..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            {results.length > 0 && (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {results.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors">
                    <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{s.fullName}</p>
                      <p className="text-xs text-gray-500 truncate">{s.studentCode} · {s.email}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {searchError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{searchError}</p>}
            {!search.trim() && !searching && (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Search className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">Nhập để tìm kiếm học viên</p>
              </div>
            )}
            {!searchError && results.length === 0 && search.trim() && !searching && (
              <p className="text-sm text-gray-400 text-center py-6">Không tìm thấy học viên</p>
            )}
          </div>
        </div>
        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200 flex-shrink-0">
          <Button onClick={onClose} variant="outline">Huỷ</Button>
          <Button onClick={submit} disabled={selected.length === 0 || submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Thêm (${selected.length})`}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}



function AssignLabModal({ groupId, onClose, onDone }: { groupId: string; onClose: () => void; onDone: () => void }) {
  const [templates, setTemplates] = useState<LabTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    (async () => {
      const token = getAccessToken();
      const res = await fetch('/api/lab-templates?status=PUBLISHED', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const raw = data?.data?.items ?? data?.data ?? data ?? [];
        setTemplates(Array.isArray(raw) ? raw : []);
      }
      setLoadingTemplates(false);
    })();
  }, []);

  const submit = async () => {
    if (!selectedTemplate || !deadline) return;
    setSubmitting(true);
    setSubmitError('');
    const token = getAccessToken();
    try {
      const res = await fetch('/api/class-labs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, labTemplateId: selectedTemplate, deadline: new Date(deadline).toISOString(), isRequired }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitError(body.message ?? `Lỗi ${res.status} — không thể giao lab`);
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      onDone();
    } catch {
      setSubmitError('Không thể kết nối đến server');
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">Giao Lab</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Lab Template *</label>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" />Đang tải...</div>
            ) : (
              <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)} className={inputCls}>
                <option value="">Chọn lab template</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Hạn nộp *</label><input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} /></div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            <span className="text-sm text-gray-700">Bắt buộc</span>
          </label>
        </div>
        {submitError && (
          <div className="px-5 pb-3">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{submitError}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200">
          <Button onClick={onClose} variant="outline">Huỷ</Button>
          <Button onClick={submit} disabled={!selectedTemplate || !deadline || submitting}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Giao Lab'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
