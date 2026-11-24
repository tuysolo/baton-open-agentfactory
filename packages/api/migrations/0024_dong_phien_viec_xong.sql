-- ===================================================================
-- 0024 — đóng các phiên của việc ĐÃ XONG (dữ liệu cũ)
-- SPEC mục 6 d.181; `cau-hoi-spec.md` #141
-- ===================================================================
--
-- ## Lỗi thật chủ thấy trên bản live 14/10
--
-- Tổng quan và "Cần chú ý" hiện "phiên Đứng" cho BAT-3, BAT-4, BAT-5, BAT-6 và
-- SAI-1 — những việc đã sang Chờ kiểm chứng hoặc Xong từ lâu. Nguyên nhân: mục 6
-- trước đây chỉ đóng phiên khi **chính lượt ấy nộp báo cáo**, nên một ticket được
-- chủ kéo sang Xong (hoặc một agent chết giữa chừng rồi việc được làm xong theo
-- đường khác) để lại một phiên mở, và sau 30 phút nó thành `stalled`.
--
-- SPEC mục 6 d.181 nay nói thẳng cả hai nửa: phiên đóng khi lượt của nó nộp báo
-- cáo, **và** khi ticket của lượt đó sang Chờ kiểm chứng hoặc Xong — kể cả khi
-- phiên đang `stalled` hoặc `error`. Đường ghi đã được sửa cho khớp
-- (`cauLenhDongPhienNeuViecXong` trong `packages/api/src/lenh-trang-thai.ts`);
-- đường đọc không lọc thêm gì. Migration này dọn **dữ liệu đã có**: mã mới không
-- bao giờ chạy lại cho các dòng cũ.
--
-- Ngoại lệ: phiên của lượt `review` trên ticket `verifying` được GIỮ (reviewer
-- đang kiểm chứng, đường ghi cũng giữ). Ticket `done` thì đóng hết.
--
-- ## Migration này CHỈ ĐÓNG, không xoá dòng nào
--
-- `UPDATE`, không `DELETE`: lịch sử phiên là dấu vết (mục 15 "mọi hành động có dấu
-- vết ai làm"), và xoá dữ liệu nằm trong danh sách cấm của `CLAUDE.md`. Mỗi dòng
-- chỉ nhận ba thứ: `trang_thai = 'closed'`, `dong_luc`, và `ly_do_dong` đúng chữ
-- của d.181.
--
-- ## Vì sao `dong_luc = tin_hieu_cuoi_luc`, không phải "bây giờ"
--
-- Không gọi `unixepoch()`: một mốc "lúc chạy migration" nói rằng phiên đóng hôm
-- nay, trong khi nó đã chết từ nhiều ngày trước, và mọi mốc tương đối của d.412
-- sẽ hiện "vài giây trước" cho một việc cũ. `tin_hieu_cuoi_luc` là **mốc cuối
-- cùng phiên ấy còn sống thật**, nên nó là mốc đúng nhất còn lại trong dữ liệu —
-- và nó cũng làm migration **xác định** (chạy hai lần cho cùng kết quả).
--
-- `CHECK ((trang_thai = 'closed') = (dong_luc IS NOT NULL))` của 0006 vì thế được
-- thoả: `tin_hieu_cuoi_luc` là `NOT NULL`.
--
-- Điều kiện `trang_thai <> 'closed'` là bắt buộc, không phải cho gọn: trigger
-- `tg_phien_dong_la_vinh_vien` của 0006 chặn mọi lần sửa một phiên đã đóng.

UPDATE phien
   SET trang_thai = 'closed',
       dong_luc = tin_hieu_cuoi_luc,
       ly_do_dong = 'việc đã xong',
       cap_nhat_luc = tin_hieu_cuoi_luc
 WHERE trang_thai <> 'closed'
   AND ticket_id IN (
     SELECT id FROM ticket WHERE trang_thai IN ('verifying', 'done')
   )
   AND NOT (
     luot_giao_id IN (SELECT id FROM luot_giao WHERE loai = 'review')
     AND ticket_id IN (SELECT id FROM ticket WHERE trang_thai = 'verifying')
   );
