/**
 * **Icon đơn sắc, SVG nội tuyến.**
 *
 * Không thêm gói icon nào: `packages/web/package.json` chưa có gói nào cho việc
 * này, và brief chặn thêm dependency mới. Năm hình vẽ không đáng một gói.
 *
 * Mọi icon:
 *   * tô bằng `currentColor` ⇒ tự đúng chế độ sáng/tối, không một mã màu nào ở
 *     đây (xem khối đầu `kieu.css`);
 *   * `aria-hidden` ⇒ trình đọc màn hình đọc **nhãn chữ** của nút, không đọc
 *     hình. Nút nào chỉ có icon thì mang `aria-label`, và ca test gọi ra bằng
 *     nhãn đó.
 */

import type { MucDoKhan, TrangThaiAgent, TrangThaiTicket } from '../api';
import { LOP_MUC_GAP, LOP_TRANG_THAI, LOP_TRANG_THAI_AGENT } from './mau-the';

const CHUNG = {
  viewBox: '0 0 16 16',
  width: 14,
  height: 14,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  className: 'shrink-0',
};

export function IconTim(): React.JSX.Element {
  return (
    <svg {...CHUNG}>
      <circle cx="7" cy="7" r="4.3" />
      <path d="M10.2 10.2 14 14" />
    </svg>
  );
}

export function IconThem(): React.JSX.Element {
  return (
    <svg {...CHUNG}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </svg>
  );
}

export function IconMenu(): React.JSX.Element {
  return (
    <svg {...CHUNG}>
      <path d="M2.4 4.5h11.2M2.4 8h11.2M2.4 11.5h11.2" />
    </svg>
  );
}

