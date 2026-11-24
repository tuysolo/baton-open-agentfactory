/**
 * **Bảng lệnh trong tài liệu phải khớp sổ lệnh của CLI** (BAT-45).
 *
 * Ba nơi kể tên lệnh `baton`: sổ lệnh `SO_LENH` (`packages/cli/src/lenh.ts`, key
 * = `khai.ten`), bảng "Lệnh CLI" của SPEC mục 13, và bảng mục 6 của
 * `HUONG-DAN-AGENT.md`. Thêm một lệnh vào CLI mà quên một trong hai bảng — hoặc
 * kể trong bảng một lệnh CLI không có — thì agent đọc tài liệu sẽ gọi sai. File
 * này làm lệch đó thành **đỏ**, và thông điệp nói rõ lệnh nào thiếu ở đâu.
 *
 * Cùng lý lẽ chống tautology của `packages/web/test/doc-spec.ts`: danh sách mong
 * đợi được **cắt ra từ chính tài liệu**, không gõ lại trong ca test. Hình chữ mà
 * parser phụ thuộc là bảng markdown có cột đầu dạng `` `baton <ten> …` `` (SPEC)
 * hoặc `` `<ten>` `` (HUONG-DAN); parser **ném** khi cắt ra quá ít hàng, để một
 * lần viết lại tài liệu làm parser vô nghĩa là đỏ, không phải "mọi ca xanh".
 */

/*
 * Hai tài liệu nhập bằng `?raw` của Vite, **không** bằng `node:fs`: root này chạy
 * trong Worker (Miniflare), ở đó `node:fs` không đọc được đĩa thật (xem chú thích
 * `vanBanMigration` ở `vitest.config.ts`). `?raw` được Vite giải lúc nạp module,
 * trên Node, nên tới Worker chỉ còn một chuỗi. Hai file nằm ở gốc repo, ngoài
 * `packages/api` — `server.fs.allow` của `vitest.config.ts` cho phép tường minh.
 */
import SPEC_VAN from '../../../SPEC.md?raw';
import HUONG_DAN_VAN from '../../../HUONG-DAN-AGENT.md?raw';
import { describe, expect, it } from 'vitest';
import { SO_LENH } from '@baton/cli';

/** Tên mọi lệnh CLI đăng ký, theo chữ cái. */
const LENH_CLI: string[] = Object.keys(SO_LENH).sort();

/**
 * **Lệnh CLI cố ý KHÔNG nằm trong bảng SPEC mục 13** — mỗi lệnh một mục SPEC làm
 * nguồn. Không sửa SPEC để thêm chúng; ngoại lệ được ghim ở đây, và ca
 * "ngoại lệ còn đúng" dưới đây đỏ khi một ngoại lệ hết lý do tồn tại.
 */
const NGOAI_LE_SPEC_13: Readonly<Record<string, string>> = {
  rules: 'SPEC mục 9 — Luật chung "Agent đọc được qua CLI hoặc MCP"',
  export: 'SPEC mục 15 — xuất toàn bộ dữ liệu, chỉ chủ',
  // Bản đồ L1 (Chủ chốt T-127 = A, 04/11): cú pháp nằm ở 20.1, không ở bảng mục 13.
  project: 'SPEC 20.1 — `baton project set <MÃ> …`',
  ticket: 'SPEC 20.1 — `baton ticket set <MÃ> …`',
  // `cancel` từng là ngoại lệ (BAT-56, #83); BAT-59 đã thêm nó vào bảng mục 13
  // (Chủ chốt T-73/T-75 = A), nên ca "ngoại lệ còn đúng" buộc gỡ khỏi đây.
};

/** Thân của một mục `## <so>. …`, tới tiêu đề `## ` kế tiếp hoặc hết file. */
function mucMd(van: string, so: number, ten_file: string): string {
  const dau = van.indexOf(`\n## ${String(so)}. `);
  if (dau === -1) throw new Error(`${ten_file} không có mục ${String(so)}`);
  const sau = van.indexOf('\n## ', dau + 1);
  return van.slice(dau, sau === -1 ? undefined : sau);
}

