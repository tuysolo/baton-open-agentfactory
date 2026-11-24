/**
 * CLI `baton` — **vòng đời lượt giao** (SPEC mục 13 d.360–370): `tasks`,
 * `claim`, `heartbeat`, `log`, `plan`, `submit`, `verdict`, `reply`; cộng
 * **mã thoát 3** của d.380 ("3 là nhận tín hiệu `STOP`").
 *
 * **Mọi ca đi đường thật**, đúng nếp của `cli.test.ts`: `chayCli` nhận chuỗi
 * tham số như trên dòng lệnh, tự phân tích, tự đọc biến môi trường, gọi **Worker
 * thật** trong Miniflare với **token thật của một agent thật** trong D1, rồi in
 * ra hai luồng giả. Không ca nào gọi thẳng hàm nội bộ của một lệnh rồi khai là
 * "lệnh chạy được".
 *
 * `docFile` của môi trường là một **bảng file trong bộ nhớ** — không ca nào chạm
 * đĩa (không tạo, không xoá file nào).
 */

import { SELF } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import { MA_THOAT } from '@baton/shared';
import { CHE, DONG_BRIEF_KHONG_TRA_DUOC, chayCli, type MoiTruongCli } from '@baton/cli';
import {
  TOKEN_CHU,
  dungAgentCoToken,
  dungDuAn,
  dungHoatDong,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungWorkspace,
  goiApi,
  phienTrongDb,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ (BAT-53, xem `caQuaSo`): ca hết giờ không để
// lệnh CLI còn dở bắn request vào lúc pool pop storage cô lập.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const URL_API = 'https://baton.test';

/** Token **giả** của worker (người nhận) và của manager (người giao). */
const TOKEN = 'bt_token_gia_worker_zzz9';
const TOKEN_QL = 'bt_token_gia_manager_zzz9';

interface BanChay {
  mt: MoiTruongCli;
  ra: string[];
  loi: string[];
}

function ban(
  token = TOKEN,
  file: Record<string, string> = {},
): BanChay {
  const ra: string[] = [];
  const loi: string[] = [];
  return {
    mt: {
      env: { BATON_URL: URL_API, BATON_TOKEN: token },
      viet: (d) => void ra.push(d),
      vietLoi: (d) => void loi.push(d),
      fetch: (u, i) => SELF.fetch(u, i),
      docFile: async (duong) => {
        const chu = file[duong];
        // Giống `readFile` của Node: file không có thì **ném**.
        if (chu === undefined) throw new Error(`ENOENT: no such file or directory, open '${duong}'`);
        return await Promise.resolve(chu);
      },
    },
    ra,
    loi,
  };
}

function tatCa(b: BanChay): string {
  return [...b.ra, ...b.loi].join('\n');
}

/**
 * Một dự án, một worker (người nhận), một manager (người giao), một ticket.
 * Người giao là **agent** chứ không phải chủ, để `verdict` và `reply` có một
 * danh tính thật gọi được chúng (19.12 câu 2, câu 37).
 */
async function duLieuMau(): Promise<{ ticket_id: string }> {
  await dungWorkspace();
  const pj = await dungDuAn('SAI', 'Sample');
  await dungAgentCoToken({ id: 'ag-1', ten: 'W', vai_tro: 'worker', token: TOKEN, du_an: [pj] });
  await dungAgentCoToken({
    id: 'ag-ql',
    ten: 'M',
    vai_tro: 'manager',
    token: TOKEN_QL,
    du_an: [pj],
  });
  const tk = await dungTicket(pj, 1, 'Việc để thử CLI', { trang_thai: 'in_progress' });
  return { ticket_id: tk };
}

/* ================================================================== *
 * baton tasks — SPEC d.360, d.352
 * ================================================================== */

describe('baton tasks [--wait] — SPEC d.360', () => {
  let ticket_id = '';

  beforeEach(async () => {
    ticket_id = (await duLieuMau()).ticket_id;
  });

  it('liệt kê lượt giao pending/in_progress của mình, có --json', async () => {
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', {
      nguoi_giao_agent_id: 'ag-ql',
      muc_tieu: 'Dựng CLI vòng đời',
    });

    const b = ban();
    expect(await chayCli(['tasks'], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('Lượt giao của tôi (1):');
    expect(chu).toContain('lg-1');
    expect(chu).toContain('Dựng CLI vòng đời');

    const js = ban();
    expect(await chayCli(['tasks', '--json'], js.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(js.ra.join('\n')) as {
      luot_giao: { id: string; brief: Record<string, string | null> }[];
      co_viec: boolean;
      cho_toi_da_giay: number;
    };
    expect(d.luot_giao.map((l) => l.id)).toEqual(['lg-1']);
    expect(d.luot_giao[0]?.brief['muc_tieu']).toBe('Dựng CLI vòng đời');
    expect(d.co_viec).toBe(true);
  });

  it('lượt accepted KHÔNG hiện; không có việc thì nói rõ, vẫn mã thoát 0', async () => {
    await dungLuotGiao('lg-xong', ticket_id, 'ag-1', { trang_thai: 'accepted' });

    const b = ban();
    expect(await chayCli(['tasks'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('(không có lượt giao nào đang chờ)');
    expect(b.ra.join('\n')).not.toContain('lg-xong');
  });

  /** 19.6: "câu hỏi hiện trong `baton tasks` của **người giao**". */
  it('câu hỏi của agent hiện trong tasks của NGƯỜI GIAO, không của người khác', async () => {
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', {
      trang_thai: 'in_progress',
      nguoi_giao_agent_id: 'ag-ql',
    });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'waiting_assigner' });
    await dungHoatDong('hd-1', 'ph-1', { loai: 'question', noi_dung: 'Dùng thư viện nào?' });

    const ql = ban(TOKEN_QL);
    expect(await chayCli(['tasks'], ql.mt)).toBe(MA_THOAT.xong);
    expect(ql.ra.join('\n')).toContain('Dùng thư viện nào?');
    expect(ql.ra.join('\n')).toContain('baton reply lg-1');

    // Chính agent đã hỏi thì **không** thấy câu hỏi đó trong mục "chờ tôi trả lời".
    const w = ban();
    expect(await chayCli(['tasks'], w.mt)).toBe(MA_THOAT.xong);
    expect(w.ra.join('\n')).toContain('Câu hỏi chờ tôi trả lời (0):');
  });

  /** **Mã thoát 3** — d.380. `tasks` đọc `tin_hieu` của phiên `stopping`. */
  it('phiên stopping: tasks in STOP và thoát MÃ 3', async () => {
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'stopping' });

    const b = ban();
    expect(await chayCli(['tasks'], b.mt)).toBe(MA_THOAT.nhan_stop);
    expect(b.ra.join('\n')).toContain('STOP');
    expect(b.ra.join('\n')).toContain('result hoặc error');

    const js = ban();
    expect(await chayCli(['tasks', '--json'], js.mt)).toBe(MA_THOAT.nhan_stop);
    expect((JSON.parse(js.ra.join('\n')) as { tin_hieu: string[] }).tin_hieu).toEqual(['STOP']);
  });

  it('--wait 1 không có việc: het_gio, mã thoát 0 (KHÔNG phải 4)', async () => {
    const b = ban();
    expect(await chayCli(['tasks', '--wait', '1', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { het_gio: boolean; cho_toi_da_giay: number };
    expect(d.het_gio).toBe(true);
    expect(d.cho_toi_da_giay).toBe(60);
  });

  it('--wait có việc sẵn: trả về NGAY, het_gio false', async () => {
    await dungLuotGiao('lg-1', ticket_id, 'ag-1');
    const b = ban();
    expect(await chayCli(['tasks', '--wait', '60', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { het_gio: boolean; da_cho_ms: number };
    expect(d.het_gio).toBe(false);
    expect(d.da_cho_ms).toBe(0);
  });

  it('--wait sai (âm, có dấu, có chữ): chặn ở CLI, mã thoát 1, KHÔNG gọi máy chủ', async () => {
    for (const xau of ['-1', '1.5', '60s', 'abc']) {
      const goi: string[] = [];
      const b = ban();
      b.mt.fetch = (u, i) => {
        goi.push(String(u));
        return SELF.fetch(u, i);
      };
      expect(await chayCli(['tasks', '--wait', xau], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
      expect(b.loi.join('\n')).toContain('INVALID_INPUT');
      expect(goi).toEqual([]);
    }
  });
});

/* ================================================================== *
 * baton claim — SPEC d.361
 * ================================================================== */

describe('baton claim <lượt> — SPEC d.361', () => {
  let ticket_id = '';

  beforeEach(async () => {
    ticket_id = (await duLieuMau()).ticket_id;
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', {
      nguoi_giao_agent_id: 'ag-ql',
      muc_tieu: 'Làm xong phần 5',
      ly_do: null,
    });
  });

  it('nhận lượt, MỞ PHIÊN, in brief + hồ sơ dự án + "lỗi đã gặp" (năm vế d.361)', async () => {
    const b = ban();
    expect(await chayCli(['claim', 'lg-1'], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('Đã nhận lượt lg-1');
    expect(chu).toMatch(/Phiên đã mở: .+/);
    expect(chu).toContain('SAI-1 — Việc để thử CLI');
    expect(chu).toContain('Mục tiêu: Làm xong phần 5');
    expect(chu).toContain('Dự án: SAI — Sample');
    expect(chu).toContain('Lỗi đã gặp');

    // Phiên có thật trong DB, và lượt đã sang `in_progress`.
    const js = ban();
    expect(await chayCli(['tasks', '--json'], js.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(js.ra.join('\n')) as {
      luot_giao: { trang_thai: string }[];
      phien: { dang_mo: boolean }[];
    };
    expect(d.luot_giao[0]?.trang_thai).toBe('in_progress');
    expect(d.phien).toHaveLength(1);
    expect(d.phien[0]?.dang_mo).toBe(true);
  });

  it('--json: có phien_id, brief, du_an, và hồ sơ + loi_da_gap THẬT', async () => {
    const b = ban();
    expect(await chayCli(['claim', 'lg-1', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as {
      phien_id: string;
      brief: Record<string, string | null>;
      du_an: { ma: string };
      ho_so: { project_id: string; phien_ban: number };
      loi_da_gap: unknown[];
    };
    expect(d.phien_id).not.toBe('');
    expect(d.brief['muc_tieu']).toBe('Làm xong phần 5');
    expect(d.du_an.ma).toBe('SAI');
    // Vế 4 + 5 của d.361 — hồ sơ dự án và lỗi đã gặp, không còn `null`.
    expect(d.ho_so.project_id).toBe('pj-SAI');
    expect(d.loi_da_gap).toEqual([]);
  });

  /**
   * **d.361 vế 4 + 5 với hồ sơ ĐÃ SOẠN.** Đây là ca nói được điều quan trọng:
   * một agent vừa `claim` đọc ngay được danh sách cấm riêng của dự án và những
   * lỗi người trước đã gặp — đúng điều d.294 hứa.
   */
  it('hồ sơ đã soạn: danh sách cấm riêng và "Lỗi đã gặp" ra chữ ngay khi claim', async () => {
    await SELF.fetch('https://x/v1/du-an/pj-SAI/ho-so', {
      method: 'PATCH',
      headers: { authorization: `Bearer ${TOKEN_CHU}`, 'content-type': 'application/json' },
      body: JSON.stringify({ la_gi: 'Hệ ticket', danh_sach_cam: 'Không đụng tiền' }),
    });
    await SELF.fetch('https://x/v1/du-an/pj-SAI/loi-da-gap', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN_CHU}`, 'content-type': 'application/json' },
      body: JSON.stringify({ loi: 'Quên workspace_id', cach_tranh: 'Ràng cả hai cột' }),
    });

    const b = ban();
    expect(await chayCli(['claim', 'lg-1'], b.mt)).toBe(MA_THOAT.xong);
    const chu = b.ra.join('\n');
    expect(chu).toContain('Hệ ticket');
    expect(chu).toContain('Không đụng tiền');
    expect(chu).toContain('Quên workspace_id');
    expect(chu).toContain('Ràng cả hai cột');
  });

  it('người KHÔNG phải người nhận: FORBIDDEN, mã thoát 1', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['claim', 'lg-1'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('FORBIDDEN');
  });

  it('nhận lần hai: ASSIGNMENT_NOT_PENDING, mã thoát 1', async () => {
    expect(await chayCli(['claim', 'lg-1'], ban().mt)).toBe(MA_THOAT.xong);
    const lai = ban();
    expect(await chayCli(['claim', 'lg-1'], lai.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(lai.loi.join('\n')).toContain('ASSIGNMENT_NOT_PENDING');
  });

  /**
   * **`LIMIT 200` của `/v1/tasks`** (`doc-viec.ts`): agent giữ hơn 200 lượt mở
   * thì lượt vừa nhận **không** có trong `tasks`. Giả lập bằng cách cho đúng
   * đường đó trả danh sách rỗng, mọi đường khác đi thật.
   */
  it('lượt KHÔNG có trong /v1/tasks: vẫn in brief qua đường lui chuỗi lượt', async () => {
    const b = ban();
    const that = b.mt.fetch;
    b.mt.fetch = async (u, i) => {
      const res = await (that ?? fetch)(u, i);
      if (!new URL(String(u)).pathname.startsWith('/v1/tasks')) return res;
      const than = await res.json<Record<string, unknown>>();
      return Response.json({ ...than, luot_giao: [] }, { status: res.status });
    };

    expect(await chayCli(['claim', 'lg-1', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { brief: Record<string, string | null> | null };
    expect(d.brief?.['muc_tieu']).toBe('Làm xong phần 5');
    expect(tatCa(b)).not.toContain(DONG_BRIEF_KHONG_TRA_DUOC);
  });

  /** Cả hai đường đều không thấy: **nói thẳng**, không im lặng in "(brief trống)". */
  it('cả hai đường đọc brief đều không thấy: KHAI RA là không tra được', async () => {
    const b = ban();
    const that = b.mt.fetch;
    b.mt.fetch = async (u, i) => {
      const res = await (that ?? fetch)(u, i);
      const duong = new URL(String(u)).pathname;
      if (duong.startsWith('/v1/tasks')) {
        const than = await res.json<Record<string, unknown>>();
        return Response.json({ ...than, luot_giao: [] }, { status: res.status });
      }
      if (duong.endsWith('/luot-giao')) {
        return Response.json({ ticket_id: '', items: [] }, { status: res.status });
      }
      return res;
    };

    expect(await chayCli(['claim', 'lg-1'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain(DONG_BRIEF_KHONG_TRA_DUOC);
    expect(b.ra.join('\n')).not.toContain('(brief trống)');
  });

  it('lượt không có thật: NOT_FOUND, mã thoát 1', async () => {
    const b = ban();
    expect(await chayCli(['claim', 'lg-khong-co'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('NOT_FOUND');
  });
});

/* ================================================================== *
 * baton heartbeat — SPEC d.362 + mã thoát 3
 * ================================================================== */

describe('baton heartbeat [ghi chú] — SPEC d.362', () => {
  let ticket_id = '';

  beforeEach(async () => {
    ticket_id = (await duLieuMau()).ticket_id;
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', {
      trang_thai: 'in_progress',
      nguoi_giao_agent_id: 'ag-ql',
    });
  });

  it('gửi nhịp tim cho phiên đang mở, ghi chú là TUỲ CHỌN', async () => {
    await dungPhien('ph-1', 'lg-1', { tin_hieu_cuoi_luc: 1 });

    const khong_ghi_chu = ban();
    expect(await chayCli(['heartbeat'], khong_ghi_chu.mt)).toBe(MA_THOAT.xong);
    expect(khong_ghi_chu.ra.join('\n')).toContain('ph-1');

    const co_ghi_chu = ban();
    expect(await chayCli(['heartbeat', 'đang chạy test'], co_ghi_chu.mt)).toBe(MA_THOAT.xong);
    expect((await phienTrongDb('ph-1'))?.ghi_chu_cuoi).toBe('đang chạy test');
    // Nhịp tim là một **tín hiệu** (mục 6 d.188): mốc phải nhích khỏi 1.
    expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBeGreaterThan(1);
  });

  /** **Mã thoát 3** — d.380, mục 6 d.193. Đây là đường chính của mã 3. */
  it('phiên stopping: heartbeat trả STOP và thoát MÃ 3, cả hai chế độ ra', async () => {
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'stopping' });

    const b = ban();
    expect(await chayCli(['heartbeat'], b.mt)).toBe(MA_THOAT.nhan_stop);
    expect(b.ra.join('\n')).toContain('STOP');
    // `STOP` không phải lỗi: không có gì ra stderr, và kết quả vẫn in đủ.
    expect(b.loi).toEqual([]);

    const js = ban();
    expect(await chayCli(['heartbeat', '--json'], js.mt)).toBe(MA_THOAT.nhan_stop);
    const d = JSON.parse(js.ra.join('\n')) as { tin_hieu: string[]; trang_thai: string };
    expect(d.tin_hieu).toEqual(['STOP']);
    expect(d.trang_thai).toBe('stopping');
  });

  /** 19.6: "lần gọi kế tiếp của agent nhận được câu trả lời" — và chỉ **một** lần. */
  it('nhận trả lời của người giao ở lần gọi KẾ TIẾP, không lặp lại lần sau', async () => {
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'waiting_assigner' });
    await dungHoatDong('hd-1', 'ph-1', { loai: 'question', noi_dung: 'Chọn A hay B?' });

    const ql = ban(TOKEN_QL);
    expect(await chayCli(['reply', 'lg-1', 'Chọn A'], ql.mt)).toBe(MA_THOAT.xong);

    const lan_1 = ban();
    expect(await chayCli(['heartbeat'], lan_1.mt)).toBe(MA_THOAT.xong);
    expect(lan_1.ra.join('\n')).toContain('Chọn A');

    const lan_2 = ban();
    expect(await chayCli(['heartbeat'], lan_2.mt)).toBe(MA_THOAT.xong);
    expect(lan_2.ra.join('\n')).not.toContain('Chọn A');
  });

  it('không có phiên nào đang mở: NOT_FOUND, chỉ đường dùng claim', async () => {
    const b = ban();
    expect(await chayCli(['heartbeat'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('NOT_FOUND');
    expect(b.loi.join('\n')).toContain('baton claim');
  });

  it('phiên đã đóng: SESSION_CLOSED hoặc NOT_FOUND, mã thoát 1', async () => {
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'closed' });
    const b = ban();
    expect(await chayCli(['heartbeat'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toMatch(/SESSION_CLOSED|NOT_FOUND/);
  });
});

/* ================================================================== *
 * baton log — SPEC d.363, d.381
 * ================================================================== */

describe('baton log <type> "<nội dung>" — SPEC d.363', () => {
  let ticket_id = '';

  beforeEach(async () => {
    ticket_id = (await duLieuMau()).ticket_id;
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', {
      trang_thai: 'in_progress',
      nguoi_giao_agent_id: 'ag-ql',
    });
    await dungPhien('ph-1', 'lg-1');
  });

  it('gửi được cả 5 loại của d.363, và --json phân tích được', async () => {
    // Đúng **năm** mã của d.363; `question` để cuối vì nó đổi trạng thái phiên.
    for (const loai of ['thought', 'action', 'result', 'error', 'question']) {
      const b = ban();
      expect(await chayCli(['log', loai, `nội dung ${loai}`, '--json'], b.mt)).toBe(MA_THOAT.xong);
      const d = JSON.parse(b.ra.join('\n')) as { loai: string; phien_id: string };
      expect(d.loai).toBe(loai);
      expect(d.phien_id).toBe('ph-1');
    }
  });

  /** 19.6: mục `question` đưa phiên sang `waiting_assigner`. */
  it('log question đưa phiên sang waiting_assigner và nói ra điều đó', async () => {
    const b = ban();
    expect(await chayCli(['log', 'question', 'Dùng thư viện nào?'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('chờ người giao');
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('waiting_assigner');
  });

  /** d.381: mã tiếng Anh vào; nhãn tiếng Việt trong thông điệp lỗi. */
  it('type sai bị chặn TẠI CLI, kể đủ 5 mã kèm nhãn, KHÔNG gọi máy chủ', async () => {
    const goi: string[] = [];
    const b = ban();
    b.mt.fetch = (u, i) => {
      goi.push(String(u));
      return SELF.fetch(u, i);
    };
    expect(await chayCli(['log', 'Suy nghĩ', 'nội dung'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    const chu = b.loi.join('\n');
    expect(chu).toContain('INVALID_INPUT');
    for (const m of ['thought', 'action', 'question', 'result', 'error']) expect(chu).toContain(m);
    expect(chu).toContain('Suy nghĩ');
    expect(goi).toEqual([]);
  });

  /**
   * Mục 6 d.193: chủ bấm Dừng → phiên `stopping`; mục `result` kế tiếp là **lời
   * xác nhận dừng** và phiên đóng. Dừng đi qua **đường thật** của chủ.
   */
  it('phiên stopping: log result là lời xác nhận dừng, phiên đóng', async () => {
    const dung = await goiApi('/v1/phien/ph-1/dung', TOKEN_CHU, { method: 'POST' });
    expect(dung.status).toBe(200);

    const b = ban();
    expect(await chayCli(['log', 'result', 'đã ngưng việc'], b.mt)).toBe(MA_THOAT.xong);
    expect(b.ra.join('\n')).toContain('xác nhận dừng');
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('closed');
  });

  /**
   * **Hai phiên mở cùng lúc, không chỉ định lượt** (`cau-hoi-spec.md` #83): CLI
   * **chặn** thay vì đoán (chỉ định bằng `--luot`/`BATON_LUOT` — BAT-56, ca ghim ở
   * `nhieu-phien-mot-agent.test.ts`) — ghi nhầm phiên là
   * ghi vào dòng hoạt động của một việc khác, và mục đã gửi không sửa được.
   */
  it('hai phiên mở: CLI chặn với INVALID_INPUT, không chọn hộ phiên nào', async () => {
    const tk2 = await dungTicket('pj-SAI', 2, 'Việc thứ hai', { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-2', tk2, 'ag-1', { trang_thai: 'in_progress' });
    await dungPhien('ph-2', 'lg-2');

    const b = ban();
    expect(await chayCli(['log', 'thought', 'nghĩ'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('2 phiên mở');
    expect(b.loi.join('\n')).toContain('INVALID_INPUT');
  });

  it('thiếu nội dung: INVALID_INPUT với cách dùng, mã thoát 1', async () => {
    const b = ban();
    expect(await chayCli(['log', 'thought'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('Cách dùng: baton log');
  });
});

/* ================================================================== *
 * baton plan — SPEC d.364, mục 6 d.191
 * ================================================================== */

describe('baton plan <file.json> — SPEC d.364', () => {
  let ticket_id = '';

  beforeEach(async () => {
    ticket_id = (await duLieuMau()).ticket_id;
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1');
  });

  it('nhận mảng chuỗi, và mảng object có trạng thái bước', async () => {
    const chuoi = ban(TOKEN, { 'kh.json': JSON.stringify(['Bước một', 'Bước hai']) });
    expect(await chayCli(['plan', 'kh.json'], chuoi.mt)).toBe(MA_THOAT.xong);
    expect(chuoi.ra.join('\n')).toContain('2 bước');
    expect(chuoi.ra.join('\n')).toContain('Bước một');

    const obj = ban(TOKEN, {
      'kh2.json': JSON.stringify([
        { noi_dung: 'Đã xong', trang_thai: 'done' },
        { noi_dung: 'Đang làm', trang_thai: 'in_progress' },
      ]),
    });
    expect(await chayCli(['plan', 'kh2.json', '--json'], obj.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(obj.ra.join('\n')) as {
      phien_ban: number;
      buoc: { noi_dung: string; trang_thai: string }[];
    };
    // "Gửi lại **toàn bộ** danh sách mỗi lần" (d.191): lần hai là phiên bản 2.
    expect(d.phien_ban).toBe(2);
    expect(d.buoc.map((b) => b.trang_thai)).toEqual(['done', 'in_progress']);
  });

  it('file KHÔNG CÓ: INVALID_INPUT nêu đường dẫn, mã thoát 1', async () => {
    const b = ban();
    expect(await chayCli(['plan', '/khong/co/kh.json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('INVALID_INPUT');
    expect(b.loi.join('\n')).toContain('/khong/co/kh.json');
  });

  it('JSON HỎNG, và JSON đúng nhưng không phải danh sách: INVALID_INPUT', async () => {
    const hong = ban(TOKEN, { 'kh.json': '{ không phải json' });
    expect(await chayCli(['plan', 'kh.json'], hong.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(hong.loi.join('\n')).toContain('kh.json');

    const khong_mang = ban(TOKEN, { 'kh.json': '{"a":1}' });
    expect(await chayCli(['plan', 'kh.json'], khong_mang.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(khong_mang.loi.join('\n')).toContain('danh sách bước');
  });

  it('bước có trạng thái lạ: server từ chối INVALID_INPUT, mã thoát 1', async () => {
    const b = ban(TOKEN, {
      'kh.json': JSON.stringify([{ noi_dung: 'x', trang_thai: 'khong-co-ma-nay' }]),
    });
    expect(await chayCli(['plan', 'kh.json'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('INVALID_INPUT');
  });
});

/* ================================================================== *
 * baton submit — SPEC d.366, mục 5, 19.12 câu 34
 * ================================================================== */

const BAO_CAO_DU = [
  '# Báo cáo lượt 4',
  '',
  '## Kết quả: done',
  '',
  '## Đã làm',
  'Tám lệnh mới.',
  '',
  '## Kiểm chứng',
  'npm test xanh.',
  '',
  '## Nhánh và commit',
  'worker/p5-cli-nen',
  '',
  '## Rủi ro, điều cần xem kỹ',
  'Chỗ suy ra phiên.',
  '',
  '## Việc phát sinh (không tự làm)',
  'Hồ sơ dự án chưa có API.',
  '',
].join('\n');

describe('baton submit <lượt> <file.md> — SPEC d.366', () => {
  let ticket_id = '';

  beforeEach(async () => {
    ticket_id = (await duLieuMau()).ticket_id;
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', {
      trang_thai: 'in_progress',
      nguoi_giao_agent_id: 'ag-ql',
    });
    await dungPhien('ph-1', 'lg-1');
  });

  it('đọc đủ 5 mục + Kết quả từ file, nộp, và ĐÓNG PHIÊN', async () => {
    const b = ban(TOKEN, { 'bc.md': BAO_CAO_DU });
    expect(await chayCli(['submit', 'lg-1', 'bc.md', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as {
      trang_thai: string;
      ket_qua: string;
      phien_da_dong: boolean;
      bao_cao: Record<string, string | null>;
    };
    expect(d.trang_thai).toBe('submitted');
    expect(d.ket_qua).toBe('done');
    expect(d.phien_da_dong).toBe(true);
    expect(d.bao_cao['da_lam']).toBe('Tám lệnh mới.');
    expect(d.bao_cao['kiem_chung']).toBe('npm test xanh.');
    expect(d.bao_cao['nhanh_va_commit']).toBe('worker/p5-cli-nen');
    expect(d.bao_cao['rui_ro']).toBe('Chỗ suy ra phiên.');
    expect(d.bao_cao['viec_phat_sinh']).toBe('Hồ sơ dự án chưa có API.');
    // Mục 6 d.180: phiên đóng khi nộp.
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('closed');
  });

  /** 19.12 câu 34: chỉ `Kết quả` bắt buộc; 5 mục được để trống. */
  it('file chỉ có Kết quả: nộp được, 5 mục là null', async () => {
    const b = ban(TOKEN, { 'bc.md': '## Kết quả\n\nblocked\n' });
    expect(await chayCli(['submit', 'lg-1', 'bc.md', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { ket_qua: string; bao_cao: Record<string, unknown> };
    expect(d.ket_qua).toBe('blocked');
    expect(d.bao_cao['da_lam']).toBeNull();
    expect(d.bao_cao['viec_phat_sinh']).toBeNull();
  });

  it('file THIẾU Kết quả, hoặc Kết quả sai mã: INVALID_INPUT kể 3 mã kèm nhãn', async () => {
    const thieu = ban(TOKEN, { 'bc.md': '## Đã làm\nxong rồi\n' });
    expect(await chayCli(['submit', 'lg-1', 'bc.md'], thieu.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    const chu = thieu.loi.join('\n');
    expect(chu).toContain('INVALID_INPUT');
    expect(chu).toContain('bc.md');
    for (const m of ['done', 'partial', 'blocked']) expect(chu).toContain(m);
    expect(chu).toContain('Xong một phần');

    // Nhãn tiếng Việt **không** phải mã nhập (d.381).
    const sai = ban(TOKEN, { 'bc.md': '## Kết quả: Xong\n' });
    expect(await chayCli(['submit', 'lg-1', 'bc.md'], sai.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(sai.loi.join('\n')).toContain('INVALID_INPUT');
  });

  it('file không có: INVALID_INPUT nêu đường dẫn, và KHÔNG gọi máy chủ', async () => {
    const goi: string[] = [];
    const b = ban();
    b.mt.fetch = (u, i) => {
      goi.push(String(u));
      return SELF.fetch(u, i);
    };
    expect(await chayCli(['submit', 'lg-1', 'khong-co.md'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('khong-co.md');
    expect(goi).toEqual([]);
  });

  /** 19.12 câu 38: nộp lần hai bị từ chối. Câu 37: chỉ người nhận nộp được. */
  it('nộp lần hai bị từ chối; người KHÔNG phải người nhận cũng bị từ chối', async () => {
    const lan_1 = ban(TOKEN, { 'bc.md': BAO_CAO_DU });
    expect(await chayCli(['submit', 'lg-1', 'bc.md'], lan_1.mt)).toBe(MA_THOAT.xong);

    const lan_2 = ban(TOKEN, { 'bc.md': BAO_CAO_DU });
    expect(await chayCli(['submit', 'lg-1', 'bc.md'], lan_2.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(lan_2.loi.join('\n')).toContain('ASSIGNMENT_STATE_INVALID');

    const nguoi_khac = ban(TOKEN_QL, { 'bc.md': BAO_CAO_DU });
    expect(await chayCli(['submit', 'lg-1', 'bc.md'], nguoi_khac.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(nguoi_khac.loi.join('\n')).toContain('FORBIDDEN');
  });

  it('tiêu đề lạ trong file không thành nội dung của mục nào', async () => {
    const b = ban(TOKEN, {
      'bc.md': ['## Kết quả: partial', '', '## Ghi chú riêng', 'chữ không thuộc mục nào'].join('\n'),
    });
    expect(await chayCli(['submit', 'lg-1', 'bc.md', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { bao_cao: Record<string, unknown> };
    expect(JSON.stringify(d.bao_cao)).not.toContain('không thuộc mục nào');
  });
});

/* ================================================================== *
 * baton verdict — SPEC d.369, mục 5, 19.5, 19.12 câu 37
 * ================================================================== */

describe('baton verdict <lượt> accept|return — SPEC d.369', () => {
  let ticket_id = '';

  beforeEach(async () => {
    ticket_id = (await duLieuMau()).ticket_id;
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', {
      trang_thai: 'submitted',
      nguoi_giao_agent_id: 'ag-ql',
      ket_qua: 'done',
      nop_luc: Date.now(),
    });
  });

  it('accept: lượt sang accepted (nhận cả dạng accepted của bảng 0.1)', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['verdict', 'lg-1', 'accept', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as { trang_thai: string; luot_moi: null };
    expect(d.trang_thai).toBe('accepted');
    expect(d.luot_moi).toBeNull();
  });

  /** 19.5: trả lại tạo lượt mới `pending`, cùng người nhận. */
  it('return --reason: lượt sang returned và sinh lượt mới pending', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['verdict', 'lg-1', 'return', '--reason', 'Thiếu test'], b.mt)).toBe(
      MA_THOAT.xong,
    );
    expect(b.ra.join('\n')).toContain('Lượt mới do trả lại');

    const w = ban();
    expect(await chayCli(['tasks', '--json'], w.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(w.ra.join('\n')) as {
      luot_giao: { trang_thai: string; brief: Record<string, string | null> }[];
    };
    expect(d.luot_giao[0]?.trang_thai).toBe('pending');
    // 19.5 + 19.12 câu 35: lý do trả lại ở **đầu** mục tiêu của brief mới.
    expect(d.luot_giao[0]?.brief['muc_tieu']).toContain('Thiếu test');
  });

  /** Mục 5: `returned` **bắt buộc** có lý do. */
  it('return mà thiếu --reason: REASON_REQUIRED, mã thoát 1', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['verdict', 'lg-1', 'return'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('REASON_REQUIRED');
  });

  it('mã kết quả sai bị chặn TẠI CLI, kể các mã kèm nhãn tiếng Việt', async () => {
    const goi: string[] = [];
    const b = ban(TOKEN_QL);
    b.mt.fetch = (u, i) => {
      goi.push(String(u));
      return SELF.fetch(u, i);
    };
    expect(await chayCli(['verdict', 'lg-1', 'Đạt'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    const chu = b.loi.join('\n');
    expect(chu).toContain('INVALID_INPUT');
    expect(chu).toContain('accept');
    expect(chu).toContain('return');
    expect(chu).toContain('Trả lại');
    expect(goi).toEqual([]);
  });

  /** 19.12 câu 37: chỉ **người giao** nghiệm thu được, kể cả người nhận cũng không. */
  it('người nhận tự nghiệm thu lượt của mình: FORBIDDEN', async () => {
    const b = ban();
    expect(await chayCli(['verdict', 'lg-1', 'accept'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(b.loi.join('\n')).toContain('FORBIDDEN');
  });
});

/* ================================================================== *
 * baton reply — SPEC d.370 + 19.12 câu 2
 * ================================================================== */

describe('baton reply <lượt> "<nội dung>" — SPEC d.370, 19.12 câu 2', () => {
  let ticket_id = '';

  beforeEach(async () => {
    ticket_id = (await duLieuMau()).ticket_id;
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', {
      trang_thai: 'in_progress',
      nguoi_giao_agent_id: 'ag-ql',
    });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'waiting_assigner' });
    await dungHoatDong('hd-1', 'ph-1', { loai: 'question', noi_dung: 'Chọn A hay B?' });
  });

  /** Câu 2: một hoạt động trên phiên **và** một bình luận trên ticket; phiên về `running`. */
  it('ghi CẢ HAI: hoạt động trên phiên và bình luận trên ticket; phiên về running', async () => {
    const b = ban(TOKEN_QL);
    expect(await chayCli(['reply', 'lg-1', 'Chọn A', '--json'], b.mt)).toBe(MA_THOAT.xong);
    const d = JSON.parse(b.ra.join('\n')) as {
      tra_loi_cho_id: string;
      comment_id: string;
      trang_thai_phien: string;
    };
    expect(d.tra_loi_cho_id).toBe('hd-1');
    expect(d.comment_id).not.toBe('');
    expect(d.trang_thai_phien).toBe('running');
    expect((await phienTrongDb('ph-1'))?.trang_thai).toBe('running');
  });

  /** Câu 2: **chỉ người giao của lượt đó** gọi được. */
  it('agent KHÁC người giao (kể cả người hỏi): FORBIDDEN, mã thoát 1', async () => {
    const nguoi_hoi = ban();
    expect(await chayCli(['reply', 'lg-1', 'tự trả lời'], nguoi_hoi.mt)).toBe(
      MA_THOAT.loi_nghiep_vu,
    );
    expect(nguoi_hoi.loi.join('\n')).toContain('FORBIDDEN');

    const pj2 = await dungDuAn('OTR', 'Dự án khác');
    await dungAgentCoToken({
      id: 'ag-la',
      ten: 'L',
      vai_tro: 'manager',
      token: 'bt_token_gia_la_zzz9',
      du_an: [pj2, 'pj-SAI'],
    });
    const la = ban('bt_token_gia_la_zzz9');
    expect(await chayCli(['reply', 'lg-1', 'xen vào'], la.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    expect(la.loi.join('\n')).toContain('FORBIDDEN');
  });

  it('không có câu hỏi nào chờ: NOT_FOUND, mã thoát 1', async () => {
    const tk2 = await dungTicket('pj-SAI', 2, 'Việc khác', { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-2', tk2, 'ag-1', {
      trang_thai: 'in_progress',
      nguoi_giao_agent_id: 'ag-ql',
    });
    await dungPhien('ph-2', 'lg-2');

    const b = ban(TOKEN_QL);
    expect(await chayCli(['reply', 'lg-2', 'không ai hỏi'], b.mt)).toBe(MA_THOAT.loi_nghiep_vu);
    // Assert **mã lỗi**, không chỉ mã thoát: mã thoát 1 xanh với mọi lỗi nghiệp vụ.
    expect(b.loi.join('\n')).toContain('NOT_FOUND');
  });
});

/* ================================================================== *
 * Nền chung cho TÁM lệnh mới — d.380 (`--json`), d.382 (không in token)
 * ================================================================== */

describe('tám lệnh mới: --json, trợ giúp, không in token (d.380, d.382)', () => {
  let ticket_id = '';

  beforeEach(async () => {
    ticket_id = (await duLieuMau()).ticket_id;
    await dungLuotGiao('lg-1', ticket_id, 'ag-1', {
      trang_thai: 'in_progress',
      nguoi_giao_agent_id: 'ag-ql',
    });
    await dungPhien('ph-1', 'lg-1');
  });

  const TEN_LENH = [
    'tasks',
    'claim',
    'heartbeat',
    'log',
    'plan',
    'submit',
    'verdict',
    'reply',
  ] as const;

  it('cả tám lệnh có trong trợ giúp chung và có --help riêng kèm [--json]', async () => {
    const chung = ban();
    expect(await chayCli(['--help'], chung.mt)).toBe(MA_THOAT.xong);
    for (const ten of TEN_LENH) expect(chung.ra.join('\n')).toContain(ten);

    for (const ten of TEN_LENH) {
      const b = ban();
      expect(await chayCli([ten, '--help'], b.mt)).toBe(MA_THOAT.xong);
      expect(b.ra.join('\n')).toContain(`Cách dùng: baton ${ten}`);
      expect(b.ra.join('\n')).toContain('[--json]');
    }
    // `[ghi chú]` của d.362 là tham số vị trí **tuỳ chọn**, in trong ngoặc vuông.
    const hb = ban();
    await chayCli(['heartbeat', '--help'], hb.mt);
    expect(hb.ra.join('\n')).toContain('[ghi chú]');
  });

  /**
   * **Đường thành công, có assert MÃ THOÁT.**
   *
   * Thứ tự cố ý: `submit` đóng `ph-1`, nên mọi lệnh cần một phiên mở
   * (`heartbeat`, `log`, `plan`) phải chạy **trước** nó; `verdict` cần lượt đã
   * `submitted`; `claim` chạy **cuối** vì nó mở thêm một phiên.
   */
  it('đường thành công của cả TÁM lệnh: mã thoát 0, và không lệnh nào in token', async () => {
    await dungHoatDong('hd-1', 'ph-1', { loai: 'question', noi_dung: 'Hỏi gì đó?' });
    const tk2 = await dungTicket('pj-SAI', 2, 'Việc để claim', { trang_thai: 'in_progress' });
    await dungLuotGiao('lg-2', tk2, 'ag-1', { nguoi_giao_agent_id: 'ag-ql', muc_tieu: 'Mục tiêu 2' });

    const chay: [string[], string][] = [
      [['tasks'], TOKEN],
      [['heartbeat', 'ghi chú'], TOKEN],
      [['log', 'thought', 'nghĩ'], TOKEN],
      [['plan', 'kh.json'], TOKEN],
      [['reply', 'lg-1', 'trả lời'], TOKEN_QL],
      [['submit', 'lg-1', 'bc.md'], TOKEN],
      [['verdict', 'lg-1', 'accept'], TOKEN_QL],
      [['claim', 'lg-2'], TOKEN],
    ];
    // Đủ **tám** lệnh của lượt này, mỗi lệnh đúng một lần.
    expect(new Set(chay.map(([ds]) => ds[0]))).toEqual(new Set(TEN_LENH));

    for (const [ds, token] of chay) {
      const b = ban(token, { 'kh.json': '["một bước"]', 'bc.md': '## Kết quả: done\n' });
      expect(await chayCli(ds, b.mt), `lệnh ${ds.join(' ')} phải xong`).toBe(MA_THOAT.xong);
      expect(tatCa(b)).not.toContain(token);
    }
  });

  /**
   * **Đường LỖI của cả tám lệnh** — `--json` phân tích được, và **lưới chắn
   * token là thật**.
   *
   * Hai nhóm, chọn sao cho token **thật sự có mặt** trong thứ sắp in ra — nếu
   * không, `not.toContain` là một assert rỗng (đúng lỗi của bản đầu, nơi ca
   * dùng một token chưa bao giờ vào `env`):
   *   * `may_chu_nhac_lai`: máy chủ (hoặc một proxy) dội lại token trong thông
   *     điệp lỗi — ca của người đi tìm cách làm token lọt ra.
   *   * còn lại: **chính tham số người gõ mang token** (tên file), và CLI đưa
   *     đường dẫn vào thông điệp lỗi.
   *
   * Đã đo bằng **đột biến**: bỏ lớp che trong `in-ra.ts` thì ca này ĐỎ ở cả
   * tám lệnh.
   */
  it('đường LỖI của cả tám lệnh: --json phân tích được, token bị CHE (không lọt)', async () => {
    const chay: [string[], string, boolean][] = [
      [['tasks', '--json'], TOKEN, true],
      [['claim', 'khong-co', '--json'], TOKEN, true],
      [['heartbeat', '--json'], TOKEN, true],
      [['log', 'thought', 'x', '--json'], TOKEN, true],
      [['verdict', 'khong-co', 'accept', '--json'], TOKEN_QL, true],
      [['reply', 'khong-co', 'x', '--json'], TOKEN_QL, true],
      // Hai lệnh đọc file: lỗi xảy ra **trước** mạng, nên token đi vào qua tên file.
      [['plan', `${TOKEN}.json`, '--json'], TOKEN, false],
      [['submit', 'lg-1', `${TOKEN_QL}.md`, '--json'], TOKEN_QL, false],
    ];
    expect(new Set(chay.map(([ds]) => ds[0]))).toEqual(new Set(TEN_LENH));

    /*
     * Gom lỗi rồi assert **một lần ở cuối**, không `expect` trong vòng lặp:
     * `expect` ném ngay nên một lệnh hỏng che bảy lệnh còn lại — và chính phép
     * đột biến (bỏ lớp che) cần thấy **cả tám** cùng đỏ, không chỉ cái đầu.
     */
    const lot_token: string[] = [];
    const thieu_che: string[] = [];

    for (const [ds, token, qua_mang] of chay) {
      const b = ban(token);
      if (qua_mang) {
        // Máy chủ nhắc lại chính token trong thông điệp lỗi của mình.
        b.mt.fetch = async () =>
          Response.json(
            { error: 'INVALID_TOKEN', message: `Token "${token}" không hợp lệ.` },
            { status: 401 },
          );
      }
      const ma = await chayCli(ds, b.mt);
      expect([MA_THOAT.loi_nghiep_vu, MA_THOAT.loi_xac_thuc_hoac_mang]).toContain(ma);

      const than = JSON.parse(b.loi.join('\n')) as { loi: string | null; thong_diep: string };
      expect(typeof than.thong_diep).toBe('string');
      // Chính token của bản chạy này — không phải một token khác, luôn vắng mặt.
      if (tatCa(b).includes(token)) lot_token.push(ds.join(' '));
      if (!tatCa(b).includes(CHE)) thieu_che.push(ds.join(' '));
    }

    expect(lot_token).toEqual([]);
    expect(thieu_che).toEqual([]);
  });
});
