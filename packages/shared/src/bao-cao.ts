/**
 * **Báo cáo sáng và handoff tối** — SPEC mục 11 d.322–336, mục 12 d.346.
 *
 * Để ở `@baton/shared` và **không chạm DB**, cùng nếp `luat-trang-thai.ts`,
 * `thong-bao.ts`, `can-chu.ts`: hình của một báo cáo, luật "trọng tâm đạt hay
 * chưa" (d.331) và **chữ** của báo cáo là những thứ thuần, nên chúng có test
 * riêng không cần Miniflare, và API (cron sinh báo cáo), web (trang `/bao-cao`)
 * đọc **cùng một** bản.
 *
 * Nguồn dữ liệu nằm ở `packages/api/src/doc-bao-cao.ts`; file này chỉ nhận một
 * `DuLieuBaoCao*` đã gom xong và dựng chữ.
 *
 * ## "Xuất ra markdown được" (d.336) KHÔNG cần một bộ chuyển đổi thứ hai
 *
 * Markdown là **dạng lưu** của một báo cáo (`bao_cao.noi_dung_md`, migration
 * 0020), không một bản xuất sinh lúc chủ bấm nút. Nên "xuất" chỉ là trả lại đúng
 * cột đó. Nếu markdown được sinh lại lúc xuất thì có hai đường dựng chữ cho cùng
 * một báo cáo — và bản xuất tháng sau sẽ khác bản chủ đã đọc sáng nay, vì khuôn
 * chữ ở đây đã đổi. Cùng lý lẽ mà 0012 đã khai cho `thong_bao.noi_dung`.
 *
 * ## Giờ-trên-tường đi qua `MUI_GIO_CHU_PHUT`
 *
 * 19.12 câu 60 kể thẳng "handoff tối 20:00 (mục 11)" là một trong **bốn** luật
 * phải dùng cùng một múi giờ. File này **không** tự tính giờ nào: `ngay` tới vào
 * đã là chuỗi `YYYY-MM-DD` do `ngayDiaPhuong` (`nhat-ky.ts`) dựng, tức đã đi qua
 * đúng một hằng. Hai biểu thức cron thì ở `cron-bao-cao.ts`, và có một ca test
 * tính lại chúng **qua `MUI_GIO_CHU_PHUT`** chứ không viết tay số 7.
 */

import { nhan } from './ma-nhan.js';

/* ------------------------------------------------------------------ *
 * 1. Hai loại báo cáo — d.322 ("Báo cáo sáng"), d.330 ("Handoff tối")
 * ------------------------------------------------------------------ */

/** Khớp `CHECK (loai IN ('sang','toi'))` của `bao_cao` (migration 0020). */
export const LOAI_BAO_CAO = ['sang', 'toi'] as const;
export type LoaiBaoCao = (typeof LOAI_BAO_CAO)[number];

export function laLoaiBaoCao(x: unknown): x is LoaiBaoCao {
  return typeof x === 'string' && (LOAI_BAO_CAO as readonly string[]).includes(x);
}

/** Nhãn tiếng Việt — **đúng chữ SPEC** d.322 và d.330 (mục 0.1). */
export const NHAN_BAO_CAO: Record<LoaiBaoCao, string> = {
  sang: 'Báo cáo sáng',
  toi: 'Handoff tối',
};

/** `thong_bao.loai` của mỗi báo cáo — hai mã đã có trong `CHECK` của 0012 (d.346). */
export const LOAI_TIN_BAO_CAO: Record<LoaiBaoCao, string> = {
  sang: 'bao_cao_sang',
  toi: 'bao_cao_toi',
};

/**
 * **Chữ của SPEC, không chữ của ta** — d.324: "nếu chưa ghi thì để trống **kèm
 * chữ 'chưa có đề xuất'**".
 *
 * Là một hằng xuất ra, không một chuỗi gõ tại chỗ, vì nó xuất hiện ở ba nơi
 * (markdown của báo cáo sáng, markdown của handoff tối, trang `/bao-cao`) và ba
 * bản gõ tay sẽ lệch. Có một ca test đòi **đúng** chuỗi này khi `trong_tam` rỗng.
 */
