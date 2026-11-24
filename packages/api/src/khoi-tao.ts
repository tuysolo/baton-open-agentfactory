/**
 * **Khởi tạo lần đầu** — một lượt gọi đưa một DB **rỗng ngay sau migration** tới
 * trạng thái dùng được: có workspace, có tài khoản chủ (mật khẩu + TOTP), có dự
 * án, có agent kèm token.
 *
 * ## Vì sao đường này PHẢI tồn tại (lỗi chặn deploy, đo được)
 *
 * Trước lượt này **không có đường nào ghi được một dòng `workspace`**: không
 * `INSERT INTO workspace` nào trong `src/` lẫn `migrations/` (chỉ fixture test
 * `test/giup.ts` có). Mà `workspaceDuyNhat` (`xac-thuc.ts`) là
 * `SELECT id FROM workspace ORDER BY id LIMIT 1` và **ném `NOT_FOUND`** khi rỗng,
 * và nhánh `TOKEN_CHU` của `xacThuc` gọi nó **trước** khi vào route. Nên trên một
 * DB vừa áp migration, **mọi** đường — kể cả `POST /v1/chu/thiet-lap` — trả 404
 * "Chưa có workspace nào.", và không có cách nào vào hệ. Đúng nghĩa một cái khoá
 * không có chìa.
 *
 * ## Vì sao MỘT đường, không ba lệnh curl
 *
 * Cách gọn hơn về mã là "cho `/v1/chu/thiet-lap` tự tạo workspace khi rỗng, rồi
 * chủ gọi thêm `POST /v1/du-an` và `POST /v1/agent`". Không chọn, vì hai lý do
 * đo được:
 *   * `/v1/chu/thiet-lap` là đường **đặt mật khẩu**; cho nó thêm quyền tạo
 *     workspace là trộn hai việc khác hẳn nhau vào một đường mà hàng rào của nó
 *     được viết cho đúng một việc.
 *   * Nhiều lệnh thì **không chạy lại được**: gõ sai ở lệnh thứ ba, chủ phải tự
 *     biết lệnh một và hai đã xong để bỏ qua. Đường này làm trọn và **chạy lại
 *     được** (idempotent) — lần hai không nhân bản gì.
 *
 * ## Bí mật ra khỏi máy chủ ĐÚNG MỘT LẦN — SPEC mục 15 d.417
 *
 * `otpauth://…` (mang secret TOTP) và `token` của agent chỉ xuất hiện trong phản
 * hồi của lần **tạo** ra chúng. Lần chạy lại, hai trường đó là `null` kèm
 * `ghi_chu` nói rõ "đã có, không cấp lại" — xem `KetQuaKhoiTao`. Không log,
 * không ghi file, không vào lịch sử hay Nhật ký. Muốn token mới thì đi
 * `POST /v1/agent/:id/token` (`tao_lai_token`), nơi token cũ **hết hiệu lực
 * ngay** — khác hẳn một đường khởi tạo âm thầm cấp thêm token.
 *
 * ## Cổng
 *
 * Route `POST /v1/khoi-tao` canh bằng **`TOKEN_CHU` và chỉ `TOKEN_CHU`** (cờ
 * `qua_token_chu`), cùng nếp `/v1/chu/thiet-lap` và `/v1/chu/mo-khoa`:
 * `TOKEN_CHU` rỗng = **không đường nào vào** (fail-closed). Một cookie phiên
 * cũng không vào — mà cookie phiên chỉ có khi đã có tài khoản chủ, tức đã qua
 * khởi tạo.
 */

import { BatonError, kiemMaDuAn, kiemTenAgent, type VaiTroAgent } from '@baton/shared';
import { taiKhoanChu } from './chu-dang-nhap.js';
import type { Env } from './moi-truong.js';
import { goiLenh, goiThietLapChu } from './workspace-gate.js';

/** Tên chủ mặc định của `workspace.ten_chu` — SPEC mục 1 (migration 0001). */
export const TEN_CHU_MAC_DINH = 'Chủ';

export interface DuAnKhoiTao {
  ten: string;
  ma: string;
  mo_ta?: string | null;
  nhom?: string | null;
  khong_code?: boolean;
  bat_buoc_review?: boolean;
}

