/**
 * **Hằng dùng chung cho mọi trang** — một module nhỏ, không kéo theo gói nào.
 *
 * Lượt 4 và lượt 5 khai `CHU_KY_LAM_MOI_MS` **hai lần** (`trang/can-chu.tsx` và
 * `loc-ticket.ts`), mỗi bản có một ca ghim ngưỡng riêng. Lý lẽ lúc đó là "nhập
 * từ `can-chu.tsx` sẽ kéo cả trang Cần Chủ vào gói của trang kia" — lý lẽ ấy
 * đúng, nhưng kết luận sai: cách thoát là một **module hằng** không nhập gì, chứ
 * không phải hai bản sao. Từ lượt 6 có **sáu** trang dùng khái niệm này, và hai
 * bản sao nghĩa là một lần chốt chu kỳ mới có thể sửa đúng một bản.
 *
 * File này **không nhập gì**, nên mọi trang nhập nó mà không kéo theo cây phụ
 * thuộc nào.
 */

/**
 * **Chu kỳ hỏi lại máy chủ** — SPEC mục 14 d.420: "thay đổi do agent tạo hiện
 * lên **trong vòng 3 giây**, không cần tải lại trang".
 *
 * 2 giây, không 3: mốc của SPEC là *lúc thay đổi hiện lên*, nên chu kỳ phải để
 * chỗ cho một lần đi-về mạng. Hỏi vòng (không WebSocket) vì thay đổi của agent
 * là việc rời rạc — hiếm, không liên tục — và một đường dài giữ mở thêm một thứ
 * phải trông: nó rụng im lặng và màn hình đứng lại mà không ai biết.
 *
 * Ca ghim ngưỡng (`CHU_KY_LAM_MOI_MS < giây của d.420 × 1000`) **cắt số 3 ra từ
 * `SPEC.md`**, nên đặt một chu kỳ ≥ 3 giây ở đây là một ca đỏ.
 */
export const CHU_KY_LAM_MOI_MS = 2000;

/**
 * **Chờ bao lâu rồi mới hiện dấu "đang làm mới"** — ngưỡng của `src/lam-moi.ts`.
 *
 * Chu kỳ trên là 2 giây, nên một màn hình hiện dấu ngay mỗi lượt refetch sẽ nháy
 * một dòng chữ **mỗi hai giây, suốt ngày**: chủ dùng thật báo "giao diện xô lệch
 * liên tục". Một lượt đi-về bình thường xong trong vài chục ms — chủ không cần
 * biết nó đã xảy ra, vì dữ liệu cũ vẫn đúng và dữ liệu mới tự thay vào.
 *
 * Dấu chỉ có nghĩa khi lượt tải **chậm bất thường**: lúc đó con số trên màn hình
 * có thể đã cũ và chủ cần biết là máy đang cố, không phải đã đứng. 1 giây là mốc
 * "chậm bất thường" ở đây: nửa chu kỳ 2 giây — đủ lâu để một lượt lành không bao
 * giờ chạm tới, đủ sớm để dấu còn hiện trước khi chu kỳ sau bắt đầu.
 *
 * Phải **nhỏ hơn** `CHU_KY_LAM_MOI_MS`: một ngưỡng ≥ chu kỳ nghĩa là dấu chỉ kịp
 * hiện khi hai lượt đã dồn lên nhau. Có ca test ghim.
 */
export const NGUONG_HIEN_DAU_LAM_MOI_MS = 1000;
