"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { GIFT_SCENES, SCENE_LABELS, type GiftScene } from "@/lib/constants";
import type { RecordItem } from "@/lib/types";
import { Icon } from "./icons";
import { usePrivacy, useToast } from "./providers";
import { Modal, Spinner } from "./ui";

type CommonProps = {
  record: RecordItem | null;
  ledgerId: string;
  onClose: () => void;
  /** 保存或删除成功后调用，让父级重新拉数据 */
  onChanged: () => void;
};

// ------------------------------------------------------------
// 编辑
// ------------------------------------------------------------

export function RecordEditDialog({ record, ledgerId, onClose, onChanged }: CommonProps) {
  const { toast } = useToast();
  const { person, money } = usePrivacy();

  const [amount, setAmount] = useState("");
  const [scene, setScene] = useState<GiftScene>("WEDDING");
  const [occurredAt, setOccurredAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!record) return;
    setAmount((record.amountCents / 100).toString());
    setScene(record.scene);
    setOccurredAt(record.occurredAt);
    setNote(record.note ?? "");
    setError(null);
    setSaving(false);
  }, [record]);

  const submit = async () => {
    if (!record) return;

    const yuan = Number(amount);
    if (!Number.isFinite(yuan) || yuan <= 0) {
      setError("请填写有效的礼金数额");
      return;
    }
    const amountCents = Math.round(yuan * 100);
    if (amountCents > 10_000_000) {
      setError("单笔金额不能超过 10 万元");
      return;
    }

    setSaving(true);
    try {
      await api(`/api/v1/records/${record.id}`, {
        method: "PATCH",
        ledgerId,
        body: {
          amountCents,
          scene,
          occurredAt,
          note: note.trim() || null,
        },
      });
      toast("这笔礼金已更新");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={record !== null}
      onClose={onClose}
      title="编辑这笔礼金"
      subtitle="亲友与收送方向不可改，如需变更请删除后重建"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary grow"
            onClick={submit}
            disabled={saving}
          >
            {saving ? <Spinner /> : <Icon name="check" size={15} />}
            保存修改
          </button>
        </>
      }
    >
      {record ? (
        <>
          <div className="notice">
            <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
            <span>
              {person(record.contact.name)} ·{" "}
              {record.direction === "GIVEN" ? "我方送出" : "对方随礼"} · 原金额{" "}
              {money(record.amountCents)}
            </span>
          </div>

          <div className="field">
            <span className="label">礼金数额（元）</span>
            <div className="input-affix">
              <span className="input-affix-prefix mono">¥</span>
              <input
                className="input amount-input"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
              />
            </div>
          </div>

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
                onChange={(event) => setOccurredAt(event.target.value)}
              />
            </div>
          </div>

          {error ? <div className="field-error">{error}</div> : null}
        </>
      ) : null}
    </Modal>
  );
}

// ------------------------------------------------------------
// 删除
// ------------------------------------------------------------

export function RecordDeleteDialog({ record, ledgerId, onClose, onChanged }: CommonProps) {
  const { toast } = useToast();
  const { person, money } = usePrivacy();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!record) return;
    setDeleting(false);
    setError(null);
  }, [record]);

  const remove = async () => {
    if (!record) return;
    setDeleting(true);
    try {
      await api(`/api/v1/records/${record.id}`, { method: "DELETE", ledgerId });
      toast("这笔礼金已删除");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "删除失败，请稍后重试");
    } finally {
      setDeleting(false);
    }
  };

  /** 这笔送出记录结清过某条收礼，删掉后对方会回到待回礼 */
  const revertsSettlement = record?.direction === "GIVEN" && record.settlesRecordId !== null;

  return (
    <Modal
      open={record !== null}
      onClose={onClose}
      title="删除这笔礼金"
      subtitle="删除后不再计入任何统计与对账"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={deleting}>
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
      {record ? (
        <>
          <div className="notice">
            <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
            <span>
              {person(record.contact.name)} · {record.sceneLabel} ·{" "}
              {record.direction === "GIVEN" ? "我方送出" : "对方随礼"} ·{" "}
              {money(record.amountCents)}
            </span>
          </div>

          {revertsSettlement ? (
            <div className="notice" style={{ background: "var(--amber-tint, #fdf6e8)" }}>
              <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
              <span>
                这笔送礼结清过一条收礼记录。删除后，那条收礼会恢复为「待回礼」。
              </span>
            </div>
          ) : null}

          {error ? <div className="field-error">{error}</div> : null}
        </>
      ) : null}
    </Modal>
  );
}
