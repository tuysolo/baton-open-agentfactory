/**
 * **Thân các đường ticket cho test** — dựng theo đúng hình của
 * `packages/api/src/doc-ticket.ts` và `doc-man-hinh-ticket.ts`.
 *
 * Một chỗ duy nhất, và **mọi khoá đều có mặt**: một thân thiếu khoá làm component
 * rơi vào nhánh `undefined` và ca xanh vì một lý do khác hẳn lý do nó mang tên.
 * Cùng lý lẽ `than-can-chu.ts` và `than-tong-quan.ts`.
 *
 * `dong()` **tự suy `nhan_trang_thai` và `nhan_uu_tien`** từ bảng nhãn cắt ra từ
 * SPEC (`doc-spec.ts`), không nhận chúng qua tham số: máy chủ thật luôn trả nhãn
 * khớp mã, nên một fixture cho phép `trang_thai: 'done'` cạnh
 * `nhan_trang_thai: 'Đang làm'` sẽ dựng được một ca không tồn tại — và một ca như
 * vậy có thể **che** đúng cái lỗi "giao diện tự dịch mã thành nhãn".
 */

import type {
  BinhLuan,
  DongLichSu,
  LuotGiao,
  ManHinhDanhSach,
  ManHinhTicket,
  TicketCon,
  TicketDayDu,
  TicketDong,
  TrangThaiTicket,
  UuTien,
} from '../src/api';
import { nhanTrangThaiTicketTuSpec, nhanUuTienTuSpec } from './doc-spec';

export const GIO = 1_760_000_000_000;
export const GIO_MS = 3_600_000;

const NHAN_TT = nhanTrangThaiTicketTuSpec();
const NHAN_UT = nhanUuTienTuSpec();

function nhanTT(ma: TrangThaiTicket): string {
  const n = NHAN_TT[ma];
  if (n === undefined) throw new Error(`Bảng 0.1 không có trạng thái \`${ma}\``);
  return n;
}

function nhanUT(ma: UuTien): string {
  const n = NHAN_UT[ma];
  if (n === undefined) throw new Error(`Bảng 0.1 không có ưu tiên \`${ma}\``);
  return n;
}

/** Một dòng của `GET /v1/man-hinh-ticket`. */
export function dong(
  p: Partial<Omit<TicketDong, 'nhan_trang_thai' | 'nhan_uu_tien'>> & { ma: string },
): TicketDong {
  const trang_thai: TrangThaiTicket = p.trang_thai ?? 'todo';
  const uu_tien: UuTien = p.uu_tien ?? 'none';
  const so = Number(p.ma.split('-')[1] ?? '1');
  return {
    id: `tk-${p.ma}`,
    project_id: 'pj-SAI',
    so,
    tieu_de: `Việc ${p.ma}`,
    chiu_trach_nhiem: null,
    nguoi_dang_cam: null,
    han_luc: null,
    tao_luc: GIO - GIO_MS,
    cap_nhat_luc: GIO - GIO_MS,
    co_co: false,
    // Bốn trường của **thẻ** (BAT-6 đợt 2) — mặc định "không có gì", nên một ca
    // nói về nhãn/việc con phải **tự** đặt chúng.
    nhan: [],
    con_tong: 0,
    con_chua_ket: 0,
    can_chu_so: 0,
    xong_luc: null,
    // d.404 — đường đọc trả **tên** agent; `null` = chủ cầm, hoặc không ai cầm.
    nguoi_cam_ten: null,
    chiu_trach_nhiem_ten: null,
    ...p,
    trang_thai,
    uu_tien,
    nhom_trang_thai: p.nhom_trang_thai ?? 'planned',
    nhan_trang_thai: nhanTT(trang_thai),
    nhan_uu_tien: nhanUT(uu_tien),
  };
}

export function manHinhDanhSach(
  items: TicketDong[],
  tuy: Partial<ManHinhDanhSach> = {},
): ManHinhDanhSach {
  return { items, cursor_sau: null, bay_gio: GIO, ...tuy };
}

/** `n` dòng cho ca d.409 — mã `SAI-1` … `SAI-n`, rải đủ bảy trạng thái. */
export function nhieuDong(n: number): TicketDong[] {
  const tt = Object.keys(NHAN_TT) as TrangThaiTicket[];
  return Array.from({ length: n }, (_, i) =>
    dong({ ma: `SAI-${String(i + 1)}`, trang_thai: tt[i % tt.length] ?? 'todo' }),
  );
}

