import { ensureValidToken, getAccessToken, getStoredUser, type AuthUser } from './auth';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  fullName: string | null;
  avatar: string | null;
  phone: string | null;
  language: string;
  timezone: string;
  studentCode?: string | null;
  department?: string | null;
  organization?: string | null;
  bio?: string | null;
  systemRole: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
  status: string;
  lastLoginAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface UserPreferences {
  emailNotifications: boolean;
  courseUpdates: boolean;
  labReminders: boolean;
  achievementsNotifications: boolean;
  theme: string;
  language: string;
  timezone: string;
}

export interface UpdateProfileDto {
  fullName?: string;
  avatar?: string;
  phone?: string;
  language?: string;
  timezone?: string;
  studentCode?: string;
  department?: string;
  organization?: string;
  bio?: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

async function requestWithAuth<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = (await ensureValidToken()) || getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.message || `Request failed: ${res.status}`);
  }

  return data as T;
}

export async function fetchMyProfile(): Promise<UserProfile> {
  return requestWithAuth<UserProfile>('/api/users/me');
}

export async function updateMyProfile(dto: UpdateProfileDto): Promise<UserProfile> {
  const updated = await requestWithAuth<UserProfile>('/api/users/me', {
    method: 'PUT',
    body: JSON.stringify(dto),
  });

  // Update cached user in localStorage
  if (typeof window !== 'undefined') {
    const existing = getStoredUser();
    if (existing) {
      const merged: AuthUser = {
        ...existing,
        fullName: updated.fullName,
        phone: updated.phone,
        avatar: updated.avatar,
      };
      localStorage.setItem('laas:user', JSON.stringify(merged));
    }
  }

  return updated;
}

export async function fetchMyPreferences(): Promise<UserPreferences> {
  try {
    return await requestWithAuth<UserPreferences>('/api/users/me/preferences');
  } catch {
    // Fallback default preferences
    return {
      emailNotifications: true,
      courseUpdates: true,
      labReminders: true,
      achievementsNotifications: true,
      theme: 'light',
      language: 'vi',
      timezone: 'Asia/Ho_Chi_Minh',
    };
  }
}

export async function updateMyPreferences(
  dto: Partial<UserPreferences>
): Promise<UserPreferences> {
  return requestWithAuth<UserPreferences>('/api/users/me/preferences', {
    method: 'PUT',
    body: JSON.stringify(dto),
  });
}

export async function changePassword(
  dto: ChangePasswordDto
): Promise<{ success: boolean; message: string }> {
  return requestWithAuth<{ success: boolean; message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}
