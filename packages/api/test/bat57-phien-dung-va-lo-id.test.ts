/**
 * **BAT-57** — hai lỗi, hai khối.
 *
 * ## Lỗi 1 — phiên chết không bao giờ bị báo "đứng"
 *
 * 19.12 câu 41 (chữ nguyên): mọi lệnh ghi của agent nhích tín hiệu của **mọi**
 * phiên còn mở của nó. Agent có lượt A (đã chết) và lượt B (đang chạy) thì mọi
 * lệnh của B làm A "sống" mãi, cron d.196 không bao giờ báo A. CoS/Chủ giao thu hẹp
 * (`spec-questions.md` mục BAT-57, chờ Chủ chốt sửa câu 41):
 *   * lệnh **gắn một lượt** (nhịp tim, hoạt động, kế hoạch, nộp, nhận) ⇒ chỉ phiên
 *     của đúng lượt đó;
 *   * lệnh **chung** (bình luận, sửa ticket…) ⇒ chỉ khi agent có **đúng 1** phiên
 *     mở; ≥2 phiên ⇒ không nhích phiên nào.
 *
 * ## Lỗi 2 — lộ sự tồn tại id lượt/phiên qua 403/404 (19.12 câu 15)
 *
 * Người gọi **không thấy** được lượt/phiên (ticket ngoài dự án mình được vào — đúng
 * luật đọc của `layTicket`) ⇒ phản hồi **giống hệt** id bịa: so trực tiếp status,
 * content-type, thân. Và không ghi gì. Người gọi **thấy** được mà không có quyền ⇒
 * vẫn 403.
 *
 * Bảng route đã rà (trước → sau, cho agent ngoài dự án với id THẬT):
 *   POST /v1/luot-giao/:id/huy                     403 → 404 (giống id bịa)
 *   POST /v1/luot-giao/:id/heartbeat               403 → 404
 *   POST /v1/luot-giao/:id/nhan (claim)            403 → 404
 *   POST /v1/luot-giao/:id/nop (submit)            403 → 404
 *   POST /v1/luot-giao/:id/nghiem-thu (verdict, giao lại khi returned) 403 → 404
 *   POST /v1/luot-giao/:id/tra-loi                 403 → 404
 *   POST /v1/luot-giao/:id/viec-phat-sinh/ticket   403 → 404
 *   POST /v1/phien/:id/hoat-dong                   403 → 404
 *   PUT  /v1/phien/:id/ke-hoach                    403 → 404
 *   POST /v1/ticket/:id/luot-giao (assign)         403 → 404 (ticket ngoài phạm vi)
 *   GET  /v1/luot-giao/:id/phien                   404 khác thân → 404 giống hệt
 *   GET  /v1/phien/:id, /hoat-dong, /ke-hoach      404 khác thân → 404 giống hệt
 *   POST /v1/phien/:id/dung (Dừng)                 403 cả hai (chỉ chủ, kiểm trước khi tra) — không lộ, không đổi
 *   GET  /v1/man-hinh-phien/:id                    403 cả hai (chỉ chủ) — không lộ, không đổi
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { NGUONG_DUNG_MAC_DINH_PHUT, HAN_XAC_NHAN_DUNG_MS } from '@baton/shared';
import { chayCron } from '../src/index.js';
import { hoatDongCuaPhien, keHoachCuaPhien } from '../src/doc-phien.js';
import {
  TOKEN_CHU,
  WS,
  datMocPhien,
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

const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const PHUT = 60_000;
/** Quá ngưỡng đứng mặc định (30 phút). */
const QUA_NGUONG_MS = (NGUONG_DUNG_MAC_DINH_PHUT + 1) * PHUT;
/** Nhịp bật việc cảnh báo (phút chia hết 5, giờ 3 UTC — ngoài cửa sổ báo cáo). */
const NHIP_CANH_BAO = Date.UTC(2026, 9, 6, 3, 5);

/** Token **giả**. */
const TOKEN = {
  wk: 'bt_token_gia_bat57_wk',
  wk2: 'bt_token_gia_bat57_wk2',
  mgr: 'bt_token_gia_bat57_mgr',
  ngoai_mgr: 'bt_token_gia_bat57_ngoai_mgr',
  ngoai_wk: 'bt_token_gia_bat57_ngoai_wk',
  tat_ca: 'bt_token_gia_bat57_tat_ca',
} as const;

let P = '';
let P_NGOAI = '';
let TK1 = '';
let TK2 = '';
let TK3 = '';

async function nen(): Promise<void> {
  await dungWorkspace();
  P = await dungDuAn('SAI', 'Sample');
  P_NGOAI = await dungDuAn('OUT', 'Dự án khác');
  await dungAgentCoToken({ id: 'ag-wk', ten: 'W-builder', vai_tro: 'worker', token: TOKEN.wk, du_an: [P] });
  await dungAgentCoToken({ id: 'ag-wk2', ten: 'W-builder-2', vai_tro: 'worker', token: TOKEN.wk2, du_an: [P] });
  await dungAgentCoToken({ id: 'ag-mgr', ten: 'M-Sample', vai_tro: 'manager', token: TOKEN.mgr, du_an: [P] });
  await dungAgentCoToken({
    id: 'ag-ngoai-mgr',
    ten: 'M-ngoai',
    vai_tro: 'manager',
    token: TOKEN.ngoai_mgr,
    du_an: [P_NGOAI],
  });
  await dungAgentCoToken({
    id: 'ag-ngoai-wk',
    ten: 'W-ngoai',
    vai_tro: 'worker',
    token: TOKEN.ngoai_wk,
    du_an: [P_NGOAI],
  });
  TK1 = await dungTicket(P, 1, 'Việc một', { trang_thai: 'in_progress' });
  TK2 = await dungTicket(P, 2, 'Việc hai', { trang_thai: 'in_progress' });
  TK3 = await dungTicket(P, 3, 'Việc ba', { trang_thai: 'todo' });
}

