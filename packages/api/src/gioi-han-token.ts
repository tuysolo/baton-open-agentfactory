/**
 * `GioiHanToken` — bộ đếm **600 request mỗi phút cho mỗi token** (SPEC mục 13).
 *
 * Vì sao là Durable Object chứ không phải biến trong Worker: một Worker chạy
 * trên nhiều isolate ở nhiều nơi, mỗi isolate giữ bộ nhớ riêng và bị thu hồi bất
 * cứ lúc nào. Đếm trong bộ nhớ Worker thì giới hạn thật thành 600 × số isolate —
 * tức là không có giới hạn. DO thì **một đối tượng cho mỗi token**, mọi request
 * của token đó đi về đúng chỗ ấy.
 *
 * Mỗi token một DO (id dẫn xuất từ **băm** token, không bao giờ từ token thô —
 * SPEC mục 15), nên bộ đếm không nghẽn: tải rải theo số token, không dồn vào một
 * đối tượng như cửa ghi.
 *
 * **Cửa sổ cố định một phút.** Đơn giản và đủ: SPEC chỉ đòi "600 request mỗi
 * phút". Nhược điểm đã biết của cửa sổ cố định là cho phép tới 1200 request
 * trong một khoảng 60 giây nằm vắt qua hai cửa sổ; chấp nhận, vì đây là hàng rào
 * chống agent lặp vô hạn, không phải hàng rào chống tấn công.
 *
 * "Lệnh chờ dài tính 1 request" (SPEC mục 13) là **mặc định tự nhiên** ở đây: bộ
 * đếm tăng một lần lúc request vào, lệnh treo 60 giây không tăng thêm.
 */

const CUA_SO_MS = 60_000;

/** SPEC mục 13: 600 request mỗi phút cho mỗi token. */
export const GIOI_HAN_MOI_PHUT = 600;

export interface KetQuaDem {
  /** Request này được đi qua không. */
  cho_phep: boolean;
  /** Số request đã dùng trong cửa sổ hiện tại (tính cả request này). */
  da_dung: number;
  /** Số giây tới khi cửa sổ mở lại — cho header `Retry-After` (SPEC mục 13). */
  retry_after: number;
}

export class GioiHanToken implements DurableObject {
  /**
   * Chỉ nằm trong bộ nhớ, **không** ghi xuống storage: bộ đếm sống đúng một
   * phút, còn ghi storage thì mỗi request thành một lần ghi đĩa. DO bị thu hồi
   * giữa phút thì bộ đếm về 0 — mất mát chấp nhận được cho một hàng rào nhịp độ.
   */
  #cua_so_bat_dau = 0;
  #so = 0;

  // Không khai constructor: DO này **không cần** `state` hay `env` — bộ đếm nằm
  // trong bộ nhớ (xem ghi chú trên), nên constructor mặc định là đủ.

  fetch(request: Request): Response {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/dem') {
      return Response.json(this.dem());
    }
    return new Response('not found', { status: 404 });
  }

  /** Đếm một request. Gọi được trực tiếp trong test qua `runInDurableObject`. */
  dem(bay_gio: number = Date.now()): KetQuaDem {
    if (bay_gio - this.#cua_so_bat_dau >= CUA_SO_MS) {
      this.#cua_so_bat_dau = bay_gio;
      this.#so = 0;
    }
    this.#so += 1;

    const con_lai_ms = this.#cua_so_bat_dau + CUA_SO_MS - bay_gio;
    return {
      cho_phep: this.#so <= GIOI_HAN_MOI_PHUT,
      da_dung: this.#so,
      // Luôn ≥ 1: `Retry-After: 0` nghĩa là "thử lại ngay", client sẽ quay vòng.
      retry_after: Math.max(1, Math.ceil(con_lai_ms / 1000)),
    };
  }

  /**
   * Số request đã dùng trong cửa sổ hiện tại, **không** đếm thêm.
   *
   * Chỉ để quan sát và để test — và nó là thứ duy nhất đo được luật d.387 ("Lệnh
   * chờ dài tính **1 request**"): đo bằng `dem()` thì chính lần đo đã cộng một
   * đơn vị, nên không phân biệt được "chờ dài tính 1" với "chờ dài tính 2".
   */
  daDung(bay_gio: number = Date.now()): number {
    if (bay_gio - this.#cua_so_bat_dau >= CUA_SO_MS) return 0;
    return this.#so;
  }
}

/**
 * Đếm một request của một token.
 * `khoa_dem` **phải là giá trị đã băm** hoặc một hằng không bí mật (vd `'chu'`),
 * không bao giờ là token thô — id của DO đi vào log hạ tầng (SPEC mục 15).
 */
export async function demMotRequest(
  ns: DurableObjectNamespace,
  khoa_dem: string,
): Promise<KetQuaDem> {
  const stub = ns.get(ns.idFromName(`token:${khoa_dem}`));
  const res = await stub.fetch('https://gioi-han/dem', { method: 'POST' });
  return res.json<KetQuaDem>();
}
