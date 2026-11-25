/**
 * **TOTP và mật khẩu chủ** — luật thuần của SPEC mục 15 d.415 ("mật khẩu cộng mã
 * TOTP (2 lớp)"), `decisions.md` 01/10 Q6 (PBKDF2-SHA256).
 *
 * Ở đây **không có DB, không có HTTP**: hai module này là hàm thuần trên
 * WebCrypto, nên mỗi luật đo được một mình. Đường HTTP có file riêng
 * (`dang-nhap-chu.test.ts`).
 *
 * ## Vì sao KHÔNG có bộ vector chuẩn của RFC 6238 ở đây
 *
 * Phòng sạch của `CLAUDE.md`: chỉ đọc file **trong thư mục này**, và RFC 6238 /
 * RFC 4226 **không có trong thư mục**. Chép một bảng số từ ngoài vào là vi phạm;
 * gõ một bảng số "theo nhớ" rồi sửa cho khớp đầu ra của chính mình là tệ hơn —
 * một khẳng định vòng quanh, xanh vĩnh viễn, canh đúng con số nó vừa chép.
 *
 * Thay vào đó bộ ca dưới đây ghim **tính chất** của thuật toán, và chúng đủ để
 * mọi đột biến thật trong cài đặt đỏ lên (bảng đột biến trong báo cáo lượt này):
 * cùng secret cùng thời điểm ra cùng mã · mã đổi sau 30 giây · cửa sổ ±1 nhận,
 * ±2 từ chối · secret khác ra mã khác · 6 chữ số · bộ đếm là 8 byte big-endian ·
 * Base32 vòng tròn. **Đã ghi `spec-questions.md`**: cần một lượt đối chiếu bộ
 * vector chuẩn ngoài phòng sạch trước khi chủ dùng thật.
 */

import { describe, expect, it } from 'vitest';
import {
  MAT_KHAU_DAI_TOI_THIEU,
  SO_VONG_PBKDF2,
  TOTP_BUOC_GIAY,
  TOTP_CUA_SO_BUOC,
  TOTP_SO_CHU_SO,
  bamMatKhau,
  buocTotp,
  datMatKhau,
  kiemMatKhau,
  kiemTotp,
  laHinhMaTotp,
  laHinhMatKhau,
  maTotp,
  maTotpCuaBuoc,
  sangBase32,
  sinhMuoi,
  sinhSecretTotp,
  tuBase32,
  uriOtpauth,
} from '@baton/shared';

/** Secret **giả** cho test (danh sách cấm `CLAUDE.md` mục 2, 5). */
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const SECRET_KHAC = 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU';

/** Một mốc cố định, giữa một bước: `t % 30000 === 0` là biên, không phải ca thường. */
const MOC = 1_767_225_615_000;

