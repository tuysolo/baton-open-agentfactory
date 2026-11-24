/**
 * **Chờ dài `--wait`** của đường kéo việc — SPEC mục 13.
 *
 * Hai dòng SPEC được kiểm từng chữ:
 *   * **d.352**: "**Mô hình kéo việc** (không cần webhook): agent tự gọi "việc của
 *     tôi" hoặc "chờ việc". Có chế độ chờ dài **tới 60 giây**; **có việc mới hoặc
 *     tín hiệu mới thì trả về ngay**."
 *   * **d.387**: "Giới hạn: 600 request mỗi phút cho mỗi token. **Lệnh chờ dài
 *     tính 1 request.**"
 *   * bảng lệnh mục 13: `baton tasks [--wait 60]` — "Liệt kê lượt giao `pending`
 *     hoặc `in_progress` của mình".
 *   * 19.6: "câu hỏi hiện trong `baton tasks` của người giao".
 *
 * Hai ca **trung tâm** (`tỉnh giữa lúc chờ`) đo bằng **đồng hồ thật**: nếu đường
 * đánh thức bị vô hiệu thì chúng đỏ, không phải xanh chậm. Đó là điều kiện duy
 * nhất khiến bộ test này canh được d.352.
 */

import { env, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, vi } from 'vitest';
import { bamToken } from '@baton/shared';
import { CHO_DAI_TOI_DA_GIAY, msChoDai } from '../src/doc-viec.js';
import { cuaGhiCua, type WorkspaceGate } from '../src/workspace-gate.js';
import type { GioiHanToken } from '../src/gioi-han-token.js';
import {
  TOKEN_CHU,
  WS,
  WS_KHAC,
  aiAgent,
  choVaoDuAn,
  dungAgentCoToken,
  dungDuAn,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungTicketWorkspaceKhac,
  dungWorkspace,
  goiApi,
  phienTrongDb,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Sổ `bay` (xem chú thích ở `afterEach` dưới) khai ở đầu file vì cả thân mỗi
// ca/`beforeEach` cũng đi qua nó (BAT-54, khuôn BAT-53, xem `caQuaSo`): ca hết giờ
// không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
const { it, beforeEach } = caQuaSo(bay);

/* ------------------------------------------------------------------ *
 * Môi trường
 * ------------------------------------------------------------------ */

const P = 'pj-SAI';
const TK = 'tk-pj-SAI-1';
const TK_2 = 'tk-pj-SAI-2';

const AG = { mgr: 'ag-mgr', wk: 'ag-wk', wk2: 'ag-wk2', tat: 'ag-tat', dem: 'ag-dem' } as const;
const TOKEN = {
  mgr: 'bt_cd_mgr',
  wk: 'bt_cd_wk',
  wk2: 'bt_cd_wk2',
  tat: 'bt_cd_tat',
  dem: 'bt_cd_dem',
} as const;

beforeEach(async () => {
  await dungWorkspace();
  await dungAgentCoToken({ id: AG.mgr, ten: 'M-Sample', vai_tro: 'manager', token: TOKEN.mgr });
  await dungAgentCoToken({ id: AG.wk, ten: 'W-builder', vai_tro: 'worker', token: TOKEN.wk });
  await dungAgentCoToken({ id: AG.wk2, ten: 'W-builder-2', vai_tro: 'worker', token: TOKEN.wk2 });
  await dungAgentCoToken({ id: AG.dem, ten: 'W-dem', vai_tro: 'worker', token: TOKEN.dem });
  await dungAgentCoToken({
    id: AG.tat,
    ten: 'W-da-tat',
    vai_tro: 'worker',
    token: TOKEN.tat,
    disabled: true,
    vao_tat_ca_du_an: true,
  });

  await dungDuAn('SAI', 'Sample', 'active', AG.mgr);
  for (const id of [AG.mgr, AG.wk, AG.wk2, AG.dem]) await choVaoDuAn(id, P);

  await dungTicket(P, 1, 'Việc để giao', { trang_thai: 'todo' });
  await dungTicket(P, 2, 'Việc thứ hai', { trang_thai: 'todo' });
});

/* ------------------------------------------------------------------ *
 * Giúp việc
 * ------------------------------------------------------------------ */

interface TasksRa {
  luot_giao: { id: string; trang_thai: string }[];
  cau_hoi: { hoat_dong_id: string; noi_dung: string }[];
  tin_hieu: string[];
  phien: { id: string }[];
  co_viec: boolean;
  het_gio: boolean;
  da_cho_ms: number;
  cho_toi_da_giay: number;
}

/*
 * **Sổ các request `tasks` còn đang bay** — chống chập chờn "Isolated storage
 * failed" (BAT-12 việc 1).
 *
 * Nguyên nhân đã tái hiện: một ca gọi `tasks(..., '?wait=30')` mà KHÔNG await
 * ngay, rồi một assert ở giữa đỏ (vd sổ waiter chưa kịp có lệnh chờ khi máy đang
 * tải). Ca kết thúc nhưng request vẫn sống tới 30 giây và còn đọc D1 **sau khi**
 * `@cloudflare/vitest-pool-workers` đã bắt đầu pop storage cô lập của ca. Lúc đó
 * workerd ghi `SQLITE_IOERR: disk I/O error`, và nếu lần pop hỏng thì pool đánh dấu
 * storage là `broken`: mọi ca sau trong file đều đỏ với "Isolated storage failed".
 * Thông báo của pool nói rõ đây là do tài nguyên chưa được dọn ("Ensure you await
 * all Promises that read or write to these services").
 *
 * Vì vậy mọi request `tasks` đi qua sổ này, và `afterEach` chờ hết chúng (đọc hết
 * thân) trước khi ca nhường chỗ cho lượt pop. Ca xanh thì sổ đã xong, chờ 0 ms; ca
 * đỏ thì lỗi thật hiện ra đúng tên, không bị "Isolated storage failed" che mất.
 *
 * BAT-54: sổ này là `bay` (khai ở đầu file) — `soRequestBay` làm đúng việc của bộ
 * `Set` cũ (chờ `allSettled`, đọc hết thân `Response` chưa đọc) và còn chờ tới khi
 * sổ rỗng, nên cả thân ca (qua `caQuaSo`) cũng nằm trong cùng một sổ, một `afterEach`.
 */
function tasks(token: string, truy_van = ''): Promise<Response> {
  return bay.theoDoi(goiApi(`/v1/tasks${truy_van}`, token));
}

// Trần đủ cho một lệnh chờ 30 giây bị bỏ rơi tự hết hạn.
afterEach(bay.doiHet, 45_000);

async function than(res: Response): Promise<TasksRa> {
  return res.json<TasksRa>();
}

function nghi(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Số đơn vị hạn mức mà một token đã dùng trong cửa sổ hiện tại.
 *
 * Đọc bằng `daDung()`, **không** `dem()`: `dem()` tự cộng một đơn vị nên chính
 * phép đo sẽ làm lệch con số đang cần đo.
 */
async function daDung(token: string): Promise<number> {
  const bam = await bamToken(token);
  const ns = env.GIOI_HAN_TOKEN;
  const stub = ns.get(ns.idFromName(`token:${bam}`));
  return runInDurableObject(stub, (g: GioiHanToken) => g.daDung());
}

async function soDangCho(): Promise<number> {
  return runInDurableObject(cuaGhiCua(env, WS), (g: WorkspaceGate) => g.soDangCho());
}

/**
 * Chờ tới khi sổ waiter của cửa ghi có đúng `n` lệnh chờ, thay cho một
 * `nghi(250)` cố định.
 *
 * `nghi(250)` đánh cược rằng request đi hết xác thực, hạn mức token, D1 và vào
 * được DO trong 250 ms. Khi cả bộ chạy song song trên máy tải nặng thì cược thua,
 * assert `soDangCho() === 1` đỏ, và request bị bỏ rơi kéo theo "Isolated storage
 * failed" (xem `bay`). Hỏi lại sổ cho tới khi có đủ thì **không** nới assert
 * nào: ca vẫn đỏ nếu sau `han_ms` mà sổ vẫn không có `n` lệnh chờ. Các ngưỡng
 * `< 5_000` của ca "tỉnh giữa lúc chờ" tính từ `t0` **trước** request, nên thời
 * gian chờ vào sổ đã nằm trong đó, không bị trừ ra.
 */
async function choVaoSo(n: number, han_ms = 10_000): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    const so = await soDangCho();
    if (so === n || Date.now() - t0 >= han_ms) {
      expect(so, `sổ waiter phải có ${n} lệnh chờ`).toBe(n);
      return;
    }
    await nghi(20);
  }
}

