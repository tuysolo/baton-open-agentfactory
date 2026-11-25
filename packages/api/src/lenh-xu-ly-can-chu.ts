/**
 * **Xử lý một mục Cần Chủ** — SPEC mục 8 (d.243–246, d.261, d.278–281),
 * 19.6 (d.516), 19.9 (d.537–542), 19.10 (d.553), 19.11 (d.560), 19.12 câu 4.
 *
 * Ba lệnh, đúng ba nhánh của d.244 + d.246:
 *   * `xu_ly_can_chu`  — `Chờ` → **`Đã xử lý`** (có **kết quả**).
 *   * `bo_qua_can_chu` — `Chờ` → **`Bỏ qua`** (có **lý do**).
 *   * `mo_lai_can_chu` — về `Chờ`, **có ghi lịch sử**.
 *
 * ## Ba việc của d.278–281 nằm trong MỘT batch
 *
 * "Khi một mục được xử lý: tự ghi 1 dòng vào **Nhật ký** …; tự thêm **bình
 * luận** … vào **mọi** ticket liên quan; **phiên** liên quan hết `waiting_owner`."
 *
 * Cả ba, cộng chính việc đổi trạng thái, nằm trong `cau_lenh` của **một**
 * `KetQuaHandler`, tức **một** `db.batch()` của cửa ghi (`workspace-gate.ts`).
 * Đây là một yêu cầu nguyên tử **thật**, không một sở thích: bảng `nhat_ky`
 * **chỉ thêm** (d.309, sáu trigger của 0014 canh), nên một mục đã `resolved` mà
 * thiếu dòng Nhật ký là một trạng thái **không ai sửa lại được** — không có
 * lệnh vá, và ghi bù thì mốc `luc` sẽ nói dối. Ngược lại, một dòng Nhật ký đã
 * ghi cho một mục rốt cuộc **không** đổi trạng thái cũng không gỡ được.
 *
 * Vì vậy không có `await db.batch(...)` nào trong file này, và các câu lệnh đi
 * qua hai hàm dựng **dùng chung** chứ không hai bản: `cauLenhGhiNhatKy`
 * (`lenh-nhat-ky.ts`) và `cauLenhThemBinhLuan` (`lenh-binh-luan.ts`).
 *
 * ## Ai được gọi
 *
 * **Chỉ chủ** (d.245: "Chỉ chủ chuyển trạng thái. Agent chỉ đọc được kết quả").
 * Hàng rào là ô **"Quyết mục Cần Chủ"** (`resolve_ask`) của bảng quyền mục 3, và
 * ô đó ghi "**không bao giờ**" cho **cả bốn** vai — kể cả `coordinator`. Nó là
 * hàng **tuyệt đối**: `quyen()` kiểm nó ở **bước 1**, trước cả nhánh chủ và
 * trước mọi ghi đè, và `agent_permission` (CHECK của 0001) không nhận mã này
 * nên không có đường ghi đè qua dữ liệu. Nên ở đây **không** có cửa dự án nào:
 * không có agent nào đi tới được bước đó.
 *
 * ## Dự án `archived` **không** chặn đường này — LỆCH CÓ CHỦ Ý so với SPEC
 *
 * Đây **không** phải chỗ SPEC im lặng. 19.12 câu 25 nói **tường minh**: "Mọi
 * lệnh **ghi** lên dự án `archived` bị từ chối (`PROJECT_NOT_ACCEPTING`), **trừ**
 * chính việc **chủ đổi `trang_thai`**" — danh sách trừ có **một** mục, và ba
 * lệnh của file này không phải nó. Đường **tạo** mục (`handlerTaoCanChu`) theo
 * đúng câu 25; đường **xử lý** thì cố ý **không**, và đó là một lệch phải do chủ
 * chốt, không do file này tự quyết: **`spec-questions.md` #75**.
 *
 * Lý lẽ của hướng đang cài: một mục đã được tạo lúc dự án còn sống là một **câu
 * hỏi đang treo trước mặt chủ**, và nếu chủ không trả lời được nó thì (a) nó nằm
 * mãi ở khối `Chờ` của màn hình Cần Chủ, và (b) phiên liên quan kẹt ở
 * `waiting_owner` **vĩnh viễn** — trạng thái "**không bao giờ** bị tính đứng" của
 * 19.6 (d.516), tức một agent đứng im mà **không cảnh báo nào bắn**, vì d.281 nói
 * đường duy nhất thả phiên là chính việc mục được xử lý. Lưu trữ một dự án không
 * được phép tạo ra hai thứ đó. Trả lời một câu hỏi **đã hỏi** không phải "ghi
 * việc mới vào dự án", và câu 25 đã tự mở một ngoại lệ cho **chủ**.
 *
 * Hệ quả quan sát được hiện nay, khai thẳng: xử lý một mục của dự án `archived`
 * → **200**, cộng một dòng `nhat_ky` và một bình luận trên ticket của một dự án
 * đã lưu trữ. Có một ca test ghim đúng hành vi đó, nên nếu chủ chốt ngược thì ca
 * đó đỏ chứ không lặng lẽ đổi nghĩa. Chốt ngược ⇒ áp `batBuocKhongLuuTru` vào ba
 * handler, và lúc đó **phải** có một đường khác thả phiên khỏi `waiting_owner`,
 * nếu không là tạo ra đúng cái bẫy trên.
 */

