/**
 * Lệnh ghi về **mục Cần Chủ** — SPEC mục 8 (d.226–291), 19.8, 19.12 câu 4, 18.
 *
 * Lượt này **chỉ đường TẠO**. Luật được cài ở đây:
 *   * `T-số` **tăng dần toàn workspace, không tái dùng** (mục 8) — cấp số và chèn
 *     mục nằm trong **cùng một batch** của cửa ghi, đúng như `handlerTaoTicket`.
 *   * **Quyền tạo**: agent `coordinator`/`manager` và **chủ** (mục 8 d.229), đi
 *     qua ô **"Tạo mục Cần Chủ"** của bảng quyền (mục 3; 19.12 câu 18 chốt rằng
 *     cấp `T-số` cũng đi qua đúng ô đó). `worker`/`reviewer` → `FORBIDDEN`.
 *     Mục **Chung** cũng chỉ đi qua đúng ô đó (hướng **MỞ** — d.229 cho `manager`
 *     tạo, 19.12 câu 4 cho mục không dự án; xem `cau-hoi-spec.md` #69).
 *   * **Dự án rỗng = "Chung"** (19.12 câu 4) — không có dòng `project` nào tên
 *     "Chung".
 *   * Trường bắt buộc **theo loại** (mục 8 d.236–239) → `OPTIONS_REQUIRED`,
 *     `COMMAND_REQUIRED`, và `INVALID_INPUT` cho `review` thiếu file/link.
 *   * **`fyi` tối đa 🟡** (19.8): tự hạ 🔴 → 🟡 **và báo lại cho agent** trong kết
 *     quả trả về.
 *   * **Hạn mặc định** 19.8 (🔴 +4 giờ; 🟡 20:00 cùng ngày hoặc hôm sau theo mốc
 *     18:00 giờ địa phương; ⚪ không hạn). Hạn do agent gửi thì **tôn trọng**.
 *   * Cờ **"có thể trùng T-x"** (mục 8, phần Lỗi): **vẫn tạo**, gắn cờ trỏ mục kia.
 *   * **Ticket liên quan** nhiều (mục 8 d.240) → bảng nối `can_chu_ticket`.
 *   * **Phiên liên quan** (mục 8 d.240) → `phien.can_chu_id`, và phiên sang
 *     `waiting_owner`. Đây là nửa **VÀO** của cặp vào–ra; nửa **RA** (19.6
 *     d.516: mục được xử lý hoặc bỏ qua → phiên về `running`, ngưỡng đứng tính
 *     lại từ lúc đó) ở `lenh-xu-ly-can-chu.ts`. Hai nửa **cùng một lượt**, vì
 *     `CHECK (trang_thai <> 'waiting_owner' OR can_chu_id IS NOT NULL)` của
 *     0006 làm một phiên vào đó mà không có đường ra thì không gỡ được bằng tay.
 *
 * Mọi luật **thuần** (không cần DB) sống ở `@baton/shared` → `can-chu.ts`, nên
 * CLI của phần 5 và web của phần 6 đọc cùng một bản.
 *
 *   * **Thông báo 🔴 mới** (mục 8 d.283, mục 12 d.341) — **phần 7 lượt 1**: một
 *     dòng `thong_bao` loại `can_chu_do`, `uu_tien = 'khan'`, ghi **trong cùng
 *     batch** với lệnh tạo mục (bước 9 dưới đây). Nửa kia của d.283 ("🔴 chưa xử
 *     lý sau 2 giờ thì nhắc 1 lần") là một Cron — `cron-thong-bao.ts`.
 *
 * **Chưa làm ở lượt này, có chủ ý:**
 *   * `resolved_asks` của mục 13 (d.268) và `baton result T-x --wait` (d.267) —
 *     lượt 2c. Đường **xử lý** (19.9) đã có, ở `lenh-xu-ly-can-chu.ts`.
 */

import {
  CUA_SO_TRUNG_MS,
  batBuocQuyen,
  haMucNeuCan,
  hanMacDinh,
  kiemChuTuyChon,
  kiemHanLuc,
  kiemLoaiCanChu,
  kiemMucCanChu,
  kiemNoiDungCanChu,
  kiemTieuDeCanChu,
  maCanChu,
  mucCoTheTrung,
  vaoDuocDuAn,
  BatonError,
  type AiGoi,
  type MucChoDeSoTrung,
} from '@baton/shared';
import {
  batBuocKhongLuuTru,
  duAnBatBuoc,
  type BoiCanhLenh,
  type KetQuaHandler,
  type LenhChung,
} from './lenh-khung.js';
import { capSo, ticketBatBuoc } from './lenh-ticket.js';
import { phienTheoId } from './doc-phien.js';
import { LOAI_TIN_CAN_CHU_DO, tinCanChuDoMoi } from './thong-bao.js';