/** Như `choVaoSo`, cho ca đang chạy BÊN TRONG DO (`runInDurableObject`). */
async function choVaoSoCua(gate: WorkspaceGate, n: number, han_ms = 10_000): Promise<void> {
  const t0 = Date.now();
  while (gate.soDangCho() !== n && Date.now() - t0 < han_ms) await nghi(20);
  expect(gate.soDangCho(), `sổ waiter phải có ${n} lệnh chờ`).toBe(n);
}

/* ================================================================== *
 * Luật 4 — trần 60 giây, và `wait` sai
 * ================================================================== */
describe('SPEC mục 13 d.352 — "chờ dài TỚI 60 giây": đọc và kẹp `wait`', () => {
  it('thiếu `wait`, rỗng, hay `0` → 0 ms (hành vi cũ: trả ngay)', () => {
    expect(msChoDai(undefined)).toBe(0);
    expect(msChoDai('')).toBe(0);
    expect(msChoDai('   ')).toBe(0);
    expect(msChoDai('0')).toBe(0);
  });

  it('`wait` trong trần đổi đúng sang ms', () => {
    expect(msChoDai('1')).toBe(1_000);
    expect(msChoDai('30')).toBe(30_000);
    expect(msChoDai(' 60 ')).toBe(60_000);
    expect(msChoDai('60')).toBe(CHO_DAI_TOI_DA_GIAY * 1000);
  });

  it('`wait` lớn hơn 60 bị KẸP về 60, không phải lỗi (quyết định 02/10)', () => {
    expect(msChoDai('61')).toBe(60_000);
    expect(msChoDai('600')).toBe(60_000);
    expect(msChoDai('999999')).toBe(60_000);
  });

  it('`wait` âm hoặc không phải số nguyên → INVALID_INPUT', () => {
    for (const xau of ['-1', '-60', 'abc', 'NaN', '1.5', '1e3', '+1', 'Infinity', '6 0']) {
      expect(() => msChoDai(xau)).toThrow();
    }
  });

  it('qua HTTP: `?wait=-1` → 422 INVALID_INPUT', async () => {
    const res = await tasks(TOKEN.wk, '?wait=-1');
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('qua HTTP: `?wait=abc` → 422 INVALID_INPUT', async () => {
    expect((await tasks(TOKEN.wk, '?wait=abc')).status).toBe(422);
  });

  /*
   * Kẹp **hai tầng**: `msChoDai` kẹp ở Worker, `hanChoHieuLucMs` kẹp lại ở DO.
   * Ca này đo **riêng tầng DO** — gọi thẳng vào DO với `han_ms` lớn hơn trần, tức
   * đúng cái mà một đường gọi quên kẹp sẽ đưa vào. Bỏ `Math.min` ở tầng DO thì ca
   * này đỏ dù `msChoDai` vẫn kẹp đúng.
   */
  it('tầng DO tự kẹp `han_ms`, KHÔNG tin con số Worker đưa xuống', async () => {
    await runInDurableObject(cuaGhiCua(env, WS), (gate: WorkspaceGate) => {
      const tran = CHO_DAI_TOI_DA_GIAY * 1000;
      expect(gate.hanChoHieuLucMs(90_000)).toBe(tran);
      expect(gate.hanChoHieuLucMs(tran + 1)).toBe(tran);
      expect(gate.hanChoHieuLucMs(Number.MAX_SAFE_INTEGER)).toBe(tran);
      // Trong trần thì giữ nguyên; số âm về 0, không thành hạn vô hạn.
      expect(gate.hanChoHieuLucMs(1_500)).toBe(1_500);
      expect(gate.hanChoHieuLucMs(tran)).toBe(tran);
      expect(gate.hanChoHieuLucMs(-5_000)).toBe(0);
    });
  });

  it('qua HTTP: `?wait=600` KHÔNG lỗi; trần hiện trong `cho_toi_da_giay`', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { nguoi_giao_agent_id: AG.mgr });
    const res = await tasks(TOKEN.wk, '?wait=600');
    expect(res.status).toBe(200);
    const v = await than(res);
    expect(v.cho_toi_da_giay).toBe(60);
    expect(v.luot_giao).toHaveLength(1);
  });
});

