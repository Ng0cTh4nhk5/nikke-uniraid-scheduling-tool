# Tài liệu Ngữ Cảnh Đề Bài (Business Context)

---

## 1. Giới thiệu tổng quan (Overview)

**NIKKE: Goddess of Victory** là một tựa game mobile/PC thuộc thể loại RPG bắn súng. Trong game tồn tại một tính năng cộng đồng gọi là **Union Raid** — một chế độ thi đấu theo nhóm (gọi là *Union*, tương đương *Guild*), nơi các thành viên phối hợp để gây ra nhiều sát thương nhất có thể lên các boss trong thời gian nhất định.

Thứ hạng của Union được xác định theo **hai tiêu chí ưu tiên lần lượt**:
1. **Ngày hoàn thành Normal Mode** (sớm hơn → hạng cao hơn, bất kể sát thương Hard Mode)
2. **Tổng sát thương gây ra ở Hard Mode** (áp dụng để phân định các Union cùng ngày clear Normal)

Tài liệu này tập trung phân tích ngữ cảnh bài toán liên quan đến **Hard Mode** — giai đoạn quyết định thứ hạng cuối cùng giữa các Union có cùng tốc độ clear Normal.

---

## 2. Mô tả chi tiết cơ chế Hard Mode

### 2.1 Điều kiện mở khoá
- Hard Mode được mở khoá **vào ngày hôm sau** sau khi Union hoàn thành Normal Mode.
- Hard Mode chỉ **kéo dài 24 giờ**, sau đó bị khoá vĩnh viễn.

### 2.2 Cấu trúc Boss
Hard Mode gồm **4 Level** với tổng số boss như sau:

| Level | Số Boss | HP Boss         | Ghi chú                         |
|-------|---------|-----------------|----------------------------------|
| 1     | 5       | Giới hạn (hữu hạn)  | Phải kill hết để mở Level 2    |
| 2     | 5       | Giới hạn (hữu hạn)  | Phải kill hết để mở Level 3    |
| 3     | 5       | Giới hạn (hữu hạn)  | Phải kill hết để mở Level 4    |
| 4     | 1       | **Vô tận**          | Boss cuối — Damage race         |

> **Tổng cộng:** 16 boss (15 HP hữu hạn + 1 HP vô tận). **Phạm vi tool:** chỉ tối ưu 15 boss L1–L3, vì Union hiện tại chưa đủ lực mở Level 4.

### 2.3 Quy tắc tiến trình (Level Progression)
- **5 boss trong cùng 1 level:** Có thể tấn công **song song, không cần thứ tự** — mọi thành viên đều có thể đánh bất kỳ boss nào trong level đó cùng lúc.
- **Giữa các Level:** Bắt buộc phải **kill hết toàn bộ 5 boss** ở Level N trước khi bất kỳ thành viên nào được phép tấn công Level N+1.

### 2.4 Cơ chế lượt đánh của thành viên
- Mỗi thành viên có **3 lượt/ngày**.
- Mỗi lượt: chọn một đội **5 nhân vật** để tấn công một boss.
- Nhân vật đã sử dụng ở lượt trước bị **khoá** — không thể dùng lại ở lượt tiếp theo trong cùng ngày đó.
- Giới hạn nhân vật khoá là **per-member** (mỗi người quản lý riêng danh sách nhân vật của mình, không ảnh hưởng đến người khác).
- Với Hard Mode chỉ kéo dài 1 ngày, mỗi thành viên thực tế chỉ có tối đa **3 lượt** để thi đấu.

### 2.5 Cơ chế tính sát thương (Damage Counting)
- Damage tính vào ranking chỉ là **HP thực sự bị giảm** của boss.
- **Overkill không được tính:** Nếu một đội đánh vào boss còn 1,000 HP nhưng gây 50,000 sát thương, chỉ có **1,000 damage** được ghi nhận vào tổng điểm.

### 2.6 Cơ chế Mock Battle (Thử nghiệm sát thương)
- Khi đang ở một level nào đó (chờ Hard Mode mở, hoặc đang trong Hard Mode), thành viên có thể thực hiện **mock battle** — tức là đánh thử các boss của level hiện tại.
- Mock battle **không tiêu tốn lượt chính thức**, có thể thực hiện **không giới hạn lần**.
- Kết quả mock battle **hiển thị đầy đủ, chính xác như trận đánh thật** — bao gồm tổng sát thương gây ra cho boss.
- **Ứng dụng thực tế:**
  - Trong khoảng thời gian chờ Hard Mode khai mạc (sau khi clear Normal), toàn bộ thành viên có thể mock battle các boss Level 1.
  - Leader thu thập số liệu damage của từng thành viên để lập kế hoạch phân công trước khi giờ G bắt đầu.

