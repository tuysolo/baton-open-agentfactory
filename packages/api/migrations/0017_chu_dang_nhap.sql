-- ===================================================================
-- 0017 — **Đường đăng nhập của chủ**: tài khoản (mật khẩu + TOTP) và phiên
--        đăng nhập 30 ngày
-- SPEC mục 15 d.415 (mật khẩu + TOTP, phiên 30 ngày, đăng xuất mọi nơi),
--        d.416 (agent chỉ dùng token, **không đăng nhập web**),
--        d.417 (bí mật phía server **không bao giờ** ra API hay UI),
--        d.418 (mọi hành động có dấu vết ai làm)
-- `quyet-dinh.md` 01/10: Q6 A = tự làm mật khẩu + TOTP, băm **PBKDF2-SHA256**;
--        và hàng `xac-thuc.ts` ("phần 6 thay nhánh `'chu'` mà không sửa chỗ
--        khác") — migration này là nửa dữ liệu của món nợ đó.
-- ===================================================================
--
-- Hai bảng, và **chỉ** hai: tài khoản chủ (một hàng cho mỗi workspace) và phiên
-- đăng nhập. Không bảng nào ở đây dính tới `phien` của mục 6 — đó là phiên **làm
-- việc của agent**, và d.416 nói hai thế giới đó không gặp nhau.
--
-- ## Vì sao bộ đếm thử sai nằm TRONG bảng tài khoản, không một bảng riêng
--
-- Số lần nhập sai là một thuộc tính của **đúng cái tài khoản ấy**, và đã có đúng
-- một hàng cho mỗi workspace, nên một bảng riêng sẽ là một bảng khoá-một-một —
-- tức cùng dữ liệu, cộng một phép `JOIN` trên đường đăng nhập, cộng một chỗ nữa
-- để lệch. SPEC **im lặng** về số lần thử (xem `cau-hoi-spec.md`), nên luật ở đây
-- là hướng tạm; để nó nằm cạnh tài khoản làm việc đổi luật về sau chỉ chạm một
-- bảng.

CREATE TABLE chu_tai_khoan (
  -- **Một hàng cho mỗi workspace** — v0.1 có một workspace (mục 1), nhưng khoá
  -- chính là `workspace_id` chứ không một `id` riêng: "một chủ cho mỗi
  -- workspace" là một luật, và một luật đếm được thì phải ép tại DB, không dựa
  -- vào việc đường ghi nhớ kiểm.
  workspace_id  TEXT    PRIMARY KEY REFERENCES workspace(id),

  -- Lớp 1 — mật khẩu (PBKDF2-SHA256)

  -- Khoá dẫn xuất, **hex**. Không bao giờ ra API hay UI (nếp d.417).
  mat_khau_bam  TEXT    NOT NULL CHECK (length(mat_khau_bam) = 64),

  -- Muối, hex 16 byte. Mỗi lần đặt mật khẩu sinh muối mới.
  muoi          TEXT    NOT NULL CHECK (length(muoi) = 32),

  -- **Số vòng PBKDF2 của chính dòng này** — không một hằng trong mã.
  --
  -- Lưu ra để nâng số vòng về sau **không mất mật khẩu cũ**: `kiemMatKhau` băm
  -- lại bằng con số của dòng, còn mức hiện hành chỉ dùng khi *đặt* mật khẩu.
  -- Không lưu thì một lần nâng hằng là một lần mọi chủ bị khoá ngoài cửa.
  --
  -- CHECK đặt trần dưới **1.000** chứ không 600.000: test hạ số vòng qua binding
  -- `PBKDF2_SO_VONG` để không tốn hàng giây cho mỗi ca, nên một CHECK bằng mức
  -- sản phẩm sẽ chặn chính bộ test. Trần dưới vẫn có thật để một dòng `so_vong =
  -- 1` (tức gần như không băm) không ghi được.
  so_vong       INTEGER NOT NULL CHECK (so_vong >= 1000),

  -- Lớp 2 — TOTP

  -- Secret TOTP, **Base32 không padding** (RFC 4648) — dạng duy nhất mà
  -- `otpauth://` mang được. 160 bit ⇒ 32 ký tự Base32.
  --
  -- Đây là một bí mật **đối xứng**: ai đọc được nó thì sinh được mã của mọi bước
  -- thời gian, tức lớp thứ hai của d.415 biến mất. Nên nó chịu đúng nếp d.417
  -- ("không bao giờ trả ra API hay UI") — có ca test ghim, và ca đó dựng sao cho
  -- secret **nằm trong** thứ sắp trả nếu lưới chắn hỏng.
  totp_secret   TEXT    NOT NULL CHECK (length(totp_secret) BETWEEN 16 AND 128),

  -- **Chống dùng lại mã** — bước thời gian của lần đăng nhập **thành công** gần
  -- nhất (`floor(epoch_giây / 30)`).
  --
  -- Lưu *bước*, không lưu *mã*: lưu mã là lưu một bí mật dùng được trong 90
  -- giây, còn bước là một con số vô hại. Luật kiểm là `buoc > totp_buoc_cuoi`,
  -- nên cùng một mã 6 số **không** vào lần thứ hai, và một mã **cũ hơn** (cửa sổ
  -- ±1 bước) cũng không.
  --
  -- NULL = chưa đăng nhập lần nào.
  totp_buoc_cuoi INTEGER CHECK (totp_buoc_cuoi IS NULL OR totp_buoc_cuoi > 0),

  -- Chống dò mật khẩu — SPEC IM LẶNG, xem `cau-hoi-spec.md`

  -- Số lần nhập **sai liên tiếp** (một lần đúng đặt lại về 0).
  so_lan_sai    INTEGER NOT NULL DEFAULT 0 CHECK (so_lan_sai >= 0),
  -- Mốc lần sai gần nhất — dấu vết, và là thứ đọc được trên màn hình sau này.
  sai_cuoi_luc  INTEGER CHECK (sai_cuoi_luc IS NULL OR sai_cuoi_luc > 0),
  -- Khoá tới mốc này. NULL hoặc đã qua = không khoá.
  khoa_den_luc  INTEGER CHECK (khoa_den_luc IS NULL OR khoa_den_luc > 0),

  -- Dấu vết — d.418
  tao_luc            INTEGER NOT NULL CHECK (tao_luc > 0),
  cap_nhat_luc       INTEGER NOT NULL CHECK (cap_nhat_luc > 0),
  -- Lần đăng nhập **thành công** gần nhất. NULL = chưa lần nào.
  dang_nhap_cuoi_luc INTEGER CHECK (dang_nhap_cuoi_luc IS NULL OR dang_nhap_cuoi_luc > 0)
) STRICT;

-- ===================================================================
-- Phiên đăng nhập — d.415 ("30 ngày", "đăng xuất mọi nơi")
-- ===================================================================
--
-- ## Khoá chính là **BĂM** của id phiên
--
-- Id phiên là 32 byte ngẫu nhiên; **chỉ bản băm (SHA-256) vào bảng này**, đúng
-- nếp `agent.token_bam` của 0001. Lý lẽ đầy đủ ở đầu `shared/src/phien-chu.ts`;
-- ba điểm:
--   1. SHA-256 (không KDF chậm) vì giá trị là **máy sinh** 256 bit — không có gì
--      để dò từ điển, đúng lý lẽ `quyet-dinh.md` 01/10 cho token agent.
--   2. Cookie tới trong **mọi** request của web, nên phép tra phải là **một** lần
--      tra khoá. Băm làm khoá chính ⇒ `SEARCH … USING INDEX sqlite_autoindex`
--      (hay PK) chứ không quét. KDF chậm thì muối nằm cùng dòng, tức phải quét
--      cả bảng để biết dòng nào khớp.
--   3. Vẫn **phải băm**: một bản sao lưu lộ bảng này mà lưu id thô là lộ một tập
--      cookie **dùng được ngay**.
--
-- **Không có cột `id` riêng.** Một cột id thứ hai chỉ để "trông giống các bảng
-- khác" sẽ là một khoá thứ hai cho cùng một dòng, và chỗ nào lỡ trả `id` ra API
-- là chỗ ấy phát một thứ gần-như-cookie. Dòng này không có danh tính nào ngoài
-- băm của nó.

CREATE TABLE chu_phien (
  bam           TEXT    PRIMARY KEY CHECK (length(bam) = 64),
  workspace_id  TEXT    NOT NULL REFERENCES chu_tai_khoan(workspace_id),

  tao_luc       INTEGER NOT NULL CHECK (tao_luc > 0),

  -- **Hạn 30 ngày** — d.415. Hạn thật nằm ở đây, **không** ở `Max-Age` của
  -- cookie: cookie là gợi ý cho trình duyệt và sửa được ở phía máy khách.
  het_luc       INTEGER NOT NULL CHECK (het_luc > tao_luc),

  -- **Huỷ** — một phiên (đăng xuất) hoặc mọi phiên ("đăng xuất mọi nơi", d.415).
  --
  -- Một **mốc**, không một cờ: d.418 đòi dấu vết, và "đã huỷ lúc nào" trả lời
  -- được câu đó còn `huy = 1` thì không. Cùng nếp `agent.token_thu_hoi_luc`
  -- (0001) và `evidence.rut_luc` (0009).
  --
  -- **Không xoá dòng** khi đăng xuất: xoá là mất dấu vết, và `DELETE` trên dữ
  -- liệu của chủ thuộc danh sách cấm `CLAUDE.md` mục 4. Dòng hết hạn được dọn ở
  -- một lượt sau nếu cần, và lúc đó phải có Chủ duyệt.
  huy_luc       INTEGER CHECK (huy_luc IS NULL OR huy_luc >= tao_luc),

  -- Dấu vết tối thiểu — d.418.
  --
  -- `dung_cuoi_luc`: lần gần nhất cookie này được dùng. Đủ để màn hình "các
  -- phiên đang mở" của lượt giao diện nói được "máy nào còn đăng nhập", mà
  -- **không** lưu IP: SPEC không đòi IP, và một bảng IP là dữ liệu cá nhân phải
  -- trông, không phải một thứ lấy kèm cho vui.
  --
  -- `tao_tu_ua`: chuỗi User-Agent, cắt ngắn. Cùng mục đích, cùng mức tối thiểu.
  -- NULL được, vì request không bắt buộc có header đó.
  dung_cuoi_luc INTEGER CHECK (dung_cuoi_luc IS NULL OR dung_cuoi_luc >= tao_luc),
  tao_tu_ua     TEXT    CHECK (tao_tu_ua IS NULL OR length(tao_tu_ua) <= 300)
) STRICT;

-- **Đường tra nóng: đúng một lần tra khoá.**
--
-- `bam` đã là khoá chính, nên `WHERE bam = ?` là một `SEARCH … USING INTEGER
-- PRIMARY KEY`-tương đương (ở SQLite là `sqlite_autoindex_chu_phien_1`). Điều
-- kiện còn lại (`huy_luc IS NULL AND het_luc > ?`) nằm **trong cùng câu** đó, trên
-- đúng một dòng — nên nó không thêm phép tra nào. Có ca test đọc
-- `EXPLAIN QUERY PLAN` ghim việc này.
--
-- Index dưới đây là cho đường **"đăng xuất mọi nơi"** và cho màn hình "các phiên
-- đang mở": cả hai lọc theo workspace. Không có nó thì mỗi lần đăng xuất mọi nơi
-- là một lần quét toàn bảng — rẻ hôm nay (một chủ), nhưng bảng này lớn theo **số
-- lần đăng nhập**, không theo số người.
CREATE INDEX ix_chu_phien_ws ON chu_phien (workspace_id, het_luc);

-- ===================================================================
-- Trigger — ba luật mà CHECK và REFERENCES không với tới
-- ===================================================================

-- **Hạn đúng 30 ngày** (d.415), ép tại DB.
--
-- `het_luc > tao_luc` của CHECK chỉ nói "có hạn", còn luật của SPEC là một con số.
-- Không ép thì một đường ghi mới ở lượt sau đặt hạn 10 năm mà không ca nào đỏ,
-- và "phiên 30 ngày" thành một lời khai trong chú thích.
--
-- `2592000000` = 30 × 24 × 60 × 60 × 1000, cùng con số với `PHIEN_CHU_MS` của
-- `shared/src/phien-chu.ts`. Hai chỗ, một con số — và đó là lý do có ca test so
-- trực tiếp hằng TypeScript với hành vi của trigger này.
CREATE TRIGGER tg_chu_phien_han_30_ngay
BEFORE INSERT ON chu_phien
FOR EACH ROW WHEN NEW.het_luc - NEW.tao_luc <> 2592000000
BEGIN
  SELECT RAISE(ABORT, 'INVALID_INPUT: phien dang nhap cua chu phai han dung 30 ngay (SPEC muc 15 d.415)');
END;

-- **Phiên đã huỷ thì không sống lại.**
--
-- "Đăng xuất mọi nơi" (d.415) chỉ có nghĩa nếu nó **không gỡ lại được**: một
-- `UPDATE chu_phien SET huy_luc = NULL` là phục hồi mọi cookie mà chủ vừa cắt —
-- tức đúng việc chủ bấm nút để chặn. Nên `huy_luc` là một chiều.
--
-- Mốc huỷ cũng không **đổi** được sang giá trị khác: đổi nó là viết lại dấu vết
-- (d.418).
CREATE TRIGGER tg_chu_phien_huy_mot_chieu
BEFORE UPDATE OF huy_luc ON chu_phien
FOR EACH ROW WHEN OLD.huy_luc IS NOT NULL AND NEW.huy_luc IS NOT OLD.huy_luc
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: phien dang nhap da huy thi khong mo lai (SPEC muc 15 d.415)');
END;

-- **Hạn và mốc tạo bất biến**: gia hạn một phiên = tạo phiên mới, không sửa cột.
--
-- Nếu `het_luc` sửa được thì "30 ngày" trở thành "30 ngày, trừ khi ai đó đẩy
-- mốc" — và trigger hạn ở trên chỉ bắn ở `INSERT`, nên một `UPDATE` sẽ đi quanh
-- nó. Hai cột cùng một luật nên cùng một trigger.
CREATE TRIGGER tg_chu_phien_moc_bat_bien
BEFORE UPDATE OF tao_luc, het_luc ON chu_phien
FOR EACH ROW WHEN NEW.tao_luc <> OLD.tao_luc OR NEW.het_luc <> OLD.het_luc
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: moc tao va han cua phien dang nhap khong doi (SPEC muc 15 d.415)');
END;

-- **Không ghi đè một dòng phiên đã có** — cùng lỗ `INSERT OR REPLACE` mà 0014 và
-- 0016 đã bịt cho `nhat_ky` và `can_chu`.
--
-- `INSERT OR REPLACE INTO chu_phien (bam, …) VALUES ('<băm đã có>', …)` xoá dòng
-- cũ rồi chèn dòng mới, nên **không** `BEFORE UPDATE` nào bắn (và `PRAGMA
-- recursive_triggers` mặc định **tắt**, nên `BEFORE DELETE` cũng không). Ở đây lỗ
-- đó nghiêm trọng hơn ở hai bảng kia: nó gỡ được `huy_luc` của một phiên đã
-- "đăng xuất mọi nơi" và đặt lại hạn, tức dựng sống lại đúng thứ chủ vừa cắt.
--
-- Đường ghi thật sinh 32 byte ngẫu nhiên mỗi lần nên không bao giờ chạm trigger
-- này — chỉ một câu SQL thô cố ghi đè mới chạm. Có ca test chạy SQL thô.
CREATE TRIGGER tg_chu_phien_khong_ghi_de
BEFORE INSERT ON chu_phien
FOR EACH ROW WHEN EXISTS (SELECT 1 FROM chu_phien WHERE bam = NEW.bam)
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: khong ghi de mot phien dang nhap da co (SPEC muc 15 d.415)');
END;

-- **Số vòng PBKDF2 không được HẠ.**
--
-- Cột `so_vong` tồn tại để **nâng** được mức băm mà không mất mật khẩu cũ (xem
-- chú thích của cột). Nếu nó hạ được thì nó cũng là một đường **làm yếu** mật
-- khẩu chủ bằng một câu `UPDATE` — và không ai thấy, vì mật khẩu vẫn đăng nhập
-- bình thường. Một chiều thì cột ấy chỉ còn đúng công dụng nó được tạo ra để có.
--
-- Đặt lại **cùng** giá trị thì không bị chặn: đường đổi mật khẩu ghi lại cả ba
-- cột một lượt, và chặn ca đó là vỡ một đường ghi vô hại (cùng lý lẽ
-- `tg_can_chu_ma_so_bat_bien` của 0016 cho `UPDATE … SET ma_so = ma_so`).
CREATE TRIGGER tg_chu_tai_khoan_so_vong_chi_tang
BEFORE UPDATE OF so_vong ON chu_tai_khoan
FOR EACH ROW WHEN NEW.so_vong < OLD.so_vong
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: so vong PBKDF2 chi tang, khong ha (quyet-dinh.md 01/10 Q6)');
END;

-- **Bước TOTP đã dùng chỉ tăng** — đây là **cả** hàng rào chống dùng lại mã, ép
-- tại DB.
--
-- Luật sống ở hai tầng có chủ ý: `kiemTotp` (`@baton/shared`) loại mọi bước
-- `<= totp_buoc_cuoi`, và trigger này chặn việc **lùi** mốc. Chỉ có tầng ứng
-- dụng thì một câu `UPDATE chu_tai_khoan SET totp_buoc_cuoi = NULL` làm mọi mã
-- trong cửa sổ dùng lại được — mà đó đúng là một câu mà một đường ghi mới ở lượt
-- sau có thể viết vì tưởng đang "đặt lại cho sạch".
--
-- `IS NOT NULL` ở vế OLD: lần đăng nhập **đầu tiên** đi từ NULL lên một số, và
-- `NEW.x < NULL` cho NULL (WHEN không bật) — nên ca đó vẫn lọt dù không có điều
-- kiện này. Viết ra để người đọc không phải suy lại cái bẫy `<` với NULL mà
-- 0013/0014 đã vấp.
CREATE TRIGGER tg_chu_tai_khoan_totp_buoc_chi_tang
BEFORE UPDATE OF totp_buoc_cuoi ON chu_tai_khoan
FOR EACH ROW WHEN
  OLD.totp_buoc_cuoi IS NOT NULL
  AND (NEW.totp_buoc_cuoi IS NULL OR NEW.totp_buoc_cuoi < OLD.totp_buoc_cuoi)
BEGIN
  SELECT RAISE(ABORT, 'FORBIDDEN: buoc TOTP da dung chi tang, khong lui (chong dung lai ma - SPEC muc 15 d.415)');
END;
