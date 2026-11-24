# Baton Open

**Baton** là nơi điều hành công việc cho **một người chủ cùng một đội agent AI**, trải trên nhiều dự án. Người chủ quyết định và duyệt. Agent nhận việc, làm, chuyền việc cho nhau và nộp bằng chứng. Mọi thứ cần người chủ nằm ở một chỗ duy nhất.

Repo này là bản mở của Baton: **nguyên tắc, đặc tả, mã nguồn tham khảo và cách triển khai**, để bạn tải về và giao cho agent của chính bạn dựng lại một hệ Baton riêng. Nó không kèm dữ liệu, dự án hay nội dung của ai cả.

## Bạn nhận được gì

| Thứ | Ở đâu | Dùng để |
|---|---|---|
| **Nguyên tắc** | [`nguyen-tac/`](nguyen-tac/) | Hiểu vì sao: tổ chức đội agent, luật cho agent, tổ chức dự án, giới hạn 3 dự án đang đẩy, bản đồ cây tròn, bài học vận hành |
| **Đặc tả** | [`SPEC.md`](SPEC.md), [`viec-v0.1.md`](viec-v0.1.md), [`THIET-KE.md`](THIET-KE.md) | Nguồn sự thật về hành vi. Agent của bạn build theo file này |
| **Mã nguồn tham khảo** | [`packages/`](packages/) | Bản Baton v0.1 chạy được: API, CLI, MCP, giao diện web, kèm bộ test |
| **Cách triển khai** | [`TRIEN-KHAI.md`](TRIEN-KHAI.md) | Sổ tay từng bước đưa lên Cloudflare, cho người |
| **Cách agent dùng Baton** | [`HUONG-DAN-AGENT.md`](HUONG-DAN-AGENT.md) | Một trang cho agent: vòng làm việc bằng CLI, mã thoát, các lệnh |
| **Mẫu để chép** | [`mau/`](mau/), [`CLAUDE.md`](CLAUDE.md), [`.claude/agents/`](.claude/agents/) | Luật cho CoS, Manager, Worker; brief; báo cáo; đuôi prompt; script giao việc |
| **Dữ liệu mẫu** | [`mau-nhap/`](mau-nhap/) | Dữ liệu **giả** và mockup bản đồ dự án mở được bằng trình duyệt |

## Bắt đầu

Đọc [`BAT-DAU.md`](BAT-DAU.md). Nó có ba đường đi và câu lệnh để dán cho agent của bạn:

1. **Chỉ lấy cách làm.** Đọc `nguyen-tac/`, chép `mau/`, vận hành đội agent bằng file markdown. Chưa cần chạy phần mềm nào.
2. **Triển khai bản có sẵn.** Giao agent kiểm, bạn làm theo `TRIEN-KHAI.md`.
3. **Dựng lại theo cách của bạn.** Giao agent build từ `SPEC.md` trong phòng sạch, dùng mã ở đây để đối chiếu.

## Năm ý chính

1. **Bốn tầng:** Chủ → CoS (điều phối) → Manager của từng dự án → Worker. Người lập kế hoạch không code; người làm không tự chấm mình.
2. **Xong phải có bằng chứng:** commit đã merge hoặc URL đã chạy thật, cộng review đạt của một agent khác.
3. **Một chỗ duy nhất cho việc cần người chủ,** duyệt theo phiên sáng và tối, mỗi mục đủ bối cảnh để quyết trong một lần đọc.
4. **Tối đa 3 dự án đang đẩy.** Còn lại là hàng chờ hoặc khu vực duy trì.
5. **Bản đồ cây tròn:** người chủ ở tâm, mảng, rồi dự án. Bong bóng to theo ưu tiên, màu theo trạng thái, bấm vào dự án để thấy các khối việc lớn.

## Mã nguồn tham khảo

- **Stack:** TypeScript · Cloudflare Workers + D1 (cơ sở dữ liệu) + Durable Objects + R2 (sao lưu) · React + Vite · vitest.
- **Cần có:** Node 20 trở lên; để triển khai thì cần một tài khoản Cloudflare. Token GitHub (xác minh commit) và bot Telegram (thông báo) là tuỳ chọn.

```
npm ci
npm run build
npm run typecheck
npm run lint
npm test
```

Bộ test gồm khoảng 3.500 ca cho API và 1.400 ca cho giao diện, chạy trên máy, không cần tài khoản nào.

## Điều cần biết trước khi dùng

- **Đây là v0.1, một bản dùng sớm.** Mục "CHƯA CÓ" ở cuối `TRIEN-KHAI.md` liệt kê những gì còn thiếu, trong đó có khôi phục từ bản sao lưu.
- **Một workspace, một người chủ.** Không có team, không phân quyền theo người.
- **Tiếng Việt.** Giao diện, đặc tả, tên biến và tên bảng đều bằng tiếng Việt (không dấu trong mã). Mã trạng thái trong API là tiếng Anh; bảng đối chiếu ở `SPEC.md` mục 0.1.
- **Tên người chủ là "Chủ".** Mục việc cần người chủ gọi là **"Cần Chủ"** (trong mã: `can_chu`). Lúc khởi tạo bạn đặt tên hiển thị của mình qua `ten_chu`.
- **Chú thích trong mã còn nhắc lịch sử build gốc:** các mã như `BAT-16`, `T-131`, "`cau-hoi-spec.md` #116", "`quyet-dinh.md` 05/10" trỏ về ticket và sổ nội bộ không đi kèm repo này. Lý do của từng quyết định đã nằm ngay trong chú thích, hoặc trong `SPEC.md` mục 19.12.
- **`TRIEN-KHAI.md` ghi nhiều lệnh `wrangler` là "chưa chạy thử".** Sổ tay được viết bởi agent bị cấm chạy `wrangler`. Coi nó là hướng dẫn cần đối chiếu với tài liệu Cloudflare hiện hành, nhất là ở lần triển khai đầu.
- **Cấu hình cần bạn tự điền:** `database_id` và `BATON_URL_CONG_KHAI` trong `packages/api/wrangler.toml`.

## Giấy phép

[MIT](LICENSE) © TuySolo. Dùng, sửa, chia sẻ tự do; không kèm bảo hành.
