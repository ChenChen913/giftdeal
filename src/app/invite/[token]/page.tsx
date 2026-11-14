"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Icon } from "@/components/icons";
import { useAuth, useLedger, useToast, usePrivacy } from "@/components/providers";
import { Spinner } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { InviteInfo } from "@/lib/types";

const STATUS_COPY: Record<string, { title: string; desc: string }> = {
  USED: { title: "邀请已被使用", desc: "这条邀请已经有人接受过了，请让家人重新生成一条。" },
  EXPIRED: { title: "邀请已过期", desc: "邀请链接超过有效期，请让家人重新生成一条。" },
  REVOKED: { title: "邀请已撤销", desc: "邀请人已撤销这条链接。" },
};

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { switchLedger, refresh } = useLedger();
  const { toast } = useToast();
  const { person } = usePrivacy();

  const [data, setData] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
    }
  }, [authLoading, user, router, token]);

  const load = useCallback(async () => {
    if (!token || !user) return;
    setLoading(true);
    try {
      const result = await api<InviteInfo>(`/api/v1/invites/${token}`);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "邀请不存在或已失效");
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async () => {
    setJoining(true);
    try {
      const result = await api<{
        ledger: { id: string; name: string; role: string; memberCount: number };
        alreadyMember: boolean;
      }>(`/api/v1/invites/${token}/accept`, { method: "POST" });

      switchLedger(result.ledger.id);
      await refresh();
      toast(result.alreadyMember ? "你已在这个账本里" : "已加入账本");
      router.replace("/");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "INVITE_USED") toast("这条邀请已被使用", "error");
        else if (err.code === "INVITE_EXPIRED") toast("邀请已过期", "error");
        else toast(err.message, "error");
      } else {
        toast("加入失败，请稍后重试", "error");
      }
    } finally {
      setJoining(false);
    }
  };

  const status = data?.invite.status;

  return (
    <div className="invite-page">
      <div className="invite-card">
        <div className="row" style={{ justifyContent: "center" }}>
          <span className="brand-mark" style={{ width: 46, height: 46, fontSize: 22 }}>
            礼
          </span>
        </div>

        {loading ? (
          <div className="col" style={{ alignItems: "center", gap: 12, padding: "20px 0" }}>
            <Spinner />
            <span className="caption">正在读取邀请…</span>
          </div>
        ) : error ? (
          <>
            <h1 className="title-lg">邀请不可用</h1>
            <p className="caption">{error}</p>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => router.replace("/")}>
              返回我的账本
            </button>
          </>
        ) : data ? (
          <>
            <div>
              <div className="eyebrow">家庭账簿邀请</div>
              <h1 className="title-lg" style={{ marginTop: 6 }}>
                {person(data.invite.inviterName)} 邀请你共管
                <br />
                「{data.invite.ledger.name}」
              </h1>
              <p className="caption" style={{ marginTop: 8 }}>
                已有 {data.invite.ledger.memberCount} 位家人 · 邀请有效期至{" "}
                {formatDate(data.invite.expiresAt)}
              </p>
            </div>

            <div className="notice" style={{ textAlign: "left" }}>
              <Icon name="info" size={16} style={{ flex: "none", marginTop: 1 }} />
              <span>
                加入后你可以查看并维护该账本的全部亲友与礼金记录，所有变动对家人实时可见。
              </span>
            </div>

            {status === "PENDING" || data.alreadyMember ? (
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={accept}
                disabled={joining}
              >
                {joining ? <Spinner /> : <Icon name="arrowRight" size={16} />}
                {data.alreadyMember ? "进入账本" : "接受邀请 · 加入账本"}
              </button>
            ) : (
              <div className="col" style={{ gap: 8 }}>
                <div className="chip chip-amber" style={{ alignSelf: "center" }}>
                  {STATUS_COPY[status ?? ""]?.title ?? "邀请不可用"}
                </div>
                <p className="caption">{STATUS_COPY[status ?? ""]?.desc ?? ""}</p>
              </div>
            )}

            <button
              type="button"
              className="btn btn-quiet btn-block"
              onClick={() => router.replace("/")}
            >
              先回我的账本
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
