/**
 * Đường **ĐỌC** Nhật ký quyết định — SPEC mục 10 d.311 ("Màn hình: **gom theo
 * ngày**, **lọc theo dự án** và **theo ai**, **tìm theo chữ**"), d.309 (cờ "đã
 * có quyết định mới"), 19.12 câu 4 ("Chung" là dự án rỗng).
 *
 * Lệnh đọc **không** qua cửa ghi (Durable Object): đi thẳng D1, nếp của
 * `doc-du-an.ts`, `doc-ticket.ts`, `doc-phien.ts`.
 *
 * Ba luật chi phối mọi truy vấn ở đây:
 *
 *  1. **Không lộ sự tồn tại.** Dòng ngoài phạm vi trả `NOT_FOUND`/404, không
 *     `FORBIDDEN`/403 — mục 13. Điều kiện phạm vi nằm **trong câu SQL**, không
 *     là một lần `if` sau khi đã đọc.
 *  2. **Tầm nhìn của dòng "Chung"** (`project_id IS NULL`) là một **đề xuất tạm
 *     chờ chủ chốt** — `cau-hoi-spec.md` #69. Nó sống ở **một chỗ duy nhất**,
 *     `@baton/shared` → `pham-vi-chung.ts`, dùng chung với đường đọc Cần Chủ
 *     của lượt sau. File này chỉ **dịch** kết luận đó sang SQL.
 *  3. **Phân trang keyset**, thứ tự `(luc DESC, id DESC)` — khớp
 *     `ix_nhat_ky_luc` / `ix_nhat_ky_du_an` / `ix_nhat_ky_ai` của 0014, và là
 *     thứ tự **toàn phần** (bài học `test/phan-trang.test.ts`).
 */

import {
  BatonError,
  chuanHoaTimChu,
  kiemLimit,
  kiemTimChu,
  maCanChu,
  moCursor,
  ngayDiaPhuong,
  sqlDongChung,
  tamNhinDongChung,
  thoatLike,
  type AiGoi,
  type TrangKetQua,
  type YeuCauTrang,
} from '@baton/shared';
import { dungTrang } from './doc-du-an.js';
import { chayTheoLo } from './chia-lo-tham-so.js';

/* ------------------------------------------------------------------ *
 * Hình dạng ra
 * ------------------------------------------------------------------ */

/** Một căn cứ của dòng — d.308. */
export interface CanCuRa {
  loai: string;
  /** Id của đối tượng được trỏ tới (mục Cần Chủ, ticket, hoặc dòng cũ). */
  id: string;
  /** `T-số` khi `loai = 'ask'`; `null` với hai loại kia. */
  ma_can_chu: string | null;
}

export interface DongNhatKyRa {
  id: string;
  luc: number;
  /** **Ngày địa phương** `YYYY-MM-DD` — khoá gom của d.311. Dẫn xuất từ `luc`. */
  ngay: string;
  /** `'chu'` hoặc `'agent'` — d.308. */
  nguoi_loai: string;
  agent_id: string | null;
  /** `null` = **Chung**; UI hiện nhãn "Chung" — 19.12 câu 4. */
  project_id: string | null;
  quyet_dinh: string;
  vi_sao: string;
  /**
   * **d.309 — "dòng cũ hiện chữ 'đã có quyết định mới'".** Là một **dẫn xuất**
   * (có dòng nào trỏ về nó bằng căn cứ `dong_cu` không), **không** một cột:
   * một cột thì phải `UPDATE` dòng cũ để bật nó, đúng cái d.309 cấm và
   * `tg_nhat_ky_khong_sua` của 0014 chặn.
   */
  da_co_quyet_dinh_moi: boolean;
  can_cu: CanCuRa[];
}

/** Một nhóm của phép "gom theo ngày" — d.311. */
export interface NhomNgay {
  ngay: string;
  so_dong: number;
}

export interface TrangNhatKy extends TrangKetQua<DongNhatKyRa> {
  /**
   * **"Gom theo ngày"** (d.311) tính **trên trang hiện tại**, theo đúng thứ tự
   * các dòng đã trả về. Gom ở server chứ không để client tự làm: ngày là một
   * dẫn xuất theo **múi giờ của chủ** (`cau-hoi-spec.md` #68), và để client đoán
   * múi giờ là mở đường cho web và CLI gom khác nhau trên cùng dữ liệu.
   */
  nhom_theo_ngay: NhomNgay[];
}

/* ------------------------------------------------------------------ *
 * Phạm vi: dòng nào người gọi được thấy
 * ------------------------------------------------------------------ */

