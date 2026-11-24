/**
 * `setupFiles` của root vitest web.
 *
 * Ba việc, và cả ba là để **không** có trạng thái rò từ ca này sang ca sau:
 *   * tháo mọi cây React đã dựng (`cleanup` của Testing Library);
 *   * trả `globalThis.fetch` về nguyên bản, để một ca quên dựng máy chủ giả thì
 *     **đỏ** (gọi mạng thật, trượt), không âm thầm ăn máy chủ giả của ca trước;
 *   * tháo `localStorage` giả nếu ca vừa rồi đã gắn (`datKhoGia` ở `giup.tsx`).
 */

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { thaoKhoGia } from './giup';

const FETCH_GOC = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = FETCH_GOC;
  thaoKhoGia();
});
