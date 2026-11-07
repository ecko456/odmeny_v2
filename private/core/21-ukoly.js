/* ==========================================================================
   ÚKOLY (verze 2.46)
   Úkol má název, popis, termín, zodpovědnou osobu a stav. Každá změna stavu, termínu,
   osoby nebo názvu a každý komentář jde do časové osy úkolu (tl). Opakovaný úkol po
   dokončení založí další úkol s dalším termínem (týden, měsíc, půlrok, rok); další termín
   je vždy aspoň dnešek, aby po pozdním dokončení nevznikl hned úkol po termínu.
   Připomínka: otevřený úkol s termínem za nejvýš `remind` dní (nebo po termínu).
   ========================================================================== */
const TK_MAX=1000,TK_TL_MAX=500;
const TK_STATES=[["new","Nový"],["run","Rozpracovaný"],["wait","Čeká"],["done","Hotovo"],["cancel","Zrušeno"]];
const TK_STATE_KEYS=TK_STATES.map(x=>x[0]);
const TK_OPEN=new Set(["new","run","wait"]);
const TK_REPEAT=[["","Neopakovat"],["week","Každý týden"],["month","Každý měsíc"],["half","Každý půlrok"],["year","Každý rok"]];
const TK_REPEAT_KEYS=TK_REPEAT.map(x=>x[0]);
const TK_REMIND=[0,1,2,3,5,7,14];
const TK_REMIND_DEF=2;
/* Požadavek pracovníka (2.51): úkol s `person` (klíč člověka), `pname` (jméno v době zadání)
   a závažností `sev`. */
