/**
 * **Command menu `Cmd/Ctrl+K`** — SPEC mục 14 d.414 ("mở command menu: tìm mã, tiêu
 * đề, T-số, chạy lệnh") và **19.12 câu 8** (chỉ mã ticket, tiêu đề ticket, mã cũ,
 * T-số, tiêu đề mục Cần Chủ; chuỗi con). BAT-34.
 *
 * Hai lối vào, **một** hộp (component này, dựng ở vỏ `App.tsx`): phím `Cmd/Ctrl+K`
 * (listener duy nhất của vỏ, `vo/phim-vo.tsx`) và nút "Tìm" ở đầu sidebar.
 *
 * ## Danh sách gộp
 *
 * Ba nhóm, có tiêu đề, theo thứ tự: **Lệnh** (chỉ lệnh ĐIỀU HƯỚNG tới đúng các trang
 * sidebar đang có — `MUC_SIDEBAR`; lọc phía web theo chuỗi con; không lệnh ghi
 * nào), **Ticket**, **Cần Chủ** (cả hai từ `GET /v1/tim`). Một con trỏ chọn chạy
 * qua cả ba (`aria-activedescendant` trên ô tìm); ↑/↓ đổi, Enter hoặc bấm chuột mở.
 *
 * ## Gõ có độ trễ, kết quả theo khoá
 *
 * `DO_TRE_TIM_MS` sau lần gõ cuối mới gọi máy chủ; chuỗi rỗng (sau khi cắt) thì
 * không gọi. Khoá query **mang chuỗi** (`['tim', q]`), không `placeholderData`:
 * kết quả về muộn của một chuỗi cũ nằm ở khoá cũ, không bao giờ hiện cho chuỗi mới.
 *
 * **Enter khi kết quả của chuỗi đang gõ chưa về** (gõ "BAT-12" rồi Enter ngay, còn
 * trong độ trễ): bỏ trễ, tìm ngay, và khi kết quả **của đúng chuỗi đó** về thì mở
 * mục đầu. Chọn cách này (không phải "chuỗi dạng mã ⇒ mở thẳng `/t/<MÃ>`") vì nó
 * đúng cho mọi loại chuỗi (tiêu đề, T-số, mã cũ), và chỉ mở thứ máy chủ trả theo
 * đúng phạm vi người gọi. Gõ tiếp, ↑/↓, mất mạng, lỗi, không có kết quả ⇒ bỏ chờ,
 * không mở gì. Kết quả cũ không bao giờ dùng cho Enter: `ds` chỉ chứa kết quả khớp
 * chuỗi đang gõ.
 *
 * **Mất mạng**: query tìm tạm dừng (`fetchStatus === 'paused'`) ⇒ hiện
 * `CAU_MAT_MANG_TIM` thay vì "Đang tìm…" mãi; có mạng lại TanStack tự gọi.
 *
 * ## Hộp
 *
 * Cùng khuôn hộp Giao việc / bảng phím: `role="dialog"` + `aria-modal`, có nhãn;
 * focus vào ô tìm khi mở; `Esc` đóng (trừ lúc IME); Tab vòng trong hộp
 * (`chanPhimNgoaiHop`/`vongTab`); phím trong hộp không bọt ra trang; đóng thì trả
 * focus về phần tử trước đó.
 *
 * ## Chọn một mục Cần Chủ
 *
 * Chọn mục ⇒ tới `/can-chu?the=<T-số>` của **đúng** mục đó (`duongMucCanChu`); trang
 * Cần Chủ đọc tham số, chọn + cuộn tới + làm nổi thẻ, hoặc báo rõ khi mục đã xử lý /
 * không có — `cau-hoi-spec.md` #154 (chốt 19/10 T-31, BAT-37).
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { cauLoi, timNhanh } from '../api';
import { LOP_KBD, LOP_TAM_NOI } from './lop-nut';
import { MUC_SIDEBAR, duongMucCanChu, duongTicket } from './muc-sidebar';
import { DICH_CHUOI_G } from './phim-vo';
import { chanPhimNgoaiHop, dangSoanIme } from './tao-viec';

/* ================================================================== *
 * Hằng
 * ================================================================== */

