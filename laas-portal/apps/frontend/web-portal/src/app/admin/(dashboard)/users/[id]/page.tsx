'use client';

import {
  Activity,
  BookOpen,
  Calendar,
  CreditCard,
  Edit,
  Lock,
  Mail,
  Phone,
  Save,
  Shield,
  Unlock,
  User,
  X,
} from 'lucide-react';

import React, { useState } from 'react';

import Link from 'next/link';

import { Button } from '@laas-portal/ui';

const mockUser = {
  id: 'USR-001',
  name: 'Nguyễn Văn A',
  email: 'nguyenvana@student.hcmus.edu.vn',
  phone: '+84 901 234 567',
  studentCode: '22127001',
  avatar: '',
  status: 'Online',
  accountStatus: 'active',
  role: 'student',
  registrationDate: '13/11/2025',
  lastLogin: '1 phút trước',
  organization: 'HCMUS - Đại học Khoa học Tự nhiên',
  department: 'Khoa Công nghệ Thông tin',
};

const mockStats = {
  totalLabs: 24,
  completedLabs: 18,
  inProgressLabs: 4,
  averageScore: 8.5,
  totalTimeSpent: '156.5 giờ',
  totalSpent: '5,800,000 VND',
};

const mockActivities = [
  {
    id: '1',
    type: 'lab_complete',
    title: 'Hoàn thành Lab: Docker Container Fundamentals',
    time: '2 giờ trước',
    icon: BookOpen,
    color: 'text-green-600 bg-green-50',
  },
  {
    id: '2',
    type: 'lab_start',
    title: 'Bắt đầu Lab: Kubernetes Administration',
    time: '1 ngày trước',
    icon: Activity,
    color: 'text-blue-600 bg-blue-50',
  },
  {
    id: '3',
    type: 'payment',
    title: 'Thanh toán hóa đơn #INV-1234 (500,000 VND)',
    time: '3 ngày trước',
    icon: CreditCard,
    color: 'text-purple-600 bg-purple-50',
  },
  {
    id: '4',
    type: 'lab_complete',
    title: 'Hoàn thành Lab: Network Security Basics',
    time: '5 ngày trước',
    icon: BookOpen,
    color: 'text-green-600 bg-green-50',
  },
];

const mockEnrolledLabs = [
  {
    id: 'lab-001',
    name: 'Kubernetes Advanced Administration',
    category: 'DevOps',
    status: 'in-progress',
    progress: 65,
    startDate: '01/11/2025',
    lastAccessed: '1 giờ trước',
  },
  {
    id: 'lab-002',
    name: 'Docker Container Fundamentals',
    category: 'DevOps',
    status: 'completed',
    progress: 100,
    startDate: '15/10/2025',
    completedDate: '28/10/2025',
    score: 9.2,
  },
  {
    id: 'lab-003',
    name: 'Network Security with PFSense',
    category: 'Security',
    status: 'in-progress',
    progress: 40,
    startDate: '20/11/2025',
    lastAccessed: '2 ngày trước',
  },
];

