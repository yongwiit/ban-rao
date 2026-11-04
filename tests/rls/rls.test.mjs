// ชุดทดสอบสิทธิ์ (RLS) ของบ้านเรา — รันกับโปรเจกต์ ban-rao-dev เท่านั้น
// ข้อมูลทั้งหมดเป็นของปลอมจาก supabase/dev/seed.sql
//
// วิธีรัน: DEV_SUPABASE_URL=... DEV_SUPABASE_KEY=... DEV_TEST_PASSWORD=... node --test tests/rls/
//
// ข้อที่มีป้าย todo คือช่องโหว่ที่รู้แล้วจาก Audit (F-xx) ทดสอบนี้เขียนตามพฤติกรรมที่ "ควรเป็น"
// ตอนนี้จึงยังไม่ผ่าน และจะผ่านเองเมื่อแก้ในเฟสถัดไป (แล้วค่อยเอาป้าย todo ออก)
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.DEV_SUPABASE_URL;
const KEY = process.env.DEV_SUPABASE_KEY;
const PW = process.env.DEV_TEST_PASSWORD;
const PROD_REF = "kzxiifuapumtnjpwcrxt";

if (!URL || !KEY || !PW) throw new Error("ต้องตั้ง DEV_SUPABASE_URL, DEV_SUPABASE_KEY, DEV_TEST_PASSWORD");
if (URL.includes(PROD_REF)) throw new Error("ห้ามรันชุดทดสอบนี้กับ Production");

const HA = "aaaaaaaa-0000-4000-8000-00000000000a";
const HB = "bbbbbbbb-0000-4000-8000-00000000000b";
const U = {
  aDad: "a0000000-0000-4000-8000-0000000000d1",
  aMom: "a0000000-0000-4000-8000-0000000000f1",
  aKid: "a0000000-0000-4000-8000-0000000000c1",
  bDad: "b0000000-0000-4000-8000-0000000000d1",
};
const EV = { mom: "e0000000-0000-4000-8000-0000000000a1", momPrivate: "e0000000-0000-4000-8000-0000000000a2", dad: "e0000000-0000-4000-8000-0000000000a3" };
const EXP = { shared: "ee000000-0000-4000-8000-0000000000a1", momPrivate: "ee000000-0000-4000-8000-0000000000a2" };
const LIST_A = "51000000-0000-4000-8000-0000000000a1";

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const anon = createClient(URL, KEY, opts);
async function as(email) {
  const c = createClient(URL, KEY, opts);
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`เข้าสู่ระบบ ${email} ไม่ได้: ${error.message}`);
  return c;
}
async function rows(c, table, filter = (q) => q) {
  const { data, error } = await filter(c.from(table).select("*"));
  return error ? [] : data;
}

const SHARED = ["households", "members", "household_people", "events", "event_comments", "shopping_lists", "shopping_items",
  "expenses", "expense_categories", "bills", "settlements", "savings_goals", "savings_deposits",
  "star_tasks", "star_rewards", "star_log", "love_notes", "hearts"];
const MONEY = ["expenses", "expense_categories", "bills", "settlements", "savings_goals", "savings_deposits"];
const SERVER_ONLY = ["app_secrets", "push_log", "notify_log", "line_link_codes"];

let aDad, aMom, aKid, bDad, outsider;
before(async () => {
  [aDad, aMom, aKid, bDad, outsider] = await Promise.all(
    ["a.dad", "a.mom", "a.kid1", "b.dad", "outsider"].map((n) => as(`${n}@example.com`)));
});

