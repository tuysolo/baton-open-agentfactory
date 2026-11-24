/**
 * **Toast** — SPEC mục 14 d.418: "Mọi thao tác sửa hiện ngay trên màn hình trước
 * khi server trả lời; **server từ chối thì hoàn lại và báo lỗi dạng toast ghi rõ
 * lý do**."
 *
 * Một chỗ dùng chung cho cả giao diện, dựng ở lượt này vì đây là lượt đầu có cập
 * nhật lạc quan (trang Cần Chủ). Hai điều nó giữ:
 *
 *   * **Câu lỗi đi NGUYÊN VĂN từ máy chủ** — nếp `src/api.ts`: SPEC mục 13 d.379
 *     bắt mọi lỗi mang `message` tiếng Việt, nên giao diện không dịch mã lỗi
 *     thành câu. "Ghi rõ lý do" của d.418 **là** câu đó.
 *   * **`useToast` NÉM khi không có provider.** Một context mặc định "không làm
 *     gì" sẽ làm mọi lời báo lỗi biến mất im lặng ở bất kỳ cây nào quên bọc
 *     provider — tức đúng vế d.418 bị hỏng mà không ca nào đỏ. Fail-loud.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { IconDong } from './icon';

export interface MotToast {
  id: number;
  cau: string;
  loai: 'loi' | 'tin';
}

interface CuaToast {
  bao: (cau: string, loai?: MotToast['loai']) => void;
}

const Cua = createContext<CuaToast | null>(null);

export function useToast(): CuaToast {
  const c = useContext(Cua);
  if (c === null) throw new Error('useToast: thiếu <KhuToast> bọc quanh cây này');
  return c;
}

/** Nhãn vùng chứa toast — ca test gọi ra bằng vai ARIA, không bằng class. */
export const NHAN_KHU_TOAST = 'Thông báo';

export function KhuToast({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [ds, datDs] = useState<MotToast[]>([]);

  /*
   * Không có hẹn giờ tự tắt. Chủ ý: đây là chỗ **duy nhất** chủ biết một thao
   * tác đã bị máy chủ từ chối (thẻ đã hoàn về chỗ cũ, nhìn như chưa bấm gì), nên
   * một câu tự biến mất sau 4 giây là một lời báo có thể **không ai đọc**. Đóng
   * bằng nút ✕ — một cú bấm, và nó là bằng chứng chủ đã thấy.
   */
  const bao = useCallback((cau: string, loai: MotToast['loai'] = 'loi') => {
    datDs((cu) => [...cu, { id: (cu.at(-1)?.id ?? 0) + 1, cau, loai }]);
  }, []);

  const cua = useMemo<CuaToast>(() => ({ bao }), [bao]);

  return (
    <Cua.Provider value={cua}>
      {children}
      {/*
        * Vùng chứa **không** mang `role` và **không dựng khi rỗng**: mỗi câu tự
        * nó là `role="alert"` (đủ để trình đọc màn hình đọc lên, và đủ để ca
        * test gọi ra đúng câu). Một `role="status"` rỗng nằm thường trú trong
        * cây sẽ làm **mọi** `getByRole('status')` của các trang khác thấy hai
        * phần tử — tức một vùng toast rỗng phá các ca "đang tải…" của cả giao
        * diện. Đã gặp thật khi dựng lượt này.
        */}
      <div
        aria-label={NHAN_KHU_TOAST}
        hidden={ds.length === 0}
        className="fixed right-4 bottom-4 z-50 flex flex-col gap-2"
      >
        {ds.map((t) => (
          <div
            key={t.id}
            role="alert"
            data-toast={t.loai}
            /*
             * Hệ thiết kế 29/10 (`THIET-KE.md`): toast là một **tấm lớp nổi**
             * (bo 8px, viền mờ, chữ chính) — không tô cả tấm đỏ. Nghĩa "lỗi" đi
             * bằng **icon tròn đỏ** (`text-loi`) đứng trước câu, cộng
             * `role="alert"` và `data-toast="loi"`; câu lỗi vẫn đi nguyên văn,
             * vẫn là chữ chính (đọc rõ nhất), không chữ đỏ trên nền tối.
             *
             * Icon là `<svg>`, **không** `<span>`: các ca test đọc câu toast bằng
             * `[data-toast] span` — chỉ đúng một `span` (câu) được phép nằm ở đây.
             */
            className="flex max-w-md items-start gap-2.5 rounded-lg border border-vien bg-nen-lop px-3 py-2.5 text-sm text-chu shadow-lg"
          >
            <svg
              viewBox="0 0 16 16"
              width={16}
              height={16}
              aria-hidden
              className={`mt-px shrink-0 ${t.loai === 'loi' ? 'text-loi' : 'text-chu-mo'}`}
            >
              <circle cx="8" cy="8" r="7" fill="currentColor" />
              {t.loai === 'loi' ? (
                <path d="M8 4.6v4.2M8 11.2v.2" strokeWidth="1.7" strokeLinecap="round" className="stroke-nen" />
              ) : (
                <path d="M8 7.4v4M8 4.8v.2" strokeWidth="1.7" strokeLinecap="round" className="stroke-nen" />
              )}
            </svg>
            <span className="min-w-0 break-words">{t.cau}</span>
            <button
              type="button"
              aria-label={`Đóng thông báo: ${t.cau}`}
              onClick={() => datDs((cu) => cu.filter((x) => x.id !== t.id))}
              className="-mt-0.5 -mr-1 flex size-6 shrink-0 items-center justify-center rounded text-chu-mo hover:bg-nen-noi hover:text-chu"
            >
              <IconDong />
            </button>
          </div>
        ))}
      </div>
    </Cua.Provider>
  );
}
