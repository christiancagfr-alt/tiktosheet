import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../extension/extract.js';
import '../extension/account.js';
const own='https://www.douyin.com/user/owner';
const other='https://www.douyin.com/user/other';
const opts={attempts:2,delay:async()=>{}};
function fake({identity=own,counts=[12,3],switchAccount=false,conflict=false,loading=false}={}) {
  let reads=0,identified=0; const created=[],removed=[];
  return {created,removed,tabs:{
    query:async()=>[{id:1,url:other,windowId:1},...(conflict?[{id:2,url:own,windowId:1}]:[])],
    create:async options=>{created.push(options);return {id:3};},
    remove:async id=>{removed.push(id);},
    sendMessage:async(id,m)=>{
      if(m.type==='identify') {identified++;return {ok:true,data:{accountUrl:conflict&&id===2?other:switchAccount&&identified>1?other:identity}};}
      reads++; if(loading&&reads===1)throw new Error('not ready');
      return {ok:true,data:{accountUrl:own,following:counts[0],friends:counts[1]}};
    }
  }};
}
test('浏览他人主页时自动打开本人主页，读取后关闭',async()=>{const api=fake({loading:true});const d=await readSignedInAccount(api,{},opts);assert.equal(d.accountUrl,own);assert.equal(api.created[0].url,own);assert.equal(api.created[0].active,false);assert.deepEqual(api.removed,[3]);});
test('无本人入口时不回退到当前他人主页',async()=>{const api=fake({identity:null});await assert.rejects(()=>readSignedInAccount(api,{},opts),/未找到/);assert.equal(api.created.length,0);});
test('多标签页登录身份冲突停止读取',async()=>{const api=fake({conflict:true});await assert.rejects(()=>readSignedInAccount(api,{},opts),/不同登录账号/);assert.equal(api.created.length,0);});
test('读取中切换账号停止并清理临时页面',async()=>{const api=fake({switchAccount:true});await assert.rejects(()=>readSignedInAccount(api,{},opts),/发生变化/);assert.deepEqual(api.removed,[3]);});
test('好友缺失不能当成零，失败仍关闭临时页面',async()=>{const api=fake({counts:[12,null]});await assert.rejects(()=>readSignedInAccount(api,{},opts),/精确整数/);assert.deepEqual(api.removed,[3]);});
test('零计数可以自动读取',async()=>{const api=fake({counts:[0,0]});assert.equal((await readSignedInAccount(api,{},opts)).friends,0);});
test('本人导航只接受可见且明确的本人链接',()=>{
 const anchor=(text,href,visible=true)=>({textContent:text,href,getAttribute:()=>null,getClientRects:()=>visible?[{}]:[]});
 const doc={querySelectorAll:()=>[anchor('张三',other),anchor('我的主页',own),anchor('我',other,false)]};
 assert.equal(DouyinExtract.selfUrl(doc),own);
 assert.equal(DouyinExtract.selfUrl({querySelectorAll:()=>[anchor('张三',other)]}),null);
 assert.throws(()=>DouyinExtract.selfUrl({querySelectorAll:()=>[anchor('我',own),anchor('我的主页',other)]}),/多个/);
});
test('嵌套关注标签可以跨层读取，缩略数不猜测',()=>{
 const label={textContent:'关注',getClientRects:()=>[{}],parentElement:{innerText:'关注',parentElement:{innerText:'1,234\n关注'}}};
 const doc={querySelectorAll:()=>[label]}; assert.equal(DouyinExtract.metric(doc,'关注'),1234);
 label.parentElement.parentElement.innerText='1.2万\n关注';assert.equal(DouyinExtract.metric(doc,'关注'),null);
});
