(function(){
'use strict';
var SUPABASE_URL='https://jaaidfpfeihxfhzxsuak.supabase.co';
var SUPABASE_KEY='sb_publishable_I7m0DLUAqWRNdkKdPq9JBw_2khMl1No';
var sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});

var TABLES=['projects','tasks','expenses','suppliers','orders','docs','messages','events','profiles','client_projects','plans','team_members','project_suppliers','supplier_docs','worker_access','gantt_items','sched_rows','resp_items','payments','change_requests'];
var S={plans:[],projects:[],tasks:[],expenses:[],suppliers:[],orders:[],docs:[],messages:[],events:[],profiles:[],client_projects:[],team_members:[],project_suppliers:[],supplier_docs:[],worker_access:[],gantt_items:[],sched_rows:[],resp_items:[],payments:[],change_requests:[]};
var loaded={};
var AUTH={state:'loading',uid:null,name:'',role:'',msg:'',ok:''};
var UI={calMonth:null,calSel:null,view:'home',projectId:null,tab:'tasks',taskFilter:'open',taskProject:'',taskPerson:'',justDone:'',projSup:'',projSupFor:'',expProject:'',supQuery:'',supField:'',supProject:'',clientProject:null};
var form=null;
var LOGO='icons/logo.png';
var PHOTO={};
var GCLIENT='1063410484052-87j7o27ouilgpomismvuvq3l8ov0o9g2.apps.googleusercontent.com';
var G={token:null,exp:0,events:[],range:'',loading:false,err:''};
function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
function lsSet(k,v){try{localStorage.setItem(k,v);}catch(e){}}
function gReady(){return !!G.token&&Date.now()<G.exp;}
function gWasConnected(){return lsGet('feder_gcal')==='1';}
function gSave(){try{localStorage.setItem('feder_gtok',JSON.stringify({t:G.token,e:G.exp}));}catch(e){}}
function gRestore(){try{var o=JSON.parse(localStorage.getItem('feder_gtok')||'null');if(o&&o.t&&o.e>Date.now()+60000){G.token=o.t;G.exp=o.e;}}catch(e){}}
function gRequest(silent){
  if(!(window.google&&google.accounts&&google.accounts.oauth2)){if(!silent){G.err='שירות הכניסה של גוגל עדיין לא נטען. נסה שוב בעוד רגע.';render();}return;}
  var tc=google.accounts.oauth2.initTokenClient({client_id:GCLIENT,scope:'https://www.googleapis.com/auth/calendar.events',
    callback:function(r){
      if(r&&r.access_token){G.token=r.access_token;G.exp=Date.now()+((r.expires_in||3600)-60)*1000;G.err='';lsSet('feder_gcal','1');gSave();G.range='';render();}
      else if(!silent){G.err='החיבור ליומן גוגל לא הושלם.';render();}
    },
    error_callback:function(){if(!silent){G.err='החיבור ליומן גוגל בוטל או נחסם.';render();}}});
  tc.requestAccessToken({prompt:silent?'none':(gWasConnected()?'':'consent')});
}
function gConnect(){gRequest(false);}
var gSilentAt=0;
function gSilent(){
  if(!gWasConnected()||gReady()||Date.now()-gSilentAt<60000)return;
  gSilentAt=Date.now();
  var tries=0,t=setInterval(function(){
    tries++;
    if(window.google&&google.accounts&&google.accounts.oauth2){clearInterval(t);gRequest(true);}
    else if(tries>20)clearInterval(t);
  },300);
}
document.addEventListener('click',function(){if(!gReady())gSilent();},true);
function gDisconnect(){try{localStorage.removeItem('feder_gtok');}catch(e){}G.token=null;G.exp=0;G.events=[];G.range='';lsSet('feder_gcal','0');render();}
function gApi(method,path,body){
  return fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events'+path,{method:method,headers:{'Authorization':'Bearer '+G.token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}).then(function(res){
    if(res.status===401){G.token=null;G.exp=0;try{localStorage.removeItem('feder_gtok');}catch(e){}throw {code:'auth'};}
    if(!res.ok)throw {code:'http'+res.status};
    return res.status===204?null:res.json();
  });
}
function gMonthKey(){var m=(UI.view==='calendar'&&UI.calMonth)?UI.calMonth:new Date();return m.getFullYear()+'-'+m.getMonth();}
function gEnsure(){
  if(!gReady()||G.loading||(UI.view!=='calendar'&&UI.view!=='home'))return;
  if(G.range===gMonthKey())return;
  gLoad();
}
function gLoad(){
  var m=(UI.view==='calendar'&&UI.calMonth)?UI.calMonth:new Date();
  var from=new Date(m.getFullYear(),m.getMonth(),1-7),to=new Date(m.getFullYear(),m.getMonth()+1,8);
  var key=gMonthKey();G.loading=true;
  return gApi('GET','?singleEvents=true&orderBy=startTime&maxResults=250&timeMin='+encodeURIComponent(from.toISOString())+'&timeMax='+encodeURIComponent(to.toISOString())).then(function(d){
    var out=[];
    (d.items||[]).forEach(function(it){
      if(it.status==='cancelled')return;
      var base={gid:it.id,google:true,title:it.summary||'(ללא כותרת)',location:it.location||'',notes:it.description||'',projectId:(it.extendedProperties&&it.extendedProperties.private&&it.extendedProperties.private.feder_project)||''};
      if(it.start&&it.start.dateTime){
        var a=new Date(it.start.dateTime),b=it.end&&it.end.dateTime?new Date(it.end.dateTime):null;
        out.push(Object.assign({id:'g:'+it.id,date:ymd(a),startTime:hm(a),endTime:b?hm(b):''},base));
      }else if(it.start&&it.start.date){
        var d0=pd(it.start.date),d1=it.end&&it.end.date?pd(it.end.date):new Date(d0.getTime()+86400000),n=0;
        for(var x=new Date(d0);x<d1&&n<31;x=new Date(x.getFullYear(),x.getMonth(),x.getDate()+1),n++){
          out.push(Object.assign({id:'g:'+it.id,date:ymd(x),startTime:'',endTime:''},base));
        }
      }
    });
    G.events=out;G.range=key;G.loading=false;G.err='';render();gSyncBot();
  }).catch(function(e){G.loading=false;G.range=key;G.err=(e&&e.code==='auth')?'החיבור ליומן גוגל פג. לחץ לחיבור מחדש.':'לא הצלחנו לטעון את יומן גוגל.';render();});
}
var gSyncing=false,gTried={};
function gSyncBot(){
  if(gSyncing||!gReady()||!isStaff())return;
  var from=Date.now()-86400000;
  var todo=S.events.filter(function(e){return !e.google_id&&!gTried[e.id]&&e.start_at&&Date.parse(e.start_at)>=from;}).slice(0,15);todo.forEach(function(e){gTried[e.id]=1;});
  if(!todo.length)return;
  gSyncing=true;
  var chain=Promise.resolve();
  todo.forEach(function(e){
    chain=chain.then(function(){
      var gid='feder'+String(e.id).replace(/-/g,'');
      var s0=new Date(e.start_at),e0=e.end_at?new Date(e.end_at):new Date(s0.getTime()+3600000);
      var body={id:gid,summary:e.title,description:e.notes||'',location:e.location||''};
      if(e.projectId||e.project_id)body.extendedProperties={private:{feder_project:e.projectId||e.project_id}};
      if(e.all_day){var d=ymd(s0);body.start={date:d};body.end={date:ymd(new Date(s0.getFullYear(),s0.getMonth(),s0.getDate()+1))};}
      else{body.start={dateTime:s0.toISOString()};body.end={dateTime:e0.toISOString()};}
      var att=evAttendees(e.id);if(att.length)body.attendees=att;
      return gApi('POST',att.length?'?sendUpdates=all':'',body).catch(function(er){if(er&&er.code==='http409')return null;throw er;}).then(function(){
        return sb.from('events').update({google_id:gid}).eq('id',e.id);
      });
    });
  });
  chain.catch(function(){}).then(function(){gSyncing=false;G.range='';return loadTable('events').then(function(){return gLoad();});});
}
/* meeting with several people: invite each one's Google calendar */
function evAttendees(evId){
  var t=S.tasks.filter(function(x){return x.event_id===evId;})[0];if(!t)return [];
  var me=myMember();
  return tAsg(t).map(function(i){return byId('team_members',i);}).filter(function(m){return m&&m.email&&!(me&&me.id===m.id);}).map(function(m){return {email:m.email};});
}
function gBodyRow(r){
  var s0=new Date(r.start_at),e0=r.end_at?new Date(r.end_at):new Date(s0.getTime()+3600000);
  var b={summary:r.title,description:'',location:'',start:{dateTime:s0.toISOString()},end:{dateTime:e0.toISOString()}};
  if(r.project_id)b.extendedProperties={private:{feder_project:r.project_id}};
  return b;
}
function gBody(ev){
  var body={summary:ev.title,description:ev.notes||'',location:ev.location||''};
  if(ev.projectId)body.extendedProperties={private:{feder_project:ev.projectId}};
  if(!ev.startTime){var d=pd(ev.date);body.start={date:ev.date};body.end={date:ymd(new Date(d.getFullYear(),d.getMonth(),d.getDate()+1))};}
  else{var s0=new Date(ev.date+'T'+ev.startTime),e0=ev.endTime?new Date(ev.date+'T'+ev.endTime):new Date(s0.getTime()+3600000);body.start={dateTime:s0.toISOString()};body.end={dateTime:e0.toISOString()};}
  return body;
}
var VAPID='BHE_9uosyXwJ9gzXq_0yQK3M6SIdmFE9ea5l3rwm_7XAnzBl4MbPFNHcRNHvGqonCCpm02vh6HbCkx_RyMTSQHk';
var RMIN={'בזמן האירוע':0,'10 דקות לפני':10,'30 דקות לפני':30,'שעה לפני':60,'יום לפני':1440,'יומיים לפני':2880};
function remindWhen(date,startTime,opt){
  if(!opt||opt==='ללא'||RMIN[opt]===undefined)return null;
  var m=RMIN[opt];
  var base=startTime?new Date(date+'T'+startTime):new Date(date+'T08:00');
  if(!startTime&&m<1440)m=0;
  return new Date(base.getTime()-m*60000);
}
var BOT_URL='https://jaaidfpfeihxfhzxsuak.supabase.co/functions/v1/smooth-worker';
function botCall(body){
  return sb.auth.getSession().then(function(s){
    var tok=s&&s.data&&s.data.session&&s.data.session.access_token;if(!tok)throw new Error('no session');
    return fetch(BOT_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok},body:JSON.stringify(body)}).then(function(r){return r.json();});
  });
}
function translateRow(table,id){botCall({action:'translate',table:table,id:id}).then(function(){loadTable(table);}).catch(function(){});}
function translateAll(){
  var jobs=[];
  S.projects.forEach(function(p){if(!p.name_ar)jobs.push(['projects',p.id]);});
  S.tasks.forEach(function(t){if(!t.title_ar)jobs.push(['tasks',t.id]);});
  if(!jobs.length){toast('הכול כבר מתורגם ✓');return;}
  var total=jobs.length,done=0,fail=0,idx=0,running=0;
  toast('מתרגם '+total+' פריטים… נא לא לצאת מהדף');
  function next(){
    if(idx>=jobs.length){
      if(running===0){
        loadTable('tasks');loadTable('projects');
        toast(fail?('תורגמו '+(done-fail)+', נכשלו '+fail+'. לחץ שוב לניסיון נוסף.'):('תורגמו '+done+' פריטים ✓'));
      }
      return;
    }
    var j=jobs[idx++];running++;
    botCall({action:'translate',table:j[0],id:j[1]}).then(function(r){if(!r||!r.ok||!r.translated)fail++;}).catch(function(){fail++;}).then(function(){
      running--;done++;
      if(done%10===0&&done<total)toast('תורגמו '+done+' מתוך '+total+'…');
      next();
    });
  }
  for(var k=0;k<4;k++)next();
}
function confetti(){
  try{if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)return;}catch(e){}
  var c=document.createElement('div');c.className='confetti';var cols=['#F7941D','#384E69','#2E9E5B','#DDD6CB','#E53935','#4F7CAC'],h='';
  for(var i=0;i<34;i++){h+='<i style="left:'+(Math.random()*100)+'%;background:'+cols[i%cols.length]+';animation-delay:'+(Math.random()*.35)+'s;--dx:'+Math.round(Math.random()*120-60)+'px;--rot:'+Math.round(Math.random()*720-360)+'deg"></i>';}
  c.innerHTML=h;document.body.appendChild(c);setTimeout(function(){c.remove();},2200);
}
function toast(t){
  var d=document.createElement('div');d.textContent=t;
  d.style.animation='fadeUp .3s ease-out';d.style.cssText+='position:fixed;left:12px;right:12px;bottom:96px;z-index:99;background:#384E69;color:#fff;padding:12px 14px;border-radius:12px;font-weight:700;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.3)';
  document.body.appendChild(d);setTimeout(function(){d.remove();},5000);
}
async function setReminder(ref,title,body,when,uid){
  try{
    await sb.from('reminders').delete().eq('ref',ref);
    if(!when){return;}
    if(when.getTime()<=Date.now()){toast('התזכורת לא נשמרה: הזמן שלה כבר עבר.');return;}
    var r=await sb.from('reminders').insert({user_id:uid||AUTH.uid,ref:ref,title:title,body:body||'',remind_at:when.toISOString()});
    if(r.error){toast('התזכורת לא נשמרה: '+(r.error.message||'שגיאה'));return;}
    toast('תזכורת נקבעה ל-'+when.toLocaleDateString('he-IL',{day:'numeric',month:'numeric'})+' '+hm(when));
  }catch(e){toast('התזכורת לא נשמרה: '+(e&&e.message||'שגיאה'));}
}
function pushSupported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
function b64u(s){var p='='.repeat((4-s.length%4)%4),b=(s+p).replace(/-/g,'+').replace(/_/g,'/'),r=atob(b),o=new Uint8Array(r.length);for(var i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o;}
async function pushEnable(){
  var st=$('#pushst');function say(t){if(st)st.textContent=t;}
  if(!pushSupported()){say('הדפדפן הזה לא תומך בהתראות. פתח מ-Chrome באפליקציה המותקנת.');return;}
  try{
    var perm=await Notification.requestPermission();
    if(perm!=='granted'){say('ההתראות נחסמו. אפשר לאשר אותן בהגדרות הטלפון > אפליקציות > פדר > התראות.');return;}
    var reg=await navigator.serviceWorker.ready;
    var sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64u(VAPID)});
    var r=await sb.from('push_subscriptions').upsert({endpoint:sub.endpoint,user_id:AUTH.uid,sub:sub.toJSON()});
    if(r.error)throw r.error;
    try{localStorage.setItem('feder_push','1');}catch(e){}
    say('ההתראות פעילות במכשיר הזה ✓');
    reg.showNotification('פדר בניה',{body:'ההתראות מחוברות. כך ייראו התזכורות.',icon:'icons/icon-192.png'});
  }catch(e){say('לא הצלחתי להפעיל התראות. נסה שוב.');}
}
function pushOn(){try{return localStorage.getItem('feder_push')==='1'&&pushSupported()&&Notification.permission==='granted';}catch(e){return false;}}
var BELL=[];
function bellSeen(){try{return +localStorage.getItem('feder_bell_seen')||0;}catch(e){return 0;}}
async function loadBell(){
  try{
    var r=await sb.from('reminders').select('id,ref,title,body,remind_at').eq('user_id',AUTH.uid).eq('sent',true).order('remind_at',{ascending:false}).limit(30);
    if(r.data){var a=JSON.stringify(BELL.map(function(x){return x.id;}));BELL=r.data;if(a!==JSON.stringify(BELL.map(function(x){return x.id;})))render();}
  }catch(e){}
}
function bellBtn(){
  var seen=bellSeen(),n=BELL.filter(function(x){return Date.parse(x.remind_at)>seen;}).length;
  return '<button class="bellbtn'+(n?' ring':'')+'" data-act="bell" aria-label="התראות'+(n?' ('+n+' חדשות)':'')+'">'+ico('bell',26)+(n?'<span class="bdg">'+n+'</span>':'')+'</button>';
}
function openBell(){
  var seen=bellSeen();
  var html='<div class="scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><h2>התראות</h2>'+
   (BELL.length?'<div class="stack" style="margin-bottom:12px">'+BELL.map(function(x){
     var d=new Date(x.remind_at),isNew=d.getTime()>seen;
     var inner='<b>'+esc(x.title)+'</b>'+(isNew?' '+chip('warn','חדש'):'')+(x.body?'<br><span class="muted">'+esc(x.body)+'</span>':'')+'<br><span class="muted">'+d.toLocaleDateString('he-IL',{day:'numeric',month:'numeric'})+' · '+hm(d)+'</span>';
     return refTarget(x.ref)?'<button class="item bellit" data-act="bellopen" data-id="'+esc(x.id)+'" data-ref="'+esc(x.ref)+'" style="padding:10px 12px;width:100%;text-align:start"><span style="flex:1">'+inner+'</span>'+'<span style="transform:scaleX(-1);display:inline-flex;opacity:.55">'+ico('back',18)+'</span></button>':'<div class="item" style="padding:10px 12px">'+inner+'</div>';
   }).join('')+'</div>':'<p class="muted" style="margin-bottom:12px">עוד לא הגיעו התראות.</p>')+
   '<div class="fbtns">'+(BELL.length?'<button class="btn btn-line" type="button" data-act="bellclear">נקה הכול</button>':'')+'<button class="btn btn-line" type="button" data-act="closeSheet">סגור</button></div></div>';
  $('#layer').innerHTML=html;pushOverlay('sheet');
  try{localStorage.setItem('feder_bell_seen',String(Date.now()));}catch(e){}
  setTimeout(render,0);
}
function bellDrop(id){if(!id)return;BELL=BELL.filter(function(x){return x.id!==id;});sb.from('reminders').delete().eq('id',id).eq('sent',true).then(function(){},function(){});}
function bellClear(){var ids=BELL.map(function(x){return x.id;});BELL=[];if(ids.length)sb.from('reminders').delete().in('id',ids).eq('sent',true).then(function(){},function(){});closeSheet();render();toast('ההתראות נוקו');}
/* ---------- open the thing a notification is about ---------- */
function refTarget(ref){
  ref=String(ref||'');var m;
  if((m=/^(?:task|assign):([^:]+)/.exec(ref)))return {k:'task',id:m[1]};
  if((m=/^ev:(g:[^:]+|[^:]+)/.exec(ref)))return {k:'ev',id:m[1]};
  return null;
}
function flashItem(sel){setTimeout(function(){var b=document.querySelector(sel);var it=b&&(b.closest('.item')||b);if(!it)return;it.scrollIntoView({block:'center',behavior:'smooth'});it.classList.add('flash');setTimeout(function(){it.classList.remove('flash');},2600);},120);}
function openRef(ref){
  var t=refTarget(ref);if(!t)return false;
  if($('#layer .sheet')||form){closeSheet(true);try{if(history.state&&history.state.sheet){var hs=navSnap();history.replaceState(hs,'');navKey=JSON.stringify(hs);}}catch(e){}}
  if(AUTH.role==='worker'){
    if(t.k!=='task')return false;
    var wt=WK.tasks.filter(function(q){return q.id===t.id;})[0];
    if(!wt){toast('المهمة غير موجودة (ربما حُذفت)');return false;}
    WK.proj='';WK.mine=false;if(wt.status==='הושלם')WK.showDone=true;render();
    flashItem('[data-act="wtoggle"][data-id="'+t.id+'"]');return true;
  }
  if(t.k==='task'){
    var tk=byId('tasks',t.id);
    if(!tk){toast('המשימה לא נמצאה (אולי נמחקה)');return false;}
    if(tk.projectId&&byId('projects',tk.projectId)){UI.view='project';UI.projectId=tk.projectId;UI.tab='tasks';}
    else{UI.view='tasks';UI.taskFilter='all';UI.taskProject='';UI.taskPerson='';}
    window.scrollTo(0,0);render();
    setTimeout(function(){openForm('task',t.id);},60);return true;
  }
  var ev=allEvents().filter(function(e){return String(e.id)===t.id;})[0];
  if(!ev){toast('האירוע לא נמצא ביומן');return false;}
  var dt=new Date(ev.date+'T12:00:00');
  UI.view='calendar';UI.calMonth=new Date(dt.getFullYear(),dt.getMonth(),1);UI.calSel=ev.date;
  window.scrollTo(0,0);render();
  if(byId('events',t.id))setTimeout(function(){openForm('event',t.id);},60);
  return true;
}
/* a tapped push notification: find which reminder it was, then open it once data is in */
var PENDING_OPEN=null;
(function(){try{var q=new URLSearchParams(location.search);if(q.has('nt')||q.has('ref')){PENDING_OPEN={ref:q.get('ref')||'',title:q.get('nt')||'',body:q.get('nb')||''};history.replaceState(history.state,'',location.pathname);}}catch(e){}})();
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',function(e){var d=e.data||{};if(d.type==='notif-open'){PENDING_OPEN={ref:d.ref||'',title:d.title||'',body:d.body||''};runPendingOpen();}});
async function runPendingOpen(){
  if(!PENDING_OPEN||AUTH.state!=='app')return;
  if(AUTH.role==='worker'?!WK.ok:!loaded.tasks)return;
  var p=PENDING_OPEN;PENDING_OPEN=null;var ref=p.ref,bid=null;
  if(!ref&&p.title){
    try{var q=sb.from('reminders').select('id,ref').eq('user_id',AUTH.uid).eq('sent',true).eq('title',p.title);if(p.body)q=q.eq('body',p.body);
      var r=await q.order('remind_at',{ascending:false}).limit(1);if(r.data&&r.data[0]){ref=r.data[0].ref;bid=r.data[0].id;}}catch(e){}
  }
  if(!bid&&ref){var bm=BELL.filter(function(x){return x.ref===ref;})[0];if(bm)bid=bm.id;else{try{var r2=await sb.from('reminders').select('id').eq('user_id',AUTH.uid).eq('sent',true).eq('ref',ref).order('remind_at',{ascending:false}).limit(1);if(r2.data&&r2.data[0])bid=r2.data[0].id;}catch(e){}}}
  bellDrop(bid);
  var t=refTarget(ref);
  if(t&&AUTH.role!=='worker'&&t.k==='task'&&!byId('tasks',t.id)){try{await loadAll();}catch(e){}}
  if(AUTH.role==='worker'&&t&&!WK.tasks.some(function(q){return q.id===t.id;})){try{await loadWorker();}catch(e){}}
  if(!openRef(ref)&&AUTH.role!=='worker')openBell();
}
function teamName(id){var m=byId('team_members',id);return m?m.name:'';}
function tAsg(t){var a=Array.isArray(t.assignee_ids)?t.assignee_ids.filter(Boolean):[];if(!a.length&&t.assigneeId)a=[t.assigneeId];return a;}
function hasAsg(t,mid){return !!mid&&tAsg(t).indexOf(mid)>=0;}
function asgNames(t){return tAsg(t).map(teamName).filter(Boolean);}
function myMember(){return S.team_members.filter(function(m){return m.user_id&&m.user_id===AUTH.uid;})[0]||null;}
function assigneeOptions(sel){return '<option value="">ללא</option>'+S.team_members.map(function(m){return '<option value="'+esc(m.id)+'"'+(sel===m.id?' selected':'')+'>'+esc(m.name)+(m.title?' · '+esc(m.title):'')+'</option>';}).join('');}
function allEvents(){return S.events.filter(function(e){return !(e.google_id&&gReady());}).concat(G.events);}
var BLANK='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

