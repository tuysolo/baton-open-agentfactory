/**
 * **Bảng quyền** — SPEC mục 3 (bảng "Quyền theo vai trò", SPEC.md dòng 86–96).
 *
 * Đây là **module quyền duy nhất**. Mọi đường ghi gọi `quyen(...)`; không rải
 * điều kiện quyền trong handler. Lý do: bảng của SPEC có ô mang **điều kiện phạm
 * vi** ("mọi dự án được vào", "dự án mình quản lý", "ticket của lượt mình",
 * "ticket con của lượt mình đang làm"), rất dễ bị nới lỏng thành "có" nếu mỗi
 * handler tự kiểm.
 *
 * Bảng SPEC nguyên văn (9 hàng × 4 vai trò):
 *
 * | Việc | coordinator | manager | worker | reviewer |
 * |---|---|---|---|---|
 * | Tạo ticket | mọi dự án được vào | dự án mình quản lý | ticket con của lượt mình đang làm | — |
 * | Giao việc (tạo lượt giao) | cho manager, worker, reviewer | cho worker, reviewer trong dự án | — | — |
 * | Đổi trạng thái ticket | có | trong dự án | ticket của lượt mình | — |
 * | Nộp bằng chứng | có | có | có | có |
 * | Ghi kết quả review | có, trừ ticket mình đã nhận lượt `work` | — | — | có |
 * | Tạo mục Cần Chủ | có | có | — | — |
 * | Ghi Nhật ký quyết định | có | có | — | — |
 * | Xoá bất cứ thứ gì | không bao giờ | không bao giờ | không bao giờ | không bao giờ |
 * | Quyết mục Cần Chủ | không bao giờ | không bao giờ | không bao giờ | không bao giờ |
 *
 * Hai hàng cuối là **tuyệt đối với agent**: chủ không ghi đè được (xem
 * `VIEC_KHONG_BAO_GIO`). Chủ thì vẫn xoá ticket (SPEC mục 4) và quyết mục Cần
 * Chủ (SPEC mục 8) — "không bao giờ" là luật cho *agent*, không phải cho chủ.
 */

import type { VaiTroAgent } from './ma-nhan.js';
import { BatonError } from './loi.js';

/* ------------------------------------------------------------------ *
 * Hàng của bảng quyền
 * ------------------------------------------------------------------ */

/** Mã máy của từng hàng trong bảng quyền (SPEC mục 3) + nhãn tiếng Việt. */
export const VIEC_QUYEN = {
  create_ticket: 'Tạo ticket',
  assign: 'Giao việc (tạo lượt giao)',
  change_status: 'Đổi trạng thái ticket',
  submit_evidence: 'Nộp bằng chứng',
  write_review: 'Ghi kết quả review',
  create_ask: 'Tạo mục Cần Chủ',
  write_decision: 'Ghi Nhật ký quyết định',
  delete_anything: 'Xoá bất cứ thứ gì',
  resolve_ask: 'Quyết mục Cần Chủ',
} as const;
export type ViecQuyen = keyof typeof VIEC_QUYEN;

/**
 * Hai hàng "không bao giờ". Agent **không bao giờ** được hai việc này, và
 * `agent_permission` cố tình **không nhận** hai mã này (CHECK trong migration
 * 0001) nên không có đường ghi đè qua dữ liệu. `quyen()` chặn thêm một lần nữa
 * ở tầng code, để một bug ở tầng dữ liệu cũng không mở được cửa.
 */
export const VIEC_KHONG_BAO_GIO = ['delete_anything', 'resolve_ask'] as const satisfies readonly ViecQuyen[];

/** Các hàng chủ **được** ghi đè từng ô cho từng agent (SPEC mục 3). */
export const VIEC_GHI_DE_DUOC = [
  'create_ticket',
  'assign',
  'change_status',
  'submit_evidence',
  'write_review',
  'create_ask',
  'write_decision',
] as const satisfies readonly ViecQuyen[];
export type ViecGhiDeDuoc = (typeof VIEC_GHI_DE_DUOC)[number];

export function laViecQuyen(v: unknown): v is ViecQuyen {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(VIEC_QUYEN, v);
}

export function laViecGhiDeDuoc(v: unknown): v is ViecGhiDeDuoc {
  return laViecQuyen(v) && !(VIEC_KHONG_BAO_GIO as readonly ViecQuyen[]).includes(v);
}

