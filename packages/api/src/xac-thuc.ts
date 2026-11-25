/**
 * Xác thực "ai đang gọi" — SPEC mục 3, 13, 15.
 *
 * Agent gửi token, server **băm** rồi tra khoá duy nhất `ux_agent_token_bam`
 * (một lần tra khoá cho mỗi request). Server không bao giờ lưu, in hay trả lại
 * token thô (SPEC mục 15).
 *
 * Chủ ở phần 1 đi qua **một đường tạm**: token chủ trong secret binding
 * `TOKEN_CHU`. Mật khẩu + TOTP là phần 6. Cả hai nhánh dựng ra cùng một kiểu
 * `AiGoi` (union `{ loai: 'chu' } | { loai: 'agent', ... }`), nên phần 6 chỉ cần
 * thay cách dựng nhánh `'chu'`, không sửa chỗ nào khác.
 */

import type { Context, MiddlewareHandler } from 'hono';
import {
  BatonError,
  bamIdPhien,
  bamToken,
  bangNhauAnToan,
  idPhienTuCookie,
  laPhamViQuyen,
  laViecGhiDeDuoc,
  type AiGoi,
  type GhiDeQuyen,
  type VaiTroAgent,
  type ViecGhiDeDuoc,
} from '@baton/shared';
import type { Env } from './moi-truong.js';
import { demMotRequest } from './gioi-han-token.js';
import { phienChuConSong } from './chu-dang-nhap.js';

/** Biến Hono mà middleware xác thực đặt vào context. */
export interface BienXacThuc {
  ai: AiGoi;
  workspace_id: string;
  /**
   * Khoá bộ đếm nhịp độ: băm token của agent, hoặc `'chu'`. **Không** phải token
   * thô (SPEC mục 15).
   */
  khoa_dem: string;
  /**
   * Request này vào bằng **`TOKEN_CHU`** (đường tạm của phần 1), không bằng cookie
   * phiên và không bằng token agent.
   *
   * Chỉ **một** đường đọc cờ này: `POST /v1/chu/thiet-lap`. Thiết lập lần đầu
   * phải là đường của người **đứng ở máy chủ** (`spec-questions.md` #3), nên nó
   * không được mở cho một cookie phiên — mà cookie cũng dựng ra `{ loai: 'chu' }`,
   * nên `ai.loai === 'chu'` một mình **không** phân biệt được hai đường. Mọi chỗ
   * khác tuyệt đối không đọc cờ này: quyền của chủ là một, không hai hạng.
   */
  qua_token_chu?: boolean;
  /**
   * Phiên cookie **đang gọi** — chỉ có khi request vào bằng nhánh cookie (BAT-11).
   *
   * `bam` là băm của cookie, **không bao giờ** đi ra thân phản hồi: nó chỉ dùng để
   * (a) đánh dấu phiên hiện tại trong danh sách phiên, (b) giữ lại đúng phiên này
   * khi đổi mật khẩu, (c) ghi lần dùng cuối theo nhịp. Vắng mặt = không có phiên
   * cookie (agent, hoặc chủ qua `TOKEN_CHU`) — và đường đổi mật khẩu đọc chính sự
   * vắng mặt đó để từ chối.
   */
  phien_chu?: { bam: string; dung_cuoi_luc: number | null; het_luc: number };
  /**
   * **Chỉ cho log** (BAT-65): loại bằng chứng của request gửi bằng chứng, đặt bởi
   * route `POST /v1/ticket/:id/bang-chung` khi giá trị đã qua `loaiBangChungDeLog`.
   * `xuLyLoi` đọc nó để dòng `loi_internal` nói được "review hay deploy". Không
   * chỗ nào khác đọc, và nó không bao giờ quyết định hành vi.
   */
  loai_bang_chung?: string;
}

export type MoiTruongHono = { Bindings: Env; Variables: BienXacThuc };

/* ------------------------------------------------------------------ *
 * Đọc token từ request
 * ------------------------------------------------------------------ */

/**
 * Lấy token từ `Authorization: Bearer <token>`.
 *
 * Chỉ nhận header, **không** nhận query string: query string đi vào log truy cập
 * của hạ tầng và vào lịch sử lệnh của shell, nên token sẽ bị ghi lại ở nơi không
 * kiểm soát được (SPEC mục 15 "không bao giờ in token").
 */
export function tokenTuRequest(c: Context): string | null {
  const header = c.req.header('authorization');
  if (header === undefined) return null;
  const khop = /^Bearer (.+)$/.exec(header.trim());
  return khop?.[1]?.trim() ?? null;
}