export const NHAN_COMMAND_MENU = 'Tìm nhanh và lệnh';
export const NHAN_O_TIM_NHANH = 'Tìm mã, tiêu đề, T-số hoặc lệnh';
export const GOI_Y_O_TIM_NHANH = 'Tìm mã, tiêu đề, T-số, lệnh…';
export const NHAN_DONG_COMMAND_MENU_NGOAI = 'Đóng tìm nhanh (bấm ra ngoài)';
export const NHAN_NHOM_LENH = 'Lệnh';
export const NHAN_NHOM_TICKET = 'Ticket';
export const NHAN_NHOM_CAN_CHU = 'Cần Chủ';
export const CAU_DANG_TIM = 'Đang tìm…';
export const CAU_KHONG_CO_KET_QUA = 'Không có kết quả';
/** Query tìm tạm dừng vì mất mạng (`fetchStatus === 'paused'`) — thay "Đang tìm…" treo mãi. */
export const CAU_MAT_MANG_TIM = 'Mất mạng — sẽ tìm khi có mạng lại.';

/**
 * Độ trễ sau lần gõ cuối trước khi gọi `GET /v1/tim`. SPEC không nói; 200 ms đủ để
 * gõ một mã liền tay chỉ ra **một** lần gọi, và đủ ngắn để không thấy trễ.
 */
export const DO_TRE_TIM_MS = 200;

/*
 * Bộ chọn của hộp và câu hỏi "đang mở không" sống ở module lá `hop-dang-mo.ts`
 * (gỡ vòng nhập với `phim-vo.tsx`, BAT-61); xuất lại ở đây cho mọi chỗ đã nhập.
 */
export { CHON_COMMAND_MENU, commandMenuDangMo } from './hop-dang-mo';

/** Một lệnh điều hướng — **chỉ** tới các trang sidebar đang có. */
export interface LenhDieuHuong {
  nhan: string;
  duong: string;
}

export const LENH_DIEU_HUONG: readonly LenhDieuHuong[] = MUC_SIDEBAR.map((m) => ({
  nhan: m.nhan,
  duong: m.duong,
}));

/** Lọc lệnh theo chuỗi con, không phân biệt hoa thường (phía web, đủ Unicode). */
export function locLenh(q: string, ds: readonly LenhDieuHuong[] = LENH_DIEU_HUONG): LenhDieuHuong[] {
  const k = q.trim().toLocaleLowerCase('vi');
  if (k === '') return [...ds];
  return ds.filter((l) => l.nhan.toLocaleLowerCase('vi').includes(k));
}

/** Giá trị sau `tre` ms không đổi; `xa()` lấy ngay giá trị hiện tại (bỏ chờ). */
function useTre<T>(gia_tri: T, tre: number): [T, () => void] {
  const [ra, datRa] = useState(gia_tri);
  useEffect(() => {
    const h = setTimeout(() => {
      datRa(gia_tri);
    }, tre);
    return () => {
      clearTimeout(h);
    };
  }, [gia_tri, tre]);
  const xa = useCallback(() => {
    datRa(gia_tri);
  }, [gia_tri]);
  return [ra, xa];
}

/** Trạng thái mở của hộp — vỏ giữ, phím `Cmd/Ctrl+K` và nút Tìm cùng mở. */
export function useCommandMenu(): { mo: boolean; moMenu: () => void; dongMenu: () => void } {
  const [mo, datMo] = useState(false);
  const moMenu = useCallback(() => {
    datMo(true);
  }, []);
  const dongMenu = useCallback(() => {
    datMo(false);
  }, []);
  return { mo, moMenu, dongMenu };
}

/* ================================================================== *
 * Gợi ý phím (hệ thiết kế 29/10 — "bàn phím trước", THIET-KE.md)
 * ================================================================== */

/**
 * Phím tắt **đang có** của một lệnh điều hướng: chuỗi `G` rồi `T`/`O`/`N` của
 * `DICH_CHUOI_G` (d.413). Không có phím ⇒ `[]` (không bịa phím mới). Từ BAT-61
 * `phim-vo.tsx` không còn nhập file này (câu "hộp đang mở" ở `hop-dang-mo.ts`),
 * nên không còn vòng nhập giữa hai file.
 */
export function phimCuaLenh(duong: string): string[] {
  for (const [k, d] of Object.entries(DICH_CHUOI_G)) {
    if (d === duong) return ['G', k.toUpperCase()];
  }
  return [];
}

/**
 * Một dãy `<kbd>` nhỏ xám. `aria-hidden`: phím là gợi ý thị giác — tên của mục
 * (thứ trình đọc màn hình và ca test đọc) không được dài thêm vì nó.
 */
