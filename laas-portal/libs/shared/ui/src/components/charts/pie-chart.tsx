'use client';

import {
  Cell,
  Legend,
  Pie,
  PieChart as RechartsPieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import { useEffect, useState } from 'react';

interface PieChartProps {
  // Mảng dữ liệu
  data: any[];
  // Key của trục x
  index: string;
  // Danh sách các mục cần vẽ
  category: string;
  // Màu cho từng mục
  colors?: string[];
}

// Tùy chỉnh tooltip hiển thị khi hover vào phần của biểu đồ
const CustomTooltip = ({ active, payload }: any) => {
  // Kiểm tra pie slice có đang được hover không và có dữ liệu không
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-lg border border-gray-100 bg-white p-3 text-sm shadow-md">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: data.color }} />
          <span className="font-medium text-gray-900">{data.name}</span>
          <span className="text-gray-500">{data.value}%</span>
        </div>
      </div>
    );
  }
  return null;
};

export function PieChart({ data, index, category, colors = [] }: PieChartProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const getFill = (entry: any, idx: number) => {
    if (colors.length > 0) return colors[idx % colors.length];
    if (entry.color) return entry.color;
    return '#3b82f6';
  };

  if (!isMounted) {
    return <div className="h-full min-h-[20rem] w-full" />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <RechartsPieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey={category}
          nameKey={index}
          strokeWidth={0}
        >
          {data.map((entry, idx) => (
            <Cell key={`cell-${idx}`} fill={getFill(entry, idx)} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          iconType="circle"
          wrapperStyle={{ fontSize: '12px' }}
          formatter={(value, entry: any) => (
            <span className="ml-1 font-medium text-gray-600">{value}</span>
          )}
        />
      </RechartsPieChart>
    </ResponsiveContainer>
  );
}
