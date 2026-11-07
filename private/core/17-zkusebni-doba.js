/* ==========================================================================
   ZKUŠEBNÍ DOBA (verze 2.52)
   Začátek = první den, kdy o člověku evidujeme, že pracoval: hodiny v docházce (bez kódu
   nepřítomnosti) nebo příchod v souboru Docházka a výkony. Zkušební doba je vždy 3 měsíce
   (konec = stejný den o 3 měsíce později − 1 den, 1. 10. → 31. 12.; když takový den
   v měsíci není, poslední den měsíce, 31. 1. → 30. 4.).
   Kdo má první záznam už v prvním dni evidence vůbec, mohl u nás pracovat dřív: začátek
   neznáme a zkušební dobu neukazujeme. Počítá se z dat, nic se neukládá.
   ========================================================================== */
const PROB_MONTHS=3;
let probCache={sig:"",map:null,first:""};
function probSig(){
  const pres=((S.workAudit||{}).dv||{}).pres||{};
  return Object.keys(S.periods||{}).sort().map(m=>m+":"+(S.periods[m].at||0)+":"+Object.keys(S.periods[m].rows||{}).length).join(",")+"|"+Object.keys(pres).length+"|"+Object.keys(S.employees||{}).length+"|"+Object.values(S.employees||{}).map(e=>e.wid||"").join(",").length+"|"+JSON.stringify(S.attEdits||{}).length;
}
/** Mapa klíč člověka → první evidovaný den práce, a první den evidence vůbec. */
function probStarts(){
  const sig=probSig();
  if(probCache.map&&probCache.sig===sig)return probCache;
  const map=new Map();let first="";
  const put=(k,iso)=>{if(!k||!iso)return;const o=map.get(k);if(!o||iso<o)map.set(k,iso);if(!first||iso<first)first=iso;};
  Object.values(S.periods||{}).forEach(p=>{
    (p.days||[]).forEach((iso,i)=>{
      Object.entries(p.rows||{}).forEach(([k,r])=>{if((+r.h[i]||0)>0&&!r.c[i])put(k,iso);});
    });
  });
  const pres=((S.workAudit||{}).dv||{}).pres||{};
  const isos=Object.keys(pres).sort();
  if(isos.length){
    const wmap=dvWidMap();
    isos.forEach(iso=>Object.entries(pres[iso]||{}).forEach(([wid,v])=>{
      if(!v||v[0]==null)return;
      const e=wmap.get(wid);
      if(e)put(e.key,iso);else if(!first||iso<first)first=iso;
    }));
  }
  probCache={sig,map,first};
  return probCache;
}
/** Konec zkušební doby: o PROB_MONTHS měsíců později − 1 den, bez takového dne konec měsíce. */
function probEnd(start){
  const [y,m,d]=start.split("-").map(Number);
  const last=new Date(Date.UTC(y,m-1+PROB_MONTHS+1,0)).getUTCDate();
  // den, který v cílovém měsíci není (31. 1. → duben), = poslední den měsíce, jinak o den dřív
  return d>last?isoOf(Date.UTC(y,m-1+PROB_MONTHS,last)):isoOf(Date.UTC(y,m-1+PROB_MONTHS,d)-864e5);
}
/** Zkušební doba člověka k dnešku: null = už skončila, začátek neznáme nebo nemá záznam. */
function probationOf(e,today){
  if(!e)return null;
  const P=probStarts(),start=P.map.get(e.key);
  if(!start||start<=P.first)return null;
  const end=probEnd(start);
  today=today||todayIso();
  if(today>end)return null;
  return {start,end,left:tkDays(today,end)};
}
function probText(x){
  const n=x.left;
  return "Ve zkušební době · u nás pracuje od "+dayText(x.start)+" · zkušební doba končí "+dayText(x.end)+(n===0?" (dnes)":n===1?" (zítra)":" (za "+n+(n<=4?" dny)":" dní)"));
}

