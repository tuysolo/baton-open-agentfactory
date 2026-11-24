/**
 * **Xuất toàn bộ dữ liệu ra JSON** — SPEC mục 15 d.429 ("xuất toàn bộ dữ liệu ra
 * JSON bằng một nút (chỉ chủ)"), BAT-8.
 *
 * Một hàm dựng bản xuất (`dungBanXuat`) **dùng chung** cho hai đường:
 *   * `GET /v1/xuat` — nút trên trang Cài đặt và `baton export <file>`; cổng "chỉ
 *     chủ" nằm **trong** `xuatDuLieu` (nếp `tongQuan`/`manHinhBanDo`), không ở route.
 *   * sao lưu tự động hằng ngày lên R2 (`sao-luu.ts`) — cùng định dạng, nên một bản
 *     tải từ R2 và một bản bấm nút đọc được bằng cùng một cách.
 *
 * Lệnh **ĐỌC**: đi thẳng D1, không qua cửa ghi, không ghi gì.
 *
 * ## DANH SÁCH TRẮNG, không `SELECT *`
 *
 * `BANG_XUAT` liệt kê **từng bảng và từng cột** được xuất. Một `SELECT *` mù sẽ
 * xuất luôn mọi cột mà một migration sau thêm vào — kể cả một cột bí mật — mà diff
 * không cho ai thấy. Ở đây một cột mới **không** ra file cho tới khi ai đó viết tên
 * nó vào danh sách.
 *
 * Mặt kia của cùng một rủi ro: một bảng/cột mới mà **không ai** thêm vào thì bản
 * sao lưu thiếu dữ liệu im lặng. Nên `test/xuat-du-lieu.test.ts` so **mọi** bảng và
 * **mọi** cột thật trong DB (sau migration) với `BANG_XUAT ∪ BANG_LOAI_TRU` và
 * `BANG_XUAT[bảng] ∪ COT_LOAI_TRU[bảng]` — thêm một bảng hay một cột mà không quyết
 * "xuất" hay "loại" là ca đó **đỏ**.
 *
 * ## Những gì KHÔNG BAO GIỜ ra file (mục 15 d.417 và nếp của nó)
 *
 * Xem `BANG_LOAI_TRU` và `COT_LOAI_TRU` — mỗi dòng mang lý do của nó. Tóm lại: băm
 * mật khẩu, muối, số vòng, secret TOTP, mọi cột `token_*` của agent (kể cả 4 ký tự
 * cuối), phiên đăng nhập của chủ. Bộ đếm 600 req/phút sống trong Durable Object
 * `GioiHanToken`, không trong D1, nên nó vốn không có đường ra đây; secret env
 * (`TOKEN_CHU`, `GITHUB_TOKEN`, `TELEGRAM_*`) không nằm trong DB.
 *
 * ## Giới hạn đã biết, khai thẳng
 *
 *   * **Không phải ảnh chụp nguyên tử.** Mỗi bảng đọc bằng nhiều câu `SELECT` theo
 *     trang (`rowid`), nên một lệnh ghi xen giữa có thể làm hai bảng lệch nhau một
 *     dòng. D1 chỉ cho giao dịch trong một `batch()`, mà một `batch()` không phân
 *     trang được. Với một bản sao lưu lúc 02:00 sáng, rủi ro này nhỏ; ghi ra để
 *     người khôi phục biết.
 *   * **Cả bản nằm trong bộ nhớ Worker** (JSON một cục). Ở mốc 200.000 ticket của
 *     19.12 câu 1 thì có thể chạm trần bộ nhớ 128 MB của Worker — chưa đo. Ghi vào
 *     "Việc phát sinh" của BAT-8 (stream ra R2 theo từng bảng).
 */

import { BatonError, ngayDiaPhuong, type AiGoi } from '@baton/shared';

/**
 * **Phiên bản định dạng** của bản xuất. Tăng khi **hình** của file đổi (đổi tên
 * khoá đỉnh, đổi cách lưu một bảng) — **không** tăng khi chỉ thêm một bảng/cột (thứ
 * đó đọc được ở `migration_cuoi`).
 */
