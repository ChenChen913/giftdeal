/** 金额换算：内部一律用「分」的整数，禁止浮点参与计算 */

export function centsToYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** 仅用于校验/展示，落库前必须是整数分 */
export function yuanToCents(yuan: number): number {
  return Math.round(yuan * 100);
}