/** Phiên đã im quá ngưỡng (đặt mốc sau khi chèn — xem `datMocPhien`). */
async function luotCoPhien(
  luot: string,
  phien: string,
  ticket: string,
  im_ms = QUA_NGUONG_MS,
): Promise<number> {
  await dungLuotGiao(luot, ticket, 'ag-wk', { trang_thai: 'in_progress', nguoi_giao_agent_id: 'ag-mgr' });
  await dungPhien(phien, luot);
  const moc = Date.now() - im_ms;
  await datMocPhien(phien, { tin_hieu_cuoi_luc: moc });
  return moc;
}

async function tinHieu(phien: string): Promise<number | undefined> {
  return (await phienTrongDb(phien))?.tin_hieu_cuoi_luc;
}

async function trangThaiApi(phien: string): Promise<string> {
  const res = await goiApi(`/v1/phien/${phien}`, TOKEN_CHU);
  expect(res.status).toBe(200);
  return (await res.json<{ trang_thai: string }>()).trang_thai;
}

async function khoThongBao(): Promise<{ loai: string; phien_id: string | null }[]> {
  const { results } = await env.DB.prepare(
    'SELECT loai, phien_id FROM thong_bao WHERE workspace_id = ? ORDER BY tao_luc, id',
  )
    .bind(WS)
    .all<{ loai: string; phien_id: string | null }>();
  return results;
}

/* ================================================================== *
 * Lỗi 1 — tín hiệu phiên với nhiều phiên mở
 * ================================================================== */

