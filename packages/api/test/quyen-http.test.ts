/**
 * **Bảng quyền SPEC mục 3 — thực thi trên ĐƯỜNG HTTP THẬT.**
 *
 * `quyen.test.ts` đã phủ 36 ô ở **tầng module thuần** (`quyen()`): giá trị từng ô
 * đúng chữ SPEC, và hành vi cho phép/từ chối đúng theo bối cảnh. Khoảng trống mà
 * file này lấp: **ô đúng trong bảng dữ liệu mà handler quên gọi `batBuocQuyen`,
 * hoặc gọi với bối cảnh sai, thì tầng thuần vẫn xanh**. Chỉ một request thật đi
 * từ token tới DB mới thấy.
 *
 * Bảng ca thử dưới đây **sinh theo dữ liệu** và có test canh phủ **đúng 36 ô**
 * (9 hàng × 4 vai trò), không thiếu không trùng — thiếu một ô là test đỏ, không
 * phải im lặng.
 *
 * Ô nào phần 1 **chưa có đường HTTP** (giao việc, nộp bằng chứng, ghi review, mục
 * Cần Chủ, Nhật ký quyết định — phần 2/3/4) thì khai `hoan` kèm lý do, và vẫn
 * được phủ ở `quyen.test.ts`.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  BANG_QUYEN_MAC_DINH,
  VIEC_KHONG_BAO_GIO,
  VIEC_QUYEN,
  type PhamViQuyen,
  type VaiTroAgent,
  type ViecQuyen,
} from '@baton/shared';
import { SO_DANG_KY_HANDLER, type Lenh, type LoaiLenh } from '../src/lenh.js';
import { goiLenh } from '../src/workspace-gate.js';
import {
  TOKEN_CHU,
  WS,
  aiAgent,
  choVaoDuAn,
  dungAgentCoToken,
  dungBangChung,
  dungBinhLuan,
  dungDuAn,
  dungLuotGiao,
  dungPhien,
  dungTicket,
  dungWorkspace,
  goiApi,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

/* ------------------------------------------------------------------ *
 * Môi trường: ba dự án để phân biệt ba mức phạm vi của bảng SPEC
 * ------------------------------------------------------------------ *
 *   pj-SAI — agent được vào **và** `ag-mgr` là agent quản lý
 *   pj-TWO — agent được vào, **không ai** quản lý
 *   pj-OUT — agent **không** được vào
 */
const P_QL = 'pj-SAI';
const P_VAO = 'pj-TWO';
const P_NGOAI = 'pj-OUT';

const TK_QL = 'tk-pj-SAI-1';
const TK_VAO = 'tk-pj-TWO-1';
const TK_NGOAI = 'tk-pj-OUT-1';

const CM_CHU = 'cm-cua-chu';

const VAI_TRO: readonly VaiTroAgent[] = ['coordinator', 'manager', 'worker', 'reviewer'];

/** Token của agent **đang bật**, theo vai trò. */
const TOKEN: Record<VaiTroAgent, string> = {
  coordinator: 'bt_q_coordinator',
  manager: 'bt_q_manager',
  worker: 'bt_q_worker',
  reviewer: 'bt_q_reviewer',
};

/** Token của agent **đã bị chủ tắt** (`disabled`), theo vai trò — SPEC mục 3. */
const TOKEN_TAT: Record<VaiTroAgent, string> = {
  coordinator: 'bt_q_coordinator_tat',
  manager: 'bt_q_manager_tat',
  worker: 'bt_q_worker_tat',
  reviewer: 'bt_q_reviewer_tat',
};

const ID_AGENT: Record<VaiTroAgent, string> = {
  coordinator: 'ag-coord',
  manager: 'ag-mgr',
  worker: 'ag-wk',
  reviewer: 'ag-rv',
};

beforeEach(async () => {
  await dungWorkspace();

  // Agent trước dự án: `project.quan_ly_agent_id` tham chiếu `agent(id)`.
  for (const vai_tro of VAI_TRO) {
    await dungAgentCoToken({
      id: ID_AGENT[vai_tro],
      ten: `A-${vai_tro}`,
      vai_tro,
      token: TOKEN[vai_tro],
    });
    await dungAgentCoToken({
      id: `${ID_AGENT[vai_tro]}-tat`,
      ten: `A-${vai_tro}-tat`,
      vai_tro,
      token: TOKEN_TAT[vai_tro],
      disabled: true,
      // Cho vào **tất cả** dự án: nếu bị từ chối thì phải vì `disabled`, không
      // phải vì cửa dự án.
      vao_tat_ca_du_an: true,
    });
  }

  await dungDuAn('SAI', 'Sample', 'active', ID_AGENT.manager);
  await dungDuAn('TWO', 'Dự án thứ hai', 'active');
  await dungDuAn('OUT', 'Dự án ngoài phạm vi', 'active');

  for (const vai_tro of VAI_TRO) {
    await choVaoDuAn(ID_AGENT[vai_tro], P_QL);
    await choVaoDuAn(ID_AGENT[vai_tro], P_VAO);
  }

  await dungTicket(P_QL, 1, 'Việc trong dự án mình quản lý');
  await dungTicket(P_VAO, 1, 'Việc trong dự án được vào');
  await dungTicket(P_NGOAI, 1, 'Việc ngoài phạm vi');
  await dungBinhLuan(CM_CHU, TK_QL, 'Bình luận của chủ');

  /*
   * **Một lượt giao đang mở của `ag-wk` trên `TK_QL`** — phần 2 (SPEC mục 5).
   *
   * Phần 1 không có dòng này nên `phamViLuotGiao` luôn trả `false`, và hai ô
   * "ticket của lượt mình" / "ticket con của lượt mình đang làm" của bảng quyền
   * (SPEC mục 3) không có ca ĐẠT nào qua HTTP. Nay có: `TK_QL` là ticket của lượt
   * worker đang cầm, còn `TK_VAO` thì không — nên hai ô đó có cả ca đạt lẫn ca
   * ngoài phạm vi, trong cùng một dự án mà worker được vào.
   */
  await dungLuotGiao('lg-cua-wk', TK_QL, ID_AGENT.worker, { trang_thai: 'in_progress' });
});

/* ------------------------------------------------------------------ *
 * Hình dạng một ca thử qua HTTP
 * ------------------------------------------------------------------ */

interface CaHttp {
  ten: string;
  goi: () => Promise<Response>;
  /** Mã HTTP mong đợi. */
  http: number;
  /** Mã lỗi mong đợi với ca bị từ chối. */
  ma?: 'FORBIDDEN' | 'NOT_FOUND';
}

