/**
 * **Mô phỏng bộ tiền xử lý SQL của `wrangler d1 … --remote`**, cho bài test
 * `migration-d1-chu-thich.test.ts`.
 *
 * ## Vì sao cần mô phỏng
 *
 * Đường chạy test (Miniflare, `applyD1Migrations` + `readD1Migrations`) **không**
 * giống đường chạy thật lên DB remote. Trên remote, chú thích dòng `-- …` bị xoá
 * **tới hết dòng TRƯỚC khi** SQL được tách câu và gửi đi. Hệ quả: một dấu `--`
 * nằm **bên trong** chú thích khối `/* … *\/` cũng bị xoá cùng với phần còn lại
 * của dòng — kể cả dấu `*\/` đóng khối nếu nó ở cùng dòng.
 *
 * Đó đúng là chuyện đã xảy ra với 0009. Dòng
 *
 *     /* --- `deploy`: URL + mã phiên bản tuỳ chọn — SPEC d.207 --------- *\/
 *
 * bị cắt từ `---` trở đi, còn lại `/*` **không có `*\/`**, nên chú thích khối
 * kéo dài sang các dòng dưới và **nuốt luôn** định nghĩa cột `url TEXT`. Câu
 * `CHECK (loai <> 'deploy' OR url IS NOT NULL)` phía sau thành câu tham chiếu
 * một cột không tồn tại, và D1 trả về:
 *
 *     no such column: url at offset 5074: SQLITE_ERROR [code: 7500]
 *
 * ## Hai hàm ở đây
 *
 * * `boChuThichDongKieuD1` — bước xoá `-- …` tới hết dòng (bỏ qua `--` nằm trong
 *   chuỗi `'…'`, vì chuỗi là **dữ liệu**, không phải chú thích).
 * * `tachCauLenh` — bản port của bộ tách câu lệnh của wrangler
 *   (`src/d1/splitter.ts`): hiểu chuỗi `'…'`/`"…"`/`` `…` ``, chú thích `--` và
 *   `/* … *\/`, và khối ghép `BEGIN … END;` của trigger (nên dấu `;` trong thân
 *   trigger không bị coi là hết câu). Port chứ không `import` từ `wrangler` vì
 *   `wrangler` không phải dependency khai của repo (nó chỉ có trong
 *   `node_modules` nhờ `@cloudflare/vitest-pool-workers`), và vì test chạy
 *   **trong Worker**, nơi không nhập được CLI của Node.
 *   Nhánh `$dollar$` của bản gốc (cú pháp PostgreSQL) bị bỏ: SQL của dự án này
 *   là SQLite, không có nó.
 *
 * Một chú thích khối **không đóng** sẽ bị `tachCauLenh` ăn tới hết file — đúng
 * như SQLite/D1 làm, nên bài test tương đương lược đồ **đỏ** nếu ai đó đưa
 * `/* … -- … *\/` trở lại.
 */

