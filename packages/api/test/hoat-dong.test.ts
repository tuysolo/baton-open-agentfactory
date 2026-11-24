/**
 * **Dòng hoạt động, kế hoạch, hỏi người giao, cảnh báo** — SPEC mục 6 d.190,
 * d.191, d.193, d.196; 19.6; 19.12 câu 2.
 *
 * Mỗi câu có tính luật của năm chỗ đó có **một ca**, tên ca ghi đúng chữ SPEC.
 *
 * Ba kỷ luật riêng của file này (tiếp đúng khuôn `phien.test.ts` của lượt 3):
 *
 *   1. **Ca đối chứng ở mọi chỗ dễ xanh giả.** "`question` không bị tính đứng"
 *      xanh kể cả khi luật bị gỡ, nếu không có một ca `running` **cùng mốc thời
 *      gian** mà **có** đứng. Mọi cặp như vậy dùng **chung một hằng**.
 *   2. **Mốc 60 phút đo ở mốc chẵn và ở 1 ms trước mốc.** `>` với `>=` lệch nhau
 *      đúng ở mốc chẵn.
 *   3. **Mốc đếm đúng chỗ.** Ca canh nợ #48: agent `waiting_assigner` **vẫn gửi
 *      nhịp tim** mà **vẫn** vào "Cần chú ý" sau 60 phút. Đếm từ
 *      `tin_hieu_cuoi_luc` thì ca đó xanh giả mãi mãi.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  HAN_CHO_NGUOI_GIAO_CAN_CHU_Y_MS,
  LY_DO_DONG_DA_XAC_NHAN_DUNG,
  NGUONG_DUNG_MAC_DINH_PHUT,
  SO_BUOC_KE_HOACH_TOI_DA,
  TRANG_THAI_BUOC,
  canhBaoDung,
  danhSachMa,
  kiemKeHoach,
  kiemLoaiHoatDong,
  nhan,
  phienSauHoatDong,
  phienSauTraLoi,
  trangThaiPhienDanXuat,
  type AiGoiAgent,
  type LoaiHoatDong,
  type PhienLuu,
  type TrangThaiPhien,
} from '@baton/shared';
import { congBangChungCua } from '../src/cong-bang-chung.js';
import { handlerGuiHoatDong } from '../src/lenh-hoat-dong.js';
import {
  cauHoiChoTraLoi,
  hoatDongCuaPhien,
  keHoachCuaPhien,
  phienCanCanhBao,
  phienTheoId,
  raPhien,
} from '../src/doc-phien.js';
import { tinCanhBaoPhien, type TinCanhBaoPhien } from '../src/thong-bao.js';
import { TRUONG_CLIENT, chayCron } from '../src/index.js';
import {
  TOKEN_CHU,
  WS,
  choVaoDuAn,
  datMocPhien,
  dungAgentCoToken,
  dungDuAn,
  dungHoatDong,
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

const AG = { mgr: 'ag-mgr', wk: 'ag-wk', khac: 'ag-khac' } as const;
const TOKEN = { mgr: 'bt_hd_mgr', wk: 'bt_hd_wk', khac: 'bt_hd_khac' } as const;

const PHUT = 60_000;
const NGUONG_MAC_DINH_MS = NGUONG_DUNG_MAC_DINH_PHUT * PHUT;

beforeEach(async () => {
  await dungWorkspace();
  await dungAgentCoToken({ id: AG.mgr, ten: 'M-Sample', vai_tro: 'manager', token: TOKEN.mgr });
  await dungAgentCoToken({ id: AG.wk, ten: 'W-builder', vai_tro: 'worker', token: TOKEN.wk });
  await dungAgentCoToken({ id: AG.khac, ten: 'W-khac', vai_tro: 'worker', token: TOKEN.khac });

  await dungDuAn('SAI', 'Sample', 'active', AG.mgr);
  for (const id of Object.values(AG)) await choVaoDuAn(id, P);

  await dungTicket(P, 1, 'Việc để giao', { trang_thai: 'in_progress' });
  await dungTicket(P, 2, 'Việc thứ hai', { trang_thai: 'in_progress' });
});

/* ------------------------------------------------------------------ *
 * Giúp việc: đi đúng đường HTTP thật
 * ------------------------------------------------------------------ */

async function than<T>(res: Response): Promise<T> {
  return res.json<T>();
}

/**
 * Một phiên `running` của `AG.wk` trên `TK`, do `AG.mgr` giao.
 * Trả mã lượt và mã phiên.
 */
/**
 * **Một lượt Cron cảnh báo** (nhịp 5 phút) — 19.12 câu 46 chốt rằng đây là đường
 * phát hiện duy nhất. Trước chốt đó các ca dưới đây gọi
 * `POST /v1/phien/canh-bao/quet`; route và lệnh đó đã bị gỡ, và **không** được dựng
 * lại — ca "không còn route nào" ở `cron-canh-bao-phien.test.ts` canh điều đó.
 */
async function quetCanhBao(): Promise<{
  so_tin: number;
  tin: TinCanhBaoPhien[];
  kenh: string[];
}> {
  // Một cron duy nhất từ 10/10: chọn việc theo `scheduledTime`, và phút 5 là mốc
  // bật việc cảnh báo (`GIAN_CANH_BAO_PHUT`, 19.12 câu 46). Giờ 3 UTC nằm ngoài hai
  // cửa sổ báo cáo.
  const kq = await chayCron({ scheduledTime: Date.UTC(2026, 9, 6, 3, 5) }, env);
  return kq.canh_bao;
}

async function dungCanh(
  tuy_chon: { ticket?: string; nguoi_giao?: string | null; trang_thai_phien?: 'running' | 'stopping' | 'error' | 'waiting_owner' | 'closed' } = {},
): Promise<{ luot: string; phien: string }> {
  const ticket = tuy_chon.ticket ?? TK;
  const luot = `lg-${ticket}`;
  const phien = `ph-${ticket}`;
  await dungLuotGiao(luot, ticket, AG.wk, {
    trang_thai: 'in_progress',
    nguoi_giao_agent_id: tuy_chon.nguoi_giao === undefined ? AG.mgr : tuy_chon.nguoi_giao,
  });
  await dungPhien(phien, luot, { trang_thai: tuy_chon.trang_thai_phien ?? 'running' });
  return { luot, phien };
}

function guiHoatDong(
  phien_id: string,
  token: string,
  than_gui: Record<string, unknown>,
): Promise<Response> {
  return goiApi(`/v1/phien/${phien_id}/hoat-dong`, token, { method: 'POST', than: than_gui });
}

function datKeHoach(phien_id: string, token: string, buoc: unknown): Promise<Response> {
  return goiApi(`/v1/phien/${phien_id}/ke-hoach`, token, { method: 'PUT', than: { buoc } });
}

function traLoi(
  luot_giao_id: string,
  token: string,
  than_gui: Record<string, unknown>,
): Promise<Response> {
  return goiApi(`/v1/luot-giao/${luot_giao_id}/tra-loi`, token, {
    method: 'POST',
    than: than_gui,
  });
}

function nhipTim(luot_giao_id: string, token: string): Promise<Response> {
  return goiApi(`/v1/luot-giao/${luot_giao_id}/heartbeat`, token, { method: 'POST', than: {} });
}

/* ================================================================== *
 * A. Dòng hoạt động — SPEC mục 6 d.190
 * ================================================================== */

describe('SPEC mục 6 d.190 — "agent gửi các mục loại thought, action, question, result, error"', () => {
  it('đúng 5 loại của mục 0.1, không hơn không kém', () => {
    expect(danhSachMa('loai_hoat_dong')).toEqual([
      'thought',
      'action',
      'question',
      'result',
      'error',
    ]);
    for (const loai of danhSachMa('loai_hoat_dong')) {
      expect(kiemLoaiHoatDong(loai)).toBe(loai);
    }
    expect(() => kiemLoaiHoatDong('answer')).toThrowError(/thought/);
    expect(() => kiemLoaiHoatDong(undefined)).toThrowError(/thought/);
  });

  it.each(danhSachMa('loai_hoat_dong'))('gửi được mục loại `%s` qua HTTP', async (loai) => {
    const { phien } = await dungCanh();
    const res = await guiHoatDong(phien, TOKEN.wk, { loai, noi_dung: `mục ${loai}` });
    expect(res.status).toBe(201);
    expect((await than<{ loai: string }>(res)).loai).toBe(loai);
  });

  it('`action` mang "tên, tham số, kết quả" — đúng ba thứ d.190 kể', async () => {
    const { phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, {
      loai: 'action',
      noi_dung: 'đọc file SPEC',
      ten_thao_tac: 'Read',
      tham_so: '{"path":"SPEC.md"}',
      ket_qua_thao_tac: '600 dòng',
    });

    const ds = await hoatDongCuaPhien(env.DB, WS, phien);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({
      loai: 'action',
      nhan_loai: nhan('loai_hoat_dong', 'action'),
      ten_thao_tac: 'Read',
      tham_so: '{"path":"SPEC.md"}',
      ket_qua_thao_tac: '600 dòng',
    });
  });

  it('mục vào dòng hoạt động theo `thu_tu`, không theo `gui_luc` (hai mục cùng ms)', async () => {
    const { phien } = await dungCanh();
    await dungHoatDong('hd-1', phien, { loai: 'thought', noi_dung: 'một', gui_luc: 1_000 });
    await dungHoatDong('hd-2', phien, { loai: 'action', noi_dung: 'hai', gui_luc: 1_000 });

    const ds = await hoatDongCuaPhien(env.DB, WS, phien);
    expect(ds.map((h) => h.noi_dung)).toEqual(['một', 'hai']);
    expect(ds.map((h) => h.thu_tu)).toEqual([1, 2]);
  });

  it('chỉ **agent của phiên** gửi được: agent khác → 403, chủ → 403', async () => {
    const { phien } = await dungCanh();
    expect((await guiHoatDong(phien, TOKEN.khac, { loai: 'thought', noi_dung: 'x' })).status).toBe(403);
    expect((await guiHoatDong(phien, TOKEN_CHU, { loai: 'thought', noi_dung: 'x' })).status).toBe(403);
    // ĐỐI CHỨNG: chính agent của phiên thì được.
    expect((await guiHoatDong(phien, TOKEN.wk, { loai: 'thought', noi_dung: 'x' })).status).toBe(201);
  });

  it('phiên đã đóng → SESSION_CLOSED (d.195 áp cho hoạt động, vì nó là lệnh ghi)', async () => {
    const { phien } = await dungCanh({ trang_thai_phien: 'closed' });
    const res = await guiHoatDong(phien, TOKEN.wk, { loai: 'thought', noi_dung: 'x' });
    expect(res.status).toBe(409);
    expect((await than<{ error: string }>(res)).error).toBe('SESSION_CLOSED');
    expect(await hoatDongCuaPhien(env.DB, WS, phien)).toHaveLength(0);
  });

  it('hoạt động là một **tín hiệu** của phiên (d.188) — cửa ghi nhích `tin_hieu_cuoi_luc`', async () => {
    const { phien } = await dungCanh();
    await datMocPhien(phien, { tin_hieu_cuoi_luc: 1_000 });
    await guiHoatDong(phien, TOKEN.wk, { loai: 'thought', noi_dung: 'còn sống' });
    expect((await phienTrongDb(phien))?.tin_hieu_cuoi_luc).toBeGreaterThan(1_000);
  });
});

