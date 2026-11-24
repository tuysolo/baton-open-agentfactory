/**
 * **Xuất toàn bộ dữ liệu ra JSON** — SPEC mục 15 d.429 ("xuất toàn bộ dữ liệu ra
 * JSON bằng một nút (**chỉ chủ**)"), d.416 (agent không dùng đường của chủ), d.417
 * (bí mật phía server không bao giờ ra API). BAT-8.
 *
 * Mọi ca đi đường HTTP thật (`SELF` → Worker → D1). Mật khẩu, token, secret ở đây
 * là **giả**, chỉ sống trong Miniflare (danh sách cấm `CLAUDE.md` mục 2, 5).
 */

import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { bamIdPhien, bamToken, maTotp, type VaiTroAgent } from '@baton/shared';
import {
  TOKEN_CHU,
  WS,
  WS_KHAC,
  dungAgentCoToken,
  dungBinhLuan,
  dungCanChu,
  dungDuAn,
  dungNhatKy,
  dungTicket,
  dungTicketWorkspaceKhac,
  dungWorkspace,
  goiApi,
} from './giup.js';
import {
  BANG_LOAI_TRU,
  BANG_XUAT,
  COT_LOAI_TRU,
  DONG_MOI_TRANG,
  MIGRATION_CUOI,
  PHIEN_BAN_DINH_DANG,
  TIEN_TO_BANG_HE_THONG,
  type BanXuat,
} from '../src/xuat-du-lieu.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const MAT_KHAU = 'mat-khau-gia-cua-chu-xuat-2026';
const TOKEN_AG: Record<VaiTroAgent, string> = {
  coordinator: 'bt_token_gia_XUAT_coordinator_q1',
  manager: 'bt_token_gia_XUAT_manager_q2',
  worker: 'bt_token_gia_XUAT_worker_q3',
  reviewer: 'bt_token_gia_XUAT_reviewer_q4',
};

let PJ = '';
let TK = '';

beforeEach(async () => {
  await dungWorkspace();
  PJ = await dungDuAn('SAI', 'Sample');
  for (const vai_tro of Object.keys(TOKEN_AG) as VaiTroAgent[]) {
    await dungAgentCoToken({
      id: `ag-${vai_tro}`,
      ten: `A-${vai_tro}`,
      vai_tro,
      token: TOKEN_AG[vai_tro],
      vao_tat_ca_du_an: true,
    });
  }
  TK = await dungTicket(PJ, 1, 'Việc để xuất');
  await dungBinhLuan('cm-1', TK, 'Bình luận để xuất');
  await dungNhatKy('nk-1', { quyet_dinh: 'Quyết định để xuất' });
  await dungCanChu('ct-1', { tieu_de: 'Mục Cần Chủ để xuất', project_id: PJ });
});

/** Tên bảng thật trong DB sau migration, bỏ bảng hệ thống. */
async function bangThat(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  ).all<{ name: string }>();
  return results
    .map((r) => r.name)
    .filter((t) => !TIEN_TO_BANG_HE_THONG.some((tien_to) => t.startsWith(tien_to)));
}

async function cotThat(bang: string): Promise<string[]> {
  const { results } = await env.DB.prepare(`PRAGMA table_info(${bang})`).all<{ name: string }>();
  return results.map((r) => r.name).sort();
}

async function xuatBangTokenChu(): Promise<{ res: Response; ban: BanXuat; van: string }> {
  const res = await goiApi('/v1/xuat', TOKEN_CHU);
  const van = await res.text();
  return { res, ban: JSON.parse(van) as BanXuat, van };
}

/* ================================================================== *
 * A. Danh sách trắng khớp lược đồ thật
 * ================================================================== */

describe('BAT-8 — danh sách trắng bảng/cột khớp lược đồ sau migration', () => {
  it('mọi bảng thật = (bảng xuất) ∪ (bảng CỐ Ý loại) — bảng mới chưa quyết là ĐỎ', async () => {
    const that = await bangThat();
    const da_quyet = [...Object.keys(BANG_XUAT), ...Object.keys(BANG_LOAI_TRU)].sort();
    expect(that).toEqual(da_quyet);
    // Không bảng nào vừa xuất vừa loại.
    expect(Object.keys(BANG_XUAT).filter((t) => t in BANG_LOAI_TRU)).toEqual([]);
  });

  it('mọi cột thật của bảng xuất = (cột xuất) ∪ (cột CỐ Ý loại) — cột mới chưa quyết là ĐỎ', async () => {
    const lech: string[] = [];
    for (const [bang, cot] of Object.entries(BANG_XUAT)) {
      const loai_tru = Object.keys(COT_LOAI_TRU[bang] ?? {});
      const da_quyet = [...cot, ...loai_tru].sort();
      const that = await cotThat(bang);
      if (JSON.stringify(that) !== JSON.stringify(da_quyet)) {
        lech.push(`${bang}: thật [${that.join(',')}] ≠ đã quyết [${da_quyet.join(',')}]`);
      }
      if (cot.some((c) => loai_tru.includes(c))) lech.push(`${bang}: một cột vừa xuất vừa loại`);
    }
    expect(lech).toEqual([]);
  });

  it('MIGRATION_CUOI là đúng file migration cuối thật — thêm 0026 mà không xem lại là ĐỎ', () => {
    const ten = env.TEST_VAN_BAN_MIGRATION.map((m) => m.ten).sort();
    expect(`${MIGRATION_CUOI}.sql`).toBe(ten[ten.length - 1]);
  });

  it('không cột nào được xuất có tên dạng bí mật (mat_khau*, totp*, token*, bam*, muoi*)', () => {
    const nghi = Object.entries(BANG_XUAT).flatMap(([bang, cot]) =>
      cot.filter((c) => /^(mat_khau|totp|token|bam|muoi)/.test(c)).map((c) => `${bang}.${c}`),
    );
    expect(nghi).toEqual([]);
  });
});

