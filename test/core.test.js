import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validate,planSync,parseDate,column,accountId,dayInZone,previousDay} from '../server/core.js';
import '../extension/extract.js';
const id='spreadsheet_test_123';
const body={spreadsheetId:id,sheetName:"团队'表",accountUrl:'https://www.douyin.com/user/abc?x=1',following:110,friends:45};
const config=()=>validate(body);
const snapshot=()=>({dates:['','','2026-10-20','','','','2026-10-21'],accounts:[['https://www.douyin.com/user/abc/']],row:['','',100,0,50,0,109,9,44,-6],zone:'Asia/Shanghai',columnCount:20});
const now=new Date('2026-10-21T10:00:00Z');
test('定位、负增长、转义工作表名及重复同步保持相同增长',()=>{
  const data=snapshot(), a=planSync(config(),data,now); assert.deepEqual(a.values,[110,10,45,-5]); assert.equal(a.data[0].range,"'团队''表'!G4");
  data.row.splice(6,4,...a.values); assert.deepEqual(planSync(config(),data,now).values,a.values);
});
test('昨日数据缺失跳过，零是有效基数',()=>{const data=snapshot();data.row[2]=0;data.row[4]='';const plan=planSync(config(),data,now);assert.deepEqual(plan.values,[110,110,45,'']);assert.equal(plan.data.length,3);assert.deepEqual(plan.skipped,["'团队''表'!J4"]);});
test('倒序日期：昨日为空时不覆盖两项涨幅已有数据或公式',()=>{
 const s=snapshot();s.dates=['','','2026-10-21','','','','2026-10-20'];s.row=['','',109,'=1+2',44,17,'','',''];
 const p=planSync(config(),s,now);assert.deepEqual(p.data.map(d=>d.range),["'团队''表'!C4","'团队''表'!E4"]);assert.equal(p.skipped.length,2);
 s.dates[6]='';assert.equal(planSync(config(),s,now).data.length,2);
});
test('重复账号、重复日期、缺日期、越界均拒绝',()=>{
  for(const mutate of [s=>s.accounts.push(s.accounts[0]),s=>s.dates.push('2026-10-21'),s=>s.dates[6]='',s=>s.columnCount=8]) {const s=snapshot();mutate(s);assert.throws(()=>planSync(config(),s,now));}
});
test('自定义日期行、账号列和偏移',()=>{const c=validate({...body,dateRow:5,startRow:8,accountColumn:'A',offsets:[1,0,3,2]});const r=planSync(c,snapshot(),now);assert.equal(r.row,8);assert.equal(r.data[0].range,"'团队''表'!H8");});
test('账户列覆盖与邻近日期块保护',()=>{assert.throws(()=>planSync(validate({...body,accountColumn:'G'}),snapshot(),now));const s=snapshot();s.dates[8]='2026-10-22';assert.throws(()=>planSync(config(),s,now));});
test('日期文本、序列日期、跨年及时区',()=>{
 assert.equal(parseDate('10/21',2026),'2026-10-21');assert.equal(parseDate('2026年10月21日',2026),'2026-10-21');assert.equal(parseDate('2026-02-30',2026),null);assert.equal(parseDate(25569,2026),'1970-01-01');assert.equal(previousDay('2026-01-01'),'2025-12-31');assert.equal(dayInZone(new Date('2026-10-20T20:00:00Z'),'Asia/Shanghai'),'2026-10-21');assert.equal(column(703),'AAA');
});
test('拒绝无效账号和非整数计数',()=>{assert.equal(accountId('https://evil.com/user/abc'),null);assert.throws(()=>validate({...body,friends:null}));assert.throws(()=>validate({...body,following:1.5}));assert.throws(()=>validate({...body,offsets:[0,0,2,3]}));});
test('缩略和缺失数不会转换为 0',()=>{for(const v of ['1.2万','1w','',null,'12+'])assert.equal(globalThis.DouyinExtract.exact(v),null);assert.equal(globalThis.DouyinExtract.exact('1,234'),1234);assert.equal(globalThis.DouyinExtract.exact('0'),0);});
