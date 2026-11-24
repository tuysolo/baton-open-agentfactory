/**
 * **Đăng xuất — phần dùng chung giữa menu workspace và trang Cài đặt** (SPEC mục
 * 15 d.415, d.425; mục 14 d.401).
 *
 * Hai thứ ở đây, mỗi thứ **một bản**:
 *
 *   * `useDangXuat` — mutation gọi `/v1/dang-xuat` hoặc `/v1/dang-xuat-moi-noi`,
 *     kèm cách xử lý cache đã chốt từ `thanh-tren.tsx` (xem dưới).
 *   * `XacNhanDangXuatMoiNoi` — **bước xác nhận** của "Đăng xuất mọi nơi". Mọi lối
 *     vào nút này trên web (menu tên workspace, khu Tài khoản ở `/cai-dat`) đều đi
 *     qua đúng component này: hai bản chép là hai chỗ để một bản quên hỏi — đúng
 *     lỗi review BAT-11 bắt được ở menu.
 *
 * Hệ quả của "mọi nơi" là **chính phiên này cũng mất**, nên một cú bấm nhầm là
 * phải đăng nhập lại bằng mật khẩu và mã TOTP. "Đăng xuất" thường (một phiên)
 * **không** hỏi: nó chỉ mất phiên đang ngồi.
 */

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { cauLoi, dangXuat } from '../api';
import { NUT_CHINH, NUT_MO_KHI_DISABLED } from './lop-nut';

export const CAU_HOI_DANG_XUAT_MOI_NOI =
  'Mọi phiên đăng nhập, kể cả phiên này, sẽ bị huỷ ngay. Bạn sẽ phải đăng nhập lại bằng mật khẩu và mã xác thực.';
export const NHAN_XAC_NHAN_DANG_XUAT = 'Xác nhận đăng xuất mọi nơi';
export const NHAN_HUY = 'Huỷ';

/**
 * Mutation đăng xuất. Tham số `moi_noi` chọn đường.
 *
 * `onSettled` **giữ từng dòng** nếp đã chốt: bỏ mọi query **trừ** `['toi']` rồi
 * `invalidate` đúng `['toi']` — `/v1/toi` trả 401 và vỏ đổi sang trang đăng nhập.
 *
 * **Chạy cả khi lỗi** (`onSettled`, không `onSuccess`): mạng đứt lúc trả lời thì
 * máy chủ có thể **đã** huỷ phiên, và hỏi lại `/v1/toi` là cách duy nhất để biết
 * (`dang-nhap.test.tsx` có ca giết đột biến `onSuccess`). Bỏ cache khi lỗi cũng an
 * toàn ở ca ngược lại: phiên còn sống thì `/v1/toi` vẫn 200, vỏ đứng nguyên, và
 * các query đang có người xem tự đọc lại. Giữ cache khi lỗi thì ở ca phiên đã chết
 * dữ liệu của chủ nằm lại trong bộ nhớ trang — tệ hơn một lượt đọc lại.
 */
export function useDangXuat(): UseMutationResult<unknown, Error, boolean> {
  const qc = useQueryClient();
  return useMutation<unknown, Error, boolean>({
    mutationFn: (moi_noi: boolean) => dangXuat(moi_noi),
    onSettled: async () => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'toi' });
      await qc.invalidateQueries({ queryKey: ['toi'] });
    },
  });
}

/**
 * Bước xác nhận của "Đăng xuất mọi nơi": câu hỏi, nút "Xác nhận", nút "Huỷ", và
 * câu lỗi khi lượt gọi trượt (câu của máy chủ nguyên văn, hoặc câu chung — `cauLoi`).
 *
 * Component **không** tự gọi máy chủ: người dùng nó truyền `onXacNhan` (gọi
 * `useDangXuat().mutate(true)`) và `onHuy`. Nhờ vậy chỗ đặt nó (menu, trang) tự
 * quyết đóng/mở, còn câu chữ và thứ tự hai nút là một.
 */
export function XacNhanDangXuatMoiNoi({
  onXacNhan,
  onHuy,
  dang_chay,
  loi,
}: {
  onXacNhan: () => void;
  onHuy: () => void;
  dang_chay: boolean;
  loi: unknown;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">{CAU_HOI_DANG_XUAT_MOI_NOI}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          autoFocus
          onClick={onXacNhan}
          disabled={dang_chay}
          className={`rounded px-3 py-1.5 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
        >
          {NHAN_XAC_NHAN_DANG_XUAT}
        </button>
        <button
          type="button"
          onClick={onHuy}
          disabled={dang_chay}
          className="rounded border border-vien px-3 py-1.5 text-sm"
        >
          {NHAN_HUY}
        </button>
      </div>
      {loi === null || loi === undefined ? null : (
        <p role="alert" data-o="loi-dang-xuat" className="text-sm text-loi">
          {cauLoi(loi)}
        </p>
      )}
    </div>
  );
}
