"use client";

import { useEffect, useState } from "react";

import { Icon } from "@/components/icons";
import { usePrivacy, useToast } from "@/components/providers";
import { Modal, Spinner } from "@/components/ui";

/**
 * 隐私模式的「解锁按钮」与「二次验证弹窗」拆成两个组件：
 * - PrivacyToggle 可在桌面顶栏 / 移动顶栏各放一个
 * - PrivacyDialog 全站只挂一次，避免重复渲染
 */
export function PrivacyToggle({ compact = false }: { compact?: boolean }) {
  const { unlocked, ready, lock, setUnlockOpen } = usePrivacy();
  const { toast } = useToast();

  const onLock = async () => {
    try {
      await lock();
      toast("已重新隐藏敏感信息");
    } catch {
      toast("操作失败，请重试", "error");
    }
  };

  return (
    <button
      type="button"
      className={`privacy-toggle ${unlocked ? "on" : ""} ${compact ? "compact" : ""}`}
      onClick={() => (unlocked ? void onLock() : setUnlockOpen(true))}
      disabled={!ready}
      title={unlocked ? "点击重新隐藏真实金额与姓名" : "验证身份后查看真实数据"}
      aria-label={unlocked ? "重新隐藏敏感信息" : "验证并查看真实数据"}
    >
      <Icon name={unlocked ? "eye" : "eyeOff"} size={compact ? 18 : 16} />
      {compact ? null : <span>{unlocked ? "真实数据已显示" : "隐私模式"}</span>}
      {compact ? null : <Icon name={unlocked ? "check" : "lock"} size={13} />}
    </button>
  );
}

export function PrivacyDialog() {
  const { unlocked, unlockOpen, setUnlockOpen, unlock, refresh } = usePrivacy();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 解锁成功后自动收起弹窗
  useEffect(() => {
    if (unlocked && unlockOpen) setUnlockOpen(false);
  }, [unlocked, unlockOpen, setUnlockOpen]);

  const close = () => {
    setUnlockOpen(false);
    setPassword("");
    setError(null);
  };

  const onSubmit = async () => {
    setError(null);
    if (!password.trim()) {
      setError("请输入隐私密码");
      return;
    }
    setSubmitting(true);
    try {
      await unlock(password);
      toast("已解锁，真实金额与姓名已显示");
      setPassword("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={unlockOpen}
      onClose={close}
      title="输入隐私密码"
      subtitle="金额与姓名当前已隐藏，输入隐私密码后查看真实数据"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={close}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary grow"
            onClick={() => void onSubmit()}
            disabled={submitting}
          >
            {submitting ? <Spinner /> : <Icon name="eye" size={16} />}
            解锁
          </button>
        </>
      }
    >
      <div className="notice">
        <Icon name="lock" size={16} style={{ flex: "none", marginTop: 1 }} />
        <span>
          解锁后 8 小时内可查看真实金额与完整姓名；期间随时点击顶部「真实数据已显示」即可重新隐藏。
        </span>
      </div>

      <div className="field">
        <span className="label">隐私密码</span>
        <input
          className="input"
          type="password"
          autoComplete="off"
          placeholder="请输入隐私密码"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void onSubmit();
          }}
        />
        <span className="field-hint">仅你本人知晓，忘记需在服务端环境变量中重置。</span>
      </div>

      {error ? <div className="field-error">{error}</div> : null}
    </Modal>
  );
}
