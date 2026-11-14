"use client";

import { useMemo, useState } from "react";

import { GIFT_SCENES, SCENE_LABELS, type GiftScene } from "@/lib/constants";
import type { Contact } from "@/lib/types";

export const RELATION_PRESETS = ["亲戚", "朋友", "同事", "同学", "邻居"] as const;

export type RelationFilter = "all" | "其他" | (typeof RELATION_PRESETS)[number];
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
  ...RELATION_PRESETS.map((item) => ({ key: item as RelationFilter, label: item })),
  { key: "其他", label: "其他" },
];

const SCENE_OPTIONS: { key: SceneFilter; label: string }[] = [
  { key: "all", label: "全部" },
  ...GIFT_SCENES.map((scene) => ({ key: scene as SceneFilter, label: SCENE_LABELS[scene] })),
];

function matchRelation(contact: Contact, filter: RelationFilter): boolean {
  if (filter === "all") return true;
  const tag = contact.relationTag?.trim() ?? "";
  if (filter === "其他") {
    return !RELATION_PRESETS.includes(tag as (typeof RELATION_PRESETS)[number]);
  }
  return tag === filter;
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
  return (
    <div className="filter-bar">
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
  );
}
