/**
 * **BAT-16** — Nhật ký + Telegram cho sự kiện bảo mật tài khoản chủ, và công tắc
 * từng loại thông báo.
 *
 * SPEC: 19.12 câu 3 d.594 (mọi lần đặt lại ghi Lịch sử + bắn Telegram), mục 12
 * d.348 (tắt từng loại trong Cài đặt), d.350 (giờ yên lặng: chỉ 🔴), 19.12 câu 6
 * d.604–606 (thử lại, giữ trong chuông, không chặn luồng chính), mục 15 d.425–427;
 * `spec-questions.md` #148 (đã chốt 17/10, T-125 = A), #98 (bộ đếm sai dùng chung).
 *
 * Mọi ca đi **đường thật** (HTTP → cửa ghi → D1 → cron gửi) với kênh Telegram
 * **giả lập** (`datNguonTelegram`) — không một lời gọi mạng nào (CLAUDE.md mục 3).
 * Mật khẩu/secret ở đây đều **giả**, chỉ sống trong Miniflare.
 */

import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  CAU_NEU_KHONG_PHAI_ANH,
  CONG_TAC_BAO_MAT,
  CONG_TAC_THONG_BAO,
  MUI_GIO_CHU_PHUT,
  NGUONG_CANH_BAO_SAI,
  SU_KIEN_BAO_MAT,
  bamIdPhien,
  buocTotp,
  canCanhBaoSai,
  congTacCuaTin,
  maTotpCuaBuoc,
  noiDungSuKienBaoMat,
  quyetDinhGuiTin,
  tinBiTat,
} from '@baton/shared';
import { quetGuiThongBao, quetNhacCanChuDo } from '../src/cron-thong-bao.js';
import { GIOI_HAN_MOI_PHUT, type GioiHanToken } from '../src/gioi-han-token.js';
import { goiGhiMocGui } from '../src/workspace-gate.js';
import { caQuaSo, choBuocTotpConDu, soRequestBay } from './cho-toi.js';
import {
  TOKEN_CHU,
  WS,
  boNguonTelegram,
  datNguonTelegram,
  dungAgentCoToken,
  dungDuAn,
  dungTin,
  dungWorkspace,
  goiApi,
  tinTrongDb,
} from './giup.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
// `afterEach` của file chờ sổ ĐẦU TIÊN, rồi mới gỡ kênh giả.
const bay = soRequestBay();
const { it, beforeEach } = caQuaSo(bay);

const MAT_KHAU = 'mat-khau-gia-cua-chu-2026';
const MAT_KHAU_MOI = 'mat-khau-moi-gia-cua-chu-2027';
const TOKEN_AGENT = 'bt_token_gia_cua_coordinator_bat16';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** Mốc epoch của một giờ trên tường của chủ (UTC+7), ngày 2026-10-06. */
function gioVN(gio: number, phut = 0): number {
  return Date.UTC(2026, 9, 6, gio, phut) - MUI_GIO_CHU_PHUT * 60_000;
}
const TRUA = gioVN(12);
const DEM = gioVN(2);

/* ------------------------------------------------------------------ *
 * Dựng nền
 * ------------------------------------------------------------------ */

beforeEach(async () => {
  await dungWorkspace();
  const p1 = await dungDuAn('SAI', 'Sample');
  await dungAgentCoToken({
    id: 'ag-coord-b16',
    ten: 'CoS',
    vai_tro: 'coordinator',
    token: TOKEN_AGENT,
    vao_tat_ca_du_an: true,
    du_an: [p1],
  });
  boNguonTelegram();
});

afterEach(async () => {
  // Thân ca hết giờ có thể còn dùng kênh giả: chờ nó xong trước (BAT-54).
  await bay.doiHet();
  boNguonTelegram();
});

function goi(
  duong: string,
  tc: { method?: string; than?: unknown; cookie?: string; ua?: string; token?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {};
  let body: string | undefined;
  if (tc.than !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(tc.than);
  }
  if (tc.cookie !== undefined) headers['cookie'] = tc.cookie;
  if (tc.token !== undefined) headers['authorization'] = `Bearer ${tc.token}`;
  if (tc.ua !== undefined) headers['user-agent'] = tc.ua;
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

async function thietLap(): Promise<string> {
  const res = await goiApi('/v1/chu/thiet-lap', TOKEN_CHU, {
    method: 'POST',
    than: { mat_khau: MAT_KHAU, ten: 'Chủ' },
  });
  expect(res.status).toBe(201);
  return secretTuUri((await res.json<{ otpauth: string }>()).otpauth);
}

async function dangNhap(secret: string, buoc: number, mat_khau = MAT_KHAU): Promise<string> {
  const res = await SELF.fetch('https://baton.test/v1/dang-nhap', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ mat_khau, ma_totp: await maTotpCuaBuoc(secret, buoc) }),
  });
  const set = res.headers.get('set-cookie');
  const cookie = set === null ? null : (/baton_phien=([^;]*)/.exec(set)?.[0] ?? null);
  if (cookie === null) throw new Error(`đăng nhập trượt: ${String(res.status)}`);
  return cookie;
}

function doiMatKhau(
  cookie: string,
  than: { mat_khau_cu: unknown; ma_totp: unknown; mat_khau_moi: unknown },
): Promise<Response> {
  return goi('/v1/chu/doi-mat-khau', { method: 'POST', cookie, than, ua: UA });
}

interface DongNhatKy {
  id: string;
  luc: number;
  nguoi_loai: string;
  agent_id: string | null;
  project_id: string | null;
  quyet_dinh: string;
  vi_sao: string;
}

async function nhatKy(): Promise<DongNhatKy[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao
       FROM nhat_ky WHERE workspace_id = ? ORDER BY luc, id`,
  )
    .bind(WS)
    .all<DongNhatKy>();
  return results;
}

interface DongTinBaoMat {
  id: string;
  loai: string;
  uu_tien: string;
  noi_dung: string;
  bao_mat: string | null;
  gui_telegram_luc: number | null;
  gui_so_lan_thu: number;
  bo_qua_gui_luc: number | null;
}

async function tinBaoMat(): Promise<DongTinBaoMat[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, loai, uu_tien, noi_dung, bao_mat, gui_telegram_luc, gui_so_lan_thu, bo_qua_gui_luc
       FROM thong_bao WHERE workspace_id = ? AND bao_mat IS NOT NULL ORDER BY tao_luc, id`,
  )
    .bind(WS)
    .all<DongTinBaoMat>();
  return results;
}

