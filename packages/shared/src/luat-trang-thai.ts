/**
 * **Luật chuyển trạng thái ticket** — SPEC mục 4 (dòng 133–139), 19.2, 19.4, 19.11.
 *
 * Module này là **thuần**: không I/O, không `Date.now()`, không chạm DB. Vào là
 * trạng thái hiện tại + một sự kiện + bối cảnh đã tra sẵn; ra là trạng thái mới
 * (có thể kèm lỗi). Nhờ vậy **từng luật** của SPEC có test riêng mà không phải
 * dựng cả HTTP, và cửa ghi chỉ còn việc tra dữ liệu rồi ghi.
 *
 * Hai điều dễ hiểu sai, cố định ở đây:
 *
 *  1. **Có lỗi mà trạng thái vẫn đổi là chủ ý.** SPEC mục 4: vào Xong thiếu bằng
 *     chứng thì "bị từ chối với lỗi `EVIDENCE_REQUIRED`, **và** ticket được đưa
 *     sang Chờ kiểm chứng". Nên `KetQuaLuat` mang cả `trang_thai` mới lẫn `loi`.
 *     Cửa ghi ghi thay đổi rồi mới ném lỗi (xem `loi_sau_ghi` trong
 *     `api/src/lenh-khung.ts`), nếu không thì nửa luật kia không bao giờ chạy.
 *     Mục 19.2 nói rõ thêm: ticket đang nhóm `active` thì sang Chờ kiểm chứng;
 *     đang nhóm `planned` thì **giữ nguyên**.
 *
 *  2. **Cổng bằng chứng là một tham số, không phải một lời gọi.** Cổng vào đây
 *     bằng `BoiCanhLuat.cong` như một **giá trị đã tính**, nên luật trạng thái
 *     không biết gì về bảng `evidence`. Luật của chính cổng nằm ở `cong-xong.ts`
 *     (SPEC mục 7: commit `merged`, deploy đạt, review ĐẠT sau commit cuối).
 */

import type { KetQuaNop, TrangThaiTicket } from './ma-nhan.js';
import { nhomTrangThai } from './ma-nhan.js';
import type { MaLoi } from './loi.js';
import { thongDiepCuaLoi } from './loi.js';

/* ------------------------------------------------------------------ *
 * Cổng bằng chứng — SPEC mục 7 (chỗ cắm của phần 3)
 * ------------------------------------------------------------------ */

/** Kết luận của cổng bằng chứng cho một ticket — SPEC mục 7. */
export interface KetQuaCong {
  /** Đủ điều kiện vào Xong chưa. */
  du: boolean;
  /** Thiếu gì, bằng tiếng Việt — đi thẳng vào thông điệp lỗi. */
  ly_do: string;
}

/**
 * **Cổng dạng hàm chèn được.** Bản thật là `congXong` trong `cong-xong.ts` (luật)
 * + `api/src/cong-bang-chung.ts` (tra D1) — phần 3 lượt 1. `CONG_CHUA_DU` và
 * `congChuaCai` dưới đây còn lại làm **mặc định đóng** cho test và cho mọi chỗ
 * chưa nối cổng thật.
 */
export type CongBangChung = (ticket_id: string) => Promise<KetQuaCong>;

/**
 * Mặc định: **chưa đủ bằng chứng**.
 *
 * Mặc định phải là "chưa đủ", không phải "cho qua vì chưa cài": một cổng chưa
 * cài được thì phải đóng. Ngoài cổng, hai đường vào Xong còn lại là "chủ ép Xong
 * kèm lý do" (SPEC mục 7) và ticket điều phối (SPEC 19.4, không qua cổng).
 */
export const CONG_CHUA_DU: KetQuaCong = {
  du: false,
  ly_do: 'Chưa có bằng chứng commit đã merged hoặc deploy đạt (SPEC mục 7).',
};

/** Cổng mặc định của hệ thống khi chưa có phần 3. */
export const congChuaCai: CongBangChung = () => Promise.resolve(CONG_CHUA_DU);

/* ------------------------------------------------------------------ *
 * Sự kiện và bối cảnh
 * ------------------------------------------------------------------ */

/**
 * Sự kiện làm ticket có thể đổi trạng thái.
 *
 * `mo_luot_giao`, `nop`, `nghiem_thu`, `luot_huy` thuộc **lượt giao** (phần 2).
 * Luật của chúng cài đủ ở đây và có test gọi trực tiếp; phần 2 chỉ nối sự kiện
 * vào, không viết lại luật.
 */