/* ------------------------------------------------------------------ *
 * Dựng `AiGoi` cho agent
 * ------------------------------------------------------------------ */

export interface DongAgent {
  id: string;
  workspace_id: string;
  vai_tro: string;
  disabled: number;
  vao_tat_ca_du_an: number;
}

/**
 * Tra agent theo **băm** token và dựng đủ bối cảnh quyền: dự án được vào, dự án
 * mình quản lý, và các ô chủ đã chỉnh riêng.
 *
 * Token đã thu hồi (`token_thu_hoi_luc IS NOT NULL`) không tra ra gì — điều kiện
 * nằm ngay trong `WHERE`, nên "tạo lại token" làm token cũ hết hiệu lực **ngay**
 * (SPEC mục 3) mà không cần nhớ xoá ở chỗ nào khác.
 *
 * Nhận **băm**, không nhận token thô, để mỗi request chỉ băm **một lần**: băm
 * cũng là khoá của bộ đếm nhịp độ nên middleware đã tính nó trước đó.
 */
export async function agentTheoToken(
  db: D1Database,
  bam: string,
): Promise<{ ai: Extract<AiGoi, { loai: 'agent' }>; workspace_id: string } | null> {
  const agent = await db
    .prepare(
      `SELECT id, workspace_id, vai_tro, disabled, vao_tat_ca_du_an
         FROM agent
        WHERE token_bam = ? AND token_thu_hoi_luc IS NULL`,
    )
    .bind(bam)
    .first<DongAgent>();

  if (agent === null) return null;
  return { workspace_id: agent.workspace_id, ai: await aiGoiCuaDongAgent(db, agent) };
}

/**
 * Dựng `AiGoi` của một agent **từ dòng agent đã đọc** — bối cảnh quyền đầy đủ:
 * dự án được vào, dự án mình quản lý, và các ô chủ đã chỉnh riêng.
 *
 * Tách khỏi `agentTheoToken` vì **trang agent** (mục 3 d.80: "biết … mỗi agent
 * được phép làm gì") cần đúng bối cảnh đó cho một agent **không phải người gọi**,
 * và `bangQuyenCuaAgent` của `@baton/shared` chỉ nhận một `AiGoi` đầy đủ. Một bản
 * dựng thứ hai ở đường đọc là hai định nghĩa cho "quyền hiện hành của agent X" —
 * và chúng sẽ lệch đúng ở chỗ khó thấy nhất (ô ghi đè, dự án mình quản lý).
 */
export async function aiGoiCuaDongAgent(
  db: D1Database,
  agent: DongAgent,
): Promise<Extract<AiGoi, { loai: 'agent' }>> {
  // Ba truy vấn phụ chạy song song: chúng độc lập nhau và nằm trên đường đi của
  // **mọi** request, nên không nối tiếp ba lượt đi-về.
  const [duAnDuocVao, duAnQuanLy, ghiDeDong] = await Promise.all([
    db
      .prepare('SELECT project_id FROM agent_project WHERE agent_id = ?')
      .bind(agent.id)
      .all<{ project_id: string }>(),
    db
      .prepare('SELECT id FROM project WHERE workspace_id = ? AND quan_ly_agent_id = ?')
      .bind(agent.workspace_id, agent.id)
      .all<{ id: string }>(),
    db
      .prepare('SELECT viec, cho_phep, pham_vi FROM agent_permission WHERE agent_id = ?')
      .bind(agent.id)
      .all<{ viec: string; cho_phep: number; pham_vi: string | null }>(),
  ]);

  const ghi_de: Partial<Record<ViecGhiDeDuoc, GhiDeQuyen>> = {};
  for (const d of ghiDeDong.results) {
    const viec = d.viec;
    // Hàng "không bao giờ" không bao giờ được đọc từ dữ liệu, và phạm vi lạ bị
    // bỏ qua: dữ liệu rác **không được** nới quyền ra (fail-closed).
    if (!laViecGhiDeDuoc(viec)) continue;
    const pham_vi = d.pham_vi;
    if (pham_vi !== null && !laPhamViQuyen(pham_vi)) continue;
    ghi_de[viec] = { cho_phep: d.cho_phep === 1, pham_vi };
  }

  return {
    loai: 'agent',
    agent_id: agent.id,
    vai_tro: agent.vai_tro as VaiTroAgent,
    disabled: agent.disabled === 1,
    vao_tat_ca_du_an: agent.vao_tat_ca_du_an === 1,
    du_an_duoc_vao: duAnDuocVao.results.map((d) => d.project_id),
    du_an_minh_quan_ly: duAnQuanLy.results.map((d) => d.id),
    ghi_de,
  };
}

