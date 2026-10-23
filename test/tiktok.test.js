import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../extension/extract.js';
import '../extension/account.js';
import {accountId,validate,planSync} from '../server/core.js';
const url='https://www.tiktok.com/@joanamartins6843?lang=zh-Hans';
const element=text=>({textContent:text,getClientRects:()=>[{}],getAttribute:()=>null});
function documentFixture(edit=true) {
 const following={...element('已关注'),previousElementSibling:element('3723')};
 const followers={...element('粉丝'),previousElementSibling:element('2956')};
 return {location:new URL(url),querySelectorAll:selector=> selector==='a[href]' ? [] : selector==='button,a,[role="button"]' ? (edit?[element('编辑主页')]:[]) : [following,followers]};
}
test('TikTok 地址标准化忽略语言参数并隔离平台',()=>{
 assert.equal(accountId(url),'tiktok:joanamartins6843');
 assert.equal(accountId('https://tiktok.com/@JOANAMARTINS6843/'),'tiktok:joanamartins6843');
 assert.notEqual(accountId('https://www.douyin.com/user/joanamartins6843'),accountId(url));
 assert.equal(accountId('https://evil.com/@joanamartins6843'),null);
 assert.equal(accountId('https://www.tiktok.com/@joanamartins6843/video/123'),null);
});
test('本人主页编辑按钮可确认身份，普通他人主页不可',()=>{
 assert.equal(DouyinExtract.selfUrl(documentFixture()),url.split('?')[0]);
 assert.equal(DouyinExtract.selfUrl(documentFixture(false)),null);
});
test('内容脚本读取相邻数字标签，粉丝不会误读成点赞',()=>{
 let listener;
 const context={document:documentFixture(),location:new URL(url),DouyinExtract,chrome:{runtime:{id:"test-extension",onMessage:{addListener:fn=>listener=fn}}}};
 vm.runInNewContext(readFileSync('extension/content.js','utf8'),context);
 let result;listener({type:'capture',settings:{}},{id:'test-extension'},r=>result=r);
 assert.equal(result.ok,true);assert.equal(result.data.following,3723);assert.equal(result.data.friends,2956);assert.equal(result.data.accountUrl,url.split('?')[0]);
});
test('TikTok 表格行定位和粉丝增长',()=>{
 const c=validate({spreadsheetId:'sheet_test_123',sheetName:'Sheet1',accountUrl:url,following:3723,friends:2956});
 const p=planSync(c,{dates:['','','2026-10-22','','','','2026-10-23'],accounts:[['https://www.tiktok.com/@joanamartins6843']],row:['','',3700,0,2900],zone:'Europe/Lisbon',columnCount:20},new Date('2026-10-23T12:00:00Z'));
 assert.deepEqual(p.values,[3723,23,2956,56]);
});
test('发现 TikTok 标签并在已有本人主页读取，不另开标签',async()=>{
 let query;
 const api={tabs:{query:async q=>{query=q;return [{id:1,url}];},sendMessage:async(id,m)=>m.type==='identify'?{ok:true,data:{accountUrl:url.split('?')[0]}}:{ok:true,data:{accountUrl:url.split('?')[0],following:3723,friends:2956}}}};
 const d=await readSignedInAccount(api,{});assert.equal(d.friends,2956);assert.ok(query.url.includes('https://www.tiktok.com/*'));
});