interface OHttp {
  /** Chữ của hàng trong bảng SPEC mục 3. */
  hang: string;
  viec: ViecQuyen;
  vai_tro: VaiTroAgent;
  /** Ô theo đúng chữ SPEC — so lại với `BANG_QUYEN_MAC_DINH`. */
  o: PhamViQuyen;
  /** Ca ĐẠT qua HTTP. Ô "—"/"không bao giờ" không có ca nào. */
  dat?: CaHttp[];
  /** Ca BỊ TỪ CHỐI qua HTTP. */
  tu_choi?: CaHttp[];
  /** Vì sao ô này chỉ phủ được ở tầng thuần (`quyen.test.ts`). */
  hoan?: string;
}

/* --- Giúp việc dựng ca --------------------------------------------- */

/** Tạo ticket — hàng "Tạo ticket". */
function taoTicket(vai_tro: VaiTroAgent, project_id: string, tieu_de: string, cha?: string) {
  return (): Promise<Response> =>
    goiApi('/v1/ticket', TOKEN[vai_tro], {
      method: 'POST',
      than: {
        project_id,
        tieu_de,
        ...(cha === undefined ? {} : { ticket_cha_id: cha }),
      },
    });
}

/**
 * Sửa một trường của ticket — hàng "Đổi trạng thái ticket".
 *
 * SPEC mục 3 không có hàng riêng cho "sửa trường"; cửa ghi dùng hàng gần nhất là
 * "Đổi trạng thái ticket" (`cau-hoi-spec.md` #12), nên đây đúng là đường HTTP của
 * hàng này. Chọn `PATCH` thay vì đổi trạng thái thật để luật trạng thái (cổng bằng
 * chứng, ticket con, lý do) không chen vào trước kết luận về quyền.
 */
function suaTicket(vai_tro: VaiTroAgent, ticket_id: string, tieu_de: string) {
  return (): Promise<Response> =>
    goiApi(`/v1/ticket/${ticket_id}`, TOKEN[vai_tro], { method: 'PATCH', than: { tieu_de } });
}

/** Xoá bình luận — hàng "Xoá bất cứ thứ gì" (module quyền: `delete_anything`). */
function xoaBinhLuan(vai_tro: VaiTroAgent) {
  return (): Promise<Response> =>
    goiApi(`/v1/binh-luan/${CM_CHU}/xoa`, TOKEN[vai_tro], { method: 'POST' });
}

/**
 * Một hàng của bảng SPEC mà phần 1 **chưa có đường HTTP** nào.
 *
 * `o` phải truyền vào bằng **chữ literal đọc từ SPEC mục 3** (SPEC.md dòng
 * 86–96), **không** được lấy từ `BANG_QUYEN_MAC_DINH`: lấy từ đó là so bảng với
 * chính nó, nên một ô chép sai SPEC vẫn xanh — mà canh đúng chuyện đó là lý do
 * test này tồn tại (góp ý của M-Baton sau lượt review).
 */
function hangChuaCoDuong(
  hang: string,
  viec: ViecQuyen,
  o: Record<VaiTroAgent, PhamViQuyen>,
  hoan: string,
): OHttp[] {
  return VAI_TRO.map((vai_tro) => ({ hang, viec, vai_tro, o: o[vai_tro], hoan }));
}

const TC = (ten: string, goi: () => Promise<Response>): CaHttp => ({
  ten,
  goi,
  http: 403,
  ma: 'FORBIDDEN',
});

/**
 * Ca bị từ chối vì ticket **ngoài phạm vi người gọi thấy được** — BAT-58 (19.12
 * câu 15, `cau-hoi-spec.md` #176): cửa ghi trả `NOT_FOUND` giống hệt id bịa (ghim
 * so trực tiếp ở `bat58-lo-id-ticket-bang-chung.test.ts`). Trước BAT-58 các ca này
 * là `TC` (403) — 403 cho id thật, 404 cho id bịa là một máy dò.
 */
const TC_AN = (ten: string, goi: () => Promise<Response>): CaHttp => ({
  ten,
  goi,
  http: 404,
  ma: 'NOT_FOUND',
});

/* --- Lý do hoãn, theo hàng ----------------------------------------- */

const HOAN_LUOT_GIAO =
  'Lượt giao là phần 2 (SPEC mục 19.1): phần 1 chưa có đường HTTP nào tạo lượt giao.';
const HOAN_BANG_CHUNG = 'Nộp bằng chứng là phần 3 (SPEC mục 7): chưa có đường HTTP.';
const HOAN_REVIEW = 'Ghi kết quả review là phần 2 (SPEC mục 5, 19.10): chưa có đường HTTP.';
const HOAN_CAN_CHU = 'Mục Cần Chủ là phần 4 (SPEC mục 8): chưa có đường HTTP.';
const HOAN_NHAT_KY = 'Nhật ký quyết định là phần 4 (SPEC mục 10): chưa có đường HTTP.';

/* ================================================================== *
 * 36 ô — đúng thứ tự hàng và cột của bảng SPEC mục 3
 * ================================================================== */
