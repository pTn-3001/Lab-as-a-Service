'use client';

import { Award, BarChart3, BookOpen, Clock, Download, TrendingUp, Users } from 'lucide-react';

import React, { useState } from 'react';

import { Button, InstructorLayout } from '@laas-portal/ui';

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState('thisMonth');
  const [selectedClass, setSelectedClass] = useState('all');

  return (
    <InstructorLayout basePath="/instructor">
      <div className="p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Báo cáo & Thống kê</h1>
            <p className="mt-2 text-gray-600">Xem thường kỳ, phân tích và xuất báo cáo chi tiết</p>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Xuất CSV
            </Button>
            <Button className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Xuất PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-900">Bộ lọc</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Khoảng thời gian
              </label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="thisWeek">Tuần này</option>
                <option value="thisMonth">Tháng này</option>
                <option value="thisQuarter">Quý này</option>
                <option value="thisSemester">Học kỳ này</option>
                <option value="thisYear">Năm này</option>
                <option value="custom">Tùy chỉnh</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Lớp học</label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="all">Tất cả lớp</option>
                <option value="devops2024a">DevOps 2024A</option>
                <option value="devops2024b">DevOps 2024B</option>
                <option value="cloud2024">Cloud Computing 2024</option>
                <option value="security2024">Network Security 2024</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Loại báo cáo</label>
              <select className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200">
                <option value="overview">Tổng quan</option>
                <option value="detailed">Chi tiết</option>
                <option value="compareion">So sánh</option>
              </select>
            </div>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Lab đã sử dụng</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">247</p>
                <p className="mt-2 flex items-center gap-1 text-sm text-green-600">
                  <TrendingUp className="h-4 w-4" />
                  +12% so với tháng trước
                </p>
              </div>
              <div className="rounded-full bg-blue-100 p-3">
                <BookOpen className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Tổng thời gian</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">1,284h</p>
                <p className="mt-2 flex items-center gap-1 text-sm text-green-600">
                  <TrendingUp className="h-4 w-4" />
                  +8% so với tháng trước
                </p>
              </div>
              <div className="rounded-full bg-green-100 p-3">
                <Clock className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Điểm TB lớp</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">78.5</p>
                <p className="mt-2 flex items-center gap-1 text-sm text-green-600">
                  <TrendingUp className="h-4 w-4" />
                  +3.2 điểm
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
                <p className="text-sm font-medium text-gray-600">Tỷ lệ hoàn thành</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">84%</p>
                <p className="mt-2 flex items-center gap-1 text-sm text-green-600">
                  <TrendingUp className="h-4 w-4" />
                  +5% so với tháng trước
                </p>
              </div>
              <div className="rounded-full bg-orange-100 p-3">
                <Users className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Lab Usage Chart */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <BarChart3 className="h-5 w-5" />
              Số lab được sử dụng
            </h2>
            <div className="flex h-64 items-end justify-between gap-2">
              {[45, 52, 48, 61, 58, 67, 72, 68, 75, 71, 78, 82].map((value, idx) => (
                <div key={idx} className="flex flex-1 flex-col items-center">
                  <div
                    className="w-full rounded-t-lg bg-blue-500 transition-all hover:bg-blue-600"
                    style={{ height: `${(value / 100) * 100}%` }}
                  />
                  <span className="mt-2 text-xs text-gray-600">T{idx + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Score Distribution */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
              <Award className="h-5 w-5" />
              Phân bố điểm số
            </h2>
            <div className="space-y-4">
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-gray-700">Xuất sắc (90-100)</span>
                  <span className="font-semibold text-gray-900">24 học viên (19%)</span>
                </div>
                <div className="h-3 w-full rounded-full bg-gray-200">
                  <div className="h-3 rounded-full bg-green-500" style={{ width: '19%' }} />
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-gray-700">Giỏi (80-89)</span>
                  <span className="font-semibold text-gray-900">42 học viên (33%)</span>
                </div>
                <div className="h-3 w-full rounded-full bg-gray-200">
                  <div className="h-3 rounded-full bg-blue-500" style={{ width: '33%' }} />
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-gray-700">Khá (70-79)</span>
                  <span className="font-semibold text-gray-900">38 học viên (30%)</span>
                </div>
                <div className="h-3 w-full rounded-full bg-gray-200">
                  <div className="h-3 rounded-full bg-yellow-500" style={{ width: '30%' }} />
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-gray-700">Trung bình (60-69)</span>
                  <span className="font-semibold text-gray-900">15 học viên (12%)</span>
                </div>
                <div className="h-3 w-full rounded-full bg-gray-200">
                  <div className="h-3 rounded-full bg-orange-500" style={{ width: '12%' }} />
                </div>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-gray-700">Yếu (&lt;60)</span>
                  <span className="font-semibold text-gray-900">8 học viên (6%)</span>
                </div>
                <div className="h-3 w-full rounded-full bg-gray-200">
                  <div className="h-3 rounded-full bg-red-500" style={{ width: '6%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Labs Table */}
        <div className="mb-8 rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">Lab phổ biến nhất</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">
                    Tên Lab
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Lượt sử dụng
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Điểm TB
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Tỷ lệ hoàn thành
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Thời gian TB
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {[
                  {
                    name: 'Docker Container Fundamentals',
                    usage: 85,
                    avgScore: 82,
                    completion: 89,
                    avgTime: '3.5h',
                  },
                  {
                    name: 'Kubernetes Orchestration',
                    usage: 67,
                    avgScore: 76,
                    completion: 78,
                    avgTime: '5.2h',
                  },
                  {
                    name: 'CI/CD Pipelines with Jenkins',
                    usage: 54,
                    avgScore: 79,
                    completion: 82,
                    avgTime: '4.1h',
                  },
                  {
                    name: 'Docker Networking Deep Dive',
                    usage: 48,
                    avgScore: 73,
                    completion: 75,
                    avgTime: '4.8h',
                  },
                  {
                    name: 'Web Security: OWASP Top 10',
                    usage: 42,
                    avgScore: 81,
                    completion: 86,
                    avgTime: '3.9h',
                  },
                ].map((lab, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{lab.name}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-gray-900">{lab.usage}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`font-semibold ${
                          lab.avgScore >= 80
                            ? 'text-green-600'
                            : lab.avgScore >= 70
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}
                      >
                        {lab.avgScore}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium text-gray-900">{lab.completion}%</span>
                        <div className="h-2 w-24 rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full bg-blue-500"
                            style={{ width: `${lab.completion}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-gray-900">{lab.avgTime}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Class Comparison */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-6 text-lg font-semibold text-gray-900">So sánh lớp học</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-900">Lớp</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Học viên
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Lab hoàn thành
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Điểm TB
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Tỷ lệ hoàn thành
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {[
                  {
                    name: 'DevOps 2024A',
                    students: 35,
                    labsDone: 245,
                    avgScore: 82,
                    completion: 87,
                  },
                  {
                    name: 'DevOps 2024B',
                    students: 30,
                    labsDone: 198,
                    avgScore: 78,
                    completion: 82,
                  },
                  { name: 'Cloud 2024', students: 28, labsDone: 156, avgScore: 75, completion: 79 },
                  {
                    name: 'Security 2024',
                    students: 32,
                    labsDone: 187,
                    avgScore: 80,
                    completion: 85,
                  },
                ].map((cls, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-900">{cls.name}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-gray-900">{cls.students}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="text-gray-900">{cls.labsDone}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`font-semibold ${
                          cls.avgScore >= 80
                            ? 'text-green-600'
                            : cls.avgScore >= 70
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }`}
                      >
                        {cls.avgScore}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-medium text-gray-900">{cls.completion}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </InstructorLayout>
  );
}
