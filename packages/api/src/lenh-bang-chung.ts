/**
 * **Gửi và rút bằng chứng** — SPEC mục 7 d.204–211, d.219, d.222; 19.3; mục 3
 * (bảng quyền, hàng "Nộp bằng chứng" và "Ghi kết quả review"); mục 13 d.364
 * (`baton evidence`).
 *
 * Hai lệnh ghi:
 *   1. `gui_bang_chung` — kiểm quyền, kiểm nội dung, chèn một dòng `evidence`.
 *   2. `rut_bang_chung` — d.222: bằng chứng **không sửa, không xoá**, chỉ "rút
 *      lại **kèm lý do**" (người gửi hoặc chủ).
 *
 * **Không có lần gọi mạng nào trong file này.** Xác minh (d.206, d.207) chạy ở
 * `xac-minh-bang-chung.ts`, **ngoài** Durable Object cửa ghi; kết luận quay về
 * bằng một lượt ghi thứ hai (`WorkspaceGate.ghiXacMinh`). Lý do đầy đủ ở đầu
 * `xac-minh-bang-chung.ts` và ở `cong-bang-chung.ts`. Nếu một lần `fetch()` xuất
 * hiện trong file này thì hàng đợi ghi của **cả workspace** đứng lại mỗi lần một
 * agent nộp bằng chứng.
 */

import {
  BatonError,
  CHO_THU_LAI_MS,
  batBuocQuyen,
  kiemLyDo,
  kiemNoiDungBangChung,
  loaiLuuTrongDb,
  xacMinhBanDau,
  type LoaiBangChung,
  type LyDoCanReviewLai,
  type NguonBaoCao,
  type NguonReview,
  type NoiDungBangChung,
  type TrangThaiTicket,
  type XacMinhLuuDuoc,
} from '@baton/shared';
import { apCoReviewLai } from './lenh-trang-thai.js';
import {
  batBuocKhongLuuTru,
  duAnBatBuoc,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
} from './lenh-khung.js';
import { ticketBatBuoc } from './lenh-ticket.js';
import { locThayDongConGhi } from './pham-vi-doc.js';
import { canXacMinh } from './xac-minh-bang-chung.js';

/* ------------------------------------------------------------------ *
 * Chỗ cắm của phần 4: repo mặc định của hồ sơ dự án — SPEC d.206
 * ------------------------------------------------------------------ */

/**
 * Repo GitHub trong **hồ sơ dự án** (SPEC mục 9) — d.206: repo "lấy từ hồ sơ dự
 * án **nếu không ghi**".
 *
 * Bảng hồ sơ dự án là **phần 4, chưa có**, nên hàm này trả `null` và hệ quả quan
 * sát được ngay: bằng chứng `commit` **phải ghi repo**, không thì
 * `kiemBangChungCommit` từ chối bằng `INVALID_INPUT` kèm đúng câu giải thích
 * ("hồ sơ dự án chưa ghi repo GitHub"). Mặc định như vậy là hướng **đóng**: trả
 * một repo đoán sẵn (vd `chu/baton`) thì một bằng chứng commit sẽ được xác minh
 * **trên repo của người khác**.
 *
 * Phần 4 đổi thân hàm này thành một truy vấn hồ sơ dự án. Không chỗ nào khác phải
 * sửa.
 */
export function repoMacDinhCuaDuAn(
  _db: D1Database,
  _project_id: string,
): Promise<string | null> {
  return Promise.resolve(null);
}

/* ================================================================== *
 * 1. Gửi bằng chứng — SPEC d.204–211, d.219; mục 3; 19.3
 * ================================================================== */

/**
 * Lệnh gửi bằng chứng.
 *
 * Các trường nội dung khai **tường minh** và kiểu `unknown` — không dùng
 * `Record<string, unknown>`: một chữ ký chỉ mục sẽ làm `TruongClient` (whitelist
 * của tầng HTTP ở `index.ts`) nhận **mọi** tên trường, tức mất đúng hàng rào
 * chống client tự khai trường của server. `unknown` vì `kiemNoiDungBangChung` là
 * chỗ kiểm kiểu lúc chạy, và nó không được tin kiểu tĩnh của dữ liệu từ dây.
 */