const O_HTTP: OHttp[] = [
  /* --- Hàng 1: Tạo ticket ----------------------------------------- */
  {
    hang: 'Tạo ticket',
    viec: 'create_ticket',
    vai_tro: 'coordinator',
    o: 'moi_du_an_duoc_vao',
    dat: [
      {
        ten: 'dự án được vào (không cần quản lý)',
        goi: taoTicket('coordinator', P_VAO, 'Coordinator tạo trong dự án được vào'),
        http: 201,
      },
    ],
    tu_choi: [
      TC(
        'dự án KHÔNG được vào → không nới thành "mọi dự án"',
        taoTicket('coordinator', P_NGOAI, 'Coordinator vượt phạm vi'),
      ),
    ],
  },
  {
    hang: 'Tạo ticket',
    viec: 'create_ticket',
    vai_tro: 'manager',
    o: 'du_an_minh_quan_ly',
    dat: [
      {
        ten: 'dự án mình quản lý',
        goi: taoTicket('manager', P_QL, 'Manager tạo trong dự án mình quản lý'),
        http: 201,
      },
    ],
    tu_choi: [
      TC(
        'dự án ĐƯỢC VÀO nhưng KHÔNG quản lý',
        taoTicket('manager', P_VAO, 'Manager tạo ngoài dự án mình quản lý'),
      ),
      TC('dự án không được vào', taoTicket('manager', P_NGOAI, 'Manager vượt phạm vi')),
    ],
  },
  {
    hang: 'Tạo ticket',
    viec: 'create_ticket',
    vai_tro: 'worker',
    o: 'ticket_con_cua_luot_minh',
    dat: [
      {
        ten: 'đang cầm lượt trên TK_QL → tạo được ticket CON của nó',
        goi: taoTicket('worker', P_QL, 'Worker tạo ticket con của lượt mình', TK_QL),
        http: 201,
      },
    ],
    tu_choi: [
      TC('không có ticket cha → không phải "ticket con"', taoTicket('worker', P_QL, 'Worker tạo ticket rời')),
      TC(
        'có ticket cha thật nhưng cha không thuộc lượt mình',
        taoTicket('worker', P_QL, 'Worker tạo ticket con giả', TK_VAO),
      ),
    ],
  },
  {
    hang: 'Tạo ticket',
    viec: 'create_ticket',
    vai_tro: 'reviewer',
    o: 'khong',
    tu_choi: [
      TC('kể cả trong dự án mình được vào', taoTicket('reviewer', P_QL, 'Reviewer tạo ticket')),
    ],
  },

  /* --- Hàng 2: Giao việc (tạo lượt giao) --------------------------- *
   * SPEC: | cho manager, worker, reviewer | cho worker, reviewer trong dự án | — | — | */
  ...hangChuaCoDuong(
    'Giao việc (tạo lượt giao)',
    'assign',
    {
      coordinator: 'cho_manager_worker_reviewer',
      manager: 'worker_reviewer_trong_du_an',
      worker: 'khong',
      reviewer: 'khong',
    },
    HOAN_LUOT_GIAO,
  ),

  /* --- Hàng 3: Đổi trạng thái ticket ------------------------------- */
  {
    hang: 'Đổi trạng thái ticket',
    viec: 'change_status',
    vai_tro: 'coordinator',
    o: 'co',
    dat: [
      {
        ten: '"có": dự án mình quản lý hay không đều được',
        goi: suaTicket('coordinator', TK_VAO, 'Coordinator sửa ticket dự án được vào'),
        http: 200,
      },
    ],
    tu_choi: [
      TC_AN(
        '"có" vẫn bị cửa dự án chặn: ticket ngoài phạm vi',
        suaTicket('coordinator', TK_NGOAI, 'Coordinator vượt phạm vi'),
      ),
    ],
  },
  {
    hang: 'Đổi trạng thái ticket',
    viec: 'change_status',
    vai_tro: 'manager',
    o: 'trong_du_an',
    dat: [
      {
        ten: 'trong dự án được vào, không cần là dự án mình quản lý',
        goi: suaTicket('manager', TK_VAO, 'Manager sửa ticket dự án được vào'),
        http: 200,
      },
    ],
    tu_choi: [
      TC_AN('ticket ngoài dự án được vào', suaTicket('manager', TK_NGOAI, 'Manager vượt phạm vi')),
    ],
  },
  {
    hang: 'Đổi trạng thái ticket',
    viec: 'change_status',
    vai_tro: 'worker',
    o: 'ticket_cua_luot_minh',
    dat: [
      {
        ten: 'ticket của lượt giao mình đang cầm',
        goi: suaTicket('worker', TK_QL, 'Worker sửa ticket của lượt mình'),
        http: 200,
      },
    ],
    tu_choi: [
      TC(
        'ticket có thật trong dự án mình được vào, nhưng không thuộc lượt mình',
        suaTicket('worker', TK_VAO, 'Worker sửa ticket của người khác'),
      ),
    ],
  },
  {
    hang: 'Đổi trạng thái ticket',
    viec: 'change_status',
    vai_tro: 'reviewer',
    o: 'khong',
    tu_choi: [
      TC('kể cả ticket trong dự án mình được vào', suaTicket('reviewer', TK_QL, 'Reviewer sửa ticket')),
    ],
  },

  /* --- Hàng 4: Nộp bằng chứng -------------------------------------- *
   * SPEC: | có | có | có | có | */
  ...hangChuaCoDuong(
    'Nộp bằng chứng',
    'submit_evidence',
    { coordinator: 'co', manager: 'co', worker: 'co', reviewer: 'co' },
    HOAN_BANG_CHUNG,
  ),

  /* --- Hàng 5: Ghi kết quả review ---------------------------------- *
   * SPEC: | — | — | — | có |, và ô `manager` nới thành "trong dự án" ngày 13/10
   * (migration 0022 khối B, `quyet-dinh.md`): reviewer thật là sub-agent **không
   * có token Baton**, nên trước đó không ai mở được điều kiện phụ của cổng
   * (d.215). Luật thêm của ca đó (bắt buộc kèm đường dẫn báo cáo reviewer) có ca
   * riêng trong `gui-bang-chung.test.ts`. */
  ...hangChuaCoDuong(
    'Ghi kết quả review',
    'write_review',
    { coordinator: 'co', manager: 'trong_du_an', worker: 'khong', reviewer: 'co' },
    HOAN_REVIEW,
  ),

  /* --- Hàng 6: Tạo mục Cần Chủ ------------------------------------- *
   * SPEC: | có | có | — | — | */
  ...hangChuaCoDuong(
    'Tạo mục Cần Chủ',
    'create_ask',
    { coordinator: 'co', manager: 'co', worker: 'khong', reviewer: 'khong' },
    HOAN_CAN_CHU,
  ),

  /* --- Hàng 7: Ghi Nhật ký quyết định ------------------------------ *
   * SPEC: | có | có | — | — | */
  ...hangChuaCoDuong(
    'Ghi Nhật ký quyết định',
    'write_decision',
    { coordinator: 'co', manager: 'co', worker: 'khong', reviewer: 'khong' },
    HOAN_NHAT_KY,
  ),

  /* --- Hàng 8: Xoá bất cứ thứ gì — KHÔNG BAO GIỜ ------------------- */
  ...VAI_TRO.map(
    (vai_tro): OHttp => ({
      hang: 'Xoá bất cứ thứ gì',
      viec: 'delete_anything',
      vai_tro,
      o: 'khong_bao_gio',
      tu_choi: [TC('xoá bình luận: không bao giờ', xoaBinhLuan(vai_tro))],
    }),
  ),

  /* --- Hàng 9: Quyết mục Cần Chủ — KHÔNG BAO GIỜ ------------------- */
  ...VAI_TRO.map(
    (vai_tro): OHttp => ({
      hang: 'Quyết mục Cần Chủ',
      viec: 'resolve_ask',
      vai_tro,
      o: 'khong_bao_gio',
      hoan: HOAN_CAN_CHU,
    }),
  ),
];

/* ================================================================== *
 * Bảng ca thử phải phủ ĐÚNG 36 ô
 * ================================================================== */
