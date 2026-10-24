// Identity comes from signed-in navigation, not the currently viewed profile.
globalThis.readSignedInAccount = async function(api,s,{attempts=60,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
  const tabs=await api.tabs.query({url:['https://www.douyin.com/*','https://douyin.com/*','https://www.tiktok.com/*','https://tiktok.com/*']});
  if (!tabs.length) throw new Error('此浏览器配置文件中未发现可访问的 TikTok／抖音标签页。请打开网站；若页面已打开，请检查扩展的网站访问权限和是否安装在同一浏览器配置文件。');
  const identities=new Map(); let connected=0;
  for(const tab of tabs) {
    let r; try { r=await api.tabs.sendMessage(tab.id,{type:'identify'}); } catch { continue; }
    if(!r?.ok) throw new Error(r?.error || '无法确认登录账号');
    connected++;
    if(r.data?.accountUrl) {
      const canonical=DouyinExtract.profileUrl(r.data.accountUrl);
      const sourceHost=new URL(tab.url).hostname.replace(/^www\./,'');
      if(!canonical || canonical!==r.data.accountUrl || new URL(canonical).hostname.replace(/^www\./,'')!==sourceHost)throw new Error('账号入口地址不可信，已停止读取');
      identities.set(canonical,tab);
    }
  }
  if(identities.size>1) throw new Error('不同平台或标签页显示不同登录账号，请刷新页面后重试');
  if(!identities.size) throw new Error(connected?'未找到“我／我的主页”入口。请确认已登录，并打开网站的“我”页面后重试；不会读取他人账号。':'插件刚更新，请刷新 TikTok／抖音页面后重试');
  const [accountUrl,source]=[...identities][0];
  const matching=tabs.find(t=>t.url?.split(/[?#]/)[0].replace(/\/$/,'')===accountUrl);
  let created, target=matching, oldDocumentId;
  try {
    if(!target) { created=await api.tabs.create({url:accountUrl,active:false,windowId:source.windowId}); target=created; }
    else {
      // Capture the old document identity before reload so a late response can never
      // be mistaken for fresh data. Older installed content scripts have no ID.
      const before=await api.tabs.sendMessage(target.id,{type:'identify'});
      oldDocumentId=before?.documentId;
      await api.tabs.reload(target.id,{bypassCache:true});
    }
    let last;
    for(let i=0;i<attempts;i++) {
      try {
        const tab=await api.tabs.get(target.id);
        if(tab.status!=='complete') throw new Error('页面仍在刷新');
        const r=await api.tabs.sendMessage(target.id,{type:'capture',settings:{followingSelector:s.followingSelector,followersSelector:s.followersSelector}});
        if(r?.ok && typeof r.documentId==='string' && r.documentId && r.documentId!==oldDocumentId) {
          const data=r.data;
          if(!data || !DouyinExtract.profileUrl(data.accountUrl) || new URL(data.accountUrl).hostname!==new URL(accountUrl).hostname)throw new Error('主页账号与登录账号不一致');
          if(!accountUrl.endsWith('/self') && data.accountUrl!==accountUrl) throw new Error('主页账号与登录账号不一致');
          last=data;
          if([data.following,data.friends].every(n=>Number.isSafeInteger(n)&&n>=0)) {
            const check=await api.tabs.sendMessage(source.id,{type:'identify'});
            if(!check?.ok || check.data.accountUrl!==accountUrl) throw new Error('读取期间登录账号发生变化，请重新读取');
            return data;
          }
        }
      } catch(e) { if(/不一致|发生变化/.test(e.message)) throw e; }
      if(i<attempts-1) await delay(750);
    }
    if(last) throw new Error('已识别本人账号，但关注数或粉丝数未显示精确整数。请打开“我”页面重试；隐藏或缩略数据不会写入表格。');
    throw new Error('本人主页刷新后未能取得最新数据，本次未写入。请检查网络、登录状态后重试');
  } finally { if(created) await api.tabs.remove(created.id).catch(()=>{}); }
};
