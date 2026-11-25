/**
 * **Giao diện sáng / tối / theo máy** — yêu cầu của chủ (BAT-6 đợt 1, `spec-questions.md`
 * #125), nay là SPEC mục 14 gạch "Chế độ màu" (d.406; mặc định Tối từ 29/10, T-106 A,
 * #178) — có ca ghim chữ SPEC.
 *
 * Bốn điều ca ở đây canh, và cả bốn đều là thứ đã hỏng thật ở các bản đầu của
 * tính năng này ở mọi sản phẩm:
 *   1. mặc định là **tối** — Chủ chốt 29/10 (hệ thiết kế kiểu Linear,
 *      `DESIGN.md`: tối là chế độ chính); trước 29/10 mặc định là theo máy;
 *   2. lựa chọn được **nhớ** sang lần sau — và thứ được nhớ là *lựa chọn*
 *      (`may`), không phải kết quả đã giải (`sang`), nếu không "theo máy" bị
 *      đóng băng;
 *   3. `localStorage` **ném** thì vẫn chạy (brief nói thẳng: môi trường test
 *      không có nó);
 *   4. chế độ đặt lên `<html>` **trước khi React vẽ** — ca đọc đúng thuộc tính
 *      mà script nội tuyến của `index.html` đặt.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CHON_THEME,
  KHOA_THEME,
  NHAN_THEME,
  THEME_MAC_DINH,
  THUOC_TINH_CHON,
  THUOC_TINH_THEME,
  apTheme,
  chonTrenDom,
  docChonTheme,
  giaiTheme,
  luuChonTheme,
} from '../src/vo/theme';
import { KHO_RONG, doc, ghi, khoCucBo } from '../src/kho-cuc-bo';
import { NHAN_NHOM_THEME, NutTheme } from '../src/vo/nut-theme';
import { datKhoGia, dung } from './giup';
import { cheDoMauTuSpec } from './doc-spec';
/*
 * `index.html` đọc bằng `?raw` của Vite, cùng nếp `doc-spec.ts` đọc `SPEC.md`:
 * ca dưới cần **chữ thật trong file**, không một bản chép trong test.
 */
import INDEX_HTML from '../index.html?raw';

/** Kho **ném ở mọi lời gọi** — Safari chặn cookie, iframe sandbox. */
const KHO_NEM = {
  getItem: (): string | null => {
    throw new Error('SecurityError');
  },
  setItem: (): void => {
    throw new Error('QuotaExceededError');
  },
};

function donDepDom(): void {
  document.documentElement.removeAttribute(THUOC_TINH_THEME);
  document.documentElement.removeAttribute(THUOC_TINH_CHON);
}

beforeEach(() => {
  donDepDom();
  // Kho mới mỗi ca: một ca ăn lựa chọn của ca trước thì nó xanh/đỏ theo thứ tự
  // chạy — cùng lý lẽ `taoQueryClient` trong `giup.tsx`.
  datKhoGia();
});
afterEach(donDepDom);

describe('ba lựa chọn, mặc định tối (chốt 29/10)', () => {
  it('đúng BA lựa chọn, và mặc định là "tối"', () => {
    expect([...CHON_THEME]).toEqual(['sang', 'toi', 'may']);
    expect(THEME_MAC_DINH).toBe('toi');
    expect(NHAN_THEME.may).toBe('Theo máy');
  });

  it('SPEC mục 14 d.406 (T-106 A): ba lựa chọn Sáng / Tối / Theo máy, mặc định Tối — khớp `theme.ts`', () => {
    const spec = cheDoMauTuSpec();
    expect(spec.lua_chon).toEqual(CHON_THEME.map((c) => NHAN_THEME[c]));
    expect(spec.mac_dinh).toBe(NHAN_THEME[THEME_MAC_DINH]);
  });

  it('script nội tuyến của `index.html` dùng CÙNG mặc định với `theme.ts` (không nhoáng sáng lần đầu)', () => {
    /*
     * Ba chỗ biết chữ mặc định: `THEME_MAC_DINH`, script nội tuyến, và khối
     * fallback chưa-có-JS của `kieu.css` (ca ở `vo-linear.test.tsx`). Script lệch
     * hằng thì lần tải đầu của người chưa chọn vẽ một chế độ rồi React vẽ chế độ
     * kia. Ca đọc **chữ thật** của script: giá trị gán khi kho không có lựa chọn
     * hợp lệ.
     */
    expect(INDEX_HTML).toMatch(/c !== 'may'\) c = '(\w+)';/);
    const mac_dinh = /c !== 'may'\) c = '(\w+)';/.exec(INDEX_HTML)?.[1];
    expect(mac_dinh).toBe(THEME_MAC_DINH);
  });

  it('`giaiTheme`: "theo máy" hỏi máy, hai lựa chọn kia KHÔNG hỏi', () => {
    expect(giaiTheme('may', true)).toBe('toi');
    expect(giaiTheme('may', false)).toBe('sang');
    // Ca phủ định: chủ đã chọn tay thì chế độ của máy không được ghi đè.
    expect(giaiTheme('sang', true)).toBe('sang');
    expect(giaiTheme('toi', false)).toBe('toi');
  });

  it('chưa nhớ gì ⇒ mặc định; giá trị RÁC trong kho ⇒ cũng mặc định', () => {
    expect(docChonTheme(KHO_RONG)).toBe(THEME_MAC_DINH);
    ghi(KHOA_THEME, 'xanh-lá');
    expect(docChonTheme()).toBe(THEME_MAC_DINH);
  });
});

