/**
 * **Mục Cần Chủ loại Review TỰ SINH của dự án không code** — SPEC mục 7 d.217,
 * 19.10 (d.548), **19.12 câu 57**, mục 8 (d.232, d.238, d.244).
 *
 * 19.12 câu 57, ba gạch, nguyên văn:
 *
 *   * "Sinh **lúc cổng được kiểm** và cổng thiếu đúng phần chủ xác nhận — đó là
 *     chỗ **duy nhất** biết được điều đó. Áp cho **mọi** đường kiểm cổng, kể cả
 *     đường tự lên Xong định kỳ (d.221), nơi không có ai gõ lệnh nào."
 *   * "**Một** mục cho mỗi ticket, không sinh trùng."
 *   * "Mục đã bị **Bỏ qua** (19.10) thì **chỉ** dựng lại khi có bằng chứng `file`
 *     hoặc `note` **mới hơn** lần bỏ qua. Nhờ vậy 'Bỏ qua' giữ được cho tới khi
 *     thật sự có việc mới để xem, chứ không mất nghĩa ở lần kiểm cổng kế tiếp."
 *
 * ## QUYẾT ĐỊNH KIẾN TRÚC: cổng KHÔNG tự ghi, nó TRẢ RA CÂU LỆNH
 *
 * Căng thẳng là thật, và nó phải được giải tường minh:
 *
 *   * `cong-bang-chung.ts` khai "cổng **chỉ đọc D1, không gọi mạng**", vì cổng
 *     chạy **bên trong Durable Object cửa ghi**, và DO **đơn luồng**: một lần treo
 *     ở đây chặn **toàn bộ hàng đợi ghi của cả workspace**.
 *   * Nhưng câu 57 đòi cổng **sinh** một mục, tức một lượt **GHI**.
 *
 * Hướng đã chọn: cổng **không** gọi `db.batch()` và **không** gọi `fetch()`; nó
 * **thu thập câu lệnh** vào bộ sinh dưới đây, và **lệnh đang chạy** đưa chúng vào
 * **cùng một `db.batch()`** với mọi thay đổi khác của nó. Đúng nếp
 * `DieuChinhTapDieuPhoi` (`lenh-trang-thai.ts`) và `cauLenhGhiNhatKy`
 * (`lenh-xu-ly-can-chu.ts`) mà hai lượt trước đã dùng.
 *
 * **Ba căn cứ, và căn cứ đầu là một luật của SPEC, không một sở thích:**
 *
 *  1. **Nguyên tử.** Một ticket bị cổng chặn vì "thiếu chủ xác nhận" mà **không
 *     có** mục xác nhận là trạng thái **không ai sửa lại được**: `chuDaXacNhan`
 *     mãi `false`, và đường sinh **duy nhất** (lần kiểm cổng) đã chạy qua rồi. Chủ
 *     không có lệnh nào tạo được mục đó bằng tay với cột `xac_nhan_ticket_id`
 *     (`TRUONG_CLIENT.tao_can_chu` không có nó — đúng ý). Cùng lý lẽ nguyên tử mà
 *     lượt 2b đã dùng cho dòng Nhật ký.
 *  2. **Không có khe hỏng giữa hai giao dịch.** Ghi mục bằng một `.run()` riêng
 *     trước khi kiểm cổng thì một lần hỏng ở giữa để lại một mục Cần Chủ mồ côi
 *     trên màn hình của chủ cho một ticket chưa đổi gì.
 *  3. **Không đốt `T-số`.** Số cấp qua `capSo` nằm **cùng batch** với dòng mục, nên
 *     lệnh hỏng thì số **không** bị tiêu. `quyet-dinh.md` đã có một dòng về đúng
 *     chuyện này; mục 8 d.232 nói `T-số` "tăng dần, **không tái dùng**", nên một
 *     số đốt là thiệt hại không lấy lại được.
 *
 * **Khảo sát mọi chỗ gọi cổng** (`grep congBangChungCua`), vì hướng trên chỉ đúng
 * nếu cổng **luôn** được gọi từ trong một lượt ghi:
 *
 *   * `workspace-gate.ts:#chayMotLenh` — mọi lệnh ghi. Có batch. ✔
 *   * `workspace-gate.ts:#ghiMotXacMinh` — đường **tự lên Xong của d.221**, nơi
 *     "không có ai gõ lệnh nào" (chữ của câu 57). Có batch. ✔ Đây là ca mà câu 57
 *     gọi tên riêng, nên nó phải chạy được — và nó chạy **bằng cùng một** cơ chế,
 *     không một đường thứ hai.
 *   * **Không** có chỗ nào khác. `congBangChungCua` **không** được gọi từ bất kỳ
 *     module `doc-*.ts` nào: đường đọc của Baton không kiểm cổng, nó đọc
 *     `ticket.trang_thai` đã lưu. Nên không có ca "cổng chạy ngoài một lượt ghi".
 *     Nếu một lượt sau thêm một chỗ gọi như thế, nó sẽ **không truyền bộ sinh** —
 *     và `congBangChungCua` nhận `bo_sinh` là tham số **tuỳ chọn**, nên cổng ở đó
 *     chỉ **đọc**, không sinh. Hành vi thiếu sót, nhưng **không** hỏng dữ liệu.
 */