import {
  BatonError,
  batBuocMoLaiDuoc,
  batBuocQuyen,
  batBuocXuLyDuoc,
  cauBinhLuanBoQua,
  cauBinhLuanDaXuLy,
  cauBinhLuanMoLai,
  cauNhatKyBoQua,
  cauNhatKyKetQua,
  cauNhatKyMoLai,
  kiemChuTuyChon,
  kiemKetQuaXuLy,
  kiemLyDo,
  maCanChu,
  maSoTuChu,
  type KetLuanReviewMuc,
  type KetQuaXuLyDaKiem,
  type LoaiCanChu,
  type PhuongAnCoSan,
  type TrangThaiCanChu,
} from '@baton/shared';
import { cauLenhThemBinhLuan } from './lenh-binh-luan.js';
import { cauLenhGhiNhatKy } from './lenh-nhat-ky.js';
import type { BoiCanhLenh, KetQuaHandler, LenhChung } from './lenh-khung.js';

/* ================================================================== *
 * A. Đọc mục và các mối nối của nó
 * ================================================================== */

interface DongCanChu {
  id: string;
  ma_so: number;
  tieu_de: string;
  project_id: string | null;
  loai: LoaiCanChu;
  trang_thai: TrangThaiCanChu;
  mo_lai_lan: number;
}

/**
 * Mục Cần Chủ trong đúng workspace của lệnh. Không có → `NOT_FOUND`.
 *
 * Nhận **id** hoặc **`T-số`**: `baton result T-x` (mục 13) và ô "Trả lời hàng
 * loạt" (d.264) đều nói bằng `T-số`, còn web nói bằng id. Hai cách gọi, **một**
 * chỗ dịch — nếu không thì mỗi route tự tách chuỗi `"T-18"` theo một kiểu.
 */
