-- 每本账本最多一个 OWNER。
--
-- 应用层的转让流程是「先降级旧 OWNER、再升级新 OWNER」（同一事务、条件更新），
-- 正常路径不会产生两个管理员；这个部分唯一索引是数据库层的最后一道保险：
-- 任何未来新增的写路径（脚本、后台任务、新的 API）都无法绕过它。
--
-- 说明：Prisma schema 不支持声明「部分索引」，`prisma migrate diff --to-schema`
-- 会忽略它（已验证输出 No difference detected）。因此这里手写迁移，
-- 并保持 Drizzle schema 与该索引一致（src/server/schema.ts）。

CREATE UNIQUE INDEX "membership_one_owner_per_ledger"
  ON "membership"("ledger_id")
  WHERE "role" = 'OWNER';
