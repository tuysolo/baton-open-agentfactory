/**
 * **Công cụ đo ca chậm** (BAT-55) — setup file, chạy cho MỌI file test api.
 *
 * Vì sao có: bộ api đầy đủ có những lượt nhiều ca thường chỉ vài trăm ms cùng ra
 * ~5,0–5,2 s, ở nhiều runtime một lúc (`vitest.config.ts`, `quyet-dinh.md` dòng
 * BAT-54, BAT-55). JSON reporter của Vitest chỉ có thời lượng từng ca, không có
 * MỐC bắt đầu, không có tên project, và không tách được thời lượng ra từng chặng —
 * nên không đối chiếu được "các ca chậm có cùng một khoảng thời gian không" và
 * "chậm ở thân hay ở ngoài thân". File này ghi đúng những thứ đó, CHỈ khi ca chậm.
 *
 * Thời lượng `duration` của Vitest tính từ trước `onBeforeTryTask` của pool (push
 * storage cô lập) tới sau `afterEach`; trần 5 s chỉ áp lên THÂN. Một dòng log tách:
 *   * `truoc_hook_ms`  — từ lúc ca bắt đầu tới `beforeEach` đầu tiên: gần như toàn bộ
 *                        là push storage cô lập (một request ra tiến trình Node của pool).
 *   * `before_each_ms` — các `beforeEach` đi qua `caQuaSo` (`cho-toi.ts`).
 *   * `than_ms`        — thân ca, nếu file dùng `caQuaSo`.
 *   * `ngoai_than_ms`  — phần còn lại: pop storage + `afterEach` của file (ca xanh).
 *   * `tong_ms`        — tới cuối `afterEach` này. Ca xanh: đã gồm pop storage (pool
 *                        pop TRƯỚC `afterEach`); ca đỏ: pop chạy sau, không gồm.
 *   * `bat_dau`, `ket_thuc` — mốc ISO, để đối chiếu các runtime với nhau và với dòng
 *                        `[node-tre]` (độ trễ vòng sự kiện Node, `vitest.config.ts`).
 *
 * Chỉ ghi log (`console.warn`), **không bao giờ làm đỏ ca**: mọi thứ trong
 * `try/catch`, không `expect` nào. Không đổi trần, không đổi thứ tự hook nào của
 * file test: `beforeEach` ở đây chạy TRƯỚC mọi `beforeEach` của file (khai trước),
 * `afterEach` ở đây chạy SAU mọi `afterEach` của file (Vitest `sequence.hooks:
 * 'stack'` mặc định, chạy ngược thứ tự khai).
 */

import { afterEach, beforeEach } from 'vitest';
import type { DoCa } from './cho-toi.js';

/** Ca chậm hơn số này thì ghi một dòng. */
const NGUONG_MS = 3_000;

/*
 * Đồng hồ THẬT, giữ lúc nạp module: `vi.useFakeTimers` mặc định giả cả `Date` lẫn
 * `performance.now`. `result.startTime` của Vitest lấy bằng `Date.now` thật.
 */
const dongHoThat: () => number = performance.now.bind(performance);
const gioThat: () => number = Date.now.bind(Date);

/** Mốc `dongHoThat()` lúc `beforeEach` đầu tiên của ca hiện tại. */
let moc_before_each: number | undefined;
/** Ms từ lúc ca bắt đầu (`result.startTime`) tới `beforeEach` đầu tiên. */
let truoc_hook_ms: number | undefined;

beforeEach((ctx) => {
  try {
    moc_before_each = dongHoThat();
    const bat_dau = ctx.task.result?.startTime;
    truoc_hook_ms = bat_dau === undefined ? undefined : gioThat() - bat_dau;
  } catch {
    moc_before_each = undefined;
    truoc_hook_ms = undefined;
  }
});

afterEach((ctx) => {
  try {
    const ca = ctx.task;
    const bat_dau = ca.result?.startTime;
    if (moc_before_each === undefined || truoc_hook_ms === undefined || bat_dau === undefined) {
      return;
    }
    const tong_ms = Math.round(truoc_hook_ms + (dongHoThat() - moc_before_each));
    if (tong_ms < NGUONG_MS) return;
    const do_ca = (ca.meta as { do_ca?: DoCa }).do_ca;
    const than_ms = do_ca?.than_ms;
    console.warn(
      `[ca-cham] ${JSON.stringify({
        project: ca.file.projectName ?? null,
        file: ca.file.name,
        ca: ca.name,
        trang_thai: ca.result?.state ?? null,
        bat_dau: new Date(bat_dau).toISOString(),
        ket_thuc: new Date(gioThat()).toISOString(),
        truoc_hook_ms,
        before_each_ms: do_ca?.before_each_ms ?? null,
        than_ms: than_ms ?? null,
        // Phần không thuộc push, `beforeEach` qua `caQuaSo` hay thân: pop storage +
        // `afterEach` của file (ca xanh). Chỉ tính khi đo được thân.
        ngoai_than_ms:
          than_ms === undefined
            ? null
            : tong_ms - truoc_hook_ms - (do_ca?.before_each_ms ?? 0) - than_ms,
        tong_ms,
      })}`,
    );
  } catch {
    // Công cụ đo không được làm đỏ ca.
  } finally {
    moc_before_each = undefined;
    truoc_hook_ms = undefined;
  }
});
