/* ==========================================================================
   KPI: VÝKONNOST NA OSOBU (verze 2.44)
   Za měsíc z evidence práce (S.production; od listopadu 2026 ji plní soubor Docházka a výkony)
   a docházky (S.periods). Průměr na den = kusy ÷ odpracované dny z docházky (všední + víkendové,
   stejně jako Ø ks/den v Přehledu). Lidé po odděleních (skupina k poslednímu dni měsíce podle
   historie zařazení), bez vedoucích a vyřazených.
   ========================================================================== */
const KPI_SORT=[["ks","Ø ks na den"],["norm","Plnění normy"],["ph","Kusy za hodinu"],["h","Ø vykázané hodiny na den"],["use","Využití fondu"]];
/** Měsíce s evidencí práce, nejnovější první. */
function kpiMonths(){return Object.keys(S.production||{}).filter(m=>PERIOD_ID.test(m)).sort().reverse();}
/** Výkonnost lidí za měsíc po odděleních. sort = klíč z KPI_SORT, dir = "best" | "worst". */
function kpiPerf(month,opts){
  opts=opts||{};
  const sort=KPI_SORT.some(k=>k[0]===opts.sort)?opts.sort:"ks",dir=opts.dir==="worst"?"worst":"best";
  const prod=S.production[month],per=S.periods[month]||null,today=todayIso(opts.now);
  if(!prod)return {month,none:true,depts:[],people:[],sort,dir};
  const last=month+"-"+String(new Date(+month.slice(0,4),+month.slice(5,7),0).getDate()).padStart(2,"0");
  const endIso=last<today?last:today;
  return withPeriod(month,()=>{
    const idx=prodIndex(),time=!!prod.time,ord=dvGroupOrder();
    // 2.74: bez normy v evidenci plnění podle norem, které si systém spočítal z vykázaných časů
    const an=opts.auto===false?new Map():kpiAutoNorm(month);
    let autoN=0;
    const people=[];
    Object.entries(idx).forEach(([key,pr])=>{
      const e=S.employees[key];if(!e||e.excluded||isLead(e))return;
      const att=per?attendance(per,key):null,days=shiftDays(att),wd=workedDays(att&&att.found?att:null);
      const g=dvGroupOf(e,endIso,today);
      const q={key,name:(e.last+" "+e.first).trim(),wid:e.wid||"",gid:g.id,group:g.name,dept:g.id==="-"?"Bez skupiny":(g.dept||"").trim()||g.name,
        days,wd,hrs:att&&att.found?att.totalHours:0,ks:pr.total,spent:time?pr.spent:null,norm:pr.nspent>0?pr.norm/pr.nspent*100:null,nm:pr.norm||0,ns:pr.nspent||0,
        fund:att&&att.found?att.totalHours*60:0};
      const a=!(pr.nspent>0)&&an.get(key);
      if(a){q.nm=a.nm;q.ns=a.ns;q.norm=a.nm/a.ns*100;q.autoN=true;autoN++;}
      q.v={ks:days?q.ks/days:null,h:time&&days?pr.spent/60/days:null,ph:time&&pr.spent>0?q.ks/(pr.spent/60):null,
        norm:q.norm,use:time&&att&&att.found&&att.totalHours>0?pr.spent/(att.totalHours*60)*100:null};
      people.push(q);
    });
    const cmp=kpiCmp(sort,dir);
    const byDept=new Map();
    people.forEach(q=>{let d=byDept.get(q.dept);if(!d){d={name:q.dept,ord:ord(q.gid),people:[]};byDept.set(q.dept,d);}d.ord=Math.min(d.ord,ord(q.gid));d.people.push(q);});
    const depts=[...byDept.values()].sort((a,b)=>a.ord-b.ord||a.name.localeCompare(b.name,"cs")).map(d=>{
      d.people.sort(cmp);let r=0;d.people.forEach(q=>{q.rank=q.v[sort]==null?null:++r;});
      d.avg=kpiAvg(d.people,time);
      const vals=d.people.map(q=>q.v[sort]).filter(v=>v!=null);d.max=vals.length?Math.max(...vals):null;
      return d;
    });
    const unmatched=Object.values(prod.names).filter(rec=>!prodKeyFor(rec.name)).length;
    return {month,time,depts,people,tot:kpiAvg(people,time),unmatched,noAtt:!per,sort,dir,autoN};
  });
}
/** Řazení: lepší výsledek nahoru (best) nebo dolů (worst); lidé bez hodnoty vždy na konci. */
function kpiCmp(sort,dir){
  return (a,b)=>{const x=a.v[sort],y=b.v[sort];
    if(x==null||y==null)return x==null&&y==null?a.name.localeCompare(b.name,"cs"):x==null?1:-1;
    return (dir==="worst"?x-y:y-x)||a.name.localeCompare(b.name,"cs");};
}
/** Průměr skupiny lidí: vážený součty (kusy ÷ dny, norma ÷ čas s normou, čas ÷ hodiny v práci),
    ne průměr průměrů: člověk se dvěma dny neváží stejně jako člověk s dvaceti. */