export interface LenhGuiBangChung extends LenhChung {
  loai: 'gui_bang_chung';
  ticket_id: string;
  /** Một trong sáu loại của d.204–211. */
  loai_bang_chung: string;
  /** `commit` — d.206. */
  commit_hash?: unknown;
  repo?: unknown;
  /** Lời khai "đã merge cục bộ" của người gửi — migration 0022 khối A. */
  merged_cuc_bo?: unknown;
  /** `deploy` — d.207, 19.12 câu 5. */
  url?: unknown;
  ma_phien_ban?: unknown;
  /** `review` — d.208. */
  ket_luan?: unknown;
  ghi_chu?: unknown;
  /** Đường dẫn báo cáo reviewer — **bắt buộc** khi người gửi là `manager`. */
  duong_dan_bao_cao?: unknown;
  /** `test` — d.209. */
  tom_tat?: unknown;
  dat?: unknown;
  /** `file` — d.210; và đường dẫn của một `bao_cao` (#161). */
  duong_dan?: unknown;
  /** `note` — d.211; và nội dung của một `bao_cao` (#161). */
  noi_dung?: unknown;
}

export interface KetQuaGuiBangChung {
  id: string;
  ticket_id: string;
  loai: LoaiBangChung;
  gui_luc: number;
  /** Trạng thái **lúc vừa gửi** — `pending` hoặc `not_required` (d.206–211). */
  xac_minh: XacMinhLuuDuoc;
  /**
   * Nội dung **đã kiểm và đã chuẩn hoá**. Worker đọc nó để gọi nguồn xác minh ở
   * chặng 2 — nên chặng đó không bao giờ gọi mạng theo dữ liệu thô của client.
   */
  noi_dung: NoiDungBangChung;
  /** Có bước xác minh bất đồng bộ không (d.206, d.207). */
  can_xac_minh: boolean;
  /** Mốc thử lại đã đặt sẵn (d.220) — xem ghi chú ở phần chèn dòng. */
  thu_lai_luc: number | null;
  /**
   * Ticket đã ở nhóm `closed` lúc gửi — 19.3 d.495: "Bằng chứng gửi **sau khi
   * Xong** vẫn được lưu và hiện nhãn **'sau khi xong'**". Nhãn là phần 6; cờ này
   * là nửa server của luật đó.
   */
  sau_khi_xong: boolean;
  /**
   * Cờ "cần review lại" **sau** lệnh này — 19.3 d.494, 19.11 d.555. Trả ra để test
   * và CLI (phần 5) đọc được kết luận qua đúng đường HTTP, không phải dò DB.
   */
  can_review_lai: boolean;
  /** Vì sao cờ bật; `null` khi cờ tắt. */
  can_review_lai_ly_do: LyDoCanReviewLai | null;
  /**
   * **Nguồn của một `review`** — `reviewer` (agent reviewer gửi) hay `manager`
   * (manager ghi, kèm báo cáo reviewer; migration 0022 khối B). `null` cho loại
   * khác và cho review do chủ gửi. Trả ra để CLI và web in được nguồn, nên không
   * ai đọc lẫn hai thứ đó.
   */
  review_nguon: NguonReview | null;
  /**
   * **Nguồn ký của một `bao_cao`** (migration 0027) — `reviewer`/`manager`/
   * `coordinator`/`owner`. `null` cho mọi loại khác.
   */
  bao_cao_nguon: NguonBaoCao | null;
  /**
   * Trạng thái ticket **sau** lệnh. d.494 "ticket **ở hoặc về** Chờ kiểm chứng":
   * gửi một `commit` mới lên một ticket Đang làm đã có review ĐẠT sẽ đưa nó **về**
   * Chờ kiểm chứng ngay trong lệnh này.
   */
  ticket_trang_thai: TrangThaiTicket;
}

/** Ba trạng thái nhóm `closed` của SPEC mục 0.1. */
const TRANG_THAI_DA_KET = ['done', 'canceled', 'duplicate'] as const;

/**
 * "**Khác người làm**" — SPEC 19.3 d.496, nguyên văn: "agent gửi review không
 * phải người nhận của **bất kỳ** lượt `worker` nào trên ticket đó. Sai thì bị từ
 * chối với `REVIEWER_IS_WORKER`."
 *
 * Chữ "bất kỳ" nên **không** lọc theo trạng thái lượt: một agent đã nộp và đã
 * được nghiệm thu vẫn là người làm của ticket đó.
 */
async function batBuocKhacNguoiLam(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
  agent_id: string,
  ten_loai: string,
): Promise<void> {
  const d = await db
    .prepare(
      `SELECT 1 AS co FROM luot_giao
        WHERE workspace_id = ? AND ticket_id = ? AND loai = 'work' AND nguoi_nhan_agent_id = ?
        LIMIT 1`,
    )
    .bind(workspace_id, ticket_id, agent_id)
    .first<{ co: number }>();
  if (d !== null) {
    throw new BatonError('REVIEWER_IS_WORKER', {
      message: `Agent này là người nhận một lượt work của ticket, nên không gửi được bằng chứng ${ten_loai} (SPEC 19.3).`,
    });
  }
}