describe("คนที่ไม่ได้ล็อกอิน", () => {
  for (const t of [...SHARED, ...SERVER_ONLY, "calendar_tokens", "push_subscriptions", "calendar_imports", "line_links"]) {
    test(`anon อ่าน ${t} ไม่ได้`, async () => assert.equal((await rows(anon, t)).length, 0));
  }
  test("anon ฟีดปฏิทินด้วย token ผิด ได้ 0 แถว", async () => {
    const { data } = await anon.rpc("calendar_feed_v2", { p_token: "x".repeat(36) });
    assert.equal((data ?? []).length, 0);
  });
  test("anon ฟีดปฏิทินด้วย token ถูก เห็นนัดบ้าน A แต่ไม่เห็นนัดส่วนตัวของแม่", async () => {
    const { data, error } = await anon.rpc("calendar_feed_v2", { p_token: "ab".repeat(18) });
    assert.ifError(error);
    const ids = data.map((r) => r.id);
    assert.ok(ids.includes(EV.mom) && ids.includes(EV.dad));
    assert.ok(!ids.includes(EV.momPrivate));
  });
  test("anon เรียก household_kids ไม่ได้", { todo: "F-10" }, async () => {
    const { data } = await anon.rpc("household_kids", { p_code: "TESTAA" });
    assert.equal((data ?? []).length, 0);
  });
});

describe("แยกบ้าน: บ้าน B มองไม่เห็นและแก้บ้าน A ไม่ได้", () => {
  for (const t of SHARED) {
    test(`พ่อบ้าน B เห็น ${t} ของบ้าน A = 0`, async () => {
      const col = t === "households" ? "id" : "household_id";
      assert.equal((await rows(bDad, t, (q) => q.eq(col, HA))).length, 0);
    });
  }
  test("พ่อบ้าน B เพิ่มนัดเข้าบ้าน A ไม่ได้", async () => {
    const { error } = await bDad.from("events").insert({ household_id: HA, title: "แทรก", starts_at: new Date().toISOString() });
    assert.ok(error);
  });
  test("พ่อบ้าน B แก้ชื่อบ้าน A ไม่ได้", async () => {
    const { data } = await bDad.from("households").update({ name: "ถูกแก้" }).eq("id", HA).select("id");
    assert.equal((data ?? []).length, 0);
  });
  test("พ่อบ้าน B ส่งหัวใจให้พ่อบ้าน A ไม่ได้", async () => {
    const { error } = await bDad.from("hearts").insert({ household_id: HB, from_user: U.bDad, to_user: U.aDad });
    assert.ok(error);
  });
  test("คนนอกที่ยังไม่มีบ้าน เห็นข้อมูลทุกตาราง = 0", async () => {
    for (const t of SHARED) assert.equal((await rows(outsider, t)).length, 0, t);
  });
  test("คนนอกดูรายชื่อลูกของบ้านด้วยรหัสไม่ได้", { todo: "F-02" }, async () => {
    const { data } = await outsider.rpc("household_kids", { p_code: "TESTAA" });
    assert.equal((data ?? []).length, 0);
  });
});

describe("รายการส่วนตัว", () => {
  test("พ่อไม่เห็นนัดส่วนตัวของแม่ แม่เห็น", async () => {
    assert.equal((await rows(aDad, "events", (q) => q.eq("id", EV.momPrivate))).length, 0);
    assert.equal((await rows(aMom, "events", (q) => q.eq("id", EV.momPrivate))).length, 1);
  });
  test("พ่อไม่เห็นรายจ่ายส่วนตัวของแม่ แม่เห็น", async () => {
    assert.equal((await rows(aDad, "expenses", (q) => q.eq("id", EXP.momPrivate))).length, 0);
    assert.equal((await rows(aMom, "expenses", (q) => q.eq("id", EXP.momPrivate))).length, 1);
  });
  test("ลูกไม่เห็นโน้ตที่แม่เขียนถึงพ่อ แต่เห็นโน้ตถึงทุกคน", async () => {
    const notes = await rows(aKid, "love_notes");
    assert.equal(notes.length, 1);
    assert.equal(notes[0].to_user, null);
  });
  test("ตารางฝั่งเซิร์ฟเวอร์ พ่ออ่านไม่ได้", async () => {
    for (const t of SERVER_ONLY) assert.equal((await rows(aDad, t)).length, 0, t);
  });
});