var MAP={projectId:'project_id',clientName:'client_name',clientPhone:'client_phone',supplierId:'supplier_id',assigneeId:'assignee_id',orderId:'order_id'};
var RMAP={};Object.keys(MAP).forEach(function(k){RMAP[MAP[k]]=k;});
function fromRow(r){var o={};Object.keys(r).forEach(function(k){o[RMAP[k]||k]=r[k];});o.createdAt=r.created_at?Date.parse(r.created_at):0;
  if(r.done_at){o.doneDate=ymd(new Date(r.done_at));}
  if(r.start_at){var d=new Date(r.start_at);o.date=ymd(d);o.startTime=r.all_day?'':hm(d);o.endTime=(r.end_at&&!r.all_day)?hm(new Date(r.end_at)):'';}
  return o;}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function hm(d){return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
function toRow(d){var o={};Object.keys(d).forEach(function(k){var v=d[k];o[MAP[k]||k]=(v===''?null:v);});return o;}

function $(s,r){return (r||document).querySelector(s);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function money(n){n=Number(n)||0;return '₪'+n.toLocaleString('he-IL',{maximumFractionDigits:2});}
function todayStr(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function pd(s){if(!s)return null;var p=String(s).split('-');if(p.length<3)return null;return new Date(+p[0],+p[1]-1,+p[2]);}
function fdate(s){var d=pd(s);if(!d)return '';var o={day:'numeric',month:'long'};if(d.getFullYear()!==new Date().getFullYear())o.year='numeric';return d.toLocaleDateString('he-IL',o);}
function byId(col,id){for(var i=0;i<S[col].length;i++)if(S[col][i].id===id)return S[col][i];if(col==='events'){for(var j=0;j<G.events.length;j++)if(G.events[j].id===id)return G.events[j];}return null;}
function pname(id){if(!id)return 'כללי';var p=byId('projects',id);return p?p.name:'פרויקט שנמחק';}
function sum(a){return a.reduce(function(t,x){return t+(Number(x.amount)||0);},0);}
function chip(cls,t){return '<span class="chip c-'+cls+'">'+esc(t)+'</span>';}
function purl(path){return PHOTO[path]||BLANK;}
function isVid(p){return /\.(mp4|mov|webm|3gp|m4v)$/i.test(p||'');}
function isPdf(p){return /\.pdf$/i.test(p||'');}
function mediaTag(p,full){if(isPdf(p))return '<span class="pdft">PDF</span>';return isVid(p)?'<video src="'+purl(p)+'#t=0.1" preload="metadata" muted playsinline'+(full?' controls':'')+'></video>'+(full?'':'<span class="vplay">'+ico('play',26)+'</span>'):'<img loading="lazy" decoding="async" src="'+purl(p)+'" alt="">';}
function isStaff(){return AUTH.role==='admin'||AUTH.role==='team'||AUTH.role==='ceo';}
function isAdmin(){return AUTH.role==='admin';}

var I={play:'<polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>',
 home:'<path d="M4 11l8-7 8 7v9H4z"/>',
 folder:'<path d="M3 7h7l2 2h9v10H3z"/>',
 check:'<path d="M5 12l4 4 10-10"/>',
 people:'<circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6M16 11a3 3 0 100-6M18 14c2 .6 3 2.4 3 5"/>',
 receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
 bell:'<path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z"/><path d="M10 21h4"/>',
 camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 image:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
 back:'<path d="M9 5l7 7-7 7"/>',
 phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/>',
 send:'<path d="M4 12l16-8-6 16-3-7z"/>',
 cal:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
 tasks:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
 receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
 box:'<path d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>',
 link:'<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
 gantt:'<path d="M4 6h9M8 12h12M6 18h8"/>',
 plan:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
 truck:'<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
 chat:'<path d="M4 5h16v11H9l-5 4z"/>',
 report:'<path d="M5 20V10M11 20V4M17 20v-7"/>'
};
function ico(n,s){s=s||22;return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+I[n]+'</svg>';}

/* ---------- forms config ---------- */
var AREAS0=['כללי','ריצוף','חשמל','אינסטלציה','טיח','איטום','צבע','מוסטפה'];
function areaList(){var o=AREAS0.slice();S.tasks.forEach(function(t){if(t.area&&o.indexOf(t.area)<0)o.push(t.area);});return o;}
var STAGES=['שלד','אינסטלציה','חשמל','איטום','טיח','ריצוף','גמר','אחר'];
var F={
 project:{title:'פרויקט',col:'projects',fields:[
  {k:'name',l:'שם הפרויקט',t:'text',req:1},{k:'address',l:'כתובת',t:'text'},
  {k:'clientName',l:'שם הלקוח',t:'text'},{k:'clientPhone',l:'טלפון הלקוח',t:'tel'},
  {k:'status',l:'סטטוס',t:'select',o:['בהתחלה','בביצוע','בפינישים','הסתיים'],d:'בביצוע'},
  {k:'budget',l:'תקציב (₪)',t:'number'}]},
 task:{title:'משימה',col:'tasks',fields:[
  {k:'projectId',l:'פרויקט',t:'project',req:1},{k:'title',l:'מה צריך לעשות',t:'text',req:1},{k:'title_ar',l:'כותרת בערבית (לא חובה, לעובד שטח)',t:'text'},
  {k:'assignee_ids',l:'אחראים (אפשר לבחור כמה – כולם יקבלו התראה)',t:'assignees'},{k:'due',l:'עד תאריך',t:'date'},{k:'due_time',l:'שעה (לא חובה, תזכורת חצי שעה לפני)',t:'time'},{k:'area',l:'תחום',t:'select',o:areaList,d:'כללי',add:1},{k:'kind',l:'סוג',t:'select',o:['משימה','פגישה'],d:'משימה'},{k:'remind',l:'תזכורת בטלפון (דרך יומן גוגל)',t:'select',o:['ללא','בבוקר של היום (8:00)','יום לפני (18:00)'],d:'ללא'},{k:'status',l:'סטטוס',t:'select',o:['לביצוע','בתהליך','ממתין להחלטה','הושלם'],d:'לביצוע'},
  {k:'notes',l:'הערות',t:'textarea'},{k:'photo',l:'תמונה או וידאו (לא חובה)',t:'photo',vid:1},{k:'client_visible',l:'אזור הלקוח',t:'bool',cl:'פגישה – להציג ללקוח באזור האישי'}]},
 resp:{title:'פריט אחריות / אספקה / הזמנה',col:'resp_items',fields:[
  {k:'projectId',l:'פרויקט',t:'project',req:1},{k:'grp',l:'באחריות',t:'select',o:[['client','הלקוח'],['client_supply','אספקות של הלקוח'],['architect','האדריכלית'],['office','מוישי / המשרד']],d:'client'},
  {k:'item',l:'פריט',t:'text',req:1},{k:'note',l:'הערה',t:'text'},{k:'stage',l:'שלב בגאנט (למשל: גבס)',t:'text'},{k:'week',l:'שבוע',t:'number'},
  {k:'urgent',l:'דחיפות',t:'bool',cl:'מיידי'},{k:'done',l:'מצב',t:'bool',cl:'בוצע'},{k:'reply',l:'תשובה מהלקוח / האדריכלית',t:'text'}]},
 payment:{title:'תשלום של הלקוח',col:'payments',fields:[
  {k:'projectId',l:'פרויקט',t:'project',req:1},{k:'title',l:'שלב / תיאור (למשל: מקדמה, סיום שלד)',t:'text',req:1},{k:'amount',l:'סכום (₪)',t:'number'},{k:'due',l:'מועד',t:'date'},
  {k:'paid',l:'שולם',t:'bool',cl:'שולם'},{k:'note',l:'הערה',t:'text'}]},
 change:{title:'בקשת שינוי',col:'change_requests',fields:[
  {k:'body',l:'הבקשה',t:'textarea',req:1},{k:'status',l:'מצב',t:'select',o:['חדש','הצעת מחיר','אושר','נדחה','בוצע'],d:'חדש'},{k:'price',l:'מחיר (₪) – הלקוח יתבקש לאשר',t:'number'},{k:'reply',l:'תשובה ללקוח',t:'textarea'}]},
 expense:{title:'הוצאה / קבלה',col:'expenses',fields:[
  {k:'photo',l:'תמונת הקבלה או קובץ PDF',t:'photo',pdf:1},{k:'projectId',l:'פרויקט (השאר ריק להוצאה כללית)',t:'project',empty:'הוצאה כללית, בלי פרויקט'},
  {k:'vendor',l:'ספק / על מה ההוצאה',t:'text',list:'suppliers',req:1},{k:'amount',l:'סכום (₪)',t:'number',req:1},
  {k:'pay',l:'אמצעי תשלום',t:'select',o:['לא צוין','מזומן','אשראי'],d:'מזומן'},{k:'date',l:'תאריך',t:'date',d:'today'},{k:'note',l:'פירוט / הערה',t:'text'}]},
 supplier:{title:'ספק',col:'suppliers',fields:[
  {k:'name',l:'שם הספק / החנות',t:'text',req:1},{k:'field',l:'תחום / קטגוריה',t:'text',list:'fields'},
  {k:'phone',l:'טלפון החנות',t:'tel'},{k:'contacts',l:'אנשי קשר',t:'contacts'},{k:'notes',l:'הערות',t:'textarea'}]},
 order:{title:'הזמנה',col:'orders',fields:[
  {k:'projectId',l:'פרויקט',t:'project',req:1},{k:'item',l:'מה להזמין',t:'text',req:1},
  {k:'supplierId',l:'ספק',t:'supplier'},{k:'status',l:'מצב',t:'select',o:['לא הוזמן','הוזמן','הגיע'],d:'לא הוזמן'},
  {k:'note',l:'הערה',t:'text'}]},
 gantt:{title:'שבוע בלוח הזמנים',col:'gantt_items',fields:[
  {k:'projectId',l:'פרויקט',t:'project',req:1},{k:'start_date',l:'מתאריך',t:'date',req:1,d:'today'},{k:'end_date',l:'עד תאריך',t:'date',req:1,d:'today'},
  {k:'title',l:'התקדמות צפויה (מה מתבצע בתקופה הזו)',t:'textarea',req:1},
  {k:'pct',l:'הושלם (%)',t:'select',o:['0','10','20','25','30','40','50','60','70','75','80','90','100'],d:'0'},
  {k:'color',l:'צבע ההתקדמות',t:'select',o:['אוטומטי (לפי אחוז)','ירוק','כתום','כחול','אדום','סגול','אפור'],d:'אוטומטי (לפי אחוז)'},
  {k:'milestone',l:'אבן דרך (לא חובה)',t:'text'},{k:'notes',l:'הערות',t:'text'},{k:'client_task',l:'משימות ללקוח / אדריכלית',t:'text'}]},
 event:{title:'אירוע ביומן',col:'events',fields:[
  {k:'title',l:'כותרת',t:'text',req:1},{k:'date',l:'תאריך',t:'date',req:1,d:'today'},
  {k:'startTime',l:'שעת התחלה (אפשר להשאיר ריק ליום שלם)',t:'time'},{k:'endTime',l:'שעת סיום',t:'time'},
  {k:'remind',l:'תזכורת בטלפון (דרך יומן גוגל)',t:'select',o:['ללא','בזמן האירוע','10 דקות לפני','30 דקות לפני','שעה לפני','יומיים לפני','יום לפני'],d:'30 דקות לפני'},{k:'projectId',l:'פרויקט (לא חובה)',t:'project'},{k:'location',l:'מקום',t:'text'},{k:'notes',l:'הערות',t:'textarea'}]},
 plan:{title:'תוכנית / מסמך',col:'plans',fields:[
  {k:'file',l:'הקובץ (PDF, תמונה, DWG...)',t:'file'},{k:'projectId',l:'פרויקט',t:'project',req:1},
  {k:'kind',l:'סוג',t:'select',o:['תוכנית','חוזה','היתר','הצעת מחיר','מפרט','מסמך אחר'],d:'תוכנית'},{k:'title',l:'שם',t:'text'},{k:'client_visible',l:'אזור הלקוח',t:'bool',cl:'להציג ללקוח באזור האישי'},{k:'notes',l:'הערות',t:'textarea'}]},
 supdoc:{title:'תעודה / תיעוד של ספק',col:'supplier_docs',fields:[
  {k:'photo',l:'תמונה או וידאו',t:'photo',vid:1},{k:'projectId',l:'פרויקט',t:'project',req:1},{k:'supplierId',l:'ספק',t:'supplier',req:1},
  {k:'kind',l:'סוג',t:'select',o:['תעודת משלוח','תיעוד'],d:'תעודת משלוח'},
  {k:'title',l:'כותרת (לא חובה)',t:'text'},{k:'link',l:'קישור (דרייב וכו׳, לא חובה)',t:'url'},{k:'date',l:'תאריך',t:'date',d:'today'},{k:'note',l:'הערה',t:'textarea'}]},
 doc:{title:'תיעוד',col:'docs',fields:[
  {k:'photo',l:'תמונה או וידאו',t:'photo',vid:1},{k:'projectId',l:'פרויקט',t:'project',req:1},
  {k:'stage',l:'תחום',t:'select',o:['חשמל','אינסטלציה','איטום','ריצוף','בנייה','הריסה','משימה','אחר'],d:'אחר'},
  {k:'link',l:'קישור (גוגל דרייב וכו׳, לא חובה, לקבצים גדולים)',t:'url'},{k:'date',l:'תאריך',t:'date',d:'today'},{k:'note',l:'הערה',t:'textarea'},{k:'client_visible',l:'אזור הלקוח',t:'bool',cl:'להציג ללקוח באזור האישי'}]}
};
var TASK_CHIP={'לביצוע':'neutral','בתהליך':'warn','ממתין להחלטה':'start','הושלם':'ok'};
var PROJ_CHIP={'בהתחלה':'start','בביצוע':'run','בפינישים':'info','הסתיים':'ok','סיום':'ok'};
var ORD_CHIP={'לא הוזמן':'warn','הוזמן':'info','הגיע':'ok'};
var ORD_NEXT={'לא הוזמן':'הוזמן','הוזמן':'הגיע','הגיע':'לא הוזמן'};

/* ---------- views ---------- */
function bandHtml(title,sub,opts){
  opts=opts||{};
  var back=opts.back?'<button class="backlink" data-act="back">'+ico('back',20)+opts.back+'</button>':'';
  var right=opts.right||'';
  return '<header class="band"><div class="wrap">'+back+'<div class="top"><div style="min-width:0">'+(sub?'<div class="sub">'+esc(sub)+'</div>':'')+'<h1>'+esc(title)+'</h1>'+(opts.sub2?'<div class="sub" style="margin-top:2px">'+esc(opts.sub2)+'</div>':'')+'</div>'+right+'</div></div></header>';
}
function emptyBox(msg,btn){return '<div class="empty"><p>'+esc(msg)+'</p>'+(btn||'')+'</div>';}
function addBtn(e,label,proj){return '<button class="btn btn-accent" data-act="add" data-e="'+e+'"'+(proj?' data-project="'+esc(proj)+'"':'')+'>'+ico('plus',20)+esc(label)+'</button>';}
var PULL='padding-top:16px;margin-top:-30px;position:relative';

function projectCard(p){
  var tasks=S.tasks.filter(function(t){return t.projectId===p.id;});
  var done=tasks.filter(function(t){return t.status==='הושלם';}).length;
  var open=tasks.length-done;
  var pct=tasks.length?Math.round(done/tasks.length*100):0;
  var spent=sum(S.expenses.filter(function(x){return x.projectId===p.id;}));
  return '<button class="pcard" data-act="project" data-id="'+esc(p.id)+'">'+
   '<div class="row1"><div class="name">'+esc(p.name)+'</div>'+chip(PROJ_CHIP[p.status]||'neutral',p.status||'')+'</div>'+
   (p.address?'<div class="muted">'+esc(p.address)+'</div>':'')+
   '<div class="bar" role="img" aria-label="התקדמות '+pct+' אחוז"><i style="width:'+pct+'%"></i></div>'+
   '<div class="meta"><span>'+open+' משימות פתוחות</span><span>'+money(spent)+'</span></div></button>';
}
var PSORT=[['az','לפי א-ב'],['status','לפי סטטוס'],['new','החדשים ראשון'],['old','הישנים ראשון']];
var PST=['בהתחלה','בביצוע','בפינישים','הסתיים','סיום'];
function projSortKey(){var v=lsGet('feder_psort');return PSORT.some(function(x){return x[0]===v;})?v:'az';}
function sortedProjects(){
  var k=projSortKey(),az=function(a,b){return String(a.name||'').localeCompare(String(b.name||''),'he');},ts=function(p){return Number(p.createdAt)||0;};
  return S.projects.slice().sort(function(a,b){
    if(k==='status'){var d=PST.indexOf(a.status)-PST.indexOf(b.status);return d||az(a,b);}
    if(k==='new')return ts(b)-ts(a)||az(a,b);
    if(k==='old')return ts(a)-ts(b)||az(a,b);
    return az(a,b);
  });
}

function vHome(){
  var mk=todayStr().slice(0,7);
  var monthSpent=sum(S.expenses.filter(function(x){return String(x.date||'').slice(0,7)===mk;}));
  var openT=S.tasks.filter(function(t){return t.status!=='הושלם';});
  var toOrder=S.orders.filter(function(o){return o.status==='לא הוזמן';}).length;
  var dateStr=new Date().toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long'});
  var up=openT.slice().sort(function(a,b){return String(a.due||'9999').localeCompare(String(b.due||'9999'));}).slice(0,4);
  var first=(AUTH.name||'').split(' ')[0];
  var h=bandHtml('שלום'+(first?', '+first:''),dateStr,{right:'<div style="display:flex;align-items:center;gap:10px">'+bellBtn()+'<img class="logo" src="'+LOGO+'" alt="פדר - לבנות בראש שקט"></div>'});
  h+='<main class="wrap">';
  var doneN=S.tasks.filter(function(t){return t.status==='הושלם';}).length;
  h+='<div class="pull hrow"><div class="hstats"><button class="hstat" data-act="tasksby" data-v="open" aria-label="משימות שלא הושלמו"><b>'+openT.length+'</b><span>פתוחות</span></button><button class="hstat ok" data-act="tasksby" data-v="done" aria-label="משימות שהושלמו"><b>'+doneN+'</b><span>הושלמו</span></button></div></div>';
  if(isCeo())h+='<button class="ceo-back" data-act="nav" data-v="ceo">'+ico('home',20)+'חזרה לדשבורד שלי</button>';
  h+='<div class="pgrid hacts">'+
     '<button class="pic" data-act="add" data-e="expense"><span class="pcirc hc h1">'+ico('receipt',28)+'</span><span class="plab">קבלה</span></button>'+
     '<button class="pic" data-act="add" data-e="task"><span class="pcirc hc h2">'+ico('plus',28)+'</span><span class="plab">משימה</span></button>'+
     '<button class="pic" data-act="add" data-e="doc"><span class="pcirc hc h3">'+ico('camera',28)+'</span><span class="plab">תיעוד</span></button>'+
     '<button class="pic" data-act="reportall"><span class="pcirc hc h4">'+ico('report',28)+'</span><span class="plab">דוחות</span></button></div>';
  if(toOrder){h+='<div class="card" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:10px"><span><b>'+toOrder+'</b> פריטים עדיין לא הוזמנו</span><button class="link" data-act="nav" data-v="projects">לפרויקטים</button></div>';}
  var todayEv=allEvents().filter(function(e){return e.date===todayStr();}).sort(evSort);
  var tdy=todayStr(),tmr=ymd(new Date(Date.now()+86400000));
  var late=openT.filter(function(t){return t.due&&t.due<tdy;}),dueT=openT.filter(function(t){return t.due===tdy;}),dueN=openT.filter(function(t){return t.due===tmr;});
  var delT=S.orders.filter(function(o){return o.status==='הוזמן';}).length;
  var mm=myMember();
  if(mm){var myOpen=openT.filter(function(t){return hasAsg(t,mm.id);}).length;
    h+='<button class="card" style="margin-top:12px;width:100%;text-align:start;display:flex;justify-content:space-between;align-items:center;cursor:pointer" data-act="mytasks"><span><b>'+myOpen+'</b> משימות פתוחות בשבילך</span><span class="link">הצג</span></button>';}
  if(!gWasConnected()&&isStaff())h+='<div class="card" style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:10px"><span><b>היומן האישי שלך</b><br><span class="muted">חבר את יומן הגוגל שלך – הפגישות שלך ייכנסו אליו, ותקבל הזמנות לפגישות משותפות.</span></span><button class="btn btn-navy" data-act="gconnect">חבר את היומן שלי</button></div>';
  if(!pushOn()&&pushSupported())h+='<div class="card" style="margin-top:12px"><b>התראות לטלפון</b><div class="muted" style="margin:4px 0 8px">כדי לקבל תזכורות לפגישות ולמשימות גם כשהאפליקציה סגורה.</div><button class="btn btn-accent" data-act="pushon">הפעל התראות</button><div class="muted" id="pushst" style="margin-top:6px"></div></div>';
  if(late.length||dueT.length||dueN.length){
    h+='<div class="card" style="margin-top:12px;border-inline-start:5px solid var(--accent,#F7941D)"><b>תזכורות</b><div style="margin-top:6px;line-height:1.7">'+
      (late.length?'<div>⚠️ '+late.length+' משימות באיחור</div>':'')+
      (dueT.length?'<div>📌 להיום: '+dueT.map(function(t){return esc(t.title);}).join(', ')+'</div>':'')+
      (dueN.length?'<div>⏰ מחר: '+dueN.map(function(t){return esc(t.title);}).join(', ')+'</div>':'')+
      '</div></div>';
  }
  if(todayEv.length)h+='<div class="sec"><h2>היום ביומן</h2><button class="link" data-act="nav" data-v="calendar">ליומן</button></div><div class="stack">'+todayEv.slice(0,3).map(evRow).join('')+'</div>';
  h+='<div class="sec"><h2>משימות קרובות</h2><button class="link" data-act="nav" data-v="tasks">הכול</button></div>';
  if(up.length){h+='<div class="stack">'+up.map(taskRow.bind(null,true,true)).join('')+'</div>';}
  else h+=emptyBox('אין משימות פתוחות.',addBtn('task','משימה חדשה'));
  h+='<div class="sec"><h2>הפרויקטים שלי</h2><button class="link" data-act="nav" data-v="projects">הצג הכול</button></div>';
  if(S.projects.length){h+='<div class="stack">'+sortedProjects().map(projectCard).join('')+'</div>';}
  else h+=emptyBox('עוד אין פרויקטים. מתחילים מהראשון.',addBtn('project','פרויקט חדש'));
  var pend=S.profiles.filter(function(p){return p.role==='pending';}).length;
  h+='<div style="text-align:center;margin:26px 0 8px;display:flex;justify-content:center;gap:24px">'+((isAdmin()||isCeo())?'<button class="link" data-act="nav" data-v="ceo">'+(isCeo()?'הדשבורד שלי':'תצוגת מנכ״ל')+'</button>':'')+(isAdmin()?'<button class="link" data-act="nav" data-v="users">משתמשים והרשאות'+(pend?' ('+pend+' ממתינים)':'')+'</button>':'')+'<button class="link" data-act="logout">התנתקות</button></div><div class="muted" style="text-align:center">גרסה 52</div>';
  return h+'</main>';
}
function vProjects(){
  var h=bandHtml('הפרויקטים',null,{right:'<button class="btn btn-accent" data-act="add" data-e="project">'+ico('plus',20)+'חדש</button>'});
  h+='<main class="wrap" style="'+PULL+'">';
  if(S.projects.length)h+='<button class="btn btn-line" style="width:100%;margin-bottom:12px;background:var(--surface)" data-act="reportall">דוח כללי לכל הפרויקטים</button>';
  if(S.projects.length>1)h+='<div class="fld" style="margin:0 0 12px"><label for="psort">מיין לפי</label><select id="psort" data-psort="1">'+PSORT.map(function(x){return '<option value="'+x[0]+'"'+(projSortKey()===x[0]?' selected':'')+'>'+x[1]+'</option>';}).join('')+'</select></div>';
  h+=S.projects.length?'<div class="stack">'+sortedProjects().map(projectCard).join('')+'</div>':emptyBox('עוד אין פרויקטים.',addBtn('project','פרויקט חדש'));
  return h+'</main>';
}

function taskRow(showProj,editable,t){
  var overdue=t.status!=='הושלם'&&t.due&&t.due<todayStr();
  var cls=t.status==='הושלם'?'d':(t.status==='בתהליך'?'p':'');
  var dtm=t.due_time?' · '+esc(t.due_time):'';
  var due=t.due?(overdue?chip('warn','באיחור · '+fdate(t.due)+dtm):'<span class="muted">'+fdate(t.due)+dtm+'</span>'):'';
  var tick=editable?'<button class="tick '+cls+(UI.justDone===t.id?' pop':'')+'" data-act="toggle" data-id="'+esc(t.id)+'" aria-label="'+(t.status==='הושלם'?'החזר לביצוע':'סמן כהושלם')+'">'+(t.status==='הושלם'?ico('check',20):'')+'</button>':'<span class="tick '+cls+'">'+(t.status==='הושלם'?ico('check',20):'')+'</span>';
  var main=(t.photo?'<span class="tthumb">'+mediaTag(t.photo)+'</span>':'')+'<div class="t"'+(t.status==='הושלם'?' style="text-decoration:line-through;opacity:.7"':'')+'>'+(t.kind==='פגישה'?ico('cal',16)+' ':'')+esc(t.title)+'</div><div class="muted">'+(showProj?esc(pname(t.projectId))+(t.due?' · ':''):'')+due+'</div>';
  return '<div class="item">'+tick+(editable?'<button class="main" data-act="edit" data-e="task" data-id="'+esc(t.id)+'">'+main+'</button>':'<div class="main">'+main+'</div>')+
   asgNames(t).map(function(n){return chip('info',n);}).join('')+(t.status!=='לביצוע'&&t.status!=='הושלם'?chip(TASK_CHIP[t.status]||'neutral',t.status):'')+(t.area&&t.area!=='כללי'?chip('neutral',t.area):'')+'</div>';
}
function sortTasks(a){return a.slice().sort(function(x,y){
  var dx=x.status==='הושלם',dy=y.status==='הושלם';if(dx!==dy)return dx?1:-1;
  return String(x.due||'9999').localeCompare(String(y.due||'9999'));});}
function projSelect(id,key){return '<div class="fld"><label for="'+id+'" class="sr">פרויקט</label><select id="'+id+'" data-sel="'+key+'"><option value="">כל הפרויקטים</option>'+(key==='expProject'?'<option value="__gen"'+(UI[key]==='__gen'?' selected':'')+'>הוצאות כלליות (בלי פרויקט)</option>':'')+S.projects.map(function(p){return '<option value="'+esc(p.id)+'"'+(UI[key]===p.id?' selected':'')+'>'+esc(p.name)+'</option>';}).join('')+'</select></div>';}

function vTasks(){
  var list=S.tasks.filter(function(t){
    if(UI.taskProject&&t.projectId!==UI.taskProject)return false;
    if(UI.taskPerson){var pid=UI.taskPerson==='me'?(myMember()||{}).id:UI.taskPerson;if(!hasAsg(t,pid))return false;}
    if(UI.taskFilter==='open')return (t.status!=='הושלם'||t.id===UI.justDone)&&t.status!=='ממתין להחלטה';
    if(UI.taskFilter==='dec')return t.status==='ממתין להחלטה';
    if(UI.taskFilter==='done')return t.status==='הושלם';
    return true;});
  var h=bandHtml('משימות',null,{right:'<button class="btn btn-accent" data-act="add" data-e="task">'+ico('plus',20)+'חדשה</button>'});
  h+='<main class="wrap" style="'+PULL+'">';
  h+='<div class="filters">'+[['open','פתוחות'],['dec','ממתינות להחלטה ('+S.tasks.filter(function(t){return t.status==='ממתין להחלטה';}).length+')'],['all','הכול'],['done','הושלמו']].map(function(x){return '<button class="fchip" data-act="tfilter" data-v="'+x[0]+'" aria-pressed="'+(UI.taskFilter===x[0])+'">'+x[1]+'</button>';}).join('')+'</div>';
  h+=projSelect('tproj','taskProject');
  h+='<div class="fld"><label for="tper" class="sr">אחראי</label><select id="tper" data-sel="taskPerson"><option value="">כל האנשים</option>'+(myMember()?'<option value="me"'+(UI.taskPerson==='me'?' selected':'')+'>המשימות שלי</option>':'')+S.team_members.map(function(m){return '<option value="'+esc(m.id)+'"'+(UI.taskPerson===m.id?' selected':'')+'>'+esc(m.name)+'</option>';}).join('')+'</select></div>';
  h+=list.length?'<div class="stack">'+sortTasks(list).map(taskRow.bind(null,true,true)).join('')+'</div>':emptyBox(UI.taskFilter==='done'?'עוד לא הושלמה אף משימה.':'אין משימות להצגה.',addBtn('task','משימה חדשה'));
  return h+'</main>';
}

function expRow(showProj,x){
  return '<div class="item">'+(x.photo?'<button class="thumb" data-act="photo" data-id="'+esc(x.photo)+'" aria-label="הצג קבלה">'+(isPdf(x.photo)?'<span class="pdft">PDF</span>':'<img loading="lazy" decoding="async" class="thumb" src="'+purl(x.photo)+'" alt="">')+'</button>':'')+
   '<button class="main" data-act="edit" data-e="expense" data-id="'+esc(x.id)+'"><div class="t">'+esc(x.vendor)+'</div><div class="muted">'+(showProj?esc(pname(x.projectId))+' · ':'')+fdate(x.date)+(x.pay?' · '+esc(x.pay):'')+(x.note?' · '+esc(x.note):'')+'</div></button>'+
   '<div class="amt">'+money(x.amount)+'</div></div>';
}
function sortExp(a){return a.slice().sort(function(x,y){return String(y.date||'').localeCompare(String(x.date||''));});}
function expFilt(x){return !UI.expProject||(UI.expProject==='__gen'?!x.projectId:x.projectId===UI.expProject);}
function vExpenses(){
  var list=S.expenses.filter(expFilt);
  var mk=todayStr().slice(0,7);
  var month=sum(list.filter(function(x){return String(x.date||'').slice(0,7)===mk;}));
  var h=bandHtml('הוצאות',null,{right:'<button class="btn btn-accent" data-act="add" data-e="expense">'+ico('camera',20)+'קבלה</button>'});
  h+='<main class="wrap" style="'+PULL+'">';
  h+='<div class="grid2"><div class="card stat"><div class="k">החודש</div><div class="v">'+money(month)+'</div></div><div class="card stat"><div class="k">סה״כ</div><div class="v">'+money(sum(list))+'</div></div></div>';
  h+='<div style="margin-top:14px">'+projSelect('eproj','expProject')+'</div>';
  h+=list.length?'<div class="stack">'+sortExp(list).map(expRow.bind(null,true)).join('')+'</div>':emptyBox('עוד אין הוצאות. צלם קבלה ראשונה.',addBtn('expense','צלם קבלה'));
  return h+'</main>';
}

function supplierFields(){var o={};S.suppliers.forEach(function(s){if(s.field)o[s.field]=1;});return Object.keys(o).sort();}
function waNum(p){var d=String(p||'').replace(/\D/g,'');if(d.indexOf('00')===0)d=d.slice(2);else if(d.charAt(0)==='0')d='972'+d.slice(1);return d;}
function callBtns(phone,label){
  if(!phone)return '';
  return '<span class="callrow"><a class="call" href="tel:'+esc(String(phone).replace(/[^0-9+]/g,''))+'" aria-label="התקשר ל'+esc(label)+'">'+ico('phone',20)+'</a>'+
   '<a class="call wa" href="https://wa.me/'+esc(waNum(phone))+'" target="_blank" rel="noopener" aria-label="וואטסאפ ל'+esc(label)+'">'+WAI+'</a></span>';
}
var WAI='<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4z"/></svg>';
function supplierList(){
  var q=UI.supQuery.trim().toLowerCase(),mk=todayStr().slice(0,7);
  var list=S.suppliers.filter(function(s){
    if(UI.supField&&s.field!==UI.supField)return false;
    if(UI.supProject){
      var inP=S.orders.some(function(o){return o.projectId===UI.supProject&&o.supplierId===s.id;})||S.expenses.some(function(x){return x.projectId===UI.supProject&&x.vendor===s.name;});
      if(!inP)return false;
    }
    var hay=((s.name||'')+' '+(s.field||'')+' '+(s.phone||'')+' '+(s.contacts||[]).map(function(c){return (c.name||'')+' '+(c.phone||'')+' '+(c.role||'');}).join(' ')).toLowerCase();
    return !q||hay.indexOf(q)>-1;
  }).sort(function(a,b){return String(a.name).localeCompare(String(b.name),'he');});
  if(!list.length)return emptyBox(S.suppliers.length?'לא נמצא ספק מתאים.':'עוד אין ספקים. מוסיפים את הראשון, או מייבאים מאנשי הקשר.',S.suppliers.length?'':addBtn('supplier','ספק חדש'));
  return '<div class="stack">'+list.map(function(s){
    var open=S.orders.filter(function(o){return o.supplierId===s.id&&o.status!=='הגיע';}).length;
    var spent=sum(S.expenses.filter(function(x){return x.vendor===s.name&&String(x.date||'').slice(0,7)===mk;}));
    var cts=(s.contacts||[]).map(function(c){
      return '<div class="contact"><div style="min-width:0"><div style="font-weight:700">'+esc(c.name||'')+'</div><div class="muted">'+(c.role?esc(c.role)+' · ':'')+'<span class="ltr">'+esc(c.phone||'')+'</span></div></div>'+callBtns(c.phone,c.name||s.name)+'</div>';
    }).join('');
    return '<div class="card"><div class="row1"><button class="main" style="flex:1;min-width:0;background:none;border:0;text-align:start;padding:0;color:inherit" data-act="edit" data-e="supplier" data-id="'+esc(s.id)+'">'+
      '<div class="name">'+esc(s.name)+'</div><div class="muted">'+esc(s.field||'')+(s.phone?' · <span class="ltr">'+esc(s.phone)+'</span>':'')+'</div></button>'+callBtns(s.phone,s.name)+'</div>'+
      (cts?'<div class="contacts">'+cts+'</div>':'')+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">'+chip(open?'warn':'ok',open?open+' הזמנות פתוחות':'אין הזמנות פתוחות')+chip('neutral',money(spent)+' החודש')+'</div></div>';
  }).join('')+'</div>';
}
function vSuppliers(){
  var h=bandHtml('ספקים',null,{right:'<button class="btn btn-accent" data-act="add" data-e="supplier">'+ico('plus',20)+'ספק חדש</button>'});
  h+='<main class="wrap" style="'+PULL+'">';
  h+='<button class="btn btn-line" style="width:100%;margin:12px 0 10px;background:var(--surface)" data-act="import">'+ico('people',22)+'ייבוא מאנשי הקשר בטלפון</button>';
  h+='<label for="sq" class="sr">חיפוש ספק</label><input id="sq" class="search" type="search" placeholder="חפש ספק או תחום" value="'+esc(UI.supQuery)+'" autocomplete="off">';
  var fs=supplierFields();
  if(fs.length){h+='<div class="filters" style="margin-top:8px"><button class="fchip" data-act="sfield" data-v="" aria-pressed="'+(!UI.supField)+'">הכול</button>'+fs.map(function(f){return '<button class="fchip" data-act="sfield" data-v="'+esc(f)+'" aria-pressed="'+(UI.supField===f)+'">'+esc(f)+'</button>';}).join('')+'</div>';}
  if(UI.supField)h+='<button class="link" data-act="renamefield">✎ שנה שם לתחום «'+esc(UI.supField)+'»</button>';
  h+='<div style="margin-top:4px"><div class="fld"><label for="sproj" class="sr">פרויקט</label><select id="sproj" data-sel="supProject"><option value="">ספקים מכל הפרויקטים</option>'+S.projects.map(function(p){return '<option value="'+esc(p.id)+'"'+(UI.supProject===p.id?' selected':'')+'>'+esc(p.name)+'</option>';}).join('')+'</select></div></div>';
  h+='<div id="suplist" style="margin-top:8px">'+supplierList()+'</div>';
  return h+'</main>';
}

function msgsHtml(pid){
  var list=S.messages.filter(function(m){return m.projectId===pid;}).sort(function(a,b){return a.createdAt-b.createdAt;});
  var h='<div class="msgs">'+(list.length?list.map(function(m){
    var me=m.sender===AUTH.uid;
    var who=me?'אני':(isStaff()?'לקוח':'פדר בניה');
    var t=new Date(m.createdAt).toLocaleString('he-IL',{day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'});
    return '<div class="msg '+(me?'me':'them')+'"><small>'+who+' · '+esc(t)+'</small>'+esc(m.body)+'</div>';}).join(''):'<div class="empty"><p>עוד אין הודעות.</p></div>')+'</div>';
  h+='<form class="sendrow" id="msgf" data-p="'+esc(pid)+'"><label class="sr" for="msgin">הודעה</label><input id="msgin" placeholder="כתוב הודעה…" autocomplete="off"><button class="btn btn-accent" type="submit" aria-label="שלח">'+ico('send',22)+'</button></form>';
  return h;
}

function projSupIds(pid){return S.project_suppliers.filter(function(x){return x.projectId===pid;}).map(function(x){return x.supplierId;});}
function projSuppliersHtml(p){
  var sid=UI.projSupFor===p.id?UI.projSup:'';
  var s=sid?byId('suppliers',sid):null;
  if(!s||projSupIds(p.id).indexOf(sid)<0){
    var ids=projSupIds(p.id),list=S.suppliers.filter(function(x){return ids.indexOf(x.id)>=0;}).sort(function(a,b){return String(a.name).localeCompare(String(b.name),'he');});
    var h='<div class="sec" style="margin-top:12px"><h2>ספקי הפרויקט</h2><button class="btn btn-accent" data-act="addpsup">'+ico('plus',20)+'הוסף ספק</button></div>';
    h+=list.length?'<div class="stack">'+list.map(function(x){
      var n=S.supplier_docs.filter(function(d){return d.projectId===p.id&&d.supplierId===x.id;}).length;
      return '<div class="item"><button class="main" data-act="opensup" data-id="'+esc(x.id)+'"><div class="t">'+esc(x.name)+'</div><div class="muted">'+esc(x.field||'')+(n?' · '+n+' תעודות/תיעוד':'')+'</div></button>'+(x.phone?callBtns(x.phone,x.name):'')+'</div>';}).join('')+'</div>':emptyBox('עוד לא שויכו ספקים לפרויקט. לחץ "הוסף ספק" ובחר מהרשימה שלך.');
    return h;
  }
  var docs=S.supplier_docs.filter(function(d){return d.projectId===p.id&&d.supplierId===s.id&&!d.orderId;}).sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''));});
  var ords=S.orders.filter(function(o){return o.projectId===p.id&&o.supplierId===s.id;});
  var exps=S.expenses.filter(function(x){return x.projectId===p.id&&x.vendor===s.name;});
  var h='<button class="backlink" style="margin-top:10px" data-act="supback">'+ico('back',20)+'כל הספקים בפרויקט</button>';
  h+='<div class="card" style="margin-top:8px"><div class="name">'+esc(s.name)+'</div><div class="muted">'+esc(s.field||'')+'</div>'+
    (s.phone?'<div style="display:flex;align-items:center;gap:10px;margin-top:8px"><span class="ltr">'+esc(s.phone)+'</span>'+callBtns(s.phone,s.name)+'</div>':'')+
    (s.contacts&&s.contacts.length?s.contacts.map(function(c){return '<div style="display:flex;align-items:center;gap:10px;margin-top:8px"><span>'+esc(c.name||'')+(c.role?' · '+esc(c.role):'')+'</span>'+(c.phone?'<span class="ltr muted">'+esc(c.phone)+'</span>'+callBtns(c.phone,c.name||s.name):'')+'</div>';}).join(''):'')+'</div>';
  if(docs.length)h+='<div class="sec"><h2>תעודות ותיעוד ישנים</h2></div><div class="docs">'+docs.map(function(d){
    return '<button class="doc" data-act="edit" data-e="supdoc" data-id="'+esc(d.id)+'"><div class="im">'+(d.photo?mediaTag(d.photo):ico('image',34))+'</div><div class="tx"><div class="t" style="font-weight:700">'+esc(d.title||d.kind||'')+'</div><div class="muted">'+esc(d.kind||'')+' · '+esc(fdate(d.date))+'</div></div></button>';}).join('')+'</div>';
  if(ords.length)h+='<div class="sec"><h2>הזמנות</h2></div><div class="stack">'+ords.map(function(o){return '<div class="item"><div class="main"><div class="t">'+esc(o.item)+'</div><div class="muted">'+esc(o.note||'')+'</div></div>'+chip(ORD_CHIP[o.status]||'neutral',o.status)+'</div>';}).join('')+'</div>';
  if(exps.length)h+='<div class="sec"><h2>הוצאות · '+money(sum(exps))+'</h2></div><div class="stack">'+sortExp(exps).map(expRow.bind(null,false)).join('')+'</div>';
  h+='<div style="text-align:center;margin:22px 0 4px"><button class="link" data-act="rmpsup" data-id="'+esc(s.id)+'">הסר ספק מהפרויקט</button></div>';
  return h;
}
var SCOL={'ירוק':'#3E8E6A','כתום':'#F7941D','כחול':'#3B73B9','אדום':'#C0392B','סגול':'#7A5C99','אפור':'#8C8C8C'};
function gColor(g){var pc=Number(g.pct)||0;if(SCOL[g.color])return SCOL[g.color];return pc>=100?SCOL['ירוק']:pc>0?SCOL['כתום']:SCOL['אפור'];}
function gsh(d){var p=String(d).split('-');return +p[2]+'/'+ +p[1];}
function gItems(p){return S.gantt_items.filter(function(g){return g.projectId===p.id&&g.start_date&&g.end_date;}).sort(function(a,b){return String(a.start_date).localeCompare(String(b.start_date))||String(a.end_date).localeCompare(String(b.end_date));});}
function schedTable(p,edit){
  var its=gItems(p);
  var rows=its.map(function(g,i){
    var pc=Math.max(0,Math.min(100,Number(g.pct)||0)),c=gColor(g);
    var late=g.end_date<todayStr()&&pc<100;
    return '<tr'+(edit?' class="sedit" data-act="edit" data-e="gantt" data-id="'+esc(g.id)+'" role="button" tabindex="0"':'')+'>'+
     '<td class="sn">'+(i+1)+'</td>'+
     '<td class="sd">'+esc(gsh(g.start_date))+' - '+esc(gsh(g.end_date))+(late?'<div class="slate">באיחור</div>':'')+'</td>'+
     '<td class="st2">'+esc(g.title||'')+'</td>'+
     '<td class="sp"><div class="sbar"><i style="width:'+pc+'%;background:'+c+'"></i><b>'+pc+'%</b></div></td>'+
     '<td class="sm'+(g.milestone?' on':'')+'">'+esc(g.milestone||'')+'</td>'+
     '<td class="sx">'+esc(g.notes||'')+'</td>'+
     '<td class="sc'+(g.client_task?' on':'')+'">'+esc(g.client_task||'')+'</td></tr>';
  }).join('');
  return '<div class="schwrap"><table class="sch"><thead><tr><th class="sn">שבוע מספר</th><th class="sd">תאריכים</th><th>התקדמות צפויה</th><th class="sp">הושלם</th><th>אבני דרך</th><th>הערות</th><th>משימות ללקוח / אדריכלית</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
}
function schedOverall(p){var its=gItems(p);if(!its.length)return 0;return Math.round(its.reduce(function(t,g){return t+(Math.max(0,Math.min(100,Number(g.pct)||0)));},0)/its.length);}
function ganttHtml(p){
  var its=gItems(p),ov=schedOverall(p);
  var h='<div class="sec" style="margin-top:12px"><h2>לוח זמנים</h2>'+addBtn('gantt','שבוע חדש',p.id)+'</div>';
  if(!its.length)return h+emptyBox('עוד אין לוח זמנים. לחץ "שבוע חדש" והגדר תקופה, מה מתוכנן ואחוז התקדמות.');
  h+='<div class="card" style="margin-bottom:10px"><div class="row1"><span class="muted">התקדמות כללית</span><b>'+ov+'%</b></div><div class="bar" role="img" aria-label="'+ov+' אחוז"><i style="width:'+ov+'%"></i></div></div>';
  h+=schedTable(p,true);
  h+='<button class="btn btn-navy" style="width:100%;margin-top:12px" data-act="schprint">'+ico('plan',20)+' הדפס / שמור כ-PDF</button>';
  return h;
}
function schedReport(p){
  if(!p)return '<div class="rnote">בחר פרויקט כדי להפיק לוח זמנים.</div>';
  var its=gItems(p);
  var h='<div class="rhead"><img class="rlogo" src="icons/logo.png" alt=""><div><div class="rbrand">פדר בניה · לבנות בראש שקט</div></div></div><!--INTRO-->';
  h+='<div class="sch-title">לוח זמנים פרויקט '+esc(p.name)+(p.address?' - '+esc(p.address):'')+'</div>';
  h+=its.length?schedTable(p,false):'<div class="rnote">עוד אין שבועות בלוח הזמנים של הפרויקט.</div>';
  if(its.length)h+='<div class="sch-foot">התקדמות כללית: <b>'+schedOverall(p)+'%</b> · עודכן: '+esc(new Date().toLocaleDateString('he-IL',{day:'numeric',month:'long',year:'numeric'}))+'</div>';
  return h;
}
function vProject(){
  var p=byId('projects',UI.projectId);
  if(!p){UI.view='projects';return vProjects();}
  var tasks=S.tasks.filter(function(t){return t.projectId===p.id;});
  var exps=S.expenses.filter(function(x){return x.projectId===p.id;});
  var ords=S.orders.filter(function(o){return o.projectId===p.id;});
  var docs=S.docs.filter(function(d){return d.projectId===p.id;});
  var msgs=S.messages.filter(function(m){return m.projectId===p.id;});
  var spent=sum(exps),bud=Number(p.budget)||0,pct=bud?Math.min(100,Math.round(spent/bud*100)):0;
  var h=bandHtml(p.name,null,{back:'כל הפרויקטים',sub2:p.address||'',right:'<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">'+chip(PROJ_CHIP[p.status]||'neutral',p.status||'')+'<div style="display:flex;gap:8px"><button class="btn btn-line" style="min-height:40px;font-size:15px;color:var(--on-navy);border-color:var(--navy-sub)" data-act="report">דוחות</button><button class="btn btn-line" style="min-height:40px;font-size:15px;color:var(--on-navy);border-color:var(--navy-sub)" data-act="edit" data-e="project" data-id="'+esc(p.id)+'">עריכה</button></div></div>'});
  h+='<main class="wrap" style="'+PULL+'">'+(p.clientName||p.clientPhone?'<div class="card" style="padding:10px 14px;margin-bottom:12px"><span class="muted">לקוח: '+esc(p.clientName||'')+(p.clientPhone?' · <span class="ltr">'+esc(p.clientPhone)+'</span>':'')+'</span></div>':'');
  var plans=S.plans.filter(function(x){return x.projectId===p.id;});
  var meets=allEvents().filter(function(e){return e.projectId===p.id;}).sort(function(a,b){return (String(a.date||'')+String(a.startTime||'')).localeCompare(String(b.date||'')+String(b.startTime||''));});
  var td0=todayStr(),upMeets=meets.filter(function(e){return String(e.date||'')>=td0;});
  var openTasks=tasks.filter(function(t){return t.status!=='הושלם';}).length;
  var tabs=[['tasks','משימות','tasks',openTasks],['meetings','פגישות','cal',upMeets.length],['expenses','קבלות','receipt',exps.length],['orders','הזמנות','box',ords.length],['docs','תיעוד','camera',docs.length],['gantt','גאנט','gantt',0],['plans','תוכניות ומסמכים','plan',plans.length],['suppliers','ספקים','truck',S.project_suppliers.filter(function(x){return x.projectId===p.id;}).length],['msgs','הודעות','chat',msgs.length],['client','אזור לקוח','people',S.change_requests.filter(function(c){return c.projectId===p.id&&c.status==='חדש';}).length]];
  h+='<div class="pgrid" role="group" aria-label="חלקי הפרויקט">'+tabs.map(function(t){return '<button class="pic" data-act="tab" data-t="'+t[0]+'" aria-pressed="'+(UI.tab===t[0])+'"><span class="pcirc">'+ico(t[2],28)+(t[3]?'<span class="pcnt">'+t[3]+'</span>':'')+'</span><span class="plab">'+t[1]+'</span></button>';}).join('')+'</div>';
  if(UI.tab==='tasks'){
    h+='<div class="sec" style="margin-top:12px"><h2>משימות</h2>'+addBtn('task','הוסף',p.id)+'</div>';
    var tOpen=tasks.filter(function(t){return t.status!=='הושלם'||t.id===UI.justDone;}),tDone=tasks.filter(function(t){return t.status==='הושלם'&&t.id!==UI.justDone;});
    h+=tOpen.length?'<div class="stack">'+sortTasks(tOpen).map(taskRow.bind(null,false,true)).join('')+'</div>':emptyBox(tasks.length?'כל המשימות בפרויקט הושלמו ✓':'עוד אין משימות בפרויקט הזה.');
    if(tDone.length){
      h+='<div style="text-align:center;margin:14px 0 8px"><button class="link" data-act="pdone" aria-expanded="'+(!!UI.projDone)+'">'+(UI.projDone?'הסתר משימות שהושלמו':'הצג משימות שהושלמו ('+tDone.length+')')+'</button></div>';
      if(UI.projDone)h+='<div class="stack" style="opacity:.75">'+tDone.slice().sort(function(a,b){return String(b.done_at||'').localeCompare(String(a.done_at||''));}).map(taskRow.bind(null,false,true)).join('')+'</div>';
    }
  }else if(UI.tab==='expenses'){
    h+='<div class="sec" style="margin-top:12px"><h2>קבלות</h2>'+addBtn('expense','קבלה',p.id)+'</div>';
    h+='<div class="card" style="margin-bottom:10px"><div class="row1"><span class="muted">סה״כ קבלות</span>'+(bud?'<span class="muted">תקציב '+money(bud)+'</span>':'')+'</div><div class="stat"><div class="v">'+money(spent)+'</div></div>'+(bud?'<div class="bar" role="img" aria-label="'+pct+' אחוז מהתקציב"><i style="width:'+pct+'%"></i></div>':'')+'</div>';
    h+=exps.length?'<div class="stack">'+sortExp(exps).map(expRow.bind(null,false)).join('')+'</div>':emptyBox('עוד אין קבלות בפרויקט הזה.');
  }else if(UI.tab==='meetings'){
    h+='<div class="sec" style="margin-top:12px"><h2>פגישות</h2>'+addBtn('event','פגישה חדשה',p.id)+'</div>';
    h+=meets.length?'<div class="stack">'+(upMeets.length?upMeets:[]).map(function(e){return '<div>'+'<div class="muted" style="margin:6px 4px">'+esc(fdate(e.date))+'</div>'+evRow(e)+'</div>';}).join('')+meets.filter(function(e){return String(e.date||'')<td0;}).reverse().map(function(e){return '<div style="opacity:.65"><div class="muted" style="margin:6px 4px">'+esc(fdate(e.date))+' · עברה</div>'+evRow(e)+'</div>';}).join('')+'</div>':emptyBox('עוד אין פגישות בפרויקט הזה. כתוב לבוט "פגישה מחר ב-10 בפרויקט..." או לחץ "פגישה חדשה".');
  }else if(UI.tab==='orders'){
    h+='<div class="sec" style="margin-top:12px"><h2>הזמנות</h2>'+addBtn('order','הוסף',p.id)+'</div>';
    h+=ords.length?'<div class="stack">'+ords.slice().sort(function(a,b){var k=['לא הוזמן','הוזמן','הגיע'];return k.indexOf(a.status)-k.indexOf(b.status);}).map(function(o){
      var s=byId('suppliers',o.supplierId);
      var od=S.supplier_docs.filter(function(d){return d.orderId===o.id;}).sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''));});
      return '<div class="card" style="padding:10px 12px"><div class="item" style="border:0;padding:0;box-shadow:none;background:none"><button class="main" data-act="edit" data-e="order" data-id="'+esc(o.id)+'"><div class="t">'+esc(o.item)+'</div><div class="muted">'+esc(s?s.name:'ספק לא נבחר')+(o.note?' · '+esc(o.note):'')+'</div></button>'+
       '<button class="chip c-'+(ORD_CHIP[o.status]||'neutral')+'" style="border:0;min-height:40px;font-size:14px" data-act="cycle" data-id="'+esc(o.id)+'" aria-label="שנה מצב הזמנה">'+esc(o.status)+'</button></div>'+
       ['תעודת משלוח','תיעוד'].map(function(kd){
         var ks=od.filter(function(d){return (d.kind||'תעודת משלוח')===kd;});
         return '<div style="margin-top:10px"><div style="font-weight:700;font-size:15px;margin-bottom:6px">'+(kd==='תיעוד'?'תיעוד':'תעודת משלוח')+(ks.length?' ('+ks.length+')':'')+'</div>'+
         (ks.length?'<div class="docs">'+ks.map(function(d){return '<div>'+'<button class="doc" style="width:100%" data-act="edit" data-e="supdoc" data-id="'+esc(d.id)+'"><div class="im">'+(d.photo?mediaTag(d.photo):d.link?ico('link',34):ico('image',34))+'</div><div class="tx"><div class="t" style="font-weight:700">'+esc(d.title||kd)+'</div><div class="muted">'+esc(fdate(d.date))+'</div></div></button>'+(d.link?'<a class="btn btn-line" style="margin-top:6px;min-height:38px;font-size:14px;width:100%" href="'+esc(d.link)+'" target="_blank" rel="noopener">'+ico('link',18)+' פתח קישור</a>':'')+'</div>';}).join('')+'</div>':'')+
         '<button class="btn btn-line" style="margin-top:6px;min-height:42px;font-size:15px;width:100%" data-act="add" data-e="supdoc" data-kind="'+kd+'" data-order="'+esc(o.id)+'" data-project="'+esc(p.id)+'"'+(o.supplierId?' data-supplier="'+esc(o.supplierId)+'"':'')+'>'+ico('camera',20)+' הוסף '+(kd==='תיעוד'?'תמונת תיעוד':'תמונת תעודת משלוח')+'</button></div>';}).join('')+'</div>';}).join('')+'</div>':emptyBox('עוד אין הזמנות בפרויקט הזה.');
  }else if(UI.tab==='gantt'){
    h+=schedTabHtml(p);
  }else if(UI.tab==='plans'){
    h+='<div class="sec" style="margin-top:12px"><h2>תוכניות ומסמכים</h2>'+addBtn('plan','הוסף',p.id)+'</div>';
    h+=plans.length?'<div class="stack">'+plans.slice().sort(function(a,b){return b.createdAt-a.createdAt;}).map(function(pl){
      var ty=String(pl.file_type||'').toUpperCase();
      return '<div class="item"><div class="ftype">'+esc(ty||'קובץ')+'</div><button class="main" data-act="edit" data-e="plan" data-id="'+esc(pl.id)+'"><div class="t">'+esc(pl.title)+'</div><div class="muted">'+esc(pl.kind||'תוכנית')+' · '+esc(fdate(String(pl.created_at||'').slice(0,10)))+(pl.client_visible?' · גלוי ללקוח':'')+'</div></button><button class="btn btn-navy" style="min-height:42px;font-size:15px" data-act="openplan" data-id="'+esc(pl.id)+'">פתח</button></div>';}).join('')+'</div>':emptyBox('עוד אין תוכניות ומסמכים. הוסף תוכנית, חוזה, היתר או הצעת מחיר.');
  }else if(UI.tab==='suppliers'){
    h+=projSuppliersHtml(p);
  }else if(UI.tab==='docs'){
    h+='<div class="sec" style="margin-top:12px"><h2>תיעוד</h2>'+addBtn('doc','הוסף',p.id)+'</div>';
    h+=docs.length?'<div class="docs">'+docs.slice().sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''));}).map(function(d){
      return '<div><button class="doc" style="width:100%" data-act="edit" data-e="doc" data-id="'+esc(d.id)+'"><div class="im">'+(d.photo?mediaTag(d.photo):d.link?ico('link',34):ico('image',34))+'</div><div class="tx"><div class="t" style="font-weight:700">'+esc(d.title||d.stage||'תיעוד')+'</div><div class="muted">'+(d.stage&&d.stage!==d.title?esc(d.stage)+' · ':'')+fdate(d.date)+'</div></div></button>'+(d.link?'<a class="btn btn-line" style="margin-top:6px;min-height:38px;font-size:14px;width:100%" href="'+esc(d.link)+'" target="_blank" rel="noopener">'+ico('link',18)+' פתח קישור</a>':'')+'</div>';}).join('')+'</div>':emptyBox('עוד אין תיעוד. צלם תמונה ראשונה.');
  }else if(UI.tab==='client'){
    h+=clientTabHtml(p);
  }else{
    h+='<div class="sec" style="margin-top:12px"><h2>הודעות עם הלקוח</h2></div>'+msgsHtml(p.id);
  }
  return h+'</main>';
}


