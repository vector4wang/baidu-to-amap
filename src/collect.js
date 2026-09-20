#!/usr/bin/env node
/**
 * collect.js — 高德收藏夹自动收藏（网页版自动化）
 *
 * 原理：高德官方网页版 amap.com 的「收藏」与 App 收藏夹云同步。
 * 脚本驱动本机 Chrome 逐个打开坐标页（uri.amap.com/marker），点击⭐收藏。
 *
 * 用法：
 *   npm install
 *   node src/collect.js points.csv [--start 0] [--limit 0] [--interval 2500] [--headless]
 *
 * 首次运行：浏览器打开 amap.com 后，用手机高德App扫码登录。
 * 登录成功后两种放行方式（任选）：
 *   a) 脚本检测到「退出登录」字样自动放行；
 *   b) 在本目录创建名为 LOGIN_OK 的空文件立即放行。
 *
 * 注意：
 * - 已收藏的点重复点击会「取消收藏」，脚本会先检测「已收藏」并跳过；断点续跑请用 --start。
 * - 网页收藏无文件夹分组，全部进默认收藏夹，可在App内再批量整理。
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { parse } = require('./lib/csv');

const DIR = __dirname;
const ROOT = path.dirname(DIR);
const PROFILE = path.join(ROOT, 'pw-profile');
const LOG = path.join(ROOT, 'run.log');

function log(...a) {
  const s = new Date().toLocaleTimeString() + ' ' + a.join(' ');
  console.log(s);
  try { fs.appendFileSync(LOG, s + '\n'); } catch (e) {}
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function numOpt(name, dft) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : dft;
}

const CHROME_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA && process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

async function launch() {
  try { // 优先走 channel 检测（Chrome 官方渠道）
    return await chromium.launchPersistentContext(PROFILE, {
      channel: 'chrome', headless: numOpt('--headless', 0) === 1,
      args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
    });
  } catch (e) {}
  for (const exe of CHROME_CANDIDATES) {
    try {
      return await chromium.launchPersistentContext(PROFILE, {
        executablePath: exe, headless: numOpt('--headless', 0) === 1,
        args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
      });
    } catch (e) {}
  }
  // 兜底：playwright 自带 chromium（需先 npx playwright install chromium）
  return chromium.launchPersistentContext(PROFILE, {
    headless: numOpt('--headless', 0) === 1,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized'],
  });
}

async function alreadyFav(page) {
  return page.evaluate(() => {
    const t = document.body.innerText || '';
    return t.includes('已收藏');
  }).catch(() => false);
}

async function clickCollect(page) {
  const needLogin = await page.evaluate(() => {
    const t = document.body.innerText || '';
    return t.includes('扫码登录') || t.includes('验证码登录');
  }).catch(() => false);
  if (needLogin) return { ok: false, why: 'NEED_LOGIN' };
  if (await alreadyFav(page)) return { ok: true, how: '已是收藏状态，跳过' };

  const tries = ['[title="收藏"]', '[aria-label="收藏"]', 'text=/^\\s*收藏\\s*$/'];
  let lastInfo = '无候选';
  for (const sel of tries) {
    let locs;
    try { locs = page.locator(sel); } catch (e) { continue; }
    const n = await locs.count().catch(() => 0);
    lastInfo = sel + ' x' + n;
    for (let i = 0; i < n; i++) {
      const el = locs.nth(i);
      try {
        if (!(await el.isVisible().catch(() => false))) continue;
        await el.click({ timeout: 2000 });
        await sleep(1500);
        if (await alreadyFav(page)) return { ok: true, how: sel };
        if (await page.evaluate(() => (document.body.innerText || '').includes('收藏成功')).catch(() => false)) {
          return { ok: true, how: sel + '(toast)' };
        }
      } catch (e) {}
    }
  }
  return { ok: false, why: lastInfo };
}

async function main() {
  const csvFile = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(ROOT, 'points.csv');
  const start = numOpt('--start', 0);
  const limit = numOpt('--limit', 0);
  const interval = numOpt('--interval', 2500);

  const rows = parse(fs.readFileSync(csvFile, 'utf8'));
  const head = rows[0].map((x) => String(x).trim());
  const pts = rows.slice(1).map((r) => ({ name: r[0], lng: r[1], lat: r[2], folder: r[3] || '' }))
    .filter((p) => p.name && p.lng && p.lat)
    .slice(start, limit > 0 ? start + limit : undefined);
  log('读取 %s，本次处理 %d 个点', path.basename(csvFile), pts.length);

  log('启动浏览器…');
  const browser = await launch();
  const page = browser.pages()[0] || (await browser.newPage());
  await page.goto('https://www.amap.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

  log('等待登录（手机高德扫码；检测到登录态或发现 LOGIN_OK 文件后自动开始）…');
  let logged = false;
  for (let i = 0; i < 1200; i++) {
    await sleep(3000);
    try {
      logged = await page.evaluate(() => (document.body.innerText || '').includes('退出登录'));
    } catch (e) {}
    if (logged || fs.existsSync(path.join(ROOT, 'LOGIN_OK'))) { logged = true; break; }
    if (fs.existsSync(path.join(ROOT, 'ABORT'))) { log('收到 ABORT，退出'); await browser.close(); return; }
    if (i % 20 === 19) log('仍在等待登录…');
  }
  log(logged ? '已登录，开始跑批' : '超时未确认登录，仍尝试继续');

  let ok = 0;
  const failed = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const url = `https://uri.amap.com/marker?position=${p.lng},${p.lat}&name=${encodeURIComponent(p.name)}&src=baidu-to-amap`;
    try {
      let res = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await sleep(2500);
        res = await clickCollect(page);
        if (res.why !== 'NEED_LOGIN') break;
        log('[%d/%d] 登录态失效，请重新扫码（30s后重试）…', i + 1, pts.length);
        await sleep(30000);
      }
      if (res.ok) { ok++; log('[%d/%d] OK %s%s', i + 1, pts.length, p.name, res.how ? ` (${res.how})` : ''); }
      else { failed.push(p.name); log('[%d/%d] FAIL %s (%s)', i + 1, pts.length, p.name, res.why); }
    } catch (e) {
      failed.push(p.name);
      log('[%d/%d] ERROR %s (%s)', i + 1, pts.length, p.name, e.message.slice(0, 100));
    }
    await sleep(interval + Math.random() * 1500);
  }
  fs.writeFileSync(path.join(ROOT, 'failed.txt'), failed.join('\n'), 'utf8');
  log('===== 完成：成功 %d/%d，失败 %d（见 failed.txt）=====', ok, pts.length, failed.length);
  await browser.close();
}

main().catch((e) => { log('FATAL: ' + e.message); process.exit(1); });