describe('SPEC mục 6 d.190 — "mục có thể đánh dấu tạm thời … vẫn lưu trong lịch sử"', () => {
  it('mục tạm thời bị mục kế **thay chỗ trên màn hình**, nhưng vẫn còn trong lịch sử', async () => {
    const { phien } = await dungCanh();
    await dungHoatDong('hd-tam', phien, { loai: 'action', noi_dung: 'đang đọc file…', tam_thoi: true });
    await dungHoatDong('hd-sau', phien, { loai: 'action', noi_dung: 'đọc xong' });

    // Màn hình: mục tạm thời đã bị thay chỗ không hiện.
    const man_hinh = await hoatDongCuaPhien(env.DB, WS, phien);
    expect(man_hinh.map((h) => h.id)).toEqual(['hd-sau']);

    // Lịch sử: **vẫn lưu**, không mất mục nào.
    const lich_su = await hoatDongCuaPhien(env.DB, WS, phien, { gom_tam_thoi: true });
    expect(lich_su.map((h) => h.id)).toEqual(['hd-tam', 'hd-sau']);
    expect(lich_su[0]).toMatchObject({ tam_thoi: true, da_bi_thay_cho: true });
  });

  it('mục tạm thời **cuối cùng** vẫn hiện: chưa có mục nào thay chỗ nó', async () => {
    const { phien } = await dungCanh();
    await dungHoatDong('hd-tam', phien, { loai: 'action', noi_dung: 'đang chạy test…', tam_thoi: true });

    const man_hinh = await hoatDongCuaPhien(env.DB, WS, phien);
    expect(man_hinh.map((h) => h.id)).toEqual(['hd-tam']);
    expect(man_hinh[0]?.da_bi_thay_cho).toBe(false);
  });

  it('ĐỐI CHỨNG: mục **không** tạm thời thì mục kế không thay chỗ nó', async () => {
    const { phien } = await dungCanh();
    await dungHoatDong('hd-thuong', phien, { loai: 'thought', noi_dung: 'nghĩ', tam_thoi: false });
    await dungHoatDong('hd-sau', phien, { loai: 'action', noi_dung: 'làm' });

    expect((await hoatDongCuaPhien(env.DB, WS, phien)).map((h) => h.id)).toEqual([
      'hd-thuong',
      'hd-sau',
    ]);
  });

  it('`tam_thoi` đặt **lúc gửi**, qua HTTP', async () => {
    const { phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'thought', noi_dung: 'x', tam_thoi: true });
    const ds = await hoatDongCuaPhien(env.DB, WS, phien, { gom_tam_thoi: true });
    expect(ds[0]?.tam_thoi).toBe(true);
  });
});

describe('SPEC mục 6 d.190 — "mục đã gửi KHÔNG sửa được" (hai tầng)', () => {
  it('tầng DB: UPDATE một mục đã gửi bị trigger chặn', async () => {
    const { phien } = await dungCanh();
    await dungHoatDong('hd-1', phien, { loai: 'thought', noi_dung: 'nguyên văn' });

    await expect(
      env.DB.prepare('UPDATE phien_hoat_dong SET noi_dung = ? WHERE id = ?')
        .bind('đã bị sửa', 'hd-1')
        .run(),
    ).rejects.toThrowError(/khong sua duoc/);

    const ds = await hoatDongCuaPhien(env.DB, WS, phien, { gom_tam_thoi: true });
    expect(ds[0]?.noi_dung).toBe('nguyên văn');
  });

  it('tầng DB: DELETE cũng bị chặn ("vẫn lưu trong lịch sử" + mục 3 "không bao giờ xoá")', async () => {
    const { phien } = await dungCanh();
    await dungHoatDong('hd-1', phien);
    await expect(
      env.DB.prepare('DELETE FROM phien_hoat_dong WHERE id = ?').bind('hd-1').run(),
    ).rejects.toThrowError(/khong xoa duoc/);
  });

  it('tầng lệnh: whitelist không có trường nào trỏ tới một mục **đã có**', () => {
    // `phien_id` trỏ tới phiên, không tới mục. Không có `id` / `hoat_dong_id`.
    expect(TRUONG_CLIENT.gui_hoat_dong).not.toContain('id');
    expect(TRUONG_CLIENT.gui_hoat_dong).not.toContain('hoat_dong_id');
    expect(TRUONG_CLIENT.gui_hoat_dong).not.toContain('thu_tu');
  });

  it('tầng lệnh: client gửi `id` thì nó bị bỏ, mục cũ **không** bị đụng', async () => {
    const { phien } = await dungCanh();
    await dungHoatDong('hd-cu', phien, { loai: 'thought', noi_dung: 'nguyên văn' });

    const res = await guiHoatDong(phien, TOKEN.wk, {
      id: 'hd-cu',
      loai: 'thought',
      noi_dung: 'cố sửa mục cũ',
    });
    expect(res.status).toBe(201);
    const kq = await than<{ id: string; bo_qua?: string[] }>(res);
    expect(kq.id).not.toBe('hd-cu');

    const ds = await hoatDongCuaPhien(env.DB, WS, phien, { gom_tam_thoi: true });
    expect(ds).toHaveLength(2);
    expect(ds[0]).toMatchObject({ id: 'hd-cu', noi_dung: 'nguyên văn' });
  });
});

/* ================================================================== *
 * B. Kế hoạch của phiên — SPEC mục 6 d.191
 * ================================================================== */

describe('SPEC mục 6 d.191 — "mỗi bước có trạng thái chờ, đang làm, xong hoặc huỷ"', () => {
  it('đúng bốn trạng thái, đúng bốn nhãn của mục 6', () => {
    expect(TRANG_THAI_BUOC).toEqual({
      pending: 'Chờ',
      in_progress: 'Đang làm',
      done: 'Xong',
      canceled: 'Huỷ',
    });
  });

  it('bước không khai trạng thái thì mặc định **chờ**', () => {
    expect(kiemKeHoach([{ noi_dung: 'bước một' }])).toEqual([
      { noi_dung: 'bước một', trang_thai: 'pending' },
    ]);
    // Chuỗi trần cũng được coi là một bước "chờ".
    expect(kiemKeHoach(['bước hai'])).toEqual([{ noi_dung: 'bước hai', trang_thai: 'pending' }]);
  });

  it('trạng thái bước lạ → INVALID_INPUT', () => {
    expect(() => kiemKeHoach([{ noi_dung: 'x', trang_thai: 'doing' }])).toThrowError(/pending/);
  });

  it('bước rỗng, danh sách không phải mảng, quá dài → INVALID_INPUT', () => {
    expect(() => kiemKeHoach([{ noi_dung: '   ' }])).toThrowError(/1–/);
    expect(() => kiemKeHoach('bước một')).toThrowError(/danh sách bước/);
    expect(() =>
      kiemKeHoach(Array.from({ length: SO_BUOC_KE_HOACH_TOI_DA + 1 }, () => 'b')),
    ).toThrowError(/tối đa/);
  });
});

