/**
 * **Phím tắt toàn cục của vỏ** — SPEC mục 14 d.413 ("`C` tạo ticket; `G` rồi `T`
 * tới Cần Chủ; `G` rồi `O` tới Tổng quan; `G` rồi `N` tới Nhật ký") và d.416
 * ("`?` hiện bảng phím"). BAT-23.
 *
 * ## MỘT listener `keydown` cho cả vỏ
 *
 * `C`, chuỗi `G`, và `?` đi chung **một** listener `window` (`usePhimVo`) —
 * `test/vo-linear.test.tsx` ghim con số một. Nó đặt ở **capture**: capture ở
 * `window` luôn chạy trước mọi listener bubble của trang (Cần Chủ d.270, danh
 * sách J/K/S/P/Esc), bất kể thứ tự đăng ký — mà thứ tự đăng ký thì đổi theo lúc
 * chuyển trang. Nhờ vậy listener vỏ là chỗ **duy nhất** quyết phím thứ hai của
 * chuỗi `G`.
 *
 * Nó chỉ chạm đúng các phím sau, mọi phím khác đi qua nguyên vẹn (không
 * `preventDefault`, không `stopPropagation`):
 *
 *   * `Cmd/Ctrl+K` — mở command menu (d.414, BAT-34), xem `laPhimCommandMenu`;
 *   * `C` — mở hộp tạo việc, `preventDefault` (chữ `c` không rơi vào ô vừa focus);
 *   * `?` — mở bảng phím, `preventDefault`;
 *   * phím **thứ hai** của chuỗi `G` (`T`/`O`/`N`) — điều hướng, `preventDefault`
 *     **và** `stopImmediatePropagation`: một lần bấm không được làm hai việc,
 *     dù trang nào sau này gán nghĩa cho `T`/`O`/`N`.
 *
 * `G` trơn **không** bị chặn: nó chỉ ghi lại thời điểm. Phím kế không phải
 * `T`/`O`/`N` ⇒ chuỗi huỷ và phím đó được xử lý **như thường** (tới trang, hoặc
 * chính nó là `C`/`?`/`G`). Chuỗi hết hạn sau `THOI_HAN_CHUOI_G_MS`
 * (`spec-questions.md` #150). Phím phụ đứng riêng (Shift, Ctrl…) không huỷ chuỗi —
 * `G` rồi `Shift+T` vẫn là `G T`.
 *
 * ## Không bắt phím khi
 *
 * có Ctrl/Meta/Alt; đang soạn IME; đích là ô nhập (`trongONhap`, gồm phần tử con
 * của contenteditable); phím đã bị chặn ở chỗ khác; đang có một hộp `aria-modal`
 * (menu trượt, panel 375px, hộp tạo việc, chính bảng phím) hoặc hộp tạo việc.
 * Mọi ca này cũng huỷ chuỗi `G` đang chờ.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { commandMenuDangMo } from './hop-dang-mo';
import { LOP_KBD, LOP_TAM_NOI, LOP_TIEU_DE_MUC, NUT_PHU } from './lop-nut';
import { MUC_CHINH } from './muc-sidebar';
import {
  chanPhimNgoaiHop,
  coHopModalDangMo,
  dangSoanIme,
  hopTaoViecDangMo,
  laPhimTaoViec,
  trongONhap,
} from './tao-viec';

/* ================================================================== *
 * Hằng
 * ================================================================== */

/**
 * Thời gian chờ phím thứ hai sau `G`. SPEC không nói (`spec-questions.md` #150);
 * 1,5 giây đủ cho một người bấm hai phím liền, và đủ ngắn để một chữ `g` lạc
 * không biến chữ `t` bấm nhiều giây sau thành một lượt chuyển trang.
 */
export const THOI_HAN_CHUOI_G_MS = 1500;

function duongMuc(nhan: string): string {
  const m = MUC_CHINH.find((x) => x.nhan === nhan);
  // Fail-loud: một mục sidebar đổi tên mà quên chỗ này phải nổ ngay lúc nạp.
  if (m === undefined) throw new Error(`phim-vo: không có mục sidebar "${nhan}"`);
  return m.duong;
}

/**
 * Phím thứ hai của chuỗi `G` → đường. Đường lấy **từ sổ tra của sidebar**
 * (`MUC_CHINH`), không gõ lại chuỗi `'/can-chu'`.
 */
export const DICH_CHUOI_G: Readonly<Record<string, string>> = {
  t: duongMuc('Cần Chủ'),
  o: duongMuc('Tổng quan'),
  n: duongMuc('Nhật ký quyết định'),
};

/** Phím phụ đứng riêng: không là "phím kế" của chuỗi `G`. */
const PHIM_PHU = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);

/**
 * Một dòng của bảng phím.
 *   * `mot`: một phím (`C`);
 *   * `chuoi`: bấm lần lượt (`G` rồi `T`);
 *   * `hoac`: các phím cùng một việc theo hai chiều (`J` / `K`).
 */
export interface DongPhimTat {
  phim: readonly string[];
  kieu: 'mot' | 'chuoi' | 'hoac';
  viec: string;
  ghi_chu?: string;
}