async function canChuBatBuoc(
  db: D1Database,
  workspace_id: string,
  can_chu_id: unknown,
): Promise<DongCanChu> {
  if (typeof can_chu_id !== 'string' || can_chu_id.length === 0) {
    throw new BatonError('INVALID_INPUT', { message: 'Thiếu mã mục Cần Chủ.' });
  }

  const ma_so = maSoTuChu(can_chu_id);
  const d = await db
    .prepare(
      `SELECT id, ma_so, tieu_de, project_id, loai, trang_thai, mo_lai_lan
         FROM can_chu
        WHERE workspace_id = ? AND ${ma_so === null ? 'id = ?' : 'ma_so = ?'}`,
    )
    .bind(workspace_id, ma_so ?? can_chu_id)
    .first<DongCanChu>();
  if (d === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy mục Cần Chủ.' });
  return d;
}

/**
 * `"T-18"` → `18`; mọi thứ khác → `null` (tức là một id).
 *
 * Thân hàm đã **chuyển sang `@baton/shared`** (`can-chu.ts`, cạnh `maCanChu`) ở
 * lượt 3a, vì đường **đọc** (`doc-can-chu.ts`) cần đúng phép dịch này và một
 * module `doc-*` không nên phải nhập từ một module `lenh-*`. Giữ chỗ xuất ở đây
 * để mọi người gọi cũ (và `test/xu-ly-can-chu.test.ts`) không phải đổi đường
 * nhập — **không** phải một bản thứ hai của luật.
 */
export { maSoTuChu };

/** Ticket liên quan của một mục — bảng nối `can_chu_ticket` của 0013. */
async function ticketLienQuan(
  db: D1Database,
  workspace_id: string,
  can_chu_id: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT ticket_id FROM can_chu_ticket
        WHERE workspace_id = ? AND can_chu_id = ? ORDER BY ticket_id`,
    )
    .bind(workspace_id, can_chu_id)
    .all<{ ticket_id: string }>();
  return results.map((r) => r.ticket_id);
}

/** Phương án **có thật** của một mục — nguồn của luật "trỏ tới phương án có thật". */
async function phuongAnCuaMuc(
  db: D1Database,
  workspace_id: string,
  can_chu_id: string,
): Promise<PhuongAnCoSan[]> {
  const { results } = await db
    .prepare(
      `SELECT id, nhan FROM can_chu_phuong_an
        WHERE workspace_id = ? AND can_chu_id = ? ORDER BY thu_tu`,
    )
    .bind(workspace_id, can_chu_id)
    .all<PhuongAnCoSan>();
  return results;
}

/** Phiên đang chờ mục này — index riêng phần `ix_phien_can_chu` của 0015. */
interface PhienChoMuc {
  id: string;
  agent_id: string;
  ticket_id: string;
  trang_thai: string;
}

async function phienChoMuc(
  db: D1Database,
  workspace_id: string,
  can_chu_id: string,
): Promise<PhienChoMuc[]> {
  const { results } = await db
    .prepare(
      `SELECT id, agent_id, ticket_id, trang_thai FROM phien
        WHERE can_chu_id = ? AND workspace_id = ?`,
    )
    .bind(can_chu_id, workspace_id)
    .all<PhienChoMuc>();
  return results;
}

/* ================================================================== *
 * B. Ba việc của d.278–281, dựng thành câu lệnh
 * ================================================================== */

/**
 * **Phiên liên quan hết `waiting_owner`** — mục 8 d.281 + 19.6 d.516: "khi mục
 * Cần Chủ được xử lý hoặc bỏ qua, phiên về `running` và **ngưỡng đứng tính lại
 * từ lúc đó**."
 *
 * `tin_hieu_cuoi_luc = bay_gio` **là** nửa thứ hai của câu đó, không một chi
 * tiết: ngưỡng đứng được đo bằng `bay_gio - tin_hieu_cuoi_luc`
 * (`trangThaiPhienDanXuat`), nên không đặt lại mốc thì một phiên chờ chủ 3 tiếng
 * sẽ **lập tức** là `stalled` ngay giây nó về `running` — đúng cái mà 19.6 nói
 * là không được xảy ra ("phiên `waiting_owner` **không bao giờ** bị tính đứng").
 *
 * `can_chu_id = NULL`: mối nối đã hết việc. Giữ nó lại thì 19.6 ("dòng dự án ghi
 * thêm *chờ Chủ: T-x*") sẽ còn hiện trên một phiên không còn chờ ai.
 *
 * `WHERE … trang_thai = 'waiting_owner'`: **chỉ** phiên đang thật sự chờ mới đổi.
 * Phiên `closed` hay `stopping` nối vào mục này (19.11 d.560) **không** bị đụng
 * tới — không gửi thêm tín hiệu nào, và `tg_phien_dong_la_vinh_vien` của 0006
 * không có cơ hội bật. Không khớp dòng nào thì câu này ghi 0 dòng, **không** lỗi:
 * một mục không có phiên nào vẫn phải xử lý được.
 */
export function cauLenhPhienThoiCho(
  db: D1Database,
  workspace_id: string,
  can_chu_id: string,
  bay_gio: number,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE phien
            SET trang_thai = 'running', can_chu_id = NULL,
                tin_hieu_cuoi_luc = ?, cap_nhat_luc = ?
          WHERE can_chu_id = ? AND workspace_id = ? AND trang_thai = 'waiting_owner'`,
      )
      .bind(bay_gio, bay_gio, can_chu_id, workspace_id),
  ];
}

