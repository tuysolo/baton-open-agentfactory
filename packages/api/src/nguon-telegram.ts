/**
 * **Kênh Telegram** — SPEC mục 12 d.339 ("Kênh v0.1: Telegram (1 chat của chủ;
 * **bot token và chat id cấu hình phía server**)"), 19.12 câu 6.
 *
 * ## Một lớp riêng, giao diện hẹp đúng một câu — cùng nếp `nguon-github.ts`
 *
 * Lớp này biết **một** việc: "đẩy một đoạn chữ (và một link) tới chat của chủ".
 * Không có `sửaTin`, `xoáTin`, `đọcTinNhắn`, `getUpdates` — Baton không đọc gì từ
 * Telegram ở v0.1, nên một giao diện rộng hơn chỉ là bề mặt tấn công.
 *
 * Tách lớp ra khỏi luật để **test không gọi mạng thật**: bản giả lập
 * (`nguonTelegramGiaLap`) tiêm vào qua `tiemNguonTelegram`, và nó **đếm được**
 * mọi URL nó được gọi với — nên có ca ghim "không một lời gọi nào ra
 * `api.telegram.org`" (danh sách cấm `CLAUDE.md` mục 3: không gửi Telegram thật
 * tới ai). Không `monkey-patch globalThis.fetch`: vá biến toàn cục thì mọi lần
 * gọi mạng khác trong cùng isolate cũng bị vá, và một ca quên dọn làm ca khác
 * xanh/đỏ vì lý do không ai thấy trong diff.
 *
 * ## Token KHÔNG BAO GIỜ được in ra
 *
 * Telegram đặt bot token **trong đường dẫn** (`/bot<token>/sendMessage`), không
 * trong header — nên ở đây nguy hiểm hơn GitHub: một `console.error(url)` hay một
 * thông điệp lỗi mang URL là **rò secret** (danh sách cấm `CLAUDE.md` mục 5, SPEC
 * mục 15 d.417). Hai luật, giữ cả hai:
 *   1. **Không** URL, không thân phản hồi thô, không lỗi gốc của `fetch` vào bất
 *      kỳ chuỗi nào đi ra khỏi lớp này. Thứ đi ra chỉ là **mã HTTP** và **mã lỗi
 *      của Telegram** (`error_code`) — hai con số, không mang chữ nào của ta.
 *   2. Nếu thân phản hồi vẫn cần đọc (để biết lý do), chỉ đọc `description` của
 *      Telegram và **lọc** nó qua `locChuoiAnToan` dưới đây: cắt ngắn, và bỏ mọi
 *      đoạn trông như token. Lý do này đi vào cột `thong_bao.gui_loi_ly_do`, tức
 *      chủ đọc được nó trên UI.
 */

import { HAN_GOI_MANG_MS } from '@baton/shared';
import { choDuongTest, type Env } from './moi-truong.js';
import { locChuoiAnToan } from './loc-chuoi.js';

/** Cổng ra mạng, tiêm được — xem `nguonTelegramThat`. */
export type GoiMang = (url: string, init: RequestInit) => Promise<Response>;

/** Kết quả một lần gửi. `{ loi }` là câu **tiếng Việt, đã lọc** — xem đầu file. */
export type KetQuaGuiTelegram = { da_gui: true } | { loi: string };

export interface NguonTelegram {
  /** Tên kênh, để log và kết quả cron đọc được (`telegram`, `gia_lap`). */
  readonly kenh: string;
  guiTin(tin: { noi_dung: string; link: string | null }): Promise<KetQuaGuiTelegram>;
}

const GOC_API = 'https://api.telegram.org';

/**
 * **Hàm lọc chuỗi đã rời sang `loc-chuoi.ts`** (phần 7 việc B), và xuất lại ở đây
 * để mọi chỗ gọi cũ không phải đổi.
 *
 * Lý do dời: `cron-bao-cao.ts` cũng cần nó cho dòng log của nó, mà file đó **không
 * gọi mạng** nên nó phải nằm trong hàng rào lint "không nhập `nguon-*.ts`". Lý lẽ
 * đầy đủ ở đầu `loc-chuoi.ts`.
 */