function endDeptOf(e){return isLead(e)?"Vedoucí":empDept(e)||"Bez skupiny";}
function endsOverview(today,n){
  today=today||todayIso();n=n||12;
  const months=[];let y=+today.slice(0,4),m=+today.slice(5,7);
  for(let i=0;i<n;i++){months.push(y+"-"+String(m).padStart(2,"0"));m++;if(m>12){m=1;y++;}}
  /* vedoucí se nepočítají (2.45.2, přání uživatele) */
  const people=Object.values(S.employees).filter(e=>!e.excluded&&!isLead(e));
  const order=[...departments(),"Bez skupiny"];
  /* zkušenost (2.45.2): zaškolený = procento dovedností skupiny aspoň hranice zaškolení z KPI
     (waTrain, stejně jako Kapacity a zaškolení), v zácviku = pod ní, none = bez skupiny */
  const lim=waTrain().pct;
  const item=e=>{const p=e.positionId?S.positions.find(x=>x.id===e.positionId):null,pct=p&&isGroup(p)?skillPct(e,p):null;
    return {key:e.key,name:(e.last+" "+e.first).trim(),wid:e.wid||"",dept:endDeptOf(e),group:p?p.name:"",shift:e.shift||"",sick:!!e.sick,end:e.end||"",days:e.end?daysBetween(today,e.end):null,
      pct,st:pct==null?"none":pct>=lim?"ok":"tr"};};
  const stOf=list=>{const o={ok:0,tr:0,none:0};list.forEach(x=>{o[x.st]++;});return o;};
  const all=people.map(item);
  const deptNames=order.filter(d=>all.some(x=>x.dept===d));
  all.forEach(x=>{if(!deptNames.includes(x.dept))deptNames.push(x.dept);});
  const byEnd=(a,b)=>a.end.localeCompare(b.end)||a.name.localeCompare(b.name,"cs");
  const overdue=all.filter(x=>x.end&&x.end<today).sort(byEnd),noEnd=all.filter(x=>!x.end).sort((a,b)=>a.name.localeCompare(b.name,"cs"));
  const last=months[months.length-1];
  const later=all.filter(x=>x.end&&x.end.slice(0,7)>last).sort(byEnd);
  const mo=months.map(id=>{const list=all.filter(x=>x.end&&x.end>=today&&x.end.slice(0,7)===id).sort(byEnd);
    return {m:id,total:list.length,people:list,st:stOf(list),byDept:Object.fromEntries(deptNames.map(d=>[d,list.filter(x=>x.dept===d)]))};});
  const depts=deptNames.map(d=>{
    const head=all.filter(x=>x.dept===d).length,od=overdue.filter(x=>x.dept===d).length;
    let left=od;const leave=mo.map(x=>x.byDept[d].length),remain=leave.map(c=>{left+=c;return head-left;});
    const mine=all.filter(x=>x.dept===d),gone=[...overdue,...mo.flatMap(x=>x.people)].filter(x=>x.dept===d);
    return {name:d,head,overdue:od,leave,remain,later:later.filter(x=>x.dept===d).length,noEnd:noEnd.filter(x=>x.dept===d).length,st:stOf(mine),goneSt:stOf(gone)};
  });
  const gone=[...overdue,...mo.flatMap(x=>x.people)],goneKeys=new Set(gone.map(x=>x.key));
  return {today,months:mo,depts,overdue,noEnd,later,head:all.length,lim,
    st:{head:stOf(all),gone:stOf(gone),stay:stOf(all.filter(x=>!goneKeys.has(x.key))),overdue:stOf(overdue)},
    next3:mo.slice(0,3).reduce((s,x)=>s+x.total,0),thisMonth:mo[0]?mo[0].total:0,leaving:mo.reduce((s,x)=>s+x.total,0)};
}
/** Excel: oddělení × měsíce a seznam lidí. */
function endsSheets(ov){
  const head=["Oddělení","Teď lidí","Po termínu",...ov.months.map(x=>monthLabel(x.m)),"Později","Bez data","Zůstane po "+ov.months.length+" měs."];
  const rows=ov.depts.map(d=>[d.name,d.head,d.overdue,...d.leave,d.later,d.noEnd,d.remain[d.remain.length-1]]);
  const tot=["Celkem",ov.head,ov.overdue.length,...ov.months.map(x=>x.total),ov.later.length,ov.noEnd.length,ov.depts.reduce((s,d)=>s+d.remain[d.remain.length-1],0)];
  const list=[...ov.overdue,...ov.months.flatMap(x=>x.people),...ov.later,...ov.noEnd];
  return [{name:"Po měsících",rows:[["Konce trestů – odchody po měsících a odděleních, stav k "+endDateText(ov.today)],[],head,...rows,tot]},
    {name:"Lidé",rows:[["Příjmení a jméno","ID","Oddělení","Skupina","Zkušenost","Dovednosti %","Směna","Konec trestu","Za dní"],
      ...list.map(x=>[x.name,x.wid,x.dept,x.group,END_ST[x.st],x.pct==null?"":Math.round(x.pct),x.sick?"NEMOC":shiftName(x.shift),x.end?endDateText(x.end):"",x.days==null?"":x.days])]}];
}
/** Ukázka pro AI (2.43): jen nadpisy, typy buněk a texty sloupce směnnosti (jen když je to
    výčet do 20 hodnot, ať neodejdou jména). Konce trestů ani jména se neposílají. */
