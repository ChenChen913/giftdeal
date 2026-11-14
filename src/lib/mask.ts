/**
 * 隐私遮罩的纯函数规则（无 React 依赖，服务端/客户端都可用）。
 *
 * 口径（老板定的）：
 * - 金额：数值完全不可见，按格式化后数字的位数显示对应数量的星号。
 *   ¥400 → ¥***（三位），¥20 → ¥**（两位）。保留 ¥、千分位、小数点、负号，
 *   因此占位长度不变，界面不会跳动。
 * - 人名：只保留姓氏（中文取首字，复姓取前两字）。
 * - 自由文本（备注/事由）：把其中的连续数字替换为等长星号，避免从备注里读到金额。
 */

const DOUBLE_SURNAMES = [
  "欧阳", "司马", "上官", "诸葛", "夏侯", "皇甫", "尉迟", "公孙",
  "慕容", "长孙", "宇文", "司徒", "端木", "鲜于", "司空", "亓官",
  "颛孙", "澹台", "拓跋", "完颜", "耶律", "纳兰", "钟离", "百里",
];

export function maskMoney(formatted: string): string {
  return formatted.replace(/\d/g, "*");
}

export function maskPerson(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "某";
  const double = DOUBLE_SURNAMES.find((surname) => trimmed.startsWith(surname));
  return double ?? trimmed.slice(0, 1);
}

export function maskFreeText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/\d+/g, (run) => "*".repeat(run.length));
}

/** 手机号脱敏：138****0001 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  // 已经是掩码格式（含 *）就原样返回，避免二次打码
  if (phone.includes("*")) return phone;
  const digits = phone.replace(/\D/g, "").replace(/^86(?=1\d{10}$)/, "");
  if (digits.length < 7) return "***";
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}