async function taiKhoan(): Promise<{
  mat_khau_bam: string;
  muoi: string;
  totp_secret: string;
  so_lan_sai: number;
}> {
  const d = await env.DB.prepare(
    'SELECT mat_khau_bam, muoi, totp_secret, so_lan_sai FROM chu_tai_khoan WHERE workspace_id = ?',
  )
    .bind(WS)
    .first<{ mat_khau_bam: string; muoi: string; totp_secret: string; so_lan_sai: number }>();
  if (d === null) throw new Error('chưa có tài khoản');
  return d;
}

/** Không chuỗi bí mật nào trong `chu`; trả danh sách chuỗi lọt (mong đợi rỗng). */
function lo(chu: string, cam: readonly string[]): string[] {
  return cam.filter((s) => s.length > 0 && chu.includes(s));
}

/**
 * Danh sách chuỗi **không được** xuất hiện trong Nhật ký / tin / chữ đã gửi:
 * mật khẩu (cũ, mới), băm + muối của mọi trạng thái tài khoản đã chụp, secret
 * TOTP, id phiên thô và băm của nó, `TOKEN_CHU`, và UA thô (chỉ nhãn rút gọn).
 */
async function biMatCam(tc: {
  secret: string;
  tai_khoan: readonly { mat_khau_bam: string; muoi: string; totp_secret: string }[];
  cookies: readonly string[];
  /** Chuỗi cấm riêng của ca (vd secret TOTP mới, mật khẩu sai đã gõ). */
  them?: readonly string[];
}): Promise<string[]> {
  const cam = [MAT_KHAU, MAT_KHAU_MOI, tc.secret, TOKEN_CHU, 'Mozilla/5.0', ...(tc.them ?? [])];
  for (const t of tc.tai_khoan) cam.push(t.mat_khau_bam, t.muoi, t.totp_secret);
  for (const ck of tc.cookies) {
    const id = ck.slice('baton_phien='.length);
    cam.push(id, await bamIdPhien(id));
  }
  return cam;
}

/** Quét Nhật ký + mọi tin bảo mật + chữ kênh giả đã nhận; trả chuỗi lọt (mong đợi rỗng). */
async function quetBiMat(
  da_gui: readonly unknown[],
  tc: Parameters<typeof biMatCam>[0],
): Promise<string[]> {
  return lo(JSON.stringify([await nhatKy(), await tinBaoMat(), da_gui]), await biMatCam(tc));
}

/* ================================================================== *
 * Việc 1 — đổi mật khẩu thành công
 * ================================================================== */

describe('19.12 câu 3 d.594 — đổi mật khẩu THÀNH CÔNG: đúng 1 dòng Nhật ký + đúng 1 tin Telegram', () => {
  // Đăng nhập bằng mã bước `g - 1`: mốc bước không được nhảy giữa ca (BAT-51).
  beforeEach(() => choBuocTotpConDu());

  it('một dòng Nhật ký (chủ, Chung, có thiết bị) + một tin bảo mật khẩn; cron gửi đúng 1 tin, có câu "Nếu không phải anh làm…", link /cai-dat', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const cookie = await dangNhap(secret, g - 1);
    const truoc = await taiKhoan();

    const res = await doiMatKhau(cookie, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: MAT_KHAU_MOI,
    });
    expect(res.status).toBe(200);

    const nk = await nhatKy();
    expect(nk).toHaveLength(1);
    expect(nk[0]).toMatchObject({
      nguoi_loai: 'chu',
      agent_id: null,
      project_id: null,
      quyet_dinh: 'Đổi mật khẩu tài khoản chủ.',
    });
    expect(nk[0]?.vi_sao).toContain('Chrome · macOS');

    const tin = await tinBaoMat();
    expect(tin).toHaveLength(1);
    expect(tin[0]).toMatchObject({ loai: 'can_chu_do', uu_tien: 'khan', bao_mat: 'doi_mat_khau' });

    const kenh = datNguonTelegram();
    const kq = await quetGuiThongBao(env, TRUA);
    expect(kq.so_gui).toBe(1);
    expect(kenh.da_gui).toHaveLength(1);
    expect(kenh.da_gui[0]?.noi_dung).toContain(CAU_NEU_KHONG_PHAI_ANH);
    expect(kenh.da_gui[0]?.link).toBe('https://baton.test/cai-dat');

    // Lượt quét thứ hai không gửi lại.
    await quetGuiThongBao(env, TRUA);
    expect(kenh.soLanGoi()).toBe(1);

    // KHÔNG bí mật nào trong tin, dòng Nhật ký hay chữ đã gửi.
    const sau = await taiKhoan();
    expect(
      await quetBiMat(kenh.da_gui, { secret, tai_khoan: [truoc, sau], cookies: [cookie] }),
    ).toEqual([]);
  });

  it('Telegram TRƯỢT ⇒ đổi mật khẩu VẪN thành công (d.606); tin giữ trong kho, chờ thử lại', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const cookie = await dangNhap(secret, g - 1);
    const kenh = datNguonTelegram({ loi: 'Telegram trả mã 502. (giả lập)' });
    const truoc = await taiKhoan();

    const res = await doiMatKhau(cookie, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: MAT_KHAU_MOI,
    });
    expect(res.status).toBe(200);

    const kq = await quetGuiThongBao(env, TRUA);
    expect([kq.so_gui, kq.so_truot]).toEqual([0, 1]);
    expect(kenh.soLanGoi()).toBe(1);

    // Mật khẩu đã đổi thật, phiên hiện tại còn sống.
    expect((await taiKhoan()).mat_khau_bam).not.toBe(truoc.mat_khau_bam);
    expect((await goi('/v1/toi', { cookie })).status).toBe(200);
    // Tin còn trong kho (chuông), đã nhích một lần thử, chưa có mốc gửi.
    const tin = await tinBaoMat();
    expect(tin).toHaveLength(1);
    expect(tin[0]).toMatchObject({ gui_telegram_luc: null, gui_so_lan_thu: 1 });
  });

  it('mật khẩu mới TRÙNG cũ → 422, KHÔNG dòng Nhật ký, KHÔNG tin', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const cookie = await dangNhap(secret, g - 1);
    const res = await doiMatKhau(cookie, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g),
      mat_khau_moi: MAT_KHAU,
    });
    expect(res.status).toBe(422);
    expect(await nhatKy()).toEqual([]);
    expect(await tinBaoMat()).toEqual([]);
  });
});

/* ================================================================== *
 * Việc 1 — đăng xuất mọi nơi, đặt lại TOTP
 * ================================================================== */

