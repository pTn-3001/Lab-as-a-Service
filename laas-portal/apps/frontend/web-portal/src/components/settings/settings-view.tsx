'use client';

import React, { useEffect, useState } from 'react';
import {
  User,
  Shield,
  Loader2,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Sparkles,
  Clock,
  Calendar,
  Building,
  GraduationCap,
  Briefcase,
  Globe,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@laas-portal/ui';
import {
  fetchMyProfile,
  updateMyProfile,
  changePassword,
  type UserProfile,
} from '../../lib/user-settings';

interface SettingsViewProps {
  role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
}

export function SettingsView({ role }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'security'>('profile');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Profile form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [department, setDepartment] = useState('');
  const [organization, setOrganization] = useState('');
  const [bio, setBio] = useState('');

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Password visibility state
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & loading indicators
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Theme colors based on role
  const isInstructor = role === 'INSTRUCTOR';
  const accentBg = isInstructor ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#FF6900] hover:bg-[#E55E00]';
  const activeTabClass = isInstructor
    ? 'bg-blue-50 text-blue-700 border-l-4 border-blue-600 font-semibold'
    : 'bg-orange-50 text-[#FF6900] border-l-4 border-[#FF6900] font-semibold';
  const badgeColor = isInstructor
    ? 'bg-blue-100 text-blue-800'
    : role === 'ADMIN'
    ? 'bg-purple-100 text-purple-800'
    : 'bg-emerald-100 text-emerald-800';

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const profData = await fetchMyProfile();
        if (profData) {
          setProfile(profData);
          setFullName(profData.fullName || '');
          setPhone(profData.phone || '');
          setStudentCode(profData.studentCode || '');
          setDepartment(profData.department || '');
          setOrganization(profData.organization || '');
          setBio(profData.bio || '');
        }
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message || 'Không thể tải dữ liệu hồ sơ' });
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, []);

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0) return 'U';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileSaved(false);
    setMessage(null);
    const startTime = Date.now();
    try {
      const updated = await updateMyProfile({
        fullName: fullName.trim() || undefined,
        phone: phone.trim() || undefined,
        studentCode: role === 'STUDENT' ? studentCode.trim() || undefined : undefined,
        department: (role === 'INSTRUCTOR' || role === 'ADMIN') ? department.trim() || undefined : undefined,
        organization: role === 'ADMIN' ? organization.trim() || undefined : undefined,
        bio: bio.trim() || undefined,
      });
      const elapsed = Date.now() - startTime;
      if (elapsed < 350) {
        await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
      }
      setProfile(updated);
      setProfileSaved(true);
      setMessage({ type: 'success', text: 'Cập nhật thông tin hồ sơ thành công!' });
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Có lỗi xảy ra khi cập nhật hồ sơ' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setMessage({ type: 'error', text: 'Vui lòng nhập mật khẩu hiện tại' });
      return;
    }
    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Mật khẩu xác nhận không khớp' });
      return;
    }

    setChangingPassword(true);
    setPasswordChanged(false);
    setMessage(null);
    const startTime = Date.now();
    try {
      const res = await changePassword({ currentPassword, newPassword });
      const elapsed = Date.now() - startTime;
      if (elapsed < 350) {
        await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
      }
      setPasswordChanged(true);
      setMessage({ type: 'success', text: res.message || 'Đổi mật khẩu thành công!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordChanged(false), 2500);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Đổi mật khẩu thất bại. Vui lòng kiểm tra lại mật khẩu hiện tại.' });
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className={`h-8 w-8 animate-spin ${isInstructor ? 'text-blue-600' : 'text-[#FF6900]'}`} />
          <p className="text-sm font-medium">Đang tải cài đặt hệ thống...</p>
        </div>
      </div>
    );
  }

  const roleTitle = role === 'ADMIN' ? 'Admin Settings' : role === 'INSTRUCTOR' ? 'Instructor Settings' : 'Student Settings';
  const roleSubtitle = role === 'ADMIN' ? 'Quản lý thông tin quản trị viên và hệ thống' : role === 'INSTRUCTOR' ? 'Quản lý thông tin giảng viên và tuỳ chọn giảng dạy' : 'Quản lý hồ sơ học viên và các tuỳ chọn học tập';

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{roleTitle}</h1>
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColor}`}>
            {role}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-500">{roleSubtitle}</p>
      </div>

      {/* Global Feedback Banner */}
      {message && (
        <div
          className={`flex items-center gap-3 rounded-xl p-4 text-sm font-medium transition-all ${
            message.type === 'success'
              ? 'border border-green-200 bg-green-50 text-green-800'
              : 'border border-red-200 bg-red-50 text-red-800'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          ) : (
            <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          )}
          <span className="flex-1">{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Container */}
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left Navigation Sidebar */}
        <div className="flex w-full shrink-0 flex-row gap-2 overflow-x-auto rounded-xl border border-gray-100 bg-white p-2 shadow-sm lg:w-64 lg:flex-col lg:overflow-x-visible">
          <button
            type="button"
            onClick={() => { setActiveTab('profile'); setMessage(null); }}
            className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors text-left ${
              activeTab === 'profile'
                ? activeTabClass
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <User className="h-4 w-4 shrink-0" />
            <span className="font-medium">Thông tin cá nhân</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab('security'); setMessage(null); }}
            className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm transition-colors text-left ${
              activeTab === 'security'
                ? activeTabClass
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Shield className="h-4 w-4 shrink-0" />
            <span className="font-medium">Bảo mật & Mật khẩu</span>
          </button>
        </div>

        {/* Right Content Panel */}
        <div className="flex-1 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-sm">
          {/* TAB 1: Profile Information */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-lg font-bold text-gray-900">Hồ sơ cá nhân</h2>
                <p className="text-xs text-gray-500">Cập nhật thông tin chi tiết tài khoản của bạn</p>
              </div>

              {/* Avatar section (Without change avatar button) */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-xl bg-gray-50 p-4 border border-gray-100">
                {profile?.avatar ? (
                  <img
                    src={profile.avatar}
                    alt="Avatar"
                    className="h-16 w-16 rounded-full object-cover border-2 border-white shadow-sm"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = '';
                    }}
                  />
                ) : (
                  <div className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white shadow-sm ${isInstructor ? 'bg-blue-600' : 'bg-[#FF6900]'}`}>
                    {getInitials(fullName || profile?.username || '')}
                  </div>
                )}
                <div className="flex-1 space-y-1">
                  <h3 className="font-semibold text-gray-900">{fullName || profile?.username || 'Người dùng'}</h3>
                  <p className="text-xs text-gray-500">{profile?.email}</p>
                </div>
              </div>

              {/* Basic Fields */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Họ và tên
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none transition-all focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+84 912 345 678"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm outline-none transition-all focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900]"
                  />
                </div>
              </div>

              {/* Role-Specific Fields */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên đăng nhập (Username)
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={profile?.username || ''}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-500 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-xs text-gray-400 font-normal">(Quản lý bởi IdP)</span>
                  </label>
                  <input
                    type="email"
                    readOnly
                    disabled
                    value={profile?.email || ''}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-500 cursor-not-allowed"
                  />
                </div>

                {role === 'STUDENT' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mã học viên (Student Code)
                    </label>
                    <div className="relative">
                      <GraduationCap className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={studentCode}
                        onChange={(e) => setStudentCode(e.target.value)}
                        placeholder="STD-2026-001"
                        className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm outline-none transition-all focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900]"
                      />
                    </div>
                  </div>
                )}

                {(role === 'INSTRUCTOR' || role === 'ADMIN') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Khoa / Bộ môn (Department)
                    </label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        placeholder="Khoa Công nghệ Thông tin"
                        className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm outline-none transition-all focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                {role === 'ADMIN' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tổ chức / Đơn vị (Organization)
                    </label>
                    <div className="relative">
                      <Building className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={organization}
                        onChange={(e) => setOrganization(e.target.value)}
                        placeholder="Robusta Technology Training"
                        className="w-full rounded-lg border border-gray-300 pl-10 pr-4 py-2 text-sm outline-none transition-all focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bio & Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Giới thiệu bản thân & Ghi chú
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Mô tả ngắn gọn về chuyên môn, mục tiêu học tập hoặc kinh nghiệm của bạn..."
                  className="w-full rounded-lg border border-gray-300 p-3 text-sm outline-none transition-all focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900]"
                />
              </div>

              {/* Submit Button with Smooth Loading */}
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={savingProfile}
                  className={`min-w-[150px] h-10 inline-flex items-center justify-center font-medium px-6 py-2 rounded-lg text-white transition-all duration-200 shadow-sm active:scale-[0.98] ${
                    profileSaved
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : accentBg
                  }`}
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                      <span>Đang lưu...</span>
                    </>
                  ) : profileSaved ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4 text-white" />
                      <span>Đã lưu!</span>
                    </>
                  ) : (
                    'Lưu thay đổi'
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* TAB 2: Security & Password */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <div className="border-b border-gray-100 pb-4">
                <h2 className="text-lg font-bold text-gray-900">Bảo mật & Đổi mật khẩu</h2>
                <p className="text-xs text-gray-500">Quản lý mật khẩu và xem các thông tin bảo mật tài khoản</p>
              </div>

              {/* Change Password Form */}
              <form onSubmit={handleChangePassword} className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-gray-500" />
                  Đổi mật khẩu
                </h3>

                {/* Current Password Field with Eye Toggle */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mật khẩu hiện tại
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full rounded-lg border border-gray-300 px-4 py-2 pr-11 text-sm outline-none transition-all focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                      tabIndex={-1}
                      title={showCurrentPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* New Password & Confirm Password with Eye Toggles */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mật khẩu mới
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Ít nhất 6 ký tự"
                        required
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 pr-11 text-sm outline-none transition-all focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                        tabIndex={-1}
                        title={showNewPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Xác nhận mật khẩu mới
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Nhập lại mật khẩu mới"
                        required
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 pr-11 text-sm outline-none transition-all focus:border-[#FF6900] focus:ring-1 focus:ring-[#FF6900]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                        tabIndex={-1}
                        title={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Submit Button with Smooth Loading */}
                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={changingPassword}
                    className={`min-w-[170px] h-10 inline-flex items-center justify-center font-medium px-6 py-2 rounded-lg text-white transition-all duration-200 shadow-sm active:scale-[0.98] ${
                      passwordChanged
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : accentBg
                    }`}
                  >
                    {changingPassword ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin text-white" />
                        <span>Đang cập nhật...</span>
                      </>
                    ) : passwordChanged ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4 text-white" />
                        <span>Đã đổi mật khẩu!</span>
                      </>
                    ) : (
                      'Cập nhật mật khẩu'
                    )}
                  </Button>
                </div>
              </form>

              {/* Account Security Metadata Card */}
              <div className="mt-8 border-t border-gray-100 pt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Thông tin trạng thái tài khoản
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Globe className="h-3.5 w-3.5" />
                      Trạng thái tài khoản
                    </div>
                    <p className="text-sm font-semibold text-emerald-600">
                      {profile?.status === 'ACTIVE' ? 'Đang hoạt động (Active)' : profile?.status || 'Active'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock className="h-3.5 w-3.5" />
                      Đăng nhập gần nhất
                    </div>
                    <p className="text-sm font-semibold text-gray-800">
                      {profile?.lastLoginAt
                        ? new Date(profile.lastLoginAt).toLocaleString('vi-VN')
                        : 'Vừa xong'}
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Calendar className="h-3.5 w-3.5" />
                      Ngày tạo tài khoản
                    </div>
                    <p className="text-sm font-semibold text-gray-800">
                      {profile?.createdAt
                        ? new Date(profile.createdAt).toLocaleDateString('vi-VN')
                        : 'Gần đây'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