describe('bảng ca thử HTTP phủ đúng bảng quyền SPEC mục 3', () => {
  it('đúng 36 ô = 9 hàng × 4 vai trò, không ô nào khai hai lần', () => {
    expect(O_HTTP).toHaveLength(36);
    const khoa = O_HTTP.map((o) => `${o.viec}/${o.vai_tro}`);
    expect(new Set(khoa).size).toBe(36);

    const mong_doi: string[] = [];
    for (const viec of Object.keys(VIEC_QUYEN)) {
      for (const vai_tro of VAI_TRO) mong_doi.push(`${viec}/${vai_tro}`);
    }
    expect([...khoa].sort()).toEqual([...mong_doi].sort());
  });

  it('giá trị ô khai trong bảng ca thử khớp `BANG_QUYEN_MAC_DINH`', () => {
    for (const o of O_HTTP) {
      expect(BANG_QUYEN_MAC_DINH[o.viec][o.vai_tro], `${o.viec}/${o.vai_tro}`).toBe(o.o);
    }
  });

  it('ô không có ca HTTP nào đều phải ghi LÝ DO hoãn (không hoãn im lặng)', () => {
    for (const o of O_HTTP) {
      const so_ca = (o.dat?.length ?? 0) + (o.tu_choi?.length ?? 0);
      if (so_ca === 0) {
        expect(o.hoan, `${o.viec}/${o.vai_tro} không có ca nào mà cũng không ghi lý do`).toBeTruthy();
        expect((o.hoan ?? '').length).toBeGreaterThan(20);
      }
    }
  });

  it('ô "—"/"không bao giờ" không bao giờ có ca ĐẠT', () => {
    for (const o of O_HTTP) {
      if (o.o === 'khong' || o.o === 'khong_bao_gio') {
        expect(o.dat ?? [], `${o.viec}/${o.vai_tro}`).toHaveLength(0);
      }
    }
  });

  it('ô có ca ĐẠT thì phải có ca BỊ TỪ CHỐI đi kèm (không nới lỏng phạm vi)', () => {
    for (const o of O_HTTP) {
      if ((o.dat?.length ?? 0) > 0) {
        expect((o.tu_choi ?? []).length, `${o.viec}/${o.vai_tro} thiếu ca ngoài phạm vi`).toBeGreaterThan(0);
      }
    }
  });

  it('ô có phạm vi mà chưa có ca ĐẠT qua HTTP thì phải ghi lý do hoãn', () => {
    for (const o of O_HTTP) {
      const co_pham_vi = o.o !== 'khong' && o.o !== 'khong_bao_gio';
      if (co_pham_vi && (o.dat?.length ?? 0) === 0) {
        expect(o.hoan, `${o.viec}/${o.vai_tro}`).toBeTruthy();
      }
    }
  });

  it('cả ba hàng có đường HTTP ở phần 1 đều được phủ đủ 4 vai trò', () => {
    // Nếu một hàng mất đường HTTP (route bị đổi tên, handler bị gỡ) thì con số này
    // tụt và test đỏ, chứ không âm thầm thành "phủ ở tầng thuần".
    const co_http = new Set(
      O_HTTP.filter((o) => (o.dat?.length ?? 0) + (o.tu_choi?.length ?? 0) > 0).map((o) => o.viec),
    );
    expect([...co_http].sort()).toEqual(['change_status', 'create_ticket', 'delete_anything']);
    for (const viec of co_http) {
      expect(O_HTTP.filter((o) => o.viec === viec), viec).toHaveLength(4);
    }
  });
});

/* ================================================================== *
 * Thực thi từng ca qua HTTP
 * ================================================================== */
describe('SPEC mục 3 — ca ĐẠT qua HTTP thật', () => {
  for (const o of O_HTTP) {
    for (const ca of o.dat ?? []) {
      it(`ĐẠT: "${o.hang}" × ${o.vai_tro} (ô "${o.o}") — ${ca.ten}`, async () => {
        const res = await ca.goi();
        expect(res.status, JSON.stringify(await res.json())).toBe(ca.http);
      });
    }
  }
});

describe('SPEC mục 3 — ca BỊ TỪ CHỐI qua HTTP thật', () => {
  for (const o of O_HTTP) {
    for (const ca of o.tu_choi ?? []) {
      it(`TỪ CHỐI: "${o.hang}" × ${o.vai_tro} (ô "${o.o}") — ${ca.ten}`, async () => {
        const res = await ca.goi();
        expect(res.status).toBe(ca.http);
        expect(await res.json()).toMatchObject({ error: ca.ma ?? 'FORBIDDEN' });
      });
    }
  }
});

/* ================================================================== *
 * Đối chứng: chủ làm được những việc agent bị từ chối
 * ================================================================== *
 * Không có mục này thì mọi 403 ở trên cũng xanh khi một chỗ nào đó khoá cứng toàn
 * bộ đường ghi — tức là test không còn nói gì về bảng quyền.
 */
describe('đối chứng: chủ không bị bảng quyền của agent chặn', () => {
  it('chủ tạo được ticket trong dự án agent không được vào', async () => {
    const res = await goiApi('/v1/ticket', TOKEN_CHU, {
      method: 'POST',
      than: { project_id: P_NGOAI, tieu_de: 'Chủ tạo ở dự án nào cũng được' },
    });
    expect(res.status).toBe(201);
  });

  it('chủ xoá được bình luận (hàng "Xoá bất cứ thứ gì" là luật cho AGENT)', async () => {
    const res = await goiApi(`/v1/binh-luan/${CM_CHU}/xoa`, TOKEN_CHU, { method: 'POST' });
    expect(res.status).toBe(200);
  });
});

/* ================================================================== *
 * Đọc ngoài phạm vi → NOT_FOUND / 404 (không FORBIDDEN)
 * ================================================================== *
 * `quyet-dinh.md`: ngoài phạm vi thì ĐỌC trả `NOT_FOUND`/404 (không lộ sự tồn
 * tại), GHI trả `FORBIDDEN`/403. Hai mã khác nhau cho cùng một đối tượng là một
 * máy trả lời cho câu "thứ này có thật không", nên đường đọc phải đóng kín.
 */
describe('đường ĐỌC ngoài phạm vi trả 404, đường GHI trả 403', () => {
  it.each(VAI_TRO)('%s: GET ticket ngoài phạm vi → 404 NOT_FOUND', async (vai_tro) => {
    const res = await goiApi(`/v1/ticket/${TK_NGOAI}`, TOKEN[vai_tro]);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it.each(VAI_TRO)('%s: GET dự án ngoài phạm vi → 404 NOT_FOUND', async (vai_tro) => {
    const res = await goiApi(`/v1/du-an/${P_NGOAI}`, TOKEN[vai_tro]);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'NOT_FOUND' });
  });

  it('ticket không tồn tại và ticket ngoài phạm vi trả CÙNG một thân lỗi', async () => {
    const ngoai = await goiApi(`/v1/ticket/${TK_NGOAI}`, TOKEN.coordinator);
    const khong_co = await goiApi('/v1/ticket/tk-khong-bao-gio-co', TOKEN.coordinator);
    expect(ngoai.status).toBe(khong_co.status);
    expect(await ngoai.json()).toEqual(await khong_co.json());
  });
});

/* ================================================================== *
 * Hai hàng "không bao giờ" — ba tầng hàng rào
 * ================================================================== */