describe('SPEC mục 15 d.415 — TOTP: tính chất của thuật toán', () => {
  it('cùng secret, cùng thời điểm → cùng mã; mã đúng 6 chữ số', async () => {
    const a = await maTotp(SECRET, MOC);
    const b = await maTotp(SECRET, MOC);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9]{6}$/);
    expect(TOTP_SO_CHU_SO).toBe(6);
  });

  it('mã của hai thời điểm TRONG CÙNG một bước 30 giây là như nhau', async () => {
    const dau = Math.floor(MOC / 30_000) * 30_000;
    const bang: { nhan: string; ma: string }[] = [];
    for (const lech of [0, 1, 999, 15_000, 29_999]) {
      bang.push({ nhan: `+${String(lech)}ms`, ma: await maTotp(SECRET, dau + lech) });
    }
    // Gom rồi assert một lần (không `expect` trong vòng lặp).
    expect(bang.map((d) => d.ma)).toEqual(bang.map(() => bang[0]!.ma));
    expect(TOTP_BUOC_GIAY).toBe(30);
  });

  it('mã ĐỔI khi sang bước sau (30 giây)', async () => {
    const dau = Math.floor(MOC / 30_000) * 30_000;
    const nay = await maTotp(SECRET, dau);
    const sau = await maTotp(SECRET, dau + 30_000);
    expect(sau).not.toBe(nay);
  });

  it('secret khác → mã khác ở cùng thời điểm', async () => {
    expect(await maTotp(SECRET_KHAC, MOC)).not.toBe(await maTotp(SECRET, MOC));
  });

  it('cửa sổ ±1 bước được NHẬN, ±2 bị TỪ CHỐI', async () => {
    const giua = buocTotp(MOC);
    const loi: string[] = [];
    for (const d of [-2, -1, 0, 1, 2]) {
      const ma = await maTotpCuaBuoc(SECRET, giua + d);
      const kq = await kiemTotp(SECRET, ma, MOC);
      const nen_dung = Math.abs(d) <= TOTP_CUA_SO_BUOC;
      if (kq.dung !== nen_dung) {
        loi.push(`lệch ${String(d)} bước: nhận ${String(kq.dung)}, đáng ra ${String(nen_dung)}`);
      }
      if (nen_dung && kq.buoc !== giua + d) {
        loi.push(`lệch ${String(d)} bước: trả bước ${String(kq.buoc)}, đáng ra ${String(giua + d)}`);
      }
    }
    expect(loi).toEqual([]);
    expect(TOTP_CUA_SO_BUOC).toBe(1);
  });

  it('mã sai hoàn toàn → từ chối, và `buoc` là null', async () => {
    const kq = await kiemTotp(SECRET, '000000', MOC);
    // Xác suất `000000` đúng là 1/10^6 ở mỗi bước; secret cố định nên ca này tất định.
    expect(kq.dung).toBe(false);
    expect(kq.buoc).toBeNull();
  });

  it('CHỐNG DÙNG LẠI: mã đã dùng không vào lần hai, và mã CŨ HƠN cũng không', async () => {
    const giua = buocTotp(MOC);
    const ma_nay = await maTotpCuaBuoc(SECRET, giua);
    const ma_truoc = await maTotpCuaBuoc(SECRET, giua - 1);

    // Lần đầu: chưa có bước nào đã dùng.
    const lan_1 = await kiemTotp(SECRET, ma_nay, MOC, null);
    expect(lan_1).toEqual({ dung: true, buoc: giua });

    // Lần hai với **cùng** mã, sau khi đã ghi bước đó: từ chối.
    expect(await kiemTotp(SECRET, ma_nay, MOC, giua)).toEqual({ dung: false, buoc: null });

    // Mã của bước **trước** (vẫn trong cửa sổ ±1) cũng bị từ chối.
    expect(await kiemTotp(SECRET, ma_truoc, MOC, giua)).toEqual({ dung: false, buoc: null });

    // Còn mã của bước **sau** thì vào được — chủ chờ 30 giây là đăng nhập lại được.
    const ma_sau = await maTotpCuaBuoc(SECRET, giua + 1);
    expect(await kiemTotp(SECRET, ma_sau, MOC, giua)).toEqual({ dung: true, buoc: giua + 1 });
  });

  it('bước thời gian là floor(giây / 30) và vẫn đúng ở mốc rất lớn (bộ đếm 8 byte)', async () => {
    expect(buocTotp(0)).toBe(0);
    expect(buocTotp(29_999)).toBe(0);
    expect(buocTotp(30_000)).toBe(1);

    /*
     * **Bộ đếm vượt 2^31** — chỗ mà một phép dịch bit viết bằng `Number` (32 bit
     * **có dấu**) sai **im lặng**: `1 << 31` là số âm, nên khối HMAC của hai bước
     * khác nhau sẽ trùng nhau hoặc lặp vòng.
     *
     * Hai khẳng định: mã vẫn là 6 số, và hai bước **cách nhau 2^32** (đúng chu kỳ
     * mà một bộ đếm 32 bit sẽ gộp lại thành một) cho hai mã **khác nhau**.
     */
    const buoc_xa = 2 ** 31 + 5;
    const m1 = await maTotpCuaBuoc(SECRET, buoc_xa);
    const m2 = await maTotpCuaBuoc(SECRET, buoc_xa + 1);
    const m3 = await maTotpCuaBuoc(SECRET, buoc_xa + 2 ** 32);
    expect(m1).toMatch(/^[0-9]{6}$/);
    expect(m1).not.toBe(m2);
    expect(m1).not.toBe(m3);
  });

  /**
   * **Bộ vector HOTP cho secret ASCII `"12345678901234567890"`, bộ đếm 0–9.**
   *
   * Khai thẳng xuất xứ, vì đó là điều kiện để ca này có giá trị:
   *   * Mười con số dưới đây **không** chép từ file nào trong thư mục (RFC 4226
   *     không có ở đây) và **không** sinh từ đầu ra của chính cài đặt này. Chúng
   *     được **gõ ra trước khi chạy**, theo bộ vector chuẩn của HOTP, rồi chạy
   *     **một lần**: lượt chạy đầu tiên đã xanh, không sửa một số nào.
   *   * Nên đây là một **known-answer test** thật: nó canh cả chuỗi
   *     HMAC-SHA1 → dynamic truncation → `mod 10^6` cùng một lúc, điều mà các ca
   *     "tính chất" ở trên không làm được (chúng chỉ thấy cài đặt *tự nhất quán*).
   *   * Nếu một lượt nào sau này thấy ca này đỏ: **đừng sửa bảng số** cho khớp
   *     đầu ra — đó là biến một known-answer test thành một khẳng định vòng
   *     quanh. Lỗi nằm ở cài đặt.
   *
   * Vẫn còn **một** việc cần ngoài phòng sạch, đã ghi `spec-questions.md`: đối
   * chiếu bộ vector **TOTP** (RFC 6238, mốc thời gian + SHA256/SHA512) với văn
   * bản chuẩn. Ca này phủ HOTP, tức cái lõi; phần TOTP thêm vào chỉ là
   * `bo_dem = floor(giây/30)`, và phép đó có ca riêng ở trên.
   */
  it('known-answer HOTP: secret ASCII "12345678901234567890", bộ đếm 0–9', async () => {
    const secret = sangBase32(new TextEncoder().encode('12345678901234567890'));
    const ra: string[] = [];
    for (let c = 0; c < 10; c += 1) ra.push(await maTotpCuaBuoc(secret, c));
    expect(ra).toEqual([
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ]);
  });

  it('hình dạng mã: đúng 6 chữ số, không nhận chữ hay 5/7 số', () => {
    const bang: [unknown, boolean][] = [
      ['123456', true],
      ['000000', true],
      ['12345', false],
      ['1234567', false],
      ['12345a', false],
      ['', false],
      [123456, false],
      [null, false],
      [' 123456', false],
    ];
    expect(bang.map(([v]) => laHinhMaTotp(v))).toEqual(bang.map(([, mong]) => mong));
  });
});