export const CAU_CHUA_CO_DE_XUAT = 'chưa có đề xuất';

/** d.324 — "Đề xuất **3** việc trọng tâm hôm nay". */
export const SO_TRONG_TAM = 3;

/* ------------------------------------------------------------------ *
 * 2. Hình của từng vế — cũng là hình của `bao_cao.du_lieu_json`
 * ------------------------------------------------------------------ */

/*
 * Các kiểu dưới đây **hẹp hơn** kiểu của `doc-tong-quan.ts` (`MucGapNhat`,
 * `TheAgent`, `DongCanChuY`, `HangDuAn`), và đó là chủ ý hai mặt:
 *
 *   1. `@baton/shared` **không được** phụ thuộc vào `packages/api` (chiều phụ
 *      thuộc là một chiều), nên hình dùng ở đây phải tự khai.
 *   2. Chúng là hình của **`du_lieu_json` lưu trong DB**, tức một hợp đồng phải
 *      đọc được sau một năm. Lưu nguyên `TongQuanRa` sẽ khoá cứng mọi chi tiết
 *      nội bộ của trang Tổng quan vào từng dòng `bao_cao`.
 *
 * `doc-bao-cao.ts` là chỗ **duy nhất** chuyển từ kiểu kia sang kiểu này.
 */

/** Một mục Cần Chủ trong "3 mục gấp nhất" (d.316, dùng lại cho d.323). */
export interface MucGapNhatBaoCao {
  /** `T-số` — mục 13 gọi mục bằng mã này ở mọi lệnh. */
  ma: string;
  tieu_de: string;
  /** Nhãn tiếng Việt của mức (🔴/🟡/⚪) — mục 0.1. */
  nhan_muc: string;
}

/** Vế 1 của báo cáo sáng — d.323 "Cần Chủ (đọc trước)". */
export interface KhoiCanChuBaoCao {
  so_cho: number;
  /** Số mục `Chờ` theo mức, khoá là mã mức (`urgent`/`today`/`later`). */
  so_theo_muc: Record<string, number>;
  gap_nhat: MucGapNhatBaoCao[];
  /** Tối đa 5 mục Chờ đầu (cho tin Telegram). Tuỳ chọn: `du_lieu_json` cũ không có. */
  ds_cho?: MucGapNhatBaoCao[];
}

/** Một ticket như báo cáo cần kể. */
export interface ViecBaoCao {
  /** Mã ticket dạng `SAI-12` — thứ chủ đọc được và gõ lại được (d.398). */
  ma: string;
  tieu_de: string;
  nhan_trang_thai: string;
}

/** Vế 4 của báo cáo sáng — d.326 "Đang chạy". Kèm **ai đang cầm**. */
export interface ViecDangChayBaoCao extends ViecBaoCao {
  /** `null` = ticket Đang làm mà **không ai cầm** (cờ của 19.1). */
  agent_id: string | null;
}

/**
 * Một trọng tâm — d.324 (đề xuất) và d.331 ("**đạt hay chưa**").
 *
 * `dat` là một **dẫn xuất** từ `ticket.trang_thai`, không một ô ai tick: xem
 * `trongTamDat` và khối ghi chú của bảng `trong_tam` (0020).
 */
export interface MucTrongTamBaoCao {
  thu_tu: number;
  ma: string;
  tieu_de: string;
  nhan_trang_thai: string;
  dat: boolean;
  ghi_chu: string | null;
}

/** Vế 5 của báo cáo sáng — d.327 "Rủi ro và lệch (mục **Cần chú ý**)". */
export interface DongChuYBaoCao {
  /** Nhãn của một trong các nguồn "Cần chú ý" (d.319) — mục 0.1. */
  nhan_loai: string;
  /** Một câu tiếng Việt do máy chủ dựng (mã ticket, agent, lý do…). */
  chi_tiet: string;
  /** Mã ticket (`SAI-12`) nếu dòng gắn ticket. Tuỳ chọn: dữ liệu cũ không có. */
  ma_ticket?: string | null;
}

