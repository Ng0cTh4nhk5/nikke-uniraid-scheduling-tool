# Giả định và Hạn chế của Hệ thống



Tài liệu này tổng hợp toàn bộ các **giả định được chấp nhận có chủ đích** và **hạn chế kỹ thuật còn tồn đọng** trong hệ thống. Mục đích là giúp Union Leader và developer hiểu rõ phạm vi tin cậy của kết quả từ tool, và biết những gì tool **không** xử lý được.

---

## Phần 1 — Giả định được chấp nhận (Accepted Assumptions)

Đây là những điều hệ thống **coi là đúng** mà không kiểm chứng được, được chấp nhận vì lý do thực tế hoặc kỹ thuật.

### A1 — Damage mock battle phản ánh chính xác damage thật

| | |
|---|---|
| **Giả định** | Kết quả damage từ mock battle là chính xác và nhất quán. Team đã dùng trong mock battle sẽ gây cùng lượng damage trong trận đánh thật. |

### A2 — Damage đồng nhất qua các level

| | |
|---|---|
| **Giả định** | Một đội hình gây cùng lượng damage bất kể đánh boss ở Level 1, 2, hay 3. Chỉ HP boss là khác nhau. |

### A3 — Tất cả thành viên thực hiện đúng lịch phân công

| | |
|---|---|
| **Giả định** | Sau khi lịch phân công được phát đi, mọi thành viên đều đánh đúng boss, đúng đội hình, đúng thứ tự. |

### A4 — Thứ tự thực hiện lượt trong ngày không được tối ưu hoá

| | |
|---|---|
| **Giả định** | 24 giờ Hard Mode là đủ để tất cả thành viên hoàn thành lượt của mình. Tool không cần lập lịch theo giờ cụ thể. |
| **Trạng thái** | ⚠️ `execOrder` trong `AssignmentEntry` được thiết kế để chứa thứ tự thực hiện, nhưng **chưa được engine tính tự động** (hiện set null). |

### A5 — Profile Level 2, 3 được nộp trong Hard Mode

| | |
|---|---|
| **Giả định** | Member chỉ có thể mock battle Level N sau khi Level N được unlock trong Hard Mode. Vì vậy, dữ liệu cho Level 2/3 thường được nộp sau khi Hard Mode đã mở. |

### A6 — Damage dưới ngưỡng MAX_SAFE_INTEGER

| | |
|---|---|
| **Giả định** | Tất cả giá trị damage đều nhỏ hơn `Number.MAX_SAFE_INTEGER` ≈ 9×10¹⁵. |

---

## Phần 2 — Hạn chế kỹ thuật (Technical Limitations)

Đây là những vấn đề **biết rõ** nhưng chấp nhận do đánh đổi hiệu năng / độ phức tạp.

### L1 — Top-K Pruning có thể bỏ sót combo tối ưu

| | |
|---|---|
| **Mô tả** | Combo Builder chỉ giữ lại **3 profile tốt nhất** cho mỗi cặp (member, boss). Các profile có damage thấp hơn bị loại. |
| **Hệ quả** | Một profile "yếu" (damage thấp cho boss X) nhưng dùng đội hình không trùng với 2 profile còn lại, có thể tạo ra combo tổng tốt hơn — nhưng sẽ bị bỏ qua. |
| **Trade-off** | Nếu giữ lại nhiều hơn (topK > 3), số combo tăng theo lũy thừa, ILP model phình to → solver chậm hơn. K=3 là cân bằng thực tế. |
| **Có thể điều chỉnh** | ✅ Có — tham số `topK` trong `engine/combo_builder.ts`. |

### L2 — Combo cap 500 không đảm bảo tối ưu tuyệt đối

| | |
|---|---|
| **Mô tả** | Mỗi member tối đa 500 combo được đưa vào ILP. Combo thứ 501 trở đi bị loại (sau khi sắp xếp theo rawDamage giảm dần). |
| **Hệ quả** | Một combo bị cắt có thể, trong một số trường hợp đặc biệt, là combo tối ưu cho bài toán tổng thể của Union. |
| **Trade-off** | Cap cao hơn → ILP model lớn hơn → solve chậm hơn, risk timeout. 500 là đủ cho hầu hết trường hợp thực tế. |
| **Có thể điều chỉnh** | ✅ Có — tham số `MAX_COMBOS_PER_MEMBER` trong `engine/combo_builder.ts`. |