function kpiAvg(list,time){
  const sum=f=>list.reduce((s,q)=>s+(f(q)||0),0);
  const days=Math.round(sum(q=>q.days)*100)/100,wd=sum(q=>q.wd),hrs=sum(q=>q.hrs),ks=sum(q=>q.ks),sp=time?sum(q=>q.spent):0;
  const nm=sum(q=>q.nm),ns=sum(q=>q.ns);
  const us=list.filter(q=>q.v.use!=null),usp=us.reduce((s,q)=>s+q.spent,0),uf=us.reduce((s,q)=>s+q.fund,0);
  return {people:list.length,days,wd,hrs,ks,
    ks1:days?ks/days:null,h:time&&days?sp/60/days:null,ph:time&&sp>0?ks/(sp/60):null,
    norm:ns>0?nm/ns*100:null,use:uf>0?usp/uf*100:null};
}
/** Excel: jeden list, oddělení pod sebou s pořadím a průměrem oddělení. */
function kpiSheets(x){
  const lab=Object.fromEntries(KPI_SORT);
  const r1=v=>v==null?"":Math.round(v*10)/10;
  const rows=[["Výkonnost na osobu · "+monthLabel(x.month)],["Řazeno: "+lab[x.sort]+(x.dir==="worst"?", od nejhorších":", od nejlepších")],[],
    ["Oddělení","Pořadí","Příjmení a jméno","ID","Skupina","Dny v práci","Odpracované hodiny","Odpracované dny (přepočet na směnu)","Kusy celkem","Ø ks na den","Ø vykázané h na den","Kusy za hodinu","Plnění normy %","Využití fondu %"]];
  x.depts.forEach(d=>{
    d.people.forEach(q=>rows.push([d.name,q.rank==null?"":q.rank,q.name,q.wid,q.group,q.wd,r1(q.hrs),q.days,q.ks,r1(q.v.ks),r1(q.v.h),r1(q.v.ph),r1(q.v.norm),r1(q.v.use)]));
    rows.push([d.name,"","Průměr oddělení","","",d.avg.wd,r1(d.avg.hrs),d.avg.days,d.avg.ks,r1(d.avg.ks1),r1(d.avg.h),r1(d.avg.ph),r1(d.avg.norm),r1(d.avg.use)]);
  });
  rows.push(["Celkem","","","","",x.tot.wd,r1(x.tot.hrs),x.tot.days,x.tot.ks,r1(x.tot.ks1),r1(x.tot.h),r1(x.tot.ph),r1(x.tot.norm),r1(x.tot.use)]);
  if(x.autoN)rows.push([],["Plnění normy u "+x.autoN+" "+(x.autoN===1?"člověka":"lidí")+" bez normy v evidenci podle norem systému z vykázaných časů (KPI → Normy)."]);
  return [{name:"Výkonnost na osobu",rows}];
}