export const GHI_CHU_TICKET_DANG_CHON = 'Trên ticket đang chọn';
/** Ghi chú của `X` (BAT-35, d.416 "áp một phím cho nhiều ticket"). */
export const GHI_CHU_CHON_NHIEU = 'Có thẻ đã chọn: S/P/L/A áp cho các thẻ đã chọn';

/**
 * **Bảng phím** — chỉ các phím ĐANG CÓ thật trên web. Thêm một phím là thêm một
 * dòng ở đây. `A` có từ BAT-33, `Cmd/Ctrl+K` từ BAT-34, `X` (chọn nhiều) từ BAT-35.
 */
export const PHIM_TAT: readonly DongPhimTat[] = [
  { phim: ['Cmd/Ctrl+K'], kieu: 'mot', viec: 'Tìm nhanh: mã, tiêu đề, T-số, lệnh' },
  { phim: ['C'], kieu: 'mot', viec: 'Tạo việc' },
  { phim: ['G', 'T'], kieu: 'chuoi', viec: 'Tới Cần Chủ' },
  { phim: ['G', 'O'], kieu: 'chuoi', viec: 'Tới Tổng quan' },
  { phim: ['G', 'N'], kieu: 'chuoi', viec: 'Tới Nhật ký' },
  { phim: ['J', 'K'], kieu: 'hoac', viec: 'Xuống / lên' },
  { phim: ['S'], kieu: 'mot', viec: 'Đổi trạng thái', ghi_chu: GHI_CHU_TICKET_DANG_CHON },
  { phim: ['P'], kieu: 'mot', viec: 'Đổi ưu tiên', ghi_chu: GHI_CHU_TICKET_DANG_CHON },
  { phim: ['L'], kieu: 'mot', viec: 'Gắn / bỏ nhãn', ghi_chu: GHI_CHU_TICKET_DANG_CHON },
  { phim: ['A'], kieu: 'mot', viec: 'Giao việc (chọn agent)', ghi_chu: GHI_CHU_TICKET_DANG_CHON },
  { phim: ['X'], kieu: 'mot', viec: 'Chọn / bỏ chọn ticket', ghi_chu: GHI_CHU_CHON_NHIEU },
  { phim: ['Esc'], kieu: 'mot', viec: 'Bỏ chọn hết; không có thẻ đã chọn thì đóng panel chi tiết' },
  { phim: ['?'], kieu: 'mot', viec: 'Hiện bảng phím này' },
];

export const NHAN_BANG_PHIM = 'Phím tắt';
export const NHAN_DONG_BANG_PHIM = 'Đóng bảng phím';
export const NHAN_DONG_BANG_PHIM_NGOAI = 'Đóng bảng phím (bấm ra ngoài)';

/** Bộ chọn của bảng phím trên DOM — listener trang thoát sớm khi nó mở. */
export const CHON_BANG_PHIM = '[data-o="bang-phim"]';

export function bangPhimDangMo(): boolean {
  return document.querySelector(CHON_BANG_PHIM) !== null;
}

/* ================================================================== *
 * Listener
 * ================================================================== */

/** Phím này có được vỏ xét không (điều kiện chung cho `C`, `G…`, `?`). */
export function voDuocBatPhim(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  if (dangSoanIme(e) || e.defaultPrevented) return false;
  if (trongONhap(e.target)) return false;
  return !coHopModalDangMo() && !hopTaoViecDangMo();
}

/**
 * **`Cmd/Ctrl+K`** — d.414 (BAT-34). Meta **hoặc** Ctrl, không Alt/Shift, phím `k`.
 *
 * Khác mọi phím vỏ khác ở **một** chỗ: nó được bắt **cả khi đang ở trong ô nhập**
 * (ngoài hộp). `Cmd/Ctrl+K` không phải một ký tự gõ, nên không có chữ nào bị "ăn",
 * và mở tìm nhanh từ giữa lúc đang gõ ở ô lọc là đúng việc chủ muốn.
 */
export function laPhimCommandMenu(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
}

/**
 * Listener phím của vỏ. Trả trạng thái bảng phím; hộp tạo việc mở qua
 * `moTaoViec` (trạng thái của nó ở `useHopTaoViec`), command menu qua
 * `moCommandMenu` (`useCommandMenu`).
 *
 * `Cmd/Ctrl+K`: đang soạn IME ⇒ bỏ qua; command menu **đang mở** ⇒ chỉ
 * `preventDefault`, **không làm gì** (một phím một nghĩa: `Cmd/Ctrl+K` là "mở";
 * đóng là `Esc` — bấm lại lúc đang gõ không được làm mất hộp); hộp `aria-modal`
 * khác đang mở (tạo việc, giao việc, bảng `?`, xác nhận đăng xuất, menu trượt,
 * panel 375px) ⇒ không bắt (không `preventDefault`). Mở được thì `preventDefault`
 * + `stopImmediatePropagation` (một lần bấm không làm hai việc).
 */