export { locChuoiAnToan };

/**
 * Bản **thật**, gọi Telegram Bot API `sendMessage`.
 *
 * **Thiếu token hoặc thiếu chat id ⇒ trả `null`**, không phải một nguồn ném lỗi:
 * d.339 nói hai thứ đó "cấu hình phía server", và chủ sắp deploy mà chưa chắc đã
 * đặt secret. `null` để `quetGuiThongBao` **không gửi và không lỗi** — tin vẫn
 * nằm trong kho với `gui_telegram_luc` NULL, và luồng chính không bị chạm. Cùng
 * hướng "thiếu secret thì fail-soft" mà `nguonGitHubThat` đã dùng cho d.220,
 * nhưng ở đây mạnh hơn: thiếu cấu hình Telegram **không được** làm một lệnh ghi
 * nào thất bại.
 */
export function nguonTelegramThat(
  bot_token: string | undefined,
  chat_id: string | undefined,
  tuy_chon: { han_ms?: number; goc?: string; goi?: GoiMang } = {},
): NguonTelegram | null {
  const token = (bot_token ?? '').trim();
  const chat = (chat_id ?? '').trim();
  if (token.length === 0 || chat.length === 0) return null;

  const goc = tuy_chon.goc ?? GOC_API;
  const han_ms = tuy_chon.han_ms ?? HAN_GOI_MANG_MS;
  /*
   * **`fetch` tiêm được qua tham số.** Mặc định là `fetch` của runtime; test
   * truyền một bản giả **đếm được URL** nó được gọi với, nên có ca ghim "**không
   * một lời gọi nào ra `api.telegram.org`**" (danh sách cấm `CLAUDE.md` mục 3) mà
   * vẫn chạy **đúng thân hàm thật** này — không phải một bản sao gần giống.
   * Không `monkey-patch globalThis.fetch`: xem đầu file.
   */
  const goi: GoiMang = tuy_chon.goi ?? ((u, i) => fetch(u, i));

  return {
    kenh: 'telegram',
    async guiTin(tin) {
      // Link đi **trong thân tin**, không trong một `reply_markup`: d.347 chỉ đòi
      // "mỗi tin có link thẳng tới đúng thẻ hoặc ticket", và một dòng link là thứ
      // mở được trên mọi client Telegram.
      const text = tin.link === null ? tin.noi_dung : `${tin.noi_dung}\n${tin.link}`;

      let res: Response;
      try {
        res = await goi(`${goc}/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chat,
            text,
            // Không `parse_mode`: nội dung tin là chữ do Baton dựng từ tiêu đề mà
            // agent gửi lên, nên để Telegram phân tích Markdown là mở đường cho
            // một tiêu đề làm vỡ cả tin (hoặc dựng một link khác).
            disable_notification: false,
          }),
          signal: AbortSignal.timeout(han_ms),
        });
      } catch {
        /*
         * Thông điệp **không** mang lỗi gốc: lỗi gốc của `fetch` mang URL đầy đủ,
         * và URL của Telegram **chứa bot token**. Xem đầu file.
         */
        return { loi: 'Không gọi được Telegram (lỗi mạng hoặc quá hạn chờ).' };
      }

      if (res.ok) return { da_gui: true };

      // Chỉ **mã** đi ra, cộng `description` đã lọc nếu đọc được.
      let mo_ta = '';
      try {
        const than = await res.json<{ description?: unknown; error_code?: unknown }>();
        if (typeof than.description === 'string') mo_ta = ` ${locChuoiAnToan(than.description)}`;
      } catch {
        mo_ta = '';
      }
      return { loi: `Telegram trả mã ${String(res.status)}.${mo_ta}` };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Bản giả lập — CHỈ dùng trong test
 * ------------------------------------------------------------------ */

export interface CaiDatGiaLapTelegram {
  /** Lỗi trả về cho mỗi lần gửi; để trống thì mọi lần gửi **thành công**. */
  loi?: string;
  /** Lỗi chỉ cho `n` lần gửi đầu, rồi thành công — để test đường thử lại. */
  loi_lan_dau?: number;
  /** Giả một kênh **chậm**. */
  cham_ms?: number;
}

export interface NguonTelegramGiaLap extends NguonTelegram {
  /** Mọi tin đã được **gửi** qua nguồn này, theo thứ tự. */
  readonly da_gui: { noi_dung: string; link: string | null }[];
  /** Số lần `guiTin` được gọi, kể cả lần trượt. */
  soLanGoi(): number;
}

function cho(ms: number): Promise<void> {
  return new Promise((ok) => setTimeout(ok, ms));
}

/** Nguồn Telegram **giả lập**: ghi lại tin, **không gọi mạng** lần nào. */
export function nguonTelegramGiaLap(cai_dat: CaiDatGiaLapTelegram = {}): NguonTelegramGiaLap {
  const da_gui: { noi_dung: string; link: string | null }[] = [];
  let so_lan = 0;
  const loi_lan_dau = cai_dat.loi_lan_dau ?? (cai_dat.loi === undefined ? 0 : Number.MAX_SAFE_INTEGER);

  return {
    kenh: 'gia_lap',
    da_gui,
    soLanGoi: () => so_lan,
    async guiTin(tin) {
      so_lan += 1;
      if (cai_dat.cham_ms !== undefined && cai_dat.cham_ms > 0) await cho(cai_dat.cham_ms);
      if (so_lan <= loi_lan_dau) {
        return { loi: cai_dat.loi ?? 'Telegram trả mã 500. (giả lập)' };
      }
      da_gui.push(tin);
      return { da_gui: true };
    },
  };
}

/**
 * Nguồn **giả lập** đang được tiêm, hoặc `null` = dùng nguồn thật.
 *
 * Một biến mức module, **không** một binding của `Env` — và đó là một bài học đã
 * trả giá một lần: `@cloudflare/vitest-pool-workers` đưa cho test một đối tượng
 * `env` **khác** đối tượng bindings mà handler của Worker nhận, nên test đặt
 * binding mà Worker không thấy, và lần gọi đi ra **mạng thật**. Xem khối ghi chú
 * của `nguon_tiem` trong `xac-minh-bang-chung.ts`.
 *
 * Vì sao nó không phải một cửa hậu — hai hàng rào, cần **cả hai**:
 *   1. `nguonTelegramCua` chỉ đọc biến này khi `choDuongTest(env)` đúng, tức khi
 *      `CHO_DUONG_TEST` được đặt, và `wrangler.toml` nói rõ cờ đó **không** được
 *      đặt khi deploy.
 *   2. Không có đường HTTP, header, query hay thân request nào đặt được nó. Chỉ mã
 *      trong cùng bundle gọi `tiemNguonTelegram` được, và chỗ gọi duy nhất là
 *      `test/giup.ts`.
 */
let nguon_tiem: NguonTelegram | null = null;

/** **CHỈ test.** Tiêm nguồn giả lập; `null` để trả về nguồn thật. */
export function tiemNguonTelegram(nguon: NguonTelegram | null): void {
  nguon_tiem = nguon;
}

/**
 * Kênh gửi của một môi trường, hoặc `null` = **chưa cấu hình ⇒ không gửi gì**.
 *
 * `null` là một trạng thái **bình thường**, không một lỗi: xem `nguonTelegramThat`.
 */
export function nguonTelegramCua(env: Env): NguonTelegram | null {
  if (nguon_tiem !== null && choDuongTest(env)) return nguon_tiem;
  return nguonTelegramThat(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_CHAT_ID);
}