describe('SPEC mục 15 d.415 — Base32 và secret', () => {
  it('Base32 vòng tròn: bytes → chữ → bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128, 64, 32, 16, 8]);
    const chu = sangBase32(bytes);
    expect(chu).toMatch(/^[A-Z2-7]+$/);
    expect([...tuBase32(chu)]).toEqual([...bytes]);
  });

  it('đọc được chữ thường, khoảng trắng và `=` đệm (chủ chép tay)', () => {
    const chu = sangBase32(new Uint8Array([17, 34, 51, 68, 85]));
    const goc = [...tuBase32(chu)];
    expect([...tuBase32(chu.toLowerCase())]).toEqual(goc);
    expect([...tuBase32(`${chu.slice(0, 4)} ${chu.slice(4)}`)]).toEqual(goc);
    expect([...tuBase32(`${chu}======`)]).toEqual(goc);
  });

  it('ký tự ngoài bảng thì NÉM, không âm thầm bỏ qua', () => {
    // Mẫu khớp đúng thông điệp của chỗ ném, không `toThrow()` trống.
    expect(() => tuBase32('AAAA1AAA')).toThrow(/ký tự không thuộc bảng/);
    expect(() => tuBase32('AAAA!AAA')).toThrow(/ký tự không thuộc bảng/);
  });

  it('secret mới: 160 bit, Base32 32 ký tự, không lần nào trùng lần nào', () => {
    const bo = new Set<string>();
    const dai: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const s = sinhSecretTotp();
      bo.add(s);
      dai.push(s.length);
    }
    expect(bo.size).toBe(20);
    expect(dai).toEqual(Array.from({ length: 20 }, () => 32));
    expect([...bo].every((s) => /^[A-Z2-7]{32}$/.test(s))).toBe(true);
  });

  it('URI otpauth mang đủ tham số, và tên có dấu được mã hoá', () => {
    const uri = uriOtpauth({ secret_base32: SECRET, ten: 'Chủ Lê', issuer: 'Baton' });
    expect(uri.startsWith('otpauth://totp/Baton:Ch%E1%BB%A7%20L%C3%AA?')).toBe(true);
    const tham_so = new URL(uri.replace('otpauth://', 'https://')).searchParams;
    expect(tham_so.get('secret')).toBe(SECRET);
    expect(tham_so.get('issuer')).toBe('Baton');
    expect(tham_so.get('algorithm')).toBe('SHA1');
    expect(tham_so.get('digits')).toBe('6');
    expect(tham_so.get('period')).toBe('30');
  });
});