export type SuKienTrangThai =
  /** Đổi tay (SPEC mục 4, `baton status`). */
  | {
      loai: 'doi_tay';
      dich: TrangThaiTicket;
      /** Bắt buộc khi vào Huỷ, và khi chủ ép Xong (SPEC mục 4, 7). */
      ly_do?: string | null | undefined;
      /** Ticket gốc để đánh Trùng có hợp lệ không (server tra, không tin client). */
      ticket_goc_hop_le?: boolean | undefined;
      /** Chủ ép Xong không cần bằng chứng — SPEC mục 7. */
      ep_xong?: boolean | undefined;
    }
  /** Mở một lượt giao — SPEC mục 4 dòng 134. */
  | { loai: 'mo_luot_giao' }
  /** Người nhận nộp báo cáo — SPEC 19.2. */
  | { loai: 'nop'; ket_qua: KetQuaNop }
  /** Người giao nghiệm thu — SPEC 19.2. */
  | { loai: 'nghiem_thu'; ket_qua: 'accepted' | 'returned' }
  /** Lượt bị huỷ — SPEC 19.2 (hàng cuối bảng). */
  | { loai: 'luot_huy'; con_luot_mo: boolean }
  /**
   * Kiểm cổng lại: bằng chứng mới (SPEC mục 7 "tự lên Xong"), hoặc ticket con
   * cuối cùng vừa kết (SPEC 19.11). Hai nguồn, cùng một luật.
   */
  | { loai: 'kiem_cong_lai' }
  /**
   * **Cờ "cần review lại" vừa bật** — SPEC 19.3 d.494: "Có commit hoặc deploy mới
   * sau review thì review cũ hết hiệu lực. Ticket **ở hoặc về** Chờ kiểm chứng,
   * gắn cờ 'cần review lại'."
   *
   * `ve_cho_kiem_chung` do **tầng API tính**, không tính lại ở đây: nó là kết luận
   * của `tinhCanReviewLai` (`@baton/shared/co-review-lai.ts`), cùng nếp
   * `con_luot_mo` của `luot_huy` và `ticket_goc_hop_le` của `doi_tay`. Hai bản của
   * cùng một luật sẽ lệch nhau im lặng.
   */
  | { loai: 'can_review_lai'; ve_cho_kiem_chung: boolean };

export interface BoiCanhLuat {
  /** Trạng thái hiện tại của ticket. */
  trang_thai: TrangThaiTicket;
  /** Người ra lệnh là chủ — SPEC mục 4 ("mở lại ticket đã kết chỉ chủ"). */
  la_chu: boolean;
  /**
   * Ticket điều phối (SPEC 19.4): **không qua cổng bằng chứng**. Server suy ra
   * từ liên kết loại `dieu_phoi`, không nhận từ client.
   */
  la_dieu_phoi: boolean;
  /** Số ticket con **chưa kết** — SPEC mục 4 (`CHILDREN_OPEN`), 19.11. */
  con_chua_ket: number;
  /** Kết luận cổng bằng chứng — SPEC mục 7. */
  cong: KetQuaCong;
}

export interface LoiLuat {
  ma: MaLoi;
  message: string;
}

export interface KetQuaLuat {
  /** Trạng thái sau khi áp luật; bằng trạng thái cũ nghĩa là không đổi. */
  trang_thai: TrangThaiTicket;
  /**
   * Lỗi trả cho người gọi. **Có lỗi mà `trang_thai` vẫn đổi là chủ ý** — xem
   * ghi chú đầu file (SPEC mục 4, 19.2).
   */
  loi?: LoiLuat;
  /** Thay đổi do hệ thống → lịch sử ghi người làm là "hệ thống" (SPEC mục 7). */
  he_thong?: boolean;
  /** Lý do Huỷ đã cắt khoảng trắng (SPEC mục 4). */
  ly_do_huy?: string;
  /** Nhãn hệ thống "xong không bằng chứng" (SPEC mục 7). */
  xong_khong_bang_chung?: boolean;
}

function loi(ma: MaLoi, message?: string): LoiLuat {
  return { ma, message: message ?? thongDiepCuaLoi(ma) };
}

/* ------------------------------------------------------------------ *
 * Vào Xong — SPEC mục 4 dòng 135–136, mục 7, 19.2
 * ------------------------------------------------------------------ */

