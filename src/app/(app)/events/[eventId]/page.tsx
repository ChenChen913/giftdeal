"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { EventDialog } from "@/components/event-dialog";
import { Icon } from "@/components/icons";
import { useLedger, usePrivacy, useToast } from "@/components/providers";
import { Empty, LoadingBlock, Modal, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, SCENE_TONE } from "@/lib/format";
import type { EventDetail } from "@/lib/types";

export default function EventDetailPage() {
  const params = useParams<{ eventId: string }>();
  const eventId = params?.eventId ?? "";
  const router = useRouter();
  const { ledgerId, overview, refresh } = useLedger();
  const { money, person, note: maskNote } = usePrivacy();
  const { toast } = useToast();

  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!ledgerId || !eventId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<EventDetail>(`/api/v1/events/${eventId}`, { ledgerId });
      setDetail(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [ledgerId, eventId]);

  useEffect(() => {
    void load();
  }, [load, overview?.recordCount]);

  /** 按人汇总：谁在这场事里随了多少、随了几笔 */
  const participants = useMemo(() => {
    if (!detail) return [];
    const map = new Map<string, { id: string; name: string; total: number; count: number }>();
    for (const record of detail.records) {
      const item =
        map.get(record.contactId) ?? {
          id: record.contactId,
          name: record.contact.name,
          total: 0,
          count: 0,
        };
      item.total += record.amountCents;
      item.count += 1;
      map.set(record.contactId, item);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [detail]);

  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/api/v1/events/${eventId}`, { method: "DELETE", ledgerId });
      toast("事件已删除，相关礼金记录保留在账簿里");
      await refresh();
      router.replace("/events");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "删除失败", "error");
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="page">
        <div className="card">
          <LoadingBlock rows={5} />
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="page">
        <div className="card">
          <Empty
            icon="info"
            title="打不开这件大事"
            desc={error ?? "它可能已被删除"}
            action={
              <Link href="/events" className="btn btn-ghost btn-sm">
                返回时间线
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const { event, records } = detail;

  return (
    <div className="page">
      <div className="ledger-head">
        <div>
          <Link
            href="/events"
            className="caption"
            style={{ color: "var(--ink-3)", display: "inline-flex", gap: 4 }}
          >
            ← 返回时间线
          </Link>
          <h1 style={{ marginTop: 6 }}>{event.title}</h1>
          <div className="row row-wrap" style={{ gap: 8, marginTop: 6 }}>
            <span className={`chip ${SCENE_TONE[event.scene]}`}>{event.sceneLabel}</span>
            <span className="caption">{formatDate(event.occurredAt)}</span>
            {event.location ? <span className="caption">· {event.location}</span> : null}
          </div>
        </div>
        <div className="ledger-head-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setEditOpen(true)}
          >
            <Icon name="edit" size={15} />
            编辑
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setDeleteOpen(true)}
          >
            <Icon name="trash" size={15} />
            删除
          </button>
        </div>
      </div>

      {event.note ? (
        <div className="notice">
          <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
          <span>{maskNote(event.note)}</span>
        </div>
      ) : null}

      <div className="stat-grid">
        <div className="stat-card tone-received">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--primary-container)" }} />
            这场收礼
          </div>
          <div className="stat-value" style={{ color: "var(--primary)" }}>
            {money(event.summary.receivedTotalCents)}
          </div>
          <div className="stat-foot">{event.summary.recordCount} 笔礼金</div>
        </div>

        <div className="stat-card tone-given">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--secondary)" }} />
            到场亲友
          </div>
          <div className="stat-value" style={{ color: "var(--secondary)" }}>
            {event.summary.participantCount}
            <span style={{ fontSize: 14, marginLeft: 4, color: "var(--ink-3)" }}>位</span>
          </div>
          <div className="stat-foot">按随礼的人去重</div>
        </div>

        <div className="stat-card tone-net">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--tertiary)" }} />
            最大一笔
          </div>
          <div className="stat-value">{money(event.summary.maxReceivedCents)}</div>
          <div className="stat-foot">
            {event.summary.givenTotalCents > 0
              ? `另有送出 ${money(event.summary.givenTotalCents)}`
              : "全部为收到"}
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-head">
            <h2 className="section-title">礼金明细</h2>
            <span className="caption">{records.length} 笔</span>
          </div>

          {records.length === 0 ? (
            <Empty
              icon="gift"
              title="这场事还没有挂礼金记录"
              desc="记一笔礼金时选择这件事，就会自动汇总到这里。"
              action={
                <Link href="/" className="btn btn-primary btn-sm">
                  去记一笔
                </Link>
              }
            />
          ) : (
            <div className="card-body">
              <div className="timeline">
                {records.map((record) => (
                  <div key={record.id} className="tl-item">
                    <span
                      className={`tl-dot ${record.direction === "GIVEN" ? "given" : "received"}`}
                    />
                    <div className="tl-card">
                      <div className="tl-top">
                        <span className={`chip ${SCENE_TONE[record.scene]}`}>
                          {record.sceneLabel}
                        </span>
                        <span>
                          {record.direction === "GIVEN" ? "我方送出" : "对方随礼"}
                        </span>
                        <span>· {formatDate(record.occurredAt)}</span>
                      </div>
                      <div className="tl-title">
                        <strong>{person(record.contact.name)}</strong>
                        <span
                          className="tl-amount"
                          style={{
                            color:
                              record.direction === "GIVEN"
                                ? "var(--secondary)"
                                : "var(--primary)",
                          }}
                        >
                          {record.direction === "GIVEN" ? "-" : "+"}
                          {money(record.amountCents)}
                        </span>
                      </div>
                      {record.note ? (
                        <div className="caption" style={{ marginTop: 4 }}>
                          {maskNote(record.note)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="dash-side">
          <div className="card card-pad">
            <div className="row between" style={{ marginBottom: 12 }}>
              <h3 className="title-sm">随礼人排行</h3>
              <span className="caption">{participants.length} 位</span>
            </div>

            {participants.length === 0 ? (
              <p className="caption">还没有礼金记录。</p>
            ) : (
              <div className="col" style={{ gap: 10 }}>
                {participants.slice(0, 10).map((item, index) => (
                  <div key={item.id} className="row" style={{ gap: 8 }}>
                    <span
                      className="caption mono"
                      style={{ width: 18, color: "var(--ink-4)" }}
                    >
                      {index + 1}
                    </span>
                    <Link
                      href={`/contacts/${item.id}`}
                      className="grow"
                      style={{ fontSize: 13 }}
                    >
                      {person(item.name)}
                    </Link>
                    <span className="caption">{item.count} 笔</span>
                    <span className="mono" style={{ fontSize: 13 }}>
                      {money(item.total)}
                    </span>
                  </div>
                ))}
                {participants.length > 10 ? (
                  <span className="caption">仅显示前 10 位</span>
                ) : null}
              </div>
            )}
          </div>

          <div className="quote-card">
            <div className="row" style={{ gap: 6, marginBottom: 8 }}>
              <Icon name="sparkle" size={15} style={{ color: "var(--amber)" }} />
              <span className="title-sm" style={{ fontSize: 13 }}>
                这场事的意义
              </span>
            </div>
            <p className="quote-text">
              礼金是一时的数字，到场的人才是这场事真正的分量。
              隔几年回头看，记得住的是谁来了，而不是收了多少。
            </p>
          </div>
        </div>
      </div>

      <EventDialog
        open={editOpen}
        event={event}
        ledgerId={ledgerId ?? ""}
        onClose={() => setEditOpen(false)}
        onSaved={() => void load()}
      />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除这件大事？"
        subtitle="礼金记录不会被删除，只是不再归到这件事下"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary grow"
              onClick={remove}
              disabled={deleting}
            >
              {deleting ? <Spinner /> : <Icon name="trash" size={15} />}
              确认删除
            </button>
          </>
        }
      >
        <div className="notice">
          <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
          <span>
            删除后，这场事下的 {records.length} 笔礼金会解除关联，仍然保留在账簿与对账里。
          </span>
        </div>
      </Modal>
    </div>
  );
}
