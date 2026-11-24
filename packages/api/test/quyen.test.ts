/**
 * **Bảng quyền của SPEC mục 3** (SPEC.md dòng 86–96) — mỗi ô một test.
 *
 * Bảng có **9 hàng × 4 vai trò = 36 ô**. Mỗi ô được phủ hai lần:
 *   1. `ô đúng bảng SPEC` — so giá trị ô mà module quyền tính ra với chữ trong SPEC.
 *   2. `hành vi` — ô "có điều kiện phạm vi" phải có **cả** ca trong phạm vi được
 *      phép **và** ca ngoài phạm vi bị `FORBIDDEN`. Ô "—" và "không bao giờ" chỉ
 *      có ca bị từ chối.
 *
 * Tên test ghi rõ `hàng × vai trò` để đối chiếu trực tiếp với bảng SPEC.
 *
 * (Brief của lượt này ghi "10 hàng"; bảng SPEC dòng 88–96 có **9** hàng dữ liệu,
 * dòng 86–87 là tiêu đề và dòng kẻ. Xem báo cáo.)
 */

import { describe, expect, it } from 'vitest';
import {
  BANG_QUYEN_MAC_DINH,
  VIEC_KHONG_BAO_GIO,
  VIEC_QUYEN,
  oCuaAgent,
  quyen,
  type AiGoi,
  type BoiCanhQuyen,
  type PhamViQuyen,
  type VaiTroAgent,
  type ViecQuyen,
} from '@baton/shared';
import { CHU, aiAgent } from './giup.js';

/* ------------------------------------------------------------------ *
 * Dữ liệu dựng tay
 * ------------------------------------------------------------------ *
 * Ba dự án, để phân biệt được ba mức phạm vi của bảng SPEC:
 *   P1 — agent được vào **và** là agent quản lý
 *   P2 — agent được vào, **không** quản lý
 *   P3 — agent **không** được vào
 */
const P1 = 'pj-1';
const P2 = 'pj-2';
const P3 = 'pj-3';

const coordinator = aiAgent('coordinator', { du_an_duoc_vao: [P1, P2] });
const manager = aiAgent('manager', { du_an_duoc_vao: [P1, P2], du_an_minh_quan_ly: [P1] });
const worker = aiAgent('worker', { du_an_duoc_vao: [P1, P2] });
const reviewer = aiAgent('reviewer', { du_an_duoc_vao: [P1, P2] });

const AI_THEO_VAI_TRO: Record<VaiTroAgent, Extract<AiGoi, { loai: 'agent' }>> = {
  coordinator,
  manager,
  worker,
  reviewer,
};

/** Một ca thử: bối cảnh + mô tả ngắn để tên test đọc được. */
interface Ca {
  ten: string;
  bc: BoiCanhQuyen;
}

interface O {
  /** Chữ của hàng trong bảng SPEC. */
  hang: string;
  viec: ViecQuyen;
  vai_tro: VaiTroAgent;
  /** Ô theo đúng chữ SPEC. */
  o: PhamViQuyen;
  /** Ca **được phép**. Ô "—"/"không bao giờ" thì rỗng. */
  cho_phep: Ca[];
  /** Ca bị **FORBIDDEN**. Ô "có" thuần thì rỗng. */
  tu_choi: Ca[];
}

/* ------------------------------------------------------------------ *
 * 36 ô, chép theo đúng thứ tự hàng và cột của bảng SPEC mục 3
 * ------------------------------------------------------------------ */
