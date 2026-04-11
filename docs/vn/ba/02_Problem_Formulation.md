# Tài liệu Khái quát hoá Bài toán (Problem Formulation)

---

## 1. Phát biểu bài toán (Problem Statement)

> Cho trước dữ liệu sát thương của từng thành viên (thu thập qua mock battle), hãy lập một lịch phân công lượt đánh cho toàn Union sao cho **tổng sát thương hiệu quả gây ra trong Hard Mode là lớn nhất**.

---

## 2. Các khái niệm & Ký hiệu (Definitions & Notation)

### 2.1 Thực thể

| Ký hiệu | Tên | Mô tả |
|---------|-----|-------|
| $M$ | Tập thành viên | $M = \{m_1, m_2, \ldots, m_{32}\}$, tối đa 32 thành viên |
| $B$ | Tập boss | 16 boss: Level 1–3 (5 boss/level, HP hữu hạn) + Level 4 (1 boss, HP vô tận) |
| $B_{fin}$ | Tập boss đang phân tích | Giới hạn phạm vi: **chỉ gồm 15 boss của Level 1, 2, 3** |
| $HP(b)$ | HP của boss $b$ | Cho trước, cố định với mỗi boss $b \in B_{fin}$ |
| $T(m)$ | Tập lượt của $m$ | Mỗi thành viên có tối đa 3 lượt: $T(m) = \{t_1, t_2, t_3\}$ |
| $elem(b)$ | Hệ của boss | Mỗi boss thuộc 1 trong 5 hệ khác nhau trong cùng 1 level |
| $P$ | Tập profile | Mỗi profile là 1 kết quả mock battle cụ thể (xem mục 2.2) |
| $P(m)$ | Profile của thành viên $m$ | Tập profile mà thành viên $m$ đã submit |
| $C(m)$ | Tập combo hợp lệ của $m$ | Tập tất cả combo hợp lệ có thể tạo từ $P(m)$ (xem mục 2.2) |

### 2.2 Mô hình Profile và Combo

#### Profile
Mỗi lần thành viên mock battle, họ submit một **profile** gồm:

$$p = (m,\ b,\ \text{chars}_p,\ dmg_p)$$

**Diễn giải:** Mỗi profile là một "bản ghi kết quả mock battle", cho biết: **ai** đánh ($m$), đánh **boss nào** ($b$), dùng **đội hình nào** (5 nhân vật $\text{chars}_p$), và gây ra **bao nhiêu damage** ($dmg_p$).

| Trường | Mô tả |
|--------|---------|
| $m$ | Thành viên thực hiện |
| $b$ | Boss được đánh |
| $\text{chars}_p \subset \text{Characters}$ | Tập nhân vật được dùng (5 nhân vật) |
| $dmg_p$ | Tổng sát thương gây ra trong mock battle đó |

Mỗi thành viên có thể submit **nhiều profile cho cùng 1 boss** (các đội hình khác nhau).

#### Combo
Một **combo** của thành viên $m$ là tập 3 profile $\{p_1, p_2, p_3\} \subset P(m)$ thoả mãn:

1. **3 boss đôi một khác nhau:** $b_{p_1} \neq b_{p_2}$, $b_{p_1} \neq b_{p_3}$, $b_{p_2} \neq b_{p_3}$
2. **Không gối nhân vật:** $\text{chars}_{p_i} \cap \text{chars}_{p_j} = \emptyset \quad \forall i \neq j$

**Diễn giải:** Một combo là bộ 3 kết quả mock mà (1) mỗi lượt nhắm vào 1 boss khác nhau (không cần cùng level), và (2) không có nhân vật nào bị dùng lại giữa 3 lượt đó.

**3 boss trong combo không bắt buộc phải cùng 1 level.** Một combo điển hình sẽ trải đều qua nhiều level (ví dụ `L1-Boss2, L2-Boss4, L3-Boss1`), theo đúng cơ chế cổng level của trò chơi.

Tập toàn bộ combo hợp lệ của thành viên $m$: $C(m) = \{c \mid c \text{ là combo hợp lệ từ } P(m)\}$

> **Khóa thực thi (Execution Order):** Với combo cross-level, thứ tự thực hiện phải tuân theo cổng level: profile nhắm Level $N$ chỉ được dùng sau khi toàn bộ Level $N-1$ đã bị kill. Tool xuất thứ tự này trong lịch phân công.

### 2.3 Biến quyết định

- $y_{m,c} \in \{0, 1\}$ — bằng $1$ nếu thành viên $m$ được phân công thực hiện combo $c \in C(m)$.

**Diễn giải:** Đây là "đáp án" mà tool cần tìm — với mỗi thành viên, chọn đúng **1 combo** trong số các combo hợp lệ của người đó.

### 2.4 Sát thương hiệu quả (Effective Damage)

