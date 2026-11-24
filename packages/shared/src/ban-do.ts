/**
 * **Bản đồ dự án — luật dữ liệu** của SPEC mục 20.1 (Chủ chốt 04/11/2026, T-127 = A).
 *
 * Một chỗ cho khoảng giá trị, thông điệp lỗi và quyền của sáu trường mới, để API
 * (cửa ghi), CLI và MCP nói **cùng một câu** khi giá trị sai — 20.1: "Giá trị
 * ngoài khoảng: `INVALID_INPUT` kèm khoảng đúng".
 *
 * | Trường | Ở đâu | Giá trị | Mặc định | Ai sửa |
 * |---|---|---|---|---|
 * | `uu_tien` | dự án | 1–5 | 3 | chủ, `coordinator` |
 * | `dang_day` | dự án | có/không | không | chủ, `coordinator`, `manager` của dự án (20.8) |
 * | `duy_tri` | dự án | có/không | không | chủ, `coordinator`, `manager` của dự án (20.8) |
 * | `ten_ngan` | dự án | 0–24 ký tự | trống | chủ, `coordinator` |
 * | `khoi_lon` | ticket | 1–99 hoặc trống | trống | chủ, `coordinator`, `manager` của dự án |
 * | `doi` | ticket có `khoi_lon` | 0–100 | trống | chủ, `coordinator`, `manager` của dự án |
 * | Giới hạn WIP | workspace | 1–10 | 3 | chủ |
 *
 * CHECK và trigger của migration 0029 là hàng rào cuối; các hàm ở đây là lớp
 * thứ nhất (cửa ghi kiểm nhập, không tin client — `lenh-khung.ts`).
 */

import { BatonError } from './loi.js';
import { vaoDuocDuAn, type AiGoi, type KetQuaQuyen } from './quyen.js';

/* ------------------------------------------------------------------ *
 * Khoảng giá trị — 20.1
 * ------------------------------------------------------------------ */

export const UU_TIEN_DU_AN_TOI_THIEU = 1;
export const UU_TIEN_DU_AN_TOI_DA = 5;
export const UU_TIEN_DU_AN_MAC_DINH = 3;

export const TEN_NGAN_TOI_DA = 24;

export const KHOI_LON_TOI_THIEU = 1;
export const KHOI_LON_TOI_DA = 99;

export const DOI_TOI_THIEU = 0;
export const DOI_TOI_DA = 100;

export const GIOI_HAN_WIP_TOI_THIEU = 1;
export const GIOI_HAN_WIP_TOI_DA = 10;
export const GIOI_HAN_WIP_MAC_DINH = 3;

/**
 * Một số nguyên trong khoảng `[min, max]`, hoặc `INVALID_INPUT` **kèm khoảng
 * đúng** (20.1). Không nhận chuỗi số, số thực, `NaN`: hình của API là số JSON;
 * CLI tự đổi chữ người gõ sang số trước khi gửi.
 */
export function kiemSoNguyenKhoang(gia_tri: unknown, ten: string, min: number, max: number): number {
  if (
    typeof gia_tri !== 'number' ||
    !Number.isInteger(gia_tri) ||
    gia_tri < min ||
    gia_tri > max
  ) {
    throw new BatonError('INVALID_INPUT', {
      message: `${ten} phải là số nguyên ${String(min)}–${String(max)}.`,
    });
  }
  return gia_tri;
}

/** `uu_tien` của dự án: 1–5 (5 = quan trọng nhất). */
export function kiemUuTienDuAn(gia_tri: unknown): number {
  return kiemSoNguyenKhoang(gia_tri, 'uu_tien', UU_TIEN_DU_AN_TOI_THIEU, UU_TIEN_DU_AN_TOI_DA);
}

/** Giới hạn WIP của workspace: 1–10. */
export function kiemGioiHanWip(gia_tri: unknown): number {
  return kiemSoNguyenKhoang(gia_tri, 'gioi_han_wip', GIOI_HAN_WIP_TOI_THIEU, GIOI_HAN_WIP_TOI_DA);
}

