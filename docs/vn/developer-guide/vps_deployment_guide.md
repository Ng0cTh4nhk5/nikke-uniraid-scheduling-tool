# Hướng Dẫn Triển Khai (Deploy) NIKKE UniRaid Calculator lên VPS


Tài liệu này cung cấp hướng dẫn từ A-Z để đưa dự án NIKKE UniRaid Calculator lên một máy chủ VPS mới hoàn toàn (chạy Ubuntu 22.04 / 24.04), bao gồm cả việc trỏ tên miền riêng và cài SSL.

Đặc biệt, tài liệu được thiết kế tối ưu cho **Mô hình Thuê Theo Giờ (On-Demand VPS)**: Khởi tạo cực nhanh đầu mùa Raid → Khôi phục dữ liệu mùa trước → Hết mùa tải dữ liệu về → Xoá máy chủ.

---

## Thông Tin VPS Cần Ghi Nhận

Sau khi thuê VPS, hãy ghi lại các thông tin sau để sử dụng xuyên suốt quá trình triển khai:

| Thông số | Giá trị |
|---|---|
| **IPv4** | `<YOUR_VPS_IP>` |
| **OS** | Ubuntu 22.04 / 24.04 LTS (64-bit) |
| **Cấu hình** | Xem mục **Cấu Hình VPS Khuyến Nghị** bên dưới |
| **SSH** | `root@<YOUR_VPS_IP>` — Port `22` |

## Cấu Hình VPS Khuyến Nghị

> [!IMPORTANT]
> **Cấu hình tối thiểu đảm bảo chạy peak:**
>
> | Thông số | Khuyến nghị | Tối thiểu | Ghi chú |
> |---|---|---|---|
> | **vCPU** | 2 Cores x86_64 | 1 Core | ILP solver đơn luồng, giải < 1 giây |
> | **RAM** | 2 GB | 1 GB | Runtime ~200MB; build peak ~1.5GB (chỉ lúc `npm run build`) |
> | **Storage** | 20 GB SSD | 10 GB SSD | `node_modules` ~350MB + `.next` build ~150MB + DB ~1MB |
> | **OS** | Ubuntu 22.04 / 24.04 LTS | Bất kỳ Linux x86_64 nào có Node.js 20+ |
>
> VPS hiện tại (2 vCPU / 2 GB / 20 GB) **hoàn toàn đáp ứng** cả build lẫn runtime.

### Phân Tích Tải Peak

Ứng dụng có **3 pha hoạt động** với yêu cầu tài nguyên khác nhau:

| Pha | CPU | RAM | Thời lượng | Ghi chú |
|-----|-----|-----|-----------|---------|
| **Build** (`npm run build`) | 100% 1 core | ~1.5 GB peak | 60–120 giây | Chạy 1 lần duy nhất khi deploy/update |
| **Runtime idle** (SSR + API) | < 5% | ~150–200 MB | Liên tục | Next.js standalone server phục vụ web |
| **ILP Solver** (`POST /api/optimize`) | 100% 1 core | +50–80 MB | **< 1 giây** | Tải nặng nhất nhưng cực ngắn |

#### Chi tiết ILP Solver (peak workload)

Solver sử dụng **GLPK.js** (WASM, 287KB binary), giải bài toán tối ưu Integer Linear Programming:

| Metric | Giá trị thực đo (32 members × 5 boss × 3 levels) |
|--------|---------------------------------------------------|
| **Biến nhị phân (binary vars)** | ~1.400 (y_m_c) + 2 gate vars |
| **Ràng buộc (constraints)** | ~50–70 (member + damage + level gate) |
| **Thời gian solve** | **400–800ms** (Optimal solution) |
| **WASM memory** | ~50 MB peak |
| **Kết quả** | 22/32 members assigned, total effective ~1.44T |

> **Kết luận:** Solver nhanh đến mức request HTTP hoàn thành trong < 2 giây (kể cả DB read/write). Không cần 4 cores hay 4GB RAM. **2 vCPU + 2GB là quá dư dả** cho runtime. Nếu muốn build trên cùng máy, 2GB RAM là đủ (Next.js standalone build nhẹ hơn full build).
>
> *(Mẹo: Với cấu hình 1 vCPU + 1GB RAM, nhiều nhà cung cấp VPS tính phí theo giờ rất rẻ — chỉ khoảng **$1–2 cho cả mùa Raid 3–5 ngày**!)*

