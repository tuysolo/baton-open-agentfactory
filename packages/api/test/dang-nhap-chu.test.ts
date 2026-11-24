/**
 * **Đường đăng nhập của chủ, qua HTTP thật** — SPEC mục 15:
 *   * d.415 mật khẩu + TOTP (2 lớp), phiên **30 ngày**, **đăng xuất mọi nơi**;
 *   * d.416 agent chỉ dùng token, **không đăng nhập web**;
 *   * d.417 bí mật phía server **không bao giờ** trả ra API hay UI (nếp của
 *     token GitHub/Telegram, áp cho băm mật khẩu, muối và secret TOTP);
 *   * d.418 mọi hành động có dấu vết ai làm.
 *
 * Mọi mật khẩu và secret ở đây là **giả**, chỉ sống trong Miniflare (danh sách
 * cấm `CLAUDE.md` mục 2, 5). Không `.env`, không mạng, không in secret.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  COOKIE_PHIEN_CHU,
  PHIEN_CHU_MS,
  bamIdPhien,
  buocTotp,
  maTotp,
  maTotpCuaBuoc,
  sinhIdPhien,
} from '@baton/shared';
import { GIOI_HAN_MOI_PHUT, type GioiHanToken } from '../src/gioi-han-token.js';
import {
  CAU_TRA_PHIEN_CHU,
  KHOA_DAU_MS,
  KHOA_TOI_DA_MS,
  NGUONG_KHOA_SAI,
  khoaBaoLauMs,
} from '../src/chu-dang-nhap.js';
import { caQuaSo, choBuocTotpConDu, soRequestBay } from './cho-toi.js';
import { TOKEN_CHU, WS, dungAgentCoToken, dungDuAn, dungWorkspace, goiApi } from './giup.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/** Mật khẩu **giả** của chủ trong test. */
const MAT_KHAU = 'mat-khau-gia-cua-chu-2026';
const TOKEN_AGENT = 'bt_token_gia_cua_coordinator';

function goi(
  duong: string,
  tuy_chon: { method?: string; than?: unknown; cookie?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...tuy_chon.headers };
  let body: string | undefined;
  if (tuy_chon.than !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(tuy_chon.than);
  }
  if (tuy_chon.cookie !== undefined) headers['cookie'] = tuy_chon.cookie;
  return SELF.fetch(`https://baton.test${duong}`, {
    method: tuy_chon.method ?? 'GET',
    headers,
    ...(body === undefined ? {} : { body }),
  });
}

/** Secret TOTP lấy ra từ URI `otpauth://` — lần duy nhất nó ra khỏi máy chủ. */
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

/** Thiết lập tài khoản chủ qua đường thật, trả secret TOTP. */
async function thietLap(mat_khau = MAT_KHAU): Promise<string> {
  const res = await goiApi('/v1/chu/thiet-lap', TOKEN_CHU, {
    method: 'POST',
    than: { mat_khau, ten: 'Chủ' },
  });
  expect(res.status).toBe(201);
  const { otpauth } = await res.json<{ otpauth: string }>();
  return secretTuUri(otpauth);
}

/** Đăng nhập qua đường thật, trả cả response và cookie. */
async function dangNhap(
  secret: string,
  tuy_chon: { mat_khau?: string; ma?: string; luc?: number } = {},
): Promise<{ res: Response; cookie: string | null }> {
  const ma = tuy_chon.ma ?? (await maTotp(secret, tuy_chon.luc ?? Date.now()));
  const res = await goi('/v1/dang-nhap', {
    method: 'POST',
    than: { mat_khau: tuy_chon.mat_khau ?? MAT_KHAU, ma_totp: ma },
    headers: { 'user-agent': 'Trinh-duyet-gia/1.0' },
  });
  const set = res.headers.get('set-cookie');
  const cookie = set === null ? null : (/baton_phien=([^;]*)/.exec(set)?.[0] ?? null);
  return { res, cookie };
}

/** Dòng tài khoản chủ **thô** trong DB. */
function taiKhoanTrongDb(): Promise<{
  mat_khau_bam: string;
  muoi: string;
  so_vong: number;
  totp_secret: string;
  totp_buoc_cuoi: number | null;
  so_lan_sai: number;
  sai_cuoi_luc: number | null;
  khoa_den_luc: number | null;
  dang_nhap_cuoi_luc: number | null;
} | null> {
  return env.DB.prepare(
    `SELECT mat_khau_bam, muoi, so_vong, totp_secret, totp_buoc_cuoi, so_lan_sai,
            sai_cuoi_luc, khoa_den_luc, dang_nhap_cuoi_luc
       FROM chu_tai_khoan WHERE workspace_id = ?`,
  )
    .bind(WS)
    .first();
}

/* ================================================================== *
 * Thiết lập lần đầu — cau-hoi-spec.md #3
 * ================================================================== */