/** `khoi_lon` của ticket: 1–99, `null` = bỏ khối lớn. */
export function kiemKhoiLon(gia_tri: unknown): number | null {
  if (gia_tri === null) return null;
  return kiemSoNguyenKhoang(gia_tri, 'khoi_lon', KHOI_LON_TOI_THIEU, KHOI_LON_TOI_DA);
}

/** `doi` của ticket: 0–100, `null` = xoá vị trí trên đồi. */
export function kiemDoi(gia_tri: unknown): number | null {
  if (gia_tri === null) return null;
  return kiemSoNguyenKhoang(gia_tri, 'doi', DOI_TOI_THIEU, DOI_TOI_DA);
}

/**
 * Số ký tự **như SQLite đếm** (`length()` trên TEXT = số điểm mã), để lớp code và
 * CHECK `length(ten_ngan) <= 24` của 0029 đồng ý với nhau kể cả khi có emoji
 * (`'😀'.length` của JS là 2).
 */
export function soKyTu(chu: string): number {
  return [...chu].length;
}

/**
 * `ten_ngan` của dự án: chuỗi 0–24 ký tự sau khi cắt khoảng trắng. Rỗng (hoặc
 * `null`) ⇒ `null`, tức "dùng tên đầy đủ" (20.1 cột Mặc định).
 */
export function kiemTenNgan(gia_tri: unknown): string | null {
  if (gia_tri === null) return null;
  if (typeof gia_tri !== 'string') {
    throw new BatonError('INVALID_INPUT', {
      message: `ten_ngan phải là chữ, 0–${String(TEN_NGAN_TOI_DA)} ký tự.`,
    });
  }
  const t = gia_tri.trim();
  if (t === '') return null;
  if (soKyTu(t) > TEN_NGAN_TOI_DA) {
    throw new BatonError('INVALID_INPUT', {
      message: `ten_ngan phải dài 0–${String(TEN_NGAN_TOI_DA)} ký tự (đang ${String(soKyTu(t))}).`,
    });
  }
  return t;
}

/** Thông điệp của câu hỏi SPEC (a): bật `dang_day` cho dự án duy trì. */
export const LOI_DUY_TRI_KHONG_DAY = 'Dự án duy trì không đẩy — tắt duy_tri trước.';

/** Thông điệp: đặt `doi` cho ticket (sau cả request) không có `khoi_lon` — 20.1. */
export const LOI_DOI_KHONG_KHOI_LON =
  'Chỉ đặt được doi (vị trí trên đồi) cho ticket có khoi_lon (khối việc lớn).';

/* ------------------------------------------------------------------ *
 * Đồng hồ WIP — 20.1, 20.2
 * ------------------------------------------------------------------ */

/**
 * Đồng hồ WIP "Đang đẩy n/<giới hạn>" — đỏ khi `n > giới hạn` (20.2). Vượt
 * **không chặn** (20.1, 20.7 "chặn cứng khi vượt WIP" là KHÔNG làm).
 */
export interface TrangThaiWip {
  dang_day: number;
  gioi_han: number;
  vuot: boolean;
}

export function trangThaiWip(dang_day: number, gioi_han: number): TrangThaiWip {
  return { dang_day, gioi_han, vuot: dang_day > gioi_han };
}

/* ------------------------------------------------------------------ *
 * Quyền — cột "Ai sửa" của 20.1
 * ------------------------------------------------------------------ *
 *
 * Hai hàm riêng, cùng khuôn `quyenNoiDieuPhoi` của `quyen.ts`: cột "Ai sửa" của
 * 20.1 không phải một hàng của bảng quyền mục 3, nên không mượn một hàng cũ (mượn
 * là âm thầm đổi nghĩa hàng đó, và ghi đè quyền của chủ cho hàng kia sẽ lan sang
 * đây). Thứ tự giữ nguyên `quyen()`: chủ → agent bị tắt → vai trò → phạm vi.
 */

function tuChoi(ly_do: string): KetQuaQuyen {
  return { cho_phep: false, ma: 'FORBIDDEN', ly_do };
}