describe('đăng xuất mọi nơi → 1 dòng Nhật ký + 1 tin', () => {
  beforeEach(() => choBuocTotpConDu());

  it('qua cookie: Nhật ký ghi thiết bị, tin gửi được, số phiên đúng; KHÔNG bí mật nào lọt', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const cookie = await dangNhap(secret, g - 1);
    // Phiên thứ hai: id/băm của nó cũng phải không lọt.
    const cookie_2 = await dangNhap(secret, g);
    const tk = await taiKhoan();
    const res = await goi('/v1/dang-xuat-moi-noi', { method: 'POST', cookie, ua: UA });
    expect(res.status).toBe(200);

    const nk = await nhatKy();
    expect(nk).toHaveLength(1);
    expect(nk[0]?.quyet_dinh).toBe('Đăng xuất mọi nơi khỏi tài khoản chủ.');
    expect(nk[0]?.vi_sao).toContain('Chrome · macOS');
    expect(nk[0]?.vi_sao).toContain('2 phiên bị đăng xuất');

    const tin = await tinBaoMat();
    expect(tin.map((t) => t.bao_mat)).toEqual(['dang_xuat_moi_noi']);

    const kenh = datNguonTelegram();
    await quetGuiThongBao(env, TRUA);
    expect(kenh.da_gui).toHaveLength(1);
    expect(kenh.da_gui[0]?.noi_dung).toContain(CAU_NEU_KHONG_PHAI_ANH);

    // Quét bí mật y như ca đổi mật khẩu: Nhật ký, tin, chữ gửi Telegram giả lập.
    expect(
      await quetBiMat(kenh.da_gui, { secret, tai_khoan: [tk], cookies: [cookie, cookie_2] }),
    ).toEqual([]);
  });

  it('qua TOKEN_CHU (không cookie): KHÔNG bí mật nào lọt, kể cả token máy chủ', async () => {
    const secret = await thietLap();
    const cookie = await dangNhap(secret, buocTotp(Date.now()));
    const tk = await taiKhoan();
    const res = await goi('/v1/dang-xuat-moi-noi', { method: 'POST', token: TOKEN_CHU, ua: UA });
    expect(res.status).toBe(200);
    const kenh = datNguonTelegram();
    await quetGuiThongBao(env, TRUA);
    expect(kenh.da_gui).toHaveLength(1);
    expect(await quetBiMat(kenh.da_gui, { secret, tai_khoan: [tk], cookies: [cookie] })).toEqual([]);
  });

  /*
   * BAT-17 — nguồn ghi vào Nhật ký theo **cách xác thực thật** của request (cờ
   * của middleware), không theo việc header có cookie. Middleware cho cookie
   * **sống** thắng (web không gửi Authorization); cookie chết thì rơi xuống
   * nhánh token. Nên: token + cookie chết ⇒ nguồn token; token + cookie sống ⇒
   * request thật sự vào bằng phiên ⇒ nguồn phiên.
   */
  describe('BAT-17: nguồn Nhật ký = cách xác thực thật', () => {
    async function viSaoDuyNhat(): Promise<string> {
      const nk = await nhatKy();
      expect(nk).toHaveLength(1);
      return nk[0]?.vi_sao ?? '';
    }

    it('chỉ cookie → nguồn phiên web', async () => {
      const secret = await thietLap();
      const cookie = await dangNhap(secret, buocTotp(Date.now()));
      expect((await goi('/v1/dang-xuat-moi-noi', { method: 'POST', cookie, ua: UA })).status).toBe(200);
      const vs = await viSaoDuyNhat();
      expect(vs).toContain('phiên web Chrome · macOS');
      expect(vs).not.toContain('token máy chủ');
    });

    it('chỉ TOKEN_CHU → nguồn token máy chủ', async () => {
      const secret = await thietLap();
      await dangNhap(secret, buocTotp(Date.now()));
      expect((await goi('/v1/dang-xuat-moi-noi', { method: 'POST', token: TOKEN_CHU, ua: UA })).status).toBe(200);
      const vs = await viSaoDuyNhat();
      expect(vs).toContain('token máy chủ');
      expect(vs).not.toContain('phiên web');
    });

    it('TOKEN_CHU + cookie CŨ đã huỷ còn trong trình duyệt → nguồn token máy chủ (trước BAT-17 ghi nhầm "phiên web")', async () => {
      const secret = await thietLap();
      const g = buocTotp(Date.now());
      const cu = await dangNhap(secret, g - 1);
      expect((await goi('/v1/dang-xuat', { method: 'POST', cookie: cu })).status).toBe(200);
      const song = await dangNhap(secret, g);

      const res = await goi('/v1/dang-xuat-moi-noi', {
        method: 'POST',
        token: TOKEN_CHU,
        cookie: cu,
        ua: UA,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ so_phien_da_huy: 1 });
      const vs = await viSaoDuyNhat();
      expect(vs).toContain('token máy chủ');
      expect(vs).not.toContain('phiên web');
      expect((await goi('/v1/toi', { cookie: song })).status).toBe(401);
    });

    it('TOKEN_CHU + cookie SỐNG → middleware xác thực bằng phiên ⇒ nguồn phiên web', async () => {
      const secret = await thietLap();
      const cookie = await dangNhap(secret, buocTotp(Date.now()));
      const res = await goi('/v1/dang-xuat-moi-noi', {
        method: 'POST',
        token: TOKEN_CHU,
        cookie,
        ua: UA,
      });
      expect(res.status).toBe(200);
      const vs = await viSaoDuyNhat();
      expect(vs).toContain('phiên web Chrome · macOS');
      expect(vs).not.toContain('token máy chủ');
    });

    /*
     * Ca nêu ở chú thích `hanPhienHienTai` (index.ts) và `xuLyDangXuat`: cookie
     * SỐNG nhưng bộ đếm `phien:<băm>` đã chạm trần ⇒ middleware bỏ nhánh cookie,
     * đi nhánh token (xac-thuc.ts). Request thật sự vào bằng TOKEN_CHU, nên
     * không có phiên hiện tại nào.
     */
    it('TOKEN_CHU + cookie SỐNG nhưng HẾT HẠN MỨC NHỊP → /v1/toi không có phiên; đăng xuất một phiên không huỷ nó; mọi nơi ghi nguồn token', async () => {
      const secret = await thietLap();
      const cookie = await dangNhap(secret, buocTotp(Date.now()));
      const bam = await bamIdPhien(cookie.slice('baton_phien='.length));
      const ns = env.GIOI_HAN_TOKEN;
      const stub = ns.get(ns.idFromName(`token:phien:${bam}`));
      await runInDurableObject(stub, (dem: GioiHanToken) => {
        for (let i = 0; i < GIOI_HAN_MOI_PHUT; i += 1) dem.dem();
      });
      // Đối chứng: cookie một mình bị 429 — bộ đếm đã đầy thật.
      expect((await goi('/v1/toi', { cookie })).status).toBe(429);

      const toi = await goi('/v1/toi', { token: TOKEN_CHU, cookie });
      expect(toi.status).toBe(200);
      expect(await toi.json()).toMatchObject({ loai: 'chu', phien_het_luc: null });

      const mot = await goi('/v1/dang-xuat', { method: 'POST', token: TOKEN_CHU, cookie, ua: UA });
      expect(mot.status).toBe(200);
      expect(await mot.json()).toMatchObject({ moi_noi: false, so_phien_da_huy: 0 });
      const huy = async (): Promise<number | null | undefined> =>
        (
          await env.DB.prepare('SELECT huy_luc FROM chu_phien WHERE bam = ?')
            .bind(bam)
            .first<{ huy_luc: number | null }>()
        )?.huy_luc;
      expect(await huy()).toBeNull();
      expect(await nhatKy()).toEqual([]);

      const moi_noi = await goi('/v1/dang-xuat-moi-noi', {
        method: 'POST',
        token: TOKEN_CHU,
        cookie,
        ua: UA,
      });
      expect(moi_noi.status).toBe(200);
      expect(await moi_noi.json()).toMatchObject({ so_phien_da_huy: 1 });
      const vs = await viSaoDuyNhat();
      expect(vs).toContain('token máy chủ');
      expect(vs).not.toContain('phiên web');
      expect(await huy()).not.toBeNull();
    });

    it('đăng xuất MỘT phiên bằng TOKEN_CHU + cookie hết hạn (chưa huỷ): KHÔNG chạm dòng của cookie không ai kiểm', async () => {
      await thietLap();
      const id = 'id-phien-gia-het-han-bat17-000000000000000';
      const bam = await bamIdPhien(id);
      const xua = Date.now() - 40 * 86_400_000;
      await env.DB.prepare(
        `INSERT INTO chu_phien (bam, workspace_id, tao_luc, het_luc, huy_luc, dung_cuoi_luc, tao_tu_ua)
         VALUES (?, ?, ?, ?, NULL, ?, NULL)`,
      )
        .bind(bam, WS, xua, xua + 30 * 86_400_000, xua)
        .run();

      const res = await goi('/v1/dang-xuat', {
        method: 'POST',
        token: TOKEN_CHU,
        cookie: `baton_phien=${id}`,
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ so_phien_da_huy: 0 });
      // Cookie vẫn bị xoá ở trình duyệt.
      expect(res.headers.get('set-cookie')).toContain('baton_phien=');
      const d = await env.DB.prepare('SELECT huy_luc FROM chu_phien WHERE bam = ?')
        .bind(bam)
        .first<{ huy_luc: number | null }>();
      expect(d?.huy_luc).toBeNull();
      expect(await nhatKy()).toEqual([]);
    });
  });

  it('đăng xuất MỘT phiên (không phải mọi nơi) thì không ghi gì', async () => {
    const secret = await thietLap();
    const cookie = await dangNhap(secret, buocTotp(Date.now()));
    expect((await goi('/v1/dang-xuat', { method: 'POST', cookie })).status).toBe(200);
    expect(await nhatKy()).toEqual([]);
    expect(await tinBaoMat()).toEqual([]);
  });
});