/* ------------------------------------------------------------------ *
 * Ô của bảng quyền: "được tới đâu"
 * ------------------------------------------------------------------ */

/**
 * Giá trị một ô. Mỗi mã là **đúng một chữ trong bảng SPEC**, không gộp:
 *
 * | Mã | Chữ trong SPEC |
 * |---|---|
 * | `khong` | `—` (mặc định không có quyền; chủ ghi đè được) |
 * | `khong_bao_gio` | "không bao giờ" (tuyệt đối, không ghi đè được) |
 * | `co` | "có" |
 * | `moi_du_an_duoc_vao` | "mọi dự án được vào" |
 * | `du_an_minh_quan_ly` | "dự án mình quản lý" |
 * | `trong_du_an` | "trong dự án" |
 * | `ticket_cua_luot_minh` | "ticket của lượt mình" |
 * | `ticket_con_cua_luot_minh` | "ticket con của lượt mình đang làm" |
 * | `cho_manager_worker_reviewer` | "cho manager, worker, reviewer" |
 * | `worker_reviewer_trong_du_an` | "cho worker, reviewer trong dự án" |
 */
export const PHAM_VI_QUYEN = {
  khong: '—',
  khong_bao_gio: 'không bao giờ',
  co: 'có',
  moi_du_an_duoc_vao: 'mọi dự án được vào',
  du_an_minh_quan_ly: 'dự án mình quản lý',
  trong_du_an: 'trong dự án',
  ticket_cua_luot_minh: 'ticket của lượt mình',
  ticket_con_cua_luot_minh: 'ticket con của lượt mình đang làm',
  cho_manager_worker_reviewer: 'cho manager, worker, reviewer',
  worker_reviewer_trong_du_an: 'cho worker, reviewer trong dự án',
} as const;
export type PhamViQuyen = keyof typeof PHAM_VI_QUYEN;

export function laPhamViQuyen(p: unknown): p is PhamViQuyen {
  return typeof p === 'string' && Object.prototype.hasOwnProperty.call(PHAM_VI_QUYEN, p);
}

/* ------------------------------------------------------------------ *
 * Bảng mặc định theo vai trò — chép đúng SPEC mục 3
 * ------------------------------------------------------------------ */

/**
 * Mặc định theo vai trò. Đây là **bản chép máy** của bảng SPEC mục 3; mỗi ô có
 * một test riêng (xem `test/quyen.test.ts`) nên lệch một ô là test đỏ.
 */
export const BANG_QUYEN_MAC_DINH = {
  create_ticket: {
    coordinator: 'moi_du_an_duoc_vao',
    manager: 'du_an_minh_quan_ly',
    worker: 'ticket_con_cua_luot_minh',
    reviewer: 'khong',
  },
  assign: {
    coordinator: 'cho_manager_worker_reviewer',
    manager: 'worker_reviewer_trong_du_an',
    worker: 'khong',
    reviewer: 'khong',
  },
  change_status: {
    coordinator: 'co',
    manager: 'trong_du_an',
    worker: 'ticket_cua_luot_minh',
    reviewer: 'khong',
  },
  submit_evidence: {
    coordinator: 'co',
    manager: 'co',
    worker: 'co',
    reviewer: 'co',
  },
  /*
   * **`manager` được ghi review từ 13/10** — SPEC mục 7 d.208, migration 0022
   * khối B, `decisions.md` 13/10.
   *
   * Vì sao nới đúng một ô này: reviewer thật của hệ này là sub-agent do Manager
   * gọi (`claude -p`) và **không có token Baton**, nên không ai gửi được một
   * `review` ĐẠT và điều kiện phụ của cổng (d.215) **không bao giờ** mở cho dự án
   * bật "bắt buộc review" (mặc định bật). Ngày 13/10 chủ dùng thật và không
   * ticket nào vào được Xong vì đúng chỗ này.
   *
   * Nới **hẹp nhất có thể**:
   *   * `trong_du_an`, không `co` — cửa dự án vẫn áp: chỉ review được trong dự án
   *     mà agent đó **được vào** (cùng ô với hàng "Đổi trạng thái");
   *   * review do `manager` gửi **bắt buộc** kèm đường dẫn báo cáo của reviewer
   *     độc lập, và nó được ghi nguồn `manager` để không đọc lẫn với review của
   *     agent `reviewer` (`handlerGuiBangChung`);
   *   * `REVIEWER_IS_WORKER` (19.3 d.496) vẫn áp: không ai review việc của chính
   *     mình.
   * `worker` **vẫn `khong`**.
   *
   * **`coordinator` được ghi review từ 14/10** (BAT-6 đợt 3 phần D): người giám sát
   * và ký cấp cao hơn manager. `co` (vào mọi dự án nó được vào), KHÔNG bắt buộc
   * kèm báo cáo, nguồn `coordinator`; `REVIEWER_IS_WORKER` vẫn áp.
   */
  write_review: {
    coordinator: 'co',
    manager: 'trong_du_an',
    worker: 'khong',
    reviewer: 'co',
  },
  create_ask: {
    coordinator: 'co',
    manager: 'co',
    worker: 'khong',
    reviewer: 'khong',
  },
  write_decision: {
    coordinator: 'co',
    manager: 'co',
    worker: 'khong',
    reviewer: 'khong',
  },
  delete_anything: {
    coordinator: 'khong_bao_gio',
    manager: 'khong_bao_gio',
    worker: 'khong_bao_gio',
    reviewer: 'khong_bao_gio',
  },
  resolve_ask: {
    coordinator: 'khong_bao_gio',
    manager: 'khong_bao_gio',
    worker: 'khong_bao_gio',
    reviewer: 'khong_bao_gio',
  },
} as const satisfies Record<ViecQuyen, Record<VaiTroAgent, PhamViQuyen>>;

