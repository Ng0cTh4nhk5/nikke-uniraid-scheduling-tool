# Tham chiếu API (API Reference)

Ứng dụng sử dụng Route Handlers của Next.js App Router. Tất cả API endpoints nằm trong thư mục `/app/api/...`.

> [!NOTE]
> Response trả về từ Server luôn giữ định dạng dữ liệu JSON (`application/json`). Xử lý lỗi thường sử dụng status code 400 (Bad Request), 403 (Forbidden), 404 (Not Found), 500 (Internal Server Error).

## Danh sách API Theo Chức năng

### 1. Quản lý Đăng Nhập Xác thực (`/api/auth/...`)
Hệ thống sử dụng Server-side HTTP-Only Cookies với chữ ký HMAC-SHA256.

- `POST /api/auth/identify`: Request body `{ "memberId": number }`. Tạo cookie `nikke_member_id` được ký bằng HMAC để xác thực danh tính thành viên.
- `DELETE /api/auth/identify`: Thu hồi cookie, đăng xuất Member hiện hành.
- `GET /api/auth/identify`: Trả về Member Object và trường `isAdmin` (Boolean) dựa vào token hiện tại. Dùng để xác định quyền hiển thị các chức năng quản trị trên giao diện.
- `POST /api/auth/admin`: Đăng nhập Admin. Request body `{ "password": "..." }`. Cấp phát cookie `nikke_admin_token` được ký bằng `ADMIN_PASSWORD` trong `.env`.

### 2. Quản lý Mùa Raid (`/api/raids/...`)

- `GET /api/raids`: Lấy danh sách tổng hợp.
- `POST /api/raids`: Sinh ra cấu trúc Raid mới. Yêu cầu Payload chứa data định nghĩa cho 5 BossSlot và thông số linh hoạt về lượng HP của 15 mốc (`hpLevel1`..`3` tương tự cho mỗi Boss).
- `GET /api/raids/:id`: Read dữ liệu kèm các quan hệ liên đới (BossSlot của mùa, ...). Khuyến khích sử dụng Server Component cho việc Load dữ liệu đọc này để tiết kiệm Network.

### 3. Quản lý Thành Viên (`/api/members/...`)
Các thao tác mutation yêu cầu uỷ quyền Admin (`nikke_admin_token`).

- `GET /api/members`: Fetch API cho mục SelectBox và Member management.
- `POST /api/members`: Gửi lên `name`, `role`, xác nhận tạo một thực thể người chơi.
- Các route đi ngang qua `PUT/DELETE` để toggle trạng thái isActive hay thay level Sync Device sẽ dùng chung thư mục này.

### 4. Ghi nhận Profile Đánh Nháp (`/api/profiles/...`)
Truy cập được uỷ quyền bằng một trong hai loại Token: Của Admin (nhúng tay), hoặc Của Member.

- `GET /api/profiles`: (Chứa các URL params linh hoạt tìm theo `raidId`).
- `POST /api/profiles`: Gửi report Team 5 NIKKEs. Dữ liệu Request:
  ```json
  {
     "memberId": 12,
     "bossSlotId": 2,
     "charIds": [1, 23, 7, 5, 2],
     "damage": "400000000" 
  }
  ```
  *(Lưu ý: Damage kiểu String vì database lưu dưới dạng BigInt.)*
- `PUT /api/profiles`: Cập nhật khi Member chơi lại thấy damage to hơn. Phải thỏa mãn quyền người nộp.
- `DELETE /api/profiles`: Huỷ kết quả.

### 5. Optimization Engine (`/api/optimize/...`)
Kích hoạt ILP Solver (GLPK WASM) để tính toán lịch phân công tối ưu.

- `POST /api/optimize`: Body `{ "raidId": number }`. 
  Lấy dữ liệu từ database, chuyển đổi sang ma trận tổ hợp (Combo Builder) → Gọi ILP Solver → Retry tối đa 3 lần với timeout tăng dần. Trả về `Assignment` mới kèm các `AssignmentEntry`.

- `PUT /api/assignments/:id`: Chỉnh sửa thủ công entry (set `isManual = true`). Cho phép Admin điều chỉnh `level1..3`, `execOrder` sau khi optimizer chạy xong.
