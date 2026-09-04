import Link from 'next/link';

const roleOptions = [
  {
    title: 'Student',
    description: 'Danh cho hoc vien vao lab, nop bai va theo doi tien do.',
    href: '/student/auth/login',
    accent: 'from-emerald-500 to-teal-500',
  },
  {
    title: 'Instructor',
    description: 'Danh cho giang vien tao lab, quan ly lop va cham diem.',
    href: '/instructor/auth/login',
    accent: 'from-sky-500 to-blue-500',
  },
  {
    title: 'Admin',
    description: 'Danh cho quan tri he thong, users va ha tang van hanh.',
    href: '/admin/auth/login',
    accent: 'from-amber-500 to-orange-500',
  },
];

export default function RoleSelectionPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 px-6 py-14">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-slate-900">
          Quay ve landing page
        </Link>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">
            Step 1/2
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Chon role de dang nhap</h1>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            Ban da vao dung luong dang nhap. Chon role phu hop de tiep tuc.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            {roleOptions.map((role) => (
              <Link
                key={role.title}
                href={role.href}
                className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div
                  className={`h-2 w-14 rounded-full bg-gradient-to-r ${role.accent}`}
                  aria-hidden
                />
                <h2 className="mt-4 text-lg font-bold text-slate-900">{role.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{role.description}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  Tiep tuc
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