/* ================================================================== *
 * Luật 1 — có ngay thì trả ngay
 * ================================================================== */
describe('SPEC mục 13 — `baton tasks`: lượt giao `pending`/`in_progress` của mình', () => {
  it('`wait=0` trả đúng lượt `pending` và `in_progress` của mình', async () => {
    await dungLuotGiao('lg-pend', TK, AG.wk, { nguoi_giao_agent_id: AG.mgr });
    await dungLuotGiao('lg-dang', TK_2, AG.wk, {
      nguoi_giao_agent_id: AG.mgr,
      trang_thai: 'in_progress',
    });
    const v = await than(await tasks(TOKEN.wk));
    expect(v.luot_giao.map((l) => l.id).sort()).toEqual(['lg-dang', 'lg-pend']);
    expect(v.co_viec).toBe(true);
    expect(v.het_gio).toBe(false);
  });

  it('lượt đã đóng (`accepted`, `submitted`, `canceled`…) KHÔNG nằm trong `tasks`', async () => {
    await dungLuotGiao('lg-xong', TK, AG.wk, {
      nguoi_giao_agent_id: AG.mgr,
      trang_thai: 'accepted',
    });
    await dungLuotGiao('lg-nop', TK_2, AG.wk, {
      nguoi_giao_agent_id: AG.mgr,
      trang_thai: 'submitted',
    });
    const v = await than(await tasks(TOKEN.wk));
    expect(v.luot_giao).toEqual([]);
    expect(v.co_viec).toBe(false);
  });

  it('ĐÃ CÓ việc thì `--wait` trả về NGAY, không chờ', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { nguoi_giao_agent_id: AG.mgr });
    const t0 = Date.now();
    const v = await than(await tasks(TOKEN.wk, '?wait=30'));
    const ms = Date.now() - t0;
    expect(v.luot_giao).toHaveLength(1);
    expect(v.het_gio).toBe(false);
    expect(ms).toBeLessThan(2_000);
    // Trả ngay thì không chạm cửa ghi, nên không để lại waiter nào.
    expect(await soDangCho()).toBe(0);
  });

  it('ĐÃ CÓ câu hỏi chờ mình trả lời thì `--wait` trả về NGAY (19.6)', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, {
      nguoi_giao_agent_id: AG.mgr,
      trang_thai: 'in_progress',
    });
    await dungPhien('ph-1', 'lg-1');
    expect((await goiApi('/v1/phien/ph-1/hoat-dong', TOKEN.wk, {
      method: 'POST',
      than: { loai: 'question', noi_dung: 'Dùng thư viện nào?' },
    })).status).toBe(201);

    const t0 = Date.now();
    const v = await than(await tasks(TOKEN.mgr, '?wait=30'));
    expect(v.cau_hoi).toHaveLength(1);
    expect(v.co_viec).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it('ĐÃ CÓ tín hiệu `STOP` thì `--wait` trả về NGAY (mục 6 d.193)', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk2, {
      nguoi_giao_agent_id: AG.mgr,
      trang_thai: 'submitted',
    });
    // Lượt `submitted` nên không phải "việc"; chỉ còn tín hiệu của phiên.
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'stopping' });
    const t0 = Date.now();
    const v = await than(await tasks(TOKEN.wk2, '?wait=30'));
    expect(v.luot_giao).toEqual([]);
    expect(v.tin_hieu).toEqual(['STOP']);
    expect(v.co_viec).toBe(true);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it('phiên còn mở KHÔNG tự tính là "có việc" — nếu không `--wait` sẽ không bao giờ chờ', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk2, {
      nguoi_giao_agent_id: AG.mgr,
      trang_thai: 'submitted',
    });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'running' });
    const v = await than(await tasks(TOKEN.wk2));
    expect(v.phien).toHaveLength(1);
    expect(v.tin_hieu).toEqual([]);
    expect(v.co_viec).toBe(false);
  });
});

/* ================================================================== *
 * Luật 2 — TỈNH GIỮA LÚC CHỜ (luật trung tâm của d.352)
 * ================================================================== */