Sát thương thực sự được tính vào ranking của profile $p$ khi được chọn:

$$\text{eff}(p) = \min\bigl(dmg_p,\ \text{remainingHP}(b_p)\bigr)$$

**Diễn giải:** Damage được tính vào xếp hạng chỉ là phần **thực sự gây hại cho boss** — lấy giá trị nhỏ hơn giữa "damage đội gây ra" và "HP còn lại của boss". Ví dụ: boss còn 100K HP, đội gây 300K damage → chỉ tính 100K, 200K dư bị lãng phí.

> Mọi boss trong phạm vi đều có HP hữu hạn — không có trường hợp damage vô tận.

> **Hệ quả:** Mỗi boss HP hữu hạn chỉ "hấp thụ" đúng `HP(b)` damage. Bất kỳ damage nào vượt quá đều bị **lãng phí (overkill)**.

### 2.5 Cơ chế Hệ Boss (Element System)

**Đặc điểm:**
- 5 boss trong cùng 1 level thuộc **5 hệ khác nhau**.
- Team tối ưu cho mỗi hệ sử dụng bộ nhân vật riêng biệt. **Tuy nhiên**, các team khác hệ **có thể gối nhau** ở một số nhân vật support/buffer quan trọng (dùng được cho nhiều hệ).

**Hệ quả:** Điều này có nghĩa ràng buộc character lock có thể xảy ra ngay cả giữa 2 lượt đánh boss khác hệ. Thiết kế Profile+Combo ở mục 2.2 xử lý chính xác vấn đề này bằng cách validate trực tiếp trên danh sách nhân vật.

---

## 3. Ràng buộc (Constraints)

### C1 — Mỗi thành viên chọn tối đa 1 combo

$$\forall m \in M: \quad \sum_{c \in C(m)} y_{m,c} \leq 1$$

**Diễn giải:** Mỗi thành viên **chọn tối đa 1 combo** (= 3 lượt đánh 3 boss). Solver có thể quyết định không gán combo cho member nào đó nếu tất cả boss accessible đã đủ damage — lúc này member sẽ có combo = null.

> **Lưu ý:** Ràng buộc là $\leq 1$ thay vì $= 1$. Điều này cho phép solver linh hoạt hơn: nếu ép $= 1$, solver phải gán combo dù gây overkill lãng phí.

### C2 — Ràng buộc tiến trình Level (Level Gate)

Không thành viên nào được đánh boss ở Level $N+1$ cho đến khi **tất cả boss Level N đã bị kill**.

Được mô hình hoá bằng **binary gate variables** $g_N \in \{0,1\}$ cho $N \in \{1, 2\}$:

**(C2a) Gate chỉ mở khi kill hết boss Level N:**
$$\forall b \in L_N: \quad g_N \cdot HP(b) \leq \sum_{m,c:\text{profile nhắm }b} y_{m,c} \cdot dmg_{p_b(c)}$$

**(C2b) Damage lên Level N+1 bị giới hạn bởi gate:**
$$\forall b \in L_{N+1}: \quad \sum_{m,c:\text{profile nhắm }b} y_{m,c} \cdot dmg_{p_b(c)} \leq M \cdot g_N$$

Trong đó $M$ = big-M (tổng max damage khả dụng trên boss $b$).

**Diễn giải:** Gate $g_N$ = 1 khi mọi boss Level N đã bị kill (tổng dmg ≥ HP). Khi gate = 0, không ai được gây damage lên bất kỳ boss nào ở Level N+1. Khi gate = 1, ràng buộc C2b tự giải phóng (vì M đủ lớn).

> **So sánh với pre-filtering:** Ngoài level gate constraint trong ILP, engine còn **pre-filter** profiles ở Pha 0 (loại profiles nhắm level > maxAccessibleLevel). Hai cơ chế bổ trợ lẫn nhau: pre-filter giảm kích thước ILP model, level gate constraint đảm bảo chính xác trong solver.

### C3 — Overkill không tính (Damage Cap)

$$\text{TotalEffective}(b) = \min\!\left(\sum_{m,c} y_{m,c} \cdot dmg_{p_b(c)},\ HP(b)\right)$$

**Diễn giải:** Tổng damage tính điểm của boss $b$ = **giá trị nhỏ hơn** giữa "tổng damage mọi người dồn vào boss đó" và "HP của boss". Nếu boss có 500K HP mà cả Union dồn 800K damage vào → chỉ ghi nhận 500K, dư 300K bị mất trắng (overkill). Trong đó $p_b(c)$ là profile nhắm vào boss $b$ trong combo $c$.

### C4 — Combo hợp lệ: không gối nhân vật, 3 boss khác nhau

Điều kiện này được đưa vào **tự động** khi xây dựng $C(m)$ (xem mục 2.2). Mọi combo trong $C(m)$ đều đã thoả mãn:

