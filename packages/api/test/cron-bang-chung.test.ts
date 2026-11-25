/**
 * **Cron của bằng chứng** — SPEC mục 7 d.220 (thử lại 5 phút / 3 lần), d.221 (tự
 * lên Xong; kiểm lại commit `pushed` mỗi 10 phút trong 7 ngày), 19.2 (tự lên Xong
 * **chỉ** từ Chờ kiểm chứng), 19.4 (lan toả ticket điều phối), 19.7 (quá 7 ngày:
 * dừng theo dõi, nhãn, báo 1 lần), 19.10 (cờ "không code" **tại thời điểm kiểm**).
 *
 * ## Ba luật của chính file test này
 *
 * 1. **Không gọi mạng, một lần nào.** Nguồn GitHub và nguồn deploy tiêm qua
 *    `datNguonGiaLap`; `wrangler` không được gọi, cron không được áp lên thật
 *    (danh sách cấm `CLAUDE.md`: deploy). Test gọi **thẳng** handler `scheduled`
 *    qua `chayCron`.
 * 2. **Mọi khẳng định "không xảy ra" có một ca ĐỐI CHỨNG ngay cạnh**: cùng dữ
 *    liệu, đổi đúng một thứ, rồi việc đó xảy ra. Không có đối chứng thì một hàm
 *    luôn trả "không làm gì" cũng xanh.
 * 3. **Đi qua cửa ghi thật.** Cron viết qua `goiGhiXacMinh` / `goiDungTheoDoi`,
 *    nên lịch sử, lan toả điều phối và cổng bằng chứng đều là bản thật.
 */

import { createExecutionContext, env } from 'cloudflare:test';
import { afterEach, describe, expect } from 'vitest';
import {
  CHO_THU_LAI_MS,
  NHAN_CHUA_MERGE_7_NGAY,
  SO_LAN_THU_TOI_DA,
  THEO_DOI_COMMIT_MS,
  quyetDinhBaoChuaMerge,
  quyetDinhThuLai,
} from '@baton/shared';
import { chayCron } from '../src/index.js';
import {
  CRON_THEO_DOI,
  CRON_THU_LAI,
  SO_SONG_SONG,
  TRAN_DONG_MOI_LUOT,
  noiDungTuDong,
  quetTheoDoiPushed,
  quetThuLai,
  viecCuaCron,
} from '../src/cron-bang-chung.js';
import { khoaCommit, nguonGitHubGiaLap } from '../src/nguon-github.js';
import { nguonDeployGiaLap } from '../src/nguon-deploy.js';
import { KENH_CHO_GUI } from '../src/thong-bao.js';
import { tiemNguonXacMinh } from '../src/xac-minh-bang-chung.js';
import { caQuaSo, choToi, soRequestBay } from './cho-toi.js';
import {
  TOKEN_CHU,
  WS,
  bangChungTrongDb,
  cauDungBangChung,
  datNguonGiaLap,
  dungAgentCoToken,
  dungBangChung,
  dungDuAn,
  dungLienKet,
  dungTicket,
  dungWorkspace,
  goiApi,
  trangThaiCua,
} from './giup.js';

const P = 'pj-SAI';
const TK = 'tk-pj-SAI-1';
const TK2 = 'tk-pj-SAI-2';
const TK_CON = 'tk-pj-SAI-3';
const TK_DP = 'tk-pj-COS-1';

const HASH = 'a1b2c3d4e5f6a7b8';
const REPO = 'chu/baton';
const URL_DEPLOY = 'https://baton.example.com/khoe';

const ID_RV = 'ag-rv';
const TOKEN_RV = 'bt_t_rv';

/** `bay_gio` của mọi lần quét trong file này. */
function bay_gio(): number {
  return Date.now();
}

/**
 * **Một `scheduledTime` rơi đúng phút `phut` của giờ `gio` UTC.**
 *
 * Từ 10/10 Worker có **một** cron `* * * * *` và chọn việc theo `scheduledTime`
 * (`viecCuaCron`), nên ca test phải nói **mốc nhịp**, không một chuỗi cron. Ngày
 * trong mốc không quan trọng ở file này: `bay_gio` của mọi phép nghiệp vụ vẫn là
 * `Date.now()` — `scheduledTime` chỉ chọn việc.
 */
function nhip(gio: number, phut: number): number {
  return Date.UTC(2026, 9, 6, gio, phut);
}

/**
 * Nhịp chỉ bật `thu_lai` + `thong_bao`: phút **không** chia hết 5 (nên không cảnh
 * báo) và ngoài hai cửa sổ báo cáo.
 */
const NHIP_THU_LAI = nhip(3, 1);

/** Nhịp bật thêm `theo_doi`: phút chia hết 10 (d.221), ngoài cửa sổ báo cáo. */
const NHIP_THEO_DOI = nhip(3, 10);

/*
 * **Sổ các lượt chạy ngầm còn đang bay** (BAT-13, mẫu `cho-dai.test.ts`): lượt quét
 * chậm không await ngay mà assert ở giữa đỏ thì nó còn gọi mạng giả/ghi D1 sau khi
 * pool đã pop storage cô lập của ca. `afterEach` chờ hết.
 */
const bay = soRequestBay();

afterEach(async () => {
  await bay.doiHet();
}, 30_000);

// Cả thân mỗi ca/`beforeEach` cũng đi qua sổ đó (BAT-54, khuôn BAT-53, xem
// `caQuaSo`): ca hết giờ không để lượt quét/request còn dở của thân chạm DO/D1 lúc
// pool pop storage.
const { it, beforeEach } = caQuaSo(bay);

/** Một lượt cron "thử lại" (nhịp mỗi phút). */
function cronThuLai(): ReturnType<typeof chayCron> {
  return chayCron({ scheduledTime: NHIP_THU_LAI }, env);
}

/** Một lượt cron "theo dõi commit `pushed`" (nhịp phút chia hết 10). */
function cronTheoDoi(): ReturnType<typeof chayCron> {
  return chayCron({ scheduledTime: NHIP_THEO_DOI }, env);
}

/** Đặt cờ hồ sơ dự án — SPEC mục 7 d.215, d.217. */
async function datCoDuAn(co: { khong_code?: boolean; bat_buoc_review?: boolean }): Promise<void> {
  if (co.khong_code !== undefined) {
    await env.DB.prepare('UPDATE project SET khong_code = ? WHERE id = ?')
      .bind(co.khong_code ? 1 : 0, P)
      .run();
  }
  if (co.bat_buoc_review !== undefined) {
    await env.DB.prepare('UPDATE project SET bat_buoc_review = ? WHERE id = ?')
      .bind(co.bat_buoc_review ? 1 : 0, P)
      .run();
  }
}

/** Các dòng lịch sử của một ticket, mới nhất trước. */
async function lichSu(
  ticket_id: string,
): Promise<{ truong: string; gia_tri_moi: string | null; tac_gia_loai: string }[]> {
  const { results } = await env.DB.prepare(
    `SELECT truong, gia_tri_moi, tac_gia_loai FROM ticket_history
      WHERE ticket_id = ? ORDER BY luc DESC, truong`,
  )
    .bind(ticket_id)
    .all<{ truong: string; gia_tri_moi: string | null; tac_gia_loai: string }>();
  return results;
}

beforeEach(async () => {
  await dungWorkspace();
  await dungDuAn('SAI', 'Sample');
  await dungDuAn('COS', 'Điều phối');
  await dungTicket(P, 1, 'Việc chính', { trang_thai: 'verifying' });
  await dungTicket(P, 2, 'Việc thứ hai', { trang_thai: 'verifying' });
  await dungTicket(P, 3, 'Ticket con', { trang_thai: 'todo' });
  await dungTicket('pj-COS', 1, 'Ticket điều phối', { trang_thai: 'in_progress' });
  await dungAgentCoToken({
    id: ID_RV,
    ten: 'R',
    vai_tro: 'reviewer',
    token: TOKEN_RV,
    du_an: [P],
  });
  // Mặc định: không bắt buộc review, nên cổng chỉ cần một commit `merged` —
  // từng ca cần review thì tự bật lại cờ.
  await datCoDuAn({ bat_buoc_review: false, khong_code: false });
  datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' }, deploy: { [URL_DEPLOY]: 200 } });
});

