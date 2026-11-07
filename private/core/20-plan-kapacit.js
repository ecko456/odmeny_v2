/* ==========================================================================
   PLÁN KAPACIT (verze 2.38)
   Ke každé skupině Matice (projektu) se nastaví, kolik lidí je potřeba celkem a kolik z nich
   aspoň na úrovni 2, 3 a 4. Úroveň člověka = procento dovedností skupiny: aspoň 50 % = úroveň 2,
   75 % = 3, 100 % = 4 (stejně jako „zkušený pracovník“ v reportu kapacit). Počty „aspoň“ se
   sčítají shora: kdo má úroveň 4, počítá se i do úrovně 3 a 2.
   S.capPlan = {groups: {idSkupiny: {n, l2, l3, l4}}, note, by, at}. Plán ukáže, jak jsme na
   tom (lidé ve skupině, nemocní, v práci podle docházky z KPI), koho doškolit (kandidáti
   s nejvyšším procentem pod hranicí) a kolik lidí doplnit náborem.
   ========================================================================== */
const CP_LEVELS=[2,3,4];
const CP_MAX=500;
function blankCapPlan(){return {groups:{},note:"",by:"",at:0};}
function cleanCapPlan(o,posIds){
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const int=v=>{const n=Math.round(Number(v));return Number.isFinite(n)?clamp(n,0,CP_MAX):0;};
  o=obj(o);
  const out=blankCapPlan();
  Object.entries(obj(o.groups)).forEach(([id,g])=>{
    if(!SAFE_ID.test(id)||(posIds&&!posIds.has(id)))return;
    g=obj(g);
    // počty „aspoň úroveň“ se shora nesmí zvětšovat: l4 ≤ l3 ≤ l2 ≤ n
    const n=int(g.n),l2=Math.min(n,int(g.l2)),l3=Math.min(l2,int(g.l3)),l4=Math.min(l3,int(g.l4));
    if(n||l2||l3||l4)out.groups[id]={n,l2,l3,l4};
  });
  out.note=String(o.note==null?"":o.note).slice(0,4000);
  out.by=String(o.by==null?"":o.by).slice(0,60);
  out.at=Number.isFinite(+o.at)?clamp(Math.round(+o.at),0,1e15):0;
  return out;
}
/* Nastaví potřebu skupiny; počty „aspoň“ srovná tak, aby vyšší úroveň nepřesáhla nižší. */
function setCapNeed(id,patch){
  const cur={n:0,l2:0,l3:0,l4:0,...((S.capPlan.groups||{})[id]||{})};
  Object.keys(patch).forEach(k=>{if(k in cur)cur[k]=clamp(Math.round(+patch[k]||0),0,CP_MAX);});
  // změna vyšší úrovně zvedne nižší, změna nižší sníží vyšší
  if("l4" in patch){cur.l3=Math.max(cur.l3,cur.l4);cur.l2=Math.max(cur.l2,cur.l3);cur.n=Math.max(cur.n,cur.l2);}
  else if("l3" in patch){cur.l2=Math.max(cur.l2,cur.l3);cur.n=Math.max(cur.n,cur.l2);cur.l4=Math.min(cur.l4,cur.l3);}
  else if("l2" in patch){cur.n=Math.max(cur.n,cur.l2);cur.l3=Math.min(cur.l3,cur.l2);cur.l4=Math.min(cur.l4,cur.l3);}
  else if("n" in patch){cur.l2=Math.min(cur.l2,cur.n);cur.l3=Math.min(cur.l3,cur.l2);cur.l4=Math.min(cur.l4,cur.l3);}
  if(cur.n||cur.l2||cur.l3||cur.l4)S.capPlan.groups[id]=cur;else delete S.capPlan.groups[id];
  return cur;
}
/* Úroveň člověka ve skupině z procenta dovedností (0–4, dolů: 74 % je ještě úroveň 2). */
const cpLevel=pct=>pct==null?0:Math.floor((pct+1e-9)/25);
/* Průměrný počet lidí skupiny v práci za posledních N pracovních dní s docházkou (KPI 2.37). */
function cpPresence(days,now){
  const dv=S.workAudit&&S.workAudit.dv;
  if(!dv)return null;
  const today=todayIso(now),list=Object.keys(dv.pres).filter(iso=>iso<=today).sort().filter(iso=>{const [y,m,d]=iso.split("-").map(Number);return mkDay(y,m,d).work;}).slice(-(days||20));
  if(!list.length)return null;
  const map=dvWidMap(),by={};
  list.forEach(iso=>Object.keys(dv.pres[iso]).forEach(wid=>{const g=dvGroupOf(map.get(wid)||null,iso,today);by[g.id]=(by[g.id]||0)+1;}));
  Object.keys(by).forEach(k=>{by[k]=Math.round(by[k]/list.length*10)/10;});
  return {days:list.length,from:list[0],to:list[list.length-1],by};
}
/* Jak jsme na tom ve skupině a co udělat: doplnit (nábor) a doškolit (kandidáti). */
function capPlanGroup(p,pres){
  const need={n:0,l2:0,l3:0,l4:0,...((S.capPlan&&S.capPlan.groups[p.id])||{})};
  const members=Object.values(S.employees).filter(e=>e.positionId===p.id&&!e.excluded&&!isLead(e))
    .map(e=>{const pct=groupSkills(p).length?skillPct(e,p):null;return {e,key:e.key,name:(e.last+" "+e.first).trim(),pct,lvl:cpLevel(pct),sick:!!e.sick};})
    .sort((a,b)=>(b.pct||0)-(a.pct||0)||norm(a.name).localeCompare(norm(b.name),"cs"));
  const H=members.length,have={n:H,l2:0,l3:0,l4:0};
  CP_LEVELS.forEach(k=>{have["l"+k]=members.filter(m=>m.lvl>=k).length;});
  const hire=Math.max(0,need.n-H);
  const gap={},train={},hireLv={};
  CP_LEVELS.forEach(k=>{
    const key="l"+k;
    gap[k]=Math.max(0,need[key]-have[key]);
    // doškolit jde jen lidi skupiny pod úrovní; co zbyde, musí přijít náborem s tou úrovní
    train[k]=Math.min(gap[k],H-have[key]);
    hireLv[k]=gap[k]-train[k];
  });
  // kandidáti: z lidí pod úrovní ti s nejvyšším procentem (nejblíž k cíli), shora od úrovně 4;
  // kdo se doškolí na 4 a teď je pod 3, pokryje i mezeru na 3 (a stejně na 2)
  const cand=[],used=new Set();
  [4,3,2].forEach(k=>{
    const got=cand.filter(c=>c.lvl<k).length;
    members.filter(m=>m.lvl<k&&!used.has(m.key)).slice(0,Math.max(0,train[k]-got))
      .forEach(m=>{used.add(m.key);cand.push({...m,to:k,miss:Math.max(0,k*25-(m.pct||0))});});
  });
  const trainN=cand.length;
  const set=!!(need.n||need.l2||need.l3||need.l4);
  const state=!set?"none":hire>0?"hire":trainN>0?"train":"ok";
  return {p,need,have,members,sick:members.filter(m=>m.sick).length,hire,hireLv,gap,train,trainN,cand:cand.sort((a,b)=>b.to-a.to||(b.pct||0)-(a.pct||0)),
    extra:set?Math.max(0,H-need.n):0,state,set,pres:pres&&pres.by[p.id]!=null?pres.by[p.id]:pres?0:null};
}
/* Celý plán po odděleních (skupiny v pořadí Matice) a souhrn. */
function capPlanAll(opts){
  opts=opts||{};
  const pres=cpPresence(opts.days||20,opts.now);
  const groups=S.positions.filter(isGroup).map(p=>capPlanGroup(p,pres));
  const depts=[];
  groups.forEach(g=>{
    const d=g.p.dept||"";
    let x=depts.find(y=>y.dept===d);
    if(!x){x={dept:d,groups:[]};depts.push(x);}
    x.groups.push(g);
  });
  const sum=list=>{const t={need:{n:0,l2:0,l3:0,l4:0},have:{n:0,l2:0,l3:0,l4:0},hire:0,trainN:0,sick:0,pres:null};
    list.forEach(g=>{["n","l2","l3","l4"].forEach(k=>{t.need[k]+=g.need[k];t.have[k]+=g.have[k];});t.hire+=g.hire;t.trainN+=g.trainN;t.sick+=g.sick;if(g.pres!=null)t.pres=Math.round(((t.pres||0)+g.pres)*10)/10;});
    return t;};
  depts.forEach(d=>{d.tot=sum(d.groups);});
  const set=groups.filter(g=>g.set);
  return {depts,groups,pres,tot:sum(set),setN:set.length,okN:set.filter(g=>g.state==="ok").length};
}
/* Konce trestů v oddělení pro PDF plánu kapacit (2.44.2): po měsících kolik lidí odejde a kolik
   zůstane, vždy rozdělené podle úrovně (4, 3, 2, 0 = pod 2). d = oddělení z capPlanAll.
   Po termínu = konec trestu už minul (v Lidech jsou pořád); zůstanou bez nich. */
