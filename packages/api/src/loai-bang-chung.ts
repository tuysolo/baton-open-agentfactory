/**
 * **Chiều ĐỌC của cách "mượn mã" cho bằng chứng `bao_cao`** — migration 0027,
 * T-31 câu 3.4 A, `cau-hoi-spec.md` #161.
 *
 * Trong DB một báo cáo lưu `loai = 'note'` (có nội dung) hoặc `'file'` (chỉ đường
 * dẫn), và mang `bao_cao_nguon` khác NULL. **Mọi** câu SQL đọc `evidence.loai` để
 * trả ra ngoài hoặc đưa vào luật cổng phải đi qua `sqlLoaiBangChung` — một chỗ —
 * để không đường nào (API, web, CLI, MCP, cổng, mục xác nhận tự sinh) lộ `note`/
 * `file` cho một báo cáo, và để luật cổng không bao giờ đếm một báo cáo như
 * `file`/`note` của nhánh d.217.
 *
 * Chiều GHI là `loaiLuuTrongDb` của `@baton/shared`.
 *
 * Ngoại lệ có chủ ý: bản xuất/sao lưu (`xuat-du-lieu.ts`) giữ **cột thô**
 * (`loai` + `bao_cao_nguon`) để khôi phục chèn lại được qua CHECK của 0009 — xem
 * ghi chú ở đó.
 */

/**
 * Biểu thức SQL cho loại **đã map** của một dòng `evidence`.
 *
 * @param bi_danh bí danh bảng trong câu truy vấn (vd `e`); rỗng = không bí danh.
 */
export function sqlLoaiBangChung(bi_danh = ''): string {
  if (bi_danh !== '' && !/^[a-z_][a-z0-9_]*$/.test(bi_danh)) {
    throw new Error(`Bí danh bảng không hợp lệ: ${bi_danh}`);
  }
  const p = bi_danh === '' ? '' : `${bi_danh}.`;
  return `(CASE WHEN ${p}bao_cao_nguon IS NOT NULL THEN 'bao_cao' ELSE ${p}loai END)`;
}

/** Điều kiện SQL "dòng này KHÔNG phải báo cáo" — cho câu chỉ muốn `file`/`note` thật. */
export function sqlKhongPhaiBaoCao(bi_danh = ''): string {
  const p = bi_danh === '' ? '' : `${bi_danh}.`;
  return `${p}bao_cao_nguon IS NULL`;
}