describe('SPEC mục 13 d.352 — "có việc mới hoặc tín hiệu mới thì TRẢ VỀ NGAY"', () => {
  it(
    'đang chờ 30s mà có lượt giao mới → tỉnh và trả về ngay (dưới 5s)',
    async () => {
      const t0 = Date.now();
      const dang_cho = tasks(TOKEN.wk, '?wait=30');

      // Để request kịp vào sổ chờ của cửa ghi.
      await choVaoSo(1);

      const giao = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.mgr, {
        method: 'POST',
        than: { nguoi_nhan_agent_id: AG.wk },
      });
      expect(giao.status).toBe(201);

      const v = await than(await dang_cho);
      const ms = Date.now() - t0;

      // **Assert mang tải**: vô hiệu đường đánh thức thì dòng này đỏ.
      expect(ms).toBeLessThan(5_000);
      expect(v.het_gio).toBe(false);
      expect(v.co_viec).toBe(true);
      expect(v.luot_giao).toHaveLength(1);
      expect(v.luot_giao[0]?.trang_thai).toBe('pending');
      expect(await soDangCho()).toBe(0);
    },
    40_000,
  );

  it(
    'người giao đang chờ 30s mà agent gửi câu hỏi → tỉnh và trả về ngay (19.6)',
    async () => {
      await dungLuotGiao('lg-1', TK, AG.wk, {
        nguoi_giao_agent_id: AG.mgr,
        trang_thai: 'in_progress',
      });
      await dungPhien('ph-1', 'lg-1');

      const t0 = Date.now();
      const dang_cho = tasks(TOKEN.mgr, '?wait=30');
      await choVaoSo(1);

      const hoi = await goiApi('/v1/phien/ph-1/hoat-dong', TOKEN.wk, {
        method: 'POST',
        than: { loai: 'question', noi_dung: 'Chọn phương án nào?' },
      });
      expect(hoi.status).toBe(201);

      const v = await than(await dang_cho);
      expect(Date.now() - t0).toBeLessThan(5_000);
      expect(v.het_gio).toBe(false);
      expect(v.cau_hoi).toHaveLength(1);
      expect(v.cau_hoi[0]?.noi_dung).toBe('Chọn phương án nào?');
      expect(await soDangCho()).toBe(0);
    },
    40_000,
  );

  it(
    'đang chờ mà chủ bấm Dừng → tỉnh ngay với tín hiệu `STOP` (mục 6 d.193)',
    async () => {
      await dungLuotGiao('lg-1', TK, AG.wk2, {
        nguoi_giao_agent_id: AG.mgr,
        trang_thai: 'submitted',
      });
      await dungPhien('ph-1', 'lg-1', { trang_thai: 'running' });

      const t0 = Date.now();
      const dang_cho = tasks(TOKEN.wk2, '?wait=30');
      await choVaoSo(1);

      expect((await goiApi('/v1/phien/ph-1/dung', TOKEN_CHU, { method: 'POST' })).status).toBe(200);

      const v = await than(await dang_cho);
      expect(Date.now() - t0).toBeLessThan(5_000);
      expect(v.het_gio).toBe(false);
      expect(v.tin_hieu).toEqual(['STOP']);
    },
    40_000,
  );

  it(
    'lệnh ghi KHÔNG liên quan tới mình không làm lệnh chờ trả về sớm',
    async () => {
      const t0 = Date.now();
      const dang_cho = tasks(TOKEN.wk, '?wait=3');
      // Lệnh ghi phải rơi vào lúc lệnh chờ ĐÃ treo, nếu không ca này không đo gì.
      await choVaoSo(1);

      // Giao cho **agent khác**: khoá `luot:ag-wk2`, không phải `luot:ag-wk`.
      const giao = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.mgr, {
        method: 'POST',
        than: { nguoi_nhan_agent_id: AG.wk2 },
      });
      expect(giao.status).toBe(201);

      const v = await than(await dang_cho);
      expect(v.het_gio).toBe(true);
      expect(v.luot_giao).toEqual([]);
      /*
       * Vẫn chờ đủ 3 giây, không bị cắt sớm.
       *
       * **Ngưỡng cố ý đặt xa trị thật, không sát biên.** Trị thật ở đây là ~3 000 ms
       * (hết giờ `wait=3`), và cái cần phân biệt là đường **cắt sớm**: nếu lệnh ghi
       * của agent khác gọi dậy sai, lệnh chờ trả về ngay sau lúc vào sổ (`choVaoSo`), tức
       * cỡ vài trăm ms.
       * Hai đường cách nhau hơn mười lần, nên **mọi** ngưỡng trong khoảng rộng đó đều
       * bắt đúng lỗi. Trước đây để `2_800` — chỉ cách trị thật 200 ms — là tự buộc ca
       * này vào độ chính xác của đồng hồ tường trên máy đang tải, **cùng hình lỗi**
       * với ca KIẾN TRÚC đã làm đỏ một cửa nghiệm thu. Hạ xuống `2_000` **không** mất
       * sức phân biệt (vẫn gấp 8 lần đường cắt sớm) mà bỏ hẳn lề mong manh. Hành vi
       * "không trả về sớm" còn được canh thêm bởi `het_gio === true` ở trên.
       */
      expect(Date.now() - t0).toBeGreaterThanOrEqual(2_000);
    },
    40_000,
  );
});

/* ================================================================== *
 * Chỉ mục `question` gọi dậy người giao — 19.6
 * ================================================================== */
describe('19.6 — chỉ `question` đánh thức người giao, mục khác thì KHÔNG', () => {
  async function dungBoiCanh(): Promise<void> {
    await dungLuotGiao('lg-1', TK, AG.wk, {
      nguoi_giao_agent_id: AG.mgr,
      trang_thai: 'in_progress',
    });
    await dungPhien('ph-1', 'lg-1');
  }

  function guiMuc(loai: string, noi_dung: string): Promise<Response> {
    return goiApi('/v1/phien/ph-1/hoat-dong', TOKEN.wk, {
      method: 'POST',
      than: { loai, noi_dung },
    });
  }

  it(
    'mục `thought` KHÔNG gọi dậy waiter của người giao (chỉ `question` là câu hỏi chờ trả lời)',
    async () => {
      await dungBoiCanh();
      // `wait=10`, không 3: dưới tải `guiMuc` có thể chậm vài giây, và nếu waiter
      // tự hết hạn trước khi đếm sổ thì "còn 1" đỏ mà không vì `thought`. Khung chờ
      // phải dài hơn hẳn một lượt ghi; ý ca không đổi — waiter ra bằng hết hạn.
      const dang_cho = tasks(TOKEN.mgr, '?wait=10');
      await choVaoSo(1);

      expect((await guiMuc('thought', 'đang nghĩ, chưa hỏi gì')).status).toBe(201);
      await nghi(250);
      // Vẫn treo: mục `thought` không phải việc của người giao.
      expect(await soDangCho()).toBe(1);

      const v = await than(await dang_cho);
      expect(v.het_gio).toBe(true);
      expect(v.cau_hoi).toEqual([]);
    },
    40_000,
  );

  /*
   * Hai ca dưới đo **đúng khoá đánh thức**, không chỉ nội dung phản hồi: một
   * `thought` phát `cau_hoi:<phiên>` thì waiter vẫn hết hạn với kết quả rỗng (đọc
   * lại không thấy câu hỏi nào), nên ca HTTP trên **không** thấy sai. Chỗ thấy
   * được là waiter có bị gọi dậy hay không.
   */
  it('mục `thought` KHÔNG phát khoá `cau_hoi:<phiên>`: waiter không bị gọi dậy', async () => {
    await dungBoiCanh();
    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      // 8 s, không 1,5 s: cùng lý do ca HTTP trên — khung chờ phải dài hơn hẳn
      // một lượt `guiMuc` dưới tải, kẻo waiter tự rời sổ trước lần đếm.
      const cho = gate.cho('cau_hoi:ph-1', 8_000);
      await nghi(50);
      expect(gate.soDangCho()).toBe(1);

      expect((await guiMuc('thought', 'đang nghĩ, chưa hỏi gì')).status).toBe(201);
      // Khoá không tới: waiter còn nguyên trong sổ…
      expect(gate.soDangCho()).toBe(1);
      // …và ra bằng đường HẾT HẠN (`false`), không phải đường được gọi dậy.
      expect(await cho).toBe(false);
    });
  }, 30_000);

  it('đối chứng: mục `question` CÓ phát khoá `cau_hoi:<phiên>` và gọi dậy ngay', async () => {
    await dungBoiCanh();
    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      const cho = gate.cho('cau_hoi:ph-1', 30_000);
      await nghi(50);
      expect(gate.soDangCho()).toBe(1);

      expect((await guiMuc('question', 'Chọn A hay B?')).status).toBe(201);
      expect(await cho).toBe(true);
      expect(gate.soDangCho()).toBe(0);
    });
  }, 30_000);

  it(
    'đối chứng cùng bối cảnh: mục `question` thì CÓ gọi dậy ngay',
    async () => {
      await dungBoiCanh();
      const t0 = Date.now();
      const dang_cho = tasks(TOKEN.mgr, '?wait=30');
      await choVaoSo(1);

      expect((await guiMuc('question', 'Chọn A hay B?')).status).toBe(201);

      const v = await than(await dang_cho);
      expect(Date.now() - t0).toBeLessThan(5_000);
      expect(v.cau_hoi).toHaveLength(1);
      expect(v.co_viec).toBe(true);
    },
    40_000,
  );
});