const mockInvoices = [
  {
    id: 'INV-1234',
    amount: '500,000 VND',
    date: '20/11/2025',
    status: 'paid',
    description: 'Lab subscription - November 2025',
  },
  {
    id: 'INV-1233',
    amount: '500,000 VND',
    date: '20/10/2025',
    status: 'paid',
    description: 'Lab subscription - October 2025',
  },
  {
    id: 'INV-1232',
    amount: '800,000 VND',
    date: '15/10/2025',
    status: 'paid',
    description: 'Premium lab package',
  },
];

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const [adminNotes, setAdminNotes] = useState(
    'Học viên có tiến độ học tập tốt. Thường xuyên hoàn thành lab đúng hạn.'
  );
  const [showEditModal, setShowEditModal] = useState(false);

  // Form states for edit modal
  const [name, setName] = useState(mockUser.name);
  const [email, setEmail] = useState(mockUser.email);
  const [phone, setPhone] = useState(mockUser.phone);
  const [studentCode, setStudentCode] = useState(mockUser.studentCode);
  const [role, setRole] = useState(mockUser.role);
  const [accountStatus, setAccountStatus] = useState(mockUser.accountStatus);
  const [organization, setOrganization] = useState(mockUser.organization);
  const [department, setDepartment] = useState(mockUser.department);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-gray-600">
        <Link href="/users" className="hover:text-blue-600">
          Quản lý học viên
        </Link>
        <span>/</span>
        <span className="text-gray-900">{mockUser.name}</span>
      </nav>

      {/* Header - User Profile */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          {/* Left: Profile Info */}
          <div className="flex gap-4">
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-blue-100">
              <User className="h-10 w-10 text-blue-600" />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{mockUser.name}</h1>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    mockUser.accountStatus === 'active'
                      ? 'bg-green-100 text-green-800'
                      : mockUser.accountStatus === 'locked'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {mockUser.accountStatus === 'active'
                    ? 'Đang hoạt động'
                    : mockUser.accountStatus === 'locked'
                      ? 'Đã khóa'
                      : 'Không hoạt động'}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    mockUser.status === 'Online'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {mockUser.status}
                </span>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>MSSV: {mockUser.studentCode}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  <span>{mockUser.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span>{mockUser.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>Đăng ký: {mockUser.registrationDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  <span>Hoạt động gần nhất: {mockUser.lastLogin}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowEditModal(true)}>
              <Edit className="mr-2 h-4 w-4" />
              Chỉnh sửa
            </Button>
            {mockUser.accountStatus === 'active' ? (
              <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50">
                <Lock className="mr-2 h-4 w-4" />
                Khóa tài khoản
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="text-green-600 hover:bg-green-50">
                <Unlock className="mr-2 h-4 w-4" />
                Mở khóa
              </Button>
            )}
          </div>
        </div>

        {/* Organization Info */}
        <div className="mt-6 grid grid-cols-1 gap-4 rounded-lg bg-gray-50 p-4 md:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-gray-700">Tổ chức</p>
            <p className="mt-1 text-gray-900">{mockUser.organization}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700">Khoa/Phòng ban</p>
            <p className="mt-1 text-gray-900">{mockUser.department}</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Tổng Labs</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{mockStats.totalLabs}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Hoàn thành</p>
          <p className="mt-2 text-2xl font-bold text-green-600">{mockStats.completedLabs}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Đang làm</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{mockStats.inProgressLabs}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Điểm TB</p>
          <p className="mt-2 text-2xl font-bold text-purple-600">{mockStats.averageScore}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Thời gian</p>
          <p className="mt-2 text-xl font-bold text-orange-600">{mockStats.totalTimeSpent}</p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-600">Tổng chi tiêu</p>
          <p className="mt-2 text-xl font-bold text-red-600">{mockStats.totalSpent}</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column - Labs & Invoices */}
        <div className="space-y-6 lg:col-span-2">
          {/* Enrolled Labs */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Labs đã đăng ký</h2>

            <div className="space-y-4">
              {mockEnrolledLabs.map((lab) => (
                <div
                  key={lab.id}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4 transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <Link
                        href={`/admin/labs/${lab.id}`}
                        className="font-semibold text-gray-900 hover:text-blue-600"
                      >
                        {lab.name}
                      </Link>
                      <p className="text-sm text-gray-600">{lab.category}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
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
                  </div>

                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-gray-600">Tiến độ</span>
                      <span className="font-medium text-gray-900">{lab.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={`h-full ${lab.progress === 100 ? 'bg-green-600' : 'bg-blue-600'}`}
                        style={{ width: `${lab.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-600">
                    <span>Bắt đầu: {lab.startDate}</span>
                    {lab.status === 'completed' ? (
                      <span>
                        Hoàn thành: {lab.completedDate} | Điểm: {lab.score}
                      </span>
                    ) : (
                      <span>Truy cập: {lab.lastAccessed}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Invoices */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Hóa đơn gần đây</h2>
              <Link href={`/invoices?userId=${params.id}`}>
                <Button variant="outline" size="sm">
                  Xem tất cả
                </Button>
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-700">
                      Mã hóa đơn
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-700">
                      Ngày
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-700">
                      Số tiền
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-700">
                      Trạng thái
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {mockInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="font-medium text-blue-600 hover:text-blue-700"
                        >
                          {invoice.id}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{invoice.date}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {invoice.amount}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            invoice.status === 'paid'
                              ? 'bg-green-100 text-green-800'
                              : invoice.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {invoice.status === 'paid'
                            ? 'Đã thanh toán'
                            : invoice.status === 'pending'
                              ? 'Chờ thanh toán'
                              : 'Quá hạn'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column - Activity & Notes */}
        <div className="space-y-6">
          {/* Activity Timeline */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Hoạt động gần đây</h2>
            <div className="space-y-4">
              {mockActivities.map((activity) => (
                <div key={activity.id} className="flex gap-3">
                  <div className="flex-shrink-0">
                    <div className={`rounded-full p-2 ${activity.color}`}>
                      <activity.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{activity.title}</p>
                    <p className="text-xs text-gray-600">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Admin Notes */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Ghi chú quản trị</h2>
            <textarea
              rows={6}
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              placeholder="Thêm ghi chú riêng tư về học viên..."
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <div className="mt-4 flex justify-end">
              <Button size="sm">Lưu ghi chú</Button>
            </div>
          </div>

          {/* Account Actions */}
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Hành động tài khoản</h2>
            <div className="space-y-3">
              <Button variant="outline" className="w-full justify-start">
                <Shield className="mr-2 h-4 w-4" />
                Đặt lại mật khẩu
              </Button>
              <Button variant="outline" className="w-full justify-start">
                <Mail className="mr-2 h-4 w-4" />
                Gửi email thông báo
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start text-red-600 hover:bg-red-50"
              >
                <Lock className="mr-2 h-4 w-4" />
                {mockUser.accountStatus === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Edit User Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6">
              <h2 className="text-2xl font-bold text-gray-900">Chỉnh sửa thông tin học viên</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="space-y-6">
                {/* Personal Information */}
                <div>
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">Thông tin cá nhân</h3>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Họ và tên <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Mã sinh viên <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={studentCode}
                        onChange={(e) => setStudentCode(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Số điện thoại <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Organization Information */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">Thông tin tổ chức</h3>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Tổ chức
                      </label>
                      <input
                        type="text"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Khoa/Phòng ban
                      </label>
                      <input
                        type="text"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                  </div>
                </div>

                {/* Account Settings */}
                <div className="border-t border-gray-200 pt-6">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">Cài đặt tài khoản</h3>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Vai trò <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="student">Học viên</option>
                        <option value="instructor">Giảng viên</option>
                        <option value="admin">Quản trị viên</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        Trạng thái tài khoản <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={accountStatus}
                        onChange={(e) => setAccountStatus(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="active">Đang hoạt động</option>
                        <option value="inactive">Không hoạt động</option>
                        <option value="locked">Đã khóa</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-200 bg-gray-50 p-6">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Hủy
              </Button>
              <Button
                onClick={() => {
                  // TODO: Save logic here
                  console.log('Saving:', {
                    name,
                    email,
                    phone,
                    studentCode,
                    role,
                    accountStatus,
                    organization,
                    department,
                  });
                  setShowEditModal(false);
                }}
              >
                <Save className="mr-2 h-4 w-4" />
                Lưu thay đổi
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
