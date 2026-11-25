/**
 * **Phiên và nhịp tim** — SPEC mục 6 (+ 19.6), mục 3 (trạng thái agent suy ra từ
 * phiên), mục 0.1 (bảng mã), mục 13 (`baton heartbeat`), mục 14 (nút Dừng).
 *
 * Mỗi câu có tính luật của mục 6 và 19.6 có **một ca**, tên ca ghi đúng chữ SPEC
 * để đối chiếu.
 *
 * Hai kỷ luật riêng của file này:
 *
 *   1. **Ca đối chứng ở mọi chỗ dễ xanh giả.** "`waiting_owner` không bao giờ bị
 *      tính đứng" xanh kể cả khi luật bị gỡ hẳn, nếu không có một ca `running`
 *      **cùng mốc thời gian đó** mà **có** tính đứng. Mọi cặp như vậy dùng chung
 *      một hằng thời gian, không hai hằng khác nhau.
 *
 *   2. **Ngưỡng đo ở mốc chẵn.** 30 phút và 10 phút là hai con số SPEC viết ra, và
 *      `>` với `>=` lệch nhau đúng ở mốc chẵn. Mốc 30 phút chẵn phải là **đứng** —
 *      nghiệm thu 17.3 ("Agent worker im **30 phút**: Tổng quan hiện phiên đứng").
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  HAN_CHO_NGUOI_GIAO_CAN_CHU_Y_MS,
  HAN_XAC_NHAN_DUNG_MS,
  LY_DO_DONG_KHONG_XAC_NHAN_DUNG,
  LY_DO_DONG_NOP,
  NGUONG_DUNG_MAC_DINH_PHUT,
  NGUONG_DUNG_TOI_DA_PHUT,
  NGUONG_DUNG_TOI_THIEU_PHUT,
  TRANG_THAI_PHIEN,
  danhSachMa,
  kiemNguongDungPhut,
  laPhienDung,
  laPhienMo,
  nguongDungPhut,
  nhan,
  tinHieuChoAgent,
  trangThaiAgentTuPhien,
  trangThaiPhienDanXuat,
  type TrangThaiPhien,
} from '@baton/shared';
import { layAgent, lietKeAgent, trangThaiAgent } from '../src/doc-du-an.js';
import { phienCuaLuot, phienTheoId, raPhien, trangThaiCuaAgent } from '../src/doc-phien.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  chayLenhVoiCong,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungWorkspace,
  goiApi,
  phienTrongDb,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/* ------------------------------------------------------------------ *
 * Môi trường
 * ------------------------------------------------------------------ */

const P = 'pj-SAI';
const TK = 'tk-pj-SAI-1';
const TK_2 = 'tk-pj-SAI-2';
const TK_3 = 'tk-pj-SAI-3';

const AG = { mgr: 'ag-mgr', wk: 'ag-wk', wk2: 'ag-wk2' } as const;
const TOKEN = { mgr: 'bt_ph_mgr', wk: 'bt_ph_wk', wk2: 'bt_ph_wk2' } as const;

const PHUT = 60_000;
/** Ngưỡng mặc định của SPEC mục 6, tính ra ms. */
const NGUONG_MAC_DINH_MS = NGUONG_DUNG_MAC_DINH_PHUT * PHUT;

beforeEach(async () => {
  await dungWorkspace();
  await dungAgentCoToken({ id: AG.mgr, ten: 'M-Sample', vai_tro: 'manager', token: TOKEN.mgr });
  await dungAgentCoToken({ id: AG.wk, ten: 'W-builder', vai_tro: 'worker', token: TOKEN.wk });
  await dungAgentCoToken({ id: AG.wk2, ten: 'W-builder-2', vai_tro: 'worker', token: TOKEN.wk2 });

  await dungDuAn('SAI', 'Sample', 'active', AG.mgr);
  for (const id of Object.values(AG)) await choVaoDuAn(id, P);

  await dungTicket(P, 1, 'Việc để giao', { trang_thai: 'todo' });
  await dungTicket(P, 2, 'Việc thứ hai', { trang_thai: 'todo' });
  await dungTicket(P, 3, 'Việc thứ ba', { trang_thai: 'todo' });
});

/* ------------------------------------------------------------------ *
 * Giúp việc: đi đúng đường HTTP thật
 * ------------------------------------------------------------------ */

interface PhienQuaApi {
  id: string;
  trang_thai: string;
  trang_thai_luu: string;
  dang_mo: boolean;
  dung: boolean;
  tin_hieu_cuoi_luc: number;
  im_lang_ms: number;
  nguong_dung_phut: number;
  ghi_chu_cuoi: string | null;
  stopping_luc: number | null;
  cho_nguoi_giao_qua_han: boolean;
  tin_hieu: string[];
  ly_do_dong: string | null;
}

async function than<T>(res: Response): Promise<T> {
  return res.json<T>();
}

/** `baton claim` — nhận lượt giao, mở phiên (SPEC mục 6 d.180). */
async function nhanLuot(luot_giao_id: string, token: string): Promise<Response> {
  return goiApi(`/v1/luot-giao/${luot_giao_id}/nhan`, token, { method: 'POST' });
}

/** `baton submit` — nộp báo cáo, đóng phiên (SPEC mục 6 d.180). */
async function nop(luot_giao_id: string, token: string, ket_qua = 'done'): Promise<Response> {
  return goiApi(`/v1/luot-giao/${luot_giao_id}/nop`, token, {
    method: 'POST',
    than: { ket_qua, da_lam: 'xong việc' },
  });
}

/** `baton heartbeat [ghi chú]` — SPEC mục 13. */
async function heartbeat(
  luot_giao_id: string,
  token: string,
  ghi_chu?: string,
): Promise<Response> {
  return goiApi(`/v1/luot-giao/${luot_giao_id}/heartbeat`, token, {
    method: 'POST',
    than: ghi_chu === undefined ? {} : { ghi_chu },
  });
}

/** Chủ bấm "Dừng" — SPEC mục 6 d.193, mục 14 d.400. */
async function dung(phien_id: string, token = TOKEN_CHU): Promise<Response> {
  return goiApi(`/v1/phien/${phien_id}/dung`, token, { method: 'POST' });
}

async function layPhienApi(phien_id: string, token = TOKEN_CHU): Promise<PhienQuaApi> {
  const res = await goiApi(`/v1/phien/${phien_id}`, token);
  expect(res.status).toBe(200);
  return than<PhienQuaApi>(res);
}

/** Một lượt `in_progress` **có phiên**, dựng sẵn trong DB. */
async function luotDangLam(
  luot_id: string,
  phien_id: string,
  ticket_id = TK,
  phien: Parameters<typeof dungPhien>[2] = {},
): Promise<void> {
  await dungLuotGiao(luot_id, ticket_id, AG.wk, {
    trang_thai: 'in_progress',
    nguoi_giao_agent_id: AG.mgr,
  });
  await dungPhien(phien_id, luot_id, phien);
}

/* ================================================================== *
 * SPEC mục 0.1 — bảng mã trạng thái phiên
 * ================================================================== */

describe('SPEC 0.1 — 7 trạng thái phiên (mục 6 chỉ liệt kê 6)', () => {
  /**
   * Danh sách này là **chữ người đọc từ `SPEC.md` dòng 36**, không sinh từ mã
   * sản phẩm: một bảng "phủ" mà cả hai phía cùng một nguồn là khẳng định vòng
   * quanh, xanh vĩnh viễn (`decisions.md` 01/10, bài học của bảng quyền).
   */
  const MA_CUA_0_1 = [
    'running',
    'waiting_owner',
    'waiting_assigner',
    'stalled',
    'error',
    'stopping',
    'closed',
  ];

  it('bảng mã khớp ĐÚNG 7 mã của SPEC dòng 36, kể cả `waiting_assigner`', () => {
    expect(danhSachMa('trang_thai_phien')).toEqual(MA_CUA_0_1);
    expect(Object.keys(TRANG_THAI_PHIEN)).toContain('waiting_assigner');
  });

  it('nhãn tiếng Việt đúng chữ SPEC dòng 36', () => {
    expect(TRANG_THAI_PHIEN).toEqual({
      running: 'Đang chạy',
      waiting_owner: 'Chờ Chủ',
      waiting_assigner: 'Chờ người giao',
      stalled: 'Đứng',
      error: 'Lỗi',
      stopping: 'Đang dừng',
      closed: 'Đã đóng',
    });
  });

  it('DB nhận đúng 7 mã đó, và từ chối mã lạ', async () => {
    await dungLuotGiao('lg-ma', TK, AG.wk, { trang_thai: 'in_progress' });
    for (const ma of MA_CUA_0_1) {
      await env.DB.prepare('DELETE FROM phien WHERE id = ?').bind('ph-ma').run();
      await expect(
        dungPhien('ph-ma', 'lg-ma', {
          trang_thai: ma as TrangThaiPhien,
          // `waiting_owner` đòi có mục Cần Chủ (CHECK của 0006).
          can_chu_id: ma === 'waiting_owner' ? 'T-1' : null,
        }),
        ma,
      ).resolves.toBe('ph-ma');
    }

    await expect(
      env.DB.prepare(
        `INSERT INTO phien (id, workspace_id, luot_giao_id, ticket_id, agent_id, trang_thai,
                            tin_hieu_cuoi_luc, mo_luc, cap_nhat_luc)
         VALUES ('ph-la', ?, 'lg-ma', ?, ?, 'zombie', 1, 1, 1)`,
      )
        .bind(WS, TK, AG.wk)
        .run(),
    ).rejects.toThrow();
  });

  it('chỉ `closed` là phiên đóng; 6 mã kia đều là phiên còn mở', () => {
    for (const ma of MA_CUA_0_1) {
      expect(laPhienMo(ma as TrangThaiPhien), ma).toBe(ma !== 'closed');
    }
  });
});

