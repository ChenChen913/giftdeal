"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/components/providers";
import { RecordDialogProvider } from "@/components/record-dialog";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return (
      <div className="full-loader">
        <div className="row">
          <span className="spin" />
          <span>正在打开账本…</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <RecordDialogProvider>
      <AppShell>{children}</AppShell>
    </RecordDialogProvider>
  );
}
