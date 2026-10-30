"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "../lib/api";
import { AccountDialog, type Identity } from "./account-dialog";
const Session = createContext("");
const Account = createContext<{identity: Identity | null; openAccount: () => void}>({identity:null,openAccount:()=>{}});
export function useAccount() { return useContext(Account); }
export function useSession() {
  return useContext(Session);
}
export function Shell({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const identityChannel = useRef<BroadcastChannel | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const pathname = usePathname();
  useEffect(() => {
    let current = true;
    api<Identity>("/session", { method: "POST" })
      .then((value) => {
        if (current) {
          setIdentity(value);
          setError("");
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [attempt]);
  useEffect(() => {
    const channel = new BroadcastChannel("studio-identity");
    identityChannel.current = channel;
    channel.onmessage = () => {
      setIdentity(null);
      setAccountOpen(false);
      setNotice("账户状态已在其他页面更新");
      setAttempt((value) => value + 1);
      setRevision((value) => value + 1);
    };
    return () => {
      channel.close();
      identityChannel.current = null;
    };
  }, []);
  return (
    <>
      <header className="topbar">
        <Link href="/" className="brand">
          <span className="brand-mark">✳</span> 拾光工坊{" "}
          <span className="brand-en">STUDIO</span>
        </Link>
        <nav aria-label="主导航">
          <Link className={pathname === "/" ? "selected" : ""} href="/">
            模板广场
          </Link>
          <Link
            className={pathname === "/history" ? "selected" : ""}
            href="/history"
          >
            我的作品
          </Link>
        </nav>
        <button
          className="visitor"
          disabled={!identity}
          onClick={() => setAccountOpen(true)}
          title={
            identity?.registered
              ? "管理账户与绑定记录"
              : "登录或注册，保存个人作品"
          }
        >
          <i />
          {identity
            ? identity.registered
              ? identity.displayName
              : "登录 / 注册"
            : "正在连接"}
        </button>
      </header>
      {notice && (
        <div className="identity-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="关闭提示">
            ✕
          </button>
        </div>
      )}
      {identity?.registered &&
        identity.pendingGuest &&
        (identity.pendingTasks > 0 || identity.pendingAssets > 0) && (
          <div className="binding-banner">
            <span>
              有 {identity.pendingTasks} 个访客作品、{identity.pendingAssets}{" "}
              张素材待绑定到当前账户。
            </span>
            <button onClick={() => setAccountOpen(true)}>查看并绑定</button>
          </div>
        )}
      <Session.Provider value={identity?.id ?? ""}>
        <Account.Provider value={{identity,openAccount:()=>setAccountOpen(true)}}>
        {error ? (
          <main className="page">
            <div className="empty">
              <h2>暂时无法连接工坊</h2>
              <p>{error}</p>
              <button onClick={() => setAttempt((x) => x + 1)}>重新连接</button>
            </div>
          </main>
        ) : identity ? (
          <div key={`${identity.id}:${revision}`}>{children}</div>
        ) : (
          <main className="page">
            <p className="muted">正在连接工坊…</p>
          </main>
        )}
        </Account.Provider>
      </Session.Provider>
      {accountOpen && identity && (
        <AccountDialog
          identity={identity}
          close={() => setAccountOpen(false)}
          changed={(value, message) => {
            setIdentity(value);
            setRevision((old) => old + 1);
            setAccountOpen(false);
            setNotice(message);
            identityChannel.current?.postMessage("changed");
          }}
        />
      )}
      <footer>
        <span>拾光工坊 · 把灵感变成作品</span>
        <span>
          {identity?.registered
            ? "作品随账户保存"
            : "访客作品保存在本机身份下，注册可绑定"}{" "}
          · 拾光创作空间
        </span>
      </footer>
    </>
  );
}
