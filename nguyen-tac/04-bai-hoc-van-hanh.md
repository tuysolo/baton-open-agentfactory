# 4. Bài học vận hành

Những luật ở [tài liệu 2](02-to-chuc-agent.md) không đến từ lý thuyết. Mỗi luật dưới đây đã trả giá bằng ít nhất một lần hỏng trong hai tháng vận hành hệ gốc. Tên dự án và chi tiết riêng đã được lược; phần giữ lại là **chuyện gì xảy ra → luật từ nay**.

Bạn nên giữ một sổ như vậy của riêng mình (mẫu: [`mau/so-sach-cos.md`](../mau/so-sach-cos.md)), chỉ thêm không xoá, và cho CoS đọc nó ở đầu mỗi phiên.

## Giao việc

| Chuyện gì xảy ra | Luật từ nay |
|---|---|
| CoS giao Manager khoảng 10 lượt mà không tạo ticket. Người chủ nhìn bảng thấy "Đang làm" trống, tưởng dự án đứng | Mỗi lần giao đều có ticket ở trạng thái Đang làm |
| Lệnh merge lỗi nhưng CoS vẫn giao việc kế. Manager tạo nhánh từ bản cũ, phải bỏ | Xác nhận merge thành công (thấy commit mới) rồi mới giao tiếp |
| Sửa prompt và chạy lệnh giao cùng lúc; sửa lỗi nhưng lệnh giao vẫn đi, Manager chạy prompt cũ | Không chạy song song hai việc phụ thuộc nhau |
| CoS viết vào prompt "người chủ đã cấp phép" khi người chủ chưa nói | Không bao giờ nhân danh người chủ cấp quyền |
| Xếp việc B chờ việc A chỉ vì "cùng repo" | Việc độc lập trong cùng repo chạy song song, mỗi việc một git worktree và một nhánh riêng |
| Hai Manager chạy song song cùng đặt một số migration | Giao hai việc song song có migration thì CoS cấp sẵn số cho từng bên |
| Giao việc chạm dữ liệu dùng chung mà không xem dữ liệu thật. Manager chỉ thấy file trong repo, viết luật sai, bản deploy làm ẩn tính năng đang chạy | Trước khi giao việc chạm dữ liệu dùng chung, CoS đọc dữ liệu thật (chỉ đọc) và đưa số liệu vào prompt |
| Manager xong lượt rồi nằm không gần một ngày vì CoS bận việc khác | Mỗi lần một Manager xong, rà ngay việc đã duyệt còn mở của dự án đó và giao tiếp trong cùng lượt |
| Lượt tối ưu tốc độ làm xong mà không nhanh hơn | Việc tối ưu phải ghi số đo trước, ngưỡng cần đạt và cách đo vào "Định nghĩa xong" |

## Tiến trình chạy không người trông

| Chuyện gì xảy ra | Luật từ nay |
|---|---|
| Lệnh nền của phiên CoS bị cắt sau khoảng 30 phút, Manager chết giữa chừng | Chạy Manager tách hẳn khỏi phiên CoS (session riêng), ghi một file đánh dấu khi xong |
| Phiên CoS khởi động lại kéo Manager chết theo | Tách process group; đầu mỗi phiên CoS kiểm Manager nào còn sống |
| Manager kết thúc bằng một câu hỏi, mất cả giờ chờ trống | Prompt ghi sẵn: có câu hỏi thì chọn phương án an toàn hơn, ghi lý do, làm tiếp |
| Lệnh gọi Worker bị huỷ, Manager dừng để hỏi | Gọi lại tối đa 3 lần; vẫn huỷ thì Manager tự làm phần nhỏ, ghi rõ "Manager tự làm, Worker bị huỷ" |
| Manager gọi builder chạy nền rồi thoát mã 0 khi builder chưa xong. Hệ tự nộp "done" sai | Không tin mã thoát: đọc báo cáo, kết luận reviewer lượt cuối và `git status` trước khi coi là xong |
| Builder chạy bộ test 11 phút ở nền rồi báo "đang chờ"; Manager kết thúc lượt | Không chạy gì ở nền ở mọi cấp; câu này phải chép vào brief của mọi Worker |
| Máy ngủ giữa phiên, code đã commit nhưng thiếu báo cáo | Manager ghi báo cáo ngay sau commit; chạy qua đêm cần máy không ngủ |
| Test để lại hơn 200 tiến trình mồ côi, máy quá tải, test đỏ giả | Script giao việc tự dọn tiến trình mồ côi sau mỗi lượt; test chạy tuần tự |
| Worker bị chặn một lệnh nên tự viết script chạy vòng để lách | Prompt cấm lách; CoS kiểm file lạ chưa commit mỗi lần nghiệm thu |
| Worker để file tạm trong repo dù đã dặn | File tạm chỉ được nằm ngoài repo; Manager chạy `git status --short --ignored` trước khi báo xong |

## Nghiệm thu và merge