function capPlanEnds(d,today,n){
  today=today||todayIso();n=n||12;
  const ids=[];let y=+today.slice(0,4),m=+today.slice(5,7);
  for(let i=0;i<n;i++){ids.push(y+"-"+String(m).padStart(2,"0"));m++;if(m>12){m=1;y++;}}
  const L=v=>v>=4?4:v>=3?3:v>=2?2:0;
  const ppl=d.groups.flatMap(g=>g.members.map(x=>({lv:L(x.lvl),end:(x.e&&x.e.end)||""})));
  const blank=()=>({4:0,3:0,2:0,0:0}),cnt=list=>{const o=blank();list.forEach(p=>{o[p.lv]++;});return o;};
  const tot=o=>o[4]+o[3]+o[2]+o[0];
  const months=ids.map(id=>{
    const first=id+"-01",last=id+"-"+String(new Date(+id.slice(0,4),+id.slice(5,7),0).getDate()).padStart(2,"0");
    const leave=cnt(ppl.filter(p=>p.end&&p.end>=today&&p.end>=first&&p.end<=last));
    const remain=cnt(ppl.filter(p=>!p.end||p.end>last));
    return {m:id,leave,remain,leaveN:tot(leave),remainN:tot(remain)};
  });
  const overdue=cnt(ppl.filter(p=>p.end&&p.end<today));
  const end=ids.length?ids[ids.length-1]:today;
  return {now:cnt(ppl),nowN:ppl.length,overdue,overdueN:tot(overdue),months,
    later:ppl.filter(p=>p.end&&p.end.slice(0,7)>end).length,noEnd:ppl.filter(p=>!p.end).length};
}
/** Manažerský přehled plánu kapacit (2.45.3): po měsících kolik lidí zůstane proti potřebě.
    Oddělení s lidmi nebo s plánem; ohrožený měsíc = aspoň jedno oddělení s plánem pod potřebou.
    Křivka a potřeba celkem jen z oddělení s plánem (bez plánu se potřeba nezná). */
