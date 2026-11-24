/**
 * Kiểm dữ liệu nhập theo đúng chữ trong SPEC. Sai thì ném `BatonError`.
 */

import { BatonError } from './loi.js';
import { LIMIT_TRANG_MAC_DINH, LIMIT_TRANG_TOI_DA, NGUON_MA_DU_AN } from './kieu.js';
import {
  TRANG_THAI_TICKET,
  TRANG_THAI_TICKET_KHI_TAO,
  laMaHopLe,
  type TrangThaiDuAn,
  type TrangThaiTicket,
  type TrangThaiTicketKhiTao,
  type UuTien,
  type VaiTroAgent,
} from './ma-nhan.js';
import { TRUONG_BRIEF, type Brief } from './kieu.js';

/**
 * Mã dự án: 2–6 chữ A–Z — SPEC mục 2.
 *
 * Dựng từ `NGUON_MA_DU_AN` chứ không viết lại lớp ký tự: mã **ticket**
 * (`MAU_MA_TICKET` ở `kieu.ts`) chứa đúng lớp đó, và hai bản chép là hai luật.
 */
export const MAU_MA_DU_AN = new RegExp(`^${NGUON_MA_DU_AN}$`);

/** Thông điệp lỗi đúng chữ SPEC mục 2. */
export const LOI_MA_DU_AN_SAI_DINH_DANG = 'Mã chỉ gồm 2–6 chữ A–Z';
export const LOI_MA_DU_AN_TRUNG = 'Mã dự án đã có';

export function laMaDuAnHopLe(ma: unknown): ma is string {
  return typeof ma === 'string' && MAU_MA_DU_AN.test(ma);
}

/** Trả mã dự án đã kiểm; sai định dạng → `INVALID_INPUT`. */
export function kiemMaDuAn(ma: unknown): string {
  if (!laMaDuAnHopLe(ma)) {
    throw new BatonError('INVALID_INPUT', { message: LOI_MA_DU_AN_SAI_DINH_DANG });
  }
  return ma;
}

/** Tiêu đề ticket: 1–200 ký tự **sau khi cắt khoảng trắng** — SPEC mục 4. */
export const DAI_TIEU_DE_TOI_DA = 200;

export function kiemTieuDeTicket(tieuDe: unknown): string {
  const t = typeof tieuDe === 'string' ? tieuDe.trim() : '';
  if (t.length < 1 || t.length > DAI_TIEU_DE_TOI_DA) {
    throw new BatonError('INVALID_INPUT', {
      message: `Tiêu đề phải có 1–${DAI_TIEU_DE_TOI_DA} ký tự.`,
    });
  }
  return t;
}

/** Tên agent: duy nhất trong workspace; ở đây chỉ kiểm rỗng — SPEC mục 3. */
export function kiemTenAgent(ten: unknown): string {
  const t = typeof ten === 'string' ? ten.trim() : '';
  if (t.length < 1 || t.length > 80) {
    throw new BatonError('INVALID_INPUT', { message: 'Tên agent phải có 1–80 ký tự.' });
  }
  return t;
}

/** Lý do bắt buộc (Huỷ ticket, trả lại lượt, bỏ qua mục Cần Chủ). */
export function kiemLyDo(lyDo: unknown): string {
  const t = typeof lyDo === 'string' ? lyDo.trim() : '';
  if (t.length < 1) throw new BatonError('REASON_REQUIRED');
  return t;
}

/** Tên dự án: bắt buộc, 1–120 ký tự sau khi cắt khoảng trắng — SPEC mục 2. */
export function kiemTenDuAn(ten: unknown): string {
  const t = typeof ten === 'string' ? ten.trim() : '';
  if (t.length < 1 || t.length > 120) {
    throw new BatonError('INVALID_INPUT', { message: 'Tên dự án phải có 1–120 ký tự.' });
  }
  return t;
}