export interface AgentKhoiTao {
  ten: string;
  vai_tro: string;
  model?: string | null;
  mo_ta?: string | null;
  /**
   * **Mã dự án** (`ma`, vd `BAT`), *không* id — khác `POST /v1/agent`, nơi
   * trường cùng tên nhận id. Cố ý: thân của lệnh này do **người** gõ trong một
   * lần duy nhất, và lúc gõ thì các dự án còn chưa có id nào để biết. Mã thì
   * chính người gõ vừa đặt ở `du_an` ngay trên.
   */
  du_an_duoc_vao?: string[];
  vao_tat_ca_du_an?: boolean;
}

export interface YeuCauKhoiTao {
  /** `workspace.ten_chu`; chỉ dùng khi **tạo mới** workspace. */
  ten_chu?: string;
  /** Mật khẩu chủ; chỉ dùng khi **chưa** có tài khoản chủ. 12–256 ký tự. */
  mat_khau?: string;
  du_an?: DuAnKhoiTao[];
  agent?: AgentKhoiTao[];
}

export interface KetQuaKhoiTao {
  workspace: { id: string; ten_chu: string; vua_tao: boolean };
  chu: {
    vua_tao: boolean;
    /** `otpauth://…` — **chỉ** khi `vua_tao`; chạy lại thì `null`. */
    otpauth: string | null;
    ghi_chu: string;
  };
  du_an: { id: string; ma: string; ten: string; vua_tao: boolean }[];
  agent: {
    id: string;
    ten: string;
    vai_tro: VaiTroAgent;
    vua_tao: boolean;
    /** Token thô — **chỉ** khi `vua_tao`; chạy lại thì `null`. */
    token: string | null;
    ghi_chu: string;
  }[];
}

/* ------------------------------------------------------------------ *
 * Bóc thân — không tin client
 * ------------------------------------------------------------------ */

function chuTuyChon(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function dsChu(v: unknown, o_dau: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new BatonError('INVALID_INPUT', { message: `${o_dau} phải là danh sách chữ.` });
  }
  return v as string[];
}

function coTuyChon(v: unknown, o_dau: string): boolean | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'boolean') {
    throw new BatonError('INVALID_INPUT', { message: `${o_dau} phải là true hoặc false.` });
  }
  return v;
}

function mang(v: unknown, o_dau: string): Record<string, unknown>[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'object' || x === null)) {
    throw new BatonError('INVALID_INPUT', { message: `${o_dau} phải là danh sách object.` });
  }
  return v as Record<string, unknown>[];
}

/**
 * Thân JSON → `YeuCauKhoiTao`.
 *
 * Chỉ **hình dạng**; mọi luật nghiệp vụ (mã dự án 2–6 chữ A–Z, vai trò hợp lệ,
 * mật khẩu 12–256 ký tự) vẫn do các cửa ghi sẵn có kiểm — không chép luật ra chỗ
 * thứ hai.
 */
export function thanKhoiTao(b: Record<string, unknown>): YeuCauKhoiTao {
  return {
    ...(chuTuyChon(b['ten_chu']) === undefined ? {} : { ten_chu: chuTuyChon(b['ten_chu'])! }),
    ...(chuTuyChon(b['mat_khau']) === undefined
      ? {}
      : { mat_khau: chuTuyChon(b['mat_khau'])! }),
    du_an: mang(b['du_an'], 'du_an').map((d) => ({
      ten: typeof d['ten'] === 'string' ? d['ten'] : '',
      ma: typeof d['ma'] === 'string' ? d['ma'] : '',
      mo_ta: chuTuyChon(d['mo_ta']) ?? null,
      nhom: chuTuyChon(d['nhom']) ?? null,
      ...(coTuyChon(d['khong_code'], 'khong_code') === undefined
        ? {}
        : { khong_code: coTuyChon(d['khong_code'], 'khong_code')! }),
      ...(coTuyChon(d['bat_buoc_review'], 'bat_buoc_review') === undefined
        ? {}
        : { bat_buoc_review: coTuyChon(d['bat_buoc_review'], 'bat_buoc_review')! }),
    })),
    agent: mang(b['agent'], 'agent').map((a) => ({
      ten: typeof a['ten'] === 'string' ? a['ten'] : '',
      vai_tro: typeof a['vai_tro'] === 'string' ? a['vai_tro'] : '',
      model: chuTuyChon(a['model']) ?? null,
      mo_ta: chuTuyChon(a['mo_ta']) ?? null,
      ...(dsChu(a['du_an_duoc_vao'], 'du_an_duoc_vao') === undefined
        ? {}
        : { du_an_duoc_vao: dsChu(a['du_an_duoc_vao'], 'du_an_duoc_vao')! }),
      ...(coTuyChon(a['vao_tat_ca_du_an'], 'vao_tat_ca_du_an') === undefined
        ? {}
        : { vao_tat_ca_du_an: coTuyChon(a['vao_tat_ca_du_an'], 'vao_tat_ca_du_an')! }),
    })),
  };
}

