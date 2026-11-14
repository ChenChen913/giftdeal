"use client";

import { useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";
import {
  CONTACT_GROUPS,
  CONTACT_GROUP_LABELS,
  type ContactGroup,
} from "@/lib/constants";
import { Icon } from "./icons";
import { useToast } from "./providers";
import { Modal, Spinner } from "./ui";

type Props = {
  open: boolean;
  ledgerId: string;
  onClose: () => void;
  onSaved: () => void;
};

/** 提前把亲友录进名单，记礼金时就能直接选 */
export function ContactDialog({ open, ledgerId, onClose, onSaved }: Props) {
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [group, setGroup] = useState<ContactGroup | "">("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setGroup("");
    setPhone("");
    setNote("");
    setError(null);
    setSaving(false);
  }, [open]);

  const submit = async () => {
    if (!name.trim()) {
      setError("请填写姓名");
      return;
    }

    setSaving(true);
    try {
      await api("/api/v1/contacts", {
        method: "POST",
        ledgerId,
        body: {
          name: name.trim(),
          relationTag: group || null,
          phone: phone.trim() || null,
          note: note.trim() || null,
        },
      });
      toast("已加入亲友名单");
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
      title="新增亲友"
      subtitle="提前录进名单，记礼金时可以直接选，不用每次重新输"
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
            加入名单
          </button>
        </>
      }
    >
      <div className="field">
        <span className="label">姓名</span>
        <input
          className="input"
          placeholder="如：王建国"
          maxLength={30}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <span className="label">分组</span>
        <select
          className="select"
          value={group}
          onChange={(event) => setGroup(event.target.value as ContactGroup | "")}
        >
          <option value="">未分组</option>
          {CONTACT_GROUPS.map((item) => (
            <option key={item} value={item}>
              {CONTACT_GROUP_LABELS[item]}
            </option>
          ))}
        </select>
        <span className="field-hint">
          分组决定记礼金时的选择顺序，也用于名录页筛选。
        </span>
      </div>

      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <div className="field grow">
          <span className="label">手机号（选填）</span>
          <input
            className="input"
            maxLength={20}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <span className="label">备注（选填）</span>
        <input
          className="input"
          placeholder="如：二舅、大学室友、父亲的老同事"
          maxLength={200}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      {error ? <div className="field-error">{error}</div> : null}
    </Modal>
  );
}
