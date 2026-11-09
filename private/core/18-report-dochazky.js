/* ================= Report docházky: plnění denního požadavku (2.40) =================
   Z nahraných příchodů (KPI, docházka a výkony): kolik lidí ze skupin Matice přišlo proti
   plánu skupiny a proti dennímu požadavku (Nastavení KPI, požadavek lidí). Plán skupiny =
   potřeba celkem z Plánu kapacit, jinak počet lidí ve skupině. Den v normě = dodáno ≥ požadavek;
   plnění normy za období = podíl pracovních dnů v normě (nic se nesčítá ani nedorovnává).
   Víkendy a svátky jsou mimo normu, budoucí dny (od zítřka) jsou plánovaná kapacita (plán bez
   nemocných) a do plnění se nepočítají. Lidé se v reportu uvádějí jen s ID. */
const DR_MODES=["day","week","month","year"];
/* Skupiny reportu (2.41): uživatel si složí skupiny z oddělení Matice; oddělení je nejvýš
   v jedné skupině, skupiny Matice z nepřiřazených oddělení zůstanou v reportu samostatně.
   Značka dne: přesčas nebo práce ve svátek = den mimo normu (jako víkend). */
const DR_MARK={ot:"přesčas",hol:"práce ve svátek"};
function blankDrep(){return {groups:[],marks:{}};}
function cleanDrep(o){
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const str=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g,"").replace(/\s+/g," ").trim().slice(0,max);
  o=obj(o);
  const out=blankDrep(),ids=new Set(),used=new Set();
  (Array.isArray(o.groups)?o.groups:[]).forEach(g=>{
    if(!g||typeof g!=="object"||out.groups.length>=20)return;
    const id=String(g.id||"");
    if(!/^rg[A-Za-z0-9]{1,24}$/.test(id)||ids.has(id))return;
    ids.add(id);
    const depts=[];
    (Array.isArray(g.depts)?g.depts:[]).forEach(d=>{const t=str(d,80);if(t&&!used.has(t)&&depts.length<50){used.add(t);depts.push(t);}});
    out.groups.push({id,name:str(g.name,60)||"Skupina",depts});
  });
  Object.entries(obj(o.marks)).slice(0,3000).forEach(([iso,v])=>{if(WA_ISO.test(iso)&&(v==="ot"||v==="hol"))out.marks[iso]=v;});
  return out;
}
/* Plán podle Plánu kapacit (2.69): potřeba lidí skupiny (potřeba celkem) na den. V den označený
   jako přesčas nebo práce ve svátek se pracuje jen na jednu směnu, plán je proto poloviční
   (zaokrouhleno nahoru na celé lidi). Bez plánu skupiny null. */
