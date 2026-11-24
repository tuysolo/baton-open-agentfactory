/**
 * **MCP server** — SPEC mục 13 d.351 ("Ba đường, **cùng một bộ quyền**: CLI
 * `baton`, **MCP server**, HTTP API"), d.355 ("MCP có công cụ tương đương,
 * **cùng tên**"), d.267 và d.301 ("công cụ MCP tương đương").
 *
 * Ba nhóm ca, và nhóm A là nhóm mang luật của lượt này:
 *
 *   **A. Bộ công cụ sinh từ `SO_LENH`.** Ca đầu so **tập** tên công cụ do
 *   `tools/list` trả về với tập khoá của `SO_LENH` (trừ lệnh tự khai `chi_cli` —
 *   hiện chỉ `export`, BAT-8). Thêm một lệnh vào
 *   `SO_LENH` mà MCP không tự có nó thì ca đó **đỏ** — đó là cách duy nhất để
 *   "cùng tên" (d.355) không trôi theo thời gian. Không ca nào trong file này
 *   gõ ra một danh sách 20 tên lệnh; gõ ra thì ca sẽ ghim lại chính nó.
 *
 *   **B. Giao thức.** JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`,
 *   thông báo không `id`, dòng rác, method lạ.
 *
 *   **C. Đường thật.** Miniflare + D1 + **token thật của một agent thật**, đúng
 *   nếp `cli-can-chu.test.ts`: thông điệp JSON-RPC vào `xuLyDong`, ra Worker
 *   thật, rồi đọc lại DB. Gồm cả hai mã thoát không có đường nào khác để về
 *   trong MCP — **3** (`STOP`) và **4** (hết giờ chờ).
 *
 * Không ca nào chạm đĩa: `docFile` là một bảng trong bộ nhớ.
 */

