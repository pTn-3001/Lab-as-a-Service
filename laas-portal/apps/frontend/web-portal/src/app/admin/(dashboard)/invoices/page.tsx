'use client';

import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileText,
  Mail,
  MoreVertical,
  Plus,
  Search,
  Send,
  User,
  Wallet,
  XCircle,
} from 'lucide-react';

import React, { useState } from 'react';



import { Button } from '@laas-portal/ui';

const mockInvoices = [
  {
    id: 'INV-2025-001',
    userId: 'USR-001',
    userName: 'Nguyễn Văn A',
    userEmail: 'nguyenvana@student.hcmus.edu.vn',
    amount: 500000,
    issueDate: '01/01/2025',
    dueDate: '15/01/2025',
    paidDate: '12/01/2025',
    status: 'paid',
    items: [{ description: 'Lab: Networking Fundamentals', quantity: 1, price: 500000 }],
  },
  {
    id: 'INV-2025-002',
    userId: 'USR-002',
    userName: 'Trần Thị B',
    userEmail: 'tranthib@student.hcmus.edu.vn',
    amount: 800000,
    issueDate: '02/01/2025',
    dueDate: '16/01/2025',
    paidDate: null,
    status: 'overdue',
    items: [
      { description: 'Lab: Web Development with React', quantity: 1, price: 500000 },
      { description: 'Lab: Cloud Computing with AWS', quantity: 1, price: 300000 },
    ],
  },
  {
    id: 'INV-2025-003',
    userId: 'USR-003',
    userName: 'Lê Văn C',
    userEmail: 'levanc@student.hcmus.edu.vn',
    amount: 500000,
    issueDate: '03/01/2025',
    dueDate: '17/01/2025',
    paidDate: null,
    status: 'pending',
    items: [{ description: 'Lab: Database Management Systems', quantity: 1, price: 500000 }],
  },
  {
    id: 'INV-2025-004',
    userId: 'USR-004',
    userName: 'Phạm Thị D',
    userEmail: 'phamthid@student.hcmus.edu.vn',
    amount: 1200000,
    issueDate: '04/01/2025',
    dueDate: '18/01/2025',
    paidDate: '10/01/2025',
    status: 'paid',
    items: [
      { description: 'Lab: Cybersecurity Basics', quantity: 1, price: 500000 },
      { description: 'Lab: DevOps with Docker', quantity: 1, price: 400000 },
      { description: 'Lab: Kubernetes Fundamentals', quantity: 1, price: 300000 },
    ],
  },
  {
    id: 'INV-2025-005',
    userId: 'USR-005',
    userName: 'Hoàng Văn E',
    userEmail: 'hoangvane@student.hcmus.edu.vn',
    amount: 600000,
    issueDate: '05/01/2025',
    dueDate: '19/01/2025',
    paidDate: null,
    status: 'pending',
    items: [{ description: 'Lab: Machine Learning Basics', quantity: 1, price: 600000 }],
  },
  {
    id: 'INV-2025-006',
    userId: 'USR-006',
    userName: 'Nguyễn Thị F',
    userEmail: 'nguyenthif@student.hcmus.edu.vn',
    amount: 900000,
    issueDate: '06/01/2025',
    dueDate: '20/01/2025',
    paidDate: null,
    status: 'overdue',
    items: [
      { description: 'Lab: Data Science with Python', quantity: 1, price: 600000 },
      { description: 'Lab: SQL Advanced', quantity: 1, price: 300000 },
    ],
  },
  {
    id: 'INV-2025-007',
    userId: 'USR-007',
    userName: 'Trần Văn G',
    userEmail: 'tranvang@student.hcmus.edu.vn',
    amount: 500000,
    issueDate: '07/01/2025',
    dueDate: '21/01/2025',
    paidDate: '15/01/2025',
    status: 'paid',
    items: [{ description: 'Lab: Linux Administration', quantity: 1, price: 500000 }],
  },
  {
    id: 'INV-2025-008',
    userId: 'USR-008',
    userName: 'Lê Thị H',
    userEmail: 'lethih@student.hcmus.edu.vn',
    amount: 750000,
    issueDate: '08/01/2025',
    dueDate: '22/01/2025',
    paidDate: null,
    status: 'pending',
    items: [{ description: 'Lab: Network Security', quantity: 1, price: 750000 }],
  },
];

