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
