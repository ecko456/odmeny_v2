/* ================= verze 2.2: Top 5 nejméně efektivních položek =================
   Z evidence práce (EAN, strávený čas, norma) se po týdnech (ISO, pondělí až neděle) spočítá
   plnění normy každé položky. Pět nejhorších pod 100 % jde do týdenního žebříčku. Ke každé
   položce se vede případ: proč se to stalo, co s tím jde dělat, okamžitá opatření, opatření
   s procesním časem a dvě ověření účinnosti (standardně 14 dní po dokončení opatření a 30 dní
   po prvním ověření). Neúčinné řešení otevře v témž případu nové kolo, takže se nic neřeší
   dvakrát a historie zůstane pohromadě. */
const EFF_TOP=5;
const EFF_DEFAULTS={min:60,target:85,d1:14,d2:30,unit:"h"};
const EFF_CATS=[["lide","Lidé a zaučení"],["metoda","Metoda a pracovní postup"],["stroj","Stroj, nástroj, přípravek"],
  ["material","Materiál a polotovar"],["mereni","Měření a kontrola"],["tok","Organizace a tok materiálu"],
  ["norma","Norma a technologický postup"],["pozadavky","Výkres a požadavky (pohledovost)"],["jine","Jiné"]];
const EFF_STATES={new:"Analýza příčiny",act:"Opatření běží",v1:"Čeká na 1. ověření",v2:"Čeká na 2. ověření",
  fail:"Neúčinné, nové kolo",ok:"Uzavřeno, účinné",zrus:"Zrušeno"};
const WEEK_ID=/^\d{4}-W\d{2}$/;
const CASE_NO=/^\d{4}-\d{3,5}$/;
const DAY_MS=864e5;
function blankEff(){return {weeks:{},cases:[],reports:[],settings:{...EFF_DEFAULTS},nos:{}};}
function effSet(){return (S&&S.eff&&S.eff.settings)||{...EFF_DEFAULTS};}
function effCatLabel(k){const c=EFF_CATS.find(x=>x[0]===k);return c?c[1]:"";}

/* EAN nebo kód položky: bez mezer a velkými písmeny (číslo z Excelu jako text). */
function itemKey(v){
  if(v==null||v==="")return "";
  return String(v).trim().replace(/\s+/g,"").toUpperCase().slice(0,40);
}

