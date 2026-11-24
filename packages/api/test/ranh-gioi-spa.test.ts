/**
 * **Ranh giới `/v1/*` ↔ SPA** — SPEC mục 13 (API) và mục 14 (giao diện web),
 * `quyet-dinh.md` 05/10: một Worker phục vụ cả hai.
 *
 * Hai luật cứng, và chúng kéo nhau ngược chiều:
 *
 *   1. **`/v1/*` không bao giờ ra HTML.** Kể cả một đường `/v1/...` không có
 *      handler: nó phải ra một thân lỗi JSON `{ error, message }` của mục 13,
 *      không ra `index.html`. Một API trả HTML cho đường sai là một API mà CLI
 *      không phân biệt được "đường tôi gõ sai" với "máy chủ hỏng".
 *   2. **Một đường lạ ngoài `/v1/*` trả SPA, không 404.** Đây là điều kiện để
 *      `BrowserRouter` và đường `/t/<MÃ>` của d.398 chạy được: chủ tải lại trang
 *      ở giữa ứng dụng, trình duyệt gửi `GET /t/BAT-12`, và phải nhận `index.html`.
 *
 * ## Vì sao test ở đây chứ không ở `packages/web`
 *
 * Luật này sống ở **Worker**, trước cả Hono (cổng `app.use('*', xacThuc)` sẽ ăn
 * `/t/BAT-12` thành 401 nếu không chia đường trước). jsdom không thấy được tầng
 * đó. Nên ca nằm ở root `packages/api`, nơi có Worker thật.
 *
 * ## Asset là một binding GIẢ, và đó là chủ ý
 *
 * Không dùng thư mục asset thật: nó chỉ tồn tại sau `vite build`, và một bộ test
 * xanh/đỏ theo việc "ai đã chạy build chưa" là một cổng nghiệm thu vô dụng (cùng
 * lý lẽ đã ghi cho alias trong `vitest.config.ts`). `AssetGia` dưới đây **ghi lại
 * mọi đường nó được hỏi**, nên ca có thể ghim điều mạnh hơn "không phải HTML":
 * `/v1/*` **không chạm vào asset một lần nào**.
 */

import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import worker from '../src/index.js';
import { DUONG_SPA, TIEN_TO_API, laDuongApi } from '../src/phuc-vu-spa.js';
import type { Env } from '../src/moi-truong.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const THAN_SPA = '<!doctype html><html lang="vi"><body><div id="goc"></div></body></html>';
const THAN_FAVICON = 'icon-gia';

/** Những file "có thật" trong bản build giả. */
const CO_THAT: Record<string, { than: string; loai: string }> = {
  '/index.html': { than: THAN_SPA, loai: 'text/html; charset=utf-8' },
  '/favicon.ico': { than: THAN_FAVICON, loai: 'image/x-icon' },
};

/**
 * Asset Worker giả: trả file nếu có, **404 nếu không**.
 *
 * 404 là điểm chính. Nó dựng đúng ca tệ nhất — một bản deploy mà
 * `not_found_handling` **không** có tác dụng — nên ca `/khong-co-trang-nay` chỉ
 * xanh được nếu `phucVuSpa` tự biết lùi về `index.html`. Một stub trả
 * `index.html` cho mọi đường sẽ làm ca đó xanh kể cả khi mã không có chặng lùi,
 * tức một ca tautology.
 */
class AssetGia {
  readonly da_hoi: string[] = [];

  fetch = (req: Request): Response => {
    const duong = new URL(req.url).pathname;
    this.da_hoi.push(duong);
    const f = CO_THAT[duong];
    if (f === undefined) return new Response('khong co', { status: 404 });
    return new Response(f.than, { status: 200, headers: { 'content-type': f.loai } });
  };
}

let asset: AssetGia;

function envCoAsset(): Env {
  return { ...(env as unknown as Env), ASSETS: asset as unknown as Fetcher };
}

function envKhongAsset(): Env {
  const e = { ...(env as unknown as Env) };
  delete e.ASSETS;
  return e;
}

async function goi(duong: string, e: Env, method = 'GET'): Promise<Response> {
  const ctx = createExecutionContext();
  const r = await worker.fetch(new Request(`https://baton.test${duong}`, { method }), e, ctx);
  await waitOnExecutionContext(ctx);
  return r;
}

beforeEach(() => {
  asset = new AssetGia();
});