/**
 * Từ chối vào Xong — SPEC 19.2: ticket đang nhóm `active` thì **sang Chờ kiểm
 * chứng**; đang nhóm `planned` thì **giữ nguyên**.
 *
 * Nhóm `closed` chỉ tới được đây khi chủ đang mở lại một ticket đã kết, và lúc
 * đó giữ nguyên cũng là đúng: không có lý gì hạ một ticket Huỷ xuống Chờ kiểm
 * chứng vì chủ bấm Xong mà thiếu bằng chứng.
 */
function tuChoiVaoXong(bc: BoiCanhLuat, ma: MaLoi, message: string): KetQuaLuat {
  const sang_verifying = nhomTrangThai(bc.trang_thai) === 'active';
  return {
    trang_thai: sang_verifying ? 'verifying' : bc.trang_thai,
    loi: loi(ma, message),
  };
}

/**
 * Cổng vào Xong. Thứ tự kiểm là một quyết định, không phải tình cờ:
 *   1. **Ticket điều phối**: không qua cổng (SPEC 19.4) — trạng thái của nó theo
 *      các ticket dự án, nên không có bằng chứng của riêng nó.
 *   2. **Ticket con chưa kết** → `CHILDREN_OPEN` (SPEC mục 4). Kiểm trước cổng
 *      bằng chứng vì nó đúng kể cả khi bằng chứng đã đủ, và 19.11 đòi cha nằm ở
 *      Chờ kiểm chứng với dòng "chờ N ticket con".
 *   3. **Chủ ép Xong kèm lý do** (SPEC mục 7) → bỏ qua cổng bằng chứng, **không**
 *      bỏ qua luật ticket con: mục 7 chỉ cho ép phần bằng chứng.
 *   4. Cổng bằng chứng.
 */
function vaoXong(bc: BoiCanhLuat, ep: boolean, ly_do_ep: string): KetQuaLuat {
  if (bc.la_dieu_phoi) return { trang_thai: 'done' };

  if (bc.con_chua_ket > 0) {
    return tuChoiVaoXong(
      bc,
      'CHILDREN_OPEN',
      `Ticket cha chưa vào Xong được: chờ ${String(bc.con_chua_ket)} ticket con.`,
    );
  }

  if (ep) {
    if (!bc.la_chu) {
      return { trang_thai: bc.trang_thai, loi: loi('FORBIDDEN', 'Chỉ chủ ép được Xong.') };
    }
    if (ly_do_ep.length === 0) {
      return {
        trang_thai: bc.trang_thai,
        loi: loi('REASON_REQUIRED', 'Ép Xong bắt buộc có lý do (SPEC mục 7).'),
      };
    }
    return { trang_thai: 'done', xong_khong_bang_chung: true };
  }

  if (!bc.cong.du) return tuChoiVaoXong(bc, 'EVIDENCE_REQUIRED', bc.cong.ly_do);

  return { trang_thai: 'done' };
}

/* ------------------------------------------------------------------ *
 * Hàm áp luật duy nhất
 * ------------------------------------------------------------------ */

/**
 * Áp một sự kiện lên trạng thái hiện tại. **Mọi** đường đổi trạng thái của ticket
 * (API, CLI, MCP, lượt giao của phần 2, cron của phần sau) phải đi qua đây.
 */