/**
 * Sửa `uu_tien`, `ten_ngan` của dự án: **chủ và `coordinator`** (20.1, 20.8).
 * (`dang_day`, `duy_tri` từ 20.8 mở thêm cho `manager` của dự án — xem
 * `quyenSuaTrangThaiBanDo`.) Phạm vi dự án của `coordinator` (dự án nó được vào)
 * do đường tra dự án lọc — ngoài phạm vi ra `NOT_FOUND` như id bịa (19.12 câu 15).
 */
export function quyenSuaBanDoDuAn(ai: AiGoi): KetQuaQuyen {
  if (ai.loai === 'chu') return { cho_phep: true };
  if (ai.disabled) return tuChoi('Agent đã bị tắt.');
  if (ai.vai_tro !== 'coordinator') {
    return tuChoi(
      `Chỉ chủ và agent coordinator sửa được ưu tiên, tên ngắn của dự án (SPEC 20.1, 20.8); vai ${ai.vai_tro} thì không.`,
    );
  }
  return { cho_phep: true };
}

/**
 * Vai trò **có thể** sửa `khoi_lon`/`doi` — kiểm trước khi tra ticket, để
 * `worker`/`reviewer` luôn nhận `FORBIDDEN` dù ticket có hay không (không kênh dò).
 */
export function vaiTroSuaKhoiTicket(ai: AiGoi): KetQuaQuyen {
  if (ai.loai === 'chu') return { cho_phep: true };
  if (ai.disabled) return tuChoi('Agent đã bị tắt.');
  if (ai.vai_tro !== 'coordinator' && ai.vai_tro !== 'manager') {
    return tuChoi(
      `Chỉ chủ, agent coordinator và manager của dự án sửa được khoi_lon, doi (SPEC 20.1); vai ${ai.vai_tro} thì không.`,
    );
  }
  return { cho_phep: true };
}

/**
 * Sửa `khoi_lon`, `doi` của ticket thuộc `project_id`: **chủ, `coordinator`,
 * `manager` của dự án**. "Manager của dự án" = agent quản lý của dự án đó (mục 2,
 * `du_an_minh_quan_ly`) — một `manager` chỉ được vào dự án mà không quản lý nó
 * thì không (`cau-hoi-spec.md` #188, chốt tạm hướng hẹp). Cả hai vai vẫn qua cửa dự án.
 */
export function quyenSuaKhoiTicket(ai: AiGoi, project_id: string): KetQuaQuyen {
  const vai = vaiTroSuaKhoiTicket(ai);
  if (!vai.cho_phep || ai.loai === 'chu') return vai;
  if (!vaoDuocDuAn(ai, project_id)) return tuChoi('Agent không được vào dự án này.');
  if (ai.vai_tro === 'manager' && !ai.du_an_minh_quan_ly.includes(project_id)) {
    return tuChoi('Manager chỉ sửa được khoi_lon, doi trong dự án mình quản lý (SPEC 20.1).');
  }
  return { cho_phep: true };
}

/* ------------------------------------------------------------------ *
 * Thanh công cụ dự án — SPEC 20.8 (Chủ chốt 04/11/2026, T-131)
 * ------------------------------------------------------------------ */

/** Bốn giá trị của ô "Trạng thái bản đồ" (20.8). Lưu trữ **không** nằm trong ô. */
export const TRANG_THAI_BAN_DO = ['dang_day', 'hang_cho', 'tam_dung', 'duy_tri'] as const;
export type TrangThaiBanDo = (typeof TRANG_THAI_BAN_DO)[number];

/** Nhãn tiếng Việt của bốn giá trị — đúng chữ cột "Chọn" của bảng 20.8. */
export const NHAN_TRANG_THAI_BAN_DO: Record<TrangThaiBanDo, string> = {
  dang_day: 'Đang đẩy',
  hang_cho: 'Hàng chờ',
  tam_dung: 'Tạm dừng',
  duy_tri: 'Duy trì',
};

/** Bảng 20.8: một giá trị của ô ⇒ ba trường đã có của dự án. */
export const GHI_TRANG_THAI_BAN_DO: Record<
  TrangThaiBanDo,
  { trang_thai: 'active' | 'paused'; dang_day: boolean; duy_tri: boolean }