function endAiSample(sheet,cols,employees){
  const s=dvAiSample([sheet],employees)[0]||{name:"",rows:[]};
  /* konec trestu je citlivý údaj: z dat zůstane jen typ */
  s.rows=s.rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,/^<datum/.test(v)?"<datum>":/^\d{1,2}\.\s?\d{1,2}\.\s?\d{2,4}$/.test(v)?"<datum>":v])));
  cols=Object.assign({},END_COLS,cols||{});
  const ix=waIndex(cols.shift),vals=new Map();
  (sheet.aoa||[]).slice(0,5000).forEach(r=>{const t=String((r||[])[ix]==null?"":(r||[])[ix]).replace(/\s+/g," ").trim();if(t&&t.length<=40&&!/\d{3,}/.test(t))vals.set(endKey(t),t);});
  const labels=vals.size<=20?maskNamesMany([...vals.values()],employees||[]).texts:[];
  return {sheet:s,labels};
}

/* ---------- od listopadu 2026 jediný zdroj (2.42) ----------
   Soubor Docházka a výkony plní za měsíce od DV_FROM docházku pro odměny (S.periods), evidenci
   práce místo Výroby (S.production) a obsazenost s kusy v KPI. Říjen 2026 a dřív zůstává
   ze starých souborů (přání uživatele: „tento měsíc říjen bude ještě docházka po staru“). */
let DV_FROM="2026-11";   // let jen kvůli starším e2e testům se soubory za listopad (posunou hranici)
/** Měsíc nebo den, který se plní ze souboru docházky a výkonů. */
function dvOwns(x){return !!x&&String(x).slice(0,7)>=DV_FROM;}
/* Zaokrouhlení příchodu a odchodu (2.46, přání uživatele): ranní směna 6:00–14:00, odpolední
   14:00–22:00 (podle příchodu, před 12:00 ranní; od 21:00 noční 22:00–6:00). Příchod do 15 minut po začátku (i dřívější)
   = začátek směny, pozdější nahoru na čtvrthodinu (7:31 → 7:45). Odchod od 15 minut před
   koncem = konec směny, dřívější dolů na čtvrthodinu. Hodiny nejvýš 7,5. Uložené časy ze
   souboru se nemění, zaokrouhluje se jen výpočet. */
const DV_SHIFT_AM=360,DV_SHIFT_PM=840,DV_SHIFT_LEN=480,DV_GRACE=15,DV_MAX_H=7.5;
function dvRound(a,b){
  if(a==null||b==null)return null;
  // směna podle příchodu: před 12:00 ranní, před 21:00 odpolední, jinak noční 22:00–6:00
  const s=a<DV_PM_FROM?DV_SHIFT_AM:a<1260?DV_SHIFT_PM:1320,e=s+DV_SHIFT_LEN;
  const ra=a<=s+DV_GRACE?s:Math.ceil(a/15)*15;
  let d=b<a?b+1440:b;
  let rb=d>=e-DV_GRACE?e:Math.floor(d/15)*15;
  if(rb<ra)rb=ra;
  return [ra%1440,rb%1440,ra,rb];
}
/** Odpracované hodiny dne z příchodu a odchodu: zaokrouhlený pobyt (dvRound) minus přestávka
    30 min (vždy, přání uživatele), nejvýš 7,5 h. Bez odchodu nebo příchodu délka směny. */
