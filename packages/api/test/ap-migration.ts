/** Áp mọi migration D1 trước khi chạy test trong mỗi file. */

import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';
import { tiemNguonTelegram } from '../src/nguon-telegram.js';
import { tiemNguonXacMinh } from '../src/xac-minh-bang-chung.js';

beforeAll(async () => {
  /*
   * **Mỗi file bắt đầu với hai nguồn tiêm ở mặc định `null`** (BAT-51 lượt 2).
   *
   * Từ BAT-51 các file test chạy theo nhóm, mỗi nhóm MỘT runtime và MỘT bộ nhớ
   * module dùng chung (`singleWorker`, xem `vitest.config.ts`). Hai biến mức module
   * duy nhất mà test đổi được — nguồn xác minh giả lập (`datNguonGiaLap`) và kênh
   * Telegram giả lập (`datNguonTelegram`) — vì vậy sẽ **sống sang file sau** trong
   * cùng nhóm: một kênh giả lập chậm của file trước làm request của file sau treo.
   * Đặt lại về `null` ở đây cho mỗi file đúng trạng thái nó từng có khi mỗi file
   * một runtime riêng. (Durable Object không cần: pool huỷ mọi DO ở mỗi lần
   * push/pop storage cô lập.)
   */
  tiemNguonXacMinh(null);
  tiemNguonTelegram(null);
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
