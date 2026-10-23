import {readFileSync,writeFileSync} from 'node:fs';
import './runtime-check.js';
let core=readFileSync('server/core.js','utf8').replaceAll('export ','');
// Apps Script V8 has no WHATWG URL; validate the supported profile URLs directly.
core=core.replace(/function accountId\(value\) \{[\s\S]*?\n\}\n(?=function dayInZone)/,`function accountId(value) {
  if(typeof value!=='string')return null;
  const m=/^https?:\\/\\/(?:www\\.)?(tiktok\\.com|douyin\\.com)(\\/[^?#]*)(?:[?#].*)?$/i.exec(value);
  if(!m)return null;
  const tiktok=m[1].toLowerCase()==='tiktok.com';
  const name=(tiktok?/^\\/@([\\w.]+)\\/?$/:/^\\/user\\/([\\w-]+)\\/?$/).exec(m[2]);
  return name?(tiktok?'tiktok:'+name[1].toLowerCase():'douyin:'+name[1]):null;
}
`);
core=core.replace(/function dayInZone\(now, zone\) \{[\s\S]*?\n\}/,`function dayInZone(now,zone) { return Utilities.formatDate(now,zone,'yyyy-MM-dd'); }`);
writeFileSync('apps-script/Code.gs','// 完整可部署代码：复制本文件全部内容至 Apps Script。\n'+core+'\n'+readFileSync('apps-script/entry.js','utf8'));
