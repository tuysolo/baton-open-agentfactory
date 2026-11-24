/**
 * **Danh sách công cụ MCP phải khớp CLI và bảng "Lệnh CLI" của SPEC mục 13** (BAT-46).
 *
 * SPEC mục 13 viết tiêu đề bảng là "Lệnh CLI (MCP có công cụ tương đương, cùng
 * tên)". Ba nơi kể tên: sổ lệnh `SO_LENH` của CLI, danh sách `tools/list` của máy
 * chủ MCP, và bảng đó trong SPEC. `mcp.test.ts` đã ghim MCP = `SO_LENH` trừ
 * `chi_cli`; file này ghim **ba bên**, có **ngoại lệ tường minh kèm lý do**, và
 * làm đỏ khi một ngoại lệ hết lý do tồn tại.
 *
 * Cùng khuôn `bang-lenh.test.ts` (BAT-45): danh sách mong đợi **cắt ra từ chính
 * SPEC**, parser **ném** khi cắt ra quá ít hàng, mỗi phép so trả mảng câu đọc được
 * nói rõ tên nào thiếu ở đâu (`expect(lech).toEqual([])`).
 *
 * Ba hàm nhỏ `mucMd`, `cotDauCuaBang`, `lenhBangSpec13` được **chép** từ
 * `bang-lenh.test.ts` thay vì tách helper chung: chép là cách ít đụng nhất — file
 * BAT-45 giữ nguyên từng dòng.
 */

/*
 * SPEC nhập bằng `?raw` của Vite, không bằng `node:fs` — xem chú thích ở đầu
 * `bang-lenh.test.ts` và `server.fs.allow` của `vitest.config.ts`.
 */
import SPEC_VAN from '../../../SPEC.md?raw';
import { describe, expect, it } from 'vitest';
import { SO_LENH, xuLyDong, type MoiTruongCli } from '@baton/cli';

/**
 * **Lệnh CLI cố ý KHÔNG là công cụ MCP** — mỗi lệnh một lý do có nguồn. Ca
 * "ngoại lệ còn đúng" đỏ khi lý do không còn.
 */
const NGOAI_LE_MCP_KHONG_CO: Readonly<Record<string, string>> = {
  export: 'SPEC mục 15 — lệnh của chủ, ghi file; BAT-8 khai `chi_cli: true` ở SO_LENH',
};

/**
 * **Công cụ MCP cố ý KHÔNG nằm trong bảng SPEC mục 13** — mỗi tên một mục SPEC
 * làm nguồn. Không sửa SPEC để thêm chúng.
 */
const NGOAI_LE_MCP_NGOAI_SPEC_13: Readonly<Record<string, string>> = {
  rules: 'SPEC mục 9 — Luật chung "Agent đọc được qua CLI hoặc MCP"',
  // Bản đồ L1: 20.1 "API và MCP có thao tác tương ứng" — cú pháp ở 20.1, không ở bảng mục 13.
  project: 'SPEC 20.1 — `project set`, "API và MCP có thao tác tương ứng"',
  ticket: 'SPEC 20.1 — `ticket set`, "API và MCP có thao tác tương ứng"',
  // `cancel` đã vào bảng mục 13 ở BAT-59 (#83, Chủ chốt T-73/T-75 = A).
};

/** Thân của một mục `## <so>. …`, tới tiêu đề `## ` kế tiếp hoặc hết file. */
function mucMd(van: string, so: number, ten_file: string): string {
  const dau = van.indexOf(`\n## ${String(so)}. `);
  if (dau === -1) throw new Error(`${ten_file} không có mục ${String(so)}`);
  const sau = van.indexOf('\n## ', dau + 1);
  return van.slice(dau, sau === -1 ? undefined : sau);
}

/** Cột đầu của bảng markdown mở đầu bằng hàng tiêu đề `tieu_de`; bỏ hàng gạch. */
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

/**
 * Tên công cụ **qua đúng đường giao thức** `tools/list` (`xuLyDong` — đường vào
 * một dòng chữ của máy chủ), không gọi thẳng `danhSachCongCu()`: thứ cần ghim là
 * cái một client MCP thật nhìn thấy. `tools/list` không gọi API, nên môi trường
 * ở đây có `fetch` **ném** — lỡ có gọi mạng thì đỏ, chứ không lặng lẽ đi ra ngoài.
 */
