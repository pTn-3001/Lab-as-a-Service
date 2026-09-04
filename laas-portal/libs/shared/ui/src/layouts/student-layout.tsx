'use client';

import { BookOpen, Eye, FlaskConical, LogOut, Menu, Settings, X } from 'lucide-react';

import React, { useState, useEffect } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '../components/button/button';

export interface StudentLayoutProps {
  children: React.ReactNode;
  basePath?: string;
  onLogout?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { name: 'My Classes', href: '/student/classes', icon: BookOpen },
  { name: 'All Labs', href: '/student/labs', icon: FlaskConical },
  { name: 'My Labs', href: '/student/my-labs', icon: Eye },
  { name: 'Settings', href: '/student/settings', icon: Settings },
];

export function StudentLayout({ children, basePath = '', onLogout }: StudentLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const pathname = usePathname();
  
  const [userProfile, setUserProfile] = useState<{ name: string; email: string; avatar?: string } | null>(null);

  useEffect(() => {
    async function fetchMe() {
      try {
        const res = await fetch('/api/users/me');
        if (res.ok) {
          const data = (await res.json()) as any;
          setUserProfile({
            name: data.fullName || data.username || 'Student',
            email: data.email || '',
            avatar: data.avatar || '',
          });
        }
      } catch (err) {
        // ignore
      }
    }
    void fetchMe();
  }, []);

  const displayName = userProfile?.name ?? 'Student';
  const displayEmail = userProfile?.email ?? '';
  const displayAvatar = userProfile?.avatar ?? '';

  const getInitials = (name: string) => {
    if (!name) return '';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };
  const initials = getInitials(displayName);

  const withBasePath = (href: string) => {
    if (!basePath || basePath === '/') {
      return href;
    }

    if (href === '/') {
      return basePath;
    }

    return `${basePath}${href}`;
  };

  const handlePerformLogout = async () => {
    setShowLogoutDialog(false);
    if (onLogout) {
      onLogout();
      return;
    }
    if (typeof window !== 'undefined') {
      const rt = localStorage.getItem('laas:refresh-token');
      localStorage.removeItem('laas:access-token');
      localStorage.removeItem('laas:refresh-token');
      localStorage.removeItem('laas:user');
      document.cookie = 'laas-token=; path=/; max-age=0; SameSite=Lax';
      if (rt) {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken: rt }),
          });
        } catch {
          // ignore network errors on logout
        }
      }
      window.location.href = '/';
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar for desktop */}
      <aside className="hidden border-r border-gray-200 bg-white lg:flex lg:w-64 lg:flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b border-gray-200 px-6">
          <img src="/logo.png" alt="Logo" className="h-14 w-28" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-4 py-6">
          {navItems.map((item) => {
            const itemPath = withBasePath(item.href);
            const isActive = pathname === itemPath || pathname?.startsWith(itemPath + '/');
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={itemPath}
                className={`relative flex items-center rounded-xl py-3 transition-all duration-300 ${
                  isActive
                    ? 'bg-green-500/[0.04] border border-green-500/10 pl-5 pr-4 font-semibold text-green-600 shadow-sm shadow-green-500/5'
                    : 'text-gray-700 border border-transparent pl-4 pr-4 hover:bg-gray-50/80 hover:text-gray-900 hover:translate-x-1'
                }`}
              >
                <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-green-500 transition-all duration-300 ${isActive ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0'}`} />
                <Icon className="mr-3 h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="mt-auto border-t border-gray-200">
          {/* User Profile Card */}
          <div className="flex items-center gap-3 px-6 py-4">
            {displayAvatar ? (
              <img
                src={displayAvatar}
                alt="Avatar"
                className="h-10 w-10 rounded-full object-cover border border-gray-200 shadow-sm"
                onError={(e) => {
                  const img = e.currentTarget as any;
                  img.style.display = 'none';
                  const fallback = img.nextSibling as any;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            {(!displayAvatar || displayAvatar === '') ? (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white font-semibold text-sm shadow-sm">
                {initials || <BookOpen className="h-5 w-5" />}
              </div>
            ) : (
              <div style={{ display: 'none' }} className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white font-semibold text-sm shadow-sm">
                {initials || <BookOpen className="h-5 w-5" />}
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {displayName}
              </span>
              <span className="text-xs text-gray-500 truncate">
                {displayEmail}
              </span>
            </div>
          </div>

          <div className="px-4 pb-4">
            <Button
              variant="ghost"
              onClick={() => setShowLogoutDialog(true)}
              className="h-auto w-full justify-start px-4 py-3 text-base font-normal text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="mr-3 h-5 w-5" />
              <span>Logout</span>
            </Button>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar */}
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 lg:hidden ${
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
        <aside
          className={`absolute bottom-0 left-0 top-0 w-64 transform bg-white transition-transform duration-300 flex flex-col ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b border-gray-200 px-6">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-orange-500">
                <span className="text-sm font-bold text-white">R</span>
              </div>
              <span className="font-bold text-gray-800">Robusta</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-4 py-6">
            {navItems.map((item) => {
              const itemPath = withBasePath(item.href);
              const isActive = pathname === itemPath || pathname?.startsWith(itemPath + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={itemPath}
                  onClick={() => setSidebarOpen(false)}
                  className={`relative flex items-center rounded-xl py-3 transition-all duration-300 ${
                    isActive
                      ? 'bg-green-500/[0.04] border border-green-500/10 pl-5 pr-4 font-semibold text-green-600 shadow-sm shadow-green-500/5'
                      : 'text-gray-700 border border-transparent pl-4 pr-4 hover:bg-gray-50/80 hover:text-gray-900 hover:translate-x-1'
                  }`}
                >
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-green-500 transition-all duration-300 ${isActive ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0'}`} />
                  <Icon className="mr-3 h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="mt-auto border-t border-gray-200">
            {/* User Profile Card */}
            <div className="flex items-center gap-3 px-6 py-4">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt="Avatar"
                  className="h-10 w-10 rounded-full object-cover border border-gray-200 shadow-sm"
                  onError={(e) => {
                    const img = e.currentTarget as any;
                    img.style.display = 'none';
                    const fallback = img.nextSibling as any;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
              ) : null}
              {(!displayAvatar || displayAvatar === '') ? (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white font-semibold text-sm shadow-sm">
                  {initials || <BookOpen className="h-5 w-5" />}
                </div>
              ) : (
                <div style={{ display: 'none' }} className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white font-semibold text-sm shadow-sm">
                  {initials || <BookOpen className="h-5 w-5" />}
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-gray-900 truncate">
                  {displayName}
                </span>
                <span className="text-xs text-gray-500 truncate">
                  {displayEmail}
                </span>
              </div>
            </div>

            <div className="px-4 pb-4">
              <Button
                variant="ghost"
                onClick={() => { setSidebarOpen(false); setShowLogoutDialog(true); }}
                className="h-auto w-full justify-start px-4 py-3 text-base font-normal text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <LogOut className="mr-3 h-5 w-5" />
                <span>Logout</span>
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-16 items-center border-b border-gray-200 bg-white px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)} className="mr-2">
            <Menu className="h-6 w-6" />
          </Button>
          <div className="ml-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-orange-500">
              <span className="text-sm font-bold text-white">R</span>
            </div>
            <span className="font-bold text-gray-800">Robusta</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {showLogoutDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Xác nhận đăng xuất</h3>
            <p className="mt-2 text-sm text-gray-600">Bạn có chắc chắn muốn đăng xuất khỏi hệ thống?</p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutDialog(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Huỷ
              </button>
              <button
                onClick={handlePerformLogout}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
