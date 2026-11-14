"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import { useAuth } from "@/components/providers";
import { Spinner } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

const FEATURES = [
  {
    icon: "swap" as const,
    title: "知恩答谢 · 双向对账",
    desc: "收礼送礼清晰配比，自动平衡往还差额，适度回礼不失礼数。",
  },
  {
    icon: "users" as const,
    title: "一册同心 · 家族共济",
    desc: "小家与长辈多账本同步协同，多方记录无缝聚合。",
  },
  {
    icon: "sparkle" as const,
    title: "谨言慎行 · 礼俗规矩",
    desc: "帛金单数风俗校验，红白事宜吉语备忘，节气提醒周到。",
  },
];

/** 内部账号：只允许这一个字母组合，其余必须是 11 位手机号 */
const ADMIN_ACCOUNT = "admin";

/** 演示账号提示只在非生产构建里显示；生产可用 NEXT_PUBLIC_SHOW_DEMO_HINT=true 强制打开 */
const SHOW_DEMO_HINT =
  process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_SHOW_DEMO_HINT !== "false";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();

  const [account, setAccount] = useState("");
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const nextRef = useRef<string>("/");

  const isAdmin = account === ADMIN_ACCOUNT;
  const phoneValid = /^1[3-9]\d{9}$/.test(account);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");
    // 只接受站内绝对路径；排除 //evil.com 这类协议相对 URL（开放重定向）
    if (next && next.startsWith("/") && !next.startsWith("//")) nextRef.current = next;
  }, []);

  useEffect(() => {
    if (!loading && user) router.replace(nextRef.current);
  }, [loading, user, router]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  /**
   * 只接受两类输入：
   * - 纯数字（最多 11 位）
   * - 内部账号 "admin" 的逐字符前缀
   * 其他字母一律不进入输入框。
   */
  const handleAccountChange = (raw: string) => {
    const value = raw.replace(/\s/g, "").toLowerCase();
    if (value === "") {
      setAccount("");
      return;
    }
    if (/^\d+$/.test(value)) {
      setAccount(value.slice(0, 11));
      return;
    }
    if (ADMIN_ACCOUNT.startsWith(value)) {
      setAccount(value);
    }
  };

  const sendCode = async () => {
    setError(null);
    setHint(null);
    if (!phoneValid) {
      setError("请输入 11 位大陆手机号");
      return;
    }
    setSending(true);
    try {
      const { error: sendError } = await authClient.phoneNumber.sendOtp({
        phoneNumber: `+86${account}`,
      });
      if (sendError) {
        setError(sendError.message ?? "验证码发送失败");
        return;
      }
      setCountdown(60);
      setHint("验证码已发出。开发环境固定为 123456，可在服务端日志查看。");
    } catch {
      setError("网络异常，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!isAdmin && !phoneValid) {
      setError("请输入 11 位手机号，或输入 admin");
      return;
    }
    if (!isAdmin && !/^\d{6}$/.test(code)) {
      setError("请输入 6 位验证码");
      return;
    }
    if (!agreed) {
      setError("请先同意服务协议与隐私政策");
      return;
    }

    setSubmitting(true);
    try {
      if (isAdmin) {
        const response = await fetch("/api/v1/auth/admin-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: ADMIN_ACCOUNT }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.ok) {
          setError(payload?.error?.message ?? "登录失败");
          return;
        }
        await refresh();
        router.replace(nextRef.current);
        return;
      }

      const { error: verifyError } = await authClient.phoneNumber.verify({
        phoneNumber: `+86${account}`,
        code,
      });

      if (verifyError) {
        setError(
          verifyError.status === 403
            ? "验证码错误次数过多，请重新获取"
            : (verifyError.message ?? "验证码不正确"),
        );
        return;
      }

      await refresh();
      router.replace(nextRef.current);
    } catch {
      setError("登录失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="brand">
          <span className="brand-mark">礼</span>
          <span className="brand-text">
            <span className="brand-name">礼尚 · 人情账本</span>
            <span className="brand-sub">Traditional Reciprocity &amp; Family Ledger</span>
          </span>
        </div>

        <div className="login-hero-body">
          <div className="col" style={{ gap: 18 }}>
            <span className="eyebrow">典出《礼记·曲礼上》</span>
            <h1 className="login-quote">
              “礼尚往来。往而不来，非礼也；
              <br />
              <span>来而不往，亦非礼也</span>。”
            </h1>
            <p className="login-sub">
              褪去冗俗记账的冰冷，以当代数字器物重塑传统人情往还之美。
              记每一笔深重心意，清每一份代际恩情。
            </p>
          </div>

          <div className="login-features">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="login-feature">
                <span className="login-feature-icon">
                  <Icon name={feature.icon} size={16} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="login-side">
        <form className="login-card" onSubmit={submit}>
          <div className="login-mobile-brand">
            <span className="brand-mark" style={{ width: 44, height: 44, fontSize: 22 }}>
              礼
            </span>
            <div className="brand-name" style={{ fontSize: 17 }}>
              礼尚 · 人情账本
            </div>
          </div>

          <div>
            <h2 className="login-title">手机快捷登录</h2>
            <p className="login-desc">无需预先注册，首次验证即自动开通家庭账簿</p>
          </div>

          <div className="field">
            <div className="row between">
              <span className="label">手机号码</span>
              <span className="caption">内部账号可填 admin</span>
            </div>
            <div className="input-affix">
              <span className="input-affix-prefix">
                {isAdmin ? <Icon name="users" size={15} /> : "+86"}
              </span>
              <input
                className={`input ${isAdmin ? "" : "mono"}`}
                inputMode={isAdmin ? "text" : "numeric"}
                maxLength={11}
                placeholder="13812348821"
                value={account}
                onChange={(event) => handleAccountChange(event.target.value)}
                autoComplete="username"
              />
            </div>
          </div>

          {isAdmin ? null : (
            <div className="field">
              <div className="row between">
                <span className="label">短信验证码</span>
                <span className="caption">6 位纯数字</span>
              </div>
              <div className="code-row">
                <input
                  className="input"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={sendCode}
                  disabled={sending || countdown > 0}
                  style={{ minWidth: 116 }}
                >
                  {sending ? <Spinner /> : countdown > 0 ? `重新获取 ${countdown}s` : "获取验证码"}
                </button>
              </div>
              {hint ? <span className="field-hint">{hint}</span> : null}
            </div>
          )}

          {error ? <div className="field-error">{error}</div> : null}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? <Spinner /> : <Icon name="arrowRight" size={16} />}
            {isAdmin ? "进入账本" : "立即登录 · 进入账本"}
          </button>

          <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
            <input
              id="agree-legal"
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              style={{ marginTop: 3, accentColor: "var(--primary-container)" }}
            />
            <span className="caption" style={{ lineHeight: 1.7 }}>
              <label htmlFor="agree-legal" style={{ cursor: "pointer" }}>
                我已阅读并同意
              </label>
              <Link
                href="/legal/terms"
                target="_blank"
                style={{ color: "var(--primary)" }}
              >
                《服务协议》
              </Link>
              与
              <Link
                href="/legal/privacy"
                target="_blank"
                style={{ color: "var(--primary)" }}
              >
                《隐私政策》
              </Link>
            </span>
          </div>

          <p className="login-foot">
            {SHOW_DEMO_HINT ? (
              <>
                手机演示：13800000001 / 123456
                <br />
              </>
            ) : null}
            礼尚 · 东方家庭人情数字账本
          </p>
        </form>
      </section>
    </div>
  );
}
