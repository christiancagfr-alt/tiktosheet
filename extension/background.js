importScripts('extract.js','account.js','transport.js','schedule.js');
const defaults = {endpoint:'',dateRow:3,startRow:4,accountColumn:'B',offsets:[0,1,2,3],auto:false,dailyTime:'11:00',timeZone:'Europe/Lisbon'};
// Keep the backend token away from content scripts.
const storageReady=chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
const running = new Set();
async function settings() { await storageReady; return {...defaults,...(await chrome.storage.local.get('settings')).settings}; }
let reading;
function capture(s) {
  if(!reading) reading=readSignedInAccount(chrome,s).finally(()=>{reading=null;});
  return reading;
}
async function submit(data,s,preview) { return SyncTransport.send(data,s,preview); }
async function record(ok,message) {
  const {history=[]} = await chrome.storage.local.get('history');
  await chrome.storage.local.set({history:[{at:new Date().toISOString(),ok,message},...history].slice(0,30)});
  await chrome.action.setBadgeText({text:ok?'OK':'!'}); await chrome.action.setBadgeBackgroundColor({color:ok?'#008a78':'#c54451'});
}
async function schedule() {
  const s=await settings(); await chrome.alarms.clear('sync');
  if(s.auto) {
    const {dailyState}=await chrome.storage.local.get('dailyState');
    await chrome.alarms.create('sync',{when:DailySync.next(s,dailyState)});
  }
}
chrome.runtime.onInstalled.addListener(async details=>{
  await storageReady;
  const stored=await chrome.storage.local.get('settings');
  if(stored.settings && Object.hasOwn(stored.settings,'token')) {
    const {token,...kept}=stored.settings;
    // Local removal only; revocation at the retired server remains an owner action.
    if(kept.endpoint && !kept.endpoint.startsWith('https://script.google.com/'))kept.auto=false;
    await chrome.storage.local.set({settings:kept});
  }
  // The third metric changed from mutual friends to followers; require re-enabling old schedules.
  if(details.reason==='update' && ['0.1.0','0.2.0'].includes(details.previousVersion)) {
    const s=await settings(); await chrome.storage.local.set({settings:{...s,auto:false}});
    await record(false,'已升级为关注／粉丝统计，旧定时同步已关闭。请核对表格第三、四列的统计口径后重新启用。');
  }
  await schedule();
});
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name!=='sync' || running.has('auto')) return;
  running.add('auto');
  try {
    const s = await settings(); if (!s.auto) return;
    const {dailyState}=await chrome.storage.local.get('dailyState');
    if(!DailySync.due(s,dailyState))return;
    // Persist the attempt before network I/O to avoid replay after a worker restart.
    const date=DailySync.local(new Date(),DailySync.config(s).zone).date;
    const attempt={date,target:DailySync.target(s),status:'running'};
    await chrome.storage.local.set({dailyState:attempt});
    try { const data=await capture(s); const result=await submit(data,s,false); await chrome.storage.local.set({dailyState:{...attempt,status:'success'}}); await record(true,`每日打卡：${data.accountUrl} → ${result.date} 第 ${result.row} 行`); }
    catch(e) { await chrome.storage.local.set({dailyState:{...attempt,status:'failed'}}); await record(false,'每日打卡失败，请手动重试：'+e.message); }
  } finally { running.delete('auto'); await schedule(); }
});
chrome.runtime.onMessage.addListener((m,sender,reply) => {
  if (sender.tab || sender.id!==chrome.runtime.id || sender.url!==chrome.runtime.getURL('popup.html') || !m || typeof m!=='object' || !['saved','capture','preview','sync'].includes(m.type)) return;
  (async()=>{
    const s = await settings();
    if (m.type==='saved') { await schedule(); return {}; }
    if (m.type==='capture') return capture(s);
    if (m.type==='preview' || m.type==='sync') { const data=await capture(s); const result=await submit(data,s,m.type==='preview'); if(m.type==='sync') await record(true,`${result.date} 第 ${result.row} 行已同步`); return {...result,account:data}; }
    throw new Error('未知操作');
  })().then(data=>reply({ok:true,data}),async e=>{ if(m.type==='sync') await record(false,e.message); reply({ok:false,error:e.message}); });
  return true;
});