/* ================================================================== *
 * SPEC mục 6 dòng 180 — vòng đời phiên
 * ================================================================== */

describe('SPEC mục 6 d.180 — "phiên mở khi agent NHẬN một lượt giao"', () => {
  it('nhận lượt → phiên `running` mở, gắn đúng lượt, ticket và agent', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { nguoi_giao_agent_id: AG.mgr });

    const res = await nhanLuot('lg-1', TOKEN.wk);
    expect(res.status).toBe(200);
    const kq = await than<{ phien_id: string }>(res);
    expect(kq.phien_id).toMatch(/^[0-9a-f-]{36}$/);

    const d = await phienCuaLuot(env.DB, WS, 'lg-1');
    expect(d).not.toBeNull();
    expect(d?.id).toBe(kq.phien_id);
    expect(d?.trang_thai).toBe('running');
    expect(d?.ticket_id).toBe(TK);
    expect(d?.agent_id).toBe(AG.wk);
    expect(d?.dong_luc).toBeNull();
  });

  it('lệnh nhận **là** tín hiệu đầu tiên: đồng hồ ngưỡng đứng đếm từ lúc nhận', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk);
    const truoc = Date.now();
    await nhanLuot('lg-1', TOKEN.wk);

    const d = await phienCuaLuot(env.DB, WS, 'lg-1');
    expect(d?.tin_hieu_cuoi_luc).toBeGreaterThanOrEqual(truoc);
    expect(d?.tin_hieu_cuoi_luc).toBe(d?.mo_luc);
  });

  it('lượt `pending` chưa nhận thì CHƯA có phiên (đối chứng)', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk);
    expect(await phienCuaLuot(env.DB, WS, 'lg-1')).toBeNull();
  });

  it('một lượt không bao giờ có hai phiên MỞ (ux_phien_mo_moi_luot)', async () => {
    await luotDangLam('lg-1', 'ph-1');
    await expect(dungPhien('ph-2', 'lg-1')).rejects.toThrow();
  });

  it('phiên không lệch được với lượt: agent khác người nhận bị DB chặn', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { trang_thai: 'in_progress' });
    await expect(
      env.DB.prepare(
        `INSERT INTO phien (id, workspace_id, luot_giao_id, ticket_id, agent_id, trang_thai,
                            tin_hieu_cuoi_luc, mo_luc, cap_nhat_luc)
         VALUES ('ph-lech', ?, 'lg-1', ?, ?, 'running', 1, 1, 1)`,
      )
        .bind(WS, TK, AG.wk2)
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  it('phiên không lệch được với lượt: ticket khác ticket của lượt bị DB chặn', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { trang_thai: 'in_progress' });
    await expect(
      env.DB.prepare(
        `INSERT INTO phien (id, workspace_id, luot_giao_id, ticket_id, agent_id, trang_thai,
                            tin_hieu_cuoi_luc, mo_luc, cap_nhat_luc)
         VALUES ('ph-lech', ?, 'lg-1', ?, ?, 'running', 1, 1, 1)`,
      )
        .bind(WS, TK_2, AG.wk)
        .run(),
    ).rejects.toThrow(/INVALID_INPUT/);
  });
});

describe('SPEC mục 6 d.180 — "đóng khi NỘP"', () => {
  it('nộp báo cáo → phiên `closed`, có mốc đóng và lý do', async () => {
    await luotDangLam('lg-1', 'ph-1');

    expect((await nop('lg-1', TOKEN.wk)).status).toBe(200);

    const d = await phienTrongDb('ph-1');
    expect(d?.trang_thai).toBe('closed');
    expect(d?.dong_luc).not.toBeNull();
    expect(d?.ly_do_dong).toBe('đã nộp báo cáo');
  });

  it('lượt `review` nộp (tự `accepted` — 19.3) cũng đóng phiên', async () => {
    await dungLuotGiao('lg-rv', TK, AG.wk, {
      loai: 'review',
      trang_thai: 'in_progress',
      nguoi_giao_agent_id: AG.mgr,
    });
    await dungPhien('ph-rv', 'lg-rv');

    expect((await nop('lg-rv', TOKEN.wk)).status).toBe(200);
    expect((await phienTrongDb('ph-rv'))?.trang_thai).toBe('closed');
  });

  it('phiên đã đóng KHÔNG mở lại được (tg_phien_dong_la_vinh_vien)', async () => {
    await luotDangLam('lg-1', 'ph-1');
    await nop('lg-1', TOKEN.wk);

    await expect(
      env.DB.prepare(
        "UPDATE phien SET trang_thai = 'running', dong_luc = NULL WHERE id = 'ph-1'",
      ).run(),
    ).rejects.toThrow(/SESSION_CLOSED/);
  });
});

describe('SPEC 19.5 + mục 6 d.180 — trả lại thì mở PHIÊN MỚI', () => {
  it('nộp → trả lại → nhận lại: phiên cũ vẫn `closed`, phiên mới `running`', async () => {
    await luotDangLam('lg-1', 'ph-1');
    await nop('lg-1', TOKEN.wk);

    const res = await goiApi('/v1/luot-giao/lg-1/nghiem-thu', TOKEN.mgr, {
      method: 'POST',
      than: { ket_qua: 'returned', ly_do: 'thiếu test' },
    });
    expect(res.status).toBe(200);
    const kq = await than<{ luot_moi: { id: string } }>(res);

    // Phiên của lượt mới chưa có: người nhận phải `nhan` lại (19.5).
    expect(await phienCuaLuot(env.DB, WS, kq.luot_moi.id)).toBeNull();

    await nhanLuot(kq.luot_moi.id, TOKEN.wk);
    const moi = await phienCuaLuot(env.DB, WS, kq.luot_moi.id);
    expect(moi?.trang_thai).toBe('running');
    expect(moi?.id).not.toBe('ph-1');
    // Phiên cũ không bị hồi sinh.
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('closed');
  });
});

/* ================================================================== *
 * SPEC mục 6 dòng 188 — TÍN HIỆU
 * ================================================================== */

