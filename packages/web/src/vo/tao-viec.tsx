/**
 * **Tạo việc trên web** — SPEC mục 14 d.413 ("`C` tạo ticket"), trường của mục 4
 * (dự án, tiêu đề, mô tả markdown, ưu tiên, ticket cha). BAT-22 việc A.
 *
 * Hai lối vào, **một** hộp: nút "Tạo việc" ở đầu sidebar và phím `C` — cộng
 * (BAT-62) nút `+` ở đầu cột Cần làm của bảng, (BAT-63) nút `+` ở đầu nhóm
 * Backlog của kiểu Danh sách và (BAT-64) nút `+` ở đầu cột Backlog của bảng, mở
 * cùng hộp này qua `MoTaoViecContext` (`vo/mo-tao-viec.ts`). Tất cả chỉ
 * sống trong **vỏ đã đăng nhập** (`Vo` của `App.tsx`): trang đăng nhập không dựng
 * vỏ (mục 15), nên không có phím `C` ở đó và không có đường nào cho agent —
 * agent chỉ dùng token (mục 15 d.426), tạo ticket bằng `baton create`.
 *
 * ## Phím `C` đi trong listener `keydown` DUY NHẤT của vỏ
 *
 * Trước BAT-22 vỏ không đăng ký phím toàn cục nào, vì một listener của vỏ có thể
 * ăn phím trước phím tắt trong trang (`1`–`5`, `D`, `S`, `J`/`K` của Cần Chủ
 * d.270; `J`/`K`/`S`/`Esc` của danh sách). Từ BAT-23 listener ấy ở
 * `vo/phim-vo.tsx` (`usePhimVo`, chung với chuỗi `G` và `?`); với phím `C` nó
 * chỉ chạm đúng `c`/`C` (`laPhimTaoViec`). Không trang nào dùng `C`.
 *
 * Nó **không** chạy khi: có Ctrl/Meta/Alt (`Cmd+C` là sao chép); đang gõ trong
 * ô nhập (input/textarea/select/contenteditable); đang có một hộp `aria-modal`
 * (menu trượt 375px, panel chi tiết ở 375px, hay chính hộp này); phím đã bị một
 * chỗ khác `preventDefault`; đang gõ bộ gõ (IME).
 *
 * ## Hộp đang mở, phím KHÔNG lọt ra trang — ba lớp
 *
 * Listener của trang nằm ở `window` (bubble). Không chặn thì `Cmd/Ctrl+Enter` sẽ
 * **gửi thẻ Cần Chủ đang chọn** phía sau (d.270 nhận `Cmd/Ctrl+Enter` cả khi đang
 * gõ), `D` gửi trả lời, `J`/`K` đổi thẻ chọn, `Esc` đóng panel của danh sách.
 *
 *   1. `onKeyDown` của hộp `stopPropagation` mọi phím **bắt nguồn trong hộp**
 *      (không chặn việc gõ chữ).
 *   2. Phím có đích **ngoài hộp** (focus rơi về `body` khi nút Tạo bị khoá lúc
 *      gửi, khi bấm chỗ trống, …): listener `window` ở **capture** —
 *      `chanPhimNgoaiHop` — `stopImmediatePropagation()` trước khi tới listener
 *      bubble của trang (capture ở `window` luôn chạy trước bubble ở `window`,
 *      bất kể thứ tự đăng ký). `Esc` ở đó đóng hộp (trừ lúc đang gửi).
 *   3. Bẫy focus: hộp `tabIndex={-1}` (bấm chỗ trống thì focus vào hộp, không về
 *      `body`), `Tab`/`Shift+Tab` vòng trong hộp; gửi lỗi thì focus về ô liên
 *      quan; lúc gửi, nếu focus đang ở nút vừa bị khoá thì chuyển về hộp.
 *
 * Thêm một lớp phòng thủ ở chính trang: listener của Cần Chủ và danh sách thoát
 * sớm khi `hopTaoViecDangMo()`. Không dùng `coHopModalDangMo`: panel chi tiết ở
 * 375px cũng là `aria-modal` và `Esc` của danh sách phải đóng được nó.
 *
 * ## Việc cha: nhập MÃ, tra ra id
 *
 * API nhận `ticket_cha_id` là **id**. Hộp cho nhập **mã** (`BAT-12`, thứ chủ đọc
 * được) rồi tra bằng `GET /v1/ticket/ma/:ma` lúc gửi — cùng nếp `baton create
 * --parent MÃ`. Không dựng ô chọn từ danh sách ticket: danh sách có thể tới 5.000
 * dòng (d.419), và cả SPEC lẫn máy chủ đều không ép cha **cùng dự án** — một ô
 * chọn chỉ trong dự án đang chọn sẽ tự đặt thêm một luật. Tra trượt thì
 * **không** gọi `POST`, và câu lỗi của máy chủ hiện kèm mã đã nhập. Cha chỉ đặt
 * được **lúc tạo** (19.12 câu 12), nên đây là chỗ duy nhất trên web để đặt cha.
 *
 * ## Trạng thái ban đầu: Cần làm hoặc Backlog (BAT-63)
 *
 * SPEC mục 4 "Trạng thái khi tạo" (Chủ chốt T-108 = B): mặc định **Cần làm**,
 * người tạo được chọn **Backlog**, không gì khác. Ô "Trạng thái" chỉ có đúng hai
 * lựa chọn ấy (`TRANG_THAI_KHI_TAO_WEB`); giá trị đầu theo **cách mở**
 * (`moHop({ trang_thai: 'backlog' })` từ nút `+` nhóm Backlog, còn lại Cần làm).
 * Hộp tháo khỏi cây khi đóng, nên mỗi lần mở là một state mới. Chọn Cần làm thì
 * **không gửi** `trang_thai` (máy chủ mặc định — cùng nếp `baton create` không
 * cờ); chọn Backlog thì gửi `trang_thai: 'backlog'`. Máy chủ vẫn là chỗ kiểm.
 *
 * ## Không lạc quan
 *
 * d.418 ("hiện ngay trước khi server trả lời") viết cho thao tác **sửa**; một
 * ticket chưa có mã cho tới khi máy chủ cấp số (mục 4), nên không có gì để hiện
 * trước. Hộp **khoá nút** trong lúc gửi (không tạo đôi), lỗi máy chủ hiện **trong
 * hộp** và ở toast (vế "báo lỗi dạng toast ghi rõ lý do"), nội dung đã nhập **giữ
 * nguyên** để bấm lại. `spec-questions.md` #149.
 *
 * **Mất mạng** (BAT-34 việc 2): lượt gửi tạm dừng ⇒ hộp nói rõ "đang chờ có mạng",
 * Esc/Huỷ bật lại, và đóng hộp lúc đó là **huỷ gửi** (0 request khi có mạng lại,
 * toast "chưa tạo gì") — `huy-gui.ts`. Có mạng lại trước khi đóng thì gửi như
 * thường. Chốt gửi trùng đồng bộ: `useMotLan` (BAT-32).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cauLoi,
  layDuAn,
  layTicketTheoMa,
  taoTicket,
  type DuAnSidebar,
  type KetQuaTaoTicket,
  type ThanTaoTicket,
  type UuTien,
} from '../api';
import { KHOA_LOC_TICKET, NHAN_TRANG_THAI, NHAN_UU_TIEN, UU_TIEN_THEO_THU_TU } from '../loc-ticket';
import { Markdown } from '../markdown';
import { IconTrangThai } from './icon';
import {
  TRANG_THAI_KHI_TAO_MAC_DINH_WEB,
  TRANG_THAI_KHI_TAO_WEB,
  trangThaiDauTuTuyChon,
  type MoTaoViec,
  type TrangThaiKhiTaoWeb,
} from './mo-tao-viec';
import { LOP_TIEU_DE_MUC, NUT_CHINH, NUT_MO_KHI_DISABLED } from './lop-nut';
import { duongTicket } from './muc-sidebar';
import { useToast } from './toast';
import { lamMoiTheoSo } from '../ghi-lac-quan';
import {
  CAU_CHO_MANG,
  CAU_CHO_MANG_DA_THU,
  CAU_DA_HUY_TAO,
  LoiHuyGui,
  batDauLuot,
  taoCoLuot,
  useHuyGuiKhiDong,
  type CoLuotGui,
} from '../huy-gui';
import { useMotLan } from '../mot-lan';

/* ================================================================== *
 * Chữ của hộp
 * ================================================================== */