const TK_SEV=[["low","Nízká"],["mid","Střední"],["high","Vysoká"]];
const TK_SEV_KEYS=TK_SEV.map(x=>x[0]);
const TK_SEV_RANK={high:0,mid:1,low:2,"":3};
function tkSevName(k){const x=TK_SEV.find(s=>s[0]===k);return x?x[1]:"bez závažnosti";}
function tkIsReq(t){return !!(t&&t.person);}
const TK_ISO=/^\d{4}-\d{2}-\d{2}$/;
function blankTasks(){return {list:[]};}
function tkStateName(k){const x=TK_STATES.find(s=>s[0]===k);return x?x[1]:k;}
function tkRepeatName(k){const x=TK_REPEAT.find(s=>s[0]===(k||""));return x?x[1]:"Neopakovat";}
function tkRemindText(n){return !n?"v den termínu":n===1?"1 den předem":n<=4?n+" dny předem":n+" dní předem";}
function cleanTasks(o){
  o=o&&typeof o==="object"?o:{};
  const str=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").trim().slice(0,max);
  const txt=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").replace(/\r\n?/g,"\n").trim().slice(0,max);
  const iso=v=>TK_ISO.test(String(v||""))?String(v):"";
  const ts=v=>Number.isFinite(+v)?Math.max(0,Math.min(1e15,+v)):0;
  const seen=new Set(),uniq=(v,p)=>{let x=typeof v==="string"&&SAFE_ID.test(v)?v:uid(p);while(seen.has(x))x=uid(p);seen.add(x);return x;};
  const list=(Array.isArray(o.list)?o.list:[]).filter(t=>t&&typeof t==="object"&&str(t.title,200)).slice(0,TK_MAX).map(t=>{
    const rem=Math.round(+t.remind);
    return {id:uniq(t.id,"tk"),title:str(t.title,200),desc:txt(t.desc,4000),due:iso(t.due),owner:str(t.owner,80),
      state:TK_STATE_KEYS.includes(t.state)?t.state:"new",repeat:TK_REPEAT_KEYS.includes(t.repeat)?t.repeat:"",
      remind:TK_REMIND.includes(rem)?rem:TK_REMIND_DEF,at:ts(t.at),by:str(t.by,60),done:ts(t.done),doneBy:str(t.doneBy,60),
      series:typeof t.series==="string"&&SAFE_ID.test(t.series)?t.series:"",next:typeof t.next==="string"&&SAFE_ID.test(t.next)?t.next:"",
      person:str(t.person,200),pname:t.person?str(t.pname,120):"",sev:TK_SEV_KEYS.includes(t.sev)?t.sev:"",
      tl:(Array.isArray(t.tl)?t.tl:[]).filter(e=>e&&typeof e==="object"&&["new","c","s","f","r"].includes(e.k)).slice(-TK_TL_MAX).map(e=>({
        id:uniq(e.id,"te"),at:ts(e.at),by:str(e.by,60),k:e.k,
        ...(e.k==="c"||e.k==="r"||e.k==="new"?{text:txt(e.text,2000)}:{}),
        ...(e.k==="s"||e.k==="f"?{f:e.k==="s"?"state":["title","due","owner","repeat","remind","desc","sev"].includes(e.f)?e.f:"title",v0:str(e.v0,300),v1:str(e.v1,300)}:{})}))};
  }).filter(t=>t.title);
  const ids=new Set(list.map(t=>t.id));
  list.forEach(t=>{if(t.next&&!ids.has(t.next))t.next="";});
  return {list};
}
function tkDays(a,b){const p=s=>{const [y,m,d]=s.split("-").map(Number);return Date.UTC(y,m-1,d);};return Math.round((p(b)-p(a))/864e5);}
/* Další termín opakovaného úkolu; konec měsíce se zarovná (31. 1. + měsíc = 28./29. 2.). */
function tkStep(due,rep){
  const [y,m,d]=due.split("-").map(Number);
  if(rep==="week")return isoOf(Date.UTC(y,m-1,d+7));
  const add=rep==="month"?1:rep==="half"?6:rep==="year"?12:0;
  if(!add)return due;
  const last=new Date(Date.UTC(y,m-1+add+1,0)).getUTCDate();
  return isoOf(Date.UTC(y,m-1+add,Math.min(d,last)));
}
function tkNextDue(due,rep,today){
  if(!rep)return "";
  let n=tkStep(due||today,rep);
  for(let i=0;i<2000&&today&&n<today;i++)n=tkStep(n,rep);
  return n;
}
function tkFind(st,id){return ((st.tasks||{}).list||[]).find(t=>t.id===id)||null;}
function tkTl(t,e,meta){t.tl.push({id:uid("te"),at:meta.at||Date.now(),by:meta.by||"",...e});if(t.tl.length>TK_TL_MAX)t.tl=t.tl.slice(-TK_TL_MAX);}
const TK_FIELD_TEXT={title:"Název",due:"Termín",owner:"Zodpovídá",repeat:"Opakování",remind:"Připomenout",desc:"Popis",state:"Stav",sev:"Závažnost"};
function tkFieldVal(f,v){
  if(f==="state")return tkStateName(v);
  if(f==="due")return v?dayText(v):"bez termínu";
  if(f==="owner")return v||"nikdo";
  if(f==="repeat")return tkRepeatName(v);
  if(f==="remind")return tkRemindText(+v);
  if(f==="desc")return v?commentShort(v):"bez popisu";
  if(f==="sev")return tkSevName(v);
  return String(v==null?"":v);
}
/* Nový úkol; vrátí úkol, nebo chybu {err}. */
function tkAdd(st,x,meta){
  st.tasks=st.tasks||blankTasks();
  const title=String(x.title||"").trim().slice(0,200);
  if(!title)return {err:"Zadej název úkolu."};
  if(st.tasks.list.length>=TK_MAX)return {err:"Úkolů je už "+TK_MAX+", smaž některé hotové."};
  const t={id:uid("tk"),title,desc:String(x.desc||"").trim().slice(0,4000),due:TK_ISO.test(x.due||"")?x.due:"",owner:String(x.owner||"").trim().slice(0,80),
    state:"new",repeat:TK_REPEAT_KEYS.includes(x.repeat)?x.repeat:"",remind:TK_REMIND.includes(+x.remind)?+x.remind:TK_REMIND_DEF,
    at:meta.at||Date.now(),by:meta.by||"",done:0,doneBy:"",series:x.series||"",next:"",
    person:String(x.person||"").slice(0,200),pname:x.person?String(x.pname||"").trim().slice(0,120):"",sev:TK_SEV_KEYS.includes(x.sev)?x.sev:"",tl:[]};
  if(t.repeat&&!t.series)t.series=t.id;
  tkTl(t,{k:"new",text:x.from?"Vytvořen opakováním po dokončení předchozího úkolu":t.person?"Požadavek pracovníka "+(t.pname||"")+" zadán"+(t.sev?" (závažnost "+tkSevName(t.sev).toLowerCase()+")":""):""},meta);
  st.tasks.list.unshift(t);
  return t;
}
/* Změna polí úkolu (title, desc, due, owner, state, repeat, remind). Každá změna jde do časové
   osy; dokončení opakovaného úkolu založí další (jen jednou, t.next). Vrátí {t, next}. */
