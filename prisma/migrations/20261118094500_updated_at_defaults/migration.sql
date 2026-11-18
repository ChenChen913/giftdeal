-- 给 updated_at 补数据库默认值
--
-- 背景：Prisma 的 @updatedAt 是「客户端生成」，初始迁移里的 updated_at 只有
-- NOT NULL 没有 DEFAULT。Drizzle 的 schema 声明了 .defaultNow()，插入时省略该列
-- 会写 DEFAULT，于是报 not-null violation——新建联系人 / 记录 / 账本都会失败。
--
-- 这里把默认值补到数据库层，Prisma 与 Drizzle 的行为就一致了；
-- 已有的显式赋值不受影响。

ALTER TABLE "user" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "session" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "account" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "verification" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ledger" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "contact" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "record" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "gift_plan" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "life_event" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