/**
 * Workspace duy nhất của v0.1 — SPEC mục 1.
 *
 * Để `export`: đường **đăng nhập** (`POST /v1/dang-nhap`) là đường công khai duy
 * nhất phải biết mình đăng nhập vào workspace nào, và nó không có `ai` nào để
 * lấy `workspace_id` từ context. Một bản sao của câu `ORDER BY id LIMIT 1` ở chỗ
 * khác là hai định nghĩa cho "workspace của v0.1".
 */
export async function workspaceDuyNhat(db: D1Database): Promise<string> {
  const d = await db
    .prepare('SELECT id FROM workspace ORDER BY id LIMIT 1')
    .first<{ id: string }>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Chưa có workspace nào.' });
  return d.id;
}

/* ------------------------------------------------------------------ *
 * Đường công khai — danh sách ĐÓNG
 * ------------------------------------------------------------------ */

/**
 * Những đường **không cần token**.
 *
 * Trước đây ba đường này công khai chỉ vì được khai **phía trên** dòng
 * `app.use('/v1/*', xacThuc)` trong `index.ts`. Nghĩa là thêm một route ở chỗ sai
 * trong file là mở một đường không cần token, và diff không có gì để ai nhìn
 * thấy. Giờ `xacThuc` gắn cho **mọi** đường và tự bỏ qua đúng danh sách này:
 * mặc định là "phải có token", công khai là lựa chọn phải viết ra.
 *
 *   * `/v1/health` — kiểm tra sống, không trả dữ liệu nào.
 *   * `/v1/meta` — bảng mã/nhãn (SPEC mục 0.1), bảng mã lỗi (mục 13), bảng quyền
 *     mặc định (mục 3). Toàn bộ là **hằng số của phần mềm**, không có dữ liệu
 *     workspace; CLI cần đọc được trước khi có token để in nhãn tiếng Việt.
 *   * `/v1/_loi/:ma` — đường kiểm middleware lỗi, còn bị chặn thêm một lớp bằng
 *     cờ `CHO_DUONG_TEST` nên khi deploy là 404.
 *   * `/v1/dang-nhap` — **đường đăng nhập của chủ** (mục 15 d.415). Nó buộc phải
 *     công khai: nó là đường *dựng ra* giấy tờ, nên đòi giấy tờ trước khi vào là
 *     một vòng kín. Hàng rào của nó không phải token mà là **hai lớp** d.415 cộng
 *     hạn mức khoá tăng dần của `chu-dang-nhap.ts`. Khai thẳng hệ quả: đường này
 *     **không** đi qua bộ đếm 600 req/phút (bộ đếm cần một khoá, mà một lần đăng
 *     nhập chưa có khoá nào) — việc kẹp số lần đoán do bộ đếm `so_lan_sai` của
 *     tài khoản làm, và nó chặt hơn 600/phút rất nhiều.
 */
const DUONG_CONG_KHAI: ReadonlySet<string> = new Set([
  '/v1/health',
  '/v1/meta',
  '/v1/dang-nhap',
]);

/** Đường công khai có tham số, không so bằng chuỗi được. */
const MAU_DUONG_CONG_KHAI: readonly RegExp[] = [/^\/v1\/_loi\/[^/]*$/];

/**
 * **Đường khởi tạo lần đầu** — đường duy nhất chạy được khi **chưa có
 * workspace** nào. Xem `khoi-tao.ts` cho lý lẽ đầy đủ.
 *
 * Nó **không** công khai (vẫn phải đúng `TOKEN_CHU`); nó chỉ được miễn phép tra
 * `workspaceDuyNhat`, phép mà nhánh `TOKEN_CHU` dưới đây làm **trước** route và
 * phép đó ném `NOT_FOUND` trên một DB vừa áp migration — tức khoá mọi đường,
 * gồm cả đường mở khoá.
 */
export const DUONG_KHOI_TAO = '/v1/khoi-tao';

export function laDuongCongKhai(duong: string): boolean {
  return DUONG_CONG_KHAI.has(duong) || MAU_DUONG_CONG_KHAI.some((m) => m.test(duong));
}

/* ------------------------------------------------------------------ *
 * Middleware
 * ------------------------------------------------------------------ */