/* ==========================================================================
   KPI: NORMY Z VYKÁZANÝCH ČASŮ (verze 2.74)
   Z vykázané práce souboru Docházka a výkony (perf[m][id].n): norma dílu a operace = minuty ÷
   dokončené kusy (vážený průměr, ne průměr průměrů). Primárně ze zkušených pracovníků
   (hodnocení dovedností jejich skupiny ke konci měsíce nad KPI_NORM_PCT %, mění se v Nastavení
   KPI); když díl a operaci žádný zkušený nedělal, z průměru všech. Záznamy do DV_NORM_MIN minut
   se vyřadí už při nahrání. Vedoucí, lidé bez skupiny a neznámá ID jsou jen v průměru všech.
   ========================================================================== */
const KPI_NORM_PCT=45;
function kpiNormPct(){const n=S.workAudit&&S.workAudit.normPct;return n>=1&&n<=99?n:KPI_NORM_PCT;}
/** Měsíce s vykázanou prací (nejnovější první); with = s daty pro normy (soubor nahraný od 2.74), without = bez nich. */
function kpiNormMonths(){
  const perf=(S.workAudit&&S.workAudit.dv&&S.workAudit.dv.perf)||{};
  const all=Object.keys(perf).filter(m=>/^\d{4}-\d{2}$/.test(m)).sort().reverse();
  const has=m=>Object.values(perf[m]).some(q=>q&&(q.n||q.s));
  return {all,with:all.filter(has),without:all.filter(m=>!has(m))};
}
/** Zkušenost ke konci měsíce: procento dovedností skupiny, kam člověk tehdy patřil (null = vedoucí, bez skupiny, neznámé ID). */
function kpiExpAt(e,month,today){
  if(!e||isLead(e))return null;
  const last=month+"-"+String(new Date(+month.slice(0,4),+month.slice(5,7),0).getDate()).padStart(2,"0"),end=last<today?last:today;
  const g=dvGroupOf(e,end,today),pos=S.positions.find(p=>p.id===g.id&&isGroup(p));
  return pos?ctPctAt(e,pos,ctDayEnd(end)).pct:null;
}
/**
 * Normy: {pct, min, months (použité), without (bez dat pro normy), rows, short, n, fromAll, exp, people,
 * parts: [{part, norm (součet operací), ks, rows, ops: [{op, norm, src exp|all, exp {ks, min, rows, people}, all {…}, allNorm}]}]}.
 * opts.month = jen ten měsíc, jinak všechny měsíce s daty pro normy.
 */
