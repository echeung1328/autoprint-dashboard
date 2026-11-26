#!/usr/bin/env node
/**
 * 本地 SPA fallback 测试服务器
 *
 * 用途：VS Code Live Server (5500) 没有 SPA fallback，直接访问
 *       /share/<token> 或 /admin/access-links 会返回 Cannot GET。
 *       本服务器对不存在的路径统一回退到 index.html（HTTP 200），
 *       与生产环境 Netlify / Cloudflare Worker 的 SPA fallback 行为一致。
 *
 * 用法：node scripts/serve_spa.mjs
 * 然后浏览器打开：http://127.0.0.1:5501/share/<你的token>
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5501;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const rawPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
  let filePath = path.join(ROOT, rawPath);

  // 防目录穿越
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  // 目录 → index.html；不存在的路径 → SPA fallback 到 index.html
  if (!path.extname(filePath) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(ROOT, 'index.html');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log('SPA 测试服务器已启动');
  console.log('  首页:   http://127.0.0.1:' + PORT + '/');
  console.log('  分享页: http://127.0.0.1:' + PORT + '/share/<token>');
  console.log('  管理页: http://127.0.0.1:' + PORT + '/admin/access-links');
  console.log('  项目根目录: ' + ROOT);
  console.log('  按 Ctrl+C 停止');
});