> [!TIP]
> **Nếu build bị lỗi `FATAL ERROR: Reached heap limit` trên VPS 1GB RAM:**
> Tạo swap 2GB tạm thời chỉ để build, rồi xoá sau:
> ```bash
> sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
> sudo mkswap /swapfile && sudo swapon /swapfile
> npm run build
> sudo swapoff /swapfile && sudo rm /swapfile
> ```

**Yêu Cầu Chuẩn Bị Trước Khi Chạy Lệnh:**
1. Đã SSH thành công vào VPS: `ssh root@<YOUR_VPS_IP>`
2. Trong tay đang có file `prod.db` (dữ liệu SQLite) lưu lại từ mùa trước. Nếu Union mới chơi lần đầu thì bỏ qua bước này.
3. *(Tuỳ chọn)* Tên miền đã mua sẵn, sẽ trỏ vào VPS ở Giai Đoạn 5.

## Giai Đoạn 1: Cài đặt Phần mềm Nền tảng

Chạy lần lượt các lệnh sau để cài đặt **Node.js (v20)** và bộ quản lý tiến trình **PM2**.

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Node.js 20 và các công cụ build
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git build-essential

# Cài đặt PM2 (quản lý chạy web ngầm 24/24)
sudo npm install -g pm2
```

## Giai Đoạn 2: Tải Mã Nguồn và Cấu Hình

```bash
# 1. Clone mã nguồn về VPS
git clone <YOUR_REPOSITORY_URL> /var/www/nikke-raid

# 2. Đi vào thư mục mã nguồn (TẤT CẢ lệnh từ đây trở đi đều chạy từ thư mục này)
cd /var/www/nikke-raid

# 3. Tạo thư mục data chứa SQLite database
mkdir -p data

# 4. Tạo file biến môi trường (.env)
cat > .env << 'EOF'
DATABASE_URL="file:/var/www/nikke-raid/data/prod.db"
NODE_ENV=production
ADMIN_PASSWORD=change_me_in_production
EOF
```

> [!WARNING]
> **Bắt buộc** đổi `ADMIN_PASSWORD` thành mật khẩu thực sự mạnh trước khi chia sẻ link cho Union. Đây là mật khẩu để Leader truy cập các tính năng quản trị (tạo Raid, cấu hình Boss, chạy Optimize).

> [!TIP]
> **Nếu có dữ liệu từ mùa Raid trước:** Dùng **WinSCP** hoặc **FileZilla** upload file `prod.db` vào `/var/www/nikke-raid/data/prod.db` **ngay sau bước 3**, trước khi chạy tiếp Giai Đoạn 3.

## Giai Đoạn 3: Cài Thư Viện, Khởi Tạo Database và Build

Phải chạy **đúng thứ tự** từ trên xuống, không được bỏ bước nào.

```bash
# 1. Tải toàn bộ thư viện
npm install

# 2. Tạo Prisma Client từ schema (bắt buộc)
npm run db:generate

# 3. Tạo/cập nhật cấu trúc bảng trong database
#    (tự tạo file prod.db nếu chưa tồn tại)
npm run db:push

# 4. Nạp dữ liệu vào database
npm run db:seed
```

> [!IMPORTANT]
> **`npm run db:seed` là bước bắt buộc** dù là mùa đầu tiên hay đã có `prod.db` mùa cũ. Lệnh này nạp:
> - **185+ nhân vật NIKKE** từ file `nikke_characters.json` (upsert — không bị trùng nếu chạy lại)
> - **Danh sách thành viên Union** với Synchro Device Level (cấu hình trong `prisma/seed-data/members.ts`)
> - **Cấu hình Raid mẫu** (status: draft/closed) sẵn sàng sử dụng
>
> Nếu bỏ qua, trang web sẽ hoạt động nhưng **không hiển thị danh sách thành viên và nhân vật**.
>
> Bạn cần chỉnh sửa file `prisma/seed-data/members.ts` để cập nhật danh sách thành viên cho Union của mình trước khi chạy seed.

```bash
# 5. Xoá build cache cũ (BẮT BUỘC: tránh lỗi stale cache)
rm -rf .next

# 6. Biên dịch dự án Next.js (standalone output)
npm run build

