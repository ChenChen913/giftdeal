"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { api, ApiError, UNAUTHORIZED_EVENT } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_LEDGER_NAME } from "@/lib/constants";
import { formatAmount } from "@/lib/format";
import { maskFreeText, maskMoney, maskPerson, maskPhone } from "@/lib/mask";
import type { LedgerSummary, MeResponse, MeUser, Overview } from "@/lib/types";

const LEDGER_KEY = "giftdeal.ledgerId";

// ------------------------------------------------------------
// 会话
// ------------------------------------------------------------

type AuthState = {
  user: MeUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await authClient.getSession();
    setUser((data?.user as MeUser | undefined) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    window.localStorage.removeItem(LEDGER_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, refresh, signOut }),
    [user, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 Providers 内使用");
  return ctx;
}

// ------------------------------------------------------------
// 账本上下文
// ------------------------------------------------------------

type LedgerState = {
  ledgerId: string | null;
  ledgers: LedgerSummary[];
  currentLedger: LedgerSummary | null;
  overview: Overview | null;
  loading: boolean;
  switchLedger: (id: string) => void;
  refresh: () => Promise<void>;
  setDefaultLedger: (id: string) => Promise<void>;
  createLedger: (name: string) => Promise<LedgerSummary>;
};

const LedgerContext = createContext<LedgerState | null>(null);

function LedgerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [ledgers, setLedgers] = useState<LedgerSummary[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadMe = useCallback(async () => {
    const me = await api<MeResponse>("/api/v1/me");
    if (!mounted.current) return;
    setLedgers(me.ledgers);

    const stored = window.localStorage.getItem(LEDGER_KEY);
    const storedValid = stored && me.ledgers.some((item) => item.id === stored);
    const fallback = me.ledgers[0]?.id ?? me.defaultLedgerId;

    // 本地演示同步：development 下若用户从未主动选过账本、默认仍是自动新建的空账本，
    // 而他同时也是 seed 演示账本的成员，就优先展示有数据的那本 —— 手机 / 电脑打开即一致。
    // 用户一旦点过账本切换器，localStorage 会记录选择，此后完全尊重用户，不再自动改。
    // NODE_ENV 在构建时内联：测试构建与生产构建都是 production，此分支不会进入产物行为。
    let preferred = fallback;
    if (process.env.NODE_ENV === "development" && !storedValid && me.ledgers.length > 1) {
      const autoLedger = me.ledgers.find((item) => item.id === me.defaultLedgerId);
      const shared = me.ledgers.find((item) => item.id !== me.defaultLedgerId);
      if (autoLedger?.name === DEFAULT_LEDGER_NAME && shared) preferred = shared.id;
    }

    setLedgerId((prev) => {
      if (prev && me.ledgers.some((item) => item.id === prev)) return prev;
      return storedValid ? stored : preferred;
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setLedgers([]);
      setLedgerId(null);
      setOverview(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    loadMe()
      .catch(() => undefined)
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  }, [user, loadMe]);

  const loadOverview = useCallback(async (id: string) => {
    try {
      const data = await api<Overview>("/api/v1/overview", { ledgerId: id });
      if (mounted.current) setOverview(data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setOverview(null);
        return;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!ledgerId) return;
    void loadOverview(ledgerId).catch(() => undefined);
  }, [ledgerId, loadOverview]);

  const switchLedger = useCallback((id: string) => {
    window.localStorage.setItem(LEDGER_KEY, id);
    setLedgerId(id);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    await loadMe();
    if (ledgerId) await loadOverview(ledgerId);
  }, [user, ledgerId, loadMe, loadOverview]);

  const setDefaultLedger = useCallback(
    async (id: string) => {
      await api("/api/v1/me", { method: "PATCH", body: { defaultLedgerId: id } });
      setLedgers((prev) => prev.map((item) => ({ ...item, isDefault: item.id === id })));
    },
    [],
  );

  const createLedger = useCallback(
    async (name: string) => {
      const result = await api<{ ledger: LedgerSummary }>("/api/v1/ledgers", {
        method: "POST",
        body: { name },
      });
      await loadMe();
      switchLedger(result.ledger.id);
      return result.ledger;
    },
    [loadMe, switchLedger],
  );

  const value = useMemo<LedgerState>(
    () => ({
      ledgerId,
      ledgers,
      currentLedger: ledgers.find((item) => item.id === ledgerId) ?? null,
      overview,
      loading,
      switchLedger,
      refresh,
      setDefaultLedger,
      createLedger,
    }),
    [
      ledgerId,
      ledgers,
      overview,
      loading,
      switchLedger,
      refresh,
      setDefaultLedger,
      createLedger,
    ],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger(): LedgerState {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger 必须在 Providers 内使用");
  return ctx;
}

// ------------------------------------------------------------
// 隐私遮罩（默认开启，需二次验证解锁）
// ------------------------------------------------------------

type PrivacyState = {
  /** 是否已通过二次验证 */
  unlocked: boolean;
  /** 是否仍在查询解锁状态 */
  ready: boolean;
  expiresAt: string | null;
  /** 金额：未解锁时把每一位数字替换为星号 */
  money: (cents: number, withSymbol?: boolean) => string;
  /** 人名：未解锁时只保留姓氏 */
  person: (name: string) => string;
  /** 自由文本：未解锁时隐藏其中的数字 */
  note: (text: string | null | undefined) => string;
  /** 手机号：未解锁时打码 */
  phone: (value: string | null | undefined) => string;
  /** 校验隐私密码并解锁 */
  unlock: (password: string) => Promise<void>;
  /** 主动重新上锁 */
  lock: () => Promise<void>;
  /** 打开全局二次验证弹窗（编辑等需要真实值的动作会调用） */
  openUnlock: () => void;
  unlockOpen: boolean;
  setUnlockOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
};

const PrivacyContext = createContext<PrivacyState | null>(null);

function PrivacyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);

  const openUnlock = useCallback(() => setUnlockOpen(true), []);

  const refresh = useCallback(async () => {
    if (!user) {
      setUnlocked(false);
      setExpiresAt(null);
      setReady(true);
      return;
    }
    try {
      const status = await api<{ unlocked: boolean; expiresAt: string | null }>(
        "/api/v1/privacy/status",
      );
      setUnlocked(status.unlocked);
      setExpiresAt(status.expiresAt);
    } catch {
      setUnlocked(false);
      setExpiresAt(null);
    } finally {
      setReady(true);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unlock = useCallback(async (password: string) => {
    const result = await api<{ unlocked: boolean; expiresAt: string }>(
      "/api/v1/privacy/verify",
      { method: "POST", body: { password } },
    );
    setUnlocked(result.unlocked);
    setExpiresAt(result.expiresAt);
  }, []);

  const lock = useCallback(async () => {
    await api("/api/v1/privacy/lock", { method: "POST", body: {} });
    setUnlocked(false);
    setExpiresAt(null);
  }, []);

  const value = useMemo<PrivacyState>(
    () => ({
      unlocked,
      ready,
      expiresAt,
      money: (cents, withSymbol = true) => {
        const formatted = formatAmount(cents, withSymbol);
        return unlocked ? formatted : maskMoney(formatted);
      },
      person: (name) => (unlocked ? name : maskPerson(name)),
      note: (text) => (unlocked ? (text ?? "") : maskFreeText(text)),
      phone: (value) => {
        const raw = value ?? "";
        return unlocked ? raw : maskPhone(raw);
      },
      unlock,
      lock,
      openUnlock,
      unlockOpen,
      setUnlockOpen,
      refresh,
    }),
    [unlocked, ready, expiresAt, unlock, lock, openUnlock, unlockOpen, refresh],
  );

  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacy(): PrivacyState {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error("usePrivacy 必须在 Providers 内使用");
  return ctx;
}

// ------------------------------------------------------------
// 轻量 Toast
// ------------------------------------------------------------

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; text: string; tone: ToastTone };

const ToastContext = createContext<{ toast: (text: string, tone?: ToastTone) => void } | null>(
  null,
);

function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((text: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, text, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, 2800);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`}>
            {item.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 Providers 内使用");
  return ctx;
}

// ------------------------------------------------------------

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <LedgerProvider>
        <PrivacyProvider>
          <ToastProvider>{children}</ToastProvider>
        </PrivacyProvider>
      </LedgerProvider>
    </AuthProvider>
  );
}
