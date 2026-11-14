import assert from "node:assert/strict";
import { test } from "node:test";

import { maskFreeText, maskMoney, maskPerson, maskPhone } from "./mask";
import { centsToYuan, yuanToCents } from "./money";

test("centsToYuan 始终保留两位小数", () => {
  assert.equal(centsToYuan(430000), "4300.00");
  assert.equal(centsToYuan(20), "0.20");
  assert.equal(centsToYuan(0), "0.00");
});

test("yuanToCents 四舍五入到分，不受浮点误差影响", () => {
  assert.equal(yuanToCents(4300), 430000);
  assert.equal(yuanToCents(0.1 + 0.2), 30);
  assert.equal(yuanToCents(19.99), 1999);
});

test("maskMoney 逐位替换数字，保留符号与分隔符", () => {
  assert.equal(maskMoney("¥4,300.00"), "¥*,***.**");
  assert.equal(maskMoney("¥20"), "¥**");
  assert.equal(maskMoney("-¥200"), "-¥***");
});

test("maskPerson 保留姓氏，识别复姓", () => {
  assert.equal(maskPerson("王建国"), "王");
  assert.equal(maskPerson("欧阳修"), "欧阳");
  assert.equal(maskPerson("司马光"), "司马");
  assert.equal(maskPerson(""), "某");
});

test("maskFreeText 只打码数字", () => {
  assert.equal(maskFreeText("二舅家的婚宴 800 元"), "二舅家的婚宴 *** 元");
  assert.equal(maskFreeText(null), "");
});

test("maskPhone 去国家码后打码，且不会二次打码", () => {
  assert.equal(maskPhone("+8613800000001"), "138****0001");
  assert.equal(maskPhone("13800000001"), "138****0001");
  assert.equal(maskPhone("138****0001"), "138****0001");
  assert.equal(maskPhone(""), "");
});
