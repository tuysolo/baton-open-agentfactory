/**
 * **Nguồn GitHub** — SPEC mục 7 d.206, d.219, d.220, d.223; 19.7.
 *
 * d.206: "Server kiểm qua GitHub API: commit truy cập được từ **nhánh mặc định**
 * thì là **merged**; chỉ có trên nhánh khác thì là **pushed**; không tìm thấy thì
 * trượt."
 *
 * ## Vì sao là một lớp riêng, với một giao diện hẹp
 *
 * Luật d.206 là **ba câu về ba kết luận**, không phải một lần gọi HTTP. Tách
 * `NguonGitHub` ra khỏi luật nên:
 *   1. **Test không gọi mạng thật** — bản giả lập (`nguonGitHubGiaLap`) tiêm vào
 *      bằng tham số. Không `monkey-patch globalThis.fetch`: vá biến toàn cục thì
 *      mọi lần gọi mạng khác trong cùng isolate cũng bị vá, và một ca test quên
 *      dọn sẽ làm ca khác xanh/đỏ vì lý do không ai thấy trong diff.
 *   2. Giao diện **hẹp đúng một câu hỏi**: "hash này ở đâu trong repo này". Không
 *      có hàm `tìmCommit`, `liệtKêNhánh`, `quétRepo` — đúng d.223: "**KHÔNG
 *      làm:** tự quét repo tìm commit". Lớp này chỉ tra **đúng hash được gửi**.
 *
 * ## Không bao giờ in token
 *
 * Token lấy từ `env.GITHUB_TOKEN` (secret, chủ tự đặt — xem `wrangler.toml`).
 * Nó chỉ đi vào header `authorization`; **không** vào thông điệp lỗi, không vào
 * `console`, không vào cột `ly_do` của bảng `evidence`. Danh sách cấm CLAUDE.md
 * mục 5. Thiếu token thì **không nổ**: trả `{ loi }`, và `xac-minh-bang-chung.ts`
 * đưa bằng chứng vào đường `pending` của d.220 ("token GitHub có vấn đề thì trạng
 * thái là `pending`").
 */

import { HAN_GOI_MANG_MS } from '@baton/shared';

/**
 * Ba kết luận của d.206, cộng `khong_thay`.
 *   * `merged`     — truy cập được từ **nhánh mặc định**.
 *   * `pushed`     — có trong repo, nhưng chỉ trên nhánh khác.
 *   * `khong_thay` — không tìm thấy (d.206: "không tìm thấy thì **trượt**").
 */
export type TinhTrangCommit = 'merged' | 'pushed' | 'khong_thay';

/**
 * Kết quả một lần tra. `{ loi }` là **lỗi mạng hoặc lỗi GitHub**, khác hẳn
 * `khong_thay`: d.220 cho nó đi đường `pending` + thử lại, còn `khong_thay` là
 * một kết luận **dứt điểm** (`failed`). 19.7 nói đúng chỗ này: "Server chỉ tự thử
 * lại khi lỗi là **lỗi mạng hoặc lỗi GitHub**."
 */
/*
 * **KHÔNG có cờ phân biệt "thiếu token" ở đây — cố ý, sau một lần siết (13/10).**
 *
 * Bản đầu của lượt BAT-5 thêm `thieu_token?: true` để ca "server chưa có
 * `GITHUB_TOKEN`" được rơi về lời khai `merged_cuc_bo` (nguồn `local`), với lý lẽ
 * "thử lại ba lần nữa cũng cùng kết quả". Reviewer bắt đúng chỗ đó: máy chủ thật
 * **chưa** đặt `GITHUB_TOKEN`, nên nhánh ấy biến **mọi** commit có lời khai thành
 * `merged` mà không hỏi GitHub một lần nào — kể cả commit đã push mà chưa vào
 * nhánh mặc định. Một cấu hình thiếu không được mở cổng Xong, nên ca đó trở lại
 * đúng d.220: `{ loi }` ⇒ `pending`, như mọi lỗi khác. Đừng thêm lại cờ này.
 */
export type KetQuaTinhTrangCommit =
  | {
      tinh_trang: TinhTrangCommit;
      /**
       * **Đã hỏi GitHub VỀ CHÍNH COMMIT NÀY và nó trả lời** — tức kết luận tới từ
       * chặng `compare`, không từ một chặng dừng sớm hơn.
       *
       * Vì sao phải tách (siết lần hai, 13/10): `khong_thay` có **ba** đường vào,
       * và chỉ **một** trong ba nghĩa là "GitHub nói nó không có commit này":
       *   * `repo` **sai hình dạng** — trả về **không gọi mạng lần nào**;
       *   * `GET /repos/<repo>` trả **404** — GitHub có trả lời, nhưng trả lời về
       *     **repo** (không tồn tại, hoặc token không thấy repo riêng tư), chưa
       *     nói gì về commit;
       *   * `compare` trả **404/422** — đây mới là câu trả lời về commit.
       * Lời khai `merged_cuc_bo` của người gửi chỉ được dùng ở đường thứ ba
       * (`xac-minh-bang-chung.ts`): hai đường đầu mà vẫn nhận lời khai thì gõ sai
       * một chữ trong tên repo là mở được cổng Xong. Xem `cau-hoi-spec.md` #122.
       */
      da_hoi_commit?: true;
    }
  | { loi: string };

