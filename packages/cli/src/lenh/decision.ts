/**
 * `baton decision <DỰ ÁN> "<quyết định>" --why "..." [--ref ...]` — SPEC mục 13
 * d.377: "Ghi Nhật ký".
 *
 * ## `--why` là **bắt buộc**
 *
 * d.377 viết `--why "..."` **không trong ngoặc vuông**, trong một bảng mà mọi thứ
 * tuỳ chọn đều có ngoặc vuông (`[--ref ...]` ngay cạnh nó). SPEC mục 10 d.308
 * cũng kể "vì sao" là một trường của mỗi dòng. Thiếu → `INVALID_INPUT` **tại
 * CLI**, không tốn request nào.
 *
 * ## `--ref` — ba loại căn cứ của d.308, nhận ra bằng **hình của chữ**
 *
 * d.308: "căn cứ (link **T-số**, **mã ticket**, **dòng cũ**)". API nhận
 * `can_cu: [{ loai, id }]` với `loai` là `ask` · `ticket` · `dong_cu`, và **id
 * thật**, không phải mã hiển thị. Nên CLI phân loại rồi **đổi mã sang id**:
 *
 *   | `--ref` gõ vào | loại | cách đổi |
 *   |---|---|---|
 *   | `T-18` | `ask` | `GET /v1/can-chu/T-18` → `id` |
 *   | `SAI-7` (mã ticket của mục 1) | `ticket` | `ticketTheoMaHoacId` |
 *   | còn lại | `dong_cu` | coi là **id** một dòng Nhật ký cũ |
 *
 * Nhánh cuối là chỗ duy nhất phải chọn, vì d.308 gọi nó là "dòng cũ" mà mục 10
 * **không cấp mã hiển thị nào** cho một dòng Nhật ký — chỉ có id. Chọn "còn lại
 * là id dòng cũ" thay vì bắt một tiền tố: một id sai vẫn ra `NOT_FOUND` của máy
 * chủ với đúng câu "Không tìm thấy dòng Nhật ký cũ dùng làm căn cứ", tức người
 * gõ vẫn biết mình sai ở đâu. Khai ở `cau-hoi-spec.md` #93.
 *
 * `--ref` **lặp được** (`nhieu_gia_tri`): d.308 kể ba loại căn cứ cho **một**
 * dòng, nên một dòng trỏ được nhiều căn cứ, và bảng con `nhat_ky_can_cu` có cột
 * `thu_tu` đúng cho việc đó.
 *
 * ## Những gì CLI **không** chạm
 *
 * Quyền ghi (`write_decision`: chủ, `coordinator`, `manager` — d.310), luật "chỉ
 * thêm" (d.309, khoá ở trigger DB), và **cảnh báo dữ liệu nhân sự** của d.312.
 * Cảnh báo đó là của máy chủ và nó **không chặn**, nên CLI chỉ in lại —
 * `canh_bao` về rỗng thì không có dòng nào, dòng Nhật ký vẫn đã được ghi.
 *
 * **Dòng "Chung"** (`project_id` rỗng — 19.12 câu 4) **không gõ được từ lệnh
 * này**: d.377 viết `<DỰ ÁN>` không trong ngoặc vuông, tức bắt buộc. Nói thẳng ra
 * thay vì tự thêm một cờ SPEC không có; `cau-hoi-spec.md` #94.
 */

