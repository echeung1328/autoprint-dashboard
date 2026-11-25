-- ============================================================
-- T1: access_links 数据库 schema + RLS (issue #46, parent #45)
-- 免登录访问链接系统（AutoPrint 对外分享）
-- 设计决策（#45 已确认 2026-07-31）：
--   1) 对外展示数据只读
--   2) 管理员鉴权复用 Supabase Auth
--   3) 删除=硬删 + access_links_audit 审计落库
-- 安全边界：anon / authenticated 零权限；所有对外读取经 service_role Edge Function
-- 执行环境：Supabase SQL Editor / MCP execute_sql（project uvqjtvonxwsmhntnyest）
-- 日期：2026-11-25
-- ============================================================

-- ---- 1. access_links 主表 ----
CREATE TABLE IF NOT EXISTS public.access_links (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token        text        NOT NULL,
  title        text        NOT NULL,
  status       text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stopped')),
  expires_at   timestamptz NOT NULL,
  created_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.access_links IS '对外免登录访问链接：token 为 32 字节 base64url，status=stopped 优先于 expires_at；删除为硬删';
COMMENT ON COLUMN public.access_links.token IS 'base64url 32 字节随机 token，全局唯一，不可逆推';
COMMENT ON COLUMN public.access_links.status IS 'active=可访问 / stopped=已停止（优先于过期判断）';

-- token 唯一索引
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_links_token ON public.access_links(token);
-- 常用查询索引：状态 + 过期
CREATE INDEX IF NOT EXISTS idx_access_links_status_expires ON public.access_links(status, expires_at);

-- ---- 2. access_links_audit 审计表（硬删后留存）----
CREATE TABLE IF NOT EXISTS public.access_links_audit (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  link_id       bigint      NOT NULL,
  token_prefix  text        NOT NULL,
  action        text        NOT NULL CHECK (action IN ('create', 'stop', 'delete')),
  performed_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_at  timestamptz NOT NULL DEFAULT now(),
  detail        jsonb       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.access_links_audit IS '访问链接管理动作审计：create/stop/delete；硬删链接后审计独立留存';
COMMENT ON COLUMN public.access_links_audit.token_prefix IS '仅保存 token 前 8 位用于追溯，不存完整 token';
CREATE INDEX IF NOT EXISTS idx_access_links_audit_link ON public.access_links_audit(link_id);
CREATE INDEX IF NOT EXISTS idx_access_links_audit_action ON public.access_links_audit(action, performed_at DESC);

-- ---- 3. RLS：全开，anon / authenticated 零权限 ----
ALTER TABLE public.access_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_links_audit ENABLE ROW LEVEL SECURITY;

-- 不建任何 policy => 默认拒绝所有非 service_role / owner 访问
-- 显式撤销公开角色权限（纵深防御）
REVOKE ALL ON public.access_links FROM anon, authenticated;
REVOKE ALL ON public.access_links_audit FROM anon, authenticated;
-- service_role 绕过 RLS，显式授权确保可写
GRANT ALL ON public.access_links TO service_role;
GRANT ALL ON public.access_links_audit TO service_role;

-- ============================================================
-- 验收检查（执行后手动核对）：
-- 1. SELECT * FROM access_links;                -- 空表，无报错
-- 2. SELECT * FROM access_links_audit;          -- 空表，无报错
-- 3. anon key 直读应被拒绝（validate-rls 或 curl 验证 401/空）
-- 4. \d access_links 可见 uq_access_links_token 唯一索引
-- ============================================================
