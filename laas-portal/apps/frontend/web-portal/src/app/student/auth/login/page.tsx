'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@laas-portal/ui';

function FloatInput({
  id, label, type = 'text', value, onChange, autoComplete, required,
}: {
  id: string; label: string; type?: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string; required?: boolean;
}) {
  return (
    <div className="relative">
      <input
        id={id} type={type} value={value} onChange={onChange}
        placeholder=" " autoComplete={autoComplete} required={required}
        className="peer block w-full rounded-lg border border-gray-300 bg-transparent px-3 pb-2 pt-4 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
      />
      <label htmlFor={id} className="pointer-events-none absolute left-2 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-2 text-sm text-gray-500 duration-300 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-emerald-600">
        {label}
      </label>
    </div>
  );
}

function PasswordInput({
  id, label, value, onChange, autoComplete,
}: {
  id: string; label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange}
        placeholder=" " autoComplete={autoComplete}
        className="peer block w-full rounded-lg border border-gray-300 bg-transparent px-3 pb-2 pt-4 pr-10 text-sm text-gray-900 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
      />
      <label htmlFor={id} className="pointer-events-none absolute left-2 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-2 text-sm text-gray-500 duration-300 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-emerald-600">
        {label}
      </label>
      <button type="button" tabIndex={-1} onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function StudentLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Đăng nhập</h2>
        <p className="mt-1 text-sm text-gray-500">Truy cập môi trường thực hành</p>
      </div>

      <form className="space-y-4">
        <FloatInput id="stu-email" label="Email" type="email" value={email}
          onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        <PasswordInput id="stu-password" label="Mật khẩu" value={password}
          onChange={e => setPassword(e.target.value)} autoComplete="current-password" />

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="sr-only"
            />
            <div className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-all ${
              rememberMe 
                ? 'bg-emerald-600 border-emerald-600' 
                : 'border-gray-300 bg-white'
            }`}>
              {rememberMe && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              )}
            </div>
            <span className="text-gray-700">Ghi nhớ đăng nhập</span>
          </label>
          <a href="#" className="font-medium text-emerald-600 hover:text-emerald-500">Quên mật khẩu?</a>
        </div>

        <Button type="button" className="w-full justify-center">Đăng nhập</Button>

        <p className="text-center text-sm text-gray-600">
          Chưa có tài khoản?{' '}
          <Link href="/student/auth/signup" className="font-medium text-emerald-600 hover:underline">
            Đăng ký
          </Link>
        </p>
      </form>
    </div>
  );
}