/**
 * Điều kiện phạm vi, ghép thẳng vào `WHERE`. Hai lớp dòng, hai luật khác nhau:
 *
 *   * dòng **có dự án**: nếp chung của Baton — chủ và agent "tất cả dự án" thấy
 *     hết, agent còn lại chỉ thấy dự án có trong `agent_project`.
 *   * dòng **Chung** (`project_id IS NULL`): `pham-vi-chung.ts`, đề xuất tạm
 *     #69. Cửa dự án không có gì để kiểm ở lớp này, nên nó cần luật riêng.
 *
 * **File này không dựng điều kiện nào cho lớp Chung.** Nó gọi `sqlDongChung` và
 * dán nguyên mảnh trả về — nếu không thì luật #69 có hai nguồn sự thật (ở đây
 * theo cờ `vao_tat_ca_du_an`, ở kia theo **vai**), và hai nguồn thì sẽ lệch.
 * Cờ `vao_tat_ca_du_an` dưới đây chỉ quyết lớp dòng **có dự án**, là nếp chung
 * của Baton, không liên quan tới #69.
 *
 * Trả cả mảnh SQL và tham số, để chỗ gọi không bao giờ ghép chuỗi có dữ liệu.
 * `sql` rỗng = **không giới hạn gì** (chủ, hoặc `coordinator` có cờ "tất cả").
 * Mảnh trả về **không** mang sẵn `AND`: chỗ gọi tự ghép, nên không có chỗ nào
 * phải cắt lại chuỗi.
 */
export function locPhamViNhatKy(ai: AiGoi): { sql: string; bind: string[] } {
  // Lớp dòng **Chung** — một chỗ duy nhất, `@baton/shared` → `pham-vi-chung.ts`.
  const ve_chung = sqlDongChung(ai, { du_an: 'project_id', agent: 'agent_id' });

  // Lớp dòng **có dự án** — nếp chung của Baton, không phải luật #69.
  const thay_moi_du_an = ai.loai === 'chu' || ai.vao_tat_ca_du_an;

  // Không giới hạn gì: thấy mọi dòng có dự án **và** mọi dòng Chung. Mức tầm
  // nhìn vẫn hỏi đúng hàm luật, không đoán lại từ mảnh SQL.
  if (thay_moi_du_an && tamNhinDongChung(ai) === 'moi_dong') {
    return { sql: '', bind: [] };
  }

  const ve_du_an = thay_moi_du_an
    ? { sql: 'project_id IS NOT NULL', bind: [] as string[] }
    : {
        sql: 'project_id IN (SELECT project_id FROM agent_project WHERE agent_id = ?)',
        bind: [ai.loai === 'agent' ? ai.agent_id : ''],
      };

  const ve = ve_chung === null ? [ve_du_an] : [ve_du_an, ve_chung];
  return {
    sql: `(${ve.map((v) => v.sql).join(' OR ')})`,
    bind: ve.flatMap((v) => v.bind),
  };
}

/* ------------------------------------------------------------------ *
 * Liệt kê — d.311
 * ------------------------------------------------------------------ */

/**
 * Giá trị của `?project_id=` nghĩa là **lọc lấy dòng Chung** — 19.12 câu 4.
 *
 * **Đánh đổi đã biết, khai thẳng:** đây là một **chuỗi phép thuật** trong không
 * gian giá trị của `project_id`. Một dự án có `id` đúng bằng `'chung'` sẽ không
 * lọc được bằng bộ lọc này (nó rơi vào nhánh "Chung"); cùng chuyện đó với
 * `ai_loc = 'chu'` và một agent có `id` đúng bằng `'chu'`.
 *
 * Chấp nhận ở v0.1 vì `id` của Baton do server cấp (`pj-…`, `ag-…`), nên hai
 * va chạm đó không xảy ra với dữ liệu thật; chỉ một người gọi API tự đặt `id`
 * mới dựng được. Giá của việc tránh hẳn là một tham số thứ hai
 * (`?du_an_chung=1`, `?ai_loai=chu`) ở mọi đường đọc — đắt hơn chỗ nó bịt. Có
 * **ca biên** khoá đúng hành vi hiện tại, nên nếu sau này đổi thiết kế thì ca
 * đó đỏ chứ không âm thầm.
 */
export const LOC_CHUNG = 'chung';

/** Giá trị của `?ai_loc=` nghĩa là **lọc lấy dòng của chủ** — xem `LOC_CHUNG`. */
export const LOC_AI_CHU = 'chu';