describe('đặt lại TOTP (d.594 "đặt lại TOTP") → 1 dòng Nhật ký + 1 tin, không lộ secret mới', () => {
  it('qua TOKEN_CHU: KHÔNG bí mật nào lọt (secret TOTP cũ + mới, mật khẩu, băm/muối, token, UA thô, id/băm phiên) ở Nhật ký, tin, chữ Telegram', async () => {
    const secret_cu = await thietLap();
    // Một phiên đang mở trước khi đặt lại: id/băm của nó cũng không được lọt.
    const cookie = await dangNhap(secret_cu, buocTotp(Date.now()));
    const truoc = await taiKhoan();
    const res = await goi('/v1/chu/dat-lai-totp', { method: 'POST', token: TOKEN_CHU, than: {}, ua: UA });
    expect(res.status).toBe(200);
    const secret_moi = secretTuUri((await res.json<{ otpauth: string }>()).otpauth);
    expect(secret_moi).not.toBe(secret_cu);
    const sau = await taiKhoan();

    const nk = await nhatKy();
    expect(nk).toHaveLength(1);
    expect(nk[0]?.vi_sao).toContain('token máy chủ');
    const tin = await tinBaoMat();
    expect(tin.map((t) => t.bao_mat)).toEqual(['dat_lai_totp']);
    expect(tin[0]?.noi_dung).toContain(CAU_NEU_KHONG_PHAI_ANH);

    const kenh = datNguonTelegram();
    await quetGuiThongBao(env, TRUA);
    expect(kenh.da_gui).toHaveLength(1);
    expect(kenh.da_gui[0]?.noi_dung).toContain(CAU_NEU_KHONG_PHAI_ANH);
    expect(
      await quetBiMat(kenh.da_gui, {
        secret: secret_cu,
        tai_khoan: [truoc, sau],
        cookies: [cookie],
        them: [secret_moi],
      }),
    ).toEqual([]);
  });
});

/* ================================================================== *
 * Việc 1 — nhập sai liên tiếp ở đường đổi mật khẩu
 * ================================================================== */