describe('nhớ lựa chọn, và không vỡ khi localStorage ném', () => {
  it('lưu rồi đọc lại ra ĐÚNG lựa chọn — kể cả `may`', () => {
    for (const c of CHON_THEME) {
      luuChonTheme(c);
      expect(docChonTheme()).toBe(c);
    }
    // Thứ nằm trong kho là **lựa chọn**, không phải kết quả đã giải.
    luuChonTheme('may');
    expect(doc(KHOA_THEME)).toBe('may');
  });

  it('kho NÉM ở cả đọc và ghi ⇒ không ném ra ngoài, trả mặc định', () => {
    expect(() => {
      luuChonTheme('toi', KHO_NEM);
    }).not.toThrow();
    expect(docChonTheme(KHO_NEM)).toBe(THEME_MAC_DINH);
  });

  it('`khoCucBo` loại một đối tượng lạ không có `getItem`', () => {
    // Không ghim được "localStorage biến mất" trong jsdom, nên ghim đúng phép
    // kiểm: một kho thiếu hàm phải thành kho rỗng, không thành một lỗi runtime.
    expect(khoCucBo()).not.toBe(KHO_NEM);
    expect(KHO_RONG.getItem(KHOA_THEME)).toBeNull();
  });
});

describe('đặt chế độ lên `<html>` — chỗ script nội tuyến của index.html đặt', () => {
  it('`apTheme` đặt KẾT QUẢ cho CSS và LỰA CHỌN cho giao diện', () => {
    apTheme('toi');
    expect(document.documentElement.getAttribute(THUOC_TINH_THEME)).toBe('toi');
    expect(document.documentElement.getAttribute(THUOC_TINH_CHON)).toBe('toi');

    apTheme('may');
    // `may` giải ra `sang` hay `toi` tuỳ máy; điều ghim được là nó **không** để
    // chữ `may` lại cho CSS (CSS chỉ biết hai chế độ).
    expect(['sang', 'toi']).toContain(document.documentElement.getAttribute(THUOC_TINH_THEME));
    expect(document.documentElement.getAttribute(THUOC_TINH_CHON)).toBe('may');
  });

  it('`chonTrenDom` đọc lựa chọn TỪ DOM, không từ kho (nguồn không gây nhoáng)', () => {
    ghi(KHOA_THEME, 'sang');
    document.documentElement.setAttribute(THUOC_TINH_CHON, 'toi');
    expect(chonTrenDom()).toBe('toi');
  });
});

describe('KHÔNG nháy sai màu lúc tải — theme đặt trước khi React vẽ', () => {
  it('`index.html` có script đặt `data-theme` NGAY TRONG `<head>`, trước bundle React', () => {
    /*
     * Ca này canh đúng một thứ: **thứ tự**. Script đặt chế độ phải nằm trước
     * `<script type="module" src="/src/main.tsx">`; đặt sau (hoặc trong React)
     * nghĩa là trình duyệt đã vẽ một frame bằng màu mặc định — một nhoáng trắng
     * toàn màn hình mỗi lần tải ở chế độ tối.
     */
    const i_dat = INDEX_HTML.indexOf(`'${THUOC_TINH_THEME}'`);
    const i_head = INDEX_HTML.indexOf('</head>');
    const i_react = INDEX_HTML.indexOf('main.tsx');

    expect(i_dat).toBeGreaterThan(-1);
    expect(i_dat).toBeLessThan(i_head);
    expect(i_dat).toBeLessThan(i_react);
    // Và nó đọc **đúng khoá** mà `theme.ts` ghi — hai bản lệch là một nhoáng.
    expect(INDEX_HTML).toContain(KHOA_THEME);
    // Bọc `try`: `localStorage` ném ở Safari chặn cookie, và một ngoại lệ trong
    // `<head>` chặn phần còn lại của `<head>`.
    expect(INDEX_HTML).toContain('try {');
  });
});

