"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import {formatDate} from "@/lib/format";
import type { Contact, PageResult } from "@/lib/types";
import { ContactFilters, useContactFilter } from "./contact-filters";
import { useLedger, usePrivacy } from "./providers";
import { Avatar, Empty, LoadingBlock } from "./ui";
import { Icon } from "./icons";

type SortKey = "recent" | "pending" | "net";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "最近往来" },
  { key: "pending", label: "待回礼" },
  { key: "net", label: "差额" },
];

export function ContactList({ activeId }: { activeId?: string }) {
  const { ledgerId, overview } = useLedger();
  const { money, person, note: maskNote } = usePrivacy();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactTotal, setContactTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    if (!ledgerId) return;
    let cancelled = false;
    setLoading(true);
    api<PageResult<Contact>>("/api/v1/contacts?pageSize=500&sort=recent", { ledgerId })
      .then((data) => {
        if (cancelled) return;
        setContacts(data.items);
        setContactTotal(data.total);
        setTruncated(data.truncated ?? false);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ledgerId, overview?.recordCount]);

  const {
    relation,
    setRelation,
    stance,
    setStance,
    scene,
    setScene,
    timing,
    setTiming,
    filtered: byFilter,
    counts,
    timingCounts,
  } = useContactFilter(contacts);

  const filtered = useMemo(() => {
    const keyword = query.trim();
    const list = keyword
      ? byFilter.filter(
          (item) => item.name.includes(keyword) || (item.relationTag ?? "").includes(keyword),
        )
      : [...byFilter];

    if (sort === "recent") {
      list.sort(
        (a, b) =>
          (b.stats.lastRecordAt ?? "").localeCompare(a.stats.lastRecordAt ?? "") ||
          b.stats.recordCount - a.stats.recordCount,
      );
    } else if (sort === "pending") {
      list.sort((a, b) => b.stats.unsettledReceivedCount - a.stats.unsettledReceivedCount);
    } else {
      list.sort((a, b) => b.stats.netCents - a.stats.netCents);
    }
    return list;
  }, [byFilter, query, sort]);

  return (
    <div className="list-panel">
      <div className="list-panel-head">
        <div className="row between">
          <span className="title-sm">亲友名录</span>
          <span className="caption">
            {filtered.length} 位
            {truncated ? `（共 ${contactTotal} 位，仅加载最近 500 位）` : ""}
          </span>
        </div>
        <div className="search-box">
          <span className="icon">
            <Icon name="search" size={16} />
          </span>
          <input
            className="input"
            placeholder="搜索亲友、称谓…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="tabs">
          {SORTS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`tab ${sort === item.key ? "on" : ""}`}
              onClick={() => setSort(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <ContactFilters
          relation={relation}
          stance={stance}
          scene={scene}
          onRelation={setRelation}
          onStance={setStance}
          onScene={setScene}
          timing={timing}
          onTiming={setTiming}
          counts={counts}
          timingCounts={timingCounts}
        />
      </div>

      <div className="list-scroll">
        {loading ? (
          <LoadingBlock rows={6} />
        ) : filtered.length === 0 ? (
          <Empty icon="users" title="没有匹配的亲友" desc="换个关键词，或先记一笔往来" />
        ) : (
          filtered.map((contact) => (
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
              className={`person-row ${contact.id === activeId ? "active" : ""}`}
            >
              <Avatar name={person(contact.name)} size="md" />
              <div className="person-main">
                <div className="person-name-line">
                  <span className="person-name">{person(contact.name)}</span>
                  {contact.stats.unsettledReceivedCount > 0 ? (
                    <span className="chip chip-primary chip-xs">待回礼</span>
                  ) : null}
                  {contact.stats.planCount > 0 ? (
                    <span className="chip chip-amber chip-xs">预备 {contact.stats.planCount}</span>
                  ) : null}
                </div>
                <div className="person-sub">
                  {contact.relationTag ?? "亲友"} ·{" "}
                  {contact.stats.recordCount > 0
                    ? `双向往来 ${contact.stats.recordCount} 笔`
                    : "暂无往来"}
                </div>
                <div className="person-sub">{formatDate(contact.stats.lastRecordAt)}</div>
              </div>
              <div className="person-side">
                <span
                  className="person-amount"
                  style={{
                    color:
                      contact.stats.netCents > 0
                        ? "var(--primary)"
                        : contact.stats.netCents < 0
                          ? "var(--secondary)"
                          : "var(--ink-3)",
                  }}
                >
                  {money(contact.stats.netCents)}
                </span>
                <span className="caption">
                  {contact.stats.netCents > 0
                    ? "待回礼"
                    : contact.stats.netCents < 0
                      ? "对方多"
                      : "平衡"}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