describe('SPEC mục 3 — hai hàng "không bao giờ": chủ KHÔNG ghi đè được, cả 3 tầng', () => {
  it('hai hàng đó đúng là "Xoá bất cứ thứ gì" và "Quyết mục Cần Chủ"', () => {
    expect([...VIEC_KHONG_BAO_GIO]).toEqual(['delete_anything', 'resolve_ask']);
    for (const viec of VIEC_KHONG_BAO_GIO) {
      for (const vai_tro of VAI_TRO) {
        expect(BANG_QUYEN_MAC_DINH[viec][vai_tro], `${viec}/${vai_tro}`).toBe('khong_bao_gio');
      }
    }
  });

  /* --- Tầng 1: code `dat_quyen` ----------------------------------- */
  it('tầng 1 (code): chủ PUT quyền cho hàng "không bao giờ" → 403, với mọi vai trò', async () => {
    for (const viec of VIEC_KHONG_BAO_GIO) {
      for (const vai_tro of VAI_TRO) {
        const res = await goiApi(`/v1/agent/${ID_AGENT[vai_tro]}/quyen/${viec}`, TOKEN_CHU, {
          method: 'PUT',
          than: { cho_phep: true, pham_vi: 'co' },
        });
        expect(res.status, `${viec}/${vai_tro}`).toBe(403);
        expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
      }
    }
    // Và không dòng ghi đè nào lọt vào DB.
    const d = await env.DB.prepare(
      "SELECT count(*) AS n FROM agent_permission WHERE viec IN ('delete_anything','resolve_ask')",
    ).first<{ n: number }>();
    expect(d?.n).toBe(0);
  });

  /* --- Tầng 3: CHECK của DB --------------------------------------- */
  it('tầng 3 (DB): INSERT thẳng `agent_permission` cho hàng đó bị CHECK chặn', async () => {
    for (const viec of VIEC_KHONG_BAO_GIO) {
      await expect(
        env.DB.prepare(
          `INSERT INTO agent_permission (workspace_id, agent_id, viec, cho_phep, pham_vi, cap_nhat_luc)
           VALUES (?, ?, ?, 1, 'co', ?)`,
        )
          .bind(WS, ID_AGENT.coordinator, viec, Date.now())
          .run(),
        viec,
      ).rejects.toThrow();
    }
  });

  /* --- Tầng 2: module quyền, qua HTTP ----------------------------- */
  it('tầng 2 (module quyền): kể cả khi có dòng ghi đè "cho phép" trong DB, agent vẫn 403', async () => {
    /*
     * CHECK của DB chặn `viec = 'delete_anything'`, nên không dựng được dòng đó
     * bằng tay. Mô phỏng "bug ở tầng dữ liệu" bằng cách bật **mọi ô ghi đè được**
     * cho agent, ở phạm vi rộng nhất: nếu module quyền có đường nào suy ra
     * `delete_anything` từ một ô khác thì nó sẽ lộ ở đây.
     */
    for (const viec of ['create_ticket', 'change_status', 'submit_evidence', 'write_review', 'create_ask', 'write_decision'] as const) {
      await goiApi(`/v1/agent/${ID_AGENT.coordinator}/quyen/${viec}`, TOKEN_CHU, {
        method: 'PUT',
        than: { cho_phep: true, pham_vi: 'co' },
      });
    }
    const res = await goiApi(`/v1/binh-luan/${CM_CHU}/xoa`, TOKEN.coordinator, { method: 'POST' });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('`whoami` của agent luôn báo hai hàng đó là "khong_bao_gio"', async () => {
    for (const vai_tro of VAI_TRO) {
      const res = await goiApi('/v1/whoami', TOKEN[vai_tro]);
      const than = await res.json<{ quyen: Record<string, string> }>();
      expect(than.quyen['delete_anything'], vai_tro).toBe('khong_bao_gio');
      expect(than.quyen['resolve_ask'], vai_tro).toBe('khong_bao_gio');
    }
  });
});

/* ================================================================== *
 * Chủ ghi đè từng ô — cả hai hướng, qua HTTP
 * ================================================================== */
describe('SPEC mục 3 — chủ chỉnh từng ô cho từng agent (qua HTTP)', () => {
  it('SIẾT: tắt ô "Đổi trạng thái" của coordinator → đường vừa 200 thành 403', async () => {
    const truoc = await suaTicket('coordinator', TK_VAO, 'Trước khi siết')();
    expect(truoc.status).toBe(200);

    const dat = await goiApi(`/v1/agent/${ID_AGENT.coordinator}/quyen/change_status`, TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: false },
    });
    expect(dat.status).toBe(200);

    const sau = await suaTicket('coordinator', TK_VAO, 'Sau khi siết')();
    expect(sau.status).toBe(403);
    expect(await sau.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('SIẾT PHẠM VI: coordinator "mọi dự án được vào" → "dự án mình quản lý"', async () => {
    // Coordinator này không quản lý dự án nào, nên siết xong là không tạo được gì.
    await goiApi(`/v1/agent/${ID_AGENT.coordinator}/quyen/create_ticket`, TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'du_an_minh_quan_ly' },
    });
    const res = await taoTicket('coordinator', P_VAO, 'Coordinator bị siết phạm vi')();
    expect(res.status).toBe(403);
  });

  it('MỞ: bật ô "Tạo ticket" cho reviewer (vốn "—") → 201', async () => {
    const truoc = await taoTicket('reviewer', P_QL, 'Reviewer trước khi được mở')();
    expect(truoc.status).toBe(403);

    await goiApi(`/v1/agent/${ID_AGENT.reviewer}/quyen/create_ticket`, TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });

    const sau = await taoTicket('reviewer', P_QL, 'Reviewer sau khi được mở')();
    expect(sau.status).toBe(201);
  });

  it('MỞ nhưng KHÔNG nới cửa dự án: reviewer được mở vẫn không vào được pj-OUT', async () => {
    await goiApi(`/v1/agent/${ID_AGENT.reviewer}/quyen/create_ticket`, TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });
    const res = await taoTicket('reviewer', P_NGOAI, 'Reviewer vượt cửa dự án')();
    expect(res.status).toBe(403);
  });

  it('ghi đè là của TỪNG agent: agent cùng vai trò khác vẫn giữ mặc định', async () => {
    await dungAgentCoToken({
      id: 'ag-rv-2',
      ten: 'A-reviewer-2',
      vai_tro: 'reviewer',
      token: 'bt_q_reviewer_2',
    });
    await choVaoDuAn('ag-rv-2', P_QL);

    await goiApi(`/v1/agent/${ID_AGENT.reviewer}/quyen/create_ticket`, TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });

    expect((await taoTicket('reviewer', P_QL, 'Reviewer được mở')()).status).toBe(201);
    const khac = await goiApi('/v1/ticket', 'bt_q_reviewer_2', {
      method: 'POST',
      than: { project_id: P_QL, tieu_de: 'Reviewer khác, không được mở' },
    });
    expect(khac.status).toBe(403);
  });

  it('BỎ ghi đè (gửi thiếu `cho_phep`) trả ô về mặc định của vai trò', async () => {
    await goiApi(`/v1/agent/${ID_AGENT.reviewer}/quyen/create_ticket`, TOKEN_CHU, {
      method: 'PUT',
      than: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' },
    });
    expect((await taoTicket('reviewer', P_QL, 'Mở rồi')()).status).toBe(201);

    await goiApi(`/v1/agent/${ID_AGENT.reviewer}/quyen/create_ticket`, TOKEN_CHU, {
      method: 'PUT',
      than: {},
    });
    expect((await taoTicket('reviewer', P_QL, 'Bỏ ghi đè rồi')()).status).toBe(403);
  });
});

