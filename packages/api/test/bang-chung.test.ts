/**
 * **Bằng chứng và cổng vào Xong** — SPEC mục 7 (bảng d.204–211, cổng d.213–217,
 * xác minh d.219–223), 19.3, 19.7, 19.10, 19.11, 19.12 câu 5.
 *
 * Bố cục, theo đúng thứ tự một luật đi qua hệ:
 *   A. **Bảng "Loại bằng chứng"** — một phía là chữ literal đọc từ SPEC.
 *   B. **Schema** (migration 0009): CHECK, trigger d.222, index của Cron.
 *   C. **Kiểm hợp lệ** của `@baton/shared`: hash commit, và luật bảo mật d.207.
 *   D. **Cổng — luật thuần** (`congXong`): từng gạch của d.213–217 + 19.3 + 19.11.
 *   E. **Cổng — qua D1** (`congBangChungCua`): đọc đúng thứ đã ghi.
 *   F. **Cổng — qua HTTP thật**: ticket vào Xong được vì có bằng chứng thật.
 *
 * Mỗi khẳng định "không mở cổng" đều có một ca **đối chứng** ngay cạnh (cùng dữ
 * liệu, đổi đúng một thứ, rồi cổng mở): một `expect(du).toBe(false)` không có đối
 * chứng thì xanh cả khi hàm luôn trả `false`.
 */

import { env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  CHO_THU_LAI_MS,
  DAI_HASH_COMMIT_TOI_THIEU,
  LOAI_BANG_CHUNG,
  LY_DO_KHONG_CODE_CHO_CHU_XAC_NHAN,
  LY_DO_KHONG_CODE_THIEU_FILE_NOTE,
  LY_DO_REVIEW_CUA_NGUOI_LAM,
  LY_DO_REVIEW_HET_HIEU_LUC,
  LY_DO_THIEU_COMMIT_HOAC_DEPLOY,
  LY_DO_THIEU_REVIEW_DAT,
  SO_LAN_THU_TOI_DA,
  THEO_DOI_COMMIT_MS,
  bonSoIpv4,
  congXong,
  kiemBangChungCommit,
  kiemBangChungDeploy,
  kiemNoiDungBangChung,
  laHostBiChan,
  moDuocCong,
  nhomIpv6,
  xacMinhBanDau,
  xacMinhHienThi,
  type BangChungChoCong,
  type BoiCanhCong,
  type LoaiBangChung,
} from '@baton/shared';
import { congBangChungCua } from '../src/cong-bang-chung.js';
import { chuDaXacNhan } from '../src/muc-xac-nhan.js';
import {
  TOKEN_CHU,
  WS,
  dungBangChung,
  dungDuAn,
  dungTicket,
  dungWorkspace,
  goiApi,
  trangThaiCua,
} from './giup.js';
import { caQuaSo, soRequestBay } from './cho-toi.js';

// Cả thân mỗi ca/`beforeEach` đi qua sổ `bay` (BAT-54, khuôn BAT-53, xem `caQuaSo`):
// ca hết giờ không để request còn dở của thân dựng lại DO/D1 lúc pool pop storage.
const bay = soRequestBay();
afterEach(bay.doiHet);
const { it, beforeEach } = caQuaSo(bay);

const P = 'pj-SAI';
const TK = 'tk-pj-SAI-1';

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn('SAI', 'Sample');
  await dungTicket(P, 1, 'Việc có bằng chứng', { trang_thai: 'verifying' });
});

/* ================================================================== *
 * A. Bảng "Loại bằng chứng" — SPEC d.204–211
 * ================================================================== */

describe('mục 7 d.204–211 — bảng "Loại bằng chứng"', () => {
  /**
   * **Chữ literal đọc từ SPEC**, không sinh từ mã sản phẩm. Phía kia của mọi
   * khẳng định dưới đây sinh từ mã (`LOAI_BANG_CHUNG`, CHECK của 0009,
   * `xacMinhBanDau`, `moDuocCong`). Hai phía cùng nguồn là khẳng định vòng quanh,
   * xanh vĩnh viễn kể cả khi cả hai cùng sai.
   */
  const BANG_SPEC = [
    { loai: 'commit', xac_minh_ban_dau: 'pending', mo_cong: true },
    { loai: 'deploy', xac_minh_ban_dau: 'pending', mo_cong: true },
    { loai: 'review', xac_minh_ban_dau: 'not_required', mo_cong: false },
    { loai: 'test', xac_minh_ban_dau: 'not_required', mo_cong: false },
    { loai: 'file', xac_minh_ban_dau: 'not_required', mo_cong: false },
    { loai: 'note', xac_minh_ban_dau: 'not_required', mo_cong: false },
  ] as const;

  it('đúng SÁU loại của SPEC 0.1, cộng ĐÚNG MỘT mã Baton thêm (`bao_cao`, T-31 #161)', () => {
    expect(Object.keys(LOAI_BANG_CHUNG).sort()).toEqual(
      [...BANG_SPEC.map((d) => d.loai), 'bao_cao'].sort(),
    );
  });

  it('DB nhận đúng sáu loại đó, và từ chối mã lạ (CHECK của 0009)', async () => {
    for (const { loai } of BANG_SPEC) {
      await expect(dungBangChung(`ev-${loai}`, TK, loai)).resolves.toBe(`ev-${loai}`);
    }
    await expect(
      dungBangChung('ev-la', TK, 'screenshot' as unknown as LoaiBangChung),
    ).rejects.toThrow();
  });

  for (const { loai, xac_minh_ban_dau } of BANG_SPEC) {
    it(`\`${loai}\`: xác minh lúc vừa gửi là \`${xac_minh_ban_dau}\``, () => {
      expect(xacMinhBanDau(loai)).toBe(xac_minh_ban_dau);
    });
  }

  for (const { loai, mo_cong } of BANG_SPEC) {
    it(`\`${loai}\`: ${mo_cong ? 'CÓ' : 'KHÔNG'} tự mở cổng Xong`, () => {
      // Dựng bằng chứng ở trạng thái "tốt nhất có thể" của loại đó: nếu nó vẫn
      // không mở cổng thì đúng là loại đó không bao giờ mở.
      const tot_nhat: BangChungChoCong = {
        loai,
        gui_luc: 1_000,
        rut_luc: null,
        xac_minh:
          loai === 'commit' ? 'merged' : loai === 'deploy' ? 'passed' : 'not_required',
        ...(loai === 'review' ? { ket_luan: 'pass' as const } : {}),
      };
      expect(moDuocCong(tot_nhat)).toBe(mo_cong);
    });
  }

  it('`commit` chỉ `merged` mở cổng — `pushed` thì KHÔNG (d.206)', () => {
    const goc: BangChungChoCong = {
      loai: 'commit',
      gui_luc: 1_000,
      rut_luc: null,
      xac_minh: 'pushed',
    };
    expect(moDuocCong(goc)).toBe(false);
    // ĐỐI CHỨNG: cùng commit, đổi `pushed` → `merged` thì mở.
    expect(moDuocCong({ ...goc, xac_minh: 'merged' })).toBe(true);
  });

  it('`commit`/`deploy` đang `pending` hoặc `failed` KHÔNG mở cổng (d.219–220)', () => {
    for (const xac_minh of ['pending', 'failed'] as const) {
      expect(moDuocCong({ loai: 'commit', gui_luc: 1, rut_luc: null, xac_minh })).toBe(false);
      expect(moDuocCong({ loai: 'deploy', gui_luc: 1, rut_luc: null, xac_minh })).toBe(false);
    }
  });

  it('bằng chứng đã RÚT không mở cổng, dù là commit `merged` (d.222)', () => {
    const merged: BangChungChoCong = {
      loai: 'commit',
      gui_luc: 1_000,
      rut_luc: null,
      xac_minh: 'merged',
    };
    expect(moDuocCong(merged)).toBe(true);
    expect(moDuocCong({ ...merged, rut_luc: 2_000 })).toBe(false);
  });

  it('`withdrawn` là mã HIỂN THỊ, suy ra từ `rut_luc` — không lưu vào `xac_minh` (0.1, d.222)', () => {
    expect(xacMinhHienThi({ xac_minh: 'merged', rut_luc: null })).toBe('merged');
    // Rút rồi: hiện "Đã rút", **nhưng** `xac_minh` đã lưu vẫn là `merged` — không
    // bị ghi đè, đúng d.222 ("không sửa").
    expect(xacMinhHienThi({ xac_minh: 'merged', rut_luc: 9 })).toBe('withdrawn');
  });

  it('DB TỪ CHỐI `xac_minh = withdrawn` (một nguồn sự thật cho việc rút)', async () => {
    await expect(
      dungBangChung('ev-w', TK, 'note', { xac_minh: 'withdrawn' as never }),
    ).rejects.toThrow();
  });
});