/** Vế 6 của báo cáo sáng — d.328 "Quyết định mới trong Nhật ký". */
export interface QuyetDinhBaoCao {
  /** "Chủ" hoặc `agent_id` — d.308 gọi trường này là "ai". */
  nguoi: string;
  quyet_dinh: string;
  vi_sao: string;
}

/** Vế 2 của handoff tối — d.332 "Trạng thái từng dự án". */
export interface DuAnBaoCao {
  ma: string;
  ten: string;
  /** Nhãn chỉ báo sức sống của mục 2 d.71–74 — máy chủ tính. */
  nhan_suc_song: string;
  so_dang_lam: number;
  so_cho_kiem_chung: number;
  so_xong_24h: number;
}

/* ------------------------------------------------------------------ *
 * 3. Dữ liệu của hai báo cáo
 * ------------------------------------------------------------------ */

/** Phần chung: báo cáo **của ngày nào**, sinh **lúc nào**. */
interface DuLieuBaoCaoChung {
  /** `YYYY-MM-DD` trên tường của chủ — khoá lưu của d.336. */
  ngay: string;
  tao_luc: number;
  /**
   * **Một dòng cảnh báo sao lưu** — SPEC mục 15 d.429 (BAT-8). Có giá trị **chỉ khi**
   * bản sao lưu tự động gần nhất **thiếu**, R2 **lỗi** lúc kiểm, hoặc chưa gắn R2.
   * Tuỳ chọn: báo cáo cũ và ngày bình thường không có trường này. Chữ do
   * `canhBaoSaoLuu` (`packages/api/src/sao-luu.ts`) dựng; ở đây chỉ in ra.
   */
  canh_bao_sao_luu?: string;
}

/**
 * **Báo cáo sáng** — đúng **sáu** vế của d.322–328, theo đúng thứ tự đó.
 *
 * Thứ tự là nội dung của SPEC ("từ trên xuống" của một báo cáo chủ đọc lúc
 * 07:30), nên nó nằm trong thứ tự khai báo ở đây **và** trong thứ tự các khối của
 * `dungBaoCaoSangMd` — và có một ca test đọc thứ tự ấy từ chính `SPEC.md`.
 */
export interface DuLieuBaoCaoSang extends DuLieuBaoCaoChung {
  /** 1. d.323 — "Cần Chủ (đọc trước)". */
  can_chu: KhoiCanChuBaoCao;
  /** 2. d.324 — "Đề xuất 3 việc trọng tâm hôm nay". Rỗng ⇒ `CAU_CHUA_CO_DE_XUAT`. */
  trong_tam: MucTrongTamBaoCao[];
  /**
   * 3. d.325 — "**Hôm qua** đã xong".
   *
   * `ngay` ở đây là **ngày dương lịch hôm qua** trên tường, không một cửa sổ
   * trượt 24 giờ. Xem khối ghi chú của `doc-bao-cao.ts` — hai thứ đó khác nhau và
   * lẫn chúng làm báo cáo 07:30 **bỏ sót** việc xong lúc 07:00 hôm qua và **đếm
   * thêm** việc xong lúc 00:30 hôm nay.
   */
  hom_qua: { ngay: string; viec: ViecBaoCao[] };
  /** 4. d.326 — "Đang chạy". */
  dang_chay: ViecDangChayBaoCao[];
  /** 5. d.327 — "Rủi ro và lệch (mục Cần chú ý)". */
  rui_ro_va_lech: DongChuYBaoCao[];
  /** 6. d.328 — "Quyết định mới trong Nhật ký". */
  quyet_dinh_moi: QuyetDinhBaoCao[];
}

/**
 * **Handoff tối** — đúng **bốn** vế của d.330–334, theo đúng thứ tự đó.
 */
