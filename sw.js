const V='feder-v10';
const SHELL=['./','index.html','style.css','app.js','manifest.webmanifest','icons/logo.png','icons/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==self.location.origin)return;
  const versioned=u.search.indexOf('v=')>-1&&/\.(js|css)$/.test(u.pathname);
  const isIcon=/\/icons\//.test(u.pathname);
  if(versioned||isIcon){
    // versioned assets never change under the same URL: serve instantly from cache
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;})));
    return;
  }
  // page itself: network first (so a new version number is picked up), cache as offline fallback
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))));
});

self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{};}catch(x){}
  const title=d.title||'פדר בניה',body=d.body||'';
  e.waitUntil(self.registration.showNotification(title,{body:body,icon:'icons/icon-192.png',badge:'icons/icon-192.png',dir:'rtl',lang:'he',tag:d.ref||undefined,data:{ref:d.ref||'',title:title,body:body}}));
});
// tapping a notification opens the app on the task / meeting it is about
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const n=e.notification.data||{};
  const msg={type:'notif-open',ref:n.ref||'',title:n.title||e.notification.title||'',body:n.body||e.notification.body||''};
  const url='./?'+(msg.ref?'ref='+encodeURIComponent(msg.ref)+'&':'')+'nt='+encodeURIComponent(msg.title)+'&nb='+encodeURIComponent(msg.body);
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{
    for(const c of l){if('focus' in c){c.postMessage(msg);return c.focus();}}
    return self.clients.openWindow(url);
  }));
});