describe('SPEC mục 6 d.188 — "tín hiệu = mọi lệnh ghi của agent trên phiên đó"', () => {
  const CU = 1_700_000_000_000;

  beforeEach(async () => {
    await luotDangLam('lg-1', 'ph-1', TK, { tin_hieu_cuoi_luc: CU, mo_luc: CU });
  });

  /**
   * Lệnh **bình luận** và **đổi tiêu đề** không biết gì về phiên: không handler
   * nào của chúng nhắc tới bảng `phien`. Nên nếu tín hiệu nhích, nó chỉ có thể
   * nhích ở **khung** (`workspace-gate.ts`) — đó đúng là điều cần canh: rắc
   * `capNhatTinHieu()` tay vào từng handler thì lệnh ghi thêm về sau sẽ quên.
   */
  it('lệnh ghi KHÔNG liên quan phiên (bình luận) vẫn nhích tín hiệu', async () => {
    const res = await goiApi(`/v1/ticket/${TK}/binh-luan`, TOKEN.wk, {
      method: 'POST',
      than: { noi_dung: 'đang làm' },
    });
    expect(res.status).toBe(201);
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBeGreaterThan(CU);
  });

  it('lệnh ghi khác (đổi tiêu đề ticket của lượt mình) cũng nhích tín hiệu', async () => {
    const res = await goiApi(`/v1/ticket/${TK}`, TOKEN.wk, {
      method: 'PATCH',
      than: { tieu_de: 'Tiêu đề mới' },
    });
    expect(res.status).toBe(200);
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBeGreaterThan(CU);
  });

  it('nhịp tim nhích tín hiệu', async () => {
    expect((await heartbeat('lg-1', TOKEN.wk)).status).toBe(200);
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBeGreaterThan(CU);
  });

  it('"**lệnh đọc không tính**": GET ticket không nhích tín hiệu', async () => {
    expect((await goiApi(`/v1/ticket/${TK}`, TOKEN.wk)).status).toBe(200);
    expect((await goiApi('/v1/whoami', TOKEN.wk)).status).toBe(200);
    expect((await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.wk)).status).toBe(200);
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBe(CU);
  });

  it('lệnh ghi của **chủ** không nhích tín hiệu của phiên agent', async () => {
    const res = await goiApi(`/v1/ticket/${TK}/binh-luan`, TOKEN_CHU, {
      method: 'POST',
      than: { noi_dung: 'chủ ghi chú' },
    });
    expect(res.status).toBe(201);
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBe(CU);
  });

  it('lệnh ghi của agent KHÁC không nhích tín hiệu của phiên này', async () => {
    const res = await goiApi(`/v1/ticket/${TK}/binh-luan`, TOKEN.mgr, {
      method: 'POST',
      than: { noi_dung: 'manager ghi chú' },
    });
    expect(res.status).toBe(201);
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBe(CU);
  });

  it('phiên đã ĐÓNG không nhận tín hiệu nữa (d.195)', async () => {
    await nop('lg-1', TOKEN.wk);
    const sau_khi_dong = (await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc;

    const res = await goiApi(`/v1/ticket/${TK}/binh-luan`, TOKEN.wk, {
      method: 'POST',
      than: { noi_dung: 'ghi thêm sau khi nộp' },
    });
    expect(res.status).toBe(201);
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBe(sau_khi_dong);
  });

  it('tín hiệu chỉ nhích về sau, không bao giờ chạy lùi', async () => {
    const tuong_lai = Date.now() + 10 * PHUT;
    await env.DB.prepare('UPDATE phien SET tin_hieu_cuoi_luc = ? WHERE id = ?')
      .bind(tuong_lai, 'ph-1')
      .run();

    await goiApi(`/v1/ticket/${TK}/binh-luan`, TOKEN.wk, {
      method: 'POST',
      than: { noi_dung: 'xin chào' },
    });
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBe(tuong_lai);
  });
});

/* ================================================================== *
 * SPEC mục 6 dòng 189 — NGƯỠNG ĐỨNG
 * ================================================================== */