export interface YeuCauLietKeNhatKy extends YeuCauTrang {
  /**
   * **Lọc theo dự án** (d.311). `'chung'` = chỉ dòng Chung (`project_id IS
   * NULL`) — 19.12 câu 4 nói bộ lọc dự án có một lựa chọn "Chung".
   */
  project_id?: string | undefined;
  /**
   * **Lọc theo ai** (d.311). `'chu'` = dòng của chủ; mọi giá trị khác là
   * `agent_id`.
   */
  ai_loc?: string | undefined;
  /** **Tìm theo chữ** (d.311) — chuỗi con trong trường "quyết định". */
  tim?: string | undefined;
}

interface DongTho {
  id: string;
  luc: number;
  nguoi_loai: string;
  agent_id: string | null;
  project_id: string | null;
  quyet_dinh: string;
  vi_sao: string;
  co_quyet_dinh_moi: number;
}

/** `SELECT` dùng chung cho cả liệt kê lẫn đọc một dòng. */
const COT_NHAT_KY =
  `id, luc, nguoi_loai, agent_id, project_id, quyet_dinh, vi_sao,
   EXISTS (SELECT 1 FROM nhat_ky_can_cu cc
            WHERE cc.dong_cu_id = nhat_ky.id) AS co_quyet_dinh_moi`;

export async function lietKeNhatKy(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  yeu_cau: YeuCauLietKeNhatKy = {},
): Promise<TrangNhatKy> {
  const limit = kiemLimit(yeu_cau.limit);
  const dieu_kien = ['workspace_id = ?'];
  const bind: (string | number)[] = [workspace_id];

  // Phạm vi — **trong câu SQL**, không phải một lần lọc sau khi đọc.
  const pham_vi = locPhamViNhatKy(ai);
  if (pham_vi.sql !== '') {
    dieu_kien.push(pham_vi.sql);
    bind.push(...pham_vi.bind);
  }

  // **Lọc theo dự án** — d.311, 19.12 câu 4.
  if (yeu_cau.project_id !== undefined && yeu_cau.project_id !== '') {
    if (yeu_cau.project_id === LOC_CHUNG) {
      dieu_kien.push('project_id IS NULL');
    } else {
      dieu_kien.push('project_id = ?');
      bind.push(yeu_cau.project_id);
    }
  }

  // **Lọc theo ai** — d.311.
  if (yeu_cau.ai_loc !== undefined && yeu_cau.ai_loc !== '') {
    if (yeu_cau.ai_loc === LOC_AI_CHU) {
      dieu_kien.push("nguoi_loai = 'chu'");
    } else {
      dieu_kien.push("nguoi_loai = 'agent' AND agent_id = ?");
      bind.push(yeu_cau.ai_loc);
    }
  }

  /*
   * **Tìm theo chữ** — d.311. Chuỗi con, không phân biệt hoa/thường **ASCII**
   * (giới hạn khai ở 0014 và `chuanHoaTimChu`). `lower()` ở cả hai vế để phép so
   * nằm **trong SQL**, không một nửa trong bộ nhớ — bài học #70 của lượt 1.
   *
   * `ESCAPE '\'` là bắt buộc đi cùng `thoatLike`: không có nó thì một dấu `%`
   * người dùng gõ vẫn là ký tự đại diện.
   */
  const tim = kiemTimChu(yeu_cau.tim);
  if (tim !== null) {
    dieu_kien.push("lower(quyet_dinh) LIKE ? ESCAPE '\\'");
    bind.push(`%${thoatLike(chuanHoaTimChu(tim))}%`);
  }

  if (yeu_cau.cursor !== undefined) {
    const [luc, id] = moCursor(yeu_cau.cursor, 2);
    dieu_kien.push('(luc, id) < (?, ?)');
    bind.push(Number(luc), String(id));
  }

  const { results } = await db
    .prepare(
      `SELECT ${COT_NHAT_KY} FROM nhat_ky WHERE ${dieu_kien.join(' AND ')}
        ORDER BY luc DESC, id DESC LIMIT ?`,
    )
    .bind(...bind, limit + 1)
    .all<DongTho>();

  const trang = dungTrang(
    results,
    limit,
    (d) => d,
    (d) => [d.luc, d.id],
  );

  // Căn cứ của **đúng những dòng được trả về** — một câu, không N+1.
  const can_cu = await canCuCuaCacDong(
    db,
    workspace_id,
    trang.items.map((d) => d.id),
  );

  const items = trang.items.map((d) => raDong(d, can_cu.get(d.id) ?? []));
  return { items, cursor_sau: trang.cursor_sau, nhom_theo_ngay: gomTheoNgay(items) };
}

/* ------------------------------------------------------------------ *
 * Một dòng
 * ------------------------------------------------------------------ */