export interface DuLieuBaoCaoToi extends DuLieuBaoCaoChung {
  /** 1. d.331 — "3 trọng tâm hôm nay: **đạt hay chưa**". */
  trong_tam: MucTrongTamBaoCao[];
  /** 2. d.332 — "Trạng thái từng dự án". */
  du_an: DuAnBaoCao[];
  /** 3. d.333 — "Chuyển sang mai". Xem `spec-questions.md` #119. */
  chuyen_sang_mai: ViecBaoCao[];
  /** 4. d.334 — "Cần Chủ **mới phát sinh**" (mới **trong ngày**, không mọi mục chờ). */
  can_chu_moi: MucGapNhatBaoCao[];
  /** Cho tin Telegram, tuỳ chọn (dữ liệu cũ không có): số mục Chờ, 5 mục đầu, rủi ro/lệch. */
  so_can_chu_cho?: number;
  ds_can_chu_cho?: MucGapNhatBaoCao[];
  rui_ro_va_lech?: DongChuYBaoCao[];
}

export type DuLieuBaoCao = DuLieuBaoCaoSang | DuLieuBaoCaoToi;

/* ------------------------------------------------------------------ *
 * 4. "Đạt hay chưa" — d.331
 * ------------------------------------------------------------------ */

/**
 * **Một trọng tâm đã đạt chưa** — d.331 ("theo **trạng thái các ticket được gắn
 * là trọng tâm**").
 *
 * Đạt = ticket ở **Xong** (`done`), và chỉ `done`. Ba ca biên đáng khai thẳng:
 *   * `verifying` (Chờ kiểm chứng) **chưa** đạt: mục 7 nói cổng bằng chứng đứng
 *     giữa `verifying` và `done`, nên gọi nó là "đạt" là báo xong một việc mà
 *     bằng chứng chưa qua — đúng thứ cả mục 7 tồn tại để chặn.
 *   * `canceled` (Huỷ) **không** đạt: một trọng tâm bị huỷ không phải một trọng
 *     tâm xong. Handoff tối vẫn kể nó (kèm nhãn "Huỷ"), vì chủ cần biết.
 *   * `duplicate` (Trùng) **không** đạt, cùng lý do — việc thật nằm ở ticket gốc,
 *     và ticket gốc không được gắn là trọng tâm.
 *
 * Nhận `string`, không `TrangThaiTicket`: giá trị tới từ một cột DB, và một mã lạ
 * (dữ liệu nhập từ công cụ cũ — mục 16) phải ra **chưa đạt**, không ném lỗi và
 * không làm vỡ cả báo cáo.
 */
export function trongTamDat(trang_thai: string): boolean {
  return trang_thai === 'done';
}

/** Số trọng tâm đã đạt / tổng — câu tóm của d.331. */
export function demTrongTamDat(ds: readonly MucTrongTamBaoCao[]): { dat: number; tong: number } {
  return { dat: ds.filter((m) => m.dat).length, tong: ds.length };
}

/* ------------------------------------------------------------------ *
 * 5. Markdown — vế "xuất ra markdown được" của d.336
 * ------------------------------------------------------------------ */

/** Tiêu đề từng vế — **chữ của SPEC** d.323–328 và d.331–334, không chữ tự do. */
export const TIEU_DE_VE_SANG = {
  can_chu: 'Cần Chủ (đọc trước)',
  trong_tam: 'Đề xuất 3 việc trọng tâm hôm nay',
  hom_qua: 'Hôm qua đã xong',
  dang_chay: 'Đang chạy',
  rui_ro: 'Rủi ro và lệch',
  quyet_dinh: 'Quyết định mới trong Nhật ký',
} as const;

export const TIEU_DE_VE_TOI = {
  trong_tam: '3 trọng tâm hôm nay: đạt hay chưa',
  du_an: 'Trạng thái từng dự án',
  chuyen_sang_mai: 'Chuyển sang mai',
  can_chu_moi: 'Cần Chủ mới phát sinh',
} as const;

/** Chữ hiện khi một vế không có dòng nào. Khác `CAU_CHUA_CO_DE_XUAT` của d.324. */
export const CAU_KHONG_CO_GI = 'không có';

/** Dấu của một trọng tâm đã đạt / chưa đạt — d.331. */
export const DAU_TRONG_TAM = { dat: '[x]', chua: '[ ]' } as const;

