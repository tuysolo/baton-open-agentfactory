/**
 * **Một bộ con nhỏ của markdown, render ra React element** — SPEC mục 8 d.240
 * ("Bối cảnh (markdown, có link `file://` và link ticket)").
 *
 * ## Vì sao KHÔNG cài một thư viện markdown
 *
 * SPEC chỉ đòi markdown ở **một** chỗ: ô bối cảnh của thẻ Cần Chủ, do agent viết
 * (`baton ask --context`). Thứ cần hiển thị được là đoạn văn, danh sách, khối
 * code, link, chữ đậm/nghiêng — và một bộ như thế là ~120 dòng thuần, có test.
 * Một gói markdown đổi lại hai thứ đắt hơn hẳn: (1) phần lớn chúng trả **HTML
 * thô**, tức lối vào `dangerouslySetInnerHTML` — chỗ duy nhất trong cả giao diện
 * mà một chuỗi do **agent** viết trở thành mã chạy trong phiên của chủ; (2) một
 * bề mặt phụ thuộc mới mà `quyet-dinh.md` (danh sách CoS 05/10) chưa chốt.
 *
 * Nên file này **không có** một `innerHTML` nào: nó dựng `Khoi`/`Inline` thuần
 * rồi trả về element. Chuỗi nào không khớp cú pháp nào thì hiện **nguyên văn** —
 * fail-safe đúng hướng: xấu hơn, không mất chữ, không chạy gì.
 *
 * Giới hạn khai thẳng: không bảng, không tiêu đề `#`, không danh sách lồng,
 * không link dạng `<https://…>`. Agent viết một thứ ngoài bộ con này thì chủ vẫn
 * đọc được (nó ra chữ thường), nên đây là món **nợ nhìn thấy được**, không một
 * lỗi im lặng.
 */

import { Link } from 'react-router-dom';
import { LOP_LIEN_KET } from './vo/lop-nut';

/* ------------------------------------------------------------------ *
 * 0. Lớp trình bày (THIET-KE "Chữ" — quy ước Markdown, BAT-69)
 * ------------------------------------------------------------------ */

/**
 * Mã nội dòng và khối code: token ngữ nghĩa, cùng quy ước "ô chữ đơn cách trong
 * hộp" — nền `nen-noi` (một nấc trên `nen` và trên `nen-lop`, nên Markdown đặt
 * trên nền trang hay trên thẻ đều tách được khỏi nền), viền mờ, chữ chính khai
 * **tường minh** để lưới cặp nền–chữ của `test/vo-linear.test.tsx` đo được cặp
 * này ở hai chế độ. Không thang `neutral-*`.
 */
export const LOP_MD_MA = 'rounded border border-vien bg-nen-noi px-1 font-mono text-xs text-chu';
export const LOP_MD_CODE =
  'overflow-x-auto rounded border border-vien bg-nen-noi p-2 font-mono text-xs text-chu';

/**
 * Liên kết trong Markdown: màu liên kết `LOP_LIEN_KET` **và giữ gạch chân thường
 * trực**. Lý do giữ: liên kết ở đây nằm **giữa đoạn văn** (khác liên kết đứng
 * riêng của các trang), nên chỉ phân biệt bằng màu là yếu — người không phân
 * biệt màu không thấy chỗ nào bấm được. Gạch chân thường trực là tín hiệu thứ
 * hai không phụ thuộc màu.
 */
export const LOP_MD_LIEN = `${LOP_LIEN_KET} underline`;

/** Liên kết không an toàn (không dựng `<a>`): chữ phụ token. */
export const LOP_MD_KHONG_AN_TOAN = 'break-all text-chu-mo';

/* ------------------------------------------------------------------ *
 * 1. Địa chỉ nào được dựng thành link
 * ------------------------------------------------------------------ */

