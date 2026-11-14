"use client";

import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { CONTACT_GROUPS, CONTACT_GROUP_LABELS, contactGroupLabel } from "@/lib/constants";
import {formatDate, netStance, SCENE_TONE} from "@/lib/format";
import type { Contact, RecordItem, SettlementResponse } from "@/lib/types";
import { Icon } from "./icons";
import { useLedger, useToast, usePrivacy } from "./providers";
import { useRecordDialog } from "./record-dialog";
import { RecordDeleteDialog, RecordEditDialog } from "./record-edit-dialog";
import { Avatar, Empty, LoadingBlock, Modal, Spinner } from "./ui";

/** 时间线每次渲染的条数，避免几百条记录一次性铺开 */
const RECORDS_PAGE_SIZE = 50;

export function ContactDetail({ contactId }: { contactId: string }) {
  const { ledgerId, overview } = useLedger();
  const { toast } = useToast();
  const { money, person, note: maskNote, phone: maskPhoneValue, unlocked, openUnlock } =
    usePrivacy();
  const { open: openRecord } = useRecordDialog();

  const [settlement, setSettlement] = useState<SettlementResponse | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecordItem | null>(null);
  const [deleting, setDeleting] = useState<RecordItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(RECORDS_PAGE_SIZE);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: "", relationTag: "", phone: "", note: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!ledgerId) return;
    setLoading(true);
    setError(null);
    try {
      const [settleData, contactData] = await Promise.all([
        api<SettlementResponse>(`/api/v1/contacts/${contactId}/settlement`, { ledgerId }),
        api<{ contact: Contact }>(`/api/v1/contacts/${contactId}`, { ledgerId }),
      ]);
      setSettlement(settleData);
      setContact(contactData.contact);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [ledgerId, contactId]);

  useEffect(() => {
    void load();
  }, [load, overview?.recordCount]);

  // 换一位亲友时回到第一页
  useEffect(() => {
    setVisibleCount(RECORDS_PAGE_SIZE);
  }, [contactId]);

  const settle = async (record: RecordItem) => {
    setBusyId(record.id);
    try {
      await api(`/api/v1/records/${record.id}/settle`, { method: "POST", ledgerId });
      toast("已标记为结清");
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "操作失败", "error");
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = () => {
    if (!unlocked) {
      openUnlock();
      return;
    }
    if (!contact) return;
    setForm({
      name: contact.name,
      relationTag: contact.relationTag ?? "",
      phone: contact.phone ?? "",
      note: contact.note ?? "",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!form.name.trim()) {
      toast("姓名不能为空", "error");
      return;
    }
    setSaving(true);
    try {
      const result = await api<{ contact: Contact }>(`/api/v1/contacts/${contactId}`, {
        method: "PATCH",
        ledgerId,
        body: {
          name: form.name.trim(),
          relationTag: form.relationTag.trim() || null,
          phone: form.phone.trim() || null,
          note: form.note.trim() || null,
        },
      });
      setContact(result.contact);
      setEditOpen(false);
      toast("亲友档案已更新");
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !settlement) {
    return (
      <div className="card">
        <LoadingBlock rows={5} />
      </div>
    );
  }

  if (error || !settlement) {
    return (
      <div className="card">
        <Empty icon="info" title="无法打开这份对账单" desc={error ?? "亲友不存在或已被删除"} />
      </div>
    );
  }

  const { summary, records } = settlement;
  const visibleRecords = records.slice(0, visibleCount);
  const stance = netStance(summary.netCents);
  const flow = summary.givenTotalCents + summary.receivedTotalCents;
  const givenPct = flow ? Math.round((summary.givenTotalCents / flow) * 100) : 50;

  return (
    <div className="detail">
      <div className="detail-head">
        <Avatar name={person(settlement.contact.name)} size="xl" />
        <div className="grow">
          <div className="row row-wrap" style={{ gap: 8 }}>
            <span className="detail-name">{person(settlement.contact.name)}</span>
            {settlement.contact.relationTag ? (
              <span className="chip chip-neutral">
                {contactGroupLabel(settlement.contact.relationTag)}
              </span>
            ) : null}
            {summary.unsettledReceivedCount > 0 ? (
              <span className="chip chip-primary">待回礼 {summary.unsettledReceivedCount} 笔</span>
            ) : null}
          </div>
          <div className="detail-meta">
            {contact?.phone ? (
              <span className="row" style={{ gap: 4 }}>
                <Icon name="phone" size={13} />
                {maskPhoneValue(contact.phone)}
              </span>
            ) : null}
            {contact?.note ? <span>{maskNote(contact.note)}</span> : null}
            <span>
              首笔 {formatDate(summary.firstOccurredAt)} · 最近 {formatDate(summary.lastOccurredAt)}
            </span>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={openEdit}>
            <Icon name="edit" size={14} />
            <span className="hide-mobile">编辑</span>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => openRecord({ contactId })}
          >
            <Icon name="plus" size={14} />
            记一笔
          </button>
        </div>
      </div>

      <div className={`net-panel tone-${stance.tone}`}>
        <div style={{ minWidth: 190 }}>
          <div className="caption">双向人情净差额</div>
          <div
            className="net-value"
            style={{
              color:
                summary.netCents > 0
                  ? "var(--primary)"
                  : summary.netCents < 0
                    ? "var(--secondary)"
                    : "var(--ink)",
            }}
          >
            {summary.netCents >= 0 ? "+" : "-"}
            {money(Math.abs(summary.netCents))}
          </div>
          <div className="row" style={{ gap: 6, marginTop: 6 }}>
            <span className="chip chip-ghost">{stance.title}</span>
            <span className="caption">
              {summary.receivedCount} 收 / {summary.givenCount} 送
            </span>
          </div>
        </div>

        <div className="grow">
          <div className="row between caption">
            <span>我方送出 {givenPct}%</span>
            <span>对方随礼 {100 - givenPct}%</span>
          </div>
          <div className="balance-bar">
            <span style={{ width: `${givenPct}%`, background: "var(--secondary)" }} />
            <span style={{ width: `${100 - givenPct}%`, background: "var(--primary-container)" }} />
          </div>
          <div className="net-copy" style={{ marginTop: 10 }}>
            {stance.hint}
            {summary.unsettledReceivedCents > 0
              ? ` · 尚有 ${money(summary.unsettledReceivedCents)} 收礼未结清`
              : ""}
          </div>
        </div>
      </div>

      <div className="dual-totals">
        <div className="total-card tone-given">
          <div className="row between">
            <span className="caption">我方累计送出</span>
            <span className="caption">{summary.givenCount} 笔</span>
          </div>
          <div className="total-value" style={{ color: "var(--secondary)" }}>
            {money(summary.givenTotalCents)}
          </div>
        </div>
        <div className="total-card tone-received">
          <div className="row between">
            <span className="caption">{person(settlement.contact.name)}累计随礼</span>
            <span className="caption">{summary.receivedCount} 笔</span>
          </div>
          <div className="total-value" style={{ color: "var(--primary)" }}>
            {money(summary.receivedTotalCents)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="section-title">双向往来札记</h2>
          <span className="caption">共 {summary.recordCount} 笔事由</span>
          {settlement.truncated ? (
            <span className="chip chip-amber" style={{ marginLeft: "auto" }}>
              仅显示最近 500 笔
            </span>
          ) : null}
        </div>

        {records.length === 0 ? (
          <Empty icon="gift" title="还没有往来记录" desc="点右上角「记一笔」记下第一笔心意" />
        ) : (
          <div className="card-body">
            <div className="timeline">
              {visibleRecords.map((record) => (
                <div key={record.id} className="tl-item">
                  <span className={`tl-dot ${record.direction === "GIVEN" ? "given" : "received"}`} />
                  <div className="tl-card">
                    <div className="tl-top">
                      <span className={`chip ${SCENE_TONE[record.scene]}`}>{record.sceneLabel}</span>
                      <span>{record.direction === "GIVEN" ? "我方送出" : "对方随礼"}</span>
                      <span>· {formatDate(record.occurredAt)}</span>
                      {record.direction === "RECEIVED" ? (
                        record.isSettled ? (
                          <span className="chip chip-ghost" style={{ marginLeft: "auto" }}>
                            已结清
                          </span>
                        ) : (
                          <span className="chip chip-primary" style={{ marginLeft: "auto" }}>
                            待回礼
                          </span>
                        )
                      ) : null}
                    </div>

                    <div className="tl-title">
                      <strong>{record.note ? maskNote(record.note) : record.sceneLabel}</strong>
                      <span
                        className="tl-amount"
                        style={{
                          color:
                            record.direction === "GIVEN" ? "var(--secondary)" : "var(--primary)",
                        }}
                      >
                        {record.direction === "GIVEN" ? "-" : "+"}
                        {money(record.amountCents)}
                      </span>
                    </div>

                    <div className="row" style={{ marginTop: 8, gap: 8 }}>
                      {record.direction === "RECEIVED" && !record.isSettled ? (
                        <>
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
                            className="btn btn-quiet btn-sm"
                            onClick={() =>
                              openRecord({
                                direction: "GIVEN",
                                contactId,
                                settlesRecordId: record.id,
                              })
                            }
                          >
                            去记一笔还礼
                          </button>
                        </>
                      ) : null}

                      <div className="row" style={{ marginLeft: "auto", gap: 2 }}>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: 28, height: 28 }}
                          title="编辑这笔礼金"
                          aria-label="编辑这笔礼金"
                          onClick={() => setEditing(record)}
                        >
                          <Icon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          style={{ width: 28, height: 28 }}
                          title="删除这笔礼金"
                          aria-label="删除这笔礼金"
                          onClick={() => setDeleting(record)}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {visibleCount < records.length ? (
              <div style={{ paddingTop: 12, textAlign: "center" }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setVisibleCount((count) => count + RECORDS_PAGE_SIZE)}
                >
                  加载更早的记录（还有 {records.length - visibleCount} 笔）
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="编辑亲友档案"
        subtitle="姓名在同一账本内不可重复"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary grow"
              onClick={saveEdit}
              disabled={saving}
            >
              {saving ? <Spinner /> : <Icon name="check" size={15} />}
              保存
            </button>
          </>
        }
      >
        <div className="field">
          <span className="label">姓名</span>
          <input
            className="input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <div className="field grow">
            <span className="label">分组</span>
            <select
              className="select"
              value={form.relationTag}
              onChange={(event) => setForm({ ...form, relationTag: event.target.value })}
            >
              <option value="">未分组</option>
              {CONTACT_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {CONTACT_GROUP_LABELS[group]}
                </option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <span className="label">手机号</span>
            <input
              className="input"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </div>
        </div>
        <div className="field">
          <span className="label">备注</span>
          <textarea
            className="textarea"
            placeholder="如：二舅、大学室友"
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
          />
        </div>
      </Modal>

      <RecordEditDialog
        record={editing}
        ledgerId={ledgerId ?? ""}
        onClose={() => setEditing(null)}
        onChanged={() => void load()}
      />

      <RecordDeleteDialog
        record={deleting}
        ledgerId={ledgerId ?? ""}
        onClose={() => setDeleting(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}