$$\text{chars}_{p_i} \cap \text{chars}_{p_j} = \emptyset \quad \forall p_i, p_j \in c,\ i \neq j$$

**Diễn giải:** Trong 1 combo, bất kỳ 2 lượt nào cũng **không được dùng chung nhân vật nào**. Ví dụ: nếu lượt 1 dùng "Alice", thì lượt 2 và lượt 3 không được có "Alice" trong đội.

> Character overlap giữa các hệ được **giải quyết hoàn toàn** bằng ràng buộc này — không còn là giới hạn nữa.

---

## 4. Hàm mục tiêu (Objective Function)

**Phạm vi áp dụng:** Chỉ tối ưu trên **15 boss HP hữu hạn** của Level 1, 2, 3. Level 4 nằm ngoài phạm vi.

**Tối đa hoá tổng sát thương hiệu quả:**

$$\max \sum_{b \in B_{fin}} \min\!\left(HP(b),\ \sum_{m,c} y_{m,c} \cdot dmg_{p_b(c)}\right)$$

**Diễn giải:** Tìm cách phân công sao cho **tổng damage được ghi nhận trên cả 15 boss là lớn nhất**. Với mỗi boss, damage ghi nhận không vượt quá HP (overkill bị bỏ). Cộng tất cả lại → đây là con số mà tool cố gắng tối đa hoá.

Hàm mục tiêu này **đúng cho mọi scenario** vì:
- Boss chưa chết: đóng góp đúng phần HP bị giảm (không overkill).
- Boss không tiếp cận được (do cổng level): đóng góp 0 — combo nhắm vào nó bị cấm bởi C2.

### 4.1 Phân tầng ưu tiên thực tế

Hàm mục tiêu trên là phát biểu tổng quát. Trong thực tế, tuỳ vào tổng damage khả dụng của Union, ta rút gọn thành 3 mục tiêu ưu tiên xếp theo thứ tự:

| Ưu tiên | Mục tiêu | Ví dụ |
|---------|---------|-------|
| **1 (cao nhất)** | **Kill đủ** càng nhiều boss càng tốt — kill hết 1 level để mở level tiếp theo | Kill sạch L1 để mở L2 > dùng lượt đánh thêm boss L1 đã chết |
| **2** | **Tối đa effective damage** trên các boss còn lại của level sâu nhất tiếp cận được | Dồn damage vào boss L3 dù không kill hết được |
| **3 (phụ)** | **Tối thiểu hoá overkill** ở các boss đã chết để tiết kiệm lượt | Boss còn 100K HP → gán người gây ~100K chứ không gán người gây 500K |

> **Hệ quả lên thuật toán:** Trước khi chạy ILP solver, engine phải xác định scenario (Pha 0: Union clear được bao nhiêu level) để pre-filter profiles và thiết lập level gate constraints. (Xem `03_Solution_Design.md`.)

---

## 5. Độ phức tạp bài toán (Complexity Note)

Về lý thuyết, đây là bài toán tổ hợp thuộc dạng **NP-hard** (tương tự bin-packing + assignment với ordering constraint). Tuy nhiên, với quy mô thực tế:
- Tối đa **32 thành viên × ~500 combo/member = ~16.000 biến nhị phân**
- **15 EngineBoss** (5 slot × 3 level) + 2 gate variables
- ~50 ràng buộc

→ Quy mô nhỏ — **ILP solver (GLPK.js WASM)** giải chính xác (exact optimal) trong **1–10 giây**. Không cần fallback greedy.

> **Ghi chú lịch sử:** Phiên bản đầu tiên (v1) đề xuất Greedy làm primary solver. Sau khi đánh giá, ILP được chọn làm **phương pháp duy nhất** vì quy mô đủ nhỏ để solver chạy nhanh, và kết quả đảm bảo tối ưu.

---


## 6. Giả định và Giới hạn (Assumptions & Limitations)

| # | Giả định / Giới hạn | Lý do chấp nhận |
|---|---------------------|-----------------|
| A1 | Mỗi profile $p$ có $dmg_p$ cố định — kết quả thực tế của 1 lần mock battle cụ thể | Dữ liệu thực đo, không phải ước lượng |
| A2 | Tất cả thành viên đều online và thực hiện đúng lịch phân công | Tool không kiểm soát được hành vi người dùng |
| A3 | Profile Level 2, 3 được submit sau khi level được mở trong Hard Mode | Mock battle cho phép test level hiện tại |
| A4 | Không tính đến thứ tự thực hiện lượt trong ngày (ai vào trước/sau) | 24h là đủ dài để mọi người hoàn thành lượt |
| A5 | Damage < MAX_SAFE_INTEGER (≈ 9×10^15) | Engine convert BigInt→Number cho solver. Validate trước khi convert. |
