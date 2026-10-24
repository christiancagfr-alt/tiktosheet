import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../extension/transport.js';
import '../extension/extract.js';
import '../extension/account.js';
const key='b'.repeat(64), endpoint='https://script.google.com/macros/s/security_test/exec#key='+key;
test('任意后端、HTTP、假 Google 主机以及嵌入凭据均被拒绝',()=>{
 for(const address of ['http://127.0.0.1:8787','https://attacker.example','https://script.google.com.attacker.example/macros/s/a/exec#key='+key,'https://user:pass@script.google.com/macros/s/a/exec#key='+key,'http://script.google.com/macros/s/a/exec#key='+key])assert.throws(()=>SyncTransport.connection(address));
});
test('请求字段白名单及反射授权码脱敏',async()=>{
 const settings={endpoint,spreadsheetId:'spreadsheet_test',sheetName:'Sheet1'};
 await assert.rejects(()=>SyncTransport.send({accountUrl:'https://www.tiktok.com/@demo',following:1,friends:2,unexpected:'private data'},settings,true,async(url,options)=>{
   const body=JSON.parse(options.body);assert.equal(body.unexpected,undefined);assert.equal(options.headers.Authorization,undefined);assert.ok(!url.includes(key));
   return {ok:true,json:async()=>({error:'reflected '+key})};
 }),error=>!error.message.includes(key)&&error.message.includes('[授权码已隐藏]'));
});
test('内容脚本拒绝外部和网页标签来源消息',()=>{
 let handler,calls=0;const context={crypto:globalThis.crypto,chrome:{runtime:{id:'ext',onMessage:{addListener:f=>handler=f}}},DouyinExtract:{selfUrl:()=>{calls++;return null;}},document:{}};
 vm.runInNewContext(readFileSync('extension/content.js','utf8'),context);
 handler({type:'identify'},{id:'other'},()=>{});handler({type:'identify'},{id:'ext',tab:{id:1}},()=>{});handler(null,{id:'ext'},()=>{});assert.equal(calls,0);
 handler({type:'identify'},{id:'ext'},()=>{});assert.equal(calls,1);
});
test('后台只接受自身 popup 的明确消息',()=>{
 let handler; const noop=()=>{};
 const chrome={storage:{local:{setAccessLevel:()=>Promise.resolve()}},runtime:{id:'ext',getURL:p=>'chrome-extension://ext/'+p,onInstalled:{addListener:noop},onStartup:{addListener:noop},onMessage:{addListener:f=>handler=f}},alarms:{onAlarm:{addListener:noop}}};
 const context={chrome,importScripts:noop,console};vm.runInNewContext(readFileSync('extension/background.js','utf8'),context);
 for(const sender of [{id:'other',url:'chrome-extension://ext/popup.html'},{id:'ext',url:'https://www.tiktok.com/'},{id:'ext',url:'chrome-extension://ext/popup.html',tab:{id:1}}])assert.equal(handler({type:'sync'},sender,()=>assert.fail()),undefined);
 assert.equal(handler(null,{id:'ext',url:'chrome-extension://ext/popup.html'},()=>assert.fail()),undefined);
});
test('页面返回的导航地址不能打开第三方或跨平台页面',async()=>{
 for(const identity of ['https://attacker.example/','javascript:alert(1)','https://www.douyin.com/user/other']) {
   const api={tabs:{query:async()=>[{id:1,url:'https://www.tiktok.com/@demo'}],sendMessage:async()=>({ok:true,data:{accountUrl:identity}}),create:()=>assert.fail('must not open untrusted URL')}};
   await assert.rejects(()=>readSignedInAccount(api,{}),/不可信/);
 }
 assert.equal(DouyinExtract.profileUrl('https://user:pass@www.tiktok.com/@demo'),null);
 assert.equal(DouyinExtract.profileUrl('https://www.tiktok.com:8443/@demo'),null);
});
test('showConnection 不向日志写入授权码，HTML 内容经过转义',()=>{
 const logs=[];let html,dialog=false;
 const context={PropertiesService:{getScriptProperties:()=>({getProperty:()=>key})},ScriptApp:{getService:()=>({getUrl:()=>endpoint.split('#')[0]})},HtmlService:{createHtmlOutput:text=>{html=text;return {setWidth(){return this;},setHeight(){return this;}};}},SpreadsheetApp:{getUi:()=>({showModalDialog:()=>{dialog=true;}})},console:{log:s=>logs.push(s)}};
 vm.runInNewContext(readFileSync('apps-script/Code.gs','utf8'),context);context.showConnection();
 assert.ok(dialog);assert.ok(html.includes(key));assert.ok(!logs.join('').includes(key));assert.ok(!html.includes('<script'));
});
test('发布权限未保留全 HTTPS 或 activeTab',()=>{
 const manifest=JSON.parse(readFileSync('extension/manifest.json','utf8'));
 assert.deepEqual(manifest.optional_host_permissions,['https://script.google.com/*','https://script.googleusercontent.com/*']);assert.ok(!manifest.permissions.includes('activeTab'));assert.equal(manifest.externally_connectable,undefined);
});