/* ================================================================== *
 * B. Schema — migration 0009
 * ================================================================== */

describe('migration 0009 — luật của SPEC được ép ở tầng DB', () => {
  it('bảng `evidence` tồn tại và có `workspace_id` (SPEC mục 1, 18)', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(evidence)').all<{ name: string }>();
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((r) => r.name)).toContain('workspace_id');
  });

  it('`workspace_id` phải khớp `ticket.workspace_id` (trigger `tg_evidence_ws_*`)', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO evidence
           (id, workspace_id, ticket_id, loai, nguoi_gui_loai, gui_luc, xac_minh, tao_luc, cap_nhat_luc)
         VALUES ('ev-x', 'ws-khong-khop', ?, 'note', 'owner', 1, 'not_required', 1, 1)`,
      )
        .bind(TK)
        .run(),
    ).rejects.toThrow(/cung workspace/);
  });

  it('`gui_luc` là BẮT BUỘC — 19.3 là luật về thứ tự thời gian', async () => {
    const { results } = await env.DB.prepare('PRAGMA table_info(evidence)').all<{
      name: string;
      notnull: number;
    }>();
    expect(results.find((r) => r.name === 'gui_luc')?.notnull).toBe(1);
  });

  it('hash commit < 7 ký tự bị DB từ chối (d.206)', async () => {
    await expect(dungBangChung('ev-c', TK, 'commit', { commit_hash: 'a1b2c3' })).rejects.toThrow();
    // ĐỐI CHỨNG: đúng 7 ký tự thì nhận.
    await expect(dungBangChung('ev-c7', TK, 'commit', { commit_hash: 'a1b2c3d' })).resolves.toBe(
      'ev-c7',
    );
  });

  it('`commit` KHÔNG nhận `passed` (chỉ `pending`/`pushed`/`merged`/`failed` — d.206)', async () => {
    await expect(
      dungBangChung('ev-cp', TK, 'commit', { xac_minh: 'passed' }),
    ).rejects.toThrow();
    await expect(dungBangChung('ev-cm', TK, 'commit', { xac_minh: 'merged' })).resolves.toBe(
      'ev-cm',
    );
  });

  it('`note` KHÔNG nhận `passed` — "không cần xác minh" khác "đã xác minh đạt" (#55)', async () => {
    await expect(dungBangChung('ev-np', TK, 'note', { xac_minh: 'passed' })).rejects.toThrow();
    await expect(dungBangChung('ev-nn', TK, 'note', { xac_minh: 'not_required' })).resolves.toBe(
      'ev-nn',
    );
  });

  it('`pushed`/`merged` chỉ dùng được cho `commit` (SPEC 0.1)', async () => {
    await expect(dungBangChung('ev-dp', TK, 'deploy', { xac_minh: 'merged' })).rejects.toThrow();
  });

  it('mốc theo dõi 7 ngày chỉ có nghĩa cho commit đang `pushed` (19.7)', async () => {
    await expect(
      dungBangChung('ev-td', TK, 'note', { theo_doi_den_luc: Date.now() + THEO_DOI_COMMIT_MS }),
    ).rejects.toThrow();
    await expect(
      dungBangChung('ev-td2', TK, 'commit', {
        xac_minh: 'pushed',
        theo_doi_den_luc: Date.now() + THEO_DOI_COMMIT_MS,
      }),
    ).resolves.toBe('ev-td2');
  });

  it('số lần thử tối đa là 3 (d.220)', async () => {
    await expect(
      dungBangChung('ev-t4', TK, 'commit', { xac_minh: 'failed', so_lan_thu: 4 }),
    ).rejects.toThrow();
    await expect(
      dungBangChung('ev-t3', TK, 'commit', {
        xac_minh: 'failed',
        so_lan_thu: SO_LAN_THU_TOI_DA,
        ly_do: 'GitHub API 500 ba lần',
      }),
    ).resolves.toBe('ev-t3');
  });

  it('`ly_do` chỉ có nghĩa khi `pending` hoặc `failed` (d.220)', async () => {
    await expect(
      dungBangChung('ev-lm', TK, 'commit', { xac_minh: 'merged', ly_do: 'không rõ vì sao' }),
    ).rejects.toThrow();
  });

  it('mỗi loại bắt buộc trường của chính nó (từng dòng d.204–211)', async () => {
    const thieu: [string, string][] = [
      ['commit', 'commit_hash'],
      ['deploy', 'url'],
      ['review', 'ket_luan'],
      ['test', 'tom_tat'],
      ['file', 'duong_dan'],
      ['note', 'noi_dung'],
    ];
    for (const [loai] of thieu) {
      // Chèn thô, cố tình **không** điền trường bắt buộc của loại đó.
      await expect(
        env.DB.prepare(
          `INSERT INTO evidence
             (id, workspace_id, ticket_id, loai, nguoi_gui_loai, gui_luc, xac_minh, tao_luc, cap_nhat_luc)
           VALUES (?, ?, ?, ?, 'owner', 1, ?, 1, 1)`,
        )
          .bind(`ev-thieu-${loai}`, WS, TK, loai, xacMinhBanDau(loai as LoaiBangChung))
          .run(),
      ).rejects.toThrow();
    }
  });

  it('cặp "ai" nhất quán: `agent` phải có `agent_id`, `owner` thì không', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO evidence
           (id, workspace_id, ticket_id, loai, nguoi_gui_loai, nguoi_gui_agent_id, gui_luc, xac_minh, noi_dung, tao_luc, cap_nhat_luc)
         VALUES ('ev-ai', ?, ?, 'note', 'agent', NULL, 1, 'not_required', 'x', 1, 1)`,
      )
        .bind(WS, TK)
        .run(),
    ).rejects.toThrow();
  });

  /* --- d.222: không sửa, không xoá ---------------------------------- */

  it('d.222: bằng chứng KHÔNG XOÁ được', async () => {
    await dungBangChung('ev-1', TK, 'note');
    await expect(
      env.DB.prepare('DELETE FROM evidence WHERE id = ?').bind('ev-1').run(),
    ).rejects.toThrow(/khong xoa duoc/);
  });

  it('d.222: nội dung bằng chứng KHÔNG SỬA được', async () => {
    await dungBangChung('ev-2', TK, 'commit', { commit_hash: 'a1b2c3d4e5f6' });
    for (const [cot, gia_tri] of [
      ['commit_hash', 'ffffffffffff'],
      ['repo', 'ke-khac/repo'],
      ['gui_luc', 999],
      ['loai', 'note'],
    ] as const) {
      await expect(
        env.DB.prepare(`UPDATE evidence SET ${cot} = ? WHERE id = ?`).bind(gia_tri, 'ev-2').run(),
      ).rejects.toThrow(/khong sua duoc/);
    }
  });

  it('d.219–220: kết quả XÁC MINH vẫn ghi được (đối chứng của ca trên)', async () => {
    // Nếu ca này đỏ thì trigger d.222 khoá luôn việc xác minh — tức bảng không
    // dùng được cho đúng việc SPEC mô tả.
    await dungBangChung('ev-3', TK, 'commit', { xac_minh: 'pending' });
    await env.DB.prepare('UPDATE evidence SET xac_minh = ?, xac_minh_luc = ? WHERE id = ?')
      .bind('merged', Date.now(), 'ev-3')
      .run();
    const d = await env.DB.prepare('SELECT xac_minh FROM evidence WHERE id = ?')
      .bind('ev-3')
      .first<{ xac_minh: string }>();
    expect(d?.xac_minh).toBe('merged');
  });

  it('d.222: rút lại là MỘT CHIỀU — gỡ rút bị chặn', async () => {
    await dungBangChung('ev-4', TK, 'note', { rut_luc: Date.now() });
    await expect(
      env.DB.prepare('UPDATE evidence SET rut_luc = NULL WHERE id = ?').bind('ev-4').run(),
    ).rejects.toThrow(/da rut lai/);
  });

  it('d.222: rút lại BẮT BUỘC có lý do và có người rút', async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO evidence
           (id, workspace_id, ticket_id, loai, nguoi_gui_loai, gui_luc, xac_minh, noi_dung,
            rut_luc, tao_luc, cap_nhat_luc)
         VALUES ('ev-5', ?, ?, 'note', 'owner', 1, 'not_required', 'x', 2, 1, 1)`,
      )
        .bind(WS, TK)
        .run(),
    ).rejects.toThrow();
  });

  /* --- Index: hai truy vấn thật ------------------------------------- */

  async function keHoach(sql: string, bind: (string | number)[]): Promise<string> {
    const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...bind)
      .all<{ detail: string }>();
    return results.map((r) => r.detail).join(' | ');
  }

  it('(a) cổng đọc bằng chứng của MỘT ticket theo thứ tự thời gian → dùng index, không sắp B-tree tạm', async () => {
    const kh = await keHoach(
      'SELECT loai, gui_luc, xac_minh, rut_luc, ket_luan FROM evidence WHERE workspace_id = ? AND ticket_id = ? ORDER BY gui_luc, id',
      [WS, TK],
    );
    expect(kh).toContain('ix_evidence_ticket');
    expect(kh).not.toContain('SCAN evidence');
    expect(kh).not.toContain('TEMP B-TREE');
  });

  it('(b) Cron quét bằng chứng `pending` đến hạn thử lại → đi theo index riêng phần, KHÔNG quét bảng', async () => {
    const kh = await keHoach(
      "SELECT id FROM evidence WHERE xac_minh = 'pending' AND thu_lai_luc IS NOT NULL AND thu_lai_luc <= ? ORDER BY thu_lai_luc, id LIMIT 100",
      [Date.now()],
    );
    expect(kh).toContain('ix_evidence_thu_lai');
    expect(kh).not.toContain('SCAN evidence');
  });

  it('(c) Cron kiểm lại commit `pushed` còn trong 7 ngày → đi theo index riêng phần', async () => {
    const kh = await keHoach(
      "SELECT id FROM evidence WHERE xac_minh = 'pushed' AND theo_doi_den_luc IS NOT NULL AND theo_doi_den_luc > ? ORDER BY theo_doi_den_luc, id LIMIT 100",
      [Date.now()],
    );
    expect(kh).toContain('ix_evidence_theo_doi');
    expect(kh).not.toContain('SCAN evidence');
  });

  it('hằng số thời gian đúng chữ SPEC: thử lại 5 phút, theo dõi 7 ngày, tối đa 3 lần', () => {
    expect(CHO_THU_LAI_MS).toBe(5 * 60 * 1000);
    expect(THEO_DOI_COMMIT_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(SO_LAN_THU_TOI_DA).toBe(3);
  });
});

/* ================================================================== *
 * C. Kiểm hợp lệ — SPEC d.206, d.207, 19.12 câu 5
 * ================================================================== */

describe('d.206 — `commit`: hash ≥ 7 ký tự, repo lấy từ hồ sơ dự án nếu không ghi', () => {
  it('hash đúng 7 ký tự hex được nhận', () => {
    expect(kiemBangChungCommit({ commit_hash: 'a1b2c3d' }, 'chu/baton')).toMatchObject({
      loai: 'commit',
      commit_hash: 'a1b2c3d',
      repo: 'chu/baton',
    });
  });

  it(`hash ${String(DAI_HASH_COMMIT_TOI_THIEU - 1)} ký tự bị từ chối`, () => {
    expect(() => kiemBangChungCommit({ commit_hash: 'a1b2c3' }, 'chu/baton')).toThrow(
      /ít nhất 7 ký tự/,
    );
  });

  it('hash không phải chữ hex bị từ chối (hình dạng, không chỉ độ dài)', () => {
    // 12 ký tự, đủ dài, nhưng `ghijkl` không phải hex — một "hash" như vậy không
    // bao giờ tra được, nên nhận nó vào là nhận một dòng mãi mãi `pending`.
    expect(() => kiemBangChungCommit({ commit_hash: 'ghijklmnopqr' }, 'chu/baton')).toThrow(
      /chữ hex/,
    );
  });

  it('hash hơn 64 ký tự bị từ chối (dài nhất là SHA-256)', () => {
    expect(() => kiemBangChungCommit({ commit_hash: 'a'.repeat(65) }, 'chu/baton')).toThrow();
  });

  it('không ghi repo → lấy repo của hồ sơ dự án (d.206)', () => {
    expect(kiemBangChungCommit({ commit_hash: 'a1b2c3d4' }, 'chu/baton').repo).toBe('chu/baton');
  });

  it('ghi repo → repo của bằng chứng thắng repo mặc định', () => {
    expect(
      kiemBangChungCommit({ commit_hash: 'a1b2c3d4', repo: 'chu/khac' }, 'chu/baton').repo,
    ).toBe('chu/khac');
  });

  it('cả hai repo đều rỗng → `INVALID_INPUT`', () => {
    expect(() => kiemBangChungCommit({ commit_hash: 'a1b2c3d4' }, null)).toThrow(/repo/);
    expect(() => kiemBangChungCommit({ commit_hash: 'a1b2c3d4', repo: '   ' }, '  ')).toThrow(
      /repo/,
    );
  });
});

describe('d.207 — `deploy`: chỉ https, KHÔNG localhost hay IP nội bộ (luật bảo mật)', () => {
  it('URL https công khai được nhận', () => {
    expect(kiemBangChungDeploy({ url: 'https://baton.example.com/khoe' })).toMatchObject({
      loai: 'deploy',
      ma_phien_ban: null,
    });
  });

  for (const url of [
    'http://baton.example.com/',
    'file:///etc/passwd',
    'data:text/plain,xin-chao',
    'ftp://baton.example.com/',
    'gopher://baton.example.com/',
    'javascript:alert(1)',
  ]) {
    it(`KHÔNG nhận sơ đồ khác https: ${url}`, () => {
      expect(() => kiemBangChungDeploy({ url })).toThrow(/https/);
    });
  }

  /**
   * **Từng dải một ca.** Một hàm chặn 8 dải mà chỉ có 1 ca test thì 7 dải còn lại
   * là lời khẳng định không ai kiểm — và dải không ai kiểm ở đây là
   * `169.254.169.254`, tức máy chủ metadata cấp credential của nhà cung cấp cloud.
   */
  const DAI_PHAI_CHAN: [string, string][] = [
    ['localhost', 'https://localhost/'],
    ['localhost có cổng', 'https://localhost:8787/'],
    ['127.0.0.0/8 — 127.0.0.1', 'https://127.0.0.1/'],
    ['127.0.0.0/8 — 127.1.2.3', 'https://127.1.2.3/'],
    ['::1 (IPv6 loopback)', 'https://[::1]/'],
    ['::1 viết dài', 'https://[0:0:0:0:0:0:0:1]/'],
    ['10.0.0.0/8', 'https://10.0.0.5/'],
    ['172.16.0.0/12 — biên dưới', 'https://172.16.0.1/'],
    ['172.16.0.0/12 — biên trên', 'https://172.31.255.254/'],
    ['192.168.0.0/16', 'https://192.168.1.1/'],
    ['169.254.0.0/16 (metadata cloud)', 'https://169.254.169.254/latest/meta-data/'],
    ['0.0.0.0', 'https://0.0.0.0/'],
    ['0.0.0.0/8 — 0.1.2.3', 'https://0.1.2.3/'],
    ['tên miền không có dấu chấm', 'https://intranet/'],
    ['IPv4 dạng số thập phân nguyên (= 127.0.0.1)', 'https://2130706433/'],
    ['IPv4 dạng hex (= 127.0.0.1)', 'https://0x7f000001/'],
    ['IPv4 dạng bát phân (= 127.0.0.1)', 'https://0177.0.0.1/'],
    ['IPv4 dạng rút gọn hai phần (= 127.0.0.1)', 'https://127.1/'],
    ['IPv4 nhúng trong IPv6', 'https://[::ffff:127.0.0.1]/'],
    ['IPv6 link-local fe80::/10', 'https://[fe80::1]/'],
    ['IPv6 unique-local fc00::/7', 'https://[fd00::1]/'],
  ];

  for (const [ten, url] of DAI_PHAI_CHAN) {
    it(`chặn ${ten}`, () => {
      expect(() => kiemBangChungDeploy({ url })).toThrow(/localhost hay IP nội bộ/);
    });
  }

  it('ĐỐI CHỨNG: IP công khai và tên miền có dấu chấm KHÔNG bị chặn', () => {
    // Không có ca này thì "chặn mọi thứ" cũng làm 21 ca trên xanh — và một cổng
    // chặn mọi URL là một cổng không ai gửi deploy vào được.
    for (const url of [
      'https://8.8.8.8/',
      'https://172.32.0.1/', // ngay ngoài 172.16/12
      'https://11.0.0.1/', // ngay ngoài 10/8
      'https://192.167.1.1/', // ngay ngoài 192.168/16
      'https://169.253.1.1/', // ngay ngoài 169.254/16
      'https://baton.example.com/',
      'https://baton.workers.dev/duong/dan?a=1',
    ]) {
      expect(() => kiemBangChungDeploy({ url }), url).not.toThrow();
    }
  });

  /* ---------------------------------------------------------------- *
   * Lượt 2: năm dải còn hở + dấu chấm cuối (reviewer lượt 1 nêu)
   * ---------------------------------------------------------------- *
   * Mỗi dải thêm có **hai** ca: một ca **chặn**, và một ca **ngay sát mép** phải
   * ĐẠT. Thiếu ca sát mép thì "chặn rộng hơn luật" cũng xanh — mà chặn rộng hơn
   * ở đây nghĩa là từ chối một URL deploy thật của chủ, và không ai biết vì sao.
   */

  const DAI_THEM: { ten: string; chan: string; dat: string[] }[] = [
    {
      ten: '100.64.0.0/10 (CGNAT) — biên dưới',
      chan: 'https://100.64.0.1/',
      // Ngay dưới và ngay trên dải: cả hai phải ĐẠT.
      dat: ['https://100.63.255.255/', 'https://100.128.0.0/'],
    },
    {
      ten: '100.64.0.0/10 (CGNAT) — biên trên',
      chan: 'https://100.127.255.254/',
      dat: ['https://100.128.0.1/'],
    },
    {
      ten: '255.255.255.255 (broadcast)',
      chan: 'https://255.255.255.255/',
      dat: ['https://255.255.255.254/'],
    },
    {
      ten: '198.18.0.0/15 (dải đo hiệu năng) — biên dưới',
      chan: 'https://198.18.0.1/',
      dat: ['https://198.17.255.255/'],
    },
    {
      ten: '198.18.0.0/15 — biên trên',
      chan: 'https://198.19.255.254/',
      dat: ['https://198.20.0.0/'],
    },
    {
      ten: '224.0.0.0/4 (multicast) — biên dưới',
      chan: 'https://224.0.0.1/',
      dat: ['https://223.255.255.255/'],
    },
    {
      ten: '224.0.0.0/4 (multicast) — biên trên',
      chan: 'https://239.255.255.254/',
      dat: ['https://240.0.0.1/'],
    },
    {
      ten: 'NAT64 well-known 64:ff9b::/96 (dịch ra 127.0.0.1)',
      chan: 'https://[64:ff9b::7f00:1]/',
      // Hai tiền tố **sát mép** `64:ff9b::/96`: không phải NAT64, phải ĐẠT.
      dat: ['https://[64:ff9a::1]/', 'https://[64:ff9c::1]/'],
    },
    {
      ten: 'NAT64 well-known — cả tiền tố, không chỉ IPv4 nội bộ nhúng',
      chan: 'https://[64:ff9b::808:808]/',
      dat: ['https://[65:ff9b::1]/'],
    },
  ];

  for (const { ten, chan, dat } of DAI_THEM) {
    it(`chặn ${ten}`, () => {
      expect(() => kiemBangChungDeploy({ url: chan })).toThrow(/localhost hay IP nội bộ/);
    });
    it(`ĐỐI CHỨNG sát mép của ${ten}: ${dat.join(' · ')} phải ĐẠT`, () => {
      for (const url of dat) {
        expect(() => kiemBangChungDeploy({ url }), url).not.toThrow();
      }
    });
  }

  /**
   * **Dấu chấm cuối là FQDN hợp lệ, không phải tấn công** — sửa ở lượt 2.
   * `https://baton.example.com./` là một URL thật và trước đây bị **chặn oan**.
   */
  it('d.207: FQDN có dấu chấm cuối được NHẬN (hết chặn oan)', () => {
    expect(kiemBangChungDeploy({ url: 'https://baton.example.com./' }).loai).toBe('deploy');
    expect(laHostBiChan('example.com.')).toBe(false);
  });

  it('d.207: bỏ dấu chấm cuối rồi MỚI kiểm — `127.0.0.1.` và `localhost.` VẪN bị chặn', () => {
    // Nếu không thì "thêm một dấu chấm" là cách lách cả lớp chặn này.
    expect(laHostBiChan('127.0.0.1.')).toBe(true);
    expect(laHostBiChan('localhost.')).toBe(true);
    expect(() => kiemBangChungDeploy({ url: 'https://127.0.0.1./' })).toThrow(
      /localhost hay IP nội bộ/,
    );
    // Hai dấu chấm là tên miền không hợp lệ → vẫn chặn.
    expect(laHostBiChan('example.com..')).toBe(true);
    expect(laHostBiChan('.example.com')).toBe(true);
  });

  /* ---------------------------------------------------------------- *
   * Lượt 2 sửa review: hậu tố tên miền chỉ-nội-bộ — `spec-questions.md` #58
   * ---------------------------------------------------------------- *
   * Lỗ thật reviewer tìm ra: `metadata.google.internal` có dấu chấm, không phải
   * IP, không phải `localhost` — nên cả `TEN_MIEN_CHAN` lẫn nhánh "nhãn đơn" đều
   * cho qua, mà nó phân giải ra đúng `169.254.169.254`.
   */

  const HAU_TO_PHAI_CHAN: [string, string][] = [
    ['.internal — máy chủ metadata GCP', 'metadata.google.internal'],
    ['.internal — tên bất kỳ', 'example.internal'],
    ['.local — mDNS', 'router.local'],
    ['.home.arpa — RFC 8375', 'abc.home.arpa'],
    ['.localhost — RFC 6761', 'foo.localhost'],
    ['hậu tố nội bộ + dấu chấm cuối', 'metadata.google.internal.'],
  ];

  for (const [ten, host] of HAU_TO_PHAI_CHAN) {
    it(`#58 chặn hậu tố chỉ-nội-bộ: ${ten} (${host})`, () => {
      expect(laHostBiChan(host), host).toBe(true);
      expect(() => kiemBangChungDeploy({ url: `https://${host}/khoe` })).toThrow(
        /localhost hay IP nội bộ/,
      );
    });
  }

  it('#58 ĐỐI CHỨNG: khớp theo NHÃN, không theo chuỗi con — bốn tên này KHÔNG bị chặn oan', () => {
    /*
     * Không có ca này thì `host.endsWith('internal')` cũng làm sáu ca trên xanh —
     * và nó từ chối `notinternal.com`, tức một URL deploy thật của chủ bị chặn vì
     * tên nó tình cờ chứa mấy chữ ấy.
     */
    for (const host of [
      'notinternal.com',
      'myinternal.example.com',
      'local.example.com',
      'baton.example.com',
      // Nhãn cuối **kết thúc bằng** chuỗi `local` nhưng không **là** `local`:
      // ca này giết cả cách cài `host.endsWith('local')`, không chỉ `includes`.
      'mail.notlocal',
    ]) {
      expect(laHostBiChan(host), host).toBe(false);
      expect(() => kiemBangChungDeploy({ url: `https://${host}/khoe` }), host).not.toThrow();
    }
  });

  /**
   * **Hai ca code đã xử lý đúng nhưng chưa có test** (việc 1c của lượt 2). Có
   * test rồi thì một lần refactor làm hở chúng là ĐỎ, không phải im lặng.
   */
  it('user-info trong URL: `https://evil.com@127.0.0.1/` bị TỪ CHỐI', () => {
    // Host thật là `127.0.0.1`, dù mắt người đọc ra `evil.com`.
    expect(new URL('https://evil.com@127.0.0.1/').hostname).toBe('127.0.0.1');
    expect(laHostBiChan(new URL('https://evil.com@127.0.0.1/').hostname)).toBe(true);
    expect(() => kiemBangChungDeploy({ url: 'https://evil.com@127.0.0.1/' })).toThrow();
  });

  it('user-info bị từ chối kể cả khi host CÔNG KHAI (không chứa credential trong `evidence`)', () => {
    expect(() => kiemBangChungDeploy({ url: 'https://ai:matkhau@baton.example.com/' })).toThrow(
      /tên đăng nhập hay mật khẩu/,
    );
    expect(() => kiemBangChungDeploy({ url: 'https://evil.com@baton.example.com/' })).toThrow(
      /tên đăng nhập hay mật khẩu/,
    );
    // ĐỐI CHỨNG: cùng host, không user-info → ĐẠT.
    expect(() => kiemBangChungDeploy({ url: 'https://baton.example.com/' })).not.toThrow();
  });

  it('IPv4-mapped KHÔNG loopback vẫn bị chặn: `[::ffff:10.0.0.1]`', () => {
    expect(laHostBiChan('::ffff:10.0.0.1')).toBe(true);
    expect(laHostBiChan('::ffff:a00:1')).toBe(true); // dạng `URL` chuẩn hoá
    expect(() => kiemBangChungDeploy({ url: 'https://[::ffff:10.0.0.1]/' })).toThrow(
      /localhost hay IP nội bộ/,
    );
    // ĐỐI CHỨNG: IPv4-mapped của một IP CÔNG KHAI thì không bị chặn.
    expect(laHostBiChan('::ffff:8.8.8.8')).toBe(false);
  });

  it('`bonSoIpv4` giải đúng các dạng viết lách về bốn byte', () => {
    expect(bonSoIpv4('127.0.0.1')).toEqual([127, 0, 0, 1]);
    expect(bonSoIpv4('2130706433')).toEqual([127, 0, 0, 1]);
    expect(bonSoIpv4('0x7f000001')).toEqual([127, 0, 0, 1]);
    expect(bonSoIpv4('0177.0.0.1')).toEqual([127, 0, 0, 1]);
    expect(bonSoIpv4('127.1')).toEqual([127, 0, 0, 1]);
    expect(bonSoIpv4('10.0.1')).toEqual([10, 0, 0, 1]);
    // Không phải IPv4 → `null`, để tên miền đi tiếp luật tên miền.
    expect(bonSoIpv4('baton.example.com')).toBeNull();
    expect(bonSoIpv4('256.1.1.1')).toBeNull();
  });

  it('host rỗng bị chặn', () => {
    expect(laHostBiChan('')).toBe(true);
  });

  it('`nhomIpv6` giải đúng 8 nhóm, kể cả dạng rút gọn và IPv4 nhúng', () => {
    expect(nhomIpv6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
    expect(nhomIpv6('::')).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    // `URL` chuẩn hoá `::ffff:127.0.0.1` thành dạng này — không còn dấu chấm nào.
    expect(nhomIpv6('::ffff:7f00:1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(nhomIpv6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1]);
    expect(nhomIpv6('fe80::1')).toEqual([0xfe80, 0, 0, 0, 0, 0, 0, 1]);
    expect(nhomIpv6('2001:db8::1')?.[0]).toBe(0x2001);
    // Không đọc được → `null`, và `laHostBiChan` chặn (thà từ chối một địa chỉ
    // lạ còn hơn gọi vào một địa chỉ mình không hiểu).
    expect(nhomIpv6('1:2:3::4:5::6')).toBeNull();
    expect(nhomIpv6('gggg::1')).toBeNull();
    expect(laHostBiChan('gggg::1')).toBe(true);
  });

  it('ĐỐI CHỨNG IPv6: địa chỉ công khai KHÔNG bị chặn', () => {
    expect(laHostBiChan('2001:db8::1')).toBe(false);
    expect(laHostBiChan('[2606:4700::1111]')).toBe(false);
  });

  it('URL không đọc được → `INVALID_INPUT`, không vỡ', () => {
    expect(() => kiemBangChungDeploy({ url: 'không-phải-url' })).toThrow(/không đọc được/);
    expect(() => kiemBangChungDeploy({ url: '' })).toThrow(/bắt buộc có URL/);
  });

  /**
   * **19.12 câu 5** — mã phiên bản **chỉ lưu và hiện, server KHÔNG kiểm**.
   * Ca này tồn tại để một lần kiểm thêm vào sau sẽ làm nó đỏ: không có nó thì
   * ai cũng có thể "sửa cho chặt hơn" và lặng lẽ đi ngược chốt của chủ.
   */
  it('19.12 câu 5: mã phiên bản KHÔNG bị kiểm hình dạng gì', () => {
    for (const ma of [
      'e91efbeb',
      'v1.2.3-rc.1+build.99',
      'không phải hex',
      '!@#$%^&*()',
      '2026-10-02 bản sáng',
    ]) {
      expect(
        kiemBangChungDeploy({ url: 'https://baton.example.com/', ma_phien_ban: ma })
          .ma_phien_ban,
        ma,
      ).toBe(ma);
    }
  });

  it('mã phiên bản là TUỲ CHỌN: không ghi → `null`', () => {
    expect(kiemBangChungDeploy({ url: 'https://baton.example.com/' }).ma_phien_ban).toBeNull();
    expect(
      kiemBangChungDeploy({ url: 'https://baton.example.com/', ma_phien_ban: '  ' })
        .ma_phien_ban,
    ).toBeNull();
  });
});

describe('d.208–211 — `review`, `test`, `file`, `note`: trường bắt buộc', () => {
  it('`review`: kết luận phải là `pass` hoặc `fail` (0.1), ghi chú tuỳ chọn', () => {
    expect(kiemNoiDungBangChung({ loai: 'review', ket_luan: 'pass' })).toMatchObject({
      ket_luan: 'pass',
      ghi_chu: null,
    });
    expect(
      kiemNoiDungBangChung({ loai: 'review', ket_luan: 'fail', ghi_chu: 'Thiếu test' }),
    ).toMatchObject({ ket_luan: 'fail', ghi_chu: 'Thiếu test' });
    expect(() => kiemNoiDungBangChung({ loai: 'review', ket_luan: 'dat' })).toThrow(/pass/);
    expect(() => kiemNoiDungBangChung({ loai: 'review' })).toThrow();
  });

  it('`test`: tóm tắt + cờ đạt, cả hai bắt buộc (d.209)', () => {
    expect(
      kiemNoiDungBangChung({ loai: 'test', tom_tat: '42 passed, 0 failed', dat: true }),
    ).toMatchObject({ tom_tat: '42 passed, 0 failed', dat: true });
    expect(() => kiemNoiDungBangChung({ loai: 'test', tom_tat: '42 passed' })).toThrow(/Cờ đạt/);
    expect(() => kiemNoiDungBangChung({ loai: 'test', tom_tat: '  ', dat: true })).toThrow();
  });

  it('`file`: đường dẫn hoặc link, không rỗng (d.210)', () => {
    expect(
      kiemNoiDungBangChung({ loai: 'file', duong_dan: 'file:///srv/bao-cao.md' }),
    ).toMatchObject({ duong_dan: 'file:///srv/bao-cao.md' });
    expect(() => kiemNoiDungBangChung({ loai: 'file', duong_dan: '' })).toThrow();
  });

  it('`note`: chữ, không rỗng (d.211)', () => {
    expect(kiemNoiDungBangChung({ loai: 'note', noi_dung: 'Đã gửi hồ sơ' })).toMatchObject({
      noi_dung: 'Đã gửi hồ sơ',
    });
    expect(() => kiemNoiDungBangChung({ loai: 'note', noi_dung: '   ' })).toThrow();
  });

  it('loại lạ → `INVALID_INPUT` (một cửa cho cả sáu loại)', () => {
    expect(() => kiemNoiDungBangChung({ loai: 'screenshot' })).toThrow(/Loại bằng chứng/);
    expect(() => kiemNoiDungBangChung({})).toThrow(/Loại bằng chứng/);
  });
});

/* ================================================================== *
 * D. Cổng vào Xong — luật thuần (d.213–217, 19.3, 19.10, 19.11)
 * ================================================================== */

describe('d.213–217 — Cổng vào Xong (luật thuần)', () => {
  function bc(them: Partial<BoiCanhCong> = {}): BoiCanhCong {
    return {
      khong_code: false,
      bat_buoc_review: true,
      chu_xac_nhan: false,
      bang_chung: [],
      nguoi_lam: [],
      ...them,
    };
  }

  /** Review do **một agent cụ thể** gửi — cho luật "khác người làm" (d.208). */
  const reviewCua = (gui_luc: number, agent_id: string): BangChungChoCong => ({
    loai: 'review',
    gui_luc,
    xac_minh: 'not_required',
    rut_luc: null,
    ket_luan: 'pass',
    nguoi_gui: { loai: 'agent', agent_id },
  });

  const commit = (gui_luc: number, xac_minh: 'merged' | 'pushed' | 'pending' | 'failed' = 'merged'): BangChungChoCong => ({
    loai: 'commit',
    gui_luc,
    xac_minh,
    rut_luc: null,
  });
  const deploy = (gui_luc: number, xac_minh: 'passed' | 'failed' | 'pending' = 'passed'): BangChungChoCong => ({
    loai: 'deploy',
    gui_luc,
    xac_minh,
    rut_luc: null,
  });
  const review = (gui_luc: number, ket_luan: 'pass' | 'fail' = 'pass'): BangChungChoCong => ({
    loai: 'review',
    gui_luc,
    xac_minh: 'not_required',
    rut_luc: null,
    ket_luan,
  });

  /* --- Gạch 1 (d.214) ---------------------------------------------- */

  it('không có bằng chứng nào → chưa đủ, lý do nói THIẾU COMMIT/DEPLOY', () => {
    const kq = congXong(bc());
    expect(kq.du).toBe(false);
    expect(kq.ly_do).toBe(LY_DO_THIEU_COMMIT_HOAC_DEPLOY);
  });

  it('commit `merged` + review ĐẠT sau đó → ĐỦ', () => {
    expect(congXong(bc({ bang_chung: [commit(100), review(200)] }))).toEqual({
      du: true,
      ly_do: '',
    });
  });

  it('deploy đạt + review ĐẠT sau đó → ĐỦ (d.214 "hoặc")', () => {
    expect(congXong(bc({ bang_chung: [deploy(100), review(200)] })).du).toBe(true);
  });

  it('commit `pushed` KHÔNG mở cổng — cùng commit thành `merged` thì mở (đối chứng)', () => {
    const chua = congXong(bc({ bang_chung: [commit(100, 'pushed'), review(200)] }));
    expect(chua.du).toBe(false);
    expect(chua.ly_do).toBe(LY_DO_THIEU_COMMIT_HOAC_DEPLOY);

    expect(congXong(bc({ bang_chung: [commit(100, 'merged'), review(200)] })).du).toBe(true);
  });

  it('chỉ có `test`, `file`, `note` → KHÔNG mở cổng (d.209–211)', () => {
    const bang_chung: BangChungChoCong[] = [
      { loai: 'test', gui_luc: 10, xac_minh: 'not_required', rut_luc: null },
      { loai: 'file', gui_luc: 20, xac_minh: 'not_required', rut_luc: null },
      { loai: 'note', gui_luc: 30, xac_minh: 'not_required', rut_luc: null },
      review(40),
    ];
    expect(congXong(bc({ bang_chung })).ly_do).toBe(LY_DO_THIEU_COMMIT_HOAC_DEPLOY);
  });

  it('commit `merged` đã RÚT → không tính (d.222); bản chưa rút thì tính (đối chứng)', () => {
    const da_rut: BangChungChoCong = { ...commit(100), rut_luc: 150 };
    expect(congXong(bc({ bang_chung: [da_rut, review(200)] })).ly_do).toBe(
      LY_DO_THIEU_COMMIT_HOAC_DEPLOY,
    );
    expect(congXong(bc({ bang_chung: [commit(100), review(200)] })).du).toBe(true);
  });

  /* --- Gạch 2 (d.215 + 19.3 + 19.11) ------------------------------- */

  it('bắt buộc review mà KHÔNG có review nào → lý do nói THIẾU REVIEW ĐẠT', () => {
    const kq = congXong(bc({ bang_chung: [commit(100)] }));
    expect(kq.du).toBe(false);
    expect(kq.ly_do).toBe(LY_DO_THIEU_REVIEW_DAT);
  });

  it('19.11: review KHÔNG ĐẠT không mở cổng; cùng review thành ĐẠT thì mở (đối chứng)', () => {
    const kq = congXong(bc({ bang_chung: [commit(100), review(200, 'fail')] }));
    expect(kq.du).toBe(false);
    expect(kq.ly_do).toBe(LY_DO_THIEU_REVIEW_DAT);

    expect(congXong(bc({ bang_chung: [commit(100), review(200, 'pass')] })).du).toBe(true);
  });

  it('19.3: review gửi TRƯỚC commit → hết hiệu lực, lý do nói ĐÚNG ca đó', () => {
    const kq = congXong(bc({ bang_chung: [review(100), commit(200)] }));
    expect(kq.du).toBe(false);
    // Phải là "hết hiệu lực vì có commit mới", **không** phải "thiếu review ĐẠT":
    // hai ca cần hai việc khác nhau (mở lượt review mới vs chờ review đang chạy).
    expect(kq.ly_do).toBe(LY_DO_REVIEW_HET_HIEU_LUC);
  });

  it('19.3: có commit MỚI sau review ĐẠT → review cũ hết hiệu lực', () => {
    const truoc = congXong(bc({ bang_chung: [commit(100), review(200)] }));
    expect(truoc.du).toBe(true);
    // Thêm một commit mới lúc 300 ⇒ review lúc 200 hết hiệu lực.
    const sau = congXong(bc({ bang_chung: [commit(100), review(200), commit(300)] }));
    expect(sau.du).toBe(false);
    expect(sau.ly_do).toBe(LY_DO_REVIEW_HET_HIEU_LUC);
  });

  it('19.3: có DEPLOY mới sau review ĐẠT → review cũ cũng hết hiệu lực', () => {
    const kq = congXong(bc({ bang_chung: [commit(100), review(200), deploy(300)] }));
    expect(kq.ly_do).toBe(LY_DO_REVIEW_HET_HIEU_LUC);
  });

  it('19.3: review MỚI sau commit mới → đủ lại', () => {
    expect(
      congXong(bc({ bang_chung: [commit(100), review(200), commit(300), review(400)] })).du,
    ).toBe(true);
  });

  it('review ĐẠT cùng một millisecond với commit cuối → chưa đủ (so chặt "sau")', () => {
    expect(congXong(bc({ bang_chung: [commit(100), review(100)] })).ly_do).toBe(
      LY_DO_REVIEW_HET_HIEU_LUC,
    );
  });

  it('review ĐẠT đã RÚT → không tính (d.222)', () => {
    const bang_chung: BangChungChoCong[] = [commit(100), { ...review(200), rut_luc: 250 }];
    expect(congXong(bc({ bang_chung })).ly_do).toBe(LY_DO_THIEU_REVIEW_DAT);
  });

  /**
   * `spec-questions.md` #56 — mốc "commit/deploy cuối cùng" tính trên **MỌI** bằng
   * chứng commit/deploy, kể cả đã rút. Hướng an toàn hơn: nếu tính trên tập còn
   * hiệu lực thì **rút lại** một commit là cách làm sống lại một review đã hết
   * hiệu lực, tức một đường vòng qua 19.3.
   */
  it('#56: commit mới ĐÃ RÚT vẫn làm review cũ hết hiệu lực (hướng an toàn hơn)', () => {
    const bang_chung: BangChungChoCong[] = [
      commit(100),
      review(200),
      { ...commit(300), rut_luc: 350 },
    ];
    const kq = congXong(bc({ bang_chung }));
    expect(kq.du).toBe(false);
    expect(kq.ly_do).toBe(LY_DO_REVIEW_HET_HIEU_LUC);
  });

  it('#56: commit mới `failed` cũng làm review cũ hết hiệu lực', () => {
    expect(
      congXong(bc({ bang_chung: [commit(100), review(200), commit(300, 'failed')] })).ly_do,
    ).toBe(LY_DO_REVIEW_HET_HIEU_LUC);
  });

  it('d.215: dự án TẮT "bắt buộc review" → chỉ cần commit `merged`', () => {
    expect(congXong(bc({ bat_buoc_review: false, bang_chung: [commit(100)] })).du).toBe(true);
    // Và vẫn phải có commit/deploy: tắt review không tắt gạch 1.
    expect(congXong(bc({ bat_buoc_review: false })).ly_do).toBe(LY_DO_THIEU_COMMIT_HOAC_DEPLOY);
  });

  /* --- Gạch 3 (d.217 + 19.10): dự án không code --------------------- */

  it('d.217: dự án không code, không có `file`/`note` → lý do nói ĐÚNG ca đó', () => {
    const kq = congXong(bc({ khong_code: true }));
    expect(kq.du).toBe(false);
    expect(kq.ly_do).toBe(LY_DO_KHONG_CODE_THIEU_FILE_NOTE);
  });

  it('d.217: có `note` nhưng CHƯA có chủ xác nhận → chờ chủ (lý do riêng)', () => {
    const bang_chung: BangChungChoCong[] = [
      { loai: 'note', gui_luc: 10, xac_minh: 'not_required', rut_luc: null },
    ];
    const kq = congXong(bc({ khong_code: true, bang_chung }));
    expect(kq.du).toBe(false);
    expect(kq.ly_do).toBe(LY_DO_KHONG_CODE_CHO_CHU_XAC_NHAN);
  });

  it('d.217: `file` + chủ xác nhận → ĐỦ (đối chứng cho hai ca trên)', () => {
    const bang_chung: BangChungChoCong[] = [
      { loai: 'file', gui_luc: 10, xac_minh: 'not_required', rut_luc: null },
    ];
    expect(congXong(bc({ khong_code: true, chu_xac_nhan: true, bang_chung })).du).toBe(true);
  });

  it('d.217 "đổi thành": dự án không code KHÔNG cần commit/deploy, cũng KHÔNG cần review', () => {
    const bang_chung: BangChungChoCong[] = [
      { loai: 'note', gui_luc: 10, xac_minh: 'not_required', rut_luc: null },
    ];
    expect(
      congXong({
        khong_code: true,
        bat_buoc_review: true,
        chu_xac_nhan: true,
        bang_chung,
        nguoi_lam: [],
      }).du,
    ).toBe(true);
  });

  it('dự án không code: `note` đã RÚT thì không tính (d.222)', () => {
    const bang_chung: BangChungChoCong[] = [
      { loai: 'note', gui_luc: 10, xac_minh: 'not_required', rut_luc: 20 },
    ];
    expect(congXong(bc({ khong_code: true, chu_xac_nhan: true, bang_chung })).ly_do).toBe(
      LY_DO_KHONG_CODE_THIEU_FILE_NOTE,
    );
  });

  /* --- "Khác người làm" ở TẦNG CỔNG (d.208, 19.3 d.496) ------------- *
   * Lớp thứ nhất là lệnh gửi (`REVIEWER_IS_WORKER`, mục F dưới). Đây là lớp thứ
   * hai: cổng **đọc lại** `nguoi_gui` của review. Xem `BoiCanhCong.nguoi_lam`.
   */

  it('d.208: review ĐẠT do CHÍNH người làm gửi → KHÔNG tính, lý do nói đúng chuyện đó', () => {
    const kq = congXong(
      bc({ bang_chung: [commit(100), reviewCua(200, 'ag-worker')], nguoi_lam: ['ag-worker'] }),
    );
    expect(kq.du).toBe(false);
    expect(kq.ly_do).toBe(LY_DO_REVIEW_CUA_NGUOI_LAM);
  });

  it('d.208 đối chứng: CÙNG dữ liệu, người gửi KHÔNG phải người làm → ĐỦ', () => {
    expect(
      congXong(
        bc({ bang_chung: [commit(100), reviewCua(200, 'ag-reviewer')], nguoi_lam: ['ag-worker'] })
      ).du,
    ).toBe(true);
  });

  it('d.208 đối chứng 2: cùng người gửi, nhưng ticket KHÔNG có người làm nào → ĐỦ', () => {
    expect(
      congXong(bc({ bang_chung: [commit(100), reviewCua(200, 'ag-worker')], nguoi_lam: [] })).du,
    ).toBe(true);
  });

  it('review của CHỦ (`nguoi_gui.loai = owner`) không bao giờ là người làm → ĐỦ', () => {
    const review_chu: BangChungChoCong = {
      loai: 'review',
      gui_luc: 200,
      xac_minh: 'not_required',
      rut_luc: null,
      ket_luan: 'pass',
      nguoi_gui: { loai: 'owner' },
    };
    expect(
      congXong(bc({ bang_chung: [commit(100), review_chu], nguoi_lam: ['ag-worker'] })).du,
    ).toBe(true);
  });

  it('người làm gửi review ĐẠT, một reviewer khác cũng gửi → ĐỦ (chỉ loại ra cái sai)', () => {
    expect(
      congXong(
        bc({
          bang_chung: [commit(100), reviewCua(200, 'ag-worker'), reviewCua(300, 'ag-rv')],
          nguoi_lam: ['ag-worker'],
        }),
      ).du,
    ).toBe(true);
  });

  it('năm lý do từ chối là NĂM câu khác nhau', () => {
    const ds = [
      LY_DO_THIEU_COMMIT_HOAC_DEPLOY,
      LY_DO_THIEU_REVIEW_DAT,
      LY_DO_REVIEW_HET_HIEU_LUC,
      LY_DO_REVIEW_CUA_NGUOI_LAM,
      LY_DO_KHONG_CODE_THIEU_FILE_NOTE,
      LY_DO_KHONG_CODE_CHO_CHU_XAC_NHAN,
    ];
    expect(new Set(ds).size).toBe(ds.length);
    for (const s of ds) expect(s.length).toBeGreaterThan(20);
  });
});

/* ================================================================== *
 * E. Cổng qua D1 — `congBangChungCua`
 * ================================================================== */

describe('cổng qua D1 — đọc đúng thứ đã ghi vào `evidence`', () => {
  it('chưa có bằng chứng → chưa đủ', async () => {
    const cong = congBangChungCua(env, env.DB);
    expect(await cong(TK)).toMatchObject({ du: false, ly_do: LY_DO_THIEU_COMMIT_HOAC_DEPLOY });
  });

  it('commit `merged` + review ĐẠT sau đó → đủ', async () => {
    await dungBangChung('ev-c', TK, 'commit', { xac_minh: 'merged', gui_luc: 1_000 });
    await dungBangChung('ev-r', TK, 'review', { ket_luan: 'pass', gui_luc: 2_000 });
    expect((await congBangChungCua(env, env.DB)(TK)).du).toBe(true);
  });

  it('commit `pushed` → chưa đủ; cùng commit thành `merged` → đủ (đối chứng, đi qua D1)', async () => {
    await dungBangChung('ev-c', TK, 'commit', { xac_minh: 'pushed', gui_luc: 1_000 });
    await dungBangChung('ev-r', TK, 'review', { ket_luan: 'pass', gui_luc: 2_000 });
    const cong = congBangChungCua(env, env.DB);
    expect(await cong(TK)).toMatchObject({ du: false, ly_do: LY_DO_THIEU_COMMIT_HOAC_DEPLOY });

    // Xác minh ghi kết quả mới — đúng đường d.221 ("tự lên Xong" khi pushed → merged).
    await env.DB.prepare('UPDATE evidence SET xac_minh = ? WHERE id = ?')
      .bind('merged', 'ev-c')
      .run();
    expect((await cong(TK)).du).toBe(true);
  });

  it('bằng chứng của ticket KHÁC không tính vào cổng của ticket này', async () => {
    await dungTicket(P, 2, 'Việc khác', { trang_thai: 'verifying' });
    await dungBangChung('ev-c', 'tk-pj-SAI-2', 'commit', { xac_minh: 'merged', gui_luc: 1_000 });
    await dungBangChung('ev-r', 'tk-pj-SAI-2', 'review', { ket_luan: 'pass', gui_luc: 2_000 });
    expect((await congBangChungCua(env, env.DB)(TK)).du).toBe(false);
    expect((await congBangChungCua(env, env.DB)('tk-pj-SAI-2')).du).toBe(true);
  });

  it('ticket không có thật → cổng ĐÓNG, không ném lỗi', async () => {
    const kq = await congBangChungCua(env, env.DB)('tk-khong-ton-tai');
    expect(kq.du).toBe(false);
  });

  /**
   * **SPEC 19.10 d.547** — "Cổng áp theo cờ 'có code hay không' **tại thời điểm
   * kiểm**". Nên cùng một ticket, cùng một bộ bằng chứng, chủ bật cờ giữa hai lần
   * kiểm thì **hai lần cho hai kết luận khác nhau**.
   */
  it('19.10: cờ `khong_code` đọc MỖI LẦN kiểm, không nhớ lại cờ lúc tạo ticket', async () => {
    await dungBangChung('ev-c', TK, 'commit', { xac_minh: 'merged', gui_luc: 1_000 });
    await dungBangChung('ev-r', TK, 'review', { ket_luan: 'pass', gui_luc: 2_000 });
    const cong = congBangChungCua(env, env.DB);

    // Lần 1: dự án có code ⇒ đủ.
    expect((await cong(TK)).du).toBe(true);

    // Chủ bật "dự án không code" ⇒ cổng **đổi luật**: commit/review không còn
    // tính, cần `file`/`note` + chủ xác nhận.
    await env.DB.prepare('UPDATE project SET khong_code = 1 WHERE id = ?').bind(P).run();
    expect(await cong(TK)).toMatchObject({ du: false, ly_do: LY_DO_KHONG_CODE_THIEU_FILE_NOTE });

    // Thêm `note` ⇒ còn thiếu đúng chủ xác nhận.
    await dungBangChung('ev-n', TK, 'note', { gui_luc: 3_000 });
    expect(await cong(TK)).toMatchObject({
      du: false,
      ly_do: LY_DO_KHONG_CODE_CHO_CHU_XAC_NHAN,
    });

    // Tắt cờ lại ⇒ về đúng kết luận lần 1, không có trạng thái nào bị nhớ.
    await env.DB.prepare('UPDATE project SET khong_code = 0 WHERE id = ?').bind(P).run();
    expect((await cong(TK)).du).toBe(true);
  });

  it('19.10: cờ `bat_buoc_review` cũng đọc mỗi lần kiểm', async () => {
    await dungBangChung('ev-c', TK, 'commit', { xac_minh: 'merged', gui_luc: 1_000 });
    const cong = congBangChungCua(env, env.DB);
    expect(await cong(TK)).toMatchObject({ du: false, ly_do: LY_DO_THIEU_REVIEW_DAT });

    await env.DB.prepare('UPDATE project SET bat_buoc_review = 0 WHERE id = ?').bind(P).run();
    expect((await cong(TK)).du).toBe(true);
  });

  it('"bắt buộc review" MẶC ĐỊNH BẬT (d.215, migration 0001)', async () => {
    const d = await env.DB.prepare('SELECT bat_buoc_review, khong_code FROM project WHERE id = ?')
      .bind(P)
      .first<{ bat_buoc_review: number; khong_code: number }>();
    expect(d?.bat_buoc_review).toBe(1);
    expect(d?.khong_code).toBe(0);
  });

  /**
   * **Lượt 3b của phần 4 nối hàm này vào 19.12 câu 57** — nó không còn trả `false`
   * cứng. Bốn ca của luật, trên một hàm **thuần** (không I/O): chưa có mục · mục
   * đang `Chờ` · mục `Bỏ qua` (19.10 nói ticket **ở lại** Chờ kiểm chứng) · mục
   * `Đã xử lý` nhưng kết luận là **Cần sửa** (chủ nói chưa được — #78). Chỉ ca thứ
   * năm, `resolved` + `dat`, mở cổng.
   */
  it('19.12 câu 57: `chuDaXacNhan` chỉ `true` khi mục `resolved` + kết luận `dat`', () => {
    const muc = (
      trang_thai: 'open' | 'resolved' | 'skipped',
      ket_luan_review: 'dat' | 'can_sua' | null,
    ): Parameters<typeof chuDaXacNhan>[0] => ({
      id: 'ct-1',
      ma_so: 1,
      trang_thai,
      ket_luan_review,
      xu_ly_luc: trang_thai === 'open' ? null : 1_000,
      mo_lai_lan: 0,
    });

    expect(chuDaXacNhan(null)).toBe(false);
    expect(chuDaXacNhan(muc('open', null))).toBe(false);
    expect(chuDaXacNhan(muc('skipped', null))).toBe(false);
    expect(chuDaXacNhan(muc('resolved', 'can_sua'))).toBe(false);
    expect(chuDaXacNhan(muc('resolved', 'dat'))).toBe(true);
  });

  it('chưa có mục xác nhận: dự án không code chưa vào Xong dù đã có `file` và `note`', async () => {
    await env.DB.prepare('UPDATE project SET khong_code = 1 WHERE id = ?').bind(P).run();
    await dungBangChung('ev-f', TK, 'file', { gui_luc: 1_000 });
    await dungBangChung('ev-n', TK, 'note', { gui_luc: 2_000 });
    expect(await congBangChungCua(env, env.DB)(TK)).toMatchObject({
      du: false,
      ly_do: LY_DO_KHONG_CODE_CHO_CHU_XAC_NHAN,
    });
  });
});

/* ================================================================== *
 * F. Cổng qua HTTP thật — cửa ghi + cổng thật, không tiêm gì
 * ================================================================== *
 * Lệnh **gửi** bằng chứng là lượt 2, nên bằng chứng vào DB bằng fixture. Nhưng
 * đường từ `POST /v1/ticket/:id/trang-thai` → cửa ghi → `congBangChungCua` →
 * `evidence` là **đường thật**, không tiêm cổng giả: `chayLenhVoiCong` không được
 * dùng ở mục này.
 */

describe('cổng qua HTTP — ticket vào Xong được vì có bằng chứng THẬT', () => {
  function doiSangXong(): Promise<Response> {
    return goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done' },
    });
  }

  it('chưa có bằng chứng → 422 `EVIDENCE_REQUIRED`, ticket ở lại Chờ kiểm chứng', async () => {
    const r = await doiSangXong();
    expect(r.status).toBe(422);
    expect(await r.json<{ error: string }>()).toMatchObject({ error: 'EVIDENCE_REQUIRED' });
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('commit `pushed` + review ĐẠT → vẫn 422 (d.206: `pushed` không mở cổng)', async () => {
    await dungBangChung('ev-c', TK, 'commit', { xac_minh: 'pushed', gui_luc: 1_000 });
    await dungBangChung('ev-r', TK, 'review', { ket_luan: 'pass', gui_luc: 2_000 });
    expect((await doiSangXong()).status).toBe(422);
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('commit `merged` + review ĐẠT sau đó → 200 và ticket XONG (đối chứng của ca trên)', async () => {
    await dungBangChung('ev-c', TK, 'commit', { xac_minh: 'merged', gui_luc: 1_000 });
    await dungBangChung('ev-r', TK, 'review', { ket_luan: 'pass', gui_luc: 2_000 });

    const r = await doiSangXong();
    expect(r.status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');

    // Không phải "chủ ép Xong": nhãn hệ thống "xong không bằng chứng" phải TẮT.
    const d = await env.DB.prepare(
      'SELECT co_xong_khong_bang_chung, xong_luc FROM ticket WHERE id = ?',
    )
      .bind(TK)
      .first<{ co_xong_khong_bang_chung: number; xong_luc: number | null }>();
    expect(d?.co_xong_khong_bang_chung).toBe(0);
    expect(d?.xong_luc).not.toBeNull();
  });

  it('deploy đạt + review ĐẠT sau đó → 200 và ticket XONG', async () => {
    await dungBangChung('ev-d', TK, 'deploy', {
      xac_minh: 'passed',
      gui_luc: 1_000,
      ma_phien_ban: 'e91efbeb',
    });
    await dungBangChung('ev-r', TK, 'review', { ket_luan: 'pass', gui_luc: 2_000 });
    expect((await doiSangXong()).status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('19.11 qua HTTP: review KHÔNG ĐẠT → 422, ticket giữ Chờ kiểm chứng', async () => {
    await dungBangChung('ev-c', TK, 'commit', { xac_minh: 'merged', gui_luc: 1_000 });
    await dungBangChung('ev-r', TK, 'review', { ket_luan: 'fail', gui_luc: 2_000 });
    expect((await doiSangXong()).status).toBe(422);
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('19.3 qua HTTP: có commit mới sau review ĐẠT → 422 (review hết hiệu lực)', async () => {
    await dungBangChung('ev-c1', TK, 'commit', { xac_minh: 'merged', gui_luc: 1_000 });
    await dungBangChung('ev-r', TK, 'review', { ket_luan: 'pass', gui_luc: 2_000 });
    await dungBangChung('ev-c2', TK, 'commit', { xac_minh: 'merged', gui_luc: 3_000 });

    const r = await doiSangXong();
    expect(r.status).toBe(422);
    expect(await trangThaiCua(TK)).toBe('verifying');

    // Review lại ⇒ qua.
    await dungBangChung('ev-r2', TK, 'review', { ket_luan: 'pass', gui_luc: 4_000 });
    expect((await doiSangXong()).status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('d.222 qua HTTP: rút commit duy nhất → 422 trở lại', async () => {
    await dungBangChung('ev-c', TK, 'commit', {
      xac_minh: 'merged',
      gui_luc: 1_000,
      rut_luc: 1_500,
    });
    await dungBangChung('ev-r', TK, 'review', { ket_luan: 'pass', gui_luc: 2_000 });
    expect((await doiSangXong()).status).toBe(422);
  });

  it('d.216 qua HTTP: chủ ÉP Xong vẫn được, kèm nhãn "xong không bằng chứng"', async () => {
    const r = await goiApi(`/v1/ticket/${TK}/trang-thai`, TOKEN_CHU, {
      method: 'POST',
      than: { trang_thai: 'done', ep: true, ly_do: 'Đã xác nhận ngoài hệ thống' },
    });
    expect(r.status).toBe(200);
    expect(await trangThaiCua(TK)).toBe('done');
    const d = await env.DB.prepare('SELECT co_xong_khong_bang_chung FROM ticket WHERE id = ?')
      .bind(TK)
      .first<{ co_xong_khong_bang_chung: number }>();
    expect(d?.co_xong_khong_bang_chung).toBe(1);
  });
});
