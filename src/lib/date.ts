/**
 * 日期一律按「自然日」处理：
 * - 数据库用 @db.Date，Prisma 返回 UTC 零点
 * - 对外只暴露 YYYY-MM-DD 字符串，避免时区把日期推前一天
 *
 * 注意：绝不能拿 `toISOString().slice(0, 10)` 当「今天」。
 * 那是 UTC 日期，东八区每天 00:00–08:00 会算成前一天。
 */

/** 应用统一时区：人情账本面向中国用户，服务端默认日期按东八区算 */
export const APP_TIMEZONE = "Asia/Shanghai";

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isRealDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = parseDateOnly(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return toDateOnly(parsed) === value;
}

/** 取某个时刻在指定时区下的年月日（不依赖 locale 的输出格式） */
function partsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

/** 服务端「今天」，按应用时区（Asia/Shanghai）计算 */
export function todayDateOnly(now: Date = new Date()): string {
  const { year, month, day } = partsInTimeZone(now, APP_TIMEZONE);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 浏览器本地时区的「今天」，供表单默认值使用（用户在中国即东八区） */
export function todayLocalDateOnly(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 自然日序号：数据库日期按 UTC 取，当前时刻按应用时区取 */
function civilDay(date: Date, timeZone?: string): number {
  if (!timeZone) {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }
  const { year, month, day } = partsInTimeZone(date, timeZone);
  return Date.UTC(year, month - 1, day);
}

/** 距今天数（自然日差），用于待回礼列表的 daysSince */
export function daysSince(date: Date, now: Date = new Date()): number {
  const a = civilDay(date);
  const b = civilDay(now, APP_TIMEZONE);
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/** 校验礼金日期范围：不早于 1950-01-01，不晚于今天 + 1 年 */
export function isOccurredAtInRange(value: string, now: Date = new Date()): boolean {
  if (!isRealDateOnly(value)) return false;
  const date = parseDateOnly(value);
  const min = Date.UTC(1950, 0, 1);
  const { year, month, day } = partsInTimeZone(now, APP_TIMEZONE);
  const max = Date.UTC(year + 1, month - 1, day);
  const ts = date.getTime();
  return ts >= min && ts <= max;
}

/** 距目标日期还有几天：正数=未来，0=今天，负数=已过 */
export function daysUntil(date: Date, now: Date = new Date()): number {
  const a = civilDay(now, APP_TIMEZONE);
  const b = civilDay(date);
  return Math.round((b - a) / 86_400_000);
}

/** 预计日期允许的范围：不早于 1950-01-01，不晚于 5 年后 */
export function isExpectedAtInRange(value: string, now: Date = new Date()): boolean {
  if (!isRealDateOnly(value)) return false;
  const date = parseDateOnly(value);
  const min = Date.UTC(1950, 0, 1);
  const { year, month, day } = partsInTimeZone(now, APP_TIMEZONE);
  const max = Date.UTC(year + 5, month - 1, day);
  const ts = date.getTime();
  return ts >= min && ts <= max;
}
