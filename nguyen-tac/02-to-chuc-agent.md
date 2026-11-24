# 2. Tổ chức đội agent

Mô hình bốn tầng: **Chủ (CEO) → CoS (Chief of Staff) → Manager của từng dự án → Worker**. Mỗi tầng chỉ làm đúng một loại việc; việc đi xuống bằng brief, kết quả đi lên bằng báo cáo có bằng chứng.

Bạn không cần đủ bốn tầng ngay từ đầu. Một dự án, một người: bạn đóng vai CoS, mở một phiên Manager, để nó gọi Worker. Thêm tầng CoS khi bạn có từ hai dự án trở lên và bắt đầu quên dự án kia đang ở đâu.

## Bốn tầng

| Tầng | Vai trò trên Baton | Làm | KHÔNG làm |
|---|---|---|---|
| **Chủ** | chủ workspace | Nêu mục tiêu, duyệt, quyết các mục Cần Chủ, chạy những lệnh chỉ người được chạy | Không bị hỏi lẻ tẻ giữa ngày |
| **CoS** | `coordinator` | Biến chỉ đạo thành ticket và brief, giao Manager, theo dõi, **tự kiểm lại kết quả**, merge, gom mọi việc cần Chủ vào một chỗ | Không code, không sửa file trong repo dự án, không giao thẳng cho Worker |
| **Manager** | `manager` | Nhận ticket của **một** dự án, chia việc, viết brief cho Worker, nghiệm thu, ghi báo cáo và quyết định | Không tự sửa code, không push, merge, deploy |
| **Worker builder** | `worker` | Làm đúng một việc theo brief trên nhánh riêng, viết test, commit | Không làm ngoài phạm vi brief, không tạo agent con, không merge |
| **Worker reviewer** | `reviewer` | Kiểm độc lập: đọc diff, đối chiếu từng luật trong SPEC, tự chạy lại test | Không sửa gì, không commit |

Vì sao tách như vậy:

- **Người lập kế hoạch không code** nên giữ được bức tranh chung và không bị cuốn vào chi tiết.
- **Người làm không tự chấm mình** nên lỗi bị bắt trước khi lên tới người chủ.
- **Mỗi dự án một Manager** nên bối cảnh của dự án này không lẫn sang dự án khác.

## Bộ định danh 8 phần

Mọi agent, kể cả CoS, đều được mô tả bằng đúng tám dòng. Thiếu dòng nào thì agent sẽ tự đoán dòng đó, và thường đoán sai.

| # | Thành phần | Câu hỏi nó trả lời |
|---|---|---|
| 1 | **Role** | Tôi làm gì, và quan trọng hơn là không làm gì? |
| 2 | **Model** | Tôi chạy bằng model nào? |
| 3 | **Harness** | Tôi chạy trong công cụ nào, mở ở thư mục nào? |
| 4 | **Context** | Đầu phiên tôi đọc những file nào, theo thứ tự nào? |
| 5 | **Effort** | Tôi suy nghĩ ở mức nào cho loại việc nào? |
| 6 | **Permission** | Tôi được đọc gì, ghi gì, chạy lệnh gì; cái gì bị cấm? |
| 7 | **Brief & Memory** | Tôi ghi quyết định và báo cáo vào đâu để phiên sau đọc lại được? |
| 8 | **Project** | Thư mục và nơi theo dõi ticket của tôi ở đâu? |

Nơi đặt: CoS và Manager ghi trong `CLAUDE.md` của thư mục mình; Worker ghi trong `.claude/agents/<tên>.md`. Mẫu sẵn dùng: [`mau/cos-CLAUDE.md`](../mau/cos-CLAUDE.md), [`mau/manager-CLAUDE.md`](../mau/manager-CLAUDE.md), và hai Worker ngay trong repo này ở [`.claude/agents/`](../.claude/agents/).

## Danh sách CẤM

Sáu loại việc **không agent nào tự làm**, ở bất kỳ tầng nào:

1. **Tiền và thanh toán**: mua dịch vụ, gói trả phí, chuyển khoản.
2. **Thay đổi dữ liệu gốc**: migration lên cơ sở dữ liệu thật, sửa bảng hay bản ghi thật.
3. **Gửi ra ngoài**: tin nhắn, email, bài đăng tới người thật.
4. **Xoá**: kể cả xoá gián tiếp như ghi đè, `git reset --hard`, đổi kiểu trường.
5. **Secret**: in key hay token ra màn hình, commit `.env`, chép giá trị bí mật vào chat.
6. **Deploy production.**

Gặp việc thuộc danh sách này thì agent dừng phần đó và tạo một mục Cần Chủ, kèm lệnh đã soạn sẵn để người chủ chỉ việc chạy. Một loại việc chỉ được chuyển sang "agent tự làm" khi người chủ **ghi rõ vào nhật ký quyết định**. Nới dần theo bằng chứng, đừng nới theo cảm giác: bản gốc chỉ cho CoS tự chốt câu chữ giao diện sau khi 12 phiên duyệt liên tiếp người chủ đều chọn đúng đề xuất của CoS.

## Cách giao việc

1. **Chủ chỉ đạo** → CoS tạo ticket kèm brief. Brief ghi rõ ba thứ: **Mức kỹ**, **Định nghĩa xong**, **Không làm**.
2. **CoS tạo nhánh** `worker/<tên>` rồi mới giao. Manager không tạo, không đổi nhánh.
3. **Manager chạy** trong repo dự án, chia việc cho Worker builder, rồi gọi Worker reviewer kiểm độc lập. Lượt cuối phải là reviewer ĐẠT; sửa gì sau đó thì gọi reviewer lại.
4. **CoS tự kiểm**: đọc diff, chạy lint, typecheck, test, build, quét bí mật. Không tin báo cáo suông và không tin mã thoát của tiến trình.
5. **CoS merge** (chỉ fast-forward), nộp bằng chứng lên Baton. Ticket sang Xong khi Baton tự xác minh được commit đã merge.

**Brief** là thứ quyết định chất lượng. Người nhận bắt đầu từ con số 0, nên brief phải đủ để làm mà không hỏi lại: mục tiêu, bối cảnh, phạm vi làm và không làm, file liên quan, điều cấm, "xong là gì", cách kiểm chứng. Mẫu: [`mau/brief.md`](../mau/brief.md).

**Mức kỹ** giúp không làm thừa và không làm ẩu:

| Mức | Dùng cho | Cách làm |
|---|---|---|
| **NHẸ** | Giao diện, sửa lỗi nhỏ, công cụ nội bộ | Review một vòng, chỉ trả lại khi lỗi làm hỏng chức năng hay dữ liệu; góp ý nhỏ ghi thành "nợ". Test cho hành vi chính |
| **KỸ** | Dữ liệu, migration, quyền, bảo mật, tiền, gửi ra ngoài | Review tới khi ĐẠT, test đủ ca biên |

## Phòng sạch

Dự án build theo đặc tả thì phiên build **chỉ đọc file trong thư mục dự án**: `SPEC.md` là nguồn sự thật duy nhất về hành vi. Prompt giao việc không chứa thông tin nào ngoài nguồn của dự án và quyết định của người chủ.

- Thiếu hành vi trong SPEC → agent ghi vào `cau-hoi-spec.md` kèm đề xuất tạm, **không tự đoán**, rồi làm phần khác.
- SPEC chỉ được sửa ở "phiên spec" (bạn và một agent khác), không sửa trong phiên build.
- Manager ghi báo cáo vào `bao-cao/<ngày>.md` và quyết định kỹ thuật vào `quyet-dinh.md` **trong repo**; CoS đọc hai file đó.

Lợi ích: mọi quyết định về hành vi đều có nguồn, và bạn thay được agent hay model giữa chừng mà không mất gì.

