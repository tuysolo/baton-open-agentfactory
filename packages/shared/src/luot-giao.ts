/**
 * **Lượt giao** — luật thuần của SPEC mục 5 (+ 19.1, 19.5).
 *
 * Cùng kỷ luật với `luat-trang-thai.ts` và `nguoi-cam.ts`: không I/O, không
 * `Date.now()`. Mọi hàm phụ thuộc thời gian nhận `bay_gio` qua tham số, nên test
 * được bằng giờ tiêm vào (`quyet-dinh.md` 01/10, bài học của `apDungLuat`).
 */

import { BatonError } from './loi.js';
import { kiemChuTuyChon } from './hop-le.js';
import {
  TRANG_THAI_LUOT_GIAO_MO,
  laMaHopLe,
  type KetQuaNop,
  type LoaiLuotGiao,
  type TrangThaiLuotGiao,
} from './ma-nhan.js';

/* ------------------------------------------------------------------ *
 * Hạn phản hồi — SPEC mục 5
 * ------------------------------------------------------------------ */

/** "Có thể đặt **hạn phản hồi** (mặc định 15 phút)" — SPEC mục 5. */
export const HAN_PHAN_HOI_MAC_DINH_PHUT = 15;

/** Giới hạn mềm cho `--timeout` của `baton assign` (SPEC mục 13): 1 phút – 30 ngày. */
export const HAN_PHAN_HOI_TOI_DA_PHUT = 30 * 24 * 60;

/**
 * Số phút của hạn phản hồi. Không truyền → mặc định 15 phút (SPEC mục 5).
 *
 * `null` là **tắt hạn phản hồi**: SPEC nói "có thể đặt hạn phản hồi", nên không
 * đặt phải là một trạng thái biểu diễn được. Lượt không có hạn thì không bao giờ
 * là "Không phản hồi".
 */
export function kiemHanPhanHoiPhut(phut: unknown): number | null {
  if (phut === undefined) return HAN_PHAN_HOI_MAC_DINH_PHUT;
  if (phut === null) return null;
  if (typeof phut !== 'number' || !Number.isInteger(phut) || phut < 1) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Hạn phản hồi phải là số phút nguyên ≥ 1.',
    });
  }
  if (phut > HAN_PHAN_HOI_TOI_DA_PHUT) {
    throw new BatonError('INVALID_INPUT', {
      message: `Hạn phản hồi tối đa ${String(HAN_PHAN_HOI_TOI_DA_PHUT)} phút.`,
    });
  }
  return phut;
}

/** Mốc hạn phản hồi từ lúc giao — SPEC mục 5. */
export function hanPhanHoiLuc(bay_gio: number, phut: number | null): number | null {
  return phut === null ? null : bay_gio + phut * 60_000;
}

/* ------------------------------------------------------------------ *
 * Kiểm mã
 * ------------------------------------------------------------------ */

/** Loại lượt: `work` hoặc `review` — SPEC mục 0.1, 19.1. */
export function kiemLoaiLuotGiao(loai: unknown): LoaiLuotGiao {
  if (loai === undefined) return 'work';
  if (!laMaHopLe('loai_luot_giao', loai)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Loại lượt giao phải là một trong: work, review.',
    });
  }
  return loai;
}

/* ------------------------------------------------------------------ *
 * Lượt "mở" — SPEC 19.1
 * ------------------------------------------------------------------ */

/**
 * Lượt **mở** = `pending` hoặc `in_progress` (SPEC 19.1).
 * `submitted` **không** còn mở, mà đang **chờ nghiệm thu**.
 */
export function laLuotMo(trang_thai: TrangThaiLuotGiao): boolean {
  return (TRANG_THAI_LUOT_GIAO_MO as readonly string[]).includes(trang_thai);
}

/* ------------------------------------------------------------------ *
 * "Không phản hồi" — SPEC mục 5
 * ------------------------------------------------------------------ */

/**
 * "Quá hạn phản hồi mà chưa nhận thì lượt hiện **Không phản hồi** ở Tổng quan
 * (**lượt không tự huỷ**)" — SPEC mục 5.
 *
 * Đây là **giá trị tính được**, không phải trạng thái thứ 7: `trang_thai` của DB
 * vẫn là `pending`, và lệnh "nhận" vẫn chạy được bình thường sau hạn.
 */
export function laKhongPhanHoi(
  luot: { trang_thai: TrangThaiLuotGiao; han_phan_hoi_luc: number | null },
  bay_gio: number,
): boolean {
  if (luot.trang_thai !== 'pending') return false;
  if (luot.han_phan_hoi_luc === null) return false;
  return bay_gio > luot.han_phan_hoi_luc;
}

/* ------------------------------------------------------------------ *
 * Báo cáo nộp — SPEC mục 5 ("Báo cáo nộp"), 19.2
 * ------------------------------------------------------------------ */