export const PHIEN_BAN_DINH_DANG = 1;

/**
 * **Migration cuối mà danh sách trắng này đã đối chiếu.** Người khôi phục so nó với
 * migration của DB đích. Có ca test so hằng này với **file migration cuối thật**
 * trong `packages/api/migrations/` — thêm `0026_…` mà không xem lại danh sách là ca
 * đó đỏ.
 */
// 0028 (BAT-40) không thêm bảng/cột — chỉ dựng lại trigger.
// 0029 (Bản đồ L1, SPEC 20.1) thêm 7 cột (project ×4, ticket ×2, workspace ×1) và
// bảng `project_history` — đã thêm vào danh sách trắng dưới đây.
export const MIGRATION_CUOI = '0029_ban_do_du_an';

/**
 * **Bảng → cột được xuất.** Thứ tự khoá = thứ tự trong file: bảng cha trước bảng con,
 * để một lượt khôi phục tay đi từ trên xuống là chèn được theo khoá ngoài.
 */
export const BANG_XUAT: Readonly<Record<string, readonly string[]>> = {
  // `gioi_han_wip` — 0029 (Bản đồ L1, SPEC 20.1).
  workspace: ['id', 'ten_chu', 'gioi_han_wip', 'tao_luc', 'cap_nhat_luc'],
  agent: [
    'id',
    'workspace_id',
    'ten',
    'vai_tro',
    'model',
    'mo_ta',
    'disabled',
    'vao_tat_ca_du_an',
    'len_tieng_luc',
    'nguong_dung_phut',
    'tao_luc',
    'cap_nhat_luc',
  ],
  project: [
    'id',
    'workspace_id',
    'ten',
    'ma',
    'mo_ta',
    'mau',
    'trang_thai',
    'quan_ly_agent_id',
    'nhom',
    'khong_code',
    'bat_buoc_review',
    'nguong_dung_phut',
    // 0029 (Bản đồ L1, SPEC 20.1).
    'uu_tien',
    'dang_day',
    'duy_tri',
    'ten_ngan',
    'tao_luc',
    'cap_nhat_luc',
  ],
  agent_project: ['workspace_id', 'agent_id', 'project_id', 'tao_luc'],
  agent_permission: ['workspace_id', 'agent_id', 'viec', 'cho_phep', 'pham_vi', 'cap_nhat_luc'],
  /*
   * Bộ đếm số ticket / T-số — **dữ liệu nghiệp vụ**, không phải "bộ đếm giới hạn"
   * request: thiếu nó thì một lượt khôi phục cấp lại số đã dùng, vỡ luật "mã không
   * tái dùng" (mục 4, mục 8).
   */
  bo_dem: ['workspace_id', 'pham_vi', 'khoa', 'gia_tri'],
  project_ho_so: [
    'project_id',
    'workspace_id',
    'la_gi',
    'thu_muc',
    'repo_chu_so_huu',
    'repo_ten',
    'repo_nhanh_mac_dinh',
    'stack',
    'doc_truoc',
    'cach_deploy',
    'danh_sach_cam',
    'phien_ban',
    'tao_luc',
    'cap_nhat_luc',
  ],
  project_ho_so_ban: [
    'id',
    'workspace_id',
    'project_id',
    'phien_ban',
    'anh_json',
    'sua_boi_loai',
    'sua_boi_agent_id',
    'luc',
  ],
  project_loi_da_gap: [
    'id',
    'workspace_id',
    'project_id',
    'ngay',
    'loi',
    'cach_tranh',
    'ghi_boi_loai',
    'ghi_boi_agent_id',
    'tao_luc',
  ],
  luat_chung: ['workspace_id', 'danh_sach_cam', 'checklist', 'cap_nhat_luc'],
  ticket: [
    'id',
    'workspace_id',
    'project_id',
    'so',
    'tieu_de',
    'mo_ta',
    'muc_tieu',
    'boi_canh',
    'pham_vi',
    'file_va_nguon',
    'dieu_cam',
    'xong_la_gi',
    'cach_kiem_chung',
    'nop_lai',
    'trang_thai',
    'uu_tien',
    'hang_uu_tien',
    'chiu_trach_nhiem_loai',
    'chiu_trach_nhiem_agent_id',
    'han_luc',
    'nguoi_tao_loai',
    'nguoi_tao_agent_id',
    'tao_luc',
    'cap_nhat_luc',
    'bat_dau_luc',
    'xong_luc',
    'co_xong_khong_bang_chung',
    'co_nhap_khong_bang_chung',
    'co_khong_ai_cam',
    'co_can_review_lai',
    'ma_cu',
    'xoa_luc',
    'trung_voi_ticket_id',
    'ly_do_huy',
    'chu_tu_lam',
    'trong_tay_tu_luc',
    'can_review_lai_luc',
    // 0027 (BAT-37): cờ "ticket không code" (T-31 câu 3.4 A).
    'khong_code',
    // 0029 (Bản đồ L1, SPEC 20.1): khối việc lớn + vị trí trên đồi.
    'khoi_lon',
    'doi',
  ],
  ticket_link: ['workspace_id', 'tu_ticket_id', 'den_ticket_id', 'loai', 'tao_luc'],
  ticket_label: ['workspace_id', 'ticket_id', 'nhan', 'tao_luc'],
  ticket_history: [
    'id',
    'workspace_id',
    'ticket_id',
    'tac_gia_loai',
    'tac_gia_agent_id',
    'luc',
    'truong',
    'gia_tri_cu',
    'gia_tri_moi',
  ],
  // 0029 (Bản đồ L1, SPEC 20.1): lịch sử chỉ thêm của trường dự án + giới hạn WIP.
  project_history: [
    'id',
    'workspace_id',
    'project_id',
    'tac_gia_loai',
    'tac_gia_agent_id',
    'luc',
    'truong',
    'gia_tri_cu',
    'gia_tri_moi',
  ],
  comment: [
    'id',
    'workspace_id',
    'ticket_id',
    'tac_gia_loai',
    'tac_gia_agent_id',
    'noi_dung',
    'da_sua',
    'tao_luc',
    'cap_nhat_luc',
    'xoa_luc',
  ],
  luot_giao: [
    'id',
    'workspace_id',
    'ticket_id',
    'so_luot',
    'loai',
    'nguoi_giao_loai',
    'nguoi_giao_agent_id',
    'nguoi_nhan_agent_id',
    'trang_thai',
    'muc_tieu',
    'boi_canh',
    'pham_vi',
    'file_va_nguon',
    'dieu_cam',
    'xong_la_gi',
    'cach_kiem_chung',
    'nop_lai',
    'han_phan_hoi_luc',
    'ly_do',
    'luot_truoc_id',
    'tao_luc',
    'nhan_luc',
    'dong_luc',
    'cap_nhat_luc',
    'ket_qua',
    'bc_da_lam',
    'bc_kiem_chung',
    'bc_nhanh_va_commit',
    'bc_rui_ro',
    'bc_viec_phat_sinh',
    'nop_luc',
  ],
  phien: [
    'id',
    'workspace_id',
    'luot_giao_id',
    'ticket_id',
    'agent_id',
    'trang_thai',
    'tin_hieu_cuoi_luc',
    'ghi_chu_cuoi',
    'can_chu_id',
    'stopping_luc',
    'mo_luc',
    'dong_luc',
    'ly_do_dong',
    'cap_nhat_luc',
    'waiting_assigner_luc',
    'canh_bao_tin_hieu_luc',
    'tra_loi_doc_luc',
    'ke_hoach_phien_ban',
    'error_luc',
  ],
  phien_hoat_dong: [
    'id',
    'workspace_id',
    'phien_id',
    'ticket_id',
    'loai',
    'tac_gia_loai',
    'tac_gia_agent_id',
    'noi_dung',
    'ten_thao_tac',
    'tham_so',
    'ket_qua_thao_tac',
    'tam_thoi',
    'tra_loi_cho_id',
    'thu_tu',
    'gui_luc',
  ],
  phien_ke_hoach: [
    'id',
    'workspace_id',
    'phien_id',
    'phien_ban',
    'thu_tu',
    'noi_dung',
    'trang_thai',
    'gui_luc',
  ],
  evidence: [
    'id',
    'workspace_id',
    'ticket_id',
    'loai',
    'nguoi_gui_loai',
    'nguoi_gui_agent_id',
    'gui_luc',
    'xac_minh',
    'ly_do',
    'xac_minh_luc',
    'so_lan_thu',
    'thu_lai_luc',
    'theo_doi_den_luc',
    'commit_hash',
    'repo',
    'url',
    'ma_phien_ban',
    'ma_http',
    'ket_luan',
    'ghi_chu',
    'tom_tat',
    'test_dat',
    'duong_dan',
    'noi_dung',
    'rut_luc',
    'rut_ly_do',
    'rut_boi_loai',
    'rut_boi_agent_id',
    'tao_luc',
    'cap_nhat_luc',
    'chua_merge_luc',
    'chua_merge_bao_moc',
    'merged_cuc_bo',
    'nguon_xac_minh',
    'review_nguon',
    'review_bao_cao',
    /*
     * 0027 (BAT-37): dấu "báo cáo" + nguồn ký, và báo cáo reviewer của manager.
     * Bản xuất là **bản sao lưu khôi phục được**, nên nó giữ CỘT THÔ: dòng báo cáo
     * ra với `loai = 'note'`/`'file'` kèm `bao_cao_nguon` khác NULL — đúng thứ
     * CHECK của 0009 nhận khi chèn lại. Đổi `loai` thành `bao_cao` ở đây là làm
     * bản sao lưu không chèn lại được. Người đọc bản xuất: `bao_cao_nguon IS NOT
     * NULL` ⇒ loại `bao_cao` (cùng luật `sqlLoaiBangChung`).
     */
    'bao_cao_nguon',
    'bao_cao_reviewer',
  ],
  can_chu: [
    'id',
    'workspace_id',
    'ma_so',
    'tieu_de',
    'project_id',
    'muc',
    'loai',
    'trang_thai',
    'boi_canh',
    'han_luc',
    'ly_do_de_xuat',
    'lenh',
    'can_tty',
    'trung_voi_can_chu_id',
    'tao_luc',
    'cap_nhat_luc',
    'tao_boi_agent_id',
    'ket_qua',
    'phuong_an_da_chon_id',
    'ket_luan_review',
    'ly_do_bo_qua',
    'xu_ly_luc',
    'mo_lai_lan',
    'xac_nhan_ticket_id',
    'nhac_do_luc',
    'lenh_kem',
    'can_tty_kem',
  ],
  can_chu_phuong_an: [
    'id',
    'workspace_id',
    'can_chu_id',
    'nhan',
    'noi_dung',
    'de_xuat',
    'thu_tu',
    'tao_luc',
  ],
  can_chu_file: ['id', 'workspace_id', 'can_chu_id', 'loai', 'dia_chi', 'thu_tu', 'tao_luc'],
  can_chu_ticket: ['workspace_id', 'can_chu_id', 'ticket_id', 'tao_luc'],
  nhat_ky: ['id', 'workspace_id', 'luc', 'nguoi_loai', 'agent_id', 'project_id', 'quyet_dinh', 'vi_sao'],
  nhat_ky_can_cu: [
    'id',
    'workspace_id',
    'nhat_ky_id',
    'loai',
    'can_chu_id',
    'ticket_id',
    'dong_cu_id',
    'thu_tu',
    'tao_luc',
  ],
  /*
   * Kho thông báo trong app (chuông, mục 12 d.339) — dữ liệu nghiệp vụ: nó là thứ
   * đã nói với chủ. Xem `COT_LOAI_TRU.thong_bao` cho cột bị bỏ.
   */
  thong_bao: [
    'id',
    'workspace_id',
    'loai',
    'noi_dung',
    'phien_id',
    'ticket_id',
    'agent_id',
    'bang_chung_id',
    'tao_luc',
    'doc_luc',
    'gui_telegram_luc',
    'can_chu_id',
    'uu_tien',
    'gui_so_lan_thu',
    'gui_thu_lai_luc',
    // 0026 (BAT-16): mã sự kiện bảo mật — không bí mật (chỉ là tên sự kiện), và
    // mốc "không gửi vì chủ tắt loại này".
    'bao_mat',
    'bo_qua_gui_luc',
  ],
  /* Công tắc từng loại thông báo — mục 12 d.348, 0026. Cài đặt của chủ, không bí mật. */
  cai_dat_thong_bao: ['workspace_id', 'cong_tac', 'bat', 'cap_nhat_luc'],
  bao_cao: ['workspace_id', 'ngay', 'loai', 'noi_dung_md', 'du_lieu_json', 'tao_luc'],
  trong_tam: ['workspace_id', 'ngay', 'thu_tu', 'ticket_id', 'ghi_chu', 'agent_id', 'tao_luc'],
};

