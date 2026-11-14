"use client";

import { ContactList } from "@/components/contact-list";
import { Icon } from "@/components/icons";

export default function ContactsPage() {
  return (
    <div className="page">
      <div className="ledger-head">
        <div>
          <h1>人情对账</h1>
          <div className="caption" style={{ marginTop: 2 }}>
            理清双向礼数往还，知恩记谊，从容答礼
          </div>
        </div>
      </div>

      <div className="split">
        <ContactList />

        <div className="card desktop-only">
          <div className="empty" style={{ padding: "72px 24px" }}>
            <Icon name="swap" size={30} />
            <div className="empty-title">选择一位亲友，查看双向对账单</div>
            <div className="empty-desc">
              左侧名录按最近往来排序，点开即可看到全部收送流水、净差额与待回礼。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
