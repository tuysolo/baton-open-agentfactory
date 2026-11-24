/**
 * **Một khối của trang** (`section` + đầu khối `h2`) — một dáng cho Tổng quan,
 * Đội agent, trang một agent (BAT-66), Chi tiết phiên và Hồ sơ dự án (BAT-67),
 * khối Luật chung của Bản đồ dự án và các mục Cài đặt (BAT-68) (THIET-KE "Trang").
 *
 * Đầu khối là `LOP_DAU_KHOI`: cao tối thiểu 28px để khối có tab-pill (Vừa xong)
 * hay nút (Sửa hồ sơ) và khối không có gì bên phải đứng **cùng một chiều cao**;
 * tiêu đề `LOP_TIEU_DE_MUC`; phần phụ dồn phải, xuống hàng ở 375px (`flex-wrap`).
 *
 * `aria-label` = tên khối ⇒ `section` là một `region` có tên — các ca test gọi
 * khối ra bằng `getByRole('region', { name })`. `data-khoi` là mã ổn định của
 * khối (ca "năm khối, đúng thứ tự" của Tổng quan đọc nó).
 *
 * Module lá: chỉ nhập `lop-nut`, nên không tạo vòng nhập giữa hai trang.
 */

import { LOP_DAU_KHOI, LOP_TIEU_DE_MUC } from './lop-nut';

export function Khoi({
  ten,
  ma,
  phu,
  children,
}: {
  ten: string;
  ma: string;
  phu?: React.ReactNode;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section aria-label={ten} data-khoi={ma} className="flex flex-col gap-2">
      <header className={LOP_DAU_KHOI}>
        <h2 className={LOP_TIEU_DE_MUC}>{ten}</h2>
        {phu}
      </header>
      {children}
    </section>
  );
}