export const NHAN_HOP_TAO_VIEC = 'Tạo việc';
export const NHAN_O_DU_AN = 'Dự án';
export const NHAN_O_TIEU_DE = 'Tiêu đề';
export const NHAN_O_MO_TA = 'Mô tả (markdown)';
export const NHAN_O_UU_TIEN = 'Ưu tiên';
export const NHAN_O_TRANG_THAI = 'Trạng thái';
export const NHAN_O_CHA = 'Việc cha (mã, không bắt buộc)';
export const GOI_Y_O_CHA = 'VD: BAT-12';
export const NHAN_CHUA_CHON_DU_AN = '— Chọn dự án —';
export const NHAN_NUT_GUI_TAO = 'Tạo việc';
export const NHAN_NUT_DANG_TAO = 'Đang tạo…';
export const NHAN_NUT_HUY_TAO = 'Huỷ';
export const NHAN_DONG_HOP_NGOAI = 'Đóng hộp tạo việc (bấm ra ngoài)';
export const NHAN_XEM_TRUOC = 'Xem trước';
export const NHAN_SOAN = 'Soạn';
export const CAU_XEM_TRUOC_RONG = 'Chưa có mô tả.';

/** Hai câu kiểm phía client — chỉ cho hai ô **bắt buộc** của mục 4. */
export const CAU_THIEU_DU_AN = 'Chọn một dự án.';
export const CAU_THIEU_TIEU_DE = 'Tiêu đề không được để trống.';

/**
 * Ưu tiên mặc định — SPEC mục 4: "Mặc định `Không`" (mã `none`). Cùng giá trị với
 * `UU_TIEN_MAC_DINH` của máy chủ; test ghim chữ SPEC.
 */