export interface NguonGitHub {
  tinhTrangCommit(repo: string, hash: string): Promise<KetQuaTinhTrangCommit>;
}

/** Repo phải là `chu/ten`: không nhận đường dẫn, không nhận URL. */
export const MAU_REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

const GOC_API = 'https://api.github.com';

/**
 * Bản **thật**, gọi GitHub API.
 *
 * Hai lần gọi, cả hai đều là tra **đúng** một đối tượng (không liệt kê, không
 * phân trang, không quét — d.223):
 *   1. `GET /repos/{repo}` → `default_branch`. Phải hỏi, không đoán `main`: repo
 *      cũ dùng `master`, và đoán sai thì mọi commit đã merge đều ra `pushed`.
 *   2. `GET /repos/{repo}/compare/{default_branch}...{hash}` → `status`.
 *      `identical` hoặc `behind` nghĩa là hash **là tổ tiên của** (hoặc chính)
 *      đầu nhánh mặc định, tức "truy cập được từ nhánh mặc định" → `merged`.
 *      `ahead` hoặc `diverged` nghĩa là có trong repo nhưng chưa vào nhánh mặc
 *      định → `pushed`. 404 ở bước này = không tìm thấy hash → `khong_thay`.
 *
 * Mỗi lần gọi có **hạn cứng** `HAN_GOI_MANG_MS`, và hai lần cộng lại vẫn phải
 * dưới trần 10 giây của d.219 — nên hạn chia cho số lần gọi, không nhân lên.
 */
export function nguonGitHubThat(
  token: string | undefined,
  tuy_chon: { han_ms?: number; goc?: string } = {},
): NguonGitHub {
  const goc = tuy_chon.goc ?? GOC_API;
  // Hai lần gọi nối tiếp nhau trong cùng một hạn tổng.
  const han_moi_lan = Math.max(500, Math.floor((tuy_chon.han_ms ?? HAN_GOI_MANG_MS) / 2));

  async function hoi(duong: string): Promise<{ res: Response } | { loi: string }> {
    if (token === undefined || token.trim().length === 0) {
      // d.220: "token GitHub có vấn đề" → `pending`, không phải `failed`.
      return { loi: 'Chưa cấu hình token GitHub trên server (secret GITHUB_TOKEN).' };
    }
    try {
      const res = await fetch(`${goc}${duong}`, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'user-agent': 'baton',
        },
        signal: AbortSignal.timeout(han_moi_lan),
      });
      return { res };
    } catch {
      /*
       * Thông điệp **không** mang lỗi gốc: lỗi gốc của `fetch` có thể chứa URL
       * đầy đủ, và URL đầy đủ của một lần gọi có thể mang tham số. Cột `ly_do`
       * của `evidence` thì chủ đọc được trên UI. SPEC mục 15.
       */
      return { loi: 'Không gọi được GitHub API (lỗi mạng hoặc quá hạn chờ).' };
    }
  }

  return {
    async tinhTrangCommit(repo, hash) {
      if (!MAU_REPO.test(repo)) {
        // Không phải lỗi mạng → **không** đi đường thử lại: thử lại một repo sai
        // hình dạng thì ba lần nữa cũng sai. Nhưng lớp này không quyết
        // `failed`/`pending`; nó chỉ nói "không tìm thấy".
        //
        // **Không** `da_hoi_commit`: chưa gọi mạng lần nào, nên GitHub chưa nói gì
        // về commit này — xem `KetQuaTinhTrangCommit`.
        return { tinh_trang: 'khong_thay' };
      }

      const r1 = await hoi(`/repos/${repo}`);
      if ('loi' in r1) return r1;
      // Repo không tra được (không tồn tại, hoặc token không thấy repo riêng tư).
      // Cũng **không** `da_hoi_commit`: câu trả lời này về **repo**, không về commit.
      if (r1.res.status === 404) return { tinh_trang: 'khong_thay' };
      if (!r1.res.ok) return { loi: `GitHub API trả mã ${String(r1.res.status)}.` };

      let nhanh_mac_dinh: string;
      try {
        const than = await r1.res.json<{ default_branch?: unknown }>();
        if (typeof than.default_branch !== 'string' || than.default_branch.length === 0) {
          return { loi: 'GitHub API không trả nhánh mặc định của repo.' };
        }
        nhanh_mac_dinh = than.default_branch;
      } catch {
        return { loi: 'Không đọc được phản hồi của GitHub API.' };
      }

      const r2 = await hoi(
        `/repos/${repo}/compare/${encodeURIComponent(nhanh_mac_dinh)}...${encodeURIComponent(hash)}`,
      );
      if ('loi' in r2) return r2;
      /*
       * Không tìm thấy hash **trong repo đã tra được** — d.206 "không tìm thấy thì
       * trượt". Đây là đường duy nhất mang `da_hoi_commit`: GitHub đã được hỏi về
       * chính commit này và nó trả lời "không có".
       */
      if (r2.res.status === 404 || r2.res.status === 422) {
        return { tinh_trang: 'khong_thay', da_hoi_commit: true };
      }
      if (!r2.res.ok) return { loi: `GitHub API trả mã ${String(r2.res.status)}.` };

      try {
        const than = await r2.res.json<{ status?: unknown }>();
        /*
         * `identical`: hash **là** đầu nhánh mặc định. `behind`: hash nằm phía
         * sau đầu nhánh, tức là tổ tiên của nó — "truy cập được từ nhánh mặc
         * định". Cả hai → `merged`.
         */
        if (than.status === 'identical' || than.status === 'behind') {
          return { tinh_trang: 'merged' };
        }
        if (than.status === 'ahead' || than.status === 'diverged') {
          return { tinh_trang: 'pushed' };
        }
        return { loi: 'GitHub API trả trạng thái so sánh không đọc được.' };
      } catch {
        return { loi: 'Không đọc được phản hồi của GitHub API.' };
      }
    },
  };
}