function dvHours(a,b){
  if(a==null&&b==null)return 0;
  const r=dvRound(a,b);
  if(!r)return Math.min(DV_MAX_H,S.settings.shift);
  const net=Math.max(0,r[3]-r[2]-30);
  return Math.round(Math.min(DV_MAX_H,net/60)*100)/100;
}
/** Hodiny v docházce (od listopadu ze souboru Docházka a výkony) spočítané před zaokrouhlením
    (2.46): dny s příchodem, kde se uložené hodiny liší od dvHours. apply = přepsat. */
function dvRehours(apply){
  const dv=(S.workAudit||{}).dv;
  if(!dv||!dv.pres)return {cells:0,people:0,months:[]};
  const map=dvWidMap(),byKey=new Map();
  map.forEach((e,wid)=>{if(e)byKey.set(e.key,wid);});
  let cells=0;const people=new Set(),months=new Set();
  Object.keys(S.periods||{}).filter(dvOwns).forEach(m=>{
    const p=S.periods[m];
    Object.entries(p.rows||{}).forEach(([k,r])=>{
      const wid=byKey.get(k);if(!wid)return;
      p.days.forEach((iso,i)=>{
        const v=(dv.pres[iso]||{})[wid];if(!v||r.c[i]||attLocked(m,iso)||attEditOf(m,k,iso))return;
        const h=dvHours(v[0],v[1]);
        if(Math.abs((+r.h[i]||0)-h)<0.005)return;
        cells++;people.add(k);months.add(m);
        if(apply)r.h[i]=h;
      });
    });
  });
  return {cells,people:people.size,months:[...months].sort()};
}
/** Docházka pro odměny: dny ze souboru nahradí v měsíci stejné dny, ostatní dny zůstanou.
    Měsíc má dny od 1. do posledního nahraného dne. Řádek dostane každý člověk s ID v listu. */
function dvToPeriods(a,meta){
  const map=dvWidMap(),months={},pad=n=>String(n).padStart(2,"0");
  a.dates.filter(dvOwns).forEach(iso=>(months[iso.slice(0,7)]||(months[iso.slice(0,7)]=[])).push(iso));
  return Object.keys(months).sort().map(m=>{
    /* 2.51: uzamčený měsíc se nenahrává, uzamčené dny a ruční úpravy hlídá attProtect */
    if(attLocked(m))return {m,days:0,people:0,locked:true};
    const old=S.periods[m]||null,file=new Set(months[m]);
    const last=[...months[m],...(old?old.days:[])].sort().pop();
    const days=[];for(let d=1;d<=31;d++){const iso=m+"-"+pad(d);if(iso>last)break;days.push(iso);}
    const rows={};
    if(old)Object.entries(old.rows||{}).forEach(([k,r])=>{
      rows[k]={first:r.first,last:r.last,
        h:days.map(iso=>{const i=old.days.indexOf(iso);return i>=0&&!file.has(iso)?(r.h[i]||0):0;}),
        c:days.map(iso=>{const i=old.days.indexOf(iso);return i>=0&&!file.has(iso)?(r.c[i]||null):null;})};
    });
    let people=0;
    (a.ids||[]).forEach(wid=>{
      const e=map.get(wid);if(!e)return;
      people++;
      const r=rows[e.key]||(rows[e.key]={first:e.first,last:e.last,h:days.map(()=>0),c:days.map(()=>null)});
      r.first=e.first;r.last=e.last;
      days.forEach((iso,i)=>{
        if(!file.has(iso))return;
        const v=(a.pres[iso]||{})[wid],c=((a.abs||{})[iso]||{})[wid]||null;
        r.h[i]=v?dvHours(v[0],v[1]):0;r.c[i]=v?null:c;
      });
    });
    const codes={};Object.values(rows).forEach(r=>r.c.forEach(c=>{if(c)codes[c]=(codes[c]||0)+1;}));
    S.periods[m]={id:m,y:+m.slice(0,4),m:+m.slice(5,7),days,rows,codes,file:("Docházka a výkony: "+(meta.name||"")).slice(0,200),at:meta.at||Date.now(),headerRow:1};
    const prot=attProtect(m,old);
    if(!S.current)S.current=m;
    return {m,days:months[m].length,people,lockedDays:prot.locked,edits:prot.edits};
  });
}
/** Evidence práce za měsíce od DV_FROM (místo Výroby): celé měsíce ze souboru. Jméno = ID
    zaměstnance, páruje se přes ID v Lidech (prodKeyFor). Norma jen se sloupcem normy. */
