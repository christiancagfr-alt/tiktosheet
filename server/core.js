export class InputError extends Error {}
export function assert(ok, message) { if (!ok) throw new InputError(message); }
export function column(n) {
  let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}
export function columnIndex(s) {
  assert(typeof s === 'string' && /^[A-Z]{1,3}$/i.test(s), '账户列必须是 A、B 等列字母');
  const n = [...s.toUpperCase()].reduce((a,c) => a * 26 + c.charCodeAt(0) - 64, 0);
  assert(n <= 18278, '账户列超出范围'); return n;
}
export function accountId(value) {
  try { const u = new URL(value); if (!['http:','https:'].includes(u.protocol)) return null;
    if (['www.tiktok.com','tiktok.com'].includes(u.hostname)) {
      const name=/^\/@([\w.]+)\/?$/.exec(u.pathname)?.[1]; return name ? 'tiktok:'+name.toLowerCase() : null;
    }
    if (!['www.douyin.com','douyin.com'].includes(u.hostname)) return null;
    const name=/^\/user\/([\w-]+)\/?$/.exec(u.pathname)?.[1]; return name ? 'douyin:'+name : null;
  } catch { return null; }
}
export function dayInZone(now, zone) {
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const get = t => parts.find(p => p.type === t).value; return `${get('year')}-${get('month')}-${get('day')}`;
}
export function previousDay(day) { return new Date(Date.parse(day + 'T12:00:00Z') - 86400000).toISOString().slice(0,10); }
export function parseDate(value, year) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(Date.UTC(1899,11,30) + Math.floor(value)*86400000).toISOString().slice(0,10);
  const text = String(value ?? '').trim();
  let m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(text);
  if (!m) { const short = /^(\d{1,2})[/.月-](\d{1,2})日?$/.exec(text); if (short) m = ['',String(year),short[1],short[2]]; }
  if (!m) return null;
  const result = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const date = new Date(result+'T12:00:00Z'); return Number.isFinite(+date) && date.toISOString().slice(0,10) === result ? result : null;
}
export function validate(body) {
  assert(body && typeof body === 'object', '请求格式错误');
  const {spreadsheetId,sheetName,accountUrl,following,friends} = body;
  assert(typeof spreadsheetId === 'string' && /^[\w-]{10,150}$/.test(spreadsheetId), '电子表格 ID 无效');
  assert(typeof sheetName === 'string' && sheetName.length > 0 && sheetName.length <= 100, '请填写工作表名称');
  assert(accountId(accountUrl), '请使用完整的 TikTok /@用户名 或抖音 /user/ 主页链接');
  for (const n of [following,friends]) assert(Number.isSafeInteger(n) && n >= 0, '关注和粉丝总数必须是非负整数');
  const dateRow = body.dateRow ?? 3, startRow = body.startRow ?? 4, accountColumn = body.accountColumn ?? 'B';
  assert(Number.isInteger(dateRow) && dateRow > 0 && dateRow <= 10000, '日期行无效');
  assert(Number.isInteger(startRow) && startRow > dateRow && startRow <= 100000, '数据起始行必须在日期行之后');
  columnIndex(accountColumn);
  const offsets = body.offsets ?? [0,1,2,3];
  assert(Array.isArray(offsets) && offsets.length === 4 && new Set(offsets).size === 4 && offsets.every(n => Number.isInteger(n) && n >= 0 && n <= 99), '四项指标偏移必须是不同的 0–99 整数');
  return {spreadsheetId,sheetName,accountUrl,following,friends,dateRow,startRow,accountColumn:accountColumn.toUpperCase(),offsets};
}
export function planSync(config, {dates,accounts,row,zone,columnCount}, now = new Date()) {
  const today = dayInZone(now,zone), yesterday = previousDay(today);
  const findDate = day => dates.flatMap((v,i) => parseDate(v,Number(day.slice(0,4))) === day ? [i] : []);
  const matches = accounts.flatMap((r,i) => accountId(r[0]) === accountId(config.accountUrl) ? [i + config.startRow] : []);
  assert(matches.length === 1, matches.length ? '账号链接重复，无法确定写入行' : '账户列中找不到该账号链接');
  const cs = findDate(today), ps = findDate(yesterday);
  assert(cs.length === 1, cs.length ? '今天的日期重复，请仅在日期块首列填写日期或合并日期单元格' : `日期行中找不到今天 ${today}`);
  assert(ps.length <= 1, '昨日日期重复，无法计算增长');
  const c = cs[0], p = ps[0];
  const targets = config.offsets.map(o => c + o);
  const nextDate = dates.findIndex((v,i) => i > c && parseDate(v,Number(today.slice(0,4))));
  assert(targets.every(t => t < columnCount && t + 1 !== columnIndex(config.accountColumn) && (nextDate < 0 || t < nextDate)), '指标列超出日期块、表格范围或覆盖账户列');
  if (p !== undefined) assert(config.offsets.every(o => p + o < c || p > c + Math.max(...config.offsets)), '昨日与今日日期块重叠');
  const old = offset => { const v = p === undefined ? null : row[p+offset]; return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null; };
  const a = old(config.offsets[0]), b = old(config.offsets[2]);
  const values = [config.following,a === null ? '' : config.following-a,config.friends,b === null ? '' : config.friends-b];
  const prefix = `'${config.sheetName.replaceAll("'","''")}'!`;
  // Missing baselines are omitted from the write request, preserving existing cells/formulas.
  const cells=targets.map((t,i) => ({range:`${prefix}${column(t+1)}${matches[0]}`,values:[[values[i]]]}));
  return {date:today,row:matches[0],values,warnings:a === null || b === null ? ['昨日数据缺失，对应涨幅已跳过，原单元格保持不变'] : [],skipped:cells.filter((_,i)=>values[i]==='').map(cell=>cell.range),data:cells.filter((_,i)=>values[i]!=='')};
}
