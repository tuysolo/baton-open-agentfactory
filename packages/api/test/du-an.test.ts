/**
 * Dự án — SPEC mục 2 (+ mục 4 `PROJECT_NOT_ACCEPTING`, mục 13 phạm vi và 404).
 *
 * Thông điệp lỗi được so **đúng chữ trong SPEC**: "Mã dự án đã có" và
 * "Mã chỉ gồm 2–6 chữ A–Z".
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { LOI_MA_DU_AN_SAI_DINH_DANG, LOI_MA_DU_AN_TRUNG } from '@baton/shared';
import {
  TOKEN_CHU,
  dungAgentCoToken,
  dungDuAn,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const TOKEN_COORD = 'bt_token_coord_du_an';
const TOKEN_MGR = 'bt_token_manager_du_an';
const TOKEN_HEP = 'bt_token_agent_pham_vi_hep';

describe('SPEC mục 2 — tạo dự án', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
  });

  it('chủ tạo được; tên và mã vào đúng chỗ, trạng thái mặc định là active', async () => {
    const res = await goiApi('/v1/du-an', TOKEN_CHU, {
      method: 'POST',
      than: { ten: 'Sample', ma: 'SAI', mo_ta: 'Dự án chính' },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ma: 'SAI', ten: 'Sample', trang_thai: 'active' });

    const d = await env.DB.prepare(
      'SELECT ten, ma, trang_thai, bat_buoc_review, khong_code FROM project WHERE ma = ?',
    )
      .bind('SAI')
      .first<{ ten: string; ma: string; trang_thai: string; bat_buoc_review: number; khong_code: number }>();
    expect(d).toMatchObject({ ten: 'Sample', ma: 'SAI', trang_thai: 'active' });
    // Cờ "bắt buộc review" **mặc định bật** — SPEC mục 7.
    expect(d?.bat_buoc_review).toBe(1);
    expect(d?.khong_code).toBe(0);
  });

  it('CHỈ CHỦ tạo được: agent coordinator cũng bị FORBIDDEN (SPEC mục 2 "chủ tạo")', async () => {
    const res = await goiApi('/v1/du-an', TOKEN_COORD, {
      method: 'POST',
      than: { ten: 'Dự án của agent', ma: 'AGT' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });

    const n = await env.DB.prepare('SELECT count(*) AS n FROM project').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('mã TRÙNG trong workspace → đúng chữ SPEC "Mã dự án đã có"', async () => {
    await goiApi('/v1/du-an', TOKEN_CHU, { method: 'POST', than: { ten: 'Sample', ma: 'SAI' } });
    const res = await goiApi('/v1/du-an', TOKEN_CHU, {
      method: 'POST',
      than: { ten: 'Sample hai', ma: 'SAI' },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'INVALID_INPUT',
      message: LOI_MA_DU_AN_TRUNG,
    });
    expect(LOI_MA_DU_AN_TRUNG).toBe('Mã dự án đã có');

    const n = await env.DB.prepare('SELECT count(*) AS n FROM project').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it.each([
    ['A', 'một chữ'],
    ['ABCDEFG', 'bảy chữ'],
    ['sai', 'chữ thường'],
    ['SA1', 'có số'],
    ['SA-I', 'có gạch'],
    ['', 'rỗng'],
    ['SÀI', 'có dấu'],
  ])('mã sai định dạng "%s" (%s) → đúng chữ SPEC "Mã chỉ gồm 2–6 chữ A–Z"', async (ma) => {
    const res = await goiApi('/v1/du-an', TOKEN_CHU, {
      method: 'POST',
      than: { ten: 'Dự án', ma },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'INVALID_INPUT',
      message: LOI_MA_DU_AN_SAI_DINH_DANG,
    });
    expect(LOI_MA_DU_AN_SAI_DINH_DANG).toBe('Mã chỉ gồm 2–6 chữ A–Z');
  });

  it.each([['AB'], ['ABC'], ['ABCDEF']])('mã đúng định dạng "%s" được nhận', async (ma) => {
    const res = await goiApi('/v1/du-an', TOKEN_CHU, {
      method: 'POST',
      than: { ten: `Dự án ${ma}`, ma },
    });
    expect(res.status).toBe(201);
  });

  it('tên bắt buộc: thiếu hoặc chỉ khoảng trắng → INVALID_INPUT', async () => {
    for (const ten of [undefined, '', '   ']) {
      const res = await goiApi('/v1/du-an', TOKEN_CHU, {
        method: 'POST',
        than: { ten, ma: 'ABC' },
      });
      expect(res.status, JSON.stringify(ten)).toBe(422);
      expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
    }
  });
});

describe('SPEC mục 2 — mã KHÔNG đổi được sau khi tạo', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
  });

  it('qua đường lệnh: gửi `ma` khi sửa → INVALID_INPUT, mã giữ nguyên', async () => {
    const res = await goiApi('/v1/du-an/pj-SAI', TOKEN_CHU, {
      method: 'PATCH',
      than: { ma: 'XYZ' },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });

    const d = await env.DB.prepare('SELECT ma FROM project WHERE id = ?')
      .bind('pj-SAI')
      .first<{ ma: string }>();
    expect(d?.ma).toBe('SAI');
  });

  it('gửi kèm `ma` cùng các trường khác cũng bị từ chối hết, không sửa nửa vời', async () => {
    const res = await goiApi('/v1/du-an/pj-SAI', TOKEN_CHU, {
      method: 'PATCH',
      than: { ten: 'Tên mới', ma: 'XYZ' },
    });
    expect(res.status).toBe(422);
    const d = await env.DB.prepare('SELECT ten, ma FROM project WHERE id = ?')
      .bind('pj-SAI')
      .first<{ ten: string; ma: string }>();
    expect(d).toEqual({ ten: 'Sample', ma: 'SAI' });
  });

  it('trigger của DB cũng chặn, kể cả khi UPDATE đi thẳng vào bảng', async () => {
    // Hàng rào cuối: nếu một handler tương lai quên kiểm, DB vẫn không cho đổi.
    await expect(
      env.DB.prepare('UPDATE project SET ma = ? WHERE id = ?').bind('XYZ', 'pj-SAI').run(),
    ).rejects.toThrow(/khong doi duoc/);

    const d = await env.DB.prepare('SELECT ma FROM project WHERE id = ?')
      .bind('pj-SAI')
      .first<{ ma: string }>();
    expect(d?.ma).toBe('SAI');
  });

  it('nhưng TÊN thì đổi được (SPEC mục 2 "tên đổi được")', async () => {
    const res = await goiApi('/v1/du-an/pj-SAI', TOKEN_CHU, {
      method: 'PATCH',
      than: { ten: 'Sample v2' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ da_doi: ['ten'] });
    const d = await env.DB.prepare('SELECT ten FROM project WHERE id = ?')
      .bind('pj-SAI')
      .first<{ ten: string }>();
    expect(d?.ten).toBe('Sample v2');
  });
});

describe('SPEC mục 2 — sửa các trường của dự án', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungAgentCoToken({
      id: 'ag-mgr',
      ten: 'M-Sample',
      vai_tro: 'manager',
      token: TOKEN_MGR,
      du_an: ['pj-SAI'],
    });
  });

  it('sửa được mô tả, màu, nhóm, agent quản lý, hai cờ hồ sơ', async () => {
    const res = await goiApi('/v1/du-an/pj-SAI', TOKEN_CHU, {
      method: 'PATCH',
      than: {
        mo_ta: 'Mô tả mới',
        mau: '#ff0000',
        nhom: 'Sample',
        quan_ly_agent_id: 'ag-mgr',
        khong_code: true,
        bat_buoc_review: false,
      },
    });
    expect(res.status).toBe(200);

    const d = await env.DB.prepare(
      `SELECT mo_ta, mau, nhom, quan_ly_agent_id, khong_code, bat_buoc_review
         FROM project WHERE id = ?`,
    )
      .bind('pj-SAI')
      .first<Record<string, unknown>>();
    expect(d).toEqual({
      mo_ta: 'Mô tả mới',
      mau: '#ff0000',
      nhom: 'Sample',
      quan_ly_agent_id: 'ag-mgr',
      khong_code: 1,
      bat_buoc_review: 0,
    });
  });

  it('agent quản lý không tồn tại → NOT_FOUND, không ghi gì', async () => {
    const res = await goiApi('/v1/du-an/pj-SAI', TOKEN_CHU, {
      method: 'PATCH',
      than: { quan_ly_agent_id: 'ag-khong-co' },
    });
    expect(res.status).toBe(404);
    const d = await env.DB.prepare('SELECT quan_ly_agent_id FROM project WHERE id = ?')
      .bind('pj-SAI')
      .first<{ quan_ly_agent_id: string | null }>();
    expect(d?.quan_ly_agent_id).toBeNull();
  });

  it('chỉ chủ sửa được dự án', async () => {
    const res = await goiApi('/v1/du-an/pj-SAI', TOKEN_MGR, {
      method: 'PATCH',
      than: { ten: 'Agent đổi tên' },
    });
    expect(res.status).toBe(403);
  });

  it('trạng thái lạ → INVALID_INPUT (chỉ ba mã của SPEC mục 2)', async () => {
    const res = await goiApi('/v1/du-an/pj-SAI', TOKEN_CHU, {
      method: 'PATCH',
      than: { trang_thai: 'dang_chay' },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it.each([['active'], ['paused'], ['archived']])('trạng thái "%s" được nhận', async (tt) => {
    const res = await goiApi('/v1/du-an/pj-SAI', TOKEN_CHU, {
      method: 'PATCH',
      than: { trang_thai: tt },
    });
    expect(res.status).toBe(200);
  });
});

describe('SPEC mục 2, 4 — trạng thái dự án chi phối việc mới', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('ACT', 'Đang chạy', 'active');
    await dungDuAn('PAU', 'Tạm dừng', 'paused');
    await dungDuAn('ARC', 'Lưu trữ', 'archived');
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
  });

  it('dự án `active`: agent tạo được ticket', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id: 'pj-ACT', tieu_de: 'Việc đầu tiên' },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ ma: 'ACT-1', so: 1 });
  });

  it('dự án `paused`: agent tạo ticket → PROJECT_NOT_ACCEPTING (SPEC mục 4)', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id: 'pj-PAU', tieu_de: 'Việc mới trong dự án tạm dừng' },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });

    const n = await env.DB.prepare('SELECT count(*) AS n FROM ticket').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('dự án `archived`: agent tạo ticket → PROJECT_NOT_ACCEPTING (SPEC mục 4)', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id: 'pj-ARC', tieu_de: 'Việc mới trong dự án lưu trữ' },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });
  });

  it('`paused` chặn việc mới nhưng KHÔNG chặn sửa ticket đang có', async () => {
    // Tạo ticket khi dự án còn active, rồi tạm dừng dự án.
    const tao = await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id: 'pj-ACT', tieu_de: 'Việc đang làm' },
    });
    const { id } = await tao.json<{ id: string }>();
    await goiApi('/v1/du-an/pj-ACT', TOKEN_CHU, {
      method: 'PATCH',
      than: { trang_thai: 'paused' },
    });

    const res = await goiApi(`/v1/ticket/${id}`, TOKEN_COORD, {
      method: 'PATCH',
      than: { tieu_de: 'Tiêu đề đã sửa khi dự án tạm dừng' },
    });
    expect(res.status).toBe(200);
  });

  it('`archived` là CHỈ ĐỌC: sửa ticket trong đó cũng bị từ chối (SPEC mục 2)', async () => {
    const tao = await goiApi('/v1/ticket', TOKEN_COORD, {
      method: 'POST',
      than: { project_id: 'pj-ACT', tieu_de: 'Việc rồi sẽ bị lưu trữ' },
    });
    const { id } = await tao.json<{ id: string }>();
    await goiApi('/v1/du-an/pj-ACT', TOKEN_CHU, {
      method: 'PATCH',
      than: { trang_thai: 'archived' },
    });

    const res = await goiApi(`/v1/ticket/${id}`, TOKEN_COORD, {
      method: 'PATCH',
      than: { tieu_de: 'Không được sửa' },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });

    const d = await env.DB.prepare('SELECT tieu_de FROM ticket WHERE id = ?')
      .bind(id)
      .first<{ tieu_de: string }>();
    expect(d?.tieu_de).toBe('Việc rồi sẽ bị lưu trữ');
  });

  it('`archived` là CHỈ ĐỌC: chủ sửa trường của dự án cũng bị từ chối', async () => {
    const res = await goiApi('/v1/du-an/pj-ARC', TOKEN_CHU, {
      method: 'PATCH',
      than: { ten: 'Tên mới' },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });
  });

  it('`archived`: gửi `trang_thai` KÈM trường khác → từ chối cả lệnh, không lách được', async () => {
    // Lách cũ: đính thêm `trang_thai` vào request là sửa được mọi trường khác
    // trong cùng lệnh. `spec-questions.md` #15 chỉ xin ngoại lệ cho RIÊNG trường đó.
    const res = await goiApi('/v1/du-an/pj-ARC', TOKEN_CHU, {
      method: 'PATCH',
      than: { trang_thai: 'active', ten: 'Tên lách vào', mo_ta: 'Mô tả lách vào' },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });

    // Không trường nào được ghi, kể cả `trang_thai`: lệnh bị từ chối trọn vẹn.
    const d = await env.DB.prepare(
      'SELECT ten, mo_ta, trang_thai FROM project WHERE id = ?',
    )
      .bind('pj-ARC')
      .first<{ ten: string; mo_ta: string | null; trang_thai: string }>();
    expect(d).toEqual({ ten: 'Lưu trữ', mo_ta: null, trang_thai: 'archived' });
  });

  it.each([
    ['ten', 'Tên mới'],
    ['mo_ta', 'Mô tả'],
    ['mau', '#123456'],
    ['nhom', 'Nhóm'],
    ['khong_code', true],
    ['bat_buoc_review', false],
    ['quan_ly_agent_id', null],
  ])('`archived`: trường "%s" đi kèm trang_thai cũng bị từ chối', async (truong, gia_tri) => {
    const res = await goiApi('/v1/du-an/pj-ARC', TOKEN_CHU, {
      method: 'PATCH',
      than: { trang_thai: 'active', [truong]: gia_tri },
    });
    expect(res.status).toBe(409);
  });

  it('`archived`: chỉ `trang_thai` một mình thì được (đường mở lại)', async () => {
    const res = await goiApi('/v1/du-an/pj-ARC', TOKEN_CHU, {
      method: 'PATCH',
      than: { trang_thai: 'paused' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ da_doi: ['trang_thai'] });
  });

  it('nhưng chủ MỞ LẠI được dự án lưu trữ (nếu không thì lưu trữ là cửa một chiều)', async () => {
    const mo = await goiApi('/v1/du-an/pj-ARC', TOKEN_CHU, {
      method: 'PATCH',
      than: { trang_thai: 'active' },
    });
    expect(mo.status).toBe(200);

    // Mở lại rồi thì sửa được, và agent tạo được việc mới.
    expect(
      (
        await goiApi('/v1/du-an/pj-ARC', TOKEN_CHU, { method: 'PATCH', than: { ten: 'Tên mới' } })
      ).status,
    ).toBe(200);
    expect(
      (
        await goiApi('/v1/ticket', TOKEN_COORD, {
          method: 'POST',
          than: { project_id: 'pj-ARC', tieu_de: 'Việc sau khi mở lại' },
        })
      ).status,
    ).toBe(201);
  });

  it('chủ vẫn tạo được ticket trong dự án `paused` (paused là luật cho agent)', async () => {
    // SPEC mục 2: `paused` = "**agent** không nhận việc mới trong dự án";
    // mục 4: "dự án đang tạm dừng ... thì **agent** không tạo được ticket".
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: 'pj-PAU', tieu_de: 'Chủ lên kế hoạch trước' },
    });
    expect(res.status).toBe(201);
  });
});

describe('SPEC mục 2 — dự án `archived` ẩn khỏi danh sách mặc định', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('ACT', 'Đang chạy', 'active');
    await dungDuAn('PAU', 'Tạm dừng', 'paused');
    await dungDuAn('ARC', 'Lưu trữ', 'archived');
  });

  it('mặc định KHÔNG có dự án lưu trữ (SPEC mục 2 "ẩn khỏi sidebar")', async () => {
    const res = await goiApi('/v1/du-an', TOKEN_CHU);
    const { items } = await res.json<{ items: { ma: string }[] }>();
    expect(items.map((d) => d.ma).sort()).toEqual(['ACT', 'PAU']);
  });

  it('`?gom_luu_tru=co` lấy cả dự án lưu trữ', async () => {
    const res = await goiApi('/v1/du-an?gom_luu_tru=co', TOKEN_CHU);
    const { items } = await res.json<{ items: { ma: string }[] }>();
    expect(items.map((d) => d.ma).sort()).toEqual(['ACT', 'ARC', 'PAU']);
  });

  it('`?trang_thai=archived` vẫn lấy đúng nhóm đó: không dữ liệu nào bị khoá tầm nhìn', async () => {
    const res = await goiApi('/v1/du-an?trang_thai=archived', TOKEN_CHU);
    const { items } = await res.json<{ items: { ma: string }[] }>();
    expect(items.map((d) => d.ma)).toEqual(['ARC']);
  });

  it('ẩn khỏi DANH SÁCH không có nghĩa là chặn ĐỌC từng dự án', async () => {
    // `archived` là "ẩn khỏi sidebar, **chỉ đọc**" — chỉ đọc thì phải đọc được.
    const res = await goiApi('/v1/du-an/pj-ARC', TOKEN_CHU);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ma: 'ARC', trang_thai: 'archived' });
  });

  it('ẩn mặc định cũng áp cho agent, không chỉ cho chủ', async () => {
    await dungAgentCoToken({
      id: 'ag-tat-ca',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
    const res = await goiApi('/v1/du-an', TOKEN_COORD);
    const { items } = await res.json<{ items: { ma: string }[] }>();
    expect(items.map((d) => d.ma).sort()).toEqual(['ACT', 'PAU']);
  });

  it('cuộn bằng cursor vẫn ẩn dự án lưu trữ ở mọi trang', async () => {
    const lay: string[] = [];
    let duong = '/v1/du-an?limit=1';
    for (let vong = 0; vong < 10; vong += 1) {
      const trang = await (
        await goiApi(duong, TOKEN_CHU)
      ).json<{ items: { ma: string }[]; cursor_sau: string | null }>();
      lay.push(...trang.items.map((d) => d.ma));
      if (trang.cursor_sau === null) break;
      duong = `/v1/du-an?limit=1&cursor=${encodeURIComponent(trang.cursor_sau)}`;
    }
    expect(lay.sort()).toEqual(['ACT', 'PAU']);
  });
});

describe('SPEC mục 13, 17.7 — dự án ngoài phạm vi agent trả NOT_FOUND', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungDuAn('SAI', 'Sample');
    await dungDuAn('INC', 'INC');
    await dungAgentCoToken({
      id: 'ag-hep',
      ten: 'W-chi-SAI',
      vai_tro: 'worker',
      token: TOKEN_HEP,
      du_an: ['pj-SAI'],
    });
  });

  it('đọc dự án được vào → 200', async () => {
    const res = await goiApi('/v1/du-an/pj-SAI', TOKEN_HEP);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ma: 'SAI' });
  });

  it('đọc dự án NGOÀI phạm vi → 404 NOT_FOUND, không phải 403', async () => {
    const res = await goiApi('/v1/du-an/pj-INC', TOKEN_HEP);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('404 của "ngoài phạm vi" giống hệt 404 của "không tồn tại" — không lộ sự tồn tại', async () => {
    const ngoai = await goiApi('/v1/du-an/pj-INC', TOKEN_HEP);
    const khong_co = await goiApi('/v1/du-an/pj-KHONG-BAO-GIO-CO', TOKEN_HEP);
    expect(ngoai.status).toBe(khong_co.status);
    expect(await ngoai.json()).toEqual(await khong_co.json());
  });

  it('danh sách dự án chỉ gồm dự án agent được vào', async () => {
    const res = await goiApi('/v1/du-an', TOKEN_HEP);
    const { items } = await res.json<{ items: { ma: string }[] }>();
    expect(items.map((d) => d.ma)).toEqual(['SAI']);
  });

  it('chủ thấy cả hai dự án', async () => {
    const res = await goiApi('/v1/du-an', TOKEN_CHU);
    const { items } = await res.json<{ items: { ma: string }[] }>();
    expect(items.map((d) => d.ma).sort()).toEqual(['INC', 'SAI']);
  });

  it('GHI vào dự án ngoài phạm vi → FORBIDDEN (khác với ĐỌC trả NOT_FOUND)', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_HEP, {
      method: 'POST',
      than: { project_id: 'pj-INC', tieu_de: 'Việc xuyên phạm vi' },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });
});
