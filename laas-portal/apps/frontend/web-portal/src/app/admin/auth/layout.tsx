import { AuthLayout } from '@laas-portal/ui';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthLayout title="Lab as a Service" subtitle="Admin Portal" logoUrl="/logo.png">
      {children}
    </AuthLayout>
  );
}
