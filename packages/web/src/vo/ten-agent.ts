/**
 * **`agentId` → tên agent, cho những màn hình mà máy chủ chỉ trả id** — SPEC mục
 * 14 d.404: "Mọi chỗ hiện người làm đều hiện **tên agent**, không bao giờ id."
 *
 * ## Vì sao tra ở máy khách, không sửa thêm đường đọc
 *
 * Chỗ nào **đáng** trả tên thì máy chủ trả: thẻ việc của bảng
 * (`TheDanhSachRa.nguoi_cam_ten`), Tổng quan (`TheViecDangChay`), hồ sơ dự án
 * (`quan_ly_agent_ten`). Nhưng còn những chỗ id xuất hiện **rải rác trong lịch
 * sử**: tác giả của từng bình luận, từng dòng lịch sử, từng lượt giao, từng dòng
 * Nhật ký, từng mục "Lỗi đã gặp". Thêm một trường tên vào **mỗi** hình ấy là
 * nhiều lần đổi hợp đồng API cho một việc hiển thị, và nó lặp cùng một cái tên
 * hàng chục lần trong một thân.
 *
 * Giao diện **đã** có đúng một bảng tra sẵn: `GET /v1/agent` (danh sách agent của
 * workspace) — thứ mà ô lọc "người chịu trách nhiệm" và "người đang cầm" của
 * d.396 đã tải. Hook này dùng lại **cùng `queryKey` `['agent']`** ấy, nên không
 * thêm một lượt gọi nào trên những trang đã có nó.
 *
 * ## Chưa tra được thì KHÔNG rơi về id
 *
 * Danh sách chưa về, hoặc agent đã bị xoá khỏi bảng ⇒ `null`. Màn hình nói "—"
 * (hoặc giữ nguyên chữ của chính nó), **không** in id ra: d.404 cấm id lên màn
 * hình, và một id không nói với chủ được gì mà một dấu "—" không nói.
 */

import { useQuery } from '@tanstack/react-query';
import { layAgent } from '../api';

/** Tra một id agent ra tên; `null` khi chưa biết. */
export type TraTenAgent = (agent_id: string | null | undefined) => string | null;

/**
 * Hook tra tên agent.
 *
 * **Có hỏi** (`enabled` mặc định), khác `DuongDan` của `vo/thanh-tren.tsx` (chỉ
 * đọc cache): một trang chi tiết ticket mở trực tiếp từ link `/t/<MÃ>` chưa có
 * cache `['agent']` nào, và một hook "chỉ đọc cache" ở đó sẽ **không bao giờ** ra
 * tên — tức d.404 vẫn hỏng, chỉ là hỏng im lặng hơn. Cùng `queryKey` với ô lọc
 * của d.396, nên trên trang danh sách nó **không** thêm lượt gọi nào.
 *
 * Danh sách bị bỏ khỏi cache lúc đăng xuất (mục 15 d.415, `removeQueries` trừ
 * `['toi']`) và hook này sẽ hỏi lại — câu trả lời lúc ấy là **401**, nên không
 * dữ liệu nào của chủ quay lại bộ nhớ.
 */
export function useTenAgent(): TraTenAgent {
  const ds = useQuery({ queryKey: ['agent'], queryFn: layAgent });
  const bang = ds.data?.items;
  return (agent_id) => {
    if (agent_id === null || agent_id === undefined || agent_id === '') return null;
    return bang?.find((a) => a.id === agent_id)?.ten ?? null;
  };
}
