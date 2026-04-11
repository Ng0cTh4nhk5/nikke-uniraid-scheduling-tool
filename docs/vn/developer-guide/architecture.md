# Kiến trúc Hệ thống (Architecture)

Dự án NIKKE UniRaid Calculator áp dụng kiến trúc Fullstack trên nền tảng **Next.js 16** với **App Router**. Dưới đây là tổng quan kiến trúc hệ thống.

## 1. Công nghệ Sử dụng (Tech Stack)

- **Framework Core**: Next.js 16.2.2 (với React 19.2.4).
- **Ngôn ngữ**: TypeScript 5.
- **Routing**: Next.js App Router (sử dụng thư mục `app/`).
- **Database ORM**: Prisma v7.6.0 kết hợp với bộ điều hợp `@prisma/adapter-better-sqlite3`.
- **Database Engine**: Better-SQLite3 (cơ sở dữ liệu cục bộ, hiệu năng cao phù hợp triển khai độc lập).
- **Styling**: Vanilla CSS thông qua `globals.css`.
- **Optimization Engine**: Thư viện `glpk.js` (GLPK WASM) tính toán Bài toán Tối ưu Tuyến tính Nguyên (ILP).

## 2. Cấu trúc Thư mục (Directory Structure)

```text
nikke-uniraid-calculator/
├── app/
│   ├── (main)/       # Giao diện Client bao gồm danh mục (Raids, Members, Characters)
│   ├── api/          # Các Route Handlers RESTful định hình Backend Controller
│   ├── globals.css   # Chứa các utility classes và design system token
│   └── layout.tsx    # Giao diện bọc ngoài cho Client-Side Root
├── components/       # Các React Component dùng chung (UI components, Modals)
├── contexts/         # React Contexts quản lý state nội bộ 
├── docs/
│   └── developer-guide/  # Thư mục chứa tài liệu định hướng hệ thống
├── engine/           # Engine tính toán Optimization (ILP WASM solver — GLPK.js)
├── lib/              # Các utilities dùng chung như bảo mật auth.ts, constants.ts, prisma.ts
└── prisma/           # Định nghĩa CSDL Schema, config, và các Seed Database bằng TypeScript 
```

## 3. Luồng Hoạt động Tổng Thể (General Flow)

Hệ thống xoay quanh việc quản lý thông tin mùa Raid (Bosses) và ghi nhận kết quả Mock Battle (Profiles).

1. Người dùng vào nền tảng thông qua Frontend. Lựa chọn định danh Identity.
2. Form Submission gửi các Payload dưới dạng POST request tới `app/api/profiles/route.ts`.
3. Backend Server tiếp nhận, kiểm tra tính hợp lệ của Token/Cookie, sau đó gọi `Prisma Client` xử lý với cơ sở dữ liệu.
4. **Quy trình Tối ưu Lịch đánh (Optimize)**:
   - Admin kích hoạt Optimizer tại khu vực giao diện Raid Management (`/api/optimize`).
   - Server phân tách, trích xuất tất cả `Profiles` trong mùa giải và đẩy sang Data Matrix cho Engine (`engine/combo_builder.ts`).
   - WASM của **GLPK** tính toán các tổ hợp đội hình sát thương cao nhất, tuân thủ luật lệ Không trùng NIKKE của game.
   - Trả lời về Frontend dưới định dạng JSON Assignment, Client re-render DOM cập nhật lịch đánh và người dùng lưu lại (Publish).

## 4. Middleware & Access Control

Quyền truy cập được kiểm soát ở hai tầng: edge middleware (`middleware.ts`) và route handler (`lib/auth.ts`).

- **Cookie Signing**: Sử dụng HMAC-SHA256 (module `crypto` của Node.js) để ký và xác thực cookie.
- **Identity Access Control**: Cookie `nikke_member_id` được ký dưới dạng `[ID].[Signature]`. Server dùng `ADMIN_PASSWORD` trong `.env` làm secret key để verify chữ ký.
- **Admin Access Control**: Các thao tác quản trị (xoá Raid, quản lý thành viên...) yêu cầu cookie `nikke_admin_token` (HTTP-Only) đã được verify. Middleware chặn truy cập trái phép vào các route nhạy cảm.

> [!CAUTION]
> Chữ ký HMAC phụ thuộc vào giá trị `ADMIN_PASSWORD`. Nếu thay đổi giá trị này trong `.env`, **toàn bộ session hiện tại của thành viên và admin sẽ bị vô hiệu hoá** do chữ ký không còn khớp.

## 5. Xử lý UI và Data Fetching

Dự án tiếp tục triết lý của mô hình React Server Components (RSC):
- Dữ liệu fetch trực tiếp bằng logic Prisma trong các trang thư mục (ví dụ `page.tsx`). Do đặc thù SQLite siêu nhanh, cách này loại bỏ Loading Waterfall.
- Form Action hay Mutation phức tạp (hoặc thao tác cần Context API) sẽ trigger Fetch requests qua `next/navigation` hoặc `SWR` gọi về `app/api/...`.
- Cấu trúc thư mục Route Handlers ở backend được tổ chức theo module cực cụ thể (`/api/raids`, `/api/members`, `/api/profiles`, `/api/optimize`, `/api/auth/identify`).