/* ================================================================== *
 * B. Chỉ chủ — d.429, d.416
 * ================================================================== */

describe('mục 15 d.429 — GET /v1/xuat: chỉ chủ', () => {
  it('agent MỌI vai trò (kể cả coordinator) → 403 FORBIDDEN, không lộ dữ liệu', async () => {
    for (const vai_tro of Object.keys(TOKEN_AG) as VaiTroAgent[]) {
      const res = await goiApi('/v1/xuat', TOKEN_AG[vai_tro]);
      expect([vai_tro, res.status]).toEqual([vai_tro, 403]);
      const than = await res.json<{ error: string }>();
      expect(than.error).toBe('FORBIDDEN');
      expect(JSON.stringify(than)).not.toContain('Việc để xuất');
    }
  });

  it('không token → 401', async () => {
    const res = await SELF.fetch('https://baton.test/v1/xuat');
    expect(res.status).toBe(401);
  });

  it('chủ (TOKEN_CHU) → 200, file tải về, đủ khoá đỉnh và đủ các bảng nghiệp vụ', async () => {
    const truoc = Date.now();
    const { res, ban } = await xuatBangTokenChu();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="baton-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(res.headers.get('cache-control')).toBe('no-store');

    expect(ban.schema_version).toBe(PHIEN_BAN_DINH_DANG);
    expect(ban.migration_cuoi).toBe(MIGRATION_CUOI);
    expect(ban.workspace_id).toBe(WS);
    expect(ban.xuat_luc_ms).toBeGreaterThanOrEqual(truoc);
    expect(new Date(ban.xuat_luc).getTime()).toBe(ban.xuat_luc_ms);
    // Đủ các bảng, đúng thứ tự của danh sách trắng.
    expect(Object.keys(ban.bang)).toEqual(Object.keys(BANG_XUAT));
  });

  it('chủ → bản xuất có đúng dữ liệu đã gieo, chỉ các cột của danh sách trắng', async () => {
    const { ban } = await xuatBangTokenChu();
    expect(ban.bang['workspace']).toEqual([
      expect.objectContaining({ id: WS, ten_chu: 'Chủ' }),
    ]);
    expect(ban.bang['project']?.map((p) => p['ma'])).toEqual(['SAI']);
    expect(ban.bang['agent']).toHaveLength(4);
    expect(ban.bang['ticket']?.[0]).toMatchObject({ id: TK, tieu_de: 'Việc để xuất', so: 1 });
    expect(ban.bang['comment']?.[0]).toMatchObject({ id: 'cm-1', noi_dung: 'Bình luận để xuất' });
    expect(ban.bang['nhat_ky']?.[0]).toMatchObject({ id: 'nk-1', quyet_dinh: 'Quyết định để xuất' });
    expect(ban.bang['can_chu']?.[0]).toMatchObject({ id: 'ct-1', tieu_de: 'Mục Cần Chủ để xuất' });
    // Bộ đếm số ticket + T-số: thiếu nó thì khôi phục sẽ cấp lại số đã dùng.
    expect(ban.bang['bo_dem']).toEqual([
      { workspace_id: WS, pham_vi: 'project', khoa: PJ, gia_tri: 1 },
      { workspace_id: WS, pham_vi: 'workspace', khoa: 'ask', gia_tri: 1 },
    ]);
    // Mỗi dòng mang **đúng** các cột của danh sách trắng — không thừa (kể cả `rowid`).
    for (const [bang, dong] of Object.entries(ban.bang)) {
      for (const d of dong) expect([bang, Object.keys(d)]).toEqual([bang, BANG_XUAT[bang]]);
    }
  });

  it('đọc theo trang: hơn một trang dòng vẫn ra đủ, không trùng', async () => {
    const t = Date.now();
    const so = DONG_MOI_TRANG + 7;
    const lenh = Array.from({ length: so }, (_, i) =>
      env.DB.prepare(
        'INSERT INTO ticket_label (workspace_id, ticket_id, nhan, tao_luc) VALUES (?, ?, ?, ?)',
      ).bind(WS, TK, `nhan-${String(i).padStart(4, '0')}`, t),
    );
    await env.DB.batch(lenh);
    const { ban } = await xuatBangTokenChu();
    const nhan = (ban.bang['ticket_label'] ?? []).map((d) => d['nhan']);
    expect(nhan).toHaveLength(so);
    expect(new Set(nhan).size).toBe(so);
  });

  it('không lẫn workspace: dữ liệu của workspace khác KHÔNG có trong bản xuất', async () => {
    const tk_khac = await dungTicketWorkspaceKhac();
    const { van, ban } = await xuatBangTokenChu();
    expect(ban.workspace_id).toBe(WS);
    expect(van).not.toContain(tk_khac);
    expect(van).not.toContain(WS_KHAC);
    expect(van).not.toContain('Việc của workspace khác');
  });
});