/* ---------- dny a týdny (ISO 8601, týden začíná pondělím) ---------- */
function isoOf(t){return new Date(t).toISOString().slice(0,10);}
function utcOf(iso){const [y,m,d]=String(iso).split("-").map(Number);return Date.UTC(y,m-1,d);}
function addDays(iso,n){return isoOf(utcOf(iso)+n*DAY_MS);}
function daysBetween(a,b){return Math.round((utcOf(b)-utcOf(a))/DAY_MS);}
function todayIso(now){const d=now?new Date(now):new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
const _weekOf={};
function isoWeek(iso){
  if(_weekOf[iso])return _weekOf[iso];
  const t=utcOf(iso),mon=t-((new Date(t).getUTCDay()+6)%7)*DAY_MS;
  const y=new Date(mon+3*DAY_MS).getUTCFullYear();
  const j4=Date.UTC(y,0,4),w1=j4-((new Date(j4).getUTCDay()+6)%7)*DAY_MS;
  const w=1+Math.round((mon-w1)/(7*DAY_MS));
  return _weekOf[iso]={id:y+"-W"+String(w).padStart(2,"0"),y,w,from:isoOf(mon),to:isoOf(mon+6*DAY_MS)};
}
function weekById(id){
  const m=/^(\d{4})-W(\d{2})$/.exec(String(id||""));
  if(!m)return null;
  const j4=Date.UTC(+m[1],0,4),w1=j4-((new Date(j4).getUTCDay()+6)%7)*DAY_MS;
  const wk=isoWeek(isoOf(w1+(+m[2]-1)*7*DAY_MS));
  return wk.id===id?wk:null;
}
function shiftWeek(id,n){const w=weekById(id);return w?isoWeek(addDays(w.from,7*n)).id:null;}
function dayText(iso,year=true){if(!iso)return "";const [y,m,d]=iso.split("-").map(Number);return d+". "+m+"."+(year?" "+y:"");}
function weekRange(w){
  const [y1,m1,d1]=w.from.split("-").map(Number),[y2,m2,d2]=w.to.split("-").map(Number);
  if(y1!==y2)return d1+". "+m1+". "+y1+" – "+d2+". "+m2+". "+y2;
  if(m1!==m2)return d1+". "+m1+". – "+d2+". "+m2+". "+y2;
  return d1+".–"+d2+". "+m2+". "+y2;
}
function weekName(id){const w=weekById(id);return w?"T"+w.w+"/"+w.y:"";}
function weekLong(id){const w=weekById(id);return w?"Týden "+w.w+"/"+w.y+" ("+weekRange(w)+")":"";}

/* ---------- položky z evidence práce ---------- */
let _effCache=null;
function effCache(){return _effCache||(_effCache={rank:{},weeks:null,hist:null});}
/* Položky za období od–do (ISO, včetně) ze všech nahraných měsíců evidence práce.
   only = jen jedna položka (rychlejší). Plnění = norma ÷ čas u řádků, kde je čas i norma. */
function itemStats(from,to,only){
  const out={};
  Object.keys(S.production||{}).sort().forEach(id=>{
    const pp=S.production[id];
    if(!pp||!pp.items||id+"-31"<from||id+"-01">to)return;
    const list=only?(pp.items[only]?[[only,pp.items[only]]]:[]):Object.entries(pp.items);
    list.forEach(([ean,it])=>{
      Object.entries(it.d).forEach(([iso,a])=>{
        if(iso<from||iso>to)return;
        const r=out[ean]||(out[ean]={ean,name:"",ks:0,spent:0,norm:0,nspent:0,rows:0,days:0,w:{}});
        r.ks+=a[0];r.spent+=a[1];r.norm+=a[2];r.nspent+=a[3];r.rows+=a[4];r.days++;
        if(it.name)r.name=it.name;
      });
      const r=out[ean];
      if(!r)return;
      Object.entries(it.w||{}).forEach(([wk,days])=>Object.entries(days).forEach(([iso,a])=>{
        if(iso<from||iso>to)return;
        const x=r.w[wk]||(r.w[wk]={spent:0,norm:0,nspent:0,ks:0});
        x.spent+=a[0];x.norm+=a[1];x.nspent+=a[2];x.ks+=a[3];
      }));
    });
  });
  Object.values(out).forEach(r=>{
    r.eff=r.nspent>0&&r.norm>0?r.norm/r.nspent*100:null;
    r.lost=Math.max(0,r.nspent-r.norm);
    r.workers=Object.keys(r.w).length;
  });
  return out;
}
/* Poslední známý název položky. */
function itemName(ean){
  const ids=Object.keys(S.production||{}).sort().reverse();
  for(const id of ids){const it=S.production[id].items&&S.production[id].items[ean];if(it&&it.name)return it.name;}
  return "";
}
/* Snímek ukazatelů pro případ a report (zaokrouhlený, ať se dá porovnat a uložit). */
function effMetrics(r){
  if(!r)return null;
  return {eff:r.eff==null?null:Math.round(r.eff*10)/10,nspent:Math.round(r.nspent),norm:Math.round(r.norm),
    spent:Math.round(r.spent),ks:Math.round(r.ks*100)/100,rows:r.rows,workers:r.workers};
}
/* Týdny s ručním zápisem nebo s EAN v evidenci práce, od nejnovějšího. */
function effWeeks(){
  const c=effCache();
  if(c.weeks)return c.weeks;
  const set=new Set(Object.keys((S.eff&&S.eff.weeks)||{}).filter(id=>weekEntries(id).length));
  Object.values(S.production||{}).forEach(pp=>{if(pp&&pp.items)Object.values(pp.items).forEach(it=>Object.keys(it.d).forEach(iso=>set.add(isoWeek(iso).id)));});
  return c.weeks=[...set].sort().reverse();
}

/* ---------- ruční zápis týdne ----------
   Uživatel zapisuje Top 5 ručně: EAN, název dílu, strávený čas a normu (v minutách).
   Plnění = norma ÷ strávený čas, neplnění = 100 % − plnění. Výpočet z evidence práce
   (weekRanking) platí jen pro týdny bez ručního zápisu a slouží k předvyplnění. */
function entryMetrics(e){
  const spent=Math.max(0,+e.spent||0),norm=Math.max(0,+e.norm||0);
  return {eff:spent>0?Math.round(norm/spent*1000)/10:null,nspent:Math.round(spent),norm:Math.round(norm),spent:Math.round(spent),ks:0,rows:0,workers:0};
}
/* Platné řádky ručního zápisu (EAN a strávený čas), od nejnižšího plnění. */
function weekEntries(id){
  const wk=S.eff&&S.eff.weeks&&S.eff.weeks[id];
  if(!wk)return [];
  return wk.items.filter(e=>e.ean&&+e.spent>0).map(e=>({...e,...entryMetrics(e),lost:Math.max(0,Math.round(e.spent-e.norm))}))
    .sort((a,b)=>a.eff-b.eff||b.lost-a.lost||(a.ean<b.ean?-1:1));
}
/* Top 5 týdne: ruční zápis, a když žádný není, výpočet z evidence práce s EAN. */
function weekTop(id){
  const manual=weekEntries(id);
  if(manual.length)return {src:"manual",items:manual.slice(0,EFF_TOP)};
  const rk=weekRanking(id);
  return {src:rk&&rk.top.length?"import":"",items:rk?rk.top:[]};
}
/* Převzetí výpočtu z evidence práce do ručního zápisu (dál jde upravit). */
function importWeekToManual(id,meta){
  const rk=weekRanking(id);
  if(!rk||!rk.top.length)return 0;
  S.eff.weeks[id]={items:rk.top.map(r=>({id:uid("e"),ean:r.ean,name:r.name||"",spent:Math.round(r.nspent),norm:Math.round(r.norm)})),
    at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60)};
  return rk.top.length;
}
/* Žebříček týdne: položky pod 100 % s aspoň `min` minutami práce s normou, od nejnižšího plnění. */
function weekRanking(id){
  const c=effCache();
  if(c.rank[id])return c.rank[id];
  const w=weekById(id);
  if(!w)return null;
  const stats=Object.values(itemStats(w.from,w.to));
  const st=effSet();
  const under=stats.filter(r=>r.eff!=null&&r.eff<100);
  const ranked=under.filter(r=>r.nspent>=st.min).sort((a,b)=>a.eff-b.eff||b.lost-a.lost||(a.ean<b.ean?-1:1));
  const sum=f=>stats.reduce((x,r)=>x+f(r),0);
  const norm=sum(r=>r.norm),nspent=sum(r=>r.nspent);
  return c.rank[id]={id,week:w,items:stats.length,withNorm:stats.filter(r=>r.eff!=null).length,ranked,top:ranked.slice(0,EFF_TOP),
    under:under.length,small:under.length-ranked.length,
    tot:{norm,nspent,spent:sum(r=>r.spent),ks:sum(r=>r.ks),eff:nspent>0&&norm>0?norm/nspent*100:null,lost:ranked.slice(0,EFF_TOP).reduce((x,r)=>x+r.lost,0)}};
}
/* Ve kterých týdnech byla položka v Top 5 (od nejstaršího). */
function topHistory(){
  const c=effCache();
  if(c.hist)return c.hist;
  const h={};
  effWeeks().slice().reverse().forEach(id=>weekTop(id).items.forEach(r=>(h[r.ean]||(h[r.ean]=[])).push(id)));
  return c.hist=h;
}
/* Plnění položky po týdnech až do týdne `id` (n týdnů zpět): z ručního zápisu, jinak
   z evidence práce; null = bez údaje. */