describe('laDuongApi — nơi ranh giới được vẽ', () => {
  it('nhận `/v1` và `/v1/...`, từ chối mọi thứ khác', () => {
    expect(laDuongApi('/v1')).toBe(true);
    expect(laDuongApi('/v1/health')).toBe(true);
    expect(laDuongApi('/v1/ticket/abc')).toBe(true);
    expect(laDuongApi('/')).toBe(false);
    expect(laDuongApi('/can-chu')).toBe(false);
    expect(laDuongApi('/t/BAT-12')).toBe(false);
  });

  it('`/v1abc` KHÔNG phải API — tiền tố có dấu gạch chéo, không phải `/v1` trần', () => {
    /*
     * `startsWith('/v1')` sẽ nói `true` ở đây, và một đường như vậy phải là SPA.
     * Hai vế **hành vi** đứng trước vế hằng: ngược lại thì `expect(TIEN_TO_API)`
     * trượt trước và hai vế thật không bao giờ được chạy — một ca đỏ vì lý do
     * yếu hơn điều nó canh.
     */
    expect(laDuongApi('/v1abc')).toBe(false);
    expect(laDuongApi('/v1-cu')).toBe(false);
    expect(TIEN_TO_API).toBe('/v1/');
  });

  /*
   * **Ba cách viết lệch của cùng một ý "gọi API".** Không một dạng nào khớp một
   * handler của Hono, nên chúng không đi vòng được quyền gì; điều phải chặn là
   * chúng **nhận HTML**. Xem khối ghi chú của `chuanHoaDuongApi`.
   */
  it('`/V1/...` (chữ hoa) là API, không phải SPA', () => {
    expect(laDuongApi('/V1/ticket')).toBe(true);
    expect(laDuongApi('/V1')).toBe(true);
    expect(laDuongApi('/V1/Ticket')).toBe(true);
  });

  it('`//v1/...` (hai gạch chéo) là API, không phải SPA', () => {
    expect(laDuongApi('//v1/ticket')).toBe(true);
    expect(laDuongApi('///v1')).toBe(true);
  });

  it('`/v1%2f...` (gạch chéo mã hoá) là API, không phải SPA', () => {
    expect(laDuongApi('/v1%2fticket')).toBe(true);
    expect(laDuongApi('/v1%2Fticket')).toBe(true);
    expect(laDuongApi('/%2Fv1/ticket')).toBe(true);
  });

  it('chuẩn hoá KHÔNG kéo một đường SPA vào API', () => {
    // Đối chứng của ba ca trên: nới chuẩn hoá không được nới sang chỗ khác.
    expect(laDuongApi('/V1abc')).toBe(false);
    expect(laDuongApi('//t/BAT-12')).toBe(false);
    expect(laDuongApi('/t/%2Fv1')).toBe(false);
    expect(laDuongApi('/Can-Chu')).toBe(false);
    /*
     * `/v1/` xuất hiện **ở giữa** đường. Vế này có vì nó là vế duy nhất bắt được
     * một cách nới sai rất dễ viết: `chuan.includes('/v1/')` thay vì khớp tiền
     * tố. Ba vế trên **không** bắt được nó (đã đo bằng đột biến: nó sống sót).
     */
    expect(laDuongApi('/t/%2Fv1/x')).toBe(false);
    expect(laDuongApi('/t/v1/x')).toBe(false);
    expect(laDuongApi('/bao-cao/v1/2026')).toBe(false);
  });

  it('dãy `%` hỏng không lọt sang SPA', () => {
    // `decodeURIComponent('/v1/%zz')` ném; đường vẫn phải là API.
    expect(laDuongApi('/v1/%zz')).toBe(true);
    expect(laDuongApi('/%zz')).toBe(false);
  });
});

describe('ba cách viết lệch đó, đo qua HTTP thật', () => {
  /*
   * Ca ở tầng `laDuongApi` đo **quyết định**; ba ca này đo **điều chủ/CLI thật sự
   * nhận được**. Cần cả hai: một đột biến ở `fetch` của Worker (quên dùng
   * `laDuongApi`) không làm ca tầng trên đỏ.
   */
  for (const duong of ['/V1/ticket', '//v1/ticket', '/v1%2fticket']) {
    it(`\`${duong}\` KHÔNG ra HTML, và không hỏi asset một lần nào`, async () => {
      const r = await goi(duong, envCoAsset());
      const than = await r.text();
      expect(than).not.toContain('<html');
      expect(than).not.toBe(THAN_SPA);
      // Thân là JSON đúng hình `{ error, message }` của mục 13.
      expect(JSON.parse(than)).toHaveProperty('error');
      expect(asset.da_hoi).toEqual([]);
    });
  }
});