/** Xoá `-- …` tới hết dòng, trừ khi `--` nằm trong một chuỗi `'…'`. */
export function boChuThichDongKieuD1(sql: string): string {
  let ra = '';
  let i = 0;

  while (i < sql.length) {
    const c = sql[i];

    // Chuỗi ký tự SQL: giữ nguyên, kể cả `--` hay `/*` bên trong. `''` là dấu
    // nháy escape, không phải hết chuỗi.
    if (c === "'") {
      ra += c;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          ra += "''";
          i += 2;
          continue;
        }
        ra += sql[i];
        if (sql[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    // Chú thích dòng: xoá tới hết dòng, **giữ** dấu xuống dòng.
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }

    ra += c;
    i += 1;
  }

  return ra;
}

function anToi(iterator: Iterator<string>, moc: string): string {
  let next = iterator.next();
  let str = '';
  while (next.done !== true) {
    str += next.value;
    if (str.endsWith(moc)) break;
    next = iterator.next();
  }
  return str;
}

function batDauKhoiGhep(str: string): boolean {
  return /\s(BEGIN|CASE)\s$/i.test(str);
}

function ketKhoiGhep(str: string): boolean {
  return /\sEND[;\s]$/.test(str);
}

/** Tách một file SQL thành từng câu lệnh — cùng luật với wrangler. */
export function tachCauLenh(sql: string): string[] {
  const cauLenh: string[] = [];
  let str = '';
  let khoiGhepDangMo = 0;

  const iterator = sql[Symbol.iterator]();
  let next = iterator.next();

  while (next.done !== true) {
    const char = next.value;

    if (khoiGhepDangMo > 0 && ketKhoiGhep(str + char)) {
      khoiGhepDangMo -= 1;
    }

    switch (char) {
      case "'":
      case '"':
      case '`':
        str += char + anToi(iterator, char);
        break;

      case '-': {
        next = iterator.next();
        if (next.done !== true && next.value === '-') {
          anToi(iterator, '\n');
          str += '\n';
          break;
        }
        str += char;
        continue; // ký tự vừa đọc trước được xử lý ở vòng sau
      }

      case '/': {
        next = iterator.next();
        if (next.done !== true && next.value === '*') {
          // Khối không đóng ⇒ ăn tới hết file, đúng như SQLite.
          anToi(iterator, '*/');
          break;
        }
        str += char;
        continue;
      }

      case ';':
        if (khoiGhepDangMo === 0) {
          cauLenh.push(str);
          str = '';
        } else {
          str += char;
        }
        break;

      default:
        str += char;
        break;
    }

    if (batDauKhoiGhep(str)) {
      khoiGhepDangMo += 1;
    }

    next = iterator.next();
  }

  cauLenh.push(str);
  return cauLenh.map((c) => c.trim()).filter((c) => c.length > 0);
}

/** Một cột như `PRAGMA table_info` trả về. */
export interface Cot {
  ten: string;
  kieu: string;
  khong_null: number;
  mac_dinh: string | null;
  khoa_chinh: number;
}

/** Lược đồ đọc được từ một DB: đối tượng của `sqlite_master` + cột từng bảng. */
export interface LuocDo {
  doiTuong: { loai: string; ten: string; bang: string; sql: string }[];
  cot: Record<string, Cot[]>;
}

/** Gộp mọi khoảng trắng thành một dấu cách — để so SQL mà không so cách xuống dòng. */
function gonTrang(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Đọc lược đồ của một DB: tên + SQL của mọi bảng/index/trigger, và danh sách cột
 * của từng bảng.
 *
 * Bỏ ba nhóm không thuộc lược đồ của dự án: `sqlite_%` (nội bộ SQLite), `_cf_%`
 * (nội bộ D1 — `PRAGMA` trên chúng trả `not authorized: SQLITE_AUTH`) và
 * `d1_migrations` (bảng sổ của `applyD1Migrations`).
 */
export async function docLuocDo(db: D1Database): Promise<LuocDo> {
  const ketQua = await db
    .prepare(
      `SELECT type AS loai, name AS ten, tbl_name AS bang, COALESCE(sql, '') AS sql
         FROM sqlite_master
        WHERE name NOT LIKE 'sqlite_%'
          AND substr(name, 1, 4) <> '_cf_'
          AND name <> 'd1_migrations'
        ORDER BY type, name`,
    )
    .all<{ loai: string; ten: string; bang: string; sql: string }>();

  const doiTuong = ketQua.results.map((d) => ({
    loai: d.loai,
    ten: d.ten,
    bang: d.bang,
    sql: gonTrang(d.sql),
  }));

  const cot: Record<string, Cot[]> = {};
  for (const d of doiTuong) {
    if (d.loai !== 'table') continue;
    // Tên lấy từ `sqlite_master` của chính DB này; chặn ký tự lạ vì `PRAGMA`
    // không nhận tham số bind.
    if (!/^[A-Za-z0-9_]+$/.test(d.ten)) throw new Error(`ten bang la: ${d.ten}`);
    const info = await db.prepare(`PRAGMA table_info(${d.ten})`).all<{
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }>();
    cot[d.ten] = info.results.map((c) => ({
      ten: c.name,
      kieu: c.type,
      khong_null: c.notnull,
      mac_dinh: c.dflt_value,
      khoa_chinh: c.pk,
    }));
  }

  return { doiTuong, cot };
}