/* ================================================================== *
 * A. Luật thuần của d.220 và 19.7
 * ================================================================== */

describe('d.220 — luật thuần: thử lại 5 phút, TỐI ĐA 3 lần, rồi `failed` VỚI LÝ DO', () => {
  it('ba lần đầu còn lượt; lần thứ 3 là lần cuối', () => {
    const t = 1_000_000;
    const l1 = quyetDinhThuLai(0, 'mạng lỗi', t);
    expect(l1).toMatchObject({ so_lan_thu: 1, con_luot: true, thu_lai_luc: t + CHO_THU_LAI_MS });

    const l2 = quyetDinhThuLai(1, 'mạng lỗi', t);
    expect(l2).toMatchObject({ so_lan_thu: 2, con_luot: true, thu_lai_luc: t + CHO_THU_LAI_MS });

    const l3 = quyetDinhThuLai(2, 'mạng lỗi', t);
    expect(l3).toMatchObject({ so_lan_thu: SO_LAN_THU_TOI_DA, con_luot: false, thu_lai_luc: null });
  });

  it('hết lượt thì lý do nói rõ VÌ SAO, không phải chuỗi rỗng (d.220 "với lý do")', () => {
    const qd = quyetDinhThuLai(2, 'Không gọi được GitHub API', 0);
    expect(qd.ly_do).toMatch(/3 lần thử lại/);
    expect(qd.ly_do).toMatch(/Không gọi được GitHub API/);
    expect(qd.ly_do.length).toBeGreaterThan(20);
  });

  it('nguồn KHÔNG trả lý do thì vẫn có một câu nền — `failed` không bao giờ lý do rỗng', () => {
    for (const ly_do of [null, '', '   ']) {
      const qd = quyetDinhThuLai(2, ly_do, 0);
      expect(qd.ly_do.trim().length, JSON.stringify(ly_do)).toBeGreaterThan(20);
      expect(qd.ly_do).toMatch(/không rõ nguyên nhân/);
    }
  });

  it('`so_lan_thu` bị KẸP ở 3 — CHECK của migration 0009 không bao giờ vỡ', () => {
    expect(quyetDinhThuLai(3, 'x', 0).so_lan_thu).toBe(3);
    expect(quyetDinhThuLai(99, 'x', 0).so_lan_thu).toBe(3);
  });
});

describe('19.7 — luật thuần: mốc chống bắn lặp của "chưa merge sau 7 ngày"', () => {
  it('nhãn đúng CHỮ SPEC', () => {
    expect(NHAN_CHUA_MERGE_7_NGAY).toBe('chưa merge sau 7 ngày');
  });

  it('chưa bắn cho mốc này → bắn; đã bắn cho đúng mốc này → KHÔNG bắn nữa ("1 lần")', () => {
    expect(quyetDinhBaoChuaMerge({ theo_doi_den_luc: 500, chua_merge_bao_moc: null })).toEqual({
      can_ban: true,
      moc_moi: 500,
    });
    expect(quyetDinhBaoChuaMerge({ theo_doi_den_luc: 500, chua_merge_bao_moc: 500 })).toEqual({
      can_ban: false,
      moc_moi: null,
    });
  });

  it('ĐỐI CHỨNG: mốc MỚI (cửa sổ theo dõi thứ hai) → bắn LẠI — đây là lý do dùng mốc, không dùng cờ', () => {
    expect(quyetDinhBaoChuaMerge({ theo_doi_den_luc: 900, chua_merge_bao_moc: 500 })).toEqual({
      can_ban: true,
      moc_moi: 900,
    });
  });

  it('không theo dõi (mốc `null`) → không có gì để báo', () => {
    expect(quyetDinhBaoChuaMerge({ theo_doi_den_luc: null, chua_merge_bao_moc: null }).can_ban).toBe(
      false,
    );
  });
});

/* ================================================================== *
 * B. Index: hai câu truy vấn THẬT của Cron
 * ================================================================== */

describe('Cron đi theo index RIÊNG PHẦN của 0009, không quét bảng', () => {
  async function keHoach(sql: string, bind: (string | number)[]): Promise<string> {
    const { results } = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(...bind)
      .all<{ detail: string }>();
    return results.map((r) => r.detail).join(' | ');
  }

  /*
   * Hai câu dưới đây là **đúng chữ** câu trong `cron-bang-chung.ts`, kể cả
   * `rut_luc IS NULL` (d.222: bằng chứng đã rút không được tính) và `LIMIT 100`.
   * Mục (b)/(c) của `bang-chung.test.ts` canh câu **không** có `rut_luc`; ca này
   * canh câu Cron **thật sự chạy** — thêm một điều kiện lọc mà làm mất index là
   * đúng cái không ai nhận ra qua mắt thường.
   */
  it('(b+) câu thử lại thật của Cron (có `rut_luc IS NULL`) vẫn đi `ix_evidence_thu_lai`', async () => {
    const kh = await keHoach(
      `SELECT id FROM evidence
        WHERE xac_minh = 'pending' AND thu_lai_luc IS NOT NULL AND thu_lai_luc <= ?
          AND rut_luc IS NULL
        ORDER BY thu_lai_luc, id LIMIT ${String(TRAN_DONG_MOI_LUOT)}`,
      [Date.now()],
    );
    expect(kh).toContain('ix_evidence_thu_lai');
    expect(kh).not.toContain('SCAN evidence');
    expect(kh).not.toContain('TEMP B-TREE');
  });

  it('(c+) câu theo dõi thật của Cron vẫn đi `ix_evidence_theo_doi`', async () => {
    const kh = await keHoach(
      `SELECT id FROM evidence
        WHERE xac_minh = 'pushed' AND theo_doi_den_luc IS NOT NULL AND rut_luc IS NULL
        ORDER BY theo_doi_den_luc, id LIMIT ${String(TRAN_DONG_MOI_LUOT)}`,
      [],
    );
    expect(kh).toContain('ix_evidence_theo_doi');
    expect(kh).not.toContain('SCAN evidence');
    expect(kh).not.toContain('TEMP B-TREE');
  });

  it('trần số dòng mỗi lượt quét là 100, và số song song nhỏ hơn trần', () => {
    expect(TRAN_DONG_MOI_LUOT).toBe(100);
    expect(SO_SONG_SONG).toBeLessThan(TRAN_DONG_MOI_LUOT);
  });
});

/* ================================================================== *
 * C. d.220 — Cron thử lại bằng chứng `pending`
 * ================================================================== */

