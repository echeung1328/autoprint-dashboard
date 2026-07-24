-- ============================================================
-- promote_staging.sql
-- 用途：将 report_autoprint_staging 中 status='pending' 的清洗行
--       转正（promote）到主表 ReportAutoPrint。
-- 触发：用户确认后，由吴八哥通过 Supabase MCP execute_sql 执行。
-- 安全文化：staging 两阶段人工确认闸，绝不自动落主表。
-- ============================================================
--
-- 前置：先确认 batch_tag（从 staging 读取本批标签）
--   SELECT DISTINCT batch_tag FROM report_autoprint_staging WHERE status='pending';
--
-- 步骤 1：校验待转正批次概况（执行前先看一眼）
--   SELECT batch_tag,
--          COUNT(*) AS total,
--          SUM(CASE WHEN conflict_action='insert' THEN 1 ELSE 0 END) AS inserts,
--          SUM(CASE WHEN conflict_action='update' THEN 1 ELSE 0 END) AS updates,
--          SUM(CASE WHEN conflict_action='check-error' THEN 1 ELSE 0 END) AS check_err,
--          SUM(CASE WHEN error_msg IS NOT NULL AND error_msg<>'' THEN 1 ELSE 0 END) AS warn_rows
--   FROM report_autoprint_staging WHERE status='pending' GROUP BY batch_tag;
--
-- 步骤 2：INSERT —— 复合键(Title+执行时间)在主表不存在的行
--   （绝不写生成列 耗时分钟，由主表自动计算）
INSERT INTO "ReportAutoPrint"
  ("Title","执行时间","总数","成功","跳过","失败","完成时间",
   "附件Excel表格","任务完成通知邮件","标签","CreatedBy","ModifiedBy")
SELECT s."Title", s."执行时间", s."总数", s."成功", s."跳过", s."失败", s."完成时间",
       s."附件Excel表格", s."任务完成通知邮件", s."标签", s."CreatedBy", s."ModifiedBy"
FROM report_autoprint_staging s
WHERE s.status='pending' AND s.conflict_action='insert'
  AND NOT EXISTS (
    SELECT 1 FROM "ReportAutoPrint" r
    WHERE r."Title"=s."Title" AND r."执行时间"=s."执行时间"
  );
--
-- 步骤 3：UPDATE —— 复合键已存在的行（仅改业务字段，保留原 CreatedBy 以便回退）
UPDATE "ReportAutoPrint" r
SET "总数"=s."总数", "成功"=s."成功", "跳过"=s."跳过", "失败"=s."失败",
    "完成时间"=s."完成时间",
    "附件Excel表格"=s."附件Excel表格", "任务完成通知邮件"=s."任务完成通知邮件",
    "标签"=s."标签", "ModifiedBy"=s."ModifiedBy"
FROM report_autoprint_staging s
WHERE s.status='pending' AND s.conflict_action='update'
  AND r."Title"=s."Title" AND r."执行时间"=s."执行时间";
--
-- 步骤 4：标记 staging 已转正
--   UPDATE report_autoprint_staging SET status='promoted' WHERE status='pending';
--
-- 步骤 5：校验（执行后）
--   SELECT (SELECT COUNT(*) FROM "ReportAutoPrint" WHERE "CreatedBy"='<BATCH_TAG>') AS in_main,
--          (SELECT COUNT(*) FROM report_autoprint_staging WHERE status='promoted') AS promoted;
--
-- 回退（如需撤销本批）：
--   DELETE FROM "ReportAutoPrint" WHERE "CreatedBy"='<BATCH_TAG>';
--   UPDATE report_autoprint_staging SET status='pending' WHERE status='promoted';