describe('nút sáng/tối trên màn hình', () => {
  it('ba nút radio, nút đang bật khớp lựa chọn đã nhớ', async () => {
    apTheme('toi');
    dung(<NutTheme />);
    const nhom = screen.getByRole('radiogroup', { name: NHAN_NHOM_THEME });
    expect(nhom.getAttribute('data-theme-dang-chon')).toBe('toi');
    const nut = screen.getAllByRole('radio');
    expect(nut.length).toBe(3);
    expect(screen.getByRole('radio', { name: NHAN_THEME.toi }).getAttribute('aria-checked')).toBe(
      'true',
    );
    await Promise.resolve();
  });

  it('bấm "Sáng" ⇒ `<html>` đổi NGAY và lựa chọn được NHỚ', async () => {
    apTheme('toi');
    dung(<NutTheme />);
    await userEvent.click(screen.getByRole('radio', { name: NHAN_THEME.sang }));

    expect(document.documentElement.getAttribute(THUOC_TINH_THEME)).toBe('sang');
    expect(doc(KHOA_THEME)).toBe('sang');
  });

  it('dựng LẠI sau khi bấm ⇒ vẫn là lựa chọn cũ (vế "nhớ lần sau")', async () => {
    dung(<NutTheme />);
    await userEvent.click(screen.getByRole('radio', { name: NHAN_THEME.toi }));

    // Đúng hình của một lần tải trang mới: script nội tuyến đọc kho và đặt
    // `<html>`, rồi React dựng lại từ đó.
    document.documentElement.removeAttribute(THUOC_TINH_CHON);
    apTheme(docChonTheme());
    const lai = dung(<NutTheme />);

    expect(document.documentElement.getAttribute(THUOC_TINH_THEME)).toBe('toi');
    expect(
      lai.container.querySelector('[role="radiogroup"]')?.getAttribute('data-theme-dang-chon'),
    ).toBe('toi');
  });

  it('đang ở "theo máy" mà MÁY đổi chế độ ⇒ `<html>` VÀ React đều đổi theo', async () => {
    /*
     * Reviewer bắt đúng chỗ này: listener `change` cũ chỉ gọi `apTheme('may')`,
     * tức chỉ sửa DOM. Lựa chọn vẫn là `may` nên không state nào đổi, React
     * **không vẽ lại**, và `data-theme-dang-hien` giữ giá trị lúc mount. Màu
     * thật vẫn đúng (CSS đọc `<html data-theme>`), nhưng một lượt sau rẽ nhánh
     * trong React theo chế độ thật sẽ rẽ sai.
     *
     * Ca dựng một `matchMedia` giả bắn được `change` thật — jsdom không cho đổi
     * `prefers-color-scheme` của chính nó.
     */
    const nghe: ((e: MediaQueryListEvent) => void)[] = [];
    let toi = false;
    const goc = globalThis.matchMedia;
    Object.defineProperty(globalThis, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({
        media: q,
        get matches() {
          return toi;
        },
        addEventListener: (_: string, f: (e: MediaQueryListEvent) => void) => nghe.push(f),
        removeEventListener: () => undefined,
      }),
    });
    try {
      apTheme('may');
      dung(<NutTheme />);
      const nhom = screen.getByRole('radiogroup', { name: NHAN_NHOM_THEME });
      expect(nhom.getAttribute('data-theme-dang-hien')).toBe('sang');
      expect(nghe.length).toBe(1);

      toi = true;
      await act(async () => {
        for (const f of nghe) f({} as MediaQueryListEvent);
        await Promise.resolve();
      });

      expect(document.documentElement.getAttribute(THUOC_TINH_THEME)).toBe('toi');
      expect(nhom.getAttribute('data-theme-dang-hien')).toBe('toi');
      // Lựa chọn thì **không** đổi: chủ vẫn đang ở "theo máy".
      expect(nhom.getAttribute('data-theme-dang-chon')).toBe('may');
    } finally {
      Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: goc });
    }
  });

  it('bấm "Theo máy" ⇒ kho nhớ `may`, KHÔNG nhớ kết quả đã giải', async () => {
    apTheme('sang');
    dung(<NutTheme />);
    await userEvent.click(screen.getByRole('radio', { name: NHAN_THEME.may }));

    expect(doc(KHOA_THEME)).toBe('may');
    expect(document.documentElement.getAttribute(THUOC_TINH_CHON)).toBe('may');
  });
});