const O_BANG: O[] = [
  /* --- Hàng 1: Tạo ticket ---------------------------------------- */
  {
    hang: 'Tạo ticket',
    viec: 'create_ticket',
    vai_tro: 'coordinator',
    o: 'moi_du_an_duoc_vao',
    cho_phep: [{ ten: 'dự án được vào', bc: { project_id: P1 } }],
    tu_choi: [
      { ten: 'dự án KHÔNG được vào', bc: { project_id: P3 } },
      { ten: 'không nêu dự án nào', bc: {} },
    ],
  },
  {
    hang: 'Tạo ticket',
    viec: 'create_ticket',
    vai_tro: 'manager',
    o: 'du_an_minh_quan_ly',
    cho_phep: [{ ten: 'dự án mình quản lý', bc: { project_id: P1 } }],
    tu_choi: [
      { ten: 'dự án được vào nhưng KHÔNG quản lý', bc: { project_id: P2 } },
      { ten: 'dự án không được vào', bc: { project_id: P3 } },
    ],
  },
  {
    hang: 'Tạo ticket',
    viec: 'create_ticket',
    vai_tro: 'worker',
    o: 'ticket_con_cua_luot_minh',
    cho_phep: [
      {
        ten: 'ticket con của lượt mình đang làm',
        bc: { project_id: P1, ticket_cha_cua_luot_minh: true },
      },
    ],
    tu_choi: [
      { ten: 'ticket cha KHÔNG thuộc lượt mình', bc: { project_id: P1 } },
      {
        ten: 'ticket cha thuộc lượt mình nhưng dự án không được vào',
        bc: { project_id: P3, ticket_cha_cua_luot_minh: true },
      },
    ],
  },
  {
    hang: 'Tạo ticket',
    viec: 'create_ticket',
    vai_tro: 'reviewer',
    o: 'khong',
    cho_phep: [],
    tu_choi: [{ ten: 'kể cả trong dự án của mình', bc: { project_id: P1 } }],
  },

  /* --- Hàng 2: Giao việc (tạo lượt giao) -------------------------- */
  {
    hang: 'Giao việc',
    viec: 'assign',
    vai_tro: 'coordinator',
    o: 'cho_manager_worker_reviewer',
    cho_phep: [
      { ten: 'cho manager', bc: { project_id: P1, vai_tro_nguoi_nhan: 'manager' } },
      { ten: 'cho worker', bc: { project_id: P1, vai_tro_nguoi_nhan: 'worker' } },
      { ten: 'cho reviewer', bc: { project_id: P1, vai_tro_nguoi_nhan: 'reviewer' } },
    ],
    tu_choi: [
      {
        ten: 'cho coordinator (ngoài ba vai trò SPEC nêu)',
        bc: { project_id: P1, vai_tro_nguoi_nhan: 'coordinator' },
      },
      {
        ten: 'trong dự án không được vào',
        bc: { project_id: P3, vai_tro_nguoi_nhan: 'worker' },
      },
    ],
  },
  {
    hang: 'Giao việc',
    viec: 'assign',
    vai_tro: 'manager',
    o: 'worker_reviewer_trong_du_an',
    cho_phep: [
      {
        ten: 'cho worker trong dự án',
        bc: { project_id: P1, vai_tro_nguoi_nhan: 'worker', nguoi_nhan_trong_du_an: true },
      },
      {
        ten: 'cho reviewer trong dự án',
        bc: { project_id: P1, vai_tro_nguoi_nhan: 'reviewer', nguoi_nhan_trong_du_an: true },
      },
    ],
    tu_choi: [
      {
        ten: 'cho manager (SPEC chỉ cho worker và reviewer)',
        bc: { project_id: P1, vai_tro_nguoi_nhan: 'manager', nguoi_nhan_trong_du_an: true },
      },
      {
        ten: 'cho coordinator',
        bc: { project_id: P1, vai_tro_nguoi_nhan: 'coordinator', nguoi_nhan_trong_du_an: true },
      },
      {
        ten: 'cho worker NGOÀI dự án',
        bc: { project_id: P1, vai_tro_nguoi_nhan: 'worker', nguoi_nhan_trong_du_an: false },
      },
    ],
  },
  {
    hang: 'Giao việc',
    viec: 'assign',
    vai_tro: 'worker',
    o: 'khong',
    cho_phep: [],
    // Nghiệm thu 17.7: "Token agent worker thử giao việc: FORBIDDEN".
    tu_choi: [
      { ten: 'cho worker khác', bc: { project_id: P1, vai_tro_nguoi_nhan: 'worker' } },
    ],
  },
  {
    hang: 'Giao việc',
    viec: 'assign',
    vai_tro: 'reviewer',
    o: 'khong',
    cho_phep: [],
    tu_choi: [{ ten: 'cho worker', bc: { project_id: P1, vai_tro_nguoi_nhan: 'worker' } }],
  },

  /* --- Hàng 3: Đổi trạng thái ticket ------------------------------ */
  {
    hang: 'Đổi trạng thái ticket',
    viec: 'change_status',
    vai_tro: 'coordinator',
    o: 'co',
    cho_phep: [
      { ten: 'dự án mình quản lý hay không đều được', bc: { project_id: P2 } },
      { ten: 'không cần là ticket của lượt mình', bc: { project_id: P1 } },
    ],
    tu_choi: [{ ten: 'nhưng vẫn phải là dự án được vào', bc: { project_id: P3 } }],
  },
  {
    hang: 'Đổi trạng thái ticket',
    viec: 'change_status',
    vai_tro: 'manager',
    o: 'trong_du_an',
    cho_phep: [
      { ten: 'trong dự án được vào', bc: { project_id: P1 } },
      { ten: 'không cần là dự án mình quản lý', bc: { project_id: P2 } },
    ],
    tu_choi: [
      { ten: 'ngoài dự án được vào', bc: { project_id: P3 } },
      { ten: 'không nêu dự án nào', bc: {} },
    ],
  },
  {
    hang: 'Đổi trạng thái ticket',
    viec: 'change_status',
    vai_tro: 'worker',
    o: 'ticket_cua_luot_minh',
    cho_phep: [
      { ten: 'ticket của lượt mình', bc: { project_id: P1, ticket_cua_luot_minh: true } },
    ],
    tu_choi: [
      { ten: 'ticket KHÔNG thuộc lượt mình', bc: { project_id: P1 } },
      {
        ten: 'ticket của lượt mình nhưng dự án không được vào',
        bc: { project_id: P3, ticket_cua_luot_minh: true },
      },
    ],
  },
  {
    hang: 'Đổi trạng thái ticket',
    viec: 'change_status',
    vai_tro: 'reviewer',
    o: 'khong',
    cho_phep: [],
    tu_choi: [
      { ten: 'kể cả ticket của lượt review mình đang làm', bc: { project_id: P1, ticket_cua_luot_minh: true } },
    ],
  },

  /* --- Hàng 4: Nộp bằng chứng (cả 4 vai trò đều "có") ------------- */
  {
    hang: 'Nộp bằng chứng',
    viec: 'submit_evidence',
    vai_tro: 'coordinator',
    o: 'co',
    cho_phep: [{ ten: 'trong dự án được vào', bc: { project_id: P1 } }],
    tu_choi: [{ ten: 'ngoài dự án được vào', bc: { project_id: P3 } }],
  },
  {
    hang: 'Nộp bằng chứng',
    viec: 'submit_evidence',
    vai_tro: 'manager',
    o: 'co',
    cho_phep: [{ ten: 'trong dự án được vào', bc: { project_id: P1 } }],
    tu_choi: [{ ten: 'ngoài dự án được vào', bc: { project_id: P3 } }],
  },
  {
    hang: 'Nộp bằng chứng',
    viec: 'submit_evidence',
    vai_tro: 'worker',
    o: 'co',
    cho_phep: [{ ten: 'trong dự án được vào', bc: { project_id: P1 } }],
    tu_choi: [{ ten: 'ngoài dự án được vào', bc: { project_id: P3 } }],
  },
  {
    hang: 'Nộp bằng chứng',
    viec: 'submit_evidence',
    vai_tro: 'reviewer',
    o: 'co',
    cho_phep: [{ ten: 'trong dự án được vào', bc: { project_id: P1 } }],
    tu_choi: [{ ten: 'ngoài dự án được vào', bc: { project_id: P3 } }],
  },

  /* --- Hàng 5: Ghi kết quả review (reviewer, và manager từ 13/10) --
   *
   * Ô `manager` đổi từ `khong` thành `trong_du_an` ngày 13/10 (migration 0022
   * khối B, `quyet-dinh.md`): reviewer thật là sub-agent **không có token Baton**,
   * nên trước đó **không ai** mở được điều kiện phụ của cổng (d.215). Luật thêm
   * của ca này (bắt buộc kèm đường dẫn báo cáo reviewer) nằm ở
   * `handlerGuiBangChung` và có ca riêng trong `gui-bang-chung.test.ts`.
   */
  {
    hang: 'Ghi kết quả review',
    viec: 'write_review',
    vai_tro: 'coordinator',
    o: 'co',
    cho_phep: [{ ten: 'coordinator ghi được (từ 14/10)', bc: { project_id: P1 } }],
    tu_choi: [{ ten: 'nhưng vẫn phải trong dự án được vào', bc: { project_id: P3 } }],
  },
  {
    hang: 'Ghi kết quả review',
    viec: 'write_review',
    vai_tro: 'manager',
    o: 'trong_du_an',
    cho_phep: [{ ten: 'manager ghi được trong dự án được vào', bc: { project_id: P1 } }],
    tu_choi: [{ ten: 'nhưng vẫn phải trong dự án được vào', bc: { project_id: P3 } }],
  },
  {
    hang: 'Ghi kết quả review',
    viec: 'write_review',
    vai_tro: 'worker',
    o: 'khong',
    cho_phep: [],
    tu_choi: [{ ten: 'worker không ghi review', bc: { project_id: P1 } }],
  },
  {
    hang: 'Ghi kết quả review',
    viec: 'write_review',
    vai_tro: 'reviewer',
    o: 'co',
    cho_phep: [{ ten: 'reviewer ghi được', bc: { project_id: P1 } }],
    tu_choi: [{ ten: 'nhưng vẫn phải trong dự án được vào', bc: { project_id: P3 } }],
  },

  /* --- Hàng 6: Tạo mục Cần Chủ ----------------------------------- */
  {
    hang: 'Tạo mục Cần Chủ',
    viec: 'create_ask',
    vai_tro: 'coordinator',
    o: 'co',
    cho_phep: [{ ten: 'coordinator tạo được', bc: { project_id: P1 } }],
    tu_choi: [],
  },
  {
    hang: 'Tạo mục Cần Chủ',
    viec: 'create_ask',
    vai_tro: 'manager',
    o: 'co',
    cho_phep: [{ ten: 'manager tạo được', bc: { project_id: P1 } }],
    tu_choi: [],
  },
  {
    hang: 'Tạo mục Cần Chủ',
    viec: 'create_ask',
    vai_tro: 'worker',
    o: 'khong',
    // SPEC mục 8: "Agent `worker` hoặc `reviewer` tạo mục: FORBIDDEN".
    cho_phep: [],
    tu_choi: [{ ten: 'worker không tạo được (SPEC mục 8)', bc: { project_id: P1 } }],
  },
  {
    hang: 'Tạo mục Cần Chủ',
    viec: 'create_ask',
    vai_tro: 'reviewer',
    o: 'khong',
    cho_phep: [],
    tu_choi: [{ ten: 'reviewer không tạo được (SPEC mục 8)', bc: { project_id: P1 } }],
  },

  /* --- Hàng 7: Ghi Nhật ký quyết định ---------------------------- */
  {
    hang: 'Ghi Nhật ký quyết định',
    viec: 'write_decision',
    vai_tro: 'coordinator',
    o: 'co',
    cho_phep: [{ ten: 'coordinator ghi được (SPEC mục 10)', bc: { project_id: P1 } }],
    tu_choi: [],
  },
  {
    hang: 'Ghi Nhật ký quyết định',
    viec: 'write_decision',
    vai_tro: 'manager',
    o: 'co',
    cho_phep: [{ ten: 'manager ghi được (SPEC mục 10)', bc: { project_id: P1 } }],
    tu_choi: [],
  },
  {
    hang: 'Ghi Nhật ký quyết định',
    viec: 'write_decision',
    vai_tro: 'worker',
    o: 'khong',
    cho_phep: [],
    tu_choi: [{ ten: 'worker không ghi Nhật ký', bc: { project_id: P1 } }],
  },
  {
    hang: 'Ghi Nhật ký quyết định',
    viec: 'write_decision',
    vai_tro: 'reviewer',
    o: 'khong',
    cho_phep: [],
    tu_choi: [{ ten: 'reviewer không ghi Nhật ký', bc: { project_id: P1 } }],
  },

  /* --- Hàng 8: Xoá bất cứ thứ gì — KHÔNG BAO GIỜ ----------------- */
  {
    hang: 'Xoá bất cứ thứ gì',
    viec: 'delete_anything',
    vai_tro: 'coordinator',
    o: 'khong_bao_gio',
    cho_phep: [],
    tu_choi: [{ ten: 'không bao giờ', bc: { project_id: P1 } }],
  },
  {
    hang: 'Xoá bất cứ thứ gì',
    viec: 'delete_anything',
    vai_tro: 'manager',
    o: 'khong_bao_gio',
    cho_phep: [],
    tu_choi: [{ ten: 'không bao giờ', bc: { project_id: P1 } }],
  },
  {
    hang: 'Xoá bất cứ thứ gì',
    viec: 'delete_anything',
    vai_tro: 'worker',
    o: 'khong_bao_gio',
    cho_phep: [],
    tu_choi: [{ ten: 'không bao giờ', bc: { project_id: P1 } }],
  },
  {
    hang: 'Xoá bất cứ thứ gì',
    viec: 'delete_anything',
    vai_tro: 'reviewer',
    o: 'khong_bao_gio',
    cho_phep: [],
    tu_choi: [{ ten: 'không bao giờ', bc: { project_id: P1 } }],
  },

  /* --- Hàng 9: Quyết mục Cần Chủ — KHÔNG BAO GIỜ ----------------- */
  {
    hang: 'Quyết mục Cần Chủ',
    viec: 'resolve_ask',
    vai_tro: 'coordinator',
    o: 'khong_bao_gio',
    cho_phep: [],
    tu_choi: [{ ten: 'không bao giờ', bc: { project_id: P1 } }],
  },
  {
    hang: 'Quyết mục Cần Chủ',
    viec: 'resolve_ask',
    vai_tro: 'manager',
    o: 'khong_bao_gio',
    cho_phep: [],
    tu_choi: [{ ten: 'không bao giờ', bc: { project_id: P1 } }],
  },
  {
    hang: 'Quyết mục Cần Chủ',
    viec: 'resolve_ask',
    vai_tro: 'worker',
    o: 'khong_bao_gio',
    cho_phep: [],
    tu_choi: [{ ten: 'không bao giờ', bc: { project_id: P1 } }],
  },
  {
    hang: 'Quyết mục Cần Chủ',
    viec: 'resolve_ask',
    vai_tro: 'reviewer',
    o: 'khong_bao_gio',
    cho_phep: [],
    tu_choi: [{ ten: 'không bao giờ', bc: { project_id: P1 } }],
  },
];