/**
 * **Quyền KÝ** của một `review` hoặc một `bao_cao` — một hàm cho cả hai (T-31 câu
 * 3.4 A: "quyền ký giống hệt review"). Trả nguồn ký của agent, `null` khi người
 * gửi là chủ. Ba cửa, đúng thứ tự cũ của `review`:
 *   1. **vai trò** — hàng "Ghi kết quả review" của bảng mục 3 (`write_review`);
 *   2. **danh tính** — không phải người nhận bất kỳ lượt `work` nào
 *      (`REVIEWER_IS_WORKER`, 19.3 d.496);
 *   3. **manager phải kèm đường dẫn báo cáo của reviewer độc lập** (d.210).
 * Xem ghi chú dài ở `handlerGuiBangChung` về vì sao có từng cửa.
 */
async function kiemQuyenKy(
  lenh: LenhGuiBangChung,
  db: D1Database,
  ticket: { id: string; project_id: string },
  duong_dan_bao_cao: string | null,
  ten_loai: 'review' | 'báo cáo',
): Promise<NguonReview | null> {
  batBuocQuyen(lenh.ai, 'write_review', {
    project_id: ticket.project_id,
    ticket_id: ticket.id,
  });
  if (lenh.ai.loai !== 'agent') return null;
  await batBuocKhacNguoiLam(db, lenh.workspace_id, ticket.id, lenh.ai.agent_id, ten_loai);

  // coordinator: nguồn riêng, không bắt buộc báo cáo (migration 0025).
  const nguon: NguonReview =
    lenh.ai.vai_tro === 'manager'
      ? 'manager'
      : lenh.ai.vai_tro === 'coordinator'
        ? 'coordinator'
        : 'reviewer';
  if (nguon === 'manager' && duong_dan_bao_cao === null) {
    throw new BatonError('INVALID_INPUT', {
      message:
        `${ten_loai === 'review' ? 'Review' : 'Báo cáo'} do agent manager gửi bắt buộc kèm ` +
        'đường dẫn báo cáo của reviewer độc lập (trường duong_dan_bao_cao) — SPEC mục 7 d.208.',
    });
  }
  return nguon;
}

/** Giá trị 16 cột nội dung của `evidence`, theo đúng từng dòng bảng d.204–211. */
function cotNoiDung(nd: NoiDungBangChung): {
  commit_hash: string | null;
  repo: string | null;
  url: string | null;
  ma_phien_ban: string | null;
  ket_luan: string | null;
  ghi_chu: string | null;
  tom_tat: string | null;
  test_dat: number | null;
  duong_dan: string | null;
  noi_dung: string | null;
  /** Lời khai "đã merge cục bộ" của người gửi — migration 0022 khối A. */
  merged_cuc_bo: number;
  /** Đường dẫn báo cáo reviewer của một `review` — migration 0022 khối B. */
  review_bao_cao: string | null;
  /** Đường dẫn báo cáo reviewer của một `bao_cao` — migration 0027. */
  bao_cao_reviewer: string | null;
} {
  const rong = {
    commit_hash: null,
    repo: null,
    url: null,
    ma_phien_ban: null,
    ket_luan: null,
    ghi_chu: null,
    tom_tat: null,
    test_dat: null,
    duong_dan: null,
    noi_dung: null,
    merged_cuc_bo: 0,
    review_bao_cao: null,
    bao_cao_reviewer: null,
  };
  switch (nd.loai) {
    case 'commit':
      return {
        ...rong,
        commit_hash: nd.commit_hash,
        repo: nd.repo,
        merged_cuc_bo: nd.merged_cuc_bo ? 1 : 0,
      };
    case 'deploy':
      return { ...rong, url: nd.url, ma_phien_ban: nd.ma_phien_ban };
    case 'review':
      return {
        ...rong,
        ket_luan: nd.ket_luan,
        ghi_chu: nd.ghi_chu,
        review_bao_cao: nd.duong_dan_bao_cao,
      };
    case 'test':
      return { ...rong, tom_tat: nd.tom_tat, test_dat: nd.dat ? 1 : 0 };
    case 'file':
      return { ...rong, duong_dan: nd.duong_dan };
    case 'note':
      return { ...rong, noi_dung: nd.noi_dung };
    case 'bao_cao':
      // Mượn `note`/`file` (`loaiLuuTrongDb`); cả hai cột có thể cùng có giá trị.
      return {
        ...rong,
        duong_dan: nd.duong_dan,
        noi_dung: nd.noi_dung,
        bao_cao_reviewer: nd.duong_dan_bao_cao,
      };
  }
}