describe('d.220 — Cron thử lại bằng chứng `pending` đến hạn', () => {
  it('đến hạn + nguồn trả lời được → kết luận thật, mốc thử lại bị XOÁ', async () => {
    await dungBangChung('ev-1', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });

    const kq = await cronThuLai();
    expect(kq.thu_lai.so_dong).toBe(1);
    expect(kq.thu_lai.so_ghi).toBe(1);

    const d = await bangChungTrongDb('ev-1');
    expect(d?.xac_minh).toBe('merged');
    expect(d?.thu_lai_luc).toBeNull();
    // Một lần thử lại đã dùng, dù nó thành công.
    expect(d?.so_lan_thu).toBe(1);
  });

  it('CHƯA đến hạn thì KHÔNG bị quét (mốc 5 phút là mốc thật, không phải trang trí)', async () => {
    await dungBangChung('ev-som', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() + 60_000,
    });

    const kq = await cronThuLai();
    expect(kq.thu_lai.so_dong).toBe(0);
    expect((await bangChungTrongDb('ev-som'))?.xac_minh).toBe('pending');

    // ĐỐI CHỨNG: cùng dòng, kéo mốc về quá khứ → lượt quét sau xử lý ngay.
    await env.DB.prepare('UPDATE evidence SET thu_lai_luc = ? WHERE id = ?')
      .bind(bay_gio() - 1, 'ev-som')
      .run();
    expect((await cronThuLai()).thu_lai.so_dong).toBe(1);
    expect((await bangChungTrongDb('ev-som'))?.xac_minh).toBe('merged');
  });

  it('d.222: bằng chứng ĐÃ RÚT không bị quét (+ đối chứng: chưa rút thì có)', async () => {
    await dungBangChung('ev-rut', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
      rut_luc: bay_gio() - 1,
    });
    expect((await cronThuLai()).thu_lai.so_dong).toBe(0);
    expect((await bangChungTrongDb('ev-rut'))?.xac_minh).toBe('pending');

    await dungBangChung('ev-chua-rut', TK2, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });
    expect((await cronThuLai()).thu_lai.so_dong).toBe(1);
    expect((await bangChungTrongDb('ev-chua-rut'))?.xac_minh).toBe('merged');
  });

  it('TRẦN 3 LẦN: lỗi mạng ba lượt → `pending`, `pending`, rồi `failed` kèm lý do', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: { loi: 'Không gọi được GitHub API' } } });
    await dungBangChung('ev-loi', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });

    // Lượt 1 và 2: còn lượt thử → ở lại `pending`, mốc mới được đặt.
    for (const lan of [1, 2]) {
      // Mốc mới nằm ở tương lai, nên phải kéo về để lượt sau nhặt được.
      await env.DB.prepare('UPDATE evidence SET thu_lai_luc = ? WHERE id = ?')
        .bind(bay_gio() - 1, 'ev-loi')
        .run();
      await cronThuLai();
      const d = await bangChungTrongDb('ev-loi');
      expect(d?.xac_minh, `lượt ${String(lan)}`).toBe('pending');
      expect(d?.so_lan_thu).toBe(lan);
      expect(d?.thu_lai_luc).not.toBeNull();
    }

    // Lượt 3: hết lượt → `failed` **với lý do**, và không còn mốc thử lại.
    await env.DB.prepare('UPDATE evidence SET thu_lai_luc = ? WHERE id = ?')
      .bind(bay_gio() - 1, 'ev-loi')
      .run();
    const kq = await cronThuLai();
    expect(kq.thu_lai.so_failed).toBe(1);

    const d = await bangChungTrongDb('ev-loi');
    expect(d?.xac_minh).toBe('failed');
    expect(d?.so_lan_thu).toBe(SO_LAN_THU_TOI_DA);
    expect(d?.thu_lai_luc).toBeNull();
    expect(d?.ly_do).toMatch(/3 lần thử lại/);
    expect(d?.ly_do).toMatch(/Không gọi được GitHub API/);

    // Và dòng đã rời index riêng phần: lượt quét sau không thấy nó nữa.
    expect((await cronThuLai()).thu_lai.so_dong).toBe(0);
  });

  it('ĐỐI CHỨNG của trần: nguồn hồi phục ở lần thử thứ 3 → `merged`, KHÔNG `failed`', async () => {
    await dungBangChung('ev-hoi', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      so_lan_thu: 2,
      thu_lai_luc: bay_gio() - 1,
    });
    await cronThuLai();
    const d = await bangChungTrongDb('ev-hoi');
    expect(d?.xac_minh).toBe('merged');
    expect(d?.so_lan_thu).toBe(3);
  });

  it('d.206 "không tìm thấy thì trượt": `failed` NGAY, không đợi hết 3 lần', async () => {
    datNguonGiaLap({ commit: {} });
    await dungBangChung('ev-khong-thay', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });
    await cronThuLai();
    const d = await bangChungTrongDb('ev-khong-thay');
    expect(d?.xac_minh).toBe('failed');
    expect(d?.so_lan_thu).toBe(1);
    expect(d?.ly_do).toMatch(/Không tìm thấy commit/);
  });

  it('deploy `pending` đến hạn cũng được thử lại (d.207), không riêng commit', async () => {
    await dungBangChung('ev-dep', TK, 'deploy', {
      xac_minh: 'pending',
      url: URL_DEPLOY,
      thu_lai_luc: bay_gio() - 1,
    });
    await cronThuLai();
    expect((await bangChungTrongDb('ev-dep'))?.xac_minh).toBe('passed');
  });

  it('d.207 + #57: URL nội bộ ghi THẲNG vào DB → `failed`, và Cron KHÔNG gọi mạng', async () => {
    /*
     * Dòng này không vào được bằng đường HTTP (`kiemBangChungDeploy` chặn), nhưng
     * migration và nhập dữ liệu của mục 16 ghi thẳng được. Cron là đường **thứ
     * hai** đọc `url` từ DB, nên nó phải tự kiểm — nếu không, một dòng như vậy
     * biến Cron thành công cụ gọi vào máy chủ metadata.
     */
    await env.DB.prepare(
      `INSERT INTO evidence
         (id, workspace_id, ticket_id, loai, nguoi_gui_loai, gui_luc, xac_minh,
          url, thu_lai_luc, tao_luc, cap_nhat_luc)
       VALUES ('ev-ssrf', ?, ?, 'deploy', 'owner', ?, 'pending', 'https://169.254.169.254/', ?, ?, ?)`,
    )
      .bind(WS, TK, bay_gio(), bay_gio() - 1, bay_gio(), bay_gio())
      .run();

    // Nguồn giả lập **không** có URL này; nếu Cron gọi mạng thì nó sẽ nhận một
    // lỗi giả lập và đi đường `pending`, chứ không `failed` ngay.
    await cronThuLai();
    const d = await bangChungTrongDb('ev-ssrf');
    expect(d?.xac_minh).toBe('failed');
    expect(d?.ly_do).toMatch(/không hợp lệ/);

    // ĐỐI CHỨNG ở tầng hàm: URL công khai thì dựng được nội dung.
    expect(
      noiDungTuDong({
        id: 'x',
        workspace_id: WS,
        ticket_id: TK,
        loai: 'deploy',
        so_lan_thu: 0,
        commit_hash: null,
        repo: null,
        merged_cuc_bo: 0,
        url: URL_DEPLOY,
        ma_phien_ban: null,
        theo_doi_den_luc: null,
      }),
    ).toEqual({ loai: 'deploy', url: URL_DEPLOY, ma_phien_ban: null });
  });

  /*
   * **CẢ THÂN ca nằm trong MỘT promise đi qua sổ `bay`** (BAT-51 lượt 2).
   *
   * Ca này là ca nặng nhất file: 100 lượt ghi kết luận, mỗi lượt một lần gọi cửa ghi
   * (DO) với vài câu D1 bên trong — đúng kiến trúc "mỗi dòng một lượt ghi ngắn qua cửa
   * ghi" của `cron-bang-chung.ts`, không phải một vòng lặp thừa. Vitest **không dừng**
   * thân một ca khi hết giờ: nó chỉ thôi chờ, chạy `afterEach`, rồi pool pop storage
   * cô lập. Phần thân còn lại (lượt quét, `bangChungTrongDb`, lượt quét thứ hai) vẫn
   * chạy tiếp và chạm D1/DO lúc storage đang bị pop ⇒ "Isolated storage failed" kéo đổ
   * các ca sau.
   *
   * Lượt 1 chỉ đưa HAI lượt quét vào sổ — chưa đủ: `afterEach → doiHet` chụp sổ lúc
   * đó (mới có `l1`) rồi xoá, còn `l2` và các câu đọc đăng ký/chạy SAU khi `doiHet` đã
   * xong. Nay sổ giữ promise của **cả thân**, đăng ký ngay khi ca bắt đầu, nên
   * `afterEach` chờ tới câu I/O cuối cùng của ca rồi mới để pool pop. Ca hết giờ thì
   * đỏ **đúng một ca, đúng tên**; không ca nào khác bị kéo theo. Trần 5 s không đổi.
   */
  it('TRẦN 100 dòng mỗi lượt: lượt 1 lấy đúng 100 và báo `day_tran`, phần còn lại đợi lượt sau', () =>
    bay.theoDoi(
      (async () => {
        // `khong_thay` → `failed` ngay, nên ca này không kéo theo 101 lần kiểm cổng.
        datNguonGiaLap({ commit: {} });
        const t = bay_gio();
        // Gieo cả 101 dòng trong MỘT lô (BAT-51): 101 lượt đi về D1 tuần tự là thời
        // gian ca không định đo. Cùng câu INSERT với `dungBangChung`.
        await env.DB.batch(
          Array.from({ length: TRAN_DONG_MOI_LUOT + 1 }, (_, i) =>
            cauDungBangChung(`ev-tran-${String(i).padStart(3, '0')}`, TK, 'commit', {
              xac_minh: 'pending',
              commit_hash: HASH,
              repo: REPO,
              // Mốc tăng dần: thứ tự `ORDER BY thu_lai_luc, id` là xác định.
              thu_lai_luc: t - 10_000 + i,
            }),
          ),
        );

        const l1 = await quetThuLai(env, bay_gio());
        expect(l1.so_dong).toBe(TRAN_DONG_MOI_LUOT);
        expect(l1.day_tran).toBe(true);

        // Dòng cuối (mốc muộn nhất) chưa được xử lý — đúng hệ quả đã khai.
        expect((await bangChungTrongDb('ev-tran-100'))?.xac_minh).toBe('pending');

        const l2 = await quetThuLai(env, bay_gio());
        expect(l2.so_dong).toBe(1);
        expect(l2.day_tran).toBe(false);
        expect((await bangChungTrongDb('ev-tran-100'))?.xac_minh).toBe('failed');
      })(),
    ));
});

