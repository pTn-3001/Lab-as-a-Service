'use client';

import { InstructorLayout } from '@laas-portal/ui';
import { useEffect, useState } from 'react';
import { getStoredUser, logout, type AuthUser } from '../../../lib/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <InstructorLayout
      currentUser={user ? { name: user.fullName || user.username, email: user.email } : undefined}
      onLogout={handleLogout}
    >
      {children}
    </InstructorLayout>
  );
}