### L3 — MIP Gap 0.5% — không luôn đạt tối ưu tuyệt đối

| | |
|---|---|
| **Mô tả** | GLPK được cấu hình chấp nhận lời giải nếu **MIP gap ≤ 0.5%** so với optimal lý thuyết. |
| **Hệ quả** | Trong trường hợp hiếm, solver có thể dừng sớm với lời giải kém hơn optimal thực sự tới 0.5%. |
| **Trade-off** | mipgap = 0 (exact optimal) sẽ làm solver chạy lâu hơn đáng kể. 0.5% là không đáng kể trong thực tế (vài trăm ngàn cho tổng damage hàng nghìn tỷ). |
| **Có thể điều chỉnh** | ✅ Có — tham số `mipgap` trong `engine/ilp_solver.ts`. |

### L4 — Numerical Scaling giảm nhưng không loại bỏ hoàn toàn sai số

| | |
|---|---|
| **Mô tả** | Engine chia tất cả damage và HP cho `SCALE = 1,000,000` trước khi đưa vào GLPK để tránh bất ổn số khi hệ số ở mức 10¹⁰~10¹². |
| **Hệ quả** | Phép chia integer → floating point có thể gây sai số nhỏ. Với GLPK float64, sai số này ở mức 10⁻⁷ ~ 10⁻⁹, hoàn toàn chấp nhận được. |
| **Rủi ro** | Nếu damage trong game tăng thêm vài bậc (10¹⁵+), cần tăng SCALE hoặc dùng solver khác hỗ trợ tốt hơn. |

### L5 — Feasibility Analysis (Pha 0) là ước tính lạc quan

| | |
|---|---|
| **Mô tả** | Pha 0 tính tổng max damage mỗi boss = cộng best damage của từng member, **không xét ràng buộc nhân vật trùng lặp**. |
| **Hệ quả** | `deepest` có thể bị ước tính cao hơn thực tế. Ví dụ: Union ước tính clear được L2, nhưng sau khi xét character lock thực tế thì không đủ damage để kill hết L2. |
| **Xử lý hiện tại** | Pha 2 (ILP) với Level Gate constraint sẽ tự điều chỉnh — nếu không đủ để clear L2, solver không mở gate. Warning được sinh ở Pha 3. |
| **Hạn chế còn lại** | Pha 0 có thể đưa profiles của L3 vào combo builder một cách không cần thiết (nếu thực tế không clear được L2), làm ILP model lớn hơn cần thiết. |

### L6 — execOrder chưa được tính tự động

| | |
|---|---|
| **Mô tả** | Field `execOrder1/2/3` trong `AssignmentEntry` được thiết kế để lưu thứ tự sóng thực hiện (Wave 1: đánh khi mở Hard Mode; Wave 2: chờ L1 clear xong). |
| **Trạng thái hiện tại** | Engine **không tính tự động** — field được set `null` trong tất cả trường hợp. Admin phải điều chỉnh tay sau khi optimizer chạy. |
| **Tác động** | UI hiển thị thứ tự không xác định. Leader phải tự suy luận ai nên đánh trước dựa trên combo được phân công. |

### L7 — Không tối ưu cho Finisher và Cleaner

| | |
|---|---|
| **Mô tả** | Chỉ thành viên vai trò `regular` được đưa vào ILP optimizer. `finisher` và `cleaner` bị loại khỏi engine. |
| **Lý do** | Finisher/cleaner thường được Union Leader giữ riêng để xử lý tình huống đặc biệt (kết liễu boss HP thấp, dọn dẹp boss bị bỏ sót). Không thể mô hình hoá tình huống này trong ILP chung. |
| **Tác động** | Leader phải phân công tay cho finisher/cleaner sau khi optimizer chạy. Tool hiện không hỗ trợ workflow này một cách chính thức. |

---

## Phần 3 — Ngoài phạm vi (Out of Scope)

Những tính năng sau **không thuộc phạm vi** của tool và sẽ không được phát triển trừ khi có quyết định thay đổi kiến trúc:

