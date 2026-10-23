import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../extension/transport.js';
const key='a'.repeat(64),id='spreadsheet_test_123';
const endpoint='https://script.google.com/macros/s/abc_123/exec#key='+key;
test('脚本连接解析、重定向权限和授权码检查',()=>{
 const c=SyncTransport.connection(endpoint);assert.equal(c.key,key);assert.ok(!c.url.includes(key));assert.equal(c.origins.length,2);
 assert.throws(()=>SyncTransport.connection(endpoint.split('#')[0]),/完整连接/);
 assert.throws(()=>SyncTransport.connection('https://script.google.com/macros/s/abc/dev'),/测试连接/);
 assert.equal(SyncTransport.connection('https://script.google.com/macros/u/0/s/abc/exec/#key='+key).gas,true);
 assert.equal(SyncTransport.connection('https://script.google.com/a/example.com/macros/s/abc/exec#key='+key).gas,true);
});
test('脚本 POST 密钥在请求体，HTTP 200 中的错误不能当作成功',async()=>{
 const s={endpoint,spreadsheetId:id,sheetName:'Sheet1'};
 const fetcher=async(url,options)=>{assert.ok(url.endsWith('/exec'));assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);const b=JSON.parse(options.body);assert.equal(b.key,key);assert.equal(b.action,'preview');return {ok:true,json:async()=>({error:'授权无效'})};};
 await assert.rejects(()=>SyncTransport.send({following:1,friends:2},s,true,fetcher),/授权无效/);
});
test('生成的完整 GAS：授权、绑定表格、预览、增长、公式和锁',()=>{
 let writes=0,releases=0,formula=false;
 const props={SYNC_KEY:key,SPREADSHEET_ID:id};
 const ctx={console,PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},Utilities:{formatDate:()=> '2026-10-23'},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},LockService:{getScriptLock:()=>({tryLock:()=>true,hasLock:()=>true,releaseLock:()=>releases++})},Sheets:{Spreadsheets:{get:()=>({properties:{timeZone:'Europe/Lisbon'},sheets:[{properties:{title:'Sheet1',gridProperties:{columnCount:20}}}]}),Values:{batchGet:(id,o)=>{
 if(o.valueRenderOption==='FORMULA')return {valueRanges:[{values:[[formula?'=1+1':123]]}]};
 if(o.ranges.length===2)return {valueRanges:[{values:[['','','2026-10-22','','','','2026-10-23']]},{values:[['https://www.tiktok.com/@demo']]}]};
 return {valueRanges:[{values:[['','',100,0,50,0]]}]};
 },batchUpdate:body=>{assert.equal(body.data.length,4);writes++;}}}}};
 vm.createContext(ctx);vm.runInContext(readFileSync('apps-script/Code.gs','utf8'),ctx);
 const body={key,action:'sync',spreadsheetId:id,sheetName:'Sheet1',accountUrl:'https://www.tiktok.com/@demo?lang=zh-Hans',following:110,friends:55};
 const call=change=>ctx.doPost({postData:{contents:JSON.stringify({...body,...change})}});
 assert.match(call({key:'bad'}).error,/授权/);assert.equal(releases,0);
 assert.match(call({spreadsheetId:'another_sheet_id'}).error,/绑定/);
 assert.equal(call({action:'preview'}).preview,true);assert.equal(writes,0);
 assert.deepEqual(Array.from(call({}).values),[110,10,55,5]);assert.equal(writes,1);
 formula=true;assert.match(call({}).error,/公式/);assert.equal(writes,1);assert.equal(releases,3);
});
