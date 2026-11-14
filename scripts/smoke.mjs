#!/usr/bin/env node
/**
 * 接口冒烟测试（Node 原生 fetch，无额外依赖）。
 *
 * 前置：数据库已迁移并 seed，服务已启动。
 *   npx prisma db seed -- --reset
 *   npm run build && npm run start
 *   node scripts/smoke.mjs http://localhost:3000
 *
 * 覆盖：登录 → 账本 → 汇总 → 联系人搜索 → 按人对账 → 新建/结清/回退 → 待回礼
 *        → 越权与上下文校验 → 邀请
 */

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const PHONE = process.env.SMOKE_PHONE ?? "+8613800000001";
const CODE = process.env.SMOKE_CODE ?? "123456";

let cookieJar = [];
let passed = 0;
let failed = 0;

function rememberCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const item of raw) {
    const pair = item.split(";")[0];
    const name = pair.split("=")[0];
    cookieJar = cookieJar.filter((c) => c.split("=")[0] !== name);
    cookieJar.push(pair);
  }
}

async function call(method, path, options = {}) {
  const headers = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.ledgerId) headers["X-Ledger-Id"] = options.ledgerId;
  if (cookieJar.length > 0) headers.Cookie = cookieJar.join("; ");

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  rememberCookies(response);

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, body: json };
}

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}${detail ? `\n      ${JSON.stringify(detail)}` : ""}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function main() {
  console.log(`冒烟测试目标: ${BASE}`);

  // ---------- 1. 认证 ----------
  section("1. 手机号 + 验证码登录");
  const send = await call("POST", "/api/auth/phone-number/send-otp", {
    body: { phoneNumber: PHONE },
  });
  check("发送验证码返回 200", send.status === 200, send.body);

  const verify = await call("POST", "/api/auth/phone-number/verify", {
    body: { phoneNumber: PHONE, code: CODE },
  });
  check("验证码校验成功并下发会话", verify.status === 200, verify.body);
  check("拿到会话 Cookie", cookieJar.length > 0, cookieJar);

  const me = await call("GET", "/api/v1/me");
  check("GET /me 返回 200", me.status === 200, me.body);
  check("默认账本存在", Boolean(me.body?.data?.defaultLedgerId), me.body);
  const ledgerId = me.body?.data?.defaultLedgerId;

  // ---------- 2. 账本 ----------
  section("2. 多账本");
  const ledgers = await call("GET", "/api/v1/ledgers");
  check("账本列表返回 2 个", ledgers.body?.data?.items?.length === 2, ledgers.body);

  const overview = await call("GET", "/api/v1/overview", { ledgerId });
  check("汇总：送出 430000 分", overview.body?.data?.givenTotalCents === 430000, overview.body);
  check("汇总：收到 410000 分", overview.body?.data?.receivedTotalCents === 410000, overview.body);
  check("汇总：净差额 -20000 分", overview.body?.data?.netCents === -20000, overview.body);
  check("汇总：待回礼 5 笔", overview.body?.data?.pendingReturnCount === 5, overview.body);

  // ---------- 3. 联系人 ----------
  section("3. 联系人搜索与 CRUD");
  const search = await call("GET", "/api/v1/contacts?q=%E7%8E%8B", { ledgerId });
  check("模糊搜索「王」命中 1 人", search.body?.data?.items?.length === 1, search.body);
  check("命中王建国", search.body?.data?.items?.[0]?.name === "王建国", search.body?.data?.items);

  const wang = search.body?.data?.items?.[0];
  check("王建国净差额 +50000 分", wang?.stats?.netCents === 50000, wang?.stats);

  const created = await call("POST", "/api/v1/contacts", {
    ledgerId,
    body: { name: "冒烟测试", relationTag: "同事" },
  });
  check("新建联系人返回 201", created.status === 201, created.body);

  const duplicate = await call("POST", "/api/v1/contacts", {
    ledgerId,
    body: { name: "冒烟测试" },
  });
  check(
    "重名返回 409 CONTACT_NAME_DUPLICATE",
    duplicate.status === 409 && duplicate.body?.error?.code === "CONTACT_NAME_DUPLICATE",
    duplicate.body,
  );

  // ---------- 4. 按人对账 ----------
  section("4. 按人对账");
  const settlement = await call("GET", "/api/v1/contacts/con_a_001/settlement", { ledgerId });
  check("对账返回 200", settlement.status === 200, settlement.body);
  check("王建国收到 130000 分", settlement.body?.data?.summary?.receivedTotalCents === 130000);
  check("王建国净差额 50000 分", settlement.body?.data?.summary?.netCents === 50000);
  check("流水 3 条", settlement.body?.data?.records?.length === 3, settlement.body?.data?.records);

  // ---------- 5. 记录 + 关联结清 ----------
  section("5. 新建记录并关联结清");
  const before = await call("GET", "/api/v1/pending-returns", { ledgerId });
  const beforeCount = before.body?.data?.total;

  const newRecord = await call("POST", "/api/v1/records", {
    ledgerId,
    body: {
      contactId: "con_a_001",
      direction: "GIVEN",
      amountCents: 50000,
      scene: "WEDDING",
      occurredAt: "2026-10-01",
      note: "冒烟回礼",
      settlesRecordId: "rec_a_002",
    },
  });
  check("创建记录返回 201", newRecord.status === 201, newRecord.body);
  check("目标收礼已结清", newRecord.body?.data?.settledRecord?.isSettled === true, newRecord.body);

  const after = await call("GET", "/api/v1/pending-returns", { ledgerId });
  check("待回礼减少 1 笔", after.body?.data?.total === beforeCount - 1, after.body?.data?.total);

  const recordId = newRecord.body?.data?.record?.id;

  // ---------- 6. 删除记录回退结清 ----------
  section("6. 删除送出记录 → 结清回退");
  const removed = await call("DELETE", `/api/v1/records/${recordId}`, { ledgerId });
  check("删除返回 200", removed.status === 200, removed.body);
  check(
    "返回被回退的收到记录 id",
    removed.body?.data?.relatedRecordId === "rec_a_002",
    removed.body,
  );

  const restored = await call("GET", "/api/v1/pending-returns", { ledgerId });
  check("待回礼恢复为原数量", restored.body?.data?.total === beforeCount, restored.body?.data?.total);

  // ---------- 7. 手动结清 ----------
  section("7. 手动结清 / 重复结清");
  const settled = await call("POST", "/api/v1/records/rec_a_003/settle", { ledgerId });
  check("手动结清成功", settled.body?.data?.record?.isSettled === true, settled.body);

  const settleAgain = await call("POST", "/api/v1/records/rec_a_003/settle", { ledgerId });
  check(
    "重复结清返回 409 RECORD_ALREADY_SETTLED",
    settleAgain.status === 409 && settleAgain.body?.error?.code === "RECORD_ALREADY_SETTLED",
    settleAgain.body,
  );

  const settleGiven = await call("POST", "/api/v1/records/rec_a_004/settle", { ledgerId });
  check(
    "对送出记录结清返回 409 RECORD_NOT_SETTLEABLE",
    settleGiven.status === 409 && settleGiven.body?.error?.code === "RECORD_NOT_SETTLEABLE",
    settleGiven.body,
  );

  const unsettled = await call("POST", "/api/v1/records/rec_a_003/unsettle", { ledgerId });
  check("反结清成功", unsettled.body?.data?.record?.isSettled === false, unsettled.body);

  // ---------- 8. 数据隔离 ----------
  section("8. 数据隔离与上下文校验");
  const noLedger = await call("GET", "/api/v1/contacts");
  check(
    "缺少 X-Ledger-Id 返回 400 LEDGER_REQUIRED",
    noLedger.status === 400 && noLedger.body?.error?.code === "LEDGER_REQUIRED",
    noLedger.body,
  );

  const unknownLedger = await call("GET", "/api/v1/contacts", { ledgerId: "led_not_exist" });
  check(
    "不存在的账本返回 404 LEDGER_NOT_FOUND",
    unknownLedger.status === 404 && unknownLedger.body?.error?.code === "LEDGER_NOT_FOUND",
    unknownLedger.body,
  );

  const crossLedger = await call("GET", "/api/v1/records/rec_a_001", { ledgerId: "led_li" });
  check(
    "跨账本读取记录返回 404",
    crossLedger.status === 404 && crossLedger.body?.error?.code === "NOT_FOUND",
    crossLedger.body,
  );

  const unauth = await fetch(`${BASE}/api/v1/ledgers`);
  check("未登录访问返回 401", unauth.status === 401);

  // ---------- 9. 邀请 ----------
  section("9. 邀请");
  const invite = await call("POST", "/api/v1/invites", { ledgerId, body: {} });
  check("生成邀请返回 201", invite.status === 201, invite.body);
  const token = invite.body?.data?.invite?.token;

  const inviteInfo = await call("GET", `/api/v1/invites/${token}`);
  check("邀请详情状态 PENDING", inviteInfo.body?.data?.invite?.status === "PENDING", inviteInfo.body);
  check(
    "邀请人自己看 alreadyMember=true",
    inviteInfo.body?.data?.alreadyMember === true,
    inviteInfo.body,
  );

  const accept = await call("POST", `/api/v1/invites/${token}/accept`);
  check("已加入者接受邀请幂等返回 alreadyMember=true", accept.body?.data?.alreadyMember === true, accept.body);

  // 用一个全新手机号走「非成员接受邀请」的完整路径
  // 每次跑用不同号码，避免上一轮残留的成员关系影响断言
  const NEW_PHONE =
    process.env.SMOKE_NEW_PHONE ??
    `+8613${String(Date.now()).slice(-9)}`;
  const inviterJar = cookieJar;

  cookieJar = [];
  await call("POST", "/api/auth/phone-number/send-otp", { body: { phoneNumber: NEW_PHONE } });
  const newLogin = await call("POST", "/api/auth/phone-number/verify", {
    body: { phoneNumber: NEW_PHONE, code: CODE },
  });
  check("新用户首次登录成功", newLogin.status === 200, newLogin.body);

  const newcomerJar = cookieJar;
  cookieJar = inviterJar;

  cookieJar = newcomerJar;
  const newcomerView = await call("GET", `/api/v1/invites/${token}`);
  check("新用户看 alreadyMember=false", newcomerView.body?.data?.alreadyMember === false, newcomerView.body);

  const newcomerAccept = await call("POST", `/api/v1/invites/${token}/accept`);
  check("新用户接受邀请成功", newcomerAccept.body?.data?.alreadyMember === false, newcomerAccept.body);
  check("新成员角色为 MEMBER", newcomerAccept.body?.data?.ledger?.role === "MEMBER", newcomerAccept.body);

  const newcomerLedgers = await call("GET", "/api/v1/ledgers");
  check(
    "新用户账本列表包含 2 个账本",
    newcomerLedgers.body?.data?.items?.length === 2,
    newcomerLedgers.body?.data?.items,
  );

  const repeatAccept = await call("POST", `/api/v1/invites/${token}/accept`);
  check(
    "重复接受同一邀请返回 410 INVITE_USED",
    repeatAccept.status === 410 && repeatAccept.body?.error?.code === "INVITE_USED",
    repeatAccept.body,
  );

  cookieJar = inviterJar;

  // ---------- 10. 人情预备 ----------
  section("10. 人情预备");
  const planList = await call("GET", "/api/v1/plans?status=PLANNED", { ledgerId });
  check("预备列表返回 200", planList.status === 200, planList.body);
  check("预备列表默认只含 PLANNED", planList.body?.data?.items?.every((x) => x.status === "PLANNED") === true, planList.body);

  const planCreate = await call("POST", "/api/v1/plans", {
    ledgerId,
    body: {
      contactId: created.body?.data?.contact?.id,
      scene: "WEDDING",
      plannedCents: 66000,
      expectedAt: "2027-06-01",
      note: "冒烟测试预备",
    },
  });
  check("新建预备返回 201", planCreate.status === 201, planCreate.body);
  const planId = planCreate.body?.data?.plan?.id;
  check("预备金额单位为分", planCreate.body?.data?.plan?.plannedCents === 66000, planCreate.body);
  check("预备状态为 PLANNED", planCreate.body?.data?.plan?.status === "PLANNED", planCreate.body);

  const planPatch = await call("PATCH", `/api/v1/plans/${planId}`, {
    ledgerId,
    body: { plannedCents: 88000, note: "已改" },
  });
  check("修改预备金额生效", planPatch.body?.data?.plan?.plannedCents === 88000, planPatch.body);

  const planComplete = await call("POST", `/api/v1/plans/${planId}/complete`, {
    ledgerId,
    body: { createRecord: true, amountCents: 88000 },
  });
  check("完成预备返回 200", planComplete.status === 200, planComplete.body);
  check("完成同时生成真实记录", Boolean(planComplete.body?.data?.record?.id), planComplete.body);
  check("完成关联 recordId", planComplete.body?.data?.plan?.recordId === planComplete.body?.data?.record?.id, planComplete.body);
  check("完成后状态为 DONE", planComplete.body?.data?.plan?.status === "DONE", planComplete.body);

  const planRepeat = await call("POST", `/api/v1/plans/${planId}/complete`, { ledgerId, body: {} });
  check("重复完成返回 409", planRepeat.status === 409, planRepeat.body);

  const planPatchDone = await call("PATCH", `/api/v1/plans/${planId}`, {
    ledgerId,
    body: { plannedCents: 10000 },
  });
  check("已完成预备不可再改返回 409", planPatchDone.status === 409, planPatchDone.body);

  const planOnlyDone = await call("POST", "/api/v1/plans", {
    ledgerId,
    body: {
      contactId: created.body?.data?.contact?.id,
      scene: "OTHER",
      plannedCents: 10000,
      expectedAt: "2027-07-01",
    },
  });
  const planId2 = planOnlyDone.body?.data?.plan?.id;
  const onlyDone = await call("POST", `/api/v1/plans/${planId2}/complete`, {
    ledgerId,
    body: { createRecord: false },
  });
  check("只标记完成不记账时 record=null", onlyDone.body?.data?.record === null, onlyDone.body);
  check("只标记完成时 recordId=null", onlyDone.body?.data?.plan?.recordId === null, onlyDone.body);

  const overviewPlans = await call("GET", "/api/v1/overview", { ledgerId });
  check("overview 含 planCount 字段", typeof overviewPlans.body?.data?.planCount === "number", overviewPlans.body);

  const planCross = await call("GET", `/api/v1/plans/${planId}`, { ledgerId: "led_li" });
  check("跨账本读预备返回 404", planCross.status === 404, planCross.body);

  // 完成预备时生成的真实记录要一并清掉，避免影响 seed 的数字
  await call("DELETE", `/api/v1/records/${planComplete.body?.data?.record?.id}`, { ledgerId });
  await call("DELETE", `/api/v1/plans/${planId}`, { ledgerId });
  await call("DELETE", `/api/v1/plans/${planId2}`, { ledgerId });
  const planDeleted = await call("GET", `/api/v1/plans/${planId}`, { ledgerId });
  check("删除预备后不可再查", planDeleted.status === 404, planDeleted.body);

  // ---------- 11. 隐私模式 ----------
  section("11. 隐私模式");
  const PRIVACY_PASSWORD = process.env.SMOKE_PRIVACY_PASSWORD ?? "331633";

  const privacyInit = await call("GET", "/api/v1/privacy/status");
  check("初始状态为未解锁", privacyInit.body?.data?.unlocked === false, privacyInit.body);

  const wrongPassword = await call("POST", "/api/v1/privacy/verify", {
    body: { password: "000000" },
  });
  check(
    "错误密码返回 422 PRIVACY_PASSWORD_INVALID",
    wrongPassword.status === 422 && wrongPassword.body?.error?.code === "PRIVACY_PASSWORD_INVALID",
    wrongPassword.body,
  );

  const goodPassword = await call("POST", "/api/v1/privacy/verify", {
    body: { password: PRIVACY_PASSWORD },
  });
  check("正确密码解锁成功", goodPassword.body?.data?.unlocked === true, goodPassword.body);
  check("返回解锁到期时间", Boolean(goodPassword.body?.data?.expiresAt), goodPassword.body);

  const afterUnlock = await call("GET", "/api/v1/privacy/status");
  check("解锁后状态为已解锁", afterUnlock.body?.data?.unlocked === true, afterUnlock.body);

  const locked = await call("POST", "/api/v1/privacy/lock", { body: {} });
  check("主动上锁成功", locked.body?.data?.unlocked === false, locked.body);
  const afterLock = await call("GET", "/api/v1/privacy/status");
  check("上锁后回到未解锁", afterLock.body?.data?.unlocked === false, afterLock.body);

  const reUnlock = await call("POST", "/api/v1/privacy/verify", {
    body: { password: PRIVACY_PASSWORD },
  });
  check("上锁后可用密码再次解锁", reUnlock.body?.data?.unlocked === true, reUnlock.body);
  await call("POST", "/api/v1/privacy/lock", { body: {} });

  // ---------- 12. 清理 ----------
  section("12. 清理冒烟数据");
  const cleanup = await call("DELETE", `/api/v1/contacts/${created.body?.data?.contact?.id}`, {
    ledgerId,
  });
  check("删除测试联系人", cleanup.body?.data?.deleted === true, cleanup.body);

  console.log(`\n结果：${passed} 通过，${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("冒烟测试异常：", error);
  process.exit(1);
});