/** Workspace duy nhất, hoặc `null` khi DB còn rỗng. */
async function workspaceNeuCo(
  db: D1Database,
): Promise<{ id: string; ten_chu: string } | null> {
  return db
    .prepare('SELECT id, ten_chu FROM workspace ORDER BY id LIMIT 1')
    .first<{ id: string; ten_chu: string }>();
}

/**
 * Workspace của v0.1 — tạo nếu **chưa có cái nào**, không thì dùng lại.
 *
 * v0.1 chỉ một workspace (SPEC mục 1 d.51), nên câu chèn mang sẵn điều kiện
 * `WHERE NOT EXISTS (SELECT 1 FROM workspace)`: điều kiện nằm **trong** một câu
 * SQL, nên hai lượt gọi chồng nhau không dựng được workspace thứ hai, không nhờ
 * một phép kiểm ở tầng trên mà hai lượt đều thấy "chưa có".
 */
async function dungWorkspaceNeuThieu(
  db: D1Database,
  ten_chu: string,
  bay_gio: number,
): Promise<{ id: string; ten_chu: string; vua_tao: boolean }> {
  const da_co = await workspaceNeuCo(db);
  if (da_co !== null) return { ...da_co, vua_tao: false };

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO workspace (id, ten_chu, tao_luc, cap_nhat_luc)
       SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM workspace)`,
    )
    .bind(id, ten_chu, bay_gio, bay_gio)
    .run();

  const sau = await workspaceNeuCo(db);
  if (sau === null) {
    throw new BatonError('INTERNAL', { message: 'Không tạo được workspace.' });
  }
  return { ...sau, vua_tao: sau.id === id };
}

/**
 * **Khởi tạo** — xem khối đầu file.
 *
 * Thứ tự cố định: workspace → chủ → dự án → agent. Agent sau dự án vì
 * `du_an_duoc_vao` của agent trỏ tới dự án vừa tạo ở bước trước.
 */
export async function khoiTao(
  env: Env,
  yc: YeuCauKhoiTao,
  bay_gio: number,
): Promise<KetQuaKhoiTao> {
  const db = env.DB;

  /* 1. Workspace ------------------------------------------------------ */
  const ten_chu_vao =
    typeof yc.ten_chu === 'string' && yc.ten_chu.trim() !== ''
      ? yc.ten_chu.trim()
      : TEN_CHU_MAC_DINH;
  const ws = await dungWorkspaceNeuThieu(db, ten_chu_vao, bay_gio);

  /* 2. Tài khoản chủ -------------------------------------------------- */
  const chu_da_co = await taiKhoanChu(db, ws.id);
  let chu: KetQuaKhoiTao['chu'];
  if (chu_da_co !== null) {
    chu = {
      vua_tao: false,
      otpauth: null,
      ghi_chu:
        'Tài khoản chủ đã có; mật khẩu và secret TOTP không đổi và không cấp lại. ' +
        'Bị khoá đăng nhập thì dùng POST /v1/chu/mo-khoa.',
    };
  } else if (typeof yc.mat_khau !== 'string' || yc.mat_khau === '') {
    /*
     * **Không** đặt một mật khẩu mặc định nào. Một mật khẩu do máy chủ chọn là
     * một mật khẩu chủ không biết (nên không vào được) hoặc một mật khẩu ai đọc
     * mã cũng biết. Nên thiếu `mat_khau` là lỗi nhập, và workspace vừa tạo ở
     * trên vẫn còn — chạy lại kèm mật khẩu là đủ.
     */
    throw new BatonError('INVALID_INPUT', {
      message:
        'Chưa có tài khoản chủ: thân phải có "mat_khau" (12–256 ký tự). ' +
        'Workspace đã tạo, chạy lại lệnh này kèm mật khẩu.',
    });
  } else {
    const kq = await goiThietLapChu(env, {
      workspace_id: ws.id,
      mat_khau: yc.mat_khau,
      ten: ws.ten_chu,
    });
    chu = {
      vua_tao: true,
      otpauth: kq.otpauth,
      ghi_chu:
        'Quét otpauth này bằng ứng dụng xác thực NGAY: nó chỉ hiện lần này, ' +
        'máy chủ không đọc lại được.',
    };
  }

  /* 3. Dự án ---------------------------------------------------------- */
  const du_an: KetQuaKhoiTao['du_an'] = [];
  for (const d of yc.du_an ?? []) {
    const ma = kiemMaDuAn(d.ma);
    const cu = await db
      .prepare('SELECT id, ma, ten FROM project WHERE workspace_id = ? AND ma = ?')
      .bind(ws.id, ma)
      .first<{ id: string; ma: string; ten: string }>();
    if (cu !== null) {
      du_an.push({ ...cu, vua_tao: false });
      continue;
    }
    const moi = await goiLenh(env, {
      loai: 'tao_du_an',
      ai: { loai: 'chu' },
      workspace_id: ws.id,
      ten: d.ten,
      ma,
      mo_ta: d.mo_ta ?? null,
      nhom: d.nhom ?? null,
      ...(d.khong_code === undefined ? {} : { khong_code: d.khong_code }),
      ...(d.bat_buoc_review === undefined ? {} : { bat_buoc_review: d.bat_buoc_review }),
    });
    du_an.push({ id: moi.id, ma: moi.ma, ten: moi.ten, vua_tao: true });
  }

  /* 4. Agent ---------------------------------------------------------- */
  // Mã dự án → id, cho `du_an_duoc_vao` của agent (xem `AgentKhoiTao`).
  const { results: moi_du_an } = await db
    .prepare('SELECT id, ma FROM project WHERE workspace_id = ?')
    .bind(ws.id)
    .all<{ id: string; ma: string }>();
  const id_theo_ma = new Map(moi_du_an.map((d) => [d.ma, d.id]));

  const agent: KetQuaKhoiTao['agent'] = [];
  for (const a of yc.agent ?? []) {
    const ten = kiemTenAgent(a.ten);
    const cu = await db
      .prepare('SELECT id, ten, vai_tro FROM agent WHERE workspace_id = ? AND ten = ?')
      .bind(ws.id, ten)
      .first<{ id: string; ten: string; vai_tro: VaiTroAgent }>();
    if (cu !== null) {
      agent.push({
        ...cu,
        vua_tao: false,
        token: null,
        ghi_chu:
          'Agent đã có; token cũ vẫn dùng được và KHÔNG cấp lại ở đây. ' +
          'Mất token thì gọi POST /v1/agent/' +
          cu.id +
          '/token (token cũ hết hiệu lực ngay).',
      });
      continue;
    }

    const ids: string[] = [];
    for (const ma of a.du_an_duoc_vao ?? []) {
      const id = id_theo_ma.get(ma);
      if (id === undefined) {
        throw new BatonError('NOT_FOUND', {
          message: `Agent "${ten}": không có dự án mã "${ma}" trong workspace.`,
        });
      }
      ids.push(id);
    }

    const moi = await goiLenh(env, {
      loai: 'tao_agent',
      ai: { loai: 'chu' },
      workspace_id: ws.id,
      ten,
      vai_tro: a.vai_tro,
      model: a.model ?? null,
      mo_ta: a.mo_ta ?? null,
      du_an_duoc_vao: ids,
      ...(a.vao_tat_ca_du_an === undefined ? {} : { vao_tat_ca_du_an: a.vao_tat_ca_du_an }),
    });
    agent.push({
      id: moi.id,
      ten: moi.ten,
      vai_tro: moi.vai_tro,
      vua_tao: true,
      token: moi.token,
      ghi_chu: 'Token hiện ĐÚNG MỘT LẦN này. Cất ngay (1Password), đừng ghi vào file.',
    });
  }

  return { workspace: ws, chu, du_an, agent };
}
