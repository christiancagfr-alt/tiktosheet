(function(root){
  function config(s) {
    const time=s.dailyTime || '11:00', zone=s.timeZone || 'Europe/Lisbon';
    if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw new Error('每日时间须为 HH:mm');
    try {new Intl.DateTimeFormat('en-GB',{timeZone:zone});}catch{throw new Error('时区无效，例如 Europe/Lisbon 或 Asia/Shanghai');}
    return {time,zone};
  }
  function local(now,zone) {
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const get=t=>parts.find(p=>p.type===t).value;
    return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
  }
  function target(s) {
    const {time,zone}=config(s);
    // Do not retain a credential-bearing URL in the attendance record.
    return JSON.stringify([s.endpoint?.split('#')[0],s.spreadsheetId,s.sheetName,time,zone]);
  }
  function due(s,state,now=new Date()) {
    const {time,zone}=config(s), current=local(now,zone);
    return current.time>=time && !(state?.target===target(s) && state.date===current.date);
  }
  function next(s,state,now=new Date()) {
    if(due(s,state,now))return now.getTime()+1000;
    const {time,zone}=config(s), today=local(now,zone).date;
    const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    const start=Math.floor(now.getTime()/60000)*60000+60000;
    // Search real instants so DST gaps/overlaps cannot shift the chosen wall time.
    for(let minute=0;minute<3*24*60;minute++) {
      const instant=start+minute*60000;
      if(formatter.format(instant)!==time)continue;
      const date=local(instant,zone).date;
      if(state?.target===target(s) && state.date===date)continue;
      if(date>=today)return instant;
    }
    throw new Error('未来三天内找不到该打卡时间');
  }
  root.DailySync={config,local,target,due,next};
})(globalThis);
