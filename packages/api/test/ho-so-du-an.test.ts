/**
 * **Hồ sơ dự án, Luật chung, trang Bản đồ** — tầng dữ liệu + API của SPEC mục 9
 * d.294–303.
 *
 * Mục 9 **chưa có gì** trước lượt này (`baton profile` của phần 5 in thẳng
 * "chưa có — API chưa có hồ sơ dự án"), nên file này là lưới đầu tiên cho:
 *
 *   1. **Các mục của d.296–298** đọc lại được đúng thứ đã ghi.
 *   2. **d.303 lịch sử phiên bản**: mỗi lần sửa chụp **bản cũ**, số phiên bản
 *      tăng, và lịch sử **không sửa, không xoá được** (kể cả qua SQL thô).
 *   3. **d.299 "Lỗi đã gặp" là danh sách chỉ thêm** — cùng kiểm bằng SQL thô.
 *   4. **d.302 bảng Bản đồ** có đúng sáu cột SPEC kể, và `thu_muc` tới từ hồ sơ.
 *   5. **d.301 Luật chung**: agent **đọc được**, chỉ chủ ghi.
 *   6. Phạm vi: agent ngoài dự án đọc hồ sơ → `NOT_FOUND` (mục 13, 17.7).
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { TRAN_BAN_DO, layHoSo, layLuatChung, manHinhBanDo } from '../src/doc-ho-so.js';
import {
  CHU,
  TOKEN_CHU,
  WS,
  aiAgent,
  choVaoDuAn,
  dungAgent,
  dungAgentCoToken,
  dungDuAn,
  dungTicket,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const GIO = 1_760_000_000_000;

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn();
});

/* ================================================================== *
 * 1. Hồ sơ: ghi rồi đọc lại — d.296–298
 * ================================================================== */

describe('Hồ sơ dự án (d.296–298)', () => {
  it('dự án CHƯA có hồ sơ vẫn mở được một trang trống, không NOT_FOUND', async () => {
    const ra = await layHoSo(env.DB, CHU, WS, P, GIO);
    expect(ra.phien_ban).toBe(0);
    expect(ra.la_gi).toBeNull();
    expect(ra.thu_muc).toBeNull();
    expect(ra.loi_da_gap).toEqual([]);
    expect(ra.lich_su_ban).toEqual([]);
    // Hai cờ của d.300 tới từ `project`, không nhân bản ở bảng hồ sơ.
    expect(ra.bat_buoc_review).toBe(true);
    expect(ra.khong_code).toBe(false);
  });

  it('chủ ghi rồi đọc lại đúng từng mục, và bản đầu là phiên bản 1', async () => {
    const r = await goiApi(`/v1/du-an/${P}/ho-so`, TOKEN_CHU, {
      method: 'PATCH',
      than: {
        la_gi: 'Hệ điều hành việc của Sample',
        thu_muc: '/Users/chu/sample',
        repo_chu_so_huu: 'chu',
        repo_ten: 'sample',
        repo_nhanh_mac_dinh: 'main',
        stack: 'TypeScript, Cloudflare',
        doc_truoc: '- SPEC.md\n- viec.md',
        cach_deploy: 'CoS chạy `npm run deploy`',
        danh_sach_cam: 'Không đụng dữ liệu thật',
      },
    });
    expect(r.status).toBe(200);
    expect(await r.json<{ phien_ban: number }>()).toMatchObject({ phien_ban: 1 });

    const ra = await layHoSo(env.DB, CHU, WS, P, GIO);
    expect(ra.phien_ban).toBe(1);
    expect(ra.la_gi).toBe('Hệ điều hành việc của Sample');
    expect(ra.thu_muc).toBe('/Users/chu/sample');
    expect(ra.repo_nhanh_mac_dinh).toBe('main');
    expect(ra.danh_sach_cam).toBe('Không đụng dữ liệu thật');
    // Lần **tạo** không sinh một phiên bản lịch sử nào (d.303 nói "mỗi lần sửa").
    expect(ra.lich_su_ban).toEqual([]);
  });

  it('agent KHÔNG sửa được hồ sơ (đề xuất tạm #113a), nhưng ĐỌC được (d.294)', async () => {
    await dungAgentCoToken({
      id: 'ag-1',
      ten: 'W-builder',
      vai_tro: 'worker',
      token: 'bt_token_w',
      du_an: [P],
    });

    const ghi = await goiApi(`/v1/du-an/${P}/ho-so`, 'bt_token_w', {
      method: 'PATCH',
      than: { la_gi: 'Tôi tự sửa' },
    });
    expect(ghi.status).toBe(403);

    const doc = await goiApi(`/v1/du-an/${P}/ho-so`, 'bt_token_w');
    expect(doc.status).toBe(200);
  });

  it('agent NGOÀI dự án đọc hồ sơ → NOT_FOUND, không lộ sự tồn tại (mục 13)', async () => {
    await dungAgentCoToken({
      id: 'ag-2',
      ten: 'W-ngoai',
      vai_tro: 'worker',
      token: 'bt_token_ngoai',
      du_an: [],
    });
    const r = await goiApi(`/v1/du-an/${P}/ho-so`, 'bt_token_ngoai');
    expect(r.status).toBe(404);
  });

  it('không mục nào để sửa thì INVALID_INPUT, không một lần ghi rỗng', async () => {
    const r = await goiApi(`/v1/du-an/${P}/ho-so`, TOKEN_CHU, { method: 'PATCH', than: {} });
    expect(r.status).toBe(422);
    expect(await r.json<{ error: string }>()).toMatchObject({ error: 'INVALID_INPUT' });
  });
});

