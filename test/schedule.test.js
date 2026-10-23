import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../extension/schedule.js';
const config={endpoint:'https://script.google.com/macros/s/id/exec#key=secret',spreadsheetId:'sheet',sheetName:'Sheet1',dailyTime:'11:00',timeZone:'Europe/Lisbon'};
test('每日十一点：里斯本夏令时及冬令时按当地时间调度',()=>{
 assert.equal(new Date(DailySync.next(config,null,new Date('2026-10-23T09:00:00Z'))).toISOString(),'2026-10-23T10:00:00.000Z');
 assert.equal(new Date(DailySync.next(config,null,new Date('2026-10-25T09:00:00Z'))).toISOString(),'2026-10-25T11:00:00.000Z');
});
test('当天错过时间补打，已尝试不重复，次日继续',()=>{
 const now=new Date('2026-10-23T12:00:00Z');assert.equal(DailySync.next(config,null,now),now.getTime()+1000);
 const state={target:DailySync.target(config),date:'2026-10-23',status:'success'};
 assert.equal(DailySync.due(config,state,now),false);
 assert.equal(new Date(DailySync.next(config,state,now)).toISOString(),'2026-10-24T10:00:00.000Z');
 state.status='failed';assert.equal(DailySync.due(config,state,now),false);
 assert.equal(DailySync.due(config,state,new Date('2026-10-24T12:00:00Z')),true);
});
test('调度记录不保存授权码，拒绝无效时间或时区',()=>{
 assert.ok(!DailySync.target(config).includes('secret'));
 assert.throws(()=>DailySync.config({...config,dailyTime:'25:00'}));
 assert.throws(()=>DailySync.config({...config,timeZone:'invalid/timezone'}));
});
test('不同表格/时间配置单独记录打卡',()=>{
 const state={target:DailySync.target(config),date:'2026-10-23'};
 assert.equal(DailySync.due({...config,sheetName:'Other'},state,new Date('2026-10-23T12:00:00Z')),true);
});