/* ================================================================== *
 * Luật 3 — hết giờ thì trả rỗng, KHÔNG phải lỗi
 * ================================================================== */
describe('SPEC mục 13 d.352 — hết thời gian chờ', () => {
  it(
    'không có gì suốt thời gian chờ → 200 với kết quả RỖNG, `het_gio: true`',
    async () => {
      const t0 = Date.now();
      const res = await tasks(TOKEN.wk, '?wait=1');
      const ms = Date.now() - t0;

      expect(res.status).toBe(200);
      const v = await than(res);
      expect(v.het_gio).toBe(true);
      expect(v.co_viec).toBe(false);
      expect(v.luot_giao).toEqual([]);
      expect(v.cau_hoi).toEqual([]);
      expect(v.tin_hieu).toEqual([]);
      expect(ms).toBeGreaterThanOrEqual(900);
      expect(v.da_cho_ms).toBeGreaterThanOrEqual(900);
    },
    30_000,
  );
});

/* ================================================================== *
 * `tasks` là lệnh ĐỌC — SPEC mục 6 d.188 ("Lệnh đọc không tính")
 * ================================================================== */
describe('SPEC mục 6 d.188 — `tasks --wait` là lệnh ĐỌC, không phải tín hiệu phiên', () => {
  it(
    'chờ dài KHÔNG nhích `tin_hieu_cuoi_luc` của phiên (cau-hoi-spec #53)',
    async () => {
      const cu = Date.now() - 5 * 60_000;
      await dungLuotGiao('lg-1', TK, AG.wk2, {
        nguoi_giao_agent_id: AG.mgr,
        trang_thai: 'in_progress',
      });
      await dungPhien('ph-1', 'lg-1', { trang_thai: 'running', tin_hieu_cuoi_luc: cu, mo_luc: cu });

      // Gọi hai lần, một lần có `--wait`: không lần nào là tín hiệu.
      expect((await tasks(TOKEN.wk2)).status).toBe(200);
      expect((await tasks(TOKEN.wk2, '?wait=30')).status).toBe(200);
      expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBe(cu);

      // Đối chứng: một lệnh GHI (nhịp tim) thì có nhích.
      const hb = await goiApi('/v1/luot-giao/lg-1/heartbeat', TOKEN.wk2, {
        method: 'POST',
        than: {},
      });
      expect(hb.status).toBe(200);
      expect((await phienTrongDb('ph-1'))?.tin_hieu_cuoi_luc).toBeGreaterThan(cu);
    },
    30_000,
  );
});

/* ================================================================== *
 * Luật 5 — d.387 "Lệnh chờ dài tính 1 request"
 * ================================================================== */
describe('SPEC mục 13 d.387 — "Lệnh chờ dài tính 1 REQUEST"', () => {
  it('đối chứng: bộ đếm CÓ nhích — 3 lệnh thường ăn 3 đơn vị', async () => {
    expect(await daDung(TOKEN.dem)).toBe(0);
    for (const n of [1, 2, 3]) {
      expect((await tasks(TOKEN.dem)).status).toBe(200);
      expect(await daDung(TOKEN.dem)).toBe(n);
    }
  });

  it(
    'một lệnh chờ hết giờ chỉ ăn ĐÚNG 1 đơn vị của hạn mức 600/phút',
    async () => {
      expect(await daDung(TOKEN.dem)).toBe(0);
      const v = await than(await tasks(TOKEN.dem, '?wait=2'));
      expect(v.het_gio).toBe(true);
      expect(await daDung(TOKEN.dem)).toBe(1);
    },
    30_000,
  );

  it(
    'tỉnh giữa lúc chờ cũng KHÔNG đếm thêm: vẫn đúng 1 đơn vị',
    async () => {
      expect(await daDung(TOKEN.dem)).toBe(0);
      const dang_cho = tasks(TOKEN.dem, '?wait=30');
      await choVaoSo(1);

      // Lệnh ghi dùng **token khác**, nên bộ đếm của `TOKEN.dem` không bị nó cộng.
      const giao = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.mgr, {
        method: 'POST',
        than: { nguoi_nhan_agent_id: AG.dem },
      });
      expect(giao.status).toBe(201);

      const v = await than(await dang_cho);
      expect(v.luot_giao).toHaveLength(1);
      expect(await daDung(TOKEN.dem)).toBe(1);
    },
    40_000,
  );
});

/* ================================================================== *
 * Luật 6 — quyền và phạm vi KHÔNG được nới
 * ================================================================== */