const summaryStats = {
  totalRevenue: mockInvoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + inv.amount, 0),
  pendingAmount: mockInvoices
    .filter((inv) => inv.status === 'pending')
    .reduce((sum, inv) => sum + inv.amount, 0),
  overdueAmount: mockInvoices
    .filter((inv) => inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.amount, 0),
  totalInvoices: mockInvoices.length,
  paidInvoices: mockInvoices.filter((inv) => inv.status === 'paid').length,
  pendingInvoices: mockInvoices.filter((inv) => inv.status === 'pending').length,
  overdueInvoices: mockInvoices.filter((inv) => inv.status === 'overdue').length,
};

export default function InvoicesPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  const filteredInvoices = mockInvoices.filter((invoice) => {
    const matchesSearch =
      invoice.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.userEmail.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const selectedInvoiceData = mockInvoices.find((inv) => inv.id === selectedInvoice);

  const getStatusBadge = (status: string) => {
    const styles = {
      paid: 'bg-green-100 text-green-700 border-green-300',
      pending: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      overdue: 'bg-red-100 text-red-700 border-red-300',
      cancelled: 'bg-gray-100 text-gray-700 border-gray-300',
    };

    const icons = {
      paid: <CheckCircle className="h-4 w-4" />,
      pending: <Clock className="h-4 w-4" />,
      overdue: <AlertCircle className="h-4 w-4" />,
      cancelled: <XCircle className="h-4 w-4" />,
    };

    const labels = {
      paid: 'Đã thanh toán',
      pending: 'Chờ thanh toán',
      overdue: 'Quá hạn',
      cancelled: 'Đã hủy',
    };

    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${styles[status as keyof typeof styles]}`}
      >
        {icons[status as keyof typeof icons]}
        {labels[status as keyof typeof labels]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Hóa đơn</h1>
          <p className="mt-1 text-sm text-gray-600">Theo dõi thanh toán và quản lý hóa đơn</p>
        </div>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Tạo hóa đơn mới
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng doanh thu</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {summaryStats.totalRevenue.toLocaleString()} đ
              </p>
            </div>
            <div className="rounded-full bg-green-100 p-3">
              <Wallet className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            {summaryStats.paidInvoices} hóa đơn đã thanh toán
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Chờ thanh toán</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {summaryStats.pendingAmount.toLocaleString()} đ
              </p>
            </div>
            <div className="rounded-full bg-yellow-100 p-3">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-600">
            {summaryStats.pendingInvoices} hóa đơn đang chờ
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Quá hạn</p>
              <p className="mt-2 text-2xl font-bold text-gray-900">
                {summaryStats.overdueAmount.toLocaleString()} đ
              </p>
            </div>
            <div className="rounded-full bg-red-100 p-3">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
          </div>
          <p className="mt-2 text-xs text-red-600">
            {summaryStats.overdueInvoices} hóa đơn cần xử lý
          </p>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tổng hóa đơn</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{summaryStats.totalInvoices}</p>
            </div>
            <div className="rounded-full bg-blue-100 p-3">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-600">Tháng này</p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tất cả ({mockInvoices.length})
          </button>
          <button
            onClick={() => setStatusFilter('paid')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === 'paid'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Đã thanh toán ({summaryStats.paidInvoices})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === 'pending'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Chờ thanh toán ({summaryStats.pendingInvoices})
          </button>
          <button
            onClick={() => setStatusFilter('overdue')}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === 'overdue'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Quá hạn ({summaryStats.overdueInvoices})
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm hóa đơn..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 md:w-80"
          />
        </div>
      </div>

      {/* Invoices Table */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  Mã hóa đơn
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  Học viên
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  Số tiền
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  Ngày phát hành
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  Hạn thanh toán
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  Trạng thái
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-700">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{invoice.id}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{invoice.userName}</div>
                      <div className="text-sm text-gray-600">{invoice.userEmail}</div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 font-semibold text-gray-900">
                    {invoice.amount.toLocaleString()} đ
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-gray-900">{invoice.issueDate}</td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-1.5 text-gray-900">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      {invoice.dueDate}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">{getStatusBadge(invoice.status)}</td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedInvoice(invoice.id)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Xem chi tiết"
                      >
                        <Eye className="h-5 w-5" />
                      </button>
                      <button className="text-gray-600 hover:text-gray-800" title="Tải xuống">
                        <Download className="h-5 w-5" />
                      </button>
                      {invoice.status !== 'paid' && (
                        <button
                          className="text-green-600 hover:text-green-800"
                          title="Gửi nhắc nhở"
                        >
                          <Send className="h-5 w-5" />
                        </button>
                      )}
                      <button className="text-gray-600 hover:text-gray-800">
                        <MoreVertical className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredInvoices.length === 0 && (
          <div className="p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Không tìm thấy hóa đơn</h3>
            <p className="mt-2 text-sm text-gray-600">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm</p>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      {selectedInvoice && selectedInvoiceData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-3xl rounded-lg bg-white shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-200 p-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Chi tiết hóa đơn</h2>
                <p className="mt-1 text-sm text-gray-600">{selectedInvoiceData.id}</p>
              </div>
              <button
                onClick={() => setSelectedInvoice(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="max-h-[70vh] overflow-y-auto p-6">
              {/* Customer Info */}
              <div className="mb-6 rounded-lg border border-gray-200 p-4">
                <h3 className="mb-3 font-semibold text-gray-900">Thông tin khách hàng</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <span className="font-medium">{selectedInvoiceData.userName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">{selectedInvoiceData.userEmail}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">ID: {selectedInvoiceData.userId}</span>
                  </div>
                </div>
              </div>

              {/* Invoice Details */}
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">Ngày phát hành</p>
                  <p className="mt-1 text-gray-900">{selectedInvoiceData.issueDate}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Hạn thanh toán</p>
                  <p className="mt-1 text-gray-900">{selectedInvoiceData.dueDate}</p>
                </div>
                {selectedInvoiceData.paidDate && (
                  <div>
                    <p className="text-sm font-medium text-gray-600">Ngày thanh toán</p>
                    <p className="mt-1 text-gray-900">{selectedInvoiceData.paidDate}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-600">Trạng thái</p>
                  <div className="mt-1">{getStatusBadge(selectedInvoiceData.status)}</div>
                </div>
              </div>

              {/* Items Table */}
              <div className="mb-6">
                <h3 className="mb-3 font-semibold text-gray-900">Chi tiết thanh toán</h3>
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                        Mô tả
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">SL</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">
                        Đơn giá
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">
                        Thành tiền
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {selectedInvoiceData.items.map((item, index) => (
                      <tr key={index}>
                        <td className="px-4 py-3 text-sm text-gray-900">{item.description}</td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900">
                          {item.quantity}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-900">
                          {item.price.toLocaleString()} đ
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                          {(item.quantity * item.price).toLocaleString()} đ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-3 text-right text-sm font-semibold text-gray-900"
                      >
                        Tổng cộng:
                      </td>
                      <td className="px-4 py-3 text-right text-lg font-bold text-gray-900">
                        {selectedInvoiceData.amount.toLocaleString()} đ
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 border-t border-gray-200 p-6">
              <Button variant="outline" onClick={() => setSelectedInvoice(null)}>
                Đóng
              </Button>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Tải xuống PDF
              </Button>
              {selectedInvoiceData.status !== 'paid' && (
                <>
                  <Button variant="outline">
                    <Mail className="mr-2 h-4 w-4" />
                    Gửi email
                  </Button>
                  <Button>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Đánh dấu đã thanh toán
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