/* ------------------------------------------------------------------ *
 * Bản giả lập — CHỈ dùng trong test
 * ------------------------------------------------------------------ */

/** Khoá của một commit trong bảng giả lập: `repo@hash`. */
export function khoaCommit(repo: string, hash: string): string {
  return `${repo}@${hash.toLowerCase()}`;
}

/**
 * Một dòng của bảng giả lập: ba kết luận của d.206, hoặc một lỗi mạng/GitHub.
 */
/**
 * Một dòng của bảng giả lập.
 *
 * `'khong_thay_repo'` là ca **"GitHub chưa trả lời về commit"**: repo sai hình
 * dạng, hoặc `GET /repos/<repo>` trả 404. Nó cho cùng `tinh_trang` với
 * `'khong_thay'` nhưng **không** mang `da_hoi_commit`, nên lời khai `merged_cuc_bo`
 * **không** được dùng — xem `KetQuaTinhTrangCommit`. Tách thành một mã riêng của
 * bảng giả lập để test dựng được đúng ca đó mà không cần mạng.
 */
export type DongGiaLapCommit = TinhTrangCommit | 'khong_thay_repo' | { loi: string };

export interface CaiDatGiaLapGitHub {
  /** Khoá `repo@hash` → kết luận. Hash **không** có trong bảng = `khong_thay`. */
  commit?: Record<string, DongGiaLapCommit>;
  /** Giả một nguồn **chậm**: chờ bấy nhiêu ms trước khi trả lời. */
  cham_ms?: number;
}

function cho(ms: number): Promise<void> {
  return new Promise((ok) => setTimeout(ok, ms));
}

/**
 * Nguồn GitHub **giả lập**: trả kết luận theo bảng tiêm vào, **không gọi mạng**.
 *
 * Mặc định `khong_thay` (không phải lỗi): một ca test gõ sai khoá sẽ thấy "trượt
 * vì không tìm thấy", là kết luận dễ nhận ra hơn là một lỗi mạng giả.
 */
export function nguonGitHubGiaLap(cai_dat: CaiDatGiaLapGitHub = {}): NguonGitHub {
  const bang = cai_dat.commit ?? {};
  const cham_ms = cai_dat.cham_ms ?? 0;
  return {
    async tinhTrangCommit(repo, hash) {
      if (cham_ms > 0) await cho(cham_ms);
      const dong = bang[khoaCommit(repo, hash)];
      /*
       * Mặc định: **đã tra tới commit** và không thấy — hình của bản thật khi repo
       * tra được. Một ca test muốn ca "chưa hỏi tới commit" thì khai tường minh
       * `'khong_thay_repo'`.
       */
      if (dong === undefined) return { tinh_trang: 'khong_thay', da_hoi_commit: true };
      if (dong === 'khong_thay_repo') return { tinh_trang: 'khong_thay' };
      if (dong === 'khong_thay') return { tinh_trang: 'khong_thay', da_hoi_commit: true };
      return typeof dong === 'string' ? { tinh_trang: dong } : { ...dong };
    },
  };
}
