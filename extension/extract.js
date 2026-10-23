(function(root) {
  function exact(value) {
    const text = String(value ?? '').trim().replace(/[,，\s]/g,'');
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text); return Number.isSafeInteger(n) ? n : null;
  }
  function metric(doc,label,selector) {
    if (selector) { try { return exact(doc.querySelector(selector)?.textContent); } catch { throw new Error('自定义 CSS 选择器无效'); } }
    const candidates = new Set();
    for (const el of doc.querySelectorAll('span,div,a,button')) {
      if (el.textContent.trim()!==label || !el.getClientRects().length) continue;
      // TikTok may put all three metrics in one row, each number before its label.
      const sibling=el.previousElementSibling;
      if(sibling?.getClientRects().length) { const n=exact(sibling.textContent); if(n!==null) candidates.add(n); }
      for (let parent = el.parentElement, depth = 0; parent && depth < 3; parent=parent.parentElement, depth++) {
      if (!parent.innerText || parent.innerText.length>60) break;
      const text = parent.innerText.trim();
      const m = new RegExp(`^(?:([\\d,，]+)\\s*${label}|${label}\\s*([\\d,，]+))$`).exec(text);
      if (m) { const n = exact(m[1] ?? m[2]); if (n!==null) candidates.add(n); }
      }
    }
    return candidates.size===1 ? [...candidates][0] : null;
  }
  function profileUrl(value) {
    try { const u=new URL(value); if(u.protocol!=='https:' || u.username || u.password || u.port) return null;
      if(['www.tiktok.com','tiktok.com'].includes(u.hostname) && /^\/@[\w.]+\/?$/.test(u.pathname)) return 'https://www.tiktok.com'+u.pathname.replace(/\/$/,'').toLowerCase();
      if(['www.douyin.com','douyin.com'].includes(u.hostname) && /^\/user\/[\w-]+\/?$/.test(u.pathname)) return 'https://www.douyin.com'+u.pathname.replace(/\/$/,'');
    } catch {} return null;
  }
  function selfUrl(doc) {
    const urls = new Set();
    for (const a of doc.querySelectorAll('a[href]')) {
      if (!a.getClientRects().length) continue;
      const labels = [a.textContent, a.getAttribute('aria-label'), a.getAttribute('title')].map(v=>(v??'').trim());
      if (!labels.some(v=>['我','我的','我的主页','个人中心','个人资料','个人主页','Profile','Perfil'].includes(v))) continue;
      const url=profileUrl(a.href);
      const sourceHost=doc.location?.hostname?.replace(/^www\./,'');
      if(url && (!sourceHost || new URL(url).hostname.replace(/^www\./,'')===sourceHost)) urls.add(url);
    }
    // A visible edit-profile control identifies an owned profile; a URL alone does not.
    const current=profileUrl(doc.location?.href);
    if(current && current.includes('tiktok.com/')) {
      const edit=[...doc.querySelectorAll('button,a,[role="button"]')].some(el=>el.getClientRects().length && ['编辑主页','编辑个人资料','编辑资料','Edit profile','Editar perfil'].includes(el.textContent.trim()));
      if(edit) urls.add(current);
    }
    if (urls.size>1) throw new Error('发现多个不同的本人主页入口，已停止读取以避免串号');
    return [...urls][0] ?? null;
  }
  function count(doc,labels,selector) {
    if(selector) return metric(doc,labels[0],selector);
    const values=new Set(labels.map(label=>metric(doc,label)).filter(n=>n!==null));
    return values.size===1 ? [...values][0] : null;
  }
  root.DouyinExtract = {exact,metric,selfUrl,profileUrl,count};
})(globalThis);