function GoiYPhim({ phim }: { phim: readonly string[] }): React.JSX.Element | null {
  if (phim.length === 0) return null;
  return (
    <span aria-hidden data-goi-y-phim={phim.join(' ')} className="flex shrink-0 items-center gap-0.5">
      {phim.map((p) => (
        <kbd key={p} className={LOP_KBD}>
          {p}
        </kbd>
      ))}
    </span>
  );
}

/* ================================================================== *
 * Hộp
 * ================================================================== */

interface MucMenu {
  khoa: string;
  nhom: 'lenh' | 'ticket' | 'can_chu';
  chinh: string;
  phu: string;
  duong: string;
}

export function CommandMenu({ dong }: { dong: () => void }): React.JSX.Element {
  const dieu_huong = useNavigate();
  const [q, datQ] = useState('');
  const [q_tre_tho, xaTre] = useTre(q, DO_TRE_TIM_MS);
  const q_tre = q_tre_tho.trim();
  const q_gon = q.trim();
  const [chon, datChon] = useState(0);
  /** Enter lúc kết quả của CHUỖI ĐANG GÕ chưa có: nhớ chuỗi đó, mở mục đầu khi nó về. */
  const [cho_mo, datChoMo] = useState<string | null>(null);
  const khung = useRef<HTMLDivElement | null>(null);
  const o_tim = useRef<HTMLInputElement | null>(null);
  const id_goc = useId();

  const tim_q = useQuery({
    queryKey: ['tim', q_tre],
    queryFn: () => timNhanh(q_tre),
    enabled: q_tre !== '',
  });

  // Kết quả máy chủ chỉ dùng khi KHỚP chuỗi đang gõ — chưa hết độ trễ thì chưa có.
  const kq = q_gon !== '' && q_gon === q_tre ? tim_q.data : undefined;
  // Mất mạng: query của chuỗi đang gõ tạm dừng (TanStack networkMode `online`) — nói
  // thẳng thay vì "Đang tìm…" mãi; có mạng lại thì TanStack tự chạy tiếp.
  const mat_mang = q_gon !== '' && q_gon === q_tre && tim_q.isPending && tim_q.fetchStatus === 'paused';
  const dang_tim = q_gon !== '' && (q_gon !== q_tre || tim_q.isPending) && !mat_mang;
  const loi = q_gon !== '' && q_gon === q_tre && tim_q.isError ? tim_q.error : null;

  const ds = useMemo<MucMenu[]>(() => {
    const lenh: MucMenu[] = locLenh(q).map((l) => ({
      khoa: `lenh:${l.duong}`,
      nhom: 'lenh',
      chinh: l.nhan,
      phu: l.duong,
      duong: l.duong,
    }));
    const tk: MucMenu[] = (kq?.ticket ?? []).map((t) => ({
      khoa: `ticket:${t.id}`,
      nhom: 'ticket',
      chinh: t.ma,
      phu: t.ma_cu === null ? t.tieu_de : `${t.tieu_de} · mã cũ ${t.ma_cu}`,
      duong: duongTicket(t.ma),
    }));
    const ct: MucMenu[] = (kq?.can_chu ?? []).map((m) => ({
      khoa: `can_chu:${m.id}`,
      nhom: 'can_chu',
      chinh: m.ma,
      phu: `${m.tieu_de} · ${m.nhan_trang_thai}`,
      duong: duongMucCanChu(m.ma),
    }));
    return [...lenh, ...tk, ...ct];
  }, [q, kq]);

  // Danh sách đổi ⇒ con trỏ về đầu (không trỏ vào một dòng đã biến mất).
  useEffect(() => {
    datChon(0);
  }, [ds]);

  const dang_chon = ds[Math.min(chon, ds.length - 1)];
  const idMuc = (i: number): string => `${id_goc}-muc-${String(i)}`;

  const mo = useCallback(
    (m: MucMenu): void => {
      dong();
      void dieu_huong(m.duong);
    },
    [dong, dieu_huong],
  );

  /*
   * Enter đang chờ (xem `phimO`): chỉ dùng kết quả của ĐÚNG chuỗi lúc bấm Enter.
   * Chuỗi đổi ⇒ bỏ chờ; mất mạng ⇒ bỏ chờ (không mở ngầm về sau — `dang_tim` đã
   * loại `mat_mang`, nên query tạm dừng rơi vào nhánh "hết chờ, chưa có mục"); có lỗi
   * hoặc rỗng ⇒ bỏ chờ, không mở gì; về có mục ⇒ mở mục đầu (`ds[0]`: chủ chưa thể
   * di chuyển chọn vì lúc bấm Enter danh sách rỗng, và ↑/↓ đã bỏ chờ).
   */
  useEffect(() => {
    if (cho_mo === null) return;
    if (cho_mo !== q_gon) {
      datChoMo(null);
      return;
    }
    if (dang_tim) return;
    datChoMo(null);
    const dau = ds[0];
    if (loi === null && dau !== undefined) mo(dau);
  }, [cho_mo, q_gon, dang_tim, loi, ds, mo]);

  // Phím có đích ngoài hộp không tới trang; `Esc` đóng; `Tab` vòng.
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

  // Focus vào ô tìm khi mở; đóng thì trả về phần tử trước đó.
  useEffect(() => {
    const truoc = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    o_tim.current?.focus();
    const cu = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = cu;
      if (truoc !== null && truoc.isConnected) truoc.focus();
    };
  }, []);

  const phimO = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (dangSoanIme(e.nativeEvent)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      datChoMo(null);
      if (ds.length === 0) return;
      const buoc = e.key === 'ArrowDown' ? 1 : -1;
      datChon((c) => (Math.min(c, ds.length - 1) + buoc + ds.length) % ds.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      /*
       * `ds` chỉ gồm lệnh (lọc theo chuỗi ĐANG gõ) và kết quả máy chủ KHỚP chuỗi
       * đang gõ (`kq`) — nên mục đang chọn luôn thuộc chuỗi hiện tại, không bao giờ
       * là mục của chuỗi cũ.
       */
      if (dang_chon !== undefined) {
        mo(dang_chon);
        return;
      }
      // Chưa có mục nào mà kết quả của chuỗi này còn đang tới (đang trễ hoặc đang
      // gọi): bỏ trễ, tìm ngay, mở mục đầu khi về (effect `cho_mo`).
      if (dang_tim) {
        datChoMo(q_gon);
        xaTre();
      }
    }
  };

  const nhom = (ten: MucMenu['nhom'], nhan: string): React.JSX.Element | null => {
    const muc = ds.map((m, i) => ({ m, i })).filter((x) => x.m.nhom === ten);
    if (muc.length === 0) return null;
    const id_nhan = `${id_goc}-nhom-${ten}`;
    return (
      <div role="group" aria-labelledby={id_nhan} data-nhom={ten}>
        <div id={id_nhan} role="presentation" className="px-2 pt-2 pb-1 text-xs text-chu-mo">
          {nhan}
        </div>
        {muc.map(({ m, i }) => (
          <div
            key={m.khoa}
            id={idMuc(i)}
            role="option"
            aria-selected={dang_chon === m}
            data-muc={m.khoa}
            onMouseDown={(e) => {
              // Không cướp focus khỏi ô tìm.
              e.preventDefault();
            }}
            onMouseEnter={() => {
              datChon(i);
            }}
            onClick={() => {
              mo(m);
            }}
            className={`flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-sm ${
              dang_chon === m ? 'bg-nen-noi text-chu' : 'text-chu'
            }`}
          >
            {/*
             * Lệnh: chữ thường (tên trang). Ticket / Cần Chủ: mã xám 12px
             * `tabular-nums` (`ma-ticket`, THIET-KE.md) rồi tiêu đề là chữ chính.
             * Chỉ đổi trình bày: `data-muc`, thứ tự, `role` giữ nguyên.
             */}
            <span className={m.nhom === 'lenh' ? 'shrink-0' : 'ma-ticket shrink-0'}>{m.chinh}</span>
            <span
              className={`min-w-0 flex-1 truncate ${m.nhom === 'lenh' ? 'text-xs text-chu-mo-hon' : ''}`}
            >
              {m.phu}
            </span>
            {m.nhom === 'lenh' ? <GoiYPhim phim={phimCuaLenh(m.duong)} /> : null}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:pt-[10vh]">
      <button
        type="button"
        aria-label={NHAN_DONG_COMMAND_MENU_NGOAI}
        tabIndex={-1}
        onClick={dong}
        className="absolute inset-0 bg-lop-phu"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={NHAN_COMMAND_MENU}
        data-o="command-menu"
        ref={khung}
        tabIndex={-1}
        onKeyDown={(e) => {
          // Không phím nào trong hộp được lọt ra listener của trang.
          e.stopPropagation();
          if (e.key === 'Escape') {
            if (dangSoanIme(e.nativeEvent)) return;
            e.preventDefault();
            dong();
          }
        }}
        /*
         * Modal 8px, lớp nổi, viền mờ (`LOP_TAM_NOI`, THIET-KE.md): ô tìm liền
         * mép trên, danh sách ở giữa, chân hộp là dòng gợi ý phím.
         */
        // Khung không tắt outline (THIET-KE "Bàn phím trước", BAT-67).
        className={`relative z-10 flex w-full max-w-xl flex-col overflow-hidden ${LOP_TAM_NOI}`}
      >
        <input
          ref={o_tim}
          type="text"
          role="combobox"
          aria-label={NHAN_O_TIM_NHANH}
          aria-expanded={ds.length > 0}
          aria-controls={`${id_goc}-ds`}
          aria-autocomplete="list"
          aria-activedescendant={dang_chon === undefined ? undefined : idMuc(ds.indexOf(dang_chon))}
          data-nhap="tim-nhanh"
          placeholder={GOI_Y_O_TIM_NHANH}
          value={q}
          onChange={(e) => {
            datQ(e.target.value);
          }}
          onKeyDown={phimO}
          /*
           * Không viền riêng, không vòng focus: ô tìm LÀ đầu hộp (con trỏ nháy
           * đã nói nó đang focus). Ngăn với danh sách bằng viền mờ dưới.
           *
           * Ngoại lệ có lý do của luật "không tắt outline" (THIET-KE "Bàn phím
           * trước", BAT-67): ô là ô nhập duy nhất, luôn nhận focus khi hộp mở,
           * con trỏ nháy luôn hiện; và ô sát mép trên/trái/phải của khung
           * `overflow-hidden` bo 8px, nên vòng offset dương bị khung cắt mất ba
           * cạnh, còn offset âm thì góc vuông của vòng bị hai góc bo trên cắt lẹm.
           */
          className="border-b border-vien bg-transparent px-4 py-3 text-[15px] text-chu placeholder:text-chu-mo-hon focus-visible:outline-none"
        />
        <div aria-live="polite" className="px-4 pt-1.5 text-xs">
          {dang_tim ? (
            <span data-o="dang-tim" className="text-chu-mo">
              {CAU_DANG_TIM}
            </span>
          ) : null}
          {mat_mang ? (
            <span data-o="mat-mang-tim" className="text-chu-mo">
              {CAU_MAT_MANG_TIM}
            </span>
          ) : null}
          {loi === null ? null : (
            <span data-loi="tim" className="text-loi">
              {cauLoi(loi)}
            </span>
          )}
          {!dang_tim && !mat_mang && loi === null && ds.length === 0 ? (
            <span data-o="khong-co-ket-qua" className="text-chu-mo">
              {CAU_KHONG_CO_KET_QUA}
            </span>
          ) : null}
        </div>
        <div
          id={`${id_goc}-ds`}
          role="listbox"
          aria-label={NHAN_COMMAND_MENU}
          className="max-h-[60vh] overflow-y-auto px-2 pb-2"
        >
          {nhom('lenh', NHAN_NHOM_LENH)}
          {nhom('ticket', NHAN_NHOM_TICKET)}
          {nhom('can_chu', NHAN_NHOM_CAN_CHU)}
        </div>
        {/* Chân hộp: phím của chính hộp này (↑↓ chọn, Enter mở, Esc đóng). */}
        <div
          aria-hidden
          data-o="goi-y-phim-command-menu"
          className="flex items-center gap-3 border-t border-vien px-4 py-2 text-xs text-chu-mo-hon"
        >
          <span className="flex items-center gap-1">
            <kbd className={LOP_KBD}>↑</kbd>
            <kbd className={LOP_KBD}>↓</kbd>
            chọn
          </span>
          <span className="flex items-center gap-1">
            <kbd className={LOP_KBD}>Enter</kbd>
            mở
          </span>
          <span className="flex items-center gap-1">
            <kbd className={LOP_KBD}>Esc</kbd>
            đóng
          </span>
        </div>
      </div>
    </div>
  );
}