export function ticketDayDu(p: Partial<TicketDayDu> & { ma: string }): TicketDayDu {
  const trang_thai: TrangThaiTicket = p.trang_thai ?? 'in_progress';
  const uu_tien: UuTien = p.uu_tien ?? 'high';
  return {
    id: `tk-${p.ma}`,
    project_id: 'pj-SAI',
    so: Number(p.ma.split('-')[1] ?? '1'),
    tieu_de: `Việc ${p.ma}`,
    mo_ta: null,
    muc_tieu: null,
    boi_canh: null,
    pham_vi: null,
    file_va_nguon: null,
    dieu_cam: null,
    xong_la_gi: null,
    cach_kiem_chung: null,
    nop_lai: null,
    nhan: [],
    chiu_trach_nhiem: null,
    nguoi_dang_cam: null,
    bac_nguoi_cam: 5,
    cho_nghiem_thu: false,
    han_luc: null,
    nguoi_tao: { loai: 'owner' },
    tao_luc: GIO - 2 * GIO_MS,
    cap_nhat_luc: GIO - GIO_MS,
    bat_dau_luc: null,
    xong_luc: null,
    chu_tu_lam: false,
    trung_voi_ticket_id: null,
    ly_do_huy: null,
    la_dieu_phoi: false,
    co: {
      xong_khong_bang_chung: false,
      nhap_khong_bang_chung: false,
      khong_ai_cam: false,
      can_review_lai: false,
    },
    con_chua_ket: 0,
    ma_cu: null,
    xoa_luc: null,
    // Cờ "không code" (migration 0027) — mặc định tắt cả hai.
    khong_code: false,
    du_an_khong_code: false,
    lien_ket: [],
    binh_luan_cuoi: [],
    ...p,
    trang_thai,
    uu_tien,
    nhom_trang_thai: p.nhom_trang_thai ?? 'active',
    nhan_trang_thai: nhanTT(trang_thai),
    nhan_uu_tien: nhanUT(uu_tien),
  };
}

export function lienKet(
  loai: string,
  ma: string,
  nguoc = false,
  trang_thai: TrangThaiTicket = 'todo',
): TicketDayDu['lien_ket'][number] {
  return {
    loai,
    nhan_loai: loai === 'dieu_phoi' ? 'Điều phối' : loai === 'parent' ? 'Cha–con' : 'Liên quan',
    ticket_id: `tk-${ma}`,
    ma,
    tieu_de: `Việc ${ma}`,
    trang_thai,
    nhan_trang_thai: nhanTT(trang_thai),
    nguoc,
  };
}

export function ticketCon(ma: string, trang_thai: TrangThaiTicket = 'todo'): TicketCon {
  return {
    id: `tk-${ma}`,
    ma,
    tieu_de: `Việc ${ma}`,
    trang_thai,
    nhan_trang_thai: nhanTT(trang_thai),
  };
}

export function luotGiao(p: Partial<LuotGiao> & { so_luot: number }): LuotGiao {
  return {
    id: `lg-${String(p.so_luot)}`,
    loai: 'work',
    nhan_loai: 'Làm',
    trang_thai: 'in_progress',
    nhan_trang_thai: 'Đang làm',
    dang_mo: true,
    khong_phan_hoi: false,
    nguoi_giao: { loai: 'owner' },
    nguoi_nhan: { loai: 'agent', agentId: 'ag-a' },
    brief: {},
    bao_cao: null,
    han_phan_hoi_luc: null,
    ly_do: null,
    tao_luc: GIO - 3 * GIO_MS,
    nhan_luc: null,
    nop_luc: null,
    dong_luc: null,
    ...p,
  };
}

export function binhLuan(p: Partial<BinhLuan> & { id: string; tao_luc: number }): BinhLuan {
  return {
    tac_gia: { loai: 'owner' },
    noi_dung: `Bình luận ${p.id}`,
    da_sua: false,
    cap_nhat_luc: p.tao_luc,
    ...p,
  };
}

export function dongLichSu(p: Partial<DongLichSu> & { id: string; luc: number }): DongLichSu {
  return {
    tac_gia: { loai: 'agent', agentId: 'ag-a' },
    truong: 'trang_thai',
    gia_tri_cu: 'todo',
    gia_tri_moi: 'in_progress',
    ...p,
  };
}

export function manHinhTicket(
  ticket: TicketDayDu,
  tuy: Partial<ManHinhTicket> = {},
): ManHinhTicket {
  return {
    bay_gio: GIO,
    ticket,
    ticket_con: [],
    luot_giao: [],
    bang_chung: [],
    binh_luan: [],
    lich_su: [],
    can_chu: [],
    ...tuy,
  };
}

/** Thân `GET /v1/du-an` rút gọn — hai dự án, đủ để ô lọc và `/du-an/:ma` chạy. */
export const THAN_DU_AN = {
  items: [
    { id: 'pj-SAI', ma: 'SAI', ten: 'Sample', trang_thai: 'active', nhom: null, suc_song: 'xanh' },
    { id: 'pj-COS', ma: 'COS', ten: 'Chief of Staff', trang_thai: 'active', nhom: null, suc_song: 'vang' },
  ],
  cursor_sau: null,
};

/** Thân `GET /v1/agent` rút gọn — nuôi hai ô chọn người của d.396. */
export const THAN_AGENT = {
  items: [
    { id: 'ag-a', ten: 'W-builder', vai_tro: 'worker', nhan_vai_tro: 'Worker' },
    { id: 'ag-b', ten: 'M-baton', vai_tro: 'manager', nhan_vai_tro: 'Manager' },
  ],
  cursor_sau: null,
};