/** Ô mặc định của một (việc, vai trò). */
export function phamViMacDinh(viec: ViecQuyen, vai_tro: VaiTroAgent): PhamViQuyen {
  return BANG_QUYEN_MAC_DINH[viec][vai_tro];
}

/* ------------------------------------------------------------------ *
 * "Ai đang gọi"
 * ------------------------------------------------------------------ */

/**
 * Một ô chủ đã chỉnh cho một agent (bảng `agent_permission`).
 * `pham_vi` để trống = giữ phạm vi mặc định của vai trò.
 */
export interface GhiDeQuyen {
  cho_phep: boolean;
  pham_vi: PhamViQuyen | null;
}

/**
 * Ai đang gọi. Union để **phần 6** (mật khẩu + TOTP cho chủ) cắm vào mà không
 * phải sửa chỗ nào khác: phần 1 chỉ có một đường tạm dựng `{ loai: 'chu' }` từ
 * token chủ trong secret binding; phần 6 dựng cùng nhánh đó từ phiên đăng nhập.
 */
export type AiGoi =
  | { loai: 'chu' }
  | {
      loai: 'agent';
      agent_id: string;
      vai_tro: VaiTroAgent;
      /** Chủ đã tắt agent — SPEC mục 3 ("gọi API sẽ bị từ chối"). */
      disabled: boolean;
      /** Cờ "tất cả dự án" — SPEC mục 3. */
      vao_tat_ca_du_an: boolean;
      /** Dự án agent được vào (bỏ qua khi `vao_tat_ca_du_an`). */
      du_an_duoc_vao: readonly string[];
      /** Dự án agent này là agent quản lý (SPEC mục 2) — cho ô "dự án mình quản lý". */
      du_an_minh_quan_ly: readonly string[];
      /** Ô chủ đã chỉnh riêng cho agent này. */
      ghi_de: Readonly<Partial<Record<ViecGhiDeDuoc, GhiDeQuyen>>>;
    };

export type AiGoiAgent = Extract<AiGoi, { loai: 'agent' }>;

/** Agent có được vào một dự án không — SPEC mục 3, 17.7. */
export function vaoDuocDuAn(ai: AiGoi, project_id: string): boolean {
  if (ai.loai === 'chu') return true;
  return ai.vao_tat_ca_du_an || ai.du_an_duoc_vao.includes(project_id);
}

/* ------------------------------------------------------------------ *
 * Bối cảnh và kết quả
 * ------------------------------------------------------------------ */