| Chuyện gì xảy ra | Luật từ nay |
|---|---|
| CoS merge trước khi đọc kết luận reviewer; lượt cuối ghi CẦN SỬA | Đọc kết luận reviewer **lượt cuối** trước khi merge |
| Chạy test, build, lint, typecheck song song lúc Manager khác cũng đang chạy; test đỏ giả | Chạy bộ test một mình, xong mới build và lint |
| Merge nhánh có thêm thư viện, thư mục chính chưa cài; deploy hỏng ở bước build | Merge có đổi `package.json` thì cài lại ngay sau merge |
| Người chủ hỏi "dự án còn việc gì"; CoS trả lời theo trí nhớ và sai | Câu hỏi "còn việc gì" luôn đối chiếu đặc tả, kế hoạch, bảng ticket và code rồi mới trả lời |
| Báo "xong" khi mới làm 1 trong 5 màn | Khi báo xong, nói rõ phần CHƯA làm và nó nằm ở giai đoạn nào |

## Deploy

| Chuyện gì xảy ra | Luật từ nay |
|---|---|
| Script deploy có `\|\| true` nên lỗi bị nuốt, vẫn in "✓ xong" | Script deploy không được nuốt lỗi: so mã phiên bản trước và sau, không có bản mới thì dừng |
| Build local đạt nhưng route mới trả 500 trên hạ tầng thật | Sau deploy, kiểm **từng route mới** ngay; build đạt chưa đủ |
| Lần deploy đầu của một hệ mới bắt người chủ chạy script 7 lần, vì những thứ chỉ hỏng trên hạ tầng thật | Trước lần deploy đầu: mô phỏng chỗ hạ tầng khác local, đọc giới hạn nền tảng, script phải chạy lại được và tự thử lại, tái hiện được lỗi rồi mới bảo chạy lại |
| Đưa lệnh deploy cho người chủ trong khi Manager đang đổi nhánh ở cùng thư mục | Deploy chạy từ một worktree riêng của nhánh chính; Manager làm ở worktree khác |
| Đổi tên miền chỉ sửa một file cấu hình, quên file kia; giá trị bị đóng băng lúc build | Đổi cấu hình thì rà mọi nơi nó xuất hiện, và sau deploy kiểm trang thật thay vì đọc cấu hình |
| Hẹn tự tắt một cờ sau 1 giờ bằng `sleep`; máy ngủ, cờ bật 2,5 giờ | Hẹn giờ dựa giờ thật (kiểm đồng hồ mỗi phút), không dựa thời lượng `sleep` |
| Script sao lưu file chứa secret ngay trong repo | Bản sao lưu file có secret luôn đặt ngoài repo |

## Việc cần người chủ

| Chuyện gì xảy ra | Luật từ nay |
|---|---|
| Lệnh deploy chỉ nói trong chat. Người chủ mở danh sách việc cần mình, thấy trống, không làm gì; hệ đứng | Việc cần người chủ ghi vào chỗ Cần Chủ ngay lúc phát sinh |
| CoS chờ người chủ deploy xong mới giao việc tiếp | Việc không phụ thuộc deploy thì giao song song |
| Để mục "chỉ để biết" lẫn trong danh sách chờ | Danh sách chờ chỉ chứa việc người chủ phải duyệt, quyết hoặc làm |
| Gộp lệnh cần chạy và câu cần quyết vào một mục; chạy lệnh xong mục đóng, câu hỏi biến mất | Tách hai mục: một cho lệnh, một cho quyết định |
| Mục đã đóng mà còn câu chưa trả lời, CoS chỉ ghi vào file riêng | Tạo ngay mục mới chỉ chứa các câu còn lại |
| Việc phải làm mà tạo bằng loại "chỉ để biết"; người chủ bấm đã đọc, mục đóng, việc còn nguyên | "Chỉ để biết" chỉ cho tin để biết |
| Nhờ người chủ bật cờ cho hai ticket, chỉ ghi mã. Người chủ bật nhầm hai ticket khác có số trùng trong tiêu đề | Nhờ thao tác trên ticket thì ghi mã + tiêu đề + trạng thái, và kiểm lại sau khi người chủ báo xong |
| Người chủ trả lời ba mục trong lúc vòng chờ đang tắt; CoS chỉ thấy một | Mỗi đầu phiên và mỗi lần vòng chờ thoát, đọc lại **mọi** mục đang mở |
| Đưa người chủ phương án chỉ dựa vào chữ trong đặc tả, trong khi tính năng đã có trong code | Đối chiếu code thật trước khi đưa phương án; đặc tả có thể cũ |
| Bóc việc con và hỏi chi tiết của một khối lớn chưa được duyệt, lấy căn cứ từ một file nháp | Duyệt từ khối lớn xuống; file nháp không phải căn cứ |
| Đề xuất một nhà cung cấp như thể chưa từng dùng, trong khi tài khoản đã bị họ từ chối từ trước | Trước khi đề xuất nhà cung cấp, tìm lịch sử của mình với họ |

## Quyền và lệnh

| Chuyện gì xảy ra | Luật từ nay |
|---|---|
| 186 lần người chủ phải bấm duyệt trong 17 giờ, 92% vì lệnh ghép (`cd … &&`, pipe, biến, vòng lặp) | Mỗi lệnh là một lệnh đơn, đường dẫn tuyệt đối; việc lặp đi qua script cố định |
| Thử lệnh "gia hạn token" bằng phiên đăng nhập của người chủ; token xoay vòng, người chủ bị đăng xuất | Lệnh có tác dụng phụ lên phiên hay tài khoản chỉ chạy khi đã nói trước hậu quả; coi "refresh" là lệnh ghi |
| Tạo file tạm trùng tên, ghi đè file bối cảnh cũ | Kiểm tên đã có chưa trước khi tạo; đặt tên kèm ngày |
