"use client";

import { useParams } from "next/navigation";

import { ContactDetail } from "@/components/contact-detail";
import { ContactList } from "@/components/contact-list";

export default function ContactDetailPage() {
  const params = useParams<{ contactId: string }>();
  const contactId = params?.contactId ?? "";

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
        <div className="desktop-only">
          <ContactList activeId={contactId} />
        </div>
        <ContactDetail contactId={contactId} />
      </div>
    </div>
  );
}
