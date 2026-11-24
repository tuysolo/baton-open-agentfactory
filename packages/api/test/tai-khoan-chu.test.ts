/**
 * **Quản trị tài khoản chủ** — BAT-11 việc 2, qua HTTP thật:
 *   * `GET  /v1/chu/phien-dang-nhap` — các phiên đang mở;
 *   * `POST /v1/dang-xuat-moi-noi`   — (đường sẵn có) đăng xuất mọi nơi;
 *   * `POST /v1/chu/doi-mat-khau`     — đổi mật khẩu, đủ hai lớp;
 *   * ghi `dung_cuoi_luc` theo nhịp 1 giờ (`cham-phien-chu.ts`).
 *
 * SPEC mục 15: d.425 (mật khẩu + TOTP, phiên 30 ngày, đăng xuất mọi nơi), d.426
 * (agent không đăng nhập web), d.427 (bí mật không ra API/UI), d.428 (dấu vết);
 * `cau-hoi-spec.md` #98 (hạn mức thử sai — bộ đếm DÙNG CHUNG với đăng nhập).
 *
 * Mọi mật khẩu/secret ở đây là **giả**, chỉ sống trong Miniflare.
 *
 * ## Bước TOTP: mỗi bước chỉ tiêu được MỘT lần
 *
 * Đăng nhập và đổi mật khẩu **cùng** nhích `totp_buoc_cuoi`, và cửa sổ chỉ là ±1
 * bước quanh hiện tại — tức tối đa ba lần thành công liên tiếp trong một ca. Nên
 * ca nào cần "một phiên KHÁC" thì chèn phiên đó **bằng SQL thô** (đúng CHECK và
 * trigger của 0017, nếp `dang-nhap-chu.test.ts`), không tiêu thêm bước nào.
 */

