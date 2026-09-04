'use client';

import React from 'react';
import { StudentLayout } from '@laas-portal/ui';
import { Award, Download, Share2, Calendar } from 'lucide-react';

interface Certificate {
  id: string;
  title: string;
  labName: string;
  issueDate: string;
  score: number;
}

const mockCertificates: Certificate[] = [
  {
    id: '1',
    title: 'Docker Container Fundamentals',
    labName: 'DevOps',
    issueDate: '15/01/2026',
    score: 95,
  },
  {
    id: '2',
    title: 'Kubernetes Basics',
    labName: 'DevOps',
    issueDate: '10/01/2026',
    score: 88,
  },
];

export default function CertificatesPage() {
  return (
    <StudentLayout>
      <div className="p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Chứng chỉ</h1>
          <p className="text-gray-600">Quản lý các chứng chỉ bạn đã đạt được</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockCertificates.map((cert) => (
            <div
              key={cert.id}
              className="bg-white rounded-lg border-2 border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mb-4">
                <Award className="w-8 h-8 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">{cert.title}</h3>
              <p className="text-sm text-gray-600 mb-4">{cert.labName}</p>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <Calendar className="w-4 h-4" />
                <span>{cert.issueDate}</span>
              </div>
              <div className="mb-4">
                <div className="text-sm text-gray-600 mb-1">Điểm số</div>
                <div className="text-2xl font-bold text-green-600">{cert.score}/100</div>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 px-4 py-2 bg-[#FF6900] hover:bg-[#E55E00] text-white rounded-lg text-sm font-medium transition-all shadow-sm hover:shadow-md active:scale-[0.98] flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" />
                  Tải xuống
                </button>
                <button className="px-4 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors">
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {mockCertificates.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Award className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Chưa có chứng chỉ</h3>
            <p className="text-gray-600">Hoàn thành các lab để nhận chứng chỉ</p>
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