export function usePhimVo(
  moTaoViec: () => void,
  moCommandMenu?: () => void,
): { mo: boolean; dong: () => void } {
  const [mo, datMo] = useState(false);
  const dong = useCallback(() => {
    datMo(false);
  }, []);

  /*
   * `navigate` và `moTaoViec` đi qua ref: effect chạy **một lần**, nên vỏ đăng
   * ký đúng một listener suốt đời (không gỡ/gắn lại mỗi lần đổi đường).
   */
  const dieu_huong = useNavigate();
  const ref = useRef({ dieu_huong, moTaoViec, moCommandMenu });
  ref.current = { dieu_huong, moTaoViec, moCommandMenu };
  const g_luc = useRef<number | null>(null);

  useEffect(() => {
    const nghe = (e: KeyboardEvent): void => {
      if (PHIM_PHU.has(e.key)) return;
      const cho = g_luc.current;
      g_luc.current = null;
      if (laPhimCommandMenu(e)) {
        const mo_menu = ref.current.moCommandMenu;
        if (mo_menu === undefined || dangSoanIme(e) || e.defaultPrevented) return;
        if (commandMenuDangMo()) {
          e.preventDefault();
          return;
        }
        if (coHopModalDangMo() || hopTaoViecDangMo()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        mo_menu();
        return;
      }
      if (!voDuocBatPhim(e)) return;

      const k = e.key.toLowerCase();
      if (cho !== null && Date.now() - cho <= THOI_HAN_CHUOI_G_MS) {
        const duong = DICH_CHUOI_G[k];
        if (duong !== undefined) {
          e.preventDefault();
          e.stopImmediatePropagation();
          void ref.current.dieu_huong(duong);
          return;
        }
        // Phím khác: chuỗi đã huỷ, phím được xử lý như thường bên dưới.
      }
      if (k === 'g') {
        g_luc.current = Date.now();
        return;
      }
      if (laPhimTaoViec(e)) {
        e.preventDefault();
        ref.current.moTaoViec();
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        datMo(true);
      }
    };
    window.addEventListener('keydown', nghe, { capture: true });
    return () => {
      window.removeEventListener('keydown', nghe, { capture: true });
    };
  }, []);

  return { mo, dong };
}

/* ================================================================== *
 * Bảng phím
 * ================================================================== */

function Phim({ d }: { d: DongPhimTat }): React.JSX.Element {
  const noi = d.kieu === 'chuoi' ? 'rồi' : '/';
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      {d.phim.map((p, i) => (
        <span key={p} className="flex items-center gap-1">
          {i > 0 ? <span className="text-xs text-chu-mo-hon">{noi}</span> : null}
          <kbd className={LOP_KBD}>{p}</kbd>
        </span>
      ))}
    </span>
  );
}

/**
 * Hộp `?`: cùng khuôn với hộp tạo việc — `aria-modal`, focus vào hộp khi mở và
 * trả về chỗ cũ khi đóng, `Esc` đóng (trừ lúc IME), Tab vòng trong hộp, phím có
 * đích ngoài hộp không tới trang (`chanPhimNgoaiHop`), phím trong hộp không bọt
 * ra (`stopPropagation`).
 */
export function BangPhim({ dong }: { dong: () => void }): React.JSX.Element {
  const khung = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nghe = (e: KeyboardEvent): void => {
      const h = khung.current;
      if (h !== null) chanPhimNgoaiHop(e, h, dong);
    };
    window.addEventListener('keydown', nghe, { capture: true });
    return () => {
      window.removeEventListener('keydown', nghe, { capture: true });
    };
  }, [dong]);

  useEffect(() => {
    const truoc = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    khung.current?.focus();
    const cu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = cu;
      if (truoc !== null && truoc.isConnected) truoc.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:pt-[10vh]">
      <button
        type="button"
        aria-label={NHAN_DONG_BANG_PHIM_NGOAI}
        tabIndex={-1}
        onClick={dong}
        className="absolute inset-0 bg-lop-phu"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bang-phim-tieu-de"
        data-o="bang-phim"
        ref={khung}
        tabIndex={-1}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            if (dangSoanIme(e.nativeEvent)) return;
            e.preventDefault();
            dong();
          }
        }}
        // Không tắt outline: khung nhận focus khi mở ⇒ vòng `:focus-visible` chung
        // (kieu.css) hiện khi mở bằng bàn phím (THIET-KE "Bàn phím trước", BAT-67).
        className={`relative z-10 w-full max-w-md p-4 ${LOP_TAM_NOI}`}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="bang-phim-tieu-de" className={LOP_TIEU_DE_MUC}>
            {NHAN_BANG_PHIM}
          </h2>
          <button
            type="button"
            data-nut="dong-bang-phim"
            onClick={dong}
            className={`rounded px-2 py-0.5 text-sm ${NUT_PHU}`}
          >
            {NHAN_DONG_BANG_PHIM}
          </button>
        </div>
        <ul className="flex flex-col gap-2">
          {PHIM_TAT.map((d) => (
            <li
              key={d.phim.join(' ')}
              data-phim={d.phim.join(' ')}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0">
                {d.viec}
                {d.ghi_chu === undefined ? null : (
                  <span className="block text-xs text-chu-mo">{d.ghi_chu}</span>
                )}
              </span>
              <Phim d={d} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