function dvToProduction(w,meta,fallback){
  const by={};
  w.recs.forEach(x=>{
    const m=x.iso&&w.dated?x.iso.slice(0,7):fallback;
    if(!dvOwns(m))return;
    const b=by[m]||(by[m]={id:m,names:{},records:0,total:0,file:("Docházka a výkony: "+(meta.name||"")).slice(0,200),at:meta.at||Date.now(),time:true});
    const r=b.names[x.wid]||(b.names[x.wid]={name:x.wid,total:0,count:0,days:{},spent:0,norm:0,nspent:0});
    r.total+=x.g;r.count++;r.spent+=x.t;
    if(x.iso&&x.iso.startsWith(m))r.days[x.iso]=(r.days[x.iso]||0)+x.g;
    if(x.n>0&&x.t>0){r.norm+=x.n;r.nspent+=x.t;}
    b.records++;b.total+=x.g;
  });
  const r2=v=>Math.round(v*100)/100;
  return Object.keys(by).sort().map(m=>{
    const b=by[m];
    Object.values(b.names).forEach(r=>{["total","spent","norm","nspent"].forEach(k=>{r[k]=r2(r[k]);});Object.keys(r.days).forEach(d=>{r.days[d]=r2(r.days[d]);});});
    b.total=r2(b.total);
    S.production[m]=b;
    return {m,people:Object.keys(b.names).length,records:b.records};
  });
}
/** Skupina Matice → skupina KPI: vybrané skupiny Matice, bez výběru podle názvu (stejný název
    skupiny nebo oddělení). Skupina Matice patří nejvýš jedné skupině KPI (první vyhrává). */
function dvAuditGroups(wa){
  const out=new Map(),mg=S.positions.filter(isGroup);
  (wa.groups||[]).forEach(g=>{
    const ids=g.mg&&g.mg.length?g.mg:mg.filter(p=>norm(p.name)===norm(g.name)||(p.dept&&norm(p.dept)===norm(g.name))).map(p=>p.id);
    ids.forEach(id=>{if(!out.has(id))out.set(id,g.id);});
  });
  return out;
}
/** Obsazenost v KPI za dny od DV_FROM z příchodů: ranní = příchod před 12:00 (bez příchodu
    podle směny), vedoucí se nepočítají, neznámé ID jen do celku. Absence = kódy ze souboru
    (bez kódů zůstane uložené číslo). Úpravy s důvodem zůstávají. */