/**
 * Năm mục của báo cáo nộp, **đúng thứ tự SPEC mục 5**:
 * Đã làm · Kiểm chứng · Nhánh và commit · Rủi ro, điều cần xem kỹ ·
 * Việc phát sinh (không tự làm).
 *
 * Tên cột trong DB mang tiền tố `bc_` (migration 0005); ở đây để tên trần vì đó
 * là tên trường của API và CLI.
 */
export const MUC_BAO_CAO = [
  'da_lam',
  'kiem_chung',
  'nhanh_va_commit',
  'rui_ro',
  'viec_phat_sinh',
] as const;

export type MucBaoCao = (typeof MUC_BAO_CAO)[number];

/** Nhãn tiếng Việt của 5 mục — SPEC mục 5 (dùng cho UI và thông điệp lỗi). */
export const NHAN_MUC_BAO_CAO = {
  da_lam: 'Đã làm',
  kiem_chung: 'Kiểm chứng',
  nhanh_va_commit: 'Nhánh và commit',
  rui_ro: 'Rủi ro, điều cần xem kỹ',
  viec_phat_sinh: 'Việc phát sinh (không tự làm)',
} as const satisfies Record<MucBaoCao, string>;

/** Mỗi mục là markdown; cùng giới hạn với một trường brief. */
export const DAI_MUC_BAO_CAO_TOI_DA = 20_000;

export type BaoCaoNop = Record<MucBaoCao, string | null>;

/**
 * **Kết quả nộp** — `done` · `partial` · `blocked` (SPEC mục 0.1, 5, 19.2).
 *
 * **Bắt buộc**, không có mặc định: 19.2 cho ba kết quả ba hành vi ticket khác
 * hẳn nhau (Xong/Chờ kiểm chứng · giữ Đang làm · về Cần làm), nên đoán hộ một
 * giá trị là đoán hộ trạng thái ticket.
 */
export function kiemKetQuaNop(ket_qua: unknown): KetQuaNop {
  if (!laMaHopLe('ket_qua_nop', ket_qua)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Kết quả nộp phải là một trong: done, partial, blocked (SPEC mục 0.1).',
    });
  }
  return ket_qua;
}

/**
 * Năm mục của báo cáo. Mục để trống lưu `null`.
 *
 * SPEC mục 5 nói "Báo cáo nộp (có cấu trúc, **bắt buộc khi nộp**)" nhưng **không
 * nói từng mục có bắt buộc hay không**. Chốt tạm: `ket_qua` bắt buộc (nó quyết
 * trạng thái ticket ở 19.2), 5 mục cho để trống — xem câu hỏi SPEC gửi M-Baton.
 * Không tự dựng thêm luật từ chối mà SPEC không viết.
 */
export function kiemBaoCaoNop(nguon: Partial<Record<MucBaoCao, unknown>>): BaoCaoNop {
  const ra = {} as BaoCaoNop;
  for (const muc of MUC_BAO_CAO) {
    ra[muc] = kiemChuTuyChon(nguon[muc], NHAN_MUC_BAO_CAO[muc], DAI_MUC_BAO_CAO_TOI_DA);
  }
  return ra;
}

/* ------------------------------------------------------------------ *
 * Trả lại — SPEC 19.5
 * ------------------------------------------------------------------ */

/**
 * Tiền tố của khối được chèn vào đầu brief lượt mới — SPEC 19.5, chốt 19.12 câu 35.
 *
 * Chữ chốt là khối `Lý do trả lại: <lý do>` (một dòng, hai chấm rồi lý do), **không**
 * phải một tiêu đề markdown với lý do ở dòng sau.
 */
export const TIEU_DE_LY_DO_TRA_LAI = 'Lý do trả lại:';

/**
 * Brief của lượt mới sau khi trả lại = **brief cũ cộng khối "Lý do trả lại" đặt ở
 * đầu** (SPEC 19.5, chốt 19.12 câu 35).
 *
 * Brief chỉ có 8 trường cố định của mục 4 và **không có trường "Lý do trả lại"**;
 * 19.12 câu 35 chốt: chèn vào **đầu `muc_tieu`** dạng khối `Lý do trả lại: <lý do>`,
 * rồi tới mục tiêu cũ. Lượt mới vẫn giữ `luot_truoc_id` trỏ lượt bị trả, nên UI muốn
 * vẽ khối này thành mục riêng cũng không mất dữ liệu.
 *
 * Trả lại **nhiều lần** thì mỗi lần chèn thêm một mục nữa lên trên, lần gần nhất
 * ở trên cùng — đúng "đặt ở đầu", và không lần nào mất.
 */
export function briefCongLyDoTraLai(muc_tieu_cu: string | null, ly_do: string): string {
  const dau = `${TIEU_DE_LY_DO_TRA_LAI} ${ly_do}`;
  return muc_tieu_cu === null || muc_tieu_cu.length === 0 ? dau : `${dau}\n\n${muc_tieu_cu}`;
}