/* ================================================================== *
 * D. d.221 + 19.2 — TỰ LÊN XONG
 * ================================================================== */

describe('d.221 + 19.2 — tự lên Xong', () => {
  async function evPendingCommit(id = 'ev-c', ticket = TK): Promise<void> {
    await dungBangChung(id, ticket, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });
  }

  it('ticket ở Chờ kiểm chứng + commit thành `merged` → TỰ sang Xong', async () => {
    await evPendingCommit();
    const kq = await cronThuLai();

    expect(kq.thu_lai.so_tu_len_xong).toBe(1);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('lịch sử ghi người làm là "hệ thống" — KHÔNG phải chủ, không phải agent nào', async () => {
    await evPendingCommit();
    await cronThuLai();

    const ls = await lichSu(TK);
    const dong_trang_thai = ls.filter((d) => d.truong === 'trang_thai');
    expect(dong_trang_thai.length).toBeGreaterThan(0);
    expect(dong_trang_thai[0]?.gia_tri_moi).toBe('done');
    expect(dong_trang_thai[0]?.tac_gia_loai).toBe('system');
    // Không có dòng nào của lượt tự động mang tác giả `owner`/`agent`.
    for (const d of ls) expect(d.tac_gia_loai).toBe('system');
  });

  it('ĐỐI CHỨNG 19.2: ticket còn ĐANG LÀM → commit merged mà "chưa có gì xảy ra"', async () => {
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'in_progress' WHERE id = ?")
      .bind(TK)
      .run();
    await evPendingCommit();

    const kq = await cronThuLai();
    // Bằng chứng vẫn được xác minh — chỉ ticket là không đổi.
    expect((await bangChungTrongDb('ev-c'))?.xac_minh).toBe('merged');
    expect(kq.thu_lai.so_tu_len_xong).toBe(0);
    expect(await trangThaiCua(TK)).toBe('in_progress');
    expect(await lichSu(TK)).toHaveLength(0);
  });

  it.each(['todo', 'backlog', 'done', 'canceled'] as const)(
    'ĐỐI CHỨNG 19.2: ticket ở %s cũng KHÔNG tự lên Xong qua đường Cron',
    async (tt) => {
      await env.DB.prepare('UPDATE ticket SET trang_thai = ? WHERE id = ?').bind(tt, TK).run();
      await evPendingCommit();
      await cronThuLai();
      expect(await trangThaiCua(TK)).toBe(tt);
    },
  );

  it('mục 4 `CHILDREN_OPEN` VẪN ÁP trên đường tự động: cha còn con chưa kết thì không lên Xong', async () => {
    await dungLienKet(TK, TK_CON, 'parent');
    await evPendingCommit();

    const kq = await cronThuLai();
    expect((await bangChungTrongDb('ev-c'))?.xac_minh).toBe('merged');
    expect(kq.thu_lai.so_tu_len_xong).toBe(0);
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('ĐỐI CHỨNG `CHILDREN_OPEN`: con đã kết rồi thì cha tự lên Xong', async () => {
    await dungLienKet(TK, TK_CON, 'parent');
    await env.DB.prepare("UPDATE ticket SET trang_thai = 'done' WHERE id = ?").bind(TK_CON).run();
    await evPendingCommit();

    expect((await cronThuLai()).thu_lai.so_tu_len_xong).toBe(1);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('19.4: lan toả lên ticket ĐIỀU PHỐI chạy như mọi đường đổi trạng thái', async () => {
    await dungLienKet(TK_DP, TK, 'dieu_phoi');
    await evPendingCommit();

    await cronThuLai();
    expect(await trangThaiCua(TK)).toBe('done');
    // Mọi ticket dự án đã kết và có ít nhất 1 Xong → ticket điều phối là Xong.
    expect(await trangThaiCua(TK_DP)).toBe('done');
    // Và lịch sử của nó cũng là "hệ thống" (19.4).
    const ls = await lichSu(TK_DP);
    expect(ls.some((d) => d.truong === 'trang_thai' && d.gia_tri_moi === 'done')).toBe(true);
    for (const d of ls) expect(d.tac_gia_loai).toBe('system');
  });

  it('ĐỐI CHỨNG 19.4: còn một ticket dự án đang `active` → ticket điều phối vẫn Đang làm', async () => {
    await dungLienKet(TK_DP, TK, 'dieu_phoi');
    await dungLienKet(TK_DP, TK2, 'dieu_phoi');
    await evPendingCommit();

    await cronThuLai();
    expect(await trangThaiCua(TK)).toBe('done');
    expect(await trangThaiCua(TK_DP)).toBe('in_progress');
  });

  it('d.215 + 19.3: dự án bắt buộc review mà thiếu review ĐẠT → KHÔNG tự lên Xong', async () => {
    await datCoDuAn({ bat_buoc_review: true });
    await evPendingCommit();

    await cronThuLai();
    expect((await bangChungTrongDb('ev-c'))?.xac_minh).toBe('merged');
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('ĐỐI CHỨNG: cùng dữ liệu + một review ĐẠT gửi SAU commit → tự lên Xong', async () => {
    await datCoDuAn({ bat_buoc_review: true });
    await evPendingCommit();
    // Review gửi qua HTTP thật, **sau** bằng chứng commit (19.3 là luật thứ tự).
    const res = await goiApi(`/v1/ticket/${TK}/bang-chung`, TOKEN_RV, {
      method: 'POST',
      than: { loai_bang_chung: 'review', ket_luan: 'pass' },
    });
    expect(res.status).toBe(201);

    expect((await cronThuLai()).thu_lai.so_tu_len_xong).toBe(1);
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('kết luận KHÔNG mở cổng (`failed`) thì không kiểm cổng, ticket đứng yên', async () => {
    datNguonGiaLap({ commit: {} });
    await evPendingCommit();
    await cronThuLai();
    expect((await bangChungTrongDb('ev-c'))?.xac_minh).toBe('failed');
    expect(await trangThaiCua(TK)).toBe('verifying');
  });
});

/* ================================================================== *
 * E. d.217 + 19.10 — dự án KHÔNG CODE trên đường tự động
 * ================================================================== */

describe('d.217 + 19.10 — dự án không code + đường Cron', () => {
  it('d.217: có `note` mà CHƯA có chủ xác nhận → Cron KHÔNG đưa lên Xong', async () => {
    await datCoDuAn({ khong_code: true });
    await dungBangChung('ev-note', TK, 'note', { noi_dung: 'Đã gửi hồ sơ cho HR.' });
    await dungBangChung('ev-c', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });

    await cronThuLai();
    // Commit vẫn `merged` — nhưng cổng của dự án không code **không đọc** commit:
    // nó cần 1 `file`/`note` **cộng chủ xác nhận** (chỗ cắm phần 4, luôn `false`).
    expect((await bangChungTrongDb('ev-c'))?.xac_minh).toBe('merged');
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('ĐỐI CHỨNG: cùng dữ liệu, dự án CÓ code → Cron đưa lên Xong', async () => {
    await datCoDuAn({ khong_code: false });
    await dungBangChung('ev-note', TK, 'note', { noi_dung: 'Ghi chú' });
    await dungBangChung('ev-c', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });

    await cronThuLai();
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('19.10: cổng áp theo cờ TẠI THỜI ĐIỂM KIỂM — chủ bật/tắt cờ giữa hai lượt quét', async () => {
    await datCoDuAn({ khong_code: true });
    await dungBangChung('ev-note', TK, 'note', { noi_dung: 'Ghi chú' });
    await dungBangChung('ev-c1', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });

    // Lượt 1, cờ **bật**: ở lại Chờ kiểm chứng.
    await cronThuLai();
    expect(await trangThaiCua(TK)).toBe('verifying');

    // Chủ **tắt** cờ, rồi một bằng chứng commit nữa đến hạn → lượt 2 đi theo cờ
    // MỚI và ticket lên Xong. Không có chỗ nào nhớ lại cờ của lượt 1.
    await datCoDuAn({ khong_code: false });
    await dungBangChung('ev-c2', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });
    await cronThuLai();
    expect(await trangThaiCua(TK)).toBe('done');
  });
});

/* ================================================================== *
 * F. d.221 + 19.7 — kiểm lại commit `pushed`, dừng theo dõi sau 7 ngày
 * ================================================================== */

describe('d.221 + 19.7 — commit `pushed`', () => {
  async function evPushed(id: string, con_lai_ms: number, ticket = TK): Promise<void> {
    await dungBangChung(id, ticket, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      theo_doi_den_luc: bay_gio() + con_lai_ms,
    });
  }

  it('còn trong 7 ngày + commit đã được merge → `merged`, mốc theo dõi bị xoá, ticket lên Xong', async () => {
    await evPushed('ev-p', THEO_DOI_COMMIT_MS);

    const kq = await cronTheoDoi();
    expect(kq.theo_doi.so_ghi).toBe(1);
    expect(kq.theo_doi.so_tu_len_xong).toBe(1);

    const d = await bangChungTrongDb('ev-p');
    expect(d?.xac_minh).toBe('merged');
    expect(d?.theo_doi_den_luc).toBeNull();
    expect(await trangThaiCua(TK)).toBe('done');
  });

  it('vẫn chưa merge → KHÔNG ghi gì, và mốc 7 ngày KHÔNG được gia hạn', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'pushed' } });
    await evPushed('ev-p', THEO_DOI_COMMIT_MS);
    const truoc = (await bangChungTrongDb('ev-p'))?.theo_doi_den_luc;

    const kq = await cronTheoDoi();
    expect(kq.theo_doi.so_dong).toBe(1);
    expect(kq.theo_doi.so_ghi).toBe(0);

    const d = await bangChungTrongDb('ev-p');
    expect(d?.xac_minh).toBe('pushed');
    // Ca canh quan trọng nhất của mục này: ghi lại `pushed` mỗi 10 phút sẽ **gia
    // hạn** đồng hồ 7 ngày mãi mãi, và 19.7 không bao giờ chạy được.
    expect(d?.theo_doi_den_luc).toBe(truoc);
    expect(await trangThaiCua(TK)).toBe('verifying');
  });

  it('lỗi mạng ở lần kiểm lại → dòng Ở LẠI `pushed`, không bị hạ về `pending`', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: { loi: 'mạng lỗi' } } });
    await evPushed('ev-p', THEO_DOI_COMMIT_MS);

    await cronTheoDoi();
    const d = await bangChungTrongDb('ev-p');
    expect(d?.xac_minh).toBe('pushed');
    expect(d?.so_lan_thu).toBe(0);
    expect(d?.theo_doi_den_luc).not.toBeNull();
  });

  it('QUÁ 7 ngày: dừng theo dõi + nhãn "chưa merge sau 7 ngày" + ĐÚNG 1 tin', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'pushed' } });
    await evPushed('ev-qua', -1);

    const kq = await cronTheoDoi();
    expect(kq.theo_doi.so_dung_theo_doi).toBe(1);
    expect(kq.theo_doi.so_tin).toBe(1);

    const d = await bangChungTrongDb('ev-qua');
    // "Dừng theo dõi": dòng rời index riêng phần.
    expect(d?.theo_doi_den_luc).toBeNull();
    // Nhãn.
    expect(d?.chua_merge_luc).not.toBeNull();
    expect(d?.chua_merge_bao_moc).not.toBeNull();
    // `xac_minh` **không đổi**: commit đó vẫn có thật trong repo (d.206).
    expect(d?.xac_minh).toBe('pushed');

    // Lượt quét sau: dòng không còn trong tầm quét, nên không có tin thứ hai.
    const sau = await cronTheoDoi();
    expect(sau.theo_doi.so_dong).toBe(0);
    expect(sau.theo_doi.so_tin).toBe(0);
  });

  it('"báo 1 lần": mốc đã bắn rồi thì lượt quét sau KHÔNG bắn lại, dù mốc vẫn quá hạn', async () => {
    const moc = bay_gio() - 1;
    await dungBangChung('ev-da-bao', TK, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      theo_doi_den_luc: moc,
      // Đã dừng theo dõi và đã bắn cho đúng mốc này ở một lượt trước, rồi một
      // đường khác đặt lại mốc theo dõi **cũ**.
      chua_merge_luc: moc,
      chua_merge_bao_moc: moc,
    });

    const kq = await cronTheoDoi();
    expect(kq.theo_doi.so_dung_theo_doi).toBe(1);
    expect(kq.theo_doi.so_tin).toBe(0);
    // Mốc không bị xoá: lần quét sau vẫn thấy "đã bắn".
    expect((await bangChungTrongDb('ev-da-bao'))?.chua_merge_bao_moc).toBe(moc);
  });

  it('ĐỐI CHỨNG "báo 1 lần": cửa sổ theo dõi MỚI (mốc khác) → bắn LẠI', async () => {
    const moc_cu = bay_gio() - 1_000_000;
    await dungBangChung('ev-moc-moi', TK, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      // Mốc hiện tại khác mốc đã bắn → một cửa sổ theo dõi thứ hai.
      theo_doi_den_luc: bay_gio() - 1,
      chua_merge_luc: moc_cu,
      chua_merge_bao_moc: moc_cu,
    });

    const kq = await cronTheoDoi();
    expect(kq.theo_doi.so_tin).toBe(1);
    expect((await bangChungTrongDb('ev-moc-moi'))?.chua_merge_bao_moc).not.toBe(moc_cu);
  });

  it('nội dung tin nói rõ commit, ticket và nhãn — và KHÔNG gửi gì ra ngoài', async () => {
    await evPushed('ev-tin', -1);
    const kq = await quetTheoDoiPushed(env, bay_gio());
    expect(kq.so_tin).toBe(1);

    // Nội dung tin đọc được qua cửa ghi (`goiDungTheoDoi` trả về nó).
    const { goiDungTheoDoi } = await import('../src/workspace-gate.js');
    await dungBangChung('ev-tin-2', TK2, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      theo_doi_den_luc: bay_gio() - 1,
    });
    const ra = await goiDungTheoDoi(env, { workspace_id: WS, bang_chung_id: 'ev-tin-2' });
    expect(ra.tin?.nhan).toBe(NHAN_CHUA_MERGE_7_NGAY);
    expect(ra.tin?.noi_dung).toContain(HASH);
    // BAT-7: mã ticket (`SAI-2`), không UUID.
    expect(ra.tin?.noi_dung).toContain('ticket SAI-2:');
    expect(ra.tin?.noi_dung).not.toContain(TK2);
    expect(ra.tin?.noi_dung).toContain(NHAN_CHUA_MERGE_7_NGAY);
    /*
     * **Không** lần gửi nào từ trong cửa ghi: kênh là `cho_cron`, tức "tin đợi
     * lượt quét gửi" (phần 7, `KENH_CHO_GUI`). Khai thẳng một nợ còn lại: tin
     * 19.7 này **chưa** được đặt vào bảng `thong_bao`, nên cron gửi không thấy
     * nó — xem "Việc phát sinh" của báo cáo phần 7 lượt 1.
     */
    expect(ra.kenh).toBe(KENH_CHO_GUI);
  });

  it('d.222: commit `pushed` ĐÃ RÚT thì không bị theo dõi, không bị gắn nhãn', async () => {
    await dungBangChung('ev-p-rut', TK, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      theo_doi_den_luc: bay_gio() - 1,
      rut_luc: bay_gio() - 1,
    });
    const kq = await cronTheoDoi();
    expect(kq.theo_doi.so_dong).toBe(0);
    expect((await bangChungTrongDb('ev-p-rut'))?.chua_merge_luc).toBeNull();
  });

  it('`theo_doi` KHÔNG ghi lên một dòng đang `pending` (mỗi chặng một trạng thái nguồn)', async () => {
    const { goiGhiXacMinh } = await import('../src/workspace-gate.js');
    await dungBangChung('ev-pend', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      // Mốc thử lại **đã đến hạn**: từ lượt 3 sửa review, chặng `thu_lai` của cửa
      // ghi kiểm lại mốc này (chống hai lượt cron chồng nhau), nên đối chứng ở dưới
      // phải là một dòng thật sự đang trong vòng thử lại của d.220.
      thu_lai_luc: bay_gio() - 1,
    });
    const ra = await goiGhiXacMinh(env, {
      workspace_id: WS,
      bang_chung_id: 'ev-pend',
      nguon: 'theo_doi',
      ket_qua: { xac_minh: 'merged', ly_do: null, ma_http: null, nguon_xac_minh: 'github' },
    });
    expect(ra.da_ghi).toBe(false);
    expect((await bangChungTrongDb('ev-pend'))?.xac_minh).toBe('pending');

    // ĐỐI CHỨNG: cùng dòng, chặng `thu_lai` thì ghi được.
    const ok = await goiGhiXacMinh(env, {
      workspace_id: WS,
      bang_chung_id: 'ev-pend',
      nguon: 'thu_lai',
      ket_qua: { xac_minh: 'merged', ly_do: null, ma_http: null, nguon_xac_minh: 'github' },
    });
    expect(ok.da_ghi).toBe(true);
    expect((await bangChungTrongDb('ev-pend'))?.xac_minh).toBe('merged');
  });

  it('commit `pushed` xác minh được ở lần THỬ LẠI cũng được đặt mốc theo dõi 7 ngày', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'pushed' } });
    await dungBangChung('ev-tl', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      so_lan_thu: 1,
      thu_lai_luc: bay_gio() - 1,
    });

    await cronThuLai();
    const d = await bangChungTrongDb('ev-tl');
    expect(d?.xac_minh).toBe('pushed');
    expect(d?.theo_doi_den_luc).not.toBeNull();
    expect(d!.theo_doi_den_luc!).toBeGreaterThan(bay_gio() + THEO_DOI_COMMIT_MS - 60_000);
  });
});

