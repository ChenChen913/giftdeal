"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, ApiError } from "@/lib/api";
import { todayLocalDateOnly } from "@/lib/date";
import { formatDate } from "@/lib/format";
import type { Contact, LifeEvent, PageResult, RecordDirection, RecordItem } from "@/lib/types";
import { useLedger, usePrivacy, useToast } from "./providers";
import { Icon } from "./icons";
import { Modal, Spinner } from "./ui";

const SCENES: { value: string; label: string }[] = [
  { value: "WEDDING", label: "婚宴喜事" },
  { value: "BABY_FULL_MONTH", label: "满月" },
  { value: "BABY_HUNDRED_DAYS", label: "百岁" },
  { value: "FUNERAL", label: "白事丧礼" },
  { value: "OTHER", label: "其他事由" },
];

const QUICK_AMOUNTS = [200, 500, 600, 800, 1000, 2000];

type OpenOptions = {
  direction?: RecordDirection;
  contactId?: string;
  settlesRecordId?: string;
  /** 预填日期；设了未来日期时会自动切成「加入预备」 */
  occurredAt?: string;
};

/** 本地时区的「今天」，用于表单默认值与未来日期判断（不能用 UTC） */
function todayString() {
  return todayLocalDateOnly();
}

function isFutureDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value > todayString();
}

type DialogContextValue = {
  open: (options?: OpenOptions) => void;
  close: () => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

export function useRecordDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useRecordDialog 必须在 RecordDialogProvider 内使用");
  return ctx;
}