/**
 * Bối cảnh của một lần hỏi quyền. Những trường về **lượt giao** chưa có dữ liệu
 * thật ở lượt này (lượt giao là phần 2, lượt 3) nên được **truyền vào** chứ
 * không tự tra: lượt 3 chỉ cần nối nguồn dữ liệu, không sửa luật.
 *
 * ⚠️ **MỌI trường của kiểu này là kết luận của server, không phải dữ liệu
 * client.** Chúng là *câu trả lời* cho các điều kiện phạm vi của bảng SPEC mục
 * 3, nên ai khai được chúng thì khai được luôn mình có quyền. Chỉ dựng chúng
 * **bên trong cửa ghi**, từ dữ liệu trong DB (`phamViLuotGiao` ở
 * `api/src/lenh-khung.ts`).
 *
 * Không bao giờ để một trường nào của kiểu này xuất hiện trong kiểu của một lệnh
 * ghi: làm vậy là mở cho client tự khai phạm vi quyền của mình. Lượt 2 từng có
 * đúng lỗi đó (`ticket_cua_luot_minh` nằm trong `LenhDoiTieuDe` và tầng HTTP
 * spread cả thân request) nên agent `worker` sửa được mọi ticket trong dự án nó
 * được vào. Hàng rào hiện tại là hai lớp: các cờ này **không nằm** trong kiểu
 * lệnh nào, **và** tầng HTTP chỉ chép những trường trong whitelist
 * (`TRUONG_CLIENT` ở `api/src/index.ts`).
 */
export interface BoiCanhQuyen {
  /** Dự án mà việc này nhắm tới. Thiếu thì các ô cần dự án đều bị từ chối. */
  project_id?: string | undefined;
  /** Ticket mà việc này nhắm tới (chỉ để dựng thông điệp). */
  ticket_id?: string | undefined;
  /**
   * Ticket đích **thuộc một lượt giao đang mở của chính agent gọi**
   * (ô "ticket của lượt mình"). Phần 2 nối vào.
   */
  ticket_cua_luot_minh?: boolean | undefined;
  /**
   * Ticket cha đích **là ticket của lượt agent gọi đang làm**
   * (ô "ticket con của lượt mình đang làm"). Phần 2 nối vào.
   */
  ticket_cha_cua_luot_minh?: boolean | undefined;
  /** Vai trò người nhận, cho hàng "Giao việc". */
  vai_tro_nguoi_nhan?: VaiTroAgent | undefined;
  /** Người nhận có được vào dự án của ticket không, cho ô "trong dự án". */
  nguoi_nhan_trong_du_an?: boolean | undefined;
}

export type KetQuaQuyen =
  | { cho_phep: true }
  | { cho_phep: false; ma: 'FORBIDDEN'; ly_do: string };

const CHO_PHEP: KetQuaQuyen = { cho_phep: true };

function tuChoi(ly_do: string): KetQuaQuyen {
  return { cho_phep: false, ma: 'FORBIDDEN', ly_do };
}

/* ------------------------------------------------------------------ *
 * Hàm quyết định duy nhất
 * ------------------------------------------------------------------ */

/**
 * `quyen(ai, viec, boi_canh)` → cho phép hay `FORBIDDEN`.
 *
 * Thứ tự kiểm (quan trọng — đổi thứ tự là đổi hành vi):
 *  1. Hàng "không bao giờ": agent bị từ chối **trước mọi thứ khác**, kể cả ghi đè.
 *  2. Chủ: được mọi hàng còn lại (SPEC mục 1 "quyền cao nhất").
 *  3. Agent `disabled`: từ chối (SPEC mục 3).
 *  4. Lấy ô = ghi đè của chủ, nếu không có thì mặc định của vai trò.
 *  5. **Cửa dự án**: bối cảnh có `project_id` thì agent phải được vào dự án đó.
 *  6. Điều kiện riêng của từng phạm vi.
 */