# 7. Copy các file tĩnh (BẮT BUỘC: tránh lỗi web bị màn hình trắng)
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
```

> [!WARNING]
> **`rm -rf .next` là bước bắt buộc** trước mỗi lần build. Next.js Turbopack có build cache rất aggressive — nếu không xoá, server code cũ (đã biên dịch) có thể bị giữ lại trong standalone output, dù source code đã thay đổi. Đây từng là nguyên nhân khiến ILP solver chạy sai trên VPS (thiếu SCALE factor → numerical instability → phân bổ damage sai).

> [!NOTE]
> Dự án cấu hình `output: "standalone"` trong `next.config.ts`. Sau khi build, Next.js tạo folder `.next/standalone/` chứa server tối giản. Chúng ta sẽ dùng PM2 để chạy trực tiếp file `server.js` trong thư mục này thay vì dùng `npm start`.

> [!TIP]
> Nếu gặp lỗi `FATAL ERROR: Reached heap limit` trong khi build (VPS 1GB RAM), hãy tạo swap tạm — xem hướng dẫn ở mục **Cấu Hình VPS Khuyến Nghị** phía trên.

**Kiểm tra nhanh:** Xác nhận database đã có dữ liệu bằng cách kiểm tra dung lượng file:
```bash
ls -lh data/prod.db
# Kết quả mong đợi: file tồn tại, dung lượng > 100KB
```

## Giai Đoạn 4: Mở Tường Lửa & Khởi Động Website

```bash
# 1. Mở port cho SSH, HTTP, HTTPS và fallback 3000
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp
sudo ufw --force enable

# 2. Khởi động ứng dụng bằng PM2 (với Next.js standalone)
pm2 start .next/standalone/server.js --name "nikke-raid"

# 3. Lưu cấu hình PM2 (tự bật lại nếu VPS reboot)
pm2 save
pm2 startup
```

> [!TIP]
> Tới lúc này trang web đã chạy tại: `http://<YOUR_VPS_IP>:3000`
>
> Kiểm tra nhanh:
> ```bash
> pm2 logs nikke-raid --lines 20
> ```
> Nếu thấy dòng `✓ Ready in ...` nghĩa là thành công.

> [!NOTE]
> Nếu chưa cần tên miền, dùng luôn IP để truy cập. Khi nào muốn gắn domain, chuyển sang **Giai Đoạn 5** bên dưới.

---

## Giai Đoạn 5: Trỏ Tên Miền & Cài SSL (Tuỳ chọn)

Phần này hướng dẫn trỏ tên miền (ví dụ: `raid.your-domain.com`) vào VPS, dùng **Nginx** làm reverse proxy và **Let's Encrypt** cấp chứng chỉ SSL miễn phí.

> [!IMPORTANT]
> Trước khi bắt đầu, bạn cần:
> - Đã mua tên miền (ví dụ tại Namecheap, Cloudflare, Tenten, P.A Vietnam...)
> - Có quyền quản lý DNS của tên miền đó

### Bước 1: Cấu hình DNS tại nhà cung cấp tên miền

Đăng nhập vào trang quản lý DNS của tên miền và tạo **bản ghi A** trỏ về IP VPS.

Ví dụ, để tạo subdomain `raid.your-domain.com`, hãy điền:

| Name (Tên / Host) | Type (Loại) | Content (Giá trị / Value) | TTL | Prio |
|---|---|---|---|---|
| `raid` | **A** | `<YOUR_VPS_IP>` | 1 hour / Auto | *(Bỏ trống)* |

*(Lưu ý: Nếu ô **Name** có chữ gợi ý sẵn tên miền gốc, bạn chỉ cần gõ phần subdomain mong muốn. Hệ thống sẽ tự động nối thành subdomain đầy đủ.)*

> [!NOTE]
> DNS có thể mất từ vài phút đến 24 giờ để propagate. Kiểm tra bằng:
> ```bash
> # Chạy trên máy cá nhân (không phải VPS)
> nslookup raid.your-domain.com
> # Hoặc:
> ping raid.your-domain.com
> ```
> Khi thấy trả về đúng IP VPS của bạn là DNS đã sẵn sàng.

### Bước 2: Cài Nginx trên VPS

```bash
# Cài Nginx
sudo apt install -y nginx

# Kiểm tra Nginx đã chạy
sudo systemctl status nginx
```

Truy cập `http://<YOUR_VPS_IP>` (không có port 3000) — nếu thấy trang mặc định "Welcome to nginx!" là thành công.

### Bước 3: Cấu hình Nginx Reverse Proxy

Thay `raid.your-domain.com` bằng tên miền thật của bạn:

```bash
# Tạo file cấu hình cho site
sudo nano /etc/nginx/sites-available/nikke-raid
```

Dán nội dung sau vào (nhớ thay tên miền):

```nginx
server {
    listen 80;
    server_name raid.your-domain.com;  # ← ĐỔI THÀNH DOMAIN CỦA BẠN

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Kích hoạt site
sudo ln -s /etc/nginx/sites-available/nikke-raid /etc/nginx/sites-enabled/

# Xoá site mặc định (tránh conflict)
sudo rm -f /etc/nginx/sites-enabled/default

# Kiểm tra cú pháp nginx
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

Bây giờ truy cập `http://raid.your-domain.com` (không cần port 3000) sẽ thấy trang web.