describe('SPEC mục 13 — chờ dài đi qua đúng bộ quyền của đường đọc thường', () => {
  it('thiếu token → 401, kể cả khi có `?wait`', async () => {
    const res = await goiApi('/v1/tasks?wait=30', '');
    expect(res.status).toBe(401);
  });

  it('token sai → 401, KHÔNG chờ', async () => {
    const t0 = Date.now();
    const res = await tasks('bt_khong_co_token_nay', '?wait=30');
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it('agent `disabled` → 403, KHÔNG chờ (mục 3; cau-hoi-spec #11)', async () => {
    const t0 = Date.now();
    const res = await tasks(TOKEN.tat, '?wait=30');
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    expect(Date.now() - t0).toBeLessThan(2_000);
    expect(await soDangCho()).toBe(0);
  });

  it('agent chỉ thấy việc CỦA MÌNH, không thấy lượt của agent khác', async () => {
    await dungLuotGiao('lg-wk2', TK, AG.wk2, { nguoi_giao_agent_id: AG.mgr });
    const v = await than(await tasks(TOKEN.wk));
    expect(v.luot_giao).toEqual([]);
    expect((await than(await tasks(TOKEN.wk2))).luot_giao.map((l) => l.id)).toEqual(['lg-wk2']);
  });

  it('client KHÔNG tự khai được mình là ai: `?agent_id=` bị bỏ qua', async () => {
    await dungLuotGiao('lg-wk2', TK, AG.wk2, { nguoi_giao_agent_id: AG.mgr });
    for (const q of [
      '?agent_id=ag-wk2&wait=0',
      '?ai=ag-wk2&wait=0',
      '?nguoi_nhan_agent_id=ag-wk2&wait=0',
      '?workspace_id=ws-zz-khac&wait=0',
    ]) {
      const v = await than(await tasks(TOKEN.wk, q));
      expect(v.luot_giao).toEqual([]);
    }
  });

  it('client KHÔNG tự khai được chủ đề chờ: `?chu_de=` bị bỏ qua, chờ vẫn hết giờ', async () => {
    await dungLuotGiao('lg-wk2', TK, AG.wk2, { nguoi_giao_agent_id: AG.mgr });
    const v = await than(await tasks(TOKEN.wk, '?wait=1&chu_de=luot:ag-wk2'));
    expect(v.het_gio).toBe(true);
    expect(v.luot_giao).toEqual([]);
  }, 30_000);

  it('khoá đánh thức của agent KHÁC không gọi dậy waiter của mình', async () => {
    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      const cho = gate.choViec({
        workspace_id: WS,
        ai: { loai: 'agent', ai: aiAgent('worker', { agent_id: AG.wk }), token_bam: null },
        han_ms: 1_500,
      });
      // Để vòng lặp của `choViec` kịp đăng ký waiter.
      await choVaoSoCua(gate, 1);

      expect(gate.danhThuc(`luot:${AG.wk2}`)).toBe(0);
      expect(gate.danhThuc('cau_hoi:ph-cua-nguoi-khac')).toBe(0);
      expect(gate.danhThuc(`luot:${AG.wk}`)).toBe(1);

      const v = await cho;
      expect(v.luot_giao).toEqual([]);
    });
  }, 30_000);

  it('workspace khác: cửa ghi là một DO KHÁC, nên không có đường nghe chéo', () => {
    const a = cuaGhiCua(env, WS).id.toString();
    const b = cuaGhiCua(env, WS_KHAC).id.toString();
    expect(a).not.toBe(b);
    expect(a).toBe(env.WORKSPACE_GATE.idFromName(`workspace:${WS}`).toString());
  });

  it('agent của workspace khác chỉ thấy việc của workspace mình', async () => {
    const tk_khac = await dungTicketWorkspaceKhac();
    const t = Date.now();
    const bam = await bamToken('bt_cd_khac');
    await env.DB.prepare(
      `INSERT INTO agent
         (id, workspace_id, ten, vai_tro, disabled, vao_tat_ca_du_an,
          token_bam, token_bon_cuoi, token_tao_luc, tao_luc, cap_nhat_luc)
       VALUES ('ag-khac', ?, 'W-khac', 'worker', 0, 1, ?, 'khac', ?, ?, ?)`,
    )
      .bind(WS_KHAC, bam, t, t, t)
      .run();
    await env.DB.prepare(
      `INSERT INTO luot_giao
         (id, workspace_id, ticket_id, so_luot, loai, nguoi_giao_loai, nguoi_nhan_agent_id,
          trang_thai, tao_luc, cap_nhat_luc)
       VALUES ('lg-khac', ?, ?, 1, 'work', 'owner', 'ag-khac', 'pending', ?, ?)`,
    )
      .bind(WS_KHAC, tk_khac, t, t)
      .run();

    // Và ws-test cũng có một lượt, cho cùng mã agent-khác-workspace không thấy.
    await dungLuotGiao('lg-cua-wk', TK, AG.wk, { nguoi_giao_agent_id: AG.mgr });

    const v = await than(await tasks('bt_cd_khac'));
    expect(v.luot_giao.map((l) => l.id)).toEqual(['lg-khac']);
    expect((await than(await tasks(TOKEN.wk))).luot_giao.map((l) => l.id)).toEqual(['lg-cua-wk']);
  });
});

/* ================================================================== *
 * Luật 7 — danh tính mất hiệu lực / phiên đã đóng giữa lúc chờ
 * ================================================================== */
describe('giữa lúc đang chờ: token bị thu hồi, agent bị tắt, phiên đã đóng', () => {
  it(
    'token bị THU HỒI giữa lúc chờ → cắt ngay với 401 (cau-hoi-spec #51)',
    async () => {
      const t0 = Date.now();
      const dang_cho = tasks(TOKEN.wk, '?wait=30');
      await choVaoSo(1);

      const thu = await goiApi(`/v1/agent/${AG.wk}/token/thu-hoi`, TOKEN_CHU, { method: 'POST' });
      expect(thu.status).toBe(200);

      const res = await dang_cho;
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
      expect(Date.now() - t0).toBeLessThan(5_000);
      expect(await soDangCho()).toBe(0);
    },
    40_000,
  );

  it(
    'agent bị TẮT giữa lúc chờ → cắt ngay với 403',
    async () => {
      const t0 = Date.now();
      const dang_cho = tasks(TOKEN.wk, '?wait=30');
      await choVaoSo(1);

      const tat = await goiApi(`/v1/agent/${AG.wk}`, TOKEN_CHU, {
        method: 'PATCH',
        than: { disabled: true },
      });
      expect(tat.status).toBe(200);

      const res = await dang_cho;
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
      expect(Date.now() - t0).toBeLessThan(5_000);
    },
    40_000,
  );

  /*
   * Đường **hết hạn** cũng phải kiểm lại token. Ca này vô hiệu hoá token **không
   * qua** đường phát khoá `agent:<tôi>` (ghi thẳng DB — cũng là những gì xảy ra
   * khi DO khởi động lại làm mất sổ waiter), nên waiter **không** được gọi dậy:
   * nó hết hạn rồi đọc một lần cuối. Nếu đường hết hạn không kiểm token thì một
   * token đã mất hiệu lực vẫn đọc được dữ liệu tới 60 giây.
   */
  it(
    'token mất hiệu lực KHÔNG qua đường phát khoá → lệnh chờ HẾT HẠN trả 401, không trả dữ liệu',
    async () => {
      const dang_cho = tasks(TOKEN.wk, '?wait=2');
      await choVaoSo(1);

      // Ghi thẳng DB: không có `danhThuc('agent:ag-wk')` nào được phát.
      await env.DB.prepare('UPDATE agent SET token_bam = ? WHERE id = ? AND workspace_id = ?')
        .bind('bam-khong-trung-voi-token-nao', AG.wk, WS)
        .run();

      const res = await dang_cho;
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: 'INVALID_TOKEN' });
      expect(await soDangCho()).toBe(0);
    },
    30_000,
  );

  it(
    'agent bị TẮT thẳng trong DB → lệnh chờ hết hạn trả 403, không trả dữ liệu',
    async () => {
      const dang_cho = tasks(TOKEN.wk, '?wait=2');
      await choVaoSo(1);

      await env.DB.prepare('UPDATE agent SET disabled = 1 WHERE id = ? AND workspace_id = ?')
        .bind(AG.wk, WS)
        .run();

      const res = await dang_cho;
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
    },
    30_000,
  );

  it('phiên ĐÃ ĐÓNG: `tasks` là lệnh ĐỌC nên KHÔNG trả SESSION_CLOSED (mục 6 d.188, d.195)', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk2, {
      nguoi_giao_agent_id: AG.mgr,
      trang_thai: 'accepted',
    });
    await dungPhien('ph-1', 'lg-1', { trang_thai: 'closed', ly_do_dong: 'đã nộp báo cáo' });

    const res = await tasks(TOKEN.wk2, '?wait=0');
    expect(res.status).toBe(200);
    const v = await than(res);
    expect(v.phien).toEqual([]);
    expect(v.tin_hieu).toEqual([]);
    expect(v.co_viec).toBe(false);
  });

  it(
    'phiên đóng giữa lúc chờ (`stopping` quá 10 phút tự đóng) không sinh tín hiệu xác',
    async () => {
      await dungLuotGiao('lg-1', TK, AG.wk2, {
        nguoi_giao_agent_id: AG.mgr,
        trang_thai: 'submitted',
      });
      // `stopping` từ 11 phút trước: dẫn xuất d.194 đã đóng phiên này.
      const cu = Date.now() - 11 * 60_000;
      await dungPhien('ph-1', 'lg-1', { trang_thai: 'stopping', stopping_luc: cu, mo_luc: cu });

      const v = await than(await tasks(TOKEN.wk2, '?wait=1'));
      expect(v.tin_hieu).toEqual([]);
      expect(v.phien).toEqual([]);
      expect(v.het_gio).toBe(true);
    },
    30_000,
  );
});

