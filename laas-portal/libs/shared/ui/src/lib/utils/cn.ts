// clsx hỗ trợ kết hợp các classname (có điều kiện), ClassValue là kiểu dữ liệu cho phép truyền vào các giá trị khác nhau như string, number, array, object
import { type ClassValue, clsx } from 'clsx';
// twMerge giúp hợp nhất các lớp Tailwind CSS, loại bỏ các lớp trùng lặp và ưu tiên các lớp cuối cùng
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
