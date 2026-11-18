import assert from "node:assert/strict";
import test from "node:test";

import { is, sql } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import * as schema from "@/server/schema";
import { startTestDatabase } from "./helpers/test-db";
import { type Db } from "./helpers/fixtures";

const database = await startTestDatabase();
const { db } = (await import("@/server/db-drizzle")) as unknown as { db: Db };

type ColumnRow = {
  table_name: string;
  column_name: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
};

test.after(async () => {
  await database.close();
});

test("Drizzle schema 与迁移后的真实数据库一致（列名 / 可空性 / 默认值）", async () => {
  const result = await db.execute<ColumnRow>(sql`
    select table_name, column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
  `);

  const actual = new Map<string, Map<string, ColumnRow>>();
  for (const row of result.rows) {
    if (!actual.has(row.table_name)) actual.set(row.table_name, new Map());
    actual.get(row.table_name)!.set(row.column_name, row);
  }

  const tables = Object.values(schema).filter((value) => is(value, PgTable));

  for (const table of tables) {
    const config = getTableConfig(table);
    const dbColumns = actual.get(config.name);
    assert.ok(dbColumns, `数据库缺少表 ${config.name}`);

    for (const column of config.columns) {
      const dbColumn = dbColumns.get(column.name);
      assert.ok(dbColumn, `${config.name}.${column.name} 在数据库中不存在`);

      const expectedNullable = !column.notNull;
      assert.equal(
        dbColumn.is_nullable === "YES",
        expectedNullable,
        `${config.name}.${column.name} 可空性与 Drizzle 不一致`,
      );

      if (column.hasDefault) {
        assert.ok(
          dbColumn.column_default !== null,
          `${config.name}.${column.name} 在 Drizzle 声明了默认值，但数据库没有`,
        );
      }
    }

    for (const name of dbColumns.keys()) {
      assert.ok(
        config.columns.some((column) => column.name === name),
        `数据库列 ${config.name}.${name} 没有出现在 Drizzle schema 中`,
      );
    }
  }
});

test("关键唯一约束存在（含软删除部分唯一索引）", async () => {
  const result = await db.execute<{ indexname: string }>(sql`
    select indexname from pg_indexes where schemaname = 'public'
  `);
  const indexes = new Set(result.rows.map((row) => row.indexname));

  for (const name of [
    "rate_limit_key_key",
    "record_settled_by_record_id_key",
    "membership_ledger_id_user_id_key",
    "invite_token_key",
    "user_phone_number_key",
    "contact_ledger_name_active_key",
  ]) {
    assert.ok(indexes.has(name), `缺少唯一索引 ${name}`);
  }
});