/**
 * **Tự ghi 1 dòng Nhật ký** — mục 8 d.279: "người là **chủ**, **cùng dự án**,
 * nội dung là **kết quả**, căn cứ là **`T-số`**."
 *
 * Bốn vế, bốn chỗ trong hàm này:
 *   * `nguoi_loai: 'chu'`, `agent_id: null` — và không có đường nào khác: chỉ
 *     chủ gọi được ba lệnh của file này (ô `resolve_ask`).
 *   * `project_id` lấy **từ mục**. Mục **Chung** (`project_id IS NULL`) ⇒ dòng
 *     Nhật ký để **trống** dự án — 19.12 câu 4 nói đúng câu này.
 *   * `quyet_dinh` = câu của `@baton/shared` (`cauNhatKyKetQua` / `BoQua` /
 *     `MoLai`), ba câu đã viết sẵn ở lượt 2a đúng để lượt này **chỉ phải nối**.
 *   * `can_cu` = `[{ loai: 'ask', id: <mục> }]` — **khoá thật** trỏ tới dòng
 *     `can_chu`, không chuỗi `'T-18'`. Bảng `nhat_ky_can_cu` của 0014 được dựng
 *     đúng cho chỗ này.
 *
 * **"Vì sao"** là trường bắt buộc của mục 10 (d.306, `spec-questions.md` #71),
 * nhưng d.279 **không** nói dòng tự sinh lấy "vì sao" ở đâu (`spec-questions.md`
 * **#74**). Mặc định ở đây là
 * **tiêu đề của chính mục** — nó đúng nghĩa là lý do tồn tại của quyết định
 * ("vì có câu hỏi này"), nó luôn có (tiêu đề là trường bắt buộc của d.233), và
 * nó là thứ chủ sẽ muốn đọc lại ở màn hình mục 10 sáu tháng sau. Chủ gửi
 * `vi_sao` thì tôn trọng.
 */
function cauLenhNhatKyCuaMuc(
  db: D1Database,
  nguon: {
    workspace_id: string;
    muc: DongCanChu;
    quyet_dinh: string;
    vi_sao: string | null;
    luc: number;
  },
): { cau_lenh: D1PreparedStatement[]; nhat_ky_id: string } {
  const nhat_ky_id = crypto.randomUUID();
  return {
    nhat_ky_id,
    cau_lenh: cauLenhGhiNhatKy(db, {
      id: nhat_ky_id,
      workspace_id: nguon.workspace_id,
      luc: nguon.luc,
      nguoi_loai: 'chu',
      agent_id: null,
      // 19.12 câu 4: mục Chung ⇒ dòng Nhật ký để **trống** dự án.
      project_id: nguon.muc.project_id,
      quyet_dinh: nguon.quyet_dinh,
      vi_sao: nguon.vi_sao ?? `Trả lời mục ${maCanChu(nguon.muc.ma_so)}: ${nguon.muc.tieu_de}`,
      can_cu: [{ loai: 'ask', id: nguon.muc.id, thu_tu: 1 }],
    }),
  };
}

/**
 * **Tự thêm bình luận vào MỌI ticket liên quan** — mục 8 d.280, 19.9 d.541–542.
 *
 * Tác giả là **chủ** (`{ loai: 'owner' }`), không `system`: d.245 nói chính chủ
 * chuyển trạng thái, nên dòng bình luận phải mang đúng người đã quyết — d.418
 * ("mọi hành động có dấu vết ai làm"). `system` dành cho thay đổi **không ai
 * ra lệnh** (tự lên Xong của d.221, lan toả 19.4).
 */
function cauLenhBinhLuanLenTicket(
  db: D1Database,
  workspace_id: string,
  ticket_ids: readonly string[],
  noi_dung: string,
  luc: number,
): D1PreparedStatement[] {
  const cau_lenh: D1PreparedStatement[] = [];
  for (const ticket_id of ticket_ids) {
    cau_lenh.push(
      ...cauLenhThemBinhLuan(db, {
        id: crypto.randomUUID(),
        workspace_id,
        ticket_id,
        tac_gia: { loai: 'owner' },
        noi_dung,
        luc,
      }),
    );
  }
  return cau_lenh;
}

/**
 * Chủ đề đánh thức của một lần đổi trạng thái mục.
 *
 * `can_chu_ma:T-x` là chỗ `baton result T-x --wait` (mục 8 d.267, "≤ 3 giây")
 * treo vào. Tên này đặt bên **phát** từ lượt 2b; lượt 3a chỉ phải nối bên
 * **nghe** và không sửa một chữ ở đây — xem `chuDeChoCanChu` của `doc-can-chu.ts`
 * và `WorkspaceGate.choCanChu`. Cùng cách `handlerTaoCanChu` đã làm với
 * `can_chu:<id>`.
 *
 * Chủ đề `can_chu` (toàn workspace) **không** có người nghe nào ở lượt 3a, có chủ
 * ý: xem khối ghi chú của `chuDeKeoViec` trong `doc-viec.ts`.
 *
 * `luot:<agent>` và `phien:<id>` của từng phiên vừa được thả: một agent đang
 * treo trên `baton tasks --wait` phải tỉnh ngay khi phiên của nó về `running`,
 * không phải chờ hết 60 giây — cùng nếp `handlerDungPhien`.
 */
