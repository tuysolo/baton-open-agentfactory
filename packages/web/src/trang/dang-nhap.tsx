/**
 * **Trang đăng nhập của chủ** — SPEC mục 15 d.415.
 *
 * "Chủ đăng nhập bằng mật khẩu cộng mã TOTP (2 lớp)." Tầng máy chủ đã chốt **một
 * request, hai yếu tố** (`POST /v1/dang-nhap { mat_khau, ma_totp }`; lý lẽ ở
 * `packages/api/src/chu-dang-nhap.ts`, câu hỏi còn mở ở `spec-questions.md` #99),
 * nên màn hình này có **một** biểu mẫu với hai ô, không hai bước.
 *
 * ## Câu lỗi là câu của máy chủ, không phải câu của trang
 *
 * Máy chủ trả **cùng một** thân lỗi cho "sai mật khẩu" và "sai mã TOTP" — cố ý:
 * nói sai cái nào là cho người dò biết mật khẩu đã đúng. Trang vì thế **không**
 * được tự đoán nguyên nhân ("mã TOTP sai?") hay tự dịch mã lỗi: nó in đúng
 * `message` nhận được. Mọi câu ở tầng này đã là tiếng Việt (SPEC mục 13 d.379),
 * nên "lỗi tiếng Việt" là một tính chất của máy chủ mà trang không làm vỡ được.
 *
 * Trường hợp 429 (`RATE_LIMITED`, đang bị khoá) cũng in nguyên câu của máy chủ:
 * nó đã nói "Quá nhiều lần đăng nhập sai. Thử lại sau."
 *
 * **Không lưu gì vào `localStorage`.** Giấy tờ duy nhất là cookie `HttpOnly` do
 * máy chủ đặt; trang không thấy nó, không chép nó, không có gì để rò.
 */

import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cauLoi, dangNhap } from '../api';
import { useMotLan } from '../mot-lan';
import {
  LOP_CAU_LOI,
  LOP_O_NHAP,
  LOP_THE,
  LOP_TIEU_DE_TRANG,
  NUT_CHINH,
  NUT_MO_KHI_DISABLED,
} from '../vo/lop-nut';

export const NHAN_TIEU_DE = 'Đăng nhập Baton';
export const NHAN_MAT_KHAU = 'Mật khẩu';
export const NHAN_MA_TOTP = 'Mã xác thực (6 số)';
export const NHAN_NUT = 'Đăng nhập';

export function TrangDangNhap(): React.JSX.Element {
  const qc = useQueryClient();
  const [mat_khau, datMatKhau] = useState('');
  const [ma_totp, datMaTotp] = useState('');

  const mot = useMotLan();
  const gui = useMutation({
    mutationFn: () => dangNhap(mat_khau, ma_totp),
    onSuccess: async () => {
      /*
       * Xoá ô nhập **trước** khi đổi màn hình: mật khẩu không nên còn nằm trong
       * state của một component sắp bị tháo, và mã TOTP vừa dùng thì đã chết
       * (máy chủ nhích `totp_buoc_cuoi`).
       */
      datMatKhau('');
      datMaTotp('');
      // `/v1/toi` là thứ quyết định vỏ hay trang đăng nhập — bắt nó đọc lại.
      await qc.invalidateQueries({ queryKey: ['toi'] });
    },
  });

  function nop(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    // BAT-32: chốt ref đồng bộ — Enter hai lần liền không gửi lần hai khi lần một chưa xong.
    mot((tha) => {
      gui.mutate(undefined, { onSettled: tha });
    });
  }

  return (
    /*
     * Một cột hẹp giữa màn hình: tiêu đề cùng thang chữ của mọi trang, biểu mẫu
     * trong một thẻ lớp nổi (THIET-KE "Trang"). Không logo, không trang trí.
     */
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className={LOP_TIEU_DE_TRANG}>{NHAN_TIEU_DE}</h1>
      <form onSubmit={nop} className={`flex flex-col gap-3 p-4 ${LOP_THE}`}>
        <label className="flex flex-col gap-1 text-sm">
          {NHAN_MAT_KHAU}
          <input
            type="password"
            name="mat_khau"
            autoComplete="current-password"
            value={mat_khau}
            onChange={(e) => datMatKhau(e.target.value)}
            className={LOP_O_NHAP}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {NHAN_MA_TOTP}
          <input
            type="text"
            name="ma_totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={ma_totp}
            onChange={(e) => datMaTotp(e.target.value)}
            className={LOP_O_NHAP}
          />
        </label>
        <button
          type="submit"
          disabled={gui.isPending}
          className={`mt-1 rounded px-3 py-1.5 text-sm font-medium ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
        >
          {NHAN_NUT}
        </button>
      </form>
      {gui.isError ? (
        <p role="alert" className={LOP_CAU_LOI}>
          {cauLoi(gui.error)}
        </p>
      ) : null}
    </main>
  );
}