export function IconDong(): React.JSX.Element {
  return (
    <svg {...CHUNG}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/**
 * **Icon ưu tiên** — năm mức của bảng 0.1, năm hình **phân biệt được không cần
 * màu** (`cau-hoi-spec.md` #136).
 *
 *   * `urgent` — một ô vuông có dấu `!` (hình duy nhất không phải vạch: Khẩn phải
 *     khác hẳn, không chỉ "nhiều vạch hơn");
 *   * `high` / `medium` / `low` — ba vạch cao dần, **3 / 2 / 1** vạch tô đậm;
 *   * `none` — ba vạch đều **mờ**.
 *
 * SVG dùng `fill="currentColor"` chứ không `stroke` như các icon trên: ba vạch
 * đặc đọc được ở 14px, còn ba vạch viền ở cỡ đó là ba hình chữ nhật rỗng lẫn vào
 * nhau. Vạch "mờ" là `opacity`, **không** một mã màu thứ hai — màu vẫn đúng một
 * token do chỗ gọi đặt (`LOP_UU_TIEN` của `vo/mau-the.ts`).
 *
 * `aria-hidden` như mọi icon: nhãn tiếng Việt **của máy chủ** nằm trên phần tử
 * bọc (`aria-label` + `title`), nên trình đọc màn hình đọc "Khẩn", không đọc hình.
 */
export function IconUuTien({ uu_tien }: { uu_tien: string }): React.JSX.Element {
  if (uu_tien === 'urgent') {
    return (
      <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" className="shrink-0">
        <rect x="2" y="2" width="12" height="12" rx="2.5" fill="currentColor" />
        {/* Dấu `!` khoét bằng màu NỀN THẺ, không `white`: xem `kieu.css`. */}
        <rect x="7.2" y="4.4" width="1.6" height="4.6" rx="0.8" className="fill-nen" />
        <rect x="7.2" y="10.2" width="1.6" height="1.6" rx="0.8" className="fill-nen" />
      </svg>
    );
  }
  const so_dam = uu_tien === 'high' ? 3 : uu_tien === 'medium' ? 2 : uu_tien === 'low' ? 1 : 0;
  const vach = [
    { x: 2, y: 9.5, h: 4.5 },
    { x: 6.6, y: 6.5, h: 7.5 },
    { x: 11.2, y: 3.5, h: 10.5 },
  ];
  return (
    <svg viewBox="0 0 16 16" width={14} height={14} aria-hidden="true" className="shrink-0">
      {vach.map((v, i) => (
        <rect
          key={v.x}
          x={v.x}
          y={v.y}
          width="2.8"
          height={v.h}
          rx="0.9"
          fill="currentColor"
          opacity={i < so_dam ? 1 : 0.3}
        />
      ))}
    </svg>
  );
}

/** Mũi `>` của nhóm thu gọn — quay 90° khi mở, bằng CSS, không hai hình. */
export function IconMui({ mo }: { mo: boolean }): React.JSX.Element {
  return (
    <svg
      {...CHUNG}
      width={12}
      height={12}
      className={`shrink-0 transition-transform ${mo ? 'rotate-90' : ''}`}
    >
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

/**
 * Mũi tên xuống nhỏ (12px) của nút **mở menu** (menu workspace): báo "bấm vào
 * đây có menu". Màu do chỗ gọi đặt (`text-chu-mo-hon`) — không mã màu ở đây.
 */
export function IconChevronXuong(): React.JSX.Element {
  return (
    <svg {...CHUNG} width={12} height={12} data-icon="chevron-xuong">
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

/* ================================================================== *
 * Icon trạng thái ticket + chấm mức gấp — hệ thiết kế 29/10 (THIET-KE.md)
 * ================================================================== */

/**
 * Thuộc tính ARIA của một icon **mang nghĩa**: có `nhan` ⇒ là một hình có tên
 * (`role="img"` + `aria-label`), để trình đọc màn hình đọc được trạng thái khi
 * chữ trạng thái không nằm cạnh; không có ⇒ `aria-hidden`, vì chữ đã nằm cạnh
 * và đọc hai lần là thừa.
 */
function ariaIcon(nhan: string | undefined): Record<string, string | boolean> {
  return nhan === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': nhan };
}

/**
 * **Icon trạng thái ticket** — vòng tròn nhỏ 16px đặt **trước tiêu đề** (không
 * tô nền cả dòng). Năm hình cho bảy trạng thái của bảng 0.1:
 *
 *   * Cần làm (`todo`) — vòng rỗng xám; `backlog` — vòng rỗng xám **nét đứt**;
 *   * Đang làm (`in_progress`) — vòng vàng, **nửa** đầy;
 *   * Chờ kiểm chứng (`verifying`) — vòng xanh dương, **ba phần tư** đầy;
 *   * Xong (`done`) — tròn đầy tím (màu nhấn) có **tick**;
 *   * Huỷ (`canceled`, và `duplicate`) — tròn đầy xám có **x**.
 *
 * **Hình khác nhau ở mọi trạng thái**, nên màu không là thông tin duy nhất. Màu
 * là `text-tt-*` của `LOP_TRANG_THAI` (`vo/mau-the.ts`); tick và x khoét bằng
 * màu nền trang (`stroke-nen`), không `white` (xem `kieu.css`).
 *
 * `nhan` (nhãn tiếng Việt của máy chủ, `nhan_trang_thai`): truyền khi icon đứng
 * MỘT MÌNH; khi chữ trạng thái đã nằm cạnh thì bỏ trống — icon thành
 * `aria-hidden`, chữ vẫn là thứ ca test và SPEC đọc.
 */
export function IconTrangThai({
  trang_thai,
  nhan,
  co = 16,
}: {
  trang_thai: TrangThaiTicket;
  nhan?: string;
  co?: number;
}): React.JSX.Element {
  const vong = { cx: 8, cy: 8, r: 6, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 };
  let ruot: React.JSX.Element;
  switch (trang_thai) {
    case 'backlog':
      ruot = <circle {...vong} strokeDasharray="2.2 2.2" />;
      break;
    case 'todo':
      ruot = <circle {...vong} />;
      break;
    case 'in_progress':
      ruot = (
        <>
          <circle {...vong} />
          <path d="M8 4.5A3.5 3.5 0 0 1 8 11.5Z" fill="currentColor" />
        </>
      );
      break;
    case 'verifying':
      ruot = (
        <>
          <circle {...vong} />
          <path d="M8 8V4.5A3.5 3.5 0 1 1 4.5 8Z" fill="currentColor" />
        </>
      );
      break;
    case 'done':
      ruot = (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5 8.2 7.1 10.2 11 6"
            fill="none"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-nen"
          />
        </>
      );
      break;
    case 'canceled':
    case 'duplicate':
      ruot = (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path
            d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"
            fill="none"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="stroke-nen"
          />
        </>
      );
      break;
  }
  return (
    <svg
      viewBox="0 0 16 16"
      width={co}
      height={co}
      data-icon-trang-thai={trang_thai}
      className={`shrink-0 ${LOP_TRANG_THAI[trang_thai]}`}
      {...ariaIcon(nhan)}
    >
      {nhan === undefined ? null : <title>{nhan}</title>}
      {ruot}
    </svg>
  );
}

/**
 * **Chấm mức gấp Cần Chủ** — đỏ (Khẩn) / vàng (Hôm nay) / xám (Để sau). Hai mức
 * gấp là chấm **đầy**, "để sau" là chấm **rỗng**: mức thấp nhất trông nhẹ nhất,
 * không chỉ khác màu. Cùng luật ARIA với `IconTrangThai`.
 */
export function ChamMucGap({
  muc,
  nhan,
}: {
  muc: MucDoKhan;
  nhan?: string;
}): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 10 10"
      width={10}
      height={10}
      data-muc-gap={muc}
      className={`shrink-0 ${LOP_MUC_GAP[muc]}`}
      {...ariaIcon(nhan)}
    >
      {nhan === undefined ? null : <title>{nhan}</title>}
      {muc === 'later' ? (
        <circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <circle cx="5" cy="5" r="4" fill="currentColor" />
      )}
    </svg>
  );
}

/**
 * **Chấm trạng thái agent** — năm trạng thái của bảng 0.1, đặt **trước tên
 * agent** (Tổng quan, Đội agent, chip trang agent). Chấm 10px như `ChamMucGap`,
 * và **năm hình khác nhau** để màu không là thông tin duy nhất:
 *
 *   * Đang làm (`busy`) — chấm **đầy** xanh;
 *   * Chờ Chủ (`waiting_owner`) — **vòng** vàng có **chấm nhỏ giữa** (đang đợi);
 *   * Đứng (`stalled`) — **hình thoi** đầy đỏ (hình duy nhất không tròn: thứ
 *     cần chú ý nhất phải khác hẳn);
 *   * Rảnh (`idle`) — **vòng rỗng** xám;
 *   * Đã tắt (`disabled`) — vòng xám có **gạch chéo**.
 *
 * Màu là `LOP_TRANG_THAI_AGENT` (`vo/mau-the.ts`). Cùng luật ARIA với
 * `IconTrangThai`: không `nhan` ⇒ `aria-hidden` (chữ `nhan_trang_thai` đứng cạnh
 * là thứ được đọc); có `nhan` ⇒ `role="img"` + `aria-label`.
 *
 * Thuộc tính là `data-cham-agent`, **không** `data-trang-thai`: các ca test đọc
 * `[data-trang-thai]` để lấy **chữ** trạng thái, một chấm mang cùng thuộc tính sẽ
 * bị chọn trước.
 */
export function ChamTrangThaiAgent({
  trang_thai,
  nhan,
}: {
  trang_thai: TrangThaiAgent;
  nhan?: string;
}): React.JSX.Element {
  const vong = { cx: 5, cy: 5, r: 3.6, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 };
  let ruot: React.JSX.Element;
  switch (trang_thai) {
    case 'busy':
      ruot = <circle cx="5" cy="5" r="4" fill="currentColor" />;
      break;
    case 'waiting_owner':
      ruot = (
        <>
          <circle {...vong} />
          <circle cx="5" cy="5" r="1.5" fill="currentColor" />
        </>
      );
      break;
    case 'stalled':
      ruot = <path d="M5 0.6 9.4 5 5 9.4 0.6 5Z" fill="currentColor" />;
      break;
    case 'idle':
      ruot = <circle {...vong} />;
      break;
    case 'disabled':
      ruot = (
        <>
          <circle {...vong} />
          <path d="M2.5 7.5 7.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </>
      );
      break;
  }
  return (
    <svg
      viewBox="0 0 10 10"
      width={10}
      height={10}
      data-cham-agent={trang_thai}
      className={`shrink-0 ${LOP_TRANG_THAI_AGENT[trang_thai]}`}
      {...ariaIcon(nhan)}
    >
      {nhan === undefined ? null : <title>{nhan}</title>}
      {ruot}
    </svg>
  );
}

/* ================================================================== *
 * Icon mục sidebar — 16px, nét 1.4, `currentColor`
 * ================================================================== */

const NET16 = { ...CHUNG, width: 16, height: 16 };

export function IconTongQuan(): React.JSX.Element {
  return (
    <svg {...NET16}>
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="1" />
    </svg>
  );
}

export function IconHopThu(): React.JSX.Element {
  return (
    <svg {...NET16}>
      <path d="M2.2 9.3 4.2 3.5h7.6l2 5.8v3.2a1 1 0 0 1-1 1H3.2a1 1 0 0 1-1-1Z" />
      <path d="M2.2 9.3h3.3l1 1.6h3l1-1.6h3.3" />
    </svg>
  );
}

export function IconDanhSach(): React.JSX.Element {
  return (
    <svg {...NET16}>
      <path d="M6 4h7.5M6 8h7.5M6 12h7.5M2.6 4h.01M2.6 8h.01M2.6 12h.01" strokeWidth={1.6} />
    </svg>
  );
}

export function IconBaoCao(): React.JSX.Element {
  return (
    <svg {...NET16}>
      <path d="M2.5 13.5h11M4.8 11V8.2M8 11V4.5M11.2 11V6.5" />
    </svg>
  );
}

export function IconNhatKy(): React.JSX.Element {
  return (
    <svg {...NET16}>
      <path d="M3.2 12.2V3.8a1.3 1.3 0 0 1 1.3-1.3h8.3v9H4.5a1.3 1.3 0 0 0-1.3 1.3 1.3 1.3 0 0 0 1.3 1.3h8.3" />
      <path d="M6 5.5h4" />
    </svg>
  );
}

export function IconDoiAgent(): React.JSX.Element {
  return (
    <svg {...NET16}>
      <circle cx="6" cy="5.5" r="2.2" />
      <path d="M2 13c.5-2.3 2-3.5 4-3.5s3.5 1.2 4 3.5" />
      <circle cx="11.3" cy="6" r="1.7" />
      <path d="M11.3 9.6c1.4.1 2.4 1.1 2.8 2.9" />
    </svg>
  );
}

export function IconCaiDat(): React.JSX.Element {
  return (
    <svg {...NET16}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M12.4 3.6 11 5M5 11l-1.4 1.4" />
    </svg>
  );
}
