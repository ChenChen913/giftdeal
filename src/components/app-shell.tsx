"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useAuth, useLedger, usePrivacy } from "./providers";
import { PrivacyDialog, PrivacyToggle } from "./privacy-control";
import { useRecordDialog } from "./record-dialog";
import { Icon, type IconName } from "./icons";
import { Avatar } from "./ui";

type NavItem = { href: string; label: string; icon: IconName; badge?: number };

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { ledgers, ledgerId, currentLedger, overview, switchLedger, loading } = useLedger();
  const { person } = usePrivacy();
  const { open: openRecord } = useRecordDialog();

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!switcherOpen) return;
    const onClick = (event: MouseEvent) => {
      if (!switcherRef.current?.contains(event.target as Node)) setSwitcherOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [switcherOpen]);

  const pendingCount = overview?.pendingReturnCount ?? 0;
  const planCount = overview?.planCount ?? 0;

  const nav: NavItem[] = [
    { href: "/", label: "首页看板", icon: "home" },
    { href: "/contacts", label: "人情对账", icon: "swap" },
    { href: "/events", label: "人生大事", icon: "calendar" },
    { href: "/pending", label: "待回礼清单", icon: "gift", badge: pendingCount },
    { href: "/plans", label: "人情预备", icon: "sparkle", badge: planCount },
    { href: "/ledger", label: "家庭共享", icon: "users" },
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand" title="礼尚往来">
          <span className="brand-mark">礼</span>
          <span className="brand-text">
            <span className="brand-name">礼尚·人情账本</span>
            <span className="brand-sub">Warm Accord</span>
          </span>
        </Link>

        <div className="sidebar-section" ref={switcherRef} style={{ position: "relative" }}>
          <span className="sidebar-section-title">当前账本</span>
          <button
            type="button"
            className="ledger-pill"
            onClick={() => setSwitcherOpen((prev) => !prev)}
            title={currentLedger?.name ?? "选择账本"}
          >
            <Icon name="wallet" size={18} />
            <span className="ledger-pill-body">
              <span className="ledger-pill-name">{currentLedger?.name ?? "加载中"}</span>
              <span className="ledger-pill-sub">
                {currentLedger?.role === "OWNER" ? "主家庭账簿" : "共享账簿"}
              </span>
            </span>
            <Icon name="chevronDown" size={15} />
          </button>

          {switcherOpen ? (
            <div
              className="card"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                right: 0,
                zIndex: 30,
                padding: 6,
                boxShadow: "var(--shadow-2)",
              }}
            >
              {ledgers.map((ledger) => (
                <button
                  key={ledger.id}
                  type="button"
                  className="nav-item"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={() => {
                    switchLedger(ledger.id);
                    setSwitcherOpen(false);
                  }}
                >
                  <Icon name={ledger.id === ledgerId ? "check" : "wallet"} size={16} />
                  <span style={{ flex: 1, textAlign: "left" }}>{ledger.name}</span>
                  <span className="caption">{ledger.memberCount} 人</span>
                </button>
              ))}
              <div className="divider" style={{ margin: "6px 0" }} />
              <Link
                href="/ledger"
                className="nav-item"
                style={{ width: "100%" }}
                onClick={() => setSwitcherOpen(false)}
              >
                <Icon name="edit" size={16} />
                <span>管理账本与成员</span>
              </Link>
            </div>
          ) : null}
        </div>

        <button type="button" className="btn btn-primary" onClick={() => openRecord()}>
          <Icon name="plus" size={17} />
          <span>记一笔</span>
        </button>

        <nav className="nav">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive(item.href) ? "active" : ""}`}
              title={item.label}
            >
              <Icon name={item.icon} size={18} />
              <span>{item.label}</span>
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </Link>
          ))}
        </nav>

        <div className="sidebar-spacer" />

        <div className="sidebar-user">
          <Avatar name={person(user?.name ?? "我")} size="sm" tone={2} />
          <div className="sidebar-user-meta" style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-user-name">{person(user?.name ?? "—")}</div>
            <div className="sidebar-user-role">
              {currentLedger?.role === "OWNER" ? "户主 · 创建者" : "记账员"}
            </div>
          </div>
          <button
            type="button"
            className="icon-btn"
            title="退出登录"
            onClick={async () => {
              await signOut();
              router.replace("/login");
            }}
          >
            <Icon name="logout" size={17} />
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="mobile-topbar">
          <Link href="/" className="mobile-brand">
            <span className="brand-mark">礼</span>
            <span style={{ minWidth: 0 }}>
              <div className="mobile-brand-name">礼尚·人情账本</div>
              <div className="mobile-brand-sub">{currentLedger?.name ?? "加载中"}</div>
            </span>
          </Link>
          <PrivacyToggle compact />
          <Link href="/ledger" className="icon-btn" aria-label="家庭共享">
            <Icon name="users" size={19} />
          </Link>
        </div>

        <div className="topbar">
          <span className="topbar-crumb">礼尚往来 · 人情账本</span>
          <div className="topbar-actions">
            <PrivacyToggle />
            <Link href="/contacts" className="icon-btn" aria-label="搜索亲友">
              <Icon name="search" size={18} />
            </Link>
            <Link href="/pending" className="icon-btn" aria-label="待回礼提醒">
              <Icon name="bell" size={18} />
            </Link>
          </div>
        </div>

        {loading && !currentLedger ? (
          <div className="page">
            <div className="full-loader">正在打开账本…</div>
          </div>
        ) : (
          children
        )}
      </div>

      <nav className="bottomnav">
        <Link href="/" className={`bottomnav-item ${isActive("/") ? "active" : ""}`}>
          <Icon name="home" size={20} />
          <span>看板</span>
        </Link>
        <Link
          href="/contacts"
          className={`bottomnav-item ${isActive("/contacts") ? "active" : ""}`}
        >
          <Icon name="swap" size={20} />
          <span>对账</span>
        </Link>
        <button
          type="button"
          className="bottomnav-fab"
          aria-label="记一笔"
          onClick={() => openRecord()}
        >
          <Icon name="plus" size={22} />
        </button>
        <Link
          href="/pending"
          className={`bottomnav-item ${isActive("/pending") ? "active" : ""}`}
        >
          <span style={{ position: "relative", display: "grid", placeItems: "center" }}>
            <Icon name="gift" size={20} />
            {pendingCount > 0 ? <span className="bottomnav-badge">{pendingCount}</span> : null}
          </span>
          <span>待回礼</span>
        </Link>
        <Link href="/plans" className={`bottomnav-item ${isActive("/plans") ? "active" : ""}`}>
          <span style={{ position: "relative", display: "grid", placeItems: "center" }}>
            <Icon name="sparkle" size={20} />
            {planCount > 0 ? <span className="bottomnav-badge">{planCount}</span> : null}
          </span>
          <span>预备</span>
        </Link>
      </nav>

      <PrivacyDialog />
    </div>
  );
}