describe('SPEC mục 15 d.415 — thiết lập tài khoản chủ lần đầu', () => {
  beforeEach(dungNen);

  it('qua TOKEN_CHU: 201, trả otpauth:// ĐÚNG MỘT LẦN, dòng tài khoản có đủ bí mật', async () => {
    const res = await goiApi('/v1/chu/thiet-lap', TOKEN_CHU, {
      method: 'POST',
      than: { mat_khau: MAT_KHAU, ten: 'Chủ' },
    });
    expect(res.status).toBe(201);
    const than = await res.json<{ otpauth: string; tao_luc: number }>();
    expect(than.otpauth.startsWith('otpauth://totp/Baton:Ch%E1%BB%A7?')).toBe(true);
    expect(than.tao_luc).toBeGreaterThan(0);

    const dong = await taiKhoanTrongDb();
    expect(dong?.totp_secret).toBe(secretTuUri(than.otpauth));
    expect(dong?.mat_khau_bam).toMatch(/^[0-9a-f]{64}$/);
    // Băm, không mật khẩu thô: không chỗ nào trong dòng chứa mật khẩu.
    expect(JSON.stringify(dong)).not.toContain(MAT_KHAU);
    expect(dong?.so_vong).toBeGreaterThanOrEqual(1000);
    expect(dong?.totp_buoc_cuoi).toBeNull();
    expect(dong?.dang_nhap_cuoi_luc).toBeNull();
  });

  it('gọi LẦN HAI khi đã có tài khoản → 403, và mật khẩu cũ KHÔNG bị đổi', async () => {
    const secret = await thietLap();
    const truoc = await taiKhoanTrongDb();

    const lai = await goiApi('/v1/chu/thiet-lap', TOKEN_CHU, {
      method: 'POST',
      than: { mat_khau: 'mat-khau-gia-cua-ke-khac', ten: 'Kẻ khác' },
    });
    expect(lai.status).toBe(403);
    expect(await lai.json()).toMatchObject({ error: 'FORBIDDEN' });

    const sau = await taiKhoanTrongDb();
    expect(sau?.mat_khau_bam).toBe(truoc?.mat_khau_bam);
    expect(sau?.totp_secret).toBe(truoc?.totp_secret);
    // Và mật khẩu cũ vẫn đăng nhập được.
    expect((await dangNhap(secret)).res.status).toBe(200);
  });

  it('token AGENT không vào được đường thiết lập (dù agent là coordinator)', async () => {
    const res = await goiApi('/v1/chu/thiet-lap', TOKEN_AGENT, {
      method: 'POST',
      than: { mat_khau: MAT_KHAU },
    });
    expect(res.status).toBe(403);
    expect(await taiKhoanTrongDb()).toBeNull();
  });

  it('COOKIE PHIÊN cũng không vào được đường thiết lập (chỉ TOKEN_CHU)', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    expect(cookie).not.toBeNull();

    // Phiên này **là chủ** và đi được các đường của chủ…
    expect((await goi('/v1/du-an', { cookie: cookie! })).status).toBe(200);
    // …nhưng không đi được đường thiết lập.
    const res = await goi('/v1/chu/thiet-lap', {
      method: 'POST',
      cookie: cookie!,
      than: { mat_khau: 'mat-khau-gia-doi-lai-ne' },
    });
    expect(res.status).toBe(403);
  });

  /*
   * **KHÔNG CÓ phiên nào mà không có tài khoản** — và điều này giải thích một
   * đột biến **sống sót**, đã khai thẳng trong báo cáo lượt này.
   *
   * Đột biến: ở route thiết lập, đổi `qua_token_chu !== true` thành
   * `ai.loai !== 'chu'`. Không ca nào đỏ. Lý do **không** phải thiếu test mà là
   * một tính chất của lược đồ: `chu_phien.workspace_id` trỏ tới
   * `chu_tai_khoan(workspace_id)`, và **D1 ép khoá ngoài** (ca dưới đây chứng
   * minh), nên "có cookie hợp lệ" kéo theo "tài khoản đã tồn tại" — và lúc đó
   * `thietLapChu` đã chặn vì lý do khác ("đã thiết lập"). Trạng thái mà lớp
   * `qua_token_chu` tồn tại để chịu là một trạng thái **không dựng được**.
   *
   * Giữ lớp đó lại, như phòng thủ tầng hai, cùng nếp (và cùng cách khai thẳng)
   * mà `#ghiMotXacMinh` của `workspace-gate.ts` đã làm với hai điều kiện `WHERE`
   * không test được: nó là thứ duy nhất còn đúng nếu một lượt sau nới khoá ngoài
   * đó, hoặc cho một đường ghi khác chèn `chu_phien`.
   */
  it('khoá ngoài: KHÔNG chèn được phiên khi chưa có tài khoản chủ (D1 ép FK)', async () => {
    const tao = Date.now();
    await expect(
      env.DB.prepare(
        `INSERT INTO chu_phien (bam, workspace_id, tao_luc, het_luc, huy_luc, dung_cuoi_luc, tao_tu_ua)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL)`,
      )
        .bind(await bamIdPhien(sinhIdPhien()), WS, tao, tao + PHIEN_CHU_MS)
        .run(),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it('không có token nào → 401, không tạo tài khoản', async () => {
    const res = await goi('/v1/chu/thiet-lap', { method: 'POST', than: { mat_khau: MAT_KHAU } });
    expect(res.status).toBe(401);
    expect(await taiKhoanTrongDb()).toBeNull();
  });

  it('mật khẩu quá ngắn → 422, không tạo tài khoản', async () => {
    const res = await goiApi('/v1/chu/thiet-lap', TOKEN_CHU, {
      method: 'POST',
      than: { mat_khau: 'ngan' },
    });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
    expect(await taiKhoanTrongDb()).toBeNull();
  });
});

/* ================================================================== *
 * Đăng nhập — hai lớp trong một request
 * ================================================================== */

describe('SPEC mục 15 d.415 — đăng nhập: mật khẩu + TOTP', () => {
  beforeEach(dungNen);

  it('đúng cả hai lớp → 200, cookie HttpOnly/Secure/SameSite=Lax/Path=/ + Max-Age 30 ngày', async () => {
    const secret = await thietLap();
    const { res } = await dangNhap(secret);
    expect(res.status).toBe(200);

    const set = res.headers.get('set-cookie') ?? '';
    const thieu = ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'].filter(
      (co) => !set.includes(co),
    );
    expect(thieu).toEqual([]);
    expect(set).toContain(`Max-Age=${String(PHIEN_CHU_MS / 1000)}`);
    expect(set.startsWith(`${COOKIE_PHIEN_CHU}=`)).toBe(true);

    const than = await res.json<{ dang_nhap: boolean; het_luc: number }>();
    expect(than.dang_nhap).toBe(true);
    // Hạn 30 ngày — d.415.
    expect(than.het_luc).toBeGreaterThan(Date.now() + PHIEN_CHU_MS - 60_000);
  });

  it('thân phản hồi KHÔNG mang id phiên (nó chỉ ở cookie HttpOnly)', async () => {
    const secret = await thietLap();
    const { res, cookie } = await dangNhap(secret);
    const id = cookie!.slice(`${COOKIE_PHIEN_CHU}=`.length);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    const chu = await res.text();
    expect(chu).not.toContain(id);
    expect(chu).not.toContain('id_phien');
  });

  it('cookie dùng được cho đường của chủ, và /v1/toi nói phiên còn sống', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);

    const toi = await goi('/v1/toi', { cookie: cookie! });
    expect(toi.status).toBe(200);
    const than = await toi.json<{ loai: string; workspace_id: string; phien_het_luc: number }>();
    expect(than.loai).toBe('chu');
    expect(than.workspace_id).toBe(WS);
    expect(than.phien_het_luc).toBeGreaterThan(Date.now());

    // BAT-18: hạn lấy từ lượt tra của middleware (`phien_chu.het_luc`) — phải KHỚP
    // đúng cột `het_luc` của dòng phiên, và `TOKEN_CHU` thì không có phiên (null).
    const dong = await env.DB.prepare('SELECT het_luc FROM chu_phien').first<{ het_luc: number }>();
    expect(than.phien_het_luc).toBe(dong?.het_luc);
    const qua_token = await goiApi('/v1/toi', TOKEN_CHU);
    expect((await qua_token.json<{ phien_het_luc: number | null }>()).phien_het_luc).toBeNull();

    // Và cookie **là chủ** ở mọi đường khác: tạo dự án là việc chỉ chủ làm được.
    const tao = await goi('/v1/du-an', {
      method: 'POST',
      cookie: cookie!,
      than: { ten: 'Dự án do chủ tạo bằng cookie', ma: 'CKE' },
    });
    expect(tao.status).toBe(201);
  });

  it('SAI MẬT KHẨU và SAI MÃ TOTP trả CÙNG MỘT thân lỗi, cùng mã HTTP', async () => {
    const secret = await thietLap();

    const sai_mk = await dangNhap(secret, { mat_khau: 'mat-khau-gia-nhung-sai' });
    const sai_ma = await dangNhap(secret, { ma: '000001' });

    expect(sai_mk.res.status).toBe(401);
    expect(sai_ma.res.status).toBe(401);
    const than_mk = await sai_mk.res.text();
    const than_ma = await sai_ma.res.text();
    // Giống **từng ký tự**: thân lỗi không được là một máy dò nói "mật khẩu đã đúng".
    expect(than_mk).toBe(than_ma);
    expect(than_mk).toContain('INVALID_TOKEN');
    expect(sai_mk.cookie).toBeNull();
    expect(sai_ma.cookie).toBeNull();
  });

  it('CHƯA THIẾT LẬP tài khoản cũng trả đúng thân lỗi đó (không lộ máy chủ đã có chủ chưa)', async () => {
    const chua = await goi('/v1/dang-nhap', {
      method: 'POST',
      than: { mat_khau: MAT_KHAU, ma_totp: '123456' },
    });
    expect(chua.status).toBe(401);
    const than_chua = await chua.text();

    await thietLap();
    const sai = await dangNhap('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', {
      mat_khau: 'mat-khau-gia-nhung-sai',
      ma: '123456',
    });
    expect(await sai.res.text()).toBe(than_chua);
  });

  it('mã TOTP sai HÌNH DẠNG cũng chỉ ra lỗi chung đó, không một lỗi riêng', async () => {
    const secret = await thietLap();
    const bang: { nhan: string; than: unknown }[] = [
      { nhan: 'thiếu mã', than: { mat_khau: MAT_KHAU } },
      { nhan: 'mã 5 số', than: { mat_khau: MAT_KHAU, ma_totp: '12345' } },
      { nhan: 'mã có chữ', than: { mat_khau: MAT_KHAU, ma_totp: '12345a' } },
      { nhan: 'mã là số', than: { mat_khau: MAT_KHAU, ma_totp: 123_456 } },
      { nhan: 'thiếu mật khẩu', than: { ma_totp: await maTotp(secret, Date.now()) } },
    ];
    const ra: string[] = [];
    for (const ca of bang) {
      const res = await goi('/v1/dang-nhap', { method: 'POST', than: ca.than });
      ra.push(`${ca.nhan}: ${String(res.status)} ${await res.text()}`);
    }
    const mong = ra[0]!.slice(ra[0]!.indexOf(':'));
    expect(ra.map((d) => d.slice(d.indexOf(':')))).toEqual(ra.map(() => mong));
    expect(mong).toContain('401');
  });

  it('CHỐNG DÙNG LẠI MÃ: cùng một mã 6 số không đăng nhập được hai lần', async () => {
    const secret = await thietLap();
    const luc = Date.now();
    const ma = await maTotp(secret, luc);

    const lan_1 = await dangNhap(secret, { ma });
    expect(lan_1.res.status).toBe(200);
    const buoc = (await taiKhoanTrongDb())?.totp_buoc_cuoi;
    expect(buoc).toBe(buocTotp(luc));

    const lan_2 = await dangNhap(secret, { ma });
    expect(lan_2.res.status).toBe(401);
    expect(lan_2.cookie).toBeNull();
    // Và chỉ có **một** phiên trong bảng.
    const n = await env.DB.prepare('SELECT count(*) AS n FROM chu_phien').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  /**
   * Thử một mã lệch `lech` bước so với **bây giờ**, và chỉ nhận kết quả khi mốc
   * bước **không nhảy** trong lúc gọi.
   *
   * Vì sao phải canh: mã gửi lên tính theo bước đọc ở client, còn cửa sổ do bước
   * đọc ở **máy chủ** quyết định. Gọi đúng lúc một bước 30 giây sang bước mới thì
   * `+2` thành `+1` — và một ca "`+2` phải bị từ chối" sẽ **đỏ ngẫu nhiên** chừng
   * một lần mỗi vài trăm lượt chạy. Một cổng nghiệm thu đỏ ngẫu nhiên là một cổng
   * người ta chạy lại cho tới khi xanh, tức không còn là cổng. Nên: đo lại mốc
   * sau khi gọi, lệch thì thử lần nữa.
   *
   * Tối đa **hai** lượt: mỗi lượt trượt nhích `so_lan_sai`, và quá
   * `NGUONG_KHOA_SAI` thì câu trả lời thành 429 của hạn mức — ca này sẽ đỏ vì một
   * luật khác.
   */
  async function thuMaLechBuoc(secret: string, lech: number): Promise<number> {
    for (let i = 0; i < 2; i += 1) {
      const truoc = buocTotp(Date.now());
      const res = await dangNhap(secret, { ma: await maTotpCuaBuoc(secret, truoc + lech) });
      if (buocTotp(Date.now()) === truoc) return res.res.status;
    }
    throw new Error('mốc bước TOTP nhảy hai lượt liền, không đo được cửa sổ');
  }

  it('cửa sổ ±1 vào được, ±2 thì không — ghim CẢ HAI phía (−2/−1 và +2/+1)', async () => {
    const secret = await thietLap();

    /*
     * **Ca −2 phải đi TRƯỚC, và đó là cả điểm của thứ tự này.** Một hàng tài
     * khoản cho mỗi workspace nên các ca dùng chung một tài khoản; nếu ca −1
     * chạy trước thì `totp_buoc_cuoi` đã là `giua − 1`, và mã −2 sẽ bị **chống
     * dùng lại** từ chối — tức ca này đỏ vì một luật khác, và nới cửa sổ lên ±2
     * sẽ **không** làm nó đỏ. Đã đo bằng đột biến (`TOTP_CUA_SO_BUOC = 2`).
     */
    expect(await thuMaLechBuoc(secret, -2)).toBe(401);
    expect((await taiKhoanTrongDb())?.totp_buoc_cuoi).toBeNull();

    expect(await thuMaLechBuoc(secret, -1)).toBe(200);
    const sau_tru_1 = (await taiKhoanTrongDb())!.totp_buoc_cuoi!;

    /*
     * **Phía SAU cũng phải ghim, nếu không một cửa sổ LỆCH sống sót.** Ghim một
     * phía thôi thì một đột biến đổi cửa sổ thành `−1…+2` (hay `0…+1`) đi qua mọi
     * ca: lệch về phía trước là nhận mã **chưa tới giờ**, tức nới đúng cái quãng
     * mà một mã bị đọc lén còn dùng được.
     *
     * `+2` đi trước `+1` để `+1` (thành công, nhích mốc) không ảnh hưởng tới nó —
     * cùng nếp với hai ca âm ở trên.
     */
    expect(await thuMaLechBuoc(secret, 2)).toBe(401);
    // Một lần thử trượt **không** nhích mốc bước.
    expect((await taiKhoanTrongDb())?.totp_buoc_cuoi).toBe(sau_tru_1);

    expect(await thuMaLechBuoc(secret, 1)).toBe(200);
    expect((await taiKhoanTrongDb())!.totp_buoc_cuoi!).toBeGreaterThan(sau_tru_1);
  });

  describe('chống dùng lại trong cửa sổ', () => {
    /*
     * Ca dưới gửi mã bước `giua - 1` và chờ 401 vì CHỐNG DÙNG LẠI. Mốc bước nhảy giữa
     * ca thì `giua - 1` thành "lệch −2" và cũng 401 — nhưng vì CỬA SỔ, tức ca xanh sai
     * lý do (một đột biến bỏ chống dùng lại có thể lọt). Canh bước như BAT-51.
     */
    beforeEach(() => choBuocTotpConDu());

    it('mã CŨ HƠN mã vừa dùng bị từ chối dù còn trong cửa sổ ±1', async () => {
      const secret = await thietLap();
      const giua = buocTotp(Date.now());
      expect((await dangNhap(secret, { ma: await maTotpCuaBuoc(secret, giua) })).res.status).toBe(
        200,
      );
      const cu = await dangNhap(secret, { ma: await maTotpCuaBuoc(secret, giua - 1) });
      expect(cu.res.status).toBe(401);
    });
  });

  it('dấu vết: phiên ghi mốc tạo, hạn, User-Agent; tài khoản ghi lần đăng nhập cuối (d.418)', async () => {
    const secret = await thietLap();
    const truoc = Date.now();
    const { cookie } = await dangNhap(secret);
    const id = cookie!.slice(`${COOKIE_PHIEN_CHU}=`.length);

    const dong = await env.DB.prepare(
      `SELECT bam, workspace_id, tao_luc, het_luc, huy_luc, dung_cuoi_luc, tao_tu_ua
         FROM chu_phien`,
    ).first<{
      bam: string;
      workspace_id: string;
      tao_luc: number;
      het_luc: number;
      huy_luc: number | null;
      dung_cuoi_luc: number | null;
      tao_tu_ua: string | null;
    }>();

    // **Chỉ bản băm vào bảng**, không id thô.
    expect(dong?.bam).toBe(await bamIdPhien(id));
    expect(dong?.bam).not.toBe(id);
    expect(dong?.workspace_id).toBe(WS);
    expect(dong?.tao_luc).toBeGreaterThanOrEqual(truoc);
    // Hạn **đúng** 30 ngày: cùng một con số ở hằng TypeScript và ở trigger 0017.
    expect(dong!.het_luc - dong!.tao_luc).toBe(PHIEN_CHU_MS);
    expect(dong?.huy_luc).toBeNull();
    expect(dong?.tao_tu_ua).toBe('Trinh-duyet-gia/1.0');

    expect((await taiKhoanTrongDb())?.dang_nhap_cuoi_luc).toBeGreaterThanOrEqual(truoc);
  });
});

/* ================================================================== *
 * Phiên hết hạn, đã huỷ, băm lạ
 * ================================================================== */

describe('SPEC mục 15 d.415 — phiên hết hạn / đã huỷ / băm lạ đều 401', () => {
  beforeEach(dungNen);

  it('cookie có id lạ → 401, không trả dữ liệu', async () => {
    await thietLap();
    const res = await goi('/v1/du-an', { cookie: `${COOKIE_PHIEN_CHU}=${sinhIdPhien()}` });
    expect(res.status).toBe(401);
    const chu = await res.text();
    expect(chu).toContain('INVALID_TOKEN');
    // Không một mẩu dữ liệu nào của workspace đi kèm lỗi 401.
    expect(chu).not.toContain('Sample');
  });

  it('phiên ĐÃ HẾT HẠN → 401 (hạn thật ở cột `het_luc`, không ở Max-Age của cookie)', async () => {
    await thietLap();
    /*
     * Dựng một phiên hết hạn **bằng SQL thô**: đường thật chỉ phát được phiên
     * còn 30 ngày, và trigger `tg_chu_phien_moc_bat_bien` của 0017 chặn mọi
     * `UPDATE` lên `het_luc`. Nên ca này đi qua chèn trực tiếp, tôn trọng đúng
     * CHECK và trigger (hạn vẫn **đúng** 30 ngày, chỉ mốc tạo là 40 ngày trước).
     */
    const id = sinhIdPhien();
    const tao = Date.now() - 40 * 24 * 60 * 60 * 1000;
    await env.DB.prepare(
      `INSERT INTO chu_phien (bam, workspace_id, tao_luc, het_luc, huy_luc, dung_cuoi_luc, tao_tu_ua)
       VALUES (?, ?, ?, ?, NULL, ?, NULL)`,
    )
      .bind(await bamIdPhien(id), WS, tao, tao + PHIEN_CHU_MS, tao)
      .run();

    const res = await goi('/v1/toi', { cookie: `${COOKIE_PHIEN_CHU}=${id}` });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
  });

  it('phiên còn 1 giây thì VÀO ĐƯỢC — biên của `het_luc > ?`', async () => {
    await thietLap();
    const id = sinhIdPhien();
    const tao = Date.now() + 5_000 - PHIEN_CHU_MS;
    await env.DB.prepare(
      `INSERT INTO chu_phien (bam, workspace_id, tao_luc, het_luc, huy_luc, dung_cuoi_luc, tao_tu_ua)
       VALUES (?, ?, ?, ?, NULL, NULL, NULL)`,
    )
      .bind(await bamIdPhien(id), WS, tao, tao + PHIEN_CHU_MS)
      .run();
    expect((await goi('/v1/toi', { cookie: `${COOKIE_PHIEN_CHU}=${id}` })).status).toBe(200);
  });

  it('cookie rỗng hoặc tên cookie khác → coi như không có cookie (401 vì thiếu token)', async () => {
    await thietLap();
    const ra: number[] = [];
    for (const cookie of [`${COOKIE_PHIEN_CHU}=`, 'cookie_khac=abc', 'khong-co-dau-bang']) {
      ra.push((await goi('/v1/toi', { cookie })).status);
    }
    expect(ra).toEqual([401, 401, 401]);
  });
});

/* ================================================================== *
 * Đăng xuất và đăng xuất mọi nơi — d.415
 * ================================================================== */

describe('SPEC mục 15 d.415 — đăng xuất, và nút ĐĂNG XUẤT MỌI NƠI', () => {
  beforeEach(dungNen);
  // Ca dưới đăng nhập bằng mã bước `giua - 1`: mốc bước không được nhảy giữa ca (BAT-51).
  beforeEach(() => choBuocTotpConDu());

  it('đăng xuất: cookie đó hết hiệu lực NGAY, dòng phiên mang mốc huỷ (không bị xoá)', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    expect((await goi('/v1/toi', { cookie: cookie! })).status).toBe(200);

    const ra = await goi('/v1/dang-xuat', { method: 'POST', cookie: cookie! });
    expect(ra.status).toBe(200);
    expect(await ra.json()).toMatchObject({ da_dang_xuat: true, moi_noi: false, so_phien_da_huy: 1 });
    // Cookie bị xoá ở phía trình duyệt…
    expect(ra.headers.get('set-cookie')).toContain('Max-Age=0');
    // …và vô hiệu ở phía máy chủ, kể cả khi trình duyệt vẫn gửi lên.
    expect((await goi('/v1/toi', { cookie: cookie! })).status).toBe(401);

    // Dòng vẫn còn, mang dấu vết (d.418) — **không xoá**.
    const dong = await env.DB.prepare('SELECT huy_luc FROM chu_phien').first<{
      huy_luc: number | null;
    }>();
    expect(dong?.huy_luc).toBeGreaterThan(0);
  });

  it('ĐĂNG XUẤT MỌI NƠI huỷ MỌI phiên, kể cả phiên đang gọi', async () => {
    const secret = await thietLap();
    const giua = buocTotp(Date.now());
    // Ba phiên của ba "máy": ba mã TOTP khác bước (chống dùng lại vẫn áp).
    const c1 = (await dangNhap(secret, { ma: await maTotpCuaBuoc(secret, giua - 1) })).cookie!;
    const c2 = (await dangNhap(secret, { ma: await maTotpCuaBuoc(secret, giua) })).cookie!;
    const c3 = (await dangNhap(secret, { ma: await maTotpCuaBuoc(secret, giua + 1) })).cookie!;
    const song_truoc: number[] = [];
    for (const c of [c1, c2, c3]) song_truoc.push((await goi('/v1/toi', { cookie: c })).status);
    expect(song_truoc).toEqual([200, 200, 200]);

    const ra = await goi('/v1/dang-xuat-moi-noi', { method: 'POST', cookie: c2 });
    expect(ra.status).toBe(200);
    expect(await ra.json()).toMatchObject({ moi_noi: true, so_phien_da_huy: 3 });

    const song_sau: number[] = [];
    for (const c of [c1, c2, c3]) song_sau.push((await goi('/v1/toi', { cookie: c })).status);
    expect(song_sau).toEqual([401, 401, 401]);
  });

  it('đăng xuất hai lần: lần hai huỷ 0 phiên, không lỗi', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    await goi('/v1/dang-xuat', { method: 'POST', cookie: cookie! });
    // Cookie đã vô hiệu nên lần hai không vào được bằng nó — đi bằng TOKEN_CHU.
    const lai = await goiApi('/v1/dang-xuat-moi-noi', TOKEN_CHU, { method: 'POST' });
    expect(lai.status).toBe(200);
    expect(await lai.json()).toMatchObject({ so_phien_da_huy: 0 });
  });

  it('agent gọi hai đường đăng xuất → 403 (d.416)', async () => {
    await thietLap();
    const ra: number[] = [];
    for (const d of ['/v1/dang-xuat', '/v1/dang-xuat-moi-noi']) {
      ra.push((await goiApi(d, TOKEN_AGENT, { method: 'POST' })).status);
    }
    expect(ra).toEqual([403, 403]);
  });
});