/**
 * Cột đầu của bảng markdown mở đầu bằng hàng tiêu đề `tieu_de`, tới dòng đầu tiên
 * không còn bắt đầu bằng `|`. Hàng gạch `|---|` bị bỏ.
 */
function cotDauCuaBang(than: string, tieu_de: string): string[] {
  const dong = than.split('\n');
  const dau = dong.findIndex((d) => d.startsWith(tieu_de));
  if (dau === -1) throw new Error(`Không còn bảng có hàng tiêu đề "${tieu_de}"`);
  const ra: string[] = [];
  for (const d of dong.slice(dau + 1)) {
    if (!d.startsWith('|')) break;
    const o = d.split('|')[1]?.trim() ?? '';
    if (o === '' || /^-+$/.test(o)) continue;
    ra.push(o);
  }
  return ra;
}

/** Tên lệnh của bảng "Lệnh CLI" — SPEC mục 13, ô `` `baton <ten> …` ``. */
function lenhBangSpec13(van: string): string[] {
  const o = cotDauCuaBang(mucMd(van, 13, 'SPEC.md'), '| Lệnh | Hành vi |');
  const ra = o.map((x) => {
    const khop = /^`baton ([a-z]+)\b/.exec(x);
    if (khop?.[1] === undefined) throw new Error(`Ô không đúng dạng \`baton <ten> …\`: ${x}`);
    return khop[1];
  });
  if (ra.length < 10) throw new Error(`Cắt ra ${String(ra.length)} hàng bảng SPEC mục 13, quá ít`);
  return ra;
}

interface Muc6HuongDan {
  /** Tên lệnh ở cột đầu của bảng. */
  hang: string[];
  /** N trong tiêu đề "## 6. Bảng N lệnh". */
  so_tieu_de: number;
  /** Lệnh ở đoạn "**Lệnh thứ M — KHÔNG dành cho agent:** `<ten> …`". */
  lenh_ngoai_bang: string;
  /** M của đoạn đó. */
  so_thu_tu_ngoai_bang: number;
  /** K trong câu "`baton` một mình → danh sách **K** tên lệnh". */
  so_baton_mot_minh: number;
}