describe('BAT-57 lỗi 1 — agent 2 phiên: lệnh của lượt B và lệnh chung KHÔNG giữ phiên A sống', () => {
  let MOC_A = 0;
  let MOC_B = 0;

  beforeEach(async () => {
    await nen();
    MOC_A = await luotCoPhien('lg-a', 'ph-a', TK1);
    MOC_B = await luotCoPhien('lg-b', 'ph-b', TK2);
  });

  it('heartbeat/log/plan trên lượt B chỉ nhích ph-b; bình luận và sửa ticket (lệnh chung) không nhích phiên nào', async () => {
    expect(
      (await goiApi('/v1/luot-giao/lg-b/heartbeat', TOKEN.wk, { method: 'POST', than: {} })).status,
    ).toBe(200);
    expect(await tinHieu('ph-a')).toBe(MOC_A);
    const sau_hb = await tinHieu('ph-b');
    expect(sau_hb).toBeGreaterThan(MOC_B);

    expect(
      (
        await goiApi('/v1/phien/ph-b/hoat-dong', TOKEN.wk, {
          method: 'POST',
          than: { loai: 'thought', noi_dung: 'đang làm B' },
        })
      ).status,
    ).toBe(201);
    expect(
      (await goiApi('/v1/phien/ph-b/ke-hoach', TOKEN.wk, { method: 'PUT', than: { buoc: ['b1'] } }))
        .status,
    ).toBe(200);
    expect(await tinHieu('ph-a')).toBe(MOC_A);

    // Lệnh chung với ≥2 phiên mở: không quy được về phiên nào ⇒ không nhích phiên nào.
    await datMocPhien('ph-b', { tin_hieu_cuoi_luc: MOC_B });
    expect(
      (
        await goiApi(`/v1/ticket/${TK1}/binh-luan`, TOKEN.wk, {
          method: 'POST',
          than: { noi_dung: 'bình luận chung' },
        })
      ).status,
    ).toBe(201);
    expect(
      (await goiApi(`/v1/ticket/${TK1}`, TOKEN.wk, { method: 'PATCH', than: { tieu_de: 'Tiêu đề mới' } }))
        .status,
    ).toBe(200);
    expect(await tinHieu('ph-a')).toBe(MOC_A);
    expect(await tinHieu('ph-b')).toBe(MOC_B);

    // "Lần cuối lên tiếng" của agent (câu 23) vẫn nhích — mốc đó KHÁC tín hiệu phiên.
    const ag = await env.DB.prepare('SELECT len_tieng_luc FROM agent WHERE id = ?')
      .bind('ag-wk')
      .first<{ len_tieng_luc: number | null }>();
    expect(ag?.len_tieng_luc).not.toBeNull();
  });

  it('A quá ngưỡng ⇒ A `stalled`, cron tạo ĐÚNG 1 thông báo cho A, KHÔNG cho B (B có nhịp tim)', async () => {
    // B sống: nhịp tim + log trên lượt B; agent còn bình luận (lệnh chung).
    await goiApi('/v1/luot-giao/lg-b/heartbeat', TOKEN.wk, { method: 'POST', than: {} });
    await goiApi('/v1/phien/ph-b/hoat-dong', TOKEN.wk, {
      method: 'POST',
      than: { loai: 'action', noi_dung: 'chạy test' },
    });
    await goiApi(`/v1/ticket/${TK2}/binh-luan`, TOKEN.wk, {
      method: 'POST',
      than: { noi_dung: 'vẫn đang làm' },
    });

    expect(await trangThaiApi('ph-a')).toBe('stalled');
    expect(await trangThaiApi('ph-b')).toBe('running');

    const kq = await chayCron({ scheduledTime: NHIP_CANH_BAO }, env);
    expect(kq.canh_bao.so_tin).toBe(1);
    expect(kq.canh_bao.tin.map((t) => t.phien_id)).toEqual(['ph-a']);

    const kho = await khoThongBao();
    expect(kho).toHaveLength(1);
    expect(kho[0]?.phien_id).toBe('ph-a');
    // Mốc chống bắn lặp (câu 46) gắn đúng tín hiệu của A, không đổi cách tính.
    expect((await phienTrongDb('ph-a'))?.canh_bao_tin_hieu_luc).toBe(MOC_A);
    expect((await phienTrongDb('ph-b'))?.canh_bao_tin_hieu_luc).toBeNull();

    // Chạy lại: không bắn lặp, kể cả khi agent tiếp tục ghi lệnh chung.
    await goiApi(`/v1/ticket/${TK2}/binh-luan`, TOKEN.wk, { method: 'POST', than: { noi_dung: 'nữa' } });
    expect((await chayCron({ scheduledTime: NHIP_CANH_BAO }, env)).canh_bao.so_tin).toBe(0);
    expect(await khoThongBao()).toHaveLength(1);
  });

  it('ĐỐI CHỨNG: nhịp tim trên chính lượt A thì A sống lại và cron không bắn gì', async () => {
    await goiApi('/v1/luot-giao/lg-a/heartbeat', TOKEN.wk, { method: 'POST', than: {} });
    await goiApi('/v1/luot-giao/lg-b/heartbeat', TOKEN.wk, { method: 'POST', than: {} });
    expect(await trangThaiApi('ph-a')).toBe('running');
    expect((await chayCron({ scheduledTime: NHIP_CANH_BAO }, env)).canh_bao.so_tin).toBe(0);
    expect(await khoThongBao()).toHaveLength(0);
  });

  it('nộp báo cáo lượt B không nhích ph-a', async () => {
    const res = await goiApi('/v1/luot-giao/lg-b/nop', TOKEN.wk, {
      method: 'POST',
      than: { ket_qua: 'partial', da_lam: 'nửa việc' },
    });
    expect(res.status).toBe(200);
    expect(await tinHieu('ph-a')).toBe(MOC_A);
  });

  it('lệnh gắn lượt bị SESSION_CLOSED vẫn KHÔNG rơi về nhánh "lệnh chung": phiên mở duy nhất còn lại không bị nhích', async () => {
    // Đóng ph-b: agent còn đúng 1 phiên mở (ph-a). Nhịp tim lượt B → SESSION_CLOSED.
    await env.DB.prepare(
      "UPDATE phien SET trang_thai = 'closed', dong_luc = ?, ly_do_dong = 'test' WHERE id = 'ph-b' AND workspace_id = ?",
    )
      // Lùi 1 giây (BAT-58): không trùng mili-giây với lệnh sau ⇒ không xanh oan.
      .bind(Date.now() - 1000, WS)
      .run();
    const res = await goiApi('/v1/luot-giao/lg-b/heartbeat', TOKEN.wk, { method: 'POST', than: {} });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'SESSION_CLOSED' });
    expect(await tinHieu('ph-a')).toBe(MOC_A);

    // ĐỐI CHỨNG cùng dữ liệu: lệnh CHUNG với đúng 1 phiên mở thì nhích ph-a.
    await goiApi(`/v1/ticket/${TK1}/binh-luan`, TOKEN.wk, { method: 'POST', than: { noi_dung: 'x' } });
    expect(await tinHieu('ph-a')).toBeGreaterThan(MOC_A);
  });

  it('phiên `stopping` đã quá 10 phút (đóng theo luật d.194) không tính là phiên mở: lệnh chung vẫn nhích phiên còn lại', async () => {
    const t = Date.now();
    await env.DB.prepare(
      "UPDATE phien SET trang_thai = 'stopping', stopping_luc = ? WHERE id = 'ph-b' AND workspace_id = ?",
    )
      .bind(t - HAN_XAC_NHAN_DUNG_MS - 1000, WS)
      .run();
    await goiApi(`/v1/ticket/${TK1}/binh-luan`, TOKEN.wk, { method: 'POST', than: { noi_dung: 'x' } });
    expect(await tinHieu('ph-a')).toBeGreaterThan(MOC_A);

    // ĐỐI CHỨNG: `stopping` còn trong hạn 10 phút thì vẫn là phiên mở ⇒ 2 phiên ⇒ không nhích.
    await datMocPhien('ph-a', { tin_hieu_cuoi_luc: MOC_A });
    await env.DB.prepare("UPDATE phien SET stopping_luc = ? WHERE id = 'ph-b' AND workspace_id = ?")
      .bind(Date.now(), WS)
      .run();
    await goiApi(`/v1/ticket/${TK1}/binh-luan`, TOKEN.wk, { method: 'POST', than: { noi_dung: 'y' } });
    expect(await tinHieu('ph-a')).toBe(MOC_A);
  });

  /*
   * Sửa theo reviewer, điểm 4: `luot_tin_hieu` phải được khai **cả** trên nhánh
   * `SESSION_CLOSED` của hoạt động, kế hoạch và nộp (nhịp tim đã có ca ở trên).
   * Thiếu nó thì lệnh rơi về nhánh "lệnh chung", thấy agent chỉ còn đúng 1 phiên
   * mở (ph-a) và nhích ph-a — đúng lỗi BAT-57.
   */
  for (const [ten, goi] of [
    [
      'gửi hoạt động',
      () =>
        goiApi('/v1/phien/ph-b/hoat-dong', TOKEN.wk, {
          method: 'POST',
          than: { loai: 'thought', noi_dung: 'muộn' },
        }),
    ],
    ['đặt kế hoạch', () => goiApi('/v1/phien/ph-b/ke-hoach', TOKEN.wk, { method: 'PUT', than: { buoc: ['x'] } })],
    [
      'nộp báo cáo',
      () =>
        goiApi('/v1/luot-giao/lg-b/nop', TOKEN.wk, {
          method: 'POST',
          than: { ket_qua: 'partial', da_lam: 'nửa việc' },
        }),
    ],
  ] as const) {
    it(`${ten} trên phiên đã đóng ⇒ SESSION_CLOSED và KHÔNG nhích phiên mở duy nhất còn lại`, async () => {
      await env.DB.prepare(
        "UPDATE phien SET trang_thai = 'closed', dong_luc = ?, ly_do_dong = 'test' WHERE id = 'ph-b' AND workspace_id = ?",
      )
        // Lùi 1 giây (BAT-58): không trùng mili-giây với lệnh sau ⇒ không xanh oan.
        .bind(Date.now() - 1000, WS)
        .run();
      const res = await goi();
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ error: 'SESSION_CLOSED' });
      expect(await tinHieu('ph-a')).toBe(MOC_A);
    });
  }

  it('câu hỏi (`question`) trên phiên B chỉ nhích ph-b và đưa ph-b sang `waiting_assigner`; ph-a không đổi', async () => {
    const res = await goiApi('/v1/phien/ph-b/hoat-dong', TOKEN.wk, {
      method: 'POST',
      than: { loai: 'question', noi_dung: 'Dùng thư viện nào?' },
    });
    expect(res.status).toBe(201);
    expect(await tinHieu('ph-b')).toBeGreaterThan(MOC_B);
    expect(await trangThaiApi('ph-b')).toBe('waiting_assigner');
    expect(await tinHieu('ph-a')).toBe(MOC_A);
    expect(await trangThaiApi('ph-a')).toBe('stalled');
  });

  it('lệnh CHUNG đóng phiên B trong chính lệnh đó (worker chuyển TK2 sang Chờ kiểm chứng) ⇒ ph-a KHÔNG nhích', async () => {
    /*
     * Sửa theo reviewer, điểm 3: câu nhích tín hiệu chạy SAU câu đóng ph-b trong
     * cùng batch. Phép đếm "đúng 1 phiên mở" không tính phiên vừa đóng thì thấy
     * chỉ còn ph-a và nhích ph-a — tức một lệnh về B làm A "sống".
     */
    const res = await goiApi(`/v1/ticket/${TK2}/trang-thai`, TOKEN.wk, {
      method: 'POST',
      than: { trang_thai: 'verifying' },
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    expect((await phienTrongDb('ph-b'))?.trang_thai).toBe('closed');
    expect(await tinHieu('ph-a')).toBe(MOC_A);

    // ĐỐI CHỨNG: lệnh chung kế tiếp (B đã đóng ở lệnh TRƯỚC) ⇒ đúng 1 phiên mở ⇒ nhích ph-a.
    await goiApi(`/v1/ticket/${TK1}/binh-luan`, TOKEN.wk, { method: 'POST', than: { noi_dung: 'x' } });
    expect(await tinHieu('ph-a')).toBeGreaterThan(MOC_A);
  });

  it('nhận một lượt mới chỉ mở/nhích phiên của lượt đó, không nhích ph-a/ph-b', async () => {
    await dungLuotGiao('lg-moi', TK3, 'ag-wk', { nguoi_giao_agent_id: 'ag-mgr' });
    const res = await goiApi('/v1/luot-giao/lg-moi/nhan', TOKEN.wk, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await tinHieu('ph-a')).toBe(MOC_A);
    expect(await tinHieu('ph-b')).toBe(MOC_B);
  });
});

