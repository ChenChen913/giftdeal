"use client";

import { useMemo, useState } from "react";

import {
  CONTACT_GROUPS,
  CONTACT_GROUP_LABELS,
  GIFT_SCENES,
  SCENE_LABELS,
  type ContactGroup,
  type GiftScene,
} from "@/lib/constants";
import type { Contact } from "@/lib/types";

export type RelationFilter = "all" | ContactGroup;
export type StanceFilter = "all" | "receive" | "give" | "even";
export type SceneFilter = "all" | GiftScene;
/** 时序：与「记一笔」按日期分流对应 */
export type TimingFilter = "all" | "occurred" | "planned" | "planOnly";

const TIMING_OPTIONS: { key: TimingFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "occurred", label: "已发生" },
  { key: "planned", label: "有预备" },
  { key: "planOnly", label: "仅预备" },
];

const STANCE_OPTIONS: { key: StanceFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "receive", label: "收多于送" },
  { key: "give", label: "送多于收" },
  { key: "even", label: "两清" },
];

const RELATION_OPTIONS: { key: RelationFilter; label: string }[] = [
  { key: "all", label: "全部" },
  ...CONTACT_GROUPS.map((group) => ({
    key: group as RelationFilter,
    label: CONTACT_GROUP_LABELS[group],
  })),
];

const SCENE_OPTIONS: { key: SceneFilter; label: string }[] = [
  { key: "all", label: "全部" },
  ...GIFT_SCENES.map((scene) => ({ key: scene as SceneFilter, label: SCENE_LABELS[scene] })),
];

function matchRelation(contact: Contact, filter: RelationFilter): boolean {
  if (filter === "all") return true;
  // 未分组的亲友按「其他」处理
  return (contact.relationTag ?? "OTHER") === filter;
}

function matchStance(contact: Contact, filter: StanceFilter): boolean {
  const net = contact.stats.netCents;
  if (filter === "all") return true;
  if (filter === "receive") return net > 0;
  if (filter === "give") return net < 0;
  return net === 0;
}

function matchScene(contact: Contact, filter: SceneFilter): boolean {
  if (filter === "all") return true;
  return (contact.stats.scenes ?? []).includes(filter);
}

function matchTiming(contact: Contact, filter: TimingFilter): boolean {
  if (filter === "all") return true;
  const plans = contact.stats.planCount ?? 0;
  const records = contact.stats.recordCount;
  if (filter === "occurred") return records > 0;
  if (filter === "planned") return plans > 0;
  return plans > 0 && records === 0;
}

export function useContactFilter(contacts: Contact[]) {
  const [relation, setRelation] = useState<RelationFilter>("all");
  const [stance, setStance] = useState<StanceFilter>("all");
  const [scene, setScene] = useState<SceneFilter>("all");
  const [timing, setTiming] = useState<TimingFilter>("all");

  const filtered = useMemo(
    () =>
      contacts.filter(
        (contact) =>
          matchRelation(contact, relation) &&
          matchStance(contact, stance) &&
          matchScene(contact, scene) &&
          matchTiming(contact, timing),
      ),
    [contacts, relation, stance, scene, timing],
  );

  const counts = useMemo(() => {
    const byRelation: Record<string, number> = {};
    for (const option of RELATION_OPTIONS) {
      byRelation[option.key] = contacts.filter((contact) =>
        matchRelation(contact, option.key),
      ).length;
    }
    return byRelation;
  }, [contacts]);

  const timingCounts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const option of TIMING_OPTIONS) {
      result[option.key] = contacts.filter((contact) => matchTiming(contact, option.key)).length;
    }
    return result;
  }, [contacts]);

  return {
    relation,
    setRelation,
    stance,
    setStance,
    scene,
    setScene,
    timing,
    setTiming,
    filtered,
    counts,
    timingCounts,
  };
}

export function ContactFilters({
  relation,
  stance,
  scene,
  timing,
  onRelation,
  onStance,
  onScene,
  onTiming,
  counts,
  timingCounts,
}: {
  relation: RelationFilter;
  stance: StanceFilter;
  scene: SceneFilter;
  timing: TimingFilter;
  onRelation: (value: RelationFilter) => void;
  onStance: (value: StanceFilter) => void;
  onScene: (value: SceneFilter) => void;
  onTiming: (value: TimingFilter) => void;
  counts?: Record<string, number>;
  timingCounts?: Record<string, number>;
}) {
  /**
   * 手机端 4 行分类（人群 10 项、礼金 6 项…）会换行成 226px 高的密集墙，
   * 把亲友列表挤出首屏。这里默认收起成一行「筛选」摘要，展开后每行横向滑动。
   * 桌面端由 CSS 强制始终展开，交互与改动前完全一致。
   */
  const [open, setOpen] = useState(false);
  const activeLabels = [
    relation !== "all" ? RELATION_OPTIONS.find((option) => option.key === relation)?.label : null,
    scene !== "all" ? SCENE_OPTIONS.find((option) => option.key === scene)?.label : null,
    timing !== "all" ? TIMING_OPTIONS.find((option) => option.key === timing)?.label : null,
    stance !== "all" ? STANCE_OPTIONS.find((option) => option.key === stance)?.label : null,
  ].filter((label): label is string => Boolean(label));

  return (
    <div className={`filter-bar ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="filter-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="contact-filter-rows"
      >
        <span className="filter-toggle-title">筛选</span>
        {activeLabels.length > 0 ? (
          <span className="filter-toggle-count">{activeLabels.length}</span>
        ) : null}
        <span className="filter-toggle-summary">
          {activeLabels.length > 0 ? activeLabels.join(" · ") : "全部亲友"}
        </span>
      </button>

      <div className="filter-rows" id="contact-filter-rows">
        <div className="filter-row">
          <span className="filter-label">人群</span>
          {RELATION_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`filter-chip ${relation === option.key ? "on" : ""}`}
              onClick={() => onRelation(option.key)}
            >
              {option.label}
              {counts && option.key !== "all" && counts[option.key] > 0 ? (
                <span className="count">{counts[option.key]}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <span className="filter-label">礼金</span>
          {SCENE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`filter-chip ${scene === option.key ? "on" : ""}`}
              onClick={() => onScene(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <span className="filter-label">时序</span>
          {TIMING_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`filter-chip ${timing === option.key ? "on" : ""}`}
              onClick={() => onTiming(option.key)}
            >
              {option.label}
              {timingCounts && option.key !== "all" && timingCounts[option.key] > 0 ? (
                <span className="count">{timingCounts[option.key]}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <span className="filter-label">方向</span>
          {STANCE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`filter-chip ${stance === option.key ? "on" : ""}`}
              onClick={() => onStance(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