describe('SPEC mục 6 d.189 — "mặc định 30 phút; chỉnh theo dự án hoặc theo agent (5–1440)"', () => {
  it('mặc định là 30 phút', () => {
    expect(NGUONG_DUNG_MAC_DINH_PHUT).toBe(30);
    expect(nguongDungPhut({})).toBe(30);
    expect(nguongDungPhut({ agent: null, du_an: null })).toBe(30);
  });

  it('khoảng cho phép là 5–1440 phút', () => {
    expect(NGUONG_DUNG_TOI_THIEU_PHUT).toBe(5);
    expect(NGUONG_DUNG_TOI_DA_PHUT).toBe(1440);
    expect(kiemNguongDungPhut(5)).toBe(5);
    expect(kiemNguongDungPhut(1440)).toBe(1440);
    expect(() => kiemNguongDungPhut(4)).toThrow(/5–1440/);
    expect(() => kiemNguongDungPhut(1441)).toThrow(/5–1440/);
    expect(() => kiemNguongDungPhut(10.5)).toThrow(/nguyên/);
    expect(kiemNguongDungPhut(null)).toBeNull();
    expect(kiemNguongDungPhut(undefined)).toBeNull();
  });

  it('ngưỡng của **dự án** áp cho phiên trong dự án đó', async () => {
    await env.DB.prepare('UPDATE project SET nguong_dung_phut = 10 WHERE id = ?').bind(P).run();
    await luotDangLam('lg-1', 'ph-1', TK, { tin_hieu_cuoi_luc: Date.now() - 12 * PHUT });

    const p = await layPhienApi('ph-1');
    expect(p.nguong_dung_phut).toBe(10);
    // 12 phút im: quá ngưỡng 10 phút của dự án.
    expect(p.trang_thai).toBe('stalled');
  });

  it('đối chứng: cùng 12 phút im mà dự án KHÔNG đặt ngưỡng → vẫn `running`', async () => {
    await luotDangLam('lg-1', 'ph-1', TK, { tin_hieu_cuoi_luc: Date.now() - 12 * PHUT });

    const p = await layPhienApi('ph-1');
    expect(p.nguong_dung_phut).toBe(NGUONG_DUNG_MAC_DINH_PHUT);
    expect(p.trang_thai).toBe('running');
  });

  it('ngưỡng của **agent** thắng ngưỡng của dự án (bậc cụ thể hơn)', async () => {
    await env.DB.prepare('UPDATE project SET nguong_dung_phut = 10 WHERE id = ?').bind(P).run();
    await env.DB.prepare('UPDATE agent SET nguong_dung_phut = 120 WHERE id = ?').bind(AG.wk).run();
    await luotDangLam('lg-1', 'ph-1', TK, { tin_hieu_cuoi_luc: Date.now() - 12 * PHUT });

    const p = await layPhienApi('ph-1');
    expect(p.nguong_dung_phut).toBe(120);
    expect(p.trang_thai).toBe('running');

    // Thứ tự đó là của hàm thuần, không phải của câu SQL.
    expect(nguongDungPhut({ agent: 120, du_an: 10 })).toBe(120);
    expect(nguongDungPhut({ agent: null, du_an: 10 })).toBe(10);
  });

  it('chủ đặt ngưỡng dự án và ngưỡng agent qua HTTP; ngoài khoảng → 422', async () => {
    expect(
      (
        await goiApi(`/v1/du-an/${P}`, TOKEN_CHU, {
          method: 'PATCH',
          than: { nguong_dung_phut: 45 },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await goiApi(`/v1/agent/${AG.wk}`, TOKEN_CHU, {
          method: 'PATCH',
          than: { nguong_dung_phut: 5 },
        })
      ).status,
    ).toBe(200);

    // Đọc lại được: một cấu hình chỉ ghi thì không ai kiểm chứng được.
    expect(await than<{ nguong_dung_phut: number | null }>(await goiApi(`/v1/du-an/${P}`, TOKEN_CHU)))
      .toMatchObject({ nguong_dung_phut: 45 });
    expect(
      await than<{ nguong_dung_phut: number | null }>(
        await goiApi(`/v1/agent/${AG.wk}`, TOKEN_CHU),
      ),
    ).toMatchObject({ nguong_dung_phut: 5 });

    const res = await goiApi(`/v1/du-an/${P}`, TOKEN_CHU, {
      method: 'PATCH',
      than: { nguong_dung_phut: 4 },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('bỏ ngưỡng riêng (`null`) thì rơi về bậc rộng hơn', async () => {
    await goiApi(`/v1/agent/${AG.wk}`, TOKEN_CHU, {
      method: 'PATCH',
      than: { nguong_dung_phut: 600 },
    });
    await goiApi(`/v1/du-an/${P}`, TOKEN_CHU, { method: 'PATCH', than: { nguong_dung_phut: 20 } });
    await luotDangLam('lg-1', 'ph-1');
    expect((await layPhienApi('ph-1')).nguong_dung_phut).toBe(600);

    await goiApi(`/v1/agent/${AG.wk}`, TOKEN_CHU, {
      method: 'PATCH',
      than: { nguong_dung_phut: null },
    });
    expect((await layPhienApi('ph-1')).nguong_dung_phut).toBe(20);

    await goiApi(`/v1/du-an/${P}`, TOKEN_CHU, { method: 'PATCH', than: { nguong_dung_phut: null } });
    expect((await layPhienApi('ph-1')).nguong_dung_phut).toBe(NGUONG_DUNG_MAC_DINH_PHUT);
  });

  it('DB cũng chặn ngưỡng ngoài khoảng 5–1440 (hàng rào cuối)', async () => {
    await expect(
      env.DB.prepare('UPDATE project SET nguong_dung_phut = 1441 WHERE id = ?').bind(P).run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare('UPDATE agent SET nguong_dung_phut = 0 WHERE id = ?').bind(AG.wk).run(),
    ).rejects.toThrow();
  });
});

describe('SPEC mục 6 d.184 — "`stalled`: quá ngưỡng không có tín hiệu"', () => {
  const phien = (im_lang_ms: number) => ({
    trang_thai: 'running' as TrangThaiPhien,
    tin_hieu_cuoi_luc: 1_000_000 - im_lang_ms,
    stopping_luc: null,
  });
  const BAY_GIO = 1_000_000;

  it('MỐC CHẴN 30 phút là ĐỨNG (nghiệm thu 17.3: "im 30 phút → phiên đứng")', () => {
    const dx = trangThaiPhienDanXuat(phien(NGUONG_MAC_DINH_MS), BAY_GIO, NGUONG_MAC_DINH_MS);
    expect(dx.trang_thai).toBe('stalled');
    expect(laPhienDung(phien(NGUONG_MAC_DINH_MS), BAY_GIO, NGUONG_MAC_DINH_MS)).toBe(true);
  });

  it('1 ms trước mốc chẵn thì CHƯA đứng (đối chứng của mốc)', () => {
    const dx = trangThaiPhienDanXuat(phien(NGUONG_MAC_DINH_MS - 1), BAY_GIO, NGUONG_MAC_DINH_MS);
    expect(dx.trang_thai).toBe('running');
  });

  it('`stalled` KHÔNG được ghi vào DB — nó hồi lại khi có tín hiệu mới (d.196)', async () => {
    await luotDangLam('lg-1', 'ph-1', TK, { tin_hieu_cuoi_luc: Date.now() - 40 * PHUT });

    expect((await layPhienApi('ph-1')).trang_thai).toBe('stalled');
    // DB vẫn ghi `running`: không có cron nào ghi `stalled`.
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('running');

    // Một tín hiệu là phiên hồi lại ngay, không cần ai đi xoá trạng thái.
    expect((await heartbeat('lg-1', TOKEN.wk)).status).toBe(200);
    const sau = await layPhienApi('ph-1');
    expect(sau.trang_thai).toBe('running');
    expect(sau.dung).toBe(false);
  });

  it('`im_lang_ms` hiện ra để Tổng quan vẽ "thời gian từ tín hiệu cuối" (mục 11)', async () => {
    await luotDangLam('lg-1', 'ph-1', TK, { tin_hieu_cuoi_luc: Date.now() - 7 * PHUT });
    const p = await layPhienApi('ph-1');
    expect(p.im_lang_ms).toBeGreaterThanOrEqual(7 * PHUT);
    expect(p.im_lang_ms).toBeLessThan(8 * PHUT);
  });
});

/* ================================================================== *
 * SPEC 19.6 — ai KHÔNG bị tính đứng
 * ================================================================== */

describe('SPEC 19.6 — "phiên `waiting_owner` KHÔNG BAO GIỜ bị tính đứng"', () => {
  /** Một mốc im lặng dài gấp nhiều lần ngưỡng, **dùng chung** cho cả hai ca. */
  const IM_LANG = 10 * 60 * PHUT;
  const BAY_GIO = 2_000_000_000;

  const phien = (trang_thai: TrangThaiPhien) => ({
    trang_thai,
    tin_hieu_cuoi_luc: BAY_GIO - IM_LANG,
    stopping_luc: null,
  });

  it('`waiting_owner` im 10 giờ vẫn KHÔNG đứng', () => {
    const dx = trangThaiPhienDanXuat(phien('waiting_owner'), BAY_GIO, NGUONG_MAC_DINH_MS);
    expect(dx.trang_thai).toBe('waiting_owner');
    expect(laPhienDung(phien('waiting_owner'), BAY_GIO, NGUONG_MAC_DINH_MS)).toBe(false);
  });

  it('ĐỐI CHỨNG: `running` với ĐÚNG mốc im lặng đó thì CÓ đứng', () => {
    // Không có ca này thì ca trên xanh cả khi luật "waiting_owner không tính
    // đứng" bị gỡ hẳn — vì lúc đó cả hai trạng thái đều ra `stalled` và chỉ ca
    // trên mới đỏ nếu có cái gì khác để so.
    const dx = trangThaiPhienDanXuat(phien('running'), BAY_GIO, NGUONG_MAC_DINH_MS);
    expect(dx.trang_thai).toBe('stalled');
  });

  it('`waiting_owner` qua đường đọc thật cũng không đứng; `running` cùng mốc thì đứng', async () => {
    const im_tu = Date.now() - 10 * 60 * PHUT;
    await dungLuotGiao('lg-1', TK, AG.wk, { trang_thai: 'in_progress' });
    await dungPhien('ph-cho-chu', 'lg-1', {
      trang_thai: 'waiting_owner',
      can_chu_id: 'T-9',
      tin_hieu_cuoi_luc: im_tu,
    });
    await dungLuotGiao('lg-2', TK_2, AG.wk, { trang_thai: 'in_progress' });
    await dungPhien('ph-dang-chay', 'lg-2', { tin_hieu_cuoi_luc: im_tu });

    expect((await layPhienApi('ph-cho-chu')).dung).toBe(false);
    expect((await layPhienApi('ph-dang-chay')).dung).toBe(true);
  });

  it('`waiting_owner` đòi có mục Cần Chủ (d.183) — DB chặn nếu thiếu', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { trang_thai: 'in_progress' });
    await expect(
      env.DB.prepare(
        `INSERT INTO phien (id, workspace_id, luot_giao_id, ticket_id, agent_id, trang_thai,
                            tin_hieu_cuoi_luc, mo_luc, cap_nhat_luc)
         VALUES ('ph-x', ?, 'lg-1', ?, ?, 'waiting_owner', 1, 1, 1)`,
      )
        .bind(WS, TK, AG.wk)
        .run(),
    ).rejects.toThrow();
  });
});

describe('SPEC 19.6 — "`waiting_assigner` không tính đứng, nhưng quá 60 phút thì Cần chú ý"', () => {
  const BAY_GIO = 2_000_000_000;
  const phien = (trang_thai: TrangThaiPhien, im_lang_ms: number) => ({
    trang_thai,
    tin_hieu_cuoi_luc: BAY_GIO - im_lang_ms,
    stopping_luc: null,
  });

  it('`waiting_assigner` im 10 giờ KHÔNG đứng', () => {
    const im = 10 * 60 * PHUT;
    expect(trangThaiPhienDanXuat(phien('waiting_assigner', im), BAY_GIO, NGUONG_MAC_DINH_MS).trang_thai).toBe(
      'waiting_assigner',
    );
    // ĐỐI CHỨNG cùng mốc: `running` thì đứng.
    expect(trangThaiPhienDanXuat(phien('running', im), BAY_GIO, NGUONG_MAC_DINH_MS).trang_thai).toBe('stalled');
  });

  it('MỐC CHẴN 60 phút → vào "Cần chú ý"; 59 phút thì chưa', () => {
    expect(HAN_CHO_NGUOI_GIAO_CAN_CHU_Y_MS).toBe(60 * PHUT);
    expect(
      trangThaiPhienDanXuat(phien('waiting_assigner', 60 * PHUT), BAY_GIO, NGUONG_MAC_DINH_MS)
        .cho_nguoi_giao_qua_han,
    ).toBe(true);
    expect(
      trangThaiPhienDanXuat(phien('waiting_assigner', 59 * PHUT), BAY_GIO, NGUONG_MAC_DINH_MS)
        .cho_nguoi_giao_qua_han,
    ).toBe(false);
  });

  it('cờ đó chỉ của `waiting_assigner`: phiên `running` im 2 giờ không bật nó', () => {
    expect(
      trangThaiPhienDanXuat(phien('running', 120 * PHUT), BAY_GIO, NGUONG_MAC_DINH_MS)
        .cho_nguoi_giao_qua_han,
    ).toBe(false);
  });

  it('`error` và `stopping` cũng không bị `stalled` ăn mất (mục 11 ý 4 xếp riêng)', () => {
    const im = 10 * 60 * PHUT;
    expect(trangThaiPhienDanXuat(phien('error', im), BAY_GIO, NGUONG_MAC_DINH_MS).trang_thai).toBe('error');
    expect(
      trangThaiPhienDanXuat(
        { trang_thai: 'stopping', tin_hieu_cuoi_luc: BAY_GIO - im, stopping_luc: BAY_GIO },
        BAY_GIO,
        NGUONG_MAC_DINH_MS,
      ).trang_thai,
    ).toBe('stopping');
  });
});

/* ================================================================== *
 * SPEC mục 6 dòng 192–195 — DỪNG
 * ================================================================== */

describe('SPEC mục 6 d.193 — "chủ bấm Dừng thì phiên sang `stopping`"', () => {
  beforeEach(async () => {
    await luotDangLam('lg-1', 'ph-1');
  });

  it('chủ bấm Dừng → `stopping`, có mốc và có hạn tự đóng 10 phút', async () => {
    const res = await dung('ph-1');
    expect(res.status).toBe(200);
    const kq = await than<{ trang_thai: string; stopping_luc: number; tu_dong_luc: number }>(res);
    expect(kq.trang_thai).toBe('stopping');
    expect(kq.tu_dong_luc - kq.stopping_luc).toBe(HAN_XAC_NHAN_DUNG_MS);

    const d = await phienTrongDb('ph-1');
    expect(d?.trang_thai).toBe('stopping');
    expect(d?.stopping_luc).not.toBeNull();
  });

  it('"**lần gọi kế tiếp của agent** nhận về tín hiệu `STOP`"', async () => {
    await dung('ph-1');
    const res = await heartbeat('lg-1', TOKEN.wk);
    expect(res.status).toBe(200);
    expect(await than<{ tin_hieu: string[] }>(res)).toMatchObject({ tin_hieu: ['STOP'] });
  });

  it('ĐỐI CHỨNG: phiên `running` thì nhịp tim KHÔNG mang tín hiệu nào', async () => {
    const res = await heartbeat('lg-1', TOKEN.wk);
    expect(await than<{ tin_hieu: string[] }>(res)).toMatchObject({ tin_hieu: [] });
  });

  it('tín hiệu `STOP` chỉ phát ở trạng thái `stopping` (luật thuần)', () => {
    for (const ma of danhSachMa('trang_thai_phien')) {
      expect(tinHieuChoAgent(ma), ma).toEqual(ma === 'stopping' ? ['STOP'] : []);
    }
  });

  it('**chỉ chủ** bấm được Dừng: agent người giao → FORBIDDEN', async () => {
    const res = await dung('ph-1', TOKEN.mgr);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('running');
  });

  it('chính agent của phiên cũng không bấm được Dừng → FORBIDDEN', async () => {
    expect((await dung('ph-1', TOKEN.wk)).status).toBe(403);
  });

  it('bấm Dừng lần hai KHÔNG đẩy lại đồng hồ 10 phút của d.194', async () => {
    await dung('ph-1');
    const lan_dau = (await phienTrongDb('ph-1'))?.stopping_luc;

    // Lùi mốc về 6 phút trước để lần bấm thứ hai có gì để đẩy.
    await env.DB.prepare('UPDATE phien SET stopping_luc = ? WHERE id = ?')
      .bind((lan_dau ?? 0) - 6 * PHUT, 'ph-1')
      .run();
    const da_lui = (await phienTrongDb('ph-1'))?.stopping_luc;

    await dung('ph-1');
    expect((await phienTrongDb('ph-1'))?.stopping_luc).toBe(da_lui);
  });
});

describe('SPEC mục 6 d.194 — "sau 10 phút không xác nhận, phiên tự đóng"', () => {
  it('MỐC CHẴN 10 phút → phiên đã `closed` với đúng lý do của SPEC', async () => {
    await luotDangLam('lg-1', 'ph-1', TK, {
      trang_thai: 'stopping',
      stopping_luc: Date.now() - HAN_XAC_NHAN_DUNG_MS,
    });

    const p = await layPhienApi('ph-1');
    expect(p.trang_thai).toBe('closed');
    expect(p.dang_mo).toBe(false);
    expect(p.ly_do_dong).toBe(LY_DO_DONG_KHONG_XAC_NHAN_DUNG);
    expect(LY_DO_DONG_KHONG_XAC_NHAN_DUNG).toBe('agent không xác nhận dừng');
  });

  it('ĐỐI CHỨNG: 1 ms trước mốc 10 phút thì vẫn `stopping`', () => {
    const bay_gio = 5_000_000;
    const dx = trangThaiPhienDanXuat(
      {
        trang_thai: 'stopping',
        tin_hieu_cuoi_luc: bay_gio - HAN_XAC_NHAN_DUNG_MS,
        stopping_luc: bay_gio - HAN_XAC_NHAN_DUNG_MS + 1,
      },
      bay_gio,
      NGUONG_MAC_DINH_MS,
    );
    expect(dx.trang_thai).toBe('stopping');
    expect(dx.dong_vi_khong_xac_nhan_dung).toBe(false);
  });

  it('agent xác nhận TRONG 10 phút thì phiên không tự đóng (đối chứng)', async () => {
    await luotDangLam('lg-1', 'ph-1', TK, {
      trang_thai: 'stopping',
      stopping_luc: Date.now() - 9 * PHUT,
    });
    const res = await heartbeat('lg-1', TOKEN.wk);
    expect(res.status).toBe(200);
    expect(await than<{ tin_hieu: string[] }>(res)).toMatchObject({ tin_hieu: ['STOP'] });
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('stopping');
  });

  it('nhịp tim sau 10 phút: GHI cái đóng vào DB rồi mới từ chối `SESSION_CLOSED`', async () => {
    await luotDangLam('lg-1', 'ph-1', TK, {
      trang_thai: 'stopping',
      stopping_luc: Date.now() - 11 * PHUT,
    });

    const res = await heartbeat('lg-1', TOKEN.wk);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SESSION_CLOSED' });

    // Nửa sau của luật: cái đóng đã **vào DB**, không chỉ dẫn xuất.
    const d = await phienTrongDb('ph-1');
    expect(d?.trang_thai).toBe('closed');
    expect(d?.ly_do_dong).toBe(LY_DO_DONG_KHONG_XAC_NHAN_DUNG);
  });

  it('chủ bấm Dừng một phiên đã tự đóng → `SESSION_CLOSED`, và DB được ghi đóng', async () => {
    await luotDangLam('lg-1', 'ph-1', TK, {
      trang_thai: 'stopping',
      stopping_luc: Date.now() - 11 * PHUT,
    });

    const res = await dung('ph-1');
    expect(res.status).toBe(409);
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('closed');
  });
});

describe('SPEC mục 6 d.195 — "mọi lệnh ghi sau khi phiên đóng bị từ chối (`SESSION_CLOSED`)"', () => {
  it('nhịp tim sau khi nộp → 409 SESSION_CLOSED', async () => {
    await luotDangLam('lg-1', 'ph-1');
    await nop('lg-1', TOKEN.wk);

    const res = await heartbeat('lg-1', TOKEN.wk);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SESSION_CLOSED' });
  });

  it('NỘP sau khi phiên tự đóng (10 phút không xác nhận) → 409 SESSION_CLOSED', async () => {
    await luotDangLam('lg-1', 'ph-1', TK, {
      trang_thai: 'stopping',
      stopping_luc: Date.now() - 11 * PHUT,
    });

    const res = await nop('lg-1', TOKEN.wk);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SESSION_CLOSED' });
    // Lượt **không** được nộp: trạng thái giữ nguyên.
    const d = await env.DB.prepare('SELECT trang_thai, ket_qua FROM luot_giao WHERE id = ?')
      .bind('lg-1')
      .first<{ trang_thai: string; ket_qua: string | null }>();
    expect(d?.trang_thai).toBe('in_progress');
    expect(d?.ket_qua).toBeNull();
  });

  it('ĐỐI CHỨNG: cùng lệnh nộp đó khi phiên còn mở thì 200', async () => {
    await luotDangLam('lg-1', 'ph-1');
    expect((await nop('lg-1', TOKEN.wk)).status).toBe(200);
  });

  it('lượt CHƯA có phiên thì nộp vẫn chạy ("không có phiên" ≠ "phiên đã đóng")', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, {
      trang_thai: 'in_progress',
      nguoi_giao_agent_id: AG.mgr,
    });
    expect((await nop('lg-1', TOKEN.wk)).status).toBe(200);
  });
});

/* ================================================================== *
 * SPEC 19.12 câu 45 — nửa "KHÔNG bị chặn" của `SESSION_CLOSED`
 * ================================================================== */

/**
 * Câu 45 chốt `SESSION_CLOSED` **không** đọc rộng ra mọi lệnh ghi của agent: nó
 * chỉ chặn lệnh **gắn rõ một lượt giao**. "Lệnh ghi chung" (bình luận, sửa
 * ticket) vẫn chạy — chỉ là chúng không nhích tín hiệu cho một phiên đã đóng.
 *
 * Mọi ca ở trên canh nửa **bị chặn**; nửa này trước lượt T-69 việc 3 không có ca
 * nào, nên một lượt sau rắc `chanNeuPhienDaDong` vào cửa ghi chung sẽ xanh hết.
 *
 * `gui_bang_chung` cũng ở đây: 19.12 câu 45 kể "bằng chứng **của lượt**" vào nhóm
 * bị chặn, nhưng bằng chứng **không gắn lượt giao nào** trong mô hình hiện tại —
 * xem `spec-questions.md` **#67**, cài theo hướng (a) (lệnh ghi chung). Ca dưới đây
 * khoá **hành vi đang chọn**, nên phiên spec chốt ngược thì nó đỏ ngay, đúng chỗ.
 *
 * Danh tính dùng ở đây là `AG.mgr` (vai `manager`): phạm vi "sửa ticket" của
 * `worker` là **ticket của lượt mình đang MỞ** (19.12 câu 30), nên sau khi nộp
 * thì `worker` bị `FORBIDDEN` vì **phạm vi**, và một ca như vậy không nói được gì
 * về `SESSION_CLOSED`.
 */
describe('SPEC 19.12 câu 45 — phiên đã `closed` thì lệnh ghi CHUNG vẫn chạy', () => {
  beforeEach(async () => {
    // Lượt của `manager`, nộp xong → phiên `closed`.
    await dungLuotGiao('lg-m', TK_2, AG.mgr, {
      trang_thai: 'in_progress',
      nguoi_giao_agent_id: AG.wk,
    });
    await dungPhien('ph-m', 'lg-m', {});
    expect((await nop('lg-m', TOKEN.mgr)).status).toBe(200);
    expect((await phienTrongDb('ph-m'))?.trang_thai).toBe('closed');
  });

  it('ĐỐI CHỨNG: nhịp tim trên đúng lượt đó thì 409 `SESSION_CLOSED`', async () => {
    const res = await heartbeat('lg-m', TOKEN.mgr);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SESSION_CLOSED' });
  });

  it('vẫn **BÌNH LUẬN** được (201, không `SESSION_CLOSED`)', async () => {
    const res = await goiApi(`/v1/ticket/${TK_2}/binh-luan`, TOKEN.mgr, {
      method: 'POST',
      than: { noi_dung: 'Phiên đóng rồi nhưng tôi vẫn nói được.' },
    });
    expect(res.status).toBe(201);
  });

  it('vẫn **SỬA TICKET** được (200, không `SESSION_CLOSED`)', async () => {
    const res = await goiApi(`/v1/ticket/${TK_3}`, TOKEN.mgr, {
      method: 'PATCH',
      than: { tieu_de: 'Tiêu đề mới sau khi phiên đóng' },
    });
    expect(res.status).toBe(200);
    expect(await than<{ da_doi: string[] }>(res)).toMatchObject({ da_doi: ['tieu_de'] });
  });

  it('vẫn **GỬI BẰNG CHỨNG** được (201, không `SESSION_CLOSED`) — #67 hướng (a)', async () => {
    const res = await goiApi(`/v1/ticket/${TK_2}/bang-chung`, TOKEN.mgr, {
      method: 'POST',
      than: { loai_bang_chung: 'note', noi_dung: 'Ghi chú sau khi phiên đóng.' },
    });
    expect(res.status).toBe(201);
  });

  it('và lệnh ghi chung KHÔNG hồi sinh phiên đã đóng', async () => {
    await goiApi(`/v1/ticket/${TK_2}/binh-luan`, TOKEN.mgr, {
      method: 'POST',
      than: { noi_dung: 'một dòng' },
    });
    const d = await phienTrongDb('ph-m');
    expect(d?.trang_thai).toBe('closed');
    expect(d?.dong_luc).not.toBeNull();
  });
});

/* ================================================================== *
 * SPEC 19.6 — huỷ lượt mà phiên đang chạy
 * ================================================================== */

describe('SPEC 19.6 — "huỷ lượt có phiên đang chạy: phiên sang `stopping`, xử lý NHƯ bấm Dừng"', () => {
  it('huỷ lượt → phiên `stopping`, KHÔNG `closed`', async () => {
    await luotDangLam('lg-1', 'ph-1');

    const res = await goiApi('/v1/luot-giao/lg-1/huy', TOKEN.mgr, {
      method: 'POST',
      than: { ly_do: 'đổi hướng' },
    });
    expect(res.status).toBe(200);
    expect(await than<{ phien_dang_dung: boolean }>(res)).toMatchObject({ phien_dang_dung: true });

    const d = await phienTrongDb('ph-1');
    expect(d?.trang_thai).toBe('stopping');
    expect(d?.stopping_luc).not.toBeNull();
    expect(d?.dong_luc).toBeNull();
  });

  it('"xử lý như bấm Dừng": lần gọi kế tiếp của agent nhận `STOP`', async () => {
    await luotDangLam('lg-1', 'ph-1');
    await goiApi('/v1/luot-giao/lg-1/huy', TOKEN.mgr, { method: 'POST', than: {} });

    const res = await heartbeat('lg-1', TOKEN.wk);
    expect(res.status).toBe(200);
    expect(await than<{ tin_hieu: string[] }>(res)).toMatchObject({ tin_hieu: ['STOP'] });
  });

  it('"xử lý như bấm Dừng": 10 phút không xác nhận thì phiên tự đóng', async () => {
    await luotDangLam('lg-1', 'ph-1');
    await goiApi('/v1/luot-giao/lg-1/huy', TOKEN.mgr, { method: 'POST', than: {} });

    await env.DB.prepare('UPDATE phien SET stopping_luc = ? WHERE id = ?')
      .bind(Date.now() - HAN_XAC_NHAN_DUNG_MS, 'ph-1')
      .run();

    expect((await layPhienApi('ph-1')).trang_thai).toBe('closed');
  });

  it('ĐỐI CHỨNG: NỘP thì phiên `closed` ngay, không qua `stopping`', async () => {
    await luotDangLam('lg-2', 'ph-2', TK_2);
    await nop('lg-2', TOKEN.wk);
    expect((await phienTrongDb('ph-2'))?.trang_thai).toBe('closed');
  });

  it('huỷ một lượt `pending` (chưa có phiên) thì không có gì để dừng', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { nguoi_giao_agent_id: AG.mgr });
    const res = await goiApi('/v1/luot-giao/lg-1/huy', TOKEN.mgr, { method: 'POST', than: {} });
    expect(res.status).toBe(200);
    expect(await than<{ phien_dang_dung: boolean }>(res)).toMatchObject({ phien_dang_dung: false });
  });

  it('huỷ lượt mà phiên đã đóng thì không hồi sinh phiên', async () => {
    await luotDangLam('lg-1', 'ph-1');
    await nop('lg-1', TOKEN.wk);

    const res = await goiApi('/v1/luot-giao/lg-1/huy', TOKEN.mgr, { method: 'POST', than: {} });
    expect(res.status).toBe(200);
    expect(await than<{ phien_dang_dung: boolean }>(res)).toMatchObject({ phien_dang_dung: false });
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('closed');
  });
});

