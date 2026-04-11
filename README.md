# 🎯 NIKKE UniRaid Scheduling Tool

> 🇬🇧 **English version available:** [`docs/en/README.md`](docs/en/README.md)

Công cụ tối ưu phân công lượt đánh **Union Raid** trong game **NIKKE: Goddess of Victory**. Sử dụng thuật toán **Integer Linear Programming (ILP)** để tính ra lịch phân công tối ưu, giúp Union tối đa hoá tổng sát thương hiệu quả.

## ✨ Tính năng chính

- **Thu thập Mock Battle** — Thành viên submit profile (đội hình 5 nhân vật + damage) cho từng boss
- **Tối ưu tự động (ILP Solver)** — Engine GLPK WASM giải bài toán phân công tối ưu trong vài giây
- **Level Gate** — Tự động xử lý ràng buộc tiến trình level (phải clear L1 → L2 → L3)
- **Overkill Prevention** — Tối thiểu lãng phí damage trên boss đã chết
- **Chia sẻ kết quả** — Xuất lịch phân công dạng link public để gửi vào Discord
- **Quản trị dễ dàng** — Admin cấu hình boss, quản lý thành viên, chạy optimizer qua giao diện web

## 🛠️ Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| **Framework** | Next.js 16 (App Router, React 19) |
| **Database** | SQLite via Prisma v7 + `better-sqlite3` |
| **ILP Solver** | GLPK.js (WASM, server-side) |
| **Auth** | HMAC-SHA256 signed cookies (`httpOnly`, `secure`) |
| **Styling** | Vanilla CSS (dark theme, glassmorphism) |

## 🚀 Quick Start

### Yêu cầu

- **Node.js** 20+
- **npm** (khuyên dùng — project dùng `package-lock.json`)

### Cài đặt

```bash
# 1. Clone repo
git clone https://github.com/Ng0cTh4nhk5/nikke-uniraid-scheduling-tool.git
cd nikke-uniraid-scheduling-tool

# 2. Cài thư viện
npm install

# 3. Tạo file .env
cp .env.example .env
# Sửa ADMIN_PASSWORD trong .env

# 4. Khởi tạo database
npm run db:generate
npm run db:push
npm run db:seed

# 5. Chạy dev server
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000) — chọn danh tính → bắt đầu sử dụng.

## ⚙️ Biến môi trường

| Tên | Bắt buộc | Mô tả |
|-----|----------|-------|
| `DATABASE_URL` | ✅ | Đường dẫn SQLite. Dev: `file:./dev.db`, Prod: `file:/absolute/path/prod.db` |
| `ADMIN_PASSWORD` | ✅ | Mật khẩu Admin + Secret sinh chữ ký HMAC-SHA256 |
| `NODE_ENV` | ⬚ | Set `production` để enable secure cookies |

## 📁 Cấu trúc dự án

```
app/
├── (main)/               # Giao diện chính (sidebar + auth gate)
│   ├── raids/            # Quản lý mùa Raid, boss config, profiles, assignments
│   ├── members/          # Quản lý thành viên (admin)
│   └── characters/       # Danh sách nhân vật NIKKE (admin)
├── api/                  # REST API routes
│   ├── auth/             # Đăng nhập Admin + xác thực Member
│   ├── raids/            # CRUD raids + boss slots
│   ├── profiles/         # Submit / sửa / xoá profile
│   ├── optimize/         # Chạy ILP optimizer
│   └── assignments/      # Quản lý kết quả phân công
├── share/                # Trang chia sẻ công khai (không cần đăng nhập)
└── globals.css           # Design system

engine/                   # Optimization engine (ILP)
├── index.ts              # Orchestrator (4 pha pipeline)
├── combo_builder.ts      # Sinh tổ hợp combo hợp lệ (3 profile, 15 char distinct)
├── ilp_solver.ts         # GLPK WASM solver (retry + level gate constraints)
└── types.ts              # Engine types

prisma/
├── schema.prisma         # Database schema (6 models)
├── seed.ts               # Script nạp dữ liệu ban đầu
└── seed-data/            # Dữ liệu seed (tách riêng khỏi logic)
    ├── nikke_characters.json   # 185+ nhân vật NIKKE
    ├── members.ts         # 32 thành viên Union
    ├── bosses.ts          # Cấu hình 5 boss (HP × 3 levels)
    ├── profiles.ts        # Ma trận damage mẫu (32 members × 5 bosses)
    └── raids.ts           # Cấu hình raid khởi tạo

lib/                      # Shared utilities
├── auth.ts               # HMAC cookie signing, admin/member guards
├── prisma.ts             # Prisma client singleton
├── serialize.ts          # BigInt → string serialization
├── constants.ts          # Game constants (elements, classes, etc.)
├── format.ts             # Damage formatting helpers
└── types.ts              # API response types
```

## 🧠 Thuật toán tối ưu

Engine hoạt động theo pipeline **4 pha**:

1. **Pha 0 — Feasibility Analysis**: Ước tính Union clear được đến level nào
2. **Pha 1 — Combo Builder**: Sinh tổ hợp 3 profile hợp lệ (15 nhân vật không trùng) cho mỗi thành viên
3. **Pha 2 — ILP Solver (GLPK WASM)**: Giải bài toán tối ưu — maximize tổng effective damage, thoả mãn ràng buộc level gate + overkill cap
4. **Pha 3 — Post-processing**: Validate kết quả, tính thống kê, sinh cảnh báo

> Chi tiết đầy đủ: xem [`docs/vn/thuat-toan-phan-cong.md`](docs/vn/thuat-toan-phan-cong.md) và [`docs/vn/ba/03_Solution_Design.md`](docs/vn/ba/03_Solution_Design.md)

## 🌐 Deploy lên VPS

Dự án hỗ trợ mô hình **VPS thuê theo giờ** — khởi tạo nhanh đầu mùa Raid, hết mùa tải DB về rồi huỷ VPS.

> Hướng dẫn chi tiết từ A-Z: xem [`docs/vn/developer-guide/vps_deployment_guide.md`](docs/vn/developer-guide/vps_deployment_guide.md)

```bash
# Tóm tắt
npm install
npm run db:generate && npm run db:push && npm run db:seed
rm -rf .next && npm run build
cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
pm2 start .next/standalone/server.js --name "nikke-raid"
```

## 📚 Tài liệu

| Tài liệu | Nội dung |
|-----------|----------|
| [`docs/vn/ba/01_Business_Context.md`](docs/vn/ba/01_Business_Context.md) | Ngữ cảnh bài toán Union Raid |
| [`docs/vn/ba/02_Problem_Formulation.md`](docs/vn/ba/02_Problem_Formulation.md) | Mô hình toán học ILP |
| [`docs/vn/ba/03_Solution_Design.md`](docs/vn/ba/03_Solution_Design.md) | Thiết kế giải pháp 4 pha |
| [`docs/vn/ba/04_Database_Design.md`](docs/vn/ba/04_Database_Design.md) | Thiết kế CSDL (6 models, ERD) |
| [`docs/vn/thuat-toan-phan-cong.md`](docs/vn/thuat-toan-phan-cong.md) | Thuật toán phân công chi tiết |
| [`docs/vn/developer-guide/`](docs/vn/developer-guide/) | Hướng dẫn dev, API, deploy VPS |

## 📄 License

Private project — Internal use only.
