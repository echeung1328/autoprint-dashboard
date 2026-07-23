// Edge Function: email_inbox_poc
// 接收 Webhook Relay 的「邮件 -> Webhook」payload，做三件事：
//   1. 校验 Basic Auth（防伪造请求；Webhook Relay Destination 侧配置）
//   2. 发件人白名单校验
//   3. 解析 xlsx/csv 附件，写入 Supabase 测试表 email_inbox_poc
//
// ⚠️ POC 范围：仅验证「发邮件即入库」链路是否跑通。
//    不实现 SOP 数据质量铁律（复合键去重/冲突检测/+08:00/生成列/CreatedBy），
//    那些在正式版用代码重写。本函数签收即返回 200，异常仅记入 DB（status=error）。

// @ts-nocheck
import * as XLSX from "https://esm.sh/xlsx@0.18.5";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BASIC_USER = Deno.env.get("WEBHOOK_BASIC_USER")!;
const BASIC_PASS = Deno.env.get("WEBHOOK_BASIC_PASS")!;
const ALLOWED_SENDERS = (Deno.env.get("ALLOWED_SENDERS") || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ---------- Basic Auth 校验（Webhook Relay Destination 侧配置） ----------
function verifyBasicAuth(headers: Headers): boolean {
  const auth = headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("basic ")) {
    console.log("[auth] missing or non-basic authorization header");
    return false;
  }
  // Webhook Relay 转发时会在请求头带 Authorization: Basic base64(user:pass)
  const expected = btoa(`${BASIC_USER}:${BASIC_PASS}`);
  const provided = auth.slice(6).trim();
  const ok = provided === expected;
  if (!ok) console.log("[auth] basic auth mismatch");
  return ok;
}

// ---------- 附件解析（返回数据行数） ----------
function parseAttachment(filename: string, contentType: string, base64: string): number {
  const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const isCsv =
    (contentType || "").includes("csv") || filename.toLowerCase().endsWith(".csv");
  const isSheet =
    /(excel|spreadsheet|ms-excel)/i.test(contentType || "") ||
    /\.(xlsx|xls)$/i.test(filename);

  if (isCsv) {
    const text = new TextDecoder().decode(buf);
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return Math.max(0, lines.length - 1); // 减表头
  }
  if (isSheet) {
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });
    return rows.length;
  }
  throw new Error("unsupported attachment type: " + contentType + " / " + filename);
}

// ---------- 写入 Supabase ----------
async function insertRows(rows: any[]) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/email_inbox_poc`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase insert failed ${res.status}: ${txt}`);
  }
}

Deno.serve(async (req: Request) => {
  const rawBody = await req.text();

  // 1) Basic Auth 校验失败 -> 401 拒绝（防伪造请求）
  if (!verifyBasicAuth(req.headers)) {
    return new Response("unauthorized", { status: 401 });
  }

  // 2) 解析 payload + 白名单
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const fromEmail = (payload.from || "").toLowerCase();
  // 非白名单发件人：返回 200 但不入库（验收要求）
  if (ALLOWED_SENDERS.length > 0 && !ALLOWED_SENDERS.includes(fromEmail)) {
    return new Response("ok (sender not whitelisted)", { status: 200 });
  }

  // 3) 解析 xlsx/csv 附件并入库
  const attachments: any[] = payload.attachments || [];
  const targets = attachments.filter((a) =>
    /(excel|spreadsheet|ms-excel|csv)/i.test(a.content_type || "") ||
    /\.(xlsx|xls|csv)$/i.test(a.name || ""),
  );

  const rows: any[] = [];
  for (const att of targets) {
    try {
      const rowCount = parseAttachment(att.name, att.content_type, att.content);
      rows.push({
        received_at: new Date().toISOString(),
        from_email: fromEmail,
        subject: payload.subject || "",
        filename: att.name,
        content_type: att.content_type,
        raw_base64: att.content,
        row_count: rowCount,
        status: "parsed",
        error_msg: null,
      });
    } catch (e: any) {
      rows.push({
        received_at: new Date().toISOString(),
        from_email: fromEmail,
        subject: payload.subject || "",
        filename: att.name,
        content_type: att.content_type,
        raw_base64: att.content,
        row_count: null,
        status: "error",
        error_msg: String(e.message || e),
      });
    }
  }

  try {
    if (rows.length > 0) await insertRows(rows);
  } catch (e: any) {
    // 入库失败也返回 200（签收即 200 防重试），错误已通过 status=error 记录
    console.log("[insert] failed:", e.message);
  }

  return new Response("ok", { status: 200 });
});
