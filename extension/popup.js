const $ = id=>document.getElementById(id);
const defaults={endpoint:'',dateRow:3,startRow:4,accountColumn:'B',offsets:[0,1,2,3],dailyTime:'11:00',timeZone:'Europe/Lisbon',auto:false};
const keys=['endpoint','spreadsheetId','sheetName','dateRow','startRow','accountColumn','offsets','dailyTime','timeZone','followingSelector','followersSelector','auto'];
function status(text,error=false) { $('status').textContent=text; $('status').className=error?'error':''; }
async function message(type,data) { const r=await chrome.runtime.sendMessage({type,data}); if(!r?.ok) throw new Error(r?.error||'插件后台无响应'); return r.data; }
async function history() { const {history=[]}=await chrome.storage.local.get('history'); $('history').replaceChildren(...history.map(h=>{const p=document.createElement('p');p.textContent=`${h.ok?'✓':'!'} ${new Date(h.at).toLocaleString()} · ${h.message}`;return p;})); }
async function init(){ const s={...defaults,...(await chrome.storage.local.get('settings')).settings}; for(const k of keys) { if(k==='auto') $(k).checked=s[k]; else $(k).value=Array.isArray(s[k])?s[k].join(','):s[k]??''; } await history(); }
function display(data) { for(const k of ['accountUrl','following','friends']) $(k).value=data?.[k]??''; }
async function action(type) {
  const buttons=[...document.querySelectorAll('button')]; buttons.forEach(b=>b.disabled=true); display(null); status('正在识别登录账号并读取数据…');
  try {
    const r=await message(type);
    if(type==='capture') { display(r); status('已自动读取本浏览器登录账号的数据。'); }
    else { display(r.account); status(`${r.preview?'预览（尚未写入）':'同步完成'} · ${r.date}\n`+r.data.map(d=>`${d.range} → ${d.values[0][0]===''?'留空':d.values[0][0]}`).join('\n')+(r.warnings.length?'\n'+r.warnings.join('\n'):'')); await history(); }
  } catch(e) { status(e.message,true); } finally { buttons.forEach(b=>b.disabled=false); }
}
init().then(()=>action('capture')).catch(e=>status(e.message,true));
$('settings').addEventListener('submit',async event=>{
  event.preventDefault();
  try {
    const s=Object.fromEntries(keys.map(k=>[k,k==='auto'?$(k).checked:$(k).value.trim()]));
    const connection=SyncTransport.connection(s.endpoint);
    DailySync.config(s);
    for(const k of ['dateRow','startRow']) s[k]=Number(s[k]);
    if(s.startRow<=s.dateRow) throw new Error('数据起始行必须在日期行之后');
    s.offsets=s.offsets.split(/[,，]/).map(v=>v.trim()===''?NaN:Number(v));
    if(s.offsets.length!==4||new Set(s.offsets).size!==4||!s.offsets.every(n=>Number.isInteger(n)&&n>=0&&n<=99)) throw new Error('请填写四个不同的 0–99 整数偏移');
    s.spreadsheetId=/\/spreadsheets\/d\/([\w-]+)/.exec(s.spreadsheetId)?.[1]??s.spreadsheetId;
    if(!/^[\w-]{10,150}$/.test(s.spreadsheetId)) throw new Error('表格 ID 无效');
    if(!await chrome.permissions.request({origins:connection.origins})) throw new Error('需要允许插件访问同步连接');
    await chrome.storage.local.set({settings:s}); await message('saved'); status('设置已保存');
  }catch(e){status(e.message,true);}
});
for(const type of ['capture','preview','sync']) $(type).addEventListener('click',()=>action(type));

$('openSite').addEventListener('click',async()=>{try {await chrome.tabs.create({url:'https://www.tiktok.com/'});}catch(e){status(e.message,true);}});