/* ------------------------------------------------------------------ *
 * Tạo mục Cần Chủ — SPEC mục 8
 * ------------------------------------------------------------------ */

export interface LenhTaoCanChu extends LenhChung {
  loai: 'tao_can_chu';
  tieu_de: string;
  /** Mức: `urgent` · `today` · `later` (mục 8 d.234). */
  muc: string;
  /** Loại: `decision` · `run_command` · `review` · `fyi` (mục 8 d.235). */
  loai_can_chu: string;
  /**
   * Dự án. **Để trống là "Chung"** — 19.12 câu 4 ("`baton ask` không truyền dự án
   * → mục là Chung"). Không có mã đặc biệt nào cho Chung.
   */
  project_id?: string | null;
  /** Bối cảnh markdown (mục 8 d.240). */
  boi_canh?: string | null;
  /** Hạn do agent đặt; để trống thì server điền mặc định 19.8. */
  han_luc?: number | null;
  /** Ticket liên quan — **nhiều** (mục 8 d.240). */
  ticket_lien_quan?: unknown;
  /**
   * **Phiên liên quan** — mục 8 d.240: "phiên liên quan (nếu có, phiên sang
   * `waiting_owner`)". **Một** phiên, không nhiều: SPEC viết số ít ở cả d.240 và
   * 19.6 ("**phiên** về `running`"), và cột `phien.can_chu_id` của 0006 là một
   * khoá đơn.
   */
  phien_lien_quan?: string | null;

  /* Trường theo loại — `kiemNoiDungCanChu` của `@baton/shared` kiểm. */
  /** `decision`: 2–5 phương án (mục 8 d.236). */
  phuong_an?: unknown;
  /** `decision`: lý do của phương án đề xuất. */
  ly_do_de_xuat?: unknown;
  /**
   * Lệnh hoặc script — **bắt buộc** với `run_command` (d.237), **tuỳ chọn** với
   * ba loại kia (d.250 "lệnh có nút Copy", viết chung cho mọi thẻ;
   * `cau-hoi-spec.md` #130).
   */
  lenh_chay?: unknown;
  /** Cờ cần TTY của chính lệnh trên — d.237 ("chạy ở terminal thật"). */
  can_tty?: unknown;
  /** `review`: ít nhất 1 file hoặc link (mục 8 d.238). */
  file_hoac_link?: unknown;
  /*
   * KHÔNG có trường nào cho `ma_so`, `trang_thai`, hay
   * `trung_voi_can_chu_id`: cả ba là **kết luận của server**. Client khai được
   * `ma_so` thì ghi trùng `T-số`; khai được `trang_thai` thì tự tạo một mục đã
   * `resolved`, tức tự quyết một mục Cần Chủ — đúng hàng "không bao giờ" của
   * bảng quyền mục 3.
   */
}

export interface KetQuaTaoCanChu {
  id: string;
  /** `T-số` dạng chữ (mục 8, mục 13 `baton result T-x`). */
  ma: string;
  ma_so: number;
  tieu_de: string;
  /** `null` = **Chung** — 19.12 câu 4. */
  project_id: string | null;
  /** Mức **thật sự** được ghi (có thể đã bị hạ — xem `muc_da_ha`). */
  muc: string;
  loai_can_chu: string;
  trang_thai: string;
  han_luc: number | null;
  /** Hạn này do server điền theo 19.8, không do agent gửi? */
  han_mac_dinh: boolean;
  /**
   * **19.8: "server tự hạ về 🟡 và báo lại cho agent trong kết quả trả về".**
   * Hai trường này là chính cái "báo lại" đó — không phải một dòng log.
   */
  muc_da_ha: boolean;
  ghi_chu_muc: string | null;
  /** Cờ "có thể trùng T-x" (mục 8, phần Lỗi); `null` = không trùng gì. */
  co_the_trung_ma: string | null;
  co_the_trung_can_chu_id: string | null;
  /** Số ticket liên quan đã nối. */
  so_ticket_lien_quan: number;
  /** Phiên đã nối; `null` = không nối phiên nào (mục 8 d.240 "nếu có"). */
  phien_lien_quan: string | null;
  /**
   * Trạng thái **sẽ có** của phiên đó sau lệnh này. `waiting_owner` là đường
   * thường; một phiên đã `closed` hay đang `stopping` **giữ nguyên** — xem
   * `cauLenhPhienChoMuc`.
   */
  phien_trang_thai: string | null;
}

