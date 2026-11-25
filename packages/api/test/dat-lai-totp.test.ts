/**
 * **Đặt lại TOTP của chủ** — `POST /v1/chu/dat-lai-totp`
 * (`src/chu-dang-nhap.ts` hàm `datLaiTotpChu`).
 *
 * Đây là **đường cứu duy nhất** khi chủ mất ứng dụng xác thực. `otpauth://` ra
 * khỏi máy chủ đúng một lần lúc thiết lập, và `thietLapChu` gọi lần hai trả
 * `FORBIDDEN` — nên không có đường này thì mất điện thoại = mất hẳn một trong hai
 * yếu tố của d.415 = **khoá vĩnh viễn khỏi web**.
 *
 * Ca đầu của file này ghim lý do đường cũ (`DELETE FROM chu_tai_khoan`, từng ghi
 * trong `DEPLOYMENT.md`) **không chạy được**: khoá ngoài của migration 0017.
 *
 * Luật được ghim:
 *   * mục 15 d.417 — `otpauth` mới ra **đúng một lần**; secret cũ không dùng lại.
 *   * mục 15 d.415 — đường này **không gỡ yếu tố nào**: mật khẩu cũ vẫn phải
 *     đúng ở lần đăng nhập sau.
 *   * mục 15 — cổng `TOKEN_CHU` và chỉ `TOKEN_CHU`; cookie phiên không vào được.
 *   * d.418 — huỷ phiên là **đặt `huy_luc`**, không xoá dòng.
 */

import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { buocTotp, maTotp, maTotpCuaBuoc } from '@baton/shared';
import { caQuaSo, choBuocTotpConDu, soRequestBay } from './cho-toi.js';
import { TOKEN_CHU, goiApi } from './giup.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const MAT_KHAU = 'mat-khau-gia-cua-chu-2026';
const THAN_KHOI_TAO = {
  ten_chu: 'Chủ',
  mat_khau: MAT_KHAU,
  du_an: [{ ten: 'Baton', ma: 'BAT' }],
  agent: [{ ten: 'CoS', vai_tro: 'coordinator', vao_tat_ca_du_an: true }],
};

function secretTuUri(uri: string): string {
  const s = new URL(uri.replace('otpauth://', 'https://')).searchParams.get('secret');
  if (s === null) throw new Error('URI otpauth không có secret');
  return s;
}

/** Khởi tạo hệ, trả secret TOTP đầu tiên và token của agent CoS. */
async function dungNen(): Promise<{ secret: string; token_agent: string }> {
  const res = await goiApi('/v1/khoi-tao', TOKEN_CHU, { method: 'POST', than: THAN_KHOI_TAO });
  expect(res.status).toBe(200);
  const ra = await res.json<{
    chu: { otpauth: string };
    agent: { ten: string; token: string }[];
  }>();
  return { secret: secretTuUri(ra.chu.otpauth), token_agent: ra.agent[0]!.token };
}

/**
 * Đăng nhập qua đường thật.
 *
 * `ma` nhận được từ ngoài vì **một bước TOTP chỉ tiêu được một lần** (mốc
 * `totp_buoc_cuoi`, trigger `tg_chu_tai_khoan_totp_buoc_chi_tang` của 0017): hai
 * lần đăng nhập trong cùng cửa sổ 30 giây thì lần hai là 401. Ca nào cần nhiều
 * phiên phải truyền mã của các **bước tách nhau**, đúng nếp
 * `test/dang-nhap-chu.test.ts`.
 */
async function dangNhap(
  secret: string,
  tuy_chon: { mat_khau?: string; ma?: string } = {},
): Promise<{ res: Response; cookie: string | null }> {
  const ma = tuy_chon.ma ?? (await maTotp(secret, Date.now()));
  const res = await SELF.fetch('https://baton.test/v1/dang-nhap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mat_khau: tuy_chon.mat_khau ?? MAT_KHAU, ma_totp: ma }),
  });
  const set = res.headers.get('set-cookie');
  return { res, cookie: set === null ? null : (/baton_phien=([^;]*)/.exec(set)?.[0] ?? null) };
}

function datLai(token = TOKEN_CHU, than: unknown = {}): Promise<Response> {
  return goiApi('/v1/chu/dat-lai-totp', token, { method: 'POST', than });
}

interface RaDatLai {
  otpauth: string;
  so_phien_da_huy: number;
  dat_lai_luc: number;
}

