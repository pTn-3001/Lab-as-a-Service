import './global.css';

export const metadata = {
  title: 'Lab as a Service - Web Portal',
  description: 'Unified frontend for guest, admin, instructor, and student portals',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
