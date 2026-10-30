package com.example.studio;

import com.example.studio.AccountMapper.*;
import jakarta.servlet.http.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Duration;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Identity {

  public record View(
    String id,
    String displayName,
    boolean registered,
    String email,
    boolean pendingGuest,
    int pendingTasks,
    int pendingAssets
  ) {}

  private final AccountMapper db;
  private final boolean secure;
  private final String origin;
  private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(12);
  private final String dummyHash = passwords.encode(
    UUID.randomUUID().toString()
  );
  private final SecureRandom random = new SecureRandom();

  public Identity(
    AccountMapper db,
    @Value("${studio.secure-cookie}") boolean secure,
    @Value("${studio.public-origin}") String origin
  ) {
    this.db = db;
    this.secure = secure;
    this.origin = origin;
  }

  private String cookieHash(HttpServletRequest req) {
    if (req.getCookies() != null) for (Cookie c : req.getCookies()) {
      if (c.getName().equals("studio_session")) return hash(c.getValue());
    }
    return null;
  }

  private SessionRow existing(HttpServletRequest req) {
    String token = cookieHash(req);
    return token == null ? null : db.session(token);
  }

  public String currentOwner(HttpServletRequest req) {
    SessionRow session = existing(req);
    return session == null ? null : session.ownerId;
  }

  public String requireAccount(HttpServletRequest req) {
    String owner = require(req);
    if (db.byOwner(owner) == null) throw problem(HttpStatus.FORBIDDEN, "请先登录或注册，再创建自己的模板");
    return owner;
  }

  public void sameOrigin(HttpServletRequest req) {
    String source = req.getHeader("Origin");
    if (source != null && !source.equals(origin)) throw problem(
      HttpStatus.FORBIDDEN,
      "请求来源不匹配"
    );
    if ("cross-site".equals(req.getHeader("Sec-Fetch-Site"))) throw problem(
      HttpStatus.FORBIDDEN,
      "请求来源不匹配"
    );
  }

  private SessionRow locked(HttpServletRequest req) {
    sameOrigin(req);
    SessionRow s = existing(req);
    if (s == null || db.lockOwner(s.ownerId) == null) throw expired();
    // Use a locking/current read, not a REPEATABLE READ snapshot: a concurrent
    // login may have rotated this token while we waited for the owner lock.
    s = db.lockSession(cookieHash(req));
    if (s == null) throw expired();
    return s;
  }

  private String newOwner() {
    String id = UUID.randomUUID().toString();
    db.owner(id);
    return id;
  }

  private View issue(HttpServletResponse res, String owner, String guest) {
    byte[] bytes = new byte[32];
    random.nextBytes(bytes);
    String token = Base64.getUrlEncoder()
      .withoutPadding()
      .encodeToString(bytes);
    db.insertSession(hash(token), owner, guest);
    res.addHeader(
      "Set-Cookie",
      ResponseCookie.from("studio_session", token)
        .httpOnly(true)
        .secure(secure)
        .sameSite("Lax")
        .path("/")
        .maxAge(Duration.ofDays(30))
        .build()
        .toString()
    );
    return view(owner, guest);
  }

  private View view(String owner, String guest) {
    AccountRow account = db.byOwner(owner);
    return new View(
      owner,
      account == null ? "访客 " + owner.substring(0, 6) : account.displayName,
      account != null,
      account == null ? null : account.email,
      guest != null,
      guest == null ? 0 : db.taskCount(guest),
      guest == null ? 0 : db.assetCount(guest)
    );
  }

  @Transactional
  public View create(HttpServletRequest req, HttpServletResponse res) {
    sameOrigin(req);
    SessionRow s = existing(req);
    if (s != null) return view(s.ownerId, s.pendingGuestId);
    return issue(res, newOwner(), null);
  }

  public String require(HttpServletRequest req) {
    if (!"GET".equals(req.getMethod())) sameOrigin(req);
    SessionRow s = existing(req);
    if (s == null) throw expired();
    return s.ownerId;
  }

  private void guestOnly(SessionRow s) {
    if (db.byOwner(s.ownerId) != null) throw problem(
      HttpStatus.CONFLICT,
      "请先退出当前账户"
    );
  }

  public static void validatePassword(String password) {
    if (
      password.length() < 10 ||
      password.getBytes(StandardCharsets.UTF_8).length > 72
    ) throw problem(
      HttpStatus.BAD_REQUEST,
      "密码至少 10 个字符，且 UTF-8 编码不超过 72 字节"
    );
  }

  @Transactional
  public View register(
    HttpServletRequest req,
    HttpServletResponse res,
    String email,
    String name,
    String password
  ) {
    validatePassword(password);
    SessionRow s = locked(req);
    guestOnly(s);
    AccountRow a = new AccountRow();
    a.ownerId = s.ownerId;
    a.email = email.strip().toLowerCase(Locale.ROOT);
    a.displayName = name.strip();
    a.passwordHash = passwords.encode(password);
    try {
      db.account(a);
    } catch (DuplicateKeyException e) {
      throw problem(HttpStatus.CONFLICT, "该邮箱已注册，请登录");
    }
    db.revokeOwner(s.ownerId);
    return issue(res, s.ownerId, null);
  }

  @Transactional
  public View login(
    HttpServletRequest req,
    HttpServletResponse res,
    String email,
    String password
  ) {
    validatePassword(password);
    SessionRow s = locked(req);
    guestOnly(s);
    AccountRow a = db.byEmail(email.strip().toLowerCase(Locale.ROOT));
    boolean matched = passwords.matches(
      password,
      a == null ? dummyHash : a.passwordHash
    );
    if (!matched || a == null) throw problem(
      HttpStatus.UNAUTHORIZED,
      "邮箱或密码不正确"
    );
    db.revokeOwner(s.ownerId);
    // Only the proven current guest can be offered for binding. Never accept an owner ID from the client.
    return issue(res, a.ownerId, s.ownerId);
  }

  @Transactional
  public View logout(HttpServletRequest req, HttpServletResponse res) {
    SessionRow s = locked(req);
    db.revoke(cookieHash(req));
    String guest = s.pendingGuestId;
    if (
      guest != null && db.lockOwner(guest) != null && db.byOwner(guest) == null
    ) return issue(res, guest, null);
    return issue(res, newOwner(), null);
  }

  @Transactional
  public View bind(HttpServletRequest req) {
    SessionRow s = locked(req);
    if (db.byOwner(s.ownerId) == null) throw problem(
      HttpStatus.CONFLICT,
      "请先登录账户"
    );
    if (s.pendingGuestId == null) return view(s.ownerId, null);
    String guest = s.pendingGuestId;
    if (db.lockOwner(guest) == null || db.byOwner(guest) != null) throw problem(
      HttpStatus.CONFLICT,
      "访客记录已被绑定，请刷新页面"
    );
    db.moveAssets(s.ownerId, guest);
    db.moveTasks(s.ownerId, guest);
    db.revokeOwner(guest);
    db.clearGuest(guest);
    db.retire(guest);
    return view(s.ownerId, null);
  }

  private static ResponseStatusException expired() {
    return problem(HttpStatus.UNAUTHORIZED, "会话已失效，请刷新页面后重新登录");
  }

  private static ResponseStatusException problem(
    HttpStatus status,
    String text
  ) {
    return new ResponseStatusException(status, text);
  }

  private static String hash(String value) {
    try {
      return HexFormat.of().formatHex(
        MessageDigest.getInstance("SHA-256").digest(
          value.getBytes(StandardCharsets.UTF_8)
        )
      );
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