function dvToAudit(wa,isos,abs){
  const map=dvWidMap(),gm=dvAuditGroups(wa),today=todayIso(),out=[];
  const mapped=new Set(gm.values());
  (isos||[]).filter(dvOwns).forEach(iso=>{
    const day=(wa.dv&&wa.dv.pres[iso])||{},old=wa.days[iso];
    const am={plan:null,total:0,abs:null},pm={plan:null,total:0},g={};
    wa.groups.forEach(x=>{g[x.id]=mapped.has(x.id)?[0,0]:[null,null];});
    Object.entries(day).forEach(([wid,v])=>{
      const e=map.get(wid)||null;
      if(e&&isLead(e))return;
      const isPm=v[0]!=null?v[0]>=DV_PM_FROM:!!(e&&e.shift==="O");
      (isPm?pm:am).total++;
      const grp=e?dvGroupOf(e,iso,today):null,aid=grp?gm.get(grp.id):null;
      if(aid&&g[aid])g[aid][isPm?1:0]++;
    });
    if(abs){const ab=abs[iso]||{};am.abs=Object.keys(ab).filter(wid=>{const e=map.get(wid);return !(e&&isLead(e));}).length;}
    else if(old&&old.am)am.abs=old.am.abs??null;
    wa.days[iso]={am,pm,g};
    out.push(iso);
  });
  return out;
}
/** Po změně skupin Matice u skupiny KPI přepočítá obsazenost ze souboru (dny od DV_FROM). */
function dvAuditRefresh(wa){return dvToAudit(wa,Object.keys((wa.dv&&wa.dv.pres)||{}).filter(dvOwns).filter(iso=>wa.days[iso]),null);}
function cleanDv(o){
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const str=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max);
  const n2=v=>{const n=Number(v);return Number.isFinite(n)&&n>=0?Math.round(Math.min(n,1e9)*100)/100:0;};
  const clock=v=>v==null||v===""?null:(Number.isInteger(+v)&&+v>=0&&+v<1440?+v:null);
  const wid=k=>typeof k==="string"&&/^[a-z0-9._\/-]{1,30}$/.test(k);
  o=obj(o);
  const out=blankDv(),ca=obj(obj(o.cols).att),cw=obj(obj(o.cols).work);
  Object.keys(DV_COLS.att).forEach(k=>{if(k in ca)out.cols.att[k]=waLetter(ca[k])||DV_COLS.att[k];});
  Object.keys(DV_COLS.work).forEach(k=>{if(k in cw)out.cols.work[k]=k==="date"||k==="norm"?waLetter(cw[k]):(waLetter(cw[k])||DV_COLS.work[k]);});
  out.unit=DV_UNITS.includes(o.unit)?o.unit:"auto";
  const sh=obj(o.sheets);out.sheets={att:str(sh.att,60),work:str(sh.work,60)};
  Object.keys(obj(o.pres)).filter(iso=>WA_ISO.test(iso)).sort().slice(-DV_MAX_DAYS).forEach(iso=>{
    const day={};
    Object.entries(obj(o.pres[iso])).slice(0,DV_MAX_PEOPLE).forEach(([k,v])=>{if(wid(k)&&Array.isArray(v)){const a=clock(v[0]),b=clock(v[1]);if(a!=null||b!=null)day[k]=[a,b];}});
    if(Object.keys(day).length)out.pres[iso]=day;
  });
  Object.keys(obj(o.perf)).filter(m=>/^\d{4}-\d{2}$/.test(m)).sort().slice(-DV_MAX_MONTHS).forEach(m=>{
    const pm={};
    Object.entries(obj(o.perf[m])).slice(0,DV_MAX_PEOPLE).forEach(([k,q])=>{
      if(!wid(k))return;
      const p={},op={};
      Object.entries(obj(obj(q).p)).slice(0,DV_MAX_PARTS).forEach(([nm,v])=>{const t=str(nm,120);if(t&&Array.isArray(v))p[t]=[n2(v[0]),n2(v[1]),n2(v[2]),Math.round(n2(v[3]))];});
      Object.entries(obj(obj(q).o)).slice(0,DV_MAX_OPS).forEach(([nm,v])=>{const t=str(nm,120);if(t&&Array.isArray(v))op[t]=[n2(v[0]),n2(v[1]),Math.round(n2(v[2]))];});
      if(Object.keys(p).length||Object.keys(op).length)pm[k]={p,o:op};
    });
    if(Object.keys(pm).length)out.perf[m]=pm;
  });
  out.files=(Array.isArray(o.files)?o.files:[]).filter(f=>f&&typeof f==="object").slice(-40).map(f=>({name:str(f.name,160),at:Number.isFinite(+f.at)?Math.round(+f.at):0,by:str(f.by,60),
    from:WA_ISO.test(String(f.from||""))?f.from:"",to:WA_ISO.test(String(f.to||""))?f.to:"",people:Math.round(n2(f.people)),days:Math.round(n2(f.days)),rows:Math.round(n2(f.rows)),
    months:(Array.isArray(f.months)?f.months:[]).filter(m=>/^\d{4}-\d{2}$/.test(String(m))).slice(0,24)}));
  return out;
}
/** ID → člověk (jedna mapa na výpočet). */
/** ID → člověk (jedna mapa na výpočet). Když ID ze souboru přesně nesedí, zkusí se jen číslice
    bez úvodních nul (H-0123 = 123), pokud to vede na jediného člověka (2.42.1). */
