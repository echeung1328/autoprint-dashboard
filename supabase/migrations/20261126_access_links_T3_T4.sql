-- ============================================================
-- T3+T4: access_links 扩展 site_scope / row_limit (issue #71/#72, parent #69)
-- 共享链接功能优化 v2.3.0：数据隔离 + 最近 N 条可设置
-- 设计决策（2026-11-26 已拍板）：
--   T3 数据隔离：site_scope='ALL' 全局 / 其它值=具体站点（站点白名单由 Edge Function
--       /admin/sites 动态读取 SELECT DISTINCT site，服务端校验，防注入）
--   T4 最近 N 条：row_limit 默认 7，范围 1-365（服务端 clamp + DB CHECK 双保险）
-- 兼容性：历史链接回填 site_scope='ALL' / row_limit=100（保持原有最近100条行为不变）
--         新链接 DEFAULT site_scope='ALL' / row_limit=7
-- 执行环境：Supabase SQL Editor / MCP execute_sql（project uvqjtvonxwsmhntnyest）
-- 日期：2026-11-26
-- ============================================================

-- ---- 1. 加列（先可空，便于区分历史行）----
ALTER TABLE public.access_links ADD COLUMN IF NOT EXISTS site_scope text;
ALTER TABLE public.access_links ADD COLUMN IF NOT EXISTS row_limit   int;

-- ---- 2. 历史行回填：保持原有行为（全局 + 最近100条）----
UPDATE public.access_links SET site_scope = 'ALL' WHERE site_scope IS NULL OR site_scope = '';
UPDATE public.access_links SET row_limit   = 100  WHERE row_limit   IS NULL;

-- ---- 3. 收紧为非空 + 设默认值（仅影响之后的 INSERT）----
ALTER TABLE public.access_links ALTER COLUMN site_scope SET NOT NULL;
ALTER TABLE public.access_links ALTER COLUMN row_limit   SET NOT NULL;
ALTER TABLE public.access_links ALTER COLUMN site_scope SET DEFAULT 'ALL';
ALTER TABLE public.access_links ALTER COLUMN row_limit   SET DEFAULT 7;

-- ---- 4. CHECK 约束：row_limit 服务端 clamp 之外的 DB 兜底 ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_access_links_row_limit') THEN
    ALTER TABLE public.access_links
      ADD CONSTRAINT chk_access_links_row_limit CHECK (row_limit BETWEEN 1 AND 365);
  END IF;
END $$;

-- ---- 5. 注释 ----
COMMENT ON COLUMN public.access_links.site_scope IS '数据隔离范围：ALL=全部站点；其它值=具体站点名（须为 /admin/sites 返回的合法站点）';
COMMENT ON COLUMN public.access_links.row_limit   IS '对外分享页展示的最近明细条数；默认 7，范围 1-365';

-- ============================================================
-- 验收检查（执行后核对）：
-- 1. SELECT id, site_scope, row_limit FROM access_links ORDER BY created_at DESC;
--      → 历史行均 site_scope=ALL / row_limit=100
-- 2. INSERT 一条不指定两字段的链接 → 自动 site_scope=ALL / row_limit=7
-- 3. UPDATE access_links SET row_limit=0 WHERE id=...;  → 应被 CHECK 拒绝
-- 4. 线上 curl /public?token=<历史链接> → 仍返回 100 条（行为不变）
-- ============================================================