function itemTrend(ean,id,n=8){
  const out=[];
  for(let i=n-1;i>=0;i--){
    const wid=shiftWeek(id,-i),w=weekById(wid);
    const man=weekEntries(wid).find(e=>e.ean===ean);
    if(man){out.push({week:wid,eff:man.eff,nspent:man.nspent,src:"manual"});continue;}
    const r=itemStats(w.from,w.to,ean)[ean];
    out.push({week:wid,eff:r&&r.eff!=null?Math.round(r.eff*10)/10:null,nspent:r?Math.round(r.nspent):0,src:r?"import":""});
  }
  return out;
}
/* Kdo na položce v období pracoval (jména z evidence práce, spárovaná jako v hodnocení). */
function itemWorkers(ean,from,to){
  const r=itemStats(from,to,ean)[ean];
  if(!r)return [];
  const label=wk=>{
    let raw=wk;
    for(const pp of Object.values(S.production))if(pp.names&&pp.names[wk]){raw=pp.names[wk].name;break;}
    const key=prodKeyFor(raw);
    return key&&S.employees[key]?(S.employees[key].last+" "+S.employees[key].first).trim():prodLabel(raw);
  };
  return Object.entries(r.w).map(([wk,x])=>({key:wk,name:label(wk),spent:x.spent,norm:x.norm,nspent:x.nspent,ks:x.ks,
    eff:x.nspent>0&&x.norm>0?x.norm/x.nspent*100:null})).sort((a,b)=>b.nspent-a.nspent||(a.name<b.name?-1:1));
}

/* ---------- případy ---------- */
function effCase(id){return (S.eff.cases||[]).find(c=>c.id===id)||null;}
function caseLabel(c){return "P-"+c.no;}
function curRound(c){return c.rounds[c.rounds.length-1];}
/* Případ položky, který platí: poslední nezrušený (jedna položka = jeden případ). */
function caseOfItem(ean){
  return S.eff.cases.filter(c=>c.ean===ean&&!c.cancelled).sort((a,b)=>b.at-a.at)[0]||null;
}
/* Číslo smazaného případu se znovu nepoužije (S.eff.nos = nejvyšší smazané číslo za rok, 2.6). */
function nextCaseNo(at){
  const y=new Date(at).getFullYear();
  const n=S.eff.cases.reduce((m,c)=>c.no.startsWith(y+"-")?Math.max(m,+c.no.slice(5)||0):m,+((S.eff.nos||{})[y])||0)+1;
  return y+"-"+String(n).padStart(3,"0");
}
/* Záznam do historie případu. merge = opakovaná stejná úprava od téhož člověka do 10 minut
   jen posune čas (např. psaní příčiny). */
