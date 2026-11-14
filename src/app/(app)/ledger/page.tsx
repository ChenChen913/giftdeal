"use client";

import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/icons";
import { useLedger, useToast, usePrivacy } from "@/components/providers";
import { Avatar, Empty, LoadingBlock, Modal, Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { LedgerDetail } from "@/lib/types";

type InviteResult = { token: string; url: string; expiresAt: string };

export default function LedgerPage() {
  const {
    ledgerId,
    ledgers,
    currentLedger,
    switchLedger,
    setDefaultLedger,
    createLedger,
    overview,
  } = useLedger();
  const { toast } = useToast();
  const { person, phone: maskPhoneValue } = usePrivacy();

  const [detail, setDetail] = useState<LedgerDetail | null>(null);
  const [loading, setLoading] = useState(true);
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

  const owner = detail?.members.find((member) => member.role === "OWNER");

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
                    <span className="caption">
                      {member.role === "OWNER" ? "完整权限" : "可增删改"}
                    </span>
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
    </div>
  );
}