/* ================================================================== *
 * C. Không lộ bí mật — d.417
 * ================================================================== */

function secretTuUri(uri: string): string {
  const s = new URL(uri.replace('otpauth://', 'https://')).searchParams.get('secret');
  if (s === null) throw new Error('URI otpauth không có secret');
  return s;
}

/** Mọi khoá của một giá trị JSON, đệ quy. */
function moiKhoa(x: unknown, ra: string[] = []): string[] {
  if (Array.isArray(x)) {
    for (const p of x) moiKhoa(p, ra);
  } else if (typeof x === 'object' && x !== null) {
    for (const [k, v] of Object.entries(x)) {
      ra.push(k);
      moiKhoa(v, ra);
    }
  }
  return ra;
}

describe('mục 15 d.417 — bản xuất KHÔNG mang bí mật nào', () => {
  it('chủ có mật khẩu + TOTP, đăng nhập bằng cookie, agent có token: quét TOÀN chuỗi JSON', async () => {
    // Tài khoản chủ thật (mật khẩu + TOTP) qua đường thật.
    const tl = await goiApi('/v1/chu/thiet-lap', TOKEN_CHU, {
      method: 'POST',
      than: { mat_khau: MAT_KHAU, ten: 'Chủ' },
    });
    expect(tl.status).toBe(201);
    const secret = secretTuUri((await tl.json<{ otpauth: string }>()).otpauth);

    const dn = await SELF.fetch('https://baton.test/v1/dang-nhap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mat_khau: MAT_KHAU, ma_totp: await maTotp(secret, Date.now()) }),
    });
    expect(dn.status).toBe(200);
    const cookie = /baton_phien=([^;]*)/.exec(dn.headers.get('set-cookie') ?? '');
    expect(cookie).not.toBeNull();
    const id_phien = cookie?.[1] ?? '';

    // Chủ xuất bằng **cookie phiên** — đường của nút trên web.
    const res = await SELF.fetch('https://baton.test/v1/xuat', {
      headers: { cookie: cookie?.[0] ?? '' },
    });
    expect(res.status).toBe(200);
    const van = await res.text();

    const tk = await env.DB.prepare(
      'SELECT mat_khau_bam, muoi, totp_secret FROM chu_tai_khoan WHERE workspace_id = ?',
    )
      .bind(WS)
      .first<{ mat_khau_bam: string; muoi: string; totp_secret: string }>();
    expect(tk).not.toBeNull();

    const bi_mat: Record<string, string> = {
      mat_khau: MAT_KHAU,
      mat_khau_bam: tk?.mat_khau_bam ?? 'x',
      muoi: tk?.muoi ?? 'x',
      totp_secret: tk?.totp_secret ?? 'x',
      totp_tu_uri: secret,
      id_phien,
      bam_phien: await bamIdPhien(id_phien),
      token_chu: TOKEN_CHU,
    };
    for (const [vai_tro, token] of Object.entries(TOKEN_AG)) {
      bi_mat[`token_${vai_tro}`] = token;
      bi_mat[`bam_token_${vai_tro}`] = await bamToken(token);
    }
    const lot = Object.entries(bi_mat)
      .filter(([, v]) => v.length >= 8 && van.includes(v))
      .map(([k]) => k);
    expect(lot).toEqual([]);

    // Không một khoá nào mang tên dạng bí mật, ở bất kỳ độ sâu nào.
    const khoa_nghi = moiKhoa(JSON.parse(van)).filter((k) =>
      /^(mat_khau|totp|token|bam|muoi)/.test(k),
    );
    expect(khoa_nghi).toEqual([]);
    // Hai bảng của chủ không có mặt.
    const ban = JSON.parse(van) as BanXuat;
    expect(Object.keys(ban.bang)).not.toContain('chu_tai_khoan');
    expect(Object.keys(ban.bang)).not.toContain('chu_phien');
  });
});
