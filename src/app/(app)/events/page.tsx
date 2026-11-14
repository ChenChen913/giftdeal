"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EventDialog } from "@/components/event-dialog";
import { Icon } from "@/components/icons";
import { useLedger, usePrivacy } from "@/components/providers";
import { Empty, LoadingBlock } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate, SCENE_TONE } from "@/lib/format";
import type { LifeEvent, PageResult } from "@/lib/types";

export default function EventsPage() {
  const { ledgerId, overview } = useLedger();
  const { money, note: maskNote } = usePrivacy();

  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    if (!ledgerId) return;
    setLoading(true);
    try {
      const data = await api<PageResult<LifeEvent>>("/api/v1/events?pageSize=100", {
        ledgerId,
      });
      setEvents(data.items);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [ledgerId]);

  useEffect(() => {
    void load();
  }, [load, overview?.recordCount]);

  const stats = useMemo(() => {
    const received = events.reduce((sum, item) => sum + item.summary.receivedTotalCents, 0);
    const records = events.reduce((sum, item) => sum + item.summary.recordCount, 0);
    return {
      count: events.length,
      received,
      records,
      average: events.length > 0 ? Math.round(received / events.length) : 0,
    };
  }, [events]);

  return (
    <div className="page">
      <div className="ledger-head">
        <div>
          <h1>人生大事</h1>
          <div className="caption" style={{ marginTop: 2 }}>
            以你为中心的时间线 · 每一场事收了多少、都有谁来了
          </div>
        </div>
        <div className="ledger-head-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setDialogOpen(true)}
          >
            <Icon name="plus" size={16} />
            记一件大事
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card tone-received">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--primary-container)" }} />
            已记录
          </div>
          <div className="stat-value" style={{ color: "var(--primary)" }}>
            {stats.count}
            <span style={{ fontSize: 14, marginLeft: 4, color: "var(--ink-3)" }}>件</span>
          </div>
          <div className="stat-foot">婚礼、满月、寿宴……</div>
        </div>

        <div className="stat-card tone-given">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--secondary)" }} />
            累计收礼
          </div>
          <div className="stat-value" style={{ color: "var(--secondary)" }}>
            {money(stats.received)}
          </div>
          <div className="stat-foot">共 {stats.records} 笔礼金</div>
        </div>

        <div className="stat-card tone-net">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--tertiary)" }} />
            平均每场
          </div>
          <div className="stat-value">{money(stats.average)}</div>
          <div className="stat-foot">按已记录的事计算</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="section-title">时间线</h2>
          <span className="caption">{events.length} 件</span>
        </div>

        {loading ? (
          <LoadingBlock rows={4} />
        ) : events.length === 0 ? (
          <Empty
            icon="sparkle"
            title="还没有记下任何人生大事"
            desc="把婚礼、孩子满月、长辈寿宴记下来，日后就能看到这一场收了多少、都有谁参与。"
            action={
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setDialogOpen(true)}
              >
                记第一件大事
              </button>
            }
          />
        ) : (
          <div className="card-body">
            <div className="timeline">
              {events.map((event) => (
                <div key={event.id} className="tl-item">
                  <span className="tl-dot received" />
                  <Link
                    href={`/events/${event.id}`}
                    className="tl-card"
                    style={{ display: "block" }}
                  >
                    <div className="tl-top">
                      <span className={`chip ${SCENE_TONE[event.scene]}`}>
                        {event.sceneLabel}
                      </span>
                      <span>{formatDate(event.occurredAt)}</span>
                      {event.location ? <span>· {event.location}</span> : null}
                    </div>

                    <div className="tl-title">
                      <strong>{event.title}</strong>
                      <span className="tl-amount" style={{ color: "var(--primary)" }}>
                        {money(event.summary.receivedTotalCents)}
                      </span>
                    </div>

                    <div className="caption" style={{ marginTop: 6 }}>
                      {event.summary.recordCount} 笔礼金 ·{" "}
                      {event.summary.participantCount} 位亲友参与
                      {event.summary.maxReceivedCents > 0
                        ? ` · 最大一笔 ${money(event.summary.maxReceivedCents)}`
                        : ""}
                    </div>

                    {event.note ? (
                      <div className="caption" style={{ marginTop: 4 }}>
                        {maskNote(event.note)}
                      </div>
                    ) : null}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="notice">
        <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
        <span>
          记礼金时可以选择挂到某场大事下。这样一场婚礼收的几十笔会自动汇总成一张单子，
          而不是散落在各个亲友名下。
        </span>
      </div>

      <EventDialog
        open={dialogOpen}
        event={null}
        ledgerId={ledgerId ?? ""}
        onClose={() => setDialogOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