function chuDeDanhThuc(muc: DongCanChu, phien: readonly PhienChoMuc[]): string[] {
  const ra = [`can_chu:${muc.id}`, `can_chu_ma:${maCanChu(muc.ma_so)}`, 'can_chu'];
  for (const p of phien) {
    ra.push(`phien:${p.id}`, `luot:${p.agent_id}`, `ticket:${p.ticket_id}`);
  }
  return ra;
}

/* ================================================================== *
 * C. `xu_ly_can_chu` — `Chờ` → `Đã xử lý` (mục 8 d.244, 19.9 d.538–539)
 * ================================================================== */

export interface LenhXuLyCanChu extends LenhChung {
  loai: 'xu_ly_can_chu';
  /** Id của mục, hoặc `T-số`. */
  can_chu_id: string;
  /** `decision`: **nhãn** phương án đã chọn (A–E) — 19.9 d.538, bắt buộc. */
  phuong_an?: unknown;
  /** Chữ tự do "ghi thêm" — tuỳ chọn với mọi loại (19.9 d.539). */
  ghi_them?: unknown;
  /** `review`: `dat` hoặc `can_sua` — mục 8 d.261, bắt buộc. */
  ket_luan?: unknown;
  /** "Vì sao" của dòng Nhật ký tự sinh; để trống thì lấy tiêu đề mục. */
  vi_sao?: unknown;
  /*
   * KHÔNG có trường nào cho `trang_thai`, `xu_ly_luc`, hay `ket_qua` thô: cả ba
   * là **kết luận của server**. `ket_qua` phải là chữ do `kiemKetQuaXuLy` dựng
   * (mặc định của 19.9, công thức `"A, ngưỡng 500"` của d.244), nếu không thì
   * dòng Nhật ký **không sửa được** của d.309 nhận một chuỗi client tự đặt.
   */
}

export interface KetQuaXuLyCanChu {
  id: string;
  ma: string;
  trang_thai: 'resolved';
  /** Chữ kết quả — đúng thứ đã vào Nhật ký và bình luận. */
  ket_qua: string;
  /** `decision`: khoá thật của phương án đã chọn; `null` với loại khác. */
  phuong_an_da_chon_id: string | null;
  nhan_phuong_an: string | null;
  /** `review`: `dat` / `can_sua`; `null` với loại khác — mục 8 d.261. */
  ket_luan_review: KetLuanReviewMuc | null;
  xu_ly_luc: number;
  /** Id dòng Nhật ký **vừa** sinh — mục 8 d.279. */
  nhat_ky_id: string;
  /** Số ticket đã nhận bình luận tự thêm — mục 8 d.280. */
  so_binh_luan: number;
  /** Phiên vừa thôi `waiting_owner` — mục 8 d.281, 19.6 d.516. */
  phien_da_tha: string[];
}

