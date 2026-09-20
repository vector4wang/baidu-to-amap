#!/usr/bin/env node
/**
 * clean.js — 收藏点数据清洗
 * 用法：node src/clean.js <输入.csv> [-o 输出.csv] [--from bd09|bd09mc|gcj02]
 *
 * 输入：CSV，需包含表头。自动识别列名：名称/name、经度/lng/lon/longitude、纬度/lat/latitude、地址/地址/addr、文件夹/folder
 * 规则（保守，只删脏数据）：
 *   1. 剔除空白行、无名称行
 *   2. 剔除无坐标/坐标不可解析的行
 *   3. 剔除坐标超出中国范围的行
 *   4. 按「名称+坐标(5位小数)」去重（同名不同地≠重复，会保留）
 * 输出：名称,经度,纬度,文件夹（GCJ-02坐标，可直接喂给 collect.js）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { parse, stringify } = require('./lib/csv');
const { bd09ToGcj02, bd09mcToBd09, isInChina } = require('./lib/coords');

const args = process.argv.slice(2);
if (!args[0] || args[0].startsWith('--')) {
  console.log('用法: node src/clean.js <输入.csv> [-o 输出.csv] [--from bd09|bd09mc|gcj02]');
  process.exit(1);
}
const input = args[0];
const oIdx = args.indexOf('-o');
const output = oIdx >= 0 ? args[oIdx + 1] : input.replace(/\.csv$/i, '') + '_cleaned.csv';
const fIdx = args.indexOf('--from');
const from = fIdx >= 0 ? args[fIdx + 1] : 'gcj02';

const HEADERS = {
  name: ['名称', 'name', '点名', '地点名'],
  lng: ['经度', 'lng', 'lon', 'longitude', 'x'],
  lat: ['纬度', 'lat', 'latitude', 'y'],
  addr: ['地址', 'addr', 'address'],
  folder: ['文件夹', 'folder', '分组', '收藏夹'],
};
function colIndex(header, keys) {
  const lower = header.map((h) => String(h).trim().toLowerCase());
  for (const k of keys) { const i = lower.indexOf(k.toLowerCase()); if (i >= 0) return i; }
  return -1;
}

const rows = parse(fs.readFileSync(input, 'utf8'));
if (rows.length < 2) { console.error('输入为空或缺少表头'); process.exit(1); }
const h = rows[0];
const ci = {
  name: colIndex(h, HEADERS.name),
  lng: colIndex(h, HEADERS.lng),
  lat: colIndex(h, HEADERS.lat),
  addr: colIndex(h, HEADERS.addr),
  folder: colIndex(h, HEADERS.folder),
};
if (ci.name < 0 || ci.lng < 0 || ci.lat < 0) {
  console.error('未识别到 名称/经度/纬度 列，表头为:', h.join(','));
  process.exit(1);
}

const stats = { 空白行: 0, 无名称: 0, 无坐标: 0, 坐标越界: 0, 完全重复: 0, 保留: 0 };
const seen = new Set();
const out = [['名称', '经度', '纬度', '文件夹']];

for (const r of rows.slice(1)) {
  const name = (r[ci.name] || '').trim();
  const addr = ci.addr >= 0 ? (r[ci.addr] || '').trim() : '';
  const folder = ci.folder >= 0 ? (r[ci.folder] || '').trim() : '';
  const lngRaw = (r[ci.lng] || '').trim();
  const latRaw = (r[ci.lat] || '').trim();
  if (![name, addr, lngRaw, latRaw].some(Boolean)) { stats['空白行']++; continue; }
  if (!name) { stats['无名称']++; continue; }
  let lng = parseFloat(lngRaw), lat = parseFloat(latRaw);
  if (Number.isNaN(lng) || Number.isNaN(lat)) { stats['无坐标']++; continue; }
  if (from === 'bd09mc') { [lng, lat] = bd09mcToBd09(lng, lat); [lng, lat] = bd09ToGcj02(lng, lat); }
  else if (from === 'bd09') { [lng, lat] = bd09ToGcj02(lng, lat); }
  if (!isInChina(lng, lat)) { stats['坐标越界']++; continue; }
  const key = name + '|' + lng.toFixed(5) + '|' + lat.toFixed(5);
  if (seen.has(key)) { stats['完全重复']++; continue; }
  seen.add(key);
  out.push([name, lng.toFixed(7), lat.toFixed(7), folder]);
}
stats['保留'] = out.length - 1;

fs.writeFileSync(output, '﻿' + stringify(out), 'utf8');
console.log('清洗统计:', JSON.stringify(stats));
console.log('输出:', path.resolve(output), `（${out.length - 1} 条）`);