describe('SPEC mục 6 d.191 — "agent gửi lại TOÀN BỘ danh sách mỗi lần cập nhật"', () => {
  it('lần gửi sau **thay cả danh sách**: bước cũ không còn, không phải trộn vào', async () => {
    const { phien } = await dungCanh();

    await datKeHoach(phien, TOKEN.wk, [
      { noi_dung: 'đọc SPEC', trang_thai: 'in_progress' },
      { noi_dung: 'viết mã' },
      { noi_dung: 'viết test' },
    ]);
    expect((await keHoachCuaPhien(env.DB, WS, phien)).buoc.map((b) => b.noi_dung)).toEqual([
      'đọc SPEC',
      'viết mã',
      'viết test',
    ]);

    // Cập nhật: gửi lại toàn bộ, bỏ hẳn "viết test", đổi trạng thái hai bước.
    await datKeHoach(phien, TOKEN.wk, [
      { noi_dung: 'đọc SPEC', trang_thai: 'done' },
      { noi_dung: 'viết mã', trang_thai: 'in_progress' },
    ]);

    const kh = await keHoachCuaPhien(env.DB, WS, phien);
    expect(kh.phien_ban).toBe(2);
    expect(kh.buoc).toEqual([
      { thu_tu: 1, noi_dung: 'đọc SPEC', trang_thai: 'done', nhan_trang_thai: 'Xong' },
      { thu_tu: 2, noi_dung: 'viết mã', trang_thai: 'in_progress', nhan_trang_thai: 'Đang làm' },
    ]);
  });

  it('danh sách **rỗng** là một kế hoạch rỗng hợp lệ (agent bỏ kế hoạch)', async () => {
    const { phien } = await dungCanh();
    await datKeHoach(phien, TOKEN.wk, [{ noi_dung: 'bước một' }]);
    expect((await datKeHoach(phien, TOKEN.wk, [])).status).toBe(200);

    const kh = await keHoachCuaPhien(env.DB, WS, phien);
    expect(kh.buoc).toEqual([]);
    // Phiên bản cũ **vẫn còn trong DB** (chỉ thêm, không xoá): lịch sử kế hoạch.
    const dem = await env.DB.prepare(
      'SELECT count(*) AS n FROM phien_ke_hoach WHERE phien_id = ?',
    )
      .bind(phien)
      .first<{ n: number }>();
    expect(dem?.n).toBe(1);
  });

  it('chưa gửi kế hoạch nào → phiên bản 0, danh sách rỗng', async () => {
    const { phien } = await dungCanh();
    expect(await keHoachCuaPhien(env.DB, WS, phien)).toMatchObject({ phien_ban: 0, buoc: [] });
  });

  it('một phiên bản đã gửi **không sửa được** (trigger)', async () => {
    const { phien } = await dungCanh();
    await datKeHoach(phien, TOKEN.wk, [{ noi_dung: 'bước một' }]);
    await expect(
      env.DB.prepare('UPDATE phien_ke_hoach SET trang_thai = ? WHERE phien_id = ?')
        .bind('done', phien)
        .run(),
    ).rejects.toThrowError(/khong sua duoc/);
  });

  it('chỉ agent của phiên gửi được kế hoạch: agent khác → 403, chủ → 403', async () => {
    const { phien } = await dungCanh();
    expect((await datKeHoach(phien, TOKEN.khac, [{ noi_dung: 'x' }])).status).toBe(403);
    expect((await datKeHoach(phien, TOKEN_CHU, [{ noi_dung: 'x' }])).status).toBe(403);
    expect((await datKeHoach(phien, TOKEN.wk, [{ noi_dung: 'x' }])).status).toBe(200);
  });

  it('phiên đã đóng → SESSION_CLOSED, không ghi phiên bản nào', async () => {
    const { phien } = await dungCanh({ trang_thai_phien: 'closed' });
    const res = await datKeHoach(phien, TOKEN.wk, [{ noi_dung: 'x' }]);
    expect(res.status).toBe(409);
    expect((await than<{ error: string }>(res)).error).toBe('SESSION_CLOSED');
    expect((await keHoachCuaPhien(env.DB, WS, phien)).phien_ban).toBe(0);
  });

  it('đường đọc trả kế hoạch **hiện hành** qua HTTP (mục 14)', async () => {
    const { phien } = await dungCanh();
    await datKeHoach(phien, TOKEN.wk, [{ noi_dung: 'bước một', trang_thai: 'done' }]);
    const res = await goiApi(`/v1/phien/${phien}/ke-hoach`, TOKEN_CHU);
    expect(res.status).toBe(200);
    expect(await than<{ buoc: { nhan_trang_thai: string }[] }>(res)).toMatchObject({
      phien_ban: 1,
      buoc: [{ noi_dung: 'bước một', trang_thai: 'done', nhan_trang_thai: 'Xong' }],
    });
  });
});

/* ================================================================== *
 * C. `question` → `waiting_assigner`, và mốc 60 phút — SPEC 19.6
 * ================================================================== */

describe('SPEC 19.6 — "agent gửi hoạt động `question` thì phiên sang `waiting_assigner`"', () => {
  it('gửi `question` đưa phiên sang `waiting_assigner` và **đặt mốc** lúc hỏi', async () => {
    const { phien } = await dungCanh();
    const res = await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'dùng thư viện nào?' });
    expect((await than<{ trang_thai_phien: string }>(res)).trang_thai_phien).toBe('waiting_assigner');

    const dong = await phienTrongDb(phien);
    expect(dong?.trang_thai).toBe('waiting_assigner');
    expect(dong?.waiting_assigner_luc).not.toBeNull();
  });

  it('ĐỐI CHỨNG: mục `thought` **không** đổi trạng thái và không đặt mốc', async () => {
    const { phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'thought', noi_dung: 'đang nghĩ' });
    const dong = await phienTrongDb(phien);
    expect(dong?.trang_thai).toBe('running');
    expect(dong?.waiting_assigner_luc).toBeNull();
  });

  it('hàm thuần: `question` → `waiting_assigner`; `waiting_owner` và `stopping` giữ nguyên', () => {
    expect(phienSauHoatDong('running', 'question')).toMatchObject({
      trang_thai: 'waiting_assigner',
      doi: true,
      dat_waiting_assigner_luc: true,
    });
    // `waiting_owner` "không bao giờ bị tính đứng" và gắn một mục T (CHECK của 0006).
    expect(phienSauHoatDong('waiting_owner', 'question')).toMatchObject({
      trang_thai: 'waiting_owner',
      doi: false,
    });
    expect(phienSauHoatDong('stopping', 'question')).toMatchObject({
      trang_thai: 'stopping',
      doi: false,
    });
  });

  it('mục `error` đưa phiên sang `error` (d.185 "agent báo lỗi" = d.190 mục `error`)', async () => {
    const { phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'error', noi_dung: 'build hỏng' });
    expect((await phienTrongDb(phien))?.trang_thai).toBe('error');
  });
});

