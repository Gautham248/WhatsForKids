"use client";
// Client-side "backend" for the demo. All state lives in this browser (localStorage), so each
// visitor to the Vercel URL has their own private copy. Use Admin > Ops > Reset to start over.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Data } from "./types";
import { makeSeed } from "./seed";
import { Act, Chat, initialChat, runTurn } from "./chat";
import { countImpressions } from "./rank";
import { clearRankCache } from "./rank";
import { slotKey } from "./parser";

const KEY = "wfk-demo-v2";

interface Ctx {
  d: Data;
  update: (fn: (d: Data) => void) => void;
  reset: () => void;
  chat: Chat;
  send: (text: string, acts?: Act[]) => void;
  act: (a: Act) => void;
  newChat: () => void;
  sessionId: string;
  loginOpen: boolean;
  setLoginOpen: (v: boolean) => void;
  signIn: (name: string, email: string) => void;
  signOut: () => void;
  toast: (msg: string) => void;
  toastMsg: string;
  requireLogin: (then: () => void) => void;
}
const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(C);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

function load(): Data {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Data;
      if (j.v === 1) return j;
    }
  } catch {}
  return makeSeed(new Date());
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [d, setD] = useState<Data | null>(null);
  const dRef = useRef<Data | null>(null);
  const [chat, setChat] = useState<Chat>(initialChat());
  const chatRef = useRef<Chat>(chat);
  const [sessionId, setSessionId] = useState("s_pending");
  const [loginOpen, setLoginOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    const data = load();
    dRef.current = data;
    setD(data);
    let sid = "";
    try {
      sid = sessionStorage.getItem("wfk-sid") ?? "";
      if (!sid) {
        sid = "s_" + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem("wfk-sid", sid);
      }
    } catch {
      sid = "s_" + Math.random().toString(36).slice(2, 10);
    }
    setSessionId(sid);
  }, []);

  const persist = (next: Data) => {
    dRef.current = next;
    setD(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  const update = useCallback((fn: (d: Data) => void) => {
    const next = structuredClone(dRef.current!);
    fn(next);
    persist(next);
  }, []);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    setTimeout(() => setToastMsg(""), 2600);
  }, []);

  const applyTurn = (out: ReturnType<typeof runTurn>) => {
    chatRef.current = out.chat;
    setChat(out.chat);
    if (out.llmCostRs || out.history || out.shownIds?.length) {
      update((x) => {
        if (out.shownIds?.length) countImpressions(x, out.shownIds);
        if (out.llmCostRs) {
          x.ops.llmCalls++;
          x.ops.llmCostRs += out.llmCostRs;
        }
        const h = out.history;
        if (h) {
          const last = x.history[0];
          if (!last || slotKey(last.slots) !== slotKey(h.slots)) x.history.unshift(h);
        }
      });
    }
  };
  const send = useCallback((text: string, acts?: Act[]) => applyTurn(runTurn(dRef.current!, chatRef.current, { kind: "text", text, acts })), []); // eslint-disable-line react-hooks/exhaustive-deps
  const act = useCallback((a: Act) => {
    if (a.t === "login") return setLoginOpen(true);
    applyTurn(runTurn(dRef.current!, chatRef.current, { kind: "act", act: a }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const newChat = useCallback(() => {
    const c = initialChat();
    chatRef.current = c;
    setChat(c);
  }, []);
  const reset = useCallback(() => {
    clearRankCache();
    persist(makeSeed(new Date()));
    newChat();
    toast("Demo data reset");
  }, [newChat, toast]);
  const signIn = useCallback(
    (name: string, email: string) => {
      update((x) => {
        x.user = { id: "u_" + email.split("@")[0], name, email };
      });
      setLoginOpen(false);
      toast(`Signed in as ${name} (demo account)`);
      const f = pending.current;
      pending.current = null;
      if (f) setTimeout(f, 0);
    },
    [update, toast],
  );
  const signOut = useCallback(() => {
    update((x) => {
      x.user = null;
    });
    toast("Signed out");
  }, [update, toast]);
  const requireLogin = useCallback(
    (then: () => void) => {
      if (dRef.current?.user) return then();
      pending.current = then;
      setLoginOpen(true);
    },
    [],
  );

  if (!d) return <div className="loading">Loading demo…</div>;
  return (
    <C.Provider value={{ d, update, reset, chat, send, act, newChat, sessionId, loginOpen, setLoginOpen, signIn, signOut, toast, toastMsg, requireLogin }}>
      {children}
    </C.Provider>
  );
}