function dvWidMap(){
  const m=new Map(),dig=new Map(),only=w=>{const d=String(w||"").replace(/\D+/g,"").replace(/^0+(?=\d)/,"");return d.length>=2?d:"";};
  Object.values(S.employees||{}).forEach(e=>{const w=widKey(e.wid);if(!w)return;if(!m.has(w))m.set(w,e);const d=only(w);if(d)dig.set(d,dig.has(d)&&dig.get(d)!==e?null:e);});
  const get=Map.prototype.get.bind(m),has=Map.prototype.has.bind(m);
  m.get=w=>{const e=get(w);if(e)return e;const d=only(w),x=d?dig.get(d):null;return x||undefined;};
  m.has=w=>has(w)||!!m.get(w);
  return m;
}
/** Projekt = skupina Matice, kam člověk ten den patřil (minulost podle historie zařazení). */
function dvGroupOf(e,iso,today){
  if(!e)return {id:"?",name:"Neznámé ID",dept:""};
  if(isLead(e))return {id:"lead",name:"Vedoucí",dept:""};
  /* minulost podle historie zařazení; bez skupiny v historii platí dnešní skupina (2.42.1: lidé
     zařazení až po nahrání docházky by jinak byli „Bez skupiny“) */
  const posId=(iso<today?levelAt(e,ctDayEnd(iso)).pos:null)||e.positionId;
  const p=posId?S.positions.find(x=>x.id===posId&&isGroup(x)):null;
  return p?{id:p.id,name:p.name,dept:p.dept||""}:{id:"-",name:"Bez skupiny",dept:""};
}
/** Pořadí projektů: skupiny jako v Matici, pak Vedoucí, Bez skupiny, Neznámé ID. */
function dvGroupOrder(){const o=new Map(S.positions.filter(isGroup).map((p,i)=>[p.id,i]));return id=>o.has(id)?o.get(id):id==="lead"?1e6:id==="-"?1e6+1:1e6+2;}
/** Obsazenost dne: kdo přišel, kdo je teď v práci (dnes: přišel a ještě neodešel), minuty
    v práci; po projektech. */
function dvDay(iso,opts){
  opts=opts||{};
  const dv=(S.workAudit&&S.workAudit.dv)||blankDv(),day=dv.pres[iso]||{},now=new Date(opts.now||Date.now());
  const today=todayIso(opts.now),nowMin=now.getHours()*60+now.getMinutes(),map=dvWidMap();
  const people=Object.entries(day).map(([wid,v])=>{
    const e=map.get(wid)||null,a=v[0],b=v[1],min=dvStay(a,b);
    const cur=iso===today&&a!=null&&a<=nowMin&&(b==null||b>nowMin||b<a);
    return {wid,e,key:e?e.key:"",name:e?(e.last+" "+e.first).trim():"",in:a,out:b,min,now:cur,g:dvGroupOf(e,iso,today)};
  });
  const ord=dvGroupOrder(),gs=new Map();
  people.forEach(x=>{const g=gs.get(x.g.id)||{...x.g,n:0,now:0,min:0,people:[]};g.n++;if(x.now)g.now++;g.min+=x.min||0;g.people.push(x);gs.set(x.g.id,g);});
  const sortP=(a,b)=>(a.in==null?1e4:a.in)-(b.in==null?1e4:b.in)||norm(a.name||a.wid).localeCompare(norm(b.name||b.wid),"cs");
  const groups=[...gs.values()].sort((a,b)=>ord(a.id)-ord(b.id));
  groups.forEach(g=>g.people.sort(sortP));
  return {iso,today:iso===today,n:people.length,now:people.filter(x=>x.now).length,min:people.reduce((s,x)=>s+(x.min||0),0),
    open:people.filter(x=>x.min==null).length,groups,people,unknown:people.filter(x=>!x.e).map(x=>x.wid)};
}
/** Skutečná obsazenost dne pro úvod HALA 2 (2.39.3): kdo podle nahraných příchodů přišel, po
    směnách a odděleních. Ranní = příchod před 12:00, odpolední od 12:00; bez času příchodu podle
    směny ze zařazení. Vedoucí se nepočítají (jako v plánu), neznámé ID jde do „Neznámé ID“.
    Bez příchodů na den null. */