export function quyen(ai: AiGoi, viec: ViecQuyen, boi_canh: BoiCanhQuyen = {}): KetQuaQuyen {
  // 1. Tuyệt đối. Kiểm trước cả nhánh chủ vì chủ cũng **không ghi đè được** hai
  //    hàng này *cho agent*; còn chính chủ thì không đi qua hàm này để xoá hay
  //    quyết mục Cần Chủ (SPEC mục 4, 8 nói rõ "chỉ chủ").
  if ((VIEC_KHONG_BAO_GIO as readonly ViecQuyen[]).includes(viec)) {
    if (ai.loai === 'agent') {
      return tuChoi(`Agent không bao giờ được "${VIEC_QUYEN[viec]}" (SPEC mục 3).`);
    }
    return CHO_PHEP;
  }

  // 2. Chủ.
  if (ai.loai === 'chu') return CHO_PHEP;

  // 3. Agent bị tắt — SPEC mục 3.
  if (ai.disabled) return tuChoi('Agent đã bị tắt.');

  // 4. Ô của bảng: ghi đè của chủ thắng mặc định vai trò (SPEC mục 3
  //    "mặc định; chủ chỉnh được từng agent").
  const pham_vi = oCuaAgent(ai, viec);
  if (pham_vi === 'khong' || pham_vi === 'khong_bao_gio') {
    return tuChoi(`Vai trò ${ai.vai_tro} không được "${VIEC_QUYEN[viec]}".`);
  }

  // 5. Cửa dự án: không được vào dự án thì không ghi được gì trong đó
  //    (SPEC mục 3, 17.7). Đường ĐỌC trả `NOT_FOUND` thay vì `FORBIDDEN` — đó là
  //    việc của tầng truy vấn, không phải của hàm này.
  if (boi_canh.project_id !== undefined && !vaoDuocDuAn(ai, boi_canh.project_id)) {
    return tuChoi('Agent không được vào dự án này.');
  }

  // 6. Điều kiện riêng của từng ô.
  switch (pham_vi) {
    case 'co':
      // "có" = không giới hạn thêm, nhưng cửa dự án ở bước 5 vẫn áp.
      return CHO_PHEP;

    case 'moi_du_an_duoc_vao':
      // Cần biết dự án nào: "mọi dự án **được vào**" là một điều kiện phạm vi,
      // không phải "mọi dự án".
      if (boi_canh.project_id === undefined) return tuChoi('Thiếu dự án trong bối cảnh.');
      return CHO_PHEP; // bước 5 đã kiểm "được vào"

    case 'du_an_minh_quan_ly':
      if (boi_canh.project_id === undefined) return tuChoi('Thiếu dự án trong bối cảnh.');
      if (!ai.du_an_minh_quan_ly.includes(boi_canh.project_id)) {
        return tuChoi('Chỉ làm được trong dự án mình quản lý.');
      }
      return CHO_PHEP;

    case 'trong_du_an':
      if (boi_canh.project_id === undefined) return tuChoi('Thiếu dự án trong bối cảnh.');
      return CHO_PHEP; // bước 5 đã kiểm "được vào"

    case 'ticket_cua_luot_minh':
      if (boi_canh.ticket_cua_luot_minh !== true) {
        return tuChoi('Chỉ làm được trên ticket của lượt giao mình đang cầm.');
      }
      return CHO_PHEP;

    case 'ticket_con_cua_luot_minh':
      if (boi_canh.ticket_cha_cua_luot_minh !== true) {
        return tuChoi('Chỉ tạo được ticket con của lượt giao mình đang làm.');
      }
      return CHO_PHEP;

    case 'cho_manager_worker_reviewer': {
      const nhan = boi_canh.vai_tro_nguoi_nhan;
      if (nhan === undefined) return tuChoi('Thiếu vai trò người nhận trong bối cảnh.');
      if (nhan === 'coordinator') return tuChoi('Không giao việc được cho agent coordinator.');
      return CHO_PHEP;
    }

    case 'worker_reviewer_trong_du_an': {
      const nhan = boi_canh.vai_tro_nguoi_nhan;
      if (nhan === undefined) return tuChoi('Thiếu vai trò người nhận trong bối cảnh.');
      if (nhan !== 'worker' && nhan !== 'reviewer') {
        return tuChoi('Manager chỉ giao được cho worker hoặc reviewer.');
      }
      if (boi_canh.project_id === undefined) return tuChoi('Thiếu dự án trong bối cảnh.');
      if (boi_canh.nguoi_nhan_trong_du_an !== true) {
        return tuChoi('Người nhận không ở trong dự án này.');
      }
      return CHO_PHEP;
    }
  }
}

/** Ô hiện hành của một agent: ghi đè của chủ, nếu không có thì mặc định vai trò. */
export function oCuaAgent(ai: AiGoiAgent, viec: ViecQuyen): PhamViQuyen {
  const mac_dinh = phamViMacDinh(viec, ai.vai_tro);
  // Hàng tuyệt đối không bao giờ đọc ghi đè.
  if (mac_dinh === 'khong_bao_gio') return 'khong_bao_gio';

  const ghi_de = ai.ghi_de[viec as ViecGhiDeDuoc];
  if (ghi_de === undefined) return mac_dinh;
  if (!ghi_de.cho_phep) return 'khong';
  if (ghi_de.pham_vi !== null) return ghi_de.pham_vi;
  // Chủ bật một ô mà vai trò vốn `—` nhưng không ghi phạm vi: hiểu là "có"
  // (SPEC mục 3 không nói trường hợp này — xem `spec-questions.md` #10).
  return mac_dinh === 'khong' ? 'co' : mac_dinh;
}

