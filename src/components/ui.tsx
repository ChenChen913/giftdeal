"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { avatarText } from "@/lib/format";
import { Icon, type IconName } from "./icons";

// ------------------------------------------------------------
// 头像
// ------------------------------------------------------------

const TONES = 5;

function toneOf(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  return hash % TONES;
}

export function Avatar({
  name,
  size = "md",
  tone,
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  tone?: number;
}) {
  const level = tone ?? toneOf(name);
  return (
    <span className={`avatar avatar-${size} avatar-tone-${level}`} aria-hidden="true">
      {avatarText(name)}
    </span>
  );
}

// ------------------------------------------------------------
// 弹层
// ------------------------------------------------------------

/** 弹窗内可聚焦元素，用于 Tab 循环 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  /** onClose 每次渲染都是新函数，存进 ref，避免它把焦点 effect 反复触发 */
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousActive = document.activeElement as HTMLElement | null;
    const node = dialogRef.current;

    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []).filter(
        (element) => element.offsetParent !== null,
      );

    // 初始焦点落在弹窗容器上：既把焦点从背后页面移进来，
    // 又不会在移动端一打开就弹出输入法键盘。
    // 已经在弹窗内（比如正在输入）就不要再抢，否则每敲一个字都会失焦。
    if (node && !node.contains(document.activeElement)) {
      node.focus();
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const list = focusables();
      if (list.length === 0) {
        event.preventDefault();
        node?.focus();
        return;
      }

      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      // 关闭后把焦点还给触发弹窗的那个元素
      previousActive?.focus?.();
    };
  }, [open]);

  // 挂载到 body：弹窗常被渲染在 sticky / overflow 容器里，
  // 那些容器会形成独立层叠上下文，导致弹窗被后面的内容盖住
  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-head">
          <div className="grow">
            <div className="modal-title" id={titleId}>
              {title}
            </div>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

// ------------------------------------------------------------
// 空状态
// ------------------------------------------------------------

export function Empty({
  icon = "inbox",
  title,
  desc,
  action,
}: {
  icon?: IconName;
  title: string;
  desc?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} />
      <div className="empty-title">{title}</div>
      {desc ? <div className="empty-desc">{desc}</div> : null}
      {action}
    </div>
  );
}

// ------------------------------------------------------------
// 环形图
// ------------------------------------------------------------

export type DonutItem = { label: string; value: number; color: string };

export function Donut({
  items,
  size = 138,
  thickness = 17,
  centerLabel,
  centerValue,
}: {
  items: DonutItem[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="场景分布">
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--surface-container)"
        strokeWidth={thickness}
      />
      {total > 0 &&
        items.map((item) => {
          const length = (item.value / total) * circumference;
          const visible = Math.max(length - 2.5, 0);
          const dash = `${visible} ${circumference - visible}`;
          const element = (
            <circle
              key={item.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={thickness}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${center} ${center})`}
            />
          );
          offset += length;
          return element;
        })}
      {centerValue ? (
        <text x={center} y={center - 2} textAnchor="middle" className="donut-center-value">
          {centerValue}
        </text>
      ) : null}
      {centerLabel ? (
        <text x={center} y={center + 15} textAnchor="middle" className="donut-center-label">
          {centerLabel}
        </text>
      ) : null}
    </svg>
  );
}

// ------------------------------------------------------------
// 加载占位
// ------------------------------------------------------------

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px" }}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="skeleton" style={{ height: 44 }} />
      ))}
    </div>
  );
}

export function Spinner() {
  return <span className="spin" aria-label="加载中" />;
}
