// Edge Function: email_inbox_poc  (version 9 - production POC)
// 接收 Webhook Relay 的「邮件 -> Webhook」payload，做四件事：
//   1. 校验 Basic Auth（防伪造请求；Webhook Relay Destination 侧配置）
//   2. 发件人白名单校验（不在白名单则返 200 不入库）
//   3. 记录 meta 行（标记收到 N 个目标附件）
//   4. 把 xlsx/csv 附件以 base64 形式原样落入 Supabase 测试表
//
// ⚠️ POC 范围：仅验证「发邮件即入库」链路是否跑通。
//    不实现 SOP 数据质量铁律（复合键去重/冲突检测/+08:00/生成列/CreatedBy），
//    那些在正式版用代码重写。本函数签收即返回 200。
//
// ⚠️ 环境变量名注意：Supabase CLI v2.109+ 禁止设置以 SUPABASE_ 开头的环境变量
//    （护栏，防止覆盖 SUPABASE_ACCESS_TOKEN 等 CLI 内部变量），所以用 PROJECT_ 前缀。
//
// 关键变更（相对 v3）：
//   - 去掉 xlsx 库依赖（POC 阶段不解析，只把原文件以 base64 入库即可，体积小、冷启动快）
//   - 每次请求落 2 条：meta 行（filename="(meta)"）+ 附件行（filename=真实文件名，raw_base64=附件内容）
//   - Basic Auth 强制校验（Webhook Relay 已在 Request headers 配 Authorization: Basic ...）
//   - 错误信息直接写进 Response Body（便于 Webhook Relay UI 上直接看到失败原因）
//   - ResponseInit 预定义成常量（避免 `{status:200}` 被 JS 解析成块语句的歧义）

const PROJECT_URL = Deno.env.get("PROJECT_URL");
const ANON_KEY = Deno.env.get("PROJECT_ANON_KEY");
const BASIC_USER = Deno.env.get("WEBHOOK_BASIC_USER");
const BASIC_PASS = Deno.env.get("WEBHOOK_BASIC_PASS");
const ALLOWED_SENDERS = (Deno.env.get("ALLOWED_SENDERS") || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const EXPECTED_BASIC = btoa(`${BASIC_USER}:${BASIC_PASS}`);

// ResponseInit 常量（避免 `{status:200}` 被 JS 当块语句）
const OK = { status: 200 };
const E401 = { status: 401 };
const E400 = { status: 400 };
const E500 = { status: 500 };

// 启动期空值检查
function checkEnv() {
  const missing = [
    ["PROJECT_URL", PROJECT_URL],
    ["PROJECT_ANON_KEY", ANON_KEY],
    ["WEBHOOK_BASIC_USER", BASIC_USER],
    ["WEBHOOK_BASIC_PASS", BASIC_PASS],
  ]
    .filter(([_k, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error("missing env vars: " + missing.join(", "));
  }
}
checkEnv();

// ---------- 写入 Supabase ----------
async function insertRows(rows: any[]) {
  const res = await fetch(`${PROJECT_URL}/rest/v1/email_inbox_poc`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase insert failed ${res.status}: ${txt.slice(0, 200)}`);
  }
  return "ok";
}

Deno.serve(async (req: Request) => {
  // 1) Basic Auth 校验
  const auth = req.headers.get("authorization");
  if (
    !auth ||
    !auth.toLowerCase().startsWith("basic ") ||
    auth.slice(6).trim() !== EXPECTED_BASIC
  ) {
    const got = auth ? auth.slice(0, 40) : "(none)";
    return new Response(`auth-fail got=${got}`, E401);
  }

  // 2) 解析 JSON body
  let payload: any = null;
  let rawBody = "";
  try {
    rawBody = await req.text();
    payload = JSON.parse(rawBody);
  } catch (e: any) {
    return new Response(`invalid-json: ${e.message} body=${rawBody.slice(0, 200)}`, E400);
  }

  const fromEmail = (payload.from || "").toLowerCase();
  const base = {
    received_at: new Date().toISOString(),
    from_email: fromEmail,
    subject: payload.subject || "",
  };

  // 3) 过滤目标附件（xlsx/xls/csv）
  const attachments: any[] = payload.attachments || [];
  const targets = attachments.filter(
    (a) =>
      /(excel|spreadsheet|ms-excel|csv)/i.test(a.content_type || "") ||
      /\.(xlsx|xls|csv)$/i.test(a.name || ""),
  );

  // 4) 写 meta 行（标记收件情况）
  try {
    await insertRows([
      {
        ...base,
        filename: "(meta)",
        content_type: "text/plain",
        raw_base64: null,
        row_count: targets.length,
        status:
          ALLOWED_SENDERS.length > 0 && !ALLOWED_SENDERS.includes(fromEmail)
            ? "whitelist-rejected"
            : "received",
        error_msg: null,
      },
    ]);
  } catch (e: any) {
    console.log("[meta insert] failed:", e.message);
  }

  // 5) 白名单过滤
  if (ALLOWED_SENDERS.length > 0 && !ALLOWED_SENDERS.includes(fromEmail)) {
    return new Response("ok-not-allowed", OK);
  }

  // 6) 写附件行（raw_base64 落库）
  const rows: any[] = targets.map((a) => ({
    ...base,
    filename: a.name,
    content_type: a.content_type,
    raw_base64: a.content,
    row_count: null,
    status: "stored",
    error_msg: null,
  }));

  if (rows.length > 0) {
    try {
      await insertRows(rows);
      return new Response(`ok-stored-${rows.length}`, OK);
    } catch (e: any) {
      return new Response(`WR_FAIL ${e.message}`, E500);
    }
  }
  return new Response("ok-no-attach", OK);
});