function effNote(c,meta,text,merge){
  const at=(meta&&meta.at)||Date.now(),by=String((meta&&meta.by)||"").slice(0,60),t=String(text).slice(0,500);
  const last=c.log[c.log.length-1];
  if(merge&&last&&last.t===t&&last.by===by&&at-last.at<10*60000){last.at=at;return;}
  c.log.push({at,by,t});
  if(c.log.length>500)c.log.splice(0,c.log.length-500);
}
function newRound(n,meta,extra){
  const st=effSet();
  return {n,at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60),reason:"",week:"",base:null,
    cat:"",cause:"",options:"",actions:[],v:[],d1:st.d1,d2:st.d2,p1:"",p2:"",p1why:"",p2why:"",...(extra||{})};
}
/* Ukazatele položky v týdnu: z ručního zápisu, jinak z evidence práce. */
function weekMetrics(ean,weekId){
  const w=weekById(weekId);
  if(!w)return null;
  const man=weekEntries(weekId).find(e=>e.ean===ean);
  return man?entryMetrics(man):effMetrics(itemStats(w.from,w.to,ean)[ean]);
}
/* Název dílu: z ručního zápisu (nejnovější), jinak z evidence práce. */
function effItemName(ean){
  const ids=Object.keys((S.eff&&S.eff.weeks)||{}).sort().reverse();
  for(const id of ids){const e=S.eff.weeks[id].items.find(x=>x.ean===ean&&x.name);if(e)return e.name;}
  return itemName(ean);
}
function createCase(ean,weekId,meta){
  const at=(meta&&meta.at)||Date.now(),m={...meta,at};
  const base=weekMetrics(ean,weekId);
  const c={id:uid("c"),no:nextCaseNo(at),ean,name:effItemName(ean),at,by:String(m.by||"").slice(0,60),
    week:weekById(weekId)?weekId:"",base,cancelled:null,rounds:[],log:[],comments:[]};
  c.rounds.push(newRound(1,m,{week:c.week,base}));
  effNote(c,m,"Případ založen"+(c.week?" z Top 5 "+weekName(c.week)+(base&&base.eff!=null?", plnění "+nf(base.eff,1)+" %":""):""));
  S.eff.cases.push(c);
  return c;
}
/* Komentáře o vývoji případu (2.19): co se děje, co se domluvilo, na co se čeká. Každý zápis
   jde i do historie případu (a odtud do historie změn). round = kolo, ke kterému komentář patří. */
const CASE_COMMENT_MAX=2000;
function commentShort(t){t=String(t).replace(/\s+/g," ").trim();return t.length>120?t.slice(0,117)+"…":t;}
function addCaseComment(c,text,meta){
  const t=String(text==null?"":text).trim().slice(0,CASE_COMMENT_MAX);
  if(!t)return null;
  const at=(meta&&meta.at)||Date.now();
  const x={id:uid("k"),at,by:String((meta&&meta.by)||"").slice(0,60),text:t,round:curRound(c).n,ed:null};
  c.comments.push(x);
  if(c.comments.length>500)c.comments.splice(0,c.comments.length-500);
  effNote(c,{...meta,at},"Komentář: „"+commentShort(t)+"“");
  return x;
}
function editCaseComment(c,id,text,meta){
  const x=c.comments.find(k=>k.id===id);
  const t=String(text==null?"":text).trim().slice(0,CASE_COMMENT_MAX);
  if(!x||!t||t===x.text)return false;
  const at=(meta&&meta.at)||Date.now();
  x.text=t;x.ed={at,by:String((meta&&meta.by)||"").slice(0,60)};
  effNote(c,{...meta,at},"Upraven komentář z "+dayText(todayIso(x.at))+": „"+commentShort(t)+"“");
  return true;
}
function deleteCaseComment(c,id,meta){
  const x=c.comments.find(k=>k.id===id);
  if(!x)return false;
  c.comments=c.comments.filter(k=>k!==x);
  effNote(c,meta,"Smazán komentář z "+dayText(todayIso(x.at))+": „"+commentShort(x.text)+"“");
  return true;
}
function lastComment(c){return c.comments&&c.comments.length?c.comments[c.comments.length-1]:null;}
/* Nové kolo v témž případu: původní řešení nestačilo (nebo se položka vrátila do Top 5). */
function reopenCase(c,reason,weekId,meta){
  const at=(meta&&meta.at)||Date.now(),m={...meta,at};
  const n=c.rounds.length+1;
  const base=weekMetrics(c.ean,weekId);
  c.rounds.push(newRound(n,m,{reason:String(reason||"").slice(0,1000),week:weekById(weekId)?weekId:"",base}));
  if(c.cancelled)c.cancelled=null;
  effNote(c,m,"Znovu otevřeno, kolo "+n+(base&&base.eff!=null?" ("+weekName(weekId)+", plnění "+nf(base.eff,1)+" %)":"")+": "+reason);
  return c;
}
function cancelCase(c,reason,meta){
  c.cancelled={at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60),reason:String(reason||"").slice(0,500)};
  effNote(c,meta,"Případ zrušen: "+reason);
}
function restoreCase(c,meta){c.cancelled=null;effNote(c,meta,"Zrušení případu vráceno");}
/* Definitivní smazání (2.6), jen u zrušeného případu: zmizí ze seznamu, souhrnů a termínů
   i z vydaných reportů (položka v žebříčku tam zůstane, jen bez odkazu na případ). Nikde se
   už nepočítá; v historii změn zůstane jen záznam o smazání (describeChanges). */