import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { Hono } from 'hono';
import {
  BatonError,
  COOKIE_PHIEN_CHU,
  PHIEN_CHU_MS,
  bamIdPhien,
  buocTotp,
  maTotpCuaBuoc,
  sinhIdPhien,
} from '@baton/shared';
import {
  NGUONG_KHOA_SAI,
  NHIP_GHI_DUNG_CUOI_MS,
  canGhiDungCuoi,
  nhanThietBi,
  soVongHienHanh,
} from '../src/chu-dang-nhap.js';
import { chamPhienChuTheoNhip } from '../src/cham-phien-chu.js';
import { goiDoiMatKhauChu } from '../src/workspace-gate.js';
import type { Env } from '../src/moi-truong.js';
import type { MoiTruongHono } from '../src/xac-thuc.js';
import { caQuaSo, choBuocTotpConDu, soRequestBay } from './cho-toi.js';
import { TOKEN_CHU, WS, dungAgentCoToken, dungDuAn, dungWorkspace, goiApi } from './giup.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const MAT_KHAU = 'mat-khau-gia-cua-chu-2026';
const MAT_KHAU_MOI = 'mat-khau-moi-gia-cua-chu-2027';
const TOKEN_AGENT = 'bt_token_gia_cua_coordinator';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function goi(
  duong: string,
  tc: { method?: string; than?: unknown; cookie?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (tc.than !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(tc.than);
  }
  if (tc.cookie !== undefined) headers['cookie'] = tc.cookie;
  return SELF.fetch(`https://baton.test${duong}`, {
    method: tc.method ?? 'GET',
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

function secretTuUri(uri: string): string {
  const s = new URL(uri.replace('otpauth://', 'https://')).searchParams.get('secret');
  if (s === null) throw new Error('URI otpauth không có secret');
  return s;
}

async function dungNen(): Promise<void> {
  await dungWorkspace();
  const p1 = await dungDuAn('SAI', 'Sample');
  await dungAgentCoToken({
    id: 'ag-coord',
    ten: 'CoS',
    vai_tro: 'coordinator',
    token: TOKEN_AGENT,
    vao_tat_ca_du_an: true,
    du_an: [p1],
  });
}

async function thietLap(): Promise<string> {
  const res = await goiApi('/v1/chu/thiet-lap', TOKEN_CHU, {
    method: 'POST',
    than: { mat_khau: MAT_KHAU, ten: 'Chủ' },
  });
  expect(res.status).toBe(201);
  return secretTuUri((await res.json<{ otpauth: string }>()).otpauth);
}

/** Đăng nhập bằng mã của **đúng một bước**; trả response và cookie. */
async function dangNhap(
  secret: string,
  buoc: number,
  mat_khau = MAT_KHAU,
): Promise<{ res: Response; cookie: string | null }> {
  const res = await SELF.fetch('https://baton.test/v1/dang-nhap', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ mat_khau, ma_totp: await maTotpCuaBuoc(secret, buoc) }),
  });
  const set = res.headers.get('set-cookie');
  return { res, cookie: set === null ? null : (/baton_phien=([^;]*)/.exec(set)?.[0] ?? null) };
}

/** Chèn một phiên **thô** (không tiêu bước TOTP). Trả cookie và băm. */
async function chenPhien(tc: {
  tao: number;
  huy?: number | null;
  dung_cuoi?: number | null;
  ua?: string | null;
}): Promise<{ cookie: string; bam: string; id: string }> {
  const id = sinhIdPhien();
  const bam = await bamIdPhien(id);
  await env.DB.prepare(
    `INSERT INTO chu_phien (bam, workspace_id, tao_luc, het_luc, huy_luc, dung_cuoi_luc, tao_tu_ua)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      bam,
      WS,
      tc.tao,
      tc.tao + PHIEN_CHU_MS,
      tc.huy ?? null,
      tc.dung_cuoi === undefined ? tc.tao : tc.dung_cuoi,
      tc.ua ?? null,
    )
    .run();
  return { cookie: `${COOKIE_PHIEN_CHU}=${id}`, bam, id };
}

function doiMatKhau(
  cookie: string,
  than: { mat_khau_cu?: unknown; ma_totp?: unknown; mat_khau_moi?: unknown },
): Promise<Response> {
  return goi('/v1/chu/doi-mat-khau', { method: 'POST', cookie, than });
}

interface DongTk {
  mat_khau_bam: string;
  muoi: string;
  so_vong: number;
  totp_secret: string;
  totp_buoc_cuoi: number | null;
  so_lan_sai: number;
  khoa_den_luc: number | null;
}

async function taiKhoan(): Promise<DongTk> {
  const d = await env.DB.prepare(
    `SELECT mat_khau_bam, muoi, so_vong, totp_secret, totp_buoc_cuoi, so_lan_sai, khoa_den_luc
       FROM chu_tai_khoan WHERE workspace_id = ?`,
  )
    .bind(WS)
    .first<DongTk>();
  if (d === null) throw new Error('chưa có tài khoản');
  return d;
}

async function songKhong(cookie: string): Promise<number> {
  return (await goi('/v1/toi', { cookie })).status;
}

/* ================================================================== *
 * (C) Đổi mật khẩu
 * ================================================================== */

describe('POST /v1/chu/doi-mat-khau — hai lớp, một thông điệp lỗi', () => {
  beforeEach(dungNen);
  // Đăng nhập bằng mã bước `g - 1`: mốc bước không được nhảy giữa ca (BAT-51).
  beforeEach(() => choBuocTotpConDu());

  it('ca 1: mật khẩu CŨ sai → 401 INVALID_TOKEN (đúng thân của đăng nhập sai); mật khẩu không đổi', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie } = await dangNhap(secret, g - 1);
    const truoc = await taiKhoan();

    const res = await doiMatKhau(cookie!, {
      mat_khau_cu: 'mat-khau-cu-sai-hoan-toan',
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: MAT_KHAU_MOI,
    });
    expect(res.status).toBe(401);
    const than = await res.json();
    // Đúng thân lỗi mà `/v1/dang-nhap` trả khi sai — không một câu riêng.
    const sai_dn = await (await dangNhap(secret, g, 'mot-mat-khau-sai-khac')).res.json();
    expect(than).toEqual(sai_dn);
    expect(than).toMatchObject({ error: 'INVALID_TOKEN' });

    const sau = await taiKhoan();
    expect([sau.mat_khau_bam, sau.muoi]).toEqual([truoc.mat_khau_bam, truoc.muoi]);
    // Mật khẩu CŨ vẫn đăng nhập được (bước g chưa bị tiêu: hai lần trên đều sai).
    expect((await dangNhap(secret, g)).res.status).toBe(200);
    // Phiên đang gọi không bị đụng.
    expect(await songKhong(cookie!)).toBe(200);
  });

  it('ca 2: mã TOTP sai → CÙNG mã HTTP, CÙNG thân lỗi với ca mật khẩu sai', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie } = await dangNhap(secret, g - 1);

    const sai_mk = await doiMatKhau(cookie!, {
      mat_khau_cu: 'mat-khau-cu-sai-hoan-toan',
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: MAT_KHAU_MOI,
    });
    const sai_ma = await doiMatKhau(cookie!, {
      mat_khau_cu: MAT_KHAU,
      // Bước g−1 đã tiêu ở lần đăng nhập trên: mã đúng hình, nhưng là mã dùng lại.
      ma_totp: await maTotpCuaBuoc(secret, g - 1),
      mat_khau_moi: MAT_KHAU_MOI,
    });
    const sai_hinh = await doiMatKhau(cookie!, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: 'abc',
      mat_khau_moi: MAT_KHAU_MOI,
    });

    expect([sai_mk.status, sai_ma.status, sai_hinh.status]).toEqual([401, 401, 401]);
    const [a, b, c] = [await sai_mk.text(), await sai_ma.text(), await sai_hinh.text()];
    expect(b).toBe(a);
    expect(c).toBe(a);
    // Không vọng lại gì của thân request.
    expect(a).not.toContain(MAT_KHAU);
    expect(a).not.toContain(MAT_KHAU_MOI);
    expect((await taiKhoan()).mat_khau_bam).not.toBe('');
  });

  it('ca 3: đổi thành công → phiên KHÁC 401, phiên hiện tại 200; mật khẩu cũ hỏng, mới vào được; so_vong = soVongHienHanh', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie: hien_tai } = await dangNhap(secret, g - 1);
    const khac = await chenPhien({ tao: Date.now() - 60_000 });
    expect(await songKhong(khac.cookie)).toBe(200);
    const truoc = await taiKhoan();

    const res = await doiMatKhau(hien_tai!, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: MAT_KHAU_MOI,
    });
    expect(res.status).toBe(200);
    const chu = await res.text();
    expect(JSON.parse(chu)).toMatchObject({ so_phien_khac_da_huy: 1 });
    expect(chu).not.toContain(MAT_KHAU);
    expect(chu).not.toContain(MAT_KHAU_MOI);

    expect(await songKhong(khac.cookie)).toBe(401);
    expect(await songKhong(hien_tai!)).toBe(200);

    const sau = await taiKhoan();
    expect(sau.so_vong).toBe(soVongHienHanh(env as unknown as Env));
    // Muối MỚI, băm mới; mốc TOTP nhích tới bước vừa dùng (chống dùng lại).
    expect(sau.muoi).not.toBe(truoc.muoi);
    expect(sau.mat_khau_bam).not.toBe(truoc.mat_khau_bam);
    expect(sau.totp_buoc_cuoi).toBe(g);
    // Dòng phiên khác MANG mốc huỷ, không bị xoá (d.428).
    const d = await env.DB.prepare('SELECT huy_luc FROM chu_phien WHERE bam = ?')
      .bind(khac.bam)
      .first<{ huy_luc: number | null }>();
    expect(d?.huy_luc).toBeGreaterThan(0);

    // Mật khẩu CŨ: không vào được nữa. Mật khẩu MỚI: vào được.
    expect((await dangNhap(secret, g + 1, MAT_KHAU)).res.status).toBe(401);
    expect((await dangNhap(secret, g + 1, MAT_KHAU_MOI)).res.status).toBe(200);
  });

  it('mã TOTP vừa dùng để đổi KHÔNG đăng nhập lại được (chống dùng lại)', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie } = await dangNhap(secret, g - 1);
    const ma = await maTotpCuaBuoc(secret, g);
    expect(
      (await doiMatKhau(cookie!, { mat_khau_cu: MAT_KHAU, ma_totp: ma, mat_khau_moi: MAT_KHAU_MOI }))
        .status,
    ).toBe(200);
    expect((await dangNhap(secret, g, MAT_KHAU_MOI)).res.status).toBe(401);
  });

  it('ca 7: mật khẩu mới sai độ dài → 422 INVALID_INPUT, KHÔNG đổi gì (kể cả bộ đếm và mốc TOTP)', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie } = await dangNhap(secret, g - 1);
    const khac = await chenPhien({ tao: Date.now() - 60_000 });
    const truoc = await taiKhoan();

    const ra: number[] = [];
    for (const moi of ['ngan', 'x'.repeat(257), 12345, undefined]) {
      const res = await doiMatKhau(cookie!, {
        mat_khau_cu: MAT_KHAU,
        ma_totp: await maTotpCuaBuoc(secret, g),
        mat_khau_moi: moi,
      });
      ra.push(res.status);
      if (res.status === 422) {
        expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
      }
    }
    expect(ra).toEqual([422, 422, 422, 422]);
    expect(await taiKhoan()).toEqual(truoc);
    expect(await songKhong(khac.cookie)).toBe(200);
    // Mã của bước g chưa bị tiêu: chủ dùng lại ngay được với mật khẩu mới hợp lệ.
    expect(
      (
        await doiMatKhau(cookie!, {
          mat_khau_cu: MAT_KHAU,
          ma_totp: await maTotpCuaBuoc(secret, g),
          mat_khau_moi: MAT_KHAU_MOI,
        })
      ).status,
    ).toBe(200);
  });

  it('mật khẩu mới TRÙNG mật khẩu cũ (#148, CoS chốt 17/10) → 422 INVALID_INPUT, mật khẩu KHÔNG đổi, không phiên nào bị huỷ', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie } = await dangNhap(secret, g - 1);
    const khac = await chenPhien({ tao: Date.now() - 60_000 });
    const truoc = await taiKhoan();
    const res = await doiMatKhau(cookie!, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: MAT_KHAU,
    });
    expect(res.status).toBe(422);
    const than = await res.json<{ error: string; message: string }>();
    expect(than.error).toBe('INVALID_INPUT');
    expect(than.message).toBe('Mật khẩu mới phải khác mật khẩu hiện tại.');
    // Mật khẩu (băm, muối, số vòng), secret TOTP nguyên; phiên khác còn sống.
    // BAT-17: đã qua hai lớp ⇒ bước TOTP g bị TIÊU, bộ đếm về 0 (vốn đã 0).
    expect(await taiKhoan()).toEqual({ ...truoc, totp_buoc_cuoi: g, so_lan_sai: 0, khoa_den_luc: null });
    expect(await songKhong(khac.cookie)).toBe(200);
    expect(await songKhong(cookie!)).toBe(200);
    // Mã của bước g ĐÃ tiêu: dùng lại (dù với mật khẩu mới khác) bị từ chối…
    const lai = await doiMatKhau(cookie!, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: MAT_KHAU_MOI,
    });
    expect(lai.status).toBe(401);
    // …mã của bước sau thì qua.
    const ok = await doiMatKhau(cookie!, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g + 1),
      mat_khau_moi: MAT_KHAU_MOI,
    });
    expect(ok.status).toBe(200);
  });
});

describe('POST /v1/chu/doi-mat-khau — chỉ chủ qua COOKIE phiên', () => {
  beforeEach(dungNen);
  beforeEach(() => choBuocTotpConDu());

  it('ca 5b: TOKEN_CHU không cookie → 403 FORBIDDEN, mật khẩu không đổi', async () => {
    const secret = await thietLap();
    const truoc = await taiKhoan();
    const res = await goiApi('/v1/chu/doi-mat-khau', TOKEN_CHU, {
      method: 'POST',
      than: {
        mat_khau_cu: MAT_KHAU,
        ma_totp: await maTotpCuaBuoc(secret, buocTotp(Date.now())),
        mat_khau_moi: MAT_KHAU_MOI,
      },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(await taiKhoan()).toEqual(truoc);
  });

  it('cookie CHẾT + TOKEN_CHU → vẫn 403 (rơi xuống nhánh token không mở đường này)', async () => {
    const secret = await thietLap();
    // Một mốc chung cho tạo và huỷ (BAT-51): CHECK `huy_luc >= tao_luc` của 0017.
    const t = Date.now();
    const chet = await chenPhien({ tao: t - 60_000, huy: t - 30_000 });
    const res = await SELF.fetch('https://baton.test/v1/chu/doi-mat-khau', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${TOKEN_CHU}`,
        cookie: chet.cookie,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        mat_khau_cu: MAT_KHAU,
        ma_totp: await maTotpCuaBuoc(secret, buocTotp(Date.now())),
        mat_khau_moi: MAT_KHAU_MOI,
      }),
    });
    expect(res.status).toBe(403);
  });

  it('ca 5: token AGENT gọi cả ba đường (GET phiên, đăng xuất mọi nơi, đổi mật khẩu) → 403', async () => {
    const secret = await thietLap();
    const truoc = await taiKhoan();
    const { cookie } = await dangNhap(secret, buocTotp(Date.now()) - 1);

    const ra = [
      (await goiApi('/v1/chu/phien-dang-nhap', TOKEN_AGENT)).status,
      (await goiApi('/v1/dang-xuat-moi-noi', TOKEN_AGENT, { method: 'POST' })).status,
      (
        await goiApi('/v1/chu/doi-mat-khau', TOKEN_AGENT, {
          method: 'POST',
          than: { mat_khau_cu: MAT_KHAU, ma_totp: '123456', mat_khau_moi: MAT_KHAU_MOI },
        })
      ).status,
    ];
    expect(ra).toEqual([403, 403, 403]);
    // Không gì đổi: phiên của chủ còn sống, bộ đếm không nhích.
    expect(await songKhong(cookie!)).toBe(200);
    expect((await taiKhoan()).mat_khau_bam).toBe(truoc.mat_khau_bam);
    expect((await taiKhoan()).so_lan_sai).toBe(0);
  });
});