describe(`đổi mật khẩu sai ${String(NGUONG_CANH_BAO_SAI)} lần liên tiếp → cảnh báo; 2 lần thì chưa`, () => {
  beforeEach(() => choBuocTotpConDu());

  it('sai MẬT KHẨU CŨ: lần 1–2 im, lần 3 có Nhật ký + tin; lần 4 báo tiếp (chính sách mọi lần từ lần 3)', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const cookie = await dangNhap(secret, g - 1);
    const sai = async (): Promise<number> =>
      (
        await doiMatKhau(cookie, {
          mat_khau_cu: 'mat-khau-cu-sai-hoan-toan',
          ma_totp: await maTotpCuaBuoc(secret, g),
          mat_khau_moi: MAT_KHAU_MOI,
        })
      ).status;

    expect([await sai(), await sai()]).toEqual([401, 401]);
    expect(await nhatKy()).toEqual([]);
    expect(await tinBaoMat()).toEqual([]);

    expect(await sai()).toBe(401);
    const nk = await nhatKy();
    expect(nk).toHaveLength(1);
    expect(nk[0]?.quyet_dinh).toContain('3 lần nhập sai liên tiếp');
    const tin = await tinBaoMat();
    expect(tin.map((t) => [t.bao_mat, t.uu_tien])).toEqual([['sai_lien_tiep', 'khan']]);

    const kenh = datNguonTelegram();
    await quetGuiThongBao(env, TRUA);
    expect(kenh.da_gui).toHaveLength(1);
    expect(kenh.da_gui[0]?.noi_dung).toContain(CAU_NEU_KHONG_PHAI_ANH);
    expect(
      await quetBiMat(kenh.da_gui, {
        secret,
        tai_khoan: [await taiKhoan()],
        cookies: [cookie],
        them: ['mat-khau-cu-sai-hoan-toan'],
      }),
    ).toEqual([]);

    expect(await sai()).toBe(401);
    expect(await tinBaoMat()).toHaveLength(2);
    expect((await nhatKy()).at(-1)?.quyet_dinh).toContain('4 lần');
  });

  it('sai MÃ TOTP (mật khẩu cũ đúng) 3 lần → cũng cảnh báo; 2 lần thì chưa', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const cookie = await dangNhap(secret, g - 1);
    // Mã của bước g−1 đã tiêu ở lần đăng nhập: đúng hình, nhưng là mã dùng lại.
    const ma_cu = await maTotpCuaBuoc(secret, g - 1);
    const sai = async (): Promise<number> =>
      (await doiMatKhau(cookie, { mat_khau_cu: MAT_KHAU, ma_totp: ma_cu, mat_khau_moi: MAT_KHAU_MOI }))
        .status;

    expect([await sai(), await sai()]).toEqual([401, 401]);
    expect(await tinBaoMat()).toEqual([]);
    expect(await sai()).toBe(401);
    expect((await tinBaoMat()).map((t) => t.bao_mat)).toEqual(['sai_lien_tiep']);
    expect(await nhatKy()).toHaveLength(1);
  });

  it('bộ đếm DÙNG CHUNG (#98): đăng nhập sai KHÔNG tự bắn tin, nhưng được tính vào ngưỡng của đường đổi mật khẩu', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const cookie = await dangNhap(secret, g - 1);
    for (let i = 0; i < 2; i += 1) {
      const r = await SELF.fetch('https://baton.test/v1/dang-nhap', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mat_khau: 'sai-o-dang-nhap-xxx', ma_totp: '000000' }),
      });
      expect(r.status).toBe(401);
    }
    expect(await tinBaoMat()).toEqual([]);
    expect((await taiKhoan()).so_lan_sai).toBe(2);

    await doiMatKhau(cookie, {
      mat_khau_cu: 'mat-khau-cu-sai-hoan-toan',
      ma_totp: '000000',
      mat_khau_moi: MAT_KHAU_MOI,
    });
    expect((await tinBaoMat()).map((t) => t.bao_mat)).toEqual(['sai_lien_tiep']);
  });

  it('BAT-17: sai 2 lần → lần 3 qua ĐỦ hai lớp nhưng mật khẩu mới trùng (422) ⇒ bộ đếm về 0; lần sai tiếp theo KHÔNG cảnh báo', async () => {
    const secret = await thietLap();
    const g = buocTotp(Date.now());
    const cookie = await dangNhap(secret, g - 1);
    // Phiên thứ hai — để kiểm 422 không huỷ phiên nào. Bước g tiêu ở đây; đổi mật khẩu dùng g+1.
    const khac = await dangNhap(secret, g);
    const sai = async (ma_buoc: number): Promise<number> =>
      (
        await doiMatKhau(cookie, {
          mat_khau_cu: 'mat-khau-cu-sai-hoan-toan',
          ma_totp: await maTotpCuaBuoc(secret, ma_buoc),
          mat_khau_moi: MAT_KHAU_MOI,
        })
      ).status;

    const g2 = g + 1;
    expect([await sai(g2), await sai(g2)]).toEqual([401, 401]);
    expect((await taiKhoan()).so_lan_sai).toBe(2);
    const truoc = await taiKhoan();

    const trung = await doiMatKhau(cookie, {
      mat_khau_cu: MAT_KHAU,
      ma_totp: await maTotpCuaBuoc(secret, g2),
      mat_khau_moi: MAT_KHAU,
    });
    expect(trung.status).toBe(422);
    const sau = await taiKhoan();
    expect(sau.so_lan_sai).toBe(0);
    // 422 không đổi mật khẩu, không huỷ phiên nào, không ghi Nhật ký/tin.
    expect([sau.mat_khau_bam, sau.muoi, sau.totp_secret]).toEqual([truoc.mat_khau_bam, truoc.muoi, truoc.totp_secret]);
    expect((await goi('/v1/toi', { cookie })).status).toBe(200);
    expect((await goi('/v1/toi', { cookie: khac })).status).toBe(200);
    const huy = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM chu_phien WHERE workspace_id = ? AND huy_luc IS NOT NULL',
    )
      .bind(WS)
      .first<{ n: number }>();
    expect(huy?.n).toBe(0);
    expect(await nhatKy()).toEqual([]);
    expect(await tinBaoMat()).toEqual([]);

    // Một lần sai nữa: bộ đếm lên 1, KHÔNG phải 3 ⇒ không dòng Nhật ký, không tin.
    expect(await sai(g2)).toBe(401);
    expect((await taiKhoan()).so_lan_sai).toBe(1);
    expect(await nhatKy()).toEqual([]);
    expect(await tinBaoMat()).toEqual([]);
    const kenh = datNguonTelegram();
    await quetGuiThongBao(env, TRUA);
    expect(kenh.da_gui).toEqual([]);
  });

  it('canCanhBaoSai: biên đúng ngưỡng 3', () => {
    expect([1, 2, 3, 4, 50].map(canCanhBaoSai)).toEqual([false, false, true, true, true]);
  });
});

/* ================================================================== *
 * Giờ yên lặng — d.350
 * ================================================================== */

describe('d.350 — tin bảo mật gửi CẢ TRONG giờ yên lặng', () => {
  it('02:00 giờ chủ: tin bảo mật đi ngay, tin thường bị hoãn (đối chứng)', async () => {
    const secret = await thietLap();
    const cookie = await dangNhap(secret, buocTotp(Date.now()));
    expect((await goi('/v1/dang-xuat-moi-noi', { method: 'POST', cookie })).status).toBe(200);
    await dungTin('tb-thuong', { loai: 'phien_dung', tao_luc: DEM });

    const kenh = datNguonTelegram();
    const kq = await quetGuiThongBao(env, DEM);
    expect([kq.so_gui, kq.so_hoan]).toEqual([1, 1]);
    expect(kenh.da_gui).toHaveLength(1);
    expect(kenh.da_gui[0]?.noi_dung).toContain('đăng xuất mọi nơi');
  });
});