function tkSet(st,id,patch,meta){
  const t=tkFind(st,id);
  if(!t)return {err:"Úkol už neexistuje."};
  let next=null;
  ["title","due","owner","repeat","remind","desc","sev","state"].forEach(f=>{
    if(!(f in patch))return;
    let v=patch[f];
    if(f==="title"){v=String(v||"").trim().slice(0,200);if(!v)return;}
    else if(f==="desc")v=String(v||"").trim().slice(0,4000);
    else if(f==="owner")v=String(v||"").trim().slice(0,80);
    else if(f==="due")v=TK_ISO.test(v||"")?v:"";
    else if(f==="state"){if(!TK_STATE_KEYS.includes(v))return;}
    else if(f==="repeat"){v=TK_REPEAT_KEYS.includes(v)?v:"";}
    else if(f==="remind"){v=+v;if(!TK_REMIND.includes(v))return;}
    else if(f==="sev"){v=TK_SEV_KEYS.includes(v)?v:"";}
    if(t[f]===v)return;
    const v0=t[f];
    t[f]=v;
    tkTl(t,f==="state"?{k:"s",f,v0,v1:v}:{k:"f",f,v0:String(f==="desc"?v0.slice(0,300):v0),v1:String(f==="desc"?v.slice(0,300):v)},meta);
    if(f==="repeat"&&v&&!t.series)t.series=t.id;
    if(f==="state"){
      if(v==="done"){t.done=meta.at||Date.now();t.doneBy=meta.by||"";}
      else if(v0==="done"){t.done=0;t.doneBy="";}
    }
  });
  if(t.state==="done"&&t.repeat&&!t.next){
    const due=tkNextDue(t.due,t.repeat,meta.today||todayIso());
    const n=tkAdd(st,{title:t.title,desc:t.desc,due,owner:t.owner,repeat:t.repeat,remind:t.remind,series:t.series||t.id,from:t.id,person:t.person,pname:t.pname,sev:t.sev},meta);
    if(!n.err){t.next=n.id;next=n;tkTl(t,{k:"r",text:"Další opakování založeno s termínem "+dayText(due)},meta);}
  }
  return {t,next};
}
function tkComment(st,id,text,meta){
  const t=tkFind(st,id);
  text=String(text||"").replace(/\r\n?/g,"\n").trim().slice(0,2000);
  if(!t||!text)return null;
  tkTl(t,{k:"c",text},meta);
  return t.tl[t.tl.length-1];
}
function tkDelComment(st,id,cid){const t=tkFind(st,id);if(!t)return false;const n=t.tl.length;t.tl=t.tl.filter(e=>!(e.id===cid&&e.k==="c"));return t.tl.length<n;}
function tkDelete(st,id){
  const L=(st.tasks||{}).list||[],n=L.length;
  st.tasks.list=L.filter(t=>t.id!==id);
  st.tasks.list.forEach(t=>{if(t.next===id)t.next="";});
  return st.tasks.list.length<n;
}
/* Termín vůči dnešku: days (záporné = po termínu), late, soon (do připomínky), open. */
function tkDue(t,today){
  const open=TK_OPEN.has(t.state);
  if(!t.due)return {open,days:null,late:false,soon:false,today:false};
  const days=tkDays(today,t.due);
  return {open,days,late:open&&days<0,today:open&&days===0,soon:open&&days>=0&&days<=t.remind};
}
function tkDueText(t,today){
  if(!t.due)return "bez termínu";
  const d=tkDays(today,t.due);
  if(!TK_OPEN.has(t.state))return dayText(t.due);
  if(d===0)return "dnes";
  if(d===1)return "zítra";
  if(d<0){const n=-d;return n===1?"1 den po termínu":n<=4?n+" dny po termínu":n+" dní po termínu";}
  return d<=4?"za "+d+" dny":"za "+d+" dní";
}
/* Přehled: otevřené, po termínu, připomínky (termín do `remind` dní), hotové za 30 dní, osoby. */
function tkOverview(st,today){
  const L=((st||S).tasks||{}).list||[];
  const open=L.filter(t=>TK_OPEN.has(t.state));
  const late=open.filter(t=>tkDue(t,today).late).sort((a,b)=>a.due<b.due?-1:1);
  const soon=open.filter(t=>{const d=tkDue(t,today);return d.soon&&!d.late;}).sort((a,b)=>a.due<b.due?-1:1);
  const since=Date.parse(today+"T00:00:00")-30*864e5;
  const owners=[...new Set(L.map(t=>t.owner).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"cs"));
  const req=open.filter(tkIsReq);
  return {all:L.length,open:open.length,late,soon,remind:late.length+soon.length,done30:L.filter(t=>t.state==="done"&&t.done>=since).length,owners,
    req:req.length,reqHigh:req.filter(t=>t.sev==="high").length};
}
/* Pořadí seznamu: otevřené podle termínu (bez termínu na konci), hotové a zrušené od nejnovějších. */
function tkSort(list){
  return list.slice().sort((a,b)=>{
    const oa=TK_OPEN.has(a.state),ob=TK_OPEN.has(b.state);
    if(oa!==ob)return oa?-1:1;
    if(oa){if(!!a.due!==!!b.due)return a.due?-1:1;if(a.due!==b.due)return a.due<b.due?-1:1;const r=TK_SEV_RANK[a.sev||""]-TK_SEV_RANK[b.sev||""];if(r)return r;return b.at-a.at;}
    return (b.done||b.at)-(a.done||a.at);
  });
}
/** Jméno pracovníka u požadavku: dnešní jméno z Lidí, jinak jméno v době zadání. */
function tkPersonName(t,st){const e=t&&t.person?((st||S).employees||{})[t.person]:null;return e?(e.first+" "+e.last).trim():(t&&t.pname)||"";}
function tkTlText(e){
  if(e.k==="new")return e.text||"Úkol zadán";
  if(e.k==="c"||e.k==="r")return e.text;
  return (TK_FIELD_TEXT[e.f]||e.f)+": "+tkFieldVal(e.f,e.v0)+" → "+tkFieldVal(e.f,e.v1);
}
function tkSheets(st,today){
  const L=tkSort(((st||S).tasks||{}).list||[]);
  const dt=ts=>ts?todayIso(ts)+" "+new Date(ts).toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"}):"";
  const rows=L.map(t=>{const d=tkDue(t,today);return [t.title,tkIsReq(t)?"požadavek pracovníka":"úkol",tkIsReq(t)?tkPersonName(t,st):"",t.sev?tkSevName(t.sev):"",tkStateName(t.state),t.due?dayText(t.due):"",t.owner,tkRepeatName(t.repeat),
    d.late?"po termínu":d.today?"dnes":d.soon?"blíží se":"",t.desc,t.by,dt(t.at),t.done?dt(t.done):"",t.tl.filter(e=>e.k==="c").length];});
  const tl=[];
  L.forEach(t=>t.tl.forEach(e=>tl.push([t.title,dt(e.at),e.by,e.k==="c"?"komentář":e.k==="s"?"stav":e.k==="f"?"změna":e.k==="r"?"opakování":"zadání",tkTlText(e)])));
  return [{name:"Úkoly",cols:[36,20,22,11,13,12,20,14,12,40,16,17,17,10],rows:[["Úkol","Druh","Pracovník","Závažnost","Stav","Termín","Zodpovídá","Opakování","Upozornění","Popis","Zadal","Zadáno","Hotovo","Komentářů"],...rows]},
    {name:"Časová osa",cols:[36,17,16,12,60],rows:[["Úkol","Kdy","Kdo","Druh","Záznam"],...tl]}];
}
/* Historie změn (Poslední změny): nový a smazaný úkol, stav, termín, osoba, název, opakování,
   komentáře. Opakovaná úprava téhož do 10 minut se sloučí (klíč tk…:id). */
