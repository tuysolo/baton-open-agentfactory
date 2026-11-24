/**
 * Chặn tái phát **lỗi chú thích của D1 remote** trong `migrations/*.sql`.
 *
 * ## Nguyên nhân gốc (đã làm chết lần áp 0009 lên DB thật)
 *
 * `wrangler d1 migrations apply <db> --remote` **xoá chú thích dòng `-- …` tới
 * hết dòng TRƯỚC khi** gửi SQL. Nên một dấu `--` nằm **bên trong** chú thích
 * khối `/* … *\/` cũng bị xoá cùng phần còn lại của dòng — **kể cả dấu `*\/`
 * đóng khối**. Khối mất chỗ đóng thì kéo dài sang các dòng dưới và **nuốt luôn
 * SQL thật**. Dòng gây lỗi:
 *
 *     /* --- `deploy`: URL + mã phiên bản tuỳ chọn — SPEC d.207 --------- *\/
 *
 * `url TEXT,` ngay dưới nó bị ăn, nên câu `CHECK (loai <> 'deploy' OR url IS NOT
 * NULL)` phía sau tham chiếu một cột không còn:
 *
 *     no such column: url at offset 5074: SQLITE_ERROR [code: 7500]
 *
 * ## Ba lớp chặn ở file này
 *
 * 1. **Cấm hoàn toàn `/*`** trong mọi `migrations/*.sql` (trừ khi nó nằm trong
 *    một chuỗi `'…'`, tức là dữ liệu). Chú thích khối không mang thêm điều gì mà
 *    một chuỗi dòng `-- …` không nói được, nhưng nó mang theo đúng cái bẫy trên.
 * 2. **Không có `;` trong chú thích khối** — luật cũ, giữ lại: nếu lớp 1 vì lý do
 *    nào đó được nới, thì dấu `;` trong `/* … *\/` lại cắt câu SQL làm đôi
 *    (`incomplete input: SQLITE_ERROR [code: 7500]`).
 * 3. **Bằng chứng tương đương lược đồ**: áp cả 18 migration ở dạng **đã qua bộ
 *    tiền xử lý** của remote lên một DB sạch (`DB_TIEN_XU_LY`), rồi so lược đồ
 *    với `DB` (áp bản gốc). Hai lược đồ phải **giống hệt**. Đây là lớp duy nhất
 *    kiểm *hậu quả* chứ không kiểm *hình thức*: nó đỏ với mọi cách viết chú thích
 *    nào làm SQL gửi lên remote khác SQL ta đọc — kể cả cách chưa ai nghĩ ra.
 *
 * ## Vì sao không có bài test nào khác thấy được lỗi này
 *
 * Đường chạy local (Miniflare, `applyD1Migrations` trong `test/ap-migration.ts`)
 * đi qua `readD1Migrations`, vốn hiểu chú thích khối đúng cách — nên mọi test
 * khác vẫn xanh trong khi bản remote chết. Và `wrangler … --remote` thì không
 * chạy được trong CI/test (cấm gọi dịch vụ thật — `CLAUDE.md` mục 2).
 *
 * Văn bản thô của file đến từ binding `TEST_VAN_BAN_MIGRATION` do
 * `vitest.config.ts` đọc bằng `node:fs` (Worker không có `node:fs`). Nó đọc **cả
 * thư mục**, nên file migration thêm sau cũng tự động bị quét.
 */