/* ================================================================== *
 * SPEC 19.12 câu 47 — nộp báo cáo tính là xác nhận dừng
 * ================================================================== */

/**
 * Câu 47 là một luật **riêng của trạng thái `stopping`**: các ca d.180 ("đóng khi
 * nộp") đều chạy trên phiên `running`, nên chúng xanh kể cả khi đường `stopping`
 * bị chặn. Hai ca dưới đây canh đúng nửa riêng đó, cộng chữ "hai đường vào
 * `stopping` **không đối xứng**".
 */
describe('SPEC 19.12 câu 47 — "agent đang `stopping` mà NỘP báo cáo thì phiên đóng"', () => {
  it('chủ bấm Dừng → `stopping` → người nhận NỘP → `closed`, lý do "đã nộp báo cáo"', async () => {
    await luotDangLam('lg-1', 'ph-1');
    expect((await dung('ph-1')).status).toBe(200);
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('stopping');

    // Không đòi thêm một mục `result`: chính lệnh nộp là xác nhận dừng.
    const res = await nop('lg-1', TOKEN.wk);
    expect(res.status).toBe(200);

    const d = await phienTrongDb('ph-1');
    expect(d?.trang_thai).toBe('closed');
    expect(d?.ly_do_dong).toBe(LY_DO_DONG_NOP);
    expect(LY_DO_DONG_NOP).toBe('đã nộp báo cáo');
    // Lý do là của **nộp**, không phải của đồng hồ 10 phút d.194.
    expect(d?.ly_do_dong).not.toBe(LY_DO_DONG_KHONG_XAC_NHAN_DUNG);
  });

  it('ĐỐI CHỨNG hai đường vào `stopping` KHÔNG đối xứng: huỷ lượt thì nộp bị chặn', async () => {
    await luotDangLam('lg-1', 'ph-1');
    await goiApi('/v1/luot-giao/lg-1/huy', TOKEN.mgr, {
      method: 'POST',
      than: { ly_do: 'đổi hướng' },
    });
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('stopping');

    // Lượt đã `canceled` nên nộp không còn là lối ra — `result`/`error` là lối duy nhất.
    const res = await nop('lg-1', TOKEN.wk);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'ASSIGNMENT_STATE_INVALID' });
    // Phiên vẫn `stopping`: lệnh bị chặn không đóng hộ phiên.
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('stopping');
  });
});