export function RecordDialogProvider({ children }: { children: ReactNode }) {
  const { ledgerId, refresh } = useLedger();
  const { toast } = useToast();
  const { money, person } = usePrivacy();

  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<OpenOptions>({});

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [eventId, setEventId] = useState("");
  const [creatingContact, setCreatingContact] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactTag, setNewContactTag] = useState("");

  const [direction, setDirection] = useState<RecordDirection>("RECEIVED");
  const [amount, setAmount] = useState("");
  const [contactId, setContactId] = useState("");
  const [scene, setScene] = useState("WEDDING");
  const [occurredAt, setOccurredAt] = useState(() => todayLocalDateOnly());
  const [note, setNote] = useState("");
  const [settlesRecordId, setSettlesRecordId] = useState("");
  const [pendingTargets, setPendingTargets] = useState<RecordItem[]>([]);
  /** 用户手动指定的去向；null = 跟随日期自动判断 */
  const [forcedTarget, setForcedTarget] = useState<"record" | "plan" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setAmount("");
    setNote("");
    setScene("WEDDING");
    setOccurredAt(todayLocalDateOnly());
    setSettlesRecordId("");
    setForcedTarget(null);
    setContactQuery("");
    setEventId("");
    setCreatingContact(false);
    setNewContactName("");
    setNewContactTag("");
    setError(null);
  }, []);

  const openDialog = useCallback(
    (next: OpenOptions = {}) => {
      reset();
      setOptions(next);
      setDirection(next.direction ?? "RECEIVED");
      setContactId(next.contactId ?? "");
      setSettlesRecordId(next.settlesRecordId ?? "");
      if (next.occurredAt) setOccurredAt(next.occurredAt);
      setOpen(true);
    },
    [reset],
  );

  const close = useCallback(() => {
    if (submitting) return;
    setOpen(false);
  }, [submitting]);

  // 打开时拉联系人：支持按姓名/称谓服务端搜索，账本再大也能选到人
  useEffect(() => {
    if (!open || !ledgerId) return;
    let cancelled = false;
    setContactsLoading(true);

    // 输入时防抖，避免每个字符都打一次接口
    const timer = window.setTimeout(
      () => {
        const q = contactQuery.trim();
        const params = new URLSearchParams({ pageSize: "200", sort: "recent" });
        if (q) params.set("q", q);

        api<PageResult<Contact>>(`/api/v1/contacts?${params.toString()}`, { ledgerId })
          .then((data) => {
            if (cancelled) return;
            setContacts(data.items);
            // 无关键词且未指定亲友时，默认选最近往来的第一位
            if (!q && !options.contactId && data.items.length > 0) {
              setContactId((prev) => prev || data.items[0].id);
            }
          })
          .catch(() => undefined)
          .finally(() => {
            if (!cancelled) setContactsLoading(false);
          });
      },
      contactQuery.trim() ? 300 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, ledgerId, options.contactId, contactQuery]);

  // 打开时拉人生大事，供「归到哪件大事」下拉使用
  useEffect(() => {
    if (!open || !ledgerId) return;
    let cancelled = false;
    api<PageResult<LifeEvent>>("/api/v1/events?pageSize=100", { ledgerId })
      .then((data) => {
        if (!cancelled) setEvents(data.items);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, ledgerId]);

  // 送出时拉该联系人未结清的收礼，用于关联结清
  useEffect(() => {
    if (!open || direction !== "GIVEN" || !contactId || !ledgerId) {
      setPendingTargets([]);
      return;
    }
    let cancelled = false;
    api<PageResult<RecordItem>>(
      `/api/v1/records?contactId=${encodeURIComponent(contactId)}&settled=false&pageSize=50`,
      { ledgerId },
    )
      .then((data) => {
        if (!cancelled) setPendingTargets(data.items);
      })
      .catch(() => {
        if (!cancelled) setPendingTargets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, direction, contactId, ledgerId]);

  const selectedContact = contacts.find((item) => item.id === contactId) ?? null;
  const future = isFutureDate(occurredAt);
  /** 未来日期默认进人情预备；有「关联待回礼」时仍按真实账簿记账 */
  const target: "record" | "plan" =
    forcedTarget ?? (future && !settlesRecordId ? "plan" : "record");

  const submit = async () => {
    setError(null);

    const yuan = Number(amount);
    if (!Number.isFinite(yuan) || yuan <= 0) {
      setError("请填写有效的礼金数额");
      return;
    }
    const amountCents = Math.round(yuan * 100);
    if (!Number.isInteger(amountCents) || amountCents > 10_000_000) {
      setError("单笔金额不能超过 10 万元");
      return;
    }

    let finalContactId = contactId;

    if (creatingContact) {
      if (!newContactName.trim()) {
        setError("请填写亲友姓名");
        return;
      }
    } else if (!finalContactId) {
      setError("请选择往来亲友");
      return;
    }

    setSubmitting(true);
    try {
      if (creatingContact) {
        const created = await api<{ contact: Contact }>("/api/v1/contacts", {
          method: "POST",
          ledgerId,
          body: {
            name: newContactName.trim(),
            relationTag: newContactTag.trim() || undefined,
          },
        });
        finalContactId = created.contact.id;
        setContacts((prev) => [created.contact, ...prev]);
      }

      if (target === "plan") {
        // 未来日期：默认只是「预备」，不进收支统计
        await api("/api/v1/plans", {
          method: "POST",
          ledgerId,
          body: {
            contactId: finalContactId,
            direction,
            scene,
            plannedCents: amountCents,
            expectedAt: occurredAt,
            note: note.trim() || undefined,
          },
        });
        toast("已加入人情预备，到时再记入账簿");
      } else {
        await api("/api/v1/records", {
          method: "POST",
          ledgerId,
          body: {
            contactId: finalContactId,
            direction,
            amountCents,
            scene,
            occurredAt,
            note: note.trim() || undefined,
            settlesRecordId: settlesRecordId || undefined,
            eventId: eventId || undefined,
          },
        });
        toast(
          direction === "RECEIVED"
            ? "已记入收礼"
            : settlesRecordId
              ? "已记入送礼并结清"
              : "已记入送礼",
        );
      }
      setOpen(false);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "CONTACT_NAME_DUPLICATE") setError("该账本内已有同名亲友");
        else if (err.code === "RECORD_ALREADY_SETTLED") setError("这笔收礼已经被结清过了");
        else setError(err.message);
      } else {
        setError("保存失败，请稍后重试");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const value = useMemo(() => ({ open: openDialog, close }), [openDialog, close]);

  return (
    <DialogContext.Provider value={value}>
      {children}

      <Modal
        open={open}
        onClose={close}
        title={target === "plan" ? "记一笔 · 加入人情预备" : "记一笔往来"}
        subtitle={
          target === "plan"
            ? "未来的事，先把礼金备出来，不计入当前收支"
            : "礼尚往来 · 取日明晦"
        }
        wide
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={close} disabled={submitting}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary grow"
              onClick={submit}
              disabled={submitting}
            >
              {submitting ? <Spinner /> : <Icon name="check" size={16} />}
              {target === "plan" ? "加入预备" : "确认入账"}
            </button>
          </>
        }
      >
        <div className="segmented" style={{ alignSelf: "stretch" }}>
          <button
            type="button"
            className={direction === "RECEIVED" ? "on" : ""}
            style={{ flex: 1 }}
            onClick={() => {
              setDirection("RECEIVED");
              setSettlesRecordId("");
            }}
          >
            我收到的随礼
          </button>
          <button
            type="button"
            className={direction === "GIVEN" ? "on" : ""}
            style={{ flex: 1 }}
            onClick={() => setDirection("GIVEN")}
          >
            我送出的礼金
          </button>
        </div>

        <div className="field">
          <div className="row between">
            <span className="label">礼金数额（元）</span>
            <span className="caption">人民币</span>
          </div>
          <div className="input-affix">
            <span className="input-affix-prefix mono">¥</span>
            <input
              className="input amount-input"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
            />
          </div>
          <div className="row row-wrap" style={{ gap: 6 }}>
            {QUICK_AMOUNTS.map((item) => (
              <button
                key={item}
                type="button"
                className="chip chip-ghost"
                style={{ cursor: "pointer" }}
                onClick={() => setAmount(String(item))}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="row between">
            <span className="label">往来亲友</span>
            <button
              type="button"
              className="caption"
              style={{ background: "none", border: "none", color: "var(--primary)" }}
              onClick={() => setCreatingContact((prev) => !prev)}
            >
              {creatingContact ? "从名册选择" : "＋ 新增亲友"}
            </button>
          </div>

          {creatingContact ? (
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                placeholder="亲友姓名"
                value={newContactName}
                onChange={(event) => setNewContactName(event.target.value)}
              />
              <input
                className="input"
                placeholder="关系（选填）"
                style={{ maxWidth: 130 }}
                value={newContactTag}
                onChange={(event) => setNewContactTag(event.target.value)}
              />
            </div>
          ) : (
            <div className="col" style={{ gap: 8 }}>
              <div className="search-box">
                <span className="icon">
                  <Icon name="search" size={16} />
                </span>
                <input
                  className="input"
                  placeholder="搜索亲友姓名、称谓…"
                  value={contactQuery}
                  onChange={(event) => {
                    setContactQuery(event.target.value);
                    setContactId("");
                    setSettlesRecordId("");
                  }}
                />
              </div>

              {contactsLoading ? (
                <div className="skeleton" style={{ height: 42 }} />
              ) : contacts.length === 0 ? (
                <div className="notice">
                  <Icon name="info" size={16} />
                  <span>
                    {contactQuery.trim()
                      ? "没有匹配的亲友，换个关键词试试。"
                      : "账本里还没有亲友，先点右上角「＋ 新增亲友」建一位。"}
                  </span>
                </div>
              ) : (
                <select
                  className="select"
                  value={contactId}
                  onChange={(event) => {
                    setContactId(event.target.value);
                    setSettlesRecordId("");
                  }}
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
          )}
        </div>

        <div className="field">
          <span className="label">礼俗场景</span>
          <div className="row row-wrap" style={{ gap: 8 }}>
            {SCENES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={`chip chip-choice ${scene === item.value ? "chip-primary" : "chip-ghost"}`}
                onClick={() => setScene(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {target === "record" && events.length > 0 ? (
          <div className="field">
            <span className="label">归到哪件大事（可选）</span>
            <select
              className="select"
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
            >
              <option value="">不归类</option>
              {events.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatDate(item.occurredAt)} · {item.title}
                </option>
              ))}
            </select>
            <span className="field-hint">
              选中后，这笔礼金会汇总到「人生大事」里那一场事的账下。
            </span>
          </div>
        ) : null}

        {direction === "GIVEN" && target === "record" && pendingTargets.length > 0 ? (
          <div className="field">
            <span className="label">关联待回礼（可选）</span>
            <select
              className="select"
              value={settlesRecordId}
              onChange={(event) => setSettlesRecordId(event.target.value)}
            >
              <option value="">不关联，仅记一笔送出</option>
              {pendingTargets.map((record) => (
                <option key={record.id} value={record.id}>
                  {formatDate(record.occurredAt)} · {record.sceneLabel} · {money(record.amountCents)}
                </option>
              ))}
            </select>
            <span className="field-hint">选中后，这笔送礼会把对应的收礼标记为已结清。</span>
          </div>
        ) : null}

        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <div className="field grow">
            <span className="label">往来事由</span>
            <input
              className="input"
              placeholder="如：小女周岁答谢宴"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="field" style={{ width: 158 }}>
            <span className="label">发生日期</span>
            <input
              type="date"
              className="input"
              value={occurredAt}
              onChange={(event) => {
                setOccurredAt(event.target.value);
                setForcedTarget(null);
              }}
            />
          </div>
        </div>

        <div className="field">
          <div className="row between">
            <span className="label">这笔记到哪里</span>
            <span className="caption">
              {future ? "所选日期在未来，默认加入预备" : "今天或之前，直接记入账簿"}
            </span>
          </div>
          <div className="segmented" style={{ alignSelf: "stretch" }}>
            <button
              type="button"
              className={target === "record" ? "on" : ""}
              style={{ flex: 1 }}
              onClick={() => {
                setForcedTarget("record");
                // 预备不能结清，切回账簿时保留已选的关联关系
              }}
            >
              记入账簿
            </button>
            <button
              type="button"
              className={target === "plan" ? "on" : ""}
              style={{ flex: 1 }}
              onClick={() => {
                setForcedTarget("plan");
                setSettlesRecordId("");
              }}
            >
              加入预备
            </button>
          </div>
          <span className="field-hint">
            {target === "plan"
              ? "预备只是计划，不计入收支与净差额；到日子后在「人情预备」里标记完成即可入账。"
              : "记入账簿后立即参与对账、待回礼与统计。"}
          </span>
        </div>

        {selectedContact && direction === "GIVEN" && target === "record" ? (
          <div className="notice">
            <Icon name="info" size={16} />
            <span>
              当前与「{person(selectedContact.name)}」净差额{" "}
              {money(selectedContact.stats.netCents)}，待回礼{" "}
              {selectedContact.stats.unsettledReceivedCount} 笔。
            </span>
          </div>
        ) : null}

        {error ? <div className="field-error">{error}</div> : null}
      </Modal>
    </DialogContext.Provider>
  );
}