/* ================================================================== *
 * Việc 2 — công tắc từng loại
 * ================================================================== */

interface CongTacRa {
  cong_tac: string;
  nhan: string;
  bat: boolean;
  khoa: boolean;
  ly_do_khoa: string | null;
}

async function docCongTac(token = TOKEN_CHU): Promise<Response> {
  return goiApi('/v1/cai-dat/thong-bao', token);
}

async function datCongTac(cong_tac: string, bat: unknown, token = TOKEN_CHU): Promise<Response> {
  return goiApi(`/v1/cai-dat/thong-bao/${cong_tac}`, token, { method: 'PUT', than: { bat } });
}

describe('mục 12 d.348 — công tắc từng loại: mặc định tất cả bật', () => {
  it('GET: đủ mọi công tắc + công tắc bảo mật KHOÁ có giải thích; không có dòng nào = bật', async () => {
    const res = await docCongTac();
    expect(res.status).toBe(200);
    const { items } = await res.json<{ items: CongTacRa[] }>();
    expect(items.map((i) => i.cong_tac)).toEqual([...CONG_TAC_THONG_BAO, CONG_TAC_BAO_MAT]);
    expect(items.every((i) => i.bat)).toBe(true);
    expect(items.every((i) => i.nhan.length > 0)).toBe(true);
    const bm = items.at(-1)!;
    expect(bm.khoa).toBe(true);
    expect(bm.ly_do_khoa).toMatch(/giờ yên lặng/);
    expect(items.filter((i) => i.khoa)).toHaveLength(1);
  });

  it('mặc định: không đổi công tắc nào thì mọi loại vẫn gửi như trước', async () => {
    for (const [i, loai] of ['phien_dung', 'phien_loi', 'bao_cao_sang', 'bao_cao_toi'].entries()) {
      await dungTin(`tb-${String(i)}`, { loai, tao_luc: TRUA });
    }
    const kenh = datNguonTelegram();
    const kq = await quetGuiThongBao(env, TRUA);
    expect([kq.so_gui, kq.so_tat]).toEqual([4, 0]);
    expect(kenh.da_gui).toHaveLength(4);
  });

  it('PUT tắt rồi bật lại — GET phản ánh đúng', async () => {
    expect((await datCongTac('ticket_xong', false)).status).toBe(200);
    let { items } = await (await docCongTac()).json<{ items: CongTacRa[] }>();
    expect(items.find((i) => i.cong_tac === 'ticket_xong')?.bat).toBe(false);
    expect(items.filter((i) => !i.bat)).toHaveLength(1);

    const r = await datCongTac('ticket_xong', true);
    expect(await r.json()).toMatchObject({ cong_tac: 'ticket_xong', bat: true });
    ({ items } = await (await docCongTac()).json<{ items: CongTacRa[] }>());
    expect(items.every((i) => i.bat)).toBe(true);
  });
});

describe('mục 12 d.348 — tắt = KHÔNG gửi Telegram, tin VẪN ở chuông', () => {
  it('tắt 1 loại: loại đó không gửi (đánh dấu bỏ gửi, vẫn trong kho); loại khác vẫn gửi; bật lại không gửi bù', async () => {
    expect((await datCongTac('phien_dung', false)).status).toBe(200);
    await dungTin('tb-dung', { loai: 'phien_dung', tao_luc: TRUA, noi_dung: 'Phiên đứng' });
    await dungTin('tb-loi', { loai: 'phien_loi', tao_luc: TRUA + 1, noi_dung: 'Phiên lỗi' });

    const kenh = datNguonTelegram();
    const kq = await quetGuiThongBao(env, TRUA);
    expect([kq.so_gui, kq.so_tat]).toEqual([1, 1]);
    expect(kenh.da_gui.map((t) => t.noi_dung)).toEqual(['Phiên lỗi']);

    const dung = await env.DB.prepare(
      'SELECT gui_telegram_luc, bo_qua_gui_luc, doc_luc, gui_so_lan_thu FROM thong_bao WHERE id = ?',
    )
      .bind('tb-dung')
      .first<{ gui_telegram_luc: number | null; bo_qua_gui_luc: number | null; doc_luc: number | null; gui_so_lan_thu: number }>();
    expect(dung).toMatchObject({ gui_telegram_luc: null, doc_luc: null, gui_so_lan_thu: 0 });
    expect(dung?.bo_qua_gui_luc).not.toBeNull();

    // Lượt sau: không đọc lại tin đã bỏ (rời hàng chờ), không gửi gì thêm.
    const lan_2 = await quetGuiThongBao(env, TRUA);
    expect(lan_2.so_dong).toBe(0);

    // Bật lại: tin cũ KHÔNG gửi bù; tin mới thì gửi.
    await datCongTac('phien_dung', true);
    await dungTin('tb-dung-2', { loai: 'phien_dung', tao_luc: TRUA + 2, noi_dung: 'Phiên đứng lần 2' });
    await quetGuiThongBao(env, TRUA);
    expect(kenh.da_gui.map((t) => t.noi_dung)).toEqual(['Phiên lỗi', 'Phiên đứng lần 2']);
  });

  it('tách hai công tắc 🔴: tắt "🔴 mới" thì tin khan không gửi, lời nhắc (thuong) vẫn gửi, TIN BẢO MẬT vẫn gửi', async () => {
    expect((await datCongTac('can_chu_do_moi', false)).status).toBe(200);
    await dungTin('tb-moi', { loai: 'can_chu_do', uu_tien: 'khan', tao_luc: TRUA, noi_dung: '🔴 mới' });
    await dungTin('tb-nhac', { loai: 'can_chu_do', uu_tien: 'thuong', tao_luc: TRUA + 1, noi_dung: '🔴 nhắc' });
    await env.DB.prepare(
      `INSERT INTO thong_bao (id, workspace_id, loai, uu_tien, noi_dung, bao_mat, tao_luc)
       VALUES ('tb-bm', ?, 'can_chu_do', 'khan', 'tin bảo mật', 'doi_mat_khau', ?)`,
    )
      .bind(WS, TRUA + 2)
      .run();

    const kenh = datNguonTelegram();
    await quetGuiThongBao(env, TRUA);
    expect(kenh.da_gui.map((t) => t.noi_dung)).toEqual(['🔴 nhắc', 'tin bảo mật']);
    expect((await tinTrongDb('tb-moi'))?.gui_telegram_luc).toBeNull();
  });

  it('cửa ghi kiểm LẠI công tắc: chủ bật lại giữa chừng ⇒ không đánh dấu bỏ gửi', async () => {
    await dungTin('tb-1', { loai: 'phien_dung', tao_luc: TRUA });
    const kq = await goiGhiMocGui(env, { workspace_id: WS, thong_bao_id: 'tb-1', ket_qua: { tat: true } });
    expect(kq.da_ghi).toBe(false);
    const d = await env.DB.prepare('SELECT bo_qua_gui_luc FROM thong_bao WHERE id = ?')
      .bind('tb-1')
      .first<{ bo_qua_gui_luc: number | null }>();
    expect(d?.bo_qua_gui_luc).toBeNull();
  });
});