function drHalf(iso){const m=((S.workAudit&&S.workAudit.drep)||{}).marks||{};return m[iso]==="ot"||m[iso]==="hol";}
function drHalfN(n,iso){return n!=null&&drHalf(iso)?Math.ceil(n/2):n;}
function capNeed(gid,iso){const g=S.capPlan&&S.capPlan.groups&&S.capPlan.groups[gid];return g&&g.n?drHalfN(g.n,iso):null;}
function drCtx(opts){
  opts=opts||{};
  const mg=S.positions.filter(isGroup).map(p=>{
    const need=(S.capPlan&&S.capPlan.groups[p.id])||null;
    const members=Object.values(S.employees).filter(e=>e.positionId===p.id&&!e.excluded&&!isLead(e));
    return {id:p.id,name:p.name||"(bez názvu)",dept:deptOf(p),plan:need&&need.n?need.n:members.length,cap:!!(need&&need.n),members};
  });
  const drep=(S.workAudit&&S.workAudit.drep)||blankDrep();
  const byDept=new Map();
  drep.groups.forEach(rg=>rg.depts.forEach(d=>byDept.set(d,rg)));
  const groups=[],rowOf=new Map();
  drep.groups.forEach(rg=>{
    const gs=mg.filter(g=>byDept.get(g.dept)===rg);
    groups.push({id:rg.id,name:rg.name,plan:gs.reduce((x,g)=>x+g.plan,0),cap:gs.some(g=>g.cap),members:gs.flatMap(g=>g.members),rg:true,depts:rg.depts,parts:gs.map(g=>g.name)});
    gs.forEach(g=>rowOf.set(g.id,rg.id));
  });
  mg.filter(g=>!rowOf.has(g.id)).forEach(g=>{groups.push(g);rowOf.set(g.id,g.id);});
  const t=S.workAudit&&S.workAudit.target;
  return {today:todayIso(opts.now),dv:(S.workAudit&&S.workAudit.dv)||blankDv(),map:dvWidMap(),groups,rowOf,marks:drep.marks,
    req:t!=null&&t>0?+t:groups.reduce((x,g)=>x+g.plan,0),reqOwn:t!=null&&t>0};
}
function drDay(iso,ctx){
  ctx=ctx||drCtx();
  const [y,m,d]=iso.split("-").map(Number),day=mkDay(y,m,d);
  const pres=ctx.dv.pres[iso];
  const has=!!pres&&Object.values(pres).some(v=>v[0]!=null||v[1]!=null);
  const kind=has?"real":iso>ctx.today?"plan":"none";
  // přesčas a práce ve svátek (2.69): jen jedna směna, plán i požadavek na polovinu
  const half=drHalf(iso),req=half?Math.ceil(ctx.req/2):ctx.req;
  const rows=ctx.groups.map(g=>({id:g.id,name:g.name,plan:half?Math.ceil(g.plan/2):g.plan,done:0,sick:0,miss:[],note:""}));
  const byId=new Map(rows.map(r=>[r.id,r]));
  if(kind==="real"){
    const came=new Set();
    Object.entries(pres).forEach(([wid,v])=>{
      if(v[0]==null&&v[1]==null)return;
      const e=ctx.map.get(wid)||null;
      if(e&&isLead(e))return;
      if(e)came.add(e.key);
      const g=dvGroupOf(e,iso,ctx.today);
      let r=byId.get(ctx.rowOf.get(g.id)||g.id);
      if(!r){r={id:g.id,name:g.id==="?"?"Neznámé ID":"Bez skupiny",plan:0,done:0,sick:0,miss:[],note:"",extra:true};byId.set(g.id,r);rows.push(r);}
      r.done++;
    });
    Object.values(S.employees).forEach(e=>{
      if(e.excluded||isLead(e)||came.has(e.key))return;
      const gid=dvGroupOf(e,iso,ctx.today).id,r=byId.get(ctx.rowOf.get(gid)||gid);
      if(!r||r.extra)return;
      if(e.sick&&e.sick<=iso)r.sick++;else r.miss.push(e.wid||"");
    });
  }else if(kind==="plan"){
    rows.forEach(r=>{const g=ctx.groups.find(x=>x.id===r.id);r.sick=g.members.filter(e=>e.sick&&e.sick<=iso).length;r.done=Math.max(0,r.plan-r.sick);});
  }
  rows.forEach(r=>{
    if(kind==="none")return;
    // Poznámka jen s počty (2.47.1, přání uživatele): kolik lidí nepřišlo a kolik má neschopenku, bez ID.
    const parts=[];
    if(kind==="real"&&r.miss.length)parts.push("nepřišlo "+r.miss.length);
    if(r.sick)parts.push("neschopenka "+r.sick);
    r.note=parts.join(" · ");
  });
  const plan=rows.filter(r=>!r.extra).reduce((x,r)=>x+r.plan,0),done=rows.reduce((x,r)=>x+r.done,0);
  const mark=ctx.marks[iso]||"";
  return {iso,day,work:day.work,mark,half,norm:day.work&&!mark,kind,rows,plan,done,req,met:done>=req};
}
/** Párování příchodů pro report (2.42.1): kolik lidí s příchodem jde do skupin, kdo má ID, které
    v Lidech není, a kdo je bez skupiny. */
