/**
 * **Chấm sức sống** của một dự án — SPEC mục 2 d.71–74, hiện ở sidebar (d.393)
 * và Tổng quan.
 *
 * 🟢 có ticket Đang làm và phiên chạy / nhịp tim trong ngưỡng · 🟡 có ticket Đang
 * làm nhưng phiên đứng hoặc lỗi · ⚪ không có ticket Đang làm nào ("Dự án không
 * chạy").
 *
 * **Lượt này KHÔNG tính sức sống, và không giả vờ tính.** Phép tính đó cần trạng
 * thái phiên và nhịp tim của mọi ticket Đang làm — đúng việc của trang Tổng quan,
 * lượt sau — và chưa có đường API nào trả nó (`GET /v1/du-an` trả `trang_thai`,
 * không trả sức sống). Nên khi `suc_song` là `undefined`, chấm được vẽ ở trạng
 * thái **"chưa tính"**: một vòng tròn rỗng, nhãn nói thẳng điều đó. Vẽ ⚪ thay thế
 * sẽ là nói với chủ "dự án không chạy" khi chưa ai hỏi câu đó.
 */

export type SucSong = 'xanh' | 'vang' | 'trang';

/**
 * **d.74 chốt đúng câu này** cho ⚪, và Tổng quan phải *hiện* nó thành chữ nhìn
 * thấy được (d.317: "Dự án ⚪ hiện *Dự án không chạy*"), không chỉ làm nhãn trợ
 * năng. Khai thành hằng để hai chỗ dùng **một** chuỗi; ca test cắt chuỗi mong đợi
 * ra từ `SPEC.md`, không gõ lại.
 *
 * **Vẫn gõ lại ở đây, không nhập từ `@baton/shared`** (nơi phần 7 đã khai
 * `NHAN_SUC_SONG` cho handoff tối d.332): đó là kỷ luật đã chốt của `api.ts` —
 * giao diện chạy trong trình duyệt và không kéo `shared` vào bundle. Ba chuỗi khớp
 * từng chữ, và ca test của trang Tổng quan cắt chuỗi mong đợi ra từ `SPEC.md` nên
 * một bản lệch là một ca đỏ.
 */
export const CAU_DU_AN_KHONG_CHAY = 'Dự án không chạy';

const NHAN: Record<SucSong, string> = {
  xanh: 'Đang chạy',
  vang: 'Phiên đứng hoặc lỗi',
  trang: CAU_DU_AN_KHONG_CHAY,
};

const MAU: Record<SucSong, string> = {
  /*
   * Cả hai màu là token, không mã màu cứng (lưới "không mã màu" của
   * `test/vo-linear.test.tsx`): `bg-tot` (sáng: xanh đậm · tối: xanh nhạt) và
   * `bg-canh` — 🟡 là "phiên đứng hoặc lỗi", tức một **cảnh báo**, nên token
   * cảnh báo đúng nghĩa hơn `tt-dang-lam` (màu của trạng thái ticket, không của
   * sức sống dự án). BAT-61 thay `amber-400` cũ.
   */
  xanh: 'bg-tot',
  vang: 'bg-canh',
  trang: 'bg-neutral-300',
};

export const NHAN_CHUA_TINH = 'Chưa tính sức sống';

export function ChamSucSong({
  suc_song,
}: {
  suc_song?: SucSong | undefined;
}): React.JSX.Element {
  const nhan = suc_song === undefined ? NHAN_CHUA_TINH : NHAN[suc_song];
  const mau =
    suc_song === undefined ? 'border border-neutral-400 bg-transparent' : MAU[suc_song];
  return (
    <span
      role="img"
      aria-label={nhan}
      title={nhan}
      data-suc-song={suc_song ?? 'chua-tinh'}
      className={`inline-block size-2.5 shrink-0 rounded-full ${mau}`}
    />
  );
}