describe('vì sao đường này phải tồn tại', () => {
  it('đường cũ KHÔNG chạy được: khoá ngoài 0017 chặn DELETE FROM chu_tai_khoan sau lần đăng nhập đầu', async () => {
    /*
     * `DEPLOYMENT.md` của lượt trước dạy chủ gõ câu `DELETE` này khi mất URI
     * otpauth. Ca này là bằng chứng nó sai: `chu_phien.workspace_id` khai
     * `REFERENCES chu_tai_khoan(workspace_id)` **không có `ON DELETE`** (0017 dòng
     * 124), và 0017 khai chính sách "không xoá dòng `chu_phien` khi đăng xuất"
     * (dòng 138–140) — nên một dòng phiên tồn tại mãi và chặn câu `DELETE`.
     *
     * Hệ quả thật nếu không có đường đặt lại: chủ mất ứng dụng xác thực sau tuần
     * đầu thì **không còn đường nào** vào web.
     */
    const { secret } = await dungNen();
    await dangNhap(secret); // tạo một dòng `chu_phien`
    expect((await env.DB.prepare('SELECT count(*) AS n FROM chu_phien').first<{ n: number }>())?.n)
      .toBe(1);

    await expect(env.DB.prepare('DELETE FROM chu_tai_khoan').run()).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );

    // Tài khoản vẫn còn — tức câu lệnh không làm gì cả.
    expect(
      (await env.DB.prepare('SELECT count(*) AS n FROM chu_tai_khoan').first<{ n: number }>())?.n,
    ).toBe(1);
  });
});

