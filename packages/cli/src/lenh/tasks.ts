/**
 * `baton tasks [--wait 60]` — SPEC mục 13 d.360: "Liệt kê lượt giao `pending`
 * hoặc `in_progress` của mình; `--wait` thì chờ tới khi có".
 *
 * Bốn thứ trong một lần gọi, đúng những thứ `GET /v1/tasks` trả (xem
 * `api/src/doc-viec.ts`): lượt giao của mình; **câu hỏi chờ mình trả lời** (19.6
 * "câu hỏi hiện trong `baton tasks` của người giao"); **tín hiệu** (`STOP` →
 * **mã thoát 3**, d.380); và `resolved_asks` của mục 8 d.268.
 *
 * `--wait` là **chế độ chờ dài tới 60 giây** (d.352). Trần nằm ở **server**
 * (`msChoDai` kẹp về 60 và trả lại `cho_toi_da_giay`), nên CLI **không** chép
 * con số đó thành một luật thứ hai — nó chỉ chặn thứ không phải số giây. Hết giờ
 * mà không có gì thì `het_gio: true` và **mã thoát 0**: "không có việc" là một
 * câu trả lời đúng, không phải lỗi (mã 4 của 19.9 d.543 thuộc `baton result`).
 *
 * `tasks` là lệnh **ĐỌC**, nên nó **không** nhích tín hiệu của phiên — 19.12 câu
 * 53. Muốn giữ phiên sống thì gửi `baton heartbeat`.
 */

import { batonFetch } from '@baton/client';
import { BatonError } from '@baton/shared';
import { tenNguoi, type ViecCuaToiRa } from '../kieu-api.js';
import type { LenhCli } from '../lenh.js';
import { dongTinHieu, maThoatCuaTinHieu } from '../tin-hieu.js';

/**
 * `--wait` thành số giây. Chỉ chữ số: chặn `-1`, `1.5`, `60s`, `abc` ngay ở CLI
 * (mã thoát 1) thay vì tốn một request để server nói cùng điều đó.
 *
 * **Không** kẹp ở 60: đó là trần tài nguyên của server, và server trả
 * `cho_toi_da_giay` để client thấy mình bị kẹp (xem `msChoDai`).
 */
export function kiemWait(tho: string | undefined): string | undefined {
  if (tho === undefined) return undefined;
  if (!/^\d+$/.test(tho.trim())) {
    throw new BatonError('INVALID_INPUT', {
      message: `--wait phải là số giây nguyên không âm, nhận được "${tho}".`,
    });
  }
  return tho.trim();
}

export const LENH_TASKS: LenhCli = {
  khai: { ten: 'tasks', vi_tri: [], co: { wait: 'gia_tri' } },

  chay: async ({ cauHinh }, ts) => {
    const wait = kiemWait(ts.gia_tri['wait']);

    const viec = await batonFetch<ViecCuaToiRa>(cauHinh, {
      method: 'GET',
      path: '/v1/tasks',
      query: { wait },
    });

    const dong: string[] = [];

    dong.push(`Lượt giao của tôi (${String(viec.luot_giao.length)}):`);
    if (viec.luot_giao.length === 0) dong.push('  (không có lượt giao nào đang chờ)');
    for (const l of viec.luot_giao) {
      dong.push(
        `  ${l.id} · #${String(l.so_luot)} ${l.nhan_loai} (${l.loai}) · ` +
          `${l.nhan_trang_thai} (${l.trang_thai}) · người giao ${tenNguoi(l.nguoi_giao)}` +
          `${l.khong_phan_hoi ? ' · KHÔNG PHẢN HỒI (quá hạn)' : ''}`,
      );
      const muc_tieu = l.brief['muc_tieu'];
      if (muc_tieu !== null && muc_tieu !== undefined && muc_tieu !== '') {
        dong.push(`      mục tiêu: ${muc_tieu.split('\n')[0] ?? ''}`);
      }
    }

    // 19.6: câu hỏi của agent hiện trong `baton tasks` của **người giao**.
    dong.push('', `Câu hỏi chờ tôi trả lời (${String(viec.cau_hoi.length)}):`);
    if (viec.cau_hoi.length === 0) dong.push('  (không có câu hỏi nào)');
    for (const c of viec.cau_hoi) {
      dong.push(
        `  lượt ${c.luot_giao_id} · ${c.agent_id} hỏi${c.qua_han ? ' · QUÁ 60 PHÚT' : ''}: ` +
          c.noi_dung,
      );
      dong.push('      trả lời: baton reply ' + c.luot_giao_id + ' "<nội dung>"');
    }

    if (viec.phien.length > 0) {
      dong.push('', `Phiên của tôi đang mở (${String(viec.phien.length)}):`);
      for (const p of viec.phien) {
        dong.push(
          `  ${p.id} · lượt ${p.luot_giao_id} · ${p.nhan_trang_thai} (${p.trang_thai})`,
        );
      }
    }

    // Mục 8 d.268 — kết quả Cần Chủ agent chưa chắc đã thấy.
    if (viec.resolved_asks.length > 0) {
      dong.push('', `Kết quả Cần Chủ (${String(viec.resolved_asks.length)}):`);
      for (const m of viec.resolved_asks) {
        dong.push(
          `  ${m.ma} ${m.tieu_de} — ${m.ket_qua ?? m.ly_do_bo_qua ?? '(không có chữ)'} ` +
            `(${m.trang_thai})`,
        );
      }
    }

    const tin_hieu = dongTinHieu(viec.tin_hieu);
    if (tin_hieu.length > 0) dong.push('', ...tin_hieu);

    if (viec.het_gio) {
      dong.push(
        '',
        `Đã chờ ${String(Math.round(viec.da_cho_ms / 1000))} giây, không có việc mới ` +
          `(trần chờ của máy chủ: ${String(viec.cho_toi_da_giay)} giây).`,
      );
    }

    /*
     * `exactOptionalPropertyTypes` bật, nên `ma_thoat: undefined` **không** gán
     * được — trường chỉ có mặt khi thật sự khác 0. Cùng nếp với `docCauHinh`.
     */
    const ma_thoat = maThoatCuaTinHieu(viec.tin_hieu);
    return { json: viec, dong, ...(ma_thoat === undefined ? {} : { ma_thoat }) };
  },
};