function capPlanOutlook(all,today,n){
  today=today||todayIso();n=n||12;
  const list=all.depts.filter(d=>d.groups.some(g=>g.members.length||g.set));
  const depts=list.map(d=>{
    const set=d.groups.some(g=>g.set),need=set?d.tot.need.n:null,e=capPlanEnds(d,today,n);
    const rem=e.months.map(m=>m.remainN);
    return {name:d.dept||"Bez oddělení",set,need,now:e.nowN,overdue:e.overdueN,months:rem,leave:e.months.map(m=>m.leaveN),
      short:rem.map(v=>set?Math.max(0,need-v):0),nowShort:set?Math.max(0,need-e.nowN):0};
  });
  const ids=(depts.length?capPlanEnds(list[0],today,n).months.map(m=>m.m):[]);
  if(!ids.length){let y=+today.slice(0,4),m=+today.slice(5,7);for(let i=0;i<n;i++){ids.push(y+"-"+String(m).padStart(2,"0"));m++;if(m>12){m=1;y++;}}}
  const pl=depts.filter(d=>d.set),planned=pl.length>0,src=planned?pl:depts;
  const sum=f=>ids.map((x,i)=>src.reduce((t,d)=>t+f(d,i),0));
  const tot={now:src.reduce((t,d)=>t+d.now,0),need:planned?pl.reduce((t,d)=>t+d.need,0):null,
    months:sum((d,i)=>d.months[i]),leave:sum((d,i)=>d.leave[i]),short:ids.map((x,i)=>pl.reduce((t,d)=>t+d.short[i],0)),
    risk:ids.map((x,i)=>pl.filter(d=>d.short[i]>0).length)};
  /* 2.45.4: schodek celku = potřeba celkem − lidí celkem (jen oddělení s plánem); short je součet po odděleních */
  tot.gap=planned?tot.months.map(v=>Math.max(0,tot.need-v)):ids.map(()=>null);
  tot.nowGap=planned?Math.max(0,tot.need-tot.now):null;
  const riskIdx=tot.risk.map((r,i)=>r?i:-1).filter(i=>i>=0);
  let min=null;tot.months.forEach((v,i)=>{if(!min||v<min.v)min={v,m:ids[i]};});
  return {today,ids,depts,planned,tot,riskN:riskIdx.length,first:riskIdx.length?ids[riskIdx[0]]:"",min,
    maxShort:Math.max(0,...tot.short),nowShort:pl.reduce((t,d)=>t+d.nowShort,0)};
}
/* Historie plánu kapacit: potřeba skupiny „původně → teď“ (opakovaná úprava do 10 minut se
   sloučí podle klíče cp:skupina) a poznámka. */
function cpChanges(A,B,add,st){
  A=A||blankCapPlan();B=B||blankCapPlan();
  const name=id=>{const p=posIn(st,id);return p?p.name||"(bez názvu)":"(smazaná skupina)";};
  const txt=g=>g?g.n+" "+(g.n===1?"člověk":g.n>=2&&g.n<=4?"lidé":"lidí")+" (2+ "+g.l2+", 3+ "+g.l3+", 4 "+g.l4+")":"bez plánu";
  new Set([...Object.keys(A.groups||{}),...Object.keys(B.groups||{})]).forEach(id=>{
    const x=(A.groups||{})[id]||null,y=(B.groups||{})[id]||null;
    if(JSON.stringify(x)!==JSON.stringify(y))add("capplan","",{m:"cp:"+id,p:"Plán kapacit – "+name(id)+": ",v0:txt(x),v1:txt(y)});
  });
  if((A.note||"")!==(B.note||""))add("capplan","Plán kapacit: "+(B.note?"poznámka „"+B.note.slice(0,80)+(B.note.length>80?"…":"")+"“":"poznámka smazána"),{m:"cpnote"});
}