/* ================================================================== *
 * d.416 — agent không đăng nhập web, HAI CHIỀU
 * ================================================================== */

describe('SPEC mục 15 d.416 — agent chỉ dùng token, không đăng nhập web', () => {
  beforeEach(dungNen);

  it('chiều 1: TOKEN AGENT không dựng ra danh tính chủ — /v1/toi trả 403', async () => {
    await thietLap();
    const res = await goiApi('/v1/toi', TOKEN_AGENT);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    // Và `whoami` của nó vẫn là agent, không bao giờ là chủ.
    const who = await goiApi('/v1/whoami', TOKEN_AGENT);
    expect(await who.json()).toMatchObject({ loai: 'agent', agent_id: 'ag-coord' });
  });

  it('chiều 2: COOKIE PHIÊN không dựng ra danh tính agent', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    const who = await goi('/v1/whoami', { cookie: cookie! });
    expect(who.status).toBe(200);
    const than = await who.json<Record<string, unknown>>();
    expect(than['loai']).toBe('chu');
    expect(than['agent_id']).toBeUndefined();
    expect(than['vai_tro']).toBeUndefined();
  });

  it('TOKEN AGENT đặt vào CHỖ CỦA COOKIE phiên → 401 (không phải một đường vào thứ hai)', async () => {
    await thietLap();
    const res = await goi('/v1/du-an', { cookie: `${COOKIE_PHIEN_CHU}=${TOKEN_AGENT}` });
    expect(res.status).toBe(401);
  });

  it('ID PHIÊN đặt vào header Authorization → 401 (và không thành token agent)', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    const id = cookie!.slice(`${COOKIE_PHIEN_CHU}=`.length);
    const res = await goiApi('/v1/du-an', id);
    expect(res.status).toBe(401);
  });

  it('agent không có đường nào tự tạo một dòng `chu_phien`', async () => {
    await thietLap();
    // Không route nào nhận `chu_phien`; đường đăng nhập đòi mật khẩu + TOTP.
    const res = await goiApi('/v1/dang-nhap', TOKEN_AGENT, {
      method: 'POST',
      than: { mat_khau: MAT_KHAU, ma_totp: '123456' },
    });
    expect(res.status).toBe(401);
    const n = await env.DB.prepare('SELECT count(*) AS n FROM chu_phien').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });
});