/**
 * **Bảng CỐ Ý không xuất**, kèm lý do. Không có ở đây và không có ở `BANG_XUAT` ⇒
 * ca test so lược đồ đỏ.
 */
export const BANG_LOAI_TRU: Readonly<Record<string, string>> = {
  chu_tai_khoan:
    'Tài khoản chủ: băm mật khẩu, muối, số vòng, secret TOTP (mục 15 d.417). Loại CẢ bảng ' +
    'chứ không chỉ các cột bí mật — phần còn lại (bộ đếm thử sai, mốc khoá) là dữ liệu bảo ' +
    'mật, không nghiệp vụ; khôi phục thì chủ thiết lập lại tài khoản.',
  chu_phien:
    'Phiên đăng nhập web của chủ: khoá chính là băm id phiên (tương đương cookie). ' +
    'Không nghiệp vụ, và một bản sao lưu lộ ra không được mang theo phiên dùng được.',
  d1_migrations: 'Bảng hệ thống của wrangler/D1 — thay bằng trường `migration_cuoi`.',
};

/** Tiền tố tên bảng **hệ thống** (SQLite, Cloudflare) — không bao giờ là dữ liệu. */
export const TIEN_TO_BANG_HE_THONG = ['sqlite_', '_cf_'] as const;

/**
 * **Cột CỐ Ý không xuất** trong một bảng có xuất, kèm lý do.
 */
