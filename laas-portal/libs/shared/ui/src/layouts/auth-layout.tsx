import React from 'react';

export interface AuthLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  showLogo?: boolean;
  logoUrl?: string;
  footer?: React.ReactNode;
}

export function AuthLayout({
  children,
  title = 'Lab as a Service',
  subtitle = 'Student Portal',
  logoUrl = '/logo.png',
  footer,
}: AuthLayoutProps) {
  return (
    // Màn hình chia làm hai cột theo hàng ngang trên desktop, cột trái là branding & illustration, cột phải là form auth; còn trên mobile chỉ hiển thị form-auth theo hàng dọc
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Màn hình trái - Branding & Illustration (ẩn trên mobile) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#172A39] via-[#133a4f] to-[#185848] p-12 lg:flex lg:w-1/2">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute left-0 top-0 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          <div className="absolute bottom-0 right-0 h-96 w-96 translate-x-1/2 translate-y-1/2 rounded-full bg-white" />
          <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex w-full flex-col justify-between">
          {/* Logo & Brand */}
          <div className="text-white">
            <div className="mb-8 flex items-center gap-3">
              <img src={logoUrl} alt="Logo" className="h-14 w-28" />
              <div>
                <h1 className="text-2xl font-bold">{title}</h1>
                {subtitle && <p className="text-sm text-white/80">{subtitle}</p>}
              </div>
            </div>
          </div>

          {/* Hiển thị một số feature nổi bật */}
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md">
              <h2 className="mb-6 text-3xl font-bold text-white lg:text-4xl">
                Nền tảng thực hành lab hiện đại
              </h2>
              <p className="mb-8 text-lg text-white/90">
                Trải nghiệm học tập thực tế với môi trường lab ảo hóa, mọi lúc mọi nơi, không giới
                hạn.
              </p>

              <div className="space-y-4">
                {[
                  {
                    icon: '/assets/icons/features/rocket.png',
                    text: 'Khởi động lab trong vài giây',
                  },
                  { icon: '/assets/icons/features/computer.png', text: 'Truy cập từ mọi thiết bị' },
                  {
                    icon: '/assets/icons/features/dashboard.png',
                    text: 'Theo dõi tiến độ chi tiết',
                  },
                  {
                    icon: '/assets/icons/features/target.png',
                    text: 'Bài lab thực tế chất lượng cao',
                  },
                ].map((feature, index) => (
                  <div key={index} className="flex items-center gap-3 text-white/90">
                    <img src={feature.icon} alt="" className="h-8 w-8 object-contain" />
                    <span className="text-base">{feature.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-sm text-white/60">
            <p>© 2026 Lab as a Service. All rights reserved.</p>
          </div>
        </div>
      </div>

      {/* Màn hình phải - Form login/signup */}
      <div className="flex flex-1 items-center justify-center bg-gray-50 p-4 sm:p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Hiển thị logo trên mobile */}
          <div className="mb-8 text-center lg:hidden">
            <div className="inline-flex items-center justify-center gap-3">
              <img src={logoUrl} alt="Logo" className="h-12 w-12" />
              <div className="text-left">
                <h1 className="text-xl font-bold text-gray-900">{title}</h1>
                {subtitle && <p className="text-xs text-gray-600">{subtitle}</p>}
              </div>
            </div>
          </div>

          {/* Form login/signup */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-xl sm:p-8">
            {children}
          </div>

          {/* Footer */}
          {footer ? (
            <div className="mt-6">{footer}</div>
          ) : (
            <div className="mt-6 text-center text-sm text-gray-600 lg:hidden">
              <p>© 2026 Lab as a Service. All rights reserved.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthLayout;
