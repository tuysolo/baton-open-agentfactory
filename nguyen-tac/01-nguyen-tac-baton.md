# 1. Nguyên tắc của Baton

Baton là nơi điều hành công việc cho **một người chủ cùng một đội agent AI**, trải trên nhiều dự án. Tên lấy từ gậy tiếp sức: việc được chuyền tay qua nhiều chặng, nhưng lúc nào cũng biết gậy đang ở tay ai.

Tài liệu này giải thích *vì sao* Baton được thiết kế như vậy. *Hành vi chi tiết* nằm ở [`SPEC.md`](../SPEC.md); khi hai bên lệch nhau thì SPEC đúng.

## Bài toán

Một người làm việc với nhiều agent trên nhiều dự án sẽ gặp bốn chuyện, theo đúng thứ tự này:

1. **Không biết việc đang ở tay ai.** Agent báo "xong" trong một cửa sổ chat, cửa sổ đóng, không ai nhớ.
2. **"Xong" không phải xong thật.** Code nằm trên máy, chưa commit, chưa merge, chưa chạy thật.
3. **Người chủ thành nút thắt cổ chai.** Mỗi agent hỏi một câu ở một cửa sổ, người chủ bị ngắt quãng cả ngày và vẫn sót câu.
4. **Ôm quá nhiều thứ.** Mười dự án cùng "đang làm" nghĩa là không dự án nào thật sự tiến.

Tám nguyên tắc dưới đây trả lời bốn chuyện đó.

## Tám nguyên tắc

| # | Nguyên tắc | Nghĩa là gì trong thực tế |
|---|---|---|
| 1 | **Không giới hạn** số dự án, ticket, agent | Công cụ không được là lý do để bạn gộp hay bỏ dự án. Đích hiệu năng của bản gốc: 200 dự án, 200.000 ticket, 100 agent |
| 2 | **Không có ticket "Đang làm" = dự án đang đứng** | Trạng thái trên Baton phải khớp việc thật. Dự án không có việc đang chạy thì hiện đúng chữ "Dự án không chạy", không tô vẽ |
| 3 | **Xong phải có bằng chứng** | "Xong" = đã merge hoặc đã chạy thật, có commit hoặc URL mà hệ thống tự kiểm được. Lời báo cáo không mở được cổng Xong |
| 4 | **Người chủ không bị hỏi lẻ tẻ** | Mọi thứ cần người chủ nằm ở **một chỗ duy nhất** (mục "Cần Chủ"), mỗi mục đủ bối cảnh để quyết trong một lần đọc, duyệt theo phiên sáng và tối |
| 5 | **Agent là công dân hạng nhất** | Mỗi agent có danh tính, vai trò, quyền, lịch sử và nhịp tim riêng. Agent nói chuyện với Baton bằng CLI, MCP hoặc API |
| 6 | **Người chịu trách nhiệm cuối cùng** | Agent làm và đề xuất; người chủ quyết những việc thuộc danh sách phải hỏi. Không agent nào tự quyết một mục Cần Chủ |
| 7 | **Nhanh** | Mọi thao tác hiện kết quả ngay; việc thường dùng có phím tắt. Duyệt một mục là một phím |
| 8 | **Chỉ thêm, không sửa lén** | Nhật ký quyết định và bằng chứng chỉ thêm dòng mới. Muốn đổi thì ghi dòng mới trỏ về dòng cũ |

## Bảy khái niệm cần nắm

| Khái niệm | Một câu |
|---|---|
| **Chủ** | Người thật duy nhất của workspace. Tên hiển thị tự đặt; mục "Cần Chủ" đổi theo tên đó |
| **Agent** | Một danh tính máy có đúng một vai trò: `coordinator` (điều phối), `manager` (quản lý một dự án), `worker` (làm), `reviewer` (kiểm) |
| **Ticket** | Một việc, thuộc đúng một dự án, mã ngắn dạng `MÃ-số` để người và agent cùng gọi tên |
| **Lượt giao** | Một lần chuyền gậy: ai giao, cho ai, kèm brief nào, kết quả ra sao. Một ticket có thể qua nhiều lượt |
| **Phiên và nhịp tim** | Khoảng thời gian agent thật sự làm một lượt. Hết nhịp tim quá ngưỡng thì phiên "đứng" và người chủ được báo, thay vì chờ tới khi tự nhận ra |
| **Bằng chứng và cổng Xong** | Commit đã merge hoặc URL đã chạy thật, cộng review đạt của một người **khác** người làm |
| **Cần Chủ (mục T)** | Việc chỉ người chủ quyết hoặc làm được: quyết định, chạy một lệnh, review, hoặc chỉ để biết |

## Vòng đời một việc

```
Chủ nêu mục tiêu
   └─ CoS tạo ticket, viết brief ──giao──▶ Manager dự án
                                             └─ chia việc ──giao──▶ Worker làm trên nhánh riêng
                                                                      └─ nộp báo cáo + commit
                                             ◀── Reviewer độc lập kiểm (ĐẠT / CẦN SỬA)
        CoS tự kiểm lại (đọc diff, chạy test) ◀── Manager nghiệm thu, báo cáo
        CoS merge ──▶ Baton tự xác minh commit đã merge ──▶ ticket sang Xong
   ◀── việc nào cần người quyết thì thành một mục Cần Chủ, chờ phiên duyệt
```

Ba điểm dễ bỏ sót trong vòng này:

- **Nghiệm thu đạt chưa phải là Xong.** Ticket chỉ sang Xong khi qua cổng bằng chứng.
- **Người làm không tự chấm mình.** Review phải do agent khác ký.
- **Người kiểm không tin báo cáo.** Reviewer và CoS tự chạy lại lệnh kiểm chứng.

## Những việc Baton cố ý KHÔNG làm

Biết ranh giới này giúp bạn không chờ đợi sai:

- Baton **không chạy agent**, không gọi model, không giữ API key của model. Agent chạy ở nơi khác rồi báo về.
- Baton **không tự khởi động** agent khi có lượt giao; agent phải tự hỏi việc.
- Baton **không đọc** màn hình hay log của agent, không tự quét repo, không tự deploy, không chạy test.
- Baton **không chặn cứng** khi bạn vượt giới hạn 3 dự án đang đẩy; nó chỉ tô đỏ để bạn thấy.
- Một workspace chỉ có **một người chủ**: không có team, không phân quyền theo người.

## Đọc tiếp

- [2. Tổ chức đội agent](02-to-chuc-agent.md): bốn tầng, bộ định danh 8 phần, danh sách cấm, cách giao việc.
- [3. Tổ chức dự án](03-to-chuc-du-an.md): bản đồ dự án, giới hạn 3 dự án đang đẩy, khu vực duy trì, cây tròn, Hill Chart.
- [4. Bài học vận hành](04-bai-hoc-van-hanh.md): những lỗi đã trả giá để rút ra luật.