function drPairing(dates,ctx){
  ctx=ctx||drCtx();
  const unknown=new Set(),noGroup=new Map();let came=0,days=0;
  dates.forEach(iso=>{
    const pres=ctx.dv.pres[iso];if(!pres)return;
    let any=false;
    Object.entries(pres).forEach(([wid,v])=>{
      if(v[0]==null&&v[1]==null)return;any=true;
      const e=ctx.map.get(wid)||null;
      if(!e){unknown.add(wid);return;}
      if(isLead(e))return;
      const g=dvGroupOf(e,iso,ctx.today);
      if(g.id==="-")noGroup.set(e.key,{key:e.key,name:(e.last+" "+e.first).trim(),wid});else came++;
    });
    if(any)days++;
  });
  return {days,came,unknown:[...unknown].sort(widCmp),noGroup:[...noGroup.values()].sort((a,b)=>norm(a.name).localeCompare(norm(b.name),"cs"))};
}
function drDates(mode,ref){
  const [y,m]=ref.split("-").map(Number),out=[];
  if(mode==="day")return [ref];
  if(mode==="week"){const w=isoWeek(ref);for(let i=0;i<7;i++)out.push(addDays(w.from,i));return out;}
  const last=mo=>new Date(y,mo,0).getDate();
  const push=mo=>{for(let i=1;i<=last(mo);i++)out.push(y+"-"+String(mo).padStart(2,"0")+"-"+String(i).padStart(2,"0"));};
  if(mode==="month")push(m);else for(let mo=1;mo<=12;mo++)push(mo);
  return out;
}
/** Report za den, týden, měsíc nebo rok (ref = libovolný den období). */
function drReport(mode,ref,opts){
  mode=DR_MODES.includes(mode)?mode:"day";
  const ctx=drCtx(opts),dates=drDates(mode,ref);
  if(mode==="day")return {mode,ref,from:ref,to:ref,req:ctx.req,reqOwn:ctx.reqOwn,today:ctx.today,groups:ctx.groups,d:drDay(ref,ctx)};
  const all=dates.map(iso=>drDay(iso,ctx));
  const work=all.filter(d=>d.norm&&d.kind!=="none"),real=work.filter(d=>d.kind==="real"),fut=work.filter(d=>d.kind==="plan");
  const n=real.length,met=real.filter(d=>d.met).length,nf=fut.length,futMet=fut.filter(d=>d.met).length;
  const agg=list=>{
    const m=new Map();
    list.forEach(d=>d.rows.forEach(r=>{
      if(r.extra&&!r.done)return;
      const g=m.get(r.id)||{id:r.id,name:r.name,extra:!!r.extra,sumPlan:0,sumDone:0,cnt:0,daysMet:0};
      g.sumPlan+=r.plan;g.sumDone+=r.done;g.cnt++;if(r.done>=r.plan)g.daysMet++;m.set(r.id,g);
    }));
    return [...m.values()].map(g=>({...g,avgPlan:g.sumPlan/g.cnt,avgDone:g.sumDone/g.cnt}));
  };
  let trend;
  if(mode==="year"){
    trend=Array.from({length:12},(_,i)=>{
      const mm=String(i+1).padStart(2,"0"),rr=real.filter(d=>d.iso.slice(5,7)===mm),ff=fut.filter(d=>d.iso.slice(5,7)===mm);
      if(rr.length)return {label:i,value:rr.filter(d=>d.met).length/rr.length*100,kind:"real",n:rr.length,met:rr.filter(d=>d.met).length};
      if(ff.length)return {label:i,value:ff.filter(d=>d.met).length/ff.length*100,kind:"plan",n:ff.length,met:ff.filter(d=>d.met).length};
      return {label:i,value:0,kind:"empty",n:0,met:0};
    });
  }else trend=work.map(d=>({iso:d.iso,day:d.day,value:d.done,kind:d.kind,met:d.met}));
  const worst=n?real.slice().sort((a,b)=>a.done-b.done||(a.iso<b.iso?-1:1))[0]:null;
  return {mode,ref,from:dates[0],to:dates[dates.length-1],req:ctx.req,reqOwn:ctx.reqOwn,today:ctx.today,groups:ctx.groups,days:all,
    n,met,pct:n?met/n*100:null,avg:n?real.reduce((x,d)=>x+d.done,0)/n:null,worst,nf,futMet,planPct:nf?futMet/nf*100:null,onlyPlan:!n&&nf>0,
    noData:all.filter(d=>d.norm&&d.kind==="none"&&d.iso<=ctx.today).length,
    weekend:all.filter(d=>!d.work&&!d.mark&&d.kind==="real").length,
    marked:all.filter(d=>d.mark).map(d=>({iso:d.iso,mark:d.mark,done:d.kind==="real"?d.done:null})),
    groupsReal:agg(real),groupsPlan:agg(fut),trend};
}
/** Excel: přehled dní a skupiny za období. */
function drSheets(r){
  const days=r.mode==="day"?[r.d]:r.days;
  const names=r.groups.map(g=>g.name);
  const kindT={real:"skutečnost",plan:"plánovaná kapacita",none:"bez dat"};
  const dayRows=days.map(d=>{
    const by=new Map(d.rows.map(x=>[x.id,x]));
    const extra=d.rows.filter(x=>x.extra).reduce((s2,x)=>s2+x.done,0);
    return [d.iso,["Ne","Po","Út","St","Čt","Pá","So"][d.day.dow],d.mark?DR_MARK[d.mark]+" (mimo normu)":d.work?kindT[d.kind]:(d.kind==="real"?"víkend / svátek (mimo normu)":"víkend / svátek"),
      d.req,d.kind==="none"?"":d.plan,d.kind==="none"?"":d.done,d.kind==="none"?"":d.done-d.req,
      !d.norm||d.kind!=="real"?"":d.met?"ano":"ne",...r.groups.map(g=>d.kind==="none"?"":(by.get(g.id)||{done:0}).done),d.kind==="none"?"":extra];
  });
  const sheets=[{name:"Přehled dní",cols:[12,5,26,10,8,8,8,9,...names.map(()=>10),12],
    rows:[["Datum","Den","Druh","Požadavek","Plán","Dodáno","Rozdíl","V normě",...names,"Bez skupiny / neznámé ID"],...dayRows]}];
  if(r.mode==="day"){
    sheets.push({name:"Skupiny",cols:[24,8,8,8,10,60],rows:[["Skupina","Plán","Dodáno","Rozdíl","Pokrytí %","Poznámka"],
      ...r.d.rows.map(x=>[x.name,x.plan,x.done,x.done-x.plan,x.plan?Math.round(x.done/x.plan*100):"",x.note])]});
  }else{
    const g=r.onlyPlan?r.groupsPlan:r.groupsReal;
    sheets.push({name:"Skupiny",cols:[24,10,10,12,8],rows:[["Skupina","Ø plán","Ø dodáno","Dní v plánu","Dní"],
      ...g.map(x=>[x.name,Math.round(x.avgPlan*10)/10,Math.round(x.avgDone*10)/10,x.daysMet,x.cnt])]});
  }
  return sheets;
}
/** Poslední den s nahranými příchody do data včetně (2.40.1), jinak "". */
function dvLastPres(to){
  const pres=((S.workAudit&&S.workAudit.dv)||{}).pres||{};
  return Object.keys(pres).filter(iso=>iso<=to&&Object.values(pres[iso]).some(v=>v[0]!=null||v[1]!=null)).sort().pop()||"";
}
/** Dny s docházkou (seřazené). */
function dvDays(){return Object.keys(((S.workAudit&&S.workAudit.dv)||{}).pres||{}).sort();}
/** Měsíc: obsazenost po dnech a projektech a výkony po lidech a projektech. */
function dvMonth(month,opts){
  opts=opts||{};
  const dv=(S.workAudit&&S.workAudit.dv)||blankDv(),today=todayIso(opts.now),map=dvWidMap(),ord=dvGroupOrder();
  const last=new Date(+month.slice(0,4),+month.slice(5,7),0).getDate();
  const isos=Array.from({length:last},(_,i)=>month+"-"+String(i+1).padStart(2,"0"));
  const gmeta=new Map(),days=[],people=new Map();
  const pget=wid=>{let q=people.get(wid);if(!q){const e=map.get(wid)||null;q={wid,e,key:e?e.key:"",name:e?(e.last+" "+e.first).trim():"",days:0,min:0,t:0,g:0,f:0,parts:{},ops:{}};people.set(wid,q);}return q;};
  isos.forEach(iso=>{
    const day=dv.pres[iso];if(!day)return;
    const by={};let n=0,min=0;
    Object.entries(day).forEach(([wid,v])=>{
      const e=map.get(wid)||null,g=dvGroupOf(e,iso,today),m=dvStay(v[0],v[1])||0;
      gmeta.set(g.id,g);by[g.id]=(by[g.id]||0)+1;n++;min+=m;
      const q=pget(wid);q.days++;q.min+=m;
    });
    const [y,mm,dd]=iso.split("-").map(Number);
    days.push({iso,day:mkDay(y,mm,dd),n,min,by});
  });
  const pm=dv.perf[month]||{};
  Object.entries(pm).forEach(([wid,x])=>{
    const q=pget(wid);
    Object.entries(x.p||{}).forEach(([nm,v])=>{q.g+=v[0];q.f+=v[1];q.t+=v[2];q.parts[nm]=v;});
    Object.entries(x.o||{}).forEach(([nm,v])=>{q.ops[nm]=v;});
  });
  const endIso=isos[isos.length-1]<today?isos[isos.length-1]:today;
  const list=[...people.values()].map(q=>{
    q.gr=dvGroupOf(q.e,endIso,today);gmeta.set(q.gr.id,q.gr);
    q.util=q.min>0&&q.t>0?q.t/q.min:null;q.perHour=q.t>0?q.g/(q.t/60):null;
    const top=Object.entries(q.parts).sort((a,b)=>b[1][2]-a[1][2]||b[1][0]-a[1][0])[0];q.top=top?top[0]:"";
    return q;
  }).sort((a,b)=>ord(a.gr.id)-ord(b.gr.id)||norm(a.name||a.wid).localeCompare(norm(b.name||b.wid),"cs"));
  const groups=[...gmeta.values()].sort((a,b)=>ord(a.id)-ord(b.id)).map(g=>{
    const ps=list.filter(q=>q.gr.id===g.id),sum=k=>ps.reduce((s,q)=>s+q[k],0),t=sum("t"),min=sum("min");
    return {...g,people:ps.length,min,t,g:sum("g"),util:min>0&&t>0?t/min:null,perHour:t>0?sum("g")/(t/60):null};
  });
  const sum=k=>list.reduce((s,q)=>s+q[k],0),T=sum("t"),M=sum("min");
  return {month,days,groups,people:list,perf:!!Object.keys(pm).length,
    tot:{days:days.length,min:M,t:T,g:sum("g"),f:sum("f"),util:M>0&&T>0?T/M:null,perHour:T>0?sum("g")/(T/60):null,avg:days.length?days.reduce((s,d)=>s+d.n,0)/days.length:null}};
}
/** Produktivita člověka za měsíce od–do: docházka (dny, minuty), vykázaný čas, kusy, díly a operace. */
function dvPerson(key,from,to){
  const e=S.employees[key],dv=(S.workAudit&&S.workAudit.dv)||blankDv(),w=e?widKey(e.wid):"";
  if(!w)return {noId:true};
  const parts={},ops={},months=[];let days=0,min=0;
  Object.keys(dv.pres).filter(iso=>iso.slice(0,7)>=from&&iso.slice(0,7)<=to).forEach(iso=>{const v=dv.pres[iso][w];if(v){days++;min+=dvStay(v[0],v[1])||0;}});
  Object.keys(dv.perf).filter(m=>m>=from&&m<=to).sort().forEach(m=>{
    const x=dv.perf[m][w];if(!x)return;
    let t=0,g=0;
    Object.entries(x.p||{}).forEach(([nm,v])=>{const p=parts[nm]||(parts[nm]={name:nm,g:0,f:0,t:0,n:0});p.g+=v[0];p.f+=v[1];p.t+=v[2];p.n+=v[3];t+=v[2];g+=v[0];});
    Object.entries(x.o||{}).forEach(([nm,v])=>{const o=ops[nm]||(ops[nm]={name:nm,g:0,t:0,n:0});o.g+=v[0];o.t+=v[1];o.n+=v[2];});
    months.push({id:m,t,g});
  });
  const pl=Object.values(parts).sort((a,b)=>b.t-a.t||b.g-a.g),ol=Object.values(ops).sort((a,b)=>b.t-a.t||b.g-a.g);
  const T=pl.reduce((s,p)=>s+p.t,0),G=pl.reduce((s,p)=>s+p.g,0),F=pl.reduce((s,p)=>s+p.f,0);
  return {wid:w,days,min,t:T,g:G,f:F,util:min>0&&T>0?T/min:null,perHour:T>0?G/(T/60):null,parts:pl,ops:ol,months,
    has:days>0||pl.length>0,any:Object.keys(dv.pres).length>0||Object.keys(dv.perf).length>0};
}