/**
 * Hạn phản hồi **áp lại** cho lượt mới (SPEC 19.5).
 *
 * Lượt chỉ lưu mốc hạn tuyệt đối (`han_phan_hoi_luc`), không lưu số phút, nên số
 * phút được suy ngược từ lượt cũ: `han_phan_hoi_luc - tao_luc`. Lượt cũ không
 * đặt hạn thì lượt mới cũng không — "áp lại" nghĩa là áp **cùng** hạn, không
 * phải áp mặc định 15 phút lên một lượt đã cố ý tắt hạn.
 */
export function hanPhanHoiApLai(
  luot_cu: { tao_luc: number; han_phan_hoi_luc: number | null },
  bay_gio: number,
): number | null {
  if (luot_cu.han_phan_hoi_luc === null) return null;
  const khoang = luot_cu.han_phan_hoi_luc - luot_cu.tao_luc;
  // Dữ liệu cũ hỏng (hạn trước lúc tạo) không được sinh ra một hạn đã qua ngay
  // lúc giao: tối thiểu 1 phút.
  return bay_gio + Math.max(60_000, khoang);
}

/* ------------------------------------------------------------------ *
 * Tỉ lệ đạt lần đầu — SPEC 19.5
 * ------------------------------------------------------------------ */

/** Cửa sổ của tỉ lệ đạt lần đầu: **30 ngày gần nhất** — SPEC 19.5. */
export const CUA_SO_DAT_LAN_DAU_MS = 30 * 24 * 60 * 60 * 1000;

/** Một lượt, rút gọn còn những gì phép tính 19.5 cần. */
export interface LuotChoTiLe {
  ticket_id: string;
  loai: LoaiLuotGiao;
  trang_thai: TrangThaiLuotGiao;
  so_luot: number;
  /** `null` = chưa nộp lần nào. */
  nop_luc: number | null;
}

export interface TiLeDatLanDau {
  /** Tử số: số ticket mà lượt `work` **đầu tiên** của agent được `accepted`. */
  dat: number;
  /** Mẫu số: số ticket agent đã **nộp ít nhất 1 lần** trong cửa sổ. */
  da_nop: number;
  /** `null` khi mẫu số bằng 0 — không có tỉ lệ, không phải 0%. */
  ti_le: number | null;
}

/**
 * **Tỉ lệ đạt lần đầu** của một agent — SPEC 19.5:
 * "số ticket mà lượt `work` **đầu tiên** của agent được `accepted` ÷ số ticket
 * agent **đã nộp ít nhất 1 lần**", tính **30 ngày gần nhất**.
 *
 * Hàm **thuần**, `bay_gio` qua tham số (cùng kỷ luật với `apDungLuat`). Vào là
 * các lượt **của chính agent đó**; hàm tự lọc loại `work` và tự gom theo ticket.
 *
 * Ba quyết định đọc SPEC, vì chữ không nói hết:
 *   1. **"Lượt `work` đầu tiên"** = lượt `work` có `so_luot` **nhỏ nhất** của
 *      agent trên ticket đó. Nên "nộp → bị trả lại → lần 2 mới đạt" **không**
 *      tính là đạt lần đầu: lượt đầu ở `returned`.
 *   2. **Mẫu số là ticket, không phải lượt** (SPEC viết "số ticket"): nộp lại ba
 *      lần trên cùng ticket vẫn là 1.
 *   3. **Cửa sổ áp theo lúc nộp** (`nop_luc`): ticket vào mẫu khi có ít nhất một
 *      lượt `work` của agent được nộp trong 30 ngày qua. Lượt `review` không
 *      tính — SPEC viết thẳng "lượt `work`", và lượt review tự `accepted` (19.3)
 *      nên gộp vào sẽ đẩy tỉ lệ lên vô nghĩa.
 */
export function tiLeDatLanDau(
  ds: readonly LuotChoTiLe[],
  bay_gio: number,
  cua_so_ms: number = CUA_SO_DAT_LAN_DAU_MS,
): TiLeDatLanDau {
  const tu_luc = bay_gio - cua_so_ms;

  /** ticket → lượt `work` có `so_luot` nhỏ nhất, và "đã nộp trong cửa sổ chưa". */
  const theo_ticket = new Map<string, { dau: LuotChoTiLe; da_nop_trong_cua_so: boolean }>();

  for (const l of ds) {
    if (l.loai !== 'work') continue;
    const trong_cua_so = l.nop_luc !== null && l.nop_luc >= tu_luc && l.nop_luc <= bay_gio;
    const hien = theo_ticket.get(l.ticket_id);
    if (hien === undefined) {
      theo_ticket.set(l.ticket_id, { dau: l, da_nop_trong_cua_so: trong_cua_so });
      continue;
    }
    if (l.so_luot < hien.dau.so_luot) hien.dau = l;
    if (trong_cua_so) hien.da_nop_trong_cua_so = true;
  }

  let dat = 0;
  let da_nop = 0;
  for (const { dau, da_nop_trong_cua_so } of theo_ticket.values()) {
    if (!da_nop_trong_cua_so) continue;
    da_nop += 1;
    if (dau.trang_thai === 'accepted') dat += 1;
  }

  return { dat, da_nop, ti_le: da_nop === 0 ? null : dat / da_nop };
}