export const COT_LOAI_TRU: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  agent: {
    token_bam: 'Băm token agent (mục 3, 15) — không bao giờ ra ngoài.',
    token_bon_cuoi:
      '4 ký tự cuối token. Không bí mật theo mục 3 d.83, nhưng bỏ cho chắc: một bản sao ' +
      'lưu không cần nó, và khôi phục thì token phải cấp lại.',
    token_tao_luc: 'Thuộc nhóm token; token không đi theo bản sao lưu nên mốc của nó vô nghĩa.',
    token_thu_hoi_luc: 'Như trên.',
  },
  thong_bao: {
    gui_loi_ly_do:
      'Lý do gửi Telegram trượt — chữ từ phản hồi của dịch vụ ngoài. Đã lọc chuỗi an toàn ' +
      'trước khi lưu, nhưng nó là dữ liệu vận hành, không nghiệp vụ; bỏ cho chắc.',
  },
};

/** Một dòng của một bảng trong bản xuất. */
export type DongXuat = Record<string, unknown>;

/** **Hình của bản xuất** — cũng là hình của mỗi object sao lưu trên R2. */
export interface BanXuat {
  schema_version: number;
  /** Lúc dựng, ISO 8601 UTC. */
  xuat_luc: string;
  /** Cùng mốc, epoch mili-giây (nếp mốc của Baton). */
  xuat_luc_ms: number;
  workspace_id: string;
  migration_cuoi: string;
  /** Bảng → các dòng, đúng thứ tự khoá của `BANG_XUAT`. */
  bang: Record<string, DongXuat[]>;
}

