-- 通用固定窗口限流表
-- 用于隐私密码连续错误锁定、生产环境短信重发冷却。
-- 放数据库而不是进程内存，保证多实例部署下计数一致。

CREATE TABLE "throttle" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "throttle_pkey" PRIMARY KEY ("key")
);
