"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icons";
import { useToast, usePrivacy } from "@/components/providers";
import { Modal, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { GIFT_SCENES, SCENE_LABELS } from "@/lib/constants";
import { todayLocalDateOnly } from "@/lib/date";
import type { Contact, GiftScene, PageResult, Plan } from "@/lib/types";

type Mode = "create" | "edit" | "complete";

type Props = {
  open: boolean;
  mode: Mode;
  plan: Plan | null;
  ledgerId: string;
  contacts: Contact[];
  onClose: () => void;
  onSaved: () => void;
};

/** 本地时区的「今天」，不能退化成 UTC 日期 */
const today = () => todayLocalDateOnly();

export function PlanDialog({ open, mode, plan, ledgerId, contacts, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const { money, person, note: maskNote } = usePrivacy();

  const [contactId, setContactId] = useState("");
  const [scene, setScene] = useState<GiftScene>("WEDDING");
  const [amount, setAmount] = useState("");
  const [expectedAt, setExpectedAt] = useState(today());
  const [note, setNote] = useState("");
  const [createRecord, setCreateRecord] = useState(true);
  const [occurredAt, setOccurredAt] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);

    if (mode === "complete" && plan) {
      setAmount((plan.plannedCents / 100).toString());
      // 提前办完时不要记成未来日期，默认落在今天；已经过期的沿用预计日期
      setOccurredAt(plan.daysUntil > 0 ? todayLocalDateOnly() : plan.expectedAt);
      setCreateRecord(true);
      return;
    }

    if (mode === "edit" && plan) {
      setContactId(plan.contactId);
      setScene(plan.scene);
      setAmount((plan.plannedCents / 100).toString());
      setExpectedAt(plan.expectedAt);
      setNote(plan.note ?? "");
      return;
    }

    setContactId(contacts[0]?.id ?? "");
    setScene("WEDDING");
    setAmount("");
    setExpectedAt(today());
    setNote("");
  }, [open, mode, plan, contacts]);

  const submit = async () => {
    setError(null);

    const yuan = Number(amount);
    if (!Number.isFinite(yuan) || yuan <= 0) {
      setError("请填写有效的礼金数额");
      return;
    }
    const cents = Math.round(yuan * 100);
    if (cents > 10_000_000) {
      setError("单笔金额不能超过 10 万元");
      return;
    }

    setSaving(true);
    try {
      if (mode === "create") {
        if (!contactId) {
          setError("请选择亲友");
          return;
        }
        await api("/api/v1/plans", {
          method: "POST",
          ledgerId,
          body: {
            contactId,
            scene,
            plannedCents: cents,
            expectedAt,
            note: note.trim() || undefined,
          },
        });
        toast("已加入人情预备");
      } else if (mode === "edit" && plan) {
        await api(`/api/v1/plans/${plan.id}`, {
          method: "PATCH",
          ledgerId,
          body: {
            scene,
            plannedCents: cents,
            expectedAt,
            note: note.trim() || null,
          },
        });
        toast("预备已更新");
      } else if (mode === "complete" && plan) {
        await api(`/api/v1/plans/${plan.id}/complete`, {
          method: "POST",
          ledgerId,
          body: {
            createRecord,
            occurredAt,
            amountCents: cents,
          },
        });
        toast(
          createRecord
            ? "已完成并记入账簿，可在该亲友的对账单里看到"
            : "已标记完成（未记账）",
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === "create" ? "新增人情预备" : mode === "edit" ? "修改预备" : "完成这笔预备";
  const subtitle =
    mode === "create"
      ? "已知未来要办的事，提前把这笔礼金备出来"
      : mode === "edit"
        ? "调整金额、日期或事由"
        : "确认后这笔预备将标记为完成";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="button" className="btn btn-primary grow" onClick={submit} disabled={saving}>
            {saving ? <Spinner /> : <Icon name="check" size={16} />}
            {mode === "complete" ? "确认完成" : "保存"}
          </button>
        </>
      }
    >
      {mode === "create" ? (
        <div className="field">
          <span className="label">往来亲友</span>
          {contacts.length === 0 ? (
            <div className="notice">
              <Icon name="info" size={16} />
              <span>账本里还没有亲友，先记一笔往来或在名录里建一位。</span>
            </div>
          ) : (
            <select
              className="select"
              value={contactId}
              onChange={(event) => setContactId(event.target.value)}
            >
              <option value="">请选择亲友</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {person(contact.name)}
                  {contact.relationTag ? ` · ${contact.relationTag}` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : plan ? (
        <div className="notice">
          <Icon name="gift" size={16} style={{ flex: "none", marginTop: 1 }} />
          <span>
            {person(plan.contact.name)} · {plan.sceneLabel}
            {plan.note ? ` · ${maskNote(plan.note)}` : ""} · 预计 {plan.expectedAt} ·{" "}
            {money(plan.plannedCents)}
          </span>
        </div>
      ) : null}

      {mode !== "complete" ? (
        <div className="field">
          <span className="label">礼俗场景</span>
          <div className="row row-wrap" style={{ gap: 8 }}>
            {GIFT_SCENES.map((item) => (
              <button
                key={item}
                type="button"
                className={`chip chip-choice ${scene === item ? "chip-primary" : "chip-ghost"}`}
                onClick={() => setScene(item)}
              >
                {SCENE_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <div className="field grow">
          <span className="label">{mode === "complete" ? "实际礼金（元）" : "预计礼金（元）"}</span>
          <div className="input-affix">
            <span className="input-affix-prefix mono">¥</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
            />
          </div>
        </div>
        <div className="field" style={{ width: 158 }}>
          <span className="label">{mode === "complete" ? "实际日期" : "预计日期"}</span>
          <input
            type="date"
            className="input"
            value={mode === "complete" ? occurredAt : expectedAt}
            onChange={(event) =>
              mode === "complete"
                ? setOccurredAt(event.target.value)
                : setExpectedAt(event.target.value)
            }
          />
        </div>
      </div>

      {mode !== "complete" ? (
        <div className="field">
          <span className="label">事由备注</span>
          <input
            className="input"
            placeholder="如：大学室友婚礼、二胎满月酒"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      ) : (
        <label className="row" style={{ gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={createRecord}
            onChange={(event) => setCreateRecord(event.target.checked)}
            style={{ marginTop: 3, accentColor: "var(--primary-container)" }}
          />
          <span className="caption" style={{ lineHeight: 1.7 }}>
            同时记一笔真实礼金（记入账簿，并计入对账与统计）。如果这笔早已单独记过，可以取消勾选。
          </span>
        </label>
      )}

      {error ? <div className="field-error">{error}</div> : null}
    </Modal>
  );
}

/** 页面用来拉联系人的小工具 */
export async function fetchContacts(ledgerId: string): Promise<Contact[]> {
  const data = await api<PageResult<Contact>>("/api/v1/contacts?pageSize=500&sort=name", {
    ledgerId,
  });
  return data.items;
}