/** Một vế markdown: tiêu đề `##` + các dòng, hoặc một câu "không có". */
function ve(tieu_de: string, dong: readonly string[], cau_rong = CAU_KHONG_CO_GI): string {
  const than = dong.length === 0 ? [cau_rong] : dong;
  return [`## ${tieu_de}`, '', ...than].join('\n');
}

function dongTrongTam(m: MucTrongTamBaoCao): string {
  const dau = m.dat ? DAU_TRONG_TAM.dat : DAU_TRONG_TAM.chua;
  const ghi_chu = m.ghi_chu === null || m.ghi_chu.trim() === '' ? '' : ` — ${m.ghi_chu.trim()}`;
  return `${String(m.thu_tu)}. ${dau} **${m.ma}** ${m.tieu_de} (${m.nhan_trang_thai})${ghi_chu}`;
}

/**
 * Dòng cảnh báo sao lưu (BAT-8), đặt **ngay dưới tiêu đề** — trước mọi vế, nên nó
 * không chen vào thứ tự vế của d.322–334 (thứ tự đó có ca test đọc từ `SPEC.md`).
 * Không có cảnh báo ⇒ không dòng nào, markdown giữ nguyên như trước BAT-8.
 */
function dongCanhBaoSaoLuu(du_lieu: DuLieuBaoCaoChung): string[] {
  const c = du_lieu.canh_bao_sao_luu;
  return c === undefined || c === '' ? [] : [c, ''];
}

function dongViec(v: ViecBaoCao): string {
  return `- **${v.ma}** ${v.tieu_de} (${v.nhan_trang_thai})`;
}

/**
 * **Markdown của báo cáo sáng** — sáu vế của d.322–328, đúng thứ tự.
 *
 * Hàm **thuần**: không `Date.now()`, không đọc DB. Mốc và ngày tới qua `du_lieu`
 * (nếp đã chốt cho máy trạng thái, `decisions.md` 01/10), nên một ca test ghim
 * được cả chữ bằng một con số thay vì chờ thật.
 */
export function dungBaoCaoSangMd(du_lieu: DuLieuBaoCaoSang): string {
  const ct = du_lieu.can_chu;
  /*
   * d.316 ("số mục Chờ **theo mức**") đi vào một dòng, không một bảng: khoá của
   * `so_theo_muc` là **mã** mức, nên nhãn tiếng Việt lấy từ `nhan()` — bảng mã/nhãn
   * duy nhất của mục 0.1, không một bảng dịch thứ hai ở đây.
   */
  const theo_muc = Object.entries(ct.so_theo_muc)
    .map(([ma, so]) => `${nhan('muc_can_chu', ma)} ${String(so)}`)
    .join(', ');
  const dong_can_chu = [
    theo_muc === ''
      ? `Đang chờ: **${String(ct.so_cho)}** mục.`
      : `Đang chờ: **${String(ct.so_cho)}** mục (${theo_muc}).`,
    '',
    ...ct.gap_nhat.map((m) => `- ${m.nhan_muc} **${m.ma}** ${m.tieu_de}`),
  ];

  return [
    `# ${NHAN_BAO_CAO.sang} — ${du_lieu.ngay}`,
    '',
    ...dongCanhBaoSaoLuu(du_lieu),
    ve(TIEU_DE_VE_SANG.can_chu, dong_can_chu),
    '',
    // d.324: rỗng thì **để trống kèm chữ "chưa có đề xuất"** — chữ của SPEC.
    ve(
      TIEU_DE_VE_SANG.trong_tam,
      du_lieu.trong_tam.map(dongTrongTam),
      CAU_CHUA_CO_DE_XUAT,
    ),
    '',
    ve(
      `${TIEU_DE_VE_SANG.hom_qua} (${du_lieu.hom_qua.ngay})`,
      du_lieu.hom_qua.viec.map(dongViec),
    ),
    '',
    ve(
      TIEU_DE_VE_SANG.dang_chay,
      du_lieu.dang_chay.map(
        (v) => `${dongViec(v)} — ${v.agent_id === null ? 'không ai cầm' : v.agent_id}`,
      ),
    ),
    '',
    ve(
      TIEU_DE_VE_SANG.rui_ro,
      du_lieu.rui_ro_va_lech.map((d) => `- ${d.nhan_loai}: ${d.chi_tiet}`),
    ),
    '',
    ve(
      TIEU_DE_VE_SANG.quyet_dinh,
      du_lieu.quyet_dinh_moi.map((q) => `- ${q.nguoi}: ${q.quyet_dinh} — vì sao: ${q.vi_sao}`),
    ),
    '',
  ].join('\n');
}

