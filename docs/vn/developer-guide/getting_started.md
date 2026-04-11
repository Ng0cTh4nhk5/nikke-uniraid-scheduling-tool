# Hướng dẫn Thiết lập Dự án (Getting Started)

Tài liệu hướng dẫn thiết lập và vận hành mã nguồn NIKKE UniRaid Calculator trên môi trường Local (máy phát triển) hoặc quy trình triển khai cơ bản dạng self-hosted.

## Yêu cầu Hệ thống (Prerequisites)

- **Node.js**: Phiên bản 20.x trở lên.
- **Trình quản lý gói**: `npm` (khuyên dùng vì package-lock.json dùng npm).
- Hệ điều hành có thể biên dịch `better-sqlite3` (thường tự động qua node-gyp nếu đã cài đặt các build-tools tiêu chuẩn của Python và C++ cho Node.js).
- **Trình duyệt Web**: Hệ thống tương thích tốt với các công nghệ WebAssembly hiện đại.

## Các Bước Cài đặt

### Bước 1: Clone Cài Đặt

Mở terminal và gõ các lệnh sau:

```bash
git clone <repository_url>
cd nikke-uniraid-calculator
npm install
```

### Bước 2: Thiết lập Định tuyến Biến Môi Trường (.env)

Hệ thống Next.js cần biến môi trường để chạy chức năng cốt lõi. Copy từ thư mục gốc:

```bash
cp .env.example .env
```

Mở `.env` và thiết lập các giá trị:

```env
# Mật khẩu Admin để đăng nhập, ĐỒNG THỜI là Secret Root sinh chữ ký bảo vệ hệ thống bằng HMAC-SHA256
ADMIN_PASSWORD=change_this_to_a_long_secure_string

# Cấu hình CSDL Database (Dành cho SQLite)
DATABASE_URL="file:./dev.db"
```

> [!CAUTION]
> Biến `ADMIN_PASSWORD` rất quan trọng. Thay đổi giá trị này sẽ làm vô hiệu hoá toàn bộ session hiện tại — tất cả thành viên và admin sẽ phải đăng nhập lại. Hãy đặt một chuỗi đủ mạnh và lưu giữ cẩn thận.

### Bước 3: Di Tản Cơ Sở Dữ Liệu (Migrate Database)

Với bộ điều hợp siêu tốc độ `@prisma/adapter-better-sqlite3` đang hiện diện, bạn đẩy Schema vào DB qua lệnh:

```bash
# Push schema lên database để tạo các tables tự động cho môi trường dev.
npm run db:push

# Generate Prisma Client Typings
npm run db:generate

# Chạy lệnh Seed để thêm trước toàn bộ các bộ NIKKE có sẵn (Character Enums)
npm run db:seed
```

### Bước 4: Chạy Server ở chế độ Phát triển

```bash
npm run dev
```

Tiếp đó mở trình duyệt trỏ tới URL http://localhost:3000. Hệ thống sẽ yêu cầu chọn danh tính (Identity). Chọn một thành viên trong danh sách để bắt đầu sử dụng, hoặc đăng nhập Admin bằng mật khẩu đã cấu hình trong `.env` để truy cập các tính năng quản trị.

## Quản trị viên (Prisma Studio)

> [!TIP]
> Có thể xem và chỉnh sửa dữ liệu trực tiếp bằng giao diện GUI của Prisma. Hữu ích khi cần xoá dữ liệu rác hoặc debug mà không cần thao tác qua App UI.

```bash
npm run db:studio
```
