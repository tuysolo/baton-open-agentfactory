/**
 * Bản build của giao diện chủ (SPEC mục 14).
 *
 * Đầu ra đi vào `dist/`, và `packages/api/wrangler.toml` trỏ `[assets]` vào đúng
 * thư mục đó: **một** Worker phục vụ cả `/v1/*` và SPA (quyet-dinh.md 05/10,
 * "CoS chốt"). `dist/` **không** commit — xem `.gitignore` của root.
 */

import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * **Mã bản build** (BAT-39 việc 2, `src/vo/ban-moi.tsx`): một chuỗi cho mỗi lần
 * `vite build` — thời điểm build (cơ số 36) + chuỗi ngẫu nhiên, để hai bản build
 * cùng một mili-giây vẫn khác nhau. Cùng một chuỗi đi vào bundle (`define`) và
 * vào file tĩnh `ban-build.json` (`banBuild`): tab cũ so mã của mình với file của
 * bản đang deploy.
 */
const MA_BAN_BUILD = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Phát `dist/ban-build.json` = `{ "ma": "<MA_BAN_BUILD>" }` — chỉ lúc build. */
function banBuild(): Plugin {
  return {
    name: 'baton-ban-build',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'ban-build.json',
        source: JSON.stringify({ ma: MA_BAN_BUILD }),
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss(), banBuild()],
  /*
   * `vite dev` không có mã (`''`) ⇒ `BaoBanMoi` không kiểm, không hiện: ở dev mỗi
   * lần sửa đã có HMR, và không có `ban-build.json` để so.
   */
  define: {
    __MA_BAN_BUILD__: JSON.stringify(command === 'build' ? MA_BAN_BUILD : ''),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /*
         * Tách thư viện ra chunk riêng (BAT-26): code của ta đổi thường xuyên còn
         * thư viện thì hiếm, nên trình duyệt giữ cache vendor qua các lần deploy; và
         * chunk đầu không áp sát ngưỡng cảnh báo 500 kB. Ngưỡng giữ mặc định.
         */
        manualChunks(id: string): string | undefined {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/[\\/]node_modules[\\/](react-router|react-router-dom)[\\/]/.test(id)) return 'vendor-router';
          if (/[\\/]node_modules[\\/](@tanstack|@dnd-kit)[\\/]/.test(id)) return 'vendor-du-lieu';
          return undefined;
        },
      },
    },
  },
  server: {
    /*
     * `vite dev` phục vụ SPA ở cổng của nó, còn API thật nằm ở Worker. Proxy để
     * đường tương đối `/v1/...` của `src/api.ts` chạy **y hệt** lúc dev và lúc
     * deploy — không có một biến `BASE_URL` nào để lệch, và cookie phiên vẫn là
     * cookie cùng gốc (`SameSite=Lax` vẫn gửi).
     */
    proxy: {
      '/v1': 'http://127.0.0.1:8787',
    },
  },
}));
