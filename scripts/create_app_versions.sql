-- ============================================================
-- AutoPrint: app_versions 表（Web 应用版本发布记录）
-- 方案 B：替代 GitHub Releases，内置于仪表盘「📋 版本记录」Tab
-- 来源 Issue: https://github.com/echeung1328/autoprint-dashboard/issues/21
-- 执行方式（任选其一）：
--   A. Supabase Dashboard → SQL Editor → New query → 粘贴本文件 → Run
--   B. 经 Supabase MCP execute_sql（project_id = uvqjtvonxwsmhntnyest）
-- ============================================================

-- 1) 建表
CREATE TABLE IF NOT EXISTS public.app_versions (
  id              BIGSERIAL PRIMARY KEY,
  version         TEXT NOT NULL UNIQUE,
  released_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changes_summary TEXT NOT NULL,
  commit_hash     TEXT,
  deployed_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) 启用 RLS（行级安全）
ALTER TABLE public.app_versions ENABLE ROW LEVEL SECURITY;

-- 3) 读取策略：已登录(authenticated)用户可读（changelog 为信息展示，仪表盘需登录后才可见）
DROP POLICY IF EXISTS "app_versions_select_authenticated" ON public.app_versions;
CREATE POLICY "app_versions_select_authenticated"
  ON public.app_versions FOR SELECT
  TO authenticated
  USING (true);

-- 4) 写入策略：已登录用户可插入（admin 通过 Tab 内「➕ 记录新版本」表单新增）
DROP POLICY IF EXISTS "app_versions_insert_authenticated" ON public.app_versions;
CREATE POLICY "app_versions_insert_authenticated"
  ON public.app_versions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 5) 种子数据：从历史 commit 反推的主要里程碑版本（released_at 用 +08 时区写入）
INSERT INTO public.app_versions (version, released_at, changes_summary, commit_hash, deployed_by) VALUES
  ('1.0.0', '2026-07-03T18:00:00+08:00',
   'MVP 仪表盘上线：KPI 卡片、每日打印趋势/成功率/耗时图表、CSV 导出、峰值标注。',
   '6866935', 'Eric Zhang'),
  ('1.1.0', '2026-07-08T17:30:00+08:00',
   '新增「📅 年度负载高峰」Tab：按日/周/月统计当前自然年打印峰值 + 月度图表（Issue #18）。',
   'b2b885f', 'Eric Zhang'),
  ('1.2.0', '2026-07-09T13:00:00+08:00',
   '仓库文档规范整理：补充部署运维手册、Comlan 品牌规范提示词；原始报表归档至 source_data/ 并附数据说明 README。',
   'a920631', 'Eric Zhang')
ON CONFLICT (version) DO NOTHING;

-- 6) 校验（执行后可取消注释查看结果）
-- SELECT version, released_at, commit_hash, deployed_by
-- FROM public.app_versions ORDER BY released_at DESC;
