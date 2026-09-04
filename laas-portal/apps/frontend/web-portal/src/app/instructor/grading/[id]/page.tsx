'use client';

import {
  AlertCircle,
  CheckCircle,
  Clock,
  Eye,
  User,
  XCircle,
  Loader2,
} from 'lucide-react';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, InstructorLayout } from '@laas-portal/ui';

interface StudentInfo {
  id: string;
  name: string;
  email: string;
  studentCode: string;
  class: string;
}

interface LabInfo {
  id: string;
  name: string;
  totalPoints: number;
}

interface CheckpointSnapshot {
  id: string;
  checkpointId: string;
  checkpointName: string;
  points: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  completedAt?: string;
}

export default function GradingDetailPage() {
  const params = useParams<{ id: string }>();
  const gradeId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [grade, setGrade] = useState<any | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [lab, setLab] = useState<LabInfo | null>(null);
  const [checkpointSnapshots, setCheckpointSnapshots] = useState<CheckpointSnapshot[]>([]);

  const [manualScore, setManualScore] = useState<number>(0);
  const [publicFeedback, setPublicFeedback] = useState('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (!gradeId) return;
    let active = true;

    async function loadData() {
      try {
        setIsLoading(true);
        setErrorMsg('');
        
        // 1. Fetch grade details
        const gradeRes = await fetch(`/api/grades/${gradeId}`, { cache: 'no-store' });
        if (!gradeRes.ok) throw new Error('Không thể tải chi tiết bảng điểm');
        const gradePayload = await gradeRes.json();
        const gradeData = gradePayload.success ? gradePayload.data : gradePayload;

        if (!active) return;
        setGrade(gradeData);
        setManualScore(gradeData.manualScore !== null ? Math.round(gradeData.manualScore) : Math.round(gradeData.percentage));
        setPublicFeedback(gradeData.feedback || '');
        setCheckpointSnapshots(gradeData.checkpointSnapshots || []);

        // 2. Fetch student info & class lab info in parallel
        const [studentRes, classLabRes] = await Promise.all([
          fetch(`/api/users/students/${gradeData.studentId}`, { cache: 'no-store' }),
          fetch(`/api/class-labs/${gradeData.classLabId}`, { cache: 'no-store' })
        ]);

        if (studentRes.ok) {
          const sPayload = await studentRes.json();
          setStudent({
            id: sPayload.id,
            name: sPayload.name || 'Học viên',
            email: sPayload.email || '',
            studentCode: sPayload.studentCode || 'N/A',
            class: sPayload.class || 'Chưa phân lớp',
          });
        }

        if (classLabRes.ok) {
          const clPayload = await classLabRes.json();
          const clData = clPayload.success ? clPayload.data : clPayload;
          setLab({
            id: clData.id,
            name: clData.title || 'Bài thực hành',
            totalPoints: 100,
          });
        }

      } catch (err) {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải dữ liệu chấm điểm');
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
  }, [gradeId]);

  const handleSaveGrade = async (statusLabel: string) => {
    try {
      setIsSaving(true);
      setErrorMsg('');
      setSuccessMsg('');

      const res = await fetch(`/api/grades/${gradeId}/manual-grade`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualScore: Number(manualScore),
          feedback: publicFeedback,
        }),
      });

      if (!res.ok) throw new Error('Không thể cập nhật kết quả đánh giá');

      setSuccessMsg(`Đã ${statusLabel} thành công! Đang chuyển hướng...`);
      setTimeout(() => {
        router.push('/instructor/grading');
      }, 1500);

    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi lưu thông tin chấm điểm');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <InstructorLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-gray-500">
          <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
          <p className="text-sm">Đang tải chi tiết bài nộp...</p>
        </div>
      </InstructorLayout>
    );
  }

  if (!grade || !student || !lab) {
    return (
      <InstructorLayout>
        <div className="p-6 text-center text-red-600">
          <p className="font-bold">Không tìm thấy thông tin bài nộp này.</p>
          <Link href="/instructor/grading" className="mt-4 inline-block text-blue-600 underline">
            Quay lại danh sách
          </Link>
        </div>
      </InstructorLayout>
    );
  }

  const autoScore = Math.round(grade.percentage);
  const submissionTime = new Date(grade.createdAt).toLocaleString('vi-VN');

  return (
    <InstructorLayout>
      <div className="p-6 lg:p-8">
        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-gray-600">
          <Link href="/instructor/grading" className="hover:text-blue-600">
            Chấm điểm
          </Link>
          <span>/</span>
          <span className="text-gray-900">{student.name}</span>
        </nav>

        {/* Header */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <h1 className="mb-2 text-2xl font-bold text-gray-900">
                {lab.name} - Bài nộp
              </h1>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <Link
                    href={`/instructor/students/${student.id}`}
                    className="font-medium hover:text-blue-600"
                  >
                    {student.name}
                  </Link>
                  <span>({student.studentCode})</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>Nộp: {submissionTime}</span>
                  <span>•</span>
                  <span>Lớp: {student.class}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Link href={`/instructor/students/${student.id}`}>
                <Button variant="outline" size="sm">
                  <Eye className="mr-2 h-4 w-4" />
                  Hồ sơ học viên
                </Button>
              </Link>
            </div>
          </div>

          {/* Score Summary */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-900">Điểm tự động (Hệ thống)</p>
              <p className="mt-1 text-2xl font-bold text-blue-900">
                {autoScore}/100
              </p>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-sm font-medium text-green-900">Điểm cuối cùng (Chốt)</p>
              <p className="mt-1 text-2xl font-bold text-green-900">
                {manualScore}/100
              </p>
            </div>
            <div className="rounded-lg bg-orange-50 p-4">
              <p className="text-sm font-medium text-orange-900">Trạng thái chấm</p>
              <p className="mt-1 text-2xl font-bold text-orange-900">
                {grade.status === 'GRADED' ? 'Đã chấm' : 'Đang chấm/Chờ chấm'}
              </p>
            </div>
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
          {/* Left Column - Auto Grading Results & Snapshots */}
          <div className="space-y-8 lg:col-span-2">
            {/* Auto Grading Results */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Danh sách Checkpoints từ hệ thống</h2>

              {checkpointSnapshots.length === 0 ? (
                <p className="text-sm text-gray-500 py-6 text-center">Chưa có kết quả checkpoints nào</p>
              ) : (
                <div className="space-y-4">
                  {checkpointSnapshots.map((result) => (
                    <div
                      key={result.id}
                      className={`rounded-lg border p-4 ${
                        result.status === 'COMPLETED'
                          ? 'border-green-200 bg-green-50'
                          : result.status === 'FAILED'
                            ? 'border-red-200 bg-red-50'
                            : 'border-yellow-200 bg-yellow-50'
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {result.status === 'COMPLETED' ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : result.status === 'FAILED' ? (
                            <XCircle className="h-5 w-5 text-red-600" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-yellow-600" />
                          )}
                          <h3 className="font-semibold text-gray-900">{result.checkpointName}</h3>
                        </div>
                        <span className="text-lg font-bold text-gray-900">
                          {result.points} điểm
                        </span>
                      </div>

                      <p className="text-sm text-gray-700">Trạng thái: {result.status === 'COMPLETED' ? 'Đã đạt' : result.status === 'FAILED' ? 'Thất bại' : 'Chờ kiểm tra'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Execution logs representation */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-gray-900 font-sans">Nhật ký chấm tự động</h2>
              <div className="rounded-lg bg-gray-950 p-4">
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-sm text-green-400">
                  {`[SYSTEM] Bắt đầu chấm tự động vào lúc ${submissionTime}
[SYSTEM] Kiểm tra các checkpoints cấu hình trong bài lab...
` + checkpointSnapshots.map(c => `[CHECKPOINT] ${c.checkpointName}: [${c.status}] (${c.points} điểm)`).join('\n') + `
[SYSTEM] Chấm điểm hoàn tất. Tỷ lệ hoàn thành: ${autoScore}%`}
                </pre>
              </div>
            </div>
          </div>

          {/* Right Column - Manual Grading */}
          <div className="space-y-8">
            {/* Manual Score Override */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-gray-900">Chấm điểm thủ công</h2>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Nhập điểm cuối cùng (0 - 100) *
                </label>
                <input
                  type="number"
                  value={manualScore}
                  onChange={(e) => setManualScore(Math.max(0, Math.min(100, Number(e.target.value))))}
                  min="0"
                  max="100"
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div className="mb-4 rounded-lg bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-900">Tổng điểm cuối cùng của bài</p>
                <p className="mt-1 text-3xl font-bold text-blue-900">
                  {manualScore}/100
                </p>
              </div>
            </div>

            {/* Feedback */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-gray-900">Phản hồi của giảng viên</h2>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Nhận xét cho học viên <span className="text-gray-500">(Công khai)</span>
                </label>
                <textarea
                  rows={6}
                  value={publicFeedback}
                  onChange={(e) => setPublicFeedback(e.target.value)}
                  placeholder="Viết nhận xét cho học viên về bài làm..."
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button className="w-full" onClick={() => handleSaveGrade('chốt điểm')} disabled={isSaving}>
                {isSaving ? 'Đang lưu...' : 'Lưu và gửi điểm'}
              </Button>
              <Button variant="outline" className="w-full" onClick={() => handleSaveGrade('lưu nháp')} disabled={isSaving}>
                Lưu nháp điểm
              </Button>
            </div>
          </div>
        </div>
      </div>
    </InstructorLayout>
  );
}