export const UU_TIEN_MAC_DINH_WEB: UuTien = 'none';

/* ================================================================== *
 * Hàm thuần — test được không cần DOM
 * ================================================================== */

/** `<input type>` không nhận chữ gõ: bật/tắt/bấm bằng Space/Enter, không có con trỏ soạn. */
const KIEU_INPUT_KHONG_GO = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'image']);

/**
 * Đích của sự kiện bàn phím có phải một ô đang nhận chữ?
 *
 * Có: `<input>` mọi kiểu **trừ** checkbox, radio, button, submit, reset, image (các
 * kiểu ấy không nhận chữ — focus ở ô tick thì phím vỏ `C`/`G`/`?` và phím trang vẫn
 * phải chạy, BAT-36); `<textarea>`; `<select>`; vùng contenteditable và phần tử con
 * của nó (trừ `contenteditable="false"`). `<input>` không có type = text ⇒ có.
 */
export function trongONhap(dich: EventTarget | null): boolean {
  if (!(dich instanceof HTMLElement)) return false;
  if (dich instanceof HTMLInputElement) {
    // `type` của DOM đã chuẩn hoá về chữ thường; giá trị lạ ⇒ 'text'.
    return !KIEU_INPUT_KHONG_GO.has(dich.type);
  }
  if (['TEXTAREA', 'SELECT'].includes(dich.tagName)) return true;
  /*
   * `isContentEditable` cộng `closest('[contenteditable]')`: jsdom không cài
   * `isContentEditable`, và một phần tử **con** của vùng contenteditable cũng là
   * chỗ đang gõ.
   */
  if (dich.isContentEditable) return true;
  return dich.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

/** Đang có một hộp `aria-modal` nào trên màn hình (menu trượt, panel 375px, hộp này)? */
export function coHopModalDangMo(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/** Bộ chọn của **chính** hộp tạo việc trên DOM. */
export const CHON_HOP_TAO_VIEC = '[data-o="hop-tao-viec"]';

/**
 * Hộp tạo việc đang mở? Listener phím của trang (Cần Chủ, danh sách) thoát sớm
 * khi đúng — lớp phòng thủ thứ hai, xem đầu file.
 */
export function hopTaoViecDangMo(): boolean {
  return document.querySelector(CHON_HOP_TAO_VIEC) !== null;
}

/**
 * Lớp ký tự mã dự án — **bản chép** của `NGUON_MA_DU_AN` (`packages/shared/src/kieu.ts`,
 * SPEC mục 2 "Mã chỉ gồm 2–6 chữ A–Z"). Web không nhập `@baton/shared`;
 * `test/tao-viec.test.tsx` ghim chuỗi này bằng đúng chuỗi của `shared`.
 */
export const NGUON_MA_DU_AN_WEB = '[A-Z]{2,6}';
const MAU_MA_TICKET_WEB = new RegExp(`^(${NGUON_MA_DU_AN_WEB})-[1-9][0-9]*$`);

/** Chuẩn hoá mã cha chủ gõ: cắt khoảng trắng, chữ hoa (`spx-3` → `SPX-3`). */
export function chuanMaCha(ma: string): string {
  return ma.trim().toUpperCase();
}

/**
 * Chuỗi chủ gõ có **đúng dạng mã ticket** không (`MÃ-số`, SPEC mục 1, 2, 4)?
 * Cắt khoảng trắng, không phân biệt hoa/thường (` sai-5 ` → `SAI-5`). Không
 * đúng dạng (`bug`, `SAI`, `SAI-`, `5`, `SAI-01`) ⇒ `null`.
 *
 * Dùng **cùng** `MAU_MA_TICKET_WEB` với đường `/t/:ma` của hộp tạo việc: một
 * mã ticket có một định nghĩa. Người dùng: dòng "Mở MÃ" dưới ô lọc Nhãn của
 * danh sách (BAT-41, `spec-questions.md` #167).
 */
export function maTicketTuChuoiGo(chuoi: string): string | null {
  const ma = chuanMaCha(chuoi);
  return MAU_MA_TICKET_WEB.test(ma) ? ma : null;
}

/** Các phần tử nhận được focus bằng Tab trong `goc`, theo thứ tự DOM. */
function phanTuFocusDuoc(goc: HTMLElement): HTMLElement[] {
  const chon =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return [...goc.querySelectorAll<HTMLElement>(chon)].filter((x) => x.tabIndex >= 0);
}

/**
 * `Tab`/`Shift+Tab` vòng trong hộp. Trả `true` nếu đã tự chuyển focus (đã
 * `preventDefault`). Đích ngoài hộp hoặc chính khung hộp ⇒ vào phần tử đầu/cuối.
 */
export function vongTab(e: KeyboardEvent, hop: HTMLElement): boolean {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return false;
  const ds = phanTuFocusDuoc(hop);
  const dau = ds[0];
  const cuoi = ds[ds.length - 1];
  if (dau === undefined || cuoi === undefined) {
    e.preventDefault();
    hop.focus();
    return true;
  }
  const dich = e.target instanceof Node ? e.target : null;
  const trong = dich !== null && hop.contains(dich) && dich !== hop;
  let toi: HTMLElement | null = null;
  if (!trong) toi = e.shiftKey ? cuoi : dau;
  else if (e.shiftKey && dich === dau) toi = cuoi;
  else if (!e.shiftKey && dich === cuoi) toi = dau;
  if (toi === null) return false;
  e.preventDefault();
  toi.focus();
  return true;
}

/** Phím này thuộc một lượt soạn IME (`isComposing`, hoặc `keyCode` 229 của trình duyệt cũ). */
export function dangSoanIme(e: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return e.isComposing || e.keyCode === 229;
}

/**
 * Listener `window` capture của hộp: phím có đích **ngoài** hộp không được tới
 * listener nào khác (trang, React). `Esc` ⇒ `dong()` (trừ lúc đang soạn IME);
 * `Tab` ⇒ vào hộp. Phím có đích **trong** hộp chỉ bị xét `Tab` (vòng), còn lại để
 * React xử lý.
 *
 * Chấp nhận: Enter/Space ngoài hộp bị chặn nên nút ✕ của toast không đóng được
 * bằng bàn phím khi hộp đang mở (chuột vẫn đóng được).
 */
export function chanPhimNgoaiHop(e: KeyboardEvent, hop: HTMLElement, dong: () => void): void {
  const dich = e.target instanceof Node ? e.target : null;
  const trong = dich !== null && hop.contains(dich);
  if (vongTab(e, hop) && !trong) {
    e.stopImmediatePropagation();
    return;
  }
  if (trong) return;
  e.stopImmediatePropagation();
  if (e.key === 'Escape') {
    // Esc lúc đang soạn IME là huỷ phần đang soạn, không phải đóng hộp.
    if (dangSoanIme(e)) return;
    e.preventDefault();
    dong();
    return;
  }
  // Enter/Space trên một nút sau lớp nền không được bấm nó.
  if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
}

export interface SuKienPhim {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
  target: EventTarget | null;
}

/**
 * Phím này có mở hộp tạo việc không — d.413. **Chỉ** `c`/`C` (Shift được: chữ hoa
 * vẫn là phím `C`), không phím phụ, không đang gõ, không có hộp modal khác.
 */
export function laPhimTaoViec(e: SuKienPhim): boolean {
  if (e.key !== 'c' && e.key !== 'C') return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (e.isComposing === true || e.defaultPrevented === true) return false;
  if (trongONhap(e.target)) return false;
  return !coHopModalDangMo();
}

/**
 * **Dự án chọn sẵn** theo chỗ chủ đang đứng — brief: "đang ở trang của một dự án
 * thì chọn sẵn dự án đó".
 *
 *   * `/du-an/<MÃ>` (danh sách theo dự án, d.402) — tra theo mã;
 *   * `/du-an/<id>/ho-so` (mục 9) — tra theo id;
 *   * `/t/<MÃ-số>` (d.408) — dự án của ticket đang xem, từ tiền tố mã;
 *   * `?du_an=<id>` — bộ lọc dự án **ghi trên URL** của danh sách ticket (mục 14
 *     gạch "Danh sách ticket", d.418 "Bộ lọc ghi trên URL"), đọc qua đúng hằng
 *     `KHOA_LOC_TICKET.du_an` (cùng khoá với Nhật ký `KHOA_LOC_NHAT_KY.du_an`).
 *     Chỉ chọn sẵn khi URL lọc **đúng một** dự án; khoá lặp nhiều giá trị ⇒
 *     `null`. BAT-62: trước đây hàm đọc `?project_id=` — tên tham số của
 *     **máy chủ**, không chỗ nào trong `src` ghi nó lên URL — nên bảng chung lọc
 *     một dự án không chọn sẵn được.
 *
 * Chỉ trả id của một dự án **có trong danh sách** (đã bỏ lưu trữ): không đoán.
 */
export function duAnGoiY(
  pathname: string,
  search: string,
  ds: readonly DuAnSidebar[],
): string | null {
  const doan = pathname.split('/').filter((s) => s !== '');
  const theoMa = (ma: string): string | null => ds.find((d) => d.ma === ma)?.id ?? null;
  const theoId = (id: string): string | null => ds.find((d) => d.id === id)?.id ?? null;

  if (doan[0] === 'du-an' && doan[1] !== undefined) {
    const khoa = decodeURIComponent(doan[1]);
    return doan[2] === 'ho-so' ? theoId(khoa) : theoMa(khoa);
  }
  if (doan[0] === 't' && doan[1] !== undefined) {
    const tien_to = MAU_MA_TICKET_WEB.exec(decodeURIComponent(doan[1]))?.[1];
    return tien_to === undefined ? null : theoMa(tien_to);
  }
  const loc = new URLSearchParams(search)
    .getAll(KHOA_LOC_TICKET.du_an)
    .filter((v) => v !== '');
  const mot = loc.length === 1 ? loc[0] : undefined;
  return mot === undefined ? null : theoId(mot);
}

export interface NhapTaoViec {
  project_id: string;
  tieu_de: string;
  mo_ta: string;
  uu_tien: UuTien;
  /** Cần làm hoặc Backlog — SPEC mục 4 "Trạng thái khi tạo" (BAT-63). Thiếu ⇒ Cần làm. */
  trang_thai?: TrangThaiKhiTaoWeb;
  ma_cha: string;
}

export interface LoiNhap {
  du_an?: string;
  tieu_de?: string;
}

/** Kiểm hai ô bắt buộc. Tiêu đề toàn khoảng trắng là **thiếu** (mục 4: "sau khi cắt"). */
export function kiemNhap(n: Pick<NhapTaoViec, 'project_id' | 'tieu_de'>): LoiNhap {
  const loi: LoiNhap = {};
  if (n.project_id === '') loi.du_an = CAU_THIEU_DU_AN;
  if (n.tieu_de.trim() === '') loi.tieu_de = CAU_THIEU_TIEU_DE;
  return loi;
}

/**
 * Thân `POST /v1/ticket`. Mô tả rỗng **không** gửi (để máy chủ ghi `null`, không
 * một chuỗi rỗng); cha chỉ gửi khi đã tra ra **id**. Trạng thái chỉ gửi khi
 * **khác** mặc định (Backlog) — Cần làm là mặc định của máy chủ (BAT-63).
 */
export function thanTaoViec(
  n: Omit<NhapTaoViec, 'ma_cha'>,
  ticket_cha_id: string | null,
): ThanTaoTicket {
  const than: ThanTaoTicket = {
    project_id: n.project_id,
    tieu_de: n.tieu_de.trim(),
    uu_tien: n.uu_tien,
  };
  if (n.trang_thai !== undefined && n.trang_thai !== TRANG_THAI_KHI_TAO_MAC_DINH_WEB) {
    than.trang_thai = n.trang_thai;
  }
  if (n.mo_ta.trim() !== '') than.mo_ta = n.mo_ta;
  if (ticket_cha_id !== null) than.ticket_cha_id = ticket_cha_id;
  return than;
}

/* ================================================================== *
 * Hook của vỏ: trạng thái mở
 * ================================================================== */

/**
 * Trạng thái mở của hộp. Phím `C` **không** nghe ở đây: từ BAT-23 nó đi chung
 * listener duy nhất của vỏ với chuỗi `G` và `?` (`vo/phim-vo.tsx` `usePhimVo`),
 * vẫn qua `laPhimTaoViec`. Hộp đang mở thì listener ấy bỏ qua `C` (hộp là
 * `aria-modal`): `C` lúc đó là một chữ gõ vào hộp.
 *
 * `moHop(tuy_chon?)` (BAT-63): `{ trang_thai: 'backlog' }` ⇒ hộp mở với Backlog
 * chọn sẵn; không kèm — hay kèm một sự kiện bấm, khi `moHop` gắn thẳng vào
 * `onClick` — ⇒ Cần làm (`trangThaiDauTuTuyChon`). Mỗi lần mở đặt lại giá trị.
 */
export function useHopTaoViec(): {
  mo: boolean;
  trang_thai_dau: TrangThaiKhiTaoWeb;
  moHop: MoTaoViec;
  dongHop: () => void;
} {
  const [trang, datTrang] = useState<{ mo: boolean; trang_thai_dau: TrangThaiKhiTaoWeb }>({
    mo: false,
    trang_thai_dau: TRANG_THAI_KHI_TAO_MAC_DINH_WEB,
  });
  const moHop = useCallback<MoTaoViec>((tuy_chon) => {
    datTrang({ mo: true, trang_thai_dau: trangThaiDauTuTuyChon(tuy_chon) });
  }, []);
  const dongHop = useCallback(() => {
    datTrang((cu) => ({ ...cu, mo: false }));
  }, []);
  return { mo: trang.mo, trang_thai_dau: trang.trang_thai_dau, moHop, dongHop };
}

/* ================================================================== *
 * Hộp
 * ================================================================== */

/** Lỗi của bước tra mã cha — mang mã đã nhập để câu lỗi nói rõ ô nào. */
class LoiTraCha extends Error {
  constructor(ma: string, goc: unknown) {
    super(`Việc cha ${ma}: ${cauLoi(goc)}`);
    this.name = 'LoiTraCha';
  }
}

/** Câu lỗi hiện cho chủ — câu của máy chủ nguyên văn (nếp `api.ts`). */
function cauLoiHop(loi: unknown): string {
  return loi instanceof LoiTraCha ? loi.message : cauLoi(loi);
}

const O_NHAP = 'rounded border border-vien bg-nen px-2 py-1 text-sm text-chu';

export function HopTaoViec({
  dong,
  trang_thai_dau = TRANG_THAI_KHI_TAO_MAC_DINH_WEB,
}: {
  dong: () => void;
  /** Trạng thái chọn sẵn lúc mở (BAT-63) — theo cách mở, xem `useHopTaoViec`. */
  trang_thai_dau?: TrangThaiKhiTaoWeb;
}): React.JSX.Element {
  const { pathname, search } = useLocation();
  const dieu_huong = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  // Cùng khoá `['du-an']` với sidebar: không thêm một lượt gọi nào khi đã có.
  const du_an_q = useQuery({ queryKey: ['du-an'], queryFn: layDuAn });
  const ds = useMemo(
    () => (du_an_q.data?.items ?? []).filter((d) => d.trang_thai !== 'archived'),
    [du_an_q.data],
  );
  const goi_y = useMemo(() => duAnGoiY(pathname, search, ds), [pathname, search, ds]);

  /*
   * `null` = chủ **chưa tự chọn** ⇒ dùng gợi ý theo đường. Không chép gợi ý vào
   * state lúc mở: danh sách dự án có thể về **sau** khi hộp mở, và lúc đó gợi ý
   * vẫn phải tới.
   */
  const [du_an_chon, datDuAnChon] = useState<string | null>(null);
  const project_id = du_an_chon ?? goi_y ?? '';
  const [tieu_de, datTieuDe] = useState('');
  const [mo_ta, datMoTa] = useState('');
  const [uu_tien, datUuTien] = useState<UuTien>(UU_TIEN_MAC_DINH_WEB);
  // Giá trị đầu chỉ đọc lúc dựng: hộp tháo khỏi cây khi đóng, nên mỗi lần mở là một state mới.
  const [trang_thai, datTrangThai] = useState<TrangThaiKhiTaoWeb>(trang_thai_dau);
  const [ma_cha, datMaCha] = useState('');
  const [xem_truoc, datXemTruoc] = useState(false);
  const [da_bam, datDaBam] = useState(false);

  const o_du_an = useRef<HTMLSelectElement | null>(null);
  const o_tieu_de = useRef<HTMLInputElement | null>(null);
  const o_ma_cha = useRef<HTMLInputElement | null>(null);
  const khung = useRef<HTMLDivElement | null>(null);

  const tao = useMutation<KetQuaTaoTicket, Error, NhapTaoViec & { co: CoLuotGui }>({
    mutationFn: async (n) => {
      // BAT-34 việc 2: cờ huỷ của lượt kiểm TRƯỚC mọi `fetch` (kể cả tra mã cha).
      batDauLuot(n.co);
      const ma = chuanMaCha(n.ma_cha);
      let cha_id: string | null = null;
      if (ma !== '') {
        try {
          cha_id = (await layTicketTheoMa(ma)).id;
        } catch (loi) {
          throw new LoiTraCha(ma, loi);
        }
      }
      return taoTicket(thanTaoViec(n, cha_id));
    },
    onSuccess: (kq) => {
      /*
       * Làm mới mọi màn hình có thể chứa ticket mới: khoá tiền tố `['ticket']`
       * trùm danh sách / bảng (`['ticket','man-hinh',…]`) và chi tiết ticket cha
       * (`['ticket','chi-tiet',…]` — khối ticket con); `['tong-quan']` đếm việc
       * Cần làm và thanh tiến độ (d.317).
       *
       * BAT-28: `lamMoiTheoSo` — `['ticket']` trùm cả khoá chi tiết mà `useSuaTicket`
       * có thể còn đang ghi lạc quan (sửa tiêu đề rồi tạo việc ngay); khoá đó hoãn.
       */
      void lamMoiTheoSo(qc, { queryKey: ['ticket'] });
      void lamMoiTheoSo(qc, { queryKey: ['tong-quan'] });
      dong();
      void dieu_huong(duongTicket(kq.ma));
    },
    onError: (loi) => {
      // Huỷ vì đóng hộp lúc mất mạng: không phải lỗi máy chủ — toast huỷ đã báo lúc đóng.
      if (loi instanceof LoiHuyGui) return;
      toast.bao(cauLoiHop(loi));
      // Focus về ô liên quan (lúc gửi nó có thể đã rơi khỏi hộp): ô cha nếu lỗi
      // tra mã cha, ngược lại ô tiêu đề.
      (loi instanceof LoiTraCha ? o_ma_cha.current : o_tieu_de.current)?.focus();
    },
  });
  const dang_gui = tao.isPending;
  /*
   * BAT-34 việc 2: lượt **tạm dừng vì mất mạng** ⇒ Esc/Huỷ bật lại, đóng hộp là HUỶ
   * GỬI (`huy-gui.ts`). Đang bay thật thì vẫn khoá như cũ.
   *
   * `dong_duoc` chỉ để VẼ nút Huỷ; quyết định đóng thật nằm ở `huy()` qua
   * `huy_gui.huyNeuDangCho()` — đọc cờ lượt đồng bộ, vì `isPaused` render có thể cũ.
   */
  const dong_duoc = !dang_gui || (tao.isPaused && tao.failureCount === 0);
  const huy_gui = useHuyGuiKhiDong((c) => toast.bao(c, 'tin'), CAU_DA_HUY_TAO);
  const mot = useMotLan();

  /*
   * Lúc gửi, nút vừa bấm bị khoá — trình duyệt có thể đẩy focus về `body`. Giữ
   * focus trong hộp: chuyển về khung hộp nếu focus đang ở phần tử bị khoá/ngoài hộp.
   */
  useEffect(() => {
    if (!dang_gui) return;
    const h = khung.current;
    const dang = document.activeElement;
    if (h === null) return;
    const bi_khoa = dang instanceof HTMLButtonElement && dang.disabled;
    if (bi_khoa || dang === null || !h.contains(dang)) h.focus();
  }, [dang_gui]);

  /* Lớp 2 + 3 của "phím không lọt ra trang" — xem đầu file. */
  useEffect(() => {
    const nghe = (e: KeyboardEvent): void => {
      const h = khung.current;
      if (h === null) return;
      chanPhimNgoaiHop(e, h, () => {
        huy_ref.current();
      });
    };
    window.addEventListener('keydown', nghe, { capture: true });
    return () => {
      window.removeEventListener('keydown', nghe, { capture: true });
    };
  }, [dong]);

  /*
   * Focus khi mở: ô dự án nếu chưa có dự án, ngược lại ô tiêu đề. Khi đóng: trả
   * focus về chỗ cũ (nút "Tạo việc", hay thân trang) — nếp menu trượt của
   * `App.tsx`.
   */
  useEffect(() => {
    const truoc = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (project_id === '') o_du_an.current?.focus();
    else o_tieu_de.current?.focus();
    const cu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = cu;
      if (truoc !== null && truoc.isConnected) truoc.focus();
    };
    // Mảng phụ thuộc rỗng có chủ ý: chỉ lúc mở/đóng hộp, không chạy lại khi chủ
    // đổi dự án (đổi dự án mà con trỏ nhảy sang ô tiêu đề là giật).
  }, []);

  const loi_nhap = da_bam ? kiemNhap({ project_id, tieu_de }) : {};

  const gui = (e: React.FormEvent): void => {
    e.preventDefault();
    if (dang_gui) return;
    datDaBam(true);
    const loi = kiemNhap({ project_id, tieu_de });
    if (loi.du_an !== undefined) {
      o_du_an.current?.focus();
      return;
    }
    if (loi.tieu_de !== undefined) {
      o_tieu_de.current?.focus();
      return;
    }
    const co = taoCoLuot();
    // Chốt đồng bộ (BAT-32): hai submit trong cùng một nhịp chỉ ra MỘT lượt.
    mot((tha) => {
      huy_gui.ghi(co);
      tao.mutate(
        { project_id, tieu_de, mo_ta, uu_tien, trang_thai, ma_cha, co },
        {
          onSettled: () => {
            huy_gui.xong(co);
            tha();
          },
        },
      );
    });
  };

  const huy = (): void => {
    // Lượt đã bay (kể cả khi `isPaused` của lần render trước còn `true`) ⇒ không đóng.
    if (!huy_gui.huyNeuDangCho()) return;
    dong();
  };
  const huy_ref = useRef(huy);
  huy_ref.current = huy;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:pt-[10vh]">
      <button
        type="button"
        aria-label={NHAN_DONG_HOP_NGOAI}
        tabIndex={-1}
        onClick={huy}
        className="absolute inset-0 bg-lop-phu"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={NHAN_HOP_TAO_VIEC}
        data-o="hop-tao-viec"
        ref={khung}
        tabIndex={-1}
        onKeyDown={(e) => {
          // Xem đầu file: không phím nào trong hộp được lọt ra listener của trang.
          e.stopPropagation();
          if (e.key === 'Escape') {
            // Đang soạn IME (bộ gõ có khung chọn chữ): Esc huỷ phần đang soạn.
            if (dangSoanIme(e.nativeEvent)) return;
            e.preventDefault();
            huy();
          }
        }}
        // Không tắt outline: khung nhận focus khi bị khoá ⇒ vòng `:focus-visible`
        // chung hiện khi dùng bàn phím (THIET-KE "Bàn phím trước", BAT-67).
        className="relative z-10 w-full max-w-lg rounded border border-vien bg-nen-lop p-4 text-chu shadow-lg"
      >
        {/* Tiêu đề hộp nổi ở bậc `h2` mục — THIET-KE "Chữ" (thang tiêu đề). */}
        <h2 className={`mb-3 ${LOP_TIEU_DE_MUC}`}>{NHAN_HOP_TAO_VIEC}</h2>
        <form noValidate onSubmit={gui} className="flex flex-col gap-3">
          {/*
           * Câu báo thiếu nằm **ngoài** `<label>` và nối bằng `aria-describedby`:
           * để trong label thì tên truy cập của ô thành "Dự án Chọn một dự án."
           */}
          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-neutral-600">{NHAN_O_DU_AN}</span>
              <select
                ref={o_du_an}
                data-nhap="du-an"
                value={project_id}
                aria-invalid={loi_nhap.du_an !== undefined}
                aria-describedby={loi_nhap.du_an === undefined ? undefined : 'tao-viec-loi-du-an'}
                onChange={(e) => {
                  datDuAnChon(e.target.value);
                }}
                className={O_NHAP}
              >
                <option value="">{NHAN_CHUA_CHON_DU_AN}</option>
                {ds.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.ten} ({d.ma})
                  </option>
                ))}
              </select>
            </label>
            {loi_nhap.du_an === undefined ? null : (
              <span id="tao-viec-loi-du-an" data-loi="du-an" className="text-xs text-loi">
                {loi_nhap.du_an}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-neutral-600">{NHAN_O_TIEU_DE}</span>
              <input
                ref={o_tieu_de}
                type="text"
                data-nhap="tieu-de"
                value={tieu_de}
                aria-invalid={loi_nhap.tieu_de !== undefined}
                aria-describedby={
                  loi_nhap.tieu_de === undefined ? undefined : 'tao-viec-loi-tieu-de'
                }
                onChange={(e) => {
                  datTieuDe(e.target.value);
                }}
                className={O_NHAP}
              />
            </label>
            {loi_nhap.tieu_de === undefined ? null : (
              <span id="tao-viec-loi-tieu-de" data-loi="tieu-de" className="text-xs text-loi">
                {loi_nhap.tieu_de}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="tao-viec-mo-ta" className="text-xs text-neutral-600">
                {NHAN_O_MO_TA}
              </label>
              <button
                type="button"
                data-nut="xem-truoc"
                aria-pressed={xem_truoc}
                onClick={() => {
                  datXemTruoc((v) => !v);
                }}
                className="rounded px-2 py-0.5 text-xs text-neutral-600 hover:bg-nen-noi hover:text-chu"
              >
                {xem_truoc ? NHAN_SOAN : NHAN_XEM_TRUOC}
              </button>
            </div>
            {xem_truoc ? (
              <div data-o="xem-truoc-mo-ta" className="min-h-24 rounded border border-vien px-2 py-1">
                {mo_ta.trim() === '' ? (
                  <p className="text-neutral-500">{CAU_XEM_TRUOC_RONG}</p>
                ) : (
                  <Markdown van={mo_ta} />
                )}
              </div>
            ) : (
              <textarea
                id="tao-viec-mo-ta"
                data-nhap="mo-ta"
                rows={5}
                value={mo_ta}
                onChange={(e) => {
                  datMoTa(e.target.value);
                }}
                className={O_NHAP}
              />
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {/*
             * BAT-63 (mục 4 "Trạng thái khi tạo"): đúng hai lựa chọn Cần làm /
             * Backlog. Icon trạng thái của lựa chọn đang chọn đứng cạnh nhãn ô
             * (`aria-hidden` — chữ của ô chọn là thông tin).
             */}
            <label className="flex flex-col gap-1 text-sm">
              <span className="flex items-center gap-1 text-xs text-neutral-600">
                <IconTrangThai trang_thai={trang_thai} co={12} />
                {NHAN_O_TRANG_THAI}
              </span>
              <select
                data-nhap="trang-thai"
                value={trang_thai}
                onChange={(e) => {
                  datTrangThai(trangThaiDauTuTuyChon({ trang_thai: e.target.value }));
                }}
                className={O_NHAP}
              >
                {TRANG_THAI_KHI_TAO_WEB.map((tt) => (
                  <option key={tt} value={tt}>
                    {NHAN_TRANG_THAI[tt]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-neutral-600">{NHAN_O_UU_TIEN}</span>
              <select
                data-nhap="uu-tien"
                value={uu_tien}
                onChange={(e) => {
                  datUuTien(e.target.value as UuTien);
                }}
                className={O_NHAP}
              >
                {UU_TIEN_THEO_THU_TU.map((u) => (
                  <option key={u} value={u}>
                    {NHAN_UU_TIEN[u]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <span className="text-xs text-neutral-600">{NHAN_O_CHA}</span>
              <input
                ref={o_ma_cha}
                type="text"
                data-nhap="ma-cha"
                value={ma_cha}
                placeholder={GOI_Y_O_CHA}
                onChange={(e) => {
                  datMaCha(e.target.value);
                }}
                className={O_NHAP}
              />
            </label>
          </div>

          {tao.error === null || tao.error instanceof LoiHuyGui ? null : (
            <p role="alert" data-loi="may-chu" className="text-sm text-loi">
              {cauLoiHop(tao.error)}
            </p>
          )}

          <div aria-live="polite">
            {tao.isPaused ? (
              <p role="status" data-o="cho-mang" className="text-sm text-neutral-600">
                {tao.failureCount > 0 ? CAU_CHO_MANG_DA_THU : CAU_CHO_MANG}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              data-nut="huy-tao"
              disabled={!dong_duoc}
              onClick={huy}
              className="rounded border border-vien px-3 py-1 text-sm text-chu hover:bg-nen-noi disabled:text-neutral-500"
            >
              {NHAN_NUT_HUY_TAO}
            </button>
            <button
              type="submit"
              data-nut="gui-tao"
              disabled={dang_gui}
              className={`rounded px-3 py-1 text-sm ${NUT_CHINH} ${NUT_MO_KHI_DISABLED}`}
            >
              {dang_gui ? NHAN_NUT_DANG_TAO : NHAN_NUT_GUI_TAO}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
