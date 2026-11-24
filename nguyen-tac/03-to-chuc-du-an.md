# 3. Tổ chức dự án

Mục tiêu: mở một trang là biết mình đang ôm gì, cái gì đang kẹt ở mình, và không dàn trải.

Bốn ý ghép lại: **giới hạn 3 dự án đang đẩy**, **tách việc duy trì khỏi dự án**, **bản đồ cây tròn**, và **Hill Chart** cho khối việc đang làm. Hành vi chi tiết ở [`SPEC.md` mục 20](../SPEC.md); mockup chạy được ở [`mau-nhap/ban-do-du-an.html`](../mau-nhap/ban-do-du-an.html) (mở bằng trình duyệt, dữ liệu trong đó là hư cấu).

## Ba tầng: mảng → dự án → khối việc lớn

| Tầng | Là gì | Ví dụ |
|---|---|---|
| **Mảng** | Nhóm dự án cùng lĩnh vực. Chỉ để gom và tô màu | Cửa hàng, Khoá học, Nội dung |
| **Dự án** | Việc có đích và có ngày kết thúc | Web bán hàng |
| **Khối việc lớn** | 5 đến 7 chặng của một dự án, đánh số thứ tự. Trên Baton là ticket có số `khoi_lon`; ticket con của nó là việc nhỏ | 01 Khung trang · 02 Danh mục · 03 Giỏ hàng |

Quy tắc duyệt đi cùng ba tầng này: **duyệt từ khối lớn xuống việc nhỏ.** Khối chưa được người chủ duyệt mở thì agent không bóc việc con của nó và không đưa câu hỏi chi tiết của nó lên.

## Giới hạn 3 dự án đang đẩy (WIP 3)

Tại một thời điểm chỉ có **tối đa 3 dự án "đang đẩy mạnh"**. Mọi dự án khác vẫn tồn tại nhưng nằm ở hàng chờ.

- Đồng hồ **"Đang đẩy n/3"** ở đầu trang.
- Dự án đang đẩy: viền đậm. Dự án hàng chờ: **mờ đi**.
- Bật dự án thứ tư: Baton **vẫn cho**, không chặn; đồng hồ chuyển đỏ. Công cụ nhắc, người quyết.
- Con số 3 chỉnh được trong Cài đặt (1 đến 10). Đừng chỉnh trước khi thử 3 trong vài tuần.

Cách dùng trong vận hành: CoS giữ danh sách 3 trọng điểm; việc ngoài 3 trọng điểm chuyển sang "duy trì" hoặc "pending" và được nhắc lại ở mỗi phiên duyệt để người chủ quyết có đổi chỗ hay không. Muốn đưa một dự án mới vào thì phải nói rõ nó **thay cho dự án nào**.

## Dự án và khu vực duy trì (theo PARA)

Không phải thứ gì bạn chịu trách nhiệm cũng là dự án.

| | Dự án | Khu vực duy trì |
|---|---|---|
| Có đích, có ngày kết thúc | Có | Không |
| Ví dụ | Ra mắt web bán hàng | Sổ sách hằng tháng, trả lời khách, sao lưu |
| Trên bản đồ | Một bong bóng | **Không lên bản đồ**; một chip ở dải "Khu vực duy trì" cuối trang |
| Cần biết gì | Đang ở chặng nào | Đang ổn (chấm xanh) hay cần để mắt (chấm vàng) |

Dự án chạy thật xong thời gian theo dõi thì chuyển sang duy trì. Bật cờ duy trì thì cờ đang đẩy tự tắt: việc duy trì không "đẩy".

## Bốn trạng thái của một dự án trên bản đồ

| Chọn | Nghĩa |
|---|---|
| **Đang đẩy** | Một trong 3 dự án đang dồn sức |
| **Hàng chờ** | Vẫn chạy nhưng không dồn sức |
| **Tạm dừng** | Agent không nhận việc mới trong dự án |
| **Duy trì** | Trách nhiệm dài hạn, không có đích |

Mỗi dự án còn có **mức ưu tiên 1 đến 5** (5 là quan trọng nhất, mặc định 3) và một **tên ngắn** để bong bóng gọn.

## Bản đồ cây tròn

Người chủ ở tâm → vòng 1 là mảng → vòng 2 là dự án.

| Thấy gì | Nghĩa là gì |
|---|---|
| Bong bóng **to hay nhỏ** | Mức ưu tiên |
| **Màu** bong bóng | Vàng: có mục Cần Chủ đang chờ · Xám: tạm dừng · Xanh: còn lại |
| **Viền đậm** | Đang đẩy |
| **Mờ** | Hàng chờ |
| **Vòng tiến độ** quanh bong bóng + "3/5" | Số khối lớn đã Xong trên tổng số khối |

Thao tác:

- **Bấm mảng** để gập hay mở. Mảng gập thành một bong bóng to bằng tổng ưu tiên các dự án con, ghi "+n". Mặc định khi mở trang: mảng không có dự án đang đẩy thì gập sẵn.
- Ba nút nhanh: **Chỉ giữ dự án đang đẩy · Mở hết · Thu gọn hết**.
- **Bấm dự án** thì dự án nhảy vào tâm, các khối lớn thành vòng ngoài đánh số 01, 02… (xanh: Xong; vàng viền đậm: đang làm; xám nét đứt: chưa tới). Bấm tâm để quay lại.
- **Không bao giờ vẽ ba tầng cùng lúc.** Đó là lý do bản đồ đọc được khi có vài chục dự án.

Bên phải bản đồ là **thẻ dự án chia ba làn**: Đang đẩy · Hàng chờ · Tạm dừng. Mỗi thẻ ghi: Đang làm, Chờ Chủ, Mốc tới, người cầm, ưu tiên.

Vì sao là cây tròn mà không phải mind map hay bảng: lúc thiết kế đã thử thêm bốn kiểu (ô vuông, thanh tầng, mind map, vòng tròn chia cung) và chúng vẫn nằm trong mockup để so. Cây tròn được chọn vì diện tích bong bóng nói ngay "cái nào quan trọng", và gập mở từng mảng giữ cho hình không rối. Bốn kiểu kia cố ý không được build.

## Hill Chart

Mỗi khối lớn đang làm có một **vị trí trên đồi** từ 0 đến 100, do người cầm dự án tự ước lượng và cập nhật ở phiên duyệt:

- **Dưới 50, đang leo dốc:** chưa rõ cách làm, còn ẩn số.
- **Từ 50 trở lên, đang xuống dốc:** đã rõ cách, chỉ còn làm.

Con số này trả lời câu mà phần trăm hoàn thành không trả lời được: việc này còn rủi ro không? Một khối đứng mãi ở 30 là tín hiệu cần người chủ nhìn vào, dù ticket vẫn "Đang làm". Baton không tự tính vị trí này.

## Hồ sơ dự án

Mỗi dự án có một trang "đọc trước" để agent mới vào chỉ cần đọc trang đó:

- Là gì, thư mục, repo, stack.
- Đọc trước những file nào.
- Cách deploy và ai chạy.
- Danh sách cấm riêng của dự án.
- **Lỗi đã gặp**: danh sách chỉ thêm (ngày, lỗi, cách tránh).

Trước khi Baton chạy được, bạn giữ đúng nội dung này trong một file markdown. Mẫu: [`mau/so-sach-cos.md`](../mau/so-sach-cos.md).

## Những việc cố ý không làm

Kéo thả để đổi ưu tiên; tự tính vị trí trên đồi; cấp "epic" riêng giữa dự án và ticket; chặn cứng khi vượt giới hạn 3.
