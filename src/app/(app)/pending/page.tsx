"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { useLedger, useToast, usePrivacy } from "@/components/providers";
import { useRecordDialog } from "@/components/record-dialog";
import { Avatar, Empty, LoadingBlock, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import {formatDate, SCENE_TONE} from "@/lib/format";
import type { PendingItem, PendingResult } from "@/lib/types";

type SortKey = "oldest" | "amount";

export default function PendingPage() {
  const { ledgerId, overview } = useLedger();
  const { toast } = useToast();
  const { open: openRecord } = useRecordDialog();
  const { money, person, note: maskNote } = usePrivacy();

  const [items, setItems] = useState<PendingItem[]>([]);
  const [summary, setSummary] = useState({ totalCount: 0, totalCents: 0 });
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>("oldest");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ledgerId) return;
    setLoading(true);
    try {
      const data = await api<PendingResult>("/api/v1/pending-returns?pageSize=500", { ledgerId });
      setItems(data.items);
      setSummary(data.summary);
      setTruncated(data.total > data.items.length);
    } catch {
      // 静默失败，页面保持空态
    } finally {
      setLoading(false);
    }
  }, [ledgerId]);

  useEffect(() => {
    void load();
  }, [load, overview?.recordCount]);

  const sorted = useMemo(() => {
    const list = [...items];
    if (sort === "amount") list.sort((a, b) => b.amountCents - a.amountCents);
    else list.sort((a, b) => b.daysSince - a.daysSince);
    return list;
  }, [items, sort]);

  const settle = async (record: PendingItem) => {
    setBusyId(record.id);
    try {
      await api(`/api/v1/records/${record.id}/settle`, { method: "POST", ledgerId });
      toast(`已标记「${person(record.contact.name)}」这笔收礼为已还`);
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "操作失败", "error");
    } finally {
      setBusyId(null);
    }
  };

  const oldest = items.reduce((max, item) => Math.max(max, item.daysSince), 0);
  const avg = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.daysSince, 0) / items.length)
    : 0;

  return (
    <div className="page">
      <div className="ledger-head">
        <div>
          <h1>待回礼清单</h1>
          <div className="caption" style={{ marginTop: 2 }}>
            礼数未结 · 敬意尚存，专治「来而不往非礼也」
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card tone-received">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--primary-container)" }} />
            待还礼笔数
          </div>
          <div className="stat-value" style={{ color: "var(--primary)" }}>
            {summary.totalCount}
            <span style={{ fontSize: 14, marginLeft: 4, color: "var(--ink-3)" }}>笔</span>
          </div>
          <div className="stat-foot">均已收到礼金、尚未回礼</div>
        </div>

        <div className="stat-card tone-given">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--secondary)" }} />
            预估待还礼金
          </div>
          <div className="stat-value" style={{ color: "var(--secondary)" }}>
            {money(summary.totalCents)}
          </div>
          <div className="stat-foot">按历史受礼本金合计</div>
        </div>

        <div className="stat-card tone-net">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--tertiary)" }} />
            待还时长
          </div>
          <div className="stat-value">{oldest} 天</div>
          <div className="stat-foot">
            最久一笔距今 {oldest} 天 · 平均 {avg} 天
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="section-title">待回礼明细</h2>
          <span className="caption">
            {summary.totalCount} 笔{truncated ? "（仅显示前 500 笔）" : ""}
          </span>
          <div className="tabs" style={{ marginLeft: "auto" }}>
            <button
              type="button"
              className={`tab ${sort === "oldest" ? "on" : ""}`}
              onClick={() => setSort("oldest")}
            >
              最久优先
            </button>
            <button
              type="button"
              className={`tab ${sort === "amount" ? "on" : ""}`}
              onClick={() => setSort("amount")}
            >
              金额优先
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingBlock rows={5} />
        ) : sorted.length === 0 ? (
          <Empty
            icon="check"
            title="人情往来皆已结清"
            desc="暂时没有待回礼的记录，往来清清楚楚。"
          />
        ) : (
          sorted.map((record) => (
            <div key={record.id} className="pending-row">
              <div className="pending-avatar">
                <Avatar name={person(record.contact.name)} size="md" />
              </div>

              <div className="pending-main">
                <div className="row row-wrap" style={{ gap: 6 }}>
                  <Link href={`/contacts/${record.contactId}`} className="contact-name">
                    {person(record.contact.name)}
                  </Link>
                  {record.contact.relationTag ? (
                    <span className="chip chip-neutral">{record.contact.relationTag}</span>
                  ) : null}
                  <span className={`chip ${SCENE_TONE[record.scene]}`}>{record.sceneLabel}</span>
                </div>
                <div className="pending-reason">
                  待回缘由：{formatDate(record.occurredAt)}
                  {record.note ? ` · ${maskNote(record.note)}` : ""} · 距今 {record.daysSince} 天
                </div>
              </div>

              <div className="pending-amount-col">
                <div className="caption">对方随礼</div>
                <div className="pending-amount" style={{ color: "var(--primary)" }}>
                  {money(record.amountCents)}
                </div>
              </div>

              <div className="pending-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busyId === record.id}
                  onClick={() => settle(record)}
                >
                  {busyId === record.id ? <Spinner /> : <Icon name="check" size={13} />}
                  标记已还
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    openRecord({
                      direction: "GIVEN",
                      contactId: record.contactId,
                      settlesRecordId: record.id,
                    })
                  }
                >
                  <Icon name="arrowRight" size={13} />
                  去记一笔还礼
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="notice">
        <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
        <span>
          温和礼俗提示：标记为「已还」不会从历史账簿删除原始收礼数据，仅解除待还状态，并自动计入收支对账平衡表。
        </span>
      </div>
    </div>
  );
}