/** Mục 6 của `HUONG-DAN-AGENT.md` — bảng, tiêu đề, đoạn lệnh ngoài bảng, câu đếm. */
function muc6HuongDan(van: string): Muc6HuongDan {
  const than = mucMd(van, 6, 'HUONG-DAN-AGENT.md');

  const hang = cotDauCuaBang(than, '| Lệnh | Cú pháp |').map((x) => {
    const khop = /^`([a-z]+)`$/.exec(x);
    if (khop?.[1] === undefined) throw new Error(`Ô không đúng dạng \`<ten>\`: ${x}`);
    return khop[1];
  });
  if (hang.length < 10) throw new Error(`Cắt ra ${String(hang.length)} hàng bảng mục 6, quá ít`);

  const tieu_de = /^\n## 6\. Bảng (\d+) lệnh/.exec(than);
  if (tieu_de?.[1] === undefined) throw new Error('Mục 6 không còn tiêu đề "Bảng N lệnh"');

  const ngoai = /\*\*Lệnh thứ (\d+) — KHÔNG dành cho agent:\*\* `([a-z]+)\b/.exec(than);
  if (ngoai?.[1] === undefined || ngoai[2] === undefined) {
    throw new Error('Mục 6 không còn đoạn "**Lệnh thứ N — KHÔNG dành cho agent:** `<ten> …`"');
  }

  const mot_minh = /`baton` một mình → danh sách \*\*(\d+)\*\* tên lệnh/.exec(than);
  if (mot_minh?.[1] === undefined) {
    throw new Error('Mục 6 không còn câu "`baton` một mình → danh sách **N** tên lệnh"');
  }

  return {
    hang,
    so_tieu_de: Number(tieu_de[1]),
    lenh_ngoai_bang: ngoai[2],
    so_thu_tu_ngoai_bang: Number(ngoai[1]),
    so_baton_mot_minh: Number(mot_minh[1]),
  };
}

/**
 * Hai chiều lệch giữa CLI và một bảng, thành câu đọc được. Rỗng = khớp.
 * `bo_qua` là các lệnh CLI được phép vắng ở bảng (ngoại lệ có chủ ý).
 */
function lechVoiCli(bang: string[], ten_bang: string, bo_qua: readonly string[] = []): string[] {
  const cli = new Set(LENH_CLI);
  const trong_bang = new Set(bang);
  const ra: string[] = [];
  for (const ten of LENH_CLI) {
    if (!trong_bang.has(ten) && !bo_qua.includes(ten)) {
      ra.push(`\`${ten}\` có trong CLI (SO_LENH) nhưng THIẾU ở ${ten_bang}`);
    }
  }
  for (const ten of bang) {
    if (!cli.has(ten)) ra.push(`\`${ten}\` có ở ${ten_bang} nhưng CLI (SO_LENH) KHÔNG có`);
  }
  // Một tên kể hai lần trong bảng cũng là lệch (hàng chép đôi, quên sửa tên).
  for (const ten of trong_bang) {
    const n = bang.filter((x) => x === ten).length;
    if (n > 1) ra.push(`\`${ten}\` kể ${String(n)} lần ở ${ten_bang}`);
  }
  return ra;
}

