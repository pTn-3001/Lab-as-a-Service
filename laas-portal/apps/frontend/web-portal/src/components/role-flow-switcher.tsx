import Link from 'next/link';

type RoleKey = 'admin' | 'instructor' | 'student';

interface RoleFlowSwitcherProps {
  currentRole: RoleKey;
}

const roleConfig: Record<RoleKey, { label: string; loginPath: string }> = {
  admin: {
    label: 'Admin',
    loginPath: '/admin/auth/login',
  },
  instructor: {
    label: 'Instructor',
    loginPath: '/instructor/auth/login',
  },
  student: {
    label: 'Student',
    loginPath: '/student/auth/login',
  },
};

export function RoleFlowSwitcher({ currentRole }: RoleFlowSwitcherProps) {
  const otherRoles = (Object.keys(roleConfig) as RoleKey[]).filter((key) => key !== currentRole);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Dang o luong {roleConfig[currentRole].label}
      </p>
      <div className="flex flex-wrap gap-2">
        {otherRoles.map((role) => (
          <Link
            key={role}
            href={roleConfig[role].loginPath}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700"
          >
            Chuyen sang {roleConfig[role].label}
          </Link>
        ))}
        <Link
          href="/auth/login"
          className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700"
        >
          Chon role khac
        </Link>
      </div>
    </div>
  );
}