describe('tin bảo mật KHÔNG tắt được — API, luật thuần, DB', () => {
  it('PUT tắt `bao_mat_tai_khoan` → 403 FORBIDDEN có câu rõ; bật thì 200 (không ghi gì)', async () => {
    const r = await datCongTac(CONG_TAC_BAO_MAT, false);
    expect(r.status).toBe(403);
    const than = await r.json<{ error: string; message: string }>();
    expect(than.error).toBe('FORBIDDEN');
    expect(than.message).toContain('Không tắt được tin bảo mật');
    expect((await datCongTac(CONG_TAC_BAO_MAT, true)).status).toBe(200);
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM cai_dat_thong_bao').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('DB: CHECK không nhận mã `bao_mat_tai_khoan`; trigger chặn bỏ gửi tin bảo mật và tin bảo mật không khẩn', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO cai_dat_thong_bao (workspace_id, cong_tac, bat, cap_nhat_luc)
         VALUES (?, 'bao_mat_tai_khoan', 0, 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow(/CHECK/);

    await expect(
      env.DB.prepare(
        `INSERT INTO thong_bao (id, workspace_id, loai, uu_tien, noi_dung, bao_mat, tao_luc)
         VALUES ('x', ?, 'can_chu_do', 'thuong', 'x', 'doi_mat_khau', 1)`,
      )
        .bind(WS)
        .run(),
    ).rejects.toThrow(/tin bao mat/);

    await env.DB.prepare(
      `INSERT INTO thong_bao (id, workspace_id, loai, uu_tien, noi_dung, bao_mat, tao_luc)
       VALUES ('bm', ?, 'can_chu_do', 'khan', 'x', 'doi_mat_khau', 1)`,
    )
      .bind(WS)
      .run();
    await expect(
      env.DB.prepare("UPDATE thong_bao SET bo_qua_gui_luc = 5 WHERE id = 'bm'").run(),
    ).rejects.toThrow(/khong bo gui duoc/);
    await expect(
      env.DB.prepare("UPDATE thong_bao SET bao_mat = NULL WHERE id = 'bm'").run(),
    ).rejects.toThrow(/khong sua duoc/);
  });

  it('luật thuần: tinBiTat/quyetDinhGuiTin bỏ qua cờ tắt với tin bảo mật', () => {
    const tat = new Set<string>([...CONG_TAC_THONG_BAO, CONG_TAC_BAO_MAT]);
    expect(tinBiTat({ loai: 'can_chu_do', uu_tien: 'khan', bao_mat: 'doi_mat_khau' }, tat)).toBe(false);
    const tin = {
      loai: 'can_chu_do',
      uu_tien: 'khan' as const,
      bao_mat: 'sai_lien_tiep',
      gui_telegram_luc: null,
      gui_so_lan_thu: 0,
      gui_thu_lai_luc: null,
    };
    expect(quyetDinhGuiTin(tin, DEM, { tat: true }).hanh_dong).toBe('gui');
    expect(quyetDinhGuiTin({ ...tin, bao_mat: null }, TRUA, { tat: true }).hanh_dong).toBe('tat');
  });
});

/*
 * BAT-17 điểm 4 — phương án B: tin bảo mật GIỮ `loai = 'can_chu_do'` (thêm mã
 * mới buộc sửa CHECK của 0012 + trigger của 0026 ⇒ cần migration). Ca này ghim
 * rằng việc mượn mã KHÔNG làm tin bảo mật thành một "Cần Chủ 🔴" ở bất kỳ chỗ
 * nào nó đi ra: chữ Telegram, "Cần chú ý" của Tổng quan, và luật nhắc 🔴 2 giờ.
 */
describe('BAT-17: tin bảo mật mượn `loai = can_chu_do` nhưng KHÔNG bao giờ hiện như "Cần Chủ 🔴"', () => {
  it('chữ gửi đi không mang nhãn Cần Chủ; hết lượt thử thì "Cần chú ý" ghi "Không gửi được thông báo Telegram"; không có lời nhắc 🔴', async () => {
    const secret = await thietLap();
    const cookie = await dangNhap(secret, buocTotp(Date.now()));
    expect((await goi('/v1/dang-xuat-moi-noi', { method: 'POST', cookie, ua: UA })).status).toBe(200);
    const [tin] = await tinBaoMat();
    expect(tin).toMatchObject({ loai: 'can_chu_do', bao_mat: 'dang_xuat_moi_noi' });

    // Telegram: chữ là chữ của sự kiện bảo mật, không nhãn 🔴 Cần Chủ nào.
    const kenh = datNguonTelegram({ loi: 'Telegram trả mã 502. (giả lập)' });
    await quetGuiThongBao(env, TRUA);
    expect(kenh.soLanGoi()).toBe(1);
    expect(kenh.da_gui.map((t) => t.noi_dung).join(' ')).not.toMatch(/Cần Chủ/);

    // Hết lượt thử ⇒ lên "Cần chú ý" với nhãn của nguồn "gửi trượt", không "Cần Chủ".
    await env.DB.prepare('UPDATE thong_bao SET gui_so_lan_thu = 4, gui_thu_lai_luc = NULL WHERE id = ?')
      .bind(tin!.id)
      .run();
    const res = await goiApi('/v1/tong-quan', TOKEN_CHU);
    expect(res.status).toBe(200);
    const tq = await res.json<{
      can_chu_y: { ly_do: { loai: string; nhan_loai: string; thong_bao: { id: string } | null }[] }[];
    }>();
    const dong = tq.can_chu_y.flatMap((n) => n.ly_do).filter((x) => x.thong_bao?.id === tin!.id);
    expect(dong.map((x) => [x.loai, x.nhan_loai])).toEqual([
      ['thong_bao_gui_truot', 'Không gửi được thông báo Telegram'],
    ]);
    expect(JSON.stringify(tq.can_chu_y)).not.toMatch(/Cần Chủ/);

    // Luật nhắc 🔴 2 giờ đọc bảng `can_chu`, không đọc `thong_bao.loai`: không lời nhắc nào.
    const nhac = await quetNhacCanChuDo(env, TRUA + 3 * 3_600_000, 0);
    expect(nhac.so_nhac).toBe(0);
    expect(await tinBaoMat()).toHaveLength(1);
  });
});

describe('chỉ chủ — agent FORBIDDEN', () => {
  it('agent PUT công tắc → 403, không ghi gì; agent GET → 403', async () => {
    const r = await datCongTac('phien_dung', false, TOKEN_AGENT);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ error: 'FORBIDDEN' });
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM cai_dat_thong_bao').first<{ n: number }>();
    expect(n?.n).toBe(0);
    expect((await docCongTac(TOKEN_AGENT)).status).toBe(403);
  });

  it('hình dạng sai → 422: mã lạ, `bat` không phải boolean', async () => {
    expect((await datCongTac('khong_co_loai_nay', false)).status).toBe(422);
    expect((await datCongTac('phien_dung', 'tat')).status).toBe(422);
  });
});