export function apDungLuat(su_kien: SuKienTrangThai, bc: BoiCanhLuat): KetQuaLuat {
  const hien = bc.trang_thai;

  switch (su_kien.loai) {
    case 'doi_tay': {
      const dich = su_kien.dich;
      const ly_do = (su_kien.ly_do ?? '').trim();

      // Đổi sang chính trạng thái đang có: không phải lỗi, cũng không ghi gì.
      if (dich === hien && su_kien.ep_xong !== true) return { trang_thai: hien };

      /*
       * **Mở lại ticket nhóm `closed` chỉ chủ làm được** — SPEC mục 4 dòng 138.
       *
       * SPEC viết "(về Cần làm)"; không nói ca rời `closed` sang trạng thái khác
       * (`in_progress`, `backlog`, hay từ Xong sang Huỷ). Chốt tạm: **mọi** lần
       * rời nhóm `closed` là "mở lại", nên chỉ chủ — xem `spec-questions.md` #18.
       * Chọn rộng hơn chữ SPEC vì hướng này là hướng an toàn: agent không bao giờ
       * sửa được kết luận của một ticket đã kết.
       */
      if (nhomTrangThai(hien) === 'closed' && !bc.la_chu) {
        return {
          trang_thai: hien,
          loi: loi('FORBIDDEN', 'Mở lại ticket đã kết chỉ chủ làm được (SPEC mục 4).'),
        };
      }

      // **Vào Huỷ phải có lý do** — SPEC mục 4 (`REASON_REQUIRED`).
      if (dich === 'canceled') {
        if (ly_do.length === 0) {
          return {
            trang_thai: hien,
            loi: loi('REASON_REQUIRED', 'Vào Huỷ bắt buộc có lý do (SPEC mục 4).'),
          };
        }
        return { trang_thai: 'canceled', ly_do_huy: ly_do };
      }

      // **Vào Trùng phải có ticket gốc hợp lệ** — SPEC mục 4
      // (`INVALID_DUPLICATE_TARGET`). "Hợp lệ" do server định nghĩa và tra; xem
      // `ticketGocHopLe` dưới đây.
      if (dich === 'duplicate') {
        if (su_kien.ticket_goc_hop_le !== true) {
          return { trang_thai: hien, loi: loi('INVALID_DUPLICATE_TARGET') };
        }
        return { trang_thai: 'duplicate' };
      }

      if (dich === 'done') return vaoXong(bc, su_kien.ep_xong === true, ly_do);

      return { trang_thai: dich };
    }

    /*
     * **Mở một lượt giao cho ticket nhóm `planned` → tự sang Đang làm** —
     * SPEC mục 4 dòng 134. Ticket đang `active` hay `closed` thì không đổi:
     * mở lượt review trên một ticket đang Chờ kiểm chứng không được kéo nó về
     * Đang làm (SPEC 19.3 cho phép lượt review song song).
     */
    case 'mo_luot_giao':
      return nhomTrangThai(hien) === 'planned' ? { trang_thai: 'in_progress' } : { trang_thai: hien };

    /* Kết quả nộp — SPEC 19.2. */
    case 'nop':
      switch (su_kien.ket_qua) {
        case 'done':
          // "Kiểm cổng: đủ thì Xong, thiếu thì Chờ kiểm chứng." Đây **không** là
          // lỗi: nộp là việc hợp lệ, cổng chưa đạt chỉ làm ticket dừng ở Chờ
          // kiểm chứng. Khác với đổi tay sang Xong (có `EVIDENCE_REQUIRED`).
          if (bc.la_dieu_phoi) return { trang_thai: 'done' };
          if (bc.con_chua_ket > 0) return { trang_thai: 'verifying' };
          return bc.cong.du ? { trang_thai: 'done' } : { trang_thai: 'verifying' };
        case 'partial':
          // "Giữ Đang làm."
          return { trang_thai: 'in_progress' };
        case 'blocked':
          // "Về Cần làm."
          return { trang_thai: 'todo' };
      }
      break;

    /* Nghiệm thu — SPEC 19.2. */
    case 'nghiem_thu':
      if (su_kien.ket_qua === 'returned') {
        // "Giữ Đang làm."
        return { trang_thai: 'in_progress' };
      }
      // `accepted`: "Ticket chưa Xong thì sang Chờ kiểm chứng, và Baton kiểm
      // cổng ngay." Nên đích là Xong nếu cổng đạt, nếu không thì Chờ kiểm chứng.
      if (hien === 'done') return { trang_thai: 'done' };
      if (bc.la_dieu_phoi) return { trang_thai: 'done' };
      if (bc.con_chua_ket > 0) return { trang_thai: 'verifying' };
      return bc.cong.du ? { trang_thai: 'done' } : { trang_thai: 'verifying' };

    /*
     * Lượt bị huỷ và không còn lượt mở nào → về Cần làm (SPEC 19.2).
     *
     * **Ticket đã kết thì giữ nguyên.** Hàng cuối bảng 19.2 nói về một ticket
     * đang chạy; nó không được phép hạ một ticket nhóm `closed`:
     *
     *   - **SPEC 19.3**: "Ticket đã Xong **không bị hạ**." Nộp `done` + cổng đủ
     *     làm ticket Xong trong khi lượt còn `submitted`; người giao `huy` lượt
     *     đó sau sẽ kéo ticket về Cần làm nếu không có nhánh này.
     *   - **SPEC mục 4 dòng 138** + chốt `spec-questions.md` #18: mọi lần rời nhóm
     *     `closed` **chỉ chủ** làm được. `huy` lượt là đường mà **agent** người
     *     giao đi được, nên nó không được là cửa sau để rời `closed`.
     */
    case 'luot_huy':
      if (nhomTrangThai(hien) === 'closed') return { trang_thai: hien };
      return su_kien.con_luot_mo ? { trang_thai: hien } : { trang_thai: 'todo' };

    /*
     * Kiểm cổng lại — SPEC mục 7 ("tự lên Xong") + 19.2 + 19.11.
     *
     * **Chỉ áp cho ticket ở Chờ kiểm chứng** (SPEC 19.2 nói thẳng): commit được
     * merge khi ticket còn Đang làm thì *chưa có gì xảy ra*; cổng được kiểm lúc
     * nộp. Và lịch sử ghi người làm là "hệ thống" (SPEC mục 7).
     */
    case 'kiem_cong_lai':
      if (hien !== 'verifying') return { trang_thai: hien };
      if (bc.con_chua_ket > 0) return { trang_thai: hien };
      if (bc.la_dieu_phoi) return { trang_thai: 'done', he_thong: true };
      return bc.cong.du ? { trang_thai: 'done', he_thong: true } : { trang_thai: hien };

    /*
     * Cờ "cần review lại" vừa bật → ticket **ở hoặc về** Chờ kiểm chứng (19.3
     * d.494). Thay đổi do **hệ thống** (không ai gõ nó), nên lịch sử ghi người làm
     * là "hệ thống" — cùng nếp `kiem_cong_lai`.
     *
     * Nhánh `closed` ở đây là **phòng thủ tầng hai, hướng đóng**, cho đúng d.495
     * ("Ticket đã Xong **không bị hạ**") và d.222: `ve_cho_kiem_chung` tới từ tầng
     * API, nên nếu một lượt sau nối sai thì luật trạng thái vẫn **không** hạ một
     * ticket đã kết. Lớp thứ nhất là `tinhCanReviewLai`, đã trả `TAT` cho nhóm
     * `closed`; cả hai lớp đều có test.
     */
    case 'can_review_lai':
      if (nhomTrangThai(hien) === 'closed') return { trang_thai: hien };
      /*
       * **Ticket điều phối giữ nguyên** — 19.4 d.502: "Ticket điều phối **không qua
       * cổng bằng chứng**. Trạng thái của nó **tự theo** các ticket dự án." Nên không
       * sự kiện nào được đặt trạng thái cho nó trực tiếp, kể cả sự kiện này.
       *
       * Cùng lớp chặn, cùng chỗ, cùng lý do với `kiem_cong_lai` ở trên — **không** một
       * nếp thứ hai. Reviewer dựng được đường thật: gửi một `commit` lên một ticket
       * điều phối đang Đang làm đã có review ⇒ cờ bật **và** ticket bị kéo sang Chờ
       * kiểm chứng, trái 19.4; lượt lan toả sau mới sửa lại, tức có một cửa sổ mà
       * trạng thái ticket điều phối không theo các ticket dự án.
       *
       * **Cờ vẫn bật được** cho ticket điều phối (nó gửi bằng chứng được, 19.4 chỉ
       * nói nó không qua cổng) — chỉ trạng thái là không bị kéo.
       */
      if (bc.la_dieu_phoi) return { trang_thai: hien };
      return su_kien.ve_cho_kiem_chung
        ? { trang_thai: 'verifying', he_thong: true }
        : { trang_thai: hien };
  }

  // Không tới được: `switch` trên đã phủ hết nhánh của union.
  return { trang_thai: hien };
}