describe('BAT-45 — bảng lệnh trong tài liệu khớp SO_LENH', () => {
  it('sổ lệnh CLI không rỗng (ca ghim nền: không có nó mọi so sánh dưới đây vô nghĩa)', () => {
    expect(LENH_CLI.length).toBeGreaterThanOrEqual(10);
    // Key của sổ chính là `khai.ten` của lệnh — điều mà mọi ca dưới đây dựa vào.
    for (const [ten, lenh] of Object.entries(SO_LENH)) expect(lenh.khai.ten).toBe(ten);
  });

  describe('SPEC mục 13 — bảng "Lệnh CLI"', () => {
    const bang = lenhBangSpec13(SPEC_VAN);
    const ngoai_le = Object.keys(NGOAI_LE_SPEC_13);

    it('mọi lệnh CLI có trong bảng (trừ ngoại lệ có chủ ý) và mọi hàng bảng là một lệnh CLI', () => {
      expect(lechVoiCli(bang, 'bảng "Lệnh CLI" của SPEC mục 13', ngoai_le)).toEqual([]);
    });

    it('ngoại lệ còn đúng: mỗi ngoại lệ vẫn có trong CLI và vẫn vắng trong bảng', () => {
      const sai: string[] = [];
      for (const [ten, nguon] of Object.entries(NGOAI_LE_SPEC_13)) {
        if (!(ten in SO_LENH)) {
          sai.push(`ngoại lệ \`${ten}\` (${nguon}) không còn trong CLI — gỡ khỏi NGOAI_LE_SPEC_13`);
        }
        if (bang.includes(ten)) {
          sai.push(`ngoại lệ \`${ten}\` (${nguon}) đã có trong bảng SPEC mục 13 — gỡ khỏi NGOAI_LE_SPEC_13`);
        }
      }
      expect(sai).toEqual([]);
    });
  });

  /*
   * BAT-59 (#83, Chủ chốt T-73/T-75 = A): chữ bảng mục 13 khớp **cú pháp thật** của
   * CLI cho các cờ đã cài ở BAT-56 — `--luot` của ba lệnh cần phiên, `--reason`
   * của `cancel`. Cắt ô từ SPEC, so với `khai.co` của SO_LENH.
   */
  describe('SPEC mục 13 — cờ `--luot` / `--reason` khớp khai lệnh CLI (BAT-59)', () => {
    const o = cotDauCuaBang(mucMd(SPEC_VAN, 13, 'SPEC.md'), '| Lệnh | Hành vi |');
    const oCua = (ten: string): string => {
      const x = o.find((v) => v.startsWith(`\`baton ${ten} `) || v === `\`baton ${ten}\``);
      if (x === undefined) throw new Error(`Bảng mục 13 không còn hàng \`baton ${ten} …\``);
      return x;
    };

    for (const ten of ['heartbeat', 'log', 'plan']) {
      it(`\`${ten}\`: ô SPEC có "[--luot <lượt>]" và CLI khai cờ \`luot\``, () => {
        expect(oCua(ten)).toContain('[--luot <lượt>]');
        expect(SO_LENH[ten]?.khai.co['luot']).toBe('gia_tri');
      });
    }

    it('`cancel`: ô SPEC là `baton cancel <lượt> --reason "<lý do>"` và CLI khai cờ `reason`', () => {
      expect(oCua('cancel')).toBe('`baton cancel <lượt> --reason "<lý do>"`');
      expect(SO_LENH['cancel']?.khai.co['reason']).toBe('gia_tri');
    });

    it('ghi chú dưới bảng nói BATON_LUOT, "cờ thắng biến", `--luot=` rỗng và ≥2 phiên mở ⇒ INVALID_INPUT', () => {
      const than = mucMd(SPEC_VAN, 13, 'SPEC.md');
      const dong = than.split('\n').find((d) => d.includes('`--luot <lượt>` của `heartbeat`, `log`, `plan`'));
      if (dong === undefined) throw new Error('Mục 13 không còn ghi chú `--luot` dưới bảng');
      expect(dong).toContain('BATON_LUOT');
      expect(dong).toContain('cờ thắng biến');
      expect(dong).toContain('Cờ gõ mà rỗng (`--luot=`) ⇒ `INVALID_INPUT`');
      expect(dong).toContain('từ 2 phiên mở trở lên ⇒ `INVALID_INPUT`');
    });
  });

  describe('HUONG-DAN-AGENT.md mục 6 — "Bảng N lệnh"', () => {
    const muc6 = muc6HuongDan(HUONG_DAN_VAN);

    it('hàng bảng ∪ lệnh ở đoạn "Lệnh thứ N" = đúng các lệnh CLI', () => {
      expect(
        lechVoiCli(
          [...muc6.hang, muc6.lenh_ngoai_bang],
          'HUONG-DAN-AGENT.md mục 6 (bảng + đoạn "Lệnh thứ N")',
        ),
      ).toEqual([]);
    });

    it('lệnh ngoài bảng là `export` và không đồng thời nằm trong bảng', () => {
      expect(muc6.lenh_ngoai_bang).toBe('export');
      expect(muc6.hang).not.toContain('export');
    });

    it('số trong tiêu đề = số hàng bảng = số lệnh CLI − 1', () => {
      expect(muc6.so_tieu_de, 'N của tiêu đề "## 6. Bảng N lệnh" ≠ số hàng bảng').toBe(
        muc6.hang.length,
      );
      expect(muc6.hang.length, 'số hàng bảng mục 6 ≠ số lệnh CLI − 1 (export nằm ngoài bảng)').toBe(
        LENH_CLI.length - 1,
      );
    });

    it('"Lệnh thứ N" và "`baton` một mình → **N** tên lệnh" = số lệnh CLI', () => {
      expect(muc6.so_thu_tu_ngoai_bang, 'N của "**Lệnh thứ N**" ≠ số lệnh CLI').toBe(
        LENH_CLI.length,
      );
      expect(muc6.so_baton_mot_minh, 'N của "`baton` một mình → **N** tên lệnh" ≠ số lệnh CLI').toBe(
        LENH_CLI.length,
      );
    });
  });
});
