#!/usr/bin/env node
/**
 * 禁用 Netlify 自动发布
 * 运行此脚本后，Git 推送将不再触发自动部署
 */

const https = require('https');

// 配置（从 Netlify 仪表板获取）
const NETLIFY_TOKEN = process.env.NETLIFY_TOKEN || '请替换为你的 Netlify Token';
const SITE_ID = 'autoprintreport'; // 或站点 ID

/**
 * 禁用站点自动发布
 */
async function disableAutoPublish() {
  console.log('🔒 正在禁用 Netlify 自动发布...\n');
  
  const data = JSON.stringify({
    build_settings: {
      repo: null // 断开仓库连接
    }
  });

  const options = {
    hostname: 'api.netlify.com',
    path: `/api/v1/sites/${SITE_ID}`,
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${NETLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ 成功禁用自动发布！');
          console.log('📝 现在需要手动部署：');
          console.log('   1. 本地运行: netlify deploy --dir=.');
          console.log('   2. 确认无误后: netlify deploy --prod --dir=.');
          resolve(body);
        } else {
          console.log(`❌ 失败 (${res.statusCode}):`, body);
          reject(new Error(body));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// 更温和的方法：仅锁定发布（不断开仓库）
async function lockPublish() {
  console.log('🔒 正在锁定发布（不断开仓库）...\n');
  
  const data = JSON.stringify({
    locked: true // 锁定发布
  });

  const options = {
    hostname: 'api.netlify.com',
    path: `/api/v1/sites/${SITE_ID}`,
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${NETLIFY_TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ 成功锁定发布！');
          console.log('📝 Git 推送不会再自动部署');
          console.log('📝 需要手动解锁后才能部署');
          resolve(body);
        } else {
          console.log(`❌ 失败 (${res.statusCode}):`, body);
          console.log('\n💡 请手动在 Netlify 仪表板操作：');
          console.log('   1. 访问 https://app.netlify.com');
          console.log('   2. 进入站点 → Deploys');
          console.log('   3. 点击 "Lock publish" 按钮');
          reject(new Error(body));
        }
      });
    });

    req.on('error', (err) => {
      console.log('❌ API 调用失败:', err.message);
      console.log('\n💡 请手动在 Netlify 仪表板操作：');
      console.log('   1. 访问 https://app.netlify.com');
      console.log('   2. 进入站点 → Deploys');
      console.log('   3. 点击 "Lock publish" 按钮');
      reject(err);
    });
    req.write(data);
    req.end();
  });
}

// 主函数
(async () => {
  try {
    // 方法 1：锁定发布（推荐）
    await lockPublish();
  } catch (error) {
    console.error('\n❌ 操作失败，请按照上述提示手动操作');
    process.exit(1);
  }
})();