/* ------------------------------------------------------------------ *
 * Ticket gốc để đánh Trùng — SPEC mục 4 (`INVALID_DUPLICATE_TARGET`)
 * ------------------------------------------------------------------ */

/**
 * "Ticket gốc **hợp lệ**" — SPEC mục 4 nêu mã lỗi nhưng **không định nghĩa hợp
 * lệ** (`spec-questions.md` #19). Chốt tạm, kiểm ở đây để một chỗ duy nhất quyết:
 *
 *   1. Tồn tại và chưa xoá mềm.
 *   2. **Cùng workspace** (dữ liệu tách theo workspace từ đầu — SPEC mục 1).
 *      Khác dự án thì **được**: liên kết ticket "được khác dự án" (SPEC mục 4).
 *   3. Không phải chính nó.
 *   4. **Không tạo chuỗi trùng vòng**: ticket gốc không được (trực tiếp hay qua
 *      chuỗi `trung_voi`) trỏ về chính ticket đang đánh trùng. Không có luật này
 *      thì A trùng B và B trùng A, và mọi chỗ "đi theo ticket gốc" sẽ lặp vô tận.
 */
export interface DongTrungVoi {
  id: string;
  trung_voi_ticket_id: string | null;
}

export function ticketGocHopLe(
  ticket_id: string,
  goc: DongTrungVoi | null,
  /** Tra `trung_voi_ticket_id` của một ticket trong cùng workspace. */
  chuoi: ReadonlyMap<string, string | null>,
): boolean {
  if (goc === null) return false;
  if (goc.id === ticket_id) return false;

  // Đi theo chuỗi `trung_voi` từ ticket gốc; gặp lại chính mình là vòng.
  let hien: string | null = goc.trung_voi_ticket_id;
  const da_qua = new Set<string>([goc.id]);
  while (hien !== null) {
    if (hien === ticket_id) return false;
    if (da_qua.has(hien)) break; // vòng sẵn có trong dữ liệu; không phải lỗi của lệnh này
    da_qua.add(hien);
    hien = chuoi.get(hien) ?? null;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Ticket điều phối tự theo ticket dự án — SPEC 19.4 + 19.11
 * ------------------------------------------------------------------ */

/** Lý do Huỷ khi mọi ticket dự án đã huỷ — đúng chữ SPEC 19.4. */
export const LY_DO_HUY_DIEU_PHOI = 'mọi ticket dự án đã huỷ';

export type TheoDieuPhoi =
  | { doi: true; trang_thai: TrangThaiTicket; ly_do_huy?: string }
  /** SPEC 19.11: chưa có ticket dự án nào `active` và chưa phải tất cả đã kết. */
  | { doi: false };

/**
 * Trạng thái mà một **ticket điều phối** phải mang, theo các ticket dự án nối
 * bằng liên kết loại `dieu_phoi` — SPEC 19.4, 19.11.
 *
 * Không có ticket dự án nào thì không đổi: một ticket điều phối vừa tạo, chưa
 * nối gì, không được tự nhảy trạng thái.
 */
export function trangThaiDieuPhoiTheo(ds: readonly TrangThaiTicket[]): TheoDieuPhoi {
  if (ds.length === 0) return { doi: false };

  if (ds.some((t) => nhomTrangThai(t) === 'active')) return { doi: true, trang_thai: 'in_progress' };

  const tat_ca_da_ket = ds.every((t) => nhomTrangThai(t) === 'closed');
  if (!tat_ca_da_ket) return { doi: false };

  if (ds.some((t) => t === 'done')) return { doi: true, trang_thai: 'done' };

  // Tất cả đã kết, không có cái nào Xong → đều là Huỷ hoặc Trùng.
  return { doi: true, trang_thai: 'canceled', ly_do_huy: LY_DO_HUY_DIEU_PHOI };
}

/* ------------------------------------------------------------------ *
 * Cờ "Đang làm mà không ai cầm" — SPEC mục 4 dòng 139 + 19.1
 * ------------------------------------------------------------------ */

/** 24 giờ — SPEC mục 4 dòng 139, 19.1. */
export const NGUONG_KHONG_AI_CAM_MS = 24 * 60 * 60 * 1000;

/**
 * Cờ **"Đang làm mà không ai cầm"**.
 *
 * SPEC mục 4 dòng 139 viết "ở Đang làm quá 24 giờ mà không có lượt giao mở và
 * không phải chủ tự làm"; SPEC **19.1** nói chính xác hơn: cờ bật khi ticket ở
 * **nhóm `active`**, **người đang cầm trống**, và tình trạng đó **kéo dài 24
 * giờ**. Mục 19.x ưu tiên hơn (SPEC dòng 464), nên cài theo 19.1 — khác biệt
 * thật: ticket ở Chờ kiểm chứng không ai cầm cũng phải bật cờ.
 *
 * Nhận `bay_gio` qua tham số, **không** gọi `Date.now()`: hàm luật phải test
 * được với thời gian tiêm vào. Việc nền quét cờ là Cron của phần sau; nó chỉ gọi
 * hàm này.
 */
export function tinhCoKhongAiCam(
  t: {
    trang_thai: TrangThaiTicket;
    /** Có người đang cầm (`nguoiDangCam` trả khác `null`). */
    co_nguoi_cam: boolean;
    /** Lúc tình trạng "active + không ai cầm" bắt đầu; `null` = không ở tình trạng đó. */
    trong_tay_tu_luc: number | null;
  },
  bay_gio: number,
): boolean {
  if (nhomTrangThai(t.trang_thai) !== 'active') return false;
  if (t.co_nguoi_cam) return false;
  if (t.trong_tay_tu_luc === null) return false;
  return bay_gio - t.trong_tay_tu_luc >= NGUONG_KHONG_AI_CAM_MS;
}