function deleteCase(id){
  const c=effCase(id);
  if(!c||!c.cancelled)return false;
  S.eff.cases=S.eff.cases.filter(x=>x.id!==id);
  const y=c.no.slice(0,4);
  S.eff.nos=S.eff.nos||{};
  S.eff.nos[y]=Math.max(+S.eff.nos[y]||0,+c.no.slice(5)||0);
  (S.eff.reports||[]).forEach(r=>{
    const d=r.data||{};
    (d.top||[]).forEach(t=>{if(t.case===id)t.case="";});
    if(Array.isArray(d.cases))d.cases=d.cases.filter(x=>x.id!==id);
    if(Array.isArray(d.deadlines))d.deadlines=d.deadlines.filter(x=>x.case!==id);
  });
  return true;
}
/* Datum, kdy byla hotová všechna opatření kola (poslední splněné), jinak "". */
/* Opatření bez textu (rozepsaný řádek) se nepočítají. */
function liveActions(r){return r.actions.filter(a=>String(a.text||"").trim());}
function roundDone(r){
  const list=liveActions(r);
  if(!list.length||list.some(a=>!a.done))return "";
  return list.reduce((m,a)=>a.done>m?a.done:m,"");
}
/* Termíny kola: 1. ověření d1 dní po dokončení opatření, 2. ověření d2 dní po provedeném
   1. ověření. Ručně posunutý termín (p1, p2) má přednost. */
function roundPlan(r){
  const done=roundDone(r),v1=r.v[0]||null,v2=r.v[1]||null;
  const p1=done?(r.p1||addDays(done,r.d1)):"";
  const p2=v1&&v1.result==="ok"&&v1.done?(r.p2||addDays(v1.done,r.d2)):"";
  return {done,p1,p2,v1,v2};
}
function caseState(c,today){
  today=today||todayIso();
  if(c.cancelled)return {k:"zrus",label:EFF_STATES.zrus,due:"",late:false,round:curRound(c).n,closed:""};
  const r=curRound(c),p=roundPlan(r);
  let k="new",due="",closed="";
  if(r.v.some(x=>x&&x.result==="fail")){k="fail";closed=r.v.find(x=>x&&x.result==="fail").done;}
  else if(p.v2&&p.v2.result==="ok"){k="ok";closed=p.v2.done;}
  else if(p.v1&&p.v1.result==="ok"){k="v2";due=p.p2;}
  else if(p.done){k="v1";due=p.p1;}
  else if(liveActions(r).length){k="act";due=liveActions(r).filter(a=>!a.done&&a.due).map(a=>a.due).sort()[0]||"";}
  return {k,label:EFF_STATES[k],due,late:!!due&&due<today,round:r.n,closed};
}
/* Období, ze kterého se měří účinnost: 1. ověření od dne po dokončení opatření, 2. ověření
   od dne po 1. ověření; do data ověření (nebo do plánovaného termínu). */
function verifyWindow(r,idx,date){
  const p=roundPlan(r);
  if(idx===0)return p.done?{from:addDays(p.done,1),to:date||(r.v[0]&&r.v[0].done)||p.p1}:null;
  return p.v1&&p.v1.result==="ok"?{from:addDays(p.v1.done,1),to:date||(r.v[1]&&r.v[1].done)||p.p2}:null;
}
function measureItem(ean,from,to){
  if(!from||!to||from>to)return null;
  const m=effMetrics(itemStats(from,to,ean)[ean]);
  return m&&m.nspent>0?m:null;
}
/* Zapíše provedené ověření s plněním za období (snímek, ať pozdější import nezmění záznam).
   manual = ručně zapsaný strávený čas a norma za období {spent, norm} v minutách; bez něj se
   plnění vezme z evidence práce, pokud v ní položka je. */
function recordVerify(c,idx,date,result,note,meta,manual){
  const r=curRound(c),win=verifyWindow(r,idx,date);
  if(!win)throw new Error(idx?"Druhé ověření jde až po účinném prvním.":"Ověření jde až po dokončení všech opatření.");
  const m=manual&&+manual.spent>0?entryMetrics(manual):measureItem(c.ean,win.from,win.to);
  const p=roundPlan(r);
  r.v[idx]={done:date,result:result==="ok"?"ok":"fail",note:String(note||"").slice(0,1000),from:win.from,to:win.to,
    plan:idx?p.p2:p.p1,eff:m?m.eff:null,nspent:m?m.nspent:0,norm:m?m.norm:0,ks:m?m.ks:0,rows:m?m.rows:0,
    src:manual&&+manual.spent>0?"manual":m?"import":"",
    at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60)};
  r.v.length=idx+1;
  effNote(c,meta,(idx?"2.":"1.")+" ověření "+dayText(date)+": "+(result==="ok"?"účinné":"neúčinné")
    +(m&&m.eff!=null?" (plnění "+nf(m.eff,1)+" % za "+dayText(win.from,false)+"–"+dayText(win.to)+")":" (bez hodnot za období)")+(note?". "+note:""));
}
function undoVerify(c,idx,meta){
  const r=curRound(c);
  if(!r.v[idx])return;
  r.v.length=idx;
  effNote(c,meta,"Zrušen záznam "+(idx?"2.":"1.")+" ověření");
}