> = {
  dang_day: { trang_thai: 'active', dang_day: true, duy_tri: false },
  hang_cho: { trang_thai: 'active', dang_day: false, duy_tri: false },
  tam_dung: { trang_thai: 'paused', dang_day: false, duy_tri: false },
  duy_tri: { trang_thai: 'active', dang_day: false, duy_tri: true },
};

/** Thông điệp khi giá trị sai — kèm danh sách đúng (20.1 "kèm khoảng đúng"). */
export const LOI_TRANG_THAI_BAN_DO = `trang_thai_ban_do chỉ nhận ${TRANG_THAI_BAN_DO.join(', ')}.`;

export function laTrangThaiBanDo(x: unknown): x is TrangThaiBanDo {
  return typeof x === 'string' && (TRANG_THAI_BAN_DO as readonly string[]).includes(x);
}

export function kiemTrangThaiBanDo(gia_tri: unknown): TrangThaiBanDo {
  if (!laTrangThaiBanDo(gia_tri)) {
    throw new BatonError('INVALID_INPUT', { message: LOI_TRANG_THAI_BAN_DO });
  }
  return gia_tri;
}

/**
 * Chiều ngược của bảng 20.8: ba trường ⇒ giá trị của ô. `archived` ⇒ `null`
 * (Lưu trữ nằm ngoài ô). Dữ liệu không khớp hàng nào của bảng (vd `paused` mà
 * vẫn `dang_day` — đặt qua trường cũ) xếp theo luật làn của 20.4: Tạm dừng thắng,
 * rồi Duy trì, rồi Đang đẩy.
 */
export function suyTrangThaiBanDo(d: {
  trang_thai: string;
  dang_day: boolean;
  duy_tri: boolean;
}): TrangThaiBanDo | null {
  if (d.trang_thai === 'archived') return null;
  if (d.trang_thai === 'paused') return 'tam_dung';
  if (d.duy_tri) return 'duy_tri';
  if (d.dang_day) return 'dang_day';
  return 'hang_cho';
}

/**
 * Sửa trạng thái bản đồ (`trang_thai_ban_do`, hoặc `dang_day`/`duy_tri` trực tiếp)
 * của `project_id`: **chủ, `coordinator`, `manager` của dự án đó** (20.8). Manager
 * của dự án = agent quản lý (`du_an_minh_quan_ly`), nếp `quyenSuaKhoiTicket`.
 * Phạm vi dự án (được vào) do đường tra dự án lọc ⇒ `NOT_FOUND` như id bịa.
 */
export function vaiTroSuaTrangThaiBanDo(ai: AiGoi): KetQuaQuyen {
  if (ai.loai === 'chu') return { cho_phep: true };
  if (ai.disabled) return tuChoi('Agent đã bị tắt.');
  if (ai.vai_tro !== 'coordinator' && ai.vai_tro !== 'manager') {
    return tuChoi(
      `Chỉ chủ, agent coordinator và manager của dự án đổi được trạng thái bản đồ của dự án (SPEC 20.8); vai ${ai.vai_tro} thì không.`,
    );
  }
  return { cho_phep: true };
}

export function quyenSuaTrangThaiBanDo(ai: AiGoi, project_id: string): KetQuaQuyen {
  const vai = vaiTroSuaTrangThaiBanDo(ai);
  if (!vai.cho_phep || ai.loai === 'chu') return vai;
  if (ai.vai_tro === 'manager' && !ai.du_an_minh_quan_ly.includes(project_id)) {
    return tuChoi('Manager chỉ đổi được trạng thái bản đồ của dự án mình quản lý (SPEC 20.8).');
  }
  return { cho_phep: true };
}

/** Gọi một hàm quyền ở trên và **ném** `FORBIDDEN` nếu không được. */
export function batBuocKetQuaQuyen(kq: KetQuaQuyen): void {
  if (!kq.cho_phep) throw new BatonError('FORBIDDEN', { message: kq.ly_do });
}
