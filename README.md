# Lab-as-a-Service Portal

Đây là monorepo triển khai hệ thống **Lab-as-a-Service (LaaS)** cho Đào tạo và Triển khai Công nghệ Thông tin, bao gồm:

Dự án sử dụng công cụ **Nx** để quản lý monorepo và hỗ trợ xây dựng, phát triển nhiều microservices nhanh và có kiểm soát.

## 🎨 Frontend Applications

### 🎓 Student Portal

Dành cho **học viên**, tập trung vào trải nghiệm học tập và thực hành.

**Chức năng chính**:

* Đăng ký / đăng nhập, quản lý hồ sơ cá nhân
* Xem catalog khóa học & lab khả dụng
* Đăng ký tham gia khóa học / lab
* Truy cập môi trường lab, làm bài tập, nộp bài
* Theo dõi điểm số, tiến độ học tập
* Xem lịch sử các lab đã tham gia

---

### 👩‍🏫 Instructor Portal

Dành cho **giảng viên**, tập trung vào quản lý nội dung và lớp học.

**Chức năng chính**:

* Tạo & chỉnh sửa khóa học, module, lab template
* Quản lý lớp học, danh sách học viên, phân quyền trợ giảng
* Tạo bài tập, rubric, tiêu chí đánh giá
* Theo dõi tiến độ, kết quả học tập của học viên
* Chấm điểm thủ công hoặc rà soát kết quả auto-grading
* Gửi phản hồi cho học viên

---

### 🛠️ Admin Portal

Dành cho **quản trị viên hệ thống**, tập trung vào vận hành và giám sát.

**Chức năng chính**:

* Quản trị tổ chức, tài khoản và phân quyền hệ thống
* Cấu hình gói dịch vụ, quota tài nguyên, policy bảo mật
* Theo dõi usage, log hệ thống, health các service
* Quản lý billing, hoá đơn, đối soát thanh toán

---

## ⚙️ Backend Microservices

### 🌐 API Gateway

* Điểm vào duy nhất cho toàn bộ frontend
* Routing request tới các microservices
* Áp dụng:

  * Authentication / Authorization
  * Rate limiting
  * Request validation & logging

---

### 🔐 Auth Service

* Đăng ký / đăng nhập người dùng
* Quản lý session, JWT & refresh token
* Tích hợp SSO / OAuth2 theo môi trường triển khai

---

### 👤 User Service

* Quản lý người dùng, hồ sơ, vai trò & phân quyền
* Quản lý tổ chức, khóa học, lớp học
* Xử lý enrollment & quan hệ người dùng – khóa học

---

### 🧪 Lab Service

* Quản lý lab template & lab instance
* Quản lý phiên lab của từng học viên
* Điều phối vòng đời lab:

  * Khởi tạo
  * Dừng / huỷ
  * Lưu trạng thái & kết quả

---

### 💳 Billing Service

* Quản lý plan, subscription & usage
* Sinh hoá đơn & theo dõi thanh toán
* Tích hợp cổng thanh toán bên thứ ba

---

### 📝 Grading Service

* Quản lý bài tập & bài nộp
* Thực thi logic chấm điểm tự động
* Lưu điểm số, phản hồi
* Hỗ trợ tích hợp auto-grading (dự kiến)

---

### 🔔 Notification Service

* Gửi email, in-app notification
* Quản lý template thông báo
* Cấu hình kênh gửi & lịch gửi thông báo


> [Tài liệu chi tiết về yêu cầu nghiệp vụ và kiến trúc](docs/kltn.pdf)  
> [Hướng dẫn khởi tạo database cho từng microservice](SETUP_DATABASE.md)

---

## 1. Tech stack & kiến trúc

### Frontend

- **Next.js (App Router, React, TypeScript)**
- **TailwindCSS (+ shadcn/ui)** cho UI component
- 3 portal: Student / Instructor / Admin

### Backend

- **NestJS (Node.js + TypeScript)**
- **Prisma ORM** cho data access
- **Fastify adapter**, class-validator / class-transformer, Swagger/OpenAPI

### Database / Persistence

- **PostgreSQL** cho dữ liệu chính
- **Redis** (dự kiến) cho cache / pub-sub
- **MinIO** (dự kiến) cho object storage

