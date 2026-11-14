"use client";

import { useEffect, type ReactNode } from "react";

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
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal ${wide ? "modal-wide" : ""}`}>
        <div className="modal-head">
          <div className="grow">
            <div className="modal-title">{title}</div>
            {subtitle ? <div className="modal-sub">{subtitle}</div> : null}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
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