/* reports */
function repHead(title,p){
  return '<div class="rhead"><img class="rlogo" src="icons/logo.png" alt=""><div><div class="rbrand">פדר בניה · לבנות בראש שקט</div><h1>'+esc(title)+'</h1></div></div>'+
   '<div class="rmeta"><b>'+esc(p?p.name:'כל הפרויקטים')+'</b>'+(p&&p.address?' · '+esc(p.address):'')+(p&&p.clientName?'<br>לקוח: '+esc(p.clientName):'')+'<br>תאריך הדוח: '+esc(new Date().toLocaleDateString('he-IL',{day:'numeric',month:'long',year:'numeric'}))+'</div><!--INTRO-->';
}
function daysBetween(a,b){return Math.round((pd(b)-pd(a))/86400000);}
function taskState(t){
  var td=todayStr();
  if(t.status==='הושלם'){
    if(t.due&&t.doneDate){return t.doneDate<=t.due?{txt:'עמד ביעד',cls:'okt'}:{txt:'לא עמד ביעד (איחור '+daysBetween(t.due,t.doneDate)+' ימים)',cls:'badt'};}
    return {txt:'בוצע',cls:'okt'};
  }
  if(t.due)return t.due<td?{txt:'לא עמד ביעד (באיחור '+daysBetween(t.due,td)+' ימים)',cls:'badt'}:{txt:'בתוך היעד',cls:''};
  return {txt:'ללא יעד',cls:''};
}
function areaSummary(tasks){
  var by={};tasks.forEach(function(t){var a=t.area||'כללי';(by[a]=by[a]||{n:0,d:0});by[a].n++;if(t.status==='הושלם')by[a].d++;});
  var ks=Object.keys(by).sort(function(a,b){return by[b].n-by[a].n;});
  if(!ks.length)return '';
  return '<h2>סיכום לפי תחום</h2><p class="rarea-sum">'+ks.map(function(k){return by[k].n+' משימות '+esc(k);}).join(' · ')+'</p><table class="rt"><thead><tr><th>תחום</th><th class="rd">משימות</th><th class="rd">הושלמו</th><th class="rd">פתוחות</th></tr></thead><tbody>'+ks.map(function(k){return '<tr><td>'+esc(k)+'</td><td class="rd">'+by[k].n+'</td><td class="rd">'+by[k].d+'</td><td class="rd">'+(by[k].n-by[k].d)+'</td></tr>';}).join('')+'</tbody></table>';
}
function repTasks(title,list,cls,kind){
  if(!list.length)return '';
  var isDone=kind==='done';
  return '<h2 class="'+cls+'">'+esc(title)+' ('+list.length+')</h2><table class="rt"><thead><tr><th>משימה</th><th class="rd">יעד</th>'+(isDone?'<th class="rd">בוצע ב</th>':'')+'<th class="rd">מצב</th></tr></thead><tbody>'+list.map(function(t){
    var st=taskState(t);
    return '<tr><td>'+esc(t.title)+(t.area&&t.area!=='כללי'?' <span class="rarea">'+esc(t.area)+'</span>':'')+(t.notes?'<div class="rn">'+esc(t.notes)+'</div>':'')+(t.photo&&!isVid(t.photo)&&UI.repPhotos!==false?'<img class="rtimg" src="'+purl(t.photo)+'" alt="">':'')+'</td><td class="rd">'+(t.due?esc(fdate(t.due)):'')+'</td>'+(isDone?'<td class="rd">'+(t.doneDate?esc(fdate(t.doneDate)):'')+'</td>':'')+'<td class="rd st '+st.cls+'">'+esc(st.txt)+'</td></tr>';}).join('')+'</tbody></table>';
}
function repPerson(p){
  var pid=UI.reportPerson||'',openOnly=UI.repOpen!==false;
  var tm=pid&&pid!=='none'?byId('team_members',pid):null;
  var h=repHead('דוח משימות'+(tm?' · '+tm.name:(pid==='none'?' · ללא אחראי':'')),p);
  var base=S.tasks.filter(function(t){
    if(p&&t.projectId!==p.id)return false;
    if(pid==='none'&&tAsg(t).length)return false;
    if(pid&&pid!=='none'&&!hasAsg(t,pid))return false;
    if(openOnly&&t.status==='הושלם')return false;
    return true;});
  var people=pid===''?S.team_members.concat([{id:'none',name:'ללא אחראי'}]):[tm||{id:'none',name:'ללא אחראי'}];
  var any=false;
  people.forEach(function(m){
    var list=sortTasks(base.filter(function(t){return m.id==='none'?!tAsg(t).length:hasAsg(t,m.id);}));
    if(!list.length)return;any=true;
    var open=list.filter(function(t){return t.status!=='הושלם';}).length;
    h+='<h2>'+esc(m.name)+' · '+open+' פתוחות'+(openOnly?'':' מתוך '+list.length)+'</h2><table class="rt"><thead><tr><th>משימה</th>'+(p?'':'<th>פרויקט</th>')+'<th class="rd">יעד</th><th class="rd">מצב</th></tr></thead><tbody>'+list.map(function(t){
      var st=taskState(t);
      return '<tr><td>'+(t.kind==='פגישה'?'(פגישה) ':'')+esc(t.title)+(t.area&&t.area!=='כללי'?' <span class="rarea">'+esc(t.area)+'</span>':'')+(t.notes?'<div class="rn">'+esc(t.notes)+'</div>':'')+(t.photo&&!isVid(t.photo)&&UI.repPhotos!==false?'<img class="rtimg" src="'+purl(t.photo)+'" alt="">':'')+'</td>'+(p?'':'<td>'+esc(pname(t.projectId))+'</td>')+'<td class="rd">'+(t.due?esc(fdate(t.due))+(t.due_time?' '+esc(t.due_time):''):'')+'</td><td class="rd st '+st.cls+'">'+esc(t.status==='ממתין להחלטה'?'ממתין להחלטה':st.txt)+'</td></tr>';}).join('')+'</tbody></table>';
  });
  if(!any)h+='<p>אין משימות להצגה.</p>';
  h+=areaSummary(base);
  return h;
}
function noteKey(part){return 'feder_rn_'+(UI.reportProject||'all')+'_'+(UI.reportType||'field')+'_'+part;}
function noteGet(part){return lsGet(noteKey(part))||'';}
function metLate(tasks){
  var met=0,late=0;
  tasks.forEach(function(t){if(!t.due)return;var st=taskState(t);if(st.cls==='badt')late++;else if(t.status==='הושלם')met++;});
  return {met:met,late:late};
}
function repField(p){
  var tasks=S.tasks.filter(function(t){return t.projectId===p.id;});
  var done=tasks.filter(function(t){return t.status==='הושלם';}),prog=tasks.filter(function(t){return t.status==='בתהליך';}),todo=tasks.filter(function(t){return t.status==='לביצוע';});
  var pct=tasks.length?Math.round(done.length/tasks.length*100):0;
  var h=repHead('דוח מצב עבודה באתר',p);
  var ml=metLate(tasks);
  h+='<div class="rsum"><div><b>'+pct+'%</b><span>הושלם</span></div><div><b>'+done.length+'</b><span>משימות שבוצעו</span></div><div><b>'+(prog.length+todo.length)+'</b><span>משימות שנותרו</span></div>'+((ml.met||ml.late)?'<div><b>'+ml.met+'</b><span>עמדו ביעד</span></div><div><b>'+ml.late+'</b><span>לא עמדו ביעד</span></div>':'')+'</div><div class="rbar"><i style="width:'+pct+'%"></i></div>';
  h+=repTasks('משימות שבוצעו',done,'ok','done')+repTasks('משימות בתהליך',prog,'warn','open')+repTasks('משימות שנותרו לביצוע',todo,'todo','open');
  if(!tasks.length)h+='<p>עדיין לא הוגדרו משימות בפרויקט.</p>';
  h+=areaSummary(tasks);
  if(UI.repPhotos!==false){
    var docs=S.docs.filter(function(d){return d.projectId===p.id&&d.photo&&!isVid(d.photo);}).sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));});
    if(docs.length)h+='<h2>תיעוד מהשטח</h2><div class="rphotos">'+docs.map(function(d){return '<figure><img src="'+purl(d.photo)+'" alt=""><figcaption><b>'+esc(d.title||'')+'</b><br>'+(d.stage?esc(d.stage)+' · ':'')+esc(fdate(d.date))+(d.note?'<br>'+esc(d.note):'')+'</figcaption></figure>';}).join('')+'</div>';
  }
  return h;
}
function repFin(p){
  var ex=S.expenses.filter(function(x){return x.projectId===p.id;}).sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''));});
  var tot=sum(ex),bud=Number(p.budget)||0,byV={};
  ex.forEach(function(x){byV[x.vendor||'אחר']=(byV[x.vendor||'אחר']||0)+(Number(x.amount)||0);});
  var h=repHead('דוח הוצאות',p);
  h+='<div class="rsum">'+(bud?'<div><b>'+money(bud)+'</b><span>תקציב</span></div>':'')+'<div><b>'+money(tot)+'</b><span>הוצאות עד כה</span></div>'+(bud?'<div><b>'+money(bud-tot)+'</b><span>יתרה</span></div>':'')+'<div><b>'+ex.length+'</b><span>תנועות</span></div></div>';
  h+='<h2>פירוט הוצאות</h2>'+(ex.length?'<table class="rt"><thead><tr><th>תאריך</th><th>ספק</th><th>פירוט</th><th>תשלום</th><th class="rd">סכום</th></tr></thead><tbody>'+ex.map(function(x){return '<tr><td>'+esc(fdate(x.date))+'</td><td>'+esc(x.vendor||'')+'</td><td>'+esc(x.note||'')+'</td><td>'+esc(x.pay||'')+'</td><td class="rd">'+money(x.amount)+'</td></tr>';}).join('')+'<tr class="rtot"><td colspan="4">סה״כ</td><td class="rd">'+money(tot)+'</td></tr></tbody></table>':'<p>אין הוצאות בפרויקט.</p>');
  var vs=Object.keys(byV).sort(function(a,b){return byV[b]-byV[a];});
  if(vs.length>1)h+='<h2>סיכום לפי ספק</h2><table class="rt"><tbody>'+vs.map(function(v){return '<tr><td>'+esc(v)+'</td><td class="rd">'+money(byV[v])+'</td></tr>';}).join('')+'</tbody></table>';
  return h;
}
function repAllField(){
  var ps=sortedProjects();
  var h=repHead('דוח מצב עבודה כללי',null);
  var T=S.tasks,done=T.filter(function(t){return t.status==='הושלם';}).length,pct=T.length?Math.round(done/T.length*100):0;
  h+='<div class="rsum"><div><b>'+ps.length+'</b><span>פרויקטים</span></div><div><b>'+pct+'%</b><span>הושלם</span></div><div><b>'+done+'</b><span>בוצע</span></div><div><b>'+(T.length-done)+'</b><span>נותר</span></div></div>';
  h+='<h2>סיכום לפי פרויקט</h2><table class="rt"><thead><tr><th>פרויקט</th><th>סטטוס</th><th class="rd">הושלם</th><th class="rd">בוצע / נותר</th></tr></thead><tbody>'+ps.map(function(p){
    var t=S.tasks.filter(function(x){return x.projectId===p.id;}),d=t.filter(function(x){return x.status==='הושלם';}).length;
    return '<tr><td>'+esc(p.name)+'</td><td>'+esc(p.status||'')+'</td><td class="rd">'+(t.length?Math.round(d/t.length*100):0)+'%</td><td class="rd">'+d+' / '+(t.length-d)+'</td></tr>';}).join('')+'</tbody></table>';
  ps.forEach(function(p){
    var open=S.tasks.filter(function(t){return t.projectId===p.id&&t.status!=='הושלם';});
    if(open.length)h+=repTasks(p.name+' · משימות שנותרו',sortTasks(open),'todo','open');
  });
  h+=areaSummary(S.tasks);
  return h;
}
function repAllFin(){
  var ps=sortedProjects(),tot=sum(S.expenses),mk=todayStr().slice(0,7),month=sum(S.expenses.filter(function(x){return String(x.date||'').slice(0,7)===mk;})),byV={};
  S.expenses.forEach(function(x){byV[x.vendor||'אחר']=(byV[x.vendor||'אחר']||0)+(Number(x.amount)||0);});
  var h=repHead('דוח הוצאות כללי',null);
  h+='<div class="rsum"><div><b>'+money(tot)+'</b><span>סה״כ הוצאות</span></div><div><b>'+money(month)+'</b><span>החודש</span></div><div><b>'+S.expenses.length+'</b><span>תנועות</span></div></div>';
  h+='<h2>לפי פרויקט</h2><table class="rt"><thead><tr><th>פרויקט</th><th class="rd">תקציב</th><th class="rd">הוצאות</th><th class="rd">יתרה</th></tr></thead><tbody>'+ps.map(function(p){
    var sp=sum(S.expenses.filter(function(x){return x.projectId===p.id;})),b=Number(p.budget)||0;
    return '<tr><td>'+esc(p.name)+'</td><td class="rd">'+(b?money(b):'-')+'</td><td class="rd">'+money(sp)+'</td><td class="rd">'+(b?money(b-sp):'-')+'</td></tr>';}).join('')+(function(){var g=sum(S.expenses.filter(function(x){return !x.projectId;}));return g?'<tr><td>הוצאות כלליות (בלי פרויקט)</td><td class="rd">-</td><td class="rd">'+money(g)+'</td><td class="rd">-</td></tr>':'';})()+'<tr class="rtot"><td>סה״כ</td><td class="rd"></td><td class="rd">'+money(tot)+'</td><td class="rd"></td></tr></tbody></table>';
  var vs=Object.keys(byV).sort(function(a,b){return byV[b]-byV[a];}).slice(0,15);
  if(vs.length)h+='<h2>ספקים מובילים</h2><table class="rt"><tbody>'+vs.map(function(v){return '<tr><td>'+esc(v)+'</td><td class="rd">'+money(byV[v])+'</td></tr>';}).join('')+'</tbody></table>';
  return h;
}
function noteWrap(body){
  var i=noteGet('intro'),o=noteGet('outro');
  var intro='<div class="rnote" data-rnshow="intro"'+(i?'':' style="display:none"')+'>'+esc(i)+'</div>';
  var outro='<h2 data-rnh="outro"'+(o?'':' style="display:none"')+'>סיכום והערות</h2><div class="rnote" data-rnshow="outro"'+(o?'':' style="display:none"')+'>'+esc(o)+'</div>';
  return body.replace('<!--INTRO-->',intro)+outro;
}
function vReport(){
  var p=UI.reportProject?byId('projects',UI.reportProject):null;
  var type=UI.reportType||'field';
  var h=bandHtml('דוחות',p?p.name:'כל הפרויקטים',{back:p?'חזרה לפרויקט':'חזרה'});
  h+='<main class="wrap" style="'+PULL+'"><div class="card noprint"><div class="fld"><label for="rproj" class="sr">פרויקט</label><select id="rproj" data-sel="reportProject"><option value="">כל הפרויקטים</option>'+sortedProjects().map(function(q){return '<option value="'+esc(q.id)+'"'+(UI.reportProject===q.id?' selected':'')+'>'+esc(q.name)+'</option>';}).join('')+'</select></div><div class="filters" style="padding-top:0">'+
    '<button class="fchip" data-act="rtype" data-v="field" aria-pressed="'+(type==='field')+'">מצב באתר</button><button class="fchip" data-act="rtype" data-v="tasks" aria-pressed="'+(type==='tasks')+'">משימות לפי אדם</button><button class="fchip" data-act="rtype" data-v="sched" aria-pressed="'+(type==='sched')+'">לוח זמנים</button><button class="fchip" data-act="rtype" data-v="fin" aria-pressed="'+(type==='fin')+'">דוח קבלות והוצאות</button></div>'+
    (type==='tasks'?'<div class="fld"><label for="rper">אדם</label><select id="rper" data-sel="reportPerson"><option value="">כולם</option>'+S.team_members.map(function(m){return '<option value="'+esc(m.id)+'"'+(UI.reportPerson===m.id?' selected':'')+'>'+esc(m.name)+'</option>';}).join('')+'<option value="none"'+(UI.reportPerson==='none'?' selected':'')+'>ללא אחראי</option></select></div><label class="chk"><input type="checkbox" data-ro="1"'+(UI.repOpen!==false?' checked':'')+'> רק משימות פתוחות</label>':'')+
    ((type==='field'&&p)||type==='tasks'?'<label class="chk"><input type="checkbox" data-rp="1"'+(UI.repPhotos!==false?' checked':'')+'> לכלול תמונות מהשטח</label>':'')+
    '<div class="fld" style="margin-top:6px"><label for="rn_intro">הערות כלליות (בראש הדוח)</label><textarea id="rn_intro" data-rn="intro" placeholder="למשל: סיכום תקופה, עדכון ללקוח...">'+esc(noteGet('intro'))+'</textarea></div>'+
    '<div class="fld"><label for="rn_outro">סיכום והמלצות (בסוף הדוח)</label><textarea id="rn_outro" data-rn="outro" placeholder="הצעדים הבאים, הערות...">'+esc(noteGet('outro'))+'</textarea></div>'+
    '<button class="btn btn-accent" style="width:100%;margin-top:6px" data-act="print">שמור כ-PDF / שתף</button>'+
    '<div class="muted" style="margin-top:8px">בחלון שייפתח בחר <b>שמירה כ-PDF</b> (Save as PDF) ואז שמור או שתף ללקוח.</div></div>'+
    '<div class="rep'+(type==='sched'?' sched':'')+'">'+noteWrap(type==='sched'?schedReport(p):type==='tasks'?repPerson(p):type==='fin'?(p?repFin(p):repAllFin()):(p?repField(p):repAllField()))+'</div></main>';
  return h;
}