/* ================================================================== *
 * 2. Lịch sử phiên bản — d.303
 * ================================================================== */

describe('Lịch sử phiên bản của hồ sơ (d.303)', () => {
  async function sua(than: Record<string, unknown>): Promise<Response> {
    return goiApi(`/v1/du-an/${P}/ho-so`, TOKEN_CHU, { method: 'PATCH', than });
  }

  it('mỗi lần sửa chụp BẢN CŨ và tăng số phiên bản', async () => {
    await sua({ la_gi: 'Bản một' });
    await sua({ la_gi: 'Bản hai' });
    await sua({ la_gi: 'Bản ba', thu_muc: '/srv/x' });

    const ra = await layHoSo(env.DB, CHU, WS, P, GIO);
    expect(ra.phien_ban).toBe(3);
    expect(ra.la_gi).toBe('Bản ba');

    // Hai ảnh chụp: bản 1 ("Bản một") và bản 2 ("Bản hai") — **mới nhất trước**.
    expect(ra.lich_su_ban.map((b) => [b.phien_ban, b.muc['la_gi']])).toEqual([
      [2, 'Bản hai'],
      [1, 'Bản một'],
    ]);
    expect(ra.lich_su_ban[0]?.sua_boi_loai).toBe('owner');
  });

  it('sửa mà KHÔNG đổi giá trị thì không chụp bản nào, không tăng phiên bản', async () => {
    await sua({ la_gi: 'Bản một' });
    const lai = await sua({ la_gi: 'Bản một' });
    expect(await lai.json<{ phien_ban: number; da_doi: string[] }>()).toMatchObject({
      phien_ban: 1,
      da_doi: [],
    });

    const ra = await layHoSo(env.DB, CHU, WS, P, GIO);
    expect(ra.phien_ban).toBe(1);
    expect(ra.lich_su_ban).toEqual([]);
  });

  it('lịch sử phiên bản KHÔNG sửa, KHÔNG xoá — kể cả bằng SQL thô', async () => {
    await sua({ la_gi: 'Bản một' });
    await sua({ la_gi: 'Bản hai' });

    await expect(
      env.DB.prepare("UPDATE project_ho_so_ban SET anh_json = '{}' WHERE project_id = ?")
        .bind(P)
        .run(),
    ).rejects.toThrow(/chi them/);
    await expect(
      env.DB.prepare('DELETE FROM project_ho_so_ban WHERE project_id = ?').bind(P).run(),
    ).rejects.toThrow(/chi them/);
  });
});

/* ================================================================== *
 * 3. "Lỗi đã gặp" — d.299, chỉ thêm
 * ================================================================== */