/* ================================================================== *
 * SPEC mục 13 — `baton heartbeat`
 * ================================================================== */

describe('SPEC mục 13 — `baton heartbeat [ghi chú]`', () => {
  beforeEach(async () => {
    await luotDangLam('lg-1', 'ph-1');
  });

  it('chỉ **agent của phiên** gửi được nhịp tim: agent khác → FORBIDDEN', async () => {
    expect((await heartbeat('lg-1', TOKEN.wk2)).status).toBe(403);
    expect((await heartbeat('lg-1', TOKEN.mgr)).status).toBe(403);
  });

  it('kể cả **chủ** cũng không gửi hộ nhịp tim → FORBIDDEN', async () => {
    const res = await heartbeat('lg-1', TOKEN_CHU);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('ghi chú được lưu lại', async () => {
    expect((await heartbeat('lg-1', TOKEN.wk, 'đang chạy test')).status).toBe(200);
    expect((await phienTrongDb('ph-1'))?.ghi_chu_cuoi).toBe('đang chạy test');
  });

  it('không có ghi chú thì không ghi đè ghi chú cũ', async () => {
    await heartbeat('lg-1', TOKEN.wk, 'bước 1');
    await heartbeat('lg-1', TOKEN.wk);
    expect((await phienTrongDb('ph-1'))?.ghi_chu_cuoi).toBe('bước 1');
  });

  it('lượt giao chưa có phiên → NOT_FOUND (không lộ sự tồn tại — mục 13)', async () => {
    await dungLuotGiao('lg-chua-nhan', TK_2, AG.wk);
    expect((await heartbeat('lg-chua-nhan', TOKEN.wk)).status).toBe(404);
    expect((await heartbeat('khong-co-lenh-nao', TOKEN.wk)).status).toBe(404);
  });

  it('**chỗ cắm phần 4**: `resolved_asks` có mặt trong phản hồi và đang rỗng', async () => {
    const res = await heartbeat('lg-1', TOKEN.wk);
    const kq = await than<{ resolved_asks: unknown[] }>(res);
    expect(Array.isArray(kq.resolved_asks)).toBe(true);
    expect(kq.resolved_asks).toEqual([]);
  });
});

/* ================================================================== *
 * SPEC mục 3 d.98–103 — trạng thái agent suy ra từ phiên
 * ================================================================== */

describe('SPEC mục 3 — trạng thái agent (tự tính) suy ra từ phiên', () => {
  it('luật thuần: mỗi trạng thái phiên cho đúng một trạng thái agent', () => {
    expect(trangThaiAgentTuPhien(false, [])).toBe('idle');
    expect(trangThaiAgentTuPhien(false, ['closed'])).toBe('idle');
    expect(trangThaiAgentTuPhien(false, ['running'])).toBe('busy');
    expect(trangThaiAgentTuPhien(false, ['waiting_owner'])).toBe('waiting_owner');
    expect(trangThaiAgentTuPhien(false, ['stalled'])).toBe('stalled');
    // Ba trạng thái phiên không có hàng trong mục 3 — chốt tạm, xem `phien.ts`.
    expect(trangThaiAgentTuPhien(false, ['waiting_assigner'])).toBe('busy');
    expect(trangThaiAgentTuPhien(false, ['stopping'])).toBe('busy');
    expect(trangThaiAgentTuPhien(false, ['error'])).toBe('stalled');
  });

  it('`disabled` thắng mọi thứ, kể cả khi còn phiên chưa đóng', () => {
    expect(trangThaiAgentTuPhien(true, [])).toBe('disabled');
    expect(trangThaiAgentTuPhien(true, ['running'])).toBe('disabled');
  });

  it('nhiều phiên: `busy` thắng `stalled` (thứ tự liệt kê của mục 3)', () => {
    expect(trangThaiAgentTuPhien(false, ['stalled', 'running'])).toBe('busy');
    expect(trangThaiAgentTuPhien(false, ['stalled', 'waiting_owner'])).toBe('waiting_owner');
  });

  it('`idle` khi không có phiên mở (đường đọc thật)', async () => {
    expect(await trangThaiCuaAgent(env.DB, WS, AG.wk, false, Date.now())).toBe('idle');
    expect(trangThaiAgent({ disabled: false })).toBe('idle');
  });

  it('`busy` khi có phiên đang chạy (đường đọc thật)', async () => {
    await luotDangLam('lg-1', 'ph-1');
    expect(await trangThaiCuaAgent(env.DB, WS, AG.wk, false, Date.now())).toBe('busy');
  });

  it('`stalled` khi phiên quá ngưỡng không tín hiệu (đường đọc thật)', async () => {
    await luotDangLam('lg-1', 'ph-1', TK, { tin_hieu_cuoi_luc: Date.now() - 31 * PHUT });
    expect(await trangThaiCuaAgent(env.DB, WS, AG.wk, false, Date.now())).toBe('stalled');
  });

  it('`waiting_owner` khi phiên chờ một mục Cần Chủ (đường đọc thật)', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'waiting_owner', can_chu_id: 'T-3' });
    expect(await trangThaiCuaAgent(env.DB, WS, AG.wk, false, Date.now())).toBe('waiting_owner');
  });

  it('phiên `stopping` quá 10 phút KHÔNG còn giữ agent ở `busy`', async () => {
    await luotDangLam('lg-1', 'ph-1', TK, {
      trang_thai: 'stopping',
      stopping_luc: Date.now() - 11 * PHUT,
    });
    expect(await trangThaiCuaAgent(env.DB, WS, AG.wk, false, Date.now())).toBe('idle');
  });

  it('nộp xong thì agent về `idle` (phiên đã đóng)', async () => {
    await luotDangLam('lg-1', 'ph-1');
    expect(await trangThaiCuaAgent(env.DB, WS, AG.wk, false, Date.now())).toBe('busy');
    await nop('lg-1', TOKEN.wk);
    expect(await trangThaiCuaAgent(env.DB, WS, AG.wk, false, Date.now())).toBe('idle');
  });

  it('trang agent hiện trạng thái, nhãn tiếng Việt và **phiên đang mở** (mục 3 d.104)', async () => {
    await luotDangLam('lg-1', 'ph-1');
    const a = await layAgent(env.DB, CHU, WS, AG.wk);
    expect(a.trang_thai).toBe('busy');
    expect(a.nhan_trang_thai).toBe('Đang làm');
    expect(a.phien_dang_mo.map((p) => p.id)).toEqual(['ph-1']);
  });

  it('danh sách agent tính trạng thái cho cả trang (không N+1 im lặng)', async () => {
    await luotDangLam('lg-1', 'ph-1');
    await dungLuotGiao('lg-2', TK_2, AG.wk2, { trang_thai: 'in_progress' });
    await dungPhien('ph-2', 'lg-2', { tin_hieu_cuoi_luc: Date.now() - 45 * PHUT });

    const trang = await lietKeAgent(env.DB, CHU, WS, {}, Date.now());
    const theo_id = new Map(trang.items.map((a) => [a.id, a.trang_thai]));
    expect(theo_id.get(AG.wk)).toBe('busy');
    expect(theo_id.get(AG.wk2)).toBe('stalled');
    expect(theo_id.get(AG.mgr)).toBe('idle');
  });

  it('agent bị tắt là `disabled` trên API, dù còn phiên mở', async () => {
    await luotDangLam('lg-1', 'ph-1');
    await env.DB.prepare('UPDATE agent SET disabled = 1 WHERE id = ?').bind(AG.wk).run();

    const res = await goiApi(`/v1/agent/${AG.wk}`, TOKEN_CHU);
    expect(res.status).toBe(200);
    expect(await than<{ trang_thai: string; nhan_trang_thai: string }>(res)).toMatchObject({
      trang_thai: 'disabled',
      nhan_trang_thai: 'Đã tắt',
    });
  });
});