/** **Markdown của handoff tối** — bốn vế của d.330–334, đúng thứ tự. */
export function dungBaoCaoToiMd(du_lieu: DuLieuBaoCaoToi): string {
  const dem = demTrongTamDat(du_lieu.trong_tam);

  return [
    `# ${NHAN_BAO_CAO.toi} — ${du_lieu.ngay}`,
    '',
    ...dongCanhBaoSaoLuu(du_lieu),
    ve(
      `${TIEU_DE_VE_TOI.trong_tam} (${String(dem.dat)}/${String(dem.tong)})`,
      du_lieu.trong_tam.map(dongTrongTam),
      CAU_CHUA_CO_DE_XUAT,
    ),
    '',
    ve(
      TIEU_DE_VE_TOI.du_an,
      du_lieu.du_an.map(
        (d) =>
          `- **${d.ma}** ${d.ten} — ${d.nhan_suc_song}; Đang làm ${String(d.so_dang_lam)}, ` +
          `Chờ kiểm chứng ${String(d.so_cho_kiem_chung)}, Xong 24 giờ qua ${String(d.so_xong_24h)}`,
      ),
    ),
    '',
    ve(TIEU_DE_VE_TOI.chuyen_sang_mai, du_lieu.chuyen_sang_mai.map(dongViec)),
    '',
    ve(
      TIEU_DE_VE_TOI.can_chu_moi,
      du_lieu.can_chu_moi.map((m) => `- ${m.nhan_muc} **${m.ma}** ${m.tieu_de}`),
    ),
    '',
  ].join('\n');
}

/** Markdown của một báo cáo, theo loại — một cửa duy nhất cho chỗ gọi. */
export function dungBaoCaoMd(loai: 'sang', du_lieu: DuLieuBaoCaoSang): string;
export function dungBaoCaoMd(loai: 'toi', du_lieu: DuLieuBaoCaoToi): string;
export function dungBaoCaoMd(loai: LoaiBaoCao, du_lieu: DuLieuBaoCao): string;
export function dungBaoCaoMd(loai: LoaiBaoCao, du_lieu: DuLieuBaoCao): string {
  return loai === 'sang'
    ? dungBaoCaoSangMd(du_lieu as DuLieuBaoCaoSang)
    : dungBaoCaoToiMd(du_lieu as DuLieuBaoCaoToi);
}

/* ------------------------------------------------------------------ *
 * 6. Nội dung TIN Telegram — mục 12 d.346
 * ------------------------------------------------------------------ */

/*
 * **Một tin Telegram không phải cả báo cáo.** d.346 chỉ nói "Bắn khi: … Báo cáo
 * sáng và tối", và d.347 nói "mỗi tin có **link** thẳng tới đúng thẻ hoặc
 * ticket" — tức hình đúng của tin là **một dòng tóm + một link**. Đổ cả sáu vế
 * vào một tin Telegram thì nó bị cắt (trần 4096 ký tự), và chủ phải cuộn một
 * khối markdown thô trong app chat thay vì mở trang đọc được.
 *
 * Link của tin do `linkCuaTin` (`packages/api/src/thong-bao.ts`) dựng từ
 * `BATON_URL_CONG_KHAI` — một chỗ duy nhất, xem `spec-questions.md` #116.
 */

/** Số dòng chi tiết tối đa dưới dòng tổng của tin Telegram. */
export const SO_DONG_CHI_TIET_TIN = 5;

/**
 * Dòng chi tiết của tin: mục Cần Chủ đang chờ trước, rủi ro/lệch sau. Quá 5 dòng
 * thì 4 dòng đầu + `… và N mục khác`.
 */