describe('POST /v1/chu/doi-mat-khau — hạn mức DÙNG CHUNG với đăng nhập (#98)', () => {
  beforeEach(dungNen);
  beforeEach(() => choBuocTotpConDu());

  async function saiDoi(cookie: string, ma: string): Promise<number> {
    return (
      await doiMatKhau(cookie, {
        mat_khau_cu: 'mat-khau-cu-sai-hoan-toan',
        ma_totp: ma,
        mat_khau_moi: MAT_KHAU_MOI,
      })
    ).status;
  }

  it(`sai quá ${String(NGUONG_KHOA_SAI)} lần → 429 kèm Retry-After; ĐÚNG lúc đang khoá vẫn 429, không đổi gì`, async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie } = await dangNhap(secret, g - 1);
    const ma_dung = await maTotpCuaBuoc(secret, g);

    const ra: number[] = [];
    for (let i = 0; i <= NGUONG_KHOA_SAI; i += 1) ra.push(await saiDoi(cookie!, ma_dung));
    expect(ra).toEqual(Array.from({ length: NGUONG_KHOA_SAI + 1 }, () => 401));
    const truoc = await taiKhoan();
    expect(truoc.so_lan_sai).toBe(NGUONG_KHOA_SAI + 1);
    expect(truoc.khoa_den_luc).toBeGreaterThan(Date.now());

    const dung = await doiMatKhau(cookie!, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: ma_dung,
      mat_khau_moi: MAT_KHAU_MOI,
    });
    expect(dung.status).toBe(429);
    const giay = Number(dung.headers.get('retry-after'));
    expect(giay).toBeGreaterThan(0);
    const than = await dung.json<{ error: string; message: string }>();
    expect(than.error).toBe('RATE_LIMITED');
    // Câu nói được BAO LÂU — giao diện in thẳng câu này.
    expect(than.message).toContain(`${String(giay)} giây`);
    expect(await taiKhoan()).toEqual(truoc);
  });

  it('sai ở ĐỔI MẬT KHẨU làm ĐĂNG NHẬP bị khoá', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie } = await dangNhap(secret, g - 1);
    for (let i = 0; i <= NGUONG_KHOA_SAI; i += 1) await saiDoi(cookie!, '000000');
    const dn = await dangNhap(secret, g);
    expect(dn.res.status).toBe(429);
    expect(Number(dn.res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(dn.cookie).toBeNull();
  });

  it('sai ở ĐĂNG NHẬP làm ĐỔI MẬT KHẨU bị khoá', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie } = await dangNhap(secret, g - 1);
    for (let i = 0; i <= NGUONG_KHOA_SAI; i += 1) {
      await dangNhap(secret, g, 'mat-khau-dang-nhap-sai');
    }
    const truoc = await taiKhoan();
    const res = await doiMatKhau(cookie!, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: MAT_KHAU_MOI,
    });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await taiKhoan()).toEqual(truoc);
  });

  it('đổi ĐÚNG đặt bộ đếm về 0 và bỏ khoá; sai ở đổi cũng nhích ĐÚNG bộ đếm của tài khoản', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie } = await dangNhap(secret, g - 1);
    // Trộn: 2 lần sai ở đăng nhập + 2 lần sai ở đổi = 4 trên CÙNG một bộ đếm.
    await dangNhap(secret, g, 'mat-khau-dang-nhap-sai');
    await dangNhap(secret, g, 'mat-khau-dang-nhap-sai');
    await saiDoi(cookie!, '000000');
    await saiDoi(cookie!, '000000');
    expect((await taiKhoan()).so_lan_sai).toBe(4);

    const res = await doiMatKhau(cookie!, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: MAT_KHAU_MOI,
    });
    expect(res.status).toBe(200);
    const sau = await taiKhoan();
    expect(sau.so_lan_sai).toBe(0);
    expect(sau.khoa_den_luc).toBeNull();
  });
});