const DV_PM_FROM=720;
function staffReal(iso,mg,opts){
  const d=dvDay(iso,opts);
  if(!d.n)return null;
  const depts=new Map(),dget=k=>{if(!depts.has(k))depts.set(k,{am:0,pm:0,now:0});return depts.get(k);};
  const t={am:0,pm:0,now:0,n:0,lead:0,unknown:0};
  d.people.forEach(x=>{
    if(x.e&&isLead(x.e)){t.lead++;return;}
    let slot=x.in!=null?(x.in<DV_PM_FROM?"am":"pm"):x.e?slotOn(x.e,mg):"";
    if(slot!=="am"&&slot!=="pm")slot=x.out!=null&&x.out>DV_PM_FROM+120?"pm":"am";
    const r=dget(x.e?(empDept(x.e)||"Bez skupiny"):"Neznámé ID");
    r[slot]++;t[slot]++;t.n++;
    if(x.now){r.now++;t.now++;}
    if(!x.e)t.unknown++;
  });
  const dv=S.workAudit.dv,f=dv.files.filter(z=>z.from&&z.to&&z.from<=iso&&iso<=z.to).sort((a,b)=>b.at-a.at)[0];
  return {iso,...t,depts,at:f?f.at:0,by:f?f.by:""};
}
/** Rozpad „Teď v práci“ (2.43): po odděleních plán směny ze zařazení proti lidem, kteří podle
    příchodů přišli; kdo z plánu nedorazil a kdo přišel mimo plán. slot am | pm | jinak obě.
    Odpolední, která ještě nezačala (dnes před 14:00), se nehlásí jako nedorazili, jen „čeká se“. */
function staffNow(sd,slot,opts){
  opts=opts||{};
  const d=dvDay(sd.day,opts);
  if(!d.n)return null;
  const slots=slot==="am"||slot==="pm"?[slot]:["am","pm"];
  const hour=new Date(opts.now||Date.now()).getHours(),waitPm=d.today&&hour<14;
  const came=new Map();d.people.forEach(x=>{if(x.e)came.set(x.e.key,x);});
  const who=(e,x)=>({key:e?e.key:"",name:e?(e.last+" "+e.first).trim():"",wid:e?(e.wid||""):(x?x.wid:""),in:x?x.in:null,out:x?x.out:null,now:!!(x&&x.now)});
  const map=new Map(),get=dept=>{if(!map.has(dept))map.set(dept,{dept,plan:0,came:0,now:0,sick:0,missing:[],wait:[],extra:[]});return map.get(dept);};
  const planned=new Set();
  sd.depts.forEach(r=>{
    const g=get(r.dept);g.sick=r.sick.length;
    slots.forEach(sl=>r[sl].forEach(e=>{
      planned.add(e.key);g.plan++;
      const x=came.get(e.key);
      if(x){g.came++;if(x.now)g.now++;}
      else if(sl==="pm"&&waitPm)g.wait.push(who(e,null));
      else g.missing.push(who(e,null));
    }));
  });
  d.people.forEach(x=>{
    if(x.e&&(isLead(x.e)||planned.has(x.e.key)))return;
    const sl=x.in!=null?(x.in<DV_PM_FROM?"am":"pm"):"am";
    if(!slots.includes(sl))return;
    const g=get(x.e?(empDept(x.e)||"Bez skupiny"):"Neznámé ID");
    g.came++;if(x.now)g.now++;g.extra.push(who(x.e,x));
  });
  const byName=(a,b)=>(a.name||a.wid).localeCompare(b.name||b.wid,"cs",{numeric:true});
  const depts=[...map.values()].filter(g=>g.plan||g.came);
  depts.forEach(g=>{g.missing.sort(byName);g.wait.sort(byName);g.extra.sort(byName);g.diff=g.came-g.plan;});
  const t={plan:0,came:0,now:0,missing:0,wait:0,extra:0};
  depts.forEach(g=>{t.plan+=g.plan;t.came+=g.came;t.now+=g.now;t.missing+=g.missing.length;t.wait+=g.wait.length;t.extra+=g.extra.length;});
  return {day:sd.day,slots,depts,total:t,waitPm};
}
