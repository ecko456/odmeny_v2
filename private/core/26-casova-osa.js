/* ==========================================================================
   ČASOVÁ OSA V PRAVÉM PANELU (2.66): úkoly na čas s opakováním, vidět je okno 2 hodiny zpět
   a 3 hodiny dopředu od teď. Sdílená data:
   S.agenda[≤ 500] = {id 'ag…', title ≤ 200, time 'HH:MM', rep (AG_REP), date ISO (od kdy;
   u jednorázového den úkolu; den v týdnu a v měsíci se bere z něj), note ≤ 500, work (jen pracovní dny: bez víkendů a svátků), at, by,
   done{iso: {at, by}} (splněno v daný den, nejvýš 400 posledních)}
   ========================================================================== */
const AG_REP=[["once","Jednorázově"],["day","Každý den"],["week","Každý týden"],["even","Každý sudý týden"],["odd","Každý lichý týden"],["month","Každý měsíc"]];
const AG_REP_KEYS=new Set(AG_REP.map(x=>x[0]));
const AG_MAX=500, AG_DONE_MAX=400, AG_BACK=2, AG_AHEAD=3;
const agRepName=k=>(AG_REP.find(x=>x[0]===k)||["",""])[1];
const agTimeOk=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t||""));
function cleanAgenda(a){
  const ids=new Set(),out=[];
  (Array.isArray(a)?a:[]).forEach(x=>{
    if(!x||typeof x!=="object")return;
    const id=String(x.id||""),title=String(x.title||"").replace(/\s+/g," ").trim().slice(0,200);
    if(!/^ag[0-9a-z]{1,40}$/.test(id)||ids.has(id)||!title||!agTimeOk(x.time)||!ISO_DAY.test(String(x.date||"")))return;
    ids.add(id);
    const done={};
    Object.keys(x.done&&typeof x.done==="object"?x.done:{}).filter(d=>ISO_DAY.test(d)).sort().slice(-AG_DONE_MAX).forEach(d=>{
      const v=x.done[d]||{};done[d]={at:Number.isFinite(+v.at)?+v.at:0,by:String(v.by||"").slice(0,60)};
    });
    out.push({id,title,time:x.time,rep:AG_REP_KEYS.has(x.rep)?x.rep:"once",date:x.date,note:String(x.note||"").trim().slice(0,500),work:x.work===true,
      at:Number.isFinite(+x.at)?+x.at:0,by:String(x.by||"").slice(0,60),done});
  });
  return out.sort((p,q)=>p.time<q.time?-1:p.time>q.time?1:p.at-q.at).slice(0,AG_MAX);
}
/** Pracovní den: pondělí až pátek a ne státní svátek */
function agWorkDay(iso){return (new Date(utcOf(iso)).getUTCDay()+6)%7<5&&!calHoliday(iso);}
/** Připadá úkol na den? */
function agOn(x,iso){
  if(iso<x.date)return false;
  if(x.rep==="once")return iso===x.date;
  if(x.work&&!agWorkDay(iso))return false;
  if(x.rep==="day")return true;
  const dow=t=>(new Date(utcOf(t)).getUTCDay()+6)%7;
  if(x.rep==="week")return dow(iso)===dow(x.date);
  if(x.rep==="even"||x.rep==="odd")return dow(iso)===dow(x.date)&&(isoWeek(iso).w%2===0)===(x.rep==="even");
  if(x.rep==="month"){
    const d=+x.date.slice(8,10),[y,m]=iso.split("-").map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();
    return +iso.slice(8,10)===Math.min(d,last);
  }
  return false;
}
/** Výskyty v okně kolem `now` (ms): od now − back h do now + ahead h, přes půlnoc i do vedlejších dnů. */
function agWindow(list,now,back=AG_BACK,ahead=AG_AHEAD){
  const from=now-back*3600e3,to=now+ahead*3600e3,out=[];
  const today=todayIso(now);
  [-1,0,1].forEach(k=>{
    const t0=new Date(now);t0.setHours(0,0,0,0);t0.setDate(t0.getDate()+k);
    const iso=todayIso(t0.getTime());
    (list||[]).forEach(x=>{
      if(!agOn(x,iso))return;
      const [h,mi]=x.time.split(":").map(Number),d=new Date(t0);d.setHours(h,mi,0,0);
      const ts=d.getTime();
      if(ts<from||ts>to)return;
      out.push({x,iso,ts,past:ts<now,done:!!(x.done&&x.done[iso]),other:iso!==today});
    });
  });
  return {from,to,items:out.sort((a,b)=>a.ts-b.ts||a.x.title.localeCompare(b.x.title,"cs"))};
}
/** Nejbližší den (od `from` včetně, nejvýš 400 dní dopředu), kdy úkol připadá; "" = už nikdy */
function agNext(x,from){
  for(let t=utcOf(from>x.date?from:x.date),i=0;i<400;i++,t+=DAY_MS){const iso=isoOf(t);if(agOn(x,iso))return iso;if(x.rep==="once")break;}
  return "";
}
function agAdd(st,v,meta){
  const title=String(v.title||"").replace(/\s+/g," ").trim().slice(0,200);
  if(!title)return {err:"Napiš, co je třeba udělat."};
  if(!agTimeOk(v.time))return {err:"Zadej čas ve tvaru HH:MM."};
  if(!ISO_DAY.test(String(v.date||"")))return {err:"Zadej datum."};
  st.agenda=st.agenda||[];
  if(st.agenda.length>=AG_MAX)return {err:"Úkolů na časové ose je moc (nejvýš "+AG_MAX+")."};
  const x={id:"ag"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),title,time:v.time,rep:AG_REP_KEYS.has(v.rep)?v.rep:"once",
    date:v.date,note:String(v.note||"").trim().slice(0,500),work:v.work===true,at:(meta&&meta.at)||Date.now(),by:(meta&&meta.by)||"",done:{}};
  st.agenda.push(x);
  st.agenda=cleanAgenda(st.agenda);
  return x;
}
function agSet(st,id,v){
  const x=(st.agenda||[]).find(a=>a.id===id);
  if(!x)return {err:"Úkol už neexistuje."};
  const title=String(v.title||"").replace(/\s+/g," ").trim().slice(0,200);
  if(!title)return {err:"Napiš, co je třeba udělat."};
  if(!agTimeOk(v.time))return {err:"Zadej čas ve tvaru HH:MM."};
  if(!ISO_DAY.test(String(v.date||"")))return {err:"Zadej datum."};
  Object.assign(x,{title,time:v.time,rep:AG_REP_KEYS.has(v.rep)?v.rep:"once",date:v.date,note:String(v.note||"").trim().slice(0,500),work:v.work===true});
  st.agenda=cleanAgenda(st.agenda);
  return x;
}
function agDel(st,id){const n=(st.agenda||[]).length;st.agenda=(st.agenda||[]).filter(a=>a.id!==id);return st.agenda.length<n;}
function agDone(st,id,iso,on,meta){
  const x=(st.agenda||[]).find(a=>a.id===id);
  if(!x||!ISO_DAY.test(iso))return false;
  x.done=x.done||{};
  if(on){if(x.done[iso])return false;x.done[iso]={at:(meta&&meta.at)||Date.now(),by:(meta&&meta.by)||""};}
  else{if(!x.done[iso])return false;delete x.done[iso];}
  return true;
}
function agText(x){return x.time+" "+x.title+" ("+agRepName(x.rep).toLowerCase()+(x.work&&x.rep!=="once"?", jen pracovní dny":"")+(x.rep==="once"?" "+dayText(x.date):" od "+dayText(x.date))+")";}
function agChanges(A,B,add){
  const a=A||[],b=B||[],am=new Map(a.map(x=>[x.id,x])),bm=new Set(b.map(x=>x.id));
  b.forEach(x=>{
    const o=am.get(x.id);
    if(!o){add("task","Časová osa: nový úkol "+agText(x),{m:"ag:"+x.id});return;}
    if(o.title!==x.title||o.time!==x.time||o.rep!==x.rep||o.date!==x.date||o.note!==x.note||!!o.work!==!!x.work)add("task","Časová osa: upraven úkol "+agText(x),{m:"age:"+x.id});
    const od=o.done||{},nd=x.done||{};
    Object.keys(nd).filter(d=>!od[d]).forEach(d=>add("task","Časová osa: splněno "+x.time+" "+x.title+" ("+dayText(d)+")",{m:"agd:"+x.id+":"+d}));
    if(Object.keys(nd).length<AG_DONE_MAX)Object.keys(od).filter(d=>!nd[d]).forEach(d=>add("task","Časová osa: zrušeno splnění "+x.time+" "+x.title+" ("+dayText(d)+")",{m:"agd:"+x.id+":"+d}));
  });
  a.filter(x=>!bm.has(x.id)).forEach(x=>add("task","Časová osa: smazán úkol "+agText(x),{m:"agx:"+x.id}));
}