/* ================================================================== *
 * Luật 8 — không rò rỉ (SPEC mục 15)
 * ================================================================== */
describe('SPEC mục 15 — chờ dài không làm rò token', () => {
  it('thân phản hồi không chứa token thô, băm token, hay `token_bam`', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { nguoi_giao_agent_id: AG.mgr });
    const chu = await (await tasks(TOKEN.wk, '?wait=5')).text();
    expect(chu).not.toContain(TOKEN.wk);
    expect(chu).not.toContain(await bamToken(TOKEN.wk));
    expect(chu).not.toContain('token_bam');
    expect(chu).not.toContain('token');
  });

  it('id DO của cửa ghi dẫn từ WORKSPACE, không từ token (quyet-dinh dòng 19)', async () => {
    const bam = await bamToken(TOKEN.wk);
    const id = cuaGhiCua(env, WS).id.toString();
    expect(id).toBe(env.WORKSPACE_GATE.idFromName(`workspace:${WS}`).toString());
    expect(id).not.toBe(env.WORKSPACE_GATE.idFromName(`token:${bam}`).toString());
    // Hai token khác nhau vẫn vào đúng một cửa ghi: id không phụ thuộc token.
    expect(cuaGhiCua(env, WS).id.toString()).toBe(id);
  });
});

/* ================================================================== *
 * Luật 9 — dọn sạch waiter
 * ================================================================== */
