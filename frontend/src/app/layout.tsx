import type { Metadata } from "next";
import { Shell } from "@/components/session";
import "./globals.css";
export const metadata: Metadata = {
  title: "拾光工坊 · 创意图片制作",
  description: "选择模板，上传照片，收藏每一次灵感。",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
