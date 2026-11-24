/**
 * **Nút sáng / tối / theo máy** — ba lựa chọn, một nhóm radio.
 *
 * Chỗ đặt: **thanh trên, góc trên phải** (xem `quyet-dinh.md`). Một chỗ duy
 * nhất: nút này KHÔNG được lặp lại dưới chân sidebar — hai nút cho một trạng
 * thái là hai chỗ phải nhớ đồng bộ, và ở màn hình 375px cái dưới chân sidebar
 * nằm trong menu trượt (chủ phải mở menu mới đổi được màu).
 *
 * `role="radiogroup"` chứ không ba cái `<button>` rời: ba lựa chọn **loại trừ
 * nhau**, và trình đọc màn hình cần biết cái nào đang bật (`aria-checked`). Ca
 * test gọi ra bằng vai ARIA, không bằng class.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  CHON_THEME,
  NHAN_THEME,
  apTheme,
  chonTrenDom,
  giaiTheme,
  luuChonTheme,
  type ChonTheme,
  type ThemeThat,
} from './theme';

export const NHAN_NHOM_THEME = 'Giao diện sáng tối';

/**
 * Trạng thái chế độ, dùng được ở nhiều component.
 *
 * Lần render đầu đọc **từ `<html>`** (script nội tuyến đã đặt) — không đọc
 * `localStorage`, không `useEffect` đặt lại: cả hai đều là một lần vẽ sai màu
 * rồi sửa, tức đúng cái nhoáng cần tránh.
 *
 * `useEffect` ở đây chỉ làm **một** việc khác: nghe máy đổi chế độ khi lựa chọn
 * là `may`. Chủ bật Night Shift lúc 18:00 thì Baton phải tối theo, không chờ
 * tải lại trang.
 *
 * Hook trả **hai** giá trị, không một: `chon` (lựa chọn, có thể là `may`) và
 * `that` (chế độ đang hiện, `sang`/`toi`). `that` phải nằm trong `useState`,
 * không được tính lại từ `chon` lúc render: khi máy đổi chế độ mà lựa chọn vẫn
 * là `may` thì `chon` **không đổi**, nên không có gì làm React vẽ lại và mọi
 * thứ dẫn xuất từ chế độ thật sẽ đứng ở giá trị lúc mount. Reviewer bắt đúng
 * chỗ này: `data-theme-dang-hien` bị cũ. Màu thật thì vẫn đúng (CSS đọc
 * `<html data-theme>`, và `apTheme` có đặt lại), nhưng một lượt sau dùng chế độ
 * thật để **rẽ nhánh trong React** (chọn một icon, một ảnh) sẽ rẽ sai.
 */
export function useTheme(): {
  chon: ChonTheme;
  that: ThemeThat;
  dat: (c: ChonTheme) => void;
} {
  const [chon, datChon] = useState<ChonTheme>(() => chonTrenDom());
  const [that, datThat] = useState<ThemeThat>(() => giaiTheme(chonTrenDom()));

  const dat = useCallback((c: ChonTheme) => {
    datChon(c);
    datThat(giaiTheme(c));
    apTheme(c);
    luuChonTheme(c);
  }, []);

  useEffect(() => {
    if (chon !== 'may') return undefined;
    let mql: MediaQueryList;
    try {
      mql = globalThis.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      return undefined;
    }
    // `addEventListener` của `MediaQueryList` không có ở mọi môi trường test.
    if (typeof mql.addEventListener !== 'function') return undefined;
    const nghe = (): void => {
      apTheme('may');
      // **Và** cập nhật state: xem khối ghi chú trên — `apTheme` một mình chỉ
      // sửa DOM, React không biết gì.
      datThat(giaiTheme('may'));
    };
    mql.addEventListener('change', nghe);
    /*
     * Đọc lại **ngay** khi đăng ký: giữa lúc script nội tuyến chạy và lúc hook
     * này gắn listener, chế độ của máy có thể đã đổi (một lần tải chậm, một tab
     * ngủ rồi tỉnh) — lúc đó không có một sự kiện `change` nào sẽ tới nữa.
     */
    datThat(giaiTheme('may'));
    return () => {
      mql.removeEventListener('change', nghe);
    };
  }, [chon]);

  return { chon, that, dat };
}

export function NutTheme(): React.JSX.Element {
  const { chon, that, dat } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={NHAN_NHOM_THEME}
      data-theme-dang-chon={chon}
      data-theme-dang-hien={that}
      className="flex items-center gap-0.5 rounded border border-vien p-0.5"
    >
      {CHON_THEME.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={chon === c}
          data-theme-nut={c}
          title={NHAN_THEME[c]}
          onClick={() => {
            dat(c);
          }}
          className={`flex size-6 items-center justify-center rounded text-xs ${
            chon === c ? 'bg-nen-noi text-chu' : 'text-neutral-500 hover:text-chu'
          }`}
        >
          <IconTheme chon={c} />
          <span className="sr-only">{NHAN_THEME[c]}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Icon **SVG nội tuyến**, đơn sắc (`currentColor`) — không thêm một gói icon
 * nào (xem `quyet-dinh.md`: `package.json` chưa có gói icon, và một dependency
 * mới cho ba hình vẽ là một cái giá không đáng).
 */
function IconTheme({ chon }: { chon: ChonTheme }): React.JSX.Element {
  const chung = {
    viewBox: '0 0 16 16',
    width: 13,
    height: 13,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (chon === 'sang') {
    return (
      <svg {...chung}>
        <circle cx="8" cy="8" r="3" />
        <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
      </svg>
    );
  }
  if (chon === 'toi') {
    return (
      <svg {...chung}>
        <path d="M13 9.6A5.5 5.5 0 1 1 6.4 3a4.6 4.6 0 0 0 6.6 6.6Z" />
      </svg>
    );
  }
  return (
    <svg {...chung}>
      <rect x="1.8" y="3" width="12.4" height="8" rx="1.2" />
      <path d="M5.5 13.2h5" />
    </svg>
  );
}