/** Số dòng mỗi trang khi đọc một bảng — xem "Giới hạn đã biết" đầu file. */
export const DONG_MOI_TRANG = 500;

/** Tên bảng/cột chỉ được là định danh SQL thường — chúng ghép thẳng vào câu SQL. */
const DINH_DANH = /^[a-z_][a-z0-9_]*$/;

/** Mọi dòng của **một** bảng thuộc **một** workspace, theo trang `rowid`. */
async function docBang(
  db: D1Database,
  bang: string,
  cot: readonly string[],
  workspace_id: string,
): Promise<DongXuat[]> {
  if (!DINH_DANH.test(bang) || !cot.every((c) => DINH_DANH.test(c))) {
    throw new Error(`Tên bảng/cột không hợp lệ trong danh sách xuất: ${bang}`);
  }
  // `workspace` không có cột `workspace_id`: khoá của nó là `id`.
  const cot_ws = bang === 'workspace' ? 'id' : 'workspace_id';
  const sql =
    `SELECT rowid AS _hang, ${cot.join(', ')} FROM ${bang} ` +
    `WHERE ${cot_ws} = ? AND rowid > ? ORDER BY rowid LIMIT ?`;

  const ra: DongXuat[] = [];
  let sau = 0;
  for (;;) {
    const { results } = await db
      .prepare(sql)
      .bind(workspace_id, sau, DONG_MOI_TRANG)
      .all<DongXuat & { _hang: number }>();
    for (const r of results) {
      const { _hang, ...dong } = r;
      sau = _hang;
      ra.push(dong);
    }
    if (results.length < DONG_MOI_TRANG) return ra;
  }
}

