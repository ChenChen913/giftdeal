"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { GIFT_SCENES, SCENE_LABELS, type GiftScene } from "@/lib/constants";
import { todayLocalDateOnly } from "@/lib/date";
import type { LifeEvent } from "@/lib/types";
import { Icon } from "./icons";
import { useToast } from "./providers";
import { Modal, Spinner } from "./ui";

type Props = {
  open: boolean;
  /** null 表示新建 */
  event: LifeEvent | null;
  ledgerId: string;
  onClose: () => void;
  onSaved: () => void;
};

export function EventDialog({ open, event, ledgerId, onClose, onSaved }: Props) {
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [scene, setScene] = useState<GiftScene>("WEDDING");
  const [occurredAt, setOccurredAt] = useState(todayLocalDateOnly());
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);

    if (event) {
      setTitle(event.title);
      setScene(event.scene);
      setOccurredAt(event.occurredAt);
      setLocation(event.location ?? "");
      setNote(event.note ?? "");
    } else {
      setTitle("");
      setScene("WEDDING");
      setOccurredAt(todayLocalDateOnly());
      setLocation("");
      setNote("");
    }
  }, [open, event]);

  const submit = async () => {
    if (!title.trim()) {
      setError("请填写事件名称");
      return;
    }

    setSaving(true);
    try {
      const body = {
        title: title.trim(),
        scene,
        occurredAt,
        location: location.trim() || null,
        note: note.trim() || null,
      };

      if (event) {
        await api(`/api/v1/events/${event.id}`, { method: "PATCH", ledgerId, body });
      } else {
        await api("/api/v1/events", { method: "POST", ledgerId, body });
      }

      toast(event ? "事件已更新" : "事件已记下，接下来可以把礼金挂到这件事上");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={event ? "编辑人生大事" : "记一件人生大事"}
      subtitle="婚礼、满月、百岁、寿宴……事后可以查看这一场收了多少、都有谁"
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
            保存
          </button>
        </>
      }
    >
      <div className="field">
        <span className="label">事件名称</span>
        <input
          className="input"
          placeholder="如：我的婚礼、小女满月、父亲七十寿宴"
          maxLength={50}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="field">
        <span className="label">类型</span>
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
        <div className="field" style={{ width: 158 }}>
          <span className="label">日期</span>
          <input
            type="date"
            className="input"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </div>
        <div className="field grow">
          <span className="label">地点（选填）</span>
          <input
            className="input"
            placeholder="如：老家县城、城南酒店"
            maxLength={100}
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <span className="label">备注（选填）</span>
        <textarea
          className="textarea"
          placeholder="如：办了 20 桌，主要请的是老家亲戚"
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {error ? <div className="field-error">{error}</div> : null}
    </Modal>
  );
}