/**
 * Một dòng theo id. Ngoài phạm vi (kể cả dòng Chung mà người gọi không được
 * thấy — #69) → `NOT_FOUND`, **không** `FORBIDDEN`: mục 13, "không lộ sự tồn
 * tại".
 */
export async function layNhatKy(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  id: string,
): Promise<DongNhatKyRa> {
  const pham_vi = locPhamViNhatKy(ai);
  const d = await db
    .prepare(
      `SELECT ${COT_NHAT_KY} FROM nhat_ky
        WHERE id = ? AND workspace_id = ?${pham_vi.sql === '' ? '' : ` AND ${pham_vi.sql}`}`,
    )
    .bind(id, workspace_id, ...pham_vi.bind)
    .first<DongTho>();
  if (d === null) {
    throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy dòng Nhật ký.' });
  }
  const can_cu = await canCuCuaCacDong(db, workspace_id, [d.id]);
  return raDong(d, can_cu.get(d.id) ?? []);
}

/* ------------------------------------------------------------------ *
 * Giúp việc
 * ------------------------------------------------------------------ */

function raDong(d: DongTho, can_cu: CanCuRa[]): DongNhatKyRa {
  return {
    id: d.id,
    luc: d.luc,
    ngay: ngayDiaPhuong(d.luc),
    nguoi_loai: d.nguoi_loai,
    agent_id: d.agent_id,
    project_id: d.project_id,
    quyet_dinh: d.quyet_dinh,
    vi_sao: d.vi_sao,
    da_co_quyet_dinh_moi: d.co_quyet_dinh_moi === 1,
    can_cu,
  };
}

/**
 * Gom các dòng **của trang hiện tại** theo ngày — d.311.
 *
 * Dòng đã sắp theo `luc DESC`, nên các dòng cùng ngày luôn **liền nhau**: phép
 * gom là một lần duyệt, và thứ tự nhóm giữ đúng thứ tự màn hình.
 */
function gomTheoNgay(items: readonly DongNhatKyRa[]): NhomNgay[] {
  const ra: NhomNgay[] = [];
  for (const d of items) {
    const cuoi = ra.at(-1);
    if (cuoi !== undefined && cuoi.ngay === d.ngay) cuoi.so_dong += 1;
    else ra.push({ ngay: d.ngay, so_dong: 1 });
  }
  return ra;
}

/** Căn cứ của một lô dòng — một câu truy vấn, không N+1. */
async function canCuCuaCacDong(
  db: D1Database,
  workspace_id: string,
  ids: readonly string[],
): Promise<Map<string, CanCuRa[]>> {
  const ra = new Map<string, CanCuRa[]>();
  if (ids.length === 0) return ra;

  /*
   * Chia lô (`chia-lo-tham-so.ts`): trang Nhật ký lấy tới 200 dòng
   * (`LIMIT_TRANG_TOI_DA`), vượt trần 100 tham số của D1. 1 tham số khác
   * (`workspace_id`). `ORDER BY cc.nhat_ky_id, cc.thu_tu` chỉ cần đúng **trong
   * một dòng** (bảng tra theo `nhat_ky_id`), và mỗi dòng nằm trọn một lô ⇒ thứ
   * tự căn cứ giữ nguyên.
   */
  const results = await chayTheoLo(ids, 1, async (lo, cho) => {
    const r = await db
      .prepare(
        `SELECT cc.nhat_ky_id, cc.loai, cc.can_chu_id, cc.ticket_id, cc.dong_cu_id,
                ct.ma_so AS can_chu_ma_so
           FROM nhat_ky_can_cu cc
           LEFT JOIN can_chu ct ON ct.id = cc.can_chu_id
          WHERE cc.workspace_id = ? AND cc.nhat_ky_id IN (${cho})
          ORDER BY cc.nhat_ky_id, cc.thu_tu`,
      )
      .bind(workspace_id, ...lo)
      .all<{
        nhat_ky_id: string;
        loai: string;
        can_chu_id: string | null;
        ticket_id: string | null;
        dong_cu_id: string | null;
        can_chu_ma_so: number | null;
      }>();
    return r.results;
  });

  for (const r of results) {
    const id = r.can_chu_id ?? r.ticket_id ?? r.dong_cu_id ?? '';
    const danh_sach = ra.get(r.nhat_ky_id) ?? [];
    danh_sach.push({
      loai: r.loai,
      id,
      ma_can_chu: r.can_chu_ma_so === null ? null : maCanChu(r.can_chu_ma_so),
    });
    ra.set(r.nhat_ky_id, danh_sach);
  }
  return ra;
}
