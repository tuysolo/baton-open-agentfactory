# Baton: danh sách việc v0.1

Chỉ đọc `SPEC.md` trong thư mục này (và `mau-nhap/` khi làm phần 8). Build theo thứ tự; mỗi phần xong phải có test tự động cho các luật trong SPEC, rồi mới sang phần sau.

1. **Phần 1 · Lõi dữ liệu + API:**
   - Workspace, dự án, agent (token băm, vai trò, bảng quyền mục 3), ticket.
   - 7 trạng thái cùng luật chuyển (mục 4), lịch sử, bình luận, mã lỗi và HTTP (mục 13).
   - Test: mỗi luật chuyển trạng thái, mỗi ô trong bảng quyền.
2. **Phần 2 · Lượt giao + phiên + nhịp tim** (mục 5, 6):
   - Nhận, nộp báo cáo, nghiệm thu, dừng, ngưỡng đứng, chờ dài.
   - Ticket điều phối nối với ticket dự án.
3. **Phần 3 · Bằng chứng + cổng Xong** (mục 7):
   - Xác minh commit merged/pushed qua GitHub, xác minh deploy, review.
   - Thử lại, tự lên Xong, dự án không code.
4. **Phần 4 · Cần Chủ + Nhật ký quyết định** (mục 8, 10):
   - Đủ 4 loại mục.
   - Xử lý mục thì tự ghi Nhật ký, tự bình luận, và trả kết quả về cho agent.
5. **Phần 5 · CLI `baton` + MCP server** (mục 13):
   - Đủ các lệnh, `--json`, mã thoát 0/1/2/3/4.
6. **Phần 6 · Giao diện web** (mục 11, 14):
   - Đăng nhập (mật khẩu + TOTP), sidebar, Tổng quan, Cần Chủ (nút chọn phương án + Gửi, agent nhận kết quả ≤ 3 giây, phiên duyệt, ô trả lời hàng loạt).
   - Danh sách, bảng, chi tiết ticket kèm chuỗi lượt giao, trang agent, Bản đồ và hồ sơ dự án, Nhật ký.
   - Cập nhật lạc quan, phím tắt, bản điện thoại.
7. **Phần 7 · Thông báo Telegram + báo cáo sáng/tối** (mục 11, 12), giờ yên lặng.
8. **Phần 8 · Nhập dữ liệu** (mục 16), sao lưu và xuất (mục 15).
9. **Phần 9 · Nghiệm thu:** chạy đủ 11 bước "Định nghĩa xong" (mục 17). Ghi kết quả từng bước.

**Lựa chọn kỹ thuật** (ngôn ngữ, DB, nơi chạy) do phiên build đề xuất rồi hỏi chủ. Không hỏi lại về hành vi; thiếu hành vi thì ghi vào `cau-hoi-spec.md` để quay lại phiên spec.
