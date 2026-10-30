"use client";
import { useEffect, useRef, useState } from "react";
import { post } from "../lib/api";

export type Identity = {
  id: string;
  displayName: string;
  registered: boolean;
  email: string | null;
  pendingGuest: boolean;
  pendingTasks: number;
  pendingAssets: number;
};

export function AccountDialog({
  identity,
  close,
  changed,
}: {
  identity: Identity;
  close: () => void;
  changed: (value: Identity, message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function action(path: string, data: unknown, message: string) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await post<Identity>(path, data);
      changed(next, message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成，请重试");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="account-dialog"
      aria-labelledby="account-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="account-heading">
        <span className="eyebrow">YOUR CREATIVE SPACE</span>
        <button
          type="button"
          onClick={close}
          disabled={busy}
          aria-label="关闭账户窗口"
        >
          ✕
        </button>
      </div>
      <h2 id="account-title">
        {identity.registered
          ? "我的账户"
          : mode === "login"
            ? "欢迎回到拾光"
            : "为灵感安个家"}
      </h2>
      {identity.registered ? (
        <>
          <p className="account-name">{identity.displayName}</p>
          <p className="muted">{identity.email}</p>
          <p className="account-copy">
            作品已随账户保存。在其他浏览器登录同一账户，即可继续查看。
          </p>
          {identity.pendingGuest && (
            <section className="binding-panel">
              <h3>还有访客记录待绑定</h3>
              <p>
                本次登录前的 {identity.pendingTasks} 个作品、
                {identity.pendingAssets} 张上传素材尚未合并到账户。
              </p>
              <p className="muted">
                绑定后将归属当前账户；暂不绑定并退出，会恢复原访客身份。
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => action("/auth/bind", {}, "访客作品已绑定到账户")}
              >
                绑定访客作品
              </button>
            </section>
          )}
          <button
            className="account-logout"
            disabled={busy}
            onClick={() =>
              action("/auth/logout", {}, "已退出账户，当前为访客模式")
            }
          >
            退出登录
          </button>
        </>
      ) : (
        <>
          <p className="account-copy">
            {mode === "login"
              ? "登录后查看你的作品，也可以绑定本次访客创作。"
              : "注册后，当前访客的作品和素材会自动保存到新账户。"}
          </p>
          <div className="account-tabs" aria-label="账户操作">
            <button
              disabled={busy}
              aria-pressed={mode === "login"}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              登录
            </button>
            <button
              disabled={busy}
              aria-pressed={mode === "register"}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              注册账户
            </button>
          </div>
          <form
            key={mode}
            onSubmit={(event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              const password = String(fields.get("password"));
              if (new TextEncoder().encode(password).length > 72) {
                setError("密码的 UTF-8 编码不能超过 72 字节");
                return;
              }
              if (mode === "register" && password !== fields.get("confirm")) {
                setError("两次输入的密码不一致");
                return;
              }
              void action(
                `/auth/${mode}`,
                {
                  email: String(fields.get("email")).trim(),
                  password,
                  ...(mode === "register"
                    ? { displayName: String(fields.get("displayName")).trim() }
                    : {}),
                },
                mode === "register"
                  ? "注册成功，原访客作品已保存到账户"
                  : "登录成功，可在账户中绑定访客作品",
              );
            }}
          >
            <fieldset disabled={busy}>
              {mode === "register" && (
                <label>
                  昵称
                  <input
                    name="displayName"
                    autoComplete="nickname"
                    required
                    maxLength={40}
                    placeholder="如何称呼你"
                  />
                </label>
              )}
              <label>
                邮箱
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                  placeholder="you@example.com"
                />
              </label>
              <label>
                密码
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={10}
                  maxLength={72}
                  aria-describedby="password-hint"
                  placeholder="至少 10 个字符"
                />
              </label>
              <small id="password-hint">
                至少 10 个字符；中文等多字节字符合计不超过 72 字节。
              </small>
              {mode === "register" && (
                <label>
                  确认密码
                  <input
                    name="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={10}
                    maxLength={72}
                  />
                </label>
              )}
              <button className="primary account-submit" type="submit">
                {busy
                  ? "正在处理…"
                  : mode === "login"
                    ? "登录账户"
                    : "注册并保存当前作品"}
              </button>
            </fieldset>
          </form>
          <p className="account-footnote">
            邮箱用作登录名，目前不发送验证邮件。请牢记密码。
          </p>
        </>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
    </dialog>
  );
}