/*
 * ------------------------------------------------------------------ *
 * KHÔNG có chặng `SESSION_CLOSED` ở hai lệnh bằng chứng — **cố ý**, không sót.
 * SPEC 19.12 câu 45 + `cau-hoi-spec.md` #67.
 *
 * Câu 45 chốt `SESSION_CLOSED` chỉ áp cho "lệnh gắn rõ **một lượt giao**", và kể
 * "**bằng chứng của lượt**" vào nhóm bị chặn. Nhưng trong mô hình dữ liệu hiện
 * tại một dòng `evidence` **không gắn lượt giao nào** — nó chỉ gắn `ticket_id`
 * (xem `LenhGuiBangChung`, bảng `evidence`), nên không xác định được "bằng chứng
 * **của lượt**" là dòng nào. Đó là câu hỏi SPEC **#67**.
 *
 * Lượt này cài theo **hướng (a)** của #67: coi `gui_bang_chung` / `rut_bang_chung`
 * là **lệnh ghi chung** (cùng nhóm với bình luận và sửa ticket ở câu 45), nên
 * **không** chặn theo phiên. Hai căn cứ: nó khớp mô hình dữ liệu hiện tại, và nó
 * là hướng **không thêm chặn mới** — siết thêm quyền dựa trên một suy đoán là
 * hướng khó lùi hơn.
 *
 * Phiên spec chốt hướng (b) ("chặn khi agent gửi đang có một lượt trên ticket đó
 * mà phiên đã đóng") thì chỗ cắm là ngay đây và ở `handlerRutBangChung`, bằng
 * `chanNeuPhienDaDong` của `lenh-phien.ts` — cùng khuôn với `lenh-hoat-dong.ts`
 * và `lenh-nop-nghiem-thu.ts`.
 * ------------------------------------------------------------------ */