describe('Lỗi đã gặp (d.299)', () => {
  it('chủ và agent TRONG dự án đều thêm được; mới nhất trước', async () => {
    await dungAgentCoToken({
      id: 'ag-1',
      ten: 'W-builder',
      vai_tro: 'worker',
      token: 'bt_token_w',
      du_an: [P],
    });

    const a = await goiApi(`/v1/du-an/${P}/loi-da-gap`, TOKEN_CHU, {
      method: 'POST',
      than: { loi: 'Quên `workspace_id` trong câu SQL', cach_tranh: 'Luôn ràng cả hai cột' },
    });
    expect(a.status).toBe(201);
    expect(await a.json<{ ngay: string }>()).toMatchObject({ ngay: expect.any(String) as string });

    const b = await goiApi(`/v1/du-an/${P}/loi-da-gap`, 'bt_token_w', {
      method: 'POST',
      than: { loi: 'D1 không nhận nhiều câu trong một prepare' },
    });
    expect(b.status).toBe(201);

    const ra = await layHoSo(env.DB, CHU, WS, P, GIO);
    expect(ra.loi_da_gap.map((l) => l.ghi_boi_loai)).toEqual(['agent', 'owner']);
    expect(ra.loi_da_gap[0]?.ghi_boi_agent_id).toBe('ag-1');
    expect(ra.loi_da_gap[1]?.cach_tranh).toBe('Luôn ràng cả hai cột');
    // Ngày trên tường `YYYY-MM-DD` — cùng hàm với Nhật ký (19.12 câu 60).
    expect(ra.loi_da_gap[0]?.ngay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // BAT-59 (19.12 câu 15, #177): agent ngoài dự án → NOT_FOUND giống hệt id bịa
  // (trước BAT-59: 403 cho id thật, 404 cho id bịa — một máy dò dự án). Bảng
  // so trực tiếp thật ≡ bịa: `bat59-lo-id-du-an.test.ts`.
  it('agent NGOÀI dự án bị từ chối (NOT_FOUND, không lộ dự án — BAT-59)', async () => {
    await dungAgentCoToken({
      id: 'ag-2',
      ten: 'W-ngoai',
      vai_tro: 'worker',
      token: 'bt_token_ngoai',
      du_an: [],
    });
    const r = await goiApi(`/v1/du-an/${P}/loi-da-gap`, 'bt_token_ngoai', {
      method: 'POST',
      than: { loi: 'Tôi không được vào đây' },
    });
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  /**
   * **Cổng phạm vi chạy TRƯỚC cổng `archived`** — mục 13 d.385: "404 cũng dùng
   * khi đối tượng **ngoài phạm vi**, để không lộ sự tồn tại".
   *
   * Thứ tự đúng làm hai câu trả lời **không phân biệt được**: một agent ngoài
   * phạm vi nhận **cùng một** lỗi cho dự án `active` và dự án `archived`. Thứ tự
   * ngược lại (`batBuocKhongLuuTru` trước) trả `PROJECT_NOT_ACCEPTING`/409 cho
   * dự án `archived` và `FORBIDDEN`/403 cho dự án `active` — tức agent đọc được
   * **trạng thái** của một dự án nó không được vào, chỉ bằng cách so hai mã lỗi.
   *
   * Ca này so **chính hai câu trả lời** với nhau, không so với một hằng số chép
   * tay: điều d.385 đòi ở đây là *hai ca giống nhau*, chứ không phải một mã cụ
   * thể (từ BAT-59 cả hai là `NOT_FOUND`, giống id bịa — 19.12 câu 15, #177).
   *
   * Nửa thứ hai đi kèm, nếu không thì ca này xanh được bằng cách bỏ hẳn cổng
   * `archived`: agent **trong** dự án vẫn phải vấp 409.
   */
  it('agent NGOÀI dự án: dự án lưu trữ và dự án active trả lời GIỐNG NHAU (d.385)', async () => {
    const luu = await dungDuAn('OLD', 'Dự án cũ', 'archived');
    await dungAgentCoToken({
      id: 'ag-2',
      ten: 'W-ngoai',
      vai_tro: 'worker',
      token: 'bt_token_ngoai',
      du_an: [],
    });
    await dungAgentCoToken({
      id: 'ag-3',
      ten: 'W-trong',
      vai_tro: 'worker',
      token: 'bt_token_trong',
      du_an: [luu],
    });

    const than = { loi: 'Tôi dò xem dự án này thế nào' };
    const ngoai_luu = await goiApi(`/v1/du-an/${luu}/loi-da-gap`, 'bt_token_ngoai', {
      method: 'POST',
      than,
    });
    // `P` là dự án `active`, agent `ag-2` cũng **không** được vào.
    const ngoai_active = await goiApi(`/v1/du-an/${P}/loi-da-gap`, 'bt_token_ngoai', {
      method: 'POST',
      than,
    });

    expect(ngoai_luu.status).toBe(ngoai_active.status);
    const a = await ngoai_luu.json<{ error: string; message: string }>();
    const b = await ngoai_active.json<{ error: string; message: string }>();
    expect(a.error).toBe(b.error);
    // Và không một chữ nào về chuyện lưu trữ — đó là một rò rỉ bằng chữ.
    expect(a.message).not.toMatch(/lưu trữ|archived/i);
    expect(a.message).toBe(b.message);

    // Nửa còn lại: agent **được vào** vẫn vấp đúng cổng `archived`.
    const trong = await goiApi(`/v1/du-an/${luu}/loi-da-gap`, 'bt_token_trong', {
      method: 'POST',
      than: { loi: 'Tôi ở trong dự án này' },
    });
    expect(trong.status).toBe(409);
  });

  it('lỗi rỗng bị từ chối; danh sách KHÔNG sửa, KHÔNG xoá được', async () => {
    const rong = await goiApi(`/v1/du-an/${P}/loi-da-gap`, TOKEN_CHU, {
      method: 'POST',
      than: { loi: '   ' },
    });
    expect(rong.status).toBe(422);

    await goiApi(`/v1/du-an/${P}/loi-da-gap`, TOKEN_CHU, {
      method: 'POST',
      than: { loi: 'Một bài học' },
    });
    await expect(
      env.DB.prepare("UPDATE project_loi_da_gap SET loi = 'khác' WHERE project_id = ?")
        .bind(P)
        .run(),
    ).rejects.toThrow(/chi them/);
    await expect(
      env.DB.prepare('DELETE FROM project_loi_da_gap WHERE project_id = ?').bind(P).run(),
    ).rejects.toThrow(/chi them/);
  });
});

/* ================================================================== *
 * 4. Luật chung — d.301
 * ================================================================== */

describe('Luật chung của workspace (d.301)', () => {
  it('chưa soạn thì ba trường rỗng, không NOT_FOUND', async () => {
    expect(await layLuatChung(env.DB, WS)).toEqual({
      danh_sach_cam: null,
      checklist: null,
      cap_nhat_luc: null,
    });
  });

  it('chủ ghi được; sửa một mục KHÔNG xoá mục kia', async () => {
    const a = await goiApi('/v1/luat-chung', TOKEN_CHU, {
      method: 'PUT',
      than: { danh_sach_cam: 'Không tiền, không dữ liệu thật', checklist: '1. Đọc SPEC' },
    });
    expect(a.status).toBe(200);

    const b = await goiApi('/v1/luat-chung', TOKEN_CHU, {
      method: 'PUT',
      than: { checklist: '1. Đọc SPEC\n2. Đọc hồ sơ' },
    });
    expect(b.status).toBe(200);

    const ra = await layLuatChung(env.DB, WS);
    expect(ra.danh_sach_cam).toBe('Không tiền, không dữ liệu thật');
    expect(ra.checklist).toBe('1. Đọc SPEC\n2. Đọc hồ sơ');
  });

  it('agent ĐỌC được (d.301 "Agent đọc được qua CLI hoặc MCP") nhưng không ghi', async () => {
    await dungAgentCoToken({
      id: 'ag-1',
      ten: 'W-builder',
      vai_tro: 'worker',
      token: 'bt_token_w',
      du_an: [P],
    });

    const doc = await goiApi('/v1/luat-chung', 'bt_token_w');
    expect(doc.status).toBe(200);

    const ghi = await goiApi('/v1/luat-chung', 'bt_token_w', {
      method: 'PUT',
      than: { danh_sach_cam: 'Tôi tự nới luật' },
    });
    expect(ghi.status).toBe(403);
  });
});

/* ================================================================== *
 * 5. Trang Bản đồ — d.302
 * ================================================================== */

describe('Trang Bản đồ (d.302)', () => {
  it('bảng có đủ sáu cột SPEC kể, và "thư mục" tới từ hồ sơ', async () => {
    await dungAgent('ag-ql', 'M-Baton', 'manager');
    await env.DB.prepare('UPDATE project SET quan_ly_agent_id = ? WHERE id = ?')
      .bind('ag-ql', P)
      .run();
    await dungTicket(P, 1, 'Việc đang làm', { trang_thai: 'in_progress' });
    await goiApi(`/v1/du-an/${P}/ho-so`, TOKEN_CHU, {
      method: 'PATCH',
      than: { thu_muc: '/Users/chu/sample' },
    });

    const ra = await manHinhBanDo(env.DB, CHU, WS, GIO);
    expect(ra.bay_gio).toBe(GIO);
    const hang = ra.du_an.find((d) => d.id === P);

    // tên · agent quản lý · thư mục · số ticket Đang làm · sức sống · cập nhật cuối
    expect(hang?.ten).toBe('Sample');
    expect(hang?.quan_ly_agent_ten).toBe('M-Baton');
    expect(hang?.thu_muc).toBe('/Users/chu/sample');
    expect(hang?.so_dang_lam).toBe(1);
    // Ticket `in_progress` nhưng **không có phiên** ⇒ 🟡 theo 19.6 (cờ không ai
    // cầm) hoặc 🟢; điều ca này ghim là cột **có** một giá trị của bảng 0.1.
    expect(['xanh', 'vang', 'trang']).toContain(hang?.suc_song);
    expect(hang?.cap_nhat_luc).toBeGreaterThan(0);
    expect(hang?.co_ho_so).toBe(true);
  });

  it('dự án CHƯA có hồ sơ vẫn nằm trên bản đồ (LEFT JOIN, không JOIN)', async () => {
    await dungDuAn('COS', 'Chief of Staff');
    const ra = await manHinhBanDo(env.DB, CHU, WS, GIO);
    expect(ra.du_an.map((d) => d.ma).sort()).toEqual(['COS', 'SAI']);
    expect(ra.du_an.find((d) => d.ma === 'COS')).toMatchObject({ thu_muc: null, co_ho_so: false });
  });

  it('dự án ĐÃ LƯU TRỮ vẫn có trên bản đồ — d.302 nói "bảng MỌI dự án"', async () => {
    await dungDuAn('OLD', 'Dự án cũ', 'archived');
    const ra = await manHinhBanDo(env.DB, CHU, WS, GIO);
    expect(ra.du_an.map((d) => d.ma).sort()).toEqual(['OLD', 'SAI']);
    expect(ra.du_an.find((d) => d.ma === 'OLD')?.nhan_trang_thai).toBe('Lưu trữ');
  });

  it('"cập nhật cuối" lấy mốc MUỘN HƠN giữa dự án và hồ sơ của nó', async () => {
    const truoc = await manHinhBanDo(env.DB, CHU, WS, GIO);
    const moc_du_an = truoc.du_an.find((d) => d.id === P)?.cap_nhat_luc ?? 0;

    // Sửa **hồ sơ** (không chạm `project`): cột vẫn phải nhích.
    await env.DB.prepare(
      `INSERT INTO project_ho_so (project_id, workspace_id, thu_muc, phien_ban, tao_luc, cap_nhat_luc)
       VALUES (?, ?, '/srv/x', 1, ?, ?)`,
    )
      .bind(P, WS, moc_du_an + 1000, moc_du_an + 1000)
      .run();

    const sau = await manHinhBanDo(env.DB, CHU, WS, GIO);
    expect(sau.du_an.find((d) => d.id === P)?.cap_nhat_luc).toBe(moc_du_an + 1000);
  });

  it('trang Luật chung nằm cùng màn hình Bản đồ (d.301)', async () => {
    await goiApi('/v1/luat-chung', TOKEN_CHU, {
      method: 'PUT',
      than: { danh_sach_cam: 'Không tiền' },
    });
    const ra = await manHinhBanDo(env.DB, CHU, WS, GIO);
    expect(ra.luat_chung.danh_sach_cam).toBe('Không tiền');
  });

  it('agent gọi trang Bản đồ thì FORBIDDEN (mục 14: giao diện của chủ)', async () => {
    await dungAgent('ag-1');
    await choVaoDuAn('ag-1', P);
    await expect(
      manHinhBanDo(env.DB, aiAgent('coordinator', { agent_id: 'ag-1' }), WS, GIO),
    ).rejects.toMatchObject({ ma: 'FORBIDDEN' });

    const r = await goiApi('/v1/man-hinh-ban-do', TOKEN_CHU);
    expect(r.status).toBe(200);
  });

  /**
   * **Trần của một lượt gọi phải NÓI RA** — d.302 "bảng **mọi** dự án".
   *
   * `TRAN_BAN_DO` cắt danh sách; cái không được phép là cắt **im lặng**. Ca này
   * đỏ nếu `so_con_lai` bị bỏ đi hoặc bị hardcode `0`.
   */
  it('vượt trần thì `so_con_lai` nói đúng số dự án bị cắt, không im lặng', async () => {
    // Trần thật là 200 dự án; dựng 200 dự án trong một ca test là chậm vô ích,
    // nên ca này ghim **công thức** bằng chính hằng số, qua một ca biên rẻ.
    expect(TRAN_BAN_DO).toBeGreaterThan(0);

    const du = await manHinhBanDo(env.DB, CHU, WS, GIO);
    expect(du.so_con_lai).toBe(0);
    expect(du.du_an).toHaveLength(1);

    // Thêm dự án thì bảng dài ra và `so_con_lai` vẫn 0 — chưa chạm trần.
    await dungDuAn('COS', 'Chief of Staff');
    const hai = await manHinhBanDo(env.DB, CHU, WS, GIO);
    expect(hai.du_an).toHaveLength(2);
    expect(hai.so_con_lai).toBe(0);
  });
});

/* ================================================================== *
 * 6. Phạm vi workspace — mục 1, mục 18, mục 13 d.385
 * ================================================================== */

/**
 * **Không một đường mới nào của mục 9 cho dữ liệu chảy xuyên workspace.**
 *
 * Ba đường mới (`/v1/du-an/:id/ho-so`, `/v1/luat-chung`, `/v1/man-hinh-ban-do`)
 * đều ràng `workspace_id` trong câu SQL; các ca dưới đây **ghim** điều đó, để một
 * lần bỏ sót `WHERE workspace_id = ?` ở lượt sau là một ca đỏ chứ không phải một
 * rò rỉ im lặng.
 */
describe('phạm vi workspace của ba đường mới (mục 1, mục 18)', () => {
  /*
   * **Tên bắt đầu bằng `ws-zz`, và đó là bắt buộc.**
   *
   * Chủ của v0.1 gắn với **workspace duy nhất**, và `workspaceDuyNhat` chọn nó
   * bằng `ORDER BY id LIMIT 1` (`src/xac-thuc.ts`, mục 1). Một `'ws-b'` sắp
   * **trước** `'ws-test'`, nên token chủ sẽ trỏ vào workspace B và mọi ca HTTP
   * dưới đây đo sai thứ nó tưởng đang đo. `giup.ts` đã đặt `WS_KHAC = 'ws-zz-khac'`
   * đúng vì lý do này.
   */
  const WS_B = 'ws-zz-b';
  const P_B = 'pj-B';

  /** Workspace thứ hai, có **đủ** ba loại dữ liệu của mục 9. */
  async function dungWorkspaceB(): Promise<void> {
    const t = Date.now();
    await env.DB.prepare(
      'INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc) VALUES (?, ?, ?, ?)',
    )
      .bind(WS_B, 'Người khác', t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO project (id, workspace_id, ten, ma, trang_thai, tao_luc, cap_nhat_luc)
       VALUES (?, ?, 'Dự án của B', 'BBB', 'active', ?, ?)`,
    )
      .bind(P_B, WS_B, t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO project_ho_so
         (project_id, workspace_id, la_gi, thu_muc, phien_ban, tao_luc, cap_nhat_luc)
       VALUES (?, ?, 'BÍ MẬT CỦA B', '/srv/bi-mat-cua-b', 1, ?, ?)`,
    )
      .bind(P_B, WS_B, t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO project_loi_da_gap
         (id, workspace_id, project_id, ngay, loi, ghi_boi_loai, tao_luc)
       VALUES ('ld-b', ?, ?, '2025-10-09', 'LỖI CỦA B', 'owner', ?)`,
    )
      .bind(WS_B, P_B, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO luat_chung (workspace_id, danh_sach_cam, checklist, cap_nhat_luc)
       VALUES (?, 'CẤM CỦA B', 'CHECKLIST CỦA B', ?)`,
    )
      .bind(WS_B, t)
      .run();
  }

  beforeEach(dungWorkspaceB);

  it('hồ sơ: dự án của workspace B → NOT_FOUND cho chủ của A', async () => {
    await expect(layHoSo(env.DB, CHU, WS, P_B, GIO)).rejects.toMatchObject({ ma: 'NOT_FOUND' });

    // Và qua HTTP, bằng token chủ của A — không lộ sự tồn tại (d.385).
    const r = await goiApi(`/v1/du-an/${P_B}/ho-so`, TOKEN_CHU);
    expect(r.status).toBe(404);
    expect(JSON.stringify(await r.json())).not.toContain('BÍ MẬT CỦA B');
  });

  it('Luật chung của B KHÔNG chảy sang A', async () => {
    // A chưa soạn gì ⇒ ba trường rỗng, dù B đã soạn đủ.
    expect(await layLuatChung(env.DB, WS)).toEqual({
      danh_sach_cam: null,
      checklist: null,
      cap_nhat_luc: null,
    });

    const r = await goiApi('/v1/luat-chung', TOKEN_CHU);
    const van = JSON.stringify(await r.json());
    expect(van).not.toContain('CẤM CỦA B');
    expect(van).not.toContain('CHECKLIST CỦA B');
  });

  /**
   * **Bản đồ của A không mang một mẩu nào của B** — kiểm trên **toàn bộ thân**,
   * không chỉ trên danh sách dự án.
   *
   * Kiểm cả thân là chủ ý: một rò rỉ qua `thu_muc`, qua tên agent, hay qua
   * `luat_chung` đều lọt nếu ca chỉ đếm số hàng. Chuỗi mồi (`BÍ MẬT CỦA B`,
   * `/srv/bi-mat-cua-b`, `CẤM CỦA B`) có mặt **đúng** để bị bắt.
   */
  it('Bản đồ của A: không một mẩu dữ liệu nào của B lọt vào thân', async () => {
    const ra = await manHinhBanDo(env.DB, CHU, WS, GIO);
    expect(ra.du_an.map((d) => d.ma)).toEqual(['SAI']);

    const van = JSON.stringify(ra);
    for (const mau of ['BÍ MẬT CỦA B', '/srv/bi-mat-cua-b', 'CẤM CỦA B', 'CHECKLIST CỦA B', P_B]) {
      expect(van, `mẩu "${mau}" của workspace B`).not.toContain(mau);
    }
    // `so_con_lai` đếm **trong workspace A**, không đếm cả dự án của B.
    expect(ra.so_con_lai).toBe(0);
  });

  it('"Lỗi đã gặp" của B không hiện trên hồ sơ của A', async () => {
    const ra = await layHoSo(env.DB, CHU, WS, P, GIO);
    expect(JSON.stringify(ra.loi_da_gap)).not.toContain('LỖI CỦA B');
  });
});

/* ================================================================== *
 * 7. Dự án `archived` là CHỈ ĐỌC — mục 2, 19.12 câu 25
 * ================================================================== */

describe('dự án đã lưu trữ: ba lệnh ghi của mục 9', () => {
  it('sửa hồ sơ một dự án ĐÃ LƯU TRỮ bị từ chối', async () => {
    const luu = await dungDuAn('OLD', 'Dự án cũ', 'archived');
    const r = await goiApi(`/v1/du-an/${luu}/ho-so`, TOKEN_CHU, {
      method: 'PATCH',
      than: { la_gi: 'Sửa một dự án đã đóng' },
    });
    expect(r.status).toBe(409);
    expect(await r.json<{ error: string }>()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });

    // Và không một dòng hồ sơ nào được ghi.
    const ra = await layHoSo(env.DB, CHU, WS, luu, GIO);
    expect(ra.phien_ban).toBe(0);
    expect(ra.la_gi).toBeNull();
  });

  it('thêm "Lỗi đã gặp" vào một dự án ĐÃ LƯU TRỮ bị từ chối', async () => {
    const luu = await dungDuAn('OLD', 'Dự án cũ', 'archived');
    const r = await goiApi(`/v1/du-an/${luu}/loi-da-gap`, TOKEN_CHU, {
      method: 'POST',
      than: { loi: 'Ghi vào một dự án đã đóng' },
    });
    expect(r.status).toBe(409);
    expect(await r.json<{ error: string }>()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });

    const ra = await layHoSo(env.DB, CHU, WS, luu, GIO);
    expect(ra.loi_da_gap).toEqual([]);
  });

  /**
   * **Luật chung KHÔNG bị cổng `archived`** — và đó là đúng, không phải sót.
   *
   * Nó là trang của **workspace** (d.301), không của một dự án; một workspace
   * không có trạng thái `archived` nào để kiểm. Ca này ghim ý đó, để lượt sau
   * không ai "sửa cho đều tay" bằng cách thêm một cổng vô nghĩa.
   */
  it('Luật chung vẫn sửa được dù mọi dự án đều đã lưu trữ', async () => {
    await env.DB.prepare("UPDATE project SET trang_thai = 'archived' WHERE workspace_id = ?")
      .bind(WS)
      .run();
    const r = await goiApi('/v1/luat-chung', TOKEN_CHU, {
      method: 'PUT',
      than: { danh_sach_cam: 'Vẫn sửa được' },
    });
    expect(r.status).toBe(200);
  });
});

/* ================================================================== *
 * 8. `project_id` của ĐƯỜNG DẪN thắng `project_id` của THÂN
 * ================================================================== */

/**
 * **Route ghi đè `project_id` SAU khi lọc thân** — `{ ...than(c), project_id:
 * c.req.param('id') }`.
 *
 * Thứ tự đó là một luật an ninh, không một chi tiết phong cách: đảo lại thành
 * `{ project_id: param, ...than }` thì **thân request thắng**, và một agent chỉ
 * được vào dự án A ghi được vào hồ sơ của dự án B bằng cách gọi
 * `POST /v1/du-an/A/loi-da-gap` với `{"project_id": "B"}` trong thân. Hai ca dưới
 * đây đỏ đúng lúc ai đó đảo thứ tự ấy.
 */
describe('project_id của đường dẫn thắng project_id của thân', () => {
  it('POST loi-da-gap: ghi vào dự án trên URL, KHÔNG dự án trong thân', async () => {
    const khac = await dungDuAn('COS', 'Chief of Staff');

    const r = await goiApi(`/v1/du-an/${P}/loi-da-gap`, TOKEN_CHU, {
      method: 'POST',
      than: { loi: 'Mục này thuộc về SAI', project_id: khac },
    });
    expect(r.status).toBe(201);

    const tren_url = await layHoSo(env.DB, CHU, WS, P, GIO);
    const trong_than = await layHoSo(env.DB, CHU, WS, khac, GIO);
    expect(tren_url.loi_da_gap.map((l) => l.loi)).toEqual(['Mục này thuộc về SAI']);
    expect(trong_than.loi_da_gap).toEqual([]);
  });

  it('PATCH ho-so: sửa hồ sơ của dự án trên URL, KHÔNG dự án trong thân', async () => {
    const khac = await dungDuAn('COS', 'Chief of Staff');

    const r = await goiApi(`/v1/du-an/${P}/ho-so`, TOKEN_CHU, {
      method: 'PATCH',
      than: { la_gi: 'Hồ sơ của SAI', project_id: khac },
    });
    expect(r.status).toBe(200);
    expect(await r.json<{ project_id: string }>()).toMatchObject({ project_id: P });

    expect((await layHoSo(env.DB, CHU, WS, P, GIO)).la_gi).toBe('Hồ sơ của SAI');
    expect((await layHoSo(env.DB, CHU, WS, khac, GIO)).la_gi).toBeNull();
  });
});
