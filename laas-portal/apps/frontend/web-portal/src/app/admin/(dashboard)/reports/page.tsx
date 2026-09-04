'use client';

import {
  Activity,
  BarChart3,
  BookOpen,

  Clock,
  Download,
  LayoutGrid,
  PieChart,
  Server,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

import React, { useState } from 'react';

import { Button } from '@laas-portal/ui';

const reportTypes = [
  {
    id: 'user-activity',
    title: 'Báo cáo hoạt động người dùng',
    description: 'Đăng ký, người dùng hoạt động, tỷ lệ hoàn thành',
    icon: Users,
    iconColor: 'text-blue-600',
    bgColor: 'bg-blue-100',
  },
  {
    id: 'lab-usage',
    title: 'Báo cáo sử dụng Lab',
    description: 'Lab phổ biến, thời gian hoàn thành, xếp hạng',
    icon: BookOpen,
    iconColor: 'text-green-600',
    bgColor: 'bg-green-100',
  },
  {
    id: 'financial',
    title: 'Báo cáo tài chính',
    description: 'Doanh thu, chi phí, lợi nhuận theo thời gian',
    icon: Wallet,
    iconColor: 'text-purple-600',
    bgColor: 'bg-purple-100',
  },
  {
    id: 'resource-usage',
    title: 'Báo cáo tài nguyên hệ thống',
    description: 'Tải máy chủ, chi phí tài nguyên, hiệu suất',
    icon: Server,
    iconColor: 'text-orange-600',
    bgColor: 'bg-orange-100',
  },
];

const mockUserActivityData = {
  totalRegistrations: 247,
  activeUsers: 1892,
  completionRate: 76.3,
  averageSessionTime: '2.4 giờ',
  topUsers: [
    { name: 'Nguyễn Văn A', labs: 24, hours: 156.5, completion: 100 },
    { name: 'Trần Thị B', labs: 22, hours: 142.3, completion: 95 },
    { name: 'Lê Văn C', labs: 20, hours: 138.2, completion: 90 },
    { name: 'Phạm Thị D', labs: 19, hours: 125.7, completion: 89 },
    { name: 'Hoàng Văn E', labs: 18, hours: 119.4, completion: 88 },
  ],
};

const mockLabUsageData = {
  totalLabs: 156,
  totalSessions: 4523,
  averageCompletion: 45.2,
  totalHours: 12847,
  topLabs: [
    {
      name: 'Networking Fundamentals',
      sessions: 876,
      avgTime: '3.2 giờ',
      completion: 82,
    },
    {
      name: 'Web Development with React',
      sessions: 742,
      avgTime: '4.5 giờ',
      completion: 71,
    },
    {
      name: 'Cloud Computing with AWS',
      sessions: 654,
      avgTime: '5.1 giờ',
      completion: 68,
    },
    {
      name: 'Database Management Systems',
      sessions: 589,
      avgTime: '3.8 giờ',
      completion: 75,
    },
    {
      name: 'Cybersecurity Basics',
      sessions: 512,
      avgTime: '4.2 giờ',
      completion: 79,
    },
  ],
};

const mockFinancialData = {
  totalRevenue: '12,450,000,000',
  totalExpenses: '8,320,000,000',
  netProfit: '4,130,000,000',
  profitMargin: '33.2%',
  monthlyBreakdown: [
    { month: 'T1', revenue: 980, expenses: 650, profit: 330 },
    { month: 'T2', revenue: 1020, expenses: 680, profit: 340 },
    { month: 'T3', revenue: 1150, expenses: 720, profit: 430 },
    { month: 'T4', revenue: 1080, expenses: 700, profit: 380 },
    { month: 'T5', revenue: 1220, expenses: 780, profit: 440 },
    { month: 'T6', revenue: 1100, expenses: 710, profit: 390 },
  ],
};

const mockResourceData = {
  totalServers: 24,
  averageCPU: 58,
  averageRAM: 72,
  averageDisk: 64,
  monthlyCost: '45,200,000',
  costPerStudent: '23,800',
  peakUsageTime: '14:00 - 16:00',
  servers: [
    { name: 'lab-server-01', cpu: 45, ram: 62, disk: 58, cost: '4.2M' },
    { name: 'lab-server-02', cpu: 78, ram: 81, disk: 72, cost: '5.8M' },
    { name: 'lab-server-04', cpu: 32, ram: 48, disk: 38, cost: '3.5M' },
    { name: 'lab-server-06', cpu: 92, ram: 94, disk: 88, cost: '6.9M' },
  ],
};

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<string>('user-activity');
  const [dateRange, setDateRange] = useState('last-30-days');
  const [exportFormat, setExportFormat] = useState('pdf');

  const handleExport = () => {
    console.log(`Exporting ${selectedReport} as ${exportFormat}`);
    // Handle export logic
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Báo cáo & Phân tích</h1>
          <p className="mt-1 text-sm text-gray-600">Xem thống kê chi tiết và xuất báo cáo</p>
        </div>
      </div>

      {/* Report Type Selection */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {reportTypes.map((report) => {
          const Icon = report.icon;
          return (
            <button
              key={report.id}
              onClick={() => setSelectedReport(report.id)}
              className={`flex items-start gap-4 rounded-lg border p-4 text-left transition-all ${
                selectedReport === report.id
                  ? 'border-blue-500 bg-blue-50 shadow-md'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              <div className={`rounded-lg ${report.bgColor} p-3`}>
                <Icon className={`h-6 w-6 ${report.iconColor}`} />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{report.title}</h3>
                <p className="mt-1 text-xs text-gray-600">{report.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Filters and Export */}
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Khoảng thời gian</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="today">Hôm nay</option>
              <option value="yesterday">Hôm qua</option>
              <option value="last-7-days">7 ngày qua</option>
              <option value="last-30-days">30 ngày qua</option>
              <option value="this-month">Tháng này</option>
              <option value="last-month">Tháng trước</option>
              <option value="this-year">Năm nay</option>
              <option value="custom">Tùy chỉnh</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Định dạng xuất</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value)}
              className="rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="pdf">PDF</option>
              <option value="excel">Excel (XLSX)</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>

        <Button onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Xuất báo cáo
        </Button>
      </div>

      {/* Report Content */}
      <div className="space-y-6">
        {/* User Activity Report */}
        {selectedReport === 'user-activity' && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Đăng ký mới</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockUserActivityData.totalRegistrations}
                    </p>
                  </div>
                  <div className="rounded-full bg-blue-100 p-3">
                    <Users className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-green-600">
                  <TrendingUp className="inline h-3 w-3" /> +12.5% so với tháng trước
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Người dùng hoạt động</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockUserActivityData.activeUsers.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-full bg-green-100 p-3">
                    <Activity className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-green-600">
                  <TrendingUp className="inline h-3 w-3" /> +8.3% so với tháng trước
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Tỷ lệ hoàn thành</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockUserActivityData.completionRate}%
                    </p>
                  </div>
                  <div className="rounded-full bg-purple-100 p-3">
                    <BarChart3 className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-green-600">
                  <TrendingUp className="inline h-3 w-3" /> +5.2% so với tháng trước
                </p>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Thời gian TB/phiên</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockUserActivityData.averageSessionTime}
                    </p>
                  </div>
                  <div className="rounded-full bg-orange-100 p-3">
                    <Clock className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-600">So với tháng trước</p>
              </div>
            </div>

            {/* Top Users Table */}
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Top 5 người dùng tích cực nhất
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Học viên
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Số Lab hoàn thành
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Tổng thời gian
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Tỷ lệ hoàn thành
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {mockUserActivityData.topUsers.map((user, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600">
                              {index + 1}
                            </div>
                            <span className="font-medium text-gray-900">{user.name}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-900">
                          {user.labs} labs
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-900">
                          {user.hours} giờ
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                              <div
                                className="h-full bg-green-500"
                                style={{ width: `${user.completion}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-900">{user.completion}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Lab Usage Report */}
        {selectedReport === 'lab-usage' && (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Tổng số Lab</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockLabUsageData.totalLabs}
                    </p>
                  </div>
                  <div className="rounded-full bg-green-100 p-3">
                    <BookOpen className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Tổng phiên học</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockLabUsageData.totalSessions.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-full bg-blue-100 p-3">
                    <Activity className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Thời gian hoàn thành TB</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockLabUsageData.averageCompletion} phút
                    </p>
                  </div>
                  <div className="rounded-full bg-purple-100 p-3">
                    <Clock className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Tổng giờ học</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockLabUsageData.totalHours.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-full bg-orange-100 p-3">
                    <Clock className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900">Top 5 Lab phổ biến nhất</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Tên Lab
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Số phiên học
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Thời gian TB
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Tỷ lệ hoàn thành
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {mockLabUsageData.topLabs.map((lab, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 font-semibold text-green-600">
                              {index + 1}
                            </div>
                            <span className="font-medium text-gray-900">{lab.name}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-900">
                          {lab.sessions} phiên
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-900">{lab.avgTime}</td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-gray-200">
                              <div
                                className="h-full bg-green-500"
                                style={{ width: `${lab.completion}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-900">{lab.completion}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Financial Report */}
        {selectedReport === 'financial' && (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Tổng doanh thu</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {mockFinancialData.totalRevenue} đ
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
                    <p className="text-sm font-medium text-gray-600">Tổng chi phí</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {mockFinancialData.totalExpenses} đ
                    </p>
                  </div>
                  <div className="rounded-full bg-red-100 p-3">
                    <Wallet className="h-6 w-6 text-red-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Lợi nhuận ròng</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {mockFinancialData.netProfit} đ
                    </p>
                  </div>
                  <div className="rounded-full bg-blue-100 p-3">
                    <BarChart3 className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Biên lợi nhuận</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockFinancialData.profitMargin}
                    </p>
                  </div>
                  <div className="rounded-full bg-purple-100 p-3">
                    <PieChart className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="mb-6 text-lg font-semibold text-gray-900">
                Phân tích tài chính theo tháng (triệu đồng)
              </h3>
              <div className="space-y-4">
                {mockFinancialData.monthlyBreakdown.map((month, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font medium text-gray-900">{month.month}</span>
                      <div className="flex gap-4 text-xs">
                        <span className="text-green-600">DT: {month.revenue}M</span>
                        <span className="text-red-600">CP: {month.expenses}M</span>
                        <span className="text-blue-600">LN: {month.profit}M</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <div
                        className="h-8 rounded-l bg-green-500"
                        style={{
                          width: `${(month.revenue / 1500) * 100}%`,
                        }}
                      />
                      <div
                        className="h-8 bg-red-500"
                        style={{
                          width: `${(month.expenses / 1500) * 100}%`,
                        }}
                      />
                      <div
                        className="h-8 rounded-r bg-blue-500"
                        style={{
                          width: `${(month.profit / 1500) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Resource Usage Report */}
        {selectedReport === 'resource-usage' && (
          <>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Tổng số Server</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockResourceData.totalServers}
                    </p>
                  </div>
                  <div className="rounded-full bg-blue-100 p-3">
                    <Server className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">CPU TB</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockResourceData.averageCPU}%
                    </p>
                  </div>
                  <div className="rounded-full bg-purple-100 p-3">
                    <Activity className="h-6 w-6 text-purple-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">RAM TB</p>
                    <p className="mt-2 text-3xl font-bold text-gray-900">
                      {mockResourceData.averageRAM}%
                    </p>
                  </div>
                  <div className="rounded-full bg-orange-100 p-3">
                    <LayoutGrid className="h-6 w-6 text-orange-600" />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Chi phí/tháng</p>
                    <p className="mt-2 text-2xl font-bold text-gray-900">
                      {mockResourceData.monthlyCost} đ
                    </p>
                  </div>
                  <div className="rounded-full bg-green-100 p-3">
                    <Wallet className="h-6 w-6 text-green-600" />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Chi tiết tài nguyên các Server
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Server
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        CPU
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        RAM
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Disk
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                        Chi phí/tháng
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {mockResourceData.servers.map((server, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-6 py-4 font-medium text-gray-900">
                          {server.name}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                              <div
                                className={`h-full ${server.cpu >= 90 ? 'bg-red-500' : server.cpu >= 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                style={{ width: `${server.cpu}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-900">{server.cpu}%</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                              <div
                                className={`h-full ${server.ram >= 90 ? 'bg-red-500' : server.ram >= 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                style={{ width: `${server.ram}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-900">{server.ram}%</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                              <div
                                className={`h-full ${server.disk >= 90 ? 'bg-red-500' : server.disk >= 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                style={{ width: `${server.disk}%` }}
                              />
                            </div>
                            <span className="text-sm text-gray-900">{server.disk}%</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-gray-900">{server.cost}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
