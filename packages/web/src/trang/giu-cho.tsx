/**
 * **Trang giữ chỗ** — bộ xương của lượt này.
 *
 * Lượt 2 của phần 6 cố ý chỉ dựng **vỏ**: đăng nhập, sidebar, định tuyến. Mỗi
 * trang của SPEC mục 14 vì thế có một đường URL thật và một trang nói **thẳng**
 * rằng nội dung làm ở lượt sau, kèm mục SPEC mà nó sẽ phải cài.
 *
 * Nói thẳng, không để trống: một trang trắng trông như một lỗi tải, và lượt sau
 * sẽ phải đoán trang này đáng ra có gì. Dòng `muc` là chỗ ghi điều đó.
 */

import { LOP_CAU_CHO, LOP_TIEU_DE_TRANG, LOP_VUNG_TRANG } from '../vo/lop-nut';

export interface TrangGiuChoProps {
  /** Tiêu đề trang — **cùng chữ** với nhãn sidebar khi trang có mục sidebar. */
  ten: string;
  /** Mục SPEC mà nội dung thật phải theo, ví dụ `'SPEC mục 11 d.315–320'`. */
  muc: string;
  /** Dòng phụ: ngữ cảnh của đường (mã ticket, mã dự án…). */
  phu?: string;
}

export const CAU_GIU_CHO = 'Nội dung trang này làm ở lượt sau.';

export function TrangGiuCho({ ten, muc, phu }: TrangGiuChoProps): React.JSX.Element {
  return (
    <section className={LOP_VUNG_TRANG}>
      <div className="flex flex-col gap-2">
        <h1 className={LOP_TIEU_DE_TRANG}>{ten}</h1>
        {phu === undefined ? null : <p className="text-sm text-chu">{phu}</p>}
        <p data-giu-cho="co" className={LOP_CAU_CHO}>
          {CAU_GIU_CHO} ({muc})
        </p>
      </div>
    </section>
  );
}