import { batonFetch } from '@baton/client';
import { BatonError, MAU_MA_DU_AN, maSoTuChu, tachMaTicket } from '@baton/shared';
import type { GhiNhatKyRa, KetQuaCanChuRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { duAnTheoMa, ticketTheoMaHoacId } from '../tra-ma.js';

/** Một căn cứ đã đổi sang hình API nhận. */
export interface CanCuCli {
  loai: 'ask' | 'ticket' | 'dong_cu';
  id: string;
  /** Chữ người gõ, để in lại cho người đọc. */
  nhu_go: string;
}

/** Loại của một `--ref` theo **hình của chữ** — bảng ở khối chú thích đầu file. */
export function loaiCanCuTuChu(tho: string): 'ask' | 'ticket' | 'dong_cu' {
  if (maSoTuChu(tho) !== null) return 'ask';
  if (tachMaTicket(tho) !== null) return 'ticket';
  return 'dong_cu';
}

export const LENH_DECISION: LenhCli = {
  khai: {
    ten: 'decision',
    vi_tri: ['DỰ ÁN', 'quyết định'],
    co: { why: 'gia_tri', ref: 'nhieu_gia_tri' },
  },

  chay: async ({ cauHinh }, ts) => {
    const ma_du_an = ts.vi_tri[0] ?? '';
    const quyet_dinh = ts.vi_tri[1] ?? '';
    const vi_sao = ts.gia_tri['why'];
    const ref = ts.nhieu['ref'] ?? [];

    if (vi_sao === undefined) {
      throw new BatonError('INVALID_INPUT', {
        message: 'Thiếu --why: mỗi dòng Nhật ký bắt buộc có "vì sao" (SPEC mục 10 d.308).',
      });
    }
    if (!MAU_MA_DU_AN.test(ma_du_an)) {
      throw new BatonError('INVALID_INPUT', {
        message: `"${ma_du_an}" không phải mã dự án (mã gồm 2–6 chữ A–Z).`,
      });
    }

    const du_an = await duAnTheoMa(cauHinh, ma_du_an);

    const can_cu: CanCuCli[] = [];
    for (const tho of ref) {
      const loai = loaiCanCuTuChu(tho);
      if (loai === 'ticket') {
        const t = await ticketTheoMaHoacId(cauHinh, tho);
        can_cu.push({ loai, id: t.id, nhu_go: `${t.ma} — ${t.tieu_de}` });
        continue;
      }
      if (loai === 'ask') {
        const m = await batonFetch<KetQuaCanChuRa>(cauHinh, {
          method: 'GET',
          path: `/v1/can-chu/${encodeURIComponent(tho)}`,
        });
        can_cu.push({ loai, id: m.id, nhu_go: `${m.ma} — ${m.tieu_de}` });
        continue;
      }
      can_cu.push({ loai, id: tho, nhu_go: `dòng Nhật ký ${tho}` });
    }

    const kq = await batonFetch<GhiNhatKyRa>(cauHinh, {
      method: 'POST',
      path: '/v1/nhat-ky',
      body: {
        project_id: du_an.id,
        quyet_dinh,
        vi_sao,
        ...(can_cu.length === 0
          ? {}
          : { can_cu: can_cu.map((c) => ({ loai: c.loai, id: c.id })) }),
      },
    });

    const dong: string[] = [
      `Đã ghi một dòng Nhật ký quyết định: ${kq.id}`,
      `Dự án: ${du_an.ma} — ${du_an.ten}`,
      `Quyết định: ${kq.quyet_dinh}`,
      `Vì sao: ${kq.vi_sao}`,
      `Người: ${kq.nguoi_loai === 'chu' ? 'chủ' : (kq.agent_id ?? 'agent')}`,
      `Lúc: ${new Date(kq.luc).toISOString()}`,
    ];
    for (const c of can_cu) dong.push(`Căn cứ: ${c.nhu_go}`);
    for (const cb of kq.canh_bao) {
      // d.312: **chỉ cảnh báo, không chặn** — dòng đã được ghi ở trên.
      dong.push(`Cảnh báo dữ liệu (SPEC mục 10 d.312, không chặn): ${cb.message}`);
    }
    // d.309: "Chỉ thêm. Không sửa, không xoá, kể cả chủ."
    dong.push('Nhật ký chỉ thêm: dòng này không sửa và không xoá được (SPEC mục 10 d.309).');

    return { json: kq, dong };
  },
};