/** Vai trò agent: **đúng 1 trong 4** — SPEC mục 1, 3. */
export function kiemVaiTroAgent(vai_tro: unknown): VaiTroAgent {
  if (!laMaHopLe('vai_tro_agent', vai_tro)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Vai trò phải là một trong: coordinator, manager, worker, reviewer.',
    });
  }
  return vai_tro;
}

/** Trạng thái dự án: `active` · `paused` · `archived` — SPEC mục 2. */
export function kiemTrangThaiDuAn(trang_thai: unknown): TrangThaiDuAn {
  if (!laMaHopLe('trang_thai_du_an', trang_thai)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Trạng thái dự án phải là một trong: active, paused, archived.',
    });
  }
  return trang_thai;
}

/**
 * Trường chữ tuỳ chọn (mô tả, màu, nhóm dự án, model). Chuỗi rỗng sau khi cắt
 * khoảng trắng được coi là **xoá trường** (`null`), không phải lỗi.
 */
export function kiemChuTuyChon(gia_tri: unknown, ten_truong: string, toi_da = 2000): string | null {
  if (gia_tri === undefined || gia_tri === null) return null;
  if (typeof gia_tri !== 'string') {
    throw new BatonError('INVALID_INPUT', { message: `${ten_truong} phải là chữ.` });
  }
  const t = gia_tri.trim();
  if (t.length === 0) return null;
  if (t.length > toi_da) {
    throw new BatonError('INVALID_INPUT', { message: `${ten_truong} tối đa ${toi_da} ký tự.` });
  }
  return t;
}

/** Cờ boolean từ dữ liệu JSON của client. */
export function kiemCo(gia_tri: unknown, ten_truong: string): boolean {
  if (typeof gia_tri !== 'boolean') {
    throw new BatonError('INVALID_INPUT', { message: `${ten_truong} phải là true hoặc false.` });
  }
  return gia_tri;
}

/** Trạng thái ticket: **đúng 1 trong 7**, cố định ở v0.1 — SPEC mục 4. */
export function kiemTrangThaiTicket(trang_thai: unknown): TrangThaiTicket {
  if (!laMaHopLe('trang_thai_ticket', trang_thai)) {
    throw new BatonError('INVALID_INPUT', {
      message:
        'Trạng thái ticket phải là một trong: backlog, todo, in_progress, verifying, done, canceled, duplicate.',
    });
  }
  return trang_thai;
}

/**
 * Thông điệp khi tạo ticket với trạng thái ngoài `TRANG_THAI_TICKET_KHI_TAO` —
 * dựng từ chính bảng mã (nhãn tiếng Việt + mã), nên máy chủ và CLI nói cùng một câu.
 */
export const LOI_TRANG_THAI_KHI_TAO = `Khi tạo ticket chỉ chọn được trạng thái ${TRANG_THAI_TICKET_KHI_TAO.map(
  (m) => `${TRANG_THAI_TICKET[m]} (${m})`,
).join(' hoặc ')}.`;

/**
 * Trạng thái ban đầu của ticket mới — SPEC mục 4 "Trạng thái khi tạo" (T-108 = B,
 * BAT-63). **Không gửi** (`undefined`) ⇒ mặc định `TRANG_THAI_TICKET_MAC_DINH`
 * (Cần làm). Chỉ nhận `todo` / `backlog`; mọi giá trị khác — kể cả trạng thái hợp
 * lệ khác (`in_progress`, `done`…), `null`, chuỗi rỗng, số — ⇒ `INVALID_INPUT`.
 */
export function kiemTrangThaiKhiTao(trang_thai: unknown): TrangThaiTicketKhiTao {
  if (trang_thai === undefined) return TRANG_THAI_TICKET_KHI_TAO[0];
  if (
    typeof trang_thai !== 'string' ||
    !(TRANG_THAI_TICKET_KHI_TAO as readonly string[]).includes(trang_thai)
  ) {
    throw new BatonError('INVALID_INPUT', { message: LOI_TRANG_THAI_KHI_TAO });
  }
  return trang_thai as TrangThaiTicketKhiTao;
}

