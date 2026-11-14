"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Icon } from "@/components/icons";
import { PlanDialog, fetchContacts } from "@/components/plan-dialog";
import { useLedger, useToast, usePrivacy } from "@/components/providers";
import { Avatar, Empty, LoadingBlock, Modal, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { contactGroupLabel } from "@/lib/constants";
import {formatDate, SCENE_TONE} from "@/lib/format";
import type { Contact, PageResult, Plan } from "@/lib/types";

type Tab = "PLANNED" | "DONE";
type DialogState = { open: boolean; mode: "create" | "edit" | "complete"; plan: Plan | null };

function countdownLabel(days: number): string {
  if (days === 0) return "就是今天";
  if (days > 0) return `还有 ${days} 天`;
  return `已过 ${-days} 天`;
}

export default function PlansPage() {
  const { ledgerId, overview, refresh } = useLedger();
  const { toast } = useToast();
  const { money, person, note: maskNote, unlocked, openUnlock } = usePrivacy();

  const [tab, setTab] = useState<Tab>("PLANNED");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<DialogState>({ open: false, mode: "create", plan: null });
  const [removing, setRemoving] = useState<Plan | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!ledgerId) return;
    setLoading(true);
    try {
      const data = await api<PageResult<Plan>>(`/api/v1/plans?status=${tab}&pageSize=100`, {
        ledgerId,
      });
      setPlans(data.items);
    } catch {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [ledgerId, tab]);

  useEffect(() => {
    void load();
  }, [load, overview?.planCount]);

  useEffect(() => {
    if (!ledgerId) return;
    void fetchContacts(ledgerId)
      .then(setContacts)
      .catch(() => setContacts([]));
  }, [ledgerId]);

  // 统计始终反映「预备中」的全量情况，不随「已完成」页签切换而清零
  /** 修改 / 完成会预填真实金额与姓名，锁定态下先要求二次验证 */
  const openPlanDialog = (mode: "edit" | "complete", plan: Plan) => {
    if (!unlocked) {
      openUnlock();
      return;
    }
    setDialog({ open: true, mode, plan });
  };

  const stats = useMemo(() => {
    const count = overview?.planCount ?? 0;
    const totalCents = overview?.planCents ?? 0;
    const nearest = overview?.nextPlan?.daysUntil ?? null;
    return { count, totalCents, nearest };
  }, [overview?.planCount, overview?.planCents, overview?.nextPlan?.daysUntil]);

  const onSaved = async () => {
    await load();
    await refresh();
  };

  const remove = async () => {
    if (!removing) return;
    setDeleting(true);
    try {
      await api(`/api/v1/plans/${removing.id}`, { method: "DELETE", ledgerId });
      toast("预备已删除");
      setRemoving(null);
      await onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "删除失败", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      <div className="ledger-head">
        <div>
          <h1>人情预备</h1>
          <div className="caption" style={{ marginTop: 2 }}>
            已知未来要办的事，提前把这笔礼金备出来
          </div>
        </div>
        <div className="ledger-head-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setDialog({ open: true, mode: "create", plan: null })}
          >
            <Icon name="plus" size={16} />
            新增预备
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card tone-received">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--primary-container)" }} />
            预备中
          </div>
          <div className="stat-value" style={{ color: "var(--primary)" }}>
            {stats.count}
            <span style={{ fontSize: 14, marginLeft: 4, color: "var(--ink-3)" }}>笔</span>
          </div>
          <div className="stat-foot">还没发生，钱先备着</div>
        </div>

        <div className="stat-card tone-given">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--secondary)" }} />
            预计合计
          </div>
          <div className="stat-value" style={{ color: "var(--secondary)" }}>
            {money(stats.totalCents)}
          </div>
          <div className="stat-foot">按当前预备金额合计</div>
        </div>

        <div className="stat-card tone-net">
          <div className="stat-head">
            <span className="dot" style={{ background: "var(--tertiary)" }} />
            最近一场
          </div>
          <div className="stat-value">
            {stats.nearest === null
              ? "—"
              : stats.nearest === 0
                ? "今天"
                : stats.nearest > 0
                  ? `${stats.nearest} 天后`
                  : `已过 ${-stats.nearest} 天`}
          </div>
          <div className="stat-foot">
            {stats.nearest === null ? "暂无预备中的事" : "按预计日期计算"}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2 className="section-title">预备清单</h2>
          <span className="caption">{plans.length} 笔</span>
          <div className="tabs" style={{ marginLeft: "auto" }}>
            <button
              type="button"
              className={`tab ${tab === "PLANNED" ? "on" : ""}`}
              onClick={() => setTab("PLANNED")}
            >
              预备中
            </button>
            <button
              type="button"
              className={`tab ${tab === "DONE" ? "on" : ""}`}
              onClick={() => setTab("DONE")}
            >
              已完成
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingBlock rows={4} />
        ) : plans.length === 0 ? (
          <Empty
            icon="sparkle"
            title={tab === "PLANNED" ? "还没有预备中的事" : "还没有完成的预备"}
            desc={
              tab === "PLANNED"
                ? "提前记下下个月的婚礼、明年的满月酒，到时候不用临时凑钱。"
                : "完成的预备会留在这里，方便回头核对。"
            }
            action={
              tab === "PLANNED" ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setDialog({ open: true, mode: "create", plan: null })}
                >
                  新增预备
                </button>
              ) : undefined
            }
          />
        ) : (
          plans.map((plan) => (
            <div key={plan.id} className="pending-row">
              <div className="pending-avatar">
                <Avatar name={person(plan.contact.name)} size="md" />
              </div>

              <div className="pending-main">
                <div className="row row-wrap" style={{ gap: 6 }}>
                  <Link href={`/contacts/${plan.contactId}`} className="contact-name">
                    {person(plan.contact.name)}
                  </Link>
                  {plan.contact.relationTag ? (
                    <span className="chip chip-neutral">
                      {contactGroupLabel(plan.contact.relationTag)}
                    </span>
                  ) : null}
                  <span className={`chip ${SCENE_TONE[plan.scene]}`}>{plan.sceneLabel}</span>
                  {plan.status === "PLANNED" ? (
                    <span
                      className={`chip ${plan.daysUntil < 0 ? "chip-amber" : "chip-ghost"}`}
                    >
                      {countdownLabel(plan.daysUntil)}
                    </span>
                  ) : (
                    <span className="chip chip-secondary">已完成</span>
                  )}
                </div>
                <div className="pending-reason">
                  {plan.note ? `${maskNote(plan.note)} · ` : ""}
                  预计 {formatDate(plan.expectedAt)}
                  {plan.status === "DONE" && plan.completedAt
                    ? ` · 完成于 ${formatDate(plan.completedAt)}`
                    : ""}
                </div>
              </div>

              <div className="pending-amount-col">
                <div className="caption">{plan.status === "DONE" ? "实际礼金" : "预计礼金"}</div>
                <div className="pending-amount" style={{ color: "var(--primary)" }}>
                  {money(plan.plannedCents)}
                </div>
              </div>

              <div className="pending-actions">
                {plan.status === "PLANNED" ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => openPlanDialog("complete", plan)}
                    >
                      <Icon name="check" size={13} />
                      标记完成
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => openPlanDialog("edit", plan)}
                    >
                      <Icon name="edit" size={13} />
                      修改
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => setRemoving(plan)}
                    >
                      <Icon name="trash" size={13} />
                      删除
                    </button>
                  </>
                ) : (
                  <Link href={`/contacts/${plan.contactId}`} className="btn btn-ghost btn-sm">
                    查对账
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="notice">
        <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
        <span>
          预备只是「计划」，不计入收支统计。标记完成时可以顺带记一笔真实礼金，那笔才会进入对账与净差额。
        </span>
      </div>

      <PlanDialog
        open={dialog.open}
        mode={dialog.mode}
        plan={dialog.plan}
        ledgerId={ledgerId ?? ""}
        contacts={contacts}
        onClose={() => setDialog({ open: false, mode: "create", plan: null })}
        onSaved={onSaved}
      />

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="删除这笔预备？"
        subtitle="删除后不再出现在清单里，历史礼金记录不受影响"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setRemoving(null)}>
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
        {removing ? (
          <div className="notice">
            <Icon name="gift" size={16} style={{ flex: "none", marginTop: 1 }} />
            <span>
              {person(removing.contact.name)} · {removing.sceneLabel}
              {removing.note ? ` · ${maskNote(removing.note)}` : ""} · 预计{" "}
              {money(removing.plannedCents)}
            </span>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
