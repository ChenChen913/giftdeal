import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext for Cloudflare 配置。
 *
 * 不启用 R2 增量缓存：本项目没有 ISR / revalidate，
 * 页面全部是客户端渲染 + 动态 Route Handler，用默认的内存缓存即可。
 * 后续若要加 ISR，再补 NEXT_INC_CACHE_R2_BUCKET 绑定与 r2IncrementalCache。
 */
export default defineCloudflareConfig({});
