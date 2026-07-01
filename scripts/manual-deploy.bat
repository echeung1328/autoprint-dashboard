@echo off
REM AutoPrint 手动部署到 Netlify
REM 使用此脚本在本地手动部署，避免消耗自动构建额度

echo ===================================
echo AutoPrint 手动部署脚本
echo ===================================

REM 检查 Netlify CLI
where netlify >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Netlify CLI 未安装
    echo 请先安装: npm install -g netlify-cli
    exit /b 1
)

REM 检查登录状态
netlify status
if %errorlevel% neq 0 (
    echo [错误] 未登录 Netlify
    echo 请先登录: netlify login
    exit /b 1
)

REM 检查站点链接
netlify status | findstr /C:"Site"
if %errorlevel% neq 0 (
    echo [警告] 站点未链接，正在链接...
    netlify link --git-remote-url https://github.com/echeung1328/autoprint-dashboard.git
)

echo.
echo 选择部署模式:
echo 1. 预览部署 (Preview deploy) - 测试用，不更新生产环境
echo 2. 生产部署 (Production deploy) - 更新正式站点
echo.
set /p choice="请输入选择 (1 或 2): "

if "%choice%"=="1" (
    echo.
    echo [信息] 正在创建预览部署...
    netlify deploy --dir=.
    echo.
    echo [成功] 预览部署完成！上方链接可预览更改
) else if "%choice%"=="2" (
    echo.
    echo [警告] 即将部署到生产环境！
    set /p confirm="确认部署? (yes/no): "
    if "%confirm%"=="yes" (
        echo [信息] 正在部署到生产环境...
        netlify deploy --prod --dir=.
        echo.
        echo [成功] 生产部署完成！站点已更新: https://autoprintreport.netlify.app
    ) else (
        echo [信息] 取消部署
    )
) else (
    echo [错误] 无效选择
)

echo.
pause