describe("ลูก", () => {
  for (const t of MONEY) {
    test(`ลูกไม่เห็น ${t}`, async () => assert.equal((await rows(aKid, t)).length, 0));
  }
  test("ลูกเพิ่มรายจ่ายไม่ได้", async () => {
    const { error } = await aKid.from("expenses").insert({ household_id: HA, amount: 1, merchant: "ลูก" });
    assert.ok(error);
  });
  test("ลูกแก้ข้อมูลบ้านไม่ได้", async () => {
    const { data } = await aKid.from("households").update({ monthly_budget: 1 }).eq("id", HA).select("id");
    assert.equal((data ?? []).length, 0);
  });
  test("ลูกแก้คนในบ้านไม่ได้", async () => {
    const { data } = await aKid.from("household_people").update({ name: "ลูกแก้" }).eq("household_id", HA).select("key");
    assert.equal((data ?? []).length, 0);
  });
  test("ลูกให้ดาวตัวเองแบบอนุมัติแล้วไม่ได้", async () => {
    const { error } = await aKid.from("star_log").insert({ household_id: HA, kid: "pearl", kind: "earn", stars: 50, title: "โกง", status: "approved" });
    assert.ok(error);
  });
  test("ลูกเห็นนัดของบ้าน แต่ไม่เห็นนัดส่วนตัวของแม่", async () => {
    const ids = (await rows(aKid, "events")).map((e) => e.id);
    assert.ok(ids.includes(EV.mom) && !ids.includes(EV.momPrivate));
  });
  test("ลูกแก้นัดของพ่อไม่ได้", { todo: "F-09" }, async () => {
    const { data } = await aKid.from("events").update({ title: "ลูกแก้ (ทดสอบ)" }).eq("id", EV.dad).select("id");
    await aDad.from("events").update({ title: "ประชุมผู้ปกครอง (ทดสอบ)" }).eq("id", EV.dad); // คืนค่าเดิม
    assert.equal((data ?? []).length, 0);
  });
});

describe("ช่องโหว่ที่รู้แล้วจาก Audit", () => {
  test("ปลอมชื่อผู้สร้างรายการไม่ได้", { todo: "F-08" }, async () => {
    const { data, error } = await aMom.from("shopping_items")
      .insert({ list_id: LIST_A, household_id: HA, name: "ทดสอบปลอมผู้สร้าง", created_by: U.aDad }).select("id, created_by").single();
    if (!error) await aMom.from("shopping_items").delete().eq("id", data.id); // เก็บกวาด
    assert.ok(error || data.created_by === U.aMom);
  });
  test("มีวิธีเอาสมาชิกออกจากบ้าน", { todo: "F-03" }, async () => {
    const { error } = await aDad.rpc("remove_member", { p_user: U.aKid, p_dry_run: true });
    assert.ok(!error || error.code !== "PGRST202");
  });
  test("ลูกเข้าบ้านด้วยรหัส 6 ตัวทันทีไม่ได้ และสมาชิกลบบ้านไม่ได้", { todo: "F-02, F-01" }, async () => {
    // บ้านทิ้งได้: พ่อทดสอบสร้างบ้านใหม่ ลูกทดสอบเข้าด้วยรหัส แล้วลองลบบ้าน
    const sacDad = await as("sac.dad@example.com");
    const sacKid = await as("sac.kid@example.com");
    const { data: hid, error: e1 } = await sacDad.rpc("create_household", { p_role: "dad" });
    assert.ifError(e1);
    const [{ join_code }] = await rows(sacDad, "households", (q) => q.eq("id", hid));
    const { error: joinErr } = await sacKid.rpc("join_household", { p_code: join_code, p_role: "pearl" });
    const { data: deleted } = await sacKid.from("households").delete().eq("id", hid).select("id");
    if ((deleted ?? []).length === 0) await sacDad.from("households").delete().eq("id", hid); // เก็บกวาดถ้ายังอยู่
    assert.ok(joinErr, "F-02: เข้าบ้านได้ทันทีโดยไม่ต้องรออนุมัติ");
    assert.equal((deleted ?? []).length, 0, "F-01: ลบบ้านได้");
  });
});