/* ================================================================== *
 * Đường đọc phiên
 * ================================================================== */

describe('đường đọc phiên — phạm vi và hình dạng', () => {
  beforeEach(async () => {
    await luotDangLam('lg-1', 'ph-1');
  });

  it('GET /v1/phien/:id và GET /v1/luot-giao/:id/phien trả cùng một phiên', async () => {
    const a = await layPhienApi('ph-1');
    const res = await goiApi('/v1/luot-giao/lg-1/phien', TOKEN_CHU);
    expect(res.status).toBe(200);
    expect((await than<PhienQuaApi>(res)).id).toBe(a.id);
  });

  it('GET /v1/ticket/:id/phien liệt kê phiên của ticket', async () => {
    const res = await goiApi(`/v1/ticket/${TK}/phien`, TOKEN_CHU);
    expect(res.status).toBe(200);
    expect((await than<PhienQuaApi[]>(res)).map((p) => p.id)).toEqual(['ph-1']);
  });

  it('agent NGOÀI dự án đọc phiên → NOT_FOUND (không lộ sự tồn tại — mục 13)', async () => {
    await dungAgentCoToken({ id: 'ag-ngoai', ten: 'A-ngoai', vai_tro: 'worker', token: 'bt_ngoai' });
    expect((await goiApi('/v1/phien/ph-1', 'bt_ngoai')).status).toBe(404);
    expect((await goiApi('/v1/luot-giao/lg-1/phien', 'bt_ngoai')).status).toBe(404);
  });

  it('phiên không có → NOT_FOUND', async () => {
    expect((await goiApi('/v1/phien/khong-co', TOKEN_CHU)).status).toBe(404);
    expect(await phienTheoId(env.DB, WS, 'khong-co')).toBeNull();
  });

  it('`trang_thai` là trạng thái dẫn xuất, `trang_thai_luu` là thứ trong DB', async () => {
    await env.DB.prepare('UPDATE phien SET tin_hieu_cuoi_luc = ? WHERE id = ?')
      .bind(Date.now() - 50 * PHUT, 'ph-1')
      .run();
    const p = await layPhienApi('ph-1');
    expect(p.trang_thai).toBe('stalled');
    expect(p.trang_thai_luu).toBe('running');
  });

  it('nhãn tiếng Việt lấy từ bảng 0.1', async () => {
    const d = await phienTheoId(env.DB, WS, 'ph-1');
    const ra = raPhien(d!, Date.now());
    expect(ra.nhan_trang_thai).toBe(nhan('trang_thai_phien', ra.trang_thai));
    expect(ra.nhan_trang_thai).toBe('Đang chạy');
  });

  it('mọi câu SQL ràng `workspace_id`: phiên của workspace khác không đọc được', async () => {
    expect(await phienTheoId(env.DB, 'ws-khong-ton-tai', 'ph-1')).toBeNull();
    expect(await phienCuaLuot(env.DB, 'ws-khong-ton-tai', 'lg-1')).toBeNull();
  });
});

