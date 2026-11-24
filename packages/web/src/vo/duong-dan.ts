/**
 * **Tiêu đề trang dạng breadcrumb** — "Sample › Việc".
 *
 * Hàm **thuần**: đường (`pathname`) + một phép tra tên dự án ⇒ các chặng. Nhờ
 * vậy luật "đường nào ra chặng nào" test được không cần DOM, và thanh trên chỉ
 * còn việc vẽ dấu `›` giữa các chặng.
 *
 * SPEC mục 14 **không chốt breadcrumb** (d.391–412 không nhắc tiêu đề trang) —
 * yêu cầu đến từ brief của chủ; `cau-hoi-spec.md` #126. Nhãn các chặng lấy từ
 * `muc-sidebar.ts` khi đường là một mục sidebar, nên đổi một nhãn ở SPEC là đổi
 * **một** chỗ.
 *
 * Tên dự án có thể **chưa về** (sidebar đang tải) hoặc không tra được: lúc đó
 * chặng là **mã/id trên đường**, không phải chữ "Đang tải…". Một breadcrumb
 * nhảy chữ hai lần mỗi lần chuyển trang khó đọc hơn một mã.
 */

import { MUC_CHINH, MUC_CUOI } from './muc-sidebar';

/** Nhãn chặng "danh sách ticket của một dự án" — Linear gọi khu này là việc. */
export const CHANG_VIEC = 'Việc';
export const CHANG_HO_SO = 'Hồ sơ';
export const CHANG_TAT_CA_DU_AN = 'Tất cả dự án';
export const CHANG_PHIEN = 'Phiên';
/** Chặng gốc khi đường không khớp gì (kể cả "Không có trang này"). */
export const CHANG_GOC = 'Baton';

/** Dấu giữa hai chặng. Một chỗ: thanh trên và ca test dùng cùng ký tự. */
export const DAU_CHANG = '›';

export type TimTenDuAn = (ma_hoac_id: string) => string | undefined;

export function duongDanTuUrl(pathname: string, tim: TimTenDuAn = () => undefined): string[] {
  const doan = pathname.split('/').filter((s) => s !== '');

  // Mục sidebar (kể cả `/` → Tổng quan): nhãn đi từ sổ tra của SPEC.
  const duong = `/${doan.join('/')}`;
  const muc = [...MUC_CHINH, MUC_CUOI].find((m) => m.duong === (doan.length === 0 ? '/' : duong));
  if (muc !== undefined) return [muc.nhan];

  const ten = (ma: string): string => tim(ma) ?? ma;

  if (doan[0] === 'du-an' && doan[1] !== undefined) {
    const goc = ten(doan[1]);
    if (doan[2] === 'ho-so') return [goc, CHANG_HO_SO];
    return [goc, CHANG_VIEC];
  }
  if (doan[0] === 'ticket' && doan.length === 1) return [CHANG_TAT_CA_DU_AN, CHANG_VIEC];
  if (doan[0] === 't' && doan[1] !== undefined) return [CHANG_VIEC, doan[1]];
  if (doan[0] === 'agent' && doan[1] !== undefined) {
    const doi = MUC_CHINH.find((m) => m.duong === '/doi-agent');
    return [doi?.nhan ?? CHANG_GOC, doan[1]];
  }
  if (doan[0] === 'phien' && doan[1] !== undefined) return [CHANG_PHIEN, doan[1]];

  return [CHANG_GOC];
}
