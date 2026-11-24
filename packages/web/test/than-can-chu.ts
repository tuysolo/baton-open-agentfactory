/**
 * **Thân các đường Cần Chủ cho test** — dựng theo đúng hình của
 * `packages/api/src/doc-can-chu.ts` (`ManHinhCanChu`, `TheCanChu`, `DongDaXuLy`).
 *
 * Một chỗ duy nhất, và **mọi khoá đều có mặt**: một thân thiếu khoá làm component
 * rơi vào nhánh `undefined` và ca xanh vì một lý do khác hẳn lý do nó mang tên.
 * Cùng lý lẽ `than-tong-quan.ts`.
 */

import type { DongDaXuLy, KhoiCanChu, ManHinhCanChu, MucDoKhan, TheCanChu } from '../src/api';

export const GIO = 1_760_000_000_000;
export const GIO_MS = 3_600_000;

export function the(p: Partial<TheCanChu> & { ma: string }): TheCanChu {
  return {
    id: `ct-${p.ma}`,
    trang_thai: 'open',
    da_xu_ly: false,
    muc: 'urgent',
    loai: 'fyi',
    project_id: null,
    tieu_de: `Việc ${p.ma}`,
    boi_canh: null,
    lenh: null,
    can_tty: false,
    han_luc: null,
    tao_luc: GIO - GIO_MS,
    tao_boi_agent_id: null,
    ket_qua: null,
    phuong_an_da_chon: null,
    ket_luan_review: null,
    ly_do_bo_qua: null,
    xu_ly_luc: null,
    mo_lai_lan: 0,
    du_an: null,
    qua_han: false,
    qua_han_gio: null,
    phuong_an: [],
    phuong_an_de_xuat_id: null,
    file: [],
    ticket_lien_quan: [],
    ...p,
  };
}

/** Một phương án của mục `decision` — d.236. */
export function phuongAn(nhan: string, noi_dung: string, de_xuat = false): TheCanChu['phuong_an'][number] {
  return { id: `pa-${nhan}`, nhan, noi_dung, thu_tu: nhan.charCodeAt(0) - 64, de_xuat };
}

const MUC: readonly MucDoKhan[] = ['urgent', 'today', 'later'];

/**
 * Thân `GET /v1/can-chu`: **đúng ba khối**, đúng thứ tự 🔴 → 🟡 → ⚪, và huy hiệu
 * đếm **từ chính các thẻ** đưa vào — nên một fixture không thể nói "2 mục Gấp"
 * trong khi khối Gấp rỗng.
 */
export function manHinh(theo: Partial<Record<MucDoKhan, TheCanChu[]>> = {}): ManHinhCanChu {
  const khoi: KhoiCanChu[] = MUC.map((m) => ({
    muc: m,
    items: (theo[m] ?? []).map((t) => ({ ...t, muc: m })),
    cursor_sau: null,
  }));
  const so_theo_muc = { urgent: 0, today: 0, later: 0 };
  for (const k of khoi) so_theo_muc[k.muc] = k.items.length;
  const so_cho = khoi.reduce((s, k) => s + k.items.length, 0);
  return {
    huy_hieu: {
      so_cho,
      muc_cao_nhat: MUC.find((m) => so_theo_muc[m] > 0) ?? null,
      so_theo_muc,
    },
    khoi,
    /*
     * Mốc "bây giờ" của máy chủ — `GIO`, **không** `Date.now()`: chữ tương đối
     * của d.412 phải ghim được bằng số học, nếu không ca test sẽ đổi kết quả
     * theo ngày chạy.
     */
    bay_gio: GIO,
  };
}

export const MAN_HINH_RONG: ManHinhCanChu = manHinh();

export function dongDaXuLy(p: Partial<DongDaXuLy> & { ma: string }): DongDaXuLy {
  return {
    id: `ct-${p.ma}`,
    ngay: '2025-10-05',
    xu_ly_luc: GIO - GIO_MS,
    tieu_de: `Việc ${p.ma}`,
    tieu_de_ngan: `Việc ${p.ma}`,
    ket_qua: 'đã đọc',
    trang_thai: 'resolved',
    loai: 'fyi',
    project_id: null,
    ket_luan_review: null,
    ...p,
  };
}

/**
 * Thân `GET /v1/can-chu/da-xu-ly` — **mọi** khoá có mặt, kể cả `bay_gio`.
 *
 * `bay_gio` là `GIO`, **không** `Date.now()`: chữ tương đối của d.412 trên ô thời
 * gian của bảng phải ghim được bằng số học, nếu không ca test đổi kết quả theo
 * ngày chạy. Cùng mốc với `manHinh()`, nên hai nửa màn hình đếm từ một đồng hồ.
 */
export function bangDaXuLy(
  items: readonly DongDaXuLy[] = [],
  bay_gio = GIO,
): { items: readonly DongDaXuLy[]; cursor_sau: null; bay_gio: number } {
  return { items, cursor_sau: null, bay_gio };
}

export const DA_XU_LY_RONG = bangDaXuLy();
export const DU_AN_RONG = { items: [], cursor_sau: null };
