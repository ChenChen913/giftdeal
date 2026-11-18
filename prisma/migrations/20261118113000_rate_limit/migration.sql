-- Better Auth 数据库限流表
-- 用于 rateLimit.storage = "database"：多实例共享同一份计数，避免进程内限流失效。
-- key = "<ip>|<path>"；count 为窗口内计数；last_request 为毫秒时间戳（BIGINT）。

CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "last_request" BIGINT NOT NULL,

    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rate_limit_key_key" ON "rate_limit"("key");
