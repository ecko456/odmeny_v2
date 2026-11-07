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
    const people=[];
    Object.entries(idx).forEach(([key,pr])=>{
      const e=S.employees[key];if(!e||e.excluded||isLead(e))return;
      const att=per?attendance(per,key):null,days=shiftDays(att),wd=workedDays(att&&att.found?att:null);
      const g=dvGroupOf(e,endIso,today);
      const q={key,name:(e.last+" "+e.first).trim(),wid:e.wid||"",gid:g.id,group:g.name,dept:g.id==="-"?"Bez skupiny":(g.dept||"").trim()||g.name,
        days,wd,hrs:att&&att.found?att.totalHours:0,ks:pr.total,spent:time?pr.spent:null,norm:pr.nspent>0?pr.norm/pr.nspent*100:null,nm:pr.norm||0,ns:pr.nspent||0,
        fund:att&&att.found?att.totalHours*60:0};
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
    return {month,time,depts,people,tot:kpiAvg(people,time),unmatched,noAtt:!per,sort,dir};
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
  return [{name:"Výkonnost na osobu",rows}];
}