### Bước 4: Cài SSL miễn phí với Let's Encrypt

```bash
# Cài Certbot + plugin Nginx
sudo apt install -y certbot python3-certbot-nginx

# Chạy Certbot (thay tên miền thật vào)
sudo certbot --nginx -d raid.your-domain.com
```

Certbot sẽ hỏi:
1. **Email** — để nhận thông báo khi cert sắp hết hạn
2. **Đồng ý điều khoản** — bấm `Y`
3. **Redirect HTTP → HTTPS** — chọn **"2" (Redirect)** để tự động chuyển HTTP sang HTTPS

> [!TIP]
> Let's Encrypt cert có hạn 90 ngày, nhưng Certbot tự cài **cron job renew** sẵn. Với mô hình thuê VPS theo mùa Raid (3–5 ngày), bạn không bao giờ cần lo chuyện gia hạn cert.
>
> Kiểm tra tự động gia hạn hoạt động:
> ```bash
> sudo certbot renew --dry-run
> ```

### Bước 5: Xác nhận

Sau khi hoàn tất, truy cập `https://raid.your-domain.com` — phải thấy ổ khoá xanh 🔒 trên thanh địa chỉ và trang web hiển thị bình thường.

> [!WARNING]
> **Sau khi có SSL**, cần cập nhật file `.env` để cookie `secure` hoạt động đúng:
> ```bash
> cd /var/www/nikke-raid
> # Đảm bảo NODE_ENV=production đã được set (kiểm tra bằng cat .env)
> # Restart lại app
> pm2 restart nikke-raid
> ```

---

## Thiết Lập Admin và Bắt Đầu Sử Dụng

Sau khi website đã chạy, quy trình sử dụng cho Union Leader:

### Bước 1: Đăng nhập Admin
1. Truy cập `http://<YOUR_VPS_IP>:3000` (hoặc `https://raid.your-domain.com` nếu đã gắn domain)
2. **Chọn danh tính** (tên của Leader trong danh sách thành viên)
3. Bấm **avatar/tên** ở góc trên bên phải → chọn **🔐 Đăng nhập Admin**
4. Nhập mật khẩu đã cấu hình trong `.env` (`ADMIN_PASSWORD`)

### Bước 2: Cấu hình Raid
1. Vào **Mùa Raid** → chọn Raid (hoặc tạo mới)
2. Tab **Cấu hình Boss** → nhập 5 BossSlot (hệ, tên, HP Level 1/2/3)
3. Chuyển status từ `draft` → `active` để mở nhận profile

### Bước 3: Thu thập Profile
- Thành viên truy cập web → chọn danh tính → vào Raid → tab **Nộp Profile**
- Chọn Boss, chọn 5 nhân vật, nhập damage → Submit
- Admin có thể xem tất cả profile ở tab **Profiles**

### Bước 4: Chạy Optimizer
- Admin vào Raid → tab **Kết quả** → bấm **🚀 Chạy Optimizer**
- Engine chạy ILP solver (1–10 giây) → tạo Assignment mới
- Xem chi tiết tại `/raids/[raidId]/assignments/[assignmentId]`

---

## Quản Lý & Theo Dõi Trong Mùa Raid

```bash
# Xem log real-time
pm2 logs nikke-raid --lines 50

# Kiểm tra trạng thái tiến trình
pm2 status

# Khởi động lại (sau khi sửa .env hoặc deploy code mới)
pm2 restart nikke-raid

# Tắt ứng dụng
pm2 stop nikke-raid
```

---

## 🔄 Cập Nhật Code Trong Mùa Raid

Khi có thay đổi code đã được push lên GitHub, chạy trình tự sau trên VPS:

```bash
cd /var/www/nikke-raid

# 1. Kéo code mới về từ GitHub
git pull origin main

# 2. Cài lại thư viện (chỉ cần nếu package.json thay đổi)
npm install

# 3. Tạo lại Prisma Client (chỉ cần nếu schema.prisma thay đổi)
npm run db:generate

# 4. Cập nhật database schema (chỉ cần nếu schema.prisma thay đổi)
npm run db:push

# 5. Cập nhật seed data (xoá member cũ + profile rác, nếu seed.ts thay đổi)
npm run db:seed

# 6. Xoá build cache cũ + Build lại
rm -rf .next
npm run build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/

# 7. Restart để áp dụng
pm2 restart nikke-raid
```