describe('BAT-57 lỗi 1 — ca 1 phiên giữ hành vi cũ; chủ và agent khác không nhích', () => {
  let MOC_A = 0;

  beforeEach(async () => {
    await nen();
    MOC_A = await luotCoPhien('lg-a', 'ph-a', TK1);
  });

  it('1 phiên mở: lệnh chung (bình luận) VẪN nhích tín hiệu (không hồi quy câu 41 cho ca phổ biến)', async () => {
    const res = await goiApi(`/v1/ticket/${TK2}/binh-luan`, TOKEN.wk, {
      method: 'POST',
      than: { noi_dung: 'ticket khác' },
    });
    expect(res.status).toBe(201);
    expect(await tinHieu('ph-a')).toBeGreaterThan(MOC_A);
  });

  it('lệnh của CHỦ và của agent KHÁC không nhích phiên của agent', async () => {
    await goiApi(`/v1/ticket/${TK1}/binh-luan`, TOKEN_CHU, { method: 'POST', than: { noi_dung: 'chủ' } });
    await goiApi(`/v1/ticket/${TK1}/binh-luan`, TOKEN.mgr, { method: 'POST', than: { noi_dung: 'mgr' } });
    // Agent khác gửi lệnh gắn lượt của chính nó cũng không chạm phiên của ag-wk.
    await dungLuotGiao('lg-wk2', TK2, 'ag-wk2', { trang_thai: 'in_progress', nguoi_giao_agent_id: 'ag-mgr' });
    await dungPhien('ph-wk2', 'lg-wk2');
    await goiApi('/v1/luot-giao/lg-wk2/heartbeat', TOKEN.wk2, { method: 'POST', than: {} });
    expect(await tinHieu('ph-a')).toBe(MOC_A);
  });
});

/* ================================================================== *
 * Lỗi 2 — không lộ id lượt/phiên qua 403/404
 * ================================================================== */

/** Toàn bộ phản hồi người gọi thấy: status, kiểu nội dung, thân. */
async function phanHoi(res: Response): Promise<{ status: number; kieu: string | null; than: unknown }> {
  return { status: res.status, kieu: res.headers.get('content-type'), than: await res.json() };
}

