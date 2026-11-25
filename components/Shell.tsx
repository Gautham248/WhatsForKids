"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/store";

const ACCOUNTS = [
  { name: "Priya Sharma", email: "priya.demo@example.com" },
  { name: "Arjun Mehta", email: "arjun.demo@example.com" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const { d, update, signOut, loginOpen, setLoginOpen, signIn, toastMsg } = useApp();
  const path = usePathname();
  const tab = (href: string, label: string, match?: (p: string) => boolean) => {
    const on = match ? match(path) : path === href;
    return (
      <Link key={href} href={href} className={"tab" + (on ? " on" : "")}>
        {label}
      </Link>
    );
  };
  const offset = d.ops.clockOffsetDays;
  return (
    <>
      <div className="demo-banner">DEMO BUILD · every product, brand, certificate and price here is invented · data lives only in your browser</div>
      <nav className="nav">
        <div className="nav-in">
          <Link href="/" className="logo">
            What&apos;s for <span>Kids</span>
          </Link>
          {tab("/", "Chat", (p) => p === "/" || p.startsWith("/p/") || p.startsWith("/out/"))}
          {tab("/saved", `Saved${d.saved.length ? ` (${d.saved.length})` : ""}`)}
          {tab("/history", "History")}
          {tab("/account", "Account")}
          <span className="muted">|</span>
          {tab("/admin", "Admin", (p) => p.startsWith("/admin"))}
          {tab("/how-it-works", "How it works")}
          <span className="spacer" />
          {offset !== 0 && <span className="badge warn">Demo clock +{offset}d</span>}
          <label className="row small" title="Show data-source callouts on screens">
            <input type="checkbox" checked={d.ops.annotate} onChange={(e) => update((x) => void (x.ops.annotate = e.target.checked))} /> Annotations
          </label>
          <label className="row small" title="Show the pipeline inspector beside the chat">
            <input type="checkbox" checked={d.ops.inspector} onChange={(e) => update((x) => void (x.ops.inspector = e.target.checked))} /> Inspector
          </label>
          {d.user ? (
            <span className="row small">
              <span className="badge good">{d.user.name}</span>
              <button className="btn sm" onClick={signOut}>
                Sign out
              </button>
            </span>
          ) : (
            <button className="btn sm primary" onClick={() => setLoginOpen(true)}>
              Sign in with Google
            </button>
          )}
        </div>
      </nav>
      <main>{children}</main>
      {loginOpen && (
        <div className="modal-bg" onClick={() => setLoginOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Sign in with Google</h2>
            <p className="muted small">Demo account chooser. In the real build this is Google OAuth through Auth.js. Guests can use chat; saved items and history need an account.</p>
            {ACCOUNTS.map((a) => (
              <button key={a.email} className="btn" style={{ width: "100%", textAlign: "left", marginBottom: 8, borderRadius: 10 }} onClick={() => signIn(a.name, a.email)}>
                <b>{a.name}</b>
                <br />
                <span className="muted small">{a.email}</span>
              </button>
            ))}
            <button className="btn sm" onClick={() => setLoginOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {toastMsg && <div className="toast">{toastMsg}</div>}
    </>
  );
}
