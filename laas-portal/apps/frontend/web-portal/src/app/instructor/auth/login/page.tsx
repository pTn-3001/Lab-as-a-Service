'use client';
import React, { useState } from 'react';
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
        className="peer block w-full rounded-lg border border-gray-300 bg-transparent px-3 pb-2 pt-4 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      <label htmlFor={id} className="pointer-events-none absolute left-2 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-2 text-sm text-gray-500 duration-300 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-blue-600">
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
        className="peer block w-full rounded-lg border border-gray-300 bg-transparent px-3 pb-2 pt-4 pr-10 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      />
      <label htmlFor={id} className="pointer-events-none absolute left-2 top-2 z-10 origin-[0] -translate-y-4 scale-75 transform bg-white px-2 text-sm text-gray-500 duration-300 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-2 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:text-blue-600">
        {label}
      </label>
      <button type="button" tabIndex={-1} onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function InstructorLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Đăng nhập</h2>
        <p className="mt-1 text-sm text-gray-500">Truy cập portal giảng viên</p>
      </div>

      <form className="space-y-4">
        <FloatInput id="ins-email" label="Email" type="email" value={email}
          onChange={e => setEmail(e.target.value)} autoComplete="email" required />
        <PasswordInput id="ins-password" label="Mật khẩu" value={password}
          onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        <div className="pt-1">
          <Button type="button" className="w-full justify-center">Đăng nhập</Button>
        </div>
      </form>
    </div>
  );
}