interface Duong {
  ten: string;
  method: string;
  /** Đường với id thật hoặc bịa thay vào `:id`. */
  duong: (id: string) => string;
  id_that: string;
  id_bia: string;
  than?: unknown;
  /** Thân phụ thuộc id (id nằm trong thân, không trong đường — vd `phien_lien_quan`). */
  than_theo_id?: (id: string) => unknown;
  /** Token agent ngoài dự án dùng cho đường này. */
  token: string;
}

describe('BAT-57 lỗi 2 — agent ngoài dự án: id thật và id bịa ra phản hồi GIỐNG HỆT, không ghi gì', () => {
  beforeEach(async () => {
    await nen();
    // lg-a: in_progress, có phiên ph-a (có 1 câu hỏi để `tra-loi` có việc thật).
    await dungLuotGiao('lg-a', TK1, 'ag-wk', { trang_thai: 'in_progress', nguoi_giao_agent_id: 'ag-mgr' });
    await dungPhien('ph-a', 'lg-a', { tin_hieu_cuoi_luc: 1 });
    // lg-s: đã nộp, có việc phát sinh (nghiệm thu, viec-phat-sinh).
    await dungLuotGiao('lg-s', TK2, 'ag-wk', {
      trang_thai: 'submitted',
      nguoi_giao_agent_id: 'ag-mgr',
      ket_qua: 'done',
      bc_viec_phat_sinh: 'Việc phát sinh X',
      nop_luc: Date.now(),
    });
    // lg-p: pending (nhận).
    await dungLuotGiao('lg-p', TK3, 'ag-wk', { nguoi_giao_agent_id: 'ag-mgr' });
  });

  const DUONG: Duong[] = [
    { ten: 'huỷ lượt', method: 'POST', duong: (id) => `/v1/luot-giao/${id}/huy`, id_that: 'lg-a', id_bia: 'lg-khong-co', than: { ly_do: 'x' }, token: TOKEN.ngoai_mgr },
    { ten: 'nhịp tim', method: 'POST', duong: (id) => `/v1/luot-giao/${id}/heartbeat`, id_that: 'lg-a', id_bia: 'lg-khong-co', than: {}, token: TOKEN.ngoai_wk },
    { ten: 'nhận (claim)', method: 'POST', duong: (id) => `/v1/luot-giao/${id}/nhan`, id_that: 'lg-p', id_bia: 'lg-khong-co', token: TOKEN.ngoai_wk },
    { ten: 'nộp (submit)', method: 'POST', duong: (id) => `/v1/luot-giao/${id}/nop`, id_that: 'lg-a', id_bia: 'lg-khong-co', than: { ket_qua: 'done', da_lam: 'x' }, token: TOKEN.ngoai_wk },
    { ten: 'nghiệm thu accepted (verdict)', method: 'POST', duong: (id) => `/v1/luot-giao/${id}/nghiem-thu`, id_that: 'lg-s', id_bia: 'lg-khong-co', than: { ket_qua: 'accepted' }, token: TOKEN.ngoai_mgr },
    { ten: 'nghiệm thu returned (giao lại)', method: 'POST', duong: (id) => `/v1/luot-giao/${id}/nghiem-thu`, id_that: 'lg-s', id_bia: 'lg-khong-co', than: { ket_qua: 'returned', ly_do: 'thiếu' }, token: TOKEN.ngoai_mgr },
    { ten: 'trả lời câu hỏi', method: 'POST', duong: (id) => `/v1/luot-giao/${id}/tra-loi`, id_that: 'lg-a', id_bia: 'lg-khong-co', than: { noi_dung: 'x' }, token: TOKEN.ngoai_mgr },
    { ten: 'tạo ticket từ việc phát sinh', method: 'POST', duong: (id) => `/v1/luot-giao/${id}/viec-phat-sinh/ticket`, id_that: 'lg-s', id_bia: 'lg-khong-co', than: {}, token: TOKEN.ngoai_mgr },
    { ten: 'gửi hoạt động', method: 'POST', duong: (id) => `/v1/phien/${id}/hoat-dong`, id_that: 'ph-a', id_bia: 'ph-khong-co', than: { loai: 'result', noi_dung: 'x' }, token: TOKEN.ngoai_wk },
    { ten: 'gửi kế hoạch', method: 'PUT', duong: (id) => `/v1/phien/${id}/ke-hoach`, id_that: 'ph-a', id_bia: 'ph-khong-co', than: { buoc: ['x'] }, token: TOKEN.ngoai_wk },
    { ten: 'giao việc (assign) trên ticket ngoài phạm vi', method: 'POST', duong: (id) => `/v1/ticket/${id}/luot-giao`, id_that: 'tk-pj-SAI-3', id_bia: 'tk-khong-co', than: { nguoi_nhan_agent_id: 'ag-ngoai-wk' }, token: TOKEN.ngoai_mgr },
    { ten: 'GET phiên của lượt', method: 'GET', duong: (id) => `/v1/luot-giao/${id}/phien`, id_that: 'lg-a', id_bia: 'lg-khong-co', token: TOKEN.ngoai_wk },
    { ten: 'GET phiên', method: 'GET', duong: (id) => `/v1/phien/${id}`, id_that: 'ph-a', id_bia: 'ph-khong-co', token: TOKEN.ngoai_wk },
    { ten: 'GET hoạt động phiên', method: 'GET', duong: (id) => `/v1/phien/${id}/hoat-dong`, id_that: 'ph-a', id_bia: 'ph-khong-co', token: TOKEN.ngoai_wk },
    { ten: 'GET kế hoạch phiên', method: 'GET', duong: (id) => `/v1/phien/${id}/ke-hoach`, id_that: 'ph-a', id_bia: 'ph-khong-co', token: TOKEN.ngoai_wk },
    { ten: 'Dừng phiên (chỉ chủ)', method: 'POST', duong: (id) => `/v1/phien/${id}/dung`, id_that: 'ph-a', id_bia: 'ph-khong-co', token: TOKEN.ngoai_mgr },
    // Sửa theo reviewer, điểm 1: id phiên nằm trong thân (`phien_lien_quan`).
    { ten: 'tạo mục Cần Chủ nối phiên (phien_lien_quan)', method: 'POST', duong: () => '/v1/can-chu', id_that: 'ph-a', id_bia: 'ph-khong-co', than_theo_id: (id) => ({ tieu_de: 'Hỏi chủ', muc: 'today', loai: 'fyi', phien_lien_quan: id }), token: TOKEN.ngoai_mgr },
  ];

  /** Ảnh chụp mọi thứ một lệnh ghi có thể chạm. */
  async function anhDb(): Promise<unknown> {
    const luot = await env.DB.prepare(
      'SELECT id, trang_thai, ly_do, cap_nhat_luc FROM luot_giao WHERE workspace_id = ? ORDER BY id',
    )
      .bind(WS)
      .all();
    const phien = await env.DB.prepare(
      'SELECT id, trang_thai, tin_hieu_cuoi_luc, cap_nhat_luc, ghi_chu_cuoi FROM phien WHERE workspace_id = ? ORDER BY id',
    )
      .bind(WS)
      .all();
    const dem = await env.DB.prepare(
      `SELECT (SELECT count(*) FROM ticket WHERE workspace_id = ?) AS ticket,
              (SELECT count(*) FROM comment WHERE workspace_id = ?) AS comment,
              (SELECT count(*) FROM ticket_history WHERE workspace_id = ?) AS lich_su,
              (SELECT count(*) FROM phien_hoat_dong WHERE workspace_id = ?) AS hoat_dong,
              (SELECT count(*) FROM phien_ke_hoach WHERE workspace_id = ?) AS ke_hoach,
              (SELECT count(*) FROM can_chu WHERE workspace_id = ?) AS can_chu`,
    )
      .bind(WS, WS, WS, WS, WS, WS)
      .first();
    const ngoai = await env.DB.prepare(
      "SELECT id, len_tieng_luc FROM agent WHERE id IN ('ag-ngoai-mgr', 'ag-ngoai-wk') ORDER BY id",
    ).all();
    return { luot: luot.results, phien: phien.results, dem, ngoai: ngoai.results };
  }

  for (const d of DUONG) {
    it(`${d.method} ${d.ten}: id thật ngoài phạm vi ≡ id bịa (status + content-type + thân), DB không đổi`, async () => {
      const truoc = await anhDb();
      const goi = async (id: string): Promise<Response> => {
        const than = d.than_theo_id === undefined ? d.than : d.than_theo_id(id);
        return goiApi(d.duong(id), d.token, {
          method: d.method,
          ...(than === undefined ? {} : { than }),
        });
      };

      const that = await phanHoi(await goi(d.id_that));
      const bia = await phanHoi(await goi(d.id_bia));

      expect(that).toEqual(bia);
      // Mã cụ thể: 404 NOT_FOUND, trừ "Dừng" là việc của chủ — 403 cho MỌI id (kiểm vai trò trước khi tra).
      if (d.ten.startsWith('Dừng')) {
        expect(that.status).toBe(403);
      } else {
        expect(that.status).toBe(404);
        expect(that.than).toMatchObject({ error: 'NOT_FOUND' });
      }
      expect(await anhDb()).toEqual(truoc);
    });
  }

  it('assign: ca riêng "ticket ngoài phạm vi + agent bịa" vẫn giống hệt ticket bịa (không phép kiểm nào chen trước làm lệch)', async () => {
    const a = await phanHoi(
      await goiApi(`/v1/ticket/${TK3}/luot-giao`, TOKEN.ngoai_mgr, {
        method: 'POST',
        than: { nguoi_nhan_agent_id: 'ag-khong-co' },
      }),
    );
    const b = await phanHoi(
      await goiApi('/v1/ticket/tk-khong-co/luot-giao', TOKEN.ngoai_mgr, {
        method: 'POST',
        than: { nguoi_nhan_agent_id: 'ag-khong-co' },
      }),
    );
    expect(a).toEqual(b);
    expect(a.status).toBe(404);
  });
});

