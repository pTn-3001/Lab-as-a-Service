'use client';

import {
  Infinity as InfinityIcon,
  CheckCircle2,
  ChevronRight,
  Clock,
  CloudCog,
  Eye,
  EyeOff,
  Globe,
  MonitorPlay,
  MousePointerClick,
  Quote,
  ServerCog,
  ShieldCheck,
  Star,
  Users,
  X,
} from 'lucide-react';

import React, { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  apiForgotPassword,
  apiLogin,
  apiRegister,
  clearAuth,
  getStoredUser,
  getWorkspaceUrl,
  isLoggedIn,
  redirectToFacebook,
  redirectToGoogle,
  saveAuth,
} from '../lib/auth';

function FloatInput({
  id,
  label,
  type = 'text',
  value,
  onChange,
  required,
  minLength,
  disabled,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        disabled={disabled}
        placeholder=" "
        className="peer block w-full rounded-xl border border-slate-300/60 bg-[#f1f5f9] px-4 py-3.5 text-sm text-slate-900 outline-none transition-all focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900]"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3 top-3.5 z-10 origin-[0] -translate-y-6 scale-75 transform bg-[#f1f5f9] px-2 text-sm text-slate-400 duration-300 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-3.5 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-[#FF6900]"
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
  required,
  minLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        placeholder=" "
        className="peer block w-full rounded-xl border border-slate-300/60 bg-[#f1f5f9] px-4 py-3.5 pr-12 text-sm text-slate-900 outline-none transition-all focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900]"
      />
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-3 top-3.5 z-10 origin-[0] -translate-y-6 scale-75 transform bg-[#f1f5f9] px-2 text-sm text-slate-400 duration-300 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-3.5 peer-focus:-translate-y-6 peer-focus:scale-75 peer-focus:text-[#FF6900]"
      >
        {label}
      </label>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}

// ─── Static data ───────────────────────────────────────────────────────────────

const partnerNames = ['Cisco', 'Elastic', 'AWS', 'Microsoft', 'iSQI', 'Red Hat', 'K-Campus'];

const highlightLabs = [
  {
    title: 'An toàn thông tin',
    subtitle: 'Security',
    description: 'Thực hành scanning, exploitation và hardening với Kali Linux.',
    tone: 'from-amber-400 via-orange-500 to-rose-500',
    icon: ShieldCheck,
  },
  {
    title: 'Quản trị hệ thống',
    subtitle: 'System',
    description: 'Cấu hình firewall, quản lý user, cron job và systemd trên Linux/Windows.',
    tone: 'from-cyan-400 via-teal-500 to-emerald-600',
    icon: ServerCog,
  },
  {
    title: 'DevOps',
    subtitle: 'Deploy',
    description: 'Docker compose, CI/CD pipeline và monitoring cho app cloud-native.',
    tone: 'from-fuchsia-500 via-purple-600 to-indigo-700',
    icon: InfinityIcon,
  },
  {
    title: 'Điện toán đám mây',
    subtitle: 'Cloud',
    description: 'Thực hành Kubernetes, OpenStack và networking chuyên sâu trên cloud.',
    tone: 'from-blue-400 via-indigo-500 to-violet-600',
    icon: CloudCog,
  },
];

const whyChooseCards = [
  {
    title: 'Xây dựng môi trường chỉ với một cú nhấp chuột',
    description:
      'Hệ thống tự động hóa hoàn toàn giúp bạn tạo môi trường thực hành và lựa chọn cấu hình mong muốn chỉ trong vài giây, tiết kiệm hàng giờ cài đặt.',
    icon: MousePointerClick,
    tone: 'bg-orange-50 text-[#FF6900]',
    border: 'border-orange-100',
    gradient: 'from-[#FF6900]/20 to-orange-500/5',
  },
  {
    title: 'Đa dạng cấu hình và thư viện bài lab',
    description:
      'Hàng trăm mẫu bài thực hành bao gồm VM, cloud service và bộ công cụ được cấu hình chuẩn xác từ chuyên gia, sẵn sàng để bạn sử dụng ngay.',
    icon: MonitorPlay,
    tone: 'bg-blue-50 text-blue-600',
    border: 'border-blue-100',
    gradient: 'from-blue-500/20 to-indigo-500/5',
  },
  {
    title: 'Truy cập mọi lúc, mọi nơi qua trình duyệt',
    description:
      'Không cần máy tính cấu hình cao hay cài đặt phần mềm phức tạp. Đăng nhập và trải nghiệm toàn bộ lab trơn tru ngay trên trình duyệt web của bạn.',
    icon: Globe,
    tone: 'bg-indigo-50 text-indigo-600',
    border: 'border-indigo-100',
    gradient: 'from-indigo-500/20 to-purple-500/5',
  },
];

const testimonialCards = [
  {
    name: 'Nguyễn Hoàng L.',
    role: 'DevOps Engineer',
    quote:
      'Môi trường lab ở đây cực kỳ sát với thực tế doanh nghiệp. Đây là công cụ tuyệt vời để tôi rèn luyện kỹ năng xử lý sự cố mỗi ngày.',
    avatarInitials: 'HL',
    avatarTone: 'bg-blue-100 text-blue-700',
  },
  {
    name: 'Trần Thị T.',
    role: 'Security Analyst',
    quote:
      'Nội dung thực hành được thiết kế có cấu trúc rất chặt chẽ. Việc thao tác mượt mà ngay trên trình duyệt giúp tôi tiết kiệm nhiều thời gian.',
    avatarInitials: 'TT',
    avatarTone: 'bg-emerald-100 text-emerald-700',
  },
  {
    name: 'Lê Văn C.',
    role: 'Sinh viên CNTT',
    quote:
      'Hệ thống rất trực quan và dễ sử dụng. Lần đầu tiên tôi có thể thực hành các bài lab phức tạp mà không lo hỏng máy tính cá nhân.',
    avatarInitials: 'LC',
    avatarTone: 'bg-orange-100 text-orange-700',
  },
];

const stats = [
  {
    value: '500+',
    label: 'Học viên tin tưởng',
    icon: Users,
    color: 'text-[#FF6900]',
    ring: 'ring-orange-100',
  },
  {
    value: '100+',
    label: 'Labs thực hành',
    icon: CheckCircle2,
    color: 'text-blue-600',
    ring: 'ring-blue-100',
  },
  {
    value: '100k+',
    label: 'Giờ học tích lũy',
    icon: Clock,
    color: 'text-indigo-600',
    ring: 'ring-indigo-100',
  },
  {
    value: '4.9',
    label: 'Đánh giá trung bình',
    icon: Star,
    color: 'text-amber-500',
    ring: 'ring-amber-100',
  },
];

// ─── Modal view types ──────────────────────────────────────────────────────────

type ModalView = 'login' | 'register' | 'forgot';

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function GuestHomePage(): React.JSX.Element {
  const router = useRouter();

  // Auth state
  const [loggedIn, setLoggedIn] = useState(false);
  const [workspaceUrl, setWorkspaceUrl] = useState('/student');

  // Modal
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<ModalView>('login');

  // Login form
  const [loginIdentity, setLoginIdentity] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  // Register form
  const [regFullName, setRegFullName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regPhone] = useState('');

  // Forgot password form
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // Shared
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // ── On mount: check auth ────────────────────────────────────────────────────

  useEffect(() => {
    if (isLoggedIn()) {
      const user = getStoredUser();
      if (user) {
        setLoggedIn(true);
        setWorkspaceUrl(getWorkspaceUrl(user.systemRole));
        if (rememberMe) {
          localStorage.setItem('laas:last-login-email', user.email);
        }
      }
    } else {
      const saved = localStorage.getItem('laas:last-login-email');
      if (saved) setLoginIdentity(saved);
    }
  }, []);

  // ── Modal helpers ───────────────────────────────────────────────────────────

  const openModal = (v: ModalView = 'login') => {
    setView(v);
    setFormError('');
    setFormSuccess('');
    setIsOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setIsOpen(false);
    document.body.style.overflow = '';
  };

  const switchView = (v: ModalView) => {
    setView(v);
    setFormError('');
    setFormSuccess('');
  };

  // ── Keyboard close ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, isSubmitting]);

  // ── Login submit ────────────────────────────────────────────────────────────

  const handleLogin = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFormError('');
    try {
      const result = await apiLogin(loginIdentity, loginPassword);
      saveAuth(result);
      if (rememberMe) localStorage.setItem('laas:last-login-email', result.user.email);
      else localStorage.removeItem('laas:last-login-email');
      // Stay on landing page — update state so UI shows "Chuyển đến Workspace"
      setLoggedIn(true);
      setWorkspaceUrl(getWorkspaceUrl(result.user.systemRole));
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Đăng nhập thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Register submit ─────────────────────────────────────────────────────────

  const handleRegister = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (regPassword !== regConfirm) {
      setFormError('Mật khẩu xác nhận không khớp');
      return;
    }
    setIsSubmitting(true);
    setFormError('');
    try {
      const result = await apiRegister({
        fullName: regFullName,
        email: regEmail,
        username: regUsername,
        password: regPassword,
        phone: regPhone || undefined,
      });
      saveAuth(result);
      // Stay on landing page — update state so UI shows "Chuyển đến Workspace"
      setLoggedIn(true);
      setWorkspaceUrl(getWorkspaceUrl(result.user.systemRole));
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Đăng ký thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Forgot password submit ──────────────────────────────────────────────────

  const handleForgot = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFormError('');
    try {
      await apiForgotPassword(forgotEmail);
      setForgotSent(true);
      setFormSuccess('Hướng dẫn đặt lại mật khẩu đã được gửi (nếu email tồn tại).');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Không thể gửi yêu cầu');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Logout ──────────────────────────────────────────────────────────────────

  const handleLogout = () => {
    clearAuth();
    setLoggedIn(false);
    setWorkspaceUrl('/student');
  };

  // ── Scroll handling for Header ──────────────────────────────────────────────
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-orange-200">
      {/* Header */}
      <header
        className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${scrolled ? 'border-b border-slate-200/50 bg-white/80 py-3 shadow-sm backdrop-blur-md' : 'bg-transparent py-5'}`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <img src="/logo.png" alt="Robusta" className="h-12 w-auto" />
            <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 lg:flex">
              {['Giới thiệu', 'Khóa học', 'Dịch vụ', 'Tin tức', 'Liên hệ'].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase()}`}
                  className="transition-colors hover:text-[#FF6900]"
                >
                  {item}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {loggedIn ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push(workspaceUrl)}
                  className="flex items-center gap-2 rounded-full bg-[#FF6900] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:scale-105 hover:bg-[#E55E00] hover:shadow-md"
                >
                  Chuyển đến Workspace <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-sm font-medium text-slate-500 transition-colors hover:text-red-500"
                >
                  Đăng xuất
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openModal('login')}
                  className="hidden rounded-full px-5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:text-[#FF6900] sm:block"
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => openModal('register')}
                  className="rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 hover:shadow-md"
                >
                  Đăng ký miễn phí
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-50 pb-20 pt-32 lg:pb-28 lg:pt-40">
        {/* Soft background glow */}
        <div className="absolute inset-0 z-0">
          <div className="absolute right-0 top-0 h-[600px] w-[800px] -translate-y-12 translate-x-1/3 rounded-full bg-gradient-to-br from-emerald-100/50 to-cyan-100/30 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-[600px] w-[600px] -translate-x-1/3 translate-y-1/3 rounded-full bg-gradient-to-tr from-teal-100/40 to-blue-100/20 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 px-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 shadow-sm">
              <span className="flex h-2 w-2 animate-pulse rounded-full bg-[#FF6900]"></span>
              LaaS Portal v2.0
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 sm:text-6xl">
              Thực hành để{' '}
              <span className="bg-gradient-to-r from-[#FF6900] to-orange-500 bg-clip-text text-transparent">
                hiểu
              </span>{' '}
              <br />
              Trải nghiệm để{' '}
              <span className="bg-gradient-to-r from-[#FF6900] to-orange-500 bg-clip-text text-transparent">
                thành công.
              </span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-600">
              Khởi đầu hành trình làm chủ công nghệ với các nền tảng thực hành sát thực tế từ Cloud,
              DevOps đến Security và System.
            </p>
            <div className="mt-10 flex items-center gap-x-4">
              {loggedIn ? (
                <button
                  type="button"
                  onClick={() => router.push(workspaceUrl)}
                  className="flex items-center gap-2 rounded-full bg-[#FF6900] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#FF6900]/20 transition-all hover:scale-105 hover:bg-[#E55E00]"
                >
                  Chuyển đến Workspace <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openModal('login')}
                  className="flex items-center gap-2 rounded-full bg-[#FF6900] px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#FF6900]/20 transition-all hover:-translate-y-0.5 hover:bg-[#E55E00]"
                >
                  Bắt đầu ngay <ChevronRight className="h-4 w-4" />
                </button>
              )}
              <a
                href="#courses"
                className="text-sm font-semibold leading-6 text-slate-900 transition-colors hover:text-[#FF6900]"
              >
                Xem thư viện Lab <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
            {/* Glassmorphism preview pane */}
            <div className="relative rounded-2xl border border-white/60 bg-white/40 p-2 shadow-2xl shadow-slate-200/50 backdrop-blur-xl">
              <div className="overflow-hidden rounded-xl bg-slate-900 shadow-inner">
                <div className="flex items-center gap-2 border-b border-white/10 bg-slate-800/50 px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-rose-500/80" />
                    <div className="h-3 w-3 rounded-full bg-amber-500/80" />
                    <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
                  </div>
                  <div className="mx-auto text-xs font-medium text-slate-400">
                    root@kali-linux:~
                  </div>
                </div>
                <div className="min-h-[280px] p-5 font-mono text-sm text-emerald-400">
                  <p className="text-slate-300">$ nmap -sV 192.168.1.100</p>
                  <p className="mt-2 text-slate-400">Starting Nmap 7.93 ( https://nmap.org )</p>
                  <p className="text-slate-400">Nmap scan report for 192.168.1.100</p>
                  <p className="mt-2">PORT STATE SERVICE VERSION</p>
                  <p>22/tcp open ssh OpenSSH 8.2p1</p>
                  <p>80/tcp open http Apache httpd 2.4.41</p>
                  <p>3306/tcp open mysql MySQL 8.0.28</p>
                  <p className="mt-4 animate-pulse text-slate-300">$ _</p>
                </div>
              </div>
            </div>

            {/* Floating Tags */}
            <div className="absolute -left-6 top-16 animate-[bounce_4s_infinite] rounded-xl border border-white/50 bg-white/90 px-4 py-2 text-sm font-bold text-orange-600 shadow-xl backdrop-blur-md">
              AWS
            </div>
            <div className="absolute -right-8 top-32 animate-[bounce_5s_infinite_0.5s] rounded-xl border border-white/50 bg-white/90 px-4 py-2 text-sm font-bold text-blue-600 shadow-xl backdrop-blur-md">
              Kubernetes
            </div>
            <div className="absolute -left-4 bottom-12 animate-[bounce_4.5s_infinite_1s] rounded-xl border border-white/50 bg-white/90 px-4 py-2 text-sm font-bold text-slate-800 shadow-xl backdrop-blur-md">
              Linux
            </div>
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="border-y border-slate-100 bg-white py-12">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <p className="mb-8 text-center text-sm font-semibold uppercase tracking-wider text-slate-500">
            Được tin dùng bởi các đối tác hàng đầu
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6 sm:gap-x-12 md:gap-x-16">
            {partnerNames.map((p) => (
              <span
                key={p}
                className="select-none text-xl font-black text-slate-300 transition-colors hover:text-slate-400 md:text-2xl"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Lab highlights */}
      <section id="courses" className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              Khám phá thư viện Labs
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Trải nghiệm môi trường thực tế ảo phong phú, sẵn sàng kích hoạt chỉ trong vài giây.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {highlightLabs.map((item) => (
              <div
                key={item.title}
                className="group relative cursor-pointer overflow-hidden rounded-3xl bg-white p-1 ring-1 ring-slate-200 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:ring-slate-300"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-10 ${item.tone} transition-opacity duration-300`}
                />
                <div
                  className={`relative h-full rounded-[1.4rem] bg-gradient-to-b from-white to-slate-50/50 p-6`}
                >
                  <div
                    className={`inline-flex rounded-xl bg-gradient-to-br p-3 ${item.tone} mb-5 shadow-sm`}
                  >
                    <item.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-slate-900 transition-colors group-hover:text-[#FF6900]">
                    {item.title}
                  </h3>
                  <p className="mb-6 text-sm text-slate-600">{item.description}</p>

                  <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-slate-500">
                      {item.subtitle}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-[#FF6900]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why choose us */}
      <section id="about" className="relative overflow-hidden bg-white py-24">
        <div className="absolute right-0 top-0 z-0 h-[800px] w-[800px] -translate-y-1/2 rounded-full bg-slate-50 blur-3xl" />
        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
                Vì sao chọn Robusta LaaS?
              </h2>
              <p className="mb-10 mt-4 text-lg text-slate-600">
                Nền tảng của chúng tôi được thiết kế tối ưu để mang lại trải nghiệm học tập và thực
                hành công nghệ liền mạch nhất.
              </p>

              <div className="space-y-6">
                {whyChooseCards.map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div
                      className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl ${item.tone} border ${item.border}`}
                    >
                      <item.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{item.title}</h3>
                      <p className="mt-2 text-slate-600">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="relative mx-auto aspect-square max-w-md overflow-hidden rounded-3xl bg-slate-900 p-2 shadow-2xl shadow-slate-300 ring-1 ring-slate-200 lg:max-w-none">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-transparent to-blue-500/20" />
                <div className="relative flex h-full items-center justify-center rounded-2xl border border-white/10 bg-slate-800/80 p-8">
                  <div className="w-full space-y-4">
                    <div className="h-4 w-1/3 rounded bg-slate-700/50" />
                    <div className="flex h-24 w-full flex-col justify-center rounded-lg border border-slate-600/50 bg-slate-700/30 px-4">
                      <div className="mb-2 h-3 w-1/4 rounded bg-emerald-500/50" />
                      <div className="h-2 w-1/2 rounded bg-slate-600/50" />
                    </div>
                    <div className="flex h-24 w-full flex-col justify-center rounded-lg border border-slate-600/50 bg-slate-700/30 px-4">
                      <div className="mb-2 h-3 w-1/3 rounded bg-blue-500/50" />
                      <div className="h-2 w-2/3 rounded bg-slate-600/50" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-6 flex items-center gap-4 rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-100">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-[#FF6900]">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase text-slate-500">Trạng thái</p>
                  <p className="text-lg font-bold text-slate-900">Sẵn sàng</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative overflow-hidden bg-slate-900 py-16">
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
        <div className="relative z-10 mx-auto max-w-7xl px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label} className="text-center">
                <div
                  className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-800 ring-4 ring-slate-800 ${item.color}`}
                >
                  <item.icon className="h-8 w-8" />
                </div>
                <p className="mt-6 text-3xl font-extrabold text-white sm:text-4xl">{item.value}</p>
                <p className="mt-2 text-sm font-medium text-slate-400">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="news" className="bg-orange-50/40 py-24">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">
              Cộng đồng tin tưởng
            </h2>
            <p className="mt-4 text-lg text-slate-600">
              Hàng ngàn học viên và kỹ sư đã cải thiện kỹ năng thông qua nền tảng của chúng tôi.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {testimonialCards.map((item, idx) => (
              <div
                key={idx}
                className="relative rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200"
              >
                <Quote className="absolute right-6 top-6 h-10 w-10 text-orange-100" />
                <div className="mb-6 flex gap-1 text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="relative z-10 mb-8 text-lg leading-relaxed text-slate-700">
                  "{item.quote}"
                </p>

                <div className="mt-auto flex items-center gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full font-bold ${item.avatarTone}`}
                  >
                    {item.avatarInitials}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{item.name}</h4>
                    <p className="text-sm text-slate-500">{item.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="relative overflow-hidden border-t border-slate-800 bg-slate-950 py-20">
        <div className="absolute inset-0 bg-[#FF6900]/5 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]" />
        <div className="relative z-10 mx-auto max-w-4xl px-6 text-center lg:px-8">
          <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            Sẵn sàng nâng tầm kỹ năng?
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Tham gia ngay hôm nay để truy cập kho thư viện lab khổng lồ và bắt đầu thực hành trên
            môi trường chuẩn doanh nghiệp.
          </p>
          <div className="mt-10 flex justify-center gap-4">
            {loggedIn ? (
              <button
                type="button"
                onClick={() => router.push(workspaceUrl)}
                className="rounded-full bg-[#FF6900] px-8 py-4 text-sm font-bold text-white shadow-lg shadow-[#FF6900]/25 transition-all hover:scale-105 hover:bg-[#E55E00] active:scale-[0.98]"
              >
                Đến Workspace của bạn
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openModal('register')}
                className="rounded-full bg-[#FF6900] px-8 py-4 text-sm font-bold text-white shadow-lg shadow-[#FF6900]/25 transition-all hover:scale-105 hover:bg-[#E55E00] active:scale-[0.98]"
              >
                Tạo tài khoản miễn phí
              </button>
            )}
          </div>
        </div>
      </section>

      <footer id="contact" className="border-t border-slate-800 bg-slate-900 py-12">
        <div className="mx-auto max-w-7xl px-6 text-center lg:px-8">
          <img
            src="/logo.png"
            alt="Robusta"
            className="mx-auto mb-6 h-8 w-auto opacity-50 brightness-0 invert"
          />
          <p className="text-sm text-slate-500">© 2026 Robusta LaaS. All rights reserved.</p>
        </div>
      </footer>

      {/* ── Auth Modal ── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-8">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
          <button
            type="button"
            aria-label="Đóng"
            onClick={closeModal}
            className="absolute inset-0 h-full w-full cursor-default"
          />

          <div className="relative z-10 w-full max-w-[480px] rounded-[2rem] border border-slate-200/60 bg-[#f1f5f9] p-8 shadow-2xl">
            <button
              type="button"
              onClick={closeModal}
              className="absolute right-6 top-6 rounded-full bg-slate-200/40 p-2 text-slate-400 transition-colors hover:bg-slate-200/80 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="mb-8 text-center">
              <img src="/logo.png" alt="Robusta" className="mx-auto mb-6 h-16 w-auto" />
              <h2 className="text-2xl font-bold text-slate-900">
                {view === 'login'
                  ? 'Chào mừng trở lại'
                  : view === 'register'
                    ? 'Tạo tài khoản'
                    : 'Khôi phục mật khẩu'}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {view === 'login'
                  ? 'Đăng nhập để tiếp tục thực hành'
                  : view === 'register'
                    ? 'Đăng ký miễn phí trong vài giây'
                    : 'Nhập email để nhận hướng dẫn'}
              </p>
            </div>

            {/* ─ Login ─ */}
            {view === 'login' && (
              <form className="space-y-4" onSubmit={handleLogin}>
                <FloatInput
                  id="loginIdentity"
                  label="Email hoặc tên đăng nhập"
                  value={loginIdentity}
                  onChange={(e) => setLoginIdentity(e.target.value)}
                  required
                />
                <PasswordInput
                  id="loginPassword"
                  label="Mật khẩu"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
                <div className="flex items-center justify-between py-2 text-sm">
                  <label className="flex cursor-pointer select-none items-center gap-2 text-slate-500 hover:text-slate-700">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="sr-only"
                    />
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded-[4px] border transition-all ${
                        rememberMe ? 'border-[#FF6900] bg-[#FF6900]' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {rememberMe && (
                        <svg
                          className="h-2.5 w-2.5 text-white"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                      )}
                    </div>
                    <span>Ghi nhớ</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => switchView('forgot')}
                    className="font-medium text-[#FF6900] hover:text-[#E55E00]"
                  >
                    Quên mật khẩu?
                  </button>
                </div>
                {formError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || !loginIdentity || !loginPassword}
                  className="mt-6 block w-full rounded-xl bg-[#FF6900] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#FF6900]/20 transition-all hover:bg-[#E55E00] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang xác thực...' : 'Đăng nhập'}
                </button>
                <OAuthButtons />
                <p className="mt-8 text-center text-sm text-slate-500">
                  Chưa có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => switchView('register')}
                    className="font-bold text-[#FF6900] hover:text-[#E55E00]"
                  >
                    Đăng ký ngay
                  </button>
                </p>
              </form>
            )}

            {/* ─ Register ─ */}
            {view === 'register' && (
              <form className="space-y-3" onSubmit={handleRegister}>
                <div className="grid grid-cols-2 gap-3">
                  <FloatInput
                    id="regFullName"
                    label="Họ và tên"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                    required
                  />
                  <FloatInput
                    id="regUsername"
                    label="Tên đăng nhập"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    required
                    minLength={3}
                  />
                </div>
                <FloatInput
                  id="regEmail"
                  type="email"
                  label="Email"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                />
                <PasswordInput
                  id="regPassword"
                  label="Mật khẩu (tối thiểu 8 ký tự)"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <PasswordInput
                  id="regConfirm"
                  label="Xác nhận mật khẩu"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  required
                />

                {formError && (
                  <div className="mt-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-6 block w-full rounded-xl bg-[#FF6900] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#FF6900]/20 transition-all hover:bg-[#E55E00] active:scale-[0.98] disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang tạo tài khoản...' : 'Tạo tài khoản'}
                </button>
                <OAuthButtons label="Đăng ký" />
                <p className="mt-6 text-center text-sm text-slate-500">
                  Đã có tài khoản?{' '}
                  <button
                    type="button"
                    onClick={() => switchView('login')}
                    className="font-bold text-[#FF6900] hover:text-[#E55E00]"
                  >
                    Đăng nhập
                  </button>
                </p>
              </form>
            )}

            {/* ─ Forgot password ─ */}
            {view === 'forgot' && (
              <form className="space-y-4" onSubmit={handleForgot}>
                <FloatInput
                  id="forgotEmail"
                  type="email"
                  label="Nhập địa chỉ email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  disabled={forgotSent}
                />

                {formError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600">
                    {formError}
                  </div>
                )}
                {formSuccess && (
                  <div className="rounded-xl border border-[#FF6900]/20 bg-[#FF6900]/10 px-4 py-3 text-sm text-[#FF6900]">
                    {formSuccess}
                  </div>
                )}

                {!forgotSent && (
                  <button
                    type="submit"
                    disabled={isSubmitting || !forgotEmail}
                    className="mt-6 block w-full rounded-xl bg-[#FF6900] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#FF6900]/20 transition-all hover:bg-[#E55E00] active:scale-[0.98] disabled:opacity-50"
                  >
                    {isSubmitting ? 'Đang xử lý...' : 'Gửi yêu cầu'}
                  </button>
                )}
                <p className="mt-6 text-center text-sm text-slate-500">
                  <button
                    type="button"
                    onClick={() => switchView('login')}
                    className="font-bold text-[#FF6900] hover:text-[#E55E00]"
                  >
                    Quay lại đăng nhập
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// ─── OAuth buttons (shared between login & register) ──────────────────────────

function OAuthButtons({ label = 'Đăng nhập' }: { label?: string }) {
  return (
    <div className="mt-6">
      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-[#f1f5f9] px-4 font-medium text-slate-400">Hoặc tiếp tục với</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={redirectToGoogle}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300/60 bg-[#f1f5f9] px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-200/50 hover:shadow-sm active:scale-[0.98]"
        >
          <img src="/assets/icons/social/google.svg" alt="Google" className="h-4 w-4" />
          Google
        </button>
        <button
          type="button"
          onClick={redirectToFacebook}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300/60 bg-[#f1f5f9] px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-200/50 hover:shadow-sm active:scale-[0.98]"
        >
          <img src="/assets/icons/social/facebook.svg" alt="Facebook" className="h-4 w-4" />
          Facebook
        </button>
      </div>
    </div>
  );
}