/* ================================================================== *
 * Luật thuần — phủ đủ mọi `loai` của 0012; công tắc khớp CHECK của 0026
 * ================================================================== */

describe('công tắc phủ đủ mọi loại tin', () => {
  it('mỗi `loai` của CHECK 0012 có công tắc; mỗi mã công tắc được CHECK của 0026 nhận', async () => {
    const loai_0012 = [
      'can_chu_do',
      'phien_dung',
      'phien_loi',
      'luot_khong_phan_hoi',
      'bang_chung_truot',
      'chua_merge_7_ngay',
      'ticket_xong',
      'bao_cao_sang',
      'bao_cao_toi',
    ];
    for (const loai of loai_0012) {
      expect(congTacCuaTin({ loai, uu_tien: 'thuong' }), loai).not.toBeNull();
    }
    expect(congTacCuaTin({ loai: 'can_chu_do', uu_tien: 'khan' })).toBe('can_chu_do_moi');
    expect(congTacCuaTin({ loai: 'can_chu_do', uu_tien: 'thuong' })).toBe('can_chu_do_nhac');
    expect(congTacCuaTin({ loai: 'can_chu_do', uu_tien: 'khan', bao_mat: 'doi_mat_khau' })).toBe(
      CONG_TAC_BAO_MAT,
    );
    // Loại lạ ⇒ không công tắc nào quản ⇒ luôn gửi.
    expect(congTacCuaTin({ loai: 'loai_moi', uu_tien: 'thuong' })).toBeNull();

    for (const m of CONG_TAC_THONG_BAO) {
      await env.DB.prepare(
        'INSERT INTO cai_dat_thong_bao (workspace_id, cong_tac, bat, cap_nhat_luc) VALUES (?, ?, 0, 1)',
      )
        .bind(WS, m)
        .run();
    }
  });

  it('mọi sự kiện có câu bắt buộc, và mọi mã sự kiện được CHECK của 0026 nhận', async () => {
    for (const [i, sk] of SU_KIEN_BAO_MAT.entries()) {
      const nd = noiDungSuKienBaoMat(sk, { luc: TRUA, thiet_bi: 'Chrome · macOS', so_phien: 2, so_lan_sai: 3 });
      expect(nd.tin, sk).toContain(CAU_NEU_KHONG_PHAI_ANH);
      expect(nd.quyet_dinh.length).toBeGreaterThan(0);
      expect(nd.vi_sao).toContain('12:00 ngày 06/10/2026');
      await env.DB.prepare(
        `INSERT INTO thong_bao (id, workspace_id, loai, uu_tien, noi_dung, bao_mat, tao_luc)
         VALUES (?, ?, 'can_chu_do', 'khan', ?, ?, 1)`,
      )
        .bind(`sk-${String(i)}`, WS, nd.tin, sk)
        .run();
    }
  });
});

/* ================================================================== *
 * Migration 0026 + rollback
 * ================================================================== */

describe('migration 0026 — áp trong chuỗi 0001→0026; rollback KHÔNG tự áp', () => {
  it('chuỗi migration có 0026 (ngay sau 0025), tên đúng nếp, không file rollback nào lọt vào', () => {
    const ten = env.TEST_MIGRATIONS.map((m) => m.name);
    // BAT-37 thêm 0027 sau đó — ca này chỉ ghim vị trí của 0026, không ghim "cuối".
    const i = ten.indexOf('0026_cai_dat_thong_bao_bao_mat.sql');
    expect(i).toBeGreaterThan(0);
    expect(ten[i - 1]).toBe('0025_review_nguon_coordinator.sql');
    expect(ten.filter((t) => /rollback/i.test(t))).toEqual([]);
    for (const t of ten) expect(t).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
  });

  it('file rollback của 0026 có thật (thư mục con), chỉ chú thích `--`, và lược đồ hiện tại là bản SAU 0026', async () => {
    const rb = env.TEST_VAN_BAN_ROLLBACK;
    expect(rb.map((f) => f.ten)).toContain('0026_cai_dat_thong_bao_bao_mat.rollback.sql');
    for (const f of rb) {
      expect(f.noi_dung, f.ten).not.toContain('/*');
      expect(env.TEST_MIGRATIONS.map((m) => m.name)).not.toContain(f.ten);
    }
    const cot = await env.DB.prepare('PRAGMA table_info(thong_bao)').all<{ name: string }>();
    expect(cot.results.map((c) => c.name)).toEqual(expect.arrayContaining(['bao_mat', 'bo_qua_gui_luc']));
    const bang = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cai_dat_thong_bao'",
    ).first<{ name: string }>();
    expect(bang?.name).toBe('cai_dat_thong_bao');
  });

  it('câu quét hàng chờ gửi đi index riêng phần mới `ix_thong_bao_cho_gui`', async () => {
    const { results } = await env.DB.prepare(
      `EXPLAIN QUERY PLAN
       SELECT id FROM thong_bao
        WHERE gui_telegram_luc IS NULL AND gui_so_lan_thu < 4 AND bo_qua_gui_luc IS NULL
        ORDER BY tao_luc, id LIMIT 50`,
    ).all<{ detail: string }>();
    expect(results.map((r) => r.detail).join(' | ')).toContain('ix_thong_bao_cho_gui');
  });
});
