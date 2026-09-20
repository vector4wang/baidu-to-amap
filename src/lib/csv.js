// CSV 解析与生成（支持引号转义）
'use strict';

function parse(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let cur = [''], inQ = false, ri = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur[ri] += '"'; i++; } else inQ = false;
      } else cur[ri] += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { ri++; cur[ri] = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (cur.some((x) => String(x).trim() !== '')) rows.push(cur);
      cur = ['']; ri = 0;
    } else cur[ri] += c;
  }
  if (cur.some((x) => String(x).trim() !== '')) rows.push(cur);
  return rows;
}

function escCell(v) {
  v = String(v == null ? '' : v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function stringify(rows) {
  return rows.map((r) => r.map(escCell).join(',')).join('\n') + '\n';
}

module.exports = { parse, stringify };