/* ---------- souhrny, termíny, reporty ---------- */
/* Termíny: plánovaná ověření a opatření s termínem, od nejbližšího. */
function effDeadlines(today,horizon){
  today=today||todayIso();
  const out=[];
  S.eff.cases.forEach(c=>{
    const s=caseState(c,today);
    if(s.k==="zrus"||s.k==="ok"||s.k==="fail")return;
    if((s.k==="v1"||s.k==="v2")&&s.due)out.push({date:s.due,kind:s.k,case:c.id,text:s.k==="v1"?"1. ověření účinnosti":"2. ověření účinnosti",owner:""});
    liveActions(curRound(c)).filter(a=>!a.done&&a.due).forEach(a=>out.push({date:a.due,kind:a.kind,case:c.id,text:a.text,owner:a.owner}));
  });
  return out.filter(x=>!horizon||x.date<=addDays(today,horizon)).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0)
    .map(x=>({...x,late:x.date<today}));
}
/* Plnění před a po: při zjištění (kolo 1) a poslední ověření s daty. */
function caseBeforeAfter(c){
  const first=c.rounds[0]&&c.rounds[0].base;
  let after=null;
  c.rounds.forEach(r=>r.v.forEach(v=>{if(v&&v.eff!=null)after=v;}));
  return {before:first&&first.eff!=null?first.eff:null,after:after?after.eff:null,afterDate:after?after.done:""};
}
function effSummary(today){
  today=today||todayIso();
  const list=S.eff.cases.map(c=>({c,s:caseState(c,today)}));
  const n=k=>list.filter(x=>x.s.k===k).length;
  const verifs=S.eff.cases.flatMap(c=>c.rounds.flatMap(r=>r.v.filter(v=>v&&v.result)));
  const closed=list.filter(x=>x.s.k==="ok");
  const lead=closed.map(x=>daysBetween(todayIso(x.c.at),x.s.closed)).filter(d=>d>=0);
  return {total:list.length,open:n("new")+n("act"),verify:n("v1")+n("v2"),fail:n("fail"),ok:n("ok"),zrus:n("zrus"),
    reopened:S.eff.cases.filter(c=>c.rounds.length>1).length,verifs:verifs.length,verifOk:verifs.filter(v=>v.result==="ok").length,
    leadAvg:lead.length?lead.reduce((a,b)=>a+b,0)/lead.length:null,
    lost:S.eff.cases.reduce((x,c)=>x+c.rounds.reduce((y,r)=>y+(r.base?Math.max(0,r.base.nspent-r.base.norm):0),0),0),
    late:effDeadlines(today).filter(x=>x.late).length};
}
/* Kopie případu do vydaného reportu (bez historie, ta je v případu). */
function caseCopy(c){const x=JSON.parse(JSON.stringify(c));delete x.log;delete x.comments;return x;}
/* Obsah týdenního reportu: žebříček, ukazatele a stav řešení k okamžiku vydání. */
function weekReportData(id,today){
  today=today||todayIso();
  const w=weekById(id),hist=topHistory();
  if(!w)return null;
  const wt=weekTop(id),rk=wt.src==="import"?weekRanking(id):null;
  const top=wt.items.map((r,i)=>{
    const c=caseOfItem(r.ean);
    const workers=wt.src==="import"?itemWorkers(r.ean,w.from,w.to).filter(x=>x.eff!=null).map(x=>x.eff):[];
    const m=wt.src==="manual"?entryMetrics(r):effMetrics(r);
    return {rank:i+1,ean:r.ean,name:r.name||effItemName(r.ean),...m,lost:Math.round(r.lost),
      wmin:workers.length?Math.round(Math.min(...workers)):null,wmax:workers.length?Math.round(Math.max(...workers)):null,
      times:(hist[r.ean]||[]).filter(x=>x<=id).length,trend:itemTrend(r.ean,id,6).map(x=>x.eff),case:c?c.id:""};
  });
  const ids=[...new Set(top.map(t=>t.case).filter(Boolean))];
  const norm=top.reduce((x,t)=>x+t.norm,0),nspent=top.reduce((x,t)=>x+t.nspent,0);
  return {week:id,src:wt.src,items:rk?rk.items:null,under:rk?rk.under:null,small:rk?rk.small:null,
    tot:{eff:nspent>0?Math.round(norm/nspent*1000)/10:null,norm:Math.round(norm),nspent:Math.round(nspent),lost:top.reduce((x,t)=>x+t.lost,0),ks:Math.round(top.reduce((x,t)=>x+(t.ks||0),0))},
    top,cases:ids.map(i=>caseCopy(effCase(i))),settings:{...effSet()},
    deadlines:effDeadlines(today,21).map(x=>{const c=effCase(x.case);return {...x,no:c?c.no:"",ean:c?c.ean:""};}),
    summary:effSummary(today)};
}
/* Vydání týdenního reportu: uloží snímek. Když se obsah od poslední revize nezměnil,
   zůstane původní; jinak vznikne nová revize (starší obsah se nahradí, počet revizí zůstane). */