/* ================================================================== *
 * F2. Mốc 7 ngày BẰNG ĐÚNG `bay_gio`; và `pushed` mất khỏi GitHub
 * ================================================================== */

describe('19.7 + d.221 — hai ranh giới mà lượt 3 chưa canh', () => {
  /**
   * **Mốc theo dõi BẰNG ĐÚNG `bay_gio`.** SPEC 19.7 nói "quá 7 ngày" mà **không nói**
   * mốc bằng đúng thuộc bên nào (`spec-questions.md` #61). Hành vi đã cài: **bằng là
   * đã quá** → dừng theo dõi. Ca này khoá nó lại.
   *
   * Không có ca này thì đổi `theo_doi_den_luc <= bay_gio` thành `<` trong
   * `quetTheoDoiPushed` **không làm đỏ test nào** — mọi ca khác dùng mốc lệch hẳn.
   */
  it('#61: mốc theo dõi BẰNG ĐÚNG `bay_gio` → ĐÃ QUÁ, dừng theo dõi (không phải "còn hạn")', async () => {
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'pushed' } });
    const t = bay_gio();
    await dungBangChung('ev-bang', TK, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      theo_doi_den_luc: t,
    });

    const kq = await quetTheoDoiPushed(env, t);
    expect(kq.so_dung_theo_doi).toBe(1);
    expect(kq.so_tin).toBe(1);
    const d = await bangChungTrongDb('ev-bang');
    expect(d?.theo_doi_den_luc).toBeNull();
    expect(d?.chua_merge_luc).not.toBeNull();

    // ĐỐI CHỨNG: mốc **sau** `bay_gio` → còn hạn, đi nhánh kiểm lại, KHÔNG dừng
    // theo dõi và không gắn nhãn.
    await dungBangChung('ev-sau', TK2, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      theo_doi_den_luc: t + 60_000,
    });
    const kq2 = await quetTheoDoiPushed(env, t);
    expect(kq2.so_dong).toBe(1);
    expect(kq2.so_dung_theo_doi).toBe(0);
    expect(kq2.so_tin).toBe(0);
    const d2 = await bangChungTrongDb('ev-sau');
    expect(d2?.theo_doi_den_luc).toBe(t + 60_000);
    expect(d2?.chua_merge_luc).toBeNull();
  });

  /**
   * **Một commit đã `pushed` mà GitHub về sau không tìm thấy nữa** (force-push, repo
   * đổi tên, nhánh bị xoá). SPEC d.206 nói "không tìm thấy thì **trượt**", d.222 nói
   * bằng chứng "không sửa" — và SPEC **không nói** ca này (`spec-questions.md` #62).
   *
   * Ca này chốt **hành vi đang có**: chặng `theo_doi` ghi `failed` lên dòng, tức một
   * lần **đổi kết luận** trên một dòng đã có kết luận `pushed`. Không có nó thì thêm
   * `'failed'` vào danh sách `bo_qua` của nhánh `theo_doi` **không làm đỏ test nào**.
   */
  it('#62: commit `pushed` mà GitHub KHÔNG CÒN tìm thấy → hạ xuống `failed` (hành vi đang có)', async () => {
    datNguonGiaLap({ commit: {} });
    await dungBangChung('ev-mat', TK, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      theo_doi_den_luc: bay_gio() + THEO_DOI_COMMIT_MS,
    });

    const kq = await cronTheoDoi();
    expect(kq.theo_doi.so_ghi).toBe(1);
    expect(kq.theo_doi.so_failed).toBe(1);

    const d = await bangChungTrongDb('ev-mat');
    expect(d?.xac_minh).toBe('failed');
    expect(d?.ly_do).toMatch(/Không tìm thấy commit/);
    // Dừng theo dõi là **hệ quả** của việc có kết luận dứt điểm, không phải 19.7:
    // dòng không mang nhãn "chưa merge sau 7 ngày".
    expect(d?.theo_doi_den_luc).toBeNull();
    expect(d?.chua_merge_luc).toBeNull();
    // `failed` không mở cổng, nên ticket đứng yên.
    expect(await trangThaiCua(TK)).toBe('verifying');
  });
});

