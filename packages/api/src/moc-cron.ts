/**
 * **Phép tính mốc giờ của các việc nền chạy hằng ngày** — dùng chung cho báo cáo
 * (mục 11, `cron-bao-cao.ts`) và sao lưu (mục 15, `sao-luu.ts`).
 *
 * Tách ra file riêng (BAT-8) chỉ để **không có vòng nhập**: `cron-bao-cao.ts` cần
 * hỏi `sao-luu.ts` "bản sao lưu gần nhất có chưa" (dòng cảnh báo trong báo cáo),
 * còn `sao-luu.ts` cần phép đổi giờ chủ → phút UTC. Hai file nhập lẫn nhau thì một
 * hằng tính lúc nạp module (`PHUT_UTC_*`) có thể đọc một hàm chưa được khai.
 *
 * Mọi luật và lý lẽ của hai hàm dưới đây **không đổi** so với lúc chúng còn nằm ở
 * `cron-bao-cao.ts` — xem khối đầu file đó ("Hai MỐC THỜI GIAN", "Nhịp TRỄ và nhịp
 * LẶP").
 */

import { MUI_GIO_CHU_PHUT } from '@baton/shared';

/** Số phút một ngày — dùng để quấn vòng phép đổi múi giờ. */
export const PHUT_MOT_NGAY = 24 * 60;

/**
 * Đổi một giờ-trên-tường **của chủ** thành **phút trong ngày UTC**.
 *
 * Đây là chỗ duy nhất làm phép trừ múi giờ cho nhịp cron, và nó đi qua
 * `MUI_GIO_CHU_PHUT` — **không** viết tay số 7. Quấn vòng theo modulo vì một giờ
 * sáng sớm của chủ rơi vào **ngày UTC hôm trước** (vd 02:00 giờ chủ = 19:00 UTC).
 */
export function phutUtcCuaGioChu(gio: number, phut = 0): number {
  return ((gio * 60 + phut - MUI_GIO_CHU_PHUT) % PHUT_MOT_NGAY + PHUT_MOT_NGAY) % PHUT_MOT_NGAY;
}

/**
 * Nhịp `moc_nhip` (epoch ms) có nằm trong **cửa sổ** `[phut_moc, phut_moc + tre]`
 * (phút trong ngày UTC) không? Hai biên **đều tính**; phép trừ quấn vòng theo ngày
 * nên một cửa sổ bắt qua nửa đêm UTC vẫn đúng.
 */
export function trongCuaSoTuMoc(moc_nhip: number, phut_moc: number, tre: number): boolean {
  const d = new Date(moc_nhip);
  const phut_ngay = d.getUTCHours() * 60 + d.getUTCMinutes();
  const lech = (phut_ngay - phut_moc + PHUT_MOT_NGAY) % PHUT_MOT_NGAY;
  return lech <= tre;
}