function kpiNorms(opts){
  opts=opts||{};
  const pct=kpiNormPct(),today=todayIso(opts.now),dv=(S.workAudit&&S.workAudit.dv)||blankDv(),mm=kpiNormMonths();
  const months=opts.month?mm.with.filter(m=>m===opts.month):mm.with;
  const map=dvWidMap(),acc=new Map(),expP=new Set(),allP=new Set();
  let rows=0,short=0;
  const box=()=>({ks:0,min:0,rows:0,people:new Set()});
  months.forEach(m=>Object.entries(dv.perf[m]||{}).forEach(([wid,q])=>{
    short+=q.s||0;
    if(!q.n)return;
    const e=map.get(wid),who=e?e.key:"#"+wid,ep=e?kpiExpAt(e,m,today):null,isExp=ep!=null&&ep>pct;
    allP.add(who);if(isExp)expP.add(who);
    Object.entries(q.n).forEach(([part,ops])=>Object.entries(ops).forEach(([op,v])=>{
      let a=acc.get(part);if(!a){a=new Map();acc.set(part,a);}
      let o=a.get(op);if(!o){o={all:box(),exp:box()};a.set(op,o);}
      const add=b=>{b.ks+=v[0];b.min+=v[1];b.rows+=v[2];b.people.add(who);};
      add(o.all);if(isExp)add(o.exp);rows+=v[2];
    }));
  }));
  const r2=v=>Math.round(v*100)/100,r3=v=>Math.round(v*1000)/1000,fin=b=>({ks:r2(b.ks),min:r2(b.min),rows:b.rows,people:b.people.size});
  let n=0,fromAll=0;
  const parts=[...acc.entries()].map(([part,a])=>{
    const ops=[...a.entries()].map(([op,o])=>{
      const exp=fin(o.exp),all=fin(o.all),src=exp.ks>0?"exp":"all",b=src==="exp"?exp:all;
      n++;if(src==="all")fromAll++;
      return {op,norm:b.ks>0?r3(b.min/b.ks):null,src,exp,all,allNorm:all.ks>0?r3(all.min/all.ks):null};
    }).sort((x,y)=>x.op.localeCompare(y.op,"cs"));
    return {part,ops,norm:r3(ops.reduce((s,o)=>s+(o.norm||0),0)),ks:r2(ops.reduce((s,o)=>s+o.all.ks,0)),rows:ops.reduce((s,o)=>s+o.all.rows,0)};
  }).sort((x,y)=>x.part.localeCompare(y.part,"cs"));
  return {pct,min:DV_NORM_MIN,months,without:mm.without,all:mm.all,rows,short,parts,n,fromAll,exp:expP.size,people:allP.size};
}
/** Norma dílu a operace (min/ks) z výsledku kpiNorms, jinak null. */
function kpiNormOf(x,part,op){const p=x.parts.find(y=>y.part===part),o=p&&p.ops.find(y=>y.op===op);return o?o.norm:null;}
/** Plnění podle norem systému za měsíc: Map klíč člověka → {nm (normominuty za kusy), ns (vykázané minuty)}. */
function kpiAutoNorm(month,x){
  x=x||kpiNorms();
  const out=new Map(),perf=((S.workAudit&&S.workAudit.dv&&S.workAudit.dv.perf)||{})[month]||{},map=dvWidMap();
  const idx=new Map(x.parts.map(p=>[p.part,new Map(p.ops.map(o=>[o.op,o.norm]))]));
  Object.entries(perf).forEach(([wid,q])=>{
    const e=map.get(wid);if(!e||!q.n)return;
    let nm=0,ns=0;
    Object.entries(q.n).forEach(([part,ops])=>Object.entries(ops).forEach(([op,v])=>{const nr=idx.get(part)&&idx.get(part).get(op);if(nr>0){nm+=v[0]*nr;ns+=v[1];}}));
    if(ns>0){const o=out.get(e.key)||{nm:0,ns:0};o.nm+=nm;o.ns+=ns;out.set(e.key,o);}
  });
  return out;
}
/** Excel: list Normy (díl, operace, norma, kusy za hodinu, zdroj, zkušení a všichni). */
function kpiNormSheets(x){
  const r=v=>v==null?"":Math.round(v*100)/100;
  const rows=[["Normy z vykázaných časů"+(x.months.length?" · "+x.months.slice().reverse().map(monthLabel).join(", "):"")],
    ["Zkušení = hodnocení dovedností skupiny nad "+x.pct+" %; díl a operace bez zkušených = průměr všech. Záznamy do "+x.min+" minut se nepočítají."],[],
    ["Díl","Operace","Norma (min/ks)","Kusy za hodinu","Zdroj","Zkušení: lidí","Zkušení: záznamů","Zkušení: kusů","Zkušení: minut","Ø všech (min/ks)","Všichni: lidí","Všichni: záznamů","Všichni: kusů","Všichni: minut"]];
  x.parts.forEach(p=>{
    p.ops.forEach(o=>rows.push([p.part,o.op||"(bez operace)",r(o.norm),o.norm>0?r(60/o.norm):"",o.src==="exp"?"zkušení":"všichni (zkušení díl nedělali)",o.exp.people,o.exp.rows,o.exp.ks,o.exp.min,r(o.allNorm),o.all.people,o.all.rows,o.all.ks,o.all.min]));
    if(p.ops.length>1)rows.push([p.part,"celkem za díl",r(p.norm),p.norm>0?r(60/p.norm):"","","","","","","","",p.rows,p.ks,""]);
  });
  return [{name:"Normy",rows}];
}