/* ================================================================== *
 * (B) Đăng xuất mọi nơi — đường sẵn có, ghim lại cho màn hình Cài đặt
 * ================================================================== */

describe('POST /v1/dang-xuat-moi-noi — mọi cookie cũ chết, kể cả cookie đã gọi', () => {
  beforeEach(dungNen);

  it('ca 4: ba phiên (một đăng nhập thật, hai chèn) → sau lệnh cả ba 401', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret, buocTotp(Date.now()));
    const a = await chenPhien({ tao: Date.now() - 120_000 });
    const b = await chenPhien({ tao: Date.now() - 60_000 });
    const tat_ca = [cookie!, a.cookie, b.cookie];
    const truoc: number[] = [];
    for (const c of tat_ca) truoc.push(await songKhong(c));
    expect(truoc).toEqual([200, 200, 200]);

    const res = await goi('/v1/dang-xuat-moi-noi', { method: 'POST', cookie: cookie! });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ moi_noi: true, so_phien_da_huy: 3 });

    const sau: number[] = [];
    for (const c of tat_ca) sau.push(await songKhong(c));
    expect(sau).toEqual([401, 401, 401]);
  });
});

describe('đổi mật khẩu từ một phiên ĐÃ CHẾT — 401, không đổi gì, bộ đếm không nhích', () => {
  beforeEach(dungNen);
  beforeEach(() => choBuocTotpConDu());

  const DOI_TRUOC_KHI_CHET = 'mat-khau-moi-khong-duoc-dat-2028';

  it('đăng xuất mọi nơi rồi dùng cookie CŨ đổi mật khẩu (mật khẩu + TOTP đúng) → 401; mật khẩu, bộ đếm, mốc TOTP nguyên', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const { cookie } = await dangNhap(secret, g - 1);
    expect((await goi('/v1/dang-xuat-moi-noi', { method: 'POST', cookie: cookie! })).status).toBe(200);
    const truoc = await taiKhoan();

    const res = await doiMatKhau(cookie!, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: DOI_TRUOC_KHI_CHET,
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
    expect(await taiKhoan()).toEqual(truoc);
    // Bước g chưa bị tiêu, mật khẩu cũ vẫn đúng.
    expect((await dangNhap(secret, g)).res.status).toBe(200);
  });

  /*
   * Ca trên dừng ở middleware (cookie chết bị chặn ở Worker). Ca dưới đo **đúng
   * chỗ sửa**: lệnh tới thẳng cửa ghi mang băm của một phiên đã bị huỷ / hết hạn —
   * tức thứ tự "middleware tra thấy sống → đăng xuất mọi nơi chạy trước trong hàng
   * đợi → lệnh đổi tới lượt".
   */
  it('cửa ghi: băm của phiên ĐÃ HUỶ hoặc HẾT HẠN → INVALID_TOKEN trước hai lớp; phiên sống thì qua (đối chứng)', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const bay_gio = Date.now();
    const da_huy = await chenPhien({ tao: bay_gio - 120_000, huy: bay_gio - 60_000 });
    const het_han = await chenPhien({ tao: bay_gio - PHIEN_CHU_MS - 60_000 });
    const khac = await chenPhien({ tao: bay_gio - 30_000 });
    const truoc = await taiKhoan();

    /*
     * Cả mật khẩu ĐÚNG lẫn SAI: với mật khẩu sai, chỉ lần kiểm phiên **trước**
     * `quaHaiLop` giữ bộ đếm đứng yên (điều kiện EXISTS trong batch thì không —
     * `quaHaiLop` đã ghi lần sai trước khi tới batch).
     */
    const ca = [da_huy, het_han].flatMap((p) => [
      { p, mk: MAT_KHAU },
      { p, mk: 'mat-khau-cu-sai-hoan-toan' },
    ]);
    for (const { p, mk } of ca) {
      const loi = await goiDoiMatKhauChu(env, {
        workspace_id: WS,
        bam_hien_tai: p.bam,
        mat_khau_cu: mk,
        ma_totp: await maTotpCuaBuoc(secret, g),
        mat_khau_moi: DOI_TRUOC_KHI_CHET,
      }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(loi).toBeInstanceOf(BatonError);
      expect((loi as BatonError).ma).toBe('INVALID_TOKEN');
      // Không băm, không tiêu bước TOTP, không nhích bộ đếm, không huỷ phiên nào.
      expect(await taiKhoan()).toEqual(truoc);
      expect(await songKhong(khac.cookie)).toBe(200);
    }

    // Đối chứng: cùng thân, băm của phiên SỐNG → đổi được.
    const ok = await goiDoiMatKhauChu(env, {
      workspace_id: WS,
      bam_hien_tai: khac.bam,
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: DOI_TRUOC_KHI_CHET,
    });
    // Phiên hết hạn còn `huy_luc IS NULL` nên cũng bị đánh dấu huỷ (luật sẵn có).
    expect(ok.so_phien_khac_da_huy).toBe(1);
    expect((await taiKhoan()).mat_khau_bam).not.toBe(truoc.mat_khau_bam);
  });
});

