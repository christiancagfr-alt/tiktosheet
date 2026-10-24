const captureDocumentId = crypto.randomUUID();
function capture(settings={}) {
  if(document.readyState!=='complete') throw new Error('本人主页仍在加载');
  const accountUrl=DouyinExtract.profileUrl(location.href);
  if (!accountUrl || accountUrl.endsWith('/self')) throw new Error('本人主页尚未加载完成');
  return {accountUrl,following:DouyinExtract.count(document,['关注','已关注','Following','Seguindo','A seguir'],settings.followingSelector),friends:DouyinExtract.count(document,['粉丝','Followers','Seguidores'],settings.followersSelector),capturedAt:new Date().toISOString()};
}
chrome.runtime.onMessage.addListener((message,sender,reply) => {
  if(sender.id!==chrome.runtime.id || sender.tab || !message || typeof message!=='object') return;
  try {
    if(message.type==='identify') reply({ok:true,documentId:captureDocumentId,data:{accountUrl:DouyinExtract.selfUrl(document)}});
    else if(message.type==='capture') reply({ok:true,documentId:captureDocumentId,data:capture(message.settings)});
  } catch(e) { reply({ok:false,error:e.message}); }
});