describe('`/v1/*` không bao giờ bị asset ăn mất', () => {
  it('`/v1/health` ra JSON của API và KHÔNG hỏi asset một lần nào', async () => {
    const r = await goi('/v1/health', envCoAsset());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(asset.da_hoi).toEqual([]);
  });

  it('một đường `/v1/...` KHÔNG CÓ handler ra thân lỗi JSON của mục 13, không ra SPA', async () => {
    /*
     * **401, không 404** — và đó là hành vi đúng, không phải một chỗ thiếu: cổng
     * `app.use('*', xacThuc)` chạy trước mọi handler và `/v1/khong-co-duong-nay`
     * không nằm trong `DUONG_CONG_KHAI`, nên "không có token" được trả lời trước
     * "không có đường". Điều ca này canh là vế của **ranh giới**: thân là JSON
     * đúng hình `{ error, message }`, và asset **không được hỏi một lần nào**.
     */
    const r = await goi('/v1/khong-co-duong-nay', envCoAsset());
    expect(r.headers.get('content-type')).toContain('application/json');
    expect(await r.json()).toMatchObject({ error: 'INVALID_TOKEN' });
    expect(r.status).toBe(401);
    expect(asset.da_hoi).toEqual([]);
  });

  it('`/v1` trần vào Hono, không ra SPA', async () => {
    const r = await goi('/v1', envCoAsset());
    expect(r.status).toBe(401);
    expect(await r.text()).not.toContain('<html');
    expect(asset.da_hoi).toEqual([]);
  });

  it('một đường `/v1/...` cần token ra 401 JSON, KHÔNG ra SPA', async () => {
    /*
     * Ca này canh đúng cái bẫy ngược của luật 2: nếu ai đó "sửa" bằng cách trả
     * SPA cho **mọi** 401, thì CLI gọi `/v1/ticket` không token sẽ nhận một trang
     * HTML và báo lỗi phân tích JSON thay vì `INVALID_TOKEN`.
     */
    const r = await goi('/v1/ticket', envCoAsset());
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ error: 'INVALID_TOKEN' });
    expect(asset.da_hoi).toEqual([]);
  });
});

describe('mọi đường khác trả SPA', () => {
  it('`/khong-co-trang-nay` ra `index.html` 200, KHÔNG 404', async () => {
    const r = await goi('/khong-co-trang-nay', envCoAsset());
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(THAN_SPA);
    // Chặng một hỏi đúng đường gốc, chặng hai lùi về `index.html`.
    expect(asset.da_hoi).toEqual(['/khong-co-trang-nay', DUONG_SPA]);
  });

  it('`/t/BAT-12` (d.398) ra SPA — KHÔNG 401 của cổng xác thực', async () => {
    const r = await goi('/t/BAT-12', envCoAsset());
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(THAN_SPA);
  });

  it('`/` ra SPA', async () => {
    const r = await goi('/', envCoAsset());
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(THAN_SPA);
  });

  it('một file có thật ra chính file đó, KHÔNG bị thay bằng `index.html`', async () => {
    const r = await goi('/favicon.ico', envCoAsset());
    expect(r.status).toBe(200);
    expect(await r.text()).toBe(THAN_FAVICON);
    // Chỉ một chặng: có file thì không lùi.
    expect(asset.da_hoi).toEqual(['/favicon.ico']);
  });

  it('`POST` tới một đường lạ ra 404 JSON, KHÔNG ra SPA', async () => {
    const r = await goi('/khong-co-trang-nay', envCoAsset(), 'POST');
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: 'NOT_FOUND' });
    expect(asset.da_hoi).toEqual([]);
  });
});

describe('không có binding asset — fail-closed, không sập', () => {
  it('đường lạ ra 404 JSON thay vì ném lỗi 500', async () => {
    const r = await goi('/khong-co-trang-nay', envKhongAsset());
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('`/v1/health` vẫn chạy bình thường khi chưa gắn asset', async () => {
    const r = await goi('/v1/health', envKhongAsset());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
});