/* ================================================================== *
 * Agent `disabled` — SPEC mục 3 "gọi API sẽ bị từ chối"
 * ================================================================== */
describe('SPEC mục 3 — agent `disabled` bị từ chối MỌI đường', () => {
  /** Mọi đường của API phần 1, cả đọc và ghi. */
  const MOI_DUONG: { ten: string; duong: string; method: string; than?: unknown }[] = [
    { ten: 'GET /v1/whoami', duong: '/v1/whoami', method: 'GET' },
    { ten: 'GET /v1/du-an', duong: '/v1/du-an', method: 'GET' },
    { ten: 'GET /v1/du-an/:id', duong: `/v1/du-an/${P_QL}`, method: 'GET' },
    { ten: 'POST /v1/du-an', duong: '/v1/du-an', method: 'POST', than: { ten: 'X', ma: 'ZZZ' } },
    { ten: 'PATCH /v1/du-an/:id', duong: `/v1/du-an/${P_QL}`, method: 'PATCH', than: { ten: 'Y' } },
    { ten: 'GET /v1/agent', duong: '/v1/agent', method: 'GET' },
    { ten: 'GET /v1/agent/:id', duong: '/v1/agent/ag-wk', method: 'GET' },
    { ten: 'POST /v1/agent', duong: '/v1/agent', method: 'POST', than: { ten: 'A', vai_tro: 'worker' } },
    { ten: 'PATCH /v1/agent/:id', duong: '/v1/agent/ag-wk', method: 'PATCH', than: { mo_ta: 'm' } },
    { ten: 'POST /v1/agent/:id/token', duong: '/v1/agent/ag-wk/token', method: 'POST' },
    {
      ten: 'POST /v1/agent/:id/token/thu-hoi',
      duong: '/v1/agent/ag-wk/token/thu-hoi',
      method: 'POST',
    },
    {
      ten: 'PUT /v1/agent/:id/quyen/:viec',
      duong: '/v1/agent/ag-wk/quyen/create_ticket',
      method: 'PUT',
      than: { cho_phep: true },
    },
    { ten: 'GET /v1/ticket', duong: '/v1/ticket', method: 'GET' },
    { ten: 'GET /v1/ticket/:id', duong: `/v1/ticket/${TK_QL}`, method: 'GET' },
    { ten: 'GET /v1/ticket/:id/lich-su', duong: `/v1/ticket/${TK_QL}/lich-su`, method: 'GET' },
    { ten: 'GET /v1/ticket/:id/binh-luan', duong: `/v1/ticket/${TK_QL}/binh-luan`, method: 'GET' },
    {
      ten: 'POST /v1/ticket',
      duong: '/v1/ticket',
      method: 'POST',
      than: { project_id: P_QL, tieu_de: 'T' },
    },
    { ten: 'PATCH /v1/ticket/:id', duong: `/v1/ticket/${TK_QL}`, method: 'PATCH', than: { tieu_de: 'T' } },
    {
      ten: 'POST /v1/ticket/:id/trang-thai',
      duong: `/v1/ticket/${TK_QL}/trang-thai`,
      method: 'POST',
      than: { trang_thai: 'in_progress' },
    },
    {
      ten: 'POST /v1/ticket/:id/toi-lam',
      duong: `/v1/ticket/${TK_QL}/toi-lam`,
      method: 'POST',
      than: { bat: true },
    },
    {
      ten: 'POST /v1/ticket/:id/nhan',
      duong: `/v1/ticket/${TK_QL}/nhan`,
      method: 'POST',
      than: { nhan: 'khan', gan: true },
    },
    {
      ten: 'POST /v1/ticket/:id/lien-ket',
      duong: `/v1/ticket/${TK_QL}/lien-ket`,
      method: 'POST',
      than: { den_ticket_id: TK_VAO, loai_lien_ket: 'related' },
    },
    { ten: 'POST /v1/ticket/:id/xoa', duong: `/v1/ticket/${TK_QL}/xoa`, method: 'POST' },
    { ten: 'POST /v1/ticket/:id/khoi-phuc', duong: `/v1/ticket/${TK_QL}/khoi-phuc`, method: 'POST' },
    {
      ten: 'POST /v1/ticket/:id/binh-luan',
      duong: `/v1/ticket/${TK_QL}/binh-luan`,
      method: 'POST',
      than: { noi_dung: 'xin chào' },
    },
    {
      ten: 'PATCH /v1/binh-luan/:id',
      duong: `/v1/binh-luan/${CM_CHU}`,
      method: 'PATCH',
      than: { noi_dung: 'sửa' },
    },
    { ten: 'POST /v1/binh-luan/:id/xoa', duong: `/v1/binh-luan/${CM_CHU}/xoa`, method: 'POST' },
  ];

  const CA: { ten: string; vai_tro: VaiTroAgent; duong: string; method: string; than?: unknown }[] =
    VAI_TRO.flatMap((vai_tro) =>
      MOI_DUONG.map((d) => ({ ...d, vai_tro, ten: `${vai_tro} · ${d.ten}` })),
    );

  it.each(CA)('$ten → 403 FORBIDDEN', async (ca) => {
    const res = await goiApi(ca.duong, TOKEN_TAT[ca.vai_tro], {
      method: ca.method,
      ...(ca.than === undefined ? {} : { than: ca.than }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('cùng đường đó với agent ĐANG BẬT không phải lúc nào cũng 403 (đối chứng)', async () => {
    const res = await goiApi('/v1/whoami', TOKEN.coordinator);
    expect(res.status).toBe(200);
  });
});

/* ================================================================== *
 * Không lệnh ghi nào bỏ qua chặng kiểm quyền
 * ================================================================== *
 * Đi qua **sổ đăng ký** `SO_DANG_KY_HANDLER`, không qua danh sách route: một lệnh
 * ghi chưa có route hôm nay vẫn là một lệnh ghi, và ngày nó có route thì không ai
 * nhớ quay lại thêm chặng kiểm quyền.
 *
 * Lượt 4 tìm ra đúng hai chỗ như vậy: `cap_so_ticket` và `cap_so_can_chu` tăng bộ
 * đếm (số **không tái dùng** — SPEC mục 4, 8) mà không kiểm gì. Đã sửa trong
 * `lenh-ticket.ts`; test này là thứ canh để không tái phát.
 */
describe('mọi lệnh ghi trong SO_DANG_KY_HANDLER đều từ chối agent `disabled`', () => {
  const CM_WK = 'cm-cua-worker';
  /** Lượt giao `pending` **của chính agent worker**, cho lệnh `nhan_luot_giao`. */
  const LG_WK = 'lg-cua-worker';
  /**
   * Lượt `review` đã nộp, **do chính agent worker giao** — cho ba lệnh của người
   * giao (`nghiem_thu`, `huy_luot`, `tao_ticket_viec_phat_sinh`). Người giao mặc
   * định của `dungLuotGiao` là **chủ**, mà lúc đó agent bị chặn vì "không phải
   * người giao" chứ không phải vì `disabled`, nên ca này sẽ không nói gì.
   */
  const LG_MINH_GIAO = 'lg-worker-di-giao';
  /** Phiên của `LG_WK` — cho `heartbeat` và `dung_phien` (SPEC mục 6). */
  const PH_WK = 'ph-cua-worker';
  /** Bằng chứng **do chính agent worker gửi** — cho `rut_bang_chung` (d.222). */
  const BC_WK = 'bc-cua-worker';

  /** Một lệnh **hợp lệ** cho mỗi loại: dữ liệu có thật, để không bị NOT_FOUND che. */
  function lenhToiThieu(): { [K in LoaiLenh]: Omit<Extract<Lenh, { loai: K }>, 'loai' | 'workspace_id' | 'ai'> } {
    return {
      tao_du_an: { ten: 'Dự án mới', ma: 'ZZZ' },
      sua_du_an: { project_id: P_QL, ten: 'Tên khác' },
      // Giới hạn WIP — SPEC 20.1 (Bản đồ L1). Chỉ chủ: agent nào cũng FORBIDDEN.
      sua_cai_dat_workspace: { gioi_han_wip: 5 },

      /* Hồ sơ dự án và Luật chung — SPEC mục 9 (`cau-hoi-spec.md` #113). */
      sua_ho_so_du_an: { project_id: P_QL, la_gi: 'Dự án để test' },
      them_loi_da_gap: { project_id: P_QL, loi: 'D1 không nhận `STRICT`' },
      sua_luat_chung: { danh_sach_cam: 'Không dữ liệu thật' },

      tao_agent: { ten: 'A-moi', vai_tro: 'worker' },
      sua_agent: { agent_id: ID_AGENT.worker, mo_ta: 'Mô tả mới' },
      tao_lai_token: { agent_id: ID_AGENT.worker },
      thu_hoi_token: { agent_id: ID_AGENT.worker },
      dat_quyen: { agent_id: ID_AGENT.worker, viec: 'create_ticket', cho_phep: true },

      tao_ticket: { project_id: P_QL, tieu_de: 'Việc mới' },
      doi_tieu_de: { ticket_id: TK_QL, tieu_de: 'Tiêu đề khác' },
      sua_ticket: { ticket_id: TK_QL, tieu_de: 'Tiêu đề khác' },
      dat_nhan: { ticket_id: TK_QL, nhan: 'khan', gan: true },
      noi_ticket: { tu_ticket_id: TK_QL, den_ticket_id: TK_VAO, loai_lien_ket: 'related' },
      xoa_ticket: { ticket_id: TK_QL },
      khoi_phuc_ticket: { ticket_id: TK_QL },
      cap_so_ticket: { project_id: P_QL },
      cap_so_can_chu: {},

      // Lượt giao — SPEC mục 5. Người nhận là **reviewer**, không phải chính
      // agent gọi: nếu không thì lệnh bị chặn vì "không giao cho chính mình"
      // trước khi tới chặng kiểm `disabled`, và ca này không còn nói gì.
      tao_luot_giao: { ticket_id: TK_QL, nguoi_nhan_agent_id: ID_AGENT.reviewer },
      nhan_luot_giao: { luot_giao_id: LG_WK },

      // Nộp / nghiệm thu / huỷ / việc phát sinh — SPEC mục 5 (phần 2 lượt 2).
      nop_bao_cao: { luot_giao_id: LG_WK, ket_qua: 'done' },
      nghiem_thu: { luot_giao_id: LG_MINH_GIAO, ket_qua: 'accepted' },
      huy_luot: { luot_giao_id: LG_MINH_GIAO },
      tao_ticket_viec_phat_sinh: { luot_giao_id: LG_MINH_GIAO },

      // Phiên — SPEC mục 6. `heartbeat` cần một phiên có thật của chính agent
      // này, nếu không nó bị `NOT_FOUND` trước khi tới chặng kiểm `disabled`.
      heartbeat: { luot_giao_id: LG_WK },
      dung_phien: { phien_id: PH_WK },

      // Dòng hoạt động, kế hoạch, trả lời — SPEC mục 6 d.190, d.191, 19.6,
      // 19.12 câu 2 (phần 2 lượt 4).
      //
      // Cảnh báo d.196 **không** có lệnh nào ở đây nữa: 19.12 câu 46 chốt rằng nó
      // là một Cron Trigger mỗi 5 phút, nên nó không đi qua `BanDoLenh` và không
      // có route nào để kiểm quyền (xem `cron-canh-bao-phien.test.ts`).
      //
      // `gui_hoat_dong` và `dat_ke_hoach` trỏ vào phiên **của chính agent này**:
      // `batBuocLaAgentCuaPhien` so agent trước rồi mới kiểm `disabled`, nên phiên
      // của người khác sẽ cho ra FORBIDDEN vì lý do khác và ca này không nói gì.
      gui_hoat_dong: { phien_id: PH_WK, loai_hoat_dong: 'thought', noi_dung: 'đang nghĩ' },
      dat_ke_hoach: { phien_id: PH_WK, buoc: [{ noi_dung: 'bước một' }] },
      // Lượt do **chính agent này giao**, cùng lý do như `nghiem_thu`.
      tra_loi_cau_hoi: { luot_giao_id: LG_MINH_GIAO, noi_dung: 'trả lời đây' },

      doi_trang_thai: { ticket_id: TK_QL, trang_thai: 'in_progress' },
      chu_tu_lam: { ticket_id: TK_QL, bat: true },

      // Bằng chứng — SPEC mục 7 (phần 3 lượt 2). `note` là loại **không** có
      // bước xác minh nào (d.211), nên lệnh đi tới chặng kiểm quyền mà không
      // chạm mạng; `rut_bang_chung` trỏ vào một dòng do **chính agent này** gửi,
      // để nó không bị chặn vì "chỉ người gửi hoặc chủ" trước chặng `disabled`.
      gui_bang_chung: {
        ticket_id: TK_QL,
        loai_bang_chung: 'note',
        noi_dung: 'Đã làm xong, không có mã.',
      },
      rut_bang_chung: { bang_chung_id: BC_WK, ly_do: 'Gửi nhầm ticket' },

      // Cần Chủ — SPEC mục 8 (phần 4 lượt 1). Loại `fyi` vì nó là loại **không
      // cần trường nào thêm** (d.239), nên lệnh đi tới được chặng kiểm `disabled`
      // thay vì bị `OPTIONS_REQUIRED`/`COMMAND_REQUIRED` chặn trước.
      tao_can_chu: { tieu_de: 'Chỉ để biết', muc: 'later', loai_can_chu: 'fyi', project_id: P_QL },

      // Ba lệnh **xử lý** mục Cần Chủ (phần 4 lượt 2b) — mục 8 d.243–246, 19.9.
      // `can_chu_id` trỏ tới một mục **không có thật**, và đó là điểm chính của
      // ba dòng này: cả ba kiểm ô "Quyết mục Cần Chủ" (hàng **không bao giờ**
      // của bảng mục 3) **trước** khi tra mục, nên một agent luôn nhận
      // `FORBIDDEN`, không bao giờ `NOT_FOUND` — tức không có kênh nào để agent
      // dò xem mục `T-x` có tồn tại hay không (19.12 câu 15).
      xu_ly_can_chu: { can_chu_id: 'T-404' },
      bo_qua_can_chu: { can_chu_id: 'T-404', ly_do: 'không cần nữa' },
      mo_lai_can_chu: { can_chu_id: 'T-404' },

      // Nhật ký quyết định — SPEC mục 10 (phần 4 lượt 2a). Không `can_cu` nào:
      // căn cứ là tuỳ chọn (d.308), nên lệnh đi thẳng tới chặng kiểm quyền.
      ghi_nhat_ky: { quyet_dinh: 'Chọn D1', vi_sao: 'Đã có sẵn', project_id: P_QL },

      // 3 việc trọng tâm hôm nay — mục 11 d.324 (phần 7 việc B). Một `muc` trỏ
      // vào một ticket **có thật**: nếu không thì lệnh có thể bị `NOT_FOUND` che
      // trước chặng kiểm `disabled`. (Thực tế `batBuocGhiDuocTrongTam` chạy
      // **trước** cả phép kiểm nhập, nên ca này đỏ ngay ở đó — nhưng một lệnh tối
      // thiểu **hợp lệ** là điều kiện của cả bảng này.)
      ghi_trong_tam: { muc: [{ ticket_id: TK_QL }] },

      // Cài đặt thông báo — mục 12 d.348 (BAT-16). Chỉ chủ: agent nào cũng FORBIDDEN.
      dat_cong_tac_thong_bao: { cong_tac: 'ticket_xong', bat: false },

      them_binh_luan: { ticket_id: TK_QL, noi_dung: 'xin chào' },
      sua_binh_luan: { comment_id: CM_WK, noi_dung: 'sửa lại' },
      xoa_binh_luan: { comment_id: CM_WK },
    };
  }

  it('bảng lệnh tối thiểu phủ ĐÚNG sổ đăng ký (thêm lệnh mà quên là test đỏ)', () => {
    expect(Object.keys(lenhToiThieu()).sort()).toEqual(Object.keys(SO_DANG_KY_HANDLER).sort());
  });

  it.each(Object.keys(SO_DANG_KY_HANDLER) as LoaiLenh[])(
    'lệnh `%s` từ agent `disabled` → FORBIDDEN',
    async (loai) => {
      // Bình luận do **chính agent này** viết, để `sua_binh_luan` không bị chặn vì
      // "chỉ tác giả sửa được" trước khi tới chặng kiểm quyền.
      await dungBinhLuan(CM_WK, TK_QL, 'Bình luận của worker', ID_AGENT.worker);
      // Lượt giao do **chính agent này** nhận, cùng lý do: `nhan_luot_giao` kiểm
      // "chỉ người nhận gọi được" trước khi tới chặng kiểm `disabled`.
      // Trên `TK_VAO`: `TK_QL` đã có một lượt `work` mở trong `beforeEach`, mà
      // mỗi ticket chỉ được một lượt `work` mở (SPEC 19.1).
      await dungLuotGiao(LG_WK, TK_VAO, ID_AGENT.worker);
      // Phiên của lượt đó, để `heartbeat` tới được chặng kiểm `disabled`.
      await dungPhien(PH_WK, LG_WK);
      // Bằng chứng của chính agent này, để `rut_bang_chung` không bị `NOT_FOUND`
      // trước chặng kiểm `disabled` (SPEC mục 7 d.222).
      await dungBangChung(BC_WK, TK_QL, 'note', { nguoi_gui_agent_id: ID_AGENT.worker });
      // Lượt `review` (loại khác nên mở song song được — SPEC 19.1), **do chính
      // agent này giao**, đã `submitted` để ba lệnh của người giao đi tới được
      // chặng kiểm `disabled`.
      await dungLuotGiao(LG_MINH_GIAO, TK_VAO, ID_AGENT.reviewer, {
        loai: 'review',
        trang_thai: 'submitted',
        nguoi_giao_agent_id: ID_AGENT.worker,
      });

      const ai = aiAgent('worker', {
        agent_id: ID_AGENT.worker,
        disabled: true,
        // Rộng nhất có thể: bị từ chối thì phải vì `disabled`, không vì cửa dự án.
        vao_tat_ca_du_an: true,
        du_an_minh_quan_ly: [P_QL, P_VAO, P_NGOAI],
      });

      const phan = (lenhToiThieu() as Record<string, Record<string, unknown>>)[loai] ?? {};
      const lenh = { ...phan, loai, workspace_id: WS, ai } as Lenh;

      await expect(goiLenh(env, lenh), loai).rejects.toMatchObject({ ma: 'FORBIDDEN' });
    },
  );

  it('đối chứng: cùng những lệnh đó từ CHỦ thì KHÔNG phải FORBIDDEN', async () => {
    // Nếu test trên xanh vì mọi lệnh đều hỏng (vd dữ liệu fixture sai) thì test này
    // sẽ đỏ, nên hai test phải cùng đúng mới có nghĩa.
    await dungBinhLuan(CM_WK, TK_QL, 'Bình luận của worker', ID_AGENT.worker);
    const res = await goiLenh(env, {
      loai: 'cap_so_ticket',
      workspace_id: WS,
      ai: { loai: 'chu' },
      project_id: P_QL,
    });
    expect(res.so).toBeGreaterThan(0);
  });
});