describe('dọn sổ waiter: không rò bộ nhớ, không đánh thức xác', () => {
  it('hết hạn → waiter bị dọn', async () => {
    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      const cho = gate.cho(['a', 'b'], 20);
      await Promise.resolve();
      expect(gate.soDangCho()).toBe(1);
      expect(await cho).toBe(false);
      expect(gate.soDangCho()).toBe(0);
      // Đánh thức sau khi đã hết hạn không tìm thấy ai.
      expect(gate.danhThuc('a')).toBe(0);
    });
  });

  it('client NGẮT giữa lúc chờ → waiter bị dọn ngay, không đánh thức xác', async () => {
    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      const ngat = new AbortController();
      const cho = gate.cho('a', 30_000, ngat.signal);
      await Promise.resolve();
      expect(gate.soDangCho()).toBe(1);

      ngat.abort();
      expect(await cho).toBe(false);
      expect(gate.soDangCho()).toBe(0);
      expect(gate.danhThuc('a')).toBe(0);
    });
  });

  it('signal đã ngắt TRƯỚC khi gọi → không đăng ký waiter nào', async () => {
    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      const ngat = new AbortController();
      ngat.abort();
      expect(await gate.cho('a', 30_000, ngat.signal)).toBe(false);
      expect(gate.soDangCho()).toBe(0);
    });
  });

  it('waiter nghe NHIỀU chủ đề, chủ đề nào cũng gọi dậy đúng một lần', async () => {
    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      const cho = gate.cho(['x', 'y'], 10_000);
      await Promise.resolve();
      expect(gate.danhThuc('y')).toBe(1);
      expect(await cho).toBe(true);
      // Đã dậy rồi thì chủ đề còn lại không gọi được lần nữa.
      expect(gate.danhThuc('x')).toBe(0);
      expect(gate.soDangCho()).toBe(0);
    });
  });

  it('`choViec` trả về vì CÓ việc cũng dọn waiter đã đăng ký trước khi đọc', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { nguoi_giao_agent_id: AG.mgr });
    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      const v = await gate.choViec({
        workspace_id: WS,
        ai: { loai: 'agent', ai: aiAgent('worker', { agent_id: AG.wk }), token_bam: null },
        han_ms: 30_000,
      });
      expect(v.luot_giao).toHaveLength(1);
      expect(v.het_gio).toBe(false);
      expect(gate.soDangCho()).toBe(0);
    });
  });

  /*
   * `choViec` đăng ký waiter **trước** khi đọc D1, nên một lỗi D1 ở lần đọc đó
   * phải vẫn dọn sổ. Ca này phá đúng bảng mà `viecCuaToi` đọc (`hoat_dong`, câu
   * hỏi chờ trả lời) nhưng `phienMoMinhGiao` **không** đọc, nên vòng sau đăng ký
   * được waiter rồi mới ném — đúng cửa sổ mà `finally` canh.
   */
  it('`viecCuaToi` NÉM LỖI sau khi đã đăng ký waiter → sổ waiter vẫn sạch', async () => {
    await runInDurableObject(cuaGhiCua(env, WS), async (gate: WorkspaceGate) => {
      const cho = gate.choViec({
        workspace_id: WS,
        ai: { loai: 'agent', ai: aiAgent('worker', { agent_id: AG.wk }), token_bam: null },
        han_ms: 30_000,
      });
      await choVaoSoCua(gate, 1);
      // Waiter vào sổ TRƯỚC lần đọc đầu; chừa lần đọc đó xong rồi mới phá bảng.
      await nghi(50);

      await env.DB.exec('DROP TABLE phien_hoat_dong');
      expect(gate.danhThuc(`agent:${AG.wk}`)).toBe(1);

      await expect(cho).rejects.toThrow();
      expect(gate.soDangCho()).toBe(0);
      // Không còn xác nào để gọi dậy.
      expect(gate.danhThuc(`agent:${AG.wk}`)).toBe(0);
    });
  }, 30_000);

  it(
    'qua HTTP: lỗi D1 giữa lúc chờ → 500 INTERNAL, không rò chi tiết gốc (mục 13, 15)',
    async () => {
      /*
       * Lỗi `no such table: phien_hoat_dong` là CỐ Ý, nhưng `xuLyLoi` ghi cả stack
       * ra log và người đọc log tưởng hỏng thật (BAT-52). Nuốt đúng lời gọi đó,
       * lời gọi khác vẫn qua `console.error` gốc — và đếm: phải đúng MỘT lần.
       */
      const goc = console.error.bind(console);
      let so_lan_co_y = 0;
      const nghe = vi.spyOn(console, 'error').mockImplementation((...doi: unknown[]) => {
        if (doi.some((d) => String(d).includes('phien_hoat_dong'))) {
          so_lan_co_y++;
          return;
        }
        goc(...doi);
      });
      try {
        const dang_cho = tasks(TOKEN.wk, '?wait=20');
        await choVaoSo(1);

        await env.DB.exec('DROP TABLE phien_hoat_dong');
        // Khoá `agent:<tôi>` do một lệnh ghi **không** đụng `hoat_dong` phát ra.
        const sua = await goiApi(`/v1/agent/${AG.wk}`, TOKEN_CHU, {
          method: 'PATCH',
          than: { ten: 'W-builder đổi tên' },
        });
        expect(sua.status).toBe(200);

        const res = await dang_cho;
        expect(res.status).toBe(500);
        const than_loi = await res.text();
        expect(than_loi).toContain('INTERNAL');
        expect(than_loi).not.toContain('phien_hoat_dong');
        expect(than_loi).not.toContain('SQLITE');
        expect(await soDangCho()).toBe(0);
        expect(so_lan_co_y).toBe(1);
      } finally {
        nghe.mockRestore();
      }
    },
    40_000,
  );

  it(
    'sau một lệnh chờ hết giờ qua HTTP, sổ waiter sạch',
    async () => {
      await tasks(TOKEN.wk, '?wait=1');
      expect(await soDangCho()).toBe(0);
    },
    30_000,
  );

  it(
    'nhiều lệnh chờ song song: mỗi cái một waiter, tỉnh đúng cái của mình',
    async () => {
      const a = tasks(TOKEN.wk, '?wait=30');
      const b = tasks(TOKEN.wk2, '?wait=2');
      await choVaoSo(2);

      const giao = await goiApi(`/v1/ticket/${TK}/luot-giao`, TOKEN.mgr, {
        method: 'POST',
        than: { nguoi_nhan_agent_id: AG.wk },
      });
      expect(giao.status).toBe(201);

      const va = await than(await a);
      expect(va.luot_giao).toHaveLength(1);
      const vb = await than(await b);
      expect(vb.het_gio).toBe(true);
      expect(await soDangCho()).toBe(0);
    },
    40_000,
  );

  it(
    'lệnh chờ KHÔNG chặn hàng đợi ghi của cửa ghi (một DO cho cả workspace)',
    async () => {
      const dang_cho = tasks(TOKEN.wk2, '?wait=3');
      await choVaoSo(1);

      // Ba lệnh ghi vẫn chạy bình thường trong lúc có người đang treo.
      for (const nhan of ['a', 'b', 'c']) {
        const res = await goiApi(`/v1/ticket/${TK}/nhan`, TOKEN.mgr, {
          method: 'POST',
          than: { nhan, gan: true },
        });
        expect(res.status).toBe(200);
      }
      expect((await than(await dang_cho)).het_gio).toBe(true);
    },
    40_000,
  );
});

/* ================================================================== *
 * Chủ gọi `tasks`
 * ================================================================== */
describe('chủ gọi đường kéo việc', () => {
  it('chủ không có lượt giao nào của mình, nhưng thấy câu hỏi chờ mình trả lời (19.6)', async () => {
    await dungLuotGiao('lg-1', TK, AG.wk, { trang_thai: 'in_progress' });
    await dungPhien('ph-1', 'lg-1');
    expect((await goiApi('/v1/phien/ph-1/hoat-dong', TOKEN.wk, {
      method: 'POST',
      than: { loai: 'question', noi_dung: 'Chủ chọn giúp?' },
    })).status).toBe(201);

    const v = await than(await tasks(TOKEN_CHU, '?wait=30'));
    expect(v.luot_giao).toEqual([]);
    expect(v.cau_hoi).toHaveLength(1);
    expect(v.co_viec).toBe(true);
  });

  it(
    'chủ đang chờ mà agent gửi câu hỏi → tỉnh ngay',
    async () => {
      await dungLuotGiao('lg-1', TK, AG.wk, { trang_thai: 'in_progress' });
      await dungPhien('ph-1', 'lg-1');

      const t0 = Date.now();
      const dang_cho = tasks(TOKEN_CHU, '?wait=30');
      await choVaoSo(1);

      expect((await goiApi('/v1/phien/ph-1/hoat-dong', TOKEN.wk, {
        method: 'POST',
        than: { loai: 'question', noi_dung: 'Chủ chọn giúp?' },
      })).status).toBe(201);

      const v = await than(await dang_cho);
      expect(Date.now() - t0).toBeLessThan(5_000);
      expect(v.cau_hoi).toHaveLength(1);
    },
    40_000,
  );
});
