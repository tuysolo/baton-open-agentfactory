/**
 * **Trạng thái ban đầu khi tạo ticket** — BAT-63, SPEC mục 4 câu "Trạng thái khi
 * tạo" (Chủ chốt T-108 = B, 29/10; `cau-hoi-spec.md` #179): mặc định **Cần làm**,
 * người tạo được chọn **Backlog**, mọi trạng thái khác không đặt được lúc tạo
 * (`INVALID_INPUT`). Quyền tạo không đổi theo trạng thái chọn.
 *
 * Mọi ca đi đường HTTP thật (`POST /v1/ticket` → whitelist `TRUONG_CLIENT` → cửa
 * ghi → `handlerTaoTicket`), và kiểm DB độc lập với phản hồi. Ca từ chối đếm cả
 * **ticket** lẫn **bộ đếm số** của dự án: giá trị sai phải bị chặn ở chỗ kiểm nhập
 * đầu hàm, trước khi cấp số.
 */

import SPEC_VAN from '../../../SPEC.md?raw';
import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  LOI_TRANG_THAI_KHI_TAO,
  TRANG_THAI_TICKET_KHI_TAO,
  TRANG_THAI_TICKET_MAC_DINH,
  kiemTrangThaiKhiTao,
  nhan,
} from '@baton/shared';
import { TRUONG_CLIENT } from '../src/index.js';
import {
  TOKEN_CHU,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const TOKEN_QL = 'bt_token_ql_bat63';
const TOKEN_COORD = 'bt_token_coord_bat63';
const TOKEN_WORKER = 'bt_token_worker_bat63';

async function soTicket(): Promise<number> {
  const d = await env.DB.prepare('SELECT count(*) AS n FROM ticket').first<{ n: number }>();
  return d?.n ?? -1;
}

async function boDem(project_id: string): Promise<number | null> {
  const d = await env.DB.prepare(
    "SELECT gia_tri FROM bo_dem WHERE pham_vi = 'project' AND khoa = ?",
  )
    .bind(project_id)
    .first<{ gia_tri: number }>();
  return d?.gia_tri ?? null;
}

async function cotTicket(id: string): Promise<{ trang_thai: string; trong_tay_tu_luc: number | null; bat_dau_luc: number | null } | null> {
  return env.DB.prepare('SELECT trang_thai, trong_tay_tu_luc, bat_dau_luc FROM ticket WHERE id = ?')
    .bind(id)
    .first();
}

async function tao(token: string, than: Record<string, unknown>): Promise<Response> {
  return goiApi('/v1/ticket', token, { method: 'POST', than });
}

/* ================================================================== *
 * Lưới SPEC + hàm kiểm thuần
 * ================================================================== */

describe('SPEC mục 4 "Trạng thái khi tạo" ↔ `TRANG_THAI_TICKET_KHI_TAO`', () => {
  it('câu SPEC: mặc định **Cần làm**, được chọn **Backlog**, còn lại `INVALID_INPUT` — khớp hằng của shared', () => {
    const dong = SPEC_VAN.split('\n').filter((d) => d.startsWith('**Trạng thái khi tạo:**'));
    expect(dong).toHaveLength(1);
    const cau = dong[0] ?? '';
    expect(cau).toContain(`mặc định **${nhan('trang_thai_ticket', TRANG_THAI_TICKET_MAC_DINH)}**`);
    expect(cau).toContain(`được chọn **${nhan('trang_thai_ticket', 'backlog')}**`);
    expect(cau).toContain('Mọi trạng thái khác không đặt được lúc tạo (`INVALID_INPUT`)');
    expect(cau).toContain('T-108 = B');
    expect([...TRANG_THAI_TICKET_KHI_TAO]).toEqual(['todo', 'backlog']);
    expect(TRANG_THAI_TICKET_KHI_TAO[0]).toBe(TRANG_THAI_TICKET_MAC_DINH);
  });

  it('bảng lệnh mục 13: `baton create …` có `[--status backlog]` đúng một lần', () => {
    const dong = SPEC_VAN.split('\n').filter((d) => d.startsWith('| `baton create '));
    expect(dong).toHaveLength(1);
    expect(dong[0]?.split('[--status backlog]').length).toBe(2);
  });

  it('kiemTrangThaiKhiTao: undefined ⇒ todo; todo/backlog nhận; còn lại INVALID_INPUT với câu tiếng Việt', () => {
    expect(kiemTrangThaiKhiTao(undefined)).toBe('todo');
    expect(kiemTrangThaiKhiTao('todo')).toBe('todo');
    expect(kiemTrangThaiKhiTao('backlog')).toBe('backlog');
    for (const la of ['in_progress', 'verifying', 'done', 'canceled', 'duplicate', 'xyz', '', null, 5, ['backlog']]) {
      expect(() => kiemTrangThaiKhiTao(la), JSON.stringify(la)).toThrow(LOI_TRANG_THAI_KHI_TAO);
    }
    expect(LOI_TRANG_THAI_KHI_TAO).toBe(
      'Khi tạo ticket chỉ chọn được trạng thái Cần làm (todo) hoặc Backlog (backlog).',
    );
  });

  it('whitelist `tao_ticket` có `trang_thai`; `tao_ticket_viec_phat_sinh` KHÔNG (việc phát sinh luôn Cần làm)', () => {
    expect(TRUONG_CLIENT.tao_ticket).toContain('trang_thai');
    expect(TRUONG_CLIENT.tao_ticket_viec_phat_sinh).not.toContain('trang_thai');
  });
});

/* ================================================================== *
 * Đường HTTP thật
 * ================================================================== */

describe('POST /v1/ticket — trạng thái ban đầu (BAT-63)', () => {
  beforeEach(async () => {
    await dungWorkspace();
    await dungAgentCoToken({ id: 'ag-ql', ten: 'M', vai_tro: 'manager', token: TOKEN_QL });
    await dungDuAn('SAI', 'Sample', 'active', 'ag-ql');
    await choVaoDuAn('ag-ql', 'pj-SAI');
    await dungDuAn('PAU', 'Tạm dừng', 'paused');
    await dungAgentCoToken({
      id: 'ag-coord',
      ten: 'CoS',
      vai_tro: 'coordinator',
      token: TOKEN_COORD,
      vao_tat_ca_du_an: true,
    });
    await dungAgentCoToken({
      id: 'ag-w',
      ten: 'W',
      vai_tro: 'worker',
      token: TOKEN_WORKER,
      du_an: ['pj-SAI'],
    });
  });

  it('`trang_thai: backlog` ⇒ 201, `ket_qua.trang_thai` backlog, DB backlog; đọc lại ra nhãn Backlog, nhóm planned', async () => {
    const res = await tao(TOKEN_CHU, { project_id: 'pj-SAI', tieu_de: 'Ý tưởng xa', trang_thai: 'backlog' });
    expect(res.status).toBe(201);
    const kq = await res.json<{ id: string; ma: string; trang_thai: string }>();
    expect(kq.trang_thai).toBe('backlog');
    expect(kq.ma).toBe('SAI-1');

    const db = await cotTicket(kq.id);
    expect(db?.trang_thai).toBe('backlog');
    // Nhóm `planned`: không mốc "không ai cầm" (chỉ nhóm active), không mốc bắt đầu.
    expect(db?.trong_tay_tu_luc).toBeNull();
    expect(db?.bat_dau_luc).toBeNull();

    const doc = await goiApi(`/v1/ticket/${kq.id}`, TOKEN_CHU);
    expect(await doc.json()).toMatchObject({
      trang_thai: 'backlog',
      nhan_trang_thai: 'Backlog',
      nhom_trang_thai: 'planned',
    });
    // Tạo không phải một "thay đổi": không có dòng lịch sử nào (như ticket tạo vào Cần làm).
    const ls = await env.DB.prepare('SELECT count(*) AS n FROM ticket_history WHERE ticket_id = ?')
      .bind(kq.id)
      .first<{ n: number }>();
    expect(ls?.n).toBe(0);
  });

  it('không gửi ⇒ todo; gửi `todo` ⇒ todo (DB và phản hồi)', async () => {
    const khong = await tao(TOKEN_CHU, { project_id: 'pj-SAI', tieu_de: 'Mặc định' });
    expect(khong.status).toBe(201);
    const a = await khong.json<{ id: string; trang_thai: string }>();
    expect(a.trang_thai).toBe('todo');
    expect((await cotTicket(a.id))?.trang_thai).toBe('todo');

    const co = await tao(TOKEN_CHU, { project_id: 'pj-SAI', tieu_de: 'Chọn Cần làm', trang_thai: 'todo' });
    expect(co.status).toBe(201);
    const b = await co.json<{ id: string; trang_thai: string }>();
    expect(b.trang_thai).toBe('todo');
    expect((await cotTicket(b.id))?.trang_thai).toBe('todo');
  });

  it('agent (manager quản lý dự án) tạo vào Backlog được — quyền như tạo vào Cần làm', async () => {
    const res = await tao(TOKEN_QL, { project_id: 'pj-SAI', tieu_de: 'Backlog của M', trang_thai: 'backlog' });
    expect(res.status).toBe(201);
    const kq = await res.json<{ id: string; trang_thai: string }>();
    expect((await cotTicket(kq.id))?.trang_thai).toBe('backlog');
  });

  it.each([
    ['in_progress'],
    ['done'],
    ['verifying'],
    ['canceled'],
    ['duplicate'],
    ['xyz'],
    // Không chuẩn hoá hoa/thường hay khoảng trắng: chỉ đúng mã `backlog` mới nhận.
    ['Backlog'],
    ['BACKLOG'],
    [' backlog'],
    [''],
    [null],
    [5],
  ] as const)('`trang_thai: %j` ⇒ 422 INVALID_INPUT, 0 ticket, bộ đếm số không tăng', async (gia_tri) => {
    // Cấp một số trước để bộ đếm có giá trị thật (không chỉ "chưa có dòng").
    expect((await tao(TOKEN_CHU, { project_id: 'pj-SAI', tieu_de: 'Có trước' })).status).toBe(201);
    const truoc_ticket = await soTicket();
    const truoc_dem = await boDem('pj-SAI');
    expect(truoc_dem).toBe(1);

    const res = await tao(TOKEN_CHU, { project_id: 'pj-SAI', tieu_de: 'Sai trạng thái', trang_thai: gia_tri });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'INVALID_INPUT', message: LOI_TRANG_THAI_KHI_TAO });

    expect(await soTicket()).toBe(truoc_ticket);
    expect(await boDem('pj-SAI')).toBe(truoc_dem);
  });

  it('agent cũng bị chặn như chủ: manager gửi `in_progress` ⇒ 422, không ghi', async () => {
    const res = await tao(TOKEN_QL, { project_id: 'pj-SAI', tieu_de: 'Đang làm luôn', trang_thai: 'in_progress' });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
    expect(await soTicket()).toBe(0);
    expect(await boDem('pj-SAI')).toBeNull();
  });

  it('quyền KHÔNG đổi: worker không có `create_ticket` (không phải con của lượt mình) vẫn 403 dù gửi backlog', async () => {
    // Đối chứng: không gửi trạng thái cũng 403 — trạng thái không mở/đóng quyền nào.
    for (const than of [
      { project_id: 'pj-SAI', tieu_de: 'W tạo' },
      { project_id: 'pj-SAI', tieu_de: 'W tạo', trang_thai: 'backlog' },
    ]) {
      const res = await tao(TOKEN_WORKER, than);
      expect(res.status, JSON.stringify(than)).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    }
    expect(await soTicket()).toBe(0);
  });

  it('dự án `paused`: agent gửi backlog vẫn 409 PROJECT_NOT_ACCEPTING; chủ tạo vào Backlog được', async () => {
    const ag = await tao(TOKEN_COORD, { project_id: 'pj-PAU', tieu_de: 'Để sau', trang_thai: 'backlog' });
    expect(ag.status).toBe(409);
    expect(await ag.json()).toMatchObject({ error: 'PROJECT_NOT_ACCEPTING' });
    expect(await soTicket()).toBe(0);

    const chu = await tao(TOKEN_CHU, { project_id: 'pj-PAU', tieu_de: 'Chủ để sau', trang_thai: 'backlog' });
    expect(chu.status).toBe(201);
    expect((await chu.json<{ trang_thai: string }>()).trang_thai).toBe('backlog');
  });

  it('dự án `archived`: chủ gửi backlog vẫn 409 PROJECT_NOT_ACCEPTING (chỉ đọc), 0 ticket, bộ đếm không đổi', async () => {
    await dungDuAn('ARC', 'Đã lưu trữ', 'archived');
    const res = await tao(TOKEN_CHU, { project_id: 'pj-ARC', tieu_de: 'Vào kho cũ', trang_thai: 'backlog' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'PROJECT_NOT_ACCEPTING',
      message: 'Dự án ARC đã lưu trữ, chỉ đọc.',
    });
    expect(await soTicket()).toBe(0);
    expect(await boDem('pj-ARC')).toBeNull();
  });
});