describe('BAT-57 lỗi 2 — người gọi THẤY được lượt nhưng không có quyền: vẫn 403 như cũ', () => {
  beforeEach(async () => {
    await nen();
    await dungLuotGiao('lg-a', TK1, 'ag-wk', { trang_thai: 'in_progress', nguoi_giao_agent_id: 'ag-mgr' });
    await dungPhien('ph-a', 'lg-a', { tin_hieu_cuoi_luc: 1 });
    await dungLuotGiao('lg-p', TK3, 'ag-wk', { nguoi_giao_agent_id: 'ag-mgr' });
    await dungAgentCoToken({
      id: 'ag-tat-ca',
      ten: 'M-tat-ca',
      vai_tro: 'manager',
      token: TOKEN.tat_ca,
      vao_tat_ca_du_an: true,
    });
  });

  async function forbidden(res: Response): Promise<void> {
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  }

  it('agent cùng dự án huỷ lượt không phải mình giao → 403', async () => {
    await forbidden(await goiApi('/v1/luot-giao/lg-a/huy', TOKEN.wk2, { method: 'POST', than: {} }));
  });

  it('agent "tất cả dự án" (thấy mọi lượt) huỷ lượt không phải mình giao → 403', async () => {
    await forbidden(await goiApi('/v1/luot-giao/lg-a/huy', TOKEN.tat_ca, { method: 'POST', than: {} }));
  });

  it('chủ gửi nhịp tim (câu 44) → 403; agent cùng dự án gửi nhịp tim lượt người khác → 403', async () => {
    await forbidden(await goiApi('/v1/luot-giao/lg-a/heartbeat', TOKEN_CHU, { method: 'POST', than: {} }));
    await forbidden(await goiApi('/v1/luot-giao/lg-a/heartbeat', TOKEN.wk2, { method: 'POST', than: {} }));
  });

  it('agent cùng dự án: nhận lượt của người khác, nộp hộ, gửi hoạt động/kế hoạch phiên người khác → 403', async () => {
    await forbidden(await goiApi('/v1/luot-giao/lg-p/nhan', TOKEN.wk2, { method: 'POST' }));
    await forbidden(
      await goiApi('/v1/luot-giao/lg-a/nop', TOKEN.wk2, { method: 'POST', than: { ket_qua: 'done' } }),
    );
    await forbidden(
      await goiApi('/v1/phien/ph-a/hoat-dong', TOKEN.wk2, {
        method: 'POST',
        than: { loai: 'thought', noi_dung: 'x' },
      }),
    );
    await forbidden(
      await goiApi('/v1/phien/ph-a/ke-hoach', TOKEN.wk2, { method: 'PUT', than: { buoc: ['x'] } }),
    );
    expect(await hoatDongCuaPhien(env.DB, WS, 'ph-a')).toHaveLength(0);
    expect((await keHoachCuaPhien(env.DB, WS, 'ph-a')).phien_ban).toBe(0);
    expect((await phienTrongDb('ph-a'))?.tin_hieu_cuoi_luc).toBe(1);
  });

  it('manager cùng dự án tạo mục Cần Chủ nối phiên KHÔNG phải của mình (thấy được) → 403, không tạo mục', async () => {
    await forbidden(
      await goiApi('/v1/can-chu', TOKEN.mgr, {
        method: 'POST',
        than: { tieu_de: 'Hỏi chủ', muc: 'today', loai: 'fyi', phien_lien_quan: 'ph-a' },
      }),
    );
    expect(
      await env.DB.prepare('SELECT count(*) AS n FROM can_chu WHERE workspace_id = ?').bind(WS).first('n'),
    ).toBe(0);
  });

  it('worker cùng dự án giao việc (không có quyền assign) trên ticket thấy được → 403', async () => {
    await forbidden(
      await goiApi(`/v1/ticket/${TK3}/luot-giao`, TOKEN.wk2, {
        method: 'POST',
        than: { nguoi_nhan_agent_id: 'ag-wk' },
      }),
    );
  });

  it('ĐỐI CHỨNG: người giao (cùng dự án) huỷ được; chủ huỷ được', async () => {
    expect(
      (await goiApi('/v1/luot-giao/lg-p/huy', TOKEN.mgr, { method: 'POST', than: {} })).status,
    ).toBe(200);
    expect(
      (await goiApi('/v1/luot-giao/lg-a/huy', TOKEN_CHU, { method: 'POST', than: {} })).status,
    ).toBe(200);
  });
});