import {
  hanMacDinh,
  maCanChu,
  type KetLuanReviewMuc,
  type TrangThaiCanChu,
} from '@baton/shared';
import { capSo, cauDatBoDem } from './lenh-ticket.js';
import { sqlKhongPhaiBaoCao } from './loai-bang-chung.js';

/* ------------------------------------------------------------------ *
 * 1. Mục xác nhận hiện có của một ticket
 * ------------------------------------------------------------------ */

/** Mục xác nhận tự sinh của một ticket, nếu đã có — `xac_nhan_ticket_id` của 0016. */
export interface MucXacNhanHienCo {
  id: string;
  ma_so: number;
  trang_thai: TrangThaiCanChu;
  ket_luan_review: KetLuanReviewMuc | null;
  xu_ly_luc: number | null;
  mo_lai_lan: number;
}

/**
 * **Mục xác nhận của một ticket** — tra theo cột mốc `xac_nhan_ticket_id` (0016),
 * **không** theo bảng nối `can_chu_ticket`.
 *
 * Vì sao không bảng nối: một ticket có **nhiều** mục `review` do agent tạo tay
 * (d.238 là một loại mục bình thường), nên "có mục `review` nào nối ticket này và
 * đã `resolved` không" sẽ cho **một mục review tay** — hỏi một chuyện khác hẳn —
 * **mở cổng Xong** cho ticket. Đó là một lỗ đi quanh cổng. Xem ghi chú của 0016.
 *
 * Đi index `ux_can_chu_xac_nhan_ticket` (hai cột bình đẳng), nên câu này là một
 * `SEARCH` trên một index nhỏ dù bảng `can_chu` có bao nhiêu nghìn mục.
 */
export async function mucXacNhanCua(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
): Promise<MucXacNhanHienCo | null> {
  return db
    .prepare(
      `SELECT id, ma_so, trang_thai, ket_luan_review, xu_ly_luc, mo_lai_lan
         FROM can_chu WHERE workspace_id = ? AND xac_nhan_ticket_id = ?`,
    )
    .bind(workspace_id, ticket_id)
    .first<MucXacNhanHienCo>();
}

/**
 * **Chủ đã xác nhận ticket này chưa** — d.217 ("1 `file` hoặc `note` **cộng chủ
 * xác nhận**").
 *
 * Luật thuần, không I/O: nó đọc đúng dòng mà `mucXacNhanCua` đã tra, nên nó có test
 * không cần DB.
 *
 * **Đòi `ket_luan_review = 'dat'`, không chỉ `resolved`.** Mục 8 d.261 cho loại
 * `review` **hai** nút — "**Đạt**" hoặc "**Cần sửa**" — và cả hai đều đưa mục sang
 * `Đã xử lý`. Chủ bấm "Cần sửa" là chủ nói **chưa được**, nên coi đó là "chủ xác
 * nhận" sẽ mở cổng Xong bằng đúng cái nút nói ngược lại. SPEC **không** nói rõ
 * điều này (d.217 chỉ nói "chủ xác nhận") — xem `cau-hoi-spec.md` **#78**.
 *
 * `skipped` **không** mở cổng: 19.10 nói thẳng "chủ **bỏ qua** mục xác nhận thì
 * ticket **ở lại Chờ kiểm chứng**".
 */
export function chuDaXacNhan(muc: MucXacNhanHienCo | null): boolean {
  return muc !== null && muc.trang_thai === 'resolved' && muc.ket_luan_review === 'dat';
}

/* ------------------------------------------------------------------ *
 * 2. Bộ sinh — thu câu lệnh, không tự ghi
 * ------------------------------------------------------------------ */

/** Một bằng chứng `file`/`note` **chưa rút** của ticket — nguồn của d.238. */
export interface BangChungDeXem {
  loai: 'file' | 'note';
  gui_luc: number;
  duong_dan: string | null;
  noi_dung: string | null;
}

/**
 * **Mức của mục tự sinh: 🟡 `Trong ngày`.**
 *
 * SPEC không nói mức nào (`cau-hoi-spec.md` #78). 🟡 là hướng giữa: 🔴 sẽ **bắn
 * thông báo ngay** (d.283) cho mỗi ticket của mọi dự án không code — tức biến một
 * việc thường lệ thành báo động; ⚪ thì **không có hạn mặc định** (d.241), nên mục
 * sẽ không bao giờ lên đầu khối và một ticket có thể treo vô hạn. 🟡 có hạn 20:00
 * cùng ngày (19.8) và chỉ vào tóm tắt sáng/tối (d.283).
 */
const MUC_CUA_MUC_TU_SINH = 'today' as const;