export function dongChiTietTin(
  can_chu: { tong: number; ds: readonly MucGapNhatBaoCao[] },
  rui_ro: readonly DongChuYBaoCao[],
): string[] {
  const dong = [
    ...can_chu.ds.map((m) => `${m.ma}: ${m.tieu_de}`),
    ...rui_ro.map((d) =>
      d.ma_ticket === undefined || d.ma_ticket === null
        ? d.nhan_loai
        : `${d.ma_ticket}: ${d.nhan_loai}`,
    ),
  ];
  const tong = Math.max(can_chu.tong, can_chu.ds.length) + rui_ro.length;
  const hien = tong <= SO_DONG_CHI_TIET_TIN ? dong : dong.slice(0, SO_DONG_CHI_TIET_TIN - 1);
  if (hien.length >= tong) return hien;
  return [...hien, `… và ${String(tong - hien.length)} mục khác`];
}

/** Dòng tóm của **báo cáo sáng** — tiếng Việt (mục 0.1). */
export function tinBaoCaoSang(du_lieu: DuLieuBaoCaoSang): string {
  const dem = demTrongTamDat(du_lieu.trong_tam);
  const trong_tam =
    dem.tong === 0 ? CAU_CHUA_CO_DE_XUAT : `${String(dem.tong)} trọng tâm hôm nay`;
  const tong =
    `${NHAN_BAO_CAO.sang} ${du_lieu.ngay} — ` +
    `Cần Chủ đang chờ: ${String(du_lieu.can_chu.so_cho)}; ` +
    `${trong_tam}; ` +
    `hôm qua xong: ${String(du_lieu.hom_qua.viec.length)}; ` +
    `đang chạy: ${String(du_lieu.dang_chay.length)}; ` +
    `rủi ro và lệch: ${String(du_lieu.rui_ro_va_lech.length)}.`;
  const chi_tiet = dongChiTietTin(
    { tong: du_lieu.can_chu.so_cho, ds: du_lieu.can_chu.ds_cho ?? du_lieu.can_chu.gap_nhat },
    du_lieu.rui_ro_va_lech,
  );
  return [tong, ...dongCanhBaoSaoLuu(du_lieu).slice(0, 1), ...chi_tiet].join('\n');
}

/** Dòng tóm của **handoff tối** — tiếng Việt (mục 0.1). */
export function tinBaoCaoToi(du_lieu: DuLieuBaoCaoToi): string {
  const dem = demTrongTamDat(du_lieu.trong_tam);
  const trong_tam =
    dem.tong === 0
      ? CAU_CHUA_CO_DE_XUAT
      : `trọng tâm đạt ${String(dem.dat)}/${String(dem.tong)}`;
  const tong =
    `${NHAN_BAO_CAO.toi} ${du_lieu.ngay} — ` +
    `${trong_tam}; ` +
    `chuyển sang mai: ${String(du_lieu.chuyen_sang_mai.length)}; ` +
    `Cần Chủ mới phát sinh: ${String(du_lieu.can_chu_moi.length)}.`;
  const ds = du_lieu.ds_can_chu_cho ?? [];
  const chi_tiet = dongChiTietTin(
    { tong: du_lieu.so_can_chu_cho ?? ds.length, ds },
    du_lieu.rui_ro_va_lech ?? [],
  );
  // Dòng cảnh báo sao lưu (BAT-8) đứng ngay dưới dòng tổng, **không** tính vào 5 dòng
  // chi tiết: nó là một sự cố của hệ, không một mục việc.
  return [tong, ...dongCanhBaoSaoLuu(du_lieu).slice(0, 1), ...chi_tiet].join('\n');
}

/** Nội dung tin của một báo cáo, theo loại — một cửa duy nhất. */
export function tinBaoCao(loai: LoaiBaoCao, du_lieu: DuLieuBaoCao): string {
  return loai === 'sang'
    ? tinBaoCaoSang(du_lieu as DuLieuBaoCaoSang)
    : tinBaoCaoToi(du_lieu as DuLieuBaoCaoToi);
}