## Cần Chủ và phiên duyệt

- **Người chủ chỉ làm khi có mục Cần Chủ.** Việc cần người chủ mà chỉ nói trong chat thì coi như chưa nói.
- **Việc agent làm được thì agent làm.** Chỉ đưa lên người chủ việc bắt buộc cần người: thẻ, mật khẩu, mã xác thực, quyền tài khoản, hoặc việc thuộc danh sách CẤM.
- **Hai phiên duyệt mỗi ngày**, sáng và tối. Giữa hai phiên, Manager chỉ làm việc không cần người chủ; việc phải chờ quyết định thì xếp sau.
- **Mỗi mục có hai phần tách rõ**: *Bối cảnh* (đọc để hiểu, có đề xuất của CoS và hậu quả nếu chậm) và *Việc bạn làm* (các bước đánh số, mỗi bước một hành động, bước cuối là câu trả lời mẫu).
- **Tách lệnh và câu hỏi thành hai mục.** Gộp chung thì người chủ chạy lệnh xong bấm "đã chạy", mục đóng, và các câu hỏi biến mất theo.
- **"Chỉ để biết" chỉ dùng cho tin để biết.** Việc phải làm mà gắn loại này thì người chủ bấm "đã đọc" là mục đóng trong khi việc còn nguyên.

## Luật môi trường cho agent chạy không người trông

Những luật này nghe vụn vặt nhưng quyết định việc hệ có chạy được qua đêm hay không:

- **Mỗi lệnh shell là một lệnh đơn, đường dẫn tuyệt đối.** Không `cd … &&`, không pipe, không biến, không vòng lặp. Lệnh ghép thì hệ thống quyền không phân tích được và hỏi người chủ. Bản gốc đếm được 186 lần bấm duyệt trong 17 giờ, 92% vì lệnh ghép.
- **Việc lặp lại đi qua script cố định** đã được cấp phép sẵn (giao việc, chờ xong, merge), không viết lệnh mới mỗi lần.
- **Lệnh bị chặn thì không lách.** Không chạy vòng qua script khác hay công cụ khác cùng mục đích. Ghi vào báo cáo.
- **Không chạy gì ở nền, ở mọi cấp.** Worker báo "đang chờ" nghĩa là chưa xong; Manager không được kết thúc lượt bằng "đang chờ".
- **Có câu hỏi thì chọn phương án an toàn hơn, ghi lý do, làm tiếp.** Dừng để hỏi là mất cả lượt.
- **Không để lại file tạm trong repo.**
- **Chạy bộ test tuần tự**, không cho nhiều Worker chạy cùng lúc.

Script mẫu cho việc giao Manager: [`mau/bin/`](../mau/bin/).

## Chấm agent

Mỗi lượt Manager ghi một dòng. Năm chỉ số đủ để biết hệ đang tốt lên hay tệ đi:

| Chỉ số | Đích |
|---|---|
| CoS kiểm lần đầu đạt, không phải trả lại | Mọi lượt |
| Số vòng reviewer trước khi ĐẠT | 1 đến 2 |
| Số câu phải đẩy lên người chủ sau lượt đó | 0 đến 1 |
| Số lần người chủ chọn khác đề xuất của CoS | 0 |
| Thời gian chạy | Ghi để so, chưa đặt đích |

Mẫu: [`mau/so-sach-cos.md`](../mau/so-sach-cos.md).

## Đừng tự động hoá vội

Duyệt tay vài tuần trước khi cho chạy ca đêm. Mục đích của giai đoạn duyệt tay là **rút ra luật**: mỗi lần hệ sai, ghi một dòng vào sổ lỗi (chuyện gì xảy ra → hậu quả → luật từ nay) và sửa prompt hoặc script. Sổ đó của bản gốc, đã lược tên riêng, nằm ở [4. Bài học vận hành](04-bai-hoc-van-hanh.md).