/* calendar */
function evSort(a,b){return String(a.startTime||'').localeCompare(String(b.startTime||''));}
function evRow(e){
  var t=e.startTime?e.startTime+(e.endTime?'–'+e.endTime:''):'כל היום';
  return '<div class="item"><div class="evtime ltr">'+esc(t)+'</div><button class="main" data-act="edit" data-e="event" data-id="'+esc(e.id)+'"><div class="t">'+esc(e.title)+'</div><div class="muted">'+(e.projectId?esc(pname(e.projectId))+(e.location?' · ':''):'')+esc(e.location||'')+(e.google?' · יומן גוגל':'')+'</div></button></div>';
}
function vCalendar(){
  var now=new Date();
  var m=UI.calMonth||(UI.calMonth=new Date(now.getFullYear(),now.getMonth(),1));
  var sel=UI.calSel||(UI.calSel=todayStr());
  var title=m.toLocaleDateString('he-IL',{month:'long',year:'numeric'});
  var y=m.getFullYear(),mo=m.getMonth(),lead=m.getDay(),days=new Date(y,mo+1,0).getDate(),today=todayStr();
  var evBy={},tkBy={};
  allEvents().forEach(function(e){(evBy[e.date]=evBy[e.date]||[]).push(e);});
  S.tasks.forEach(function(t){if(t.due&&t.status!=='הושלם')(tkBy[t.due]=tkBy[t.due]||[]).push(t);});
  var h=bandHtml('יומן',null,{right:'<button class="btn btn-accent" data-act="add" data-e="event">'+ico('plus',20)+'אירוע</button>'});
  h+='<main class="wrap" style="'+PULL+'">';
  if(G.err)h+='<div class="demo" style="margin:0 0 10px;background:var(--warn-bg);color:var(--warn-ink)"><span>'+esc(G.err)+'</span></div>';
  if(!gReady())h+='<div class="card" style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px"><span>'+(gWasConnected()?'החיבור ליומן גוגל פג.':'רוצה לראות כאן גם את יומן גוגל?')+'</span><button class="btn btn-navy" style="min-height:42px;font-size:15px" data-act="gconnect">'+(gWasConnected()?'חבר מחדש':'חבר יומן גוגל')+'</button></div>';
  else h+='<div class="muted" style="margin-bottom:8px;display:flex;justify-content:space-between"><span>מחובר ליומן גוגל'+(G.loading?' · טוען…':'')+'</span><button class="link" data-act="gdisc">נתק</button></div>';
  h+='<div class="card">';
  h+='<div class="calhead"><button class="calnav" data-act="cmonth" data-v="-1" aria-label="חודש קודם">'+ico('back',22)+'</button><div class="caltitle">'+esc(title)+'</div><button class="calnav" data-act="cmonth" data-v="1" aria-label="חודש הבא" style="transform:scaleX(-1)">'+ico('back',22)+'</button></div>';
  h+='<div class="cal">'+['א','ב','ג','ד','ה','ו','ש'].map(function(d){return '<div class="cdn">'+d+'</div>';}).join('');
  for(var i=0;i<lead;i++)h+='<div></div>';
  for(var d=1;d<=days;d++){
    var ds=y+'-'+String(mo+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    var dots=(evBy[ds]?'<i class="d1"></i>':'')+(tkBy[ds]?'<i class="d2"></i>':'');
    h+='<button class="cd'+(ds===today?' today':'')+(ds===sel?' sel':'')+'" data-act="cday" data-v="'+ds+'" aria-label="'+d+'">'+d+'<span class="dots">'+dots+'</span></button>';
  }
  h+='</div><div class="muted" style="margin-top:8px;display:flex;gap:14px"><span><i class="d1 lg"></i> אירוע</span><span><i class="d2 lg"></i> משימה</span><button class="link" style="margin-inline-start:auto" data-act="ctoday">היום</button></div></div>';
  var evs=(evBy[sel]||[]).slice().sort(evSort),tks=tkBy[sel]||[];
  h+='<div class="sec"><h2>'+esc(fdate(sel))+'</h2>'+addBtn('event','אירוע')+'</div>';
  if(evs.length||tks.length){h+='<div class="stack">'+evs.map(evRow).join('')+tks.map(taskRow.bind(null,true,true)).join('')+'</div>';}
  else h+=emptyBox('אין אירועים או משימות ליום הזה.');
  return h+'</main>';
}

/* users (admin) */
var ROLES=[['pending','ממתין לאישור'],['admin','מנהל'],['team','צוות'],['architect','אדריכלית / מעצבת'],['ceo','מנכ״ל (דשבורד + הכול)'],['accountant','רואה חשבון'],['client','לקוח'],['worker','עובד שטח (ערבית, משימות בלבד)']];
function vUsers(){
  var h=bandHtml('משתמשים והרשאות',null,{back:'חזרה'});
  h+='<main class="wrap" style="'+PULL+'">';
  if(isAdmin()&&S.team_members.length){
    var staffU=S.profiles.filter(function(u){return u.role==='admin'||u.role==='team'||u.role==='ceo'||u.role==='worker';});
    h+='<div class="card" style="margin-bottom:12px"><b>צוות העבודה</b><div class="muted" style="margin:4px 0 8px">חבר כל אחד מהצוות למשתמש שלו כדי שיקבל התראות על משימות שמשויכות אליו.</div>'+
      S.team_members.map(function(m){return '<div class="fld" style="margin:8px 0 0"><label for="tm_'+esc(m.id)+'">'+esc(m.name)+(m.title?' · '+esc(m.title):'')+'</label><select id="tm_'+esc(m.id)+'" data-tm="'+esc(m.id)+'"><option value="">לא מחובר</option>'+staffU.map(function(u){return '<option value="'+esc(u.id)+'"'+(m.user_id===u.id?' selected':'')+'>'+esc(u.name||u.email||'')+'</option>';}).join('')+'</select><input class="ltr" type="tel" inputmode="tel" data-tmph="'+esc(m.id)+'" value="'+esc(m.phone||'')+'" placeholder="טלפון לבוט וואטסאפ (05...)" aria-label="טלפון של '+esc(m.name)+'" style="margin-top:6px"><input class="ltr" type="email" data-tmem="'+esc(m.id)+'" value="'+esc(m.email||'')+'" placeholder="ג׳ימייל (להזמנות ביומן גוגל)" aria-label="ג׳ימייל של '+esc(m.name)+'" style="margin-top:6px"></div>';}).join('')+'</div>';
  }
  if(isAdmin())h+='<div class="card" style="margin-bottom:12px"><b>תרגום לערבית</b><div class="muted" style="margin:4px 0 8px">פרויקטים ומשימות מתורגמים לערבית אוטומטית בכל שמירה. כפתור זה מתרגם את מה שכבר קיים.</div><button class="btn btn-accent" data-act="trall">תרגם הכול לערבית</button></div>';
  h+='<div class="card muted" style="margin-bottom:12px">מי שנרשם ממתין עד שתבחר לו תפקיד. צוות רואה ועורך הכול. רואה חשבון רואה הוצאות בלבד. לקוח רואה רק את האזור האישי של הפרויקטים ששייכת לו. אדריכלית רואה רק את התוכניות, המסמכים והמשימות שלה בפרויקטים ששייכת לה.</div><div class="stack">';
  S.profiles.slice().sort(function(a,b){return (a.role==='pending'?0:1)-(b.role==='pending'?0:1);}).forEach(function(u){
    var me=u.id===AUTH.uid;
    h+='<div class="card"><div class="name">'+esc(u.name||u.email||'')+(me?' (אני)':'')+'</div><div class="muted ltr">'+esc(u.email||'')+'</div>'+
     '<div class="fld" style="margin:10px 0 0"><label class="sr" for="r_'+esc(u.id)+'">תפקיד</label><select id="r_'+esc(u.id)+'" data-role="'+esc(u.id)+'"'+(me?' disabled':'')+'>'+ROLES.map(function(r){return '<option value="'+r[0]+'"'+(u.role===r[0]?' selected':'')+'>'+r[1]+'</option>';}).join('')+'</select></div>'+(me||!isAdmin()?'':'<div style="margin-top:10px"><button class="btn btn-danger" data-act="deluser" data-id="'+esc(u.id)+'">מחק משתמש</button></div>');
    if(u.role==='client'||u.role==='architect'){
      h+='<div style="margin-top:10px"><b style="font-size:15px">'+(u.role==='architect'?'פרויקטים של האדריכלית:':'פרויקטים של הלקוח:')+'</b>'+(S.projects.length?S.projects.map(function(p){
        var on=S.client_projects.some(function(c){return c.user_id===u.id&&c.projectId===p.id;});
        return '<label class="chk"><input type="checkbox" data-cp="'+esc(u.id)+'|'+esc(p.id)+'"'+(on?' checked':'')+'> '+esc(p.name)+'</label>';}).join(''):' אין פרויקטים')+'</div>';
    }
    if(u.role==='worker'&&isAdmin()){
      h+='<div style="margin-top:10px"><b style="font-size:15px">פרויקטים שעובד השטח רואה:</b><div class="muted" style="margin:2px 0 4px">הוא רואה רק משימות שמשויכות אליו, בפרויקטים שסימנת כאן.</div>'+(S.projects.length?S.projects.map(function(p){
        var on=S.worker_access.some(function(c){return c.user_id===u.id&&c.projectId===p.id;});
        return '<label class="chk"><input type="checkbox" data-wa="'+esc(u.id)+'|'+esc(p.id)+'"'+(on?' checked':'')+'> '+esc(p.name)+'</label>';}).join(''):' אין פרויקטים')+'</div>';
    }
    h+='</div>';
  });
  return h+'</div></main>';
}

/* accountant (expenses only) */
function expRowRO(x){
  return '<div class="item">'+(x.photo?'<button class="thumb" data-act="photo" data-id="'+esc(x.photo)+'" aria-label="הצג קבלה">'+(isPdf(x.photo)?'<span class="pdft">PDF</span>':'<img loading="lazy" decoding="async" class="thumb" src="'+purl(x.photo)+'" alt="">')+'</button>':'')+
   '<div class="main"><div class="t">'+esc(x.vendor)+'</div><div class="muted">'+esc(pname(x.projectId))+' · '+fdate(x.date)+(x.pay?' · '+esc(x.pay):'')+(x.note?' · '+esc(x.note):'')+'</div></div><div class="amt">'+money(x.amount)+'</div></div>';
}
var WK={tasks:[],projects:[],ok:false,showDone:false,mine:false,proj:''};
async function loadWorker(){
  var r=await sb.rpc('worker_tasks'),r2=await sb.rpc('worker_projects');
  if(!r.error&&!r2.error){WK.tasks=r.data||[];WK.projects=r2.data||[];WK.ok=true;WK.err=false;}else{WK.err=true;}
  render();
  try{
    var need=[];WK.tasks.forEach(function(t){if(t.photo&&!PHOTO[t.photo]&&need.indexOf(t.photo)<0)need.push(t.photo);});
    if(need.length){var sr=await sb.storage.from('photos').createSignedUrls(need,21600);if(sr.data){sr.data.forEach(function(d){if(d.signedUrl&&d.path)PHOTO[d.path]=d.signedUrl;});render();}}
  }catch(e){}
}
function vWorker(){
  var h='<header class="band"><div class="wrap"><div class="top"><div style="min-width:0"><div class="sub">فيدر للبناء</div><h1>أهلاً'+(AUTH.name?' '+esc(AUTH.name):'')+'</h1></div><img class="logo" src="'+LOGO+'" alt=""></div></div></header><main class="wrap" dir="rtl" lang="ar">';
  if(!WK.ok){return h+'<div class="pull">'+emptyBox(WK.err?'تعذّر التحميل، حاول مرة أخرى.':'جارٍ التحميل…')+'</div></main>';}
  var all=WK.tasks.filter(function(t){return (!WK.mine||t.mine)&&(!WK.proj||t.project_id===WK.proj);});
  var open=all.filter(function(t){return t.status!=='הושלם';}),done=all.filter(function(t){return t.status==='הושלם';});
  var today=todayStr();
  function fd(d){return d.split('-').reverse().join('/');}
  function row(t){
    var d=t.status==='הושלם';
    var tm=t.due_time?' · '+esc(t.due_time):'';
    var due=t.due?(!d&&t.due<today?chip('warn','متأخرة · '+fd(t.due)+tm):'<span class="muted">'+fd(t.due)+tm+'</span>'):'';
    var th=t.photo&&PHOTO[t.photo]?'<a class="tthumb" style="float:none;margin:0" href="'+esc(PHOTO[t.photo])+'" target="_blank" rel="noopener">'+mediaTag(t.photo)+'</a>':'';
    return '<div class="item"><button class="tick '+(d?'d':'')+'" data-act="wtoggle" data-id="'+esc(t.id)+'" aria-label="'+(d?'إرجاع':'تم الإنجاز')+'">'+(d?ico('check',20):'')+'</button><div class="main"><div class="t"'+(d?' style="text-decoration:line-through;opacity:.7"':'')+'>'+(t.kind==='פגישה'?ico('cal',16)+' اجتماع: ':'')+esc(t.title_ar||t.title)+'</div>'+(t.title_ar&&t.title_ar!==t.title?'<div class="he" dir="rtl" lang="he">'+esc(t.title)+'</div>':'')+((t.notes_ar||t.notes)?'<div class="muted">'+esc(t.notes_ar||t.notes)+'</div>':'')+(t.notes_ar&&t.notes&&t.notes_ar!==t.notes?'<div class="he" dir="rtl" lang="he" style="font-weight:400">'+esc(t.notes)+'</div>':'')+(due?'<div>'+due+'</div>':'')+'</div>'+th+(t.assignee_name?chip('info',t.assignee_name):'')+'</div>';
  }
  h+='<div class="card pull stat"><div class="k">مهام مفتوحة</div><div class="v">'+open.length+'</div></div>';
  if(!pushOn()&&pushSupported())h+='<div class="card" style="margin-top:12px"><b>الإشعارات</b><div class="muted" style="margin:4px 0 8px">فعّل الإشعارات لتصلك المهام الجديدة.</div><button class="btn btn-accent" data-act="pushon">تفعيل الإشعارات</button><div class="muted" id="pushst" style="margin-top:6px"></div></div>';
  h+=''
  h+='<div class="filters" style="margin-top:8px"><button class="fchip" data-act="wproj" data-id="" aria-pressed="'+(!WK.proj)+'">كل المشاريع</button>'+WK.projects.map(function(p){return '<button class="fchip" data-act="wproj" data-id="'+esc(p.id)+'" aria-pressed="'+(WK.proj===p.id)+'">'+esc(p.name_ar||p.name)+(p.name_ar&&p.name&&p.name_ar!==p.name?' · '+esc(p.name):'')+'</button>';}).join('')+'</div>';
  var list=WK.projects.filter(function(p){return !WK.proj||p.id===WK.proj;}),any=false;
  list.forEach(function(p){
    var ts=open.filter(function(t){return t.project_id===p.id;}).sort(function(a,b){return String(a.due||'9999').localeCompare(String(b.due||'9999'));});
    if(!ts.length)return;any=true;
    h+='<div class="sec"><h2>'+esc(p.name_ar||p.name)+(p.name_ar&&p.name&&p.name_ar!==p.name?' <span class="he" dir="rtl" lang="he" style="font-size:15px">· '+esc(p.name)+'</span>':'')+'</h2></div>'+(p.address?'<div class="muted" style="margin:-6px 0 8px">'+esc(p.address_ar||p.address)+(p.address_ar&&p.address&&p.address_ar!==p.address?' · <span class="he" dir="rtl" lang="he">'+esc(p.address)+'</span>':'')+'</div>':'')+'<div class="stack">'+ts.map(row).join('')+'</div>';
  });
  if(!any)h+=emptyBox('لا توجد مهام مفتوحة 👍');
  if(done.length){
    h+='<div style="text-align:center;margin:18px 0 6px"><button class="link" data-act="wshowdone">'+(WK.showDone?'إخفاء المنجزة':'عرض المهام المنجزة ('+done.length+')')+'</button></div>';
    if(WK.showDone)h+='<div class="stack">'+done.map(row).join('')+'</div>';
  }
  return h+'<div style="text-align:center;margin:26px 0 8px"><button class="link" data-act="logout">تسجيل الخروج</button></div><div class="muted" style="text-align:center;font-size:12px">v52</div></main>';
}

/* client (restricted) view */

function vLogin(){
  return '<div class="login"><img class="logo" src="'+LOGO+'" alt="פדר"><h1>פדר בניה</h1><p class="muted" style="margin:0 0 20px">לבנות בראש שקט</p>'+
   (AUTH.ok?'<div class="okmsg">'+esc(AUTH.ok)+'</div>':'')+
   '<form id="lf"><div class="fld"><label for="l_name">שם (להרשמה בלבד)</label><input id="l_name" autocomplete="name"></div>'+
   '<div class="fld"><label for="l_mail">אימייל</label><input id="l_mail" type="email" autocomplete="email" inputmode="email" class="ltr"></div>'+
   '<div class="fld"><label for="l_pass">סיסמה</label><input id="l_pass" type="password" autocomplete="current-password" class="ltr"></div>'+
   '<p class="ferr" role="alert">'+esc(AUTH.msg)+'</p>'+
   '<button class="btn btn-accent" type="submit" data-act="login">כניסה</button>'+
   '<button class="btn btn-line" type="button" data-act="signup">פתיחת משתמש חדש</button></form></div>';
}
function vPending(){
  return '<div class="login"><img class="logo" src="'+LOGO+'" alt="פדר"><h1>כמעט שם</h1><p style="font-size:17px">המשתמש שלך נפתח וממתין לאישור של פדר בניה. אחרי האישור, רענן את הדף.</p>'+
   '<button class="btn btn-accent" data-act="reload">רענן</button><button class="btn btn-line" data-act="logout">התנתקות</button></div>';
}

function navHtml(){
  var cur=(UI.view==='project'||UI.view==='report')?'projects':UI.view;
  var items=[['home','בית','home'],['calendar','יומן','cal'],['projects','פרויקטים','folder'],['tasks','משימות','check'],['suppliers','ספקים','people'],['expenses','הוצאות','receipt']];
  return '<nav class="nav" aria-label="ניווט ראשי"><div class="wrap">'+items.map(function(i){return '<button data-act="nav" data-v="'+i[0]+'"'+(cur===i[0]?' aria-current="page"':'')+'>'+ico(i[2],24)+i[1]+'</button>';}).join('')+'</div></nav>';
}

var pending=false;
function render(){
  if(pending)return;pending=true;
  requestAnimationFrame(function(){pending=false;draw();});
}
function draw(){
  var app=$('#app');
  if(AUTH.state==='loading'){app.innerHTML='<div class="loading">טוען…</div>';return;}
  if(AUTH.state==='login'){
    // keep typed values while re-rendering
    var keep={n:($('#l_name')||{}).value,m:($('#l_mail')||{}).value};
    app.innerHTML=vLogin();
    if(keep.n)$('#l_name').value=keep.n;if(keep.m)$('#l_mail').value=keep.m;return;
  }
  if(AUTH.state==='pending'){app.innerHTML=vPending();return;}
  if(AUTH.role==='worker'){app.innerHTML=vWorker();return;}
  var ready=TABLES.every(function(c){return loaded[c];});
  if(!ready){app.innerHTML='<div class="loading">טוען…</div>';return;}
  var y=window.scrollY,typed=($('#msgin')||{}).value,ae=document.activeElement,aid=ae&&ae.id&&$('#app').contains(ae)?ae.id:'',sqv=($('#sq')||{}).value;
  if(AUTH.role==='client'){app.innerHTML=vClient();}
  else if(AUTH.role==='accountant'){app.innerHTML=vAccountant();}
  else if(AUTH.role==='architect'){app.innerHTML=vArchitect();}
  else{
    var v=UI.view,h;
    if(v==='ceo'){app.innerHTML=vCeo();h=null;}
    else if(v==='sched'){app.innerHTML=vSched();h=null;}
    else if(v==='projects')h=vProjects();else if(v==='project')h=vProject();else if(v==='tasks')h=vTasks();
    else if(v==='suppliers')h=vSuppliers();else if(v==='expenses')h=vExpenses();else if(v==='calendar')h=vCalendar();else if(v==='report')h=vReport();else if(v==='users')h=vUsers();else h=vHome();
    if(h!==null)app.innerHTML=h+navHtml();
  }
  if(isStaff()){gEnsure();gSyncBot();}
  navSync();
  var at=$('.tabs .tab[aria-pressed="true"]');if(at&&at.scrollIntoView){try{at.scrollIntoView({block:'nearest',inline:'center'});}catch(e){}}
  if(typed&&$('#msgin'))$('#msgin').value=typed;
  window.scrollTo(0,y);
  if((aid==='msgin'||aid==='sq')&&$('#'+aid)){var n=$('#'+aid);n.focus({preventScroll:true});}
}

function openAddPsup(){
  var pid=UI.projectId,have=projSupIds(pid);
  var list=S.suppliers.filter(function(x){return have.indexOf(x.id)<0;}).sort(function(a,b){return String(a.name).localeCompare(String(b.name),'he');});
  var html='<div class="scrim" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><h2>הוסף ספקים לפרויקט</h2>'+
   (list.length?'<div class="fld" style="margin:0 0 10px"><label for="psq" class="sr">חיפוש ספק</label><input id="psq" type="search" placeholder="חיפוש ספק (שם, תחום, טלפון)" autocomplete="off"></div><div class="stack" style="margin-bottom:12px" id="psl">'+list.map(function(x){var hay=((x.name||'')+' '+(x.field||'')+' '+(x.phone||'')+' '+(x.contacts||[]).map(function(c){return (c.name||'')+' '+(c.phone||'');}).join(' ')).toLowerCase();return '<label class="chk item" data-hay="'+esc(hay)+'" style="padding:8px 12px"><input type="checkbox" data-psup="'+esc(x.id)+'"><span style="min-width:0"><b>'+esc(x.name)+'</b>'+(x.field?'<br><span class="muted">'+esc(x.field)+'</span>':'')+'</span></label>';}).join('')+'</div><p class="muted" id="psnone" style="display:none;margin-bottom:12px">לא נמצא ספק.</p>':'<p class="muted" style="margin-bottom:12px">כל הספקים כבר משויכים, או שעוד לא הוספת ספקים בלשונית ספקים.</p>')+
   '<p class="ferr" id="ferr" role="alert"></p><div class="fbtns">'+(list.length?'<button class="btn btn-accent" type="button" data-act="savepsup">הוסף לפרויקט</button>':'')+'<button class="btn btn-line" type="button" data-act="closeSheet">סגור</button></div></div>';
  $('#layer').innerHTML=html;pushOverlay('sheet');
}
async function savePsup(){
  var ids=[].slice.call(document.querySelectorAll('[data-psup]')).filter(function(c){return c.checked;}).map(function(c){return {project_id:UI.projectId,supplier_id:c.getAttribute('data-psup')};});
  if(!ids.length){ferr('סמן לפחות ספק אחד.');return;}
  var r=await sb.from('project_suppliers').upsert(ids,{onConflict:'project_id,supplier_id'});
  if(r.error){ferr('לא הצלחתי לשמור. נסה שוב.');return;}
  await loadTable('project_suppliers');closeSheet();
}

/* ---------- forms ---------- */
function projOptions(sel,emp){
  return '<option value="">'+esc(emp||'בחר פרויקט')+'</option>'+sortedProjects().map(function(p){return '<option value="'+esc(p.id)+'"'+(sel===p.id?' selected':'')+'>'+esc(p.name)+'</option>';}).join('');
}
function supOptions(sel){
  return '<option value="">ללא</option>'+S.suppliers.slice().sort(function(a,b){return String(a.name).localeCompare(String(b.name),'he');}).map(function(p){return '<option value="'+esc(p.id)+'"'+(sel===p.id?' selected':'')+'>'+esc(p.name)+(p.field?' · '+esc(p.field):'')+'</option>';}).join('');
}
function crowHtml(c){
  c=c||{};
  return '<div class="crow"><input class="c_n" placeholder="שם איש קשר" value="'+esc(c.name)+'" aria-label="שם איש קשר"><input class="c_p ltr" type="tel" inputmode="tel" placeholder="טלפון" value="'+esc(c.phone)+'" aria-label="טלפון איש קשר"><input class="c_r" placeholder="תפקיד (לא חובה)" value="'+esc(c.role)+'" aria-label="תפקיד"><button type="button" class="link" data-act="rmcontact">הסר</button></div>';
}
function fieldHtml(f,val){
  var id='f_'+f.k,inp='';
  if(f.t==='textarea')inp='<textarea id="'+id+'">'+esc(val)+'</textarea>';
  else if(f.t==='project')inp='<select id="'+id+'">'+projOptions(val,f.empty)+'</select>';
  else if(f.t==='assignee')inp='<select id="'+id+'">'+assigneeOptions(val)+'</select>';
  else if(f.t==='assignees'){var av=Array.isArray(val)?val:(val?[val]:[]);if(!av.length&&form&&form.id){var tt=byId('tasks',form.id);if(tt)av=tAsg(tt);}
    inp='<div class="asgs" id="'+id+'" role="group">'+(S.team_members.length?S.team_members.map(function(m){return '<label class="asg"><input type="checkbox" value="'+esc(m.id)+'"'+(av.indexOf(m.id)>=0?' checked':'')+'><span>'+esc(m.name)+'</span></label>';}).join(''):'<span class="muted">אין עדיין אנשי צוות. מוסיפים במסך משתמשים.</span>')+'</div>';}
  else if(f.t==='bool')inp='<label class="chk" style="margin:0"><input type="checkbox" id="'+id+'"'+(val===true||val==='true'?' checked':'')+'> '+esc(f.cl||'כן')+'</label>';
  else if(f.t==='supplier')inp='<select id="'+id+'">'+supOptions(val)+'</select>';
  else if(f.t==='select'&&Array.isArray((typeof f.o==='function'?f.o():f.o)[0])){inp='<select id="'+id+'">'+(typeof f.o==='function'?f.o():f.o).map(function(o){return '<option value="'+esc(o[0])+'"'+(String(val)===o[0]?' selected':'')+'>'+esc(o[1])+'</option>';}).join('')+'</select>';}
  else if(f.t==='select'){var fo=typeof f.o==='function'?f.o():f.o;inp='<select id="'+id+'">'+(val&&fo.indexOf(val)<0?[val].concat(fo):fo).map(function(o){return '<option'+(val===o?' selected':'')+'>'+esc(o)+'</option>';}).join('')+(f.add?'<option value="__new__">➕ תחום חדש…</option>':'')+'</select>';}
  else if(f.t==='file'){
    var cur=form&&form.id?byId('plans',form.id):null;
    inp='<div class="ph"><span class="btn btn-navy filebtn">'+ico('plus',22)+'בחר קובץ<input type="file" class="filein" accept=".pdf,.dwg,.dxf,.doc,.docx,.xls,.xlsx,image/*" aria-label="בחר קובץ"></span><div class="muted" id="filename">'+(cur?'קובץ נוכחי: '+esc(cur.file_name||''):'לא נבחר קובץ')+'</div></div>';
  }
  else if(f.t==='contacts'){
    var arr=Array.isArray(val)?val:[];
    inp='<div id="contacts">'+arr.map(crowHtml).join('')+'</div><button type="button" class="btn btn-line" data-act="addcontact">'+ico('plus',20)+'הוסף איש קשר</button>';
  }
  else if(f.t==='photo'){
    var vd=!!f.vid;
    inp='<div class="ph"><div class="phprev" id="phprev">'+(val?mediaTag(val,true):ico('camera',40))+'</div>'+
      '<div class="grid2"><span class="btn btn-navy filebtn">'+ico('camera',22)+'צלם תמונה<input type="file" accept="image/*" capture="environment" class="photoin" aria-label="צלם במצלמה"></span>'+
      '<span class="btn btn-line filebtn">'+ico('image',22)+(f.pdf?'מהגלריה או קובץ PDF':vd?'תמונה/וידאו מהגלריה':'מהגלריה')+'<input type="file" accept="'+(f.pdf?'image/*,application/pdf':vd?'image/*,video/*':'image/*')+'" class="photoin" aria-label="בחר מהגלריה"></span></div>'+
      (vd?'<div class="grid2" style="margin-top:8px"><span class="btn btn-navy filebtn" style="grid-column:1/-1">'+ico('play',22)+'צלם וידאו (עד 50MB)<input type="file" accept="video/*" capture="environment" class="photoin" aria-label="צלם וידאו"></span></div>':'')+
      (val?'<button type="button" class="btn btn-line" data-act="rmphoto">הסר</button>':'')+'</div>';
  }
  else inp='<input id="'+id+'" type="'+(f.t==='number'?'text':f.t)+'"'+(f.t==='number'?' inputmode="decimal"':'')+(f.list?' list="dl_'+f.list+'"':'')+' value="'+esc(val)+'" autocomplete="off">';
  var lab=(f.t==='photo'||f.t==='contacts'||f.t==='file'||f.t==='assignees'||f.t==='bool')?'<span style="font-size:15px;font-weight:700">'+esc(f.l)+'</span>':'<label for="'+id+'">'+esc(f.l)+(f.req?' *':'')+'</label>';
  return '<div class="fld">'+lab+inp+'</div>';
}
function openForm(e,id,defs){
  var cfg=F[e],doc=id?byId(cfg.col,id):null;defs=defs||{};
  form={e:e,id:id||null,file:null,file2:null,removed:false,busy:false,confirmDel:false,photo:doc&&doc.photo||'',orderId:doc?doc.orderId:(defs.orderId||null)};
  var html='<div class="scrim" data-act="closeSheet"></div><form class="sheet" id="frm" role="dialog" aria-modal="true" aria-labelledby="sh_t" novalidate><h2 id="sh_t" tabindex="-1">'+(doc?'עריכת ':'חדש: ')+esc(cfg.title)+'</h2>';
  cfg.fields.forEach(function(f){
    var v=doc?doc[f.k]:(defs[f.k]!=null?defs[f.k]:(f.d==='today'?todayStr():(f.d||'')));
    if(!doc&&f.t==='project'&&f.req&&!v&&S.projects.length===1)v=S.projects[0].id;
    if(v==null)v='';
    if(f.k==='pct')v=String(v);
    html+=fieldHtml(f,v);
  });
  html+='<datalist id="dl_suppliers">'+S.suppliers.map(function(s){return '<option value="'+esc(s.name)+'">';}).join('')+'</datalist>';
  html+='<datalist id="dl_fields">'+supplierFields().map(function(s){return '<option value="'+esc(s)+'">';}).join('')+'</datalist>';
  html+='<datalist id="dl_stages">'+STAGES.map(function(s){return '<option value="'+esc(s)+'">';}).join('')+'</datalist>';
  html+='<p class="ferr" id="ferr" role="alert"></p><div class="fbtns"><button class="btn btn-accent" type="submit" id="fsave">שמור</button><button class="btn btn-line" type="button" data-act="closeSheet">ביטול</button></div>';
  if(doc)html+='<div class="fbtns" style="margin-top:12px"><button class="btn btn-danger" type="button" id="fdel" data-act="delete">מחק</button></div>';
  html+='</form>';
  $('#layer').innerHTML=html;pushOverlay('sheet');
  var h=$('#sh_t');if(h)h.focus();
}
function closeSheet(fromPop){form=null;$('#layer').innerHTML='';if(fromPop!==true&&history.state&&history.state.sheet)history.back();}
function navSnap(){return {view:UI.view,projectId:UI.projectId,tab:UI.view==='project'?UI.tab:'',sup:(UI.view==='project'&&UI.tab==='suppliers'&&UI.projSupFor===UI.projectId)?(UI.projSup||''):''};}
var navKey=null;
function navSync(){
  if(AUTH.state!=='app')return;
  var st=navSnap(),k=JSON.stringify(st);
  if(navKey===null){history.replaceState(st,'');navKey=k;return;}
  if(k!==navKey){navKey=k;history.pushState(st,'');}
}
function pushOverlay(kind){if(AUTH.state!=='app')return;var st=navSnap();st[kind]=1;history.pushState(st,'');}
window.addEventListener('popstate',function(e){
  var st=e.state,lb=$('.lightbox');if(lb)lb.remove();
  if(!st||AUTH.state!=='app')return;
  if(!st.sheet&&($('#layer .sheet')||form))closeSheet(true);
  if(st.view){UI.view=st.view;UI.projectId=st.projectId;if(st.tab)UI.tab=st.tab;UI.projSup=st.sup||'';UI.projSupFor=st.projectId;navKey=JSON.stringify(navSnap());render();}
});
function ferr(m){var el=$('#ferr');if(el)el.textContent=m||'';}

function shrink(file){
  return new Promise(function(res){
    if(!/^image\//.test(file.type)||/svg/.test(file.type)){res(file);return;}
    function fromImg(img,w,h){
      var m=1600,r=Math.min(1,m/Math.max(w,h)),cw=Math.round(w*r),ch=Math.round(h*r);
      var c=document.createElement('canvas');c.width=cw;c.height=ch;c.getContext('2d').drawImage(img,0,0,cw,ch);
      c.toBlob(function(b){res(b||file);},'image/jpeg',0.82);
    }
    if(window.createImageBitmap){
      createImageBitmap(file,{imageOrientation:'from-image'}).then(function(b){fromImg(b,b.width,b.height);},function(){res(file);});
    }else{
      var u=URL.createObjectURL(file),im=new Image();
      im.onload=function(){fromImg(im,im.naturalWidth,im.naturalHeight);URL.revokeObjectURL(u);};
      im.onerror=function(){res(file);};im.src=u;
    }
  });
}

/* save tolerant to columns that don't exist yet (SQL not run) */
async function saveRow(col,row,id){
  for(var i=0;i<6;i++){
    var r=id?await sb.from(col).update(row).eq('id',id):await sb.from(col).insert(row);
    var m=r.error&&String(r.error.message||'').match(/Could not find the '([^']+)' column/);
    if(!m)return r;delete row[m[1]];
  }
  return r;
}
async function submitForm(ev){
  ev.preventDefault();
  if(!form||form.busy)return;
  var cfg=F[form.e],data={};
  for(var i=0;i<cfg.fields.length;i++){
    var f=cfg.fields[i];if(f.t==='photo'||f.t==='file')continue;
    if(f.t==='contacts'){
      var arr=[].slice.call(document.querySelectorAll('#contacts .crow')).map(function(row){return {name:row.querySelector('.c_n').value.trim(),phone:row.querySelector('.c_p').value.trim(),role:row.querySelector('.c_r').value.trim()};}).filter(function(c){return c.name||c.phone;});
      var ex=form.id?byId(cfg.col,form.id):null;
      if(arr.length||(ex&&ex.contacts&&ex.contacts.length))data.contacts=arr;
      continue;
    }
    if(f.t==='assignees'){var ids=[].slice.call(document.querySelectorAll('#f_'+f.k+' input:checked')).map(function(x){return x.value;});data[f.k]=ids;data.assigneeId=ids[0]||null;continue;}
    if(f.t==='bool'){var cb=$('#f_'+f.k);data[f.k]=!!(cb&&cb.checked);continue;}
    var el=$('#f_'+f.k);var v=el?el.value.trim():'';
    if(f.req&&!v){ferr('חסר: '+f.l);if(el)el.focus();return;}
    if(f.t==='number'){
      if(v===''){v=null;}else{var n=parseFloat(v.replace(/,/g,'.').replace(/[₪\s]/g,''));if(isNaN(n)){ferr('הסכום צריך להיות מספר.');if(el)el.focus();return;}v=n;}
    }
    if(f.t==='url'){v=v?(/^https?:\/\//i.test(v)?v:'https://'+v):null;}
    data[f.k]=v;
  }
  if(form.e==='expense'&&data.pay==='לא צוין')data.pay=null;
  if(form.e==='gantt'){if(data.end_date<data.start_date){ferr('תאריך הסיום לפני ההתחלה.');return;}data.pct=parseInt(data.pct,10)||0;if(data.color&&data.color.indexOf('אוטומטי')===0)data.color=null;}
  var taskRemind=null,taskId=null,evId=null,trId=null,trTable=null;
  if(form.e==='task'){
    taskRemind=data.remind;delete data.remind;
    var taskId=form.id||(window.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now()));if(!form.id)data.id=taskId;
    var exT=form.id?byId('tasks',form.id):null;
    if(data.kind==='פגישה'&&(!data.due||!data.due_time)){ferr('פגישה צריכה תאריך ושעה.');return;}
    var arManual=data.title_ar&&(!exT||data.title_ar!==(exT.title_ar||''));
    if(!arManual&&(!exT||exT.title!==data.title||(exT.notes||'')!==(data.notes||'')||!exT.title_ar)){trId=taskId;trTable='tasks';}
    if(data.status==='הושלם'){if(!(exT&&exT.done_at))data.done_at=new Date().toISOString();}
    else if(exT&&exT.done_at)data.done_at=null;
  }
  if(form.e==='doc'){data.title=data.stage||'תיעוד';}
  if(form.e==='resp'){var exR=form.id?byId('resp_items',form.id):null;data.week=data.week?Math.round(data.week):null;data.done_at=data.done?((exR&&exR.done_at)||new Date().toISOString()):null;}
  if(form.e==='payment'){var exPay=form.id?byId('payments',form.id):null;data.paid_at=data.paid?((exPay&&exPay.paid_at)||todayStr()):null;}
  if(form.e==='plan'&&!form.id)data.uploaded_by=AUTH.uid;
  if(form.e==='project'){
    var exP=form.id?byId('projects',form.id):null;
    if(!form.id){data.id=(window.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now()));}
    if(!exP||exP.name!==data.name||(exP.address||'')!==(data.address||'')||!exP.name_ar){trId=form.id||data.id;trTable='projects';}
  }
  if(form.e==='plan'){
    if(!form.id&&!form.file2){ferr('בחר קובץ.');return;}
    if(!data.title)data.title=form.file2?form.file2.name.replace(/\.[^.]+$/,''):'תוכנית';
  }
  if(form.e==='event'){
    var evRaw=data;var st=data.startTime,en=data.endTime;
    var sdt=new Date(data.date+'T'+(st||'00:00')),edt=en?new Date(data.date+'T'+en):null;
    if(edt&&edt<sdt){ferr('שעת הסיום לפני ההתחלה.');return;}
    data={title:data.title,notes:data.notes,location:data.location,projectId:data.projectId,all_day:!st,start_at:sdt.toISOString(),end_at:edt?edt.toISOString():null};
    evId=form.id||(window.crypto&&crypto.randomUUID?crypto.randomUUID():String(Date.now()));if(!form.id)data.id=evId;
  }
  form.busy=true;var btn=$('#fsave');if(btn){btn.disabled=true;btn.textContent='שומר…';}
  try{
    if(form.e==='event'&&((form.id&&String(form.id).indexOf('g:')===0)||(!form.id&&gReady()))){
      if(!gReady())throw {code:'auth'};
      var gb=gBody(evRaw);
      var gres;
      if(form.id)gres=await gApi('PATCH','/'+encodeURIComponent(String(form.id).slice(2)),gb);else gres=await gApi('POST','',gb);
      var gid=form.id?String(form.id):(gres&&gres.id?'g:'+gres.id:'g:'+Date.now());
      await setReminder('ev:'+gid,evRaw.title,(evRaw.startTime?'בשעה '+evRaw.startTime:'כל היום')+(evRaw.location?' · '+evRaw.location:''),remindWhen(evRaw.date,evRaw.startTime,evRaw.remind));
      G.range='';closeSheet();await gLoad();return;
    }
    if(form.e==='plan'&&form.file2){
      btn.textContent='מעלה קובץ…';
      var ext=((form.file2.name.match(/\.([A-Za-z0-9]{1,6})$/)||[])[1]||'bin').toLowerCase();
      var ppath='plans/'+AUTH.uid+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
      var pu=await sb.storage.from('photos').upload(ppath,form.file2,{contentType:form.file2.type||'application/octet-stream'});
      if(pu.error)throw pu.error;
      data.file_path=ppath;data.file_name=form.file2.name;data.file_type=ext;
    }
    if(form.e==='supdoc'&&form.orderId)data.orderId=form.orderId;
    var hasPhoto=cfg.fields.some(function(f){return f.t==='photo';});
    if(hasPhoto){
      if(form.file){
        btn.textContent='מעלה תמונה…';
        var ispdf=/pdf/i.test(form.file.type)||/\.pdf$/i.test(form.file.name||'');
        var isv=/^video\//.test(form.file.type),vext=((form.file.name||'').match(/\.([A-Za-z0-9]{2,4})$/)||[])[1]||'mp4';
        if(isv)btn.textContent='מעלה וידאו… (עשוי לקחת רגע)';
        var blob=(isv||ispdf)?form.file:await shrink(form.file);
        var path=AUTH.uid+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+(ispdf?'.pdf':isv?'.'+vext.toLowerCase():'.jpg');
        var up=await sb.storage.from('photos').upload(path,blob,{contentType:ispdf?'application/pdf':isv?(form.file.type||'video/mp4'):'image/jpeg'});
        if(up.error)throw up.error;
        data.photo=path;
      }else if(form.removed){data.photo=null;}
    }
    var r=await saveRow(cfg.col,toRow(data),form.id);if(r.error)throw r.error;
    if(trId)translateRow(trTable,trId);
    if(form.e==='task'){
      var tw=null;
      if(data.due&&data.status!=='הושלם'&&taskRemind&&taskRemind!=='ללא'){
        var morning=taskRemind.indexOf('בבוקר')===0;
        var dd=pd(data.due);if(!morning)dd=new Date(dd.getFullYear(),dd.getMonth(),dd.getDate()-1);
        tw=new Date(ymd(dd)+'T'+(morning?'08:00':'18:00'));
      }
      var asgs=(data.assignee_ids||[]).map(function(i){return byId('team_members',i);}).filter(Boolean);
      var asg=asgs[0]||null;
      var timedBody=null;
      if(!tw&&data.due&&data.due_time&&data.status!=='הושלם'){tw=new Date(new Date(data.due+'T'+data.due_time).getTime()-30*60000);timedBody='בשעה '+data.due_time;}
      try{await sb.from('reminders').delete().like('ref','task:'+taskId+':%');}catch(e6){}
      var rUsers=asgs.map(function(m){return m.user_id;}).filter(Boolean);if(!rUsers.length)rUsers=[null];
      for(var ri=0;ri<rUsers.length;ri++){await setReminder('task:'+taskId+(ri?':u'+ri:''),'משימה: '+data.title,timedBody||(tw&&morning?'להיום':'למחר'),tw,rUsers[ri]);}
      // meeting <-> calendar event link
      try{
        var wantEv=data.kind==='פגישה'&&data.due&&data.due_time&&data.status!=='הושלם';
        var evid2=exT?exT.event_id:null;
        if(wantEv){
          var s2=new Date(data.due+'T'+data.due_time);
          var er={title:data.title,start_at:s2.toISOString(),end_at:new Date(s2.getTime()+3600000).toISOString(),all_day:false,project_id:data.projectId||null};
          if(evid2){
            await sb.from('events').update(er).eq('id',evid2);
            var oe=byId('events',evid2);
            if(oe&&oe.google_id&&gReady()){try{var gbr=gBodyRow(er),att2=evAttendees(evid2);if(att2.length)gbr.attendees=att2;await gApi('PATCH','/'+encodeURIComponent(oe.google_id)+(att2.length?'?sendUpdates=all':''),gbr);}catch(e7){}}
          }else{
            evid2=(window.crypto&&crypto.randomUUID?crypto.randomUUID():null);
            if(evid2){await sb.from('events').insert(Object.assign({id:evid2},er));await sb.from('tasks').update({event_id:evid2}).eq('id',taskId);}
          }
          await loadTable('events');
        }else if(evid2){
          var oe2=byId('events',evid2);
          if(oe2&&oe2.google_id&&gReady()){try{await gApi('DELETE','/'+encodeURIComponent(oe2.google_id));}catch(e8){}}
          await sb.from('events').delete().eq('id',evid2);
          await sb.from('tasks').update({event_id:null}).eq('id',taskId);
          await loadTable('events');
        }
      }catch(e9){}
      var before=exT?tAsg(exT):[],noUser=[];
      for(var ai=0;ai<asgs.length;ai++){var am=asgs[ai];if(before.indexOf(am.id)>=0)continue;
        if(am.user_id){
          if(am.user_id!==AUTH.uid){
            var wprof=S.profiles.filter(function(u){return u.id===am.user_id;})[0],isW=wprof&&wprof.role==='worker';
            try{await sb.from('reminders').insert({user_id:am.user_id,ref:'assign:'+taskId+':'+Date.now()+ai,title:isW?'مهمة جديدة لك':'משימה חדשה בשבילך',body:(isW&&data.title_ar?data.title_ar:data.title)+(data.projectId?' · '+pname(data.projectId):''),remind_at:new Date().toISOString()});}catch(e3){}
          }
        }else noUser.push(am.name);}
      if(noUser.length)setTimeout(function(){toast(noUser.join(', ')+' עוד לא מחוברים למשתמש, לא תישלח התראה.');},400);
    }
    if((form.e==='supdoc'||form.e==='order')&&data.projectId&&data.supplierId){
      try{await sb.from('project_suppliers').upsert({project_id:data.projectId,supplier_id:data.supplierId},{onConflict:'project_id,supplier_id'});await loadTable('project_suppliers');}catch(e4){}
    }
    if(form.e==='event'&&!(form.id&&String(form.id).indexOf('g:')===0)){
      await setReminder('ev:'+(evId||''),evRaw.title,(evRaw.startTime?'בשעה '+evRaw.startTime:'כל היום'),remindWhen(evRaw.date,evRaw.startTime,evRaw.remind));
    }
    await loadTable(cfg.col);
    closeSheet();
  }catch(err){
    form.busy=false;if(btn){btn.disabled=false;btn.textContent='שמור';}
    ferr(err&&err.code==='auth'?'החיבור לגוגל פג. חזור ליומן ולחץ חבר מחדש.':'השמירה לא הצליחה. נסה שוב.');
  }
}
async function doDelete(){
  if(!form||!form.id)return;
  var btn=$('#fdel');
  if(!form.confirmDel){form.confirmDel=true;btn.textContent=form.e==='project'?'לחץ שוב: ימחק גם את כל המשימות, ההוצאות והתיעוד':'לחץ שוב למחיקה';return;}
  btn.disabled=true;var cfg=F[form.e],id=form.id,e=form.e;
  try{
    if(e==='event'&&String(id).indexOf('g:')===0){if(!gReady())throw {code:'auth'};await gApi('DELETE','/'+encodeURIComponent(String(id).slice(2)));G.range='';closeSheet();await gLoad();return;}
    var old=e==='plan'?byId('plans',id):null;
    var oldT=e==='task'?byId('tasks',id):null;
    var r=await sb.from(cfg.col).delete().eq('id',id);if(r.error)throw r.error;
    if(old&&old.file_path)sb.storage.from('photos').remove([old.file_path]);
    if(oldT&&oldT.event_id){try{var oe3=byId('events',oldT.event_id);if(oe3&&oe3.google_id&&gReady()){try{await gApi('DELETE','/'+encodeURIComponent(oe3.google_id));}catch(e10){}}await sb.from('events').delete().eq('id',oldT.event_id);await loadTable('events');}catch(e11){}}
    if(e==='project'){if(UI.view==='project')UI.view='projects';await loadAll();}else await loadTable(cfg.col);
    closeSheet();
  }catch(err){btn.disabled=false;ferr('המחיקה לא הצליחה. נסה שוב.');}
}

/* ---------- contacts import ---------- */
var IMP=[];
async function startImport(){
  if(!('contacts' in navigator&&'ContactsManager' in window)){alert('הדפדפן הזה לא תומך בבחירת אנשי קשר. פתח את האפליקציה ב-Chrome באנדרואיד.');return;}
  var picked;
  try{picked=await navigator.contacts.select(['name','tel'],{multiple:true});}catch(e){return;}
  if(!picked||!picked.length)return;
  var have={};S.suppliers.forEach(function(x){[x.phone].concat((x.contacts||[]).map(function(c){return c.phone;})).forEach(function(p){if(p)have[String(p).replace(/\D/g,'').slice(-9)]=1;});});
  IMP=picked.map(function(c){var ph=(c.tel&&c.tel[0]||'').replace(/[\s-]/g,'');return {name:(c.name&&c.name[0]||'').trim()||ph,phone:ph,dup:!!(ph&&have[ph.replace(/\D/g,'').slice(-9)])};});
  var cats=supplierFields();
  var html='<div class="scrim" data-act="closeSheet"></div><form class="sheet" id="impf" role="dialog" aria-modal="true"><h2>ייבוא אנשי קשר ('+IMP.length+')</h2>'+
   '<div class="fld"><label for="imp_cat">קטגוריה לכל הנבחרים</label><input id="imp_cat" list="dl_imp" placeholder="למשל: חשמל, אינסטלציה, ריצוף" autocomplete="off"><datalist id="dl_imp">'+cats.map(function(c){return '<option value="'+esc(c)+'">';}).join('')+'</datalist></div>'+
   '<div class="muted" style="margin-bottom:6px">בטל סימון למי שלא לצרף. מי שכבר קיים אצלך מסומן "כבר קיים" ולא יסומן.</div>'+
   '<div class="stack" style="margin-bottom:12px">'+IMP.map(function(c,i){return '<label class="chk item" style="padding:8px 12px"><input type="checkbox" data-imp="'+i+'"'+(c.dup?'':' checked')+'><span style="min-width:0"><b>'+esc(c.name)+'</b>'+(c.dup?' '+chip('neutral','כבר קיים'):'')+'<br><span class="muted ltr">'+esc(c.phone)+'</span></span></label>';}).join('')+'</div>'+
   '<p class="ferr" id="ferr" role="alert"></p><div class="fbtns"><button class="btn btn-accent" type="submit" id="impsave">ייבא</button><button class="btn btn-line" type="button" data-act="closeSheet">ביטול</button></div></form>';
  $('#layer').innerHTML=html;pushOverlay('sheet');
}
async function doImport(){
  var cat=($('#imp_cat').value||'').trim();
  var rows=[].slice.call(document.querySelectorAll('[data-imp]')).filter(function(c){return c.checked;}).map(function(c){var x=IMP[+c.getAttribute('data-imp')];return {name:x.name,phone:x.phone||null,field:cat||null};});
  if(!rows.length){ferr('לא נבחר אף איש קשר.');return;}
  var b=$('#impsave');b.disabled=true;b.textContent='מייבא…';
  var r=await sb.from('suppliers').insert(rows);
  if(r.error){b.disabled=false;b.textContent='ייבא';ferr('הייבוא לא הצליח. נסה שוב.');return;}
  await loadTable('suppliers');closeSheet();
}

/* ---------- client personal area ---------- */
function clientProjects(){return sortedProjects().filter(function(p){return S.client_projects.some(function(c){return c.user_id===AUTH.uid&&c.projectId===p.id;})||AUTH.role==='client'||AUTH.role==='architect';});}
function cSec(id,title,body){return '<section class="csec" id="c_'+id+'"><h2>'+title+'</h2>'+body+'</section>';}
function vClient(){
  var ps=clientProjects();
  var p=byId('projects',UI.clientProject)||ps[0];
  var first=(AUTH.name||'').split(' ')[0];
  var h=bandHtml('שלום'+(first?', '+first:''),'פדר בניה · לבנות בראש שקט',{right:'<img class="logo" src="'+LOGO+'" alt="פדר">'});
  h+='<main class="wrap cwrap">';
  if(!p){return h+'<div class="pull">'+emptyBox('עדיין לא שויך אליך פרויקט. פדר בניה יעדכן בקרוב.')+'</div><div style="text-align:center;margin:26px 0"><button class="link" data-act="logout">התנתקות</button></div></main>';}
  var sm=hasSched(p)?sSummary(p):null;
  var tasks=S.tasks.filter(function(t){return t.projectId===p.id;});
  var done=tasks.filter(function(t){return t.status==='הושלם';});
  var pct=tasks.length?Math.round(done.length/tasks.length*100):0;
  h+='<div class="card pull"><div class="row1"><div class="name">'+esc(p.name)+'</div>'+chip(PROJ_CHIP[p.status]||'neutral',p.status||'')+'</div>'+(p.address?'<div class="muted">'+esc(p.address)+'</div>':'')+
    (sm?'<div style="margin-top:10px"><b>שבוע '+sm.cw+' מתוך '+sm.weeks+'</b>'+(p.sched_goal?' · '+esc(p.sched_goal):'')+'</div>'+sLineHtml(sm)+(sm.now.length?'<div style="margin-top:6px">עובדים עכשיו על: '+esc(sm.now.slice(0,4).join(', '))+'</div>':'')
      :'<div class="bar" role="img" aria-label="התקדמות '+pct+' אחוז"><i style="width:'+pct+'%"></i></div><div class="meta"><span>'+done.length+' בוצעו</span><span>'+(tasks.length-done.length)+' נותרו</span></div>')+'</div>';
  if(ps.length>1)h+='<div class="filters" style="margin-top:8px">'+ps.map(function(q){return '<button class="fchip" data-act="cproj" data-id="'+esc(q.id)+'" aria-pressed="'+(q.id===p.id)+'">'+esc(q.name)+'</button>';}).join('')+'</div>';
  var need=S.resp_items.filter(function(it){return it.projectId===p.id&&!it.done&&(it.grp==='client'||it.grp==='client_supply');}).sort(function(a,b){return (b.urgent?1:0)-(a.urgent?1:0)||((a.week||99)-(b.week||99));});
  var photos=S.docs.filter(function(d){return d.projectId===p.id&&d.photo;}).sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''));});
  var files=S.plans.filter(function(x){return x.projectId===p.id;});
  var pays=S.payments.filter(function(x){return x.projectId===p.id;}).sort(function(a,b){return String(a.due||'9').localeCompare(String(b.due||'9'));});
  var td=todayStr(),meets=tasks.filter(function(t){return t.kind==='פגישה'&&t.client_visible&&t.due&&t.due>=td&&t.status!=='הושלם';}).sort(function(a,b){return (a.due+(a.due_time||'')).localeCompare(b.due+(b.due_time||''));});
  var sids=S.project_suppliers.filter(function(x){return x.projectId===p.id&&x.client_added;}).map(function(x){return x.supplierId;});
  var sups=S.suppliers.filter(function(x){return sids.indexOf(x.id)>=0;});
  var chg=S.change_requests.filter(function(x){return x.projectId===p.id;}).sort(function(a,b){return b.createdAt-a.createdAt;});
  var menu=[['need','צריך את ההחלטה שלכם',need.length],['stages','שלבים ולו״ז',0],['photos','תמונות',photos.length],['files','מסמכים',files.length],['pay','תשלומים',0],['meet','פגישות',meets.length],['sup','הספקים שלי',sups.length],['msg','הודעות',0],['chg','שינויים ותוספות',0]];
  h+='<nav class="cmenu" aria-label="אזור אישי">'+menu.map(function(m){return '<a href="#c_'+m[0]+'">'+m[1]+(m[2]?' <b>'+m[2]+'</b>':'')+'</a>';}).join('')+'</nav>';
  // 1 needs you
  h+=cSec('need','צריך את ההחלטה שלכם',need.length?'<div class="stack">'+need.map(function(it){
    var late=respLate(p,it);
    return '<div class="cneed'+(late?' late':'')+'"><div><b>'+esc(it.item)+'</b>'+(it.urgent?' <em class="urg">מיידי</em>':'')+'<div class="muted">'+esc([respGrpName(it.grp).replace('באחריות הלקוח','בטיפולכם'),it.week?'עד שבוע '+it.week:'',it.note].filter(Boolean).join(' · '))+'</div>'+(it.reply?'<div class="muted">כתבתם: '+esc(it.reply)+'</div>':'')+'</div>'+
      '<div class="cnb"><button class="btn btn-accent" data-act="cdone" data-id="'+esc(it.id)+'">בוצע ✓</button><button class="btn btn-line" data-act="cnote" data-id="'+esc(it.id)+'">לכתוב</button></div></div>';}).join('')+'</div>':emptyBox('אין כרגע משהו שמחכה לכם. תודה!'));
  // 2 stages
  h+=cSec('stages','שלבים ולו״ז',sm?'<div class="sgwrap">'+sGrid(p,{compact:true})+'</div>'+(sm.next.length?'<p class="muted" style="margin:8px 4px 0">בשבוע הבא: '+esc(sm.next.slice(0,4).join(', '))+'</p>':''):
    '<div class="stack">'+sortTasks(tasks.filter(function(t){return t.status!=='הושלם'&&t.kind!=='פגישה';})).slice(0,8).map(taskRow.bind(null,false,false)).join('')+'</div>');
  // 3 photos
  h+=cSec('photos','תמונות מהאתר',photos.length?'<div class="docs">'+photos.slice(0,24).map(function(d){return '<button class="doc" data-act="photo" data-id="'+esc(d.photo)+'"><div class="im">'+mediaTag(d.photo)+'</div><div class="tx"><div class="t" style="font-weight:700">'+esc(d.title||d.stage||'')+'</div><div class="muted">'+fdate(d.date)+'</div></div></button>';}).join('')+'</div>':emptyBox('עוד לא עלו תמונות.'));
  // 4 documents
  h+=cSec('files','מסמכים ותוכניות',files.length?'<div class="stack">'+files.map(function(pl){return '<div class="item"><div class="ftype">'+esc(String(pl.file_type||'').toUpperCase()||'קובץ')+'</div><div class="main"><div class="t">'+esc(pl.title)+'</div><div class="muted">'+esc(pl.kind||'')+'</div></div><button class="btn btn-navy" style="min-height:42px;font-size:15px" data-act="openplan" data-id="'+esc(pl.id)+'">פתח</button></div>';}).join('')+'</div>':emptyBox('עוד אין מסמכים.'));
  // 5 payments
  var paid=sum(pays.filter(function(x){return x.paid;}).map(function(x){return {amount:x.amount};})),tot=sum(pays.map(function(x){return {amount:x.amount};}));
  h+=cSec('pay','תשלומים',pays.length?'<div class="card" style="margin-bottom:8px"><div class="row1"><span>שולם</span><b>'+money(paid)+' מתוך '+money(tot)+'</b></div><div class="bar"><i style="width:'+(tot?Math.round(paid/tot*100):0)+'%"></i></div></div><div class="stack">'+pays.map(function(x){
    var late=!x.paid&&x.due&&x.due<td;return '<div class="item"><div class="main"><div class="t">'+esc(x.title)+'</div><div class="muted">'+(x.due?'מועד: '+fdate(x.due):'')+(x.note?' · '+esc(x.note):'')+'</div></div><b>'+money(x.amount)+'</b>'+(x.paid?chip('ok','שולם'):late?chip('warn','לתשלום'):chip('neutral','הבא'))+'</div>';}).join('')+'</div>':emptyBox('לוח התשלומים יופיע כאן.'));
  // 6 meetings
  h+=cSec('meet','פגישות קרובות',meets.length?'<div class="stack">'+meets.map(function(t){return '<div class="item"><span class="ftype">'+ico('cal',22)+'</span><div class="main"><div class="t">'+esc(t.title)+'</div><div class="muted">'+fdate(t.due)+(t.due_time?' · '+esc(t.due_time):'')+'</div></div></div>';}).join('')+'</div>':emptyBox('אין פגישות קרובות.'));
  // 7 my suppliers
  h+=cSec('sup','הספקים שלי','<p class="muted" style="margin:0 4px 8px">מוסיפים כאן את הספקים שלכם (מטבח, אלומיניום, אינסטלטור...) והם נשמרים אצלנו בפרויקט.</p>'+
    (sups.length?'<div class="stack">'+sups.map(function(x){return '<div class="item"><div class="main"><div class="t">'+esc(x.name)+'</div><div class="muted">'+esc(x.field||'')+'</div></div>'+(x.phone?callBtns(x.phone,x.name):'')+'</div>';}).join('')+'</div>':'')+
    '<form class="card csupf" id="csupf" style="margin-top:10px" onsubmit="return false"><div class="grid2"><div class="fld"><label for="cs_n">שם הספק</label><input id="cs_n" autocomplete="off"></div><div class="fld"><label for="cs_f">תחום</label><input id="cs_f" list="dl_cf" autocomplete="off" placeholder="מטבח, אלומיניום…"></div></div>'+
    '<div class="fld"><label for="cs_p">טלפון</label><input id="cs_p" class="ltr" type="tel" inputmode="tel"></div><datalist id="dl_cf">'+['מטבח','אלומיניום','אינסטלציה','חשמל','מיזוג אוויר','דלתות','ריצוף','שיש','סניטריים','תאורה','נגרות','זכוכית'].map(function(x){return '<option value="'+x+'">';}).join('')+'</datalist>'+
    '<button class="btn btn-accent" type="button" data-act="csupadd" style="width:100%">הוסף ספק</button></form>');
  // 8 messages
  h+=cSec('msg','הודעות למשה',msgsHtml(p.id));
  // 9 change requests
  h+=cSec('chg','שינויים ותוספות','<p class="muted" style="margin:0 4px 8px">רוצים לשנות או להוסיף משהו? כתבו כאן. נחזור אליכם עם מחיר, ונבצע רק אחרי שתאשרו.</p>'+
    (chg.length?'<div class="stack">'+chg.map(function(c){
      var ask=c.status==='הצעת מחיר'&&c.client_ok==null;
      return '<div class="card"><div class="row1"><b>'+esc(c.body)+'</b>'+chip(c.status==='אושר'||c.status==='בוצע'?'ok':c.status==='נדחה'?'neutral':'warn',c.status||'חדש')+'</div>'+(c.price!=null?'<div style="margin-top:4px">מחיר: <b>'+money(c.price)+'</b></div>':'')+(c.reply?'<div class="muted" style="margin-top:4px">'+esc(c.reply)+'</div>':'')+
        (ask?'<div class="grid2" style="margin-top:10px"><button class="btn btn-accent" data-act="cchg" data-id="'+esc(c.id)+'" data-ok="1">מאשרים</button><button class="btn btn-line" data-act="cchg" data-id="'+esc(c.id)+'" data-ok="0">לא עכשיו</button></div>':'')+'</div>';}).join('')+'</div>':'')+
    '<div class="card" style="margin-top:10px"><div class="fld"><label for="cc_b">בקשה חדשה</label><textarea id="cc_b" rows="3" placeholder="למשל: להוסיף נקודת חשמל במרפסת"></textarea></div><button class="btn btn-navy" style="width:100%" data-act="cchgnew" data-p="'+esc(p.id)+'">שלח בקשה</button></div>');
  h+='<div style="text-align:center;margin:26px 0 90px"><button class="link" data-act="logout">התנתקות</button></div>';
  return h+'</main>';
}
function cNoteOpen(id){
  var it=byId('resp_items',id);if(!it)return;form={e:'_cnote',id:id};
  $('#layer').innerHTML='<div class="scrim" data-act="closeSheet"></div><form class="sheet" role="dialog" aria-modal="true" aria-labelledby="cn_h" onsubmit="return false"><h2 id="cn_h">'+esc(it.item)+'</h2><div class="fld"><label for="cn_t">מה תרצו לכתוב לנו?</label><textarea id="cn_t" rows="4">'+esc(it.reply||'')+'</textarea></div>'+
    '<label class="chk"><input type="checkbox" id="cn_d"> זה כבר בוצע</label><p class="ferr" id="ferr" role="alert"></p><div class="fbtns"><button class="btn btn-accent" type="button" data-act="cnotesave">שלח</button><button class="btn btn-line" type="button" data-act="closeSheet">ביטול</button></div></form>';
  pushOverlay('sheet');
}
async function cResp(id,done,txt){
  var r=await sb.rpc('client_set_resp',{rid:id,is_done:!!done,txt:txt||''});
  if(r.error){toast('לא נשמר. נסה שוב.');return false;}
  await loadTable('resp_items');toast(done?'תודה! סימנו שבוצע ✓':'נשלח ✓');return true;
}
async function cSupAdd(){
  var p=byId('projects',UI.clientProject)||clientProjects()[0];if(!p)return;
  var n=$('#cs_n').value.trim(),f=$('#cs_f').value.trim(),ph=$('#cs_p').value.trim();
  if(!n){toast('כתבו את שם הספק.');return;}
  var r=await sb.rpc('client_add_supplier',{pid:p.id,sname:n,sfield:f,sphone:ph});
  if(r.error){toast('לא נשמר. נסה שוב.');return;}
  await Promise.all([loadTable('project_suppliers'),loadTable('suppliers')]);toast('הספק נשמר ✓');
}
async function cChgNew(pid){
  var b=$('#cc_b').value.trim();if(!b){toast('כתבו את הבקשה.');return;}
  var r=await sb.from('change_requests').insert({project_id:pid,body:b});
  if(r.error){toast('לא נשלח. נסה שוב.');return;}
  await loadTable('change_requests');toast('הבקשה נשלחה ✓');
}
async function cChgOk(id,ok){var r=await sb.rpc('client_change_ok',{cid:id,ok:ok});if(r.error){toast('לא נשמר.');return;}await loadTable('change_requests');toast(ok?'אושר ✓':'נשמר');}
/* staff: client area tab in the project */
function clientTabHtml(p){
  var users=S.profiles.filter(function(u){return (u.role==='client'||u.role==='architect')&&S.client_projects.some(function(c){return c.user_id===u.id&&c.projectId===p.id;});});
  var pays=S.payments.filter(function(x){return x.projectId===p.id;}).sort(function(a,b){return String(a.due||'9').localeCompare(String(b.due||'9'));});
  var chg=S.change_requests.filter(function(x){return x.projectId===p.id;}).sort(function(a,b){return b.createdAt-a.createdAt;});
  var visD=S.docs.filter(function(d){return d.projectId===p.id&&d.client_visible;}).length,visP=S.plans.filter(function(d){return d.projectId===p.id&&d.client_visible;}).length;
  var openResp=S.resp_items.filter(function(it){return it.projectId===p.id&&!it.done&&(it.grp==='client'||it.grp==='client_supply');}).length;
  var h='<div class="sec" style="margin-top:12px"><h2>אזור הלקוח</h2></div>';
  h+='<div class="card"><b>מי מחובר</b><div class="muted" style="margin:4px 0">'+(users.length?users.map(function(u){return esc(u.name||'')+' ('+(u.role==='architect'?'אדריכלית':'לקוח')+')';}).join(', '):'עוד אף אחד. הלקוח נרשם באפליקציה, ואתה משייך אותו לפרויקט במסך משתמשים.')+'</div>'+
    '<div class="muted">הלקוח רואה: '+visD+' תמונות, '+visP+' מסמכים (מסמנים "להציג ללקוח" בתיעוד ובמסמכים), '+openResp+' פריטים שמחכים לו, תשלומים, פגישות שסומנו, והודעות.</div></div>';
  h+='<div class="sec"><h2>תשלומים</h2>'+addBtn('payment','תשלום',p.id)+'</div>';
  h+=pays.length?'<div class="stack">'+pays.map(function(x){return '<div class="item"><button class="main" data-act="edit" data-e="payment" data-id="'+esc(x.id)+'"><div class="t">'+esc(x.title)+'</div><div class="muted">'+(x.due?fdate(x.due):'')+'</div></button><b>'+money(x.amount)+'</b>'+(x.paid?chip('ok','שולם'):chip('neutral','פתוח'))+'</div>';}).join('')+'</div>':emptyBox('עוד אין לוח תשלומים. הלקוח יראה כאן מה שולם ומה הבא.');
  h+='<div class="sec"><h2>בקשות שינוי מהלקוח</h2></div>';
  h+=chg.length?'<div class="stack">'+chg.map(function(c){return '<div class="item"><button class="main" data-act="edit" data-e="change" data-id="'+esc(c.id)+'"><div class="t">'+esc(c.body)+'</div><div class="muted">'+(c.price!=null?money(c.price)+' · ':'')+(c.client_ok===true?'הלקוח אישר':c.client_ok===false?'הלקוח דחה':'')+'</div></button>'+chip(c.status==='חדש'?'warn':c.status==='אושר'||c.status==='בוצע'?'ok':'neutral',c.status||'חדש')+'</div>';}).join('')+'</div>':emptyBox('אין בקשות. כשהלקוח יבקש שינוי, תקבל התראה ותקבע כאן מחיר – והוא יאשר באזור שלו.');
  return h;
}
/* ---------- architect area ---------- */
function vArchitect(){
  var ps=clientProjects(),p=byId('projects',UI.clientProject)||ps[0];
  var first=(AUTH.name||'').split(' ')[0];
  var h=bandHtml('שלום'+(first?', '+first:''),'פדר בניה · אזור אדריכלית',{right:'<img class="logo" src="'+LOGO+'" alt="פדר">'});
  h+='<main class="wrap cwrap">';
  if(!p)return h+'<div class="pull">'+emptyBox('עדיין לא שויך אלייך פרויקט. פדר בניה יעדכנו בקרוב.')+'</div><div style="text-align:center;margin:26px 0"><button class="link" data-act="logout">התנתקות</button></div></main>';
  if(ps.length>1)h+='<div class="filters pull" style="margin-bottom:8px">'+ps.map(function(q){return '<button class="fchip" data-act="cproj" data-id="'+esc(q.id)+'" aria-pressed="'+(q.id===p.id)+'">'+esc(q.name)+'</button>';}).join('')+'</div>';
  var sm=hasSched(p)?sSummary(p):null;
  h+='<div class="card'+(ps.length>1?'':' pull')+'"><div class="name">'+esc(p.name)+'</div>'+(p.address?'<div class="muted">'+esc(p.address)+'</div>':'')+(sm?'<div style="margin-top:8px"><b>שבוע '+sm.cw+' מתוך '+sm.weeks+'</b></div>'+sLineHtml(sm):'')+'</div>';
  var mine=S.resp_items.filter(function(it){return it.projectId===p.id&&it.grp==='architect';}).sort(function(a,b){return (a.done?1:0)-(b.done?1:0)||((a.week||99)-(b.week||99));});
  h+=cSec('need','מה מחכה לך',mine.length?'<div class="stack">'+mine.map(function(it){var late=respLate(p,it);
    return '<div class="cneed'+(late?' late':'')+(it.done?' done':'')+'"><div><b>'+esc(it.item)+'</b>'+(it.urgent&&!it.done?' <em class="urg">מיידי</em>':'')+'<div class="muted">'+esc([it.stage,it.week?'שבוע '+it.week:'',it.note].filter(Boolean).join(' · '))+'</div></div>'+
      (it.done?chip('ok','בוצע'):'<div class="cnb"><button class="btn btn-accent" data-act="cdone" data-id="'+esc(it.id)+'">בוצע ✓</button><button class="btn btn-line" data-act="cnote" data-id="'+esc(it.id)+'">לכתוב</button></div>')+'</div>';}).join('')+'</div>':emptyBox('אין כרגע משימות פתוחות בשבילך.'));
  var files=S.plans.filter(function(x){return x.projectId===p.id;}).sort(function(a,b){return b.createdAt-a.createdAt;});
  h+=cSec('files','תוכניות ומסמכים','<button class="btn btn-accent" style="width:100%;margin-bottom:10px" data-act="add" data-e="plan" data-project="'+esc(p.id)+'">'+ico('plus',22)+'העלאת תוכנית / מסמך</button>'+
    (files.length?'<div class="stack">'+files.map(function(pl){return '<div class="item"><div class="ftype">'+esc(String(pl.file_type||'').toUpperCase()||'קובץ')+'</div><div class="main"><div class="t">'+esc(pl.title)+'</div><div class="muted">'+esc(pl.kind||'')+' · '+esc(fdate(String(pl.created_at||'').slice(0,10)))+'</div></div><button class="btn btn-navy" style="min-height:42px;font-size:15px" data-act="openplan" data-id="'+esc(pl.id)+'">פתח</button></div>';}).join('')+'</div>':emptyBox('עוד אין תוכניות בפרויקט.')));
  if(sm)h+=cSec('stages','לוח זמנים','<div class="sgwrap">'+sGrid(p,{compact:true})+'</div>');
  h+='<div style="text-align:center;margin:26px 0 90px"><button class="link" data-act="logout">התנתקות</button></div>';
  return h+'</main>';
}
/* ---------- accountant: month filter + export ---------- */
function accMonths(){var m={};S.expenses.forEach(function(x){if(x.date)m[String(x.date).slice(0,7)]=1;});return Object.keys(m).sort().reverse();}
function accList(){return S.expenses.filter(expFilt).filter(function(x){return !UI.accMonth||String(x.date||'').slice(0,7)===UI.accMonth;});}
function vAccountant(){
  var list=accList();
  var h=bandHtml('הוצאות','פדר בניה · רואה חשבון',{right:'<img class="logo" src="'+LOGO+'" alt="פדר">'});
  var ms=accMonths();
  h+='<main class="wrap"><div class="card pull stat"><div class="k">סה״כ הוצאות'+(UI.expProject?' בפרויקט':'')+(UI.accMonth?' · '+esc(UI.accMonth.split('-').reverse().join('/')):'')+'</div><div class="v">'+money(sum(list))+'</div><div class="muted">'+list.length+' קבלות</div></div>'+
    '<div class="grid2" style="margin-top:14px;align-items:end"><div>'+projSelect('eproj','expProject')+'</div><div class="fld"><label for="accm">חודש</label><select id="accm" data-sel="accMonth"><option value="">כל החודשים</option>'+ms.map(function(m){return '<option value="'+m+'"'+(UI.accMonth===m?' selected':'')+'>'+m.split('-').reverse().join('/')+'</option>';}).join('')+'</select></div></div>'+
    '<button class="btn btn-navy" style="width:100%;margin-bottom:12px" data-act="accexport">'+ico('report',20)+' ייצוא לאקסל</button>';
  h+=list.length?'<div class="stack">'+sortExp(list).map(expRowRO).join('')+'</div>':emptyBox('אין הוצאות להצגה.');
  return h+'<div style="text-align:center;margin:26px 0 8px"><button class="link" data-act="logout">התנתקות</button></div></main>';
}
function accExport(){
  var list=sortExp(accList());
  var rows=[['תאריך','ספק / על מה','סכום','אמצעי תשלום','פרויקט','הערה','קישור לקבלה']];
  list.forEach(function(x){rows.push([x.date||'',x.vendor||'',x.amount==null?'':x.amount,x.pay||'',pname(x.projectId),x.note||'',x.photo&&PHOTO[x.photo]?PHOTO[x.photo]:'']);});
  rows.push(['','סה״כ',sum(list),'','','','']);
  var csv='﻿'+rows.map(function(r){return r.map(function(c){c=String(c==null?'':c);return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(',');}).join('\r\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='הוצאות פדר בניה'+(UI.accMonth?' '+UI.accMonth:'')+'.csv';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},500);
}

/* ---------- Amit-style gantt: weekly targets + responsibilities ---------- */
var RESP_GRP=[['client','באחריות הלקוח'],['client_supply','אספקות באחריות הלקוח'],['architect','באחריות האדריכלית'],['office','באחריות מוישי']];
function respGrpName(g){for(var i=0;i<RESP_GRP.length;i++)if(RESP_GRP[i][0]===g)return RESP_GRP[i][1];return g||'';}
function sRows(p){return S.sched_rows.filter(function(r){return r.projectId===p.id;}).sort(function(a,b){return (a.section===b.section?0:(a.section==='client'?1:-1))||((+a.sort||0)-(+b.sort||0))||(a.createdAt-b.createdAt);});}
function sResp(p){return S.resp_items.filter(function(r){return r.projectId===p.id;}).sort(function(a,b){return ((+a.sort||0)-(+b.sort||0))||(a.createdAt-b.createdAt);});}
function hasSched(p){return S.sched_rows.some(function(r){return r.projectId===p.id;});}
function sunday(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate()-d.getDay());}
function sWeeks(p){return Math.max(1,Math.min(30,+p.sched_weeks||5));}
function sStart(p){return pd(p.sched_start)||pd(todayStr());}
function sWeekStart(p,w){var s=sunday(sStart(p));return new Date(s.getFullYear(),s.getMonth(),s.getDate()+(w-1)*7);}
function sWeekLabel(p,w){var a=sWeekStart(p,w),st=sStart(p);if(w===1&&st>a)a=st;var e=sWeekStart(p,w);e=new Date(e.getFullYear(),e.getMonth(),e.getDate()+5);return a.getDate()+'/'+(a.getMonth()+1)+'–'+e.getDate()+'/'+(e.getMonth()+1);}
function bd(x){return '<bdi dir="ltr">'+esc(x)+'</bdi>';}
function sCurWeek(p){var t=pd(todayStr()),s=sunday(sStart(p));return Math.floor((t-s)/(7*864e5))+1;}
function sDayFrac(){var d=new Date().getDay();return Math.min(1,(d+1)/6);}
function sTargets(r){var o=r.targets&&typeof r.targets==='object'?r.targets:{};return o;}
function sWeeksOf(r){return Object.keys(sTargets(r)).map(Number).filter(function(x){return x>0;}).sort(function(a,b){return a-b;});}
function sTargetAt(r,w){var t=sTargets(r),best=0;Object.keys(t).forEach(function(k){if(+k<=w&&t[k]!=null&&+t[k]>best)best=+t[k];});return best;}
function sHasPct(r){var t=sTargets(r);return Object.keys(t).some(function(k){return t[k]!=null&&t[k]!=='';});}
function sRowState(p,r){
  var cw=sCurWeek(p),ws=sWeeksOf(r);
  if(r.section==='client'){
    var first=ws[0]||0,done=!!r.done;
    return {late:!done&&first&&first<cw,done:done,due:!done&&first===cw};
  }
  var act=Math.max(0,Math.min(100,+r.actual||0));
  if(!sHasPct(r)){var last=ws[ws.length-1]||0;return {late:act<100&&last&&last<cw,done:act>=100,act:act,exp:last&&last<cw?100:0};}
  var expPrev=sTargetAt(r,cw-1),expCur=sTargetAt(r,cw),exp=Math.round(expPrev+(expCur-expPrev)*sDayFrac());
  return {late:act<expPrev||(expCur>expPrev&&act<exp-20),done:act>=100,act:act,exp:exp,expCur:expCur};
}
function respLate(p,it){var cw=sCurWeek(p);return !it.done&&((it.week&&it.week<cw)||(it.urgent&&(!it.week||it.week<=cw)&&cw>1));}
/* summary for overview / CEO dashboard */
function sSummary(p){
  var rows=sRows(p),con=rows.filter(function(r){return r.section!=='client';}),cw=sCurWeek(p);
  if(!con.length)return null;
  var act=0,exp=0;con.forEach(function(r){var st=sRowState(p,r);act+=st.act||0;exp+=Math.min(100,st.exp||0);});
  act=Math.round(act/con.length);exp=Math.round(exp/con.length);
  var now=con.filter(function(r){var t=sTargets(r);return t[cw]!==undefined&&(+r.actual||0)<100;}).map(function(r){return r.title;});
  var block=[],seen={};function addB(x,k){k=k||x;if(seen[k])return;seen[k]=1;block.push(x);}
  con.forEach(function(r){if(sRowState(p,r).late)addB(r.title);});
  sResp(p).forEach(function(it){if(respLate(p,it))addB(it.item+' ('+respGrpName(it.grp).replace('באחריות ','').replace('אספקות באחריות הלקוח','אספקה של הלקוח')+')',it.item);});
  rows.filter(function(r){return r.section==='client';}).forEach(function(r){if(sRowState(p,r).late)addB(r.title);});
  var next=con.filter(function(r){return sWeeksOf(r)[0]===cw+1;}).map(function(r){return r.title;});
  return {act:act,exp:exp,late:block.length>0,now:now,block:block,next:next,cw:cw,weeks:sWeeks(p)};
}
function sLineHtml(sm){
  return '<div class="sline" role="img" aria-label="ביצוע '+sm.act+' אחוז, היעד להיום '+sm.exp+' אחוז"><i class="'+(sm.act<sm.exp?'late':'')+'" style="width:'+Math.max(2,sm.act)+'%"></i><b style="inset-inline-start:'+Math.min(99,sm.exp)+'%"></b></div>'+
    '<div class="slegend"><span>הפס = ביצוע בפועל</span><span>הקו = איפה צריך להיות היום</span></div>';
}
/* the grid (Amit's layout) */
function sGrid(p,opts){
  opts=opts||{};var W=sWeeks(p),cw=sCurWeek(p),rows=sRows(p);
  var cols='grid-template-columns:minmax('+(opts.compact?'130px':'240px')+',1.6fr) repeat('+W+',minmax('+(opts.compact?'58px':'96px')+',1fr))';
  var h='<div class="sgrid'+(opts.compact?' compact':'')+'" style="--w:'+W+'"><div class="sgr sgh" style="'+cols+'"><div>משימה</div>';
  for(var w=1;w<=W;w++)h+='<div class="'+(w===cw?'cur':'')+'"><b>'+(opts.compact?'ש׳'+w:'שבוע '+w)+(w===cw?(opts.compact?' היום':' · היום'):'')+'</b><span>'+bd(opts.compact?sWeekLabel(p,w).split('–')[0]:sWeekLabel(p,w))+'</span></div>';
  h+='</div>';
  [['contractor','עבודות קבלן'],['client','באחריות הלקוח, האדריכלית ומפקח הבנייה – לתיאום מול ספקים חיצוניים']].forEach(function(sec){
    var list=rows.filter(function(r){return (r.section==='client'?'client':'contractor')===sec[0];});
    if(!list.length&&opts.compact)return;
    h+='<div class="sgsec">'+esc(sec[1])+'</div>';
    list.forEach(function(r){
      var st=sRowState(p,r),t=sTargets(r);
      h+='<'+(opts.edit?'button type="button" data-act="sedit" data-id="'+esc(r.id)+'"':'div')+' class="sgr" style="'+cols+'"><div class="sgt"><span>'+esc(r.title)+'</span>'+(r.urgent?'<em class="urg">מיידי</em>':'')+'</div>';
      for(var w=1;w<=W;w++){
        var has=Object.prototype.hasOwnProperty.call(t,String(w)),cell='';
        if(has){
          if(r.milestone)cell='<span class="sstar" aria-label="אבן דרך">★</span>';
          else if(r.section==='client')cell='<span class="sout'+(st.done?' ok':st.late?' late':'')+'">'+(st.done?'בוצע ✓':st.late?'באיחור':(r.urgent?'מיידי':''))+'</span>';
          else{
            var tv=t[w],lab=tv==null||tv===''?'':tv+'%';
            if(w===cw&&sHasPct(r)&&tv!=null&&tv!=='')lab=opts.compact?st.act+'%':(st.act)+'% / '+tv+'%';
            else if(w<cw&&tv!=null&&tv!==''&&st.act>=+tv)lab=tv+'% ✓';
            var lateCell=st.late&&w<=cw;
            cell='<span class="sbar2'+(lateCell?' late':'')+(w>cw?' fut':'')+'" dir="ltr">'+esc(lab)+'</span>';
          }
        }
        h+='<div class="'+(w===cw?'cur':'')+'">'+(w===cw?'<i class="stl" aria-hidden="true" style="inset-inline-start:'+Math.round(sDayFrac()*100)+'%"></i>':'')+cell+'</div>';
      }
      h+='</'+(opts.edit?'button':'div')+'>';
    });
  });
  if(!opts.compact)h+='<div class="sglegend"><span><i class="lg1"></i>עבודות קבלן (המספר = יעד בסוף השבוע)</span><span><i class="lg2"></i>מפגר מול היעד</span><span><i class="lg3"></i>לקוח / אדריכלית / מפקח</span><span><i class="lg4"></i>היום</span><span><i class="lg5"></i>אבן דרך</span></div>';
  return h+'</div>';
}
function sWeeklyHtml(p){
  var W=sWeeks(p),rows=sRows(p),resp=sResp(p),cw=sCurWeek(p);
  var h='<div class="swk"><div class="swr swh"><div>שבוע</div><div>תאריכים</div><div>עבודות קבלן ויעדי התקדמות</div><div>באחריות הלקוח, האדריכלית ומפקח הבנייה</div><div>נדרש לקראת השבוע הבא</div></div>';
  for(var w=1;w<=W;w++){
    var con=rows.filter(function(r){return r.section!=='client'&&Object.prototype.hasOwnProperty.call(sTargets(r),String(w));}).map(function(r){var v=sTargets(r)[w];return esc(r.title)+(v!=null&&v!==''?' '+v+'%':'');});
    var cli=rows.filter(function(r){return r.section==='client'&&Object.prototype.hasOwnProperty.call(sTargets(r),String(w));}).map(function(r){return esc(r.title)+(r.urgent?' – מיידי':'')+(r.done?' ✓':'');});
    var cliT=rows.filter(function(r){return r.section==='client'&&Object.prototype.hasOwnProperty.call(sTargets(r),String(w));}).map(function(r){return r.title;});
    resp.filter(function(it){return it.week===w&&(it.grp==='client'||it.grp==='architect')&&cliT.indexOf(it.item)<0;}).forEach(function(it){cli.push(esc(it.item)+(it.done?' ✓':''));});
    var nxt=resp.filter(function(it){return it.week===w+1&&!it.done;}).map(function(it){return esc(it.item)+(it.note?' ('+esc(it.note)+')':'');});
    h+='<div class="swr'+(w===cw?' cur':'')+'"><div><b>שבוע '+w+'</b>'+(w===cw?'<br><span class="chip c-warn">השבוע</span>':'')+'</div><div class="ltr">'+bd(sWeekLabel(p,w))+'</div><div>'+(con.join('<br>')||'—')+'</div><div>'+(cli.join('<br>')||'—')+'</div><div>'+(nxt.join('<br>')||'—')+'</div></div>';
  }
  return h+'</div>';
}
function sRespHtml(p,edit){
  var items=sResp(p),h='';
  RESP_GRP.forEach(function(g){
    var list=items.filter(function(it){return it.grp===g[0];});
    if(!list.length&&!edit)return;
    var open=list.filter(function(it){return !it.done;}).length;
    h+='<section class="rsec"><div class="rsech"><h3>'+esc(g[1])+'</h3>'+(edit&&open&&(g[0]==='client'||g[0]==='client_supply'||g[0]==='architect')?'<button class="btn btn-line rsend" data-act="respsend" data-g="'+g[0]+'">'+ico('send',18)+' שלח בוואטסאפ מה פתוח ('+open+')</button>':'')+'</div>';
    h+='<div class="rtw"><div class="rrow rhd"><div>פריט</div><div>הערה</div><div>שלב וזמן בגאנט</div><div>מצב</div><div>בוצע</div></div>';
    h+=list.map(function(it){
      var late=respLate(p,it),stg=[it.stage,it.week?'שבוע '+it.week:''].filter(Boolean).join(' · ');
      return '<div class="rrow">'+(edit?'<button class="rmain" data-act="edit" data-e="resp" data-id="'+esc(it.id)+'">':'<div class="rmain">')+'<b>'+esc(it.item)+'</b>'+(it.urgent?'<em class="urg">מיידי</em>':'')+(it.reply?'<span class="muted rrep">תשובה: '+esc(it.reply)+'</span>':'')+(edit?'</button>':'</div>')+
        '<div class="muted">'+esc(it.note||'')+'</div><div>'+esc(stg)+'</div><div>'+(it.done?chip('ok','בוצע'):late?chip('warn','באיחור'):chip('neutral','פתוח'))+'</div>'+
        '<div>'+(edit?'<label class="chk" style="margin:0"><input type="checkbox" data-respdone="'+esc(it.id)+'"'+(it.done?' checked':'')+'> בוצע</label>':(it.done?'✓':''))+'</div></div>';
    }).join('');
    if(edit)h+='<button class="link rsadd" data-act="add" data-e="resp" data-grp="'+g[0]+'" data-project="'+esc(p.id)+'">+ פריט חדש</button>';
    h+='</div></section>';
  });
  return h||emptyBox('עוד אין פריטי אחריות.');
}
/* project tab */
function schedTabHtml(p){
  var h='';
  if(!hasSched(p)){
    h+='<div class="sec" style="margin-top:12px"><h2>גאנט</h2></div>';
    h+='<div class="card"><b>גאנט שבועי בפורמט של עמית</b><p class="muted" style="margin:6px 0 12px">עמודה לכל שבוע, יעד אחוזים לסוף כל שבוע, חלק ללקוח ולאדריכלית, ורשימת אחריות, אספקות והזמנות.</p>'+
      '<div class="grid2"><button class="btn btn-accent" data-act="snew" data-tpl="0">גאנט חדש</button><button class="btn btn-navy" data-act="snew" data-tpl="1">מתבנית (שמריהו נורדאו)</button></div></div>';
    if(gItems(p).length)h+='<div style="margin-top:18px">'+ganttHtml(p)+'</div>';
    return h;
  }
  var sm=sSummary(p);
  h+='<div class="sec" style="margin-top:12px"><h2>גאנט</h2><button class="btn btn-accent" data-act="sopen">'+ico('gantt',20)+'מסך מלא</button></div>';
  if(sm)h+='<div class="card" style="margin-bottom:10px"><div class="row1"><b>שבוע '+sm.cw+' מתוך '+sm.weeks+'</b>'+(sm.late?chip('warn','מפגר'):chip('ok','בזמן'))+'</div>'+sLineHtml(sm)+
    (sm.now.length?'<div style="margin-top:6px">עכשיו: '+esc(sm.now.slice(0,4).join(', '))+'</div>':'')+(sm.block.length?'<div class="blk">מעכב: '+esc(sm.block.slice(0,4).join(', '))+'</div>':'')+'</div>';
  h+='<div class="sgwrap">'+sGrid(p,{compact:true,edit:true})+'</div>';
  var openResp=sResp(p).filter(function(it){return !it.done;}).length;
  h+='<button class="card" style="margin-top:10px;width:100%;text-align:start;display:flex;justify-content:space-between;align-items:center;cursor:pointer" data-act="sopen" data-st="resp"><span><b>אחריות, אספקות והזמנות</b><br><span class="muted">'+openResp+' פריטים פתוחים</span></span><span class="link">פתח</span></button>';
  if(gItems(p).length)h+='<details style="margin-top:14px"><summary class="link">לוח הזמנים הישן</summary>'+ganttHtml(p)+'</details>';
  return h;
}
/* full screen */
function vSched(){
  var p=byId('projects',UI.projectId);if(!p){UI.view='projects';return vProjects();}
  var tab=UI.schedTab||'time',sm=sSummary(p);
  var h='<div class="sfull"><header class="shead noprint"><div class="shead-in"><button class="backlink" data-act="sback">'+ico('back',20)+'חזרה לפרויקט</button>'+
    '<div class="stitle"><span class="muted2">פרויקט</span><b>'+esc(p.name)+'</b></div>'+
    '<nav class="stabs" aria-label="תצוגות גאנט">'+[['time','לוח זמנים'],['week','פירוט שבועי'],['resp','אחריות ואספקות']].map(function(t){return '<button data-act="stab" data-v="'+t[0]+'" aria-pressed="'+(tab===t[0])+'">'+t[1]+'</button>';}).join('')+'</nav>'+
    '<div class="sbtns">'+(tab==='resp'?'<button class="btn btn-line" data-act="add" data-e="resp" data-project="'+esc(p.id)+'">+ פריט</button>':'<button class="btn btn-line" data-act="sedit">+ שורה</button>')+'<button class="btn btn-line" data-act="sset">הגדרות</button><button class="btn btn-accent" data-act="sprint">הדפס / PDF</button></div></div></header>';
  h+='<main class="swrap noprint"><div class="sinfo"><div><h1>לוח זמנים – '+esc(p.name)+'</h1><div class="muted">'+sWeeks(p)+' שבועות · שבוע 1: '+bd(sWeekLabel(p,1))+(p.sched_goal?' · יעד: '+esc(p.sched_goal):'')+'</div></div>'+
    (sm?'<div class="schips">'+chip('neutral','היום: שבוע '+sm.cw+' מתוך '+sm.weeks)+(sm.block.length?chip('warn',sm.block.length+' מעכבים'):chip('ok','הכול בזמן'))+'</div>':'')+'</div>';
  if(tab==='time')h+='<div class="sgwrap big">'+sGrid(p,{edit:true})+'</div>';
  else if(tab==='week')h+='<div class="sgwrap big">'+sWeeklyHtml(p)+'</div>';
  else h+=sRespHtml(p,true);
  h+='</main>';
  h+='<div class="sprint">'+sPrintHtml(p)+'</div></div>';
  return h;
}
function sPrintHtml(p){
  var head=function(t,sub){return '<div class="sph"><div><div class="spt">'+esc(t)+'</div><div class="sps">'+esc(sub)+'</div></div><img src="icons/logo.png" alt=""></div>';};
  var sub=sWeeks(p)+' שבועות · שבוע 1: \u2066'+sWeekLabel(p,1)+'\u2069'+(p.sched_goal?' · יעד: '+p.sched_goal:'');
  return '<section class="spage land">'+head('לוח זמנים – '+p.name,sub)+sGrid(p,{})+'</section>'+
    '<section class="spage land">'+head('פירוט שבועי ותיאומים',p.name+' · יעדי סוף שבוע (% מצטבר)')+sWeeklyHtml(p)+'</section>'+
    (sResp(p).length?'<section class="spage">'+head('נספח – אחריות, אספקות והזמנות',p.name+' · בהתאמה ללוח הזמנים')+sRespHtml(p,false)+'</section>':'');
}
/* settings sheet: start date, weeks, goal (also used to create from template) */
function sSetOpen(tpl){
  var p=byId('projects',UI.projectId);if(!p)return;
  form={e:'_sset',id:p.id,tpl:tpl};
  var html='<div class="scrim" data-act="closeSheet"></div><form class="sheet" id="ssf" role="dialog" aria-modal="true" aria-labelledby="ss_h" novalidate onsubmit="return false"><h2 id="ss_h" tabindex="-1">'+(tpl===1?'גאנט מתבנית':tpl===0?'גאנט חדש':'הגדרות הגאנט')+'</h2>'+
    '<div class="fld"><label for="ss_s">תאריך התחלה (שבוע 1)</label><input id="ss_s" type="date" value="'+esc(p.sched_start||todayStr())+'"></div>'+
    '<div class="fld"><label for="ss_w">מספר שבועות</label><input id="ss_w" type="number" inputmode="numeric" min="1" max="30" value="'+esc(p.sched_weeks||5)+'"></div>'+
    '<div class="fld"><label for="ss_g">יעד (למשל: מסירת מפתח בתום שבוע 5)</label><input id="ss_g" type="text" value="'+esc(p.sched_goal||'מסירת מפתח בתום שבוע '+(p.sched_weeks||5))+'"></div>'+
    (tpl===1?'<p class="muted">ייווצרו כל השורות, הפריטים באחריות הלקוח והאדריכלית והאספקות – כמו בגאנט של שמריהו נורדאו. אחר כך אפשר לערוך הכול.</p>':'')+
    '<p class="ferr" id="ferr" role="alert"></p><div class="fbtns"><button class="btn btn-accent" type="button" data-act="ssave">שמור</button><button class="btn btn-line" type="button" data-act="closeSheet">ביטול</button></div></form>';
  $('#layer').innerHTML=html;pushOverlay('sheet');
}
async function sSetSave(){
  if(!form||form.e!=='_sset'||form.busy)return;
  var st=$('#ss_s').value,wk=parseInt($('#ss_w').value,10)||5,goal=$('#ss_g').value.trim();
  if(!st){ferr('בחר תאריך התחלה.');return;}
  form.busy=true;var tpl=form.tpl,pid=form.id;
  var r=await saveRow('projects',{sched_start:st,sched_weeks:Math.max(1,Math.min(30,wk)),sched_goal:goal||null},pid);
  if(r.error){form.busy=false;ferr('לא נשמר. ודא שהרצת את עדכון ה-SQL של גרסה 52.');return;}
  if(tpl===1){try{await sTemplate(pid);}catch(e){}}
  await Promise.all([loadTable('projects'),loadTable('sched_rows'),loadTable('resp_items')]);
  closeSheet();if(tpl===0||tpl===1){UI.view='sched';UI.schedTab='time';window.scrollTo(0,0);render();}
}
var STPL={rows:[
 ['contractor','גבס',{1:70,2:100}],['contractor','ריצוף חדרים רטובים',{1:100}],['contractor','חיפוי קירות חדרים רטובים',{2:100}],['contractor','ריצוף מדרגות',{2:100}],
 ['contractor','שפכטל קומה שנייה',{2:100}],['contractor','שפכטל קומה ראשונה',{3:100}],['contractor','שיופים + צבע יד ראשונה קומה 2',{3:100}],['contractor','שיופים + צבע יד ראשונה קומה 1',{4:100}],
 ['contractor','הרכבת לוחות חשמל',{3:100}],['contractor','התקנת כלים סניטריים, חשמל לבן (שקעים ומפסקים) ורובה',{3:100}],['contractor','התקנת גופי תאורה קומה 2',{3:100}],['contractor','התקנת גופי תאורה קומה 1',{4:100}],
 ['contractor','תיקוני שפכטל + צבע שכבה אחרונה',{5:null}],['contractor','גמרים ומסירת מפתח',{5:null},{milestone:true}],
 ['client','התקנת יחידות מזגנים ומפוחים (לגבס)',{1:null},{urgent:true}],['client','תוכנית פרט גבס בסלון + סגירת תוכנית תאורה',{1:null},{urgent:true}],['client','פריסות ריצוף וחיפוי חדרים רטובים',{1:null},{urgent:true}],
 ['client','בחירת צבע',{2:null}],['client','בחירת רובה',{3:null}],['client','מדידות מטבחים',{1:null},{urgent:true}],['client','מדידות אלומיניום',{1:null},{urgent:true}],
 ['client','התקנת דלתות פנים וחוץ',{4:null}],['client','התקנת מזגנים עיליים – אחרי סיום שיוף וצבע',{4:null}],['client','התקנת אלומיניום',{4:null}]],
 resp:[
 ['client','מדידת מטבחים','','',1,1],['client','מדידות אלומיניום','','',1,1],['client','התקנת יחידות מזגנים','','גבס',1,1],['client','אלומיניום','לפני סיום צבע','התקנה',4,0],
 ['client','סורגים','','',0,0],['client','מחמם גז','','',0,0],['client','דוד שמש','במידה וצריך','',0,0],['client','תקשורת ורשת','','',0,0],['client','דלתות פנים','','התקנה',4,0],['client','דלתות חוץ','','התקנה',4,0],
 ['client','התקנת מזגנים עיליים','אחרי סיום שיוף וצבע','',0,0],['client','הספקת תעלות ניקוז','במידת הצורך','ריצוף חדרים רטובים',1,0],
 ['client_supply','שיש מדרגות','','ריצוף מדרגות',2,1],['client_supply','הספקת אביק אוטומטי','','ריצוף חדרים רטובים',1,0],['client_supply','פרופילי תאורה','','גבס',1,1],['client_supply','פרופילי ריכוך','','גבס',1,1],
 ['client_supply','פרופילי ניתוק STR','','גבס',1,1],['client_supply','סניטריים','לוודא שיש הכול','התקנת כלים סניטריים',3,0],['client_supply','גופי תאורה','','התקנת גופי תאורה',3,0],
 ['architect','בחירת רובה','','',3,0],['architect','בחירת צבע','','שפכטל וצבע',2,0],['architect','תוכנית פרט לקיר גבס בסלון','','גבס',1,1],['architect','פריסות ריצוף וחיפוי חדרים רטובים','','ריצוף חדרים רטובים',1,1],
 ['architect','סגירת תוכנית תאורה','תוכנית סופית','גבס',1,1],['architect','פריסות ריצוף מרפסות','','',0,1],
 ['office','הזמנת ואספקת מפוחים','','גבס',1,1],['office','הזמנת ואספקת פתחי שירות','כמות, מידות ומיקומים לבירור','גבס',1,0]]};
async function sTemplate(pid){
  var rows=STPL.rows.map(function(r,i){var o={project_id:pid,section:r[0],title:r[1],targets:r[2],sort:i};if(r[3])Object.assign(o,r[3]);return o;});
  var resp=STPL.resp.map(function(r,i){return {project_id:pid,grp:r[0],item:r[1],note:r[2]||null,stage:r[3]||null,week:r[4]||null,urgent:!!r[5],sort:i};});
  await sb.from('sched_rows').insert(rows);await sb.from('resp_items').insert(resp);
}
/* row editor */
function sEditOpen(id){
  var p=byId('projects',UI.projectId);if(!p)return;
  var r=id?byId('sched_rows',id):null,W=sWeeks(p),t=r?sTargets(r):{};
  form={e:'_srow',id:id||null,pid:p.id,confirmDel:false};
  var wk='';for(var w=1;w<=W;w++){var has=Object.prototype.hasOwnProperty.call(t,String(w));wk+='<label class="swin"><span>ש׳'+w+'</span><input data-sw="'+w+'" inputmode="numeric" placeholder="—" value="'+(has?(t[w]==null?'•':esc(t[w])):'')+'" aria-label="יעד שבוע '+w+'"></label>';}
  var html='<div class="scrim" data-act="closeSheet"></div><form class="sheet" id="srf" role="dialog" aria-modal="true" aria-labelledby="sr_h" novalidate onsubmit="return false"><h2 id="sr_h" tabindex="-1">'+(r?'עריכת שורה':'שורה חדשה')+'</h2>'+
    '<div class="fld"><label for="sr_t">שם *</label><input id="sr_t" value="'+esc(r?r.title:'')+'" autocomplete="off"></div>'+
    '<div class="grid2"><div class="fld"><label for="sr_s">חלק</label><select id="sr_s"><option value="contractor"'+(!r||r.section!=='client'?' selected':'')+'>עבודות קבלן</option><option value="client"'+(r&&r.section==='client'?' selected':'')+'>לקוח / אדריכלית / מפקח</option></select></div>'+
    '<div class="fld"><label for="sr_a">אחראי</label><select id="sr_a">'+assigneeOptions(r?r.assignee_id:'')+'</select></div></div>'+
    '<fieldset class="fld" style="border:0;padding:0;margin:0 0 12px"><legend style="font-weight:700;font-size:15px;margin-bottom:6px">יעד בסוף כל שבוע (%). השאר ריק לשבוע בלי פס, • לפס בלי אחוז</legend><div class="swins">'+wk+'</div></fieldset>'+
    '<div class="sact"><div class="row1"><b>ביצוע בפועל</b><b id="sr_av">'+(r?(+r.actual||0):0)+'%</b></div><input id="sr_act" type="range" min="0" max="100" step="5" value="'+(r?(+r.actual||0):0)+'" aria-label="ביצוע בפועל"></div>'+
    '<div class="sopts"><label class="chk"><input type="checkbox" id="sr_d"'+(r&&r.done?' checked':'')+'> בוצע (לשורת לקוח)</label><label class="chk"><input type="checkbox" id="sr_u"'+(r&&r.urgent?' checked':'')+'> מיידי</label><label class="chk"><input type="checkbox" id="sr_m"'+(r&&r.milestone?' checked':'')+'> אבן דרך ★</label></div>'+
    '<div class="fld"><label for="sr_n">הערה</label><input id="sr_n" value="'+esc(r&&r.note||'')+'"></div>'+
    '<p class="ferr" id="ferr" role="alert"></p><div class="fbtns"><button class="btn btn-accent" type="button" data-act="ssrow">שמור</button><button class="btn btn-line" type="button" data-act="closeSheet">ביטול</button></div>'+
    (r?'<div class="fbtns" style="margin-top:12px"><button class="btn btn-danger" type="button" id="fdel" data-act="sdelrow">מחק שורה</button></div>':'')+'</form>';
  $('#layer').innerHTML=html;pushOverlay('sheet');
  var rg=$('#sr_act');if(rg)rg.addEventListener('input',function(){var o=$('#sr_av');if(o)o.textContent=rg.value+'%';});
}
async function sRowSave(){
  if(!form||form.e!=='_srow'||form.busy)return;
  var title=$('#sr_t').value.trim();if(!title){ferr('חסר שם.');return;}
  var targets={};[].slice.call(document.querySelectorAll('[data-sw]')).forEach(function(i){var v=i.value.trim();if(!v)return;var n=parseInt(v,10);targets[i.getAttribute('data-sw')]=isNaN(n)?null:Math.max(0,Math.min(100,n));});
  var row={project_id:form.pid,title:title,section:$('#sr_s').value,assignee_id:$('#sr_a').value||null,targets:targets,actual:parseInt($('#sr_act').value,10)||0,done:$('#sr_d').checked,urgent:$('#sr_u').checked,milestone:$('#sr_m').checked,note:$('#sr_n').value.trim()||null,updated_at:new Date().toISOString()};
  if(!form.id)row.sort=S.sched_rows.filter(function(x){return x.projectId===form.pid;}).length;
  form.busy=true;var r=await saveRow('sched_rows',row,form.id);
  if(r.error){form.busy=false;ferr('לא נשמר. ודא שהרצת את עדכון ה-SQL של גרסה 52.');return;}
  await loadTable('sched_rows');closeSheet();
}
async function sRowDel(){
  if(!form||!form.id)return;var b=$('#fdel');
  if(!form.confirmDel){form.confirmDel=true;if(b)b.textContent='לחץ שוב למחיקה';return;}
  await sb.from('sched_rows').delete().eq('id',form.id);await loadTable('sched_rows');closeSheet();
}
async function respToggle(id,on){
  var r=await sb.from('resp_items').update({done:on,done_at:on?new Date().toISOString():null}).eq('id',id);
  if(r.error)toast('לא נשמר.');await loadTable('resp_items');
}
/* send open items to the client / architect on WhatsApp (opens WhatsApp with the text ready) */
function respSend(grp){
  var p=byId('projects',UI.projectId);if(!p)return;
  var list=sResp(p).filter(function(it){return !it.done&&(grp==='architect'?it.grp==='architect':(it.grp==='client'||it.grp==='client_supply'));});
  if(!list.length){toast('אין פריטים פתוחים.');return;}
  var txt='שלום, עדכון מפדר בניה לגבי '+p.name+'.\nאלה הדברים שמחכים לטיפולכם לפי לוח הזמנים:\n'+list.map(function(it,i){return (i+1)+'. '+it.item+(it.urgent?' (מיידי)':'')+(it.week?' – עד שבוע '+it.week:'')+(it.note?' – '+it.note:'');}).join('\n')+'\nתודה!';
  var ph=grp==='architect'?'':(p.clientPhone||'');
  var url='https://wa.me/'+(ph?waNum(ph):'')+'?text='+encodeURIComponent(txt);
  window.open(url,'_blank');
}

/* ---------- CEO dashboard (role: ceo) ---------- */
function isCeo(){return AUTH.role==='ceo';}
function ceoProj(p){
  if(hasSched(p)){var sm=sSummary(p);if(sm)return {p:p,prog:sm.act,exp:sm.exp,cur:sm.now.slice(0,2).join(', '),next:sm.next[0]||'',late:sm.late,block:sm.block.length?'מעכב: '+sm.block.slice(0,2).join(', '):''};}
  var td=todayStr(),items=S.gantt_items.filter(function(g){return g.projectId===p.id;}).sort(function(a,b){return String(a.start_date).localeCompare(String(b.start_date));});
  var tasks=S.tasks.filter(function(t){return t.projectId===p.id;});
  var prog=0,cur=null,next=null,late=[];
  if(items.length){
    var w=0,sum=0;items.forEach(function(g){var d=Math.max(1,(Date.parse(g.end_date)-Date.parse(g.start_date))/864e5+1);w+=d;sum+=d*Math.min(100,Math.max(0,+g.pct||0));});
    prog=w?sum/w:0;
    var now=items.filter(function(g){return g.start_date<=td&&g.end_date>=td;});
    cur=now.filter(function(g){return (+g.pct||0)<100;})[0]||now[0]||null;
    next=items.filter(function(g){return g.start_date>td;})[0]||null;
    late=items.filter(function(g){return g.end_date<td&&(+g.pct||0)<100;});
  }else if(tasks.length){prog=100*tasks.filter(function(t){return t.status==='הושלם';}).length/tasks.length;}
  var overdue=tasks.filter(function(t){return t.status!=='הושלם'&&t.due&&t.due<td;});
  var waiting=tasks.filter(function(t){return t.status==='ממתין להחלטה';});
  var block='';
  if(late.length)block='מעכב: '+late[0].title;else if(overdue.length)block='מעכב: '+overdue[0].title;else if(waiting.length)block='מחכה להחלטה: '+waiting[0].title;
  return {p:p,prog:Math.round(prog),cur:cur?cur.title:(late.length?late[0].title:''),next:next?next.title:'',late:!!(late.length||overdue.length),block:block};
}
function vCeo(){
  var first=(AUTH.name||'').split(' ')[0],d=new Date();
  var dstr='היום '+d.toLocaleDateString('he-IL',{weekday:'long'})+', '+d.getDate()+'.'+(d.getMonth()+1);
  var h='<div class="ceo"><header class="ceo-band"><div class="wrap">'+
    '<div class="ceo-top">'+(isAdmin()&&!isCeo()?'<span class="ceo-pill">תצוגה של המנכ״ל</span>':'<span></span>')+'<button class="ceo-pill ceo-applink" data-act="nav" data-v="home">לאפליקציה '+ico('back',16)+'</button></div>'+
    '<h1>שלום'+(first?' '+esc(isCeo()?first:'אבי'):'')+'</h1><p>'+esc(dstr)+'</p>'+
    '<button class="ceo-add" data-act="ceoadd">'+ico('plus',22)+'הוסף משימה</button></div></header><main class="wrap">';
  var need=S.tasks.filter(function(t){return t.status==='ממתין להחלטה';}).slice(0,4);
  if(need.length){
    h+='<h2 class="ceo-h">צריך אותך</h2><div class="stack">'+need.map(function(t){
      return '<div class="ceo-need"><div><b>'+esc(t.title)+'</b><span>'+esc(pname(t.projectId))+(t.notes?' · '+esc(String(t.notes).slice(0,60)):'')+'</span></div><button class="btn" data-act="ceoopen" data-id="'+esc(t.id)+'">צפה</button></div>';}).join('')+'</div>';
  }
  var act=S.projects.filter(function(p){return p.status!=='הסתיים'&&p.status!=='סיום';}).map(ceoProj).sort(function(a,b){return (b.late?1:0)-(a.late?1:0);});
  h+='<h2 class="ceo-h">הפרויקטים</h2>';
  h+=act.length?'<div class="stack">'+act.map(function(x){
    return '<button class="ceo-proj" data-act="project" data-id="'+esc(x.p.id)+'"><div class="ceo-row"><b>'+esc(x.p.name)+'</b>'+(x.late?chip('warn','באיחור'):chip('ok','בזמן'))+'</div>'+
      '<div class="ceo-bar" role="img" aria-label="התקדמות"><i class="'+(x.late?'late':'')+'" style="width:'+Math.max(3,x.prog)+'%"></i>'+(x.exp!=null?'<b style="inset-inline-start:'+Math.min(99,x.exp)+'%"></b>':'')+'</div>'+
      '<div class="ceo-sub">'+(x.cur?'<span>עכשיו: '+esc(x.cur)+'</span>':'')+(x.block?'<span class="blk">'+esc(x.block)+'</span>':(x.next?'<span class="muted">הבא: '+esc(x.next)+'</span>':''))+'</div></button>';}).join('')+'</div>':emptyBox('אין פרויקטים פעילים.');
  var feed=S.docs.filter(function(x){return x.photo;}).sort(function(a,b){return (b.createdAt||0)-(a.createdAt||0);}).slice(0,4);
  if(feed.length){
    h+='<h2 class="ceo-h">מהשטח</h2><div class="stack">'+feed.map(function(x){
      return '<button class="ceo-feed" data-act="photo" data-id="'+esc(x.photo)+'"><span class="ceo-th">'+mediaTag(x.photo)+'</span><span><b>'+esc(x.note||x.stage||'תיעוד')+'</b><span class="muted">'+esc(pname(x.projectId))+(x.date?' · '+esc(fdate(x.date)):'')+'</span></span></button>';}).join('')+'</div>';
  }
  h+='<button class="ceo-full" data-act="nav" data-v="home">כניסה לאפליקציה המלאה '+ico('back',18)+'</button></main></div>';
  return h;
}
/* "needs you": Avi writes (or dictates) what he decided */
function ceoDecide(id){
  var t=byId('tasks',id);if(!t)return;
  form={e:'_dec',tid:id};
  var html='<div class="scrim" data-act="closeSheet"></div><form class="sheet ceo-sheet" role="dialog" aria-modal="true" aria-labelledby="dc_h" novalidate onsubmit="return false"><h2 id="dc_h">'+esc(t.title)+'</h2>'+
    '<div class="muted">'+esc(pname(t.projectId))+(t.notes?' · '+esc(t.notes):'')+'</div>'+(t.photo?'<div class="phprev" style="margin-top:10px">'+mediaTag(t.photo,true)+'</div>':'')+
    '<label for="dc_t" class="ceo-lbl">מה החלטת?</label><div class="ceo-inrow"><textarea id="dc_t" rows="3" style="flex:1" placeholder="למשל: אריחים לבנים 60×60, להזמין מקרמיקה X"></textarea>'+
    (speechOK()?'<button type="button" class="ceo-mic" data-act="dcmic" aria-label="הכתבה בקול">'+micIco()+'</button>':'')+'</div>'+
    '<p class="ferr" id="ferr" role="alert"></p><button type="button" class="ceo-save" data-act="ceodec">שלח החלטה</button>'+
    '<button type="button" class="link" style="margin-top:10px" data-act="ceotask">פתח את המשימה המלאה</button></form>';
  $('#layer').innerHTML=html;pushOverlay('sheet');
}
function dcMic(){var R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return;var r=new R();r.lang='he-IL';r.interimResults=true;var b=$('[data-act="dcmic"]');if(b)b.classList.add('on');
  r.onresult=function(ev){var x='';for(var i=0;i<ev.results.length;i++)x+=ev.results[i][0].transcript;var ta=$('#dc_t');if(ta)ta.value=x;};
  r.onend=function(){var b2=$('[data-act="dcmic"]');if(b2)b2.classList.remove('on');};try{r.start();}catch(e){}}
async function ceoDecideSave(){
  if(!form||form.e!=='_dec'||form.busy)return;var t=byId('tasks',form.tid),txt=($('#dc_t')||{}).value||'';txt=txt.trim();
  if(!t)return;if(!txt){ferr('כתוב או אמור מה החלטת.');return;}
  form.busy=true;var who=(AUTH.name||'').split(' ')[0]||'המנכ״ל';
  var notes=(t.notes?t.notes+'\n':'')+'החלטת '+who+': '+txt;
  var r=await sb.from('tasks').update({status:'לביצוע',notes:notes}).eq('id',t.id);
  if(r.error){form.busy=false;ferr('לא נשמר. נסה שוב.');return;}
  var users=tAsg(t).map(function(i){var m=byId('team_members',i);return m&&m.user_id;}).filter(Boolean);
  S.profiles.forEach(function(u){if((u.role==='admin')&&users.indexOf(u.id)<0)users.push(u.id);});
  for(var i=0;i<users.length;i++){if(users[i]===AUTH.uid)continue;try{await sb.from('reminders').insert({user_id:users[i],ref:'task:'+t.id+':dec'+Date.now()+i,title:'החלטה: '+t.title,body:txt+' · '+pname(t.projectId),remind_at:new Date().toISOString()});}catch(e){}}
  translateRow('tasks',t.id);await loadTable('tasks');closeSheet();toast('ההחלטה נשלחה ✓');
}
/* quick add: voice -> text -> Claude fills project / person / date */
var CQ=null;
function ceoQuickOpen(){CQ={text:'',projectId:'',assigneeId:'',due:'tomorrow',date:'',busy:false,listen:false,parsing:false,msg:''};ceoQuickDraw(true);}
function ceoQuickDraw(first){
  if(!CQ)return;var inp=$('#cq_t');if(inp)CQ.text=inp.value;
  var chipB=function(act,val,label,on){return '<button type="button" class="ceo-chip" data-act="'+act+'" data-v="'+esc(val)+'" aria-pressed="'+(!!on)+'">'+esc(label)+'</button>';};
  var projs=S.projects.filter(function(p){return p.status!=='הסתיים'&&p.status!=='סיום';});
  var mem=S.team_members.slice();var me=myMember();
  var html='<div class="scrim" data-act="ceoclose"></div><form class="sheet ceo-sheet" id="cqf" role="dialog" aria-modal="true" aria-labelledby="cq_h" novalidate onsubmit="return false"><h2 id="cq_h">משימה חדשה</h2>'+
    '<label for="cq_t" class="ceo-lbl">מה צריך לעשות?</label><div class="ceo-inrow"><input id="cq_t" type="text" autocomplete="off" placeholder="אפשר גם להגיד בקול: לתאם חשמלאי בכהן למחר" value="'+esc(CQ.text)+'">'+
    (speechOK()?'<button type="button" class="ceo-mic'+(CQ.listen?' on':'')+'" data-act="cqmic" aria-label="'+(CQ.listen?'עצור הקלטה':'הכתבה בקול')+'">'+micIco()+'</button>':'')+'</div>'+
    '<div class="ceo-msg" aria-live="polite">'+(CQ.listen?'מקשיב… דבר עכשיו':CQ.parsing?'מבין מה אמרת…':esc(CQ.msg))+'</div>'+
    (CQ.text&&!CQ.listen&&!CQ.parsing?'<button type="button" class="link" data-act="cqparse" style="align-self:flex-start;margin:-6px 0 4px">מלא את הפרטים לפי הטקסט</button>':'')+
    '<div class="ceo-lbl">באיזה פרויקט?</div><div class="ceo-chips">'+projs.map(function(p){return chipB('cqproj',p.id,p.name,CQ.projectId===p.id);}).join('')+'</div>'+
    '<div class="ceo-lbl">למי?</div><div class="ceo-chips">'+mem.map(function(m){return chipB('cqwho',m.id,(me&&me.id===m.id)?'לעצמי':m.name,CQ.assigneeId===m.id);}).join('')+'</div>'+
    '<div class="ceo-lbl">עד מתי?</div><div class="ceo-chips">'+chipB('cqdue','today','היום',CQ.due==='today')+chipB('cqdue','tomorrow','מחר',CQ.due==='tomorrow')+chipB('cqdue','date','תאריך…',CQ.due==='date')+chipB('cqdue','none','בלי תאריך',CQ.due==='none')+'</div>'+
    (CQ.due==='date'?'<input type="date" id="cq_d" class="ceo-date" value="'+esc(CQ.date)+'" aria-label="תאריך">':'')+
    '<div id="ferr" class="ferr" role="alert"></div>'+
    '<button type="button" class="ceo-save" data-act="cqsave"'+(CQ.busy?' disabled':'')+'>'+(CQ.busy?'שומר…':'שמור ושלח')+'</button></form>';
  $('#layer').innerHTML=html;if(first)pushOverlay('sheet');
  var i2=$('#cq_t');if(i2){i2.addEventListener('input',function(){CQ.text=i2.value;});if(first)setTimeout(function(){i2.focus();},50);}
  var dd=$('#cq_d');if(dd)dd.addEventListener('change',function(){CQ.date=dd.value;});
}
function micIco(){return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';}
function speechOK(){return !!(window.SpeechRecognition||window.webkitSpeechRecognition);}
var CQREC=null;
function ceoMic(){
  if(!CQ)return;
  if(CQ.listen&&CQREC){try{CQREC.stop();}catch(e){}return;}
  var R=window.SpeechRecognition||window.webkitSpeechRecognition;if(!R)return;
  var r=new R();CQREC=r;r.lang='he-IL';r.interimResults=true;r.continuous=false;
  var finalT='';
  r.onresult=function(ev){var s='';for(var i=0;i<ev.results.length;i++){s+=ev.results[i][0].transcript;}finalT=s;var el=$('#cq_t');if(el)el.value=s;CQ.text=s;};
  r.onerror=function(ev){CQ.listen=false;CQ.msg=ev.error==='not-allowed'?'צריך לאשר גישה למיקרופון בהגדרות.':'לא שמעתי טוב, נסה שוב.';ceoQuickDraw();};
  r.onend=function(){CQ.listen=false;CQREC=null;if(finalT){CQ.text=finalT;ceoParse();}else ceoQuickDraw();};
  CQ.listen=true;CQ.msg='';ceoQuickDraw();
  try{r.start();}catch(e){CQ.listen=false;ceoQuickDraw();}
}
var PARSE_URL=SUPABASE_URL+'/functions/v1/parse-task';
async function ceoParse(){
  if(!CQ||!CQ.text)return;CQ.parsing=true;CQ.msg='';ceoQuickDraw();
  try{
    var s=await sb.auth.getSession();var tok=s&&s.data&&s.data.session&&s.data.session.access_token;
    var me=myMember();
    var body={text:CQ.text,today:todayStr(),
      projects:S.projects.filter(function(p){return p.status!=='הסתיים'&&p.status!=='סיום';}).map(function(p){return {id:p.id,name:p.name};}),
      team:S.team_members.map(function(m){return {id:m.id,name:m.name,me:!!(me&&me.id===m.id)};})};
    var res=await fetch(PARSE_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+tok,'apikey':SUPABASE_KEY},body:JSON.stringify(body)});
    if(!res.ok)throw new Error(res.status===404?'nofn':'http');
    var j=await res.json();if(!CQ)return;
    if(j.title)CQ.text=j.title;
    if(j.projectId&&byId('projects',j.projectId))CQ.projectId=j.projectId;
    if(j.assigneeId&&byId('team_members',j.assigneeId))CQ.assigneeId=j.assigneeId;
    if(j.due){var td=todayStr(),tm=ymd(new Date(Date.now()+864e5));if(j.due===td)CQ.due='today';else if(j.due===tm)CQ.due='tomorrow';else{CQ.due='date';CQ.date=j.due;}}
    CQ.msg='מילאתי לפי מה שאמרת. בדוק ולחץ שמור.';
  }catch(e){if(CQ)CQ.msg=(e&&(e.message==='nofn'||e.name==='TypeError'))?'הזיהוי האוטומטי עוד לא הופעל. בחר את הפרטים בלחיצות.':'לא הצלחתי לזהות אוטומטית. בחר את הפרטים בלחיצות.';}
  if(CQ){CQ.parsing=false;ceoQuickDraw();}
}
async function ceoQuickSave(){
  if(!CQ||CQ.busy)return;var t=($('#cq_t')||{}).value||CQ.text;t=String(t||'').trim();
  if(!t){ferr('כתוב או אמור מה צריך לעשות.');return;}
  if(!CQ.projectId){ferr('בחר פרויקט.');return;}
  var due=CQ.due==='today'?todayStr():CQ.due==='tomorrow'?ymd(new Date(Date.now()+864e5)):CQ.due==='date'?(($('#cq_d')||{}).value||CQ.date||null):null;
  CQ.busy=true;ceoQuickDraw();
  var id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():null;
  var data={title:t,projectId:CQ.projectId,assigneeId:CQ.assigneeId||null,assignee_ids:CQ.assigneeId?[CQ.assigneeId]:[],due:due,status:'לביצוע',area:'כללי',kind:'משימה'};
  if(id)data.id=id;
  try{
    var r=await saveRow('tasks',toRow(data));if(r.error)throw r.error;
    var tid=id;
    var asg=CQ.assigneeId?byId('team_members',CQ.assigneeId):null;
    if(asg){
      if(asg.user_id&&asg.user_id!==AUTH.uid){
        var wprof=S.profiles.filter(function(u){return u.id===asg.user_id;})[0],isW=wprof&&wprof.role==='worker';
        try{await sb.from('reminders').insert({user_id:asg.user_id,ref:'assign:'+tid+':'+Date.now(),title:isW?'مهمة جديدة لك':'משימה חדשה בשבילך',body:t+' · '+pname(CQ.projectId),remind_at:new Date().toISOString()});}catch(e3){}
        if(isW&&tid)translateRow('tasks',tid);
      }else if(!asg.user_id){setTimeout(function(){toast(asg.name+' עוד לא מחובר/ת למשתמש, לא תישלח התראה.');},400);}
    }
    await loadTable('tasks');
    CQ=null;closeSheet();toast('המשימה נשמרה ✓');
  }catch(e){CQ.busy=false;ceoQuickDraw();ferr('לא נשמר: '+(e&&e.message||'שגיאה'));}
}
/* ---------- events ---------- */
document.addEventListener('click',function(ev){
  var el=ev.target.closest('[data-act]');if(!el)return;
  var a=el.getAttribute('data-act'),id=el.getAttribute('data-id');
  if(a==='tasksby'){UI.taskFilter=el.getAttribute('data-v');UI.view='tasks';window.scrollTo(0,0);render();}
  else if(a==='nav'){UI.view=el.getAttribute('data-v');window.scrollTo(0,0);render();}
  else if(a==='project'){UI.projDone=false;UI.projectId=id;UI.view='project';UI.tab='tasks';window.scrollTo(0,0);render();}
  else if(a==='cmonth'){var cm=UI.calMonth||new Date();UI.calMonth=new Date(cm.getFullYear(),cm.getMonth()+(+el.getAttribute('data-v')),1);render();}
  else if(a==='cday'){UI.calSel=el.getAttribute('data-v');render();}
  else if(a==='ctoday'){var n=new Date();UI.calMonth=new Date(n.getFullYear(),n.getMonth(),1);UI.calSel=todayStr();render();}
  else if(a==='back'){UI.view=UI.view==='users'?'home':(UI.view==='report'?(UI.reportProject?'project':'projects'):'projects');window.scrollTo(0,0);render();}
  else if(a==='tab'){UI.tab=el.getAttribute('data-t');UI.gScroll=null;render();}
  else if(a==='tfilter'){UI.taskFilter=el.getAttribute('data-v');render();}
  else if(a==='sfield'){UI.supField=el.getAttribute('data-v');render();}
  else if(a==='cproj'){UI.clientProject=id;render();}
  else if(a==='add'){
    var d={};var pj=el.getAttribute('data-project');if(pj)d.projectId=pj;
    else if((UI.view==='project'||UI.view==='sched')&&UI.projectId)d.projectId=UI.projectId;
    var sp=el.getAttribute('data-supplier');if(sp)d.supplierId=sp;var od=el.getAttribute('data-order');if(od)d.orderId=od;var kd=el.getAttribute('data-kind');if(kd)d.kind=kd;var gp=el.getAttribute('data-grp');if(gp)d.grp=gp;
    if(el.getAttribute('data-e')==='event'&&UI.calSel)d.date=UI.calSel;
    openForm(el.getAttribute('data-e'),null,d);
  }
  else if(a==='edit'){openForm(el.getAttribute('data-e'),id);}
  else if(a==='closeSheet'){closeSheet();}
  else if(a==='delete'){doDelete();}
  else if(a==='rmphoto'){if(form){form.removed=true;form.file=null;var p=$('#phprev');if(p)p.innerHTML=ico('camera',40);el.remove();}}
  else if(a==='toggle'){var t=byId('tasks',id);if(t){
    var wasDone=t.status==='הושלם';
    sb.from('tasks').update(wasDone?{status:'לביצוע',done_at:null}:{status:'הושלם',done_at:new Date().toISOString()}).eq('id',id).then(function(){loadTable('tasks');});
    if(!wasDone){
      t.status='הושלם';UI.justDone=id;render();setTimeout(function(){if(UI.justDone===id){UI.justDone='';render();}},900);
      var sib=S.tasks.filter(function(q){return q.projectId===t.projectId;});
      if(sib.length>1&&sib.every(function(q){return q.status==='הושלם';})){confetti();toast('כל המשימות בפרויקט הושלמו! 🎉');}
    }
  }}
  else if(a==='cycle'){var o=byId('orders',id);if(o)sb.from('orders').update({status:ORD_NEXT[o.status]||'הוזמן'}).eq('id',id).then(function(){loadTable('orders');});}
  else if(a==='photo'&&isPdf(id)){window.open(purl(id),'_blank');}
  else if(a==='photo'){var lb=document.createElement('button');lb.className='lightbox';lb.setAttribute('aria-label','סגור תמונה');lb.innerHTML=isVid(id)?'<video src="'+purl(id)+'" controls autoplay playsinline style="max-width:100%;max-height:100%"></video>':'<img loading="lazy" decoding="async" src="'+purl(id)+'" alt="תמונה">';lb.onclick=function(ev){if(ev.target.tagName==='VIDEO')return;lb.remove();if(history.state&&history.state.lb)history.back();};document.body.appendChild(lb);pushOverlay('lb');}
  else if(a==='import'){startImport();}
  else if(a==='addcontact'){var cc=$('#contacts');if(cc){cc.insertAdjacentHTML('beforeend',crowHtml());var ins=cc.querySelectorAll('.c_n');ins[ins.length-1].focus();}}
  else if(a==='rmcontact'){var rw=el.closest('.crow');if(rw)rw.remove();}
  else if(a==='openplan'){
    var pl=byId('plans',id);if(!pl||!pl.file_path)return;
    sb.storage.from('photos').createSignedUrl(pl.file_path,3600).then(function(rr){
      if(rr.data&&rr.data.signedUrl){var w=window.open(rr.data.signedUrl,'_blank');if(!w)location.href=rr.data.signedUrl;}else alert('לא הצלחנו לפתוח את הקובץ.');
    });
  }
  else if(a==='reportall'){UI.reportProject='';UI.view='report';window.scrollTo(0,0);render();}
  else if(a==='schprint'){UI.reportProject=UI.projectId;UI.reportType='sched';UI.view='report';window.scrollTo(0,0);render();}
  else if(a==='report'){UI.reportProject=UI.projectId;UI.view='report';window.scrollTo(0,0);render();}
  else if(a==='rtype'){UI.reportType=el.getAttribute('data-v');render();}
  else if(a==='print'){var ot=document.title,pp=UI.reportProject?byId('projects',UI.reportProject):null;document.title='פדר בניה - '+((UI.reportType==='fin')?'דוח הוצאות':(UI.reportType==='sched')?'לוח זמנים':'דוח מצב')+' - '+(pp?pp.name:'כל הפרויקטים');window.print();setTimeout(function(){document.title=ot;},1500);}
  else if(a==='renamefield'){
    var oldf=UI.supField,nv=prompt('שם חדש לתחום "'+oldf+'":',oldf);
    if(nv&&nv.trim()&&nv.trim()!==oldf){nv=nv.trim();sb.from('suppliers').update({field:nv}).eq('field',oldf).then(function(){UI.supField=nv;loadTable('suppliers');});}
  }
  else if(a==='gconnect'){gConnect();}
  else if(a==='gdisc'){gDisconnect();}
  else if(a==='logout'){sb.auth.signOut();}
  else if(a==='wtoggle'){var wt=WK.tasks.filter(function(q){return q.id===id;})[0];if(wt){var nd=wt.status!=='הושלם';wt.status=nd?'הושלם':'לביצוע';render();sb.rpc('worker_set_done',{tid:id,is_done:nd}).then(function(){loadWorker();});}}
  else if(a==='wmine'){WK.mine=el.getAttribute('data-v')==='1';render();}
  else if(a==='wproj'){WK.proj=id||'';render();}
  else if(a==='wshowdone'){WK.showDone=!WK.showDone;render();}
  else if(a==='pushon'){pushEnable();}
  else if(a==='opensup'){UI.projSup=id;UI.projSupFor=UI.projectId;window.scrollTo(0,0);render();}
  else if(a==='supback'){UI.projSup='';window.scrollTo(0,0);render();}
  else if(a==='addpsup'){openAddPsup();}
  else if(a==='rmpsup'){
    if(!el.getAttribute('data-c')){el.setAttribute('data-c','1');el.textContent='לחץ שוב להסרה (התעודות נשמרות)';return;}
    sb.from('project_suppliers').delete().eq('project_id',UI.projectId).eq('supplier_id',id).then(function(){UI.projSup='';return loadTable('project_suppliers');});
  }
  else if(a==='savepsup'){savePsup();}
  else if(a==='trall'){translateAll();}
  else if(a==='deluser'){
    if(!confirm('למחוק את המשתמש הזה לצמיתות? הוא לא יוכל להיכנס יותר.'))return;
    sb.rpc('admin_delete_user',{uid:id}).then(function(r){if(r.error)toast('המחיקה לא הצליחה. ודא שהרצת את ה-SQL של מחיקת משתמשים.');else{toast('המשתמש נמחק ✓');loadTable('profiles');loadTable('team_members');}});
  }
  else if(a==='mytasks'){UI.taskPerson='me';UI.taskFilter='open';UI.view='tasks';window.scrollTo(0,0);render();}
  else if(a==='bell'){openBell();}
  else if(a==='cdone'){cResp(id,true,'');}
  else if(a==='cnote'){cNoteOpen(id);}
  else if(a==='cnotesave'){var cid=form&&form.id,ct=($('#cn_t')||{}).value||'',cd=!!($('#cn_d')||{}).checked;cResp(cid,cd,ct).then(function(ok){if(ok)closeSheet();});}
  else if(a==='csupadd'){cSupAdd();}
  else if(a==='cchgnew'){cChgNew(el.getAttribute('data-p'));}
  else if(a==='cchg'){cChgOk(id,el.getAttribute('data-ok')==='1');}
  else if(a==='accexport'){accExport();}
  else if(a==='snew'){sSetOpen(+el.getAttribute('data-tpl'));}
  else if(a==='sset'){sSetOpen(-1);}
  else if(a==='ssave'){sSetSave();}
  else if(a==='sopen'){UI.view='sched';UI.schedTab=el.getAttribute('data-st')||'time';window.scrollTo(0,0);render();}
  else if(a==='sback'){UI.view='project';UI.tab='gantt';window.scrollTo(0,0);render();}
  else if(a==='stab'){UI.schedTab=el.getAttribute('data-v');render();}
  else if(a==='sedit'){sEditOpen(id||null);}
  else if(a==='ssrow'){sRowSave();}
  else if(a==='sdelrow'){sRowDel();}
  else if(a==='sprint'){var ot2=document.title,pp2=byId('projects',UI.projectId);document.title='לוח זמנים - '+(pp2?pp2.name:'');document.body.classList.add('printing-sched');window.print();setTimeout(function(){document.title=ot2;document.body.classList.remove('printing-sched');},1500);}
  else if(a==='respsend'){respSend(el.getAttribute('data-g'));}
  else if(a==='ceoadd'){ceoQuickOpen();}
  else if(a==='ceoclose'){CQ=null;if(CQREC){try{CQREC.abort();}catch(e){}}closeSheet();}
  else if(a==='ceoopen'){ceoDecide(id);}
  else if(a==='ceodec'){ceoDecideSave();}
  else if(a==='ceotask'){var tid2=form&&form.tid;closeSheet();if(tid2)setTimeout(function(){openRef('task:'+tid2);},50);}
  else if(a==='cqmic'){ceoMic();}
  else if(a==='dcmic'){dcMic();}
  else if(a==='cqparse'){var ti=$('#cq_t');if(ti)CQ.text=ti.value;ceoParse();}
  else if(a==='cqproj'){CQ.projectId=el.getAttribute('data-v');ceoQuickDraw();}
  else if(a==='cqwho'){var wv=el.getAttribute('data-v');CQ.assigneeId=CQ.assigneeId===wv?'':wv;ceoQuickDraw();}
  else if(a==='cqdue'){CQ.due=el.getAttribute('data-v');ceoQuickDraw();}
  else if(a==='cqsave'){ceoQuickSave();}
  else if(a==='pdone'){UI.projDone=!UI.projDone;render();}
  else if(a==='bellclear'){bellClear();}
  else if(a==='bellopen'){var bid=el.getAttribute('data-id');bellDrop(bid);openRef(el.getAttribute('data-ref'));}
  else if(a==='reload'){location.reload();}
  else if(a==='signup'){doSignup();}
});
document.addEventListener('change',function(ev){
  var t=ev.target;
  if(t&&t.id==='f_area'&&t.value==='__new__'){
    var nm=(prompt('שם התחום החדש:')||'').trim();
    if(nm){var op=document.createElement('option');op.textContent=nm;t.insertBefore(op,t.lastElementChild);t.value=nm;}else t.value='כללי';
    return;
  }
  if(t.classList&&t.classList.contains('filein')&&form){
    var f2=t.files&&t.files[0];if(!f2)return;form.file2=f2;
    var fn=$('#filename');if(fn)fn.textContent=f2.name;
    var ti=$('#f_title');if(ti&&!ti.value)ti.value=f2.name.replace(/\.[^.]+$/,'');
  }else if(t.classList&&t.classList.contains('photoin')&&form){
    var f=t.files&&t.files[0];if(!f)return;
    if(/^video\//.test(f.type)&&f.size>50*1024*1024){ferr('הסרטון גדול מדי ('+Math.round(f.size/1048576)+'MB). המקסימום 50MB, צלם סרטון קצר יותר.');t.value='';return;}
    ferr('');form.file=f;form.removed=false;
    var p=$('#phprev');if(p&&/pdf/i.test(f.type)){p.innerHTML='<span class="pdft">PDF</span> '+esc(f.name||'');}else if(p){var isv=/^video\//.test(f.type),im=document.createElement(isv?'video':'img');if(isv){im.controls=true;im.muted=true;im.setAttribute('playsinline','');}else im.alt='';im.src=URL.createObjectURL(f);p.innerHTML='';p.appendChild(im);}
  }else if(t.getAttribute&&t.getAttribute('data-rp')){UI.repPhotos=t.checked;render();
  }else if(t.getAttribute&&t.getAttribute('data-ro')){UI.repOpen=t.checked;render();
  }else if(t.getAttribute&&t.getAttribute('data-respdone')){respToggle(t.getAttribute('data-respdone'),t.checked);
  }else if(t.getAttribute&&t.getAttribute('data-tmem')){
    sb.from('team_members').update({email:t.value.trim()||null}).eq('id',t.getAttribute('data-tmem')).then(function(r){if(r.error)toast('לא נשמר המייל (צריך להריץ את עדכון ה-SQL).');else toast('המייל נשמר ✓');loadTable('team_members');});
  }else if(t.getAttribute&&t.getAttribute('data-tmph')){
    sb.from('team_members').update({phone:t.value.trim()||null}).eq('id',t.getAttribute('data-tmph')).then(function(r){if(r.error)toast('לא נשמר הטלפון.');else toast('הטלפון נשמר ✓');loadTable('team_members');});
  }else if(t.getAttribute&&t.getAttribute('data-tm')){
    sb.from('team_members').update({user_id:t.value||null}).eq('id',t.getAttribute('data-tm')).then(function(r){if(r.error)toast('לא ניתן לחבר: אותו משתמש כבר מחובר לאדם אחר?');loadTable('team_members');});
  }else if(t.getAttribute&&t.getAttribute('data-psort')){lsSet('feder_psort',t.value);render();
  }else if(t.getAttribute&&t.getAttribute('data-role')){
    sb.from('profiles').update({role:t.value}).eq('id',t.getAttribute('data-role')).then(function(){loadTable('profiles');});
  }else if(t.getAttribute&&t.getAttribute('data-wa')){
    var wp=t.getAttribute('data-wa').split('|');
    (t.checked?sb.from('worker_access').upsert({user_id:wp[0],project_id:wp[1]},{onConflict:'user_id,project_id'}):sb.from('worker_access').delete().eq('user_id',wp[0]).eq('project_id',wp[1])).then(function(){loadTable('worker_access');});
  }else if(t.getAttribute&&t.getAttribute('data-cp')){
    var pr=t.getAttribute('data-cp').split('|');
    (t.checked?sb.from('client_projects').insert({user_id:pr[0],project_id:pr[1]}):sb.from('client_projects').delete().eq('user_id',pr[0]).eq('project_id',pr[1])).then(function(){loadTable('client_projects');});
  }else if(t.getAttribute&&t.getAttribute('data-sel')){UI[t.getAttribute('data-sel')]=t.value;render();}
});
document.addEventListener('input',function(ev){
  if(ev.target.getAttribute&&ev.target.getAttribute('data-rn')){
    var part=ev.target.getAttribute('data-rn'),v=ev.target.value;lsSet(noteKey(part),v);
    var box=$('[data-rnshow="'+part+'"]');if(box){box.textContent=v;box.style.display=v?'':'none';}
    var hh=$('[data-rnh="'+part+'"]');if(hh)hh.style.display=v?'':'none';
  }
  if(ev.target.id==='psq'){var q=ev.target.value.trim().toLowerCase(),n=0;[].slice.call(document.querySelectorAll('#psl [data-hay]')).forEach(function(l){var ok=!q||l.getAttribute('data-hay').indexOf(q)>-1;l.style.display=ok?'':'none';if(ok)n++;});var em=$('#psnone');if(em)em.style.display=n?'none':'';}
  if(ev.target.id==='sq'){UI.supQuery=ev.target.value;var l=$('#suplist');if(l)l.innerHTML=supplierList();}
});
document.addEventListener('submit',function(ev){
  var id=ev.target.id;
  if(id==='frm')submitForm(ev);
  else if(id==='lf'){ev.preventDefault();doLogin();}
  else if(id==='impf'){ev.preventDefault();doImport();}
  else if(id==='msgf'){ev.preventDefault();sendMsg(ev.target);}
});
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&form)closeSheet();});