export async function handlerTaoCanChu(
  lenh: LenhTaoCanChu,
  { db, bay_gio }: BoiCanhLenh,
): Promise<KetQuaHandler<KetQuaTaoCanChu>> {
  /*
   * 1. **Kiểm nhập trước khi làm gì khác** (luật chung của mọi handler ghi, xem
   *    `lenh-khung.ts`). Một `loai` lạ hay một tiêu đề `"   "` phải ra
   *    `INVALID_INPUT` dù dự án có tồn tại hay không — tra dự án trước thì lỗi
   *    nhập bị `NOT_FOUND` che mất.
   */
  const tieu_de = kiemTieuDeCanChu(lenh.tieu_de);
  const loai_can_chu = kiemLoaiCanChu(lenh.loai_can_chu);
  const muc_gui = kiemMucCanChu(lenh.muc);
  const boi_canh = kiemChuTuyChon(lenh.boi_canh, 'Bối cảnh mục Cần Chủ', 100_000);

  // Trường bắt buộc theo loại — `OPTIONS_REQUIRED` / `COMMAND_REQUIRED` / 422.
  const noi_dung = kiemNoiDungCanChu(loai_can_chu, {
    phuong_an: lenh.phuong_an,
    ly_do_de_xuat: lenh.ly_do_de_xuat,
    lenh: lenh.lenh_chay,
    can_tty: lenh.can_tty,
    file_hoac_link: lenh.file_hoac_link,
  });

  // 2. **19.8: `fyi` tối đa 🟡.** Hạ ở đây, báo lại trong `ket_qua` ở cuối.
  const ha = haMucNeuCan(loai_can_chu, muc_gui);
  const muc = ha.muc;

  /*
   * 3. **Quyền, TRƯỚC khi tra dự án** — 19.12 câu 15 ("Quyền phải kiểm trước khi
   *    tra đối tượng … với agent ngoài phạm vi, **cả hai ca phải ra phản hồi
   *    giống hệt nhau**"), và đường GHI trả **`FORBIDDEN`/403**, không 404.
   *
   *    Ô của bảng quyền là **"Tạo mục Cần Chủ"** (`create_ask`) — chính ô mà
   *    19.12 câu 18 chốt cho việc cấp `T-số`. `worker` và `reviewer` có ô `—` nên
   *    bị từ chối ở bước 4 của `quyen()`.
   *
   *    Có `project_id` thì truyền vào bối cảnh ⇒ **cửa dự án** của `quyen()` áp:
   *    agent ngoài phạm vi dự án nhận 403 dù dự án có thật hay không.
   */
  const project_id =
    lenh.project_id === undefined || lenh.project_id === null || lenh.project_id === ''
      ? null
      : lenh.project_id;

  /*
   *    Mục **Chung** không truyền `project_id` ⇒ cửa dự án của `quyen()` không có
   *    gì để kiểm, nên ô `create_ask` là **luật duy nhất** áp cho nó. Đó là
   *    **hướng MỞ**, và nó là hướng đúng theo chữ SPEC: d.229 nói mục Cần Chủ do
   *    agent `coordinator` **hoặc `manager`** tạo, còn 19.12 câu 4 nói `baton ask`
   *    **không truyền dự án** thì mục là Chung — ghép hai câu lại, "`manager` gửi
   *    `baton ask` không dự án" là một đường **SPEC cho phép tường minh**, nên
   *    chặn nó là siết **vượt** chữ SPEC. Nếp "chưa chốt thì ĐÓNG" của dự án này
   *    dùng cho chỗ SPEC **im lặng**; ở đây SPEC chỉ im lặng về **phạm vi/tầm
   *    nhìn** của mục Chung (ai **đọc** được nó), không về quyền **tạo** — xem
   *    `cau-hoi-spec.md` **#69**, đã thu hẹp đúng vào chỗ đó.
   *
   *    Cùng ô `create_ask` cũng là luật duy nhất của `handlerCapSoCanChu`
   *    (`lenh-ticket.ts`, 19.12 câu 18), nên hai đường **cấp `T-số`** và **tạo
   *    mục** nay khớp nhau: không còn vai nào đốt được số mà không tạo được mục.
   */
  batBuocQuyen(lenh.ai, 'create_ask', project_id === null ? {} : { project_id });

  /*
   * 4. Dự án (chỉ khi có). Dự án `archived` là **chỉ đọc** (SPEC mục 2, 19.12
   *    câu 25: mọi lệnh **ghi** lên dự án `archived` bị từ chối) ⇒
   *    `PROJECT_NOT_ACCEPTING`/409.
   *
   *    `paused` thì **vẫn tạo được**, và đó là một lựa chọn có chủ ý: 19.12 câu 26
   *    đọc `paused` là "agent không nhận **việc mới** / không tạo được **ticket**
   *    trong dự án" (mục 2, 4), còn một mục Cần Chủ **không phải việc của agent** —
   *    nó là một câu hỏi **gửi cho chủ**, và chủ phải hỏi được về một dự án vừa
   *    tạm dừng (thường thì đó chính là lúc cần hỏi nhất). Hai ca này có test
   *    (`test/can-chu.test.ts`, khối "19.12 câu 25–26"), nên đừng "sửa" ca
   *    `paused` thành chặn mà không chốt lại SPEC trước.
   *
   *    Quyền đã kiểm ở bước 3, **trước** khi tra dự án — 19.12 câu 15.
   */
  if (project_id !== null) {
    batBuocKhongLuuTru(await duAnBatBuoc(db, lenh.workspace_id, project_id));
  }

  /*
   * 5. **Ticket liên quan** (mục 8 d.240 — "nhiều"). Mỗi ticket phải có thật
   *    trong **cùng workspace** và **trong phạm vi người gọi thấy được**
   *    (`ticketBatBuoc(…, ai)` → `NOT_FOUND`, BAT-58): nối một mục Cần Chủ vào một
   *    ticket là đặt một thẻ của ticket đó lên màn hình của chủ, nên nó là ghi
   *    lên cả hai phía.
   */
  const ticket_lien_quan = await kiemTicketLienQuan(
    db,
    lenh.workspace_id,
    lenh.ai,
    lenh.ticket_lien_quan,
  );

  /*
   * 5b. **Phiên liên quan** (mục 8 d.240). Nửa **VÀO** của cặp vào–ra mà 0013
   *     cố ý để lại cho lượt này; nửa **RA** là `cauLenhPhienThoiCho` của
   *     `lenh-xu-ly-can-chu.ts` (19.6 d.516). Hai nửa phải cùng một lượt: cài
   *     một nửa là có đường đưa phiên vào `waiting_owner` mà không có đường đưa
   *     nó ra, và `CHECK (trang_thai <> 'waiting_owner' OR can_chu_id IS NOT
   *     NULL)` của 0006 làm một phiên như vậy **không gỡ được bằng tay**.
   */
  const phien = await kiemPhienLienQuan(db, lenh.workspace_id, lenh.ai, lenh.phien_lien_quan);

  /*
   * 6. **Hạn** — 19.8. Agent gửi thì tôn trọng; không gửi thì mặc định.
   *    `undefined` (không gửi trường) ⇒ mặc định. `null` (gửi rõ `null`) ⇒ cũng
   *    hiểu là "để server quyết", vì SPEC không có khái niệm "mục cố ý không
   *    hạn" cho 🔴 và 🟡 (d.241 nói "Nếu **không đặt**: …").
   */
  const han_gui = lenh.han_luc === undefined ? null : kiemHanLuc(lenh.han_luc);
  const han_mac_dinh = han_gui === null;
  const han_luc = han_gui ?? hanMacDinh(muc, bay_gio);

  /*
   * 7. Cờ **"có thể trùng T-x"** (mục 8, phần Lỗi). Bốn điều kiện: cùng tiêu đề,
   *    cùng dự án, trong 24 giờ, và mục kia đang **`Chờ`**. Câu truy vấn lọc
   *    `trang_thai = 'open'` và cửa sổ 24 giờ (index riêng phần `ix_can_chu_trung`
   *    của 0013); so tiêu đề và so dự án ở hàm thuần `mucCoTheTrung`, nên luật có
   *    test không cần DB.
   *
   *    **Vẫn tạo** dù trùng — SPEC nói rõ. Cờ chỉ là một lời nhắc cho chủ.
   */
  const trung = mucCoTheTrung(
    { tieu_de, project_id },
    await mucChoGanDay(db, lenh.workspace_id, tieu_de, bay_gio),
    bay_gio,
  );

  // 8. Cấp `T-số`. **Trong cửa ghi**, nên DO đơn luồng bảo đảm hai mục tạo cùng
  //    lúc không bao giờ nhận cùng một số (mục 8: "không tái dùng").
  const { so: ma_so, cau_lenh: cau_lenh_bo_dem } = await capSo(
    db,
    lenh.workspace_id,
    'workspace',
    'ask',
  );

  const id = crypto.randomUUID();
  const tao_boi_agent_id = lenh.ai.loai === 'agent' ? lenh.ai.agent_id : null;

  const cau_lenh = [
    ...cau_lenh_bo_dem,
    db
      .prepare(
        `INSERT INTO can_chu
           (id, workspace_id, ma_so, tieu_de, project_id, muc, loai, trang_thai,
            boi_canh, han_luc, ly_do_de_xuat, lenh, can_tty,
            lenh_kem, can_tty_kem,
            trung_voi_can_chu_id, tao_luc, cap_nhat_luc, tao_boi_agent_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        lenh.workspace_id,
        ma_so,
        tieu_de,
        project_id,
        muc,
        loai_can_chu,
        boi_canh,
        han_luc,
        noi_dung.loai === 'decision' ? noi_dung.ly_do_de_xuat : null,
        /*
         * **Lệnh của mọi loại** — d.250 ("mỗi thẻ hiện đủ: … lệnh có nút
         * Copy"), `cau-hoi-spec.md` #130. Hai chỗ ghi, đúng một chỗ có giá trị
         * ở mỗi dòng: `lenh`/`can_tty` của 0013 là lệnh **bắt buộc** của
         * `run_command` (cặp CHECK của 0013 canh cả hai vế), `lenh_kem`/
         * `can_tty_kem` của 0023 là lệnh **tuỳ chọn** của ba loại kia. Đường
         * đọc gộp bằng `COALESCE` ở `COT_MUC`, nên mọi màn hình thấy một
         * trường `lenh`.
         */
        noi_dung.loai === 'run_command' ? noi_dung.lenh : null,
        noi_dung.loai === 'run_command' && noi_dung.can_tty ? 1 : 0,
        noi_dung.loai === 'run_command' ? null : noi_dung.lenh,
        noi_dung.loai !== 'run_command' && noi_dung.can_tty ? 1 : 0,
        trung?.id ?? null,
        bay_gio,
        bay_gio,
        tao_boi_agent_id,
      ),
  ];

  if (noi_dung.loai === 'decision') {
    for (const pa of noi_dung.phuong_an) {
      cau_lenh.push(
        db
          .prepare(
            `INSERT INTO can_chu_phuong_an
               (id, workspace_id, can_chu_id, nhan, noi_dung, de_xuat, thu_tu, tao_luc)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            lenh.workspace_id,
            id,
            pa.nhan,
            pa.noi_dung,
            pa.de_xuat ? 1 : 0,
            pa.thu_tu,
            bay_gio,
          ),
      );
    }
  }

  if (noi_dung.loai === 'review') {
    for (const f of noi_dung.file) {
      cau_lenh.push(
        db
          .prepare(
            `INSERT INTO can_chu_file
               (id, workspace_id, can_chu_id, loai, dia_chi, thu_tu, tao_luc)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(crypto.randomUUID(), lenh.workspace_id, id, f.loai, f.dia_chi, f.thu_tu, bay_gio),
      );
    }
  }

  for (const ticket_id of ticket_lien_quan) {
    cau_lenh.push(
      db
        .prepare(
          `INSERT INTO can_chu_ticket (workspace_id, can_chu_id, ticket_id, tao_luc)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(lenh.workspace_id, id, ticket_id, bay_gio),
    );
  }

  if (phien !== null) cau_lenh.push(...cauLenhPhienChoMuc(db, lenh.workspace_id, phien.id, id, bay_gio));

  /*
   * 9. **Thông báo 🔴 mới** — mục 8 d.283 ("mục 🔴 mới thì **bắn ngay**"), mục 12
   *    d.341. Một dòng `thong_bao` loại `can_chu_do`, **trong cùng batch** với
   *    lệnh tạo mục: không có đường ghi thứ hai, nên không có trạng thái "mục đã
   *    tạo mà tin không vào kho" (mục 🔴 im lặng) hay ngược lại (một tin trỏ tới
   *    một mục không tồn tại — mà `tg_thong_bao_ws_them` của 0019 sẽ chặn).
   *    Thứ tự trong `cau_lenh` vì vậy **không đổi được**: `INSERT INTO can_chu`
   *    phải chạy trước, nếu không khoá `can_chu_id` chưa có gì để trỏ tới.
   *
   *    `uu_tien = 'khan'` — 19.8 d.535: "🔴 **mới** vẫn gửi ngay" trong giờ yên
   *    lặng. Lời nhắc sau 2 giờ của **cùng mục** thì `thuong` (nó "hoãn tới cuối
   *    giờ yên lặng"); hai luật khác nhau cho cùng một mức, đừng gộp —
   *    `WorkspaceGate.nhacCanChuDo`.
   *
   *    **🟡 và ⚪ không bắn tin** (d.283: "chỉ vào tóm tắt sáng và tối" — mục 11,
   *    lượt sau). Và vì `muc` ở đây là mức **sau** `haMucNeuCan`, một mục `fyi`
   *    gửi 🔴 đã bị hạ về 🟡 (19.8 d.534) nên nó **không** bắn tin — đúng thứ phải
   *    vậy: mục đó nằm ở khối 🟡 với hạn 20:00, không phải việc gấp.
   *
   *    `ticket_id` lấy ticket liên quan **đầu tiên** nếu có: d.347 đòi link thẳng,
   *    và một mục nối nhiều ticket chỉ có một link. Thứ tự là thứ tự agent gửi
   *    lên (đã bỏ trùng, giữ thứ tự — `kiemTicketLienQuan`), tức ticket mà agent
   *    nêu trước. SPEC không nói chọn ticket nào khi có nhiều.
   */
  if (muc === 'urgent') {
    cau_lenh.push(
      db
        .prepare(
          `INSERT INTO thong_bao
             (id, workspace_id, loai, uu_tien, noi_dung, can_chu_id, ticket_id, agent_id, tao_luc)
           VALUES (?, ?, ?, 'khan', ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          lenh.workspace_id,
          LOAI_TIN_CAN_CHU_DO,
          tinCanChuDoMoi({ ma: maCanChu(ma_so), tieu_de }),
          id,
          ticket_lien_quan[0] ?? null,
          tao_boi_agent_id,
          bay_gio,
        ),
    );
  }

  return {
    cau_lenh,
    /*
     * Đánh thức theo **`T-số`** và theo chủ đề chung của màn hình Cần Chủ: mục 8
     * d.267 đòi agent chờ bằng `baton result T-x --wait` nhận kết quả trong 3
     * giây. Lượt này chưa có lệnh chờ nào treo trên các chủ đề đó (đường xử lý là
     * lượt 2), nhưng đặt tên chủ đề ngay từ đường tạo thì lượt 2 chỉ phải nối
     * bên nghe, không phải sửa bên phát.
     */
    danh_thuc: [`can_chu:${id}`, 'can_chu'],
    ket_qua: {
      id,
      ma: maCanChu(ma_so),
      ma_so,
      tieu_de,
      project_id,
      muc,
      loai_can_chu,
      trang_thai: 'open',
      han_luc,
      han_mac_dinh,
      muc_da_ha: ha.da_ha,
      ghi_chu_muc: ha.ghi_chu,
      co_the_trung_ma: trung === null ? null : maCanChu(trung.ma_so),
      co_the_trung_can_chu_id: trung?.id ?? null,
      so_ticket_lien_quan: ticket_lien_quan.length,
      phien_lien_quan: phien?.id ?? null,
      phien_trang_thai: phien === null ? null : trangThaiPhienKhiCho(phien.trang_thai),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Phiên liên quan — nửa VÀO của cặp vào–ra (mục 8 d.240, 19.6 d.516)
 * ------------------------------------------------------------------ */

/**
 * Trạng thái phiên **sẽ có** khi nó được nối vào một mục Cần Chủ.
 *
 * `closed` và `stopping` **giữ nguyên**, hai ca hai lý do:
 *   * `closed` — 19.11 d.560 nói thẳng ca "phiên đã đóng": kết quả **vẫn lưu**,
 *     lấy được qua `baton result`, "**không gửi thêm tín hiệu nào**". Phiên đóng
 *     là **vĩnh viễn** (`tg_phien_dong_la_vinh_vien` của 0006), nên kéo nó sang
 *     `waiting_owner` sẽ vỡ ngay tại DB — và đúng ra là phải vỡ.
 *   * `stopping` — chủ đã bấm Dừng, agent đang phải ngưng và gửi một mục
 *     `result`/`error` (d.193). Nó không "đang chờ Chủ để làm tiếp". Cùng lựa
 *     chọn và cùng lý lẽ mà `phienSauHoatDong` của `@baton/shared` đã dùng cho
 *     `question` → `waiting_assigner`.
 *
 * Mọi trạng thái còn lại (`running`, `waiting_assigner`, `error`) sang
 * `waiting_owner`: d.240 nói "phiên sang `waiting_owner`" không kèm điều kiện,
 * và 19.6 nói trạng thái đó "**không bao giờ** bị tính đứng" — tức nó là câu trả
 * lời đúng cho "agent đang đứng im vì chờ chủ".
 */
export function trangThaiPhienKhiCho(trang_thai: string): string {
  return trang_thai === 'closed' || trang_thai === 'stopping' ? trang_thai : 'waiting_owner';
}

/**
 * Nối một phiên vào mục và (nếu được) đưa nó sang `waiting_owner`.
 *
 * `can_chu_id` được đặt **kể cả** với phiên `closed`/`stopping`: nó là mối nối
 * mà 19.6 dùng để hiện "chờ Chủ: T-x", và là thứ đường RA tìm theo. Cặp trigger
 * `tg_phien_can_chu_them`/`_sua` của 0013 ép mục phải **có thật** và **cùng
 * workspace**.
 *
 * `CASE` chứ không hai câu: một câu thì không có khe nào để trạng thái và mối
 * nối lệch nhau, và với phiên `closed` thì `NEW.trang_thai` vẫn là `'closed'`
 * nên `tg_phien_dong_la_vinh_vien` **không** bật — đúng d.560 ("kết quả vẫn
 * lưu", không ném lỗi).
 */
export function cauLenhPhienChoMuc(
  db: D1Database,
  workspace_id: string,
  phien_id: string,
  can_chu_id: string,
  bay_gio: number,
): D1PreparedStatement[] {
  return [
    db
      .prepare(
        `UPDATE phien
            SET can_chu_id = ?,
                trang_thai = CASE WHEN trang_thai IN ('closed', 'stopping')
                                  THEN trang_thai ELSE 'waiting_owner' END,
                cap_nhat_luc = ?
          WHERE id = ? AND workspace_id = ?`,
      )
      .bind(can_chu_id, bay_gio, phien_id, workspace_id),
  ];
}

/**
 * Phiên liên quan phải **có thật, cùng workspace**, và — khi người gọi là agent
 * — phải là **phiên của chính agent đó**.
 *
 * Luật thứ hai là một lựa chọn **hướng đóng**, SPEC im lặng: d.240 chỉ nói mục
 * có trường "phiên liên quan". Căn cứ chọn đóng: nối một phiên vào một mục là
 * **đưa phiên đó sang `waiting_owner`**, tức dừng công việc của một agent cho
 * tới khi chủ trả lời. Một agent làm việc đó với phiên của agent khác là một
 * đường chặn việc mà bảng quyền mục 3 không có hàng nào cho phép. Chủ thì nối
 * được phiên bất kỳ (mục 1: quyền cao nhất).
 */
async function kiemPhienLienQuan(
  db: D1Database,
  workspace_id: string,
  ai: AiGoi,
  nguon: unknown,
): Promise<{ id: string; trang_thai: string; agent_id: string } | null> {
  if (nguon === undefined || nguon === null || nguon === '') return null;
  if (typeof nguon !== 'string') {
    throw new BatonError('INVALID_INPUT', { message: 'phien_lien_quan phải là mã phiên.' });
  }

  /*
   * Tra **trong cái người gọi thấy được** (BAT-57, 19.12 câu 15 — sửa theo
   * reviewer): phiên trên ticket ngoài dự án người gọi, không phải phiên của họ
   * và không phải lượt họ giao ⇒ `null` ⇒ **cùng dòng `throw NOT_FOUND`** với id
   * bịa. Trước đó câu tra cả workspace rồi mới kiểm danh tính, nên phiên thật dự
   * án khác ra 403 còn id bịa ra 404 — một máy dò. Thấy được mà không phải phiên
   * của mình ⇒ vẫn `FORBIDDEN` dưới đây.
   */
  const phien = await phienTheoId(db, workspace_id, nguon, ai, 'ghi');
  if (phien === null) throw new BatonError('NOT_FOUND', { message: 'Không tìm thấy phiên.' });

  if (ai.loai === 'agent' && ai.agent_id !== phien.agent_id) {
    throw new BatonError('FORBIDDEN', {
      message: 'Agent chỉ nối được phiên của chính mình vào một mục Cần Chủ.',
    });
  }
  return phien;
}

/* ------------------------------------------------------------------ *
 * Giúp việc
 * ------------------------------------------------------------------ */

/**
 * Ticket liên quan: tồn tại trong cùng workspace, **và** agent được vào dự án của
 * nó. Bỏ trùng, giữ thứ tự gửi lên (cùng nếp `kiemDanhSachNhan`).
 */
async function kiemTicketLienQuan(
  db: D1Database,
  workspace_id: string,
  ai: AiGoi,
  nguon: unknown,
): Promise<string[]> {
  if (nguon === undefined || nguon === null) return [];
  if (!Array.isArray(nguon)) {
    throw new BatonError('INVALID_INPUT', {
      message: 'ticket_lien_quan phải là một danh sách id ticket.',
    });
  }

  const ra: string[] = [];
  for (const t of nguon) {
    if (typeof t !== 'string' || t.length === 0) {
      throw new BatonError('INVALID_INPUT', { message: 'id ticket liên quan phải là chữ.' });
    }
    if (ra.includes(t)) continue;

    /*
     * Tra **trong cái người gọi thấy được** (BAT-58, 19.12 câu 15 "cả hai ca phải
     * ra phản hồi giống hệt nhau"): ticket ngoài phạm vi ⇒ **cùng dòng `throw
     * NOT_FOUND`** với id bịa. Trước BAT-58 câu tra cả workspace rồi mới kiểm
     * `vaoDuocDuAn`, nên id thật ra 403 còn id bịa ra 404 — một máy dò. Cùng lựa
     * chọn 404 với `cau-hoi-spec.md` #172/#175/#176. Phép kiểm `vaoDuocDuAn` dưới
     * đây giữ làm hàng rào thứ hai (với bộ lọc hiện tại nó không còn bắn).
     */
    const ticket = await ticketBatBuoc(db, workspace_id, t, false, ai);
    if (!vaoDuocDuAn(ai, ticket.project_id)) {
      throw new BatonError('FORBIDDEN', {
        message: 'Agent không được vào dự án của một ticket liên quan.',
      });
    }
    ra.push(ticket.id);
  }
  return ra;
}

/**
 * Các mục đang **`Chờ`** có **cùng tiêu đề** trong **24 giờ** — nguồn dữ liệu của
 * cờ "có thể trùng T-x".
 *
 * Lọc tiêu đề ngay trong SQL (bình đẳng, đi index `ix_can_chu_trung`) thay vì tải
 * mọi mục Chờ về rồi so trong bộ nhớ: câu này chạy ở **mỗi lần tạo**.
 *
 * Phép so **không phân biệt hoa/thường nằm ở đây**, trong SQL
 * (`lower(tieu_de) = lower(?)`), không chỉ trong bộ nhớ: lọc `tieu_de = ?` đúng
 * chuỗi rồi mới hạ chữ ở `mucCoTheTrung` là một phép so không bao giờ khớp thêm
 * gì — tức mã chết, và một lời khai sai trong `cau-hoi-spec.md` #70. `0013` có
 * index **biểu thức** `(workspace_id, lower(tieu_de), tao_luc)` để câu này vẫn là
 * một `SEARCH`.
 *
 * Giới hạn còn lại, khai đúng ở #70: `lower()` của SQLite **chỉ biết ASCII**, nên
 * hai tiêu đề chỉ khác hoa/thường ở một chữ **có dấu** sẽ **không** được gắn cờ.
 * Cờ này "vẫn tạo" nên bỏ sót một lời nhắc không mất dữ liệu nào.
 */
async function mucChoGanDay(
  db: D1Database,
  workspace_id: string,
  tieu_de: string,
  bay_gio: number,
): Promise<MucChoDeSoTrung[]> {
  const { results } = await db
    .prepare(
      `SELECT id, ma_so, tieu_de, project_id, tao_luc
         FROM can_chu
        WHERE workspace_id = ? AND trang_thai = 'open'
          AND lower(tieu_de) = lower(?) AND tao_luc >= ?`,
    )
    .bind(workspace_id, tieu_de, bay_gio - CUA_SO_TRUNG_MS)
    .all<MucChoDeSoTrung>();
  return results;
}