/* ================================================================== *
 * (A) Danh sách phiên
 * ================================================================== */

interface PhienRa {
  tao_luc: number;
  het_luc: number;
  dung_cuoi_luc: number | null;
  thiet_bi: string | null;
  ua: string | null;
  hien_tai: boolean;
}

describe('GET /v1/chu/phien-dang-nhap — chỉ phiên sống, cờ hien_tai, không bí mật', () => {
  beforeEach(dungNen);

  it('ca 8: chỉ phiên SỐNG; đúng MỘT phiên hien_tai; thân không có băm/muối/secret/id', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret, buocTotp(Date.now()));
    const bay_gio = Date.now();
    const khac = await chenPhien({ tao: bay_gio - 60_000, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1' });
    const da_huy = await chenPhien({ tao: bay_gio - 120_000, huy: bay_gio - 100_000 });
    const het_han = await chenPhien({ tao: bay_gio - PHIEN_CHU_MS - 60_000 });

    const res = await goi('/v1/chu/phien-dang-nhap', { cookie: cookie! });
    expect(res.status).toBe(200);
    const chu = await res.text();
    const { items } = JSON.parse(chu) as { items: PhienRa[] };

    expect(items).toHaveLength(2);
    expect(items.filter((p) => p.hien_tai)).toHaveLength(1);
    const ht = items.find((p) => p.hien_tai)!;
    expect(ht.thiet_bi).toBe('Chrome · macOS');
    expect(ht.ua).toBe(UA);
    expect(ht.het_luc - ht.tao_luc).toBe(PHIEN_CHU_MS);
    const kia = items.find((p) => !p.hien_tai)!;
    expect(kia.thiet_bi).toBe('Safari · iOS');
    // Mới nhất trước.
    expect(items.map((p) => p.tao_luc)).toEqual([...items.map((p) => p.tao_luc)].sort((x, y) => y - x));

    // Mỗi phần tử đúng sáu khoá — không `bam`, không id.
    for (const p of items) {
      expect(Object.keys(p).sort()).toEqual(
        ['dung_cuoi_luc', 'het_luc', 'hien_tai', 'tao_luc', 'thiet_bi', 'ua'].sort(),
      );
    }

    // Quét TOÀN THÂN: mọi chuỗi dưới đây CÓ THẬT trong dữ liệu, nên một đường trả
    // nguyên dòng ra sẽ làm ca này đỏ.
    const tk = await taiKhoan();
    const id_hien_tai = cookie!.slice(`${COOKIE_PHIEN_CHU}=`.length);
    const cam = [
      await bamIdPhien(id_hien_tai),
      id_hien_tai,
      khac.bam,
      khac.id,
      da_huy.bam,
      het_han.bam,
      tk.mat_khau_bam,
      tk.muoi,
      tk.totp_secret,
      secret,
      MAT_KHAU,
    ];
    const lo = cam.filter((s) => chu.includes(s));
    expect(lo).toEqual([]);
    for (const cot of ['"bam"', 'muoi', 'totp_secret', 'mat_khau_bam']) {
      expect(chu).not.toContain(cot);
    }
  });

  it('qua TOKEN_CHU (không cookie): đọc được, và KHÔNG phiên nào là hien_tai', async () => {
    const secret = await thietLap();
    await dangNhap(secret, buocTotp(Date.now()));
    const res = await goiApi('/v1/chu/phien-dang-nhap', TOKEN_CHU);
    expect(res.status).toBe(200);
    const { items } = await res.json<{ items: PhienRa[] }>();
    expect(items).toHaveLength(1);
    expect(items[0]?.hien_tai).toBe(false);
  });

  it('không giấy tờ → 401', async () => {
    await thietLap();
    expect((await goi('/v1/chu/phien-dang-nhap')).status).toBe(401);
  });
});