/**
 * **Dựng bản xuất** của một workspace — dùng chung cho API và cron sao lưu.
 *
 * **Không** có cổng quyền ở đây: cron không có "người gọi". Đường HTTP đi qua
 * `xuatDuLieu`, nơi có cổng.
 */
export async function dungBanXuat(
  db: D1Database,
  workspace_id: string,
  bay_gio: number,
): Promise<BanXuat> {
  const bang: Record<string, DongXuat[]> = {};
  // Tuần tự, không `Promise.all`: ~30 bảng, mỗi bảng một vài trang; song song chỉ
  // dồn ~30 truy vấn vào D1 cùng lúc mà không nhanh hơn bao nhiêu.
  for (const [ten, cot] of Object.entries(BANG_XUAT)) {
    bang[ten] = await docBang(db, ten, cot, workspace_id);
  }
  return {
    schema_version: PHIEN_BAN_DINH_DANG,
    xuat_luc: new Date(bay_gio).toISOString(),
    xuat_luc_ms: bay_gio,
    workspace_id,
    migration_cuoi: MIGRATION_CUOI,
    bang,
  };
}

/**
 * `GET /v1/xuat` — **chỉ chủ** (d.429). Chủ = phiên cookie hoặc `TOKEN_CHU`, cả hai
 * dựng `ai.loai === 'chu'` ở `xac-thuc.ts`. Agent (mọi vai trò, kể cả `coordinator`)
 * → `FORBIDDEN`.
 */
export async function xuatDuLieu(
  db: D1Database,
  ai: AiGoi,
  workspace_id: string,
  bay_gio: number,
): Promise<BanXuat> {
  if (ai.loai !== 'chu') {
    throw new BatonError('FORBIDDEN', {
      message: 'Xuất dữ liệu chỉ dành cho chủ (SPEC mục 15).',
    });
  }
  return await dungBanXuat(db, workspace_id, bay_gio);
}

/** Tên file tải về: `baton-<YYYY-MM-DD>.json`, ngày **trên tường** của chủ. */
export function tenFileXuat(bay_gio: number): string {
  return `baton-${ngayDiaPhuong(bay_gio)}.json`;
}
