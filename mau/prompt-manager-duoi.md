<!-- Đuôi BẮT BUỘC cho mọi prompt giao Manager. Dán nguyên văn vào cuối prompt, thay <...>. -->

Ticket Baton: <MÃ-số>.

**Mức kỹ: <NHẸ | KỸ>.** Làm theo mức ưu tiên và định nghĩa xong của từng việc: việc không cần làm thì không làm, việc cần kỹ thì phải kỹ.
- **Định nghĩa xong:** <1–3 dòng: chủ thấy hoặc dùng được gì>. **Không làm:** <những gì cố ý bỏ>.
- **NHẸ** (giao diện, sửa lỗi nhỏ, công cụ nội bộ): reviewer **1 vòng**, chỉ trả lại khi có lỗi làm hỏng chức năng hay dữ liệu; góp ý nhỏ ghi "nợ" trong báo cáo, không sửa ngay. Test cho hành vi chính. Báo cáo tối đa 30 dòng.
- **KỸ** (dữ liệu, migration, quyền, bảo mật, tiền, gửi ra ngoài): review tới khi ĐẠT, test đủ ca biên.

Git: `git switch -c`, `git add`, `git commit -m` được phép. **Lệnh nào bị hệ thống chặn thì KHÔNG lách**: không chạy qua script khác, không tạo file chương trình để làm thay, không đổi sang công cụ khác cùng mục đích. Ghi vào báo cáo và bỏ qua bước đó.

Gọi Worker ở chế độ CHỜ KẾT QUẢ. **Không chạy gì ở nền, ở mọi cấp**; chép câu này vào brief của mọi Worker. Worker báo "đang chờ" nghĩa là chưa xong; không kết thúc lượt bằng "đang chờ". Worker bị huỷ thì gọi lại tối đa 3 lần; vẫn huỷ thì tự làm phần nhỏ, ghi rõ "Manager tự làm, Worker bị huỷ". Có câu hỏi thì chọn phương án an toàn hơn, ghi lý do, làm tiếp; không dừng để hỏi.

Lượt cuối phải là reviewer ĐẠT; sửa gì sau đó thì gọi reviewer lại.

Không để lại file tạm trong repo. File tạm bắt buộc phải tạo thì để ngoài repo và ghi đường dẫn vào báo cáo. Trước khi báo xong chạy `git status --short --ignored`; có file lạ thì ghi tên trong báo cáo.

**Chạy test tuần tự:** không cho nhiều Worker chạy bộ test cùng lúc.

Luật môi trường: mỗi lệnh shell là một lệnh đơn; KHÔNG `cd`, KHÔNG pipe, `&&`, heredoc. Không push, merge, deploy, không gọi URL production.

Khi xong: ghi báo cáo NGAY SAU commit vào `bao-cao/<YYYY-MM-DD>.md` (kết quả, commit, kết luận reviewer lượt cuối, build/test/lint, việc CHƯA làm, cần CoS/chủ) và thêm dòng vào `quyet-dinh.md`. Rồi dừng.