describe('nhanThietBi — rút nhãn từ User-Agent', () => {
  it('các trình duyệt/hệ phổ biến; Edge không thành Chrome, Chrome không thành Safari', () => {
    expect(nhanThietBi(UA)).toBe('Chrome · macOS');
    expect(
      nhanThietBi('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0'),
    ).toBe('Edge · Windows');
    expect(nhanThietBi('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0')).toBe(
      'Firefox · Linux',
    );
    expect(nhanThietBi('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36')).toBe(
      'Chrome · Android',
    );
    expect(nhanThietBi('Trinh-duyet-gia/1.0')).toBe('Không rõ thiết bị');
    expect(nhanThietBi(null)).toBeNull();
    expect(nhanThietBi('')).toBeNull();
  });
});

/* ================================================================== *
 * Lần dùng cuối — ghi THEO NHỊP 1 giờ
 * ================================================================== */

describe('dung_cuoi_luc — ghi theo nhịp, không mỗi request', () => {
  beforeEach(dungNen);

  async function dungCuoi(bam: string): Promise<number | null> {
    return (
      (await env.DB.prepare('SELECT dung_cuoi_luc FROM chu_phien WHERE bam = ?')
        .bind(bam)
        .first<{ dung_cuoi_luc: number | null }>())?.dung_cuoi_luc ?? null
    );
  }

  it('ca 9a: mốc cũ DƯỚI 1 giờ → request không ghi gì', async () => {
    await thietLap();
    const bay_gio = Date.now();
    const p = await chenPhien({ tao: bay_gio - 3 * 3_600_000, dung_cuoi: bay_gio - 30 * 60_000 });
    const truoc = await dungCuoi(p.bam);
    expect(await songKhong(p.cookie)).toBe(200);
    expect(await songKhong(p.cookie)).toBe(200);
    expect(await dungCuoi(p.bam)).toBe(truoc);
  });

  it('ca 9b: mốc cũ TRÊN 1 giờ → request ghi mốc mới; request kế tiếp không ghi nữa', async () => {
    await thietLap();
    const bay_gio = Date.now();
    const p = await chenPhien({ tao: bay_gio - 3 * 3_600_000, dung_cuoi: bay_gio - 2 * 3_600_000 });
    expect(await songKhong(p.cookie)).toBe(200);
    const moi = await dungCuoi(p.bam);
    expect(moi).toBeGreaterThanOrEqual(bay_gio);
    expect(await songKhong(p.cookie)).toBe(200);
    expect(await dungCuoi(p.bam)).toBe(moi);

    // Và danh sách phiên đọc được đúng mốc đó.
    const { items } = await (await goi('/v1/chu/phien-dang-nhap', { cookie: p.cookie })).json<{
      items: PhienRa[];
    }>();
    expect(items.find((x) => x.hien_tai)?.dung_cuoi_luc).toBe(moi);
  });

  it('mốc NULL → ghi ở request đầu', async () => {
    await thietLap();
    const bay_gio = Date.now();
    const p = await chenPhien({ tao: bay_gio - 60_000, dung_cuoi: null });
    expect(await songKhong(p.cookie)).toBe(200);
    expect(await dungCuoi(p.bam)).toBeGreaterThanOrEqual(bay_gio);
  });

  it('canGhiDungCuoi: biên đúng 1 giờ thì CHƯA ghi, quá 1 ms thì ghi', () => {
    expect(NHIP_GHI_DUNG_CUOI_MS).toBe(3_600_000);
    expect(canGhiDungCuoi(null, 1_000)).toBe(true);
    expect(canGhiDungCuoi(10_000_000, 10_000_000 + 3_600_000)).toBe(false);
    expect(canGhiDungCuoi(10_000_000, 10_000_000 + 3_600_001)).toBe(true);
    expect(canGhiDungCuoi(10_000_000, 10_000_000 + 60_000)).toBe(false);
  });

  it('cửa ghi HỎNG không làm hỏng request (lỗi bị nuốt, request đi tiếp)', async () => {
    const app = new Hono<MoiTruongHono>();
    app.use('*', async (c, next) => {
      c.set('workspace_id', WS);
      c.set('phien_chu', { bam: 'a'.repeat(64), dung_cuoi_luc: null, het_luc: Date.now() + 1000 });
      await next();
    });
    app.use('*', chamPhienChuTheoNhip);
    app.get('/', (c) => c.json({ ok: true }));
    const env_hong = {
      WORKSPACE_GATE: {
        idFromName: () => {
          throw new Error('cửa ghi giả lập hỏng');
        },
      },
    } as unknown as Env;
    const res = await app.request('/', {}, env_hong);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