Mỗi service sẽ có một database riêng để tránh Data Monolith anti-pattern. 
Mô tả chi tiết: [Setup database ban đầu](SETUP_DATABASE.md).

---

## 2. Cấu trúc dự án

Ở cấp repo:

```text
.
├── SETUP_DATABASE.md        # Hướng dẫn khởi tạo database cho từng microservice
├── README.md
├── docs/
│   └── kltn.pdf             # Tài liệu nghiệp vụ & kiến trúc chi tiết
└── laas-portal/             # Nx workspace chính
```

Trong **laas-portal**:

```text
laas-portal/
├── apps/
│   ├── frontend/
│   │   ├── student-portal/      # Next.js Student Portal
│   │   ├── instructor-portal/   # Next.js Instructor Portal
│   │   └── admin-portal/        # Next.js Admin Portal
│   └── backend/
│       ├── api-gateway/         # API Gateway
│       ├── auth-service/        # Auth, sessions, tokens
│       ├── user-service/        # Users, profiles, organizations, courses
│       ├── lab-service/         # Lab templates, lab instances, sessions
│       ├── billing-service/     # Plans, subscriptions, invoices, payments
│       ├── grading-service/     # Assignments, submissions, auto-grading
│       └── notification-service/# Emails, in-app notifications
└── libs/
    └── shared/
        ├── common/              # DTOs, types, shared logic
        ├── config/              # Config & env helpers
        ├── ui/                  # UI components chia sẻ
        └── utils/               # Helper & utilities
```

---

## 3. Yêu cầu hệ thống

- Node.js (LTS, khuyến nghị ≥ 20.x)
- pnpm (hoặc npm/yarn – repo hiện dùng pnpm lockfile)
- PostgreSQL
- (Dự kiến) Redis, MinIO nếu phát triển đầy đủ trong tương lai

---

## 4. Thiết lập môi trường (local)

### 4.1. Clone & cài dependencies

```bash
git clone https://github.com/BeKhanhCute2004/Lab-as-a-Service-LaaS-.git
cd Lab-as-a-Service/laas-portal
pnpm install
```

### 4.2. Tạo databases cho từng service

Làm theo hướng dẫn chi tiết trong [SETUP_DATABASE.md](SETUP_DATABASE.md), mục:

- `## Các Bước Thực Hiện` → `### Bước 1: Tạo PostgreSQL Databases`
- `### Bước 2: Cấu Hình Environment Variables`

Tóm tắt:

- Tạo các DB: `laas_auth`, `laas_users`, `laas_labs`, `laas_billing`, `laas_orchestration`, `laas_grading`, `laas_notifications`
- Tạo user riêng cho từng service

### 4.3. Cấu hình file `.env` cho backend services

Tham khảo đầy đủ: mục `### Bước 2: Cấu Hình Environment Variables` trong [SETUP_DATABASE.md](SETUP_DATABASE.md).

### 4.4. Chạy Prisma migrations & generate client

Có thể làm thủ công từng service (xem [SETUP_DATABASE.md](SETUP_DATABASE.md), mục `### Bước 3` & `### Bước 4`):

---

## 5. Chạy project

Dự án dùng **Nx** để điều phối task.
Có thể tải extension Nx Console để điều phối task qua giao diện cho dễ dàng.

### 5.1. Khởi động frontend portals

Ví dụ (nếu đã cấu hình target serve):

```bash
cd laas-portal

# Student Portal
npx nx serve student-portal

# Instructor Portal
npx nx serve instructor-portal

# Admin Portal
npx nx serve admin-portal
```

Nếu cần xem chính xác các target đang có, dùng:

```bash
npx nx show project student-portal --web
npx nx show project instructor-portal --web
npx nx show project admin-portal --web
```

### 5.2. Khởi động backend services

Tương tự, kiểm tra các target khả dụng:

```bash
npx nx show project auth-service --web
npx nx show project user-service --web
npx nx show project lab-service --web
npx nx show project billing-service --web
npx nx show project grading-service --web
npx nx show project notification-service --web
npx nx show project api-gateway --web
```

Một số target phổ biến (tùy config):

- `build` – build service (ví dụ: `npx nx build auth-service`)
- `serve` hoặc tương đương – chạy dev server
- `e2e` – chạy test
