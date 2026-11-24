/**
 * Câu nói ra phần dự án bị trần một lượt cắt — hàm thuần, có test.
 *
 * Dùng chung cho Bản đồ (`so_con_lai` của máy chủ) và Tổng quan (khối Dự án vượt
 * `TRAN_DU_AN`, BAT-73). Nằm ở `vo/` chứ không ở `trang/ban-do.tsx`: Bản đồ là
 * trang tải lười (`dinh-tuyen.tsx`), nhập từ nó vào Tổng quan sẽ kéo cả trang đó
 * vào gói đầu. `trang/ban-do.tsx` xuất lại để chỗ cũ nhập vẫn đúng.
 */
export const cauConLai = (n: number): string =>
  `Còn ${String(n)} dự án chưa hiện ở lượt này.`;
