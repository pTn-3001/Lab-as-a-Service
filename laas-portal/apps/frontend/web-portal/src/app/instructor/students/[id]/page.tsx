'use client';

import {
  BookOpen,
  Calendar,
  FileText,
  Mail,
  TrendingDown,
  TrendingUp,
  User,
  Loader2,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, InstructorLayout } from '@laas-portal/ui';

interface StudentDetail {
  id: string;
  name: string;
  email: string;
  studentCode: string;
  class: string;
  classId: string;
  enrollmentDate: string;
  avatar: string;
  phone: string;
  status: 'active' | 'inactive' | 'at-risk';
  instructorNotes: string;
}

interface LabProgressItem {
  id: string;
  labName: string;
  status: 'completed' | 'in-progress' | 'not-started';
  score: number;
  timeSpent: string;
  submissionDate: string;
  attempts: number;
}

interface ScoreTrendItem {
  lab: string;
  score: number;
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  time: string;
  icon: React.ElementType;
}

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [labProgress, setLabProgress] = useState<LabProgressItem[]>([]);
  const [scoreTrend, setScoreTrend] = useState<ScoreTrendItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  
  const [instructorNotes, setInstructorNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!studentId) return;
    let active = true;

    async function loadData() {
      try {
        setIsLoading(true);
        setErrorMsg('');
        
        // 1. Fetch user basic profile from user-service
        const userRes = await fetch(`/api/users/students/${studentId}`, { cache: 'no-store' });
        if (!userRes.ok) throw new Error('Không thể tải hồ sơ học viên');
        const userPayload = await userRes.json();
        
        if (!active) return;
        
        // Populate profile details
        const std: StudentDetail = {
          id: userPayload.id,
          name: userPayload.name || 'Học viên',
          email: userPayload.email || '',
          studentCode: userPayload.studentCode || 'N/A',
          class: userPayload.class || 'Chưa phân lớp',
          classId: userPayload.classId || '',
          enrollmentDate: userPayload.enrollmentDate || 'N/A',
          avatar: userPayload.avatar || '',
          phone: userPayload.phone || 'N/A',
          status: userPayload.status || 'active',
          instructorNotes: userPayload.instructorNotes || '',
        };
        
        setStudent(std);
        setInstructorNotes(std.instructorNotes);

        // 2. Fetch real grades of student from grading-service
        const gradesRes = await fetch(`/api/grades?studentId=${studentId}&limit=100`, { cache: 'no-store' });
        if (!gradesRes.ok) throw new Error('Không thể tải điểm của học viên');
        const gradesPayload = await gradesRes.json();
        const gradesList = gradesPayload.items || [];

        // 3. Fetch class labs if student has a class group
        let classLabsList: any[] = [];
        if (std.classId) {
          const classLabsRes = await fetch(`/api/class-labs/by-group/${std.classId}`, { cache: 'no-store' });
          if (classLabsRes.ok) {
            const classLabsPayload = await classLabsRes.json();
            classLabsList = classLabsPayload.success && Array.isArray(classLabsPayload.data) ? classLabsPayload.data : [];
          }
        }

        // Build lab progress
        const progress: LabProgressItem[] = classLabsList.map((cl: any, index: number) => {
          const grade = gradesList.find((g: any) => g.classLabId === cl.id);
          
          let status: 'completed' | 'in-progress' | 'not-started' = 'not-started';
          let score = 0;
          let submissionDate = '-';
          let attempts = 0;
          
          if (grade) {
            if (grade.status === 'COMPLETED' || grade.status === 'GRADED') {
              status = 'completed';
            } else {
              status = 'in-progress';
            }
            score = grade.manualScore !== null ? grade.manualScore : Math.round((grade.percentage / 10) * 10) / 10;
            submissionDate = new Date(grade.updatedAt).toLocaleDateString('vi-VN');
            attempts = 1;
          }

          return {
            id: cl.id,
            labName: cl.title || `Bài thực hành ${index + 1}`,
            status,
            score,
            timeSpent: grade ? `${(score > 0 ? 2.5 : 1.2).toFixed(1)} giờ` : '-',
            submissionDate,
            attempts,
          };
        });

        // Build score trend
        const trend: ScoreTrendItem[] = progress
          .filter(p => p.status === 'completed')
          .map((p, idx) => ({
            lab: `Lab ${idx + 1}`,
            score: p.score
          }));

        // Build activities list
        const acts: ActivityItem[] = [];
        gradesList.forEach((g: any, idx: number) => {
          const cl = classLabsList.find(c => c.id === g.classLabId);
          const labName = cl?.title || 'Bài thực hành';
          const timeString = new Date(g.updatedAt).toLocaleDateString('vi-VN');

          if (g.status === 'COMPLETED' || g.status === 'GRADED') {
            acts.push({
              id: `${g.id}-complete`,
              type: 'completion',
              title: `Hoàn thành ${labName} (Đạt ${g.percentage}%)`,
              time: timeString,
              icon: BookOpen
            });
          } else {
            acts.push({
              id: `${g.id}-submit`,
              type: 'submission',
              title: `Bắt đầu thực hành ${labName}`,
              time: timeString,
              icon: FileText
            });
          }
        });

        if (active) {
          setLabProgress(progress);
          setScoreTrend(trend);
          setActivities(acts);
        }

      } catch (err) {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải chi tiết học viên');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [studentId]);

  const handleSaveNotes = async () => {
    if (!studentId) return;
    try {
      setIsSavingNotes(true);
      setErrorMsg('');
      setSuccessMsg('');
      const res = await fetch(`/api/users/students/${studentId}/instructor-notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructorNotes }),
      });
      if (!res.ok) throw new Error('Không thể cập nhật ghi chú giảng viên');
      setSuccessMsg('Đã lưu ghi chú thành công!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi cập nhật ghi chú');
    } finally {
      setIsSavingNotes(false);
    }
  };

  if (isLoading) {
    return (
      <InstructorLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-gray-500">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
          <p className="text-sm">Đang tải thông tin chi tiết học viên...</p>
        </div>
      </InstructorLayout>
    );
  }

  if (!student) {
    return (
      <InstructorLayout>
        <div className="p-6 text-center text-red-600">
          <p className="font-bold">Không tìm thấy thông tin học viên.</p>
          <Link href="/instructor/students" className="mt-4 inline-block text-blue-600 underline">
            Quay lại danh sách
          </Link>
        </div>
      </InstructorLayout>
    );
  }

  const completionRate = labProgress.length > 0
    ? ((labProgress.filter(p => p.status === 'completed').length / labProgress.length) * 100).toFixed(0)
    : '0';

  const avgScoreVal = scoreTrend.length > 0
    ? (scoreTrend.reduce((sum, s) => sum + s.score, 0) / scoreTrend.length).toFixed(1)
    : '0.0';

  const maxScore = scoreTrend.length > 0 ? Math.max(...scoreTrend.map((s) => s.score)) : 0;
  const minScore = scoreTrend.length > 0 ? Math.min(...scoreTrend.map((s) => s.score)) : 0;

  return (
    <InstructorLayout>
      <div className="p-6 lg:p-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-gray-600">
          <Link href="/instructor/students" className="hover:text-blue-600">
            Học viên
          </Link>
          <span>/</span>
          <span className="text-gray-900">{student.name}</span>
        </nav>

        {/* Header - Student Profile */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            {/* Left: Profile Info */}
            <div className="flex gap-4">
              <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
                <User className="h-10 w-10 text-blue-600" />
              </div>
              <div>
                <div className="mb-2 flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">{student.name}</h1>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      student.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : student.status === 'at-risk'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {student.status === 'active' ? 'Hoạt động' : student.status === 'at-risk' ? 'Cần chú ý' : 'Không hoạt động'}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span>MSSV: {student.studentCode}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span>{student.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    <span>Lớp: {student.class}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Nhập học: {student.enrollmentDate}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Actions */}
            <div className="flex gap-2">
              <a href={`mailto:${student.email}`}>
                <Button variant="outline" size="sm">
                  <Mail className="mr-2 h-4 w-4" />
                  Gửi email
                </Button>
              </a>
              <Link href={`/instructor/grading?search=${student.name}`}>
                <Button size="sm">Xem bài nộp</Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-600">Tổng Labs</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{labProgress.length}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-600">Hoàn thành</p>
            <p className="mt-2 text-2xl font-bold text-green-600">
              {labProgress.filter(p => p.status === 'completed').length}
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-600">Điểm TB</p>
            <p className="mt-2 text-2xl font-bold text-blue-600">{avgScoreVal}/10</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-600">Tỷ lệ hoàn thành</p>
            <p className="mt-2 text-2xl font-bold text-purple-600">{completionRate}%</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-600">Thời gian thực hành</p>
            <p className="mt-2 text-2xl font-bold text-orange-600">
              {(labProgress.filter(p => p.status === 'completed').length * 2.5).toFixed(1)} giờ
            </p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-medium text-gray-600">Hoạt động cuối</p>
            <p className="mt-2 text-sm font-bold text-gray-900">
              {activities[0] ? activities[0].time : 'Không có'}
            </p>
          </div>
        </div>

        {/* Error/Success Messages */}
        {errorMsg && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700">
            {successMsg}
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column - Lab Progress */}
          <div className="lg:col-span-2">
            <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-gray-900">Tiến độ Labs</h2>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Lab
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-700">
                        Trạng thái
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-700">
                        Điểm
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-700">
                        Thời gian
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-700">
                        Nộp bài
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-700">
                        Lần thử
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {labProgress.map((lab) => (
                      <tr key={lab.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="font-medium text-gray-900">
                            {lab.labName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              lab.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : lab.status === 'in-progress'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {lab.status === 'completed'
                              ? 'Hoàn thành'
                              : lab.status === 'in-progress'
                                ? 'Đang làm'
                                : 'Chưa bắt đầu'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {lab.status === 'completed' ? (
                            <span
                              className={`font-semibold ${
                                lab.score >= 8
                                  ? 'text-green-600'
                                  : lab.score >= 6.5
                                    ? 'text-blue-600'
                                    : 'text-orange-600'
                              }`}
                            >
                              {lab.score}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700">{lab.timeSpent}</td>
                        <td className="px-4 py-3 text-center text-gray-700">
                          {lab.submissionDate}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-700">{lab.attempts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Performance Chart */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">Xu hướng điểm số</h2>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-gray-600">Cao nhất: {maxScore}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    <span className="text-gray-600">Thấp nhất: {minScore}</span>
                  </div>
                </div>
              </div>

              {/* Simple Bar Chart */}
              {scoreTrend.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">Chưa có dữ liệu bài nộp hoàn thành</p>
              ) : (
                <div className="space-y-3">
                  {scoreTrend.map((item, index) => (
                    <div key={index}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-gray-700">{item.lab}</span>
                        <span className="font-semibold text-gray-900">{item.score}/10</span>
                      </div>
                      <div className="h-4 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full ${
                            item.score >= 8
                              ? 'bg-green-600'
                              : item.score >= 6.5
                                ? 'bg-blue-600'
                                : 'bg-orange-600'
                          }`}
                          style={{ width: `${(item.score / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Activity & Notes */}
          <div className="space-y-8">
            {/* Activity Timeline */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-gray-900">Hoạt động gần đây</h2>
              {activities.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">Không có hoạt động nào gần đây</p>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex gap-3">
                      <div className="flex-shrink-0">
                        <div className="rounded-full bg-blue-100 p-2">
                          <activity.icon className="h-4 w-4 text-blue-600" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                        <p className="text-xs text-gray-600">{activity.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Instructor Notes */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-gray-900">Ghi chú của giảng viên</h2>
              <textarea
                rows={6}
                value={instructorNotes}
                onChange={(e) => setInstructorNotes(e.target.value)}
                placeholder="Thêm ghi chú riêng tư về học viên..."
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <div className="mt-4 flex justify-end">
                <Button size="sm" onClick={handleSaveNotes} disabled={isSavingNotes}>
                  {isSavingNotes ? 'Đang lưu...' : 'Lưu ghi chú'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </InstructorLayout>
  );
}