/* ================================================================== *
 * F3. Cô lập lỗi theo DÒNG, và hai lượt cron chồng nhau
 * ================================================================== */

describe('một dòng hỏng không lấy lượt của các dòng khác', () => {
  const HASH_NEM = 'bbbbbbbbbbbbbbbb';

  /** Nguồn giả lập **ném** cho đúng một hash; mọi hash khác trả `merged`. */
  function nguonNemMotHash(hash: string): void {
    tiemNguonXacMinh({
      github: {
        async tinhTrangCommit(_repo: string, h: string) {
          if (h === hash) throw new Error('LOI-RIENG-CUA-MOT-DONG');
          return { tinh_trang: 'merged' as const };
        },
      },
      deploy: {
        async goiUrl(_url: string) {
          return { ma_http: 200 };
        },
      },
    });
  }

  /**
   * **Lỗi chặn vĩnh viễn.** `Promise.all` không có `catch` theo phần tử, nên một dòng
   * ném là cả lô reject và `quetThuLai` ném — các dòng còn lại của lượt đó không được
   * xử lý. Dòng độc đặt mốc **sớm nhất** nên `ORDER BY thu_lai_luc, id` **luôn** xếp
   * nó vào lô đầu: lượt sau đọc lại đúng danh sách, lại đổ, mãi mãi.
   */
  it('d.220: một dòng NÉM thì hai dòng lành VẪN được kết luận, và `so_loi` = 1', async () => {
    nguonNemMotHash(HASH_NEM);
    const t = bay_gio();
    await dungBangChung('ev-doc', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH_NEM,
      repo: REPO,
      thu_lai_luc: t - 30_000,
    });
    await dungBangChung('ev-lanh-1', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: t - 20_000,
    });
    await dungBangChung('ev-lanh-2', TK2, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: t - 10_000,
    });

    const kq = await quetThuLai(env, t);
    expect(kq.so_dong).toBe(3);
    expect(kq.so_loi).toBe(1);
    expect(kq.so_ghi).toBe(2);
    expect((await bangChungTrongDb('ev-lanh-1'))?.xac_minh).toBe('merged');
    expect((await bangChungTrongDb('ev-lanh-2'))?.xac_minh).toBe('merged');
    // Dòng độc không tiến được, nhưng cũng **không bị đánh dấu** gì (#63): nó ở lại
    // `pending` và lượt sau gặp lại.
    expect((await bangChungTrongDb('ev-doc'))?.xac_minh).toBe('pending');
  });

  it('d.221: cùng lỗ ở nhánh `theo_doi` — một dòng NÉM, hai dòng lành vẫn `merged`', async () => {
    nguonNemMotHash(HASH_NEM);
    const t = bay_gio();
    await dungBangChung('ev-p-doc', TK, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH_NEM,
      repo: REPO,
      theo_doi_den_luc: t + 10_000,
    });
    await dungBangChung('ev-p-lanh-1', TK, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      theo_doi_den_luc: t + 20_000,
    });
    await dungBangChung('ev-p-lanh-2', TK2, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      theo_doi_den_luc: t + 30_000,
    });

    const kq = await quetTheoDoiPushed(env, t);
    expect(kq.so_dong).toBe(3);
    expect(kq.so_loi).toBe(1);
    expect(kq.so_ghi).toBe(2);
    expect((await bangChungTrongDb('ev-p-lanh-1'))?.xac_minh).toBe('merged');
    expect((await bangChungTrongDb('ev-p-lanh-2'))?.xac_minh).toBe('merged');
    expect((await bangChungTrongDb('ev-p-doc'))?.xac_minh).toBe('pushed');
  });

  it('lượt quét KHÔNG có dòng hỏng thì `so_loi` = 0 (đối chứng: con số không luôn 1)', async () => {
    await dungBangChung('ev-lanh', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });
    const kq = await cronThuLai();
    expect(kq.thu_lai.so_ghi).toBe(1);
    expect(kq.thu_lai.so_loi).toBe(0);
  });

  /**
   * **Hai lượt cron CHỒNG NHAU.** Nhịp là một phút, nhưng một lượt quét đầy trần (6
   * song song × 100 dòng × tới 10 giây) lâu hơn 60 giây, nên cron chồng chính nó.
   * Nếu cửa ghi chỉ kiểm `xac_minh === 'pending'` thì cả hai lượt đều ghi và **3 lượt
   * thử của d.220 bị tiêu trong hai phút thay vì 15 phút** — mốc 5 phút mất nghĩa.
   */
  it('d.220: hai lượt quét chồng nhau trên CÙNG một dòng → `so_lan_thu` chỉ nhích MỘT lần', async () => {
    // Nguồn lỗi (→ `pending`, có mốc mới) + chậm, để cả hai lượt kịp ĐỌC trước khi
    // lượt nào GHI. Đây đúng là cửa sổ đua thật.
    datNguonGiaLap({ commit: { [khoaCommit(REPO, HASH)]: { loi: 'mạng lỗi' } }, cham_ms: 300 });
    await dungBangChung('ev-chong', TK, 'commit', {
      xac_minh: 'pending',
      commit_hash: HASH,
      repo: REPO,
      thu_lai_luc: bay_gio() - 1,
    });

    const t = bay_gio();
    const [a, b] = await Promise.all([quetThuLai(env, t), quetThuLai(env, t)]);

    // Cả hai lượt **đều đọc được** dòng — nếu không thì ca này không đo cuộc đua nào.
    expect(a.so_dong).toBe(1);
    expect(b.so_dong).toBe(1);
    // Nhưng chỉ **một** lượt ghi được.
    expect(a.so_ghi + b.so_ghi).toBe(1);
    expect(a.so_loi + b.so_loi).toBe(0);

    const d = await bangChungTrongDb('ev-chong');
    expect(d?.xac_minh).toBe('pending');
    expect(d?.so_lan_thu).toBe(1);
    expect(d?.thu_lai_luc).toBeGreaterThan(t);
  });
});