/* ================================================================== *
 * d.417 — bí mật không bao giờ ra API hay UI
 * ================================================================== */

describe('SPEC mục 15 d.417 — băm mật khẩu, muối và secret TOTP không ra API', () => {
  beforeEach(dungNen);

  it('quét toàn thân mọi đường chủ đọc được: không có secret TOTP, băm, muối, mật khẩu', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    const dong = (await taiKhoanTrongDb())!;

    /*
     * **Ca phủ định này chỉ có giá trị vì BỐN chuỗi dưới đây có thật trong dữ
     * liệu**: `secret` là secret TOTP đang dùng (dòng `chu_tai_khoan` mang đúng
     * nó — đã khẳng định ở ca thiết lập), `mat_khau_bam` và `muoi` là giá trị
     * thật của dòng, và `MAT_KHAU` là mật khẩu vừa đăng nhập thành công. Nên nếu
     * một đường nào trả nguyên dòng tài khoản ra (hay echo lại thân request đăng
     * nhập), ca này **đỏ**.
     */
    const cam: { nhan: string; chuoi: string }[] = [
      { nhan: 'secret TOTP', chuoi: secret },
      { nhan: 'băm mật khẩu', chuoi: dong.mat_khau_bam },
      { nhan: 'muối', chuoi: dong.muoi },
      { nhan: 'mật khẩu thô', chuoi: MAT_KHAU },
    ];

    const duong = ['/v1/toi', '/v1/whoami', '/v1/du-an', '/v1/agent', '/v1/meta'];
    const lo: string[] = [];
    for (const d of duong) {
      const chu = await (await goi(d, { cookie: cookie! })).text();
      for (const c of cam) {
        if (chu.includes(c.chuoi)) lo.push(`${d} lộ ${c.nhan}`);
      }
      for (const cot of ['totp_secret', 'mat_khau_bam', 'muoi', 'so_vong']) {
        if (chu.includes(cot)) lo.push(`${d} có tên cột ${cot}`);
      }
    }
    expect(lo).toEqual([]);
  });

  it('thân phản hồi đăng nhập không vọng lại mật khẩu hay mã vừa gửi', async () => {
    const secret = await thietLap();
    const luc = Date.now();
    const ma = await maTotp(secret, luc);
    const res = await goi('/v1/dang-nhap', {
      method: 'POST',
      than: { mat_khau: MAT_KHAU, ma_totp: ma },
    });
    const chu = await res.text();
    expect(chu).not.toContain(MAT_KHAU);
    expect(chu).not.toContain(ma);
    expect(chu).not.toContain(secret);
  });

  it('thân lỗi của một lần đăng nhập SAI cũng không vọng gì', async () => {
    const secret = await thietLap();
    const res = await goi('/v1/dang-nhap', {
      method: 'POST',
      than: { mat_khau: 'mat-khau-gia-nhung-sai', ma_totp: '000001' },
    });
    const chu = await res.text();
    expect(chu).not.toContain('mat-khau-gia-nhung-sai');
    expect(chu).not.toContain(secret);
    expect(chu).not.toContain(MAT_KHAU);
  });

  it('URI otpauth CHỈ ra ở đường thiết lập, không ở đường nào khác', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    const lo: string[] = [];
    for (const d of ['/v1/toi', '/v1/whoami', '/v1/meta']) {
      const chu = await (await goi(d, { cookie: cookie! })).text();
      if (chu.includes('otpauth')) lo.push(d);
    }
    expect(lo).toEqual([]);
  });
});