---

## 3. Vấn đề hiện tại (Pain Points)

Mục tiêu của Union trong Hard Mode là **tối đa hoá tổng sát thương gây ra trong 24 giờ**.

Tuy nhiên, bài toán phân bổ lượt đánh tốt nhất cho 32 thành viên là **vô cùng phức tạp khi làm thủ công**, bởi vì:

### 3.1 Thu thập dữ liệu mock battle thủ công tốn công sức
Dù mock battle cung cấp dữ liệu damage chính xác, việc **thu thập kết quả từ 32 thành viên** (mỗi người mock nhiều boss với nhiều đội hình khác nhau) và **tổng hợp thủ công** (qua chat, spreadsheet...) là quy trình chậm, dễ sai sót, và khó đồng bộ.

### 3.2 Ràng buộc Overkill gây lãng phí lượt đánh
Vì overkill damage bị bỏ phí, cần phân công số lượt đánh vào mỗi boss **vừa đủ để kill** — không nhiều hơn, không ít hơn. Nếu cử quá nhiều người đánh cùng 1 boss, phần sát thương dư sẽ **mất trắng**, không được tính vào tổng điểm.

### 3.3 Ràng buộc tiến trình level tạo ra sự phụ thuộc theo thứ tự
Thành viên muốn đánh boss Level 2 phải chờ Level 1 được clear hoàn toàn. Điều này tạo ra bài toán **lập lịch theo thứ tự** (sequenced scheduling): cần biết ai nên đánh Level 1 trước để mở khoá, ai nên "giữ lượt" chờ Level 2 — và tất cả phải được quyết định **trước khi Hard Mode bắt đầu**.

### 3.4 Mỗi thành viên chỉ có 3 lượt (nguồn lực hữu hạn)
Với tổng **32 × 3 = 96 lượt** của cả Union, quyết định phân bổ lượt nào vào boss nào là bài toán **tối ưu hoá nguồn lực** có giới hạn rõ ràng.

### 3.5 Không phải Union nào cũng đến được Level 4
Về lý thuyết, boss Level 4 (HP vô tận) là "sink" lý tưởng cho lượt dư. Tuy nhiên, **với thực tế Union hiện tại, việc clear hết 15 boss L1–L3 trong 24h là chưa khả thi**. Do đó, bài toán tối ưu tập trung vào 3 level đầu: phân bổ lượt sao cho tổng effective damage trên 15 boss là cao nhất, kill được càng nhiều boss càng tốt để mở level tiếp theo.

---

## 4. Mục tiêu giải quyết (Objectives)

Xây dựng công cụ **NIKKE UniRaid Calculator** nhằm hỗ trợ Union Leader thực hiện quy trình 3 giai đoạn sau:

**Giai đoạn 1 — Thu thập dữ liệu (Trước khi Hard Mode mở):**
- Từng thành viên mock battle và submit **profile**: gồm boss mục tiêu, 5 nhân vật sử dụng, và damage gây ra.
- Hỗ trợ nhập nhiều profile cho cùng 1 boss (nhiều đội hình).

**Giai đoạn 2 — Tính toán & Lập lịch:**
1. **Xây dựng combo hợp lệ** — tổ hợp 3 profile/member không gối nhân vật.
2. **Tối thiểu hoá lãng phí do overkill** — phân bổ đúng số lượt vào từng boss.
3. **Tối đa hoá tổng effective damage** trên 15 boss L1–L3.
4. Xuất ra **lịch phân công cụ thể**: thành viên nào, đánh boss nào, dùng đội hình nào.

**Giai đoạn 3 — Truyền đạt:**
- Cung cấp kết quả dưới dạng **dễ đọc, dễ copy và chia sẻ** trong chat nội bộ Union.

---

## 5. Đối tượng tác động (Stakeholders / Target Users)

| Vai trò               | Mô tả                                                                 |
|-----------------------|----------------------------------------------------------------------|
| **Union Leader / Officer** | Người sử dụng công cụ trực tiếp. Chịu trách nhiệm lập kế hoạch và phân công lượt đánh cho cả Union. |
| **Thành viên Union**  | Người thực thi theo lịch phân công. Không cần dùng công cụ nhưng là đối tượng hưởng lợi gián tiếp. |

---

## 6. Giới hạn phạm vi (Out of Scope)

Công cụ **không** bao gồm:
- Tính toán sát thương lý thuyết dựa trên build nhân vật (damage simulation).
- Tư vấn đội hình (team composition recommendation).
- Tích hợp với dữ liệu game thực tế (API game không public).
- Quản lý Normal Mode.