export async function handlerXuLyCanChu(
  lenh: LenhXuLyCanChu,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaXuLyCanChu>> {
  // 1. **Quyền trước tiên** — ô "Quyết mục Cần Chủ", hàng **không bao giờ** của
  //    bảng mục 3. Mọi vai agent dừng ở đây, kể cả `coordinator`; xem đầu file.
  batBuocQuyen(lenh.ai, 'resolve_ask', {});

  const muc = await canChuBatBuoc(db, lenh.workspace_id, lenh.can_chu_id);
  const ma = maCanChu(muc.ma_so);

  // 2. Cổng trạng thái — d.244; mục đã kết → `ALREADY_RESOLVED` (19.10 d.553).
  batBuocXuLyDuoc(muc.trang_thai, ma);

  /*
   * 3. **Kết quả theo loại** — 19.9 d.538–539, mục 8 d.261. Luật thuần ở
   *    `@baton/shared`; chỗ này chỉ cấp cho nó tập phương án **có thật** của
   *    chính mục đó, nên "nhãn phải trỏ tới một phương án có thật" là một phép
   *    so trên dữ liệu, không một lời hứa.
   */
  const ket = kiemKetQuaXuLy(
    muc.loai,
    { phuong_an: lenh.phuong_an, ghi_them: lenh.ghi_them, ket_luan: lenh.ket_luan },
    muc.loai === 'decision' ? await phuongAnCuaMuc(db, lenh.workspace_id, muc.id) : [],
  );
  const vi_sao = kiemChuTuyChon(lenh.vi_sao, '"Vì sao" của dòng Nhật ký', 20_000);

  const ticket_ids = await ticketLienQuan(db, lenh.workspace_id, muc.id);
  const phien = await phienChoMuc(db, lenh.workspace_id, muc.id);

  const nhat_ky = cauLenhNhatKyCuaMuc(db, {
    workspace_id: lenh.workspace_id,
    muc,
    // d.279: "nội dung là **kết quả**" — đọc đúng chữ, không một câu bọc quanh.
    quyet_dinh: cauNhatKyKetQua(ket.ket_qua),
    vi_sao,
    luc: bay_gio,
  });

  /*
   * 4. **Bốn câu, một batch.** Thứ tự: đổi mục → Nhật ký → bình luận → phiên.
   *    Thứ tự không đổi hành vi (một `batch()` là một giao dịch), nhưng đọc
   *    theo đúng thứ tự d.278–281 thì dễ đối chiếu với SPEC.
   *
   *    `WHERE … trang_thai = 'open'` trên câu đầu là **phòng thủ tầng hai**:
   *    `batBuocXuLyDuoc` đã kiểm, và cả hai nằm trong cùng một việc của hàng đợi
   *    DO đơn luồng nên không có khe nào xen vào. Giữ nó vì nó là thứ duy nhất
   *    còn đúng nếu một lượt sau cho một đường ngoài DO ghi vào bảng này — cùng
   *    lời khai thẳng mà `#ghiMotXacMinh` đã viết cho guard của nó.
   */
  const cau_lenh = [
    db
      .prepare(
        `UPDATE can_chu
            SET trang_thai = 'resolved', ket_qua = ?, phuong_an_da_chon_id = ?,
                ket_luan_review = ?, ly_do_bo_qua = NULL, xu_ly_luc = ?, cap_nhat_luc = ?
          WHERE id = ? AND workspace_id = ? AND trang_thai = 'open'`,
      )
      .bind(
        ket.ket_qua,
        phuongAnDaChon(ket),
        ket.loai === 'review' ? ket.ket_luan : null,
        bay_gio,
        bay_gio,
        muc.id,
        lenh.workspace_id,
      ),
    ...nhat_ky.cau_lenh,
    ...cauLenhBinhLuanLenTicket(
      db,
      lenh.workspace_id,
      ticket_ids,
      cauBinhLuanDaXuLy(ma, ket.ket_qua),
      bay_gio,
    ),
    ...cauLenhPhienThoiCho(db, lenh.workspace_id, muc.id, bay_gio),
  ];

  return {
    cau_lenh,
    danh_thuc: chuDeDanhThuc(muc, phien),
    ket_qua: {
      id: muc.id,
      ma,
      trang_thai: 'resolved',
      ket_qua: ket.ket_qua,
      phuong_an_da_chon_id: phuongAnDaChon(ket),
      nhan_phuong_an: ket.loai === 'decision' ? ket.nhan : null,
      ket_luan_review: ket.loai === 'review' ? ket.ket_luan : null,
      xu_ly_luc: bay_gio,
      nhat_ky_id: nhat_ky.nhat_ky_id,
      so_binh_luan: ticket_ids.length,
      phien_da_tha: phien.filter((p) => p.trang_thai === 'waiting_owner').map((p) => p.id),
    },
  };
}

function phuongAnDaChon(ket: KetQuaXuLyDaKiem): string | null {
  return ket.loai === 'decision' ? ket.phuong_an_id : null;
}

/* ================================================================== *
 * D. `bo_qua_can_chu` — `Chờ` → `Bỏ qua` (mục 8 d.244, 19.9 d.541)
 * ================================================================== */

export interface LenhBoQuaCanChu extends LenhChung {
  loai: 'bo_qua_can_chu';
  can_chu_id: string;
  /** **Bắt buộc** — 19.9 d.541; thiếu → `REASON_REQUIRED`/422. */
  ly_do: unknown;
  vi_sao?: unknown;
}

export interface KetQuaBoQuaCanChu {
  id: string;
  ma: string;
  trang_thai: 'skipped';
  ly_do: string;
  xu_ly_luc: number;
  nhat_ky_id: string;
  so_binh_luan: number;
  phien_da_tha: string[];
}

/**
 * "**Bỏ qua:** bắt buộc lý do. Ghi Nhật ký (`"T-x bỏ qua: lý do"`), bình luận
 * lên ticket liên quan, agent nhận trạng thái `skipped`." — 19.9 d.541.
 *
 * Ba việc của d.278–281 áp **y như** đường xử lý: d.281 viết "phiên liên quan
 * hết `waiting_owner`" dưới tiêu đề "khi một mục **được xử lý**", còn 19.6 d.516
 * nói rõ cả hai — "mục Cần Chủ được **xử lý hoặc bỏ qua**" — nên bỏ qua cũng thả
 * phiên. Không thả thì một mục bỏ qua để lại một phiên kẹt `waiting_owner` mãi
 * mãi, tức một agent đứng im mà không cảnh báo nào bắn.
 */
export async function handlerBoQuaCanChu(
  lenh: LenhBoQuaCanChu,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaBoQuaCanChu>> {
  batBuocQuyen(lenh.ai, 'resolve_ask', {});

  const muc = await canChuBatBuoc(db, lenh.workspace_id, lenh.can_chu_id);
  const ma = maCanChu(muc.ma_so);
  batBuocXuLyDuoc(muc.trang_thai, ma);

  // `kiemLyDo` ném `REASON_REQUIRED` — đúng mã mà `hop-le.ts` đã khai cho chính
  // ca này ("Lý do bắt buộc (Huỷ ticket, trả lại lượt, **bỏ qua mục Cần Chủ**)").
  const ly_do = kiemLyDo(lenh.ly_do);
  if (ly_do.length > 2000) {
    throw new BatonError('INVALID_INPUT', { message: 'Lý do bỏ qua tối đa 2000 ký tự.' });
  }
  const vi_sao = kiemChuTuyChon(lenh.vi_sao, '"Vì sao" của dòng Nhật ký', 20_000);

  const ticket_ids = await ticketLienQuan(db, lenh.workspace_id, muc.id);
  const phien = await phienChoMuc(db, lenh.workspace_id, muc.id);

  const nhat_ky = cauLenhNhatKyCuaMuc(db, {
    workspace_id: lenh.workspace_id,
    muc,
    quyet_dinh: cauNhatKyBoQua(ma, ly_do),
    vi_sao,
    luc: bay_gio,
  });

  const cau_lenh = [
    db
      .prepare(
        `UPDATE can_chu
            SET trang_thai = 'skipped', ly_do_bo_qua = ?, ket_qua = NULL,
                phuong_an_da_chon_id = NULL, ket_luan_review = NULL,
                xu_ly_luc = ?, cap_nhat_luc = ?
          WHERE id = ? AND workspace_id = ? AND trang_thai = 'open'`,
      )
      .bind(ly_do, bay_gio, bay_gio, muc.id, lenh.workspace_id),
    ...nhat_ky.cau_lenh,
    ...cauLenhBinhLuanLenTicket(
      db,
      lenh.workspace_id,
      ticket_ids,
      cauBinhLuanBoQua(ma, ly_do),
      bay_gio,
    ),
    ...cauLenhPhienThoiCho(db, lenh.workspace_id, muc.id, bay_gio),
  ];

  return {
    cau_lenh,
    danh_thuc: chuDeDanhThuc(muc, phien),
    ket_qua: {
      id: muc.id,
      ma,
      trang_thai: 'skipped',
      ly_do,
      xu_ly_luc: bay_gio,
      nhat_ky_id: nhat_ky.nhat_ky_id,
      so_binh_luan: ticket_ids.length,
      phien_da_tha: phien.filter((p) => p.trang_thai === 'waiting_owner').map((p) => p.id),
    },
  };
}

/* ================================================================== *
 * E. `mo_lai_can_chu` — về `Chờ` (mục 8 d.246, 19.9 d.542)
 * ================================================================== */

export interface LenhMoLaiCanChu extends LenhChung {
  loai: 'mo_lai_can_chu';
  can_chu_id: string;
  vi_sao?: unknown;
}

export interface KetQuaMoLaiCanChu {
  id: string;
  ma: string;
  trang_thai: 'open';
  /** Trạng thái **trước** khi mở lại — `resolved` hoặc `skipped`. */
  trang_thai_cu: TrangThaiCanChu;
  /** Đã mở lại bao nhiêu lần, tính cả lần này — d.246 ("có ghi lịch sử"). */
  mo_lai_lan: number;
  nhat_ky_id: string;
  so_binh_luan: number;
}

/**
 * "**Mở lại:** thêm **dòng Nhật ký mới** `"T-x mở lại"` và bình luận
 * `"T-x mở lại"`. Xử lý lần sau lại **thêm dòng mới** và bình luận mới. **Dòng
 * cũ không bị sửa**." — 19.9 d.542.
 *
 * Câu cuối là câu quan trọng nhất, và nó được giữ bằng **cấu trúc**, không bằng
 * kỷ luật: file này không có một câu `UPDATE` hay `DELETE` nào trên `nhat_ky`,
 * và không thể có — sáu trigger của 0014 (`tg_nhat_ky_khong_sua`, `_khong_xoa`,
 * và cặp của bảng căn cứ) chặn cả chủ, cả fixture test.
 *
 * Mục trở về `Chờ` thì **mọi dấu của lần xử lý trước bị dọn** trên dòng
 * `can_chu` (`ket_qua`, phương án, kết luận review, lý do bỏ qua, `xu_ly_luc`).
 * Đó không phải mất lịch sử: lịch sử là chuỗi dòng Nhật ký (xem khối ghi chú ở
 * đầu 0015), còn các cột kia mô tả **trạng thái hiện tại** của mục — và cặp
 * trigger `tg_can_chu_xu_ly_*` của 0015 buộc dọn hết (mệnh đề 3 cho `xu_ly_luc`,
 * **3b** cho `phuong_an_da_chon_id`, **3c** cho `ket_luan_review`, 1–2 cho
 * `ket_qua`/`ly_do_bo_qua`), nên quên một cột là vỡ ngay tại DB chứ không lặng lẽ
 * để lại một mục `Chờ` mang kết quả cũ. Lời khai này đúng với **cả năm** cột, và
 * mỗi mệnh đề có một ca SQL thô chứng minh nó bật được.
 *
 * **Phiên không bị đụng tới.** SPEC không nói mở lại thì phiên quay lại
 * `waiting_owner`, và nó không nên: phiên đã về `running` từ lúc mục được xử lý,
 * agent có thể đã nộp và phiên đã đóng. Đẩy một phiên trở lại `waiting_owner` ở
 * đây là chặn việc của một agent dựa trên một suy đoán.
 */
export async function handlerMoLaiCanChu(
  lenh: LenhMoLaiCanChu,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaMoLaiCanChu>> {
  batBuocQuyen(lenh.ai, 'resolve_ask', {});

  const muc = await canChuBatBuoc(db, lenh.workspace_id, lenh.can_chu_id);
  const ma = maCanChu(muc.ma_so);
  batBuocMoLaiDuoc(muc.trang_thai, ma);

  const vi_sao = kiemChuTuyChon(lenh.vi_sao, '"Vì sao" của dòng Nhật ký', 20_000);
  const ticket_ids = await ticketLienQuan(db, lenh.workspace_id, muc.id);

  const nhat_ky = cauLenhNhatKyCuaMuc(db, {
    workspace_id: lenh.workspace_id,
    muc,
    quyet_dinh: cauNhatKyMoLai(ma),
    vi_sao,
    luc: bay_gio,
  });

  const cau_lenh = [
    db
      .prepare(
        `UPDATE can_chu
            SET trang_thai = 'open', ket_qua = NULL, phuong_an_da_chon_id = NULL,
                ket_luan_review = NULL, ly_do_bo_qua = NULL, xu_ly_luc = NULL,
                mo_lai_lan = mo_lai_lan + 1, cap_nhat_luc = ?
          WHERE id = ? AND workspace_id = ? AND trang_thai IN ('resolved', 'skipped')`,
      )
      .bind(bay_gio, muc.id, lenh.workspace_id),
    ...nhat_ky.cau_lenh,
    ...cauLenhBinhLuanLenTicket(
      db,
      lenh.workspace_id,
      ticket_ids,
      cauBinhLuanMoLai(ma),
      bay_gio,
    ),
  ];

  return {
    cau_lenh,
    danh_thuc: [`can_chu:${muc.id}`, `can_chu_ma:${ma}`, 'can_chu'],
    ket_qua: {
      id: muc.id,
      ma,
      trang_thai: 'open',
      trang_thai_cu: muc.trang_thai,
      mo_lai_lan: muc.mo_lai_lan + 1,
      nhat_ky_id: nhat_ky.nhat_ky_id,
      so_binh_luan: ticket_ids.length,
    },
  };
}