async function tenCongCuMcp(): Promise<string[]> {
  const mt: MoiTruongCli = {
    env: { BATON_URL: 'https://baton.test', BATON_TOKEN: 'bt_token_gia_bat46' },
    viet: () => undefined,
    vietLoi: () => undefined,
    fetch: () => {
      throw new Error('tools/list không được gọi mạng');
    },
    docFile: () => Promise.reject(new Error('tools/list không được đọc file')),
  };
  const tra = await xuLyDong(mt, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
  if (tra === null || tra.error !== undefined) {
    throw new Error(`tools/list trả lỗi giao thức: ${JSON.stringify(tra)}`);
  }
  const { tools } = tra.result as { tools: { name: string }[] };
  return tools.map((t) => t.name);
}

/** Tên kể nhiều lần trong một danh sách, thành câu đọc được. */
function trungTen(ds: readonly string[], noi: string): string[] {
  const ra: string[] = [];
  for (const ten of new Set(ds)) {
    const n = ds.filter((x) => x === ten).length;
    if (n > 1) ra.push(`\`${ten}\` kể ${String(n)} lần ở ${noi}`);
  }
  return ra;
}

const MCP = 'tools/list của máy chủ MCP';
const CLI = 'CLI (SO_LENH)';
const SPEC13 = 'bảng "Lệnh CLI" của SPEC mục 13';

describe('BAT-46 — công cụ MCP khớp CLI và bảng SPEC mục 13', () => {
  const lenh_cli = Object.keys(SO_LENH).sort();
  const bang = lenhBangSpec13(SPEC_VAN);

  it('ca nền: tools/list không rỗng (≥10) và key SO_LENH = khai.ten (tên công cụ = tên lệnh)', async () => {
    const mcp = await tenCongCuMcp();
    expect(mcp.length).toBeGreaterThanOrEqual(10);
    for (const [ten, lenh] of Object.entries(SO_LENH)) expect(lenh.khai.ten).toBe(ten);
  });

  it('MCP ↔ CLI: mọi lệnh CLI có công cụ cùng tên (trừ ngoại lệ), mọi công cụ là lệnh CLI, không trùng tên', async () => {
    const mcp = await tenCongCuMcp();
    const tap_mcp = new Set(mcp);
    const tap_cli = new Set(lenh_cli);
    const lech: string[] = [];
    for (const ten of lenh_cli) {
      if (!tap_mcp.has(ten) && !(ten in NGOAI_LE_MCP_KHONG_CO)) {
        lech.push(`\`${ten}\` có trong ${CLI} nhưng THIẾU ở ${MCP} (không phải ngoại lệ NGOAI_LE_MCP_KHONG_CO)`);
      }
    }
    for (const ten of mcp) {
      if (!tap_cli.has(ten)) lech.push(`\`${ten}\` có ở ${MCP} nhưng ${CLI} KHÔNG có`);
    }
    lech.push(...trungTen(mcp, MCP));
    expect(lech).toEqual([]);
  });

  it('MCP ↔ SPEC 13: mọi hàng bảng có công cụ MCP cùng tên; mọi công cụ nằm trong bảng (trừ ngoại lệ)', async () => {
    const mcp = await tenCongCuMcp();
    const tap_mcp = new Set(mcp);
    const tap_bang = new Set(bang);
    const lech: string[] = [];
    for (const ten of bang) {
      if (!tap_mcp.has(ten)) {
        lech.push(`\`${ten}\` có ở ${SPEC13} ("MCP có công cụ tương đương, cùng tên") nhưng THIẾU ở ${MCP}`);
      }
    }
    for (const ten of mcp) {
      if (!tap_bang.has(ten) && !(ten in NGOAI_LE_MCP_NGOAI_SPEC_13)) {
        lech.push(`\`${ten}\` có ở ${MCP} nhưng THIẾU ở ${SPEC13} (không phải ngoại lệ NGOAI_LE_MCP_NGOAI_SPEC_13)`);
      }
    }
    lech.push(...trungTen(bang, SPEC13));
    expect(lech).toEqual([]);
  });

  it('ngoại lệ còn đúng: mỗi ngoại lệ vẫn đúng như lý do của nó', async () => {
    const mcp = await tenCongCuMcp();
    const sai: string[] = [];
    for (const [ten, ly_do] of Object.entries(NGOAI_LE_MCP_KHONG_CO)) {
      const goc = `ngoại lệ \`${ten}\` (${ly_do})`;
      const go = 'gỡ khỏi NGOAI_LE_MCP_KHONG_CO ở packages/api/test/bang-cong-cu-mcp.test.ts';
      const lenh = SO_LENH[ten];
      if (lenh === undefined) {
        sai.push(`${goc} không còn trong ${CLI} — ${go}`);
        continue;
      }
      if (lenh.chi_cli !== true) sai.push(`${goc} không còn khai \`chi_cli: true\` — ${go}`);
      if (mcp.includes(ten)) sai.push(`${goc} đã xuất hiện ở ${MCP} — ${go}`);
    }
    for (const [ten, ly_do] of Object.entries(NGOAI_LE_MCP_NGOAI_SPEC_13)) {
      const goc = `ngoại lệ \`${ten}\` (${ly_do})`;
      const go = 'gỡ khỏi NGOAI_LE_MCP_NGOAI_SPEC_13 ở packages/api/test/bang-cong-cu-mcp.test.ts';
      if (!mcp.includes(ten)) sai.push(`${goc} không còn là công cụ ở ${MCP} — ${go}`);
      if (bang.includes(ten)) sai.push(`${goc} đã có trong ${SPEC13} — ${go}`);
    }
    expect(sai).toEqual([]);
  });
});