function tkChanges(A,B,add){
  const a=(A&&A.list)||[],b=(B&&B.list)||[];
  const am=new Map(a.map(t=>[t.id,t]));
  const q=t=>t.person?"Požadavek pracovníka "+(t.pname||"")+" „"+t.title+"“":"Úkol „"+t.title+"“";
  b.forEach(t=>{
    const o=am.get(t.id);
    if(!o){add("task",q(t)+" zadán"+(t.sev?", závažnost "+tkSevName(t.sev).toLowerCase():"")+(t.due?", termín "+dayText(t.due):"")+(t.owner?", zodpovídá "+t.owner:"")+(t.repeat?", "+tkRepeatName(t.repeat).toLowerCase():""),{m:"tkn:"+t.id,...(t.person?{key:t.person}:{})});return;}
    [["state","tks"],["due","tkd"],["owner","tko"],["title","tkt"],["repeat","tkr"],["remind","tkm"],["desc","tkp"],["sev","tkv"]].forEach(([f,m])=>{
      if(o[f]!==t[f])add("task","",{m:m+":"+t.id,p:q(t)+" – "+TK_FIELD_TEXT[f].toLowerCase()+": ",v0:tkFieldVal(f,o[f]),v1:tkFieldVal(f,t[f])});
    });
    const oc=new Set(o.tl.filter(e=>e.k==="c").map(e=>e.id));
    t.tl.filter(e=>e.k==="c"&&!oc.has(e.id)).forEach(e=>add("task",q(t)+": komentář „"+commentShort(e.text)+"“",{m:"tkc:"+e.id}));
    const nc=new Set(t.tl.filter(e=>e.k==="c").map(e=>e.id));
    o.tl.filter(e=>e.k==="c"&&!nc.has(e.id)).forEach(e=>add("task",q(t)+": komentář smazán",{m:"tkc:"+e.id+":x"}));
  });
  const bm=new Set(b.map(t=>t.id));
  a.forEach(t=>{if(!bm.has(t.id))add("task",q(t)+" smazán",{m:"tkx:"+t.id});});
}

