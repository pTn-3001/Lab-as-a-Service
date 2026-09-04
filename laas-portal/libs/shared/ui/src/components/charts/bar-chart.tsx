// https://recharts.github.io/en-US/examples/
'use client';

import {
  Bar,
  CartesianGrid,
  Legend,
  BarChart as RechartsBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useEffect, useState } from 'react';

interface BarChartProps {
  // Mảng dữ liệu
  data: any[];
  // Danh sách các cột cần vẽ
  categories: string[];
  // Màu cho từng cột
  colors?: string[];
  // Key của trục x
  index: string;
}

// Tùy chỉnh tooltip hiển thị khi hover vào cột
const CustomTooltip = ({ active, payload, label }: any) => {
  // Kiểm tra bar có đang được hover không và có dữ liệu không
  if (active && payload && payload.length) {
    return (
      <div className="rounded-lg border border-gray-100 bg-white p-3 text-sm shadow-md">
        <p className="mb-1 font-semibold text-gray-900">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-500">{entry.name}:</span>
            <span className="font-medium text-gray-900">{entry.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};
export function BarChart({
  data,
  categories,
  index,
  colors = ['#3b82f6', '#10b981'],
}: BarChartProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <div className="h-full min-h-[20rem] w-full" />;
  }

  return (
    // Đặt biểu đồ trong một container tự resposive
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <RechartsBarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        {/* Vẽ lưới, chỉ vẽ đường ngang */}
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
        <XAxis
          dataKey={index}
          axisLine={false}
          tickLine={false}
          tick={{ fill: '#6B7280', fontSize: 12 }}
          dy={8}
        />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F9FAFB' }} />
        <Legend
          verticalAlign="top"
          height={36}
          iconType="circle"
          align="right"
          wrapperStyle={{ fontSize: '12px', color: '#374151' }}
        />
        {categories.map((category, idx) => (
          <Bar
            key={category}
            dataKey={category}
            fill={colors[idx % colors.length]}
            radius={[4, 4, 0, 0]}
            barSize={20}
            name={category === 'users' ? 'Users' : category === 'labs' ? 'Labs' : category}
          />
        ))}
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