import { applyD1Migrations, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { boChuThichDongKieuD1, docLuocDo, tachCauLenh } from './tien-xu-ly-d1.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`): ca hết giờ
// không để câu D1 còn dở của thân chạy tiếp lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it } = caQuaSo(bay);

/** Một chỗ vi phạm: tên file + số dòng + nguyên dòng đó. */
interface ViPham {
  ten: string;
  dong: number;
  noiDung: string;
}

/**
 * Quét một file SQL, trả về **mọi chỗ mở chú thích khối `/*`** và **mọi dấu `;`
 * nằm trong chú thích khối**.
 *
 * Đi từng ký tự và bỏ qua đúng những vùng mà `/*` hay `;` không phải chú thích
 * khối: chú thích dòng `-- …` và chuỗi ký tự `'…'` (trong chuỗi có thể có cả
 * `/*` — đó là dữ liệu, không phải chú thích).
 */
function quet(ten: string, sql: string): { khoi: ViPham[]; chamPhay: ViPham[] } {
  const dongCuaFile = sql.split('\n');
  const khoi: ViPham[] = [];
  const chamPhay: ViPham[] = [];
  let i = 0;
  let dong = 1;

  const chi = (): ViPham => ({ ten, dong, noiDung: (dongCuaFile[dong - 1] ?? '').trim() });

  while (i < sql.length) {
    const c = sql[i];

    if (c === '\n') {
      dong += 1;
      i += 1;
      continue;
    }

    // Chú thích dòng: dạng duy nhất được phép. `;` hay `/*` trong đó đều vô hại
    // (0001–0008 có `;` trong chú thích dòng và vẫn áp được trên remote).
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }

    // Chuỗi ký tự SQL: `''` là dấu nháy escape, không phải hết chuỗi.
    if (c === "'") {
      i += 1;
      while (i < sql.length) {
        if (sql[i] === '\n') dong += 1;
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // Chú thích khối: bản thân nó đã là vi phạm, và soi thêm `;` bên trong.
    if (c === '/' && sql[i + 1] === '*') {
      khoi.push(chi());
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) {
        if (sql[i] === '\n') dong += 1;
        if (sql[i] === ';') chamPhay.push(chi());
        i += 1;
      }
      i += 2;
      continue;
    }

    i += 1;
  }

  return { khoi, chamPhay };
}

function bao(v: ViPham[]): string {
  return v.map((x) => `  ${x.ten}:${x.dong} → ${x.noiDung}`).join('\n');
}

describe('migration D1 — chú thích không được làm lệch SQL gửi lên remote', () => {
  it('có file migration để quét (binding không rỗng)', () => {
    expect(env.TEST_VAN_BAN_MIGRATION.length).toBeGreaterThan(0);
    for (const f of env.TEST_VAN_BAN_MIGRATION) {
      expect(f.ten, f.ten).toMatch(/\.sql$/);
      expect(f.noi_dung.length, f.ten).toBeGreaterThan(0);
    }
  });

  it('không file nào có chú thích khối /* … */ (chỉ dùng chú thích dòng --)', () => {
    const viPham = env.TEST_VAN_BAN_MIGRATION.flatMap((f) => quet(f.ten, f.noi_dung).khoi);
    expect(
      viPham,
      `Chú thích khối "/*" trong migration — cấm hoàn toàn.\n` +
        `wrangler d1 migrations apply --remote xoá "-- …" tới hết dòng TRƯỚC khi gửi SQL,\n` +
        `nên một dấu "--" bên trong /* … */ cũng xoá luôn dấu "*/" đóng khối: khối kéo dài\n` +
        `sang dưới và NUỐT SQL thật ("no such column: url … SQLITE_ERROR [code: 7500]").\n` +
        `Viết lại thành nhiều dòng "-- …".\n` +
        `Chỗ vi phạm:\n${bao(viPham)}`,
    ).toEqual([]);
  });

  it('không file nào có dấu ; trong /* … */ (lỗi remote incomplete input 7500)', () => {
    const viPham = env.TEST_VAN_BAN_MIGRATION.flatMap((f) => quet(f.ten, f.noi_dung).chamPhay);
    expect(
      viPham,
      `Dấu ";" nằm trong chú thích khối /* … */ của migration.\n` +
        `wrangler d1 migrations apply --remote tách câu lệnh theo ";" và không hiểu /* … */,\n` +
        `nên câu SQL thật bị cắt giữa: "incomplete input: SQLITE_ERROR [code: 7500]".\n` +
        `Chỗ vi phạm:\n${bao(viPham)}`,
    ).toEqual([]);
  });

  it('bộ quét tự nó đúng: bắt /* và ; trong khối, bỏ qua chú thích dòng và chuỗi', () => {
    expect(quet('x.sql', '/* a; b */\nSELECT 1;\n')).toEqual({
      khoi: [{ ten: 'x.sql', dong: 1, noiDung: '/* a; b */' }],
      chamPhay: [{ ten: 'x.sql', dong: 1, noiDung: '/* a; b */' }],
    });
    expect(quet('x.sql', '-- a; b\n-- /* c */\nSELECT 1;\n')).toEqual({ khoi: [], chamPhay: [] });
    expect(quet('x.sql', "SELECT 'a; /* b */ c';\n")).toEqual({ khoi: [], chamPhay: [] });
    expect(quet('x.sql', '/* dòng 1\n   dòng 2;\n*/\n')).toEqual({
      khoi: [{ ten: 'x.sql', dong: 1, noiDung: '/* dòng 1' }],
      chamPhay: [{ ten: 'x.sql', dong: 2, noiDung: 'dòng 2;' }],
    });
  });

  it('bộ tiền xử lý tự nó đúng: xoá -- tới hết dòng, trừ trong chuỗi', () => {
    expect(boChuThichDongKieuD1('SELECT 1; -- ghi chú\nSELECT 2;\n')).toBe(
      'SELECT 1; \nSELECT 2;\n',
    );
    // Cái bẫy của remote, viết thành một ca: dấu `*/` bị xoá cùng dòng.
    expect(boChuThichDongKieuD1('/* --- a --- */\nurl TEXT,\n')).toBe('/* \nurl TEXT,\n');
    // `--` trong chuỗi là dữ liệu, không phải chú thích.
    expect(boChuThichDongKieuD1("SELECT 'a -- b';\n")).toBe("SELECT 'a -- b';\n");
  });

  it('bộ tách câu lệnh tự nó đúng: giữ ; trong thân trigger BEGIN … END', () => {
    expect(tachCauLenh('SELECT 1;\nSELECT 2;\n')).toEqual(['SELECT 1', 'SELECT 2']);
    expect(
      tachCauLenh('CREATE TRIGGER t BEFORE DELETE ON a BEGIN SELECT 1; END;\nSELECT 2;\n'),
    ).toEqual(['CREATE TRIGGER t BEFORE DELETE ON a BEGIN SELECT 1; END', 'SELECT 2']);
    // Khối chú thích **không đóng** ăn hết phần sau — đúng như SQLite/D1.
    expect(tachCauLenh('/* \nSELECT 1;\n')).toEqual([]);
  });

  /**
   * Lớp 3: **tương đương lược đồ**.
   *
   * `DB` đã được `test/ap-migration.ts` áp bản gốc (qua `readD1Migrations`).
   * Ở đây áp **cùng 18 file** nhưng đã qua bộ tiền xử lý của remote lên
   * `DB_TIEN_XU_LY` sạch, rồi so từng bảng, từng cột, từng index, từng trigger.
   */
  it('18 migration qua bộ tiền xử lý của D1 remote cho lược đồ GIỐNG HỆT bản gốc', async () => {
    const migrations = env.TEST_VAN_BAN_MIGRATION.map((f) => ({
      name: f.ten,
      queries: tachCauLenh(boChuThichDongKieuD1(f.noi_dung)),
    }));

    // Áp được trọn, không câu nào lỗi. Mọi file phải sinh ra ít nhất một câu.
    for (const m of migrations) {
      expect(m.queries.length, m.name).toBeGreaterThan(0);
    }
    await applyD1Migrations(env.DB_TIEN_XU_LY, migrations);

    const goc = await docLuocDo(env.DB);
    const sau = await docLuocDo(env.DB_TIEN_XU_LY);

    expect(sau.doiTuong.map((d) => `${d.loai} ${d.ten}`)).toEqual(
      goc.doiTuong.map((d) => `${d.loai} ${d.ten}`),
    );
    expect(Object.keys(sau.cot)).toEqual(Object.keys(goc.cot));
    for (const bang of Object.keys(goc.cot)) {
      expect(sau.cot[bang], bang).toEqual(goc.cot[bang]);
    }
    expect(sau).toEqual(goc);
  });
});