/**
 * Đếm nhịp độ **trước**, xác thực sau.
 *
 * Khoá đếm là **băm của token được gửi lên**, nên nó tính được mà không cần biết
 * token đó là của ai. Nhờ vậy:
 *   * Một kẻ gửi token sai liên tục cũng bị kẹp ở 600 req/phút. Đếm sau khi xác
 *     thực thì mỗi request token sai vẫn tốn **4 truy vấn D1** và không bao giờ
 *     bị chặn — tức là một đường bơm tải vào DB không giới hạn.
 *   * Vẫn đúng "600 request mỗi phút **mỗi token**" (SPEC mục 13): một băm là
 *     một token, kể cả token không tồn tại.
 *
 * Token được băm **đúng một lần** mỗi request và băm đó dùng lại cho cả bộ đếm
 * lẫn truy vấn tra agent.
 *
 * Từ chối:
 *   * thiếu token, token sai, token đã thu hồi → `INVALID_TOKEN` / **401**
 *   * agent `disabled` → `FORBIDDEN` / **403** (SPEC mục 3 "gọi API sẽ bị từ
 *     chối"; token *đúng*, chỉ danh tính bị tắt — xem `spec-questions.md` #11)
 *   * quá 600 req/phút → `RATE_LIMITED` / **429** kèm `Retry-After`
 */