> [!NOTE]
> Nếu chỉ update code thông thường (không đụng Prisma schema hay seed data), có thể bỏ qua bước 3, 4, 5. Minimum: `git pull` → `rm -rf .next` → `npm run build` → copy files → `pm2 restart`.

---

## 🛑 Quy Trình "Đóng Cửa" Sau Khi Kết Thúc Mùa Raid

Để tiết kiệm chi phí thuê VPS theo giờ, ngay khi Raid kết thúc, Leader cần thực hiện 2 bước để cất giữ dữ liệu và huỷ VPS.

### Bước 1: Backup Database

Toàn bộ dữ liệu (Profiles, Members, Assignments...) nằm gọn trong **1 file duy nhất**: `/var/www/nikke-raid/data/prod.db`

```bash
# Tạo bản backup theo ngày (phòng khi file bị lỗi khi upload lên VPS mới)
cp /var/www/nikke-raid/data/prod.db /var/www/nikke-raid/data/prod.backup.$(date +%Y%m%d).db

# Kiểm tra dung lượng
ls -lh /var/www/nikke-raid/data/
```

Sau đó dùng **WinSCP**, **FileZilla** hoặc lệnh `scp` để tải file `prod.db` về máy tính và lưu cẩn thận. Mùa sau khi tạo VPS mới, upload file này ở Giai Đoạn 2 (bước 3).

### Bước 2: Huỷ Máy Chủ (Destroy Machine)

Sau khi **đã xác nhận tải file `prod.db` về máy tính thành công**, lên trang quản trị của nhà cung cấp VPS và bấm nút **Huỷ / Destroy VPS**. Toàn bộ cước phí sẽ dừng thu ngay lập tức.

> [!TIP]
> Nếu đang dùng tên miền riêng, hãy xoá bản ghi A trong DNS sau khi huỷ VPS để tránh trỏ vào IP chết. Mùa sau khi tạo VPS mới (IP mới), chỉ cần cập nhật lại bản ghi A.

> [!NOTE]
> Mẹo nhỏ: VPS sống kiểu "phù du" (chỉ vài ngày mỗi mùa Raid) thì rủi ro bảo mật thấp. Một số nhà cung cấp cho thiết lập mật khẩu `root` trực tiếp thay vì dùng SSH Key. Đặt mật khẩu đủ mạnh để dùng **WinSCP/FileZilla** truyền file SQLite nhanh chóng.

---

## Thông Tin Kỹ Thuật Bổ Sung

### Stack Công Nghệ

| Layer | Công nghệ | Ghi chú |
|-------|-----------|---------|
| **Framework** | Next.js 16 (App Router) | `output: "standalone"` |
| **Runtime** | Node.js 20 | Server-side rendering |
| **Database** | SQLite via Prisma v7 + `better-sqlite3` | Single-file DB |
| **ORM** | Prisma với `@prisma/adapter-better-sqlite3` | Driver adapter pattern |
| **ILP Solver** | GLPK.js (WASM, server-side) | `serverExternalPackages` trong next.config |
| **Styling** | Vanilla CSS (dark theme) | Google Fonts: Inter, Outfit |
| **Auth** | HMAC-SHA256 signed cookies | `httpOnly`, `secure` in prod |

### Cấu Trúc Thư Mục Quan Trọng

```
/var/www/nikke-raid/
├── .env                    # Biến môi trường (DATABASE_URL, ADMIN_PASSWORD)
├── data/
│   └── prod.db             # ← FILE DUY NHẤT CẦN BACKUP!
├── prisma/
│   ├── schema.prisma       # Định nghĩa database schema
│   ├── seed.ts             # Script nạp dữ liệu ban đầu
│   └── seed-data/          # Dữ liệu seed (tách riêng khỏi logic)
│       ├── members.ts      # Danh sách thành viên (tuỳ chỉnh)
│       ├── bosses.ts       # Cấu hình boss
│       └── profiles.ts     # Ma trận dữ liệu mẫu
│       └── raids.ts        # Cấu hình khởi tạo
└── .next/                  # Build output (tự sinh)
    └── standalone/         # Standalone server
```

### Biến Môi Trường

| Tên | Bắt buộc | Ví dụ | Mô tả |
|-----|----------|-------|-------|
| `DATABASE_URL` | ✅ | `file:/var/www/nikke-raid/data/prod.db` | Đường dẫn SQLite. **Dùng absolute path** cho production. |
| `ADMIN_PASSWORD` | ✅ | `MyStr0ngP@ss!` | Mật khẩu Admin. Server sẽ crash nếu không set. |
| `NODE_ENV` | ⬚ | `production` | Set `production` để enable secure cookies. |
