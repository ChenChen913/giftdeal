"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/icons";
import { useAuth, useLedger, useToast, usePrivacy } from "@/components/providers";
import { Avatar, Empty, LoadingBlock, Modal, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { todayLocalDateOnly } from "@/lib/date";
import { formatDate } from "@/lib/format";
import type { LedgerDetail } from "@/lib/types";

type InviteResult = { token: string; url: string; expiresAt: string };

export default function LedgerPage() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    ledgerId,
    ledgers,
    currentLedger,
    switchLedger,
    setDefaultLedger,
    createLedger,
    overview,
    refresh,
  } = useLedger();
  const { toast } = useToast();
  const { person, phone: maskPhoneValue, unlocked, openUnlock } = usePrivacy();

  const [detail, setDetail] = useState<LedgerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newLedgerName, setNewLedgerName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [transferTarget, setTransferTarget] = useState<LedgerDetail["members"][number] | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [inviting, setInviting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!ledgerId) return;
    setLoading(true);
    try {
      const data = await api<{ ledger: LedgerDetail }>(`/api/v1/ledgers/${ledgerId}`, {
        ledgerId,
      });
      setDetail(data.ledger);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [ledgerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const generateInvite = async () => {
    setInviting(true);
    try {
      const data = await api<{ invite: InviteResult }>("/api/v1/invites", {
        method: "POST",
        ledgerId,
        body: {},
      });
      setInvite(data.invite);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "生成邀请失败", "error");
    } finally {
      setInviting(false);
    }
  };

  const copyInvite = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      toast("邀请链接已复制");
    } catch {
      toast("复制失败，请手动选中链接", "error");
    }
  };

  const submitCreate = async () => {
    if (!newName.trim()) {
      toast("请填写账本名称", "error");
      return;
    }
    setCreating(true);
    try {
      await createLedger(newName.trim());
      setCreateOpen(false);
      setNewName("");
      toast("新账本已创建");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "创建失败", "error");
    } finally {
      setCreating(false);
    }
  };

  const exportData = async () => {
    if (!unlocked) {
      toast("导出包含真实金额与姓名，请先解锁隐私模式", "info");
      openUnlock();
      return;
    }
    setExporting(true);
    try {
      const data = await api<{ export: unknown }>("/api/v1/export", { ledgerId });
      const blob = new Blob([JSON.stringify(data.export, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${currentLedger?.name ?? "礼金账本"}-${todayLocalDateOnly()}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast("账本数据已导出");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "导出失败", "error");
    } finally {
      setExporting(false);
    }
  };

  const openRename = () => {
    setNewLedgerName(currentLedger?.name ?? "");
    setRenameOpen(true);
  };

  const rename = async () => {
    const name = newLedgerName.trim();
    if (!name) {
      toast("请填写账本名称", "error");
      return;
    }
    setRenaming(true);
    try {
      await api(`/api/v1/ledgers/${ledgerId}`, {
        method: "PATCH",
        ledgerId,
        body: { name },
      });
      setRenameOpen(false);
      await load();
      await refresh();
      toast("账本已重命名");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "重命名失败", "error");
    } finally {
      setRenaming(false);
    }
  };

  const leave = async () => {
    setLeaving(true);
    try {
      await api(`/api/v1/ledgers/${ledgerId}/members/me`, { method: "DELETE", ledgerId });
      setLeaveOpen(false);
      await refresh();
      toast("已退出该账本");
      router.replace("/");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "退出失败", "error");
    } finally {
      setLeaving(false);
    }
  };

  const transfer = async () => {
    if (!transferTarget) return;
    setTransferring(true);
    try {
      await api(`/api/v1/ledgers/${ledgerId}/transfer`, {
        method: "POST",
        ledgerId,
        body: { userId: transferTarget.userId },
      });
      setTransferTarget(null);
      await load();
      await refresh();
      toast("管理员已转让");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "转让失败", "error");
    } finally {
      setTransferring(false);
    }
  };

  const owner = detail?.members.find((member) => member.role === "OWNER");
  const isOwner = detail?.role === "OWNER";
  const myId = user?.id ?? "";
  return (
    <div className="page">
      <div className="ledger-head">
        <div>
          <h1>家庭共享与账本管理</h1>
          <div className="caption" style={{ marginTop: 2 }}>
            家人共同维系人情账目，亲疏随礼互通同步，不重礼、不遗漏
          </div>
        </div>
        <div className="ledger-head-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(true)}>
            <Icon name="plus" size={16} />
            新建账本
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={generateInvite}
            disabled={inviting}
          >
            {inviting ? <Spinner /> : <Icon name="users" size={16} />}
            邀请新成员
          </button>
        </div>
      </div>

      <div className="dash-grid">
        <div className="col" style={{ gap: 16 }}>
          <div className="ledger-card">
            <div className="row between row-wrap" style={{ gap: 10 }}>
              <div className="ledger-card-title">
                <Icon name="wallet" size={18} style={{ color: "var(--primary)" }} />
                {currentLedger?.name ?? "—"}
                {currentLedger?.isDefault ? (
                  <span className="chip chip-primary">默认账本</span>
                ) : null}
                {isOwner ? (
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ width: 26, height: 26 }}
                    title="重命名账本"
                    aria-label="重命名账本"
                    onClick={openRename}
                  >
                    <Icon name="edit" size={13} />
                  </button>
                ) : null}
              </div>
              <span className="caption">
                启用于 {formatDate(currentLedger?.createdAt ?? detail?.createdAt)}
              </span>
            </div>

            <div className="ledger-stats">
              <div className="ledger-stat">
                <div className="caption">累计收录往来</div>
                <div className="ledger-stat-value">{overview?.recordCount ?? 0} 笔</div>
              </div>
              <div className="ledger-stat">
                <div className="caption">共同协作者</div>
                <div className="ledger-stat-value">{detail?.members.length ?? 1} 位</div>
              </div>
              <div className="ledger-stat">
                <div className="caption">记账本币</div>
                <div className="ledger-stat-value">CNY ¥</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2 className="section-title">账本成员</h2>
              <span className="caption">{detail?.members.length ?? 0} 位</span>
            </div>
            <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
              {loading ? (
                <LoadingBlock rows={3} />
              ) : !detail || detail.members.length === 0 ? (
                <Empty icon="users" title="还没有成员信息" />
              ) : (
                detail.members.map((member) => (
                  <div key={member.userId} className="member-row">
                    <Avatar name={person(member.name)} size="md" />
                    <div className="grow">
                      <div className="member-name">
                        {person(member.name)}
                        {member.role === "OWNER" ? (
                          <span className="chip chip-primary">管理员</span>
                        ) : (
                          <span className="chip chip-ghost">记账员</span>
                        )}
                      </div>
                      <div className="member-sub">
                        {maskPhoneValue(member.phoneNumberMasked)} · 加入于 {formatDate(member.joinedAt)}
                      </div>
                    </div>
                    {isOwner && member.userId !== myId ? (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => setTransferTarget(member)}
                      >
                        设为管理员
                      </button>
                    ) : member.userId === myId && !isOwner ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setLeaveOpen(true)}
                      >
                        <Icon name="logout" size={13} />
                        退出
                      </button>
                    ) : (
                      <span className="caption">
                        {member.role === "OWNER" ? "完整权限" : "可增删改"}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="notice">
            <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
            <span>
              账本内的所有记录对所有成员实时可见。邀请链接一次性有效，7 天后自动过期；
              接受邀请后对方成为「记账员」，可自由增删改本账本的亲友与礼金记录。
            </span>
          </div>
        </div>

        <div className="dash-side">
          <div className="card card-pad">
            <div className="row between" style={{ marginBottom: 10 }}>
              <h3 className="title-sm">快速邀请家人</h3>
              <span className="chip chip-primary">一次性链接</span>
            </div>

            {invite ? (
              <div className="col" style={{ gap: 10 }}>
                <div className="notice" style={{ background: "var(--primary-tint)" }}>
                  <Icon name="link" size={15} style={{ flex: "none", marginTop: 2 }} />
                  <span style={{ wordBreak: "break-all", color: "var(--ink-2)" }}>{invite.url}</span>
                </div>
                <div className="caption">有效期至 {formatDate(invite.expiresAt)}</div>
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn btn-primary btn-sm grow" onClick={copyInvite}>
                    <Icon name="copy" size={14} />
                    复制链接
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setInvite(null)}
                  >
                    收起
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="caption" style={{ lineHeight: 1.8, marginBottom: 12 }}>
                  生成一条邀请链接，发给家人。对方登录后打开即可加入本账本，无需重复注册。
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={generateInvite}
                  disabled={inviting}
                >
                  {inviting ? <Spinner /> : <Icon name="link" size={15} />}
                  生成邀请链接
                </button>
              </>
            )}
          </div>

          <div className="card card-pad">
            <div className="row between" style={{ marginBottom: 10 }}>
              <h3 className="title-sm">我的账本</h3>
              <span className="caption">{ledgers.length} 本</span>
            </div>

            <div className="col" style={{ gap: 6 }}>
              {ledgers.map((ledger) => (
                <div
                  key={ledger.id}
                  className="row"
                  style={{
                    padding: "9px 10px",
                    borderRadius: 10,
                    background: ledger.id === ledgerId ? "var(--primary-tint)" : "transparent",
                    border:
                      ledger.id === ledgerId
                        ? "1px solid var(--primary-border)"
                        : "1px solid transparent",
                  }}
                >
                  <button
                    type="button"
                    className="grow"
                    style={{
                      background: "none",
                      border: "none",
                      textAlign: "left",
                      padding: 0,
                    }}
                    onClick={() => switchLedger(ledger.id)}
                  >
                    <div className="title-sm" style={{ fontSize: 13 }}>
                      {ledger.name}
                    </div>
                    <div className="caption">
                      {ledger.role === "OWNER" ? "管理员" : "记账员"} · {ledger.memberCount} 人
                      {ledger.isDefault ? " · 默认" : ""}
                    </div>
                  </button>
                  {ledger.id !== ledgerId ? (
                    <button
                      type="button"
                      className="btn btn-quiet btn-sm"
                      onClick={() => switchLedger(ledger.id)}
                    >
                      切换
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            {currentLedger && !currentLedger.isDefault ? (
              <button
                type="button"
                className="btn btn-ghost btn-block btn-sm"
                style={{ marginTop: 10 }}
                onClick={async () => {
                  try {
                    await setDefaultLedger(currentLedger.id);
                    toast("已设为默认账本");
                  } catch {
                    toast("设置失败", "error");
                  }
                }}
              >
                设为默认账本
              </button>
            ) : null}

            <button
              type="button"
              className="btn btn-ghost btn-block btn-sm"
              style={{ marginTop: 10 }}
              onClick={exportData}
              disabled={exporting}
            >
              {exporting ? <Spinner /> : <Icon name="download" size={14} />}
              导出账本数据（JSON）
            </button>
          </div>

          <div className="quote-card">
            <div className="row" style={{ gap: 6, marginBottom: 8 }}>
              <Icon name="sparkle" size={15} style={{ color: "var(--amber)" }} />
              <span className="title-sm" style={{ fontSize: 13 }}>
                共同维护小贴士
              </span>
            </div>
            <p className="quote-text">
              一家人同记一本账，最忌重复与遗漏。收礼当天记一笔，回礼前先看对账单，
              长辈的往来可由子女代录，年末一起核对一次即可安心。
            </p>
            {owner ? <div className="quote-source">账本管理员 · {person(owner.name)}</div> : null}
          </div>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建账本"
        subtitle="例如「父母家的人情账」「长女婚嫁专簿」"
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCreateOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary grow"
              onClick={submitCreate}
              disabled={creating}
            >
              {creating ? <Spinner /> : <Icon name="check" size={15} />}
              创建并切换
            </button>
          </>
        }
      >
        <div className="field">
          <span className="label">账本名称</span>
          <input
            className="input"
            placeholder="如：父母家的人情账"
            maxLength={50}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
          <span className="field-hint">创建后你会成为管理员，可邀请家人共同记账。</span>
        </div>
      </Modal>

      <Modal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="重命名账本"
        subtitle="新名称会同步给该账本的所有成员"
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setRenameOpen(false)}
              disabled={renaming}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary grow"
              onClick={rename}
              disabled={renaming}
            >
              {renaming ? <Spinner /> : <Icon name="check" size={15} />}
              保存
            </button>
          </>
        }
      >
        <div className="field">
          <span className="label">账本名称</span>
          <input
            className="input"
            maxLength={50}
            placeholder="如：父母家的人情账"
            value={newLedgerName}
            onChange={(event) => setNewLedgerName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void rename();
            }}
          />
          <span className="field-hint">最多 50 个字符。</span>
        </div>
      </Modal>

      <Modal
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="退出账本"
        subtitle={`退出「${currentLedger?.name ?? ""}」后，你将无法再查看或修改该账本的任何记录`}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setLeaveOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary grow"
              onClick={leave}
              disabled={leaving}
            >
              {leaving ? <Spinner /> : <Icon name="logout" size={15} />}
              确认退出
            </button>
          </>
        }
      >
        <div className="notice">
          <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
          <span>
            退出后你对这个账本的记录将不再可见。如果只是想换一本记，直接在「我的账本」里切换即可，
            不需要退出。
          </span>
        </div>
      </Modal>

      <Modal
        open={transferTarget !== null}
        onClose={() => setTransferTarget(null)}
        title="转让管理员"
        subtitle={
          transferTarget
            ? `把「${currentLedger?.name ?? ""}」的管理员转让给 ${person(transferTarget.name)}`
            : ""
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setTransferTarget(null)}
            >
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary grow"
              onClick={transfer}
              disabled={transferring}
            >
              {transferring ? <Spinner /> : <Icon name="check" size={15} />}
              确认转让
            </button>
          </>
        }
      >
        <div className="notice">
          <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
          <span>
            转让后你将成为普通记账员，对方获得完整权限（可改名、邀请成员、再次转让）。
            这个操作不可撤销，除非对方再转回给你。
          </span>
        </div>
      </Modal>
    </div>
  );
}
