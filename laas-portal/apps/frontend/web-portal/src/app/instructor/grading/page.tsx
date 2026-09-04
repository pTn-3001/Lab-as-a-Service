'use client';

import { CheckCircle, Clock, Edit3, Eye, FileText, MessageSquare, Send, X, Loader2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, InstructorLayout, SearchBar } from '@laas-portal/ui';

interface GroupItem {
  id: string;
  name: string;
  code: string;
}

interface Submission {
  id: string; // LabGrade ID
  studentId: string;
  studentName: string;
  studentEmail: string;
  labTitle: string;
  class: string;
  classId: string;
  submittedAt: string;
  status: 'pending' | 'grading' | 'graded' | 'reviewed';
  autoScore?: number;
  finalScore?: number;
  timeSpent: string;
  attempts: number;
  feedback?: string;
}

export default function GradingPage() {
  const [classes, setClasses] = useState<GroupItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [showGradingModal, setShowGradingModal] = useState(false);
  
  const [manualScore, setManualScore] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState<string>('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 1. Load instructor classes
  useEffect(() => {
    async function loadClasses() {
      try {
        setIsLoading(true);
        const res = await fetch('/api/groups', { cache: 'no-store' });
        if (!res.ok) throw new Error('Không thể tải danh sách lớp học');
        const payload = await res.json();
        const list = Array.isArray(payload) ? payload : (payload.data || []);
        setClasses(list);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Lỗi tải danh sách lớp');
      } finally {
        setIsLoading(false);
      }
    }
    void loadClasses();
  }, []);

  // 2. Fetch and merge submissions data
  const loadSubmissionsData = async () => {
    if (classes.length === 0 && selectedClass !== 'all') return;
    try {
      setIsLoading(true);
      setErrorMsg('');
      
      const targetClasses = selectedClass === 'all' 
        ? classes 
        : classes.filter(c => c.id === selectedClass);

      if (targetClasses.length === 0) {
        setSubmissions([]);
        return;
      }

      const allSubmissions: Submission[] = [];

      await Promise.all(targetClasses.map(async (cls) => {
        try {
          const [studentsRes, classLabsRes, gradesRes] = await Promise.all([
            fetch(`/api/groups/${cls.id}/students?page=1&limit=100`, { cache: 'no-store' }),
            fetch(`/api/class-labs/by-group/${cls.id}`, { cache: 'no-store' }),
            fetch(`/api/grades/class/${cls.id}`, { cache: 'no-store' })
          ]);

          if (!studentsRes.ok || !classLabsRes.ok || !gradesRes.ok) return;

          const studentsPayload = await studentsRes.json();
          const classLabsPayload = await classLabsRes.json();
          const gradesPayload = await gradesRes.json();

          const studentList = Array.isArray(studentsPayload.data) ? studentsPayload.data : [];
          const classLabsList = classLabsPayload.success && Array.isArray(classLabsPayload.data) ? classLabsPayload.data : [];
          const gradesList = gradesPayload.success && Array.isArray(gradesPayload.data) ? gradesPayload.data : [];

          gradesList.forEach((grade: any) => {
            const student = studentList.find((s: any) => s.id === grade.studentId);
            const classLab = classLabsList.find((cl: any) => cl.id === grade.classLabId);

            // Determine status mapping
            let status: 'pending' | 'grading' | 'graded' | 'reviewed' = 'pending';
            if (grade.status === 'GRADED') {
              status = grade.feedback ? 'reviewed' : 'graded';
            } else if (grade.status === 'IN_PROGRESS') {
              status = 'pending';
            } else if (grade.status === 'COMPLETED') {
              status = 'grading';
            }

            // Time difference
            let submittedAt = 'Chưa xác định';
            if (grade.updatedAt) {
              const latestDate = new Date(grade.updatedAt);
              const diffMs = Date.now() - latestDate.getTime();
              const diffMins = Math.floor(diffMs / 60000);
              const diffHours = Math.floor(diffMs / 3600000);
              const diffDays = Math.floor(diffMs / 86400000);

              if (diffMins < 60) {
                submittedAt = `${diffMins} phút trước`;
              } else if (diffHours < 24) {
                submittedAt = `${diffHours} giờ trước`;
              } else {
                submittedAt = `${diffDays} ngày trước`;
              }
            }

            allSubmissions.push({
              id: grade.id,
              studentId: grade.studentId,
              studentName: student ? (student.fullName || student.username) : 'Học viên',
              studentEmail: student ? student.email : '',
              labTitle: classLab ? (classLab.title || 'Bài thực hành') : 'Bài thực hành',
              class: cls.name,
              classId: cls.id,
              submittedAt,
              status,
              autoScore: Math.round(grade.percentage),
              finalScore: grade.manualScore !== null ? Math.round(grade.manualScore) : undefined,
              timeSpent: '2.5 giờ',
              attempts: 1,
              feedback: grade.feedback || '',
            });
          });
        } catch {
          // Ignore single class failures
        }
      }));

      setSubmissions(allSubmissions);
    } catch {
      setErrorMsg('Có lỗi xảy ra khi tải dữ liệu bài nộp.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadSubmissionsData();
  }, [classes, selectedClass]);

  const filteredSubmissions = submissions.filter((submission) => {
    const matchesSearch =
      submission.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      submission.labTitle.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || submission.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = submissions.filter((s) => s.status === 'pending').length;
  const gradingCount = submissions.filter((s) => s.status === 'grading').length;
  const gradedCount = submissions.filter((s) => s.status === 'graded').length;
  const reviewedCount = submissions.filter((s) => s.status === 'reviewed').length;

  const handleGrade = (submission: Submission) => {
    setSelectedSubmission(submission);
    setManualScore(submission.finalScore !== undefined ? submission.finalScore : (submission.autoScore || 0));
    setFeedbackText(submission.feedback || '');
    setShowGradingModal(true);
  };

  const handleSaveGrade = async () => {
    if (!selectedSubmission) return;
    try {
      setIsSaving(true);
      setErrorMsg('');
      setSuccessMsg('');
      const res = await fetch(`/api/grades/${selectedSubmission.id}/manual-grade`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualScore: Number(manualScore),
          feedback: feedbackText,
        }),
      });

      if (!res.ok) throw new Error('Không thể lưu kết quả chấm điểm');
      setSuccessMsg('Đã cập nhật điểm và phản hồi thành công!');
      setShowGradingModal(false);
      void loadSubmissionsData();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi lưu kết quả');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <InstructorLayout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Đánh giá & Phản hồi</h1>
          <p className="mt-2 text-gray-600">Chấm điểm bài lab và gửi phản hồi thực tế cho học viên</p>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Chờ chấm (Chưa làm)</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{pendingCount}</p>
              </div>
              <div className="rounded-full bg-orange-100 p-3">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Đang thực hành</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{gradingCount}</p>
              </div>
              <div className="rounded-full bg-blue-100 p-3">
                <Edit3 className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Đã chấm điểm</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{gradedCount}</p>
              </div>
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Đã phản hồi</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{reviewedCount}</p>
              </div>
              <div className="rounded-full bg-purple-100 p-3">
                <MessageSquare className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex-1 lg:max-w-md">
            <SearchBar
              placeholder="Tìm kiếm học viên hoặc bài lab..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white"
            >
              <option value="all">Tất cả lớp</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div className="flex gap-1 border border-gray-200 rounded-lg p-1 bg-white">
              <Button
                variant={filterStatus === 'all' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('all')}
                className="px-3 py-1 text-xs"
              >
                Tất cả
              </Button>
              <Button
                variant={filterStatus === 'pending' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('pending')}
                className="px-3 py-1 text-xs"
              >
                Chờ làm
              </Button>
              <Button
                variant={filterStatus === 'grading' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('grading')}
                className="px-3 py-1 text-xs"
              >
                Đang làm
              </Button>
              <Button
                variant={filterStatus === 'graded' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('graded')}
                className="px-3 py-1 text-xs"
              >
                Đã chấm
              </Button>
              <Button
                variant={filterStatus === 'reviewed' ? 'default' : 'outline'}
                onClick={() => setFilterStatus('reviewed')}
                className="px-3 py-1 text-xs"
              >
                Đã phản hồi
              </Button>
            </div>
          </div>
        </div>

        {/* Messages */}
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

        {/* Submissions List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500 bg-white rounded-lg border border-gray-200 shadow-sm">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm">Đang tải danh sách bài thực hành...</p>
            </div>
          ) : filteredSubmissions.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <FileText className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Không có bài nộp nào</h3>
              <p className="text-gray-600">Thử điều chỉnh bộ lọc hoặc tìm kiếm khác</p>
            </div>
          ) : (
            filteredSubmissions.map((submission) => (
              <div
                key={submission.id}
                className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  {/* Submission Info */}
                  <div className="flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {submission.studentName}
                      </h3>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          submission.status === 'pending'
                            ? 'bg-orange-100 text-orange-800'
                            : submission.status === 'grading'
                              ? 'bg-blue-100 text-blue-800'
                              : submission.status === 'graded'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {submission.status === 'pending'
                          ? 'Chờ làm'
                          : submission.status === 'grading'
                            ? 'Đang làm'
                            : submission.status === 'graded'
                              ? 'Đã chấm'
                              : 'Đã phản hồi'}
                      </span>
                    </div>

                    <p className="mb-2 text-gray-900 font-medium">{submission.labTitle}</p>
                    <p className="mb-3 text-sm text-gray-600">{submission.studentEmail}</p>

                    <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        <span>{submission.class}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>Cập nhật: {submission.submittedAt}</span>
                      </div>
                      <div>
                        <span>Thời gian: {submission.timeSpent}</span>
                      </div>
                      <div>
                        <span>Lần nộp: {submission.attempts}</span>
                      </div>
                    </div>

                    {/* Scores */}
                    <div className="mt-3 flex gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Điểm tự động: </span>
                        <span className="font-semibold text-blue-600">
                          {submission.autoScore}%
                        </span>
                      </div>
                      {submission.finalScore !== undefined && (
                        <div>
                          <span className="text-gray-600">Điểm cuối cùng: </span>
                          <span className="font-semibold text-green-600">
                            {submission.finalScore}/100
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Link href={`/instructor/grading/${submission.id}`}>
                      <Button variant="outline" size="sm" className="flex items-center gap-2">
                        <Eye className="h-4 w-4" />
                        Xem chi tiết
                      </Button>
                    </Link>
                    {submission.status === 'pending' || submission.status === 'grading' ? (
                      <Button
                        size="sm"
                        className="flex items-center gap-2"
                        onClick={() => handleGrade(submission)}
                      >
                        <Edit3 className="h-4 w-4" />
                        Chấm điểm
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex items-center gap-2"
                        onClick={() => handleGrade(submission)}
                      >
                        <MessageSquare className="h-4 w-4" />
                        Sửa phản hồi
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Grading Modal */}
        {showGradingModal && selectedSubmission && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Chấm điểm & Phản hồi</h2>
                <button
                  onClick={() => setShowGradingModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Student Info */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Học viên</p>
                  <p className="font-semibold text-gray-900">{selectedSubmission.studentName}</p>
                  <p className="text-sm text-gray-600 mt-1">{selectedSubmission.labTitle}</p>
                </div>

                {/* Auto Score */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Điểm tự động (Hệ thống chấm)
                  </label>
                  <div className="rounded-lg border border-gray-300 bg-gray-50 p-3">
                    <span className="text-2xl font-bold text-blue-600">
                      {selectedSubmission.autoScore}%
                    </span>
                  </div>
                </div>

                {/* Manual Score Override */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Điểm cuối cùng (0 - 100) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={manualScore}
                    onChange={(e) => setManualScore(Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                {/* Feedback */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Nhận xét & Phản hồi
                  </label>
                  <textarea
                    rows={6}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Viết nhận xét cho học viên..."
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-4">
                  <Button variant="outline" onClick={() => setShowGradingModal(false)} disabled={isSaving}>
                    Hủy
                  </Button>
                  <Button className="flex items-center gap-2" onClick={handleSaveGrade} disabled={isSaving}>
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Gửi đánh giá
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </InstructorLayout>
  );
}