/* ------------------------------------------------------------------ *
 * Bảng ca thử phải phủ **đủ** 36 ô, không thiếu không trùng
 * ------------------------------------------------------------------ */
describe('bảng ca thử phủ đủ bảng SPEC mục 3', () => {
  it('có đúng 36 ô = 9 hàng × 4 vai trò, không ô nào bị khai hai lần', () => {
    expect(O_BANG).toHaveLength(36);
    const khoa = O_BANG.map((o) => `${o.viec}/${o.vai_tro}`);
    expect(new Set(khoa).size).toBe(36);

    // Và phủ đúng tích Descartes của hàng × vai trò trong bảng SPEC.
    const mong_doi: string[] = [];
    for (const viec of Object.keys(VIEC_QUYEN)) {
      for (const vai_tro of ['coordinator', 'manager', 'worker', 'reviewer']) {
        mong_doi.push(`${viec}/${vai_tro}`);
      }
    }
    expect([...khoa].sort()).toEqual([...mong_doi].sort());
  });

  it('mỗi ô không phải "—"/"không bao giờ" đều có ít nhất một ca được phép', () => {
    for (const o of O_BANG) {
      if (o.o === 'khong' || o.o === 'khong_bao_gio') {
        expect(o.cho_phep, `${o.viec}/${o.vai_tro}`).toHaveLength(0);
        expect(o.tu_choi.length, `${o.viec}/${o.vai_tro}`).toBeGreaterThan(0);
      } else {
        expect(o.cho_phep.length, `${o.viec}/${o.vai_tro}`).toBeGreaterThan(0);
      }
    }
  });

  it('mỗi ô có điều kiện phạm vi đều có ca NGOÀI phạm vi bị từ chối', () => {
    const o_co_pham_vi: PhamViQuyen[] = [
      'moi_du_an_duoc_vao',
      'du_an_minh_quan_ly',
      'trong_du_an',
      'ticket_cua_luot_minh',
      'ticket_con_cua_luot_minh',
      'cho_manager_worker_reviewer',
      'worker_reviewer_trong_du_an',
    ];
    for (const o of O_BANG) {
      if (o_co_pham_vi.includes(o.o)) {
        expect(o.tu_choi.length, `${o.viec}/${o.vai_tro} thiếu ca ngoài phạm vi`).toBeGreaterThan(
          0,
        );
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * 36 ô: giá trị ô đúng chữ SPEC
 * ------------------------------------------------------------------ */
describe('SPEC mục 3 — giá trị từng ô của bảng quyền', () => {
  it.each(O_BANG)('ô: hàng "$hang" × $vai_tro = "$o"', ({ viec, vai_tro, o }) => {
    expect(BANG_QUYEN_MAC_DINH[viec][vai_tro]).toBe(o);
    expect(oCuaAgent(AI_THEO_VAI_TRO[vai_tro], viec)).toBe(o);
  });
});

/* ------------------------------------------------------------------ *
 * 36 ô: hành vi của `quyen()`
 * ------------------------------------------------------------------ */
describe('SPEC mục 3 — hành vi từng ô', () => {
  for (const o of O_BANG) {
    for (const ca of o.cho_phep) {
      it(`CHO PHÉP: hàng "${o.hang}" × ${o.vai_tro} (ô "${o.o}") — ${ca.ten}`, () => {
        const kq = quyen(AI_THEO_VAI_TRO[o.vai_tro], o.viec, ca.bc);
        expect(kq.cho_phep, JSON.stringify(kq)).toBe(true);
      });
    }
    for (const ca of o.tu_choi) {
      it(`TỪ CHỐI: hàng "${o.hang}" × ${o.vai_tro} (ô "${o.o}") — ${ca.ten}`, () => {
        const kq = quyen(AI_THEO_VAI_TRO[o.vai_tro], o.viec, ca.bc);
        expect(kq.cho_phep).toBe(false);
        if (!kq.cho_phep) {
          expect(kq.ma).toBe('FORBIDDEN');
          expect(kq.ly_do.length).toBeGreaterThan(0);
        }
      });
    }
  }
});

/* ------------------------------------------------------------------ *
 * Hai hàng "không bao giờ" là tuyệt đối
 * ------------------------------------------------------------------ */
describe('SPEC mục 3 — hai hàng "không bao giờ" là tuyệt đối', () => {
  const VAI_TRO: VaiTroAgent[] = ['coordinator', 'manager', 'worker', 'reviewer'];

  it('hai hàng đó đúng là "Xoá bất cứ thứ gì" và "Quyết mục Cần Chủ"', () => {
    expect([...VIEC_KHONG_BAO_GIO]).toEqual(['delete_anything', 'resolve_ask']);
  });

  it.each(VIEC_KHONG_BAO_GIO)(
    '%s: chủ KHÔNG ghi đè được cho bất kỳ vai trò nào',
    (viec) => {
      for (const vai_tro of VAI_TRO) {
        // Giả sử có bug ở tầng dữ liệu và một dòng ghi đè "cho phép" lọt vào.
        const ai = aiAgent(vai_tro, {
          du_an_duoc_vao: [P1],
          // Khoá tính được (`[viec]`) nên TypeScript không chặn; đó là chủ ý —
          // ở đây cần kiểm hàng rào **lúc chạy**, vì hàng rào lúc biên dịch
          // không bảo vệ được khi dữ liệu tới từ DB.
          ghi_de: { [viec]: { cho_phep: true, pham_vi: 'co' } },
        });
        const kq = quyen(ai, viec, { project_id: P1 });
        expect(kq.cho_phep, `${viec}/${vai_tro} bị ghi đè!`).toBe(false);
        // Và ô hiện hành vẫn là "không bao giờ", không phải "có".
        expect(oCuaAgent(ai, viec)).toBe('khong_bao_gio');
      }
    },
  );

  it.each(VIEC_KHONG_BAO_GIO)('%s: agent bị từ chối kể cả khi bối cảnh trống', (viec) => {
    for (const vai_tro of VAI_TRO) {
      expect(quyen(AI_THEO_VAI_TRO[vai_tro], viec).cho_phep).toBe(false);
    }
  });

  it('nhưng CHỦ thì xoá ticket và quyết mục Cần Chủ được (SPEC mục 4, 8)', () => {
    // "Không bao giờ" là luật cho **agent**. SPEC mục 4: "Xoá ticket: chỉ chủ";
    // mục 8: "Chỉ chủ chuyển trạng thái [mục Cần Chủ]".
    expect(quyen(CHU, 'delete_anything', {}).cho_phep).toBe(true);
    expect(quyen(CHU, 'resolve_ask', {}).cho_phep).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Chủ, agent bị tắt, cờ "tất cả dự án"
 * ------------------------------------------------------------------ */
describe('chủ và các trường hợp chung', () => {
  it('chủ được mọi hàng của bảng quyền (SPEC mục 1 "quyền cao nhất")', () => {
    for (const viec of Object.keys(VIEC_QUYEN) as ViecQuyen[]) {
      expect(quyen(CHU, viec, {}).cho_phep, viec).toBe(true);
    }
  });

  it('chủ không bị cửa dự án chặn', () => {
    expect(quyen(CHU, 'create_ticket', { project_id: 'pj-khong-lien-quan' }).cho_phep).toBe(true);
  });

  it('agent `disabled` bị từ chối mọi việc (SPEC mục 3)', () => {
    const tat = aiAgent('coordinator', { disabled: true, du_an_duoc_vao: [P1] });
    for (const viec of Object.keys(VIEC_QUYEN) as ViecQuyen[]) {
      expect(quyen(tat, viec, { project_id: P1, vai_tro_nguoi_nhan: 'worker' }).cho_phep, viec).toBe(
        false,
      );
    }
  });

  it('cờ "tất cả dự án" cho qua cửa dự án với mọi dự án (SPEC mục 3)', () => {
    const tat_ca = aiAgent('coordinator', { vao_tat_ca_du_an: true, du_an_duoc_vao: [] });
    expect(quyen(tat_ca, 'create_ticket', { project_id: 'pj-moi-toanh' }).cho_phep).toBe(true);
    // Nhưng ô "dự án mình quản lý" vẫn phải là dự án mình quản lý.
    const mgr_tat_ca = aiAgent('manager', { vao_tat_ca_du_an: true, du_an_minh_quan_ly: [P1] });
    expect(quyen(mgr_tat_ca, 'create_ticket', { project_id: P1 }).cho_phep).toBe(true);
    expect(quyen(mgr_tat_ca, 'create_ticket', { project_id: P2 }).cho_phep).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * Chủ chỉnh từng ô — SPEC mục 3 ("mặc định; chủ chỉnh được từng agent")
 * ------------------------------------------------------------------ */
describe('SPEC mục 3 — chủ ghi đè từng ô cho từng agent', () => {
  it('chủ TẮT một ô mà vai trò vốn có', () => {
    const ai = aiAgent('reviewer', {
      du_an_duoc_vao: [P1],
      ghi_de: { write_review: { cho_phep: false, pham_vi: null } },
    });
    expect(oCuaAgent(ai, 'write_review')).toBe('khong');
    expect(quyen(ai, 'write_review', { project_id: P1 }).cho_phep).toBe(false);
  });

  it('chủ BẬT một ô mà vai trò vốn "—"', () => {
    // worker vốn không tạo được mục Cần Chủ (SPEC mục 8); chủ bật riêng cho agent này.
    const ai = aiAgent('worker', {
      du_an_duoc_vao: [P1],
      ghi_de: { create_ask: { cho_phep: true, pham_vi: null } },
    });
    expect(quyen(ai, 'create_ask', { project_id: P1 }).cho_phep).toBe(true);
    // Agent worker khác, không được chỉnh, vẫn bị từ chối: ghi đè là **từng agent**.
    expect(quyen(worker, 'create_ask', { project_id: P1 }).cho_phep).toBe(false);
  });

  it('chủ đổi PHẠM VI của một ô, không chỉ bật/tắt', () => {
    // manager vốn chỉ tạo ticket trong dự án mình quản lý; nới thành mọi dự án được vào.
    const ai = aiAgent('manager', {
      du_an_duoc_vao: [P1, P2],
      du_an_minh_quan_ly: [P1],
      ghi_de: { create_ticket: { cho_phep: true, pham_vi: 'moi_du_an_duoc_vao' } },
    });
    expect(quyen(ai, 'create_ticket', { project_id: P2 }).cho_phep).toBe(true);
    // Nhưng cửa dự án không nới theo.
    expect(quyen(ai, 'create_ticket', { project_id: P3 }).cho_phep).toBe(false);
    // Và manager không được chỉnh thì vẫn bị chặn ở P2.
    expect(quyen(manager, 'create_ticket', { project_id: P2 }).cho_phep).toBe(false);
  });

  it('chủ SIẾT phạm vi của một ô (coordinator "có" → "dự án mình quản lý")', () => {
    const ai = aiAgent('coordinator', {
      du_an_duoc_vao: [P1, P2],
      du_an_minh_quan_ly: [P1],
      ghi_de: { change_status: { cho_phep: true, pham_vi: 'du_an_minh_quan_ly' } },
    });
    expect(quyen(ai, 'change_status', { project_id: P1 }).cho_phep).toBe(true);
    expect(quyen(ai, 'change_status', { project_id: P2 }).cho_phep).toBe(false);
  });

  it('ghi đè chỉ ảnh hưởng đúng ô được chỉnh, các ô khác giữ mặc định', () => {
    const ai = aiAgent('worker', {
      du_an_duoc_vao: [P1],
      ghi_de: { create_ask: { cho_phep: true, pham_vi: null } },
    });
    expect(oCuaAgent(ai, 'create_ask')).toBe('co');
    expect(oCuaAgent(ai, 'create_ticket')).toBe('ticket_con_cua_luot_minh');
    expect(oCuaAgent(ai, 'assign')).toBe('khong');
    expect(oCuaAgent(ai, 'change_status')).toBe('ticket_cua_luot_minh');
  });
});
