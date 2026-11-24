/**
 * Điểm vào của SPA. Ba lớp bọc, theo đúng thứ tự:
 *
 *   `BrowserRouter` → `QueryClientProvider` → `App`
 *
 * `BrowserRouter` (không `HashRouter`): d.398 chốt đường **`/t/<MÃ>`**, một đường
 * thật, không `#/t/<MÃ>`. Nó chạy được vì mọi đường ngoài `/v1/*` trả `index.html`,
 * và việc đó do **hai** chỗ lo, **không** phải `app.notFound` của Hono (đường như
 * `/t/BAT-12` chết ở cổng `app.use('*', xacThuc)` trước khi tới được `notFound` —
 * xem khối ghi chú đầu `packages/api/src/phuc-vu-spa.ts`):
 *
 *   1. `[assets]` trong `packages/api/wrangler.toml` — `run_worker_first` giữ
 *      `/v1/*` cho Worker, phần còn lại do Asset Worker phục vụ;
 *   2. `phucVuSpa` ở `packages/api/src/phuc-vu-spa.ts` — lớp phòng vệ trong mã,
 *      chạy khi một đường ngoài `/v1/*` vẫn tới được Worker.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { taoQueryClient } from './query';
import './kieu.css';

const goc = document.getElementById('goc');
if (goc === null) throw new Error('Không có #goc trong index.html');

createRoot(goc).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={taoQueryClient()}>
        <App />
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
);
