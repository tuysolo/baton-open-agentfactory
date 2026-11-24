/**
 * **Tách mã lỗi nghiệp vụ ra khỏi lỗi D1.**
 *
 * Vì sao cần: migration 0001 và 0002 cố tình viết các trigger dạng
 * `RAISE(ABORT, '<MÃ LỖI>: <mô tả>')`, kèm ghi chú "để tầng trên tách được mã
 * lỗi ra khỏi thông điệp SQLite" — **mà trước lượt này không tầng nào làm việc
 * tách đó**. `workspace-gate.ts` rethrow mọi lỗi không phải `BatonError`, và
 * `goiLenh` biến nó thành `INTERNAL`/500. Hệ quả: nối ticket xuyên workspace, vỡ
 * `ux_ticket_so`, vi phạm trigger "lịch sử chỉ thêm"… đều ra **500** thay vì
 * 403/409/422 như SPEC mục 13 đòi.
 *
 * Luật của module này:
 *
 *  1. **Thông điệp `MÃ: …` của trigger thắng.** Đó là mã do chính Baton đặt, nên
 *     chính xác hơn mọi phỏng đoán từ chữ của SQLite.
 *  2. **Ràng buộc chuẩn của SQLite** (`UNIQUE`, `FOREIGN KEY`, `CHECK`,
 *     `NOT NULL`) → `INVALID_INPUT`/422. Chúng đều nghĩa là "dữ liệu không thoả
 *     một luật của schema", tức lỗi nghiệp vụ client sửa được bằng cách đổi dữ
 *     liệu (CLI thoát mã 1). Mã trùng dự án đã đi đúng đường này ở tầng handler
 *     (`LOI_MA_DU_AN_TRUNG` → `INVALID_INPUT`), nên giữ cùng một lớp.
 *  3. **Không nhận ra thì trả `null`** → tầng trên giữ `INTERNAL`/500. Không
 *     đoán: một lỗi lạ hoá thành 422 làm agent tưởng dữ liệu mình sai và sửa mãi,
 *     trong khi đúng ra phải thử lại hoặc báo người (SPEC mục 13, mã thoát 2).
 *  4. **Không bao giờ đưa chữ gốc của SQLite ra thân response** (SPEC mục 15):
 *     thông điệp trả về là thông điệp tiếng Việt của Baton, phần mô tả sau dấu
 *     hai chấm trong trigger chỉ dùng cho log.
 */

import { BatonError, laMaLoi, type MaLoi } from '@baton/shared';

/**
 * Mã lỗi Baton nằm ở đầu một đoạn của thông điệp: `INVALID_INPUT: …`.
 *
 * D1 bọc thêm chữ của nó (`D1_ERROR: …`, `SQLITE_CONSTRAINT_TRIGGER`), nên quét
 * **mọi** cụm chữ in hoa đứng trước dấu hai chấm rồi lấy cụm đầu tiên là mã lỗi
 * thật của Baton. Cụm không có trong `BANG_LOI` (như `D1_ERROR`) bị bỏ qua.
 */
const MAU_MA_LOI = /\b([A-Z][A-Z_]{2,})\s*:/g;

/** Ràng buộc chuẩn của SQLite → thông điệp tiếng Việt của Baton. */
const RANG_BUOC_CHUAN: readonly { mau: RegExp; ma: MaLoi; message: string }[] = [
  {
    mau: /UNIQUE constraint failed/i,
    ma: 'INVALID_INPUT',
    message: 'Giá trị này đã có, không trùng được.',
  },
  {
    mau: /FOREIGN KEY constraint failed/i,
    ma: 'INVALID_INPUT',
    message: 'Dữ liệu trỏ tới một đối tượng không tồn tại.',
  },
  {
    mau: /CHECK constraint failed/i,
    ma: 'INVALID_INPUT',
    message: 'Dữ liệu không thoả một ràng buộc của Baton.',
  },
  {
    mau: /NOT NULL constraint failed/i,
    ma: 'INVALID_INPUT',
    message: 'Thiếu một trường bắt buộc.',
  },
];

/** Lấy chuỗi thông điệp của một lỗi bất kỳ, kể cả `cause` lồng của D1. */
function thongDiepCua(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e === null || typeof e !== 'object') return '';
  const loi = e as { message?: unknown; cause?: unknown };
  const chinh = typeof loi.message === 'string' ? loi.message : '';
  // D1 đôi khi để lỗi SQLite thật trong `cause`.
  const nguyen_nhan = loi.cause === undefined ? '' : thongDiepCua(loi.cause);
  return nguyen_nhan.length > 0 ? `${chinh} | ${nguyen_nhan}` : chinh;
}

/**
 * Lỗi từ D1 → `BatonError` đúng mã, hoặc `null` nếu không nhận ra.
 *
 * `BatonError` đi vào thì trả lại chính nó: gọi hàm này ở chỗ bắt lỗi chung là
 * an toàn, không cần kiểm trước.
 */
export function batonErrorTuLoiD1(e: unknown): BatonError | null {
  if (BatonError.la(e)) return e;

  const chu = thongDiepCua(e);
  if (chu.length === 0) return null;

  // 1. Mã do trigger của Baton đặt.
  for (const khop of chu.matchAll(MAU_MA_LOI)) {
    const ma = khop[1];
    if (ma !== undefined && laMaLoi(ma)) {
      // Thông điệp mặc định tiếng Việt của mã; phần mô tả thô của SQLite chỉ để log.
      return new BatonError(ma, { chiTiet: { loi_d1: chu } });
    }
  }

  // 2. Ràng buộc chuẩn của SQLite.
  for (const r of RANG_BUOC_CHUAN) {
    if (r.mau.test(chu)) {
      return new BatonError(r.ma, { message: r.message, chiTiet: { loi_d1: chu } });
    }
  }

  // 3. Không nhận ra — để tầng trên trả `INTERNAL`/500.
  return null;
}