export const xacThuc: MiddlewareHandler<MoiTruongHono> = async (c, next) => {
  // Đường công khai đi qua, không cần token (danh sách đóng ở trên).
  if (laDuongCongKhai(new URL(c.req.url).pathname)) {
    await next();
    return;
  }

  const env = c.env;

  /*
   * **Nhánh cookie phiên của chủ** — SPEC mục 15 d.415 (phần 6).
   *
   * Đặt **trước** nhánh token, và đó là một lựa chọn: web của chủ không gửi
   * header `Authorization` nào, nên nếu nhánh token chạy trước thì mọi request
   * của web chết ở câu "thiếu header" phía dưới.
   *
   * Nhánh này dựng ra đúng `{ loai: 'chu' }` của union `AiGoi` đã có từ phần 1,
   * nên **không một `batBuocQuyen` nào phải đổi một dòng** — đúng món nợ mà
   * `decisions.md` 01/10 đã ghi ("phần 6 thay nhánh `'chu'` mà không sửa chỗ
   * khác").
   *
   * **Agent không đăng nhập web (d.416)**: cookie chỉ tra bảng `chu_phien` và
   * chỉ sinh ra được nhánh `'chu'`; không có đường nào từ một cookie ra một
   * `agent_id`. Chiều ngược cũng đóng — nhánh token dưới đây không đọc cookie.
   */
  /**
   * Cookie có mặt nhưng **không giải ra phiên sống** (lạ / đã huỷ / hết hạn).
   * Chỉ dùng để chọn thông điệp của lỗi 401 cuối cùng — xem nhánh dưới.
   */
  let cookie_chet = false;

  const id_phien = idPhienTuCookie(c.req.header('cookie'));
  if (id_phien !== null) {
    const bam_phien = await bamIdPhien(id_phien);

    /*
     * **Kẹp nhịp độ cũng áp cho nhánh cookie** (d.387, 600 req/phút).
     *
     * Khoá đếm là `phien:<băm cookie>`: một **giấy tờ** là một bộ đếm, đúng nếp
     * "mỗi token một bộ đếm" của mục 13. Không dùng `'chu'` làm khoá chung cho
     * cả chủ: thế thì mỗi tab web mới của chủ lại ăn vào cùng một hạn mức với
     * đường `TOKEN_CHU` (vốn là đường của script và của test), và một trang tải
     * nhiều ô sẽ tự khoá chủ ra ngoài. Và không dùng id thô: khoá đếm thành id
     * của một Durable Object, mà id đó đi vào log hạ tầng (mục 15).
     */
    c.set('khoa_dem', `phien:${bam_phien}`);
    const nhip_chu = await demMotRequest(env.GIOI_HAN_TOKEN, `phien:${bam_phien}`);
    if (!nhip_chu.cho_phep) {
      /*
       * Hết hạn mức của **cookie này**. Có Bearer đi kèm thì bỏ hẳn nhánh cookie
       * và đi nhánh token (nó có bộ đếm riêng), **không** ném 429.
       *
       * Nếu ném, bộ đếm của một cookie **nhồi vào** trở thành đúng cái gậy mà
       * đoạn dưới đây đi sửa: kẻ nhồi cookie `X` rồi tự bắn 600 request mang `X`
       * là làm mọi request mang `X` hoá 429, kể cả của một agent có token đúng —
       * một 401 đổi thành một 429, cùng một người bị cắt.
       *
       * Và rơi xuống **không** mở một đường không đo: nó đi *thay cho* lượt tra
       * `chu_phien` ở dưới (không truy vấn nào chạy), rồi nhánh token đo bằng bộ
       * đếm của băm token. Mỗi giấy tờ vẫn đúng một bộ đếm (mục 13).
       */
      if (tokenTuRequest(c) === null) {
        throw new BatonError('RATE_LIMITED', { retryAfter: nhip_chu.retry_after });
      }
    } else {
      const phien = await phienChuConSong(env.DB, bam_phien, Date.now());

      if (phien !== null) {
        c.set('ai', { loai: 'chu' });
        c.set('workspace_id', phien.workspace_id);
        c.set('phien_chu', {
          bam: bam_phien,
          dung_cuoi_luc: phien.dung_cuoi_luc,
          het_luc: phien.het_luc,
        });
        await next();
        return;
      }
    }

    /*
     * **Cookie chết thì RƠI XUỐNG nhánh token, không 401 ngay.**
     *
     * Trước đây nhánh này ném 401 tại chỗ, và vì nó đứng **trên** nhánh token thì
     * một request mang **cả** một cookie `baton_phien` rác **và** một Bearer hợp
     * lệ bị từ chối — Bearer không bao giờ được đọc. Hệ quả: ai nhồi được một
     * cookie cho domain này (một subdomain lân cận ghi `Domain=` là đủ, cookie
     * không có nguồn gốc nào để kiểm) ép được **mọi** request 401 liên tục, kể cả
     * của một agent có token đúng. Một cookie không phải một giấy tờ được kiểm,
     * nên nó không được quyền **cấm** một giấy tờ đã kiểm.
     *
     * Thứ tự vẫn giữ (cookie trước): web của chủ không gửi `Authorization` nào,
     * nên cookie **hợp lệ** vẫn thắng — nhánh trên đã `return`. Rơi xuống chỉ xảy
     * ra khi cookie không còn giá trị gì.
     *
     * Kẹp nhịp độ đã tính một lượt cho `phien:<băm>` ở trên và nhánh token dưới
     * tính thêm một lượt cho băm token: **mỗi giấy tờ một bộ đếm**, đúng nếp mục
     * 13 — một cookie rác không ăn vào hạn mức của token, và ngược lại.
     *
     * Không có Bearer thì vẫn **401, cùng một mã** cho cả ba ca (không có / đã
     * huỷ / hết hạn): phân biệt chúng là nói cho người giữ một cookie cũ biết nó
     * *từng* đúng.
     */
    cookie_chet = true;
  }

  const token = tokenTuRequest(c);
  if (token === null) {
    throw new BatonError('INVALID_TOKEN', {
      message: cookie_chet
        ? 'Phiên đăng nhập không còn hiệu lực. Đăng nhập lại.'
        : 'Thiếu header Authorization: Bearer.',
    });
  }

  const bam = await bamToken(token);

  // Kẹp nhịp độ trước mọi truy vấn DB (xem ghi chú trên).
  c.set('khoa_dem', bam);
  const nhip = await demMotRequest(env.GIOI_HAN_TOKEN, bam);
  if (!nhip.cho_phep) {
    throw new BatonError('RATE_LIMITED', { retryAfter: nhip.retry_after });
  }

  // Nhánh chủ (đường tạm của phần 1; phần 6 thay bằng mật khẩu + TOTP).
  // `token_chu` rỗng = không có đường nào vào với tư cách chủ (fail-closed).
  const token_chu = env.TOKEN_CHU;
  if (token_chu !== undefined && token_chu !== '' && bangNhauAnToan(token, token_chu)) {
    c.set('ai', { loai: 'chu' });
    c.set('qua_token_chu', true);
    /*
     * `DUONG_KHOI_TAO` là **ngoại lệ duy nhất** của phép tra workspace, và nó
     * phải là ngoại lệ: trên một DB vừa áp migration `workspaceDuyNhat` ném
     * `NOT_FOUND`, nên không có đường nào vào hệ được — kể cả chính đường tạo ra
     * workspace. `workspace_id` để chuỗi rỗng ở đây, và route khởi tạo **không
     * đọc** nó (nó tự tra / tự tạo workspace); mọi route khác vẫn nhận một
     * `workspace_id` đã tra như trước.
     */
    if (new URL(c.req.url).pathname === DUONG_KHOI_TAO) {
      c.set('workspace_id', '');
    } else {
      c.set('workspace_id', await workspaceDuyNhat(env.DB));
    }
    await next();
    return;
  }

  const tra = await agentTheoToken(env.DB, bam);
  if (tra === null) throw new BatonError('INVALID_TOKEN');

  c.set('ai', tra.ai);
  c.set('workspace_id', tra.workspace_id);

  if (tra.ai.disabled) {
    throw new BatonError('FORBIDDEN', {
      message: 'Agent đã bị tắt, không gọi API được.',
    });
  }

  await next();
};