/** Gọi `quyen()` và **ném** `FORBIDDEN` nếu không được phép. Dùng ở mọi đường ghi. */
export function batBuocQuyen(ai: AiGoi, viec: ViecQuyen, boi_canh: BoiCanhQuyen = {}): void {
  const kq = quyen(ai, viec, boi_canh);
  if (!kq.cho_phep) throw new BatonError('FORBIDDEN', { message: kq.ly_do });
}

/* ------------------------------------------------------------------ *
 * Nối liên kết `dieu_phoi` — SPEC 19.12 câu 16 (chốt `spec-questions.md` #25)
 * ------------------------------------------------------------------ */

/**
 * Vai trò agent được **nối liên kết loại `dieu_phoi`** — SPEC 19.12 câu 16.
 *
 * Chỉ `coordinator`. Mọi vai trò khác (`manager`, `worker`, `reviewer`, và vai
 * trò nào thêm về sau) bị từ chối, vì không có tên trong danh sách này.
 */
export const VAI_TRO_NOI_DUOC_DIEU_PHOI = ['coordinator'] as const satisfies readonly VaiTroAgent[];

/**
 * **Chỉ chủ và agent vai `coordinator`** nối được liên kết loại `dieu_phoi`
 * (SPEC 19.12 câu 16).
 *
 * Vì sao phải có luật riêng, không dùng được một ô của bảng mục 3: liên kết
 * `dieu_phoi` là thứ **định nghĩa** một ticket là ticket điều phối, và ticket điều
 * phối **không qua cổng bằng chứng** (SPEC 19.4). Nên ai nối được `dieu_phoi` thì
 * tự mở được một đường vòng qua cổng bằng chứng cho ticket của mình — một
 * `manager` có `change_status` "trong dự án" là đủ, đó là lỗ reviewer lượt 3 tìm
 * ra.
 *
 * Luật này là điều kiện **cộng thêm**, đặt cạnh (không thay) `quyen(...,
 * 'change_status', ...)` trên **cả hai** đầu nối: một `coordinator` không được vào
 * dự án vẫn bị chặn bởi cửa dự án của `quyen()`.
 *
 * `related` và `blocks` **không** đi qua đây — chúng giữ đúng luật cũ.
 */
export function quyenNoiDieuPhoi(ai: AiGoi): KetQuaQuyen {
  if (ai.loai === 'chu') return CHO_PHEP;
  // Giữ nguyên thứ tự của `quyen()`: agent bị tắt là từ chối trước mọi thứ khác
  // (SPEC mục 3), để thông điệp không nói sai lý do.
  if (ai.disabled) return tuChoi('Agent đã bị tắt.');
  if (!(VAI_TRO_NOI_DUOC_DIEU_PHOI as readonly VaiTroAgent[]).includes(ai.vai_tro)) {
    return tuChoi(
      `Chỉ chủ và agent vai coordinator nối được liên kết điều phối (SPEC 19.12 câu 16); vai ${ai.vai_tro} thì không.`,
    );
  }
  return CHO_PHEP;
}

/** Gọi `quyenNoiDieuPhoi()` và **ném** `FORBIDDEN` nếu không được phép. */
export function batBuocQuyenNoiDieuPhoi(ai: AiGoi): void {
  const kq = quyenNoiDieuPhoi(ai);
  if (!kq.cho_phep) throw new BatonError('FORBIDDEN', { message: kq.ly_do });
}

/** Bảng quyền hiện hành của một agent, cho `baton whoami` và trang agent (SPEC mục 3). */
export function bangQuyenCuaAgent(ai: AiGoiAgent): Record<ViecQuyen, PhamViQuyen> {
  const ra = {} as Record<ViecQuyen, PhamViQuyen>;
  for (const viec of Object.keys(VIEC_QUYEN) as ViecQuyen[]) ra[viec] = oCuaAgent(ai, viec);
  return ra;
}
