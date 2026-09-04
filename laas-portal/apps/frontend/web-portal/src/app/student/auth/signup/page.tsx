'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@laas-portal/ui';

/* ---- Shared floating-label primitives ---- */

function FloatInput({
  id,
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder=" "
        autoComplete={autoComplete}
        required={required}
        className="peer block w-full rounded-lg border border-gray-300 bg-transparent px-3 pb-2 pt-4 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-2 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-2 text-sm text-gray-500 duration-300 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-emerald-600"
      >
        {label}
      </label>
    </div>
  );
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder=" "
        autoComplete={autoComplete}
        required={required}
        className="peer block w-full rounded-lg border border-gray-300 bg-transparent px-3 pb-2 pt-4 pr-10 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-2 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-2 text-sm text-gray-500 duration-300 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-emerald-600"
      >
        {label}
      </label>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* ---- Page ---- */

export default function SignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1000);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">Đăng ký tài khoản</h2>
        <p className="mt-2 text-sm text-gray-600 sm:text-base">
          Tạo tài khoản để bắt đầu trải nghiệm Lab as a Service
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <FloatInput
          id="fullName"
          label="Họ và tên"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          required
        />
        <FloatInput
          id="signup-email"
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <PasswordInput
          id="signup-password"
          label="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <PasswordInput
          id="confirmPassword"
          label="Xác nhận mật khẩu"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-start gap-2 text-sm text-gray-600">
          <input
            id="terms"
            type="checkbox"
            className="mt-1 h-4 w-4 cursor-pointer rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            required
          />
          <label htmlFor="terms" className="leading-snug">
            Tôi đồng ý với các{' '}
            <Link href="/terms" target="_blank" className="text-primary underline-offset-2 hover:text-primary/90 hover:underline">
              điều khoản sử dụng
            </Link>{' '}
            và{' '}
            <Link href="/privacy-policy" target="_blank" className="text-primary underline-offset-2 hover:text-primary/90 hover:underline">
              chính sách bảo mật
            </Link>
            .
          </label>
        </div>

        <Button type="submit" variant="default" size="lg" className="w-full" disabled={isLoading}>
          {isLoading ? 'Đang tạo tài khoản...' : 'Đăng ký'}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-white px-2 text-gray-500">Hoặc đăng ký bằng</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          size="default"
          className="w-full border-gray-300 hover:border-gray-400 hover:bg-gray-50 active:scale-95"
          leftIcon={<img src="/assets/icons/social/google.svg" alt="" className="h-5 w-5" />}
        >
          Google
        </Button>
        <Button
          type="button"
          variant="outline"
          size="default"
          className="w-full border-gray-300 hover:border-gray-400 hover:bg-gray-50 active:scale-95"
          leftIcon={<img src="/assets/icons/social/facebook.svg" alt="" className="h-5 w-5" />}
        >
          Facebook
        </Button>
      </div>

      <div className="text-center text-sm">
        <span className="text-gray-600">Đã có tài khoản? </span>
        <Link href="/auth/login" className="font-medium text-primary underline-offset-2 hover:text-primary/90 hover:underline">
          Đăng nhập
        </Link>
      </div>
    </div>
  );
}
