"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { ContactFilters, useContactFilter } from "@/components/contact-filters";
import { useLedger, usePrivacy } from "@/components/providers";
import { useRecordDialog } from "@/components/record-dialog";
import { Avatar, Donut, Empty, LoadingBlock } from "@/components/ui";
import { api } from "@/lib/api";
import {formatDate, netStance, SCENE_COLORS, SCENE_TONE} from "@/lib/format";
import type { Contact, LifeEvent, PageResult, PendingItem, PendingResult, Plan } from "@/lib/types";

type SortKey = "recent" | "pending" | "net";

/** 首页往来册每次渲染的条数，避免几百位亲友一次性铺开 */
const CONTACTS_PAGE_SIZE = 30;

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "最近往来" },
  { key: "pending", label: "待回礼优先" },
  { key: "net", label: "差额排序" },
];

export default function DashboardPage() {
  const { ledgerId, currentLedger, overview } = useLedger();
  const { open: openRecord } = useRecordDialog();
  const { money, person, note: maskNote } = usePrivacy();

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactTotal, setContactTotal] = useState(0);
  const [contactsTruncated, setContactsTruncated] = useState(false);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [visibleCount, setVisibleCount] = useState(CONTACTS_PAGE_SIZE);

  useEffect(() => {
    if (!ledgerId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      api<PageResult<Contact>>("/api/v1/contacts?pageSize=500&sort=recent", { ledgerId }),
      api<PendingResult>("/api/v1/pending-returns?pageSize=3", { ledgerId }),
      api<PageResult<Plan>>("/api/v1/plans?status=PLANNED&pageSize=3", { ledgerId }),
      api<PageResult<LifeEvent>>("/api/v1/events?pageSize=3", { ledgerId }),
    ])
      .then(([contactPage, pendingPage, planPage, eventPage]) => {
        if (cancelled) return;
        setContacts(contactPage.items);
        setContactTotal(contactPage.total);
        setContactsTruncated(contactPage.truncated ?? false);
        setPending(pendingPage.items);
        setPlans(planPage.items);
        setEvents(eventPage.items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ledgerId, overview?.recordCount, overview?.planCount]);

  const {
    relation,
    setRelation,
    stance: stanceFilter,
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
      list.sort(
        (a, b) =>
          b.stats.unsettledReceivedCount - a.stats.unsettledReceivedCount ||
          (b.stats.lastRecordAt ?? "").localeCompare(a.stats.lastRecordAt ?? ""),
      );
    } else {
      list.sort((a, b) => b.stats.netCents - a.stats.netCents);
    }

    return list;
  }, [byFilter, query, sort]);

  // 筛选、搜索或排序变化时回到第一页
  useEffect(() => {
    setVisibleCount(CONTACTS_PAGE_SIZE);
  }, [query, sort, relation, stanceFilter, scene, timing]);

  const stance = overview ? netStance(overview.netCents) : null;
  const flow = overview ? overview.givenTotalCents + overview.receivedTotalCents : 0;
  const givenPct = overview && flow ? Math.round((overview.givenTotalCents / flow) * 100) : 0;
  const receivedPct = flow ? 100 - givenPct : 0;

  const donutItems = useMemo(() => {
    const breakdown = overview?.sceneBreakdown ?? [];
    const top = breakdown.slice(0, 4).map((item) => ({
      label: item.sceneLabel,
      value: item.totalCents,
      color: SCENE_COLORS[item.scene],
      count: item.count,
    }));
    const rest = breakdown.slice(4);
    if (rest.length > 0) {
      top.push({
        label: "其他",
        value: rest.reduce((sum, item) => sum + item.totalCents, 0),
        color: "#cbbfb3",
        count: rest.reduce((sum, item) => sum + item.count, 0),
      });
    }
    return top;
  }, [overview]);

  const firstPending = pending[0];

  return (
    <div className="page">
      {overview && overview.pendingReturnCount > 0 ? (
        <div className="banner">
          <div className="banner-mark">
            <Icon name="gift" size={22} />
          </div>
          <div className="banner-body">
            <div className="banner-title">
              礼尚往还 · 待回礼提醒
              <span className="chip chip-primary">{overview.pendingReturnCount} 笔人情待还</span>
            </div>
            <div className="banner-desc">
              预计需备礼金 {money(overview.pendingReturnCents)}
              {firstPending
                ? ` · 最近一笔：${person(firstPending.contact.name)}（${firstPending.sceneLabel}）${firstPending.daysSince} 天前`
                : ""}
            </div>
          </div>
          <Link href="/pending" className="btn btn-primary btn-sm hide-mobile">
            查看清单
          </Link>
        </div>
      ) : (
        <div className="banner" style={{ borderColor: "var(--hairline)" }}>
          <div className="banner-mark" style={{ background: "var(--secondary)" }}>
            <Icon name="check" size={22} />
          </div>
          <div className="banner-body">
            <div className="banner-title">人情往来皆已结清</div>
            <div className="banner-desc">账本里没有待回礼的记录，往来清清楚楚。</div>
          </div>
        </div>
      )}

      <div className="ledger-head">
        <div>
          <h1>{currentLedger?.name ?? "我的礼金账本"}</h1>
          <div className="caption" style={{ marginTop: 2 }}>
            纪事存礼 · 尚往来之道
          </div>
        </div>
        <div className="ledger-head-actions">
          <button type="button" className="btn btn-primary" onClick={() => openRecord()}>
            <Icon name="plus" size={16} />
            记一笔礼金
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card tone-given">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--secondary)" }} />
            累计送出（礼金出账）
            <span className="chip chip-secondary">{overview?.givenCount ?? 0} 笔</span>
          </div>
          <div className="stat-value" style={{ color: "var(--secondary)" }}>
            {money(overview?.givenTotalCents ?? 0)}
          </div>
          <div className="stat-foot">占往来总额 {givenPct}%</div>
        </div>

        <div className="stat-card tone-received">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--primary-container)" }} />
            累计收到（随礼入账）
            <span className="chip chip-primary">{overview?.receivedCount ?? 0} 笔</span>
          </div>
          <div className="stat-value" style={{ color: "var(--primary)" }}>
            {money(overview?.receivedTotalCents ?? 0)}
          </div>
          <div className="stat-foot">占往来总额 {receivedPct}%</div>
        </div>

        <div className="stat-card tone-net">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--tertiary)" }} />
            人情往还总态势
            {stance ? <span className="chip chip-neutral">{stance.title}</span> : null}
          </div>
          <div className="stat-value">{money(overview?.netCents ?? 0)}</div>
          <div className="stat-foot">
            <Icon name="info" size={13} />
            {stance?.hint ?? "—"}
          </div>
        </div>
      </div>

      {plans.length > 0 ? (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-head">
            <h2 className="section-title">人情预备</h2>
            <span className="caption">
              {overview?.planCount ?? plans.length} 笔待办 · 预计{" "}
              {money(overview?.planCents ?? 0)}
            </span>
            <Link href="/plans" className="btn btn-quiet btn-sm" style={{ marginLeft: "auto" }}>
              查看全部
              <Icon name="chevronRight" size={14} />
            </Link>
          </div>

          <div className="plan-strip">
            {plans.map((plan) => (
              <Link key={plan.id} href="/plans" className="plan-mini">
                <div className="row" style={{ gap: 10 }}>
                  <Avatar name={person(plan.contact.name)} size="sm" />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="title-sm" style={{ fontSize: 13 }}>
                        {person(plan.contact.name)}
                      </span>
                      <span className={`chip ${SCENE_TONE[plan.scene]}`} style={{ height: 18 }}>
                        {plan.sceneLabel}
                      </span>
                    </div>
                    <div className="caption" style={{ marginTop: 2 }}>
                      {plan.note ? `${maskNote(plan.note)} · ` : ""}
                      {formatDate(plan.expectedAt)}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div className="mono" style={{ fontSize: 14 }}>
                      {money(plan.plannedCents)}
                    </div>
                    <div
                      className="caption"
                      style={{
                        color: plan.daysUntil < 0 ? "var(--amber)" : "var(--ink-4)",
                      }}
                    >
                      {plan.daysUntil === 0
                        ? "就是今天"
                        : plan.daysUntil > 0
                          ? `${plan.daysUntil} 天后`
                          : `已过 ${-plan.daysUntil} 天`}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {events.length > 0 ? (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-head">
            <h2 className="section-title">人生大事</h2>
            <span className="caption">{overview?.eventCount ?? events.length} 件</span>
            <Link href="/events" className="btn btn-quiet btn-sm" style={{ marginLeft: "auto" }}>
              查看全部
              <Icon name="chevronRight" size={14} />
            </Link>
          </div>

          <div className="plan-strip">
            {events.map((event) => (
              <Link key={event.id} href={`/events/${event.id}`} className="plan-mini">
                <div className="row" style={{ gap: 10 }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className="title-sm" style={{ fontSize: 13 }}>
                        {event.title}
                      </span>
                      <span
                        className={`chip ${SCENE_TONE[event.scene]}`}
                        style={{ height: 18 }}
                      >
                        {event.sceneLabel}
                      </span>
                    </div>
                    <div className="caption" style={{ marginTop: 2 }}>
                      {formatDate(event.occurredAt)} · {event.summary.participantCount} 位亲友
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div className="mono" style={{ fontSize: 14 }}>
                      {money(event.summary.receivedTotalCents)}
                    </div>
                    <div className="caption">收礼</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="dash-grid">
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-head">
            <h2 className="section-title">亲友往来册</h2>
            <span className="caption">
              {filtered.length} 位亲友
              {contactsTruncated ? ` · 共 ${contactTotal} 位，仅加载最近 500 位` : ""}
            </span>
            <Link href="/contacts" className="btn btn-quiet btn-sm" style={{ marginLeft: "auto" }}>
              全部对账
              <Icon name="chevronRight" size={14} />
            </Link>
          </div>

          <div style={{ padding: "12px 16px 10px" }}>
            <div className="toolbar">
              <div className="search-box">
                <span className="icon">
                  <Icon name="search" size={16} />
                </span>
                <input
                  className="input"
                  placeholder="搜索亲友姓名、称谓…"
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
            </div>

            <div style={{ marginTop: 10 }}>
              <ContactFilters
                relation={relation}
                stance={stanceFilter}
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
          </div>

          {loading ? (
            <LoadingBlock rows={4} />
          ) : filtered.length === 0 ? (
            <Empty
              icon="users"
              title={query ? "没有匹配的亲友" : "账本里还没有亲友"}
              desc={query ? "换个关键词试试" : "记第一笔往来时顺手建一位亲友即可"}
              action={
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openRecord()}>
                  记一笔
                </button>
              }
            />
          ) : (
            <div>
              {filtered.slice(0, visibleCount).map((contact) => (
                <Link key={contact.id} href={`/contacts/${contact.id}`} className="contact-row">
                  <Avatar name={person(contact.name)} size="md" />
                  <div className="contact-main">
                    <div className="contact-name-line">
                      <span className="contact-name">{person(contact.name)}</span>
                      {contact.relationTag ? (
                        <span className="chip chip-neutral">{contact.relationTag}</span>
                      ) : null}
                      {contact.stats.unsettledReceivedCount > 0 ? (
                        <span className="chip chip-primary hide-mobile">待回礼</span>
                      ) : null}
                      {contact.stats.planCount > 0 ? (
                        <span className="chip chip-amber hide-mobile">
                          预备 {contact.stats.planCount} 笔
                        </span>
                      ) : null}
                    </div>
                    <div className="contact-meta">
                      {contact.stats.recordCount > 0
                        ? `最近往来 ${formatDate(contact.stats.lastRecordAt)} · 共 ${contact.stats.recordCount} 笔`
                        : "暂无往来记录"}
                    </div>
                  </div>
                  <div className="contact-net">
                    <span
                      className="contact-net-value"
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
                    <span className="contact-net-hint">
                      {contact.stats.netCents > 0
                        ? "我方待回礼"
                        : contact.stats.netCents < 0
                          ? "对方欠人情"
                          : "往来平衡"}
                    </span>
                  </div>
                  <Icon name="chevronRight" size={16} style={{ color: "var(--ink-4)" }} />
                </Link>
              ))}

              {visibleCount < filtered.length ? (
                <div style={{ padding: "12px 16px 16px", textAlign: "center" }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setVisibleCount((count) => count + CONTACTS_PAGE_SIZE)}
                  >
                    显示更多（还有 {filtered.length - visibleCount} 位）
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="dash-side">
          <div className="card card-pad">
            <div className="row between" style={{ marginBottom: 14 }}>
              <h3 className="title-sm">礼俗场景分布</h3>
              <span className="caption">全账簿</span>
            </div>

            {donutItems.length === 0 ? (
              <div className="empty" style={{ padding: "20px 0" }}>
                <span className="empty-desc">还没有记录，分布图会随记账自动生成</span>
              </div>
            ) : (
              <div className="donut-wrap">
                <Donut
                  items={donutItems}
                  centerValue={String(overview?.recordCount ?? 0)}
                  centerLabel="笔往来"
                />
                <div className="legend">
                  {donutItems.map((item) => (
                    <div key={item.label} className="legend-row">
                      <span className="legend-swatch" style={{ background: item.color }} />
                      <span className="legend-name">{item.label}</span>
                      <span className="legend-value">{money(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="quote-card">
            <div className="row" style={{ gap: 6, marginBottom: 8 }}>
              <Icon name="sparkle" size={15} style={{ color: "var(--amber)" }} />
              <span className="title-sm" style={{ fontSize: 13 }}>
                人情往还随行锦囊
              </span>
            </div>
            <p className="quote-text">
              <em>“礼尚往来。往而不来，非礼也；来而不往，亦非礼也。”</em>
              <br />
              随礼本为心意连结，宜遵古风，兼顾亲疏家境。喜庆宜取双数，白事忌用双数。
            </p>
            <div className="quote-source">——《礼记·曲礼上》</div>
          </div>

          <Link href="/ledger" className="card card-pad" style={{ display: "block" }}>
            <div className="row">
              <span
                className="avatar avatar-sm avatar-tone-1"
                style={{ borderRadius: 10 }}
                aria-hidden="true"
              >
                <Icon name="users" size={15} />
              </span>
              <div className="grow">
                <div className="title-sm">共管家庭账簿</div>
                <div className="caption">
                  {currentLedger?.memberCount ?? 1} 位家人共同维护 · 实时同步
                </div>
              </div>
              <Icon name="chevronRight" size={16} style={{ color: "var(--ink-4)" }} />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