/**
 * Bộ sinh của **một lượt ghi**: cổng gọi `can()`, cửa ghi lấy `cauLenh()` rồi đưa
 * vào **cùng** `db.batch()` của lượt đó.
 */
export interface BoSinhMucXacNhan {
  /**
   * Cổng vừa kết luận "ticket này thiếu **đúng** phần chủ xác nhận" — gạch 1 của
   * câu 57. Hàm này quyết định sinh mới, dựng lại, hay không làm gì.
   */
  can(workspace_id: string, ticket_id: string, muc: MucXacNhanHienCo | null): Promise<void>;
  /** Câu lệnh đã thu, để cửa ghi đưa vào `batch()`. **Không** tự chạy. */
  cauLenh(): D1PreparedStatement[];
  /** Chủ đề đánh thức (màn hình Cần Chủ), chỉ phát **sau** khi batch thành công. */
  danhThuc(): string[];
  /** `T-số` của các mục đã sinh trong lượt này — để test và log đọc được. */
  daSinh(): { ticket_id: string; ma: string; dung_lai: boolean }[];
}

export function boSinhMucXacNhan(db: D1Database, bay_gio: number): BoSinhMucXacNhan {
  const cau_lenh: D1PreparedStatement[] = [];
  const danh_thuc: string[] = [];
  const da_sinh: { ticket_id: string; ma: string; dung_lai: boolean }[] = [];

  /*
   * **Chống sinh hai lần trong CÙNG một lượt.** Một lệnh kiểm cổng của **nhiều**
   * ticket trong một lượt là chuyện có thật: `apSuKienLenTicket` gọi `cong(c.id)`
   * cho từng ticket con (`lenh-trang-thai.ts`), và 19.11 d.559 ("con cuối cùng kết
   * thì cha tự kiểm cổng lại") còn thêm một lần nữa. Trong một lượt thì
   * `mucXacNhanCua` **không** thấy mục vừa xếp vào `cau_lenh` (nó chưa chạy), nên
   * nếu không có sổ này thì hai lần kiểm cùng ticket sinh **hai** mục — và
   * `ux_can_chu_xac_nhan_ticket` của 0016 sẽ ABORT **cả batch**, tức lệnh của người
   * dùng thất bại vì một việc phụ.
   */
  const da_xu_ly = new Set<string>();

  /*
   * **Một** câu `bo_dem` cho **cả lượt**, dù sinh mấy mục. `capSo` đọc giá trị
   * hiện tại rồi trả về câu đặt `gia_tri = <số mới>`; hai lần gọi trong cùng lượt
   * đọc **cùng** một giá trị cũ (câu thứ nhất chưa chạy), nên hai mục sẽ nhận
   * **cùng** `ma_so` và vỡ `ux_can_chu_ma_so`. Nên: gọi `capSo` **một lần**, giữ
   * số nền, rồi tự cộng.
   *
   * **Câu `bo_dem` phải DỰNG LẠI với giá trị cuối, không giữ câu của `capSo`.**
   * Đây là một lỗi **đã xảy ra thật** ở bản đầu của lượt 3b (reviewer bắt): `capSo`
   * **bind cứng** số vào câu lệnh lúc gọi, nên giữ lại câu đó là ghi bộ đếm về
   * **số đầu** trong khi các mục đã mang `N`, `N+1`, … Hậu quả **không sạch**: batch
   * **thành công**, rồi **mọi** lệnh cấp `T-số` sau đó (`baton ask`) đọc `N`, cấp
   * `N+1`, đụng `ux_can_chu_ma_so` và ABORT — **kẹt vĩnh viễn**, không đường ghi nào
   * gỡ được. `tg_bo_dem_chi_tang` **không** bắt vì đặt `N` khi đang `N-1` vẫn là
   * tăng. Nên số cuối đi qua `cauDatBoDem` (`lenh-ticket.ts`) ở `cauLenh()`.
   *
   * Đường tới ca ≥2 mục trong **một** lượt là có thật, không giả thiết:
   * `apSuKienLenTicket` gọi cổng cho ticket con, rồi `kiemLaiCongCuaCha` gọi cổng
   * cho ticket **cha** (`lenh-trang-thai.ts`) — một `baton status <con> done` là
   * **hai** lần kiểm cổng. Có ca test đi đúng đường đó.
   *
   * **Còn một ca mà bộ sinh KHÔNG tự bịt được, khai thẳng:** nếu một lượt sau có
   * một handler **vừa** cấp khoá `('workspace', 'ask')` **vừa** làm cổng được
   * kiểm, thì handler và bộ sinh đọc cùng một giá trị cũ. Khảo sát hôm nay
   * (`grep capSo` toàn `src`): `handlerTaoCanChu` và `handlerCapSoCanChu` là **hai
   * chỗ duy nhất** cấp khoá `'ask'`, và **không** chỗ nào trong hai chỗ đó kiểm
   * cổng; `handlerTaoTicket` cấp khoá **`'project'`**, một bộ đếm khác. Nếu ca đó
   * xuất hiện, hậu quả là `ux_can_chu_ma_so` (0013) ABORT **cả batch** — lệnh thất
   * bại **sạch**, không dữ liệu nửa vời và không `T-số` nào bị đốt. Hướng đóng hẳn
   * (một bộ cấp số dùng chung cho **cả lượt ghi**) không làm ở lượt này: nó đụng
   * `capSo` của mọi đường ghi, tức ngoài phạm vi.
   */
  let nen: { so_ke_tiep: number } | null = null;
  let workspace_cua_nen: string | null = null;

  async function capSoKeTiep(workspace_id: string): Promise<number> {
    if (nen === null) {
      // Chỉ lấy **số** từ `capSo`; câu lệnh của nó bị bỏ, vì nó bind số **đầu**.
      const { so } = await capSo(db, workspace_id, 'workspace', 'ask');
      nen = { so_ke_tiep: so };
      workspace_cua_nen = workspace_id;
      return so;
    }
    /*
     * Một lượt ghi **không** đi qua hai workspace: `Lenh.workspace_id` là một giá
     * trị, và cửa ghi là một DO **của một workspace**. Kiểm lại ở đây vì nếu điều
     * đó sai thì ta sẽ cấp số của workspace A cho một mục của workspace B —
     * im lặng, và `ux_can_chu_ma_so` (theo workspace) **sẽ không bắt được**.
     */
    if (workspace_cua_nen !== workspace_id) {
      throw new Error('bộ sinh mục xác nhận: một lượt ghi không đi qua hai workspace');
    }
    nen.so_ke_tiep += 1;
    return nen.so_ke_tiep;
  }

  return {
    async can(workspace_id, ticket_id, muc): Promise<void> {
      if (da_xu_ly.has(ticket_id)) return;
      da_xu_ly.add(ticket_id);

      // Gạch 2 của câu 57 — mục đang `Chờ` thì **không** sinh thêm gì cả.
      if (muc !== null && muc.trang_thai === 'open') return;

      const xem = await bangChungDeXem(db, workspace_id, ticket_id);
      /*
       * d.238: loại `review` "bắt buộc có **ít nhất 1 file hoặc link** để xem".
       * Không có bằng chứng `file`/`note` nào thì **cổng vẫn đóng ở vế thứ nhất**
       * của d.217 ("cần 1 `file` hoặc `note` **cộng** chủ xác nhận"), nên không
       * có gì để hỏi chủ — và một mục review rỗng là một mục chủ không quyết
       * được. Không sinh.
       */
      if (xem.length === 0) return;

      if (muc === null) {
        cau_lenh.push(...(await cauSinhMoi(workspace_id, ticket_id, xem)));
        return;
      }

      /*
       * Gạch 3 của câu 57: mục đã rời `Chờ` thì **chỉ** dựng lại khi có bằng chứng
       * `file`/`note` **mới hơn** lần bỏ qua. Mốc so là `xu_ly_luc` của mục (lúc
       * nó rời `Chờ`) so với `gui_luc` của bằng chứng **chưa rút**.
       *
       * `>`, không `>=`: "**mới hơn**" là chữ của SPEC. Một bằng chứng gửi đúng
       * millisecond chủ bấm Bỏ qua thì chủ đã thấy nó khi quyết.
       */
      const moc = muc.xu_ly_luc ?? 0;
      const co_moi = xem.some((b) => b.gui_luc > moc);
      if (!co_moi) return;

      /*
       * **Dựng lại áp cho cả `skipped` và `resolved`+`can_sua`.** Câu 57 chỉ nói
       * `skipped`; `resolved` + "Cần sửa" là chỗ SPEC **im lặng**
       * (`cau-hoi-spec.md` **#78**). Hướng tạm: dựng lại, cùng điều kiện. Hướng
       * ngược (không dựng lại) tạo đúng cái bẫy của #75: chủ bấm "Cần sửa", agent
       * sửa và gửi bằng chứng mới, mà **không đường nào** hỏi lại chủ ⇒ ticket
       * treo ở Chờ kiểm chứng **vĩnh viễn**, và đường duy nhất vào Xong là chủ ép
       * (d.216).
       */
      cau_lenh.push(...cauDungLai(workspace_id, muc, xem, moc));
      da_sinh.push({ ticket_id, ma: maCanChu(muc.ma_so), dung_lai: true });
      danh_thuc.push(`can_chu:${muc.id}`, 'can_chu');
    },

    cauLenh(): D1PreparedStatement[] {
      if (nen === null || workspace_cua_nen === null) return cau_lenh;
      /*
       * Bộ đếm đặt về `so_ke_tiep` — số **cuối** đã cấp trong lượt này, dựng câu
       * **tại đây** chứ không giữ câu của `capSo`. Xem khối ghi chú của `nen`:
       * giữ câu cũ là để lại một bộ đếm tụt hậu và kẹt mọi lệnh `baton ask` sau đó.
       *
       * Câu `bo_dem` đi **trước** mọi `INSERT can_chu`? Không cần: `batch()` của D1
       * là một giao dịch, và không câu nào trong lượt này đọc lại bộ đếm. Đặt nó ở
       * đầu cho dễ đọc kế hoạch khi gỡ lỗi.
       */
      return [
        ...cauDatBoDem(db, workspace_cua_nen, 'workspace', 'ask', nen.so_ke_tiep),
        ...cau_lenh,
      ];
    },

    danhThuc: () => danh_thuc,
    daSinh: () => da_sinh,
  };

  /* ---------------- dựng câu lệnh ---------------- */

  async function cauSinhMoi(
    workspace_id: string,
    ticket_id: string,
    xem: readonly BangChungDeXem[],
  ): Promise<D1PreparedStatement[]> {
    const tk = await db
      .prepare(
        `SELECT t.so AS so, t.tieu_de AS tieu_de, p.ma AS du_an_ma, t.project_id AS project_id
           FROM ticket t JOIN project p ON p.id = t.project_id AND p.workspace_id = t.workspace_id
          WHERE t.id = ? AND t.workspace_id = ?`,
      )
      .bind(ticket_id, workspace_id)
      .first<{ so: number; tieu_de: string; du_an_ma: string; project_id: string }>();
    // Người gọi cổng đã tra ticket trước đó, nên đây là ca "không thể xảy ra" —
    // và cách xử lý đúng là **không sinh gì**, không ném một 500 vào lượt ghi của
    // người dùng. Cùng nếp `co === null` của `congBangChungCua`.
    if (tk === null) return [];

    const ma_so = await capSoKeTiep(workspace_id);
    const id = crypto.randomUUID();
    const ra: D1PreparedStatement[] = [
      db
        .prepare(
          `INSERT INTO can_chu
             (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
              boi_canh, han_luc, ly_do_de_xuat, lenh, can_tty,
              trung_voi_can_chu_id, tao_luc, cap_nhat_luc, tao_boi_agent_id,
              xac_nhan_ticket_id)
           VALUES (?, ?, ?, ?, ?, ?, 'review', 'open', ?, ?, NULL, NULL, 0, NULL, ?, ?, NULL, ?)`,
        )
        .bind(
          id,
          workspace_id,
          ma_so,
          tieuDeMuc(tk.du_an_ma, tk.so, tk.tieu_de),
          tk.project_id,
          MUC_CUA_MUC_TU_SINH,
          boiCanhMuc(xem),
          // Hạn mặc định của 🟡 — 19.8, **cùng hàm** mà đường tạo tay dùng
          // (`hanMacDinh`), nên hai đường không lệch nhau một giờ nào.
          hanMacDinh(MUC_CUA_MUC_TU_SINH, bay_gio),
          bay_gio,
          bay_gio,
          ticket_id,
        ),
      // d.240 "ticket liên quan (nhiều)" — thẻ của d.250 phải hiện ticket. Cột mốc
      // `xac_nhan_ticket_id` là **vai** của mục; dòng này là **quan hệ hiển thị**.
      db
        .prepare(
          `INSERT INTO can_chu_ticket (workspace_id, can_chu_id, ticket_id, tao_luc)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(workspace_id, id, ticket_id, bay_gio),
    ];

    ra.push(...cauFile(workspace_id, id, xem));
    da_sinh.push({ ticket_id, ma: maCanChu(ma_so), dung_lai: false });
    danh_thuc.push(`can_chu:${id}`, 'can_chu');
    return ra;
  }

  /**
   * Dựng lại một mục đã kết về `Chờ` — gạch 3 của câu 57.
   *
   * Câu `UPDATE` này phải đi qua **cả mười** mệnh đề của cặp trigger
   * `tg_can_chu_xu_ly_*` (0015), nên nó dọn **đủ năm** cột của lần xử lý trước:
   * `ket_qua`, `ly_do_bo_qua`, `xu_ly_luc`, `phuong_an_da_chon_id`,
   * `ket_luan_review`. Thiếu một cột là `RAISE(ABORT)` ngay tại DB — đúng như hai
   * mệnh đề 3b/3c mà lượt 2b thêm vào để chuyện này **không** lọt.
   *
   * `mo_lai_lan = mo_lai_lan + 1` — d.246 ("mở lại được … có ghi lịch sử"), và
   * `tg_can_chu_mo_lai_chi_tang` (0015) canh nó chỉ tăng.
   *
   * ## KHÔNG ghi Nhật ký / bình luận — LỆCH CÓ CHỦ Ý so với một câu TƯỜNG MINH
   *
   * 19.9 **d.542** nguyên văn: "**Mở lại:** thêm dòng Nhật ký mới 'T-x mở lại' và
   * bình luận 'T-x mở lại'." Câu đó **không có chủ ngữ**, nên nó áp cho **mọi** lần
   * mở lại — kể cả lần này. Và chính hàm này tăng `mo_lai_lan`, tức **tự nhận** đây
   * là một lần mở lại. Nên đây **không** phải "d.542 không áp": đây là một **lệch**,
   * và nó được khai ở `cau-hoi-spec.md` **#78(d)** đúng khuôn đã dùng cho d.238 ở
   * #78(c). (Bản đầu của lượt 3b khai "d.542 nói về việc mở lại **của chủ**" —
   * reviewer grep lại và chỉ ra chữ đó **không có trong SPEC**. Đã bỏ.)
   *
   * Lý do thật của hướng này là **`nhat_ky` không có tác giả cho một dòng do hệ
   * thống sinh** — và d.542 đòi **cả hai** việc trong **một** câu:
   *   * `nhat_ky.nguoi_loai` chỉ nhận `'chu'` hoặc `'agent'` (CHECK 0014). **Không
   *     có `'system'`** — khác `ticket_history` và `comment`, nơi CHECK 0001 **có**
   *     `'system'` (đường d.221 ghi "hệ thống" bằng đúng mã đó). Nên nửa **bình
   *     luận** của d.542 viết được; nửa **Nhật ký** thì phải gán cho **chủ**, một
   *     việc chủ **không làm**.
   *   * Mục 10 **d.310** còn chốt "dòng chủ quyết chỉ sinh từ Cần Chủ hoặc do chủ
   *     tự ghi", và **d.309** làm dòng Nhật ký **không sửa, không xoá được**: một
   *     dòng nói sai người là **vĩnh viễn**.
   *
   * Vậy ba hướng, và cả ba lệch một chỗ. Chọn **không ghi gì**, vì hai hướng kia
   * lệch nặng hơn: ghi-và-gán-cho-chủ để lại một lời nói sai **không gỡ được**
   * (d.309); ghi **chỉ** bình luận là chẻ **một** câu SPEC làm đôi, tức để Nhật ký
   * và bình luận nói hai chuyện khác nhau về cùng một mục — đúng cái mà bất biến
   * "một batch, cùng thành cùng hỏng" của lượt 2b dựng ra để chặn. Hướng **không
   * ghi** là hướng **thêm vào sau được** chỉ bằng một đường ghi mới; hướng ghi đúng
   * d.542 cần phiên spec **thêm `'system'`** vào `nguoi_loai` của mục 10, tức một
   * migration.
   *
   * **Hệ quả quan sát được, khai thẳng:** mục rời `Đã xử lý` về `Chờ` và
   * `mo_lai_lan` nhích mà **không một dòng Nhật ký nào** — dấu vết duy nhất là
   * `mo_lai_lan` cộng `cap_nhat_luc` trên chính dòng mục. Có **ca test ghim** đúng
   * hành vi đó, nên chốt ngược thì ca đó **đỏ** chứ không lặng lẽ đổi nghĩa.
   *
   * `WHERE … AND xu_ly_luc IS NOT NULL`: guard chống đua. Giữa lúc cổng đọc mục và
   * lúc batch chạy, không lượt nào khác chen được (cùng một DO đơn luồng), nhưng
   * guard làm câu này **vô hại nếu chạy hai lần** — và nếu nó không khớp, `changes`
   * là 0 và không trigger nào bật.
   */
  function cauDungLai(
    workspace_id: string,
    muc: MucXacNhanHienCo,
    xem: readonly BangChungDeXem[],
    moc: number,
  ): D1PreparedStatement[] {
    const ra = [
      db
        .prepare(
          `UPDATE can_chu
              SET trang_thai = 'open', ket_qua = NULL, ly_do_bo_qua = NULL,
                  xu_ly_luc = NULL, phuong_an_da_chon_id = NULL, ket_luan_review = NULL,
                  boi_canh = ?, muc = ?, han_luc = ?,
                  mo_lai_lan = mo_lai_lan + 1, cap_nhat_luc = ?
            WHERE id = ? AND workspace_id = ? AND xu_ly_luc IS NOT NULL`,
        )
        .bind(
          boiCanhMuc(xem),
          MUC_CUA_MUC_TU_SINH,
          hanMacDinh(MUC_CUA_MUC_TU_SINH, bay_gio),
          bay_gio,
          muc.id,
          workspace_id,
        ),
    ];
    // Chỉ bằng chứng **mới hơn** lần kết trước mới thành file mới trên thẻ: đó
    // đúng là "việc mới để xem" của câu 57.
    ra.push(
      ...cauFile(
        workspace_id,
        muc.id,
        xem.filter((b) => b.gui_luc > moc),
      ),
    );
    return ra;
  }

  /**
   * Dòng `can_chu_file` cho các bằng chứng `file` — d.238, d.250 ("file có link").
   *
   * **Chỉ loại `file`.** Một bằng chứng `note` là **chữ**, không có địa chỉ nào mở
   * được (`evidence.noi_dung`), nên nó không dựng được một dòng `can_chu_file`:
   * `kiemFileReview` của `@baton/shared` chỉ nhận `file://`, `/…`, `http(s)://`.
   * Nội dung `note` đi vào **bối cảnh** của mục, nên chủ vẫn đọc được ngay trên
   * thẻ. Đây là chỗ d.238 và d.217 không khớp nhau — xem `cau-hoi-spec.md` **#78**.
   *
   * `thu_tu` lấy bằng `coalesce(max(thu_tu), 0) + 1` **trong chính câu INSERT**,
   * không bằng một số đếm trong bộ nhớ. Hai lý do, và cả hai là luật của DB:
   * `ux_can_chu_file_thu_tu` (0013) đòi `thu_tu` **duy nhất** trong một mục, và
   * đường **dựng lại** thêm file vào một mục **đã có** file từ lần sinh trước —
   * một số đếm bắt đầu từ 1 sẽ đụng ngay dòng cũ. `CHECK (thu_tu >= 1)` cũng loại
   * hẳn hướng "đánh số âm cho dòng mới". Mỗi câu trong một `batch()` của D1 chạy
   * **tuần tự trong một giao dịch**, nên câu thứ hai thấy dòng của câu thứ nhất.
   */
  function cauFile(
    workspace_id: string,
    can_chu_id: string,
    xem: readonly BangChungDeXem[],
  ): D1PreparedStatement[] {
    const file = xem.filter((b) => b.loai === 'file' && b.duong_dan !== null);
    const ra: D1PreparedStatement[] = [];
    for (let i = 0; i < file.length; i += 1) {
      ra.push(
        db
          .prepare(
            `INSERT INTO can_chu_file (id, workspace_id, can_chu_id, loai, dia_chi, thu_tu, tao_luc)
             SELECT ?, ?, ?, 'file', ?, coalesce(max(thu_tu), 0) + 1, ?
               FROM can_chu_file WHERE workspace_id = ? AND can_chu_id = ?`,
          )
          .bind(
            crypto.randomUUID(),
            workspace_id,
            can_chu_id,
            file[i]!.duong_dan,
            bay_gio,
            workspace_id,
            can_chu_id,
          ),
      );
    }
    return ra;
  }
}

/* ------------------------------------------------------------------ *
 * 3. Ticket sang Xong ⇒ mục tự sinh còn `Chờ` tự đóng — #163, BAT-40
 * ------------------------------------------------------------------ */

/** Kết quả ghi lên mục tự đóng (cột `ket_qua`, bắt buộc khi `resolved` — 0015 mệnh đề 1). */
export const KET_QUA_TICKET_DA_XONG = 'ticket đã Xong';

/**
 * **Câu lệnh tự đóng mục xác nhận** của mọi ticket vừa **sang Xong** trong lượt
 * ghi này — `cau-hoi-spec.md` #163 (Chủ chốt T-38 = A, T-43 = A), SPEC mục 8,
 * 19.12 câu 57.
 *
 * Chốt: ticket sang `done` bằng **mọi** đường ⇒ mục Cần Chủ **tự sinh cho chính
 * ticket đó** (`xac_nhan_ticket_id`, **không** bảng nối `can_chu_ticket` — kẻo
 * trúng mục tạo tay) mà còn `open` thì sang `resolved`, kết quả "ticket đã Xong",
 * `ket_luan_review` NULL (migration 0028 nới mệnh đề 7 cho đúng ca này). Mục đã
 * `skipped`/`resolved`: `WHERE trang_thai = 'open'` để nguyên.
 *
 * ## Vì sao đọc từ LỊCH SỬ, và vì sao đứng CUỐI batch
 *
 * Mọi đường đổi trạng thái ticket (đổi tay, chủ ép Xong, nộp, nghiệm thu, tự lên
 * Xong của d.221, cha tự kiểm cổng của 19.11 d.559, lan toả điều phối của 19.4)
 * đều để lại **một dòng lịch sử** `trang_thai → done` (SPEC mục 4), và mọi dòng
 * lịch sử đều đi qua **một** chỗ ghi của cửa ghi (`#cauLenhLichSu`). Nên đọc từ
 * đó là đúng "mọi đường" mà không handler nào phải nhớ gọi, và một đường mới
 * sau này cũng tự có.
 *
 * Cửa ghi đặt các câu này **cuối cùng** trong `db.batch()` — sau cả câu của bộ
 * sinh. Lý do có thật: chủ **ép Xong** vẫn kiểm cổng (`boiCanhLuatCua`), và lần
 * kiểm ấy có thể **sinh** (hoặc dựng lại) mục trong cùng batch; đóng trước khi sinh
 * là để lại đúng mục `Chờ` treo mà #163 muốn bỏ.
 *
 * Vế `EXISTS (… trang_thai = 'done')` đọc trạng thái **cuối** của ticket trong
 * chính giao dịch, nên nếu một câu sau trong lượt đưa ticket rời Xong thì không
 * đóng gì.
 *
 * **Không** ghi Nhật ký / bình luận / mở phiên: chốt #163 chỉ nói đổi trạng thái
 * mục, và mục tự sinh không có agent tạo nào để báo (`tao_boi_agent_id` NULL).
 */
export function cauDongMucXacNhanKhiXong(
  db: D1Database,
  workspace_id: string,
  lich_su: readonly { ticket_id: string; truong: string; gia_tri_moi: string | null }[],
  bay_gio: number,
): D1PreparedStatement[] {
  const ticket_xong = new Set<string>();
  for (const d of lich_su) {
    if (d.truong === 'trang_thai' && d.gia_tri_moi === 'done') ticket_xong.add(d.ticket_id);
  }
  return [...ticket_xong].map((ticket_id) =>
    db
      .prepare(
        `UPDATE can_chu
            SET trang_thai = 'resolved', ket_qua = ?, ket_luan_review = NULL,
                xu_ly_luc = ?, cap_nhat_luc = ?
          WHERE workspace_id = ? AND xac_nhan_ticket_id = ? AND trang_thai = 'open'
            AND EXISTS (SELECT 1 FROM ticket
                         WHERE id = ? AND workspace_id = ? AND trang_thai = 'done')`,
      )
      .bind(KET_QUA_TICKET_DA_XONG, bay_gio, bay_gio, workspace_id, ticket_id, ticket_id, workspace_id),
  );
}

/* ------------------------------------------------------------------ *
 * 4. Chữ của mục — một chỗ, có test
 * ------------------------------------------------------------------ */

/**
 * Tiêu đề của mục tự sinh. SPEC không cho chữ (`cau-hoi-spec.md` #78); công thức
 * chọn theo **nếp SPEC đã tự dùng** (`"T-số đã xử lý: <kết quả>"` ở d.280):
 * `<mã ticket> <việc>: <tiêu đề ticket>`.
 *
 * Cắt về trần 200 của `can_chu.tieu_de` (CHECK 0013) — một tiêu đề ticket dài
 * **sẽ** vượt trần, và lúc đó cả `batch()` của lượt ghi vỡ vì một mục phụ.
 */
export function tieuDeMuc(du_an_ma: string, so: number, tieu_de_ticket: string): string {
  const dau = `${du_an_ma}-${String(so)} xác nhận xong: `;
  const con = 200 - [...dau].length;
  const chu = [...tieu_de_ticket];
  return dau + (chu.length <= con ? tieu_de_ticket : `${chu.slice(0, con - 1).join('')}…`);
}

/**
 * Bối cảnh của mục tự sinh — markdown, đúng hình d.240 ("bối cảnh (markdown, có
 * link file:// và link ticket)").
 *
 * Mỗi bằng chứng một dòng: `file` thành một link mở được, `note` thành chữ (nó
 * **không có** địa chỉ nào — xem `cauFile`). Trần 100 000 của `can_chu.boi_canh`
 * (CHECK 0013) được tôn trọng bằng cách cắt danh sách, không bằng cách tin là nó
 * không bao giờ dài.
 */
export function boiCanhMuc(xem: readonly BangChungDeXem[]): string {
  const dong = [
    'Ticket này không có code (cờ dự án hoặc cờ ticket), nên cần **chủ xác nhận** để vào Xong ' +
      '(SPEC mục 7) — hoặc một bằng chứng `bao_cao` do người khác người làm ký (T-31).',
    '',
  ];
  for (const b of xem) {
    dong.push(
      b.loai === 'file'
        ? `- file: ${b.duong_dan ?? ''}`
        : `- ghi chú: ${(b.noi_dung ?? '').slice(0, 2000)}`,
    );
  }
  const ra = dong.join('\n');
  return ra.length <= 100_000 ? ra : ra.slice(0, 99_999);
}

/**
 * Bằng chứng `file`/`note` **chưa rút** của một ticket, cũ → mới — nguồn dữ liệu
 * của d.238 và của phép so "mới hơn lần bỏ qua" (câu 57 gạch 3).
 *
 * `rut_luc IS NULL`: một bằng chứng đã rút (d.222) **không** là việc mới để xem,
 * và nó cũng không mở được vế thứ nhất của d.217. Khác hẳn `bangChungChoCong`,
 * nơi bằng chứng đã rút **vẫn** được lấy vì luật 19.3 tính mốc trên cả chúng —
 * hai câu hỏi khác nhau, nên hai câu truy vấn khác nhau, và lý do khai ở đây.
 *
 * `ix_evidence_ticket` dẫn đầu `(workspace_id, ticket_id)` (0009), nên đây là một
 * `SEARCH`.
 */
async function bangChungDeXem(
  db: D1Database,
  workspace_id: string,
  ticket_id: string,
): Promise<BangChungDeXem[]> {
  const { results } = await db
    .prepare(
      // `bao_cao` mượn `note`/`file` trong DB (migration 0027) nhưng **không** là
      // `file`/`note` của nhánh d.217 — loại ra, cùng luật với `congXong`.
      `SELECT loai, gui_luc, duong_dan, noi_dung FROM evidence
        WHERE workspace_id = ? AND ticket_id = ? AND rut_luc IS NULL
          AND loai IN ('file', 'note') AND ${sqlKhongPhaiBaoCao()}
        ORDER BY gui_luc, id`,
    )
    .bind(workspace_id, ticket_id)
    .all<BangChungDeXem>();
  return results;
}