export async function handlerGuiBangChung(
  lenh: LenhGuiBangChung,
  { db, bay_gio, cong }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaGuiBangChung>> {
  // Ticket người gọi không thấy ⇒ `NOT_FOUND` giống hệt id bịa (BAT-58, 19.12 câu
  // 15) — **trước** kiểm dự án lưu trữ (thông điệp của nó kể trạng thái dự án) và
  // trước quyền.
  const ticket = await ticketBatBuoc(db, lenh.workspace_id, lenh.ticket_id, false, lenh.ai);
  const du_an = await duAnBatBuoc(db, lenh.workspace_id, ticket.project_id);
  // Dự án `archived` là **chỉ đọc** (SPEC mục 2). `paused` thì vẫn nhận bằng
  // chứng: nó chỉ chặn **việc mới** (mục 2), mà bằng chứng là phần cuối của một
  // việc đã đang chạy — chặn nó là khoá một ticket đã gần xong lại mãi.
  batBuocKhongLuuTru(du_an);

  /*
   * Bảng quyền mục 3, hàng **"Nộp bằng chứng"**: `có` cho cả bốn vai trò, nhưng
   * **cửa dự án vẫn áp** (`project_id` trong bối cảnh) — một agent không được
   * vào dự án thì không nộp được bằng chứng trong đó.
   */
  batBuocQuyen(lenh.ai, 'submit_evidence', {
    project_id: ticket.project_id,
    ticket_id: ticket.id,
  });

  // Kiểm nhập **trước** khi chèn (luật chung của mọi handler ghi), qua **một
  // cửa** cho cả sáu loại.
  const noi_dung = kiemNoiDungBangChung(
    { ...lenh, loai: lenh.loai_bang_chung },
    { repo_mac_dinh: await repoMacDinhCuaDuAn(db, ticket.project_id) },
  );

  /*
   * **`review`: kiểm vai trò VÀ danh tính** — d.208 ("do agent `reviewer`
   * **khác** người làm gửi"; cột Xác minh: "Kiểm vai trò và danh tính người
   * gửi"), 19.3 d.496.
   *
   * Hai cửa, cả hai đều cần:
   *   * **vai trò** — hàng "Ghi kết quả review" của bảng mục 3 chỉ `reviewer` có
   *     (chủ qua được: mục 1 "quyền cao nhất", và chủ không bao giờ là người
   *     nhận một lượt giao nên cửa thứ hai cũng không chặn chủ);
   *   * **danh tính** — không phải người nhận bất kỳ lượt `work` nào.
   * Thiếu cửa thứ hai thì một agent `reviewer` tự review chính việc mình vừa
   * làm; thiếu cửa thứ nhất thì bất kỳ agent nào cũng ghi được kết luận review.
   */
  let review_nguon: NguonReview | null = null;
  let bao_cao_nguon: NguonBaoCao | null = null;
  if (noi_dung.loai === 'review') {
    /*
     * **Nguồn của review, và luật riêng của `manager`** — migration 0022 khối B,
     * `quyet-dinh.md` 13/10.
     *
     * Vì sao `manager` được ghi review: reviewer thật của hệ này là sub-agent do
     * Manager gọi (`claude -p`) và **không có token Baton**, nên trước lượt này
     * **không ai** gửi được `review` ĐẠT và điều kiện phụ của cổng (d.215) không
     * bao giờ mở cho dự án bật "bắt buộc review" (mặc định **bật**). Đó là chỗ
     * chặn thứ ba của ngày 13/10.
     *
     * Vì sao **bắt buộc** đường dẫn báo cáo: không có nó thì "manager ghi review"
     * chỉ còn là lời tự khai của người giao việc — tức cổng d.215 mất nghĩa. Có
     * nó thì bằng chứng trỏ được tới kết luận của một reviewer độc lập, và ai đọc
     * cũng kiểm lại được.
     *
     * Luật `REVIEWER_IS_WORKER` (19.3 d.496) **không** đổi và chạy ở trên: một
     * `manager` tự làm ticket rồi tự review vẫn bị từ chối.
     *
     * `nguoi_gui` của một `review` do chủ gửi thì `review_nguon` để `null`: chủ
     * không phải một trong hai vai trò, và `nguoi_gui_loai = 'owner'` đã nói đủ.
     *
     * Ba cửa nay nằm ở `kiemQuyenKy`, dùng chung với `bao_cao` (T-31 câu 3.4 A).
     */
    review_nguon = await kiemQuyenKy(lenh, db, ticket, noi_dung.duong_dan_bao_cao, 'review');
  } else if (noi_dung.loai === 'bao_cao') {
    /*
     * **`bao_cao`: quyền ký giống hệt `review`** — T-31 câu 3.4 A, #161. Cùng
     * hàm, cùng mã lỗi (`FORBIDDEN` cho worker, `REVIEWER_IS_WORKER` cho người
     * làm, `INVALID_INPUT` cho manager thiếu báo cáo reviewer). Khác review đúng
     * một chỗ: chủ ký thì nguồn là `owner` chứ không `null`, vì `bao_cao_nguon`
     * còn là dấu "đây là báo cáo" (migration 0027).
     */
    bao_cao_nguon =
      (await kiemQuyenKy(lenh, db, ticket, noi_dung.duong_dan_bao_cao, 'báo cáo')) ?? 'owner';
  }

  const xac_minh = xacMinhBanDau(noi_dung.loai);
  const can = canXacMinh(noi_dung.loai);

  /*
   * **`thu_lai_luc` đặt NGAY lúc chèn**, không chờ kết luận của chặng xác minh.
   *
   * Vì sao: chặng xác minh chạy **ngoài** cửa ghi (xem đầu file), nên giữa lúc
   * chèn dòng và lúc ghi kết luận có một khoảng mà Worker có thể chết, request
   * có thể bị client ngắt, hoặc instance có thể bị thu hồi. Không đặt mốc ở đây
   * thì dòng đó nằm `pending` **mãi mãi**: Cron của d.220 quét theo
   * `ix_evidence_thu_lai`, mà index đó là **riêng phần**
   * (`WHERE … thu_lai_luc IS NOT NULL`) nên một dòng không có mốc thì Cron không
   * bao giờ thấy. Chặng ghi kết luận sẽ **xoá** mốc này nếu đã kết luận được.
   *
   * `so_lan_thu` vẫn là **0**: d.220 đếm "tự thử **lại**", và lần chạy ngay khi
   * gửi không phải một lần thử lại. Xem `quyet-dinh.md`.
   */
  const thu_lai_luc = can ? bay_gio + CHO_THU_LAI_MS : null;

  const id = crypto.randomUUID();
  const c = cotNoiDung(noi_dung);

  const cau_lenh = [
    db
      .prepare(
        `INSERT INTO evidence
           (id, workspace_id, ticket_id, loai, nguoi_gui_loai, nguoi_gui_agent_id, gui_luc,
            xac_minh, so_lan_thu, thu_lai_luc,
            commit_hash, repo, url, ma_phien_ban, ket_luan, ghi_chu,
            tom_tat, test_dat, duong_dan, noi_dung,
            merged_cuc_bo, review_nguon, review_bao_cao, bao_cao_nguon, bao_cao_reviewer,
            tao_luc, cap_nhat_luc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        lenh.workspace_id,
        ticket.id,
        // `bao_cao` mượn `note`/`file` (migration 0027) — `loaiLuuTrongDb`.
        loaiLuuTrongDb(noi_dung),
        lenh.ai.loai === 'agent' ? 'agent' : 'owner',
        lenh.ai.loai === 'agent' ? lenh.ai.agent_id : null,
        bay_gio,
        xac_minh,
        thu_lai_luc,
        c.commit_hash,
        c.repo,
        c.url,
        c.ma_phien_ban,
        c.ket_luan,
        c.ghi_chu,
        c.tom_tat,
        c.test_dat,
        c.duong_dan,
        c.noi_dung,
        c.merged_cuc_bo,
        review_nguon,
        c.review_bao_cao,
        bao_cao_nguon,
        c.bao_cao_reviewer,
        bay_gio,
        bay_gio,
      ),
  ];

  /*
   * **Ticket không TỰ LÊN XONG ở đây.**
   *
   * "Tự lên Xong" (d.221) chỉ áp cho ticket **ở Chờ kiểm chứng** và chỉ sau khi
   * có kết luận xác minh (19.2 d.490: "Commit được merge khi ticket còn Đang làm
   * thì **chưa có gì xảy ra**; cổng được kiểm lúc nộp"). Lúc chèn dòng thì chưa
   * có kết luận nào, nên không có gì để quyết — đường đó là `ghiXacMinh`.
   *
   * **Nhưng cờ "cần review lại" PHẢI tính lại ở đây** (19.3 d.494, 19.11 d.555):
   * một `commit` mới làm review ĐẠT cũ hết hiệu lực, và một `review` kết luận
   * KHÔNG ĐẠT bật cờ — cả hai **không** chờ bước xác minh nào (mốc của d.494 tính
   * trên `gui_luc`, không trên `xac_minh`), nên nếu đợi tới `ghiXacMinh` thì một
   * bằng chứng `review` (loại `not_required`, không bao giờ đi qua đường đó) sẽ
   * **không bao giờ** bật được cờ.
   *
   * 19.3 d.495 — "Ticket đã Xong **không bị hạ**. Bằng chứng gửi sau khi Xong vẫn
   * được **lưu** và hiện nhãn 'sau khi xong'" — vẫn đúng: `tinhCanReviewLai` trả
   * cờ **tắt** cho nhóm `closed`, nên một ticket đã Xong không bị gắn cờ và không
   * bị kéo về Chờ kiểm chứng.
   */
  const co = await apCoReviewLai(db, lenh.workspace_id, ticket, ticket.trang_thai, {
    bay_gio,
    cong,
    /*
     * Dòng `evidence` vừa dựng **chưa có trong DB** (câu `INSERT` còn trong batch),
     * nên luật phải nhận nó bằng tay — xem `DieuChinhBangChung`. Hình phải khớp
     * đúng cột đã bind ở trên: cùng `gui_luc`, cùng `xac_minh`, chưa rút.
     */
    dieu_chinh: {
      loai: 'them',
      bang_chung: {
        loai: noi_dung.loai,
        gui_luc: bay_gio,
        xac_minh,
        rut_luc: null,
        ket_luan: noi_dung.loai === 'review' ? noi_dung.ket_luan : null,
        nguoi_gui: {
          loai: lenh.ai.loai === 'agent' ? 'agent' : 'owner',
          agent_id: lenh.ai.loai === 'agent' ? lenh.ai.agent_id : null,
        },
      },
    },
  });
  /*
   * **Gộp vào `cau_lenh` của lệnh, KHÔNG một `batch()` riêng.** Tách ra là mở một cửa
   * sổ mà dòng `evidence` đã vào DB nhưng cờ còn giá trị cũ (hoặc ngược lại) — và một
   * lần hỏng ở giữa để lại đúng trạng thái đó **vĩnh viễn**, vì không đường nào tính
   * lại cờ cho một ticket mà không có lệnh mới.
   *
   * **Không canh được bằng test, khai thẳng** (đã thử bằng mutation: tách ra một
   * `db.batch(co.cau_lenh)` riêng thì **toàn bộ** test vẫn xanh). Vì sao không dựng
   * được ca: ranh giới giao dịch chỉ quan sát được khi một câu lệnh **hỏng giữa
   * batch**, mà `db.batch` của D1 không có chỗ tiêm lỗi từ test; và cửa ghi là một DO
   * **đơn luồng**, nên không có người đọc nào chen được vào giữa hai `batch()`. Cùng
   * nếp khai của `WHERE … AND xac_minh = ?` ở `#ghiMotXacMinh` (lượt 2).
   */
  cau_lenh.push(...co.cau_lenh);

  return {
    cau_lenh,
    lich_su: [
      {
        ticket_id: ticket.id,
        truong: `bang_chung:${noi_dung.loai}`,
        gia_tri_cu: null,
        gia_tri_moi: xac_minh,
      },
      ...co.lich_su,
    ],
    /*
     * **Chỉ khoá của ticket điều phối mà nhánh cờ vừa đổi** (`co.danh_thuc`), không
     * một khoá `ticket:<id>` vô điều kiện: "gửi bằng chứng cũng đánh thức lệnh chờ của
     * ticket này" là một thay đổi hành vi đánh thức **ngoài phạm vi** lượt này và
     * không có ca test nào. `co.danh_thuc` thì khác — nó là nếp đã có (mọi đường đổi
     * trạng thái một ticket điều phối phát khoá của ticket đó), bỏ nó ra mới là lỗi.
     */
    danh_thuc: co.danh_thuc,
    ket_qua: {
      id,
      ticket_id: ticket.id,
      loai: noi_dung.loai,
      gui_luc: bay_gio,
      xac_minh,
      noi_dung,
      can_xac_minh: can,
      thu_lai_luc,
      sau_khi_xong: (TRANG_THAI_DA_KET as readonly string[]).includes(ticket.trang_thai),
      can_review_lai: co.quyet_dinh.co,
      can_review_lai_ly_do: co.quyet_dinh.ly_do,
      review_nguon,
      bao_cao_nguon,
      ticket_trang_thai: co.trang_thai,
    },
  };
}

/* ================================================================== *
 * 2. Rút lại bằng chứng — SPEC d.222
 * ================================================================== */

export interface LenhRutBangChung extends LenhChung {
  loai: 'rut_bang_chung';
  bang_chung_id: string;
  /** **Bắt buộc** — d.222 "chỉ có thể rút lại **kèm lý do**". */
  ly_do?: string | null;
}

export interface KetQuaRutBangChung {
  id: string;
  ticket_id: string;
  rut_luc: number;
  rut_ly_do: string;
  /**
   * Trạng thái ticket **sau** khi rút — phải **y nguyên** trạng thái trước đó.
   * d.222: "Ticket đã Xong **không bị hạ tự động**." Trả ra để test khẳng định
   * được đúng chữ đó qua đường HTTP, không phải đọc DB bằng tay.
   */
  ticket_trang_thai: string;
  /** Cờ "cần review lại" **sau** lệnh này — 19.3 d.494, 19.11 d.555. */
  can_review_lai: boolean;
  can_review_lai_ly_do: LyDoCanReviewLai | null;
}

interface DongBangChungRut {
  id: string;
  ticket_id: string;
  nguoi_gui_loai: string;
  nguoi_gui_agent_id: string | null;
  rut_luc: number | null;
}

/*
 * Cũng **không** có chặng `SESSION_CLOSED` — cùng lý do với `handlerGuiBangChung`
 * (SPEC 19.12 câu 45, `cau-hoi-spec.md` #67, hướng (a)). Cố ý, không sót.
 */
export async function handlerRutBangChung(
  lenh: LenhRutBangChung,
  { db, bay_gio, cong }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaRutBangChung>> {
  // "Rút lại **kèm lý do**" — `kiemLyDo` ném `REASON_REQUIRED`, đúng mã mục 13.
  const ly_do = kiemLyDo(lenh.ly_do);

  if (typeof lenh.bang_chung_id !== 'string' || lenh.bang_chung_id.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Thiếu mã bằng chứng.' });
  }

  /*
   * Ngoài workspace → `NOT_FOUND` (mục 13: 404 để **không lộ sự tồn tại**). Và
   * **ngoài cái người gọi thấy được** cũng vậy (BAT-58, 19.12 câu 15): ticket của
   * bằng chứng ngoài phạm vi đọc, người gọi không phải người gửi ⇒ câu tra rỗng ⇒
   * cùng dòng `throw` với id bịa. Trước BAT-58, id thật dự án khác ra 403 ("chỉ
   * người gửi…") hoặc `PROJECT_NOT_ACCEPTING` còn id bịa ra 404 — một máy dò.
   * Người gửi bị gỡ khỏi dự án vẫn thấy (và rút được) bằng chứng của chính mình
   * như trước — d.222 kiểm theo danh tính (`locThayDongConGhi`).
   */
  const loc = locThayDongConGhi(lenh.ai, 'evidence');
  const bc = await db
    .prepare(
      `SELECT id, ticket_id, nguoi_gui_loai, nguoi_gui_agent_id, rut_luc
         FROM evidence WHERE id = ? AND workspace_id = ?${loc.sql}`,
    )
    .bind(lenh.bang_chung_id, lenh.workspace_id, ...loc.bind)
    .first<DongBangChungRut>();
  if (bc === null) {
    throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy bằng chứng.' });
  }

  const ticket = await ticketBatBuoc(db, lenh.workspace_id, bc.ticket_id);
  batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, ticket.project_id));

  /*
   * **Ai được rút: "người gửi hoặc chủ"** — d.222, nguyên văn.
   *
   * Kiểm theo **danh tính**, không qua một hàng nào của bảng quyền mục 3 — cùng
   * lý do đã chốt ở `cau-hoi-spec.md` #37 cho nộp/nghiệm thu/huỷ: SPEC nói theo
   * danh tính, và mượn một hàng của bảng quyền là âm thầm đổi nghĩa hàng đó. Nói
   * riêng, **không** dùng hàng "Xoá bất cứ thứ gì": d.222 phân biệt rõ rút lại
   * với xoá ("không sửa, **không xoá**. Chỉ có thể rút lại"), nên gắn rút lại vào
   * hàng "không bao giờ" là biến một việc SPEC cho phép thành một việc cấm.
   *
   * Hệ quả, có chủ ý: một `manager` có mọi quyền **vẫn không** rút được bằng
   * chứng của agent khác. Người gửi tự rút, hoặc chủ rút.
   */
  if (lenh.ai.loai === 'agent') {
    if (lenh.ai.disabled) {
      throw new BatonError('FORBIDDEN', { message: 'Agent đã bị tắt.' });
    }
    if (bc.nguoi_gui_loai !== 'agent' || bc.nguoi_gui_agent_id !== lenh.ai.agent_id) {
      throw new BatonError('FORBIDDEN', {
        message: 'Chỉ người gửi bằng chứng hoặc chủ mới rút lại được (SPEC mục 7 d.222).',
      });
    }
  }

  /*
   * **Rút lại là một chiều** (trigger `tg_evidence_rut_mot_chieu` của 0009).
   * Chặn ở đây để agent nhận một câu tiếng Việt thay vì một lỗi SQLite, nhưng
   * **không** bỏ trigger: cửa ghi không phải đường duy nhất vào bảng này.
   */
  if (bc.rut_luc !== null) {
    throw new BatonError('INVALID_INPUT', {
      message: 'Bằng chứng này đã được rút lại; một lần rút là một chiều (SPEC mục 7 d.222).',
    });
  }

  const cau_lenh = [
    db
      .prepare(
        `UPDATE evidence
            SET rut_luc = ?, rut_ly_do = ?, rut_boi_loai = ?, rut_boi_agent_id = ?,
                cap_nhat_luc = ?
          WHERE id = ? AND workspace_id = ? AND rut_luc IS NULL`,
      )
      .bind(
        bay_gio,
        ly_do,
        lenh.ai.loai === 'agent' ? 'agent' : 'owner',
        lenh.ai.loai === 'agent' ? lenh.ai.agent_id : null,
        bay_gio,
        bc.id,
        lenh.workspace_id,
      ),
  ];

  /*
   * **Không HẠ ticket** — d.222: "Ticket đã Xong **không bị hạ tự động**."
   *
   * Nên lệnh này cố tình **không** gọi `apSuKienLenTicket` và **không** kiểm lại
   * cổng. Rút bằng chứng duy nhất đã mở cổng của một ticket Xong thì ticket **ở
   * lại Xong**; đưa nó xuống là việc của chủ, bằng tay (mục 4 d.138 + `#18`:
   * mọi lần rời nhóm `closed` chỉ chủ làm được).
   *
   * **Cờ "cần review lại" vẫn phải tính lại** (19.3 d.494, 19.11 d.555), và nó
   * không chống lại câu trên: rút một `review` KHÔNG ĐẠT là lý do bật cờ **mất đi**,
   * nên cờ phải **tắt**; rút chính `review` ĐẠT đang giữ cổng thì lý do bật cờ
   * **xuất hiện**. Một cờ chỉ bật mà không có đường tắt là một cờ sai vĩnh viễn, và
   * nó nằm mãi ở "Cần chú ý" của chủ. Với ticket đã Xong thì luật trả cờ **tắt**
   * cho nhóm `closed` (d.495), nên lệnh này không bao giờ hạ một ticket đã kết.
   */
  const co = await apCoReviewLai(db, lenh.workspace_id, ticket, ticket.trang_thai, {
    bay_gio,
    cong,
    // Câu `UPDATE` ở trên còn trong batch, nên DB còn `rut_luc IS NULL`.
    dieu_chinh: { loai: 'rut', bang_chung_id: bc.id, rut_luc: bay_gio },
  });

  return {
    cau_lenh: [...cau_lenh, ...co.cau_lenh],
    lich_su: [
      {
        ticket_id: ticket.id,
        truong: `bang_chung_rut:${bc.id}`,
        gia_tri_cu: null,
        gia_tri_moi: ly_do,
      },
      ...co.lich_su,
    ],
    // Xem ghi chú ở `handlerGuiBangChung`: chỉ khoá của ticket điều phối vừa đổi.
    danh_thuc: co.danh_thuc,
    ket_qua: {
      id: bc.id,
      ticket_id: ticket.id,
      rut_luc: bay_gio,
      rut_ly_do: ly_do,
      ticket_trang_thai: co.trang_thai,
      can_review_lai: co.quyet_dinh.co,
      can_review_lai_ly_do: co.quyet_dinh.ly_do,
    },
  };
}