describe('POST /v1/chu/dat-lai-totp — đặt lại được, và chỉ đặt lại TOTP', () => {
  // Các ca dưới đăng nhập bằng mã bước `giua - 1`: mốc bước không được nhảy giữa ca.
  beforeEach(() => choBuocTotpConDu());

  it('trả otpauth MỚI; mã của secret CŨ không còn đăng nhập được, mã mới thì được', async () => {
    const { secret: cu } = await dungNen();
    const giua = buocTotp(Date.now());
    expect((await dangNhap(cu, { ma: await maTotpCuaBuoc(cu, giua - 1) })).res.status).toBe(200);

    const res = await datLai();
    expect(res.status).toBe(200);
    const ra = await res.json<RaDatLai>();
    const moi = secretTuUri(ra.otpauth);

    expect(moi).not.toBe(cu);
    // Secret mới đúng là cái trong DB.
    const dong = await env.DB.prepare('SELECT totp_secret FROM chu_tai_khoan').first<{
      totp_secret: string;
    }>();
    expect(dong?.totp_secret).toBe(moi);

    // Mã của secret cũ: **không** vào được nữa.
    expect((await dangNhap(cu, { ma: await maTotpCuaBuoc(cu, giua) })).res.status).toBe(401);
    // Mã của secret mới: vào được.
    expect((await dangNhap(moi, { ma: await maTotpCuaBuoc(moi, giua) })).res.status).toBe(200);
  });

  it('KHÔNG đổi mật khẩu: mật khẩu cũ vẫn đúng, mật khẩu khác vẫn sai (d.415 còn đủ 2 lớp)', async () => {
    const { secret: cu } = await dungNen();
    const truoc = await env.DB.prepare(
      'SELECT mat_khau_bam, muoi, so_vong FROM chu_tai_khoan',
    ).first<{ mat_khau_bam: string; muoi: string; so_vong: number }>();

    const moi = secretTuUri((await (await datLai()).json<RaDatLai>()).otpauth);

    const sau = await env.DB.prepare(
      'SELECT mat_khau_bam, muoi, so_vong FROM chu_tai_khoan',
    ).first<{ mat_khau_bam: string; muoi: string; so_vong: number }>();
    expect(sau).toEqual(truoc);

    const giua = buocTotp(Date.now());
    // Secret mới + mật khẩu **sai** → 401. Đây là điều làm đường này khác một
    // đường đặt lại mật khẩu: nắm TOKEN_CHU mà không biết mật khẩu thì vô dụng.
    expect(
      (
        await dangNhap(moi, {
          mat_khau: 'mat-khau-khong-dung-dau-ca',
          ma: await maTotpCuaBuoc(moi, giua),
        })
      ).res.status,
    ).toBe(401);
    // Secret mới + mật khẩu **đúng** → vào được. Bước khác, vì bước trên đã tiêu.
    expect(
      (await dangNhap(moi, { ma: await maTotpCuaBuoc(moi, giua + 1) })).res.status,
    ).toBe(200);
    expect(cu).not.toBe(moi);
  });

  it('totp_buoc_cuoi KHÔNG bị đặt lại: mốc chống dùng lại mã vẫn tiến, không lùi', async () => {
    /*
     * Ghim một **lỗi đã có thật** trong bản đầu của `datLaiTotpChu`: nó đặt
     * `totp_buoc_cuoi = NULL` với lý lẽ "mốc của secret cũ thì vô nghĩa với secret
     * mới". Trigger `tg_chu_tai_khoan_totp_buoc_chi_tang` của 0017 chặn câu đó, và
     * chú thích của chính trigger đã đoán trước đúng lỗi này.
     *
     * Bước TOTP dẫn xuất từ **đồng hồ**, không từ secret — nên mốc đó phải đứng
     * nguyên, và ca này là chỗ nói ra điều đó.
     */
    const { secret: cu } = await dungNen();
    await dangNhap(cu);
    const truoc = await env.DB.prepare('SELECT totp_buoc_cuoi FROM chu_tai_khoan').first<{
      totp_buoc_cuoi: number | null;
    }>();
    expect(truoc?.totp_buoc_cuoi).not.toBeNull();

    const res = await datLai();
    expect(res.status).toBe(200);
    const sau = await env.DB.prepare('SELECT totp_buoc_cuoi FROM chu_tai_khoan').first<{
      totp_buoc_cuoi: number | null;
    }>();
    expect(sau?.totp_buoc_cuoi).toBe(truoc?.totp_buoc_cuoi);
  });

  it('đá mọi phiên đang mở, bằng cách ĐẶT huy_luc chứ không xoá dòng (d.418)', async () => {
    const { secret: cu } = await dungNen();
    // Hai phiên = hai **bước** TOTP khác nhau (một bước chỉ tiêu được một lần).
    const giua = buocTotp(Date.now());
    const c1 = (await dangNhap(cu, { ma: await maTotpCuaBuoc(cu, giua - 1) })).cookie!;
    const c2 = (await dangNhap(cu, { ma: await maTotpCuaBuoc(cu, giua) })).cookie!;
    expect(c1).not.toBe(c2);

    // Cả hai phiên đang dùng được.
    expect((await SELF.fetch('https://baton.test/v1/tong-quan', { headers: { cookie: c1 } })).status)
      .toBe(200);

    const ra = await (await datLai()).json<RaDatLai>();
    expect(ra.so_phien_da_huy).toBe(2);

    // Hai dòng **vẫn còn** trong bảng, chỉ mang mốc huỷ — không xoá (d.418,
    // CLAUDE.md mục 4).
    const d = await env.DB.prepare(
      'SELECT count(*) AS n, count(huy_luc) AS da_huy FROM chu_phien',
    ).first<{ n: number; da_huy: number }>();
    expect(d).toEqual({ n: 2, da_huy: 2 });

    // Và hai cookie đó không còn giá trị gì.
    for (const c of [c1, c2]) {
      const res = await SELF.fetch('https://baton.test/v1/tong-quan', { headers: { cookie: c } });
      expect(res.status).toBe(401);
    }
  });

  it('chạy lại được: mỗi lượt một secret mới, lượt sau không còn phiên nào để đá', async () => {
    const { secret: cu } = await dungNen();
    await dangNhap(cu);

    const mot = await (await datLai()).json<RaDatLai>();
    const hai = await (await datLai()).json<RaDatLai>();
    expect(secretTuUri(mot.otpauth)).not.toBe(secretTuUri(hai.otpauth));
    expect(mot.so_phien_da_huy).toBe(1);
    expect(hai.so_phien_da_huy).toBe(0);
  });

  it('chưa có tài khoản chủ → NOT_FOUND, chỉ đường về lệnh khởi tạo', async () => {
    // Có workspace (nên middleware qua được) nhưng chưa đặt mật khẩu.
    const res_kt = await goiApi('/v1/khoi-tao', TOKEN_CHU, {
      method: 'POST',
      than: { du_an: [], agent: [] },
    });
    expect(res_kt.status).toBe(422);

    const res = await datLai();
    expect(res.status).toBe(404);
    expect((await res.json<{ message: string }>()).message).toContain('khởi tạo');
  });
});

describe('POST /v1/chu/dat-lai-totp — bí mật ra ĐÚNG MỘT LẦN (mục 15 d.417)', () => {
  it('thân phản hồi không mang băm mật khẩu / muối; secret chỉ ở trong URI otpauth', async () => {
    await dungNen();
    const chu = await (await datLai()).text();
    const dong = await env.DB.prepare(
      'SELECT mat_khau_bam, muoi, totp_secret FROM chu_tai_khoan',
    ).first<{ mat_khau_bam: string; muoi: string; totp_secret: string }>();

    expect(chu).not.toContain(dong!.mat_khau_bam);
    expect(chu).not.toContain(dong!.muoi);

    const ra = JSON.parse(chu) as RaDatLai;
    const con_lai = JSON.stringify({ ...ra, otpauth: null });
    expect(con_lai).not.toContain(dong!.totp_secret);
  });

  it('secret KHÔNG đọc lại được ở đường nào khác sau khi đã đặt lại', async () => {
    const { secret: cu } = await dungNen();
    const moi = secretTuUri((await (await datLai()).json<RaDatLai>()).otpauth);
    const cookie = (await dangNhap(moi)).cookie!;

    for (const duong of ['/v1/chu/phien', '/v1/toi', '/v1/tong-quan', '/v1/man-hinh-ban-do']) {
      const res = await SELF.fetch(`https://baton.test${duong}`, { headers: { cookie } });
      if (!res.ok) continue;
      const chu = await res.text();
      expect(chu).not.toContain(moi);
      expect(chu).not.toContain(cu);
      expect(chu).not.toContain('otpauth');
    }
  });
});

