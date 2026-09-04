'use client';

import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Database,
  FlaskConical,
  GraduationCap,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Menu,
  Server,
  Settings,
  X,
} from 'lucide-react';

import React, { useState, useEffect } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '../components/button/button';

export interface InstructorLayoutProps {
  children: React.ReactNode;
  basePath?: string;
  currentUser?: { name: string; email: string; avatar?: string };
  onLogout?: () => void;
}

interface NavItem {
  name: string;
  href?: string;
  icon: React.ElementType;
  children?: { name: string; href: string; icon: React.ElementType }[];
}

const navItems: NavItem[] = [
  { name: 'Dashboard', href: '/instructor', icon: LayoutDashboard },
  { name: 'My Classes', href: '/instructor/classes', icon: GraduationCap },
  {
    name: 'Manage Repository',
    icon: Database,
    children: [
      { name: 'Lab Templates', href: '/instructor/labs', icon: FlaskConical },
      { name: 'Images', href: '/instructor/repository/images', icon: HardDrive },
      { name: 'Flavors', href: '/instructor/repository/flavors', icon: Server },
    ],
  },
  { name: 'Settings', href: '/instructor/settings', icon: Settings },
];

export function InstructorLayout({ children, basePath = '', currentUser, onLogout }: InstructorLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>(['Manage Repository']);
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
            name: data.fullName || data.username || 'Instructor',
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

  const displayName = userProfile?.name ?? currentUser?.name ?? 'Instructor';
  const displayEmail = userProfile?.email ?? currentUser?.email ?? '';
  const displayAvatar = userProfile?.avatar ?? currentUser?.avatar ?? '';

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

    if (href === basePath || href.startsWith(basePath + '/')) {
      return href;
    }

    return `${basePath}${href}`;
  };

  const toggleExpand = (itemName: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemName) ? prev.filter((name) => name !== itemName) : [...prev, itemName]
    );
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
      {/* Sidebar desktop */}
      <aside className="hidden border-r border-gray-200 bg-white lg:flex lg:w-64 lg:flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-center border-b border-gray-200 px-6">
          <img src="/logo.png" alt="Logo" className="h-14 w-28" />
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-4 py-6">
          {navItems.map((item) => {
            const Icon = item.icon;

            if (item.children) {
              const isExpanded = expandedItems.includes(item.name);
              const hasActiveChild = item.children.some((child) => {
                const childPath = withBasePath(child.href);
                return pathname === childPath || pathname?.startsWith(childPath + '/');
              });

              return (
                <div key={item.name}>
                  <button
                    onClick={() => toggleExpand(item.name)}
                    className={`flex w-full items-center justify-between rounded-xl px-4 py-3 transition-all duration-200 ${
                      hasActiveChild
                        ? 'bg-blue-500/10 font-semibold text-blue-600 shadow-sm shadow-blue-500/5'
                        : 'text-gray-700 hover:bg-gray-50/80 hover:text-gray-900 hover:translate-x-1'
                    }`}
                  >
                    <div className="flex items-center">
                      <Icon className="mr-3 h-5 w-5" />
                      <span>{item.name}</span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-1">
                      {item.children.map((child) => {
                        const childPath = withBasePath(child.href);
                        const isActive =
                          pathname === childPath || pathname?.startsWith(childPath + '/');
                        const ChildIcon = child.icon;
                        return (
                          <Link
                            key={child.name}
                            href={childPath}
                            className={`relative flex items-center rounded-xl py-2 text-sm transition-all duration-300 ${
                              isActive
                                ? 'bg-blue-500/[0.04] border border-blue-500/10 pl-9 pr-4 font-semibold text-blue-600 shadow-sm shadow-blue-500/5'
                                : 'text-gray-700 border border-transparent pl-8 pr-4 hover:bg-gray-50/80 hover:text-gray-900 hover:translate-x-1'
                            }`}
                          >
                            <div className={`absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 transition-all duration-300 ${isActive ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`} />
                            <ChildIcon className="mr-3 h-4 w-4" />
                            <span>{child.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const itemPath = withBasePath(item.href || '/');
            // For Dashboard, only active on exact match to avoid matching /instructor/* routes
            const isActive =
              item.name === 'Dashboard'
                ? pathname === itemPath
                : pathname === itemPath || pathname?.startsWith(itemPath + '/');
            return (
              <Link
                key={item.name}
                href={item.href ? itemPath : '#'}
                className={`relative flex items-center rounded-xl py-3 transition-all duration-300 ${
                  isActive
                    ? 'bg-blue-500/[0.04] border border-blue-500/10 pl-5 pr-4 font-semibold text-blue-600 shadow-sm shadow-blue-500/5'
                    : 'text-gray-700 border border-transparent pl-4 pr-4 hover:bg-gray-50/80 hover:text-gray-900 hover:translate-x-1'
                }`}
              >
                <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-blue-500 transition-all duration-300 ${isActive ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0'}`} />
                <Icon className="mr-3 h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="space-y-1 border-t border-gray-200 p-4">
          <Button
            variant="ghost"
            onClick={() => setShowLogoutDialog(true)}
            className="h-auto w-full justify-start px-4 py-6 text-base font-normal text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="mr-3 h-5 w-5" />
            <span>Logout</span>
          </Button>
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
          className={`absolute bottom-0 left-0 top-0 w-64 transform bg-white transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b border-gray-200 px-6">
            <img src="/logo.png" alt="Logo" className="h-14 w-28" />
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-4 py-6">
            {navItems.map((item) => {
              const Icon = item.icon;

              if (item.children) {
                const isExpanded = expandedItems.includes(item.name);
                const hasActiveChild = item.children.some((child) => {
                  const childPath = withBasePath(child.href);
                  return pathname === childPath || pathname?.startsWith(childPath + '/');
                });

                return (
                  <div key={item.name}>
                    <button
                      onClick={() => toggleExpand(item.name)}
                      className={`flex w-full items-center justify-between rounded-xl px-4 py-3 transition-all duration-200 ${
                        hasActiveChild
                          ? 'bg-blue-500/10 font-semibold text-blue-600 shadow-sm shadow-blue-500/5'
                          : 'text-gray-700 hover:bg-gray-50/80 hover:text-gray-900 hover:translate-x-1'
                      }`}
                    >
                      <div className="flex items-center">
                        <Icon className="mr-3 h-5 w-5" />
                        <span>{item.name}</span>
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    {isExpanded && (
                      <div className="ml-4 mt-1 space-y-1">
                        {item.children.map((child) => {
                          const childPath = withBasePath(child.href);
                          const isActive =
                            pathname === childPath || pathname?.startsWith(childPath + '/');
                          const ChildIcon = child.icon;
                          return (
                            <Link
                              key={child.name}
                              href={childPath}
                              onClick={() => setSidebarOpen(false)}
                              className={`relative flex items-center rounded-xl py-2 text-sm transition-all duration-300 ${
                                isActive
                                  ? 'bg-blue-500/[0.04] border border-blue-500/10 pl-9 pr-4 font-semibold text-blue-600 shadow-sm shadow-blue-500/5'
                                  : 'text-gray-700 border border-transparent pl-8 pr-4 hover:bg-gray-50/80 hover:text-gray-900 hover:translate-x-1'
                              }`}
                            >
                              <div className={`absolute left-4 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500 transition-all duration-300 ${isActive ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}`} />
                              <ChildIcon className="mr-3 h-4 w-4" />
                              <span>{child.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              const itemPath = withBasePath(item.href || '/');
              // For Dashboard, only active on exact match to avoid matching /instructor/* routes
              const isActive =
                item.name === 'Dashboard'
                  ? pathname === itemPath
                  : pathname === itemPath || pathname?.startsWith(itemPath + '/');
              return (
                <Link
                  key={item.name}
                  href={item.href ? itemPath : '#'}
                  onClick={() => setSidebarOpen(false)}
                  className={`relative flex items-center rounded-xl py-3 transition-all duration-300 ${
                    isActive
                      ? 'bg-blue-500/[0.04] border border-blue-500/10 pl-5 pr-4 font-semibold text-blue-600 shadow-sm shadow-blue-500/5'
                      : 'text-gray-700 border border-transparent pl-4 pr-4 hover:bg-gray-50/80 hover:text-gray-900 hover:translate-x-1'
                  }`}
                >
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r bg-blue-500 transition-all duration-300 ${isActive ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0'}`} />
                  <Icon className="mr-3 h-5 w-5" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="space-y-1 border-t border-gray-200 p-4">
            <Button
              variant="ghost"
              onClick={() => { setSidebarOpen(false); setShowLogoutDialog(true); }}
              className="h-auto w-full justify-start px-4 py-6 text-base font-normal text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="mr-3 h-5 w-5" />
              <span>Logout</span>
            </Button>
          </div>
        </aside>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-8">
          {/* Menu button mobile */}
          <div className="flex items-center lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="mr-2"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </div>

          {/* Title/Breadcrumb */}
          <div className="hidden flex-1 lg:flex">
            <h1 className="text-xl font-semibold text-gray-900">Instructor Portal</h1>
          </div>

          {/* Right section: User Avatar */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              {displayAvatar ? (
                <img
                  src={displayAvatar}
                  alt="Avatar"
                  className="h-8 w-8 rounded-full object-cover border border-gray-200"
                  onError={(e) => {
                    const img = e.currentTarget as any;
                    img.style.display = 'none';
                    const fallback = img.nextSibling as any;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
              ) : null}
              {(!displayAvatar || displayAvatar === '') ? (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-semibold text-xs shadow-sm">
                  {initials || <BookOpen className="h-4 w-4" />}
                </div>
              ) : (
                <div style={{ display: 'none' }} className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white font-semibold text-xs shadow-sm">
                  {initials || <BookOpen className="h-4 w-4" />}
                </div>
              )}
              <div className="hidden flex-col lg:flex">
                <span className="text-sm font-semibold text-gray-900 leading-tight">
                  {displayName}
                </span>
                <span className="text-xs text-gray-500">
                  {displayEmail}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-gray-50 p-4 lg:p-8">{children}</main>
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