/* ---------- auth + data ---------- */
async function doLogin(){
  var m=$('#l_mail').value.trim(),p=$('#l_pass').value;
  AUTH.msg='';AUTH.ok='';
  if(!m||!p){AUTH.msg='נא למלא אימייל וסיסמה.';render();return;}
  AUTH.ok='נכנס…';render();
  var r=await sb.auth.signInWithPassword({email:m,password:p});
  if(r.error){AUTH.ok='';AUTH.msg=/confirm/i.test(r.error.message)?'צריך לאשר את האימייל (נשלח אליך מייל).':'אימייל או סיסמה לא נכונים.';render();}
}
async function doSignup(){
  var n=$('#l_name').value.trim(),m=$('#l_mail').value.trim(),p=$('#l_pass').value;
  AUTH.msg='';AUTH.ok='';
  if(!m||p.length<6){AUTH.msg='נא למלא אימייל וסיסמה (לפחות 6 תווים).';render();return;}
  AUTH.ok='פותח משתמש…';render();
  var r=await sb.auth.signUp({email:m,password:p,options:{data:{name:n}}});
  if(r.error){AUTH.ok='';AUTH.msg='לא הצלחנו לפתוח משתמש: '+r.error.message;render();return;}
  if(!r.data.session){AUTH.ok='נשלח אליך מייל לאישור. אשר אותו, חזור לכאן והתחבר.';render();}
}
var SIG={},RAW={},snapT=null,snapUid=null;
function snapSave(){clearTimeout(snapT);snapT=setTimeout(function(){try{if(!AUTH.uid||AUTH.role==='worker')return;var o={};TABLES.forEach(function(t){if(RAW[t])o[t]=RAW[t];});localStorage.setItem('feder_snap_'+AUTH.uid,JSON.stringify(o));}catch(e){}},2500);}
function snapLoad(){
  try{
    var o=JSON.parse(localStorage.getItem('feder_snap_'+AUTH.uid)||'null');if(!o)return false;
    TABLES.forEach(function(t){var a=Array.isArray(o[t])?o[t]:[];S[t]=a.map(fromRow);RAW[t]=a;SIG[t]=JSON.stringify(a);loaded[t]=true;});
    return true;
  }catch(e){return false;}
}
async function loadTable(t){
  var q=sb.from(t).select('*');
  var r=(t==='client_projects'||t==='worker_access')?await q:await q.order('created_at',{ascending:false});
  var changed=!loaded[t];
  if(!r.error){var sig=JSON.stringify(r.data);if(sig!==SIG[t]){SIG[t]=sig;RAW[t]=r.data;S[t]=r.data.map(fromRow);changed=true;snapSave();}}
  loaded[t]=true;
  if(!changed)return;
  if(t==='expenses'||t==='docs'||t==='supplier_docs')ensurePhotos();
  render();
}
async function loadAll(){await Promise.all(TABLES.map(loadTable));}
async function ensurePhotos(){
  var need=[];S.expenses.concat(S.docs,S.supplier_docs,S.tasks).forEach(function(x){if(x.photo&&!PHOTO[x.photo]&&need.indexOf(x.photo)<0)need.push(x.photo);});
  if(!need.length)return;
  var r=await sb.storage.from('photos').createSignedUrls(need,21600);
  if(r.data){r.data.forEach(function(d){if(d.signedUrl&&d.path)PHOTO[d.path]=d.signedUrl;});render();}
}
async function sendMsg(f){
  var inp=$('#msgin'),body=inp.value.trim(),pid=f.getAttribute('data-p');
  if(!body)return;
  inp.value='';
  var r=await sb.from('messages').insert({project_id:pid,body:body});
  if(r.error){inp.value=body;return;}
  await loadTable('messages');
}
var channel=null,rtT={};
function subscribe(){
  if(channel)return;
  try{
    channel=sb.channel('feder').on('postgres_changes',{event:'*',schema:'public'},function(p){if(p&&p.table&&S[p.table]){clearTimeout(rtT[p.table]);rtT[p.table]=setTimeout(function(){loadTable(p.table);},250);}}).subscribe();
  }catch(e){}
}
async function boot(session){
  if(!session){try{if(snapUid)localStorage.removeItem('feder_snap_'+snapUid);}catch(e){}AUTH={state:'login',uid:null,name:'',role:'',msg:'',ok:AUTH.ok||''};loaded={};render();return;}
  AUTH.uid=session.user.id;snapUid=AUTH.uid;
  var r=await sb.from('profiles').select('name,role').eq('id',AUTH.uid).maybeSingle();
  var pr=r.data||{};
  AUTH.name=pr.name||'';AUTH.role=pr.role||'pending';
  if(AUTH.role==='pending'){AUTH.state='pending';render();return;}
  AUTH.state='app';
  if(AUTH.role==='ceo'&&!PENDING_OPEN)UI.view='ceo';
  if(AUTH.role!=='worker')snapLoad();
  render();
  if(AUTH.role==='worker'){await loadWorker();runPendingOpen();return;}
  gRestore();
  await loadAll();loadBell();subscribe();runPendingOpen();
}
sb.auth.onAuthStateChange(function(ev,session){
  if(ev==='INITIAL_SESSION'||ev==='SIGNED_IN'||ev==='SIGNED_OUT')setTimeout(function(){boot(session);},0);
});
setInterval(function(){if(AUTH.state==='app'&&AUTH.role==='worker'){loadWorker();return;}if(AUTH.state==='app'&&!form&&!document.hidden)loadAll();loadBell();},90000);
document.addEventListener('visibilitychange',function(){if(!document.hidden&&AUTH.state==='app'&&AUTH.role==='worker'){loadWorker();return;}
  if(!document.hidden&&AUTH.state==='app'&&!form){loadAll();}});
var lastRKey='';
(function(){var base=render;render=function(){base();try{
  var k=[AUTH.state,AUTH.role,UI.view,UI.projectId,UI.tab,UI.projSup,UI.clientProject,WK.proj].join('|');
  if(k!==lastRKey){lastRKey=k;var ap=document.getElementById('app');ap.classList.remove('enter');void ap.offsetWidth;ap.classList.add('enter');setTimeout(function(){ap.classList.remove('enter');},900);}
}catch(e){}};})();
render();
if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js').catch(function(){});});}
})();