describe('POST /v1/chu/dat-lai-totp — cổng TOKEN_CHU (mục 15)', () => {
  it('token sai → 401, secret KHÔNG đổi', async () => {
    const { secret } = await dungNen();
    const res = await datLai('bt_token_hoan_toan_sai');
    expect(res.status).toBe(401);
    const dong = await env.DB.prepare('SELECT totp_secret FROM chu_tai_khoan').first<{
      totp_secret: string;
    }>();
    expect(dong?.totp_secret).toBe(secret);
  });

  it('token AGENT → 403, secret KHÔNG đổi', async () => {
    const { secret, token_agent } = await dungNen();
    const res = await datLai(token_agent);
    expect(res.status).toBe(403);
    const dong = await env.DB.prepare('SELECT totp_secret FROM chu_tai_khoan').first<{
      totp_secret: string;
    }>();
    expect(dong?.totp_secret).toBe(secret);
  });

  it('agent bị TẮT → 403, secret KHÔNG đổi', async () => {
    /*
     * Agent dựng qua **đường thật** (`/v1/khoi-tao`), không qua `dungAgentCoToken`:
     * fixture đó ghim `workspace_id = 'ws-test'`, còn workspace do đường khởi tạo
     * tạo ra mang một UUID — nên fixture vỡ khoá ngoài ở đây. Cờ `disabled` thì
     * đặt thẳng trong DB: đó là *trạng thái* cần dựng, không phải lệnh cần kiểm.
     */
    const { secret, token_agent } = await dungNen();
    await env.DB.prepare("UPDATE agent SET disabled = 1 WHERE ten = 'CoS'").run();

    expect((await datLai(token_agent)).status).toBe(403);
    const dong = await env.DB.prepare('SELECT totp_secret FROM chu_tai_khoan').first<{
      totp_secret: string;
    }>();
    expect(dong?.totp_secret).toBe(secret);
  });
});

describe('cookie phiên KHÔNG vào được các đường chỉ-TOKEN_CHU', () => {
  /*
   * Ba đường `chu/*` cộng `/v1/khoi-tao` đều kiểm cờ `qua_token_chu`, **không**
   * `ai.loai === 'chu'`. Lý do: từ phần 6, một **cookie phiên** cũng dựng ra
   * `{ loai: 'chu' }` trong `xacThuc`, nên điều kiện kia sẽ cho một phiên web đi
   * vào ba đường mà `DEPLOYMENT.md` dựng ra làm **cửa thoát của máy chủ**.
   *
   * Lượt trước lá chắn này được khai là "phòng thủ tầng hai, KHÔNG có test" cho
   * `/v1/chu/thiet-lap`. Giờ nó có test, cho cả bốn đường — và với
   * `dat-lai-totp` thì nó **không** còn là tầng hai: đường đó chạy được cả khi đã
   * có tài khoản chủ, nên một cookie lọt vào là một cookie đặt lại được yếu tố
   * thứ hai của chính chủ.
   */
  const DUONG = [
    '/v1/khoi-tao',
    '/v1/chu/thiet-lap',
    '/v1/chu/mo-khoa',
    '/v1/chu/dat-lai-totp',
  ];

  for (const duong of DUONG) {
    it(`${duong} với cookie phiên của chủ → 403`, async () => {
      const { secret } = await dungNen();
      const cookie = (await dangNhap(secret)).cookie!;

      const res = await SELF.fetch(`https://baton.test${duong}`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ mat_khau: 'mat-khau-khac-de-doi-trom' }),
      });
      expect(res.status).toBe(403);

      // Và không có gì đổi: secret trong DB vẫn là secret cũ. (Kiểm bằng DB chứ
      // không bằng một lần đăng nhập nữa: `dungNen` + `dangNhap` ở trên đã tiêu
      // một bước TOTP, và một bước chỉ tiêu được một lần.)
      const dong = await env.DB.prepare('SELECT totp_secret FROM chu_tai_khoan').first<{
        totp_secret: string;
      }>();
      expect(dong?.totp_secret).toBe(secret);
    });
  }
});