/** Ưu tiên: **5 mức cố định**, mặc định `none` — SPEC mục 4. */
export function kiemUuTien(uu_tien: unknown): UuTien {
  if (!laMaHopLe('uu_tien', uu_tien)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Ưu tiên phải là một trong: urgent, high, medium, low, none.',
    });
  }
  return uu_tien;
}

/**
 * Một **nhãn** ticket: 1–50 ký tự sau khi cắt khoảng trắng (khớp CHECK của
 * migration 0001) — SPEC mục 4, 14.
 */
export const DAI_NHAN_TOI_DA = 50;

export function kiemNhanTicket(nhan: unknown): string {
  const t = typeof nhan === 'string' ? nhan.trim() : '';
  if (t.length < 1 || t.length > DAI_NHAN_TOI_DA) {
    throw new BatonError('INVALID_INPUT', {
      message: `Nhãn phải có 1–${String(DAI_NHAN_TOI_DA)} ký tự.`,
    });
  }
  return t;
}

/** Danh sách nhãn, bỏ trùng, giữ thứ tự gửi lên. */
export function kiemDanhSachNhan(ds: unknown): string[] {
  if (ds === undefined || ds === null) return [];
  if (!Array.isArray(ds)) {
    throw new BatonError('INVALID_INPUT', { message: 'Nhãn phải là một danh sách.' });
  }
  const ra: string[] = [];
  for (const n of ds) {
    const nhan = kiemNhanTicket(n);
    if (!ra.includes(nhan)) ra.push(nhan);
  }
  return ra;
}

/**
 * **Hạn** của ticket (tuỳ chọn) — SPEC mục 4. Epoch milliseconds; `null` = xoá hạn.
 *
 * Không kiểm "hạn phải ở tương lai": SPEC không nói vậy, và nhập dữ liệu cũ
 * (mục 16) mang hạn đã qua.
 */
export function kiemHanLuc(han: unknown): number | null {
  if (han === undefined || han === null) return null;
  if (typeof han !== 'number' || !Number.isInteger(han) || han <= 0) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Hạn phải là epoch milliseconds (số nguyên dương).',
    });
  }
  return han;
}

/**
 * 8 trường **brief** có cấu trúc (tuỳ chọn) — SPEC mục 4: Mục tiêu · Bối cảnh ·
 * Phạm vi · File và nguồn liên quan · Điều cấm · Xong là gì · Cách kiểm chứng ·
 * Nộp lại. Markdown, nên giới hạn dài như mô tả.
 */
export const DAI_TRUONG_BRIEF_TOI_DA = 20_000;

export function kiemBrief(nguon: Partial<Record<keyof Brief, unknown>>): Partial<Brief> {
  const ra: Partial<Brief> = {};
  for (const truong of TRUONG_BRIEF) {
    if (nguon[truong] === undefined) continue;
    ra[truong] = kiemChuTuyChon(nguon[truong], truong, DAI_TRUONG_BRIEF_TOI_DA);
  }
  return ra;
}

/** Nội dung bình luận: markdown, 1–100.000 ký tự sau khi cắt — SPEC mục 4. */
export function kiemNoiDungBinhLuan(noi_dung: unknown): string {
  const t = typeof noi_dung === 'string' ? noi_dung.trim() : '';
  if (t.length < 1 || t.length > 100_000) {
    throw new BatonError('INVALID_INPUT', { message: 'Bình luận phải có 1–100.000 ký tự.' });
  }
  return t;
}

/** Kẹp `limit` của phân trang vào khoảng cho phép. */
export function kiemLimit(limit: unknown): number {
  if (limit === undefined || limit === null) return LIMIT_TRANG_MAC_DINH;
  const n = typeof limit === 'number' ? limit : Number(limit);
  if (!Number.isInteger(n) || n < 1) {
    throw new BatonError('INVALID_INPUT', { message: 'limit phải là số nguyên ≥ 1.' });
  }
  return Math.min(n, LIMIT_TRANG_TOI_DA);
}