/* ================================================================== *
 * G. Kiến trúc và phân nhánh cron
 * ================================================================== */

describe('kiến trúc Cron', () => {
  /**
   * **Cùng ca canh với `gui-bang-chung.test.ts` ("một lần xác minh CHẬM không
   * chặn hàng đợi ghi")**, nhưng cho Cron — nơi hậu quả nặng hơn, vì một lượt
   * quét gọi mạng tới 100 lần.
   *
   * **Không đo đồng hồ** (BAT-41 việc 2 — bản cũ đo `< 1_000 ms` / `>= 1_900 ms`
   * và đỏ ngẫu nhiên khi máy tải nặng). Nguồn giả lập ở đây **chặn tới khi ca thả
   * cửa**: lượt quét vào nguồn rồi đứng đó, đúng như đang chờ mạng. Trong lúc cửa
   * **còn đóng**, một lệnh ghi khác trên **cùng** workspace phải hoàn tất (201), và
   * lượt quét phải **chưa** xong. Nếu `fetch` chạy trong `WorkspaceGate` thì lệnh
   * kia xếp sau lượt quét, lượt quét chờ cửa, cửa chỉ mở sau khi lệnh kia về ⇒
   * lệnh kia chỉ về được khi trần 10 giây của d.219 (`xacMinhTrongHan`) cắt lượt
   * quét, tức **sau** khi lượt quét đã xong ⇒ ca đỏ ở `quet_xong === false` (đã đo
   * bằng đột biến BAT-41: chuyển `xacMinhTrongHan` vào `#ghiMotXacMinh` ⇒ đỏ đúng
   * dòng đó). Không có trần đó thì là kẹt hẳn ⇒ đỏ ở hàng rào `HAN_KET_MS`. Chặt
   * hơn bản đo giờ: bản cũ phân biệt "nhanh / chậm", bản này phân biệt thứ tự.
   *
   * Hàng rào kẹt **chỉ** chạm tới khi kiến trúc sai; ca xanh không đọc đồng hồ nào.
   * Cửa luôn được thả trong `finally`, và lượt quét + lệnh ghi đều vào sổ `bay`,
   * nên ca đỏ giữa chừng không để lượt nào sống quá ca.
   */
  it(
    'KIẾN TRÚC: một lượt quét CHẬM không chặn hàng đợi ghi của workspace',
    async () => {
      const HAN_KET_MS = 20_000;
      const goc = nguonGitHubGiaLap({ commit: { [khoaCommit(REPO, HASH)]: 'merged' } });
      let so_lan_goi_nguon = 0;
      let thaCua: () => void = () => undefined;
      const cua = new Promise<void>((ok) => {
        thaCua = ok;
      });
      tiemNguonXacMinh({
        github: {
          async tinhTrangCommit(repo: string, hash: string) {
            so_lan_goi_nguon += 1;
            await cua; // "đang chờ mạng" — tới khi ca thả
            return goc.tinhTrangCommit(repo, hash);
          },
        },
        deploy: nguonDeployGiaLap(),
      });
      await dungBangChung('ev-cham', TK, 'commit', {
        xac_minh: 'pending',
        commit_hash: HASH,
        repo: REPO,
        thu_lai_luc: bay_gio() - 1,
      });

      let quet_xong = false;
      const quet = bay.theoDoi(
        cronThuLai().finally(() => {
          quet_xong = true;
        }),
      );

      try {
        // 1. Lượt quét đã THẬT vào nguồn chậm (chứng minh nguồn chậm có được gọi).
        expect(await choToi(() => so_lan_goi_nguon > 0)).toBe(true);

        // 2. Cửa còn đóng: lệnh ghi khác trên cùng workspace phải về.
        const khac_p = bay.theoDoi(
          goiApi(`/v1/ticket/${TK2}/binh-luan`, TOKEN_CHU, {
            method: 'POST',
            than: { noi_dung: 'Lệnh ghi khác, không được phải chờ Cron gọi mạng' },
          }),
        );
        let hen: ReturnType<typeof setTimeout> | undefined;
        const ket = new Promise<'ket'>((ok) => {
          hen = setTimeout(() => ok('ket'), HAN_KET_MS);
        });
        const khac = await Promise.race([khac_p, ket]);
        if (hen !== undefined) clearTimeout(hen);
        expect(khac, 'lệnh ghi khác bị kẹt sau lượt quét đang chờ mạng').not.toBe('ket');
        expect((khac as Response).status).toBe(201);

        // ... và lúc đó lượt quét CHƯA xong, dòng chưa có kết luận.
        expect(quet_xong).toBe(false);
        expect((await bangChungTrongDb('ev-cham'))?.xac_minh).toBe('pending');
        expect(so_lan_goi_nguon).toBe(1);
      } finally {
        thaCua();
      }

      // 3. Thả cửa ⇒ lượt quét vẫn kết luận đúng, chỉ về sau.
      const kq = await quet;
      expect(kq.thu_lai.so_ghi).toBe(1);
      expect((await bangChungTrongDb('ev-cham'))?.xac_minh).toBe('merged');
      expect(so_lan_goi_nguon).toBe(1);
    },
    30_000,
  );

  it('mỗi MỐC GIỜ bật đúng việc của nó — một cron, sổ tra theo `scheduledTime`', () => {
    /*
     * Năm việc, **một** cron (`* * * * *`): gói Workers Free cho 5 cron trigger mỗi
     * **tài khoản** (lỗi 10072 lúc deploy 07/10), nên `viecCuaCron` chọn việc theo
     * `controller.scheduledTime`. Sổ tra vẫn là **một**, không một bản thứ hai ở
     * `cron-canh-bao-phien.ts` hay `cron-bao-cao.ts`: hai sổ tra là hai chỗ để một
     * nhịp chạy hai việc (hoặc không việc nào) mà không ai thấy.
     *
     * Luật riêng của nhịp cảnh báo nằm ở `cron-canh-bao-phien.test.ts`, của hai nhịp
     * báo cáo ở `bao-cao.test.ts`; ở đây canh **ranh giới giữa các mốc**.
     */

    // Phút 1 — nhịp thường: **hai** việc, thử lại bằng chứng (d.220) và thông báo
    // (mục 12 + nhắc 🔴 của mục 8 d.283). Không cảnh báo, không theo dõi.
    expect(viecCuaCron(nhip(3, 1))).toEqual({
      thu_lai: true,
      theo_doi: false,
      canh_bao: false,
      thong_bao: true,
      bao_cao_sang: false,
      bao_cao_toi: false,
      sao_luu: false,
    });

    // Phút 5 — thêm **cảnh báo** (19.12 câu 46 "quét mỗi 5 phút"), **chưa** theo dõi:
    // d.221 nói 10 phút, và 5 không chia hết cho 10.
    expect(viecCuaCron(nhip(3, 5))).toEqual({
      thu_lai: true,
      theo_doi: false,
      canh_bao: true,
      thong_bao: true,
      bao_cao_sang: false,
      bao_cao_toi: false,
      sao_luu: false,
    });

    // Phút 10 — thêm cả **theo dõi** commit `pushed` (d.221). Phút chia hết 10 thì
    // cũng chia hết 5, nên cảnh báo vẫn bật: đó là đúng, hai nhịp độc lập nhau.
    expect(viecCuaCron(nhip(3, 10))).toEqual({
      thu_lai: true,
      theo_doi: true,
      canh_bao: true,
      thong_bao: true,
      bao_cao_sang: false,
      bao_cao_toi: false,
      sao_luu: false,
    });

    // Phút 0 của một giờ — chia hết cả 5 và 10 (60 chia hết cả hai, nên mốc
    // "phút trong giờ" **là** mốc trong ngày).
    expect(viecCuaCron(nhip(3, 0))).toMatchObject({ theo_doi: true, canh_bao: true });

    // 00:30 UTC — thêm **báo cáo sáng** (= 07:30 giờ chủ, d.322), và **không** báo
    // cáo tối. Nó **vẫn** kéo theo các việc của nhịp thường: một cron duy nhất nghĩa
    // là nhịp 00:30 cũng là một nhịp mỗi phút, khác hẳn hình năm-cron cũ.
    expect(viecCuaCron(nhip(0, 30))).toEqual({
      thu_lai: true,
      theo_doi: true,
      canh_bao: true,
      thong_bao: true,
      bao_cao_sang: true,
      bao_cao_toi: false,
      sao_luu: false,
    });

    // 13:00 UTC — **handoff tối** (= 20:00 giờ chủ, d.330), và không báo cáo sáng.
    expect(viecCuaCron(nhip(13, 0))).toMatchObject({
      bao_cao_sang: false,
      bao_cao_toi: true,
    });

    // Ngoài cả hai cửa sổ → không nhánh báo cáo nào.
    expect(viecCuaCron(nhip(2, 0))).toMatchObject({
      bao_cao_sang: false,
      bao_cao_toi: false,
      sao_luu: false,
    });

    // 19:00 UTC — **sao lưu R2** (= 02:00 giờ chủ, mục 15 d.429, BAT-8). Số UTC viết
    // tay: đổi `MUI_GIO_CHU_PHUT` mà quên mốc này thì ca này đỏ.
    expect(viecCuaCron(nhip(19, 0))).toMatchObject({
      bao_cao_sang: false,
      bao_cao_toi: false,
      sao_luu: true,
    });

    /*
     * Hai chuỗi `CRON_THU_LAI` / `CRON_THEO_DOI` ở lại chỉ để **nói** nhịp cho người
     * đọc; chúng không còn là đường chọn việc. Ghim điều đó: chuỗi theo dõi vẫn là
     * nhịp 10 phút, và `[triggers]` chỉ còn chuỗi mỗi phút.
     */
    expect(CRON_THU_LAI).toBe('* * * * *');
    expect(CRON_THEO_DOI).toBe('*/10 * * * *');
  });

  it('nhịp mỗi phút KHÔNG kiểm lại commit `pushed` (d.221 nói 10 phút, không 1 phút)', async () => {
    await dungBangChung('ev-p', TK, 'commit', {
      xac_minh: 'pushed',
      commit_hash: HASH,
      repo: REPO,
      theo_doi_den_luc: bay_gio() + THEO_DOI_COMMIT_MS,
    });

    const kq = await cronThuLai();
    expect(kq.theo_doi.so_dong).toBe(0);
    expect((await bangChungTrongDb('ev-p'))?.xac_minh).toBe('pushed');

    // ĐỐI CHỨNG: nhịp 10 phút thì có.
    const kq10 = await cronTheoDoi();
    expect(kq10.theo_doi.so_dong).toBe(1);
    expect((await bangChungTrongDb('ev-p'))?.xac_minh).toBe('merged');
  });

  it('bảng không có gì để quét → cron chạy xong, không ghi gì, không lỗi', async () => {
    const kq = await chayCron({ scheduledTime: NHIP_THU_LAI }, env);
    expect(kq.thu_lai).toMatchObject({ so_dong: 0, so_ghi: 0, day_tran: false });
  });

  it('`scheduled` là một handler THẬT của Worker (gọi được, không qua wrangler)', async () => {
    const worker = (await import('../src/index.js')).default;
    expect(typeof worker.scheduled).toBe('function');
    expect(typeof worker.fetch).toBe('function');
    await expect(
      worker.scheduled(
        // Hình dạng **thật** của `controller` Cloudflare trao: có cả `cron`. Nó được
        // nhận mà **không** được đọc — chọn việc là việc của `scheduledTime`.
        { cron: CRON_THU_LAI, scheduledTime: NHIP_THU_LAI },
        env,
        createExecutionContext(),
      ),
    ).resolves.toBeUndefined();
  });
});