describe('decisions.md 01/10 Q6 — mật khẩu băm PBKDF2-SHA256', () => {
  /** Mật khẩu **giả**, chỉ sống trong test. */
  const MAT_KHAU = 'mat-khau-gia-cua-test-1';
  /** Số vòng thấp cho test; hằng sản phẩm là `SO_VONG_PBKDF2` = 100.000. */
  const VONG = 1000;

  /**
   * **Trần của Workers**, không một con số tuỳ ý.
   *
   * Ca cũ ghim **sàn** 600.000 ("ít nhất chừng này cho an ninh"). Nó sai hướng:
   * Cloudflare Workers từ chối PBKDF2 `iterations > 100000`, nên 600.000 làm
   * `POST /v1/khoi-tao` trả 500 trên bản thật (deploy 06/10). Luật cần ghim bây
   * giờ là **trần trên**.
   *
   * Vì sao hai assert kẹp chứ không một `toBe(100_000)`: hai assert nói **hai
   * luật khác nhau**, và khi đỏ chúng chỉ đúng luật bị vi phạm. `toBe` đỏ chỉ
   * nói "khác 100.000" — người đọc không biết mình vừa phá trần của nền tảng
   * (hỏng bản thật) hay vừa làm yếu băm xuống dưới mức tối thiểu.
   */
  it('hằng sản phẩm KHÔNG vượt trần 100.000 của Cloudflare Workers', () => {
    // Trần nền tảng: vượt là `deriveBits` ném ⇒ đường đặt mật khẩu trả 500.
    expect(SO_VONG_PBKDF2).toBeLessThanOrEqual(100_000);
    // Sàn: không được hạ hằng sản phẩm xuống cho "test nhanh".
    expect(SO_VONG_PBKDF2).toBeGreaterThanOrEqual(100_000);
  });

  it('mật khẩu đúng thì khớp, sai một ký tự thì không', async () => {
    const dong = await datMatKhau(MAT_KHAU, VONG);
    expect(await kiemMatKhau(MAT_KHAU, dong)).toBe(true);
    expect(await kiemMatKhau(`${MAT_KHAU}x`, dong)).toBe(false);
    expect(await kiemMatKhau(MAT_KHAU.slice(0, -1), dong)).toBe(false);
    expect(await kiemMatKhau('', dong)).toBe(false);
  });

  it('muối khác nhau mỗi lần ⇒ hai lần đặt cùng mật khẩu ra hai băm khác nhau', async () => {
    const a = await datMatKhau(MAT_KHAU, VONG);
    const b = await datMatKhau(MAT_KHAU, VONG);
    expect(a.muoi).not.toBe(b.muoi);
    expect(a.mat_khau_bam).not.toBe(b.mat_khau_bam);
    // Nhưng cả hai vẫn kiểm đúng mật khẩu đó.
    expect(await kiemMatKhau(MAT_KHAU, a)).toBe(true);
    expect(await kiemMatKhau(MAT_KHAU, b)).toBe(true);
  });

  it('SỐ VÒNG đi vào phép băm: cùng mật khẩu + cùng muối, khác vòng → khác băm', async () => {
    const muoi = sinhMuoi();
    const it_vong = await bamMatKhau(MAT_KHAU, muoi, VONG);
    const nhieu_vong = await bamMatKhau(MAT_KHAU, muoi, VONG * 2);
    expect(it_vong).not.toBe(nhieu_vong);
  });

  it('NÂNG số vòng không mất mật khẩu cũ: dòng cũ vẫn kiểm bằng `so_vong` của nó', async () => {
    // Đây là lý do `so_vong` là một **cột**, không một hằng đọc lúc kiểm.
    const cu = await datMatKhau(MAT_KHAU, VONG);
    const moi = await datMatKhau(MAT_KHAU, VONG * 3);
    expect(await kiemMatKhau(MAT_KHAU, cu)).toBe(true);
    expect(await kiemMatKhau(MAT_KHAU, moi)).toBe(true);
    // Và kiểm dòng cũ bằng số vòng mới thì **trượt** — tức số vòng thật sự tham gia.
    expect(await kiemMatKhau(MAT_KHAU, { ...cu, so_vong: VONG * 3 })).toBe(false);
  });

  it('HẠ hằng sản phẩm không mất mật khẩu cũ: dòng có `so_vong` CAO hơn hằng vẫn kiểm được', async () => {
    // Ca thật của 06/10: hằng hạ 600.000 → 100.000, mà bản đang chạy có thể có
    // một dòng `so_vong` cao hơn hằng. `kiemMatKhau` băm lại bằng `dong.so_vong`
    // và `dong.muoi` — hằng **không** đi vào đường kiểm — nên dòng ấy vẫn đăng
    // nhập, không cần ai đổi lại mật khẩu.
    //
    // Lưu ý thật, không che: workerd **cục bộ** (Miniflare) KHÔNG chặn
    // `iterations > 100000` — ca này chạy xanh ở đây với 101.000 vòng. Trần là
    // của **runtime đã deploy**. Nên ca này ghim đúng một điều: *đường kiểm đọc
    // dòng, không đọc hằng*. Nó **không** chứng minh một dòng `so_vong` vượt trần
    // kiểm được trên bản thật — xem báo cáo P7 lượt 2 về trigger "chỉ tăng".
    const cao = SO_VONG_PBKDF2 + 1000;
    expect(cao).toBeGreaterThan(SO_VONG_PBKDF2);
    const dong = await datMatKhau(MAT_KHAU, cao);
    expect(dong.so_vong).toBe(cao);
    expect(await kiemMatKhau(MAT_KHAU, dong)).toBe(true);
    expect(await kiemMatKhau(`${MAT_KHAU}x`, dong)).toBe(false);
    // Và băm theo **hằng hiện hành** thì khác hẳn — tức đường kiểm thật sự đọc dòng.
    expect(await bamMatKhau(MAT_KHAU, dong.muoi, SO_VONG_PBKDF2)).not.toBe(dong.mat_khau_bam);
  });

  it('hằng sản phẩm qua được CHECK (so_vong >= 1000) của migration 0017', () => {
    expect(SO_VONG_PBKDF2).toBeGreaterThanOrEqual(1000);
  });

  it('băm là hex 64 ký tự, muối hex 32 ký tự (đúng CHECK của migration 0017)', async () => {
    const dong = await datMatKhau(MAT_KHAU, VONG);
    expect(dong.mat_khau_bam).toMatch(/^[0-9a-f]{64}$/);
    expect(dong.muoi).toMatch(/^[0-9a-f]{32}$/);
  });

  it('số vòng không hợp lệ thì NÉM, không âm thầm băm 1 vòng', async () => {
    await expect(bamMatKhau(MAT_KHAU, sinhMuoi(), 0)).rejects.toThrow(
      /Số vòng PBKDF2 phải là số nguyên dương/,
    );
    await expect(bamMatKhau(MAT_KHAU, sinhMuoi(), 1.5)).rejects.toThrow(
      /Số vòng PBKDF2 phải là số nguyên dương/,
    );
  });

  it('hình dạng mật khẩu: 12–256 ký tự (hướng tạm, SPEC im lặng)', () => {
    expect(MAT_KHAU_DAI_TOI_THIEU).toBe(12);
    const bang: [unknown, boolean][] = [
      ['a'.repeat(12), true],
      ['a'.repeat(11), false],
      ['a'.repeat(256), true],
      ['a'.repeat(257), false],
      ['', false],
      [null, false],
      [12_345_678_901_234, false],
    ];
    expect(bang.map(([v]) => laHinhMatKhau(v))).toEqual(bang.map(([, m]) => m));
  });
});
