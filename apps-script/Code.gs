// 完整可部署代码：复制本文件全部内容至 Apps Script。
class InputError extends Error {}
function assert(ok, message) { if (!ok) throw new InputError(message); }
function column(n) {
  let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}
function columnIndex(s) {
  assert(typeof s === 'string' && /^[A-Z]{1,3}$/i.test(s), '账户列必须是 A、B 等列字母');
  const n = [...s.toUpperCase()].reduce((a,c) => a * 26 + c.charCodeAt(0) - 64, 0);
  assert(n <= 18278, '账户列超出范围'); return n;
}
function accountId(value) {
  if(typeof value!=='string')return null;
  const m=/^https?:\/\/(?:www\.)?(tiktok\.com|douyin\.com)(\/[^?#]*)(?:[?#].*)?$/i.exec(value);
  if(!m)return null;
  const tiktok=m[1].toLowerCase()==='tiktok.com';
  const name=(tiktok?/^\/@([\w.]+)\/?$/:/^\/user\/([\w-]+)\/?$/).exec(m[2]);
  return name?(tiktok?'tiktok:'+name[1].toLowerCase():'douyin:'+name[1]):null;
}
function dayInZone(now,zone) { return Utilities.formatDate(now,zone,'yyyy-MM-dd'); }
function previousDay(day) { return new Date(Date.parse(day + 'T12:00:00Z') - 86400000).toISOString().slice(0,10); }
function parseDate(value, year) {
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(Date.UTC(1899,11,30) + Math.floor(value)*86400000).toISOString().slice(0,10);
  const text = String(value ?? '').trim();
  let m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(text);
  if (!m) { const short = /^(\d{1,2})[/.月-](\d{1,2})日?$/.exec(text); if (short) m = ['',String(year),short[1],short[2]]; }
  if (!m) return null;
  const result = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  const date = new Date(result+'T12:00:00Z'); return Number.isFinite(+date) && date.toISOString().slice(0,10) === result ? result : null;
}
function validate(body) {
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
function planSync(config, {dates,accounts,row,zone,columnCount}, now = new Date()) {
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

// Build source: deploy the generated Code.gs, not this file.
function setup() {
  const book=SpreadsheetApp.getActiveSpreadsheet();
  if(!book) throw new Error('请从目标表格的 扩展程序 → Apps Script 打开此项目');
  const p=PropertiesService.getScriptProperties();
  p.setProperty('SPREADSHEET_ID',book.getId());
  if(!p.getProperty('SYNC_KEY')) p.setProperty('SYNC_KEY',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
  // Request and verify Sheets access during the owner's one-time setup.
  Sheets.Spreadsheets.get(book.getId(),{fields:'spreadsheetId'});
  console.log('初始化成功。请部署为 Web 应用，再运行 showConnection。');
}
function showConnection() {
  // If auto-detection returns /dev, paste the URL copied from Manage deployments here.
  const DEPLOYED_WEB_APP_URL = '';
  const key=PropertiesService.getScriptProperties().getProperty('SYNC_KEY');
  const url=(DEPLOYED_WEB_APP_URL || ScriptApp.getService().getUrl() || '').trim();
  if(!key || !url) throw new Error('请先运行 setup 并部署 Web 应用');
  if(!/^https:\/\/script\.google\.com\/(?:macros\/(?:u\/\d+\/)?s\/|a\/[^/]+\/macros\/s\/|a\/macros\/[^/]+\/s\/)[\w-]+\/exec\/?$/.test(url)) throw new Error('自动获取的不是正式部署地址。请到 部署 → 管理部署 复制 Web 应用网址（以 /exec 结尾），粘贴到 showConnection 内的 DEPLOYED_WEB_APP_URL 引号中，再运行。不要直接把 /dev 改成 /exec。');
  const escape=value=>value.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const html=HtmlService.createHtmlOutput('<p>复制完整连接到插件。请勿分享；关闭此窗口后不留在执行日志中。</p><textarea readonly style="width:100%;height:140px">'+escape(url+'#key='+key)+'</textarea>').setWidth(560).setHeight(230);
  SpreadsheetApp.getUi().showModalDialog(html,'同步连接（含授权码）');
  console.log('连接已显示在绑定表格的弹窗中；请切换到表格复制。');
}
function json_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function doGet() { return json_({ok:true,service:'TikTok Sheets Sync',version:'0.4.2'}); }
function doPost(e) {
  let lock;
  try {
    const raw=e && e.postData && e.postData.contents;
    assert(typeof raw==='string' && raw.length<=16384,'请求为空或过大');
    let body;try {body=JSON.parse(raw);}catch(_){throw new InputError('JSON 格式错误');}
    const props=PropertiesService.getScriptProperties();
    const key=props.getProperty('SYNC_KEY');
    assert(key && body && body.key===key,'连接授权无效，请重新复制完整脚本连接');
    assert(['preview','sync'].includes(body.action),'操作无效');
    const c=validate(body);
    assert(c.spreadsheetId===props.getProperty('SPREADSHEET_ID'),'脚本仅允许写入初始化时绑定的表格');
    lock=LockService.getScriptLock();assert(lock.tryLock(20000),'其他浏览器正在同步，请稍后重试');
    const meta=Sheets.Spreadsheets.get(c.spreadsheetId,{fields:'properties(timeZone),sheets(properties)'});
    const sheet=meta.sheets.find(s=>s.properties.title===c.sheetName);assert(sheet,'找不到工作表，请检查名称');
    const prefix="'"+c.sheetName.replace(/'/g,"''")+"'!";
    const get=ranges=>Sheets.Spreadsheets.Values.batchGet(c.spreadsheetId,{ranges:ranges.map(r=>prefix+r),valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'});
    const result=get([c.dateRow+':'+c.dateRow,c.accountColumn+c.startRow+':'+c.accountColumn]);
    const dates=result.valueRanges[0].values?.[0] || [],accounts=result.valueRanges[1].values || [];
    const matches=accounts.flatMap((r,i)=>accountId(r[0])===accountId(c.accountUrl)?[i+c.startRow]:[]);
    assert(matches.length===1,matches.length?'账户链接重复':'账户列中找不到该账号链接');
    const row=get([matches[0]+':'+matches[0]]).valueRanges[0].values?.[0] || [];
    const plan=planSync(c,{dates,accounts,row,zone:meta.properties.timeZone,columnCount:sheet.properties.gridProperties.columnCount});
    const formulas=Sheets.Spreadsheets.Values.batchGet(c.spreadsheetId,{ranges:plan.data.map(d=>d.range),valueRenderOption:'FORMULA'});
    assert(!formulas.valueRanges.some(r=>typeof r.values?.[0]?.[0]==='string' && r.values[0][0].startsWith('=')),'目标单元格包含公式，已停止写入');
    const preview=body.action==='preview';
    if(!preview) Sheets.Spreadsheets.Values.batchUpdate({valueInputOption:'RAW',data:plan.data},c.spreadsheetId);
    return json_({...plan,preview});
  } catch(error) {
    if(!(error instanceof InputError)) console.error('SYNC_EXECUTION_FAILED');
    return json_({error:error instanceof InputError?error.message:'脚本执行失败，请检查 Apps Script 执行记录、Sheets 服务及授权'});
  } finally {if(lock && lock.hasLock())lock.releaseLock();}
}