import { SELF, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { MA_THOAT } from '@baton/shared';
import {
  CHE,
  LOI_RPC,
  PHIEN_BAN_GIAO_THUC,
  SO_LENH,
  SO_LENH_MCP,
  TEN_MAY_CHU,
  catDong,
  danhSachCongCu,
  dongMaThoat,
  dongRa,
  noiDayMcp,
  schemaThamSo,
  tenThamSo,
  thamSoTuMcp,
  thongDiepKhongThayAgent,
  vongLapMcp,
  xuLyDong,
  type KhaiLenh,
  type MoiTruongCli,
  type ThongDiepRpc,
} from '@baton/cli';
import {
  binhLuanCuaTicket,
  canChuTrongDb,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungWorkspace,
  phuongAnCua,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ (BAT-53, xem `caQuaSo`): ca hết giờ không để
// lệnh MCP/CLI còn dở bắn request vào lúc pool pop storage cô lập.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const URL_API = 'https://baton.test';
const TOKEN_QL = 'bt_token_gia_manager_mcp71';
const TOKEN_WK = 'bt_token_gia_worker_mcp71';

interface Ban {
  mt: MoiTruongCli;
  ra: string[];
  loi: string[];
}

function ban(
  token = TOKEN_QL,
  file: Record<string, string> = {},
  fetchGia?: typeof fetch,
): Ban {
  const ra: string[] = [];
  const loi: string[] = [];
  return {
    mt: {
      env: { BATON_URL: URL_API, BATON_TOKEN: token },
      viet: (d) => void ra.push(d),
      vietLoi: (d) => void loi.push(d),
      fetch: fetchGia ?? ((u, i) => SELF.fetch(u, i)),
      docFile: async (duong) => {
        const chu = file[duong];
        if (chu === undefined) throw new Error(`ENOENT: no such file or directory, open '${duong}'`);
        return await Promise.resolve(chu);
      },
    },
    ra,
    loi,
  };
}

/** Hình của một kết quả `tools/call` — đúng những trường các ca đọc tới. */
interface KetQuaGoi {
  content: { type: string; text: string }[];
  structuredContent: {
    lenh: string;
    ma_thoat: number;
    du_lieu?: unknown;
    loi?: string | null;
    thong_diep?: string;
  };
  isError: boolean;
}

let dem_id = 0;

/** Gửi một thông điệp JSON-RPC **qua đúng đường vào của máy chủ** (một dòng chữ). */
async function rpc(
  mt: MoiTruongCli,
  method: string,
  params?: Record<string, unknown>,
): Promise<ThongDiepRpc | null> {
  dem_id += 1;
  return await xuLyDong(
    mt,
    JSON.stringify({ jsonrpc: '2.0', id: dem_id, method, ...(params === undefined ? {} : { params }) }),
  );
}

/** Gọi một công cụ và trả kết quả đã ép kiểu; ném nếu máy chủ trả lỗi giao thức. */
async function goi(
  mt: MoiTruongCli,
  name: string,
  args: Record<string, unknown> = {},
): Promise<KetQuaGoi> {
  const tra = await rpc(mt, 'tools/call', { name, arguments: args });
  if (tra === null || tra.error !== undefined) {
    throw new Error(`tools/call trả lỗi giao thức: ${JSON.stringify(tra)}`);
  }
  return tra.result as KetQuaGoi;
}

function chuCua(kq: KetQuaGoi): string {
  return kq.content.map((c) => c.text).join('\n');
}

/* ================================================================== *
 * A. Bộ công cụ sinh từ SO_LENH — d.351, d.355
 * ================================================================== */

describe('A. công cụ MCP sinh từ SO_LENH — d.355 "cùng tên"', () => {
  /**
   * **Ca khoá của lượt này.** Tập tên công cụ phải **bằng** tập khoá của
   * `SO_LENH` — không nhiều hơn (MCP không được rộng hơn CLI, d.351 "cùng một
   * bộ quyền"), không ít hơn (thêm lệnh mà quên MCP).
   *
   * Đi qua **đúng đường giao thức** (`tools/list`), không gọi thẳng
   * `danhSachCongCu`: thứ cần ghim là cái một client MCP thật nhìn thấy.
   */
  it('tập tên công cụ của tools/list BẰNG tập khoá của SO_LENH, trừ lệnh `chi_cli`', async () => {
    const tra = await rpc(ban().mt, 'tools/list');
    const { tools } = (tra as ThongDiepRpc).result as { tools: { name: string }[] };

    /*
     * Phía mong đợi **dẫn xuất từ `SO_LENH`** (không dùng `SO_LENH_MCP` — dùng nó là
     * ca tự xác nhận chính mình): mọi lệnh, trừ lệnh tự khai `chi_cli`.
     */
    const mong_doi = Object.entries(SO_LENH)
      .filter(([, l]) => l.chi_cli !== true)
      .map(([ten]) => ten);
    expect(new Set(tools.map((t) => t.name))).toEqual(new Set(mong_doi));
    expect(new Set(Object.keys(SO_LENH_MCP))).toEqual(new Set(mong_doi));
    // Không tên nào lặp: `Set` ở trên một mình không bắt được chuyện đó.
    expect(tools.map((t) => t.name).length).toBe(new Set(tools.map((t) => t.name)).size);
    // Và bảng không rỗng — một `SO_LENH` rỗng sẽ làm phép so trên đúng một cách vô nghĩa.
    expect(tools.length).toBe(mong_doi.length);
    expect(tools.length).toBeGreaterThanOrEqual(20);
  });

  /**
   * **BAT-8 (review): `export` KHÔNG là công cụ MCP.** Lệnh của chủ (mục 15 d.429),
   * ghi file — một máy chủ MCP của agent không mang nó. Ẩn khỏi `tools/list` **và**
   * không gọi được bằng tên qua `tools/call`.
   */
  it('`export` không có trong tools/list, và tools/call "export" → INVALID_INPUT, không gọi API', async () => {
    expect(SO_LENH['export']?.chi_cli).toBe(true);

    const tra = await rpc(ban().mt, 'tools/list');
    const { tools } = (tra as ThongDiepRpc).result as { tools: { name: string }[] };
    expect(tools.map((t) => t.name)).not.toContain('export');
    expect(danhSachCongCu().map((c) => c.name)).not.toContain('export');

    let so_goi = 0;
    const b = ban(TOKEN_QL, {}, (u, i) => {
      so_goi += 1;
      return SELF.fetch(u, i);
    });
    const kq = await goi(b.mt, 'export', { file: '/khong-ghi.json' });
    expect(kq.isError).toBe(true);
    expect(kq.structuredContent.loi).toBe('INVALID_INPUT');
    expect(kq.structuredContent.thong_diep).toContain('Không có công cụ "export"');
    expect(so_goi).toBe(0);
  });

  /**
   * Schema tham số của **mọi** công cụ khớp `KhaiLenh` của chính lệnh đó: đủ
   * khoá, đúng kiểu, đúng danh sách bắt buộc. Gom lỗi, assert **một lần**.
   */
  it('inputSchema của mọi công cụ khớp KhaiLenh: khoá, kiểu, bắt buộc', () => {
    const sai: string[] = [];
    for (const cong_cu of danhSachCongCu()) {
      const khai = SO_LENH[cong_cu.name]?.khai;
      if (khai === undefined) {
        sai.push(`${cong_cu.name}: không có trong SO_LENH`);
        continue;
      }
      const mong_khoa = new Set(
        [...khai.vi_tri, ...(khai.vi_tri_tuy_chon ?? []), ...Object.keys(khai.co)].map((t) =>
          tenThamSo(t),
        ),
      );
      const co_khoa = new Set(Object.keys(cong_cu.inputSchema.properties));
      if (![...mong_khoa].every((k) => co_khoa.has(k)) || mong_khoa.size !== co_khoa.size) {
        sai.push(`${cong_cu.name}: khoá ${[...co_khoa].join(',')} ≠ ${[...mong_khoa].join(',')}`);
      }

      const mong_bat_buoc = khai.vi_tri.map((t) => tenThamSo(t));
      if (JSON.stringify(cong_cu.inputSchema.required ?? []) !== JSON.stringify(mong_bat_buoc)) {
        sai.push(`${cong_cu.name}: required sai`);
      }
      // Tham số vị trí tuỳ chọn **không** được nằm trong `required`.
      for (const v of khai.vi_tri_tuy_chon ?? []) {
        if ((cong_cu.inputSchema.required ?? []).includes(tenThamSo(v))) {
          sai.push(`${cong_cu.name}: "${v}" tuỳ chọn mà vẫn bắt buộc`);
        }
      }

      for (const [ten, kieu] of Object.entries(khai.co)) {
        const p = cong_cu.inputSchema.properties[tenThamSo(ten)] as { type?: string } | undefined;
        const mong = kieu === 'bat' ? 'boolean' : kieu === 'nhieu_gia_tri' ? 'array' : 'string';
        if (p?.type !== mong) sai.push(`${cong_cu.name}.${ten}: type ${String(p?.type)} ≠ ${mong}`);
      }
      if (cong_cu.inputSchema.additionalProperties !== false) {
        sai.push(`${cong_cu.name}: additionalProperties phải là false`);
      }
    }
    expect(sai).toEqual([]);
  });

  /**
   * d.382 "không bao giờ in token": không công cụ nào **nhận** token làm tham
   * số. Đây là lớp 1 của lưới chắn (`che-token.ts`) áp cho đường MCP — token
   * không có đường vào thì không có đường vọng ra trong một thông điệp lỗi.
   *
   * Cùng ca: không công cụ nào có tham số `json` (xem `cong-cu.ts` — MCP trả cả
   * hai dạng ở mọi lời gọi, nên một cờ như vậy chỉ là một cờ không làm gì).
   */
  it('không công cụ nào nhận tham số token / url / json', () => {
    const cam = ['token', 'baton_token', 'url', 'baton_url', 'json'];
    const pham: string[] = [];
    for (const cong_cu of danhSachCongCu()) {
      for (const k of Object.keys(cong_cu.inputSchema.properties)) {
        if (cam.includes(k)) pham.push(`${cong_cu.name}.${k}`);
      }
    }
    expect(pham).toEqual([]);
  });

  /**
   * Phép đổi tên tham số phải **tiêm** được cho cả `SO_LENH` mà không đụng tên.
   * `schemaThamSo` ném khi đụng; ca này duyệt mọi lệnh để lỗi đó đỏ ở đây chứ
   * không ở máy một agent.
   */
  it('không lệnh nào có hai tham số đổi ra cùng một khoá', () => {
    const no: string[] = [];
    for (const [ten, lenh] of Object.entries(SO_LENH)) {
      try {
        schemaThamSo(lenh.khai);
      } catch (e: unknown) {
        no.push(`${ten}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    expect(no).toEqual([]);
  });

  it('tenThamSo: bỏ dấu, hạ chữ, thay ký tự lạ bằng _', () => {
    const ca: [string, string][] = [
      ['nội dung', 'noi_dung'],
      ['DỰ ÁN', 'du_an'],
      ['MÃ', 'ma'],
      ['T-số', 't_so'],
      ['file.json', 'file_json'],
      ['file-bao-cao.md', 'file_bao_cao_md'],
      ['accept|return', 'accept_return'],
      ['ghi chú', 'ghi_chu'],
      ['giá trị 2', 'gia_tri_2'],
      ['trạng thái', 'trang_thai'],
      ['lượt', 'luot'],
      ['tiêu đề', 'tieu_de'],
      // `đ` không phải chữ có dấu tổ hợp — ngoại lệ xử riêng trong `tenThamSo`.
      ['đơn vị đo', 'don_vi_do'],
    ];
    const sai = ca.filter(([vao, mong]) => tenThamSo(vao) !== mong);
    expect(sai).toEqual([]);
  });

  /** `schemaThamSo` ném khi hai tham số đụng tên — hành vi chứ không chỉ lời khai. */
  it('schemaThamSo NÉM khi hai tham số đổi ra cùng khoá', () => {
    const khai: KhaiLenh = { ten: 'thu', vi_tri: ['MÃ', 'mã'], co: {} };
    expect(() => schemaThamSo(khai)).toThrow(/cùng khoá "ma"/);
  });

  it('mọi công cụ khai outputSchema có ma_thoat bắt buộc', () => {
    const thieu = danhSachCongCu()
      .filter(
        (c) =>
          !(c.outputSchema.required ?? []).includes('ma_thoat') ||
          !('ma_thoat' in c.outputSchema.properties),
      )
      .map((c) => c.name);
    expect(thieu).toEqual([]);
  });
});

/* ================================================================== *
 * A'. Đổi tham số MCP → ThamSoDaPhanTich (không qua dòng lệnh)
 * ================================================================== */

describe("A'. thamSoTuMcp — tham số đi thẳng, KHÔNG dựng lại dòng lệnh", () => {
  const KHAI: KhaiLenh = {
    ten: 'thu',
    vi_tri: ['MÃ'],
    vi_tri_tuy_chon: ['ghi chú'],
    co: { reason: 'gia_tri', force: 'bat', ref: 'nhieu_gia_tri' },
  };

  it('đổi đủ bốn kiểu tham số, cờ lặp luôn có khoá kể cả rỗng', () => {
    const ts = thamSoTuMcp(KHAI, { ma: 'SAI-1', reason: 'vì thế', force: true });
    expect(ts.vi_tri).toEqual(['SAI-1']);
    expect(ts.gia_tri).toEqual({ reason: 'vì thế' });
    expect(ts.bat.has('force')).toBe(true);
    expect(ts.nhieu['ref']).toEqual([]);
    expect(ts.json).toBe(false);
  });

  it('cờ lặp: mảng giữ thứ tự; một giá trị lẻ thành mảng một phần tử', () => {
    expect(thamSoTuMcp(KHAI, { ma: 'X', ref: ['a', 'b', 'a'] }).nhieu['ref']).toEqual([
      'a',
      'b',
      'a',
    ]);
    expect(thamSoTuMcp(KHAI, { ma: 'X', ref: 'a' }).nhieu['ref']).toEqual(['a']);
  });

  it('khoá lạ → INVALID_INPUT, nêu tên khoá lạ và danh sách nhận được', () => {
    try {
      thamSoTuMcp(KHAI, { ma: 'X', lung_tung: '1' });
      throw new Error('phải ném');
    } catch (e: unknown) {
      const err = e as { ma?: string; message: string };
      expect(err.ma).toBe('INVALID_INPUT');
      expect(err.message).toContain('lung_tung');
      expect(err.message).toContain('ghi_chu');
    }
  });

  it('thiếu tham số bắt buộc → INVALID_INPUT (cùng luật với CLI)', () => {
    try {
      thamSoTuMcp(KHAI, { reason: 'x' });
      throw new Error('phải ném');
    } catch (e: unknown) {
      const err = e as { ma?: string; message: string };
      expect(err.ma).toBe('INVALID_INPUT');
      // Đúng câu chữ của `kiemSoViTri` — tức CLI và MCP dùng chung một bản luật.
      expect(err.message).toContain('cần 1–2 tham số, nhận được 0');
    }
  });

  it('cờ bật nhận chuỗi → INVALID_INPUT, không âm thầm coi là bật', () => {
    try {
      thamSoTuMcp(KHAI, { ma: 'X', force: 'true' });
      throw new Error('phải ném');
    } catch (e: unknown) {
      expect((e as { ma?: string }).ma).toBe('INVALID_INPUT');
    }
    // `false` tường minh thì **không** bật, và không phải lỗi.
    expect(thamSoTuMcp(KHAI, { ma: 'X', force: false }).bat.has('force')).toBe(false);
  });

  /**
   * Tham số vị trí tuỳ chọn bỏ cách: ở CLI chuyện này không xảy ra được, ở MCP
   * thì có, và nó làm giá trị **tụt một ô** nếu không chặn.
   */
  it('bỏ cách tham số vị trí tuỳ chọn → INVALID_INPUT, không tụt ô', () => {
    const khai: KhaiLenh = {
      ten: 'thu2',
      vi_tri: ['MÃ'],
      vi_tri_tuy_chon: ['giá trị', 'giá trị 2'],
      co: {},
    };
    try {
      thamSoTuMcp(khai, { ma: 'X', gia_tri_2: 'sau' });
      throw new Error('phải ném');
    } catch (e: unknown) {
      const err = e as { ma?: string; message: string };
      expect(err.ma).toBe('INVALID_INPUT');
      expect(err.message).toContain('gia_tri_2');
    }
    expect(thamSoTuMcp(khai, { ma: 'X', gia_tri: 'truoc', gia_tri_2: 'sau' }).vi_tri).toEqual([
      'X',
      'truoc',
      'sau',
    ]);
  });
});

/* ================================================================== *
 * B. Giao thức JSON-RPC 2.0
 * ================================================================== */

describe('B. giao thức JSON-RPC của máy chủ MCP', () => {
  it('initialize: trả phiên bản client xin nếu hiểu, và tên máy chủ', async () => {
    const tra = await rpc(ban().mt, 'initialize', { protocolVersion: '2024-11-05' });
    const kq = (tra as ThongDiepRpc).result as {
      protocolVersion: string;
      serverInfo: { name: string };
      capabilities: { tools: unknown };
    };
    expect(kq.protocolVersion).toBe('2024-11-05');
    expect(kq.serverInfo.name).toBe(TEN_MAY_CHU);
    expect(kq.capabilities.tools).toBeTruthy();
  });

  it('initialize: phiên bản lạ → trả phiên bản của máy chủ, không lỗi', async () => {
    const tra = await rpc(ban().mt, 'initialize', { protocolVersion: '1999-01-01' });
    expect((tra as ThongDiepRpc).error).toBeUndefined();
    expect(
      ((tra as ThongDiepRpc).result as { protocolVersion: string }).protocolVersion,
    ).toBe(PHIEN_BAN_GIAO_THUC);
  });

  it('thông báo (không có id) KHÔNG được trả lời', async () => {
    const b = ban();
    const im: string[] = [
      '{"jsonrpc":"2.0","method":"notifications/initialized"}',
      '{"jsonrpc":"2.0","method":"notifications/cancelled","params":{"requestId":1}}',
      '',
      '   ',
    ];
    const tra_loi: string[] = [];
    for (const d of im) {
      if ((await xuLyDong(b.mt, d)) !== null) tra_loi.push(d);
    }
    expect(tra_loi).toEqual([]);
  });

  /**
   * JSON-RPC 2.0: notification là thông điệp **không có** thành viên `id`. Một
   * thông điệp mang `"id": null` là một request **hợp lệ** và phải được trả lời
   * với `id` bằng `null` — xem khối chú thích của `xuLyThongDiep`.
   */
  it('id: null TƯỜNG MINH là request hợp lệ, phải trả lời; vắng id thì không', async () => {
    const b = ban();
    const co_null = await xuLyDong(b.mt, '{"jsonrpc":"2.0","id":null,"method":"ping"}');
    expect(co_null).not.toBeNull();
    expect(co_null?.id).toBeNull();
    expect(co_null?.result).toEqual({});

    // Cùng method, chỉ khác ở chỗ **vắng** khoá `id` → im lặng.
    expect(await xuLyDong(b.mt, '{"jsonrpc":"2.0","method":"ping"}')).toBeNull();

    // `id: null` + method lạ vẫn phải ra lỗi, không im lặng.
    const loi_null = await xuLyDong(b.mt, '{"jsonrpc":"2.0","id":null,"method":"khong-co"}');
    expect(loi_null?.error?.code).toBe(LOI_RPC.khong_co_method);
  });

  it('dòng không phải JSON → lỗi -32700, máy chủ KHÔNG chết', async () => {
    const b = ban();
    const tra = await xuLyDong(b.mt, 'không phải json {{{');
    expect(tra?.error?.code).toBe(LOI_RPC.phan_tich);
    expect(tra?.id).toBeNull();
    // Và dòng kế tiếp vẫn phục vụ được.
    expect((await rpc(b.mt, 'tools/list'))?.error).toBeUndefined();
  });

  it('method lạ → -32601; tools/call thiếu name → -32602', async () => {
    const b = ban();
    expect((await rpc(b.mt, 'resources/list'))?.error?.code).toBe(LOI_RPC.khong_co_method);
    expect((await rpc(b.mt, 'tools/call', { arguments: {} }))?.error?.code).toBe(
      LOI_RPC.tham_so_sai,
    );
  });

  it('thông điệp không phải object → -32600', async () => {
    expect((await xuLyDong(ban().mt, '[1,2,3]'))?.error?.code).toBe(LOI_RPC.yeu_cau_sai);
    expect((await xuLyDong(ban().mt, '"chuỗi"'))?.error?.code).toBe(LOI_RPC.yeu_cau_sai);
  });

  it('id của client được trả lại nguyên vẹn, cả số lẫn chuỗi', async () => {
    const b = ban();
    const a = await xuLyDong(b.mt, '{"jsonrpc":"2.0","id":"abc","method":"ping"}');
    const c = await xuLyDong(b.mt, '{"jsonrpc":"2.0","id":77,"method":"ping"}');
    expect(a?.id).toBe('abc');
    expect(c?.id).toBe(77);
    expect(a?.jsonrpc).toBe('2.0');
  });

  it('dongMaThoat có nghĩa cho CẢ NĂM mã của MA_THOAT', () => {
    const thieu = Object.values(MA_THOAT).filter((m) => {
      const d = dongMaThoat(m);
      return !d.startsWith(`Mã thoát ${String(m)}:`) || d.endsWith(': undefined.');
    });
    expect(thieu).toEqual([]);
    expect(dongMaThoat(MA_THOAT.nhan_stop)).toContain('ngưng việc ngay');
  });
});

/* ================================================================== *
 * B'. Cắt dòng và dây nối tiến trình
 * ================================================================== */

describe("B'. catDong + noiDayMcp — vận chuyển stdio", () => {
  async function* khuc(ds: readonly string[]): AsyncGenerator<string> {
    for (const k of ds) yield await Promise.resolve(k);
  }
  async function gom(nguon: AsyncIterable<string>): Promise<string[]> {
    const ra: string[] = [];
    for await (const d of nguon) ra.push(d);
    return ra;
  }

  it('một thông điệp bị cắt làm đôi vẫn ghép lại đúng', async () => {
    expect(await gom(catDong(khuc(['{"a":1', '23}\n'])))).toEqual(['{"a":123}']);
  });

  it('hai thông điệp trong một khúc tách thành hai dòng', async () => {
    expect(await gom(catDong(khuc(['{"a":1}\n{"b":2}\n'])))).toEqual(['{"a":1}', '{"b":2}']);
  });

  it('khúc cuối KHÔNG có \\n vẫn được trả; \\r\\n cắt đúng; dòng trắng giữ nguyên', async () => {
    expect(await gom(catDong(khuc(['{"a":1}'])))).toEqual(['{"a":1}']);
    expect(await gom(catDong(khuc(['{"a":1}\r\n{"b":2}\r\n'])))).toEqual(['{"a":1}', '{"b":2}']);
    expect(await gom(catDong(khuc(['a\n\nb\n'])))).toEqual(['a', '', 'b']);
  });

  it('noiDayMcp: đặt utf8, ghi MỘT dòng JSON kèm \\n cho mỗi yêu cầu', async () => {
    const ra: string[] = [];
    let ma_hoa = '';
    const stdin = Object.assign(khuc(['{"jsonrpc":"2.0","id":1,"method":"ping"}\n']), {
      setEncoding: (m: 'utf8') => {
        ma_hoa = m;
      },
    });
    await noiDayMcp({
      env: { BATON_URL: URL_API, BATON_TOKEN: TOKEN_QL },
      stdin,
      stdout: { write: (c: string) => ra.push(c) },
      stderr: { write: (_c: string) => undefined },
    });
    expect(ma_hoa).toBe('utf8');
    expect(ra.length).toBe(1);
    expect(ra[0]?.endsWith('\n')).toBe(true);
    expect(JSON.parse(ra[0] ?? '')).toMatchObject({ jsonrpc: '2.0', id: 1 });
  });

  it('vongLapMcp: thông báo không sinh dòng ra nào', async () => {
    const b = ban();
    await vongLapMcp(b.mt, [
      '{"jsonrpc":"2.0","method":"notifications/initialized"}',
      '{"jsonrpc":"2.0","id":9,"method":"ping"}',
    ]);
    expect(b.ra.length).toBe(1);
    expect(JSON.parse(b.ra[0] ?? '')).toMatchObject({ id: 9 });
  });
});

/* ================================================================== *
 * C. Đường thật — Miniflare + D1 + token thật
 * ================================================================== */

describe('C. công cụ MCP đi đường thật', () => {
  let ticket_id = '';
  let project_id = '';

  beforeEach(async () => {
    await dungWorkspace();
    await dungAgentCoToken({ id: 'ag-ql', ten: 'M', vai_tro: 'manager', token: TOKEN_QL });
    project_id = await dungDuAn('SAI', 'Sample', 'active', 'ag-ql');
    await choVaoDuAn('ag-ql', project_id);
    await dungAgentCoToken({
      id: 'ag-1',
      ten: 'W',
      vai_tro: 'worker',
      token: TOKEN_WK,
      du_an: [project_id],
    });
    ticket_id = await dungTicket(project_id, 1, 'Việc để thử MCP', { trang_thai: 'in_progress' });
  });

  it('whoami: ma_thoat 0, du_lieu như --json, chữ có dòng mã thoát', async () => {
    const kq = await goi(ban().mt, 'whoami');
    expect(kq.isError).toBe(false);
    expect(kq.structuredContent.lenh).toBe('whoami');
    expect(kq.structuredContent.ma_thoat).toBe(MA_THOAT.xong);
    expect(kq.structuredContent.du_lieu).toMatchObject({ agent_id: 'ag-ql', vai_tro: 'manager' });
    expect(chuCua(kq)).toContain(dongMaThoat(MA_THOAT.xong));
    expect(chuCua(kq)).toContain('Vai trò:');
  });

  it('create rồi show: ghi thật vào DB, đọc lại được qua MCP', async () => {
    const tao = await goi(ban().mt, 'create', { du_an: 'SAI', tieu_de: 'Ticket từ MCP' });
    expect(tao.isError).toBe(false);
    const { ma } = tao.structuredContent.du_lieu as { ma: string };
    expect(ma).toMatch(/^SAI-\d+$/);

    const trong_db = await env.DB.prepare(
      'SELECT tieu_de, trang_thai FROM ticket WHERE project_id = ? AND tieu_de = ?',
    )
      .bind(project_id, 'Ticket từ MCP')
      .first<{ tieu_de: string; trang_thai: string }>();
    expect(trong_db?.tieu_de).toBe('Ticket từ MCP');

    const xem = await goi(ban().mt, 'show', { ma });
    expect(xem.structuredContent.ma_thoat).toBe(MA_THOAT.xong);
    expect(chuCua(xem)).toContain('Ticket từ MCP');
  });

  /*
   * BAT-43 (T-50 = A, `cau-hoi-spec.md` #168): cờ `assign --review` và lệnh `link`
   * — công cụ MCP **tự có** vì sinh từ `SO_LENH`; hai ca này kiểm schema + đường thật.
   */
  it('assign có tham số `review` (boolean): true ⇒ lượt `review` trong DB; chuỗi "true" ⇒ INVALID_INPUT', async () => {
    const schema = danhSachCongCu().find((c) => c.name === 'assign')?.inputSchema;
    expect(schema?.properties['review']).toMatchObject({ type: 'boolean' });

    const sai = await goi(ban().mt, 'assign', { ma: 'SAI-1', agent: 'ag-1', review: 'true' });
    expect(sai.structuredContent.loi).toBe('INVALID_INPUT');

    const kq = await goi(ban().mt, 'assign', { ma: 'SAI-1', agent: 'ag-1', review: true });
    expect(kq.structuredContent.ma_thoat, chuCua(kq)).toBe(MA_THOAT.xong);
    const { id, loai } = kq.structuredContent.du_lieu as { id: string; loai: string };
    expect(loai).toBe('review');
    const lg = await env.DB.prepare('SELECT loai FROM luot_giao WHERE id = ?').bind(id).first<{ loai: string }>();
    expect(lg?.loai).toBe('review');
  });

  /*
   * BAT-47 (T-55 = A, `cau-hoi-spec.md` #171): `<agent>` nhận **tên hoặc ID**. Công cụ
   * MCP `assign` sinh từ `SO_LENH`, nên tự có — hai ca này kiểm trên đường thật.
   */
  it('assign bằng TÊN agent qua MCP ⇒ giao đúng agent (DB)', async () => {
    const kq = await goi(ban().mt, 'assign', { ma: 'SAI-1', agent: 'W' });
    expect(kq.structuredContent.ma_thoat, chuCua(kq)).toBe(MA_THOAT.xong);
    expect(chuCua(kq)).toContain('cho ag-1 (W)');
    const { id, nguoi_nhan_agent_id } = kq.structuredContent.du_lieu as {
      id: string;
      nguoi_nhan_agent_id: string;
    };
    expect(nguoi_nhan_agent_id).toBe('ag-1');
    const lg = await env.DB.prepare('SELECT nguoi_nhan_agent_id AS n FROM luot_giao WHERE id = ?')
      .bind(id)
      .first<{ n: string }>();
    expect(lg?.n).toBe('ag-1');
  });

  it('assign qua MCP: tên không có ⇒ NOT_FOUND "(tên hoặc ID)", isError, không tạo lượt', async () => {
    const kq = await goi(ban().mt, 'assign', { ma: 'SAI-1', agent: 'Khong-co' });
    expect(kq.isError).toBe(true);
    expect(kq.structuredContent.ma_thoat).toBe(MA_THOAT.loi_nghiep_vu);
    expect(kq.structuredContent.loi).toBe('NOT_FOUND');
    expect(kq.structuredContent.thong_diep).toBe(`NOT_FOUND: ${thongDiepKhongThayAgent('Khong-co')}`);
    const n = await env.DB.prepare('SELECT count(*) AS n FROM luot_giao').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('assign qua MCP: tên khớp NHIỀU agent (ID của A = tên của B) ⇒ INVALID_INPUT liệt kê các ID, không POST, không tạo lượt', async () => {
    // Cùng khuôn ca (4) của `cli-ticket.test.ts` (BAT-47): agent id "W" (tên
    // "W-hai") cùng dự án — "W" vừa là tên của ag-1 vừa là ID của agent này.
    await dungAgentCoToken({
      id: 'W',
      ten: 'W-hai',
      vai_tro: 'worker',
      token: 'bt_token_gia_w_hai_mcp_bat48',
      du_an: [project_id],
    });
    const post: string[] = [];
    const mt = ban(TOKEN_QL, {}, async (u, i) => {
      if (i?.method === 'POST') post.push(String(u));
      return await SELF.fetch(u, i);
    }).mt;

    const kq = await goi(mt, 'assign', { ma: 'SAI-1', agent: 'W' });
    expect(kq.isError).toBe(true);
    expect(kq.structuredContent.ma_thoat).toBe(MA_THOAT.loi_nghiep_vu);
    expect(kq.structuredContent.loi).toBe('INVALID_INPUT');
    expect(kq.structuredContent.thong_diep).toMatch(/: (ag-1, W|W, ag-1) /);
    expect(post).toEqual([]);
    const n = await env.DB.prepare('SELECT count(*) AS n FROM luot_giao').first<{ n: number }>();
    expect(n?.n).toBe(0);
  });

  it('link: schema ma_dieu_phoi, ma_du_an, type; related nối thật; worker nối dieu_phoi ⇒ FORBIDDEN như CLI', async () => {
    const schema = danhSachCongCu().find((c) => c.name === 'link')?.inputSchema;
    expect(schema?.required).toEqual(['ma_dieu_phoi', 'ma_du_an']);
    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(['ma_dieu_phoi', 'ma_du_an', 'type']);

    await dungTicket(project_id, 2, 'Việc thứ hai');
    const kq = await goi(ban().mt, 'link', { ma_dieu_phoi: 'SAI-1', ma_du_an: 'SAI-2', type: 'related' });
    expect(kq.structuredContent.ma_thoat, chuCua(kq)).toBe(MA_THOAT.xong);
    const dong = await env.DB.prepare(
      "SELECT loai FROM ticket_link WHERE tu_ticket_id = ? AND loai <> 'parent'",
    )
      .bind(ticket_id)
      .all<{ loai: string }>();
    expect(dong.results.map((d) => d.loai)).toEqual(['related']);

    const wk = await goi(ban(TOKEN_WK).mt, 'link', { ma_dieu_phoi: 'SAI-1', ma_du_an: 'SAI-2' });
    expect(wk.structuredContent.ma_thoat).toBe(MA_THOAT.loi_nghiep_vu);
    expect(wk.structuredContent.loi).toBe('FORBIDDEN');
  });

  /**
   * **Ca chống tiêm.** Nội dung bình luận đúng bằng chữ `--json`. Nếu đường MCP
   * dựng lại một dòng lệnh rồi gọi `phanTich`, chữ đó thành một **cờ** và bình
   * luận hoặc mất nội dung hoặc lỗi thiếu tham số. Ghi đúng chuỗi vào DB là
   * bằng chứng tham số đi thẳng (xem `mcp/tham-so.ts`).
   */
  it('nội dung "--json" được giữ nguyên làm NỘI DUNG, không thành cờ', async () => {
    const kq = await goi(ban().mt, 'comment', { ma: 'SAI-1', noi_dung: '--json' });
    expect(kq.isError).toBe(false);
    const ds = await binhLuanCuaTicket(ticket_id);
    expect(ds.map((b) => b.noi_dung)).toContain('--json');
  });

  it('tên công cụ lạ → INVALID_INPUT, isError, mã thoát 1, nêu tên đang có', async () => {
    const kq = await goi(ban().mt, 'khong-co-lenh-nay');
    expect(kq.isError).toBe(true);
    expect(kq.structuredContent.loi).toBe('INVALID_INPUT');
    expect(kq.structuredContent.ma_thoat).toBe(MA_THOAT.loi_nghiep_vu);
    expect(kq.structuredContent.thong_diep).toContain('whoami');
  });

  it('tham số lạ và thiếu tham số bắt buộc → INVALID_INPUT, 0 thay đổi trong DB', async () => {
    const truoc = await binhLuanCuaTicket(ticket_id);
    const la = await goi(ban().mt, 'comment', { ma: 'SAI-1', noi_dung: 'x', lung_tung: 1 });
    const thieu = await goi(ban().mt, 'comment', { ma: 'SAI-1' });
    for (const kq of [la, thieu]) {
      expect(kq.isError).toBe(true);
      expect(kq.structuredContent.loi).toBe('INVALID_INPUT');
    }
    expect((await binhLuanCuaTicket(ticket_id)).length).toBe(truoc.length);
  });

  it('không có quyền: worker gọi decision → lỗi nghiệp vụ, mã thoát 1 (CÙNG bộ quyền d.351)', async () => {
    const kq = await goi(ban(TOKEN_WK).mt, 'decision', {
      du_an: 'SAI',
      quyet_dinh: 'Tự quyết',
      why: 'vì muốn',
    });
    expect(kq.isError).toBe(true);
    expect(kq.structuredContent.ma_thoat).toBe(MA_THOAT.loi_nghiep_vu);
    expect(kq.structuredContent.loi).toBe('FORBIDDEN');
  });

  it('thiếu BATON_TOKEN → mã thoát 2, thông điệp chỉ nêu TÊN biến', async () => {
    const b = ban();
    b.mt.env = { BATON_URL: URL_API };
    const kq = await goi(b.mt, 'whoami');
    expect(kq.structuredContent.ma_thoat).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(kq.structuredContent.thong_diep).toContain('BATON_TOKEN');
  });

  /** Cờ lặp đi đường thật: `ask` với nhiều `--option` → nhiều phương án trong DB. */
  it('cờ lặp (option) qua MCP: ba phương án vào DB, đúng thứ tự', async () => {
    const kq = await goi(ban().mt, 'ask', {
      level: 'urgent',
      type: 'decision',
      tieu_de: 'Chọn thư viện',
      option: ['A: Hono', 'B: itty-router', 'C: tự viết'],
      // Dạng `"A: <lý do>"` — d.236 đòi "phương án đề xuất **và lý do**" (#92).
      recommend: 'A: nhẹ nhất và đã dùng ở phần 2',
    });
    expect([kq.isError, kq.structuredContent.thong_diep]).toEqual([false, undefined]);
    const { id } = kq.structuredContent.du_lieu as { id: string };
    const pa = await phuongAnCua(id);
    expect(pa.map((p) => p.nhan)).toEqual(['A', 'B', 'C']);
    expect((await canChuTrongDb(id))?.trang_thai).toBe('open');
  });

  /**
   * **Mã thoát 3 qua MCP** — d.380 + mục 6 d.193. Không có tiến trình để thoát,
   * nên đây là đường duy nhất tín hiệu `STOP` tới được agent. `isError` phải là
   * **false**: `STOP` không phải lỗi, lệnh vẫn trả đủ kết quả.
   */
  it('STOP: ma_thoat 3 trong structuredContent VÀ trong chữ, isError false', async () => {
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'stopping' });

    const kq = await goi(ban(TOKEN_WK).mt, 'tasks');
    expect(kq.structuredContent.ma_thoat).toBe(MA_THOAT.nhan_stop);
    expect(kq.isError).toBe(false);
    expect((kq.structuredContent.du_lieu as { tin_hieu: string[] }).tin_hieu).toEqual(['STOP']);
    // Model đọc chữ cũng phải thấy — không chỉ máy đọc trường.
    expect(chuCua(kq)).toContain('Mã thoát 3');
    expect(chuCua(kq)).toContain('ngưng việc ngay');
  });

  /** **Mã thoát 4 qua MCP** — 19.9 d.543, lệnh `result --wait` hết giờ. */
  it(
    'hết giờ chờ: ma_thoat 4, isError false, du_lieu có het_gio',
    async () => {
      const tao = await goi(ban().mt, 'ask', {
        level: 'today',
        type: 'fyi',
        tieu_de: 'Không ai xử lý',
      });
      const { ma } = tao.structuredContent.du_lieu as { ma: string };

      const kq = await goi(ban().mt, 'result', { t_so: ma, wait: '1' });
      expect(kq.structuredContent.ma_thoat).toBe(MA_THOAT.het_thoi_gian_cho);
      expect(kq.isError).toBe(false);
      expect(kq.structuredContent.du_lieu).toMatchObject({ het_gio: true, da_xu_ly: false });
      expect(chuCua(kq)).toContain('Mã thoát 4');
    },
    15_000,
  );

  /**
   * **Lưới chắn token trên đường ra MCP** — d.382, danh sách CẤM số 5.
   *
   * Máy chủ (giả lập đúng chỗ này, và chỉ chỗ này) nhắc lại **chính token** trong
   * thông điệp lỗi của mình. Không có lưới chắn thì chuỗi đó đi nguyên vào
   * `thong_diep` rồi ra `stdout`. Ca khẳng định **hai** vế: token không có mặt,
   * **và** chuỗi che `CHE` có mặt — vế thứ hai là thứ chứng minh token thật sự
   * đã đi tới đó và bị chặn, chứ không phải nó chưa bao giờ tới.
   */
  it('token máy chủ nhắc lại KHÔNG lọt ra dòng JSON-RPC, và thấy chuỗi che', async () => {
    const may_chu_nhac_lai: typeof fetch = async () =>
      Response.json(
        { error: 'INVALID_TOKEN', message: `Token "${TOKEN_QL}" không hợp lệ.` },
        { status: 401 },
      );
    const b = ban(TOKEN_QL, {}, may_chu_nhac_lai);

    // Đi qua `dongRa` — tức đúng chuỗi sắp được ghi ra `stdout`.
    const dong = await dongRa(
      b.mt,
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'whoami' } }),
    );
    expect(dong).not.toBeNull();
    expect(dong).not.toContain(TOKEN_QL);
    expect(dong).toContain(CHE);

    const kq = (JSON.parse(dong ?? '') as { result: KetQuaGoi }).result;
    expect(kq.structuredContent.ma_thoat).toBe(MA_THOAT.loi_xac_thuc_hoac_mang);
    expect(kq.structuredContent.loi).toBe('INVALID_TOKEN');
  });

  /**
   * Token nằm trong **khung** JSON-RPC, không trong thân do `ket-qua.ts` dựng:
   * client đặt `id` là chính token. Lưới chắn ở `vao-ra.ts` phủ cả chỗ này —
   * một lưới đặt sớm hơn thì không.
   */
  it('token trong id do client đặt cũng bị che', async () => {
    const b = ban(TOKEN_QL);
    const dong = await dongRa(
      b.mt,
      JSON.stringify({ jsonrpc: '2.0', id: TOKEN_QL, method: 'ping' }),
    );
    expect(dong).not.toContain(TOKEN_QL);
    expect(dong).toContain(CHE);
  });

  /** Không lệnh nào làm token lọt trên đường **thường** (không chỉ đường lỗi). */
  it('đường thường của nhiều công cụ: không dòng ra nào chứa token', async () => {
    const b = ban();
    const ca: [string, Record<string, unknown>][] = [
      ['whoami', {}],
      ['list', {}],
      ['show', { ma: 'SAI-1' }],
      ['profile', { du_an: 'SAI' }],
      ['tasks', {}],
    ];
    const lot: string[] = [];
    for (const [ten, args] of ca) {
      const dong = await dongRa(
        b.mt,
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: ten, arguments: args } }),
      );
      if (dong === null || dong.includes(TOKEN_QL)) lot.push(ten);
    }
    expect(lot).toEqual([]);
  });

  /**
   * d.351 "**cùng một bộ quyền**": cùng một việc, qua MCP và qua CLI, ra cùng
   * một kết quả. So **cặp** chứ không chép lại kết quả mong đợi của từng đường.
   *
   * So **ba** thứ, không chỉ mã thoát: mã thoát, **mã lỗi**, và **các dòng chữ**
   * (bỏ dòng "Mã thoát …" mà chỉ MCP có). Mã thoát một mình là phép so lỏng —
   * nó gộp mọi lỗi nghiệp vụ vào chung số 1, nên hai đường trả `FORBIDDEN` và
   * `NOT_FOUND` vẫn "khớp". Mã lỗi là thứ agent đọc để quyết, và nó phải giống
   * nhau dù đi đường nào.
   *
   * Ca `show SAI-999` và `profile KHONG-CO` (404) nằm trong danh sách vì d.351
   * "không lộ sự tồn tại" chỉ đúng nếu **cả hai** đường cùng giấu như nhau.
   */
  it('cùng bộ quyền: mã thoát, MÃ LỖI và dòng chữ của MCP khớp CLI trên cùng ca', async () => {
    const { chayCli } = await import('@baton/cli');
    const ca: [string, Record<string, unknown>, string[]][] = [
      ['whoami', {}, ['whoami']],
      ['show', { ma: 'SAI-1' }, ['show', 'SAI-1']],
      ['show', { ma: 'SAI-999' }, ['show', 'SAI-999']],
      ['profile', { du_an: 'KHONG-CO' }, ['profile', 'KHONG-CO']],
      ['list', {}, ['list']],
      ['tasks', {}, ['tasks']],
      // Thiếu tham số bắt buộc: khâu phân tích tham số của hai đường phải khớp.
      ['show', {}, ['show']],
      // Không có quyền (worker ghi Nhật ký) → phải cùng ra FORBIDDEN, không chỉ cùng mã 1.
      [
        'decision',
        { du_an: 'SAI', quyet_dinh: 'x', why: 'y' },
        ['decision', 'SAI', 'x', '--why', 'y'],
      ],
    ];

    const lech: string[] = [];
    for (const [ten, args, doi_so] of ca) {
      const kq = await goi(ban(TOKEN_WK).mt, ten, args);
      const b = ban(TOKEN_WK);
      const ma_cli = await chayCli(doi_so, b.mt);

      if (kq.structuredContent.ma_thoat !== ma_cli) {
        lech.push(`${ten}: mã thoát MCP ${String(kq.structuredContent.ma_thoat)} ≠ CLI ${String(ma_cli)}`);
      }

      /*
       * Mã lỗi của CLI nằm ở đầu dòng `stderr` (`doiNgoaiLe` in `MÃ: thông
       * điệp`). Lấy từ **đầu ra thật** của CLI chứ không từ một bảng chép lại.
       */
      const ma_loi_cli = /^([A-Z_]+):/.exec(b.loi.join('\n'))?.[1] ?? null;
      const ma_loi_mcp = kq.structuredContent.loi ?? null;
      if (ma_loi_mcp !== ma_loi_cli) {
        lech.push(`${ten}: mã lỗi MCP ${String(ma_loi_mcp)} ≠ CLI ${String(ma_loi_cli)}`);
      }

      // Dòng chữ: bỏ dòng "Mã thoát …" (chỉ MCP có, vì MCP không có tiến trình).
      const chu_mcp = chuCua(kq).split('\n').slice(1).join('\n');
      const chu_cli = [...b.ra, ...b.loi].join('\n');
      if (chu_mcp !== chu_cli) lech.push(`${ten}: dòng chữ lệch\nMCP: ${chu_mcp}\nCLI: ${chu_cli}`);
    }
    expect(lech).toEqual([]);

    // Danh sách phải thật sự có cả ca xong lẫn ca lỗi — không thì phép so trên rỗng nghĩa.
    const ma_thoat = await Promise.all(
      ca.map(async ([t, a]) => (await goi(ban(TOKEN_WK).mt, t, a)).structuredContent.ma_thoat),
    );
    expect(new Set(ma_thoat)).toEqual(new Set([MA_THOAT.xong, MA_THOAT.loi_nghiep_vu]));
  });
});
