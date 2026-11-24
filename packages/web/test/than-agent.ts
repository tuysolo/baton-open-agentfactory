/**
 * **Thân của ba màn hình agent/phiên cho test** — dựng theo đúng hình của
 * `packages/api/src/doc-man-hinh-agent.ts` (và `ManHinhDoiAgent` /
 * `ManHinhAgent` / `ManHinhPhien` trong `src/api.ts`).
 *
 * Một chỗ duy nhất, và **đầy đủ khoá**: thiếu một khoá thì component rơi vào
 * nhánh `undefined` và ca xanh vì một lý do khác (bài học `than-tong-quan.ts`).
 */

import type {
  AgentDong,
  HoatDongDong,
  LuotGiaoCuaAgent,
  ManHinhAgent,
  ManHinhDoiAgent,
  ManHinhPhien,
  PhienDong,
} from '../src/api';

/** Mốc "bây giờ" **của máy chủ** — cố ý khác xa `Date.now()` thật. */
export const GIO = 1_760_000_000_000;
export const PHUT = 60_000;
export const GIO_MS = 60 * PHUT;

export function agentDong(p: Partial<AgentDong> & { id: string }): AgentDong {
  return {
    ten: p.ten ?? `Agent ${p.id}`,
    vai_tro: 'worker',
    nhan_vai_tro: 'Người làm',
    model: null,
    mo_ta: null,
    disabled: false,
    vao_tat_ca_du_an: false,
    len_tieng_luc: null,
    nguong_dung_phut: null,
    trang_thai: 'idle',
    nhan_trang_thai: 'Rảnh',
    token_bon_cuoi: null,
    token_tao_luc: null,
    token_thu_hoi_luc: null,
    tao_luc: GIO - GIO_MS,
    cap_nhat_luc: GIO - GIO_MS,
    ...p,
  };
}

export function doiAgent(agent: AgentDong[] = []): ManHinhDoiAgent {
  return { bay_gio: GIO, agent, cursor_sau: null };
}

export function phienDong(p: Partial<PhienDong> & { id: string }): PhienDong {
  return {
    luot_giao_id: 'lg-1',
    ticket_id: 'tk-1',
    agent_id: 'ag-1',
    trang_thai: 'running',
    nhan_trang_thai: 'Đang chạy',
    trang_thai_luu: 'running',
    dang_mo: true,
    dung: false,
    tin_hieu_cuoi_luc: GIO - PHUT,
    im_lang_ms: PHUT,
    nguong_dung_phut: 30,
    ghi_chu_cuoi: null,
    can_chu_id: null,
    stopping_luc: null,
    waiting_assigner_luc: null,
    cho_nguoi_giao_ms: null,
    cho_nguoi_giao_qua_han: false,
    tin_hieu: [],
    mo_luc: GIO - 10 * PHUT,
    dong_luc: null,
    ly_do_dong: null,
    ...p,
  };
}

export function luotCuaAgent(
  p: Partial<LuotGiaoCuaAgent> & { id: string; so_luot: number; ticket_ma: string },
): LuotGiaoCuaAgent {
  return {
    ticket_tieu_de: `Việc ${p.ticket_ma}`,
    loai: 'work',
    nhan_loai: 'Làm',
    trang_thai: 'in_progress',
    nhan_trang_thai: 'Đang làm',
    dang_mo: true,
    khong_phan_hoi: false,
    nguoi_giao: { loai: 'owner' },
    nguoi_nhan: { loai: 'agent', agentId: 'ag-1' },
    brief: {},
    bao_cao: null,
    han_phan_hoi_luc: null,
    ly_do: null,
    tao_luc: GIO - PHUT,
    nhan_luc: null,
    nop_luc: null,
    dong_luc: null,
    ...p,
  };
}

/** Bảng quyền giả — **đủ 9 hàng** chỉ khi ca truyền đủ; mặc định là bảng rỗng. */
export function manHinhAgent(p: Partial<ManHinhAgent> & { agent: AgentDong }): ManHinhAgent {
  return {
    bay_gio: GIO,
    bang_quyen: [],
    phien_dang_mo: [],
    luot_giao: [],
    ti_le_dat_lan_dau: { dat: 0, da_nop: 0, ti_le: null },
    du_an: [],
    ...p,
  };
}

export function hoatDong(
  p: Partial<HoatDongDong> & { id: string; noi_dung: string },
): HoatDongDong {
  return {
    phien_id: 'ph-1',
    loai: 'thought',
    nhan_loai: 'Suy nghĩ',
    tac_gia_loai: 'agent',
    tac_gia_agent_id: 'ag-1',
    ten_thao_tac: null,
    tham_so: null,
    ket_qua_thao_tac: null,
    tam_thoi: false,
    da_bi_thay_cho: false,
    la_tra_loi: false,
    thu_tu: 1,
    gui_luc: GIO - 2 * PHUT,
    ...p,
  };
}

export function manHinhPhien(p: Partial<ManHinhPhien> = {}): ManHinhPhien {
  return {
    bay_gio: GIO,
    phien: phienDong({ id: 'ph-1' }),
    hoat_dong: [],
    ke_hoach: { phien_id: 'ph-1', phien_ban: 0, gui_luc: null, buoc: [] },
    ticket: {
      id: 'tk-1',
      ma: 'SAI-1',
      tieu_de: 'Việc có phiên',
      trang_thai: 'in_progress',
      nhan_trang_thai: 'Đang làm',
    },
    agent: { id: 'ag-1', ten: 'W-builder', vai_tro: 'worker', nhan_vai_tro: 'Người làm' },
    ...p,
  };
}
