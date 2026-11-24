/**
 * `baton rules` — trang **"Luật chung"** của workspace, SPEC mục 9 d.301.
 *
 * d.301 nói thẳng: *"trang **"Luật chung"**, gồm danh sách cấm chung và checklist
 * trước khi giao. **Agent đọc được qua CLI hoặc MCP**."* Đó là vế duy nhất của
 * mục 9 mà SPEC **chỉ định tên đường đọc** — nên nó phải là một lệnh, không chỉ
 * một khối trong `baton profile`.
 *
 * ## Vì sao một lệnh RIÊNG, dù `profile` đã in Luật chung
 *
 * Luật chung là của **workspace**, không của một dự án: `baton profile SAI` bắt
 * agent phải biết một mã dự án trước khi đọc được luật chung — và một agent chưa
 * được vào dự án nào thì không có mã nào để gõ. Lệnh này không nhận tham số.
 *
 * **MCP có nó miễn phí.** Bảng công cụ MCP sinh từ `SO_LENH` (`mcp/cong-cu.ts`,
 * d.355 "cùng tên"), nên thêm lệnh ở đây là xong cả hai đường mà d.301 kể.
 */

import { batonFetch } from '@baton/client';
import type { LuatChungRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { dongLuatChung } from '../ho-so-md.js';

export const LENH_RULES: LenhCli = {
  khai: { ten: 'rules', vi_tri: [], co: {} },

  chay: async ({ cauHinh }) => {
    const luat_chung = await batonFetch<LuatChungRa>(cauHinh, {
      method: 'GET',
      path: '/v1/luat-chung',
    });
    return { json: luat_chung, dong: dongLuatChung(luat_chung) };
  },
};
