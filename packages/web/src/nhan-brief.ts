/**
 * **Nhãn tám mục brief** — SPEC mục 5 (bảng brief). Nhãn gõ ở đây và
 * `test/doc-spec.ts` cắt bản gốc từ SPEC rồi so, cùng nếp `NHAN_LOAI` của trang
 * Cần Chủ: tám mục này là một danh sách SPEC chốt từng chữ.
 *
 * Tách khỏi `trang/chi-tiet-ticket.tsx` (BAT-33) để hộp giao việc
 * (`vo/giao-viec.tsx`) dùng **cùng** bảng nhãn mà không nhập vòng: trang chi tiết
 * nhập hộp, hộp nhập bảng nhãn. `chi-tiet-ticket.tsx` vẫn xuất lại `NHAN_BRIEF`.
 */

import type { MucBrief } from './api';

export const NHAN_BRIEF: Record<MucBrief, string> = {
  muc_tieu: 'Mục tiêu',
  boi_canh: 'Bối cảnh',
  pham_vi: 'Phạm vi',
  file_va_nguon: 'File và nguồn liên quan',
  dieu_cam: 'Điều cấm',
  xong_la_gi: 'Xong là gì',
  cach_kiem_chung: 'Cách kiểm chứng',
  nop_lai: 'Nộp lại',
};
