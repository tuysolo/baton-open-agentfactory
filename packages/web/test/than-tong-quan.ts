/**
 * **Thân `GET /v1/tong-quan` cho test** — dựng theo đúng hình của
 * `packages/api/src/doc-tong-quan.ts` (và `TongQuan` trong `src/api.ts`).
 *
 * Một chỗ duy nhất, vì hai file test cần nó (`tong-quan.test.tsx` và
 * `dinh-tuyen.test.tsx`) và vì một thân **đầy đủ khoá** là điều kiện để ca test
 * nói đúng điều nó tưởng: thiếu một khoá thì component rơi vào nhánh `undefined`
 * và ca xanh vì một lý do khác.
 */

import type {
  DongCanChuY,
  DongVuaXong,
  HangDuAn,
  KhoiLon,
  MucCanChuO,
  NhomCanChuY,
  TheAgent,
  TheViecDangChay,
  TicketDong,
  TongQuan,
} from '../src/api';

/** Mốc "bây giờ" cố định — mọi ca đọc giờ từ thân, không từ `Date.now()`. */
export const GIO = 1_760_000_000_000;
export const PHUT = 60_000;
export const GIO_MS = 60 * PHUT;

/** Thân **hợp lệ nhưng rỗng**: năm khối có mặt, không dòng nào. */
export const TONG_QUAN_RONG: TongQuan = {
  bay_gio: GIO,
  du_an: [],
  viec_dang_chay: [],
  agent: [],
  agent_ranh_so: 0,
  vua_xong_24h: [],
  vua_xong_7n: [],
  can_chu_y: [],
  can_chu: {
    so_theo_muc: { urgent: 0, today: 0, later: 0 },
    so_cho: 0,
    muc_cao_nhat: null,
    gap_nhat: [],
    ds_cho: [],
  },
  ban_do: {
    ten_chu: 'Chủ',
    wip: { dang_day: 0, gioi_han: 3, vuot: false },
  },
};

export function hangDuAn(p: Partial<HangDuAn> & { ma: string }): HangDuAn {
  return {
    id: `pj-${p.ma}`,
    ten: p.ten ?? `Dự án ${p.ma}`,
    nhom: null,
    trang_thai: 'active',
    nhan_trang_thai: 'Đang chạy',
    suc_song: 'xanh',
    so_dang_lam: 0,
    so_cho_kiem_chung: 0,
    so_can_lam: 0,
    so_xong: 0,
    so_tong: 0,
    so_xong_24h: 0,
    viec_noi_bat: null,
    // Bản đồ dự án — SPEC 20.1–20.4 (mặc định của dữ liệu cũ: 20.1).
    uu_tien: 3,
    dang_day: false,
    duy_tri: false,
    ten_ngan: null,
    quan_ly_ten: null,
    khoi_lon: [],
    khoi_xong: 0,
    khoi_tong: 0,
    moc_toi: null,
    co_can_chu_cho: false,
    can_chu_cho_moi_nhat: null,
    // Thanh công cụ — SPEC 20.8: chưa ai đổi.
    dat_boi: null,
    ...p,
  };
}

/** Một khối lớn (ticket có `khoi_lon`) — SPEC 20.1. */
export function khoiLon(p: Partial<KhoiLon> & { ma: string; khoi_lon: number }): KhoiLon {
  return {
    id: `tk-${p.ma}`,
    tieu_de: `Khối ${p.ma}`,
    trang_thai: 'todo',
    nhan_trang_thai: 'Cần làm',
    doi: null,
    ...p,
  };
}

/** Một mục của danh sách mở ra trong ô Cần Chủ — SPEC 20.5. */
export function mucCanChuO(p: Partial<MucCanChuO> & { ma: string }): MucCanChuO {
  return {
    id: `ct-${p.ma}`,
    muc: 'today',
    nhan_muc: 'Trong ngày',
    loai: 'fyi',
    tieu_de: `Mục ${p.ma}`,
    project_id: null,
    han_luc: null,
    qua_han: false,
    tao_luc: GIO - PHUT,
    du_an_dang_day: false,
    ...p,
  };
}

export function theAgent(p: Partial<TheAgent> & { id: string }): TheAgent {
  return {
    ten: p.ten ?? `Agent ${p.id}`,
    vai_tro: 'worker',
    nhan_vai_tro: 'Người làm',
    trang_thai: 'busy',
    nhan_trang_thai: 'Đang làm',
    ticket_dang_cam: [],
    tin_hieu_cuoi_luc: null,
    ...p,
  };
}

export function ticketTroTa(ma: string, tieu_de = `Việc ${ma}`): DongVuaXong['ticket'] {
  return {
    id: `tk-${ma}`,
    ma,
    tieu_de,
    project_id: 'pj-SAI',
    trang_thai: 'done',
    nhan_trang_thai: 'Xong',
  };
}

/**
 * Một **thẻ việc** đầy đủ trường (`TicketDong`) — khối "Việc đang chạy" vẽ
 * **đúng** component thẻ việc của bảng, nên thân giả phải đủ mọi trường thẻ ấy
 * đọc; thiếu một trường thì thẻ rơi vào nhánh `undefined` và ca xanh vì lý do
 * khác.
 */
export function ticketDong(p: Partial<TicketDong> & { ma: string }): TicketDong {
  const [du_an = 'SAI', so = '1'] = p.ma.split('-');
  return {
    id: `tk-${p.ma}`,
    project_id: `pj-${du_an}`,
    so: Number(so),
    tieu_de: p.tieu_de ?? `Việc ${p.ma}`,
    trang_thai: 'in_progress',
    nhan_trang_thai: 'Đang làm',
    nhom_trang_thai: 'active',
    uu_tien: 'none',
    nhan_uu_tien: 'Không',
    chiu_trach_nhiem: null,
    nguoi_dang_cam: null,
    han_luc: null,
    tao_luc: GIO - 2 * GIO_MS,
    cap_nhat_luc: GIO - 10 * PHUT,
    co_co: false,
    nhan: [],
    con_tong: 0,
    con_chua_ket: 0,
    can_chu_so: 0,
    xong_luc: null,
    // d.404 — đường đọc trả **tên** agent; `null` = chủ cầm, hoặc không ai cầm.
    nguoi_cam_ten: null,
    chiu_trach_nhiem_ten: null,
    ...p,
  };
}

export function theViecDangChay(
  p: Partial<Omit<TheViecDangChay, 'the'>> & { the: TicketDong },
): TheViecDangChay {
  return { nguoi_cam_ten: null, cam_tu_luc: null, ...p };
}

export function dongCanChuY(p: Partial<DongCanChuY> & { loai: DongCanChuY['loai'] }): DongCanChuY {
  return {
    nhan_loai: p.nhan_loai ?? 'Nhãn giả',
    luc: GIO - PHUT,
    ticket: null,
    luot_giao: null,
    phien: null,
    bang_chung: null,
    thong_bao: null,
    ...p,
  };
}

/**
 * Một **nhóm** của khối Cần chú ý (d.321) — máy chủ gom, nên thân giả cũng gom:
 * dựng một nhóm "lỏng" (thiếu `khoa` hay `ly_do`) là dựng một thân mà máy chủ
 * thật không bao giờ trả.
 */
export function nhomCanChuY(ly_do: DongCanChuY[], ticket: DongVuaXong['ticket'] | null = null): NhomCanChuY {
  return {
    khoa: ticket === null ? `le:${ly_do[0]?.loai ?? 'x'}:0` : `tk:${ticket.id}`,
    ticket,
    luc: Math.min(...ly_do.map((d) => d.luc)),
    ly_do,
  };
}