describe('SPEC 19.6 — "không bị tính đứng, nhưng quá 60 phút thì hiện ở Cần chú ý"', () => {
  const BAY_GIO = 2_000_000_000;

  /** Một phiên `waiting_assigner` với **hai mốc rời nhau** — đó là cả vấn đề. */
  const phien = (im_lang_ms: number, cho_ms: number): PhienLuu => ({
    trang_thai: 'waiting_assigner',
    tin_hieu_cuoi_luc: BAY_GIO - im_lang_ms,
    waiting_assigner_luc: BAY_GIO - cho_ms,
    stopping_luc: null,
  });

  it('`waiting_assigner` im 10 giờ KHÔNG đứng (đối chứng cùng mốc: `running` thì đứng)', () => {
    const im = 10 * 60 * PHUT;
    expect(trangThaiPhienDanXuat(phien(im, im), BAY_GIO, NGUONG_MAC_DINH_MS).trang_thai).toBe(
      'waiting_assigner',
    );
    expect(
      trangThaiPhienDanXuat(
        { trang_thai: 'running', tin_hieu_cuoi_luc: BAY_GIO - im, stopping_luc: null },
        BAY_GIO,
        NGUONG_MAC_DINH_MS,
      ).trang_thai,
    ).toBe('stalled');
  });

  it('MỐC CHẴN 60 phút → "Cần chú ý"; **1 ms trước mốc** thì chưa', () => {
    expect(HAN_CHO_NGUOI_GIAO_CAN_CHU_Y_MS).toBe(60 * PHUT);
    const moc = HAN_CHO_NGUOI_GIAO_CAN_CHU_Y_MS;
    expect(
      trangThaiPhienDanXuat(phien(moc, moc), BAY_GIO, NGUONG_MAC_DINH_MS).cho_nguoi_giao_qua_han,
    ).toBe(true);
    expect(
      trangThaiPhienDanXuat(phien(moc - 1, moc - 1), BAY_GIO, NGUONG_MAC_DINH_MS)
        .cho_nguoi_giao_qua_han,
    ).toBe(false);
  });

  /*
   * **Ca canh nợ #48** (reviewer lượt 3, advisory 1). Đây là ca duy nhất phân biệt
   * "đếm từ `tin_hieu_cuoi_luc`" với "đếm từ lúc hỏi": agent chờ trả lời **vẫn gửi
   * nhịp tim**, nên tín hiệu cuối luôn mới. Cài theo `tin_hieu_cuoi_luc` thì luật
   * 60 phút tự vô hiệu hoá đúng trong ca nó cần chạy.
   */
  it('NỢ #48 — agent hỏi 90 phút trước mà **vẫn gửi nhịp tim 1 phút trước**: VẪN "Cần chú ý"', () => {
    const dx = trangThaiPhienDanXuat(phien(1 * PHUT, 90 * PHUT), BAY_GIO, NGUONG_MAC_DINH_MS);
    expect(dx.trang_thai).toBe('waiting_assigner');
    expect(dx.im_lang_ms).toBe(1 * PHUT);
    expect(dx.cho_nguoi_giao_ms).toBe(90 * PHUT);
    expect(dx.cho_nguoi_giao_qua_han).toBe(true);
  });

  it('ĐỐI CHỨNG ngược: agent **im 90 phút** mà vừa hỏi 1 phút trước → CHƯA "Cần chú ý"', () => {
    const dx = trangThaiPhienDanXuat(phien(90 * PHUT, 1 * PHUT), BAY_GIO, NGUONG_MAC_DINH_MS);
    expect(dx.cho_nguoi_giao_qua_han).toBe(false);
  });

  it('cờ đó chỉ của `waiting_assigner`: `running` im 2 giờ không bật nó', () => {
    const dx = trangThaiPhienDanXuat(
      { trang_thai: 'running', tin_hieu_cuoi_luc: BAY_GIO - 120 * PHUT, stopping_luc: null },
      BAY_GIO,
      NGUONG_MAC_DINH_MS,
    );
    expect(dx.cho_nguoi_giao_qua_han).toBe(false);
    expect(dx.cho_nguoi_giao_ms).toBeNull();
  });

  it('dòng cũ chưa có mốc (trước 0007) rơi về `tin_hieu_cuoi_luc`, cờ vẫn chạy', () => {
    const dx = trangThaiPhienDanXuat(
      {
        trang_thai: 'waiting_assigner',
        tin_hieu_cuoi_luc: BAY_GIO - 61 * PHUT,
        waiting_assigner_luc: null,
        stopping_luc: null,
      },
      BAY_GIO,
      NGUONG_MAC_DINH_MS,
    );
    expect(dx.cho_nguoi_giao_qua_han).toBe(true);
  });

  it('qua HTTP: nhịp tim không xoá được cờ "Cần chú ý" (mốc nằm ở lúc hỏi)', async () => {
    const { luot, phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi đây' });
    // Đẩy mốc hỏi về 90 phút trước; nhịp tim ngay sau đó làm tín hiệu cuối mới.
    await datMocPhien(phien, { waiting_assigner_luc: Date.now() - 90 * PHUT });
    expect((await nhipTim(luot, TOKEN.wk)).status).toBe(200);

    const res = await goiApi(`/v1/phien/${phien}`, TOKEN_CHU);
    expect(await than<{ cho_nguoi_giao_qua_han: boolean }>(res)).toMatchObject({
      trang_thai: 'waiting_assigner',
      dung: false,
      cho_nguoi_giao_qua_han: true,
    });
  });
});

describe('SPEC 19.6 — "câu hỏi hiện trong `baton tasks` của người giao"', () => {
  it('người giao là agent: thấy câu hỏi của mình, agent khác không thấy', async () => {
    const { phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'chọn thư viện nào?' });

    const cua_mgr = await cauHoiChoTraLoi(env.DB, WS, { loai: 'agent', agent_id: AG.mgr }, Date.now());
    expect(cua_mgr).toHaveLength(1);
    expect(cua_mgr[0]).toMatchObject({ noi_dung: 'chọn thư viện nào?', agent_id: AG.wk, qua_han: false });

    // ĐỐI CHỨNG: agent không phải người giao không thấy gì.
    expect(await cauHoiChoTraLoi(env.DB, WS, { loai: 'agent', agent_id: AG.khac }, Date.now())).toEqual([]);
    expect(await cauHoiChoTraLoi(env.DB, WS, { loai: 'chu' }, Date.now())).toEqual([]);
  });

  it('người giao là chủ: câu hỏi vào danh sách của chủ', async () => {
    const { phien } = await dungCanh({ nguoi_giao: null });
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi chủ' });
    expect(await cauHoiChoTraLoi(env.DB, WS, { loai: 'chu' }, Date.now())).toHaveLength(1);
    expect(await cauHoiChoTraLoi(env.DB, WS, { loai: 'agent', agent_id: AG.mgr }, Date.now())).toEqual([]);
  });

  it('câu hỏi **đã trả lời** rời khỏi danh sách', async () => {
    const { luot, phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi' });
    await traLoi(luot, TOKEN.mgr, { noi_dung: 'dùng Hono' });
    expect(await cauHoiChoTraLoi(env.DB, WS, { loai: 'agent', agent_id: AG.mgr }, Date.now())).toEqual([]);
  });

  it('`qua_han` dùng đúng mốc 60 phút; mốc chẵn đỏ, 1 ms trước mốc chưa', async () => {
    const { phien } = await dungCanh();
    await dungHoatDong('hd-hoi', phien, { loai: 'question', noi_dung: 'hỏi', gui_luc: 1_000_000 });
    const moc = 1_000_000 + HAN_CHO_NGUOI_GIAO_CAN_CHU_Y_MS;

    const tai_moc = await cauHoiChoTraLoi(env.DB, WS, { loai: 'agent', agent_id: AG.mgr }, moc);
    expect(tai_moc[0]?.qua_han).toBe(true);
    const truoc_moc = await cauHoiChoTraLoi(env.DB, WS, { loai: 'agent', agent_id: AG.mgr }, moc - 1);
    expect(truoc_moc[0]?.qua_han).toBe(false);
  });

  it('đường HTTP `/v1/cau-hoi` trả câu hỏi của chính người gọi', async () => {
    const { phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi qua HTTP' });
    const res = await goiApi('/v1/cau-hoi', TOKEN.mgr);
    expect(res.status).toBe(200);
    expect(await than<{ noi_dung: string }[]>(res)).toMatchObject([{ noi_dung: 'hỏi qua HTTP' }]);
    expect(await than<unknown[]>(await goiApi('/v1/cau-hoi', TOKEN.khac))).toEqual([]);
  });
});

/* ================================================================== *
 * D. `baton reply` — SPEC 19.12 câu 2 + 19.6
 * ================================================================== */

describe('SPEC 19.12 câu 2 — `baton reply <lượt> "<nội dung>"`', () => {
  it('CHỈ người giao của lượt đó: agent khác → FORBIDDEN', async () => {
    const { luot, phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi' });

    const res = await traLoi(luot, TOKEN.khac, { noi_dung: 'tôi trả lời hộ' });
    expect(res.status).toBe(403);
    expect((await than<{ error: string }>(res)).error).toBe('FORBIDDEN');
    // Người nhận cũng không tự trả lời câu hỏi của mình được.
    expect((await traLoi(luot, TOKEN.wk, { noi_dung: 'tự trả lời' })).status).toBe(403);
    // ĐỐI CHỨNG: người giao thì được.
    expect((await traLoi(luot, TOKEN.mgr, { noi_dung: 'dùng Hono' })).status).toBe(201);
  });

  it('chủ trả lời được, **hành vi giống hệt** (lượt do chủ giao)', async () => {
    const { luot, phien } = await dungCanh({ nguoi_giao: null });
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi chủ' });

    const res = await traLoi(luot, TOKEN_CHU, { noi_dung: 'chủ trả lời' });
    expect(res.status).toBe(201);

    // Giống hệt: một hoạt động trên phiên + một bình luận trên ticket, phiên `running`.
    const kq = await than<{ id: string; comment_id: string; trang_thai_phien: string }>(res);
    expect(kq.trang_thai_phien).toBe('running');
    const ds = await hoatDongCuaPhien(env.DB, WS, phien, { gom_tam_thoi: true });
    expect(ds.at(-1)).toMatchObject({ noi_dung: 'chủ trả lời', tac_gia_loai: 'owner', la_tra_loi: true });
    const bl = await env.DB.prepare('SELECT noi_dung, tac_gia_loai FROM comment WHERE id = ?')
      .bind(kq.comment_id)
      .first<{ noi_dung: string; tac_gia_loai: string }>();
    expect(bl).toMatchObject({ noi_dung: 'chủ trả lời', tac_gia_loai: 'owner' });
  });

  it('chủ **không phải** người giao thì không trả lời hộ được', async () => {
    const { luot, phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi manager' });
    expect((await traLoi(luot, TOKEN_CHU, { noi_dung: 'chủ xen vào' })).status).toBe(403);
  });

  it('câu trả lời là **một hoạt động trên phiên của người hỏi** VÀ **một bình luận trên ticket**', async () => {
    const { luot, phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi' });

    const kq = await than<{ id: string; comment_id: string; tra_loi_cho_id: string }>(
      await traLoi(luot, TOKEN.mgr, { noi_dung: 'dùng Hono' }),
    );

    // (a) hoạt động trên phiên của người hỏi, trỏ về đúng mục `question`
    const ds = await hoatDongCuaPhien(env.DB, WS, phien, { gom_tam_thoi: true });
    const tl = ds.find((h) => h.id === kq.id);
    expect(tl).toMatchObject({
      noi_dung: 'dùng Hono',
      la_tra_loi: true,
      loai: null,
      nhan_loai: 'Trả lời',
      tac_gia_loai: 'agent',
      tac_gia_agent_id: AG.mgr,
    });
    expect(tl?.tra_loi_cho_id).toBe(kq.tra_loi_cho_id);

    // (b) bình luận trên ticket — **cả hai**, không chọn một
    const res_bl = await goiApi(`/v1/ticket/${TK}/binh-luan`, TOKEN_CHU);
    const trang = await than<{ items: { id: string; noi_dung: string }[] }>(res_bl);
    expect(trang.items.some((b) => b.id === kq.comment_id && b.noi_dung === 'dùng Hono')).toBe(true);
  });

  it('không có câu hỏi nào đang chờ → NOT_FOUND, và **không ghi gì**', async () => {
    const { luot, phien } = await dungCanh();
    const res = await traLoi(luot, TOKEN.mgr, { noi_dung: 'trả lời vào hư không' });
    expect(res.status).toBe(404);
    expect(await hoatDongCuaPhien(env.DB, WS, phien, { gom_tam_thoi: true })).toHaveLength(0);
  });

  it('trả lời hai lần cho cùng câu hỏi: lần thứ hai NOT_FOUND', async () => {
    const { luot, phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi' });
    expect((await traLoi(luot, TOKEN.mgr, { noi_dung: 'lần một' })).status).toBe(201);
    expect((await traLoi(luot, TOKEN.mgr, { noi_dung: 'lần hai' })).status).toBe(404);
  });

  it('`hoat_dong_id` chỉ đúng câu hỏi; mã lạ → NOT_FOUND', async () => {
    const { luot, phien } = await dungCanh();
    await dungHoatDong('hd-hoi-1', phien, { loai: 'question', noi_dung: 'câu một' });
    await dungHoatDong('hd-hoi-2', phien, { loai: 'question', noi_dung: 'câu hai' });

    expect((await traLoi(luot, TOKEN.mgr, { noi_dung: 'x', hoat_dong_id: 'khong-co' })).status).toBe(404);

    const kq = await than<{ tra_loi_cho_id: string }>(
      await traLoi(luot, TOKEN.mgr, { noi_dung: 'trả câu một', hoat_dong_id: 'hd-hoi-1' }),
    );
    expect(kq.tra_loi_cho_id).toBe('hd-hoi-1');

    // Để trống thì lấy câu hỏi **chưa trả lời mới nhất**.
    const kq2 = await than<{ tra_loi_cho_id: string }>(
      await traLoi(luot, TOKEN.mgr, { noi_dung: 'trả câu hai' }),
    );
    expect(kq2.tra_loi_cho_id).toBe('hd-hoi-2');
  });

  it('phiên đã đóng → SESSION_CLOSED, không ghi hoạt động cũng không ghi bình luận', async () => {
    const luot = 'lg-dong';
    const phien = 'ph-dong';
    await dungLuotGiao(luot, TK_2, AG.wk, { trang_thai: 'in_progress', nguoi_giao_agent_id: AG.mgr });
    await dungPhien(phien, luot, { trang_thai: 'running' });
    await dungHoatDong('hd-hoi', phien, { loai: 'question', noi_dung: 'hỏi' });
    await env.DB.prepare(
      "UPDATE phien SET trang_thai = 'closed', dong_luc = ? WHERE id = ?",
    )
      .bind(Date.now(), phien)
      .run();

    const res = await traLoi(luot, TOKEN.mgr, { noi_dung: 'muộn rồi' });
    expect(res.status).toBe(409);
    expect((await than<{ error: string }>(res)).error).toBe('SESSION_CLOSED');
    const dem = await env.DB.prepare('SELECT count(*) AS n FROM comment WHERE ticket_id = ?')
      .bind(TK_2)
      .first<{ n: number }>();
    expect(dem?.n).toBe(0);
  });
});

describe('SPEC 19.6 — "có câu trả lời thì phiên về `running`, và lần gọi kế tiếp của agent nhận được câu trả lời"', () => {
  it('hàm thuần: chỉ `waiting_assigner` về `running`', () => {
    expect(phienSauTraLoi('waiting_assigner')).toEqual({ trang_thai: 'running', doi: true });
    // ĐỐI CHỨNG: `error` và `stopping` nói về việc khác, câu trả lời không xoá chúng.
    expect(phienSauTraLoi('error')).toEqual({ trang_thai: 'error', doi: false });
    expect(phienSauTraLoi('stopping')).toEqual({ trang_thai: 'stopping', doi: false });
  });

  it('qua HTTP: phiên về `running` và **mốc 60 phút được xoá**', async () => {
    const { luot, phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi' });
    expect((await phienTrongDb(phien))?.waiting_assigner_luc).not.toBeNull();

    await traLoi(luot, TOKEN.mgr, { noi_dung: 'dùng Hono' });
    const dong = await phienTrongDb(phien);
    expect(dong?.trang_thai).toBe('running');
    expect(dong?.waiting_assigner_luc).toBeNull();
  });

  it('**lần gọi kế tiếp** của agent nhận câu trả lời, và chỉ **một lần**', async () => {
    const { luot, phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi' });
    await traLoi(luot, TOKEN.mgr, { noi_dung: 'dùng Hono' });

    const lan_1 = await than<{ tra_loi_moi: { noi_dung: string; tac_gia_agent_id: string }[] }>(
      await nhipTim(luot, TOKEN.wk),
    );
    expect(lan_1.tra_loi_moi).toMatchObject([{ noi_dung: 'dùng Hono', tac_gia_agent_id: AG.mgr }]);

    // Lần sau không trao lại: "lần gọi **kế tiếp**", một lần.
    const lan_2 = await than<{ tra_loi_moi: unknown[] }>(await nhipTim(luot, TOKEN.wk));
    expect(lan_2.tra_loi_moi).toEqual([]);
    expect((await phienTrongDb(phien))?.tra_loi_doc_luc).not.toBeNull();
  });

  it('ĐỐI CHỨNG: chưa có câu trả lời thì `tra_loi_moi` rỗng', async () => {
    const { luot } = await dungCanh();
    const kq = await than<{ tra_loi_moi: unknown[] }>(await nhipTim(luot, TOKEN.wk));
    expect(kq.tra_loi_moi).toEqual([]);
  });

  it('câu trả lời **không** nhích `tin_hieu_cuoi_luc` của phiên người hỏi (d.188: tín hiệu là của agent)', async () => {
    const { luot, phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi' });
    const truoc = (await phienTrongDb(phien))?.tin_hieu_cuoi_luc ?? 0;
    await datMocPhien(phien, { tin_hieu_cuoi_luc: truoc - 10 * PHUT });

    await traLoi(luot, TOKEN.mgr, { noi_dung: 'dùng Hono' });
    expect((await phienTrongDb(phien))?.tin_hieu_cuoi_luc).toBe(truoc - 10 * PHUT);
  });
});

/* ================================================================== *
 * E. `result`/`error` lúc đang `stopping` = xác nhận dừng — SPEC mục 6 d.193
 * ================================================================== */

describe('SPEC mục 6 d.193 — "agent phải ngưng việc và gửi một mục `result` hoặc `error`"', () => {
  it.each(['result', 'error'] as const)(
    'phiên `stopping` + mục `%s` → phiên `closed`, lý do "agent đã xác nhận dừng"',
    async (loai) => {
      const { phien } = await dungCanh({ trang_thai_phien: 'stopping' });
      const res = await guiHoatDong(phien, TOKEN.wk, { loai, noi_dung: 'đã ngưng' });
      expect(res.status).toBe(201);
      expect(await than<{ da_xac_nhan_dung: boolean }>(res)).toMatchObject({
        trang_thai_phien: 'closed',
        da_xac_nhan_dung: true,
      });

      const dong = await phienTrongDb(phien);
      expect(dong?.trang_thai).toBe('closed');
      expect(dong?.ly_do_dong).toBe(LY_DO_DONG_DA_XAC_NHAN_DUNG);
      // Mục vẫn được lưu: nó là bằng chứng agent đã xác nhận.
      expect(await hoatDongCuaPhien(env.DB, WS, phien, { gom_tam_thoi: true })).toHaveLength(1);
    },
  );

  it('ĐỐI CHỨNG: `stopping` + mục `thought` KHÔNG đóng phiên (không phải xác nhận)', async () => {
    const { phien } = await dungCanh({ trang_thai_phien: 'stopping' });
    await guiHoatDong(phien, TOKEN.wk, { loai: 'thought', noi_dung: 'nghĩ thêm chút' });
    expect((await phienTrongDb(phien))?.trang_thai).toBe('stopping');
  });

  it('ĐỐI CHỨNG: `running` + mục `result` KHÔNG đóng phiên (chỉ áp khi đang dừng)', async () => {
    const { phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'result', noi_dung: 'xong một phần' });
    expect((await phienTrongDb(phien))?.trang_thai).toBe('running');
  });

  it('hàm thuần: `stopping` xét **trước** `error` (mục `error` lúc dừng là xác nhận)', () => {
    expect(phienSauHoatDong('stopping', 'error')).toMatchObject({
      trang_thai: 'closed',
      ly_do_dong: LY_DO_DONG_DA_XAC_NHAN_DUNG,
    });
    expect(phienSauHoatDong('running', 'error')).toMatchObject({ trang_thai: 'error' });
  });
});

/* ================================================================== *
 * F. Cảnh báo d.196 + mốc chống bắn lặp
 * ================================================================== */

describe('SPEC mục 6 d.196 — "bắn 1 thông báo; hồi lại rồi đứng lần nữa thì bắn lại"', () => {
  const nen = (them: Partial<PhienLuu> = {}): PhienLuu => ({
    trang_thai: 'running',
    tin_hieu_cuoi_luc: 1_000,
    stopping_luc: null,
    ...them,
  });

  it('hàm thuần: `stalled` chưa bắn → cần bắn, mốc mới = tín hiệu cuối', () => {
    expect(canhBaoDung(nen(), 'stalled')).toEqual({
      can_ban: true,
      ly_do: 'stalled',
      moc_moi: 1_000,
    });
  });

  it('hàm thuần: ĐÚNG 1 TIN — đã bắn cho tín hiệu đó thì không bắn nữa', () => {
    expect(canhBaoDung(nen({ canh_bao_tin_hieu_luc: 1_000 }), 'stalled')).toMatchObject({
      can_ban: false,
    });
  });

  it('hàm thuần: HỒI LẠI RỒI ĐỨNG LẦN NỮA → bắn lại (mốc cũ khác tín hiệu mới)', () => {
    // Agent sống lại lúc 5_000 rồi im tiếp; mốc vẫn ở 1_000.
    expect(canhBaoDung(nen({ tin_hieu_cuoi_luc: 5_000, canh_bao_tin_hieu_luc: 1_000 }), 'stalled'))
      .toEqual({ can_ban: true, ly_do: 'stalled', moc_moi: 5_000 });
  });

  it('hàm thuần: `error` cũng bắn; `running`/`waiting_assigner`/`stopping` thì không', () => {
    expect(canhBaoDung(nen({ trang_thai: 'error' }), 'error')).toMatchObject({
      can_ban: true,
      ly_do: 'error',
    });
    for (const tt of ['running', 'waiting_owner', 'waiting_assigner', 'stopping', 'closed'] as const) {
      expect(canhBaoDung(nen(), tt)).toEqual({ can_ban: false, ly_do: null, moc_moi: null });
    }
  });

  it('CỜ BOOLEAN KHÔNG ĐỦ: cùng một cờ "đã bắn" cho hai ca khác nhau', () => {
    // Hai phiên dưới đây có **cùng** "đã bắn = true" nhưng phải cho hai kết luận
    // khác nhau — đó đúng là lý do mốc phải gắn với `tin_hieu_cuoi_luc` (#46).
    const van_dung = nen({ tin_hieu_cuoi_luc: 1_000, canh_bao_tin_hieu_luc: 1_000 });
    const dung_lan_nua = nen({ tin_hieu_cuoi_luc: 9_000, canh_bao_tin_hieu_luc: 1_000 });
    expect(canhBaoDung(van_dung, 'stalled').can_ban).toBe(false);
    expect(canhBaoDung(dung_lan_nua, 'stalled').can_ban).toBe(true);
  });

  it('đường đọc: phiên đứng vào danh sách cần cảnh báo; phiên `running` tươi thì không', async () => {
    const { phien } = await dungCanh();
    const bay_gio = Date.now();
    await datMocPhien(phien, { tin_hieu_cuoi_luc: bay_gio - NGUONG_MAC_DINH_MS });

    const can = await phienCanCanhBao(env.DB, WS, bay_gio);
    expect(can.map((c) => c.phien_id)).toEqual([phien]);
    expect(can[0]?.quyet_dinh.ly_do).toBe('stalled');

    // ĐỐI CHỨNG cùng dòng phiên, chỉ đổi mốc: 1 ms trước ngưỡng thì chưa đứng.
    await datMocPhien(phien, { tin_hieu_cuoi_luc: bay_gio - NGUONG_MAC_DINH_MS + 1 });
    expect(await phienCanCanhBao(env.DB, WS, bay_gio)).toEqual([]);
  });

  it('qua CRON: quét lần đầu bắn 1 tin, quét lại **không** bắn nữa', async () => {
    const { phien } = await dungCanh();
    await datMocPhien(phien, { tin_hieu_cuoi_luc: Date.now() - 2 * NGUONG_MAC_DINH_MS });

    const lan_1 = await quetCanhBao();
    expect(lan_1.so_tin).toBe(1);
    expect(lan_1.tin[0]?.ly_do).toBe('stalled');
    // Lượt quét này **không gửi gì ra ngoài**: tin vào kho, và một lượt quét riêng
    // của phần 7 (`cron-thong-bao.ts`) đưa nó ra kênh ngoài.
    expect(lan_1.kenh).toEqual(['cho_cron']);
    expect((await phienTrongDb(phien))?.canh_bao_tin_hieu_luc).not.toBeNull();

    expect((await quetCanhBao()).so_tin).toBe(0);
  });

  it('qua CRON: hồi lại (một lệnh ghi của agent) rồi đứng lần nữa → bắn LẠI', async () => {
    const { luot, phien } = await dungCanh();
    await datMocPhien(phien, { tin_hieu_cuoi_luc: Date.now() - 2 * NGUONG_MAC_DINH_MS });
    await quetCanhBao();

    // Agent sống lại: nhịp tim nhích `tin_hieu_cuoi_luc` (cửa ghi làm, d.188).
    expect((await nhipTim(luot, TOKEN.wk)).status).toBe(200);
    // Rồi im tiếp quá ngưỡng.
    await datMocPhien(phien, { tin_hieu_cuoi_luc: Date.now() - 2 * NGUONG_MAC_DINH_MS });

    expect((await quetCanhBao()).so_tin).toBe(1);
  });

  /* ---------------------------------------------------------------- *
   * d.196 cho `error`: mốc gắn **lần vào `error`**, không gắn tín hiệu
   * (lỗi reviewer lượt 4; migration 0008, `cau-hoi-spec.md` #50)
   * ---------------------------------------------------------------- */

  it('hàm thuần: `error` + tín hiệu mới mà **chưa ra khỏi `error`** → KHÔNG bắn nữa', () => {
    // Cùng một dòng phiên: vào `error` lúc 1_000, đã bắn cho 1_000, rồi nhịp tim
    // đẩy tín hiệu cuối lên 9_000. `error` là trạng thái ghi trong DB nên nhịp tim
    // **không** đưa phiên ra khỏi nó ⇒ vẫn là **một** lần chuyển sang.
    const loi_van_the = nen({
      trang_thai: 'error',
      tin_hieu_cuoi_luc: 9_000,
      error_luc: 1_000,
      canh_bao_tin_hieu_luc: 1_000,
    });
    expect(canhBaoDung(loi_van_the, 'error')).toMatchObject({ can_ban: false, moc_moi: null });

    // ĐỐI CHỨNG — **đúng cùng dòng dữ liệu**, chỉ đổi lý do: `stalled` thì tín hiệu
    // mới *có* nghĩa là đã hồi lại, nên lần đứng sau phải bắn lại.
    expect(canhBaoDung(loi_van_the, 'stalled')).toEqual({
      can_ban: true,
      ly_do: 'stalled',
      moc_moi: 9_000,
    });
  });

  it('hàm thuần: vào `error` LẦN NỮA (mốc `error_luc` mới) → bắn lại', () => {
    expect(
      canhBaoDung(
        nen({
          trang_thai: 'error',
          tin_hieu_cuoi_luc: 9_000,
          error_luc: 9_000,
          canh_bao_tin_hieu_luc: 1_000,
        }),
        'error',
      ),
    ).toEqual({ can_ban: true, ly_do: 'error', moc_moi: 9_000 });
  });

  it('hàm thuần: dòng cũ trước 0008 (không có `error_luc`) vẫn có mốc để so', () => {
    expect(
      canhBaoDung(nen({ trang_thai: 'error', canh_bao_tin_hieu_luc: 1_000 }), 'error'),
    ).toMatchObject({ can_ban: false });
  });

  it('qua CRON: `error` + nhịp tim và mục `thought` → quét lần hai KHÔNG bắn tin thứ hai', async () => {
    const { luot, phien } = await dungCanh();
    expect((await guiHoatDong(phien, TOKEN.wk, { loai: 'error', noi_dung: 'hỏng' })).status).toBe(
      201,
    );
    const vao_loi = await phienTrongDb(phien);
    expect(vao_loi?.trang_thai).toBe('error');
    expect(vao_loi?.error_luc).not.toBeNull();

    // Đẩy cả hai mốc về quá khứ để mốc mới (nếu bị bắn sai) chắc chắn **khác** giá
    // trị cũ — không phụ thuộc vào việc hai lệnh có cùng milisecond hay không.
    const T0 = Date.now() - 10 * PHUT;
    await datMocPhien(phien, { tin_hieu_cuoi_luc: T0, error_luc: T0 });

    const lan_1 = await quetCanhBao();
    expect(lan_1.so_tin).toBe(1);
    expect(lan_1.tin[0]?.ly_do).toBe('error');
    expect((await phienTrongDb(phien))?.canh_bao_tin_hieu_luc).toBe(T0);

    // Agent lỗi mà **vẫn đập nhịp tim** và vẫn nói thêm: hai tín hiệu mới.
    expect((await nhipTim(luot, TOKEN.wk)).status).toBe(200);
    expect(
      (await guiHoatDong(phien, TOKEN.wk, { loai: 'thought', noi_dung: 'thử lại xem' })).status,
    ).toBe(201);

    const giua = await phienTrongDb(phien);
    expect(giua?.trang_thai).toBe('error'); // tín hiệu mới KHÔNG đưa ra khỏi `error`
    expect(giua?.tin_hieu_cuoi_luc).toBeGreaterThan(T0); // tín hiệu đã nhích thật
    expect(giua?.error_luc).toBe(T0); // lần vào `error` thì không

    expect((await quetCanhBao()).so_tin).toBe(0);
    // Mốc trong DB **không** bị đẩy theo tín hiệu.
    expect((await phienTrongDb(phien))?.canh_bao_tin_hieu_luc).toBe(T0);
  });

  it('qua CRON: ra khỏi `error` (mục `question` → `waiting_assigner`) rồi vào lại → bắn LẠI', async () => {
    const { phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'error', noi_dung: 'hỏng' });
    const T0 = Date.now() - 10 * PHUT;
    await datMocPhien(phien, { tin_hieu_cuoi_luc: T0, error_luc: T0 });

    expect((await quetCanhBao()).so_tin).toBe(1);

    /*
     * **Đường ra khỏi `error`** dùng ở đây: agent gửi mục `question` → phiên sang
     * `waiting_assigner` (19.6; `phienSauHoatDong` chỉ trừ `waiting_owner` và
     * `stopping`). SPEC không nói đường nào khác đưa phiên ra khỏi `error` —
     * `cau-hoi-spec.md` #50.
     */
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'chạy lại được không?' });
    expect((await phienTrongDb(phien))?.trang_thai).toBe('waiting_assigner');

    // Rồi lỗi **lần nữa**: một lần chuyển sang mới ⇒ `error_luc` mới.
    await guiHoatDong(phien, TOKEN.wk, { loai: 'error', noi_dung: 'hỏng tiếp' });
    const lan_hai = await phienTrongDb(phien);
    expect(lan_hai?.trang_thai).toBe('error');
    expect(lan_hai?.error_luc).toBeGreaterThan(T0);

    const lan_2 = await quetCanhBao();
    expect(lan_2.so_tin).toBe(1);
    expect(lan_2.tin[0]?.ly_do).toBe('error');
    expect((await phienTrongDb(phien))?.canh_bao_tin_hieu_luc).toBe(lan_hai?.error_luc);
  });

  it('mục `error` thứ hai lúc ĐANG `error` không phải lần chuyển sang mới (mốc giữ nguyên)', async () => {
    const { phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'error', noi_dung: 'hỏng' });
    const T0 = Date.now() - 10 * PHUT;
    await datMocPhien(phien, { error_luc: T0 });

    await guiHoatDong(phien, TOKEN.wk, { loai: 'error', noi_dung: 'vẫn hỏng' });
    expect((await phienTrongDb(phien))?.error_luc).toBe(T0);
  });

  /*
   * Ca "chỉ chủ quét được: agent → 403" của lượt 4 **đã bỏ cùng route**. Thay nó là
   * một ca mạnh hơn ở `cron-canh-bao-phien.test.ts`: **không có route nào** cho việc
   * quét cảnh báo, với chủ cũng vậy — 19.12 câu 46.
   */

  it('nội dung tin dùng **nhãn tiếng Việt** của mục 0.1 (mục 12 là thông báo)', () => {
    const tin = tinCanhBaoPhien({
      phien_id: 'ph-1',
      ticket_id: 'tk-1',
      agent_id: 'ag-1',
      ly_do: 'stalled',
      luc: 1_000,
    });
    expect(tin.nhan_ly_do).toBe(nhan('trang_thai_phien', 'stalled'));
    expect(tin.noi_dung).toContain('phiên đứng');
  });

  it('BAT-7: có tên + mã thì tin hiện tên và mã; thiếu thì rơi về id', () => {
    const goc = { phien_id: 'ph-1', ticket_id: 'tk-1', agent_id: 'ag-1', luc: 1_000 };
    expect(
      tinCanhBaoPhien({ ...goc, ly_do: 'stalled', agent_ten: 'M-Baton', ticket_ma: 'BAT-5' })
        .noi_dung,
    ).toBe('M-Baton · BAT-5: phiên đứng');
    expect(
      tinCanhBaoPhien({ ...goc, ly_do: 'error', agent_ten: 'M-Baton', ticket_ma: 'BAT-5' })
        .noi_dung,
    ).toBe('M-Baton · BAT-5: phiên lỗi');
    expect(tinCanhBaoPhien({ ...goc, ly_do: 'stalled' }).noi_dung).toBe('ag-1 · tk-1: phiên đứng');
  });
});

/* ================================================================== *
 * G. Hai nợ nhỏ của lượt 3 (reviewer)
 * ================================================================== */

describe('nợ lượt 3 — `huy_luot` thu dọn phiên `stopping` quá 10 phút trong DB', () => {
  it('huỷ lượt khi phiên `stopping` đã quá 10 phút: DB được ghi `closed`', async () => {
    const luot = 'lg-huy';
    const phien = 'ph-huy';
    await dungLuotGiao(luot, TK, AG.wk, { trang_thai: 'in_progress', nguoi_giao_agent_id: AG.mgr });
    // Mốc bấm Dừng 20 phút trước → dẫn xuất đã là `closed` (d.194, 10 phút).
    await dungPhien(phien, luot, {
      trang_thai: 'stopping',
      stopping_luc: Date.now() - 20 * PHUT,
    });

    const res = await goiApi(`/v1/luot-giao/${luot}/huy`, TOKEN.mgr, {
      method: 'POST',
      than: { ly_do: 'không cần nữa' },
    });
    expect(res.status).toBe(200);
    expect((await than<{ phien_dang_dung: boolean }>(res)).phien_dang_dung).toBe(false);

    // **Cái nợ**: trước đây dòng này nằm lại ở `stopping` mãi.
    const dong = await phienTrongDb(phien);
    expect(dong?.trang_thai).toBe('closed');
    expect(dong?.dong_luc).not.toBeNull();
  });

  it('ĐỐI CHỨNG: phiên `stopping` **chưa** quá 10 phút thì huỷ lượt giữ mốc cũ', async () => {
    const luot = 'lg-huy-2';
    const phien = 'ph-huy-2';
    const stopping_luc = Date.now() - 1 * PHUT;
    await dungLuotGiao(luot, TK_2, AG.wk, { trang_thai: 'in_progress', nguoi_giao_agent_id: AG.mgr });
    await dungPhien(phien, luot, { trang_thai: 'stopping', stopping_luc });

    const res = await goiApi(`/v1/luot-giao/${luot}/huy`, TOKEN.mgr, { method: 'POST', than: {} });
    expect((await than<{ phien_dang_dung: boolean }>(res)).phien_dang_dung).toBe(true);

    const dong = await phienTrongDb(phien);
    expect(dong?.trang_thai).toBe('stopping');
    // Mốc 10 phút **không** bị đẩy về đầu (`cauLenhDungPhien`).
    expect(dong?.stopping_luc).toBe(stopping_luc);
  });
});

describe('nợ lượt 3 — whitelist `dung_phien`', () => {
  it('`phien_id` nằm trong whitelist vì `locTruongClient` lọc CẢ trường của route', async () => {
    expect(TRUONG_CLIENT.dung_phien).toEqual(['phien_id']);

    // Ca canh: route vẫn chạy được. Bỏ `phien_id` khỏi whitelist là lệnh mất khoá.
    const { phien } = await dungCanh();
    const res = await goiApi(`/v1/phien/${phien}/dung`, TOKEN_CHU, { method: 'POST', than: {} });
    expect(res.status).toBe(200);
    expect((await than<{ trang_thai: string }>(res)).trang_thai).toBe('stopping');
  });

  it('client gửi `phien_id` khác cũng không đổi được phiên bị dừng (route ghi đè)', async () => {
    const { phien } = await dungCanh();
    const { phien: phien_2 } = await dungCanh({ ticket: TK_2 });

    await goiApi(`/v1/phien/${phien}/dung`, TOKEN_CHU, {
      method: 'POST',
      than: { phien_id: phien_2 },
    });
    expect((await phienTrongDb(phien))?.trang_thai).toBe('stopping');
    expect((await phienTrongDb(phien_2))?.trang_thai).toBe('running');
  });
});

/* ================================================================== *
 * H. Đường đọc phiên mang thêm hai trường của 0007
 * ================================================================== */

describe('đường đọc phiên — hai trường mới của 19.6', () => {
  it('`raPhien` trả `waiting_assigner_luc` và `cho_nguoi_giao_ms`', async () => {
    const { phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi' });

    const dong = await phienTheoId(env.DB, WS, phien);
    expect(dong).not.toBeNull();
    const luc = dong!.waiting_assigner_luc!;
    const ra = raPhien(dong!, luc + 30 * PHUT);
    expect(ra.waiting_assigner_luc).toBe(luc);
    expect(ra.cho_nguoi_giao_ms).toBe(30 * PHUT);
    expect(ra.cho_nguoi_giao_qua_han).toBe(false);
    expect(raPhien(dong!, luc + 60 * PHUT).cho_nguoi_giao_qua_han).toBe(true);
  });

  it('dòng hoạt động qua HTTP: `?gom_tam_thoi=co` lấy đủ lịch sử', async () => {
    const { phien } = await dungCanh();
    await dungHoatDong('hd-tam', phien, { loai: 'action', noi_dung: 'tạm', tam_thoi: true });
    await dungHoatDong('hd-sau', phien, { loai: 'action', noi_dung: 'sau' });

    const man_hinh = await than<{ id: string }[]>(
      await goiApi(`/v1/phien/${phien}/hoat-dong`, TOKEN_CHU),
    );
    expect(man_hinh.map((h) => h.id)).toEqual(['hd-sau']);

    const lich_su = await than<{ id: string }[]>(
      await goiApi(`/v1/phien/${phien}/hoat-dong?gom_tam_thoi=co`, TOKEN_CHU),
    );
    expect(lich_su.map((h) => h.id)).toEqual(['hd-tam', 'hd-sau']);
  });

  it('phiên ngoài phạm vi → 404, không lộ sự tồn tại (mục 13)', async () => {
    const { phien } = await dungCanh();
    await env.DB.prepare('DELETE FROM agent_project WHERE agent_id = ?').bind(AG.khac).run();
    expect((await goiApi(`/v1/phien/${phien}/hoat-dong`, TOKEN.khac)).status).toBe(404);
    expect((await goiApi(`/v1/phien/${phien}/ke-hoach`, TOKEN.khac)).status).toBe(404);
  });
});

/* ================================================================== *
 * I. Mọi câu SQL trên bảng mới ràng cả `workspace_id`
 * ================================================================== */

describe('luật của dự án — mọi câu SQL trên bảng mới ràng cả `workspace_id`', () => {
  it('hoạt động và kế hoạch của workspace khác không rò sang', async () => {
    const { phien } = await dungCanh();
    await dungHoatDong('hd-1', phien, { loai: 'thought' });
    await datKeHoach(phien, TOKEN.wk, [{ noi_dung: 'bước một' }]);

    // Hỏi đúng phiên đó nhưng với một workspace khác → không thấy gì.
    expect(await hoatDongCuaPhien(env.DB, 'ws-khac', phien, { gom_tam_thoi: true })).toEqual([]);
    expect((await keHoachCuaPhien(env.DB, 'ws-khac', phien)).buoc).toEqual([]);
    expect(await cauHoiChoTraLoi(env.DB, 'ws-khac', { loai: 'chu' }, Date.now())).toEqual([]);
    expect(await phienCanCanhBao(env.DB, 'ws-khac', Date.now())).toEqual([]);
  });

  it('hoạt động không chèn được với `workspace_id`/`ticket_id` lệch với phiên (trigger)', async () => {
    const { phien } = await dungCanh();
    await expect(
      env.DB.prepare(
        `INSERT INTO phien_hoat_dong
           (id, workspace_id, phien_id, ticket_id, loai, tac_gia_loai, tac_gia_agent_id,
            noi_dung, tam_thoi, thu_tu, gui_luc)
         VALUES (?, ?, ?, ?, 'thought', 'agent', ?, 'x', 0, 99, ?)`,
      )
        .bind('hd-lech', WS, phien, TK_2, AG.wk, Date.now())
        .run(),
    ).rejects.toThrowError(/khop workspace va ticket/);
  });

  it('CHECK của 0007: "câu trả lời" phải có `tra_loi_cho_id`, mục của agent phải có `loai`', async () => {
    const { phien } = await dungCanh();
    const chen = (loai: string | null, tra_loi_cho_id: string | null): Promise<unknown> =>
      env.DB.prepare(
        `INSERT INTO phien_hoat_dong
           (id, workspace_id, phien_id, ticket_id, loai, tac_gia_loai, tac_gia_agent_id,
            noi_dung, tam_thoi, tra_loi_cho_id, thu_tu, gui_luc)
         VALUES (?, ?, ?, ?, ?, 'agent', ?, 'x', 0, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          WS,
          phien,
          TK,
          loai,
          AG.wk,
          tra_loi_cho_id,
          Math.floor(Math.random() * 1_000_000) + 100,
          Date.now(),
        )
        .run();

    // `loai` rỗng mà không trả lời gì → CHECK chặn.
    await expect(chen(null, null)).rejects.toThrowError();
    // Có `loai` **và** trỏ tới một câu hỏi → cũng chặn (hai nguồn sự thật).
    await dungHoatDong('hd-hoi', phien, { loai: 'question' });
    await expect(chen('result', 'hd-hoi')).rejects.toThrowError();
    // ĐỐI CHỨNG: đúng một trong hai thì chèn được.
    await expect(chen('thought', null)).resolves.toBeDefined();
  });
});

/* ================================================================== *
 * J. Bảng mã của loại hoạt động không bị thêm mã nào
 * ================================================================== */

describe('SPEC mục 0.1 — không thêm mã nào vào "loại hoạt động"', () => {
  it('câu trả lời của người giao có `loai` rỗng, nhãn "Trả lời" — không phải mã thứ 6', async () => {
    const { luot, phien } = await dungCanh();
    await guiHoatDong(phien, TOKEN.wk, { loai: 'question', noi_dung: 'hỏi' });
    await traLoi(luot, TOKEN.mgr, { noi_dung: 'đáp' });

    const ds = await hoatDongCuaPhien(env.DB, WS, phien, { gom_tam_thoi: true });
    expect(ds.at(-1)?.loai).toBeNull();
    expect(ds.at(-1)?.nhan_loai).toBe('Trả lời');
    expect(danhSachMa('loai_hoat_dong')).not.toContain('answer');
  });

  it('`loai` lạ qua HTTP → INVALID_INPUT', async () => {
    const { phien } = await dungCanh();
    const res = await guiHoatDong(phien, TOKEN.wk, { loai: 'answer', noi_dung: 'x' });
    expect(res.status).toBe(422);
    expect((await than<{ error: string }>(res)).error).toBe('INVALID_INPUT');
  });

  it('mọi mã loại hoạt động và trạng thái bước đều có nhãn tiếng Việt', () => {
    for (const ma of danhSachMa('loai_hoat_dong')) {
      expect(nhan('loai_hoat_dong', ma as LoaiHoatDong).length).toBeGreaterThan(0);
    }
    for (const ma of danhSachMa('trang_thai_buoc')) {
      expect(nhan('trang_thai_buoc', ma).length).toBeGreaterThan(0);
    }
  });
});

/* ================================================================== *
 * K. Trạng thái phiên sau hoạt động — bảng đầy đủ
 * ================================================================== */

describe('`phienSauHoatDong` — bảng đầy đủ 7 trạng thái × 5 loại (không bỏ ô nào)', () => {
  const MOI_TT: TrangThaiPhien[] = [
    'running',
    'waiting_owner',
    'waiting_assigner',
    'stalled',
    'error',
    'stopping',
    'closed',
  ];

  it('không ô nào trả ra một mã ngoài bảng 0.1', () => {
    for (const tt of MOI_TT) {
      for (const loai of danhSachMa('loai_hoat_dong')) {
        const ra = phienSauHoatDong(tt, loai);
        expect(MOI_TT).toContain(ra.trang_thai);
        // `doi` luôn khớp với việc trạng thái có đổi thật hay không.
        expect(ra.doi).toBe(ra.trang_thai !== tt);
        // Mốc `waiting_assigner_luc` chỉ đặt khi vào đúng trạng thái đó.
        if (ra.dat_waiting_assigner_luc) expect(ra.trang_thai).toBe('waiting_assigner');
        // Lý do đóng chỉ có khi đóng.
        if (ra.ly_do_dong !== null) expect(ra.trang_thai).toBe('closed');
      }
    }
  });

  it('`waiting_owner` không bị hoạt động nào kéo đi (19.6: "không bao giờ bị tính đứng")', () => {
    for (const loai of danhSachMa('loai_hoat_dong')) {
      expect(phienSauHoatDong('waiting_owner', loai as LoaiHoatDong).trang_thai).toBe('waiting_owner');
    }
  });
});

/* ================================================================== *
 * L. Đánh thức — `cau_hoi:<phiên>` chỉ cho mục `question`
 * ================================================================== */

describe('đánh thức: `cau_hoi:<phiên>` chỉ khi mục là `question` (19.6)', () => {
  const AI_WK = {
    loai: 'agent',
    agent_id: AG.wk,
    vai_tro: 'worker',
    disabled: false,
    vao_tat_ca_du_an: true,
    du_an_duoc_vao: [],
    du_an_minh_quan_ly: [],
    ghi_de: {},
  } as const satisfies AiGoiAgent;

  /**
   * Gọi thẳng handler: `danh_thuc` là **kết quả của handler**, cửa ghi tiêu thụ
   * nó rồi không trả ra HTTP, nên không đường HTTP nào quan sát được nó.
   * Handler chỉ **dựng** câu lệnh (không chạy batch), nên lần gọi này không ghi gì.
   */
  const danhThucCua = async (phien_id: string, loai: LoaiHoatDong): Promise<string[]> =>
    (
      await handlerGuiHoatDong(
        {
          loai: 'gui_hoat_dong',
          workspace_id: WS,
          ai: AI_WK,
          phien_id,
          loai_hoat_dong: loai,
          noi_dung: 'x',
        },
        {
          env,
          db: env.DB,
          bay_gio: Date.now(),
          danhThuc: () => undefined,
          cong: congBangChungCua(env, env.DB),
        },
      )
    ).danh_thuc ?? [];

  it('mục `question` CÓ `cau_hoi:<phiên>`; mục `thought` thì KHÔNG (đánh thức vô ích)', async () => {
    const { phien } = await dungCanh();
    expect(await danhThucCua(phien, 'question')).toContain(`cau_hoi:${phien}`);
    // ĐỐI CHỨNG cùng phiên, chỉ đổi loại mục.
    expect(await danhThucCua(phien, 'thought')).not.toContain(`cau_hoi:${phien}`);
  });

  it('mọi mục vẫn đánh thức phiên và ticket của nó', async () => {
    const { phien } = await dungCanh();
    for (const loai of danhSachMa('loai_hoat_dong')) {
      const ds = await danhThucCua(phien, loai);
      expect(ds).toContain(`phien:${phien}`);
      expect(ds).toContain(`ticket:${TK}`);
    }
  });
});
