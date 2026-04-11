# Động cơ Tối ưu (Optimization Engine)

Module xử lý tối ưu hoá cốt lõi của dự án nằm trong thư mục `engine/`. Nhiệm vụ chính là tính toán lịch phân công tối ưu cho một kỳ Union Raid — tối đa hoá tổng sát thương mà không vi phạm luật khoá tướng (character lock).

## 1. Xây dựng Tổ hợp Hợp Lệ (`engine/combo_builder.ts`) 

- Mỗi Member có một danh sách các Mock Battle Profiles (đội hình đánh thử).
- Quy tắc game NIKKE: Thành viên đánh tối đa 3 trận/ngày, và **không được trùng lặp character** trong tổng 15 vị trí ra trận.
- Hàm Builder lấy toàn bộ danh sách profile, chạy thuật toán tổ hợp sinh ra tất cả các "Combo 3 Profile" hợp lệ.
- **Valid Combo**: Tổ hợp 3 Profile mà phép hợp (union) tất cả Character ID cho ra đúng 15 phần tử — tức không có nhân vật nào bị trùng.

## 2. ILP Solver (`engine/ilp_solver.ts`)

Bài toán phân công nhân sự dưới ràng buộc được mô hình hoá dưới dạng Integer Linear Programming (ILP).

- Sử dụng thư viện `glpk.js` (GNU Linear Programming Kit biên dịch sang WebAssembly) chạy server-side.
- Nhận dữ liệu từ Combo Builder, thiết lập hàm mục tiêu: **Maximize tổng Effective Damage**.
- **Ràng Buộc**: 
  - Mỗi User chỉ được tham chiến 1 Combo.
  - Tổng số thiệt hại trên Boss $j$ không được vượt ngưỡng (HP Level của con Boss đó quá đà dẫn đến lãng phí sát thương - Cân nhắc HP cấp độ 1,2,3).
  - Level Gate: không được gây damage lên boss Level N+1 nếu Level N chưa clear.
- Đầu ra là ma trận nhị phân (Binary Variable Matrix) xác định: mỗi thành viên đánh boss nào, ở cấp độ HP nào (`level1, level2, level3`), và thứ tự thực hiện (Execution Order).

- **Cơ chế Retry:** ILP solver retry tối đa 3 lần với timeout tăng dần (30s → 60s → 120s). Giữa mỗi lần retry, WASM singleton được reset để phòng WASM bị corrupt.

> [!IMPORTANT]
> Cần lưu ý khi chỉnh sửa tham số ràng buộc (Constraint) trong `ilp_solver.ts`. Một sai sót nhỏ có thể khiến bài toán trở thành Infeasible (vô nghiệm).

> [!NOTE]
> **Ghi chú lịch sử:** Phiên bản đầu tiên (v1) sử dụng HiGHS WASM làm solver và có Greedy fallback. HiGHS bị crash trên model > 1000 binary vars nên đã chuyển sang GLPK.js từ v2.0. Greedy fallback cũng bị loại vì ILP đủ nhanh cho quy mô thực tế (giải trong 1–10 giây).