/* ================================================================== *
 * Sửa theo reviewer, điểm 2 — người nhận / người giao bị gỡ khỏi dự án
 * ================================================================== */

/**
 * "Thấy được" trên đường GHI = trong phạm vi đọc **HOẶC** là hai bên của lượt
 * (người nhận, người giao); với phiên: agent của phiên **HOẶC** người giao của
 * lượt của phiên. Căn cứ: 19.12 câu 37, 44 (lệnh của người nhận/người giao kiểm
 * theo danh tính, không qua bảng quyền), 19.6 (lượt bị huỷ ⇒ `stopping`, agent
 * phải gửi được result/error); `luotGiaoCuaToi` vẫn liệt kê lượt đó cho họ.
 *
 * Hành vi ghim = hành vi **trước BAT-57** (lúc đó câu tra lượt/phiên không lọc
 * phạm vi, rồi kiểm danh tính): bị gỡ khỏi dự án không đổi gì cho lệnh trên lượt
 * của chính mình. Đường ĐỌC (`GET /v1/phien/:id`) giữ luật `layTicket` như trước
 * BAT-57: người bị gỡ ra 404 (`spec-questions.md` #175).
 */
describe('BAT-57 (reviewer) — người nhận/người giao bị gỡ khỏi dự án vẫn làm tiếp lệnh trên lượt của mình', () => {
  beforeEach(async () => {
    await nen();
    await dungLuotGiao('lg-a', TK1, 'ag-wk', { trang_thai: 'in_progress', nguoi_giao_agent_id: 'ag-mgr' });
    await dungPhien('ph-a', 'lg-a', { tin_hieu_cuoi_luc: 1 });
    await dungLuotGiao('lg-s', TK2, 'ag-wk', {
      trang_thai: 'submitted',
      nguoi_giao_agent_id: 'ag-mgr',
      ket_qua: 'done',
      nop_luc: Date.now(),
    });
    await dungLuotGiao('lg-p', TK3, 'ag-wk', { nguoi_giao_agent_id: 'ag-mgr' });
  });

  async function goKhoiDuAn(agent_id: string): Promise<void> {
    await env.DB.prepare('DELETE FROM agent_project WHERE agent_id = ?').bind(agent_id).run();
    const n = await env.DB.prepare('SELECT count(*) AS n FROM agent_project WHERE agent_id = ?')
      .bind(agent_id)
      .first('n');
    expect(n).toBe(0);
  }

  it('người NHẬN bị gỡ: nhịp tim, gửi hoạt động, đặt kế hoạch, nộp vẫn chạy (như trước BAT-57)', async () => {
    await goKhoiDuAn('ag-wk');

    expect((await goiApi('/v1/luot-giao/lg-a/heartbeat', TOKEN.wk, { method: 'POST', than: {} })).status).toBe(200);
    expect(await tinHieu('ph-a')).toBeGreaterThan(1);
    expect(
      (
        await goiApi('/v1/phien/ph-a/hoat-dong', TOKEN.wk, {
          method: 'POST',
          than: { loai: 'action', noi_dung: 'vẫn làm' },
        })
      ).status,
    ).toBe(201);
    expect(
      (await goiApi('/v1/phien/ph-a/ke-hoach', TOKEN.wk, { method: 'PUT', than: { buoc: ['b1'] } })).status,
    ).toBe(200);
    const nop = await goiApi('/v1/luot-giao/lg-a/nop', TOKEN.wk, {
      method: 'POST',
      than: { ket_qua: 'done', da_lam: 'xong' },
    });
    expect(nop.status, JSON.stringify(await nop.clone().json())).toBe(200);
    expect(await hoatDongCuaPhien(env.DB, WS, 'ph-a')).toHaveLength(1);
  });

  it('người NHẬN bị gỡ: nhận (claim) lượt pending của mình vẫn chạy', async () => {
    await goKhoiDuAn('ag-wk');
    const res = await goiApi('/v1/luot-giao/lg-p/nhan', TOKEN.wk, { method: 'POST' });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
  });

  it('người NHẬN bị gỡ, lượt bị chủ huỷ ⇒ phiên `stopping`, agent vẫn gửi được `result` (19.6)', async () => {
    await goKhoiDuAn('ag-wk');
    expect((await goiApi('/v1/luot-giao/lg-a/huy', TOKEN_CHU, { method: 'POST', than: {} })).status).toBe(200);
    expect((await phienTrongDb('ph-a'))?.trang_thai).toBe('stopping');
    const res = await goiApi('/v1/phien/ph-a/hoat-dong', TOKEN.wk, {
      method: 'POST',
      than: { loai: 'result', noi_dung: 'đã dừng' },
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  });

  it('người NHẬN bị gỡ: đường ĐỌC phiên giữ luật đọc như trước BAT-57 ⇒ 404 giống hệt id bịa', async () => {
    await goKhoiDuAn('ag-wk');
    const that = await phanHoi(await goiApi('/v1/phien/ph-a', TOKEN.wk));
    const bia = await phanHoi(await goiApi('/v1/phien/ph-khong-co', TOKEN.wk));
    expect(that).toEqual(bia);
    expect(that.status).toBe(404);
  });

  it('người GIAO bị gỡ: huỷ lượt mình giao vẫn chạy (200, như trước BAT-57)', async () => {
    await goKhoiDuAn('ag-mgr');
    const res = await goiApi('/v1/luot-giao/lg-a/huy', TOKEN.mgr, { method: 'POST', than: { ly_do: 'đổi hướng' } });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    expect(
      await env.DB.prepare("SELECT trang_thai FROM luot_giao WHERE id = 'lg-a'").first('trang_thai'),
    ).toBe('canceled');
  });

  it('người GIAO bị gỡ: nghiệm thu lượt mình giao vẫn chạy (accepted → 200, như trước BAT-57)', async () => {
    await goKhoiDuAn('ag-mgr');
    const res = await goiApi('/v1/luot-giao/lg-s/nghiem-thu', TOKEN.mgr, {
      method: 'POST',
      than: { ket_qua: 'accepted' },
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
    expect(
      await env.DB.prepare("SELECT trang_thai FROM luot_giao WHERE id = 'lg-s'").first('trang_thai'),
    ).toBe('accepted');
  });

  it('người GIAO bị gỡ: trả lời câu hỏi trên lượt mình giao vẫn chạy', async () => {
    expect(
      (
        await goiApi('/v1/phien/ph-a/hoat-dong', TOKEN.wk, {
          method: 'POST',
          than: { loai: 'question', noi_dung: 'Hỏi?' },
        })
      ).status,
    ).toBe(201);
    await goKhoiDuAn('ag-mgr');
    const res = await goiApi('/v1/luot-giao/lg-a/tra-loi', TOKEN.mgr, {
      method: 'POST',
      than: { noi_dung: 'Trả lời.' },
    });
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  });

  it('người NGOÀI (không thuộc dự án, không phải hai bên của lượt) vẫn 404 giống hệt id bịa, kể cả sau khi gỡ', async () => {
    await goKhoiDuAn('ag-wk');
    await goKhoiDuAn('ag-mgr');
    for (const [duong, bia, than] of [
      ['/v1/luot-giao/lg-a/heartbeat', '/v1/luot-giao/lg-khong-co/heartbeat', {}],
      ['/v1/luot-giao/lg-a/huy', '/v1/luot-giao/lg-khong-co/huy', {}],
      ['/v1/phien/ph-a/hoat-dong', '/v1/phien/ph-khong-co/hoat-dong', { loai: 'result', noi_dung: 'x' }],
    ] as const) {
      const a = await phanHoi(await goiApi(duong, TOKEN.ngoai_wk, { method: 'POST', than }));
      const b = await phanHoi(await goiApi(bia, TOKEN.ngoai_wk, { method: 'POST', than }));
      expect(a).toEqual(b);
      expect(a.status).toBe(404);
    }
  });
});