/**
 * **Danh sách scheme cho phép** — fail-closed, cùng nếp `LienBangChung` của
 * trang Tổng quan (`quyet-dinh.md` 05/10: "cái gì gây hại ở chỗ vẽ thì canh ở
 * chỗ vẽ").
 *
 * `file:` nằm trong danh sách vì **SPEC đòi nó** (d.240). Nó an toàn ở đây theo
 * nghĩa hẹp và nên nói rõ nghĩa hẹp đó:
 *   * `file:` **không chạy mã** trong trang: nó là một điều hướng, không một
 *     `javascript:`; nó không đọc được cookie, không gửi được gì về đâu.
 *   * Trình duyệt hiện đại **tự chặn** điều hướng từ một trang `https:` sang
 *     `file:`, nên ca xấu nhất là **không có gì xảy ra** khi chủ bấm — đúng
 *     hướng fail-closed, và vẫn hơn hẳn việc ẩn đường dẫn đi: chữ vẫn hiện,
 *     chủ copy được và tự mở.
 *   * Nó **không** mở thêm cửa nào so với chữ thường: thông tin trong `file://…`
 *     là một đường dẫn trên **máy của chính chủ**.
 *
 * `javascript:`, `data:`, `vbscript:` và mọi scheme lạ **không** vào đây, nên
 * chúng rơi về nhánh "hiện nguyên văn".
 */
export const SCHEME_CHO_PHEP = ['https:', 'http:', 'file:', 'mailto:'] as const;

export type HinhDiaChi =
  /** Đường **trong ứng dụng** (`/t/BAT-12` — link ticket của d.240). */
  | { hinh: 'trong'; duong: string }
  /** Link ra ngoài, scheme nằm trong danh sách cho phép. */
  | { hinh: 'ngoai'; href: string }
  /** Không dựng link: hiện nguyên văn. */
  | { hinh: 'khong' };

/**
 * Phân loại một địa chỉ. **Hàm thuần**, nên luật "chỉ scheme cho phép" test được
 * không cần DOM — và nó là chỗ **duy nhất** quyết định việc đó.
 */
export function hinhCuaDiaChi(dia_chi: string): HinhDiaChi {
  const t = dia_chi.trim();
  if (t === '') return { hinh: 'khong' };

  // Đường trong ứng dụng: một dấu `/` mở đầu, **không** `//` (`//evil.com` là
  // một URL giao thức-tương-đối, tức một link ra ngoài đội lốt đường nội bộ).
  if (t.startsWith('/') && !t.startsWith('//')) return { hinh: 'trong', duong: t };

  let scheme: string;
  try {
    scheme = new URL(t).protocol;
  } catch {
    // Không đọc được ⇒ không phải link. Fail-closed, nếp của cả dự án.
    return { hinh: 'khong' };
  }
  return (SCHEME_CHO_PHEP as readonly string[]).includes(scheme)
    ? { hinh: 'ngoai', href: t }
    : { hinh: 'khong' };
}

/* ------------------------------------------------------------------ *
 * 2. Phân tích — hàm thuần
 * ------------------------------------------------------------------ */

export type Inline =
  | { loai: 'chu'; van: string }
  | { loai: 'dam'; van: string }
  | { loai: 'nghieng'; van: string }
  | { loai: 'ma'; van: string }
  | { loai: 'lien'; van: string; dia_chi: string };

export type Khoi =
  | { loai: 'doan'; noi: Inline[] }
  | { loai: 'danh_sach'; muc: Inline[][] }
  | { loai: 'code'; van: string };

/**
 * Một dòng chữ → các mảnh inline.
 *
 * Một biểu thức, bốn nhánh, quét **một lượt**: `[chữ](địa chỉ)`, `` `mã` ``,
 * `**đậm**`, `*nghiêng*`. Thứ tự trong biểu thức là thứ tự ưu tiên — `**` phải
 * đứng trước `*`, nếu không `**a**` cắt thành hai `*` rỗng.
 */
export function phanTichDong(van: string): Inline[] {
  const re = /\[([^\]]*)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  const ra: Inline[] = [];
  let i = 0;
  for (let m = re.exec(van); m !== null; m = re.exec(van)) {
    if (m.index > i) ra.push({ loai: 'chu', van: van.slice(i, m.index) });
    if (m[1] !== undefined && m[2] !== undefined) {
      ra.push({ loai: 'lien', van: m[1] === '' ? m[2] : m[1], dia_chi: m[2] });
    } else if (m[3] !== undefined) ra.push({ loai: 'ma', van: m[3] });
    else if (m[4] !== undefined) ra.push({ loai: 'dam', van: m[4] });
    else if (m[5] !== undefined) ra.push({ loai: 'nghieng', van: m[5] });
    i = m.index + m[0].length;
  }
  if (i < van.length) ra.push({ loai: 'chu', van: van.slice(i) });
  return ra;
}

