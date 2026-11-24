# Mẫu sổ sách của CoS

Năm file CoS giữ trong thư mục của mình. Trước khi Baton chạy được, đây là toàn bộ "hệ điều hành" của bạn; sau khi Baton chạy, `can-chu.md` và `decision-log.md` chuyển dần vào Baton (mục Cần Chủ và Nhật ký quyết định), ba file còn lại vẫn dùng.

Tách mỗi khối dưới đây thành một file riêng.

## `can-chu.md` — việc chỉ chủ quyết hoặc làm được

```
# Cần Chủ

File này chỉ giữ mục ĐANG MỞ. Mỗi mục có một mục cùng số trên Baton.

## Đang mở

### T-<số> (<ngày>) · <dự án> — <việc> (<🔴 gấp | 🟡 trong ngày | ⚪ không gấp>)

**Bối cảnh**
- <đang làm gì, kết quả tới đâu: commit, ticket, test>
- <vì sao cần chủ; các phương án; hậu quả nếu chậm>
- **Đề xuất của CoS: <A>.**

**Việc chủ làm**
1. <một hành động cụ thể: chạy lệnh nào ở đâu, mở trang nào, bấm gì>
2. <…>
3. Trả lời "T-<số>: xong" hoặc "T-<số>: A".

## Đã tự chốt (CoS báo sau, chủ đảo lại được)

| Ngày | Dự án | Đã tự chốt | Nguồn |
|---|---|---|---|
```

## `decision-log.md` — nhật ký quyết định

```
# Decision log

Chỉ thêm dòng mới. Quyết định đổi thì ghi dòng mới trỏ về dòng cũ.

| Lúc | Ai | Dự án | Quyết định | Vì sao | Căn cứ |
|---|---|---|---|---|---|
| <ngày giờ> | <Chủ / CoS / M-Tên> | <MÃ> | <…> | <…> | <T-số, mã ticket, commit, dòng cũ> |
```

## `ban-do-du-an.md` — bản đồ dự án

```
# Bản đồ dự án

Cập nhật: <ngày> · 3 dự án đang đẩy: <A>, <B>, <C>

| Dự án | Mã | Mảng | Trạng thái | Ưu tiên 1–5 | Manager | Thư mục | Khối lớn đang làm (vị trí trên đồi) |
|---|---|---|---|---|---|---|---|
| <tên> | <MÃ> | <mảng> | Đang đẩy / Hàng chờ / Tạm dừng / Duy trì | <n> | M-<Tên> | <đường dẫn> | <03 Giỏ hàng (38)> |

## <Tên dự án>
- **Là gì:** <1–2 câu>
- **Stack:** <…>
- **Đọc trước:** <SPEC, README, CLAUDE.md của repo>
- **Deploy:** <ai chạy, bằng lệnh nào>
- **Cấm riêng:** <…>
- **Thứ tự các khối lớn:** 01 <…> → 02 <…> → …
```

## `loi-da-gap.md` — sổ lỗi

```
# Lỗi đã gặp — không lặp lại

Chỉ thêm, không xoá. CoS đọc file này đầu mỗi phiên.

| # | Ngày | Lỗi | Hậu quả | Luật từ nay |
|---|---|---|---|---|
```

## `cham-agent.md` — chấm agent

```
# Chấm agent

Mỗi lượt Manager một dòng, ghi ngay sau khi merge hoặc trả lại.

| Ngày | Dự án | Lượt (ticket) | Việc | Model | Mức kỹ | Vòng reviewer | CoS kiểm lần đầu | Câu đẩy lên chủ | Chủ sửa đề xuất | Thời gian | Ghi chú |
|---|---|---|---|---|---|---|---|---|---|---|---|

## Sổ góp ý

| Ngày | Chuyện gì xảy ra | Đã sửa gì (prompt, script, luật) |
|---|---|---|
```
