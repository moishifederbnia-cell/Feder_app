const V='feder-v5';
const SHELL=['./','index.html','style.css','app.js','manifest.webmanifest','icons/logo.png','icons/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||u.origin!==self.location.origin)return;
  // network first, fall back to cache (so updates arrive immediately, app still opens offline)
  e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;}).catch(()=>caches.match(r).then(m=>m||caches.match('index.html'))));
});

self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{};}catch(x){}
  e.waitUntil(self.registration.showNotification(d.title||'פדר בניה',{body:d.body||'',icon:'icons/icon-192.png',badge:'icons/icon-192.png',dir:'rtl',lang:'he',data:{url:'./'}}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(l=>{for(const c of l){if('focus' in c)return c.focus();}return self.clients.openWindow('./');}));
});
