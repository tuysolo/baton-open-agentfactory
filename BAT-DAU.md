# Bắt đầu

Chọn một trong ba đường. Đường nào cũng bắt đầu bằng việc tải repo này về máy và mở một phiên agent (Claude Code hoặc công cụ tương đương) **trong thư mục repo**.

Các câu lệnh dưới đây là để dán cho agent. Sửa phần trong `<...>` trước khi dán.

---

## Đường 1 · Chỉ lấy cách làm

Hợp khi bạn muốn tổ chức đội agent ngay hôm nay và chưa cần phần mềm. Toàn bộ hệ chạy được bằng file markdown.

**Bạn làm:**

1. Đọc [`nguyen-tac/01`](nguyen-tac/01-nguyen-tac-baton.md), [`02`](nguyen-tac/02-to-chuc-agent.md), [`03`](nguyen-tac/03-to-chuc-du-an.md). Khoảng 20 phút.
2. Viết ra danh sách dự án của bạn. Chọn **tối đa 3** dự án đang đẩy; đánh dấu cái nào là việc duy trì.

**Dán cho agent:**

```
Đọc nguyen-tac/ và mau/ trong thư mục này.
Tôi có các dự án sau: <tên — thư mục — một câu mô tả, mỗi dự án một dòng>.
3 dự án tôi đang đẩy: <A, B, C>. Việc duy trì: <…>.

Hãy dựng cho tôi hệ CoS → Manager → Worker bằng file markdown:
1. Tạo thư mục <đường dẫn thư mục CoS> với CLAUDE.md theo mau/cos-CLAUDE.md và năm sổ theo mau/so-sach-cos.md,
   điền bản đồ dự án từ danh sách trên.
2. Với từng dự án đang đẩy: soạn phần Manager theo mau/manager-CLAUDE.md và hai Worker theo .claude/agents/,
   để tôi duyệt rồi mới ghi vào repo dự án.
3. Chép mau/bin/ vào thư mục CoS, sửa danh sách lệnh được phép và bị cấm cho khớp stack từng dự án.

Không sửa gì trong repo dự án khi tôi chưa duyệt. Chỗ nào chưa đủ thông tin thì hỏi tôi một lượt, gom lại.
```

Chạy như vậy vài tuần. Mỗi lần hệ sai, ghi một dòng vào `loi-da-gap.md`. Khi số dự án và số việc cần bạn quyết bắt đầu tràn khỏi file markdown, sang đường 2 hoặc 3.

---

## Đường 2 · Triển khai bản có sẵn

Hợp khi bạn muốn dùng Baton như nó đang có.

**Dán cho agent:**

```
Đọc README.md, SPEC.md mục 0–1 và TRIEN-KHAI.md.
1. Chạy lần lượt: npm ci, npm run build, npm run typecheck, npm run lint, npm test. Báo kết quả thật từng lệnh.
2. Đọc TRIEN-KHAI.md và đối chiếu từng lệnh wrangler với tài liệu Cloudflare hiện hành.
   Liệt kê lệnh nào cần sửa, vì sao, kèm nguồn.
3. Lập cho tôi danh sách việc CHỈ TÔI làm được (đăng nhập Cloudflare, tạo cơ sở dữ liệu, đặt secret,
   khởi tạo, deploy), theo đúng thứ tự, mỗi bước một lệnh.

Bạn KHÔNG chạy wrangler, KHÔNG deploy, KHÔNG đụng secret. Những việc đó tôi tự chạy.
```

**Bạn làm:** đi theo [`TRIEN-KHAI.md`](TRIEN-KHAI.md) từ mục a tới mục f. Ba chỗ dễ vấp:

- Điền `database_id` thật vào `packages/api/wrangler.toml` sau khi tạo cơ sở dữ liệu.
- Tạo bucket R2 `baton-sao-luu` **trước** lần deploy đầu, nếu không deploy sẽ báo lỗi.
- Cất `TOKEN_CHU` ở nơi an toàn. Mọi đường cứu hộ (mất mã xác thực, bị khoá) đều đi qua nó.

Sau khi chạy được: đọc [`HUONG-DAN-AGENT.md`](HUONG-DAN-AGENT.md) để nối agent của bạn vào bằng CLI.

---

## Đường 3 · Dựng lại theo cách của bạn

Hợp khi bạn muốn một Baton khác: stack khác, ngôn ngữ khác, bớt hoặc thêm tính năng. Đây là cách bản gốc được làm ra: **phòng sạch**, agent chỉ đọc đặc tả.

**Bạn làm trước:**

1. Mở một **phiên spec** (bạn và một agent, tách khỏi phiên build). Sửa `SPEC.md` cho đúng ý bạn: đổi tên người chủ, múi giờ, ngôn ngữ giao diện, bỏ những mục chưa cần. `viec-v0.1.md` chia việc thành 9 phần theo thứ tự.
2. Quyết định có cho phiên build đọc `packages/` hay không. Muốn tự do chọn kỹ thuật thì dời `packages/` ra ngoài thư mục; muốn chuyển từng phần sang stack khác thì giữ lại để đối chiếu.

**Dán cho agent (phiên build, mở mới):**

```
Chỉ đọc SPEC.md và viec-v0.1.md trong thư mục này. Không đọc bất kỳ thứ gì bên ngoài.
Không hỏi tôi về hành vi, chỉ hỏi về lựa chọn kỹ thuật.
Thiếu hành vi trong SPEC thì ghi vào cau-hoi-spec.md kèm đề xuất tạm, không tự đoán, rồi làm phần khác.
Đề xuất lựa chọn kỹ thuật (ngôn ngữ, cơ sở dữ liệu, nơi chạy) cho tôi chốt, rồi build phần 1.
Mỗi luật trong SPEC mà phần việc chạm tới phải có test tự động.
```

Luật của phiên build nằm sẵn trong [`CLAUDE.md`](CLAUDE.md) và [`.claude/agents/`](.claude/agents/): Manager chia việc, `worker-builder` làm, `worker-reviewer` kiểm độc lập, không ai tự deploy.

**Vòng lặp từ đó:** agent build một phần → bạn (hoặc CoS của bạn) tự chạy lại test và đọc diff → merge → trả lời các câu trong `cau-hoi-spec.md` ở phiên spec → phần kế. Phần 9 của `viec-v0.1.md` là nghiệm thu 11 bước theo `SPEC.md` mục 17.

---

## Dù đi đường nào

- **Đừng tự động hoá vội.** Duyệt tay vài tuần để rút ra luật của riêng bạn trước khi cho agent chạy qua đêm.
- **Danh sách cấm là của bạn.** Sáu mục ở [`nguyen-tac/02`](nguyen-tac/02-to-chuc-agent.md) là điểm xuất phát; nới từng mục khi bạn đã có bằng chứng, và ghi lại lúc nới.
- **Không đưa dữ liệu thật vào repo.** `mau-nhap/` chỉ chứa dữ liệu giả; secret chỉ nằm trong trình quản lý mật khẩu và đi qua biến môi trường.
