'use client';

import { Award, Download, Eye, FileText, TrendingUp, User, Loader2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button, InstructorLayout, SearchBar } from '@laas-portal/ui';

interface GroupItem {
  id: string;
  name: string;
  code: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
  class: string;
  classId: string;
  totalLabs: number;
  completedLabs: number;
  averageScore: number;
  totalTime: string;
  lastActivity: string;
  status: 'active' | 'inactive' | 'at-risk';
}

export default function StudentsPage() {
  const [classes, setClasses] = useState<GroupItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [students, setStudents] = useState<Student[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Load instructor classes on mount
  useEffect(() => {
    async function loadClasses() {
      try {
        setIsLoading(true);
        const res = await fetch('/api/groups', { cache: 'no-store' });
        if (!res.ok) throw new Error('Không thể tải danh sách lớp học');
        const payload = await res.json();
        // The API returns the list directly or inside data
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

  // 2. Load students, classLabs, and grades when class selection changes
  useEffect(() => {
    let active = true;
    async function loadData() {
      if (classes.length === 0 && selectedClass !== 'all') return;
      try {
        setIsLoading(true);
        setErrorMsg('');
        
        // Determine which classes to fetch
        const targetClasses = selectedClass === 'all' 
          ? classes 
          : classes.filter(c => c.id === selectedClass);

        if (targetClasses.length === 0) {
          setStudents([]);
          return;
        }

        const allStudentsData: Student[] = [];

        // Fetch data for each class group in parallel
        await Promise.all(targetClasses.map(async (cls) => {
          try {
            const [studentsRes, classLabsRes, gradesRes] = await Promise.all([
              fetch(`/api/groups/${cls.id}/students?page=1&limit=100`, { cache: 'no-store' }),
              fetch(`/api/class-labs/by-group/${cls.id}`, { cache: 'no-store' }),
              fetch(`/api/grades/class/${cls.id}`, { cache: 'no-store' })
            ]);

            if (!studentsRes.ok || !classLabsRes.ok || !gradesRes.ok) {
              return;
            }

            const studentsPayload = await studentsRes.json();
            const classLabsPayload = await classLabsRes.json();
            const gradesPayload = await gradesRes.json();

            const studentList = Array.isArray(studentsPayload.data) ? studentsPayload.data : [];
            const classLabsList = classLabsPayload.success && Array.isArray(classLabsPayload.data) ? classLabsPayload.data : [];
            const gradesList = gradesPayload.success && Array.isArray(gradesPayload.data) ? gradesPayload.data : [];

            studentList.forEach((stud: any) => {
              const studentGrades = gradesList.filter((g: any) => g.studentId === stud.id);
              const completedCount = studentGrades.filter(
                (g: any) => g.status === 'COMPLETED' || g.status === 'GRADED'
              ).length;
              
              const totalGradesScore = studentGrades.reduce((sum: number, g: any) => sum + (g.percentage || 0), 0);
              const averageScore = studentGrades.length > 0 ? Math.round(totalGradesScore / studentGrades.length) : 0;

              // Calculate status
              let status: 'active' | 'inactive' | 'at-risk' = 'active';
              if (completedCount === 0) {
                status = 'inactive';
              } else if (averageScore < 60) {
                status = 'at-risk';
              }

              // Determine last activity time
              let lastActivity = 'Chưa có hoạt động';
              if (studentGrades.length > 0) {
                const latestDate = new Date(Math.max(...studentGrades.map((g: any) => new Date(g.updatedAt).getTime())));
                const diffMs = Date.now() - latestDate.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);

                if (diffMins < 60) {
                  lastActivity = `${diffMins} phút trước`;
                } else if (diffHours < 24) {
                  lastActivity = `${diffHours} giờ trước`;
                } else {
                  lastActivity = `${diffDays} ngày trước`;
                }
              }

              allStudentsData.push({
                id: stud.id,
                name: stud.fullName || stud.username || 'Học viên',
                email: stud.email || '',
                class: cls.name,
                classId: cls.id,
                totalLabs: classLabsList.length,
                completedLabs: completedCount,
                averageScore,
                totalTime: studentGrades.length > 0 ? `${studentGrades.length * 2} giờ` : '0 giờ',
                lastActivity,
                status,
              });
            });
          } catch {
            // Ignore single class fetch failures
          }
        }));

        if (active) {
          setStudents(allStudentsData);
        }
      } catch (err) {
        if (active) {
          setErrorMsg('Có lỗi xảy ra khi tải dữ liệu tiến độ học viên.');
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
  }, [classes, selectedClass]);

  // Filters
  const filteredStudents = students.filter((student) => {
    const matchesSearch =
      student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      student.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || student.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const avgCompletion = students.length > 0
    ? students.reduce((acc, s) => acc + (s.totalLabs > 0 ? (s.completedLabs / s.totalLabs) * 100 : 0), 0) / students.length
    : 0;

  const avgScore = students.length > 0
    ? students.reduce((acc, s) => acc + s.averageScore, 0) / students.length
    : 0;

  const handleExport = () => {
    const headers = ['Học viên', 'Email', 'Lớp', 'Tiến độ', 'Điểm trung bình', 'Trạng thái'];
    const rows = filteredStudents.map((s) => [
      s.name,
      s.email,
      s.class,
      `${s.completedLabs}/${s.totalLabs}`,
      s.averageScore,
      s.status === 'active' ? 'Hoạt động' : s.status === 'at-risk' ? 'Cần chú ý' : 'Không hoạt động'
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Theo_doi_hoc_vien_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <InstructorLayout>
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Theo dõi học viên</h1>
          <p className="mt-2 text-gray-600">Xem tiến độ, kết quả và hoạt động thực tế của học viên</p>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng học viên</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {isLoading ? '...' : filteredStudents.length}
                </p>
              </div>
              <div className="rounded-full bg-blue-100 p-3">
                <User className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tỷ lệ hoàn thành TB</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {isLoading ? '...' : `${avgCompletion.toFixed(0)}%`}
                </p>
              </div>
              <div className="rounded-full bg-green-100 p-3">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Điểm trung bình</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {isLoading ? '...' : avgScore.toFixed(0)}
                </p>
              </div>
              <div className="rounded-full bg-purple-100 p-3">
                <Award className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Cần chú ý</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {isLoading ? '...' : filteredStudents.filter((s) => s.status === 'at-risk').length}
                </p>
              </div>
              <div className="rounded-full bg-orange-100 p-3">
                <FileText className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex-1 lg:max-w-md">
            <SearchBar
              placeholder="Tìm kiếm học viên..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
            >
              <option value="all">Tất cả lớp</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Đang hoạt động</option>
              <option value="at-risk">Cần chú ý</option>
              <option value="inactive">Không hoạt động</option>
            </select>

            <Button variant="outline" onClick={handleExport} className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Xuất dữ liệu
            </Button>
          </div>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMsg}
          </div>
        )}

        {/* Students Table */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
              <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm">Đang tải dữ liệu học viên...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                      Học viên
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Lớp</th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                      Tiến độ
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                      Điểm TB
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                      Hoạt động cuối
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                      Trạng thái
                    </th>
                    <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredStudents.map((student) => (
                    <tr key={`${student.id}-${student.classId}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{student.name}</p>
                          <p className="text-sm text-gray-600">{student.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">{student.class}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-center">
                          <span className="mb-2 text-sm font-medium text-gray-900">
                            {student.completedLabs}/{student.totalLabs}
                          </span>
                          <div className="h-2 w-24 rounded-full bg-gray-200">
                            <div
                              className="h-2 rounded-full bg-blue-500"
                              style={{
                                width: `${student.totalLabs > 0 ? (student.completedLabs / student.totalLabs) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`font-semibold ${
                            student.averageScore >= 80
                              ? 'text-green-600'
                              : student.averageScore >= 60
                                ? 'text-yellow-600'
                                : 'text-red-600'
                          }`}
                        >
                          {student.averageScore}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm text-gray-700">{student.lastActivity}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                            student.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : student.status === 'at-risk'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {student.status === 'active'
                            ? 'Hoạt động'
                            : student.status === 'at-risk'
                              ? 'Cần chú ý'
                              : 'Không hoạt động'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Link href={`/instructor/students/${student.id}`}>
                          <Button variant="outline" size="sm" className="flex items-center gap-2">
                            <Eye className="h-4 w-4" />
                            Chi tiết
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && filteredStudents.length === 0 && (
            <div className="py-16 text-center bg-white">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <User className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900">Không tìm thấy học viên</h3>
              <p className="text-gray-600">Thử điều chỉnh bộ lọc hoặc tìm kiếm khác</p>
            </div>
          )}
        </div>
      </div>
    </InstructorLayout>
  );
}