function issueWeekReport(id,meta){
  const data=weekReportData(id);
  if(!data)return null;
  const old=S.eff.reports.find(r=>r.week===id);
  const comparable=d=>JSON.stringify({...d,summary:null,deadlines:null});
  if(old&&comparable(old.data)===comparable(data))return old;
  const rep={id:old?old.id:uid("r"),week:id,rev:old?old.rev+1:1,at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60),data};
  S.eff.reports=S.eff.reports.filter(r=>r.week!==id).concat(rep).sort((a,b)=>a.week<b.week?-1:1);
  return rep;
}

/* ---------- kontrola dat (sanitizeState) ---------- */
function cleanEff(input){
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const arr=v=>Array.isArray(v)?v:[];
  const str=(v,max)=>String(v==null?"":v).slice(0,max);
  const num=(v,d,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?clamp(n,lo,hi):d;};
  const int=(v,d,lo,hi)=>Math.round(num(v,d,lo,hi));
  const day=v=>ISO_DAY.test(String(v))?String(v):"";
  const week=v=>WEEK_ID.test(String(v))?String(v):"";
  const o=obj(input),st=obj(o.settings);
  const metrics=m=>{
    if(!m||typeof m!=="object")return null;
    return {eff:m.eff==null||m.eff===""||!Number.isFinite(Number(m.eff))?null:Math.round(num(m.eff,0,0,1000)*10)/10,
      nspent:num(m.nspent,0,0,1e9),norm:num(m.norm,0,0,1e9),spent:num(m.spent,0,0,1e9),ks:num(m.ks,0,0,1e12),
      rows:int(m.rows,0,0,1e9),workers:int(m.workers,0,0,1e6)};
  };
  const round=(r,i)=>{
    r=obj(r);
    const v=[];
    for(const x of arr(r.v).slice(0,2)){
      if(!x||typeof x!=="object"||!day(x.done))break;
      v.push({done:day(x.done),result:x.result==="ok"?"ok":"fail",note:str(x.note,1000),from:day(x.from),to:day(x.to),plan:day(x.plan),
        eff:x.eff==null||!Number.isFinite(Number(x.eff))?null:Math.round(num(x.eff,0,0,1000)*10)/10,
        nspent:num(x.nspent,0,0,1e9),norm:num(x.norm,0,0,1e9),ks:num(x.ks,0,0,1e12),rows:int(x.rows,0,0,1e9),
        src:x.src==="manual"||x.src==="import"?x.src:"",at:num(x.at,0,0,1e15),by:str(x.by,60)});
      if(v[v.length-1].result!=="ok")break;
    }
    return {n:i+1,at:num(r.at,0,0,1e15),by:str(r.by,60),reason:str(r.reason,1000),week:week(r.week),base:metrics(r.base),
      cat:EFF_CATS.some(c=>c[0]===r.cat)?r.cat:"",cause:str(r.cause,4000),options:str(r.options,4000),
      actions:arr(r.actions).filter(a=>a&&typeof a==="object").slice(0,100).map(a=>({
        id:typeof a.id==="string"&&SAFE_ID.test(a.id)?a.id:uid("a"),kind:a.kind==="process"?"process":"now",
        text:str(a.text,1000),owner:str(a.owner,120),due:day(a.due),done:day(a.done),note:str(a.note,500)})),
      v,d1:int(r.d1,EFF_DEFAULTS.d1,1,365),d2:int(r.d2,EFF_DEFAULTS.d2,1,365),p1:day(r.p1),p2:day(r.p2),
      p1why:str(r.p1why,300),p2why:str(r.p2why,300)};
  };
  const kase=c=>{
    c=obj(c);
    const rounds=arr(c.rounds).slice(0,50).map(round);
    const ean=itemKey(c.ean);
    if(!ean||!CASE_NO.test(String(c.no))||!rounds.length)return null;
    const cc=c.cancelled&&typeof c.cancelled==="object"?{at:num(c.cancelled.at,0,0,1e15),by:str(c.cancelled.by,60),reason:str(c.cancelled.reason,500)}:null;
    return {id:typeof c.id==="string"&&SAFE_ID.test(c.id)?c.id:uid("c"),no:String(c.no),ean,name:str(c.name,120),
      at:num(c.at,0,0,1e15),by:str(c.by,60),week:week(c.week),base:metrics(c.base),cancelled:cc,rounds,
      log:arr(c.log).filter(e=>e&&typeof e==="object"&&typeof e.t==="string").slice(-500).map(e=>({at:num(e.at,0,0,1e15),by:str(e.by,60),t:str(e.t,500)})),
      comments:arr(c.comments).filter(k=>k&&typeof k==="object"&&typeof k.text==="string"&&k.text.trim()).slice(-500).map(k=>({
        id:typeof k.id==="string"&&SAFE_ID.test(k.id)?k.id:uid("k"),at:num(k.at,0,0,1e15),by:str(k.by,60),text:str(k.text,CASE_COMMENT_MAX).trim(),
        round:int(k.round,1,1,50),ed:k.ed&&typeof k.ed==="object"?{at:num(k.ed.at,0,0,1e15),by:str(k.ed.by,60)}:null}))};
  };
  const cases=[],seenId=new Set(),seenNo=new Set();
  arr(o.cases).slice(0,5000).forEach(c=>{
    const x=kase(c);
    if(!x||seenId.has(x.id)||seenNo.has(x.no))return;
    seenId.add(x.id);seenNo.add(x.no);cases.push(x);
  });
  const reports=[];
  arr(o.reports).forEach(r=>{
    r=obj(r);const d=obj(r.data);
    if(!week(r.week)||reports.some(x=>x.week===r.week))return;
    const top=arr(d.top).slice(0,EFF_TOP).map((t,i)=>{t=obj(t);return {rank:i+1,ean:itemKey(t.ean),name:str(t.name,120),...(metrics(t)||metrics({})),
      lost:num(t.lost,0,0,1e9),wmin:t.wmin==null?null:int(t.wmin,0,0,1000),wmax:t.wmax==null?null:int(t.wmax,0,0,1000),times:int(t.times,0,0,1000),
      trend:arr(t.trend).slice(0,12).map(x=>x==null||!Number.isFinite(Number(x))?null:Math.round(num(x,0,0,1000)*10)/10),
      case:typeof t.case==="string"&&SAFE_ID.test(t.case)?t.case:""};}).filter(t=>t.ean);
    const tot=obj(d.tot);
    const optInt=v=>v==null||v===""||!Number.isFinite(Number(v))?null:int(v,0,0,1e6);
    reports.push({id:typeof r.id==="string"&&SAFE_ID.test(r.id)?r.id:uid("r"),week:r.week,rev:int(r.rev,1,1,1000),
      at:num(r.at,0,0,1e15),by:str(r.by,60),data:{week:r.week,src:d.src==="manual"||d.src==="import"?d.src:"",items:optInt(d.items),under:optInt(d.under),small:optInt(d.small),
        tot:{eff:tot.eff==null||!Number.isFinite(Number(tot.eff))?null:Math.round(num(tot.eff,0,0,1000)*10)/10,norm:num(tot.norm,0,0,1e12),
          nspent:num(tot.nspent,0,0,1e12),lost:num(tot.lost,0,0,1e12),ks:num(tot.ks,0,0,1e12)},
        top,cases:arr(d.cases).slice(0,EFF_TOP).map(kase).filter(Boolean).map(c=>{delete c.log;delete c.comments;return c;}),
        settings:{min:int(obj(d.settings).min,EFF_DEFAULTS.min,0,6000),target:int(obj(d.settings).target,EFF_DEFAULTS.target,1,200),
          d1:int(obj(d.settings).d1,EFF_DEFAULTS.d1,1,365),d2:int(obj(d.settings).d2,EFF_DEFAULTS.d2,1,365),unit:obj(d.settings).unit==="min"?"min":"h"},
        deadlines:arr(d.deadlines).slice(0,200).map(x=>{x=obj(x);return {date:day(x.date),kind:["v1","v2","now","process"].includes(x.kind)?x.kind:"now",
          case:typeof x.case==="string"&&SAFE_ID.test(x.case)?x.case:"",text:str(x.text,1000),owner:str(x.owner,120),late:!!x.late,
          no:CASE_NO.test(String(x.no))?String(x.no):"",ean:itemKey(x.ean)};}).filter(x=>x.date),
        summary:d.summary&&typeof d.summary==="object"?Object.fromEntries(["total","open","verify","fail","ok","zrus","reopened","verifs","verifOk","lost","late"]
          .map(k=>[k,num(d.summary[k],0,0,1e12)]).concat([["leadAvg",d.summary.leadAvg==null?null:num(d.summary.leadAvg,0,0,1e6)]])):null}});
  });
  /* ruční zápis týdnů: nejvýš 5 řádků (rozepsané řádky bez EAN zůstanou, ať se neztratí) */
  const weeks={};
  Object.entries(obj(o.weeks)).forEach(([id,wk])=>{
    if(!week(id))return;
    wk=obj(wk);
    const items=arr(wk.items).filter(e=>e&&typeof e==="object").slice(0,EFF_TOP).map(e=>({
      id:typeof e.id==="string"&&SAFE_ID.test(e.id)?e.id:uid("e"),ean:itemKey(e.ean),name:str(e.name,120),
      spent:Math.round(num(e.spent,0,0,1e7)*100)/100,norm:Math.round(num(e.norm,0,0,1e7)*100)/100}));
    if(items.length)weeks[id]={items,at:num(wk.at,0,0,1e15),by:str(wk.by,60)};
  });
  const nos={};
  Object.entries(obj(o.nos)).slice(0,200).forEach(([y,n])=>{if(/^\d{4}$/.test(y))nos[y]=int(n,0,0,999999);});
  return {weeks,cases,reports:reports.sort((a,b)=>a.week<b.week?-1:1).slice(-400),
    settings:{min:int(st.min,EFF_DEFAULTS.min,0,6000),target:int(st.target,EFF_DEFAULTS.target,1,200),
      d1:int(st.d1,EFF_DEFAULTS.d1,1,365),d2:int(st.d2,EFF_DEFAULTS.d2,1,365),unit:st.unit==="min"?"min":"h"},nos};
}

