// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.wrangler/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Danh sách cấm của CLAUDE.md: không in secret. `console.error` ở
      // middleware lỗi là chủ ý, nên chỉ cảnh báo chỗ còn lại.
      'no-console': ['warn', { allow: ['error', 'warn'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      /*
       * Tham số **cố ý chưa dùng** phải đặt tên bắt đầu bằng `_` — cùng quy ước
       * với `noUnusedParameters` của TypeScript. Dùng cho những chữ ký phải giữ
       * nguyên khi phần sau cài thật (vd `congBangChungCua(_env, _db)`, chỗ cắm
       * của phần 3 — SPEC mục 7). Chỉ nới cho **tham số**, không nới cho biến:
       * một biến khai mà không dùng vẫn là lỗi.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'all', argsIgnorePattern: '^_', caughtErrors: 'all' },
      ],
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      // Fetch giả lập trong test trả Response dựng sẵn, không cần `await`.
      '@typescript-eslint/require-await': 'off',
      // Test ghi lại URL đã gọi bằng `String(url)`; đó là chủ ý.
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
  {
    // Bộ đo hiệu năng (SPEC 19.12 câu 1) **phải** in bảng số đo ra màn hình —
    // đó là sản phẩm của nó. `console.log` ở đây là chủ ý, không phải vết gỡ
    // lỗi bỏ quên. Nới đúng một thư mục, không nới cho `src/`.
    files: ['**/test/hieu-nang/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    /*
     * **HÀNG RÀO TĨNH: không một lời gọi mạng nào trong cửa ghi.**
     *
     * `WorkspaceGate` là **một** Durable Object cho mỗi workspace và chạy **đơn
     * luồng**: một `fetch()` bên trong nó treo hàng đợi ghi của **cả** workspace
     * (xem đầu `xac-minh-bang-chung.ts` và `cron-bang-chung.ts`). Ràng buộc đó có
     * hai ca test đo thời gian ("KIẾN TRÚC"), nhưng chúng **hỏng im lặng**: chúng chỉ
     * đo được rằng lệnh ghi *kia* không phải chờ. Thêm một lần gọi mạng **thứ hai**
     * bên trong `#ghiMotXacMinh` mà **giữ** lần gọi ở Worker thì cả hai ca vẫn xanh,
     * vì lệnh ghi kia đã xong trước khi lần gọi mới xảy ra.
     *
     * Luật này đo **đúng** cái cần đo (trong mọi file chạy trong cửa ghi không có
     * một lời gọi mạng nào),
     * không phụ thuộc đồng hồ, và đỏ ngay lúc lint.
     *
     * Chỉ cấm `fetch` **trần** (callee là chính danh hiệu `fetch`, hoặc
     * `globalThis.fetch`). `stub.fetch(...)` của `DurableObjectStub` và `app.fetch`
     * là hợp lệ và phải tiếp tục dùng được — chúng là lời gọi **nội bộ** qua binding,
     * không ra Internet.
     *
     * **Khai theo mẫu rộng rồi TRỪ ngoại lệ, không khai theo danh sách.** Mã chạy
     * trong cửa ghi không nằm ở hai file: `WorkspaceGate` gọi vào `SO_DANG_KY_HANDLER`
     * (`lenh.ts` → mọi `lenh-*.ts`), vào các `doc-*.ts`, và vào `thong-bao.ts`. Khai
     * danh sách thì **file mới thêm về sau im lặng không được phủ** — đúng cái bệnh
     * đã bàn ở `dieu-phoi.test.ts` (sinh danh sách vai trò từ `VAI_TRO_AGENT` thay vì
     * gõ tay). Mẫu-trừ-ngoại-lệ **mặc định đóng**: file mới trong `src/` được phủ ngay,
     * và muốn gọi mạng thì phải sửa chính file này — một việc cố ý, thấy được trong diff.
     *
     * Ngoại lệ **đúng là** chặng gọi mạng ở Worker (ngoài DO):
     *   - `nguon-github.ts`, `nguon-deploy.ts`, `nguon-telegram.ts` — ba file LÀ chặng
     *     gọi mạng. `nguon-telegram.ts` là chặng gửi Telegram của phần 7 (d.339–348);
     *     nó chỉ được `cron-thong-bao.ts` nhập, **không** file nào của cửa ghi nhập.
     *   - `xac-minh-bang-chung.ts`, `cron-bang-chung.ts` — chặng gọi mạng ở Worker;
     *     cửa ghi chỉ nhập từ chúng mấy hàm thuần (`canXacMinh`, `xacMinhTrongHan`).
     *   - `cron-thong-bao.ts` — cùng vai với `cron-bang-chung.ts`: nó chạy ở Worker
     *     (`scheduled`), ngoài DO, nên nó **nhập** `nguon-telegram.ts` và phải được
     *     trừ khỏi vế cấm `import` dưới đây. Nó không gọi `fetch` trần.
     *   - `index.ts` — điểm vào Worker.
     * `gioi-han-token.ts` **ở trong** hàng rào: `fetch(request)` của nó là một
     * **method**, không phải lời gọi, nên luật không chạm tới.
     */
    files: ['packages/api/src/**/*.ts'],
    ignores: [
      'packages/api/src/index.ts',
      'packages/api/src/nguon-github.ts',
      'packages/api/src/nguon-deploy.ts',
      'packages/api/src/nguon-telegram.ts',
      'packages/api/src/xac-minh-bang-chung.ts',
      'packages/api/src/cron-bang-chung.ts',
      'packages/api/src/cron-thong-bao.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.type='Identifier'][callee.name='fetch']",
          message:
            'Cửa ghi KHÔNG được gọi mạng: `WorkspaceGate` đơn luồng, một `fetch()` ở đây treo hàng đợi ghi của cả workspace. Chặng gọi mạng nằm ở Worker (`xac-minh-bang-chung.ts`, `cron-bang-chung.ts`, `cron-thong-bao.ts`). `stub.fetch(...)` qua binding thì được.',
        },
        {
          selector:
            "CallExpression[callee.object.name='globalThis'][callee.property.name='fetch']",
          message:
            'Cửa ghi KHÔNG được gọi mạng, kể cả qua `globalThis.fetch`. Chặng gọi mạng nằm ở Worker (`xac-minh-bang-chung.ts`, `cron-bang-chung.ts`, `cron-thong-bao.ts`). Xem ghi chú luật này trong `eslint.config.js`.',
        },
        {
          selector: "ImportDeclaration[source.value=/nguon-github|nguon-deploy|nguon-telegram/]",
          message:
            'Cửa ghi không được nhập `nguon-github.ts` / `nguon-deploy.ts` / `nguon-telegram.ts`: ba file đó LÀ chặng gọi mạng, và chặng đó sống ở Worker, không trong `WorkspaceGate`. Mở ngoại lệ `fetch` cho một `nguon-*.ts` thì phải xiết vế này cùng lúc — nếu không, cửa ghi chỉ cần một dòng `import` là kéo được chặng gọi mạng vào trong nó.',
        },
      ],
    },
  },
  {
    // File cấu hình chạy trên Node, ngoài tsconfig của package.
    // `vitest-*.config.ts`: biến thể của bộ đo (BAT-72, `hieu-nang/vitest-500.config.ts`).
    files: ['eslint.config.js', '**/vitest.config.ts', '**/vitest-*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
);