/* ================================================================== *
 * Lệnh `heartbeat` qua cửa ghi với giờ tiêm vào
 * ================================================================== */

describe('lệnh phiên dùng `bay_gio` của cửa ghi, không `Date.now()` trong luật', () => {
  it('nhịp tim ở một mốc thời gian tiêm vào vẫn ra đúng kết luận', async () => {
    const t0 = 1_800_000_000_000;
    await luotDangLam('lg-1', 'ph-1', TK, {
      trang_thai: 'stopping',
      stopping_luc: t0,
      tin_hieu_cuoi_luc: t0,
      mo_luc: t0,
    });

    // Đúng mốc 10 phút chẵn tính từ `stopping_luc` → phiên đã tự đóng.
    const kq = await chayLenhVoiCong(
      {
        loai: 'heartbeat',
        workspace_id: WS,
        ai: {
          loai: 'agent',
          agent_id: AG.wk,
          vai_tro: 'worker',
          disabled: false,
          vao_tat_ca_du_an: true,
          du_an_duoc_vao: [],
          du_an_minh_quan_ly: [],
          ghi_de: {},
        },
        luot_giao_id: 'lg-1',
      },
      { du: false, ly_do: '' },
      t0 + HAN_XAC_NHAN_DUNG_MS,
    );

    expect(kq.loi).toMatchObject({ ma: 'SESSION_CLOSED' });
    expect((await phienTrongDb('ph-1'))?.dong_luc).toBe(t0 + HAN_XAC_NHAN_DUNG_MS);
  });

  it('1 ms sớm hơn thì nhịp tim vẫn đi qua được (đối chứng của cùng mốc)', async () => {
    const t0 = 1_800_000_000_000;
    await luotDangLam('lg-1', 'ph-1', TK, {
      trang_thai: 'stopping',
      stopping_luc: t0,
      tin_hieu_cuoi_luc: t0,
      mo_luc: t0,
    });

    const kq = await chayLenhVoiCong(
      {
        loai: 'heartbeat',
        workspace_id: WS,
        ai: {
          loai: 'agent',
          agent_id: AG.wk,
          vai_tro: 'worker',
          disabled: false,
          vao_tat_ca_du_an: true,
          du_an_duoc_vao: [],
          du_an_minh_quan_ly: [],
          ghi_de: {},
        },
        luot_giao_id: 'lg-1',
      },
      { du: false, ly_do: '' },
      t0 + HAN_XAC_NHAN_DUNG_MS - 1,
    );

    expect(kq.loi).toBeNull();
    expect(kq.ket_qua).toMatchObject({ tin_hieu: ['STOP'] });
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('stopping');
  });
});

/* ================================================================== *
 * TK_3 không dùng ở trên — giữ bộ dữ liệu ba ticket cho các ca sau
 * ================================================================== */

describe('nhiều phiên trên nhiều ticket cùng lúc', () => {
  it('ba lượt của cùng một agent có ba phiên độc lập', async () => {
    await luotDangLam('lg-1', 'ph-1', TK);
    await luotDangLam('lg-2', 'ph-2', TK_2, { tin_hieu_cuoi_luc: Date.now() - 40 * PHUT });
    await luotDangLam('lg-3', 'ph-3', TK_3, { trang_thai: 'closed' });

    expect((await layPhienApi('ph-1')).trang_thai).toBe('running');
    expect((await layPhienApi('ph-2')).trang_thai).toBe('stalled');
    expect((await layPhienApi('ph-3')).trang_thai).toBe('closed');

    // `busy` thắng `stalled` khi agent có cả hai (thứ tự của mục 3).
    expect(await trangThaiCuaAgent(env.DB, WS, AG.wk, false, Date.now())).toBe('busy');
  });

  /**
   * **BAT-57 — thu hẹp 19.12 câu 41 cho ca nhiều phiên** (CoS/Chủ giao;
   * `spec-questions.md` mục BAT-57). Ca này **thay** ca cũ "lệnh ghi của agent
   * nhích tín hiệu của MỌI phiên mở của nó (chốt tạm)": ca cũ ghim đúng hành vi
   * đã làm phiên chết không bao giờ bị báo đứng (nhịp tim lượt 1 cứu phiên lượt 2).
   * Nay nhịp tim gắn **một** lượt chỉ nhích phiên của lượt đó. Ca đầy đủ (lệnh
   * chung, cron, 1 phiên) ở `bat57-phien-dung-va-lo-id.test.ts`.
   */
  it('nhịp tim lượt 1 KHÔNG cứu phiên lượt 2: phiên chết vẫn đứng (BAT-57, thu hẹp câu 41)', async () => {
    await luotDangLam('lg-1', 'ph-1', TK);
    await luotDangLam('lg-2', 'ph-2', TK_2, { tin_hieu_cuoi_luc: Date.now() - 40 * PHUT });

    expect((await layPhienApi('ph-2')).trang_thai).toBe('stalled');

    // Nhịp tim trên **lượt 1** KHÔNG chạm phiên của lượt 2.
    expect((await heartbeat('lg-1', TOKEN.wk)).status).toBe(200);
    expect((await layPhienApi('ph-2')).trang_thai).toBe('stalled');

    // ĐỐI CHỨNG: nhịp tim trên chính lượt 2 thì phiên 2 sống lại.
    expect((await heartbeat('lg-2', TOKEN.wk)).status).toBe(200);
    expect((await layPhienApi('ph-2')).trang_thai).toBe('running');

    // ĐỐI CHỨNG: một agent KHÁC ghi thì phiên của `AG.wk` vẫn đứng.
    await luotDangLam('lg-3', 'ph-3', TK_3, { tin_hieu_cuoi_luc: Date.now() - 40 * PHUT });
    await goiApi(`/v1/ticket/${TK}/binh-luan`, TOKEN.mgr, {
      method: 'POST',
      than: { noi_dung: 'manager ghi' },
    });
    expect((await layPhienApi('ph-3')).trang_thai).toBe('stalled');
  });
});