/**
 * Markdown → danh sách khối.
 *
 * Khối code mở bằng ```` ``` ```` **không đóng** thì ăn tới hết chuỗi: thà hiện
 * phần còn lại dưới dạng code hơn là mất nó.
 */
export function phanTichMarkdown(van: string): Khoi[] {
  const dong = van.split('\n');
  const ra: Khoi[] = [];
  let i = 0;

  while (i < dong.length) {
    const d = dong[i]!;

    if (d.trimStart().startsWith('```')) {
      const than: string[] = [];
      i += 1;
      while (i < dong.length && !dong[i]!.trimStart().startsWith('```')) {
        than.push(dong[i]!);
        i += 1;
      }
      i += 1; // bỏ dòng đóng (hoặc đã hết chuỗi)
      ra.push({ loai: 'code', van: than.join('\n') });
      continue;
    }

    if (/^\s*[-*]\s+/.test(d)) {
      const muc: Inline[][] = [];
      while (i < dong.length && /^\s*[-*]\s+/.test(dong[i]!)) {
        muc.push(phanTichDong(dong[i]!.replace(/^\s*[-*]\s+/, '')));
        i += 1;
      }
      ra.push({ loai: 'danh_sach', muc });
      continue;
    }

    if (d.trim() === '') {
      i += 1;
      continue;
    }

    // Đoạn: các dòng liền nhau tới dòng trống / khối khác.
    const than: string[] = [];
    while (
      i < dong.length &&
      dong[i]!.trim() !== '' &&
      !/^\s*[-*]\s+/.test(dong[i]!) &&
      !dong[i]!.trimStart().startsWith('```')
    ) {
      than.push(dong[i]!);
      i += 1;
    }
    ra.push({ loai: 'doan', noi: phanTichDong(than.join('\n')) });
  }

  return ra;
}

/* ------------------------------------------------------------------ *
 * 3. Vẽ
 * ------------------------------------------------------------------ */

function VeInline({ m }: { m: Inline }): React.JSX.Element {
  switch (m.loai) {
    case 'chu':
      return <>{m.van}</>;
    case 'dam':
      return <strong>{m.van}</strong>;
    case 'nghieng':
      return <em>{m.van}</em>;
    case 'ma':
      return <code className={LOP_MD_MA}>{m.van}</code>;
    case 'lien': {
      const h = hinhCuaDiaChi(m.dia_chi);
      if (h.hinh === 'trong') {
        return (
          <Link to={h.duong} data-lien="trong" className={LOP_MD_LIEN}>
            {m.van}
          </Link>
        );
      }
      if (h.hinh === 'ngoai') {
        return (
          <a href={h.href} data-lien="ngoai" rel="noreferrer" className={LOP_MD_LIEN}>
            {m.van}
          </a>
        );
      }
      /*
       * Scheme không cho phép ⇒ **không** `<a href>`, nhưng **vẫn hiện cả chữ và
       * địa chỉ**: ẩn nó đi là che một thứ đã nằm trong dữ liệu đúng lúc chủ cần
       * thấy nhất (vd một agent dán `javascript:` vào bối cảnh — chủ nên thấy).
       */
      return (
        <span data-lien="khong-an-toan" className={LOP_MD_KHONG_AN_TOAN}>
          {m.van} ({m.dia_chi})
        </span>
      );
    }
  }
}

function VeNoi({ noi }: { noi: readonly Inline[] }): React.JSX.Element {
  return (
    <>
      {noi.map((m, i) => (
        <VeInline key={i} m={m} />
      ))}
    </>
  );
}

/** Vẽ markdown đã phân tích. Không `dangerouslySetInnerHTML` — xem đầu file. */
export function Markdown({ van }: { van: string }): React.JSX.Element {
  const khoi = phanTichMarkdown(van);
  return (
    <div data-markdown="co" className="flex flex-col gap-2 text-sm">
      {khoi.map((k, i) => {
        if (k.loai === 'code') {
          return (
            <pre key={i} data-khoi-md="code" className={LOP_MD_CODE}>
              {k.van}
            </pre>
          );
        }
        if (k.loai === 'danh_sach') {
          return (
            <ul key={i} data-khoi-md="danh-sach" className="list-disc pl-5">
              {k.muc.map((m, j) => (
                <li key={j}>
                  <VeNoi noi={m} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} data-khoi-md="doan" className="whitespace-pre-wrap">
            <VeNoi noi={k.noi} />
          </p>
        );
      })}
    </div>
  );
}
