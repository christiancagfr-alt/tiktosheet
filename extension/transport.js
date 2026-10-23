(function(root){
  function connection(value) {
    const u=new URL(value);
    const gas=u.hostname==='script.google.com' && u.protocol==='https:' && /^\/(?:macros\/(?:u\/\d+\/)?s\/|a\/[^/]+\/macros\/s\/|a\/macros\/[^/]+\/s\/)[\w-]+\/exec\/?$/.test(u.pathname);
    if(gas) {
      const key=new URLSearchParams(u.hash.slice(1)).get('key');
      if(!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error('请粘贴 showConnection 输出的完整连接，包含 #key= 后的授权码');
      if(u.search || u.username || u.password)throw new Error('脚本连接格式错误');
      u.hash='';return {gas:true,url:u.href,key,origins:['https://script.google.com/*','https://script.googleusercontent.com/*']};
    }
    throw new Error(u.hostname==='script.google.com' && /\/dev\/?$/.test(u.pathname)?'这是 /dev 测试连接，请从部署管理中复制 /exec 正式连接并保留授权码。':'仅支持 Google Apps Script 正式部署的 HTTPS /exec 连接');
  }
  async function send(data,s,preview,fetcher=fetch) {
    const c=connection(s.endpoint);
    if(!s.spreadsheetId || !s.sheetName)throw new Error('请先保存连接和表格设置');
    if(![data.following,data.friends].every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error('未读取到精确计数，请重新读取');
    const body={accountUrl:data.accountUrl,following:data.following,friends:data.friends,spreadsheetId:s.spreadsheetId,sheetName:s.sheetName,dateRow:s.dateRow,startRow:s.startRow,accountColumn:s.accountColumn,offsets:s.offsets,key:c.key,action:preview?'preview':'sync'};
    const response=await fetcher(c.url,{method:'POST',redirect:'follow',credentials:'omit',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
    let result;try{result=await response.json();}catch{throw new Error('连接未返回 JSON。脚本请部署为“以我身份执行、任何人可访问”，并使用 /exec 连接。');}
    if(!response.ok || result?.error) {
      const message=typeof result?.error==='string'?result.error:'同步请求失败';
      throw new Error(message.split(c.key).join('[授权码已隐藏]').replace(/#key=[^\s"'<>]+/gi,'#key=[已隐藏]').slice(0,500));
    }
    if(!result || !Array.isArray(result.data) || !Array.isArray(result.warnings) || typeof result.date!=='string')throw new Error('脚本返回格式无效');
    return result;
  }
  root.SyncTransport={connection,send};
})(globalThis);