| # | Không bao gồm | Lý do |
|---|---------------|-------|
| S1 | **Tính damage lý thuyết** (damage simulation từ build nhân vật) | Quá phức tạp, phụ thuộc nhiều biến ngoài game (OL gear, cube, skill level...) |
| S2 | **Gợi ý đội hình** (team composition recommendation) | Đòi hỏi AI/ML hoặc knowledge base về meta game — vượt scope hiện tại |
| S3 | **Tích hợp API game** (live data từ server NIKKE) | API game không public, không có cơ chế chính thức để đọc dữ liệu thực |
| S4 | **Quản lý Normal Mode** | Normal Mode không có bài toán tối ưu phức tạp — không cần tool hỗ trợ |
| S5 | **Tối ưu Level 4** (boss HP vô tận) | Không có HP cap → không có overkill → bài toán khác hoàn toàn |
| S6 | **Multi-Union / Multi-Raid cùng lúc** | Thiết kế hiện tại chỉ phục vụ 1 Union trên 1 instance |
| S7 | **Thời gian thực (real-time sync)** | Không có WebSocket hay polling — data chỉ cập nhật khi user action |

---

## Phần 4 — Rủi ro vận hành (Operational Risks)

| # | Rủi ro | Xác suất | Tác động | Xử lý hiện tại |
|---|--------|-----------|----------|----------------|
| R1 | Thành viên nộp sai damage (typo, nhầm đơn vị) | Trung bình | Cao — phân công sai | Leader review thủ công profile trước khi optimize |
| R2 | Thành viên không online trong Hard Mode | Thấp–Trung bình | Trung bình — thiếu damage | Lịch phân công không tự điều chỉnh, Leader phải xử lý tay |
| R3 | GLPK WASM timeout (model quá lớn) | Thấp | Cao — không có kết quả | Retry tự động 3 lần (30s → 60s → 120s). Nếu vẫn fail: giảm topK hoặc MAX_COMBOS |
| R4 | Boss HP thay đổi giữa mock battle và Hard Mode | Rất thấp | Cao — toàn bộ tính toán sai | Không có cơ chế phát hiện. Leader phải cập nhật HP thủ công trước khi optimize |
| R5 | VPS hết RAM trong khi build | Trung bình (với VPS 1GB) | Trung bình — build fail | Hướng dẫn tạo swap 2GB tạm thời trong tài liệu deploy |

---

## Phần 5 — Bảng tóm tắt

| ID | Loại | Vấn đề | Mức độ ảnh hưởng | Có thể khắc phục? |
|----|------|---------|-------------------|-------------------|
| A1 | Giả định | Damage mock = damage thật | Cao | ❌ Phụ thuộc game mechanic |
| A2 | Giả định | Damage đồng nhất qua level | Trung bình | ⚠️ Cần verify nếu game update |
| A3 | Giả định | Thành viên thực hiện đúng | Cao | ❌ Không kiểm soát được |
| A4 | Giả định | 24h đủ cho mọi người | Thấp | ❌ Giả định hợp lý |
| A5 | Giả định | Profile L2/L3 nộp muộn | Trung bình | ⚠️ Workflow issue |
| A6 | Giả định | Damage < MAX_SAFE_INTEGER | Thấp | ✅ Đã validate |
| L1 | Hạn chế kỹ thuật | Top-K pruning bỏ sót combo | Thấp | ✅ Tăng topK nếu cần |
| L2 | Hạn chế kỹ thuật | Combo cap 500 | Thấp | ✅ Tăng cap nếu cần |
| L3 | Hạn chế kỹ thuật | MIP gap 0.5% | Rất thấp | ✅ Giảm mipgap nếu cần |
| L4 | Hạn chế kỹ thuật | Numerical scaling sai số nhỏ | Rất thấp | ✅ Tăng SCALE nếu cần |
| L5 | Hạn chế kỹ thuật | Pha 0 ước tính lạc quan | Thấp | ⚠️ ILP tự bù đắp một phần |
| L6 | Hạn chế kỹ thuật | execOrder chưa tự động | Trung bình | 🔧 **Cần implement** |
| L7 | Hạn chế kỹ thuật | Finisher/cleaner manual | Thấp | ⚠️ Design decision |
| S1–S7 | Ngoài phạm vi | Các tính năng không thuộc scope | N/A | ❌ Ngoài phạm vi |
| R1–R5 | Rủi ro vận hành | Các tình huống ngoại lệ | Trung bình | ⚠️ Xử lý bằng quy trình |

---

> **Chú thích ký hiệu:**
> - ✅ Đã xử lý / có thể điều chỉnh dễ dàng
> - ⚠️ Xử lý một phần / cần theo dõi
> - 🔧 Biết rõ, cần implement trong tương lai
> - ❌ Không thể / ngoài phạm vi kiểm soát