/* ================================================================== *
 * Chống dò mật khẩu — SPEC IM LẶNG (cau-hoi-spec.md)
 * ================================================================== */

describe('chống dò mật khẩu (hướng tạm — SPEC không nêu số lần thử)', () => {
  beforeEach(dungNen);

  it(`sai quá ${String(NGUONG_KHOA_SAI)} lần → 429 kèm Retry-After; mật khẩu ĐÚNG lúc đó cũng bị chặn`, async () => {
    const secret = await thietLap();

    const ma_loi: string[] = [];
    for (let i = 0; i < NGUONG_KHOA_SAI + 1; i += 1) {
      const res = await dangNhap(secret, { mat_khau: 'mat-khau-gia-nhung-sai' });
      ma_loi.push(`${String(i + 1)}:${String(res.res.status)}`);
    }
    // 5 lần đầu là 401; lần thứ 6 vẫn 401 (nó là lần *đặt* khoá, không phải lần bị khoá).
    expect(ma_loi).toEqual(
      Array.from({ length: NGUONG_KHOA_SAI + 1 }, (_, i) => `${String(i + 1)}:401`),
    );

    const dong = await taiKhoanTrongDb();
    expect(dong?.so_lan_sai).toBe(NGUONG_KHOA_SAI + 1);
    expect(dong?.khoa_den_luc).toBeGreaterThan(Date.now());

    // Lần kế tiếp bị khoá — **kể cả khi mật khẩu và mã đều đúng**.
    const dung = await dangNhap(secret);
    expect(dung.res.status).toBe(429);
    expect(await dung.res.json()).toMatchObject({ error: 'RATE_LIMITED' });
    expect(Number(dung.res.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(dung.cookie).toBeNull();
  });

  it('một lần ĐÚNG đặt lại bộ đếm sai về 0 và bỏ khoá', async () => {
    const secret = await thietLap();
    for (let i = 0; i < NGUONG_KHOA_SAI - 1; i += 1) {
      await dangNhap(secret, { mat_khau: 'mat-khau-gia-nhung-sai' });
    }
    expect((await taiKhoanTrongDb())?.so_lan_sai).toBe(NGUONG_KHOA_SAI - 1);

    expect((await dangNhap(secret)).res.status).toBe(200);
    const dong = await taiKhoanTrongDb();
    expect(dong?.so_lan_sai).toBe(0);
    expect(dong?.khoa_den_luc).toBeNull();
  });

  /*
   * Ca này đo **khoảng** khoá, không chỉ "có khoá hay không" — tên cũ ("khoá TĂNG
   * DẦN theo số lần sai") nói nhiều hơn điều nó canh, và nó **không thể** canh
   * điều đó: khi đang khoá, mọi lần thử bị chặn ở cổng và **không** nhích
   * `so_lan_sai`, nên qua HTTP chỉ quan sát được **bậc đầu tiên** (30 giây). Các
   * bậc 1p/2p/4p/8p và **trần 15p** chỉ tới được sau khi khoá hết hạn — đo bằng
   * ca unit `khoaBaoLauMs` ở describe dưới, không bằng cách cho test chờ 30 giây.
   *
   * Khoảng đọc được từ DB là `khoa_den_luc − sai_cuoi_luc`: cả hai cột cùng lấy
   * một mốc `bay_gio` trong **một** câu `UPDATE`, nên hiệu của chúng là **đúng**
   * con số mà hạn mức quyết định, không mang một mẩu sai số đồng hồ nào. Con số
   * mong đợi **gõ thẳng**, không gọi `khoaBaoLauMs`: gọi chính hàm đang đo là một
   * khẳng định vòng quanh, xanh với mọi đột biến.
   */
  it('lần sai thứ 6 khoá ĐÚNG 30 giây; đang khoá thì lần thử sau không nhích gì', async () => {
    const secret = await thietLap();
    const khoang: (number | null)[] = [];
    for (let i = 0; i < NGUONG_KHOA_SAI + 3; i += 1) {
      await dangNhap(secret, { mat_khau: 'mat-khau-gia-nhung-sai', ma: '000001' });
      const d = (await taiKhoanTrongDb())!;
      khoang.push(d.khoa_den_luc === null ? null : d.khoa_den_luc - d.sai_cuoi_luc!);
    }
    expect(khoang).toEqual([
      ...Array.from({ length: NGUONG_KHOA_SAI }, () => null),
      KHOA_DAU_MS,
      KHOA_DAU_MS,
      KHOA_DAU_MS,
    ]);
    expect(KHOA_DAU_MS).toBe(30_000);
    // Hai lần thử lúc **đang khoá** không nhích bộ đếm: chúng chết ở cổng 429.
    expect((await taiKhoanTrongDb())?.so_lan_sai).toBe(NGUONG_KHOA_SAI + 1);
  });
});

/* ================================================================== *
 * `khoaBaoLauMs` — ca UNIT, hàm thuần
 * ================================================================== */

/**
 * Hàm này quyết định **chủ bị khoá ngoài bao lâu**, và nó là hàm thuần. Ca qua
 * HTTP ở trên chỉ chạm tới ba mốc đầu (mỗi lần sai thêm là một lượt PBKDF2), nên
 * **trần** và các số rất lớn không ca nào qua — đó đúng là chỗ reviewer bắt được
 * là không có test. Đo thẳng ở đây, nơi gọi một triệu lần cũng không tốn gì.
 */
describe('khoaBaoLauMs — bảng giá trị, trần, và số rất lớn', () => {
  it(`không khoá trong ${String(NGUONG_KHOA_SAI)} lần sai đầu (kể cả 0 và số âm)`, () => {
    const ra: number[] = [];
    for (let n = -3; n <= NGUONG_KHOA_SAI; n += 1) ra.push(khoaBaoLauMs(n));
    expect(ra).toEqual(ra.map(() => 0));
  });

  it('mốc NHÂN ĐÔI từ lần sai thứ 6: 30s, 1p, 2p, 4p, 8p', () => {
    // Gõ thẳng từng con số — không dẫn lại từ hằng, để đổi hằng là có ca đỏ.
    expect(khoaBaoLauMs(6)).toBe(30_000);
    expect(khoaBaoLauMs(7)).toBe(60_000);
    expect(khoaBaoLauMs(8)).toBe(120_000);
    expect(khoaBaoLauMs(9)).toBe(240_000);
    expect(khoaBaoLauMs(10)).toBe(480_000);
    expect(KHOA_DAU_MS).toBe(30_000);
  });

  it('TRẦN 15 phút: lần sai thứ 11 trở đi không bao giờ vượt, và không vỡ ở số lớn', () => {
    // 16p (lần 11) đã quá trần → bị chặn đúng ở 15p.
    expect(khoaBaoLauMs(11)).toBe(15 * 60_000);
    expect(KHOA_TOI_DA_MS).toBe(15 * 60_000);

    /*
     * Những con số này **tới được thật**: `so_lan_sai` tăng mỗi request sai và
     * không có trần, nên một máy dò chạy liên tục đi qua 60 trong vài phút và qua
     * 1030 trong một ngày. `2 ** 60` vượt `MAX_SAFE_INTEGER` sau khi nhân 30.000,
     * và `2 ** 1030` là `Infinity` — một `khoa_den_luc = Infinity` ghi vào D1 là
     * khoá **vĩnh viễn**. `Math.min` ngoài cùng phải chặn cả ba.
     */
    const lon = [11, 60, 1030, 100_000, Number.MAX_SAFE_INTEGER];
    for (const n of lon) {
      const ms = khoaBaoLauMs(n);
      expect(ms).toBe(15 * 60_000);
      expect(Number.isFinite(ms)).toBe(true);
    }
    // Và không bao giờ âm, với mọi đầu vào ở trên.
    const moi = [-3, 0, 5, 6, 11, 60, 1030, Number.MAX_SAFE_INTEGER];
    expect(moi.map((n) => khoaBaoLauMs(n) >= 0)).toEqual(moi.map(() => true));
  });
});

/* ================================================================== *
 * Mở khoá — cửa thoát khi hạn mức khoá chủ ra ngoài
 * ================================================================== */

/**
 * Hạn mức chống dò khoá theo **tài khoản**, và `/v1/dang-nhap` là đường công
 * khai không qua bộ đếm 600 req/phút. Nên một kẻ **không biết mật khẩu** lặp mãi
 * một mật khẩu sai giữ được tài khoản trong trạng thái khoá vô hạn: chủ không
 * bao giờ vào được nữa (`cau-hoi-spec.md` #98). Đây là cửa thoát, và nó phải
 * không trở thành một cửa hậu.
 */
describe('mở khoá tài khoản chủ qua TOKEN_CHU (cau-hoi-spec.md #98)', () => {
  beforeEach(dungNen);

  /** Đẩy tài khoản vào trạng thái **đang bị khoá**. */
  async function khoaLai(secret: string): Promise<void> {
    for (let i = 0; i < NGUONG_KHOA_SAI + 1; i += 1) {
      await dangNhap(secret, { mat_khau: 'mat-khau-gia-nhung-sai', ma: '000001' });
    }
    expect((await taiKhoanTrongDb())?.khoa_den_luc).toBeGreaterThan(Date.now());
  }

  it('đang bị khoá → mở khoá xong CHỦ VÀO ĐƯỢC NGAY (không phải chờ hết khoá)', async () => {
    const secret = await thietLap();
    await khoaLai(secret);
    // Trước khi mở: đúng cả hai lớp vẫn 429.
    expect((await dangNhap(secret)).res.status).toBe(429);

    const mo = await goiApi('/v1/chu/mo-khoa', TOKEN_CHU, { method: 'POST' });
    expect(mo.status).toBe(200);
    expect(await mo.json()).toMatchObject({
      dang_bi_khoa: true,
      so_lan_sai_truoc: NGUONG_KHOA_SAI + 1,
    });

    const dong = await taiKhoanTrongDb();
    expect(dong?.so_lan_sai).toBe(0);
    expect(dong?.khoa_den_luc).toBeNull();

    const vao = await dangNhap(secret);
    expect(vao.res.status).toBe(200);
    expect(vao.cookie).not.toBeNull();
  });

  it('mở khoá KHÔNG gỡ một lớp nào của d.415: sai mật khẩu vẫn 401, bí mật không đổi', async () => {
    const secret = await thietLap();
    const truoc = (await taiKhoanTrongDb())!;
    await khoaLai(secret);
    expect((await goiApi('/v1/chu/mo-khoa', TOKEN_CHU, { method: 'POST' })).status).toBe(200);

    // Mật khẩu sai → vẫn 401 (không thành một đường vào không cần mật khẩu)…
    expect((await dangNhap(secret, { mat_khau: 'mat-khau-gia-nhung-sai' })).res.status).toBe(401);
    // …mã TOTP sai → vẫn 401.
    expect((await dangNhap(secret, { ma: '000001' })).res.status).toBe(401);

    const sau = (await taiKhoanTrongDb())!;
    expect(sau.mat_khau_bam).toBe(truoc.mat_khau_bam);
    expect(sau.muoi).toBe(truoc.muoi);
    expect(sau.totp_secret).toBe(truoc.totp_secret);
  });

  it('thân phản hồi không mang bí mật nào (d.417)', async () => {
    const secret = await thietLap();
    const dong = (await taiKhoanTrongDb())!;
    const chu = await (await goiApi('/v1/chu/mo-khoa', TOKEN_CHU, { method: 'POST' })).text();
    for (const c of [secret, dong.mat_khau_bam, dong.muoi, MAT_KHAU]) {
      expect(chu).not.toContain(c);
    }
  });

  it('COOKIE PHIÊN, token AGENT và không-token đều KHÔNG mở khoá được', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    await khoaLai(secret);

    const ra: number[] = [];
    // Cookie phiên của chính chủ: 403 — chỉ `TOKEN_CHU`, cùng nếp `/v1/chu/thiet-lap`.
    ra.push((await goi('/v1/chu/mo-khoa', { method: 'POST', cookie: cookie! })).status);
    ra.push((await goiApi('/v1/chu/mo-khoa', TOKEN_AGENT, { method: 'POST' })).status);
    ra.push((await goi('/v1/chu/mo-khoa', { method: 'POST' })).status);
    expect(ra).toEqual([403, 403, 401]);

    // Và khoá vẫn còn nguyên: không đường nào trong ba đường đó gỡ được nó.
    expect((await taiKhoanTrongDb())?.khoa_den_luc).toBeGreaterThan(Date.now());
    expect((await dangNhap(secret)).res.status).toBe(429);
  });

  it('chưa thiết lập tài khoản → 404, không tạo dòng nào', async () => {
    const res = await goiApi('/v1/chu/mo-khoa', TOKEN_CHU, { method: 'POST' });
    expect(res.status).toBe(404);
    expect(await taiKhoanTrongDb()).toBeNull();
  });
});

/* ================================================================== *
 * Cookie chết KHÔNG được cắt đường Bearer
 * ================================================================== */

/**
 * Nhánh cookie đứng **trên** nhánh token trong `xacThuc` (web của chủ không gửi
 * `Authorization` nào). Nếu nó ném 401 ngay khi cookie không giải ra phiên sống
 * thì ai nhồi được một cookie `baton_phien` cho domain này — một subdomain lân
 * cận ghi `Domain=` là đủ — ép được **mọi** request 401, kể cả của một agent có
 * token đúng. Một cookie không phải một giấy tờ được kiểm, nên nó không được
 * quyền **cấm** một giấy tờ đã kiểm.
 */
describe('cookie chết rơi xuống nhánh Bearer, không cắt nó', () => {
  beforeEach(dungNen);

  it('cookie RÁC + Bearer agent hợp lệ → vào được, và là AGENT', async () => {
    await thietLap();
    const res = await goi('/v1/whoami', {
      cookie: `${COOKIE_PHIEN_CHU}=${sinhIdPhien()}`,
      headers: { authorization: `Bearer ${TOKEN_AGENT}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ loai: 'agent', agent_id: 'ag-coord' });
  });

  it('cookie HỢP LỆ + Bearer agent → vẫn là CHỦ (thứ tự cookie-trước giữ nguyên)', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    const res = await goi('/v1/whoami', {
      cookie: cookie!,
      headers: { authorization: `Bearer ${TOKEN_AGENT}` },
    });
    expect(res.status).toBe(200);
    const than = await res.json<Record<string, unknown>>();
    expect(than['loai']).toBe('chu');
    expect(than['agent_id']).toBeUndefined();
  });

  it('cookie ĐÃ HUỶ + Bearer agent → vào được với tư cách agent', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    await goi('/v1/dang-xuat', { method: 'POST', cookie: cookie! });
    const res = await goi('/v1/whoami', {
      cookie: cookie!,
      headers: { authorization: `Bearer ${TOKEN_AGENT}` },
    });
    expect(await res.json()).toMatchObject({ loai: 'agent' });
  });

  it('cookie rác KHÔNG có Bearer → vẫn 401 (rơi xuống không phải mở cửa)', async () => {
    await thietLap();
    const res = await goi('/v1/whoami', { cookie: `${COOKIE_PHIEN_CHU}=${sinhIdPhien()}` });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
  });

  it('cookie rác + Bearer SAI → vẫn 401 (không nhánh nào cho qua)', async () => {
    await thietLap();
    const res = await goi('/v1/whoami', {
      cookie: `${COOKIE_PHIEN_CHU}=${sinhIdPhien()}`,
      headers: { authorization: 'Bearer bt_token_khong_ton_tai' },
    });
    expect(res.status).toBe(401);
  });

  it('cookie rác + TOKEN_CHU → vào được như chủ (đường của script không bị cookie cắt)', async () => {
    await thietLap();
    const res = await goi('/v1/whoami', {
      cookie: `${COOKIE_PHIEN_CHU}=${sinhIdPhien()}`,
      headers: { authorization: `Bearer ${TOKEN_CHU}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ loai: 'chu' });
  });

  it('kẹp nhịp độ: mỗi giấy tờ MỘT bộ đếm — cookie rác không ăn vào hạn mức của token', async () => {
    await thietLap();
    const id_rac = sinhIdPhien();
    const ns = env.GIOI_HAN_TOKEN;

    // Đẩy bộ đếm của **cookie rác** tới trần.
    const stub = ns.get(ns.idFromName(`token:phien:${await bamIdPhien(id_rac)}`));
    await runInDurableObject(stub, (dem: GioiHanToken) => {
      for (let i = 0; i < GIOI_HAN_MOI_PHUT; i += 1) dem.dem();
    });

    // Cookie rác một mình: 429 của chính bộ đếm nó — hạn mức vẫn thật.
    expect((await goi('/v1/whoami', { cookie: `${COOKIE_PHIEN_CHU}=${id_rac}` })).status).toBe(429);

    /*
     * Nhưng **cùng cookie rác đó + Bearer agent** thì vẫn vào được: nếu không,
     * kẻ nhồi cookie `X` chỉ cần tự bắn 600 request mang `X` để biến mọi request
     * mang `X` thành 429 — đúng cái DoS mà nhánh rơi-xuống đi sửa, chỉ đổi 401
     * thành 429. Request này được đo bằng bộ đếm của **token**.
     */
    const kem = await goi('/v1/whoami', {
      cookie: `${COOKIE_PHIEN_CHU}=${id_rac}`,
      headers: { authorization: `Bearer ${TOKEN_AGENT}` },
    });
    expect(kem.status).toBe(200);
    expect(await kem.json()).toMatchObject({ loai: 'agent', agent_id: 'ag-coord' });
    // Và token agent đi một mình vẫn còn hạn mức của nó.
    expect((await goiApi('/v1/whoami', TOKEN_AGENT)).status).toBe(200);
  });
});

/* ================================================================== *
 * Kẹp nhịp độ của nhánh cookie — d.387
 * ================================================================== */

describe('SPEC mục 13 d.387 — nhánh cookie cũng qua kẹp 600 req/phút', () => {
  beforeEach(dungNen);
  beforeEach(() => choBuocTotpConDu());

  it('đẩy bộ đếm của `phien:<băm>` tới trần → request kế tiếp 429', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    const id = cookie!.slice(`${COOKIE_PHIEN_CHU}=`.length);

    const ns = env.GIOI_HAN_TOKEN;
    const stub = ns.get(ns.idFromName(`token:phien:${await bamIdPhien(id)}`));
    await runInDurableObject(stub, (dem: GioiHanToken) => {
      for (let i = 0; i < GIOI_HAN_MOI_PHUT; i += 1) dem.dem();
    });

    const res = await goi('/v1/toi', { cookie: cookie! });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('khoá đếm dẫn xuất từ BĂM id phiên, không từ id thô (mục 15)', async () => {
    const secret = await thietLap();
    const { cookie } = await dangNhap(secret);
    const id = cookie!.slice(`${COOKIE_PHIEN_CHU}=`.length);

    const ns = env.GIOI_HAN_TOKEN;
    const theo_tho = ns.get(ns.idFromName(`token:phien:${id}`));
    await goi('/v1/toi', { cookie: cookie! });
    const dung_tho = await runInDurableObject(theo_tho, (dem: GioiHanToken) => dem.dem().da_dung);
    expect(dung_tho).toBe(1);

    const theo_bam = ns.get(ns.idFromName(`token:phien:${await bamIdPhien(id)}`));
    const dung_bam = await runInDurableObject(theo_bam, (dem: GioiHanToken) => dem.dem().da_dung);
    // Băm đã đếm cả lần gọi thật ở trên.
    expect(dung_bam).toBe(2);
  });

  it('bộ đếm của một phiên không ảnh hưởng phiên khác, cũng không ảnh hưởng token agent', async () => {
    const secret = await thietLap();
    const giua = buocTotp(Date.now());
    const c1 = (await dangNhap(secret, { ma: await maTotpCuaBuoc(secret, giua - 1) })).cookie!;
    const c2 = (await dangNhap(secret, { ma: await maTotpCuaBuoc(secret, giua) })).cookie!;
    const id1 = c1.slice(`${COOKIE_PHIEN_CHU}=`.length);

    const ns = env.GIOI_HAN_TOKEN;
    const stub = ns.get(ns.idFromName(`token:phien:${await bamIdPhien(id1)}`));
    await runInDurableObject(stub, (dem: GioiHanToken) => {
      for (let i = 0; i < GIOI_HAN_MOI_PHUT; i += 1) dem.dem();
    });

    expect((await goi('/v1/toi', { cookie: c1 })).status).toBe(429);
    expect((await goi('/v1/toi', { cookie: c2 })).status).toBe(200);
    expect((await goiApi('/v1/whoami', TOKEN_AGENT)).status).toBe(200);
    // Và bộ đếm của phiên **không** dùng chung khoá với `TOKEN_CHU`.
    expect((await goiApi('/v1/whoami', TOKEN_CHU)).status).toBe(200);
  });
});

/* ================================================================== *
 * Hàng rào tầng DB — migration 0017
 * ================================================================== */

describe('migration 0017 — hàng rào ở tầng DB', () => {
  beforeEach(dungNen);

  async function chenPhien(opts: {
    bam?: string;
    tao_luc?: number;
    het_luc?: number;
    huy_luc?: number | null;
  }): Promise<void> {
    const tao = opts.tao_luc ?? Date.now();
    await env.DB.prepare(
      `INSERT INTO chu_phien (bam, workspace_id, tao_luc, het_luc, huy_luc, dung_cuoi_luc, tao_tu_ua)
       VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    )
      .bind(
        opts.bam ?? (await bamIdPhien(sinhIdPhien())),
        WS,
        tao,
        opts.het_luc ?? tao + PHIEN_CHU_MS,
        opts.huy_luc ?? null,
      )
      .run();
  }

  it('hạn KHÁC 30 ngày thì không chèn được (d.415 là một con số, không một lời khai)', async () => {
    await thietLap();
    const tao = Date.now();
    await expect(chenPhien({ tao_luc: tao, het_luc: tao + 365 * 24 * 3_600_000 })).rejects.toThrow(
      /han dung 30 ngay/,
    );
    await expect(chenPhien({ tao_luc: tao, het_luc: tao + 1000 })).rejects.toThrow(
      /han dung 30 ngay/,
    );
    // Đúng 30 ngày thì được.
    await chenPhien({ tao_luc: tao, het_luc: tao + PHIEN_CHU_MS });
  });

  it('phiên đã huỷ KHÔNG mở lại được (nút "đăng xuất mọi nơi" không gỡ lại được)', async () => {
    await thietLap();
    const bam = await bamIdPhien(sinhIdPhien());
    /*
     * MỘT mốc cho cả tạo lẫn huỷ (BAT-51). Bản trước truyền `huy_luc: Date.now()`
     * rồi để `chenPhien` tự lấy `tao_luc = Date.now()` SAU đó (sau cả một lần băm):
     * mốc ms nhảy giữa hai lần gọi là `huy_luc < tao_luc` ⇒ CHECK
     * `huy_luc IS NULL OR huy_luc >= tao_luc` của 0017 chặn chính lệnh gieo, ca đỏ
     * vì một luật nó không định đo. `huy_luc = tao_luc` là biên hợp lệ của CHECK đó.
     */
    const t = Date.now();
    await chenPhien({ bam, tao_luc: t, huy_luc: t });

    await expect(
      env.DB.prepare('UPDATE chu_phien SET huy_luc = NULL WHERE bam = ?').bind(bam).run(),
    ).rejects.toThrow(/khong mo lai/);
    await expect(
      env.DB.prepare('UPDATE chu_phien SET huy_luc = ? WHERE bam = ?').bind(1, bam).run(),
    ).rejects.toThrow(/khong mo lai/);
  });

  it('mốc tạo và hạn BẤT BIẾN: không gia hạn một phiên bằng UPDATE', async () => {
    await thietLap();
    const bam = await bamIdPhien(sinhIdPhien());
    await chenPhien({ bam });
    await expect(
      env.DB.prepare('UPDATE chu_phien SET het_luc = het_luc + 1000 WHERE bam = ?')
        .bind(bam)
        .run(),
    ).rejects.toThrow(/khong doi/);
    await expect(
      env.DB.prepare('UPDATE chu_phien SET tao_luc = 1 WHERE bam = ?').bind(bam).run(),
    ).rejects.toThrow(/khong doi/);
  });

  it('INSERT OR REPLACE không ghi đè được một phiên đã có (không dựng sống phiên đã huỷ)', async () => {
    await thietLap();
    const bam = await bamIdPhien(sinhIdPhien());
    const tao = Date.now();
    await chenPhien({ bam, tao_luc: tao, huy_luc: tao });

    await expect(
      env.DB.prepare(
        `INSERT OR REPLACE INTO chu_phien
           (bam, workspace_id, tao_luc, het_luc, huy_luc, dung_cuoi_luc, tao_tu_ua)
         VALUES (?, ?, ?, ?, NULL, NULL, NULL)`,
      )
        .bind(bam, WS, tao, tao + PHIEN_CHU_MS)
        .run(),
    ).rejects.toThrow(/khong ghi de mot phien/);

    // Dòng cũ vẫn nguyên, vẫn đã huỷ.
    const dong = await env.DB.prepare('SELECT huy_luc FROM chu_phien WHERE bam = ?')
      .bind(bam)
      .first<{ huy_luc: number | null }>();
    expect(dong?.huy_luc).toBe(tao);
  });

  it('số vòng PBKDF2 CHỈ TĂNG, không hạ', async () => {
    await thietLap();
    const vong = (await taiKhoanTrongDb())!.so_vong;
    await expect(
      env.DB.prepare('UPDATE chu_tai_khoan SET so_vong = ? WHERE workspace_id = ?')
        .bind(vong - 1, WS)
        .run(),
    ).rejects.toThrow(/so vong PBKDF2 chi tang/);
    // Nâng thì được, và đặt lại **cùng** giá trị cũng được.
    await env.DB.prepare('UPDATE chu_tai_khoan SET so_vong = ? WHERE workspace_id = ?')
      .bind(vong * 2, WS)
      .run();
    await env.DB.prepare('UPDATE chu_tai_khoan SET so_vong = ? WHERE workspace_id = ?')
      .bind(vong * 2, WS)
      .run();
    expect((await taiKhoanTrongDb())?.so_vong).toBe(vong * 2);
  });

  it('bước TOTP đã dùng CHỈ TĂNG: không lùi, không đặt lại NULL', async () => {
    const secret = await thietLap();
    await dangNhap(secret);
    const buoc = (await taiKhoanTrongDb())!.totp_buoc_cuoi!;
    expect(buoc).toBeGreaterThan(0);

    await expect(
      env.DB.prepare('UPDATE chu_tai_khoan SET totp_buoc_cuoi = ? WHERE workspace_id = ?')
        .bind(buoc - 1, WS)
        .run(),
    ).rejects.toThrow(/buoc TOTP da dung chi tang/);
    await expect(
      env.DB.prepare('UPDATE chu_tai_khoan SET totp_buoc_cuoi = NULL WHERE workspace_id = ?')
        .bind(WS)
        .run(),
    ).rejects.toThrow(/buoc TOTP da dung chi tang/);
  });

  it('số vòng dưới trần dưới (1.000) không ghi được', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO chu_tai_khoan
           (workspace_id, mat_khau_bam, muoi, so_vong, totp_secret, tao_luc, cap_nhat_luc)
         VALUES (?, ?, ?, 999, ?, ?, ?)`,
      )
        .bind(WS, 'a'.repeat(64), 'b'.repeat(32), 'JBSWY3DPEHPK3PXP', 1, 1)
        .run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('tra phiên theo băm là ĐÚNG MỘT lần tra khoá, không quét bảng', async () => {
    await thietLap();
    const ke_hoach = await env.DB.prepare(`EXPLAIN QUERY PLAN ${CAU_TRA_PHIEN_CHU}`)
      .bind('x'.repeat(64), Date.now())
      .all<{ detail: string }>();
    const chi_tiet = ke_hoach.results.map((d) => d.detail).join(' | ');
    expect(chi_tiet).not.toContain('SCAN');
    expect(chi_tiet).toContain('SEARCH');
  });
});
