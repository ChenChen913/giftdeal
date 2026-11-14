import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "礼尚往来 · 人情账本",
  description: "以人为中心的双向礼金对账，记清每一份人情往来。",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /**
     * suppressHydrationWarning 只作用在 <html> 这一层：
     * 浏览器插件（Zotero、各类写作助手、翻译工具）常在 hydration 前
     * 往 <html> 上塞属性（如 data-yiwx-installed），React 会判定属性不匹配并报错。
     * 我们本身不动态改 <html> 属性，所以这里忽略外部注入是安全的。
     */
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
