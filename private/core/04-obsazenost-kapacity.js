/* ---------- plánovaná obsazenost dne (2.15) ----------
   Kdo má podle zařazení ranní a kdo odpolední: stálá ranní ráno, stálá odpolední odpoledne,
   skupiny 1 a 2 podle týdenního střídání (Matice → Směny a kapacita, S.capReport.s1am).
   Bez nastaveného střídání jsou skupiny 1 a 2 zvlášť („rot“). Nemocní, vyřazení a vedoucí
   se nepočítají. O víkendu a ve svátek se ukáže nejbližší pracovní den.
   Po odděleních: lidé na směně, plánovaná kapacita (ks/h na osobu × lidé skupiny) a dovednosti,
   které na směně nikdo (nebo jen jeden) nezvládá aspoň na úrovni z reportu kapacit. */
const DAY_SLOTS=["am","pm"];
/* Směna člověka v týdnu: am / pm, „rot“ = skupina 1 nebo 2 bez nastaveného střídání, „none“ = bez směny. */
function slotOn(e,mg){const s=shiftOf(e);return s==="R"?"am":s==="O"?"pm":s==="S1"||s==="S2"?(mg?(s===mg?"am":"pm"):"rot"):"none";}
function staffDay(from,exact){
  from=from||todayIso();
  let day=from;
  // exact (2.40.1): přesně tento den i o víkendu a svátku (úvod s dnešními příchody)
  if(!exact)for(let i=0;i<14;i++){const [y,m,d]=day.split("-").map(Number);if(mkDay(y,m,d).work)break;day=addDays(day,1);}
  const week=isoWeek(day).id,rep=S.capReport||blankCapReport(),mg=morningGroup(week,rep.s1am);
  const thr=clamp(Math.round(+rep.thr||3),1,4);
  const slotOf=e=>slotOn(e,mg);
  const all=Object.values(S.employees).filter(e=>!e.excluded&&!isLead(e));
  const live=all.filter(e=>!e.sick);
  const rows=new Map();
  const row=d=>{if(!rows.has(d))rows.set(d,{dept:d,am:[],pm:[],rot:[],none:[],sick:[],plan:{am:{ks:0,h:0},pm:{ks:0,h:0}},risks:[]});return rows.get(d);};
  departments().forEach(row);
  all.forEach(e=>{const r=row(empDept(e)||"Bez skupiny");(e.sick?r.sick:r[slotOf(e)]).push(e);});
  S.positions.forEach(p=>{
    if(!isGroup(p))return;
    const r=rows.get(deptOf(p)),members=live.filter(e=>e.positionId===p.id);
    const per=p.plan&&+p.plan.v>0?+p.plan.v:0,unit=p.plan&&p.plan.unit==="h"?"h":"ks";
    DAY_SLOTS.forEach(sl=>{
      const here=members.filter(e=>slotOf(e)===sl);
      if(per)r.plan[sl][unit]+=here.length*per;
      // riziko jen tam, kde skupina na směně někoho má (oddělení bez odpolední nehlásí nic)
      if(!here.length)return;
      groupSkills(p).filter(s=>!s.opt).forEach(s=>{   // nepovinná dovednost riziko není (2.25)
        const n=live.filter(e=>slotOf(e)===sl&&rateOf(e,s.id)>=thr).length;
        if(n<=1)r.risks.push({slot:sl,group:p.name||"",skill:s.name,n});
      });
    });
  });
  const r1=x=>Math.round(x*10)/10;
  const depts=[...rows.values()].filter(r=>r.am.length+r.pm.length+r.rot.length+r.none.length+r.sick.length)
    .map(r=>({...r,plan:{am:{ks:r1(r.plan.am.ks),h:r1(r.plan.am.h)},pm:{ks:r1(r.plan.pm.ks),h:r1(r.plan.pm.h)}}}));
  const total={am:0,pm:0,rot:0,none:0,sick:0};
  depts.forEach(r=>Object.keys(total).forEach(k=>{total[k]+=r[k].length;}));
  // kontroly naplánované na ten den a termíny Top 5 (po termínu a na ten den)
  const ap=audPlan(week);
  const checks=ap?ap.items.filter(i=>i.day===day&&i.state!=="skip").map(i=>{const e=S.employees[i.key];return {item:i,e:e||null,slot:e?slotOf(e):"none"};}):[];
  const dl=S.eff&&Array.isArray(S.eff.cases)?effDeadlines(day,0):[];
  return {from,day,today:day===from,week,mg,thr,depts,total,
    checks:{list:checks,open:checks.filter(c=>c.item.state==="plan").length,done:checks.filter(c=>c.item.state==="done").length},
    deadlines:{late:dl.filter(x=>x.late).length,due:dl.filter(x=>!x.late).length}};
}

/* ---------- plán a skutečnost podle docházky (2.24, přepočet 2.24.2) ----------
   Týden zpětně, jen pracovní dny (víkend a svátek se nepočítají ani s hodinami) a jen dny
   s nahranou docházkou.
   - V plánu je každý, kdo je v tom týdnu ve skupině (historie zařazení, levelAt ke konci týdne)
     a není vedoucí; směna jen určuje ranní / odpolední (bez směny = „bez směny“, pořád v plánu).
     Vyřazený (dnešní stav) je v plánu, jen když má v tom týdnu v docházce hodiny nebo kód (tehdy
     ještě pracoval). Plánované hodiny = délka směny (zkrácený pátek).
   - Skutečnost = hodiny a kódy z docházky. Odpracované jsou jen hodiny ze dnů v práci: den s kódem
     nepřítomnosti (dovolená, nemoc, neomluveno…) se nepočítá, ani když má u kódu hodiny („8 D“).
     Odpracováno počítá jen lidi v plánu; hodiny lidí mimo
     plán (bez skupiny, vedoucí, jména z docházky, která v Lidech nejsou) jsou zvlášť jako navíc
     a do plnění se nepočítají.
   - Zkušení pracovníci a pracovníci v zácviku zvlášť (dřív „schopní“ a „v zaškolování“, pojmy
     v reportech od 2.25): zkušený = průměr dovedností skupiny aspoň práh reportu
     (capableIn, dnešní hodnocení).
   Páruje se podle jména: řádek docházky má stejný klíč jako člověk (příjmení|jméno). */
const PR_SLOT={am:"ranní",pm:"odpolední",rot:"skupina 1/2",noshift:"bez směny",none:""};
/* Docházka člověka v jeden den: {h, c, found}, nebo null, když pro ten den docházka není. */
function attDay(key,iso){
  const p=S.periods&&S.periods[iso.slice(0,7)];
  const i=p&&Array.isArray(p.days)?p.days.indexOf(iso):-1;
  if(i<0)return null;
  const row=p.rows&&p.rows[key];
  return {h:row?Math.max(0,+row.h[i]||0):0,c:row&&row.c&&row.c[i]?String(row.c[i]):"",found:!!row};
}
/* Týdny, pro které je nahraná aspoň část docházky, od nejnovějšího. */
function attWeeks(){
  const set=new Set();
  Object.values(S.periods||{}).forEach(p=>(p.days||[]).forEach(iso=>set.add(isoWeek(iso).id)));
  return [...set].sort().reverse();
}
/* Počty a hodiny jedné buňky souhrnu (den nebo týden, skupina nebo celkem). */
function prBlank(){
  const part=()=>({planN:0,present:0,planH:0,realH:0,excusedH:0});
  return {planN:0,am:0,pm:0,rot:0,noshift:0,present:0,excused:0,miss:0,planH:0,realH:0,excusedH:0,extraN:0,extraH:0,ok:part(),tr:part()};
}
function prAdd(t,x){
  ["planN","am","pm","rot","noshift","present","excused","miss","planH","realH","excusedH","extraN","extraH"].forEach(k=>{t[k]+=x[k];});
  ["ok","tr"].forEach(p=>["planN","present","planH","realH","excusedH"].forEach(k=>{t[p][k]+=x[p][k];}));
  return t;
}
function prRound(t){
  const r=v=>Math.round(v*100)/100;
  t.planH=r(t.planH);t.realH=r(t.realH);t.excusedH=r(t.excusedH);t.extraH=r(t.extraH);
  ["ok","tr"].forEach(p=>{t[p].planH=r(t[p].planH);t[p].realH=r(t[p].realH);t[p].excusedH=r(t[p].excusedH);});
  return t;
}
function planReality(weekId){
  const w=weekById(weekId);
  if(!w)return null;
  const rep=S.capReport||blankCapReport(),mg=morningGroup(weekId,rep.s1am),thr=clamp(Math.round(+rep.thr||3),1,4);
  const ex=excusedSet(),r2=x=>Math.round(x*100)/100;
  const week=Array.from({length:7},(_,i)=>{const [y,m,d]=addDays(w.from,i).split("-").map(Number);const x=mkDay(y,m,d);
    const p=S.periods&&S.periods[x.iso.slice(0,7)];x.has=!!p&&Array.isArray(p.days)&&p.days.includes(x.iso);return x;});
  const days=week.filter(d=>d.work);   // jen pracovní dny (víkend a svátek se nepočítají)
  const [ty,tm,td]=w.to.split("-").map(Number),endTs=new Date(ty,tm-1,td,23,59,59).getTime();
  const keys=new Set(Object.keys(S.employees));
  days.forEach(d=>{if(d.has)Object.keys(S.periods[d.iso.slice(0,7)].rows||{}).forEach(k=>keys.add(k));});
  const rows=[];
  keys.forEach(key=>{
    const e=S.employees[key]||null;
    const att=days.map(d=>d.has?attDay(key,d.iso):null);
    const inAtt=att.some(a=>a&&a.found),active=att.some(a=>a&&(a.h>0||a.c));
    const posId=e?levelAt(e,endTs).pos:null;
    const pos=posId?S.positions.find(p=>p.id===posId)||null:null;
    const lead=!!e&&isLead(e),out=!!e&&!!e.excluded;
    const planned=!!e&&!!pos&&!lead&&(!out||active);
    const slot=planned?(shiftOf(e)?slotOn(e,mg):"noshift"):"none";
    const capable=planned&&capableIn(e,pos,thr);
    const cells=days.map((d,i)=>{
      const a=att[i],plan=planned&&d.has?dayShift(d,friShort(e,d)):0;
      /* den s kódem je nepřítomnost i s hodinami („8 D“): ty hodiny nejsou odpracované (w = 0) */
      let kind="";
      if(a){if(a.c)kind=ex.has(norm(a.c).toUpperCase())?"excused":"code";else if(a.h>0)kind="work";else if(plan)kind="miss";}
      return {plan,h:a?a.h:null,c:a?a.c:"",kind,w:kind==="work"?a.h:0,absH:a&&a.c?a.h:0};
    });
    const sumH=cells.reduce((x,c)=>x+c.w,0),absH=cells.reduce((x,c)=>x+c.absH,0);
    if(!planned&&sumH<=0)return;   // mimo plán a nepracoval: do výstupu nepatří
    let first=e?e.first:"",last=e?e.last:"";
    if(!e)days.some(d=>{const row=d.has&&S.periods[d.iso.slice(0,7)].rows[key];if(row){first=row.first||"";last=row.last||"";}return !!row;});
    const codes={};
    cells.forEach(c=>{if(c.c)codes[c.c]=(codes[c.c]||0)+1;});
    const planH=r2(cells.reduce((x,c)=>x+c.plan,0));
    rows.push({key,e,first,last,wid:e&&e.wid!=null?String(e.wid):"",pos,dept:pos?deptOf(pos):"",shift:e?shiftOf(e):"",slot,planned,capable,
      note:!e?"v Lidech není":lead?"vedoucí, mimo plán":!pos?"bez skupiny, mimo plán":out?"dnes vyřazen":!shiftOf(e)?"bez směny":!inAtt?"v docházce není (jiné jméno?)":"",
      pct:e&&pos?skillPct(e,pos):null,cells,codes,
      planH,realH:planned?r2(sumH):0,extraH:planned?0:r2(sumH),absH:r2(absH),fill:planned&&planH>0?sumH/planH:null,
      planDays:cells.filter(c=>c.plan).length,workDays:cells.filter(c=>c.plan&&c.kind==="work").length,
      excused:cells.filter(c=>c.plan&&c.kind==="excused").length,miss:cells.filter(c=>c.plan&&(c.kind==="miss"||c.kind==="code")).length,
      extraDays:planned?0:cells.filter(c=>c.w>0).length});
  });
  const order=new Map(S.positions.map((p,i)=>[p.id,i]));
  const ord=r=>r.pos?order.get(r.pos.id):999;
  rows.sort((a,b)=>(ord(a)-ord(b))||(b.planned-a.planned)||(b.capable-a.capable)||norm(a.last+" "+a.first).localeCompare(norm(b.last+" "+b.first),"cs"));
  const byGroup=new Map();
  rows.forEach(r=>{
    const id=r.planned&&r.pos?r.pos.id:"";
    if(!byGroup.has(id))byGroup.set(id,{pos:id?r.pos:null,dept:id?deptOf(r.pos):"",name:id?r.pos.name||"(bez názvu)":"Mimo plán",days:days.map(prBlank)});
    const g=byGroup.get(id),part=r.capable?"ok":"tr";
    r.cells.forEach((c,i)=>{
      const t=g.days[i];
      if(r.planned){
        if(c.plan){t.planN++;t[r.slot]++;t.planH+=c.plan;t[part].planN++;t[part].planH+=c.plan;
          if(c.kind==="work"){t.present++;t[part].present++;}else if(c.kind==="excused"){t.excused++;t.excusedH+=c.plan;t[part].excusedH+=c.plan;}else t.miss++;}
        t.realH+=c.w;t[part].realH+=c.w;
      }else if(c.w>0){t.extraN++;t.extraH+=c.w;}
    });
  });
  const groups=[...byGroup.values()].sort((a,b)=>(a.pos?order.get(a.pos.id):999)-(b.pos?order.get(b.pos.id):999));
  groups.forEach(g=>{g.days.forEach(prRound);g.week=prRound(g.days.reduce(prAdd,prBlank()));});
  const total=prRound(groups.map(g=>g.week).reduce(prAdd,prBlank()));
  const totalDays=days.map((_,i)=>prRound(groups.map(g=>g.days[i]).reduce(prAdd,prBlank())));
  return {week:w,id:weekId,mg,thr,days,rows,groups,total,totalDays,missing:days.filter(d=>!d.has).map(d=>d.iso),
    holidays:week.filter(d=>d.hol&&!d.weekend).map(d=>({iso:d.iso,name:d.hol})),
    unpaired:rows.filter(r=>/v docházce není|v Lidech není/.test(r.note)).length};
}
/* Plnění hodin v % (na desetiny), bez plánu "". */
function prPct(real,plan){return plan>0?Math.round(real/plan*1000)/10:"";}
/* Excel plánu a skutečnosti: Souhrn (týden po skupinách), Po dnech (skupina × den) a Lidé. */
function planRealitySheets(weekId){
  const x=planReality(weekId);
  if(!x)return [];
  const used=new Set(),dl=d=>DOW[d.dow]+" "+d.d+". "+d.m+".";
  const head=[["Plán a skutečnost podle docházky – "+weekLong(x.id)],
    ["Plán = zařazení z Matice dovedností (skupina platná v tom týdnu, směna podle dnešního zařazení, "+(x.mg?"ranní tento týden: skupina "+(x.mg==="S1"?1:2):"střídání skupin 1 a 2 není nastavené")+"), skutečnost = nahraná docházka. Páruje se podle jména."],
    ["Počítají se jen pracovní dny; víkendy a svátky se nepočítají ani s odpracovanými hodinami."+(x.holidays.length?" Svátek v tomto týdnu: "+x.holidays.map(h=>dayText(h.iso,false)+" ("+h.name+")").join(", ")+".":"")],
    ["Odpracováno = jen hodiny ze dnů v práci; den s kódem nepřítomnosti (dovolená, nemoc, neomluveno…) se do odpracovaných hodin nepočítá, ani když má u kódu hodiny (např. 8 D). Odpracováno a plnění jen za lidi v plánu; hodiny lidí mimo plán (bez skupiny, vedoucí, jména mimo Lidi) jsou zvlášť ve sloupcích Mimo plán. Plnění = odpracováno ÷ plán; omluveno = plánované hodiny dnů s omluveným kódem (dovolená, nemoc…), plnění bez omluvených je odpracováno ÷ (plán − omluveno). Zkušený pracovník = průměr dovedností skupiny aspoň úroveň "+x.thr+" (dnešní hodnocení), ostatní jsou pracovníci v zácviku."],
    ...(x.missing.length?[["Docházka chybí pro: "+x.missing.map(iso=>dl(x.days.find(d=>d.iso===iso))).join(", ")+" (tyto dny se neporovnávají)."]]:[]),
    ...(x.unpaired?[["Nespárováno podle jména: "+x.unpaired+" (viz list Lidé, sloupec Poznámka)."]]:[]),
    []];
  /* pojmy v reportech (2.25, přání uživatele): Zkušení pracovníci a Pracovníci v zácviku */
  const PRO="Zkušení pracovníci: ",TRN="Pracovníci v zácviku: ";
  const hoursHead=["Plán h","Odpracováno h","Rozdíl h","Plnění %","Omluveno h","Plnění bez omluvených %",PRO+"lidí v plánu",PRO+"přišlo",PRO+"plán h",PRO+"odpracováno h",PRO+"plnění %",
    TRN+"lidí v plánu",TRN+"přišlo",TRN+"plán h",TRN+"odpracováno h",TRN+"plnění %","Mimo plán: lidodny s hodinami","Mimo plán: h"];
  const hours=t=>[t.planH,t.realH,Math.round((t.realH-t.planH)*100)/100,prPct(t.realH,t.planH),t.excusedH,prPct(t.realH,t.planH-t.excusedH),
    t.ok.planN,t.ok.present,t.ok.planH,t.ok.realH,prPct(t.ok.realH,t.ok.planH),t.tr.planN,t.tr.present,t.tr.planH,t.tr.realH,prPct(t.tr.realH,t.tr.planH),t.extraN,t.extraH];
  const counts=t=>[t.planN,t.present,t.excused,t.miss];
  const sumRows=[...head,["Oddělení","Skupina","Lidodny v plánu","Přišlo","Omluveno","Neomluveno / chybí",...hoursHead]];
  x.groups.forEach(g=>sumRows.push([g.dept,g.name,...counts(g.week),...hours(g.week)]));
  sumRows.push(["","Celkem",...counts(x.total),...hours(x.total)]);
  const dayRows=[...head,["Oddělení","Skupina","Den","Plán lidí","Ranní","Odpolední","Skupina 1/2 (bez střídání)","Bez směny","Přišlo","Omluveno","Neomluveno / chybí",...hoursHead]];
  const dayLine=(g,label,t)=>[g.dept,g.name,label,t.planN,t.am,t.pm,t.rot,t.noshift,t.present,t.excused,t.miss,...hours(t)];
  x.groups.forEach(g=>{
    x.days.forEach((d,i)=>{const t=g.days[i];if(d.has&&(t.planN||t.realH||t.extraH))dayRows.push(dayLine(g,dl(d),t));});
    dayRows.push(dayLine(g,"Celý týden",g.week));
    dayRows.push([]);
  });
  x.days.forEach((d,i)=>{if(d.has)dayRows.push(dayLine({dept:"",name:"Všechny skupiny"},dl(d),x.totalDays[i]));});
  dayRows.push(dayLine({dept:"",name:"Všechny skupiny"},"Celý týden",x.total));
  const pHead=["Příjmení","Jméno","ID v evidenci práce","Oddělení","Skupina","Směna","V týdnu","Dovednosti %","Zkušený pracovník",
    ...x.days.flatMap(d=>[dl(d)+" plán",dl(d)+" skutečnost"]),
    "Plán h","Odpracováno h","Rozdíl h","Plnění %","Mimo plán h","Hodiny u nepřítomnosti (nepočítají se)","Plánované dny","Přišel","Omluveno","Neomluveno / chybí","Kódy","Poznámka"];
  const pRows=[...head,pHead];
  x.rows.forEach(r=>pRows.push([r.last,r.first,r.wid,r.dept,r.pos?r.pos.name:"",r.shift?shiftName(r.shift):"",PR_SLOT[r.slot]||"mimo plán",
    r.pct!=null?Math.round(r.pct):"",r.planned?(r.capable?"ano":"v zácviku"):"",
    ...x.days.flatMap((d,i)=>{const c=r.cells[i];
      if(!d.has)return ["bez docházky","bez docházky"];
      return [c.plan||"",c.c?(c.h>0?c.c+" ("+nf(c.h,2)+" h)":c.c):c.h>0?c.h:c.plan?"chybí":""];}),
    r.planH,r.realH,r.planned?Math.round((r.realH-r.planH)*100)/100:"",r.fill!=null?Math.round(r.fill*1000)/10:"",r.extraH||"",r.absH||"",r.planDays,r.workDays,r.excused,r.miss,
    Object.entries(r.codes).map(([k,n])=>k+(n>1?" ×"+n:"")).join(", "),r.note]));
  const hc=[9,13,9,9,10,12,16,14,14,18,16,16,14,14,18,16,12,10];
  return [{name:sheetName("Souhrn",used),rows:sumRows,cols:[16,20,10,8,10,12,...hc]},
    {name:sheetName("Po dnech",used),rows:dayRows,cols:[16,20,12,9,8,10,12,10,8,10,12,...hc]},
    {name:sheetName("Lidé",used),rows:pRows,cols:[16,12,12,16,18,18,12,11,17,...x.days.flatMap(()=>[11,12]),9,13,9,9,11,16,12,8,10,12,16,30]}];
}

/* ---------- kapacity a zaškolení v čase (2.30) ----------
   Export „od–do“ v KPI podle vzoru uživatele (měsíční souhrn zaškolenosti a týdenní souhrn
   s požadavkem). Počítají se jen pracovní dny (víkend a svátek ne, jako Plán a skutečnost).
   - Vykázáno: den, kdy má v Docházce aspoň jeden člověk hodiny nebo kód. V plánu je každý,
     kdo má v docházce toho měsíce řádek a v ten den je ve skupině Matice dovedností (historie
     zařazení), kromě vedoucích. Přišel = hodiny bez kódu nepřítomnosti (jako 2.24.2).
   - Plánováno: ostatní dny. Dnešní zařazení, směna podle střídání skupin 1 a 2
     (S.capReport.s1am), hodiny podle délky směny (zkrácený pátek). Nemocní, vyřazení
     a vedoucí se nepočítají.
   - Zkušený pracovník = procento skupiny aspoň úroveň „Kdo se počítá jako zkušený“ × 25 %.
     U vykázaných dnů a stavů v minulosti platí procento z historie (e.hist, zapisuje se při každé
     změně hodnocení); před prvním zápisem nejbližší známé (odhad), bez historie dnešní.
     U plánovaných dnů dnešní hodnocení.
   - Požadavek lidí na den z KPI: pevný z Nastavení, u vykázaných dnů jinak plán z obsazenosti.
   - Výkon (měsíce): normohodiny z evidence práce ÷ odpracované hodiny z docházky, jen lidé ve
     skupinách; index = celkem prvního měsíce s výkonem v období = 100.
   Na směně = lidé ze skupin Matice dovedností; kdo není v žádné skupině, se nepočítá. */
const CT_MAX_DAYS=1100;
const CT_KEYS=["planN","planOk","planTr","planH","present","presOk","presTr","realH","okH","trH","excused","miss",
  "trSPlan","trSPres","sick","am","pm","rot","noshift","on","onOk","onTr","onTrS","rPlanH"];
function ctCell(){const c={};CT_KEYS.forEach(k=>{c[k]=0;});return c;}
function ctAdd(a,b){CT_KEYS.forEach(k=>{a[k]+=b[k];});return a;}
function ctRound(c){["planH","realH","okH","trH","rPlanH","trSPlan","trSPres","onTrS"].forEach(k=>{c[k]=Math.round(c[k]*1e6)/1e6;});return c;}   // jen šum z desetinných čísel
function ctDayEnd(iso){const [y,m,d]=iso.split("-").map(Number);return new Date(y,m-1,d,23,59,59,999).getTime();}
/* Dny s nahranou docházkou: aspoň u jednoho člověka hodiny nebo kód (prázdný konec měsíce se nepočítá). */
function attFilledDays(){
  const set=new Set();
  Object.values(S.periods||{}).forEach(p=>{
    if(!p||!Array.isArray(p.days))return;
    const rows=Object.values(p.rows||{});
    p.days.forEach((iso,i)=>{if(rows.some(r=>(+((r.h||[])[i])||0)>0||(r.c&&r.c[i])))set.add(iso);});
  });
  return set;
}
/* Procento skupiny k okamžiku z historie zařazení: poslední zápis do ts pro tu skupinu, jinak
   nejbližší pozdější (odhad), jinak dnešní hodnocení. src = "hist" | "near" | "now". */
function ctPctAt(e,pos,ts){
  const h=(e.hist||[]).filter(x=>x.pos===pos.id&&x.pct!=null);
  let best=null;
  for(const x of h){if(x.at<=ts)best=x;else{if(!best)return {pct:x.pct,src:"near"};break;}}
  if(best)return {pct:best.pct,src:"hist"};
  return {pct:skillPct(e,pos),src:"now"};
}
/* Hranice zaškolení pro celé KPI (2.33): procento dovedností skupiny, od kterého je pracovník
   zaškolený (pod ní v zácviku). Bez vlastní hodnoty v Nastavení KPI platí úroveň
   „Kdo se počítá jako zkušený pracovník“ z Matice × 25 %. */
function waTrain(){
  const thr=clamp(Math.round(+(S.capReport||blankCapReport()).thr||3),1,4),own=S.workAudit&&S.workAudit.trainPct||null;
  return {pct:own||thr*25,own:!!own,thr};
}
function capTimeline(from,to,opts){
  opts=opts||{};
  if(!ISO_DAY.test(String(from))||!ISO_DAY.test(String(to)))return null;
  if(from>to)[from,to]=[to,from];
  let cut=false;
  if(daysBetween(from,to)>CT_MAX_DAYS){to=addDays(from,CT_MAX_DAYS);cut=true;}
  const now=opts.now||Date.now(),today=todayIso(now);
  const rep=S.capReport||blankCapReport(),tr=waTrain(),thr=tr.thr,okPct=tr.pct,lim=okPct-1e-9;
  const prog=v=>Math.min(1,(v||0)/okPct);
  const wa=S.workAudit||null,ex=excusedSet(),filled=attFilledDays();
  const groups=S.positions.filter(isGroup);
  const gIdx=new Map(groups.map((p,i)=>[p.id,i]));
  const emps=Object.values(S.employees);
  const r1=x=>Math.round(x*10)/10,r2=x=>Math.round(x*100)/100;
  const est=new Set(),noHist=new Set();   // lidé s odhadem procenta (nejbližší zápis) a bez historie (dnešní)
  const pctPast=(e,pos,ts)=>{const x=ctPctAt(e,pos,ts);if(x.src==="near")est.add(e.key);else if(x.src==="now")noHist.add(e.key);return x.pct;};
  const slotKey=(e,mg)=>{const s=slotOn(e,mg);return s==="none"?"noshift":s;};
  const days=[];
  for(let iso=from,i=0;iso<=to&&i<=CT_MAX_DAYS;iso=addDays(iso,1),i++){const [y,m,d]=iso.split("-").map(Number),x=mkDay(y,m,d);if(x.work)days.push(x);}
  const missing={};   // měsíc → lidé ze skupin, kteří v docházce toho měsíce nejsou
  const outDays=days.map(day=>{
    const iso=day.iso,real=filled.has(iso),week=isoWeek(iso).id,mg=morningGroup(week,rep.s1am);
    const cells=groups.map(()=>ctCell());
    let extraN=0,extraH=0,noGroup=0;
    if(real){
      const p=S.periods[iso.slice(0,7)],i=p.days.indexOf(iso),rows=p.rows||{},ts=ctDayEnd(iso);
      Object.keys(rows).forEach(key=>{
        const e=S.employees[key]||null,row=rows[key];
        const h=Math.max(0,+(row.h||[])[i]||0),c=row.c&&row.c[i]?String(row.c[i]):"";
        const kind=c?(ex.has(norm(c).toUpperCase())?"excused":"code"):h>0?"work":"miss";
        const w=kind==="work"?h:0;
        if(e&&isLead(e))return;   // vedoucí mimo kapacity
        const posId=e?levelAt(e,ts).pos:null,gi=posId!=null&&gIdx.has(posId)?gIdx.get(posId):-1;
        if(gi<0){if(w>0){extraN++;extraH+=w;}return;}
        const pos=groups[gi],t=cells[gi],pct=pctPast(e,pos,ts),ok=pct!=null&&pct>=lim;
        t.planN++;t[ok?"planOk":"planTr"]++;t.planH+=dayShift(day,friShort(e,day));t[slotKey(e,mg)]++;
        if(!ok)t.trSPlan+=prog(pct);
        if(kind==="work"){t.present++;t[ok?"presOk":"presTr"]++;if(!ok)t.trSPres+=prog(pct);}
        else if(kind==="excused")t.excused++;else t.miss++;
        t.realH+=w;t[ok?"okH":"trH"]+=w;
      });
      const m=iso.slice(0,7);
      if(!missing[m])missing[m]=emps.filter(e=>!e.excluded&&!isLead(e)&&e.positionId&&gIdx.has(e.positionId)&&!rows[e.key]).map(e=>e.key);
    }else{
      emps.forEach(e=>{
        if(e.excluded||isLead(e))return;
        const gi=e.positionId&&gIdx.has(e.positionId)?gIdx.get(e.positionId):-1;
        if(gi<0){if(shiftOf(e))noGroup++;return;}
        const t=cells[gi];
        if(e.sick&&e.sick<=iso){t.sick++;return;}   // nemocní (od data) se do plánu nepočítají (jako kapacity, 2.9)
        const pos=groups[gi],pct=skillPct(e,pos),ok=pct!=null&&pct>=lim;
        t.planN++;t[ok?"planOk":"planTr"]++;t.planH+=dayShift(day,friShort(e,day));t[slotKey(e,mg)]++;
        if(!ok)t.trSPlan+=prog(pct);
      });
    }
    cells.forEach(t=>{
      if(real){t.on=t.present;t.onOk=t.presOk;t.onTr=t.presTr;t.onTrS=t.trSPres;t.rPlanH=t.planH;}
      else{t.on=t.planN;t.onOk=t.planOk;t.onTr=t.planTr;t.onTrS=t.trSPlan;}
      ctRound(t);
    });
    const tot=ctRound(cells.reduce((a,b)=>ctAdd(a,b),ctCell()));
    const wd=wa&&wa.days&&wa.days[iso]?waDay(wa,iso):null;
    // plán skupin = Plán kapacit (2.69), v den přesčasu nebo práce ve svátek poloviční
    const need=groups.map(g=>capNeed(g.id,iso)),needTot=need.some(v=>v!=null)?need.reduce((s,v)=>s+(v||0),0):null;
    // požadavek = pevné číslo z Nastavení KPI (v přesčas na polovinu); bez něj s Plánem kapacit platí plán skupin
    const req=wa&&wa.target?drHalfN(wa.target,iso):needTot!=null?null:wa?((real&&wd&&wd.plan)||null):null;
    return {iso,day,week,month:iso.slice(0,7),kind:real?"real":"plan",past:iso<today,mg,cells,tot,need,needTot,half:drHalf(iso),
      extraN,extraH:r2(extraH),noGroup,req,met:req?tot.on>=req-1e-9:null,audit:wd?wd.people:null};
  });
  /* souhrn za skupinu dnů (týden, měsíc, celé období) */
  const sumDays=list=>{
    const tot=ctCell(),gs=groups.map(()=>ctCell());
    let real=0,req=0,met=0,extraH=0,audit=0,auditN=0;
    list.forEach(d=>{ctAdd(tot,d.tot);d.cells.forEach((c,i)=>ctAdd(gs[i],c));if(d.kind==="real")real++;
      if(d.req){req++;if(d.met)met++;}extraH+=d.extraH;if(d.audit!=null){audit+=d.audit;auditN++;}});
    const n=list.length,plan=n-real;
    return {n,real,plan,kind:!n?"":!plan?"real":!real?"plan":"mix",from:n?list[0].iso:"",to:n?list[n-1].iso:"",
      tot:ctRound(tot),groups:gs.map(ctRound),req,met,extraH:r2(extraH),audit:auditN?audit/auditN:null,
      reqAvg:req?list.filter(d=>d.req).reduce((s,d)=>s+d.req,0)/req:null};
  };
  const weeks=[],byWeek=new Map();
  outDays.forEach(d=>{if(!byWeek.has(d.week)){byWeek.set(d.week,[]);weeks.push(d.week);}byWeek.get(d.week).push(d);});
  /* stav skupin k datu: kdo je ve skupině, kolik je zkušených a v zácviku (minulost z historie,
     budoucnost dnes); v minulosti s nahranou docházkou jen lidé, kteří v ní ten měsíc jsou */
  const rosterAt=iso=>{
    const past=iso<today,ts=past?ctDayEnd(iso):now,p=S.periods&&S.periods[iso.slice(0,7)];
    const rows=past&&p&&p.rows&&Object.keys(p.rows).length&&[...filled].some(x=>x.slice(0,7)===iso.slice(0,7))?p.rows:null;
    const gs=groups.map(()=>({n:0,ok:0,tr:0,trS:0,sick:0}));
    emps.forEach(e=>{
      if(isLead(e))return;
      if(rows){if(!rows[e.key])return;}else if(e.excluded)return;
      const posId=past?levelAt(e,ts).pos:e.positionId;
      if(!posId||!gIdx.has(posId))return;
      const gi=gIdx.get(posId),pos=groups[gi],pct=past?pctPast(e,pos,ts):skillPct(e,pos),ok=pct!=null&&pct>=lim,g=gs[gi];
      g.n++;if(ok)g.ok++;else{g.tr++;g.trS+=prog(pct);}
      if(!past&&e.sick&&e.sick<=iso)g.sick++;
    });
    const t={n:0,ok:0,tr:0,trS:0,sick:0};gs.forEach(g=>Object.keys(t).forEach(k=>{t[k]+=g[k];}));
    return {iso,past,groups:gs,tot:t};
  };
  /* výkon za měsíc (2.45.1): primárně dokončené kusy na odpracovaný den (dny z docházky bez
     kódu, i víkendové). Kusy ze souboru Docházka a výkony (dv.perf), jinak z evidence práce
     (S.production). Normohodiny na odpracovanou hodinu zůstávají jen doplňkově (Excel).
     Počítají se jen lidé, kteří v měsíci něco vykázali a mají odpracovaný den. */
  const perfOf=(m,snap)=>{
    const p=S.periods&&S.periods[m],pp=S.production&&S.production[m],dvm=S.workAudit&&S.workAudit.dv&&S.workAudit.dv.perf[m];
    if(!p||!p.rows||(!pp&&!dvm))return null;
    const ks={},norms={};
    if(dvm){const wm=dvWidMap();Object.entries(dvm).forEach(([id,q])=>{const e=wm.get(id);if(!e)return;
      const n=Object.values(q.p||{}).reduce((s,v)=>s+(+v[0]||0),0);ks[e.key]=(ks[e.key]||0)+n;});}
    if(pp&&pp.names)Object.values(pp.names).forEach(rec=>{const key=prodKeyFor(rec.name);if(!key)return;
      if(!dvm)ks[key]=(ks[key]||0)+(+rec.total||0);
      if(rec.norm>0)norms[key]=(norms[key]||0)+rec.norm;});
    const ts=snap.past?ctDayEnd(snap.iso):now;
    const part=()=>({ks:0,days:0,normH:0,workH:0}),gs=groups.map(()=>({ok:part(),tr:part(),all:part()})),tot={ok:part(),tr:part(),all:part()};
    let any=false;
    withPeriod(m,()=>Object.keys(ks).forEach(key=>{
      const e=S.employees[key],row=p.rows[key];
      if(!e||!row||isLead(e)||!(ks[key]>0))return;
      const posId=snap.past?levelAt(e,ts).pos:e.positionId;
      if(!posId||!gIdx.has(posId))return;
      const gi=gIdx.get(posId),pos=groups[gi],pct=snap.past?pctPast(e,pos,ts):skillPct(e,pos),k=pct!=null&&pct>=lim?"ok":"tr";
      const att=attendance(p,key),days=workedDays(att);
      if(days<=0)return;
      const hours=(row.h||[]).reduce((s,h,i)=>s+(row.c&&row.c[i]?0:Math.max(0,+h||0)),0);
      const nh=(norms[key]||0)/60;any=true;
      [gs[gi][k],gs[gi].all,tot[k],tot.all].forEach(x=>{x.ks+=ks[key];x.days+=days;if(nh>0){x.normH+=nh;x.workH+=hours;}});
    }));
    if(!any)return null;
    return {raw:{groups:gs,tot},groups:gs.map(ctPerfFin),tot:ctPerfFin(tot),src:dvm?"dv":"prod"};
  };
  const months=[],byMonth=new Map();
  outDays.forEach(d=>{if(!byMonth.has(d.month)){byMonth.set(d.month,[]);months.push(d.month);}byMonth.get(d.month).push(d);});
  const monthList=months.map(m=>{
    const list=byMonth.get(m),snap=rosterAt(list[list.length-1].iso);
    return {id:m,...sumDays(list),roster:snap,perf:perfOf(m,snap)};
  });
  const base=(monthList.find(m=>m.perf&&m.perf.tot.all!=null)||{}).perf;
  const baseV=base?base.tot.all:null,idx=v=>v!=null&&baseV?Math.round(v/baseV*1000)/10:null;
  monthList.forEach(m=>{if(m.perf){const f=x=>({ok:idx(x.ok),tr:idx(x.tr),all:idx(x.all)});m.perf.idx={tot:f(m.perf.tot),groups:m.perf.groups.map(f)};}});
  /* stav na začátku a na konci období */
  const startIso=addDays(from,-1),endIso=outDays.length?outDays[outDays.length-1].iso:to;
  const start=rosterAt(startIso),end=rosterAt(endIso);
  /* vývoj zaškolení u lidí: změny procenta nebo skupiny v období (do dneška) */
  const fromTs=ctDayEnd(startIso),toTs=to<today?ctDayEnd(to):now;
  const dev=[];
  emps.forEach(e=>{
    if(isLead(e))return;
    const ch=(e.hist||[]).filter(x=>x.at>fromTs&&x.at<=toTs);
    if(!ch.length)return;
    const stateAt=(ts,cur)=>{const posId=cur?e.positionId:levelAt(e,ts).pos;const pos=posId&&gIdx.has(posId)?groups[gIdx.get(posId)]:null;
      const pct=pos?(cur?skillPct(e,pos):pctPast(e,pos,ts)):null;return {pos,pct,ok:pct!=null&&pct>=lim};};
    const a=stateAt(fromTs,false),b=stateAt(toTs,to>=today);
    if(!a.pos&&!b.pos)return;
    let prev=a,became=null,lost=null;
    const steps=ch.map(x=>{const pos=x.pos&&gIdx.has(x.pos)?groups[gIdx.get(x.pos)]:null;const pct=pos?(x.pct!=null?x.pct:skillPct(e,pos)):null,ok=pct!=null&&pct>=lim;
      if(pos&&ok&&!(prev.ok&&prev.pos===pos)&&!became)became=x.at;
      if(prev.ok&&!ok&&prev.pos===pos)lost=x.at;
      prev={pos,pct,ok};return {at:x.at,pos,pct};});
    if(a.pos===b.pos&&a.pct!=null&&b.pct!=null&&Math.abs(a.pct-b.pct)<0.05&&!became&&!lost)return;   // změna tam a zpátky
    dev.push({key:e.key,e,first:e.first,last:e.last,wid:e.wid!=null?String(e.wid):"",start:a,end:b,
      gain:a.pct!=null&&b.pct!=null&&a.pos===b.pos?r1(b.pct-a.pct):null,became,lost,steps,
      note:e.excluded?"dnes vyřazen":e.sick?"v nemoci":""});
  });
  const order=new Map(groups.map((p,i)=>[p,i]));
  dev.sort((x,y)=>((x.end.pos?order.get(x.end.pos):999)-(y.end.pos?order.get(y.end.pos):999))||((y.became?1:0)-(x.became?1:0))||((y.gain||0)-(x.gain||0))||norm(x.last+" "+x.first).localeCompare(norm(y.last+" "+y.first),"cs"));
  const realDays=outDays.filter(d=>d.kind==="real"),planDays=outDays.filter(d=>d.kind!=="real");
  /* výkon za celé období: součet normohodin a hodin všech měsíců */
  const perfRaw=monthList.filter(m=>m.perf).map(m=>m.perf.raw);
  let perf=null;
  if(perfRaw.length){
    const z=()=>({ks:0,days:0,normH:0,workH:0}),acc=()=>({ok:z(),tr:z(),all:z()}),gs=groups.map(acc),tot=acc();
    const add=(a,b)=>["ok","tr","all"].forEach(k=>Object.keys(a[k]).forEach(f=>{a[k][f]+=b[k][f];}));
    perfRaw.forEach(r=>{add(tot,r.tot);r.groups.forEach((g,i)=>add(gs[i],g));});
    const f=x=>({ok:idx(x.ok),tr:idx(x.tr),all:idx(x.all)});
    perf={groups:gs.map(ctPerfFin),tot:ctPerfFin(tot)};perf.idx={tot:f(perf.tot),groups:perf.groups.map(f)};
  }
  return {from,to,cut,today,thr,okPct,okOwn:tr.own,groups,days:outDays,weeks:weeks.map(w=>{const l=byWeek.get(w);return {id:w,...sumDays(l),roster:rosterAt(l[l.length-1].iso)};}),months:monthList,
    total:sumDays(outDays),real:sumDays(realDays),plan:sumDays(planDays),start,end,dev,perf,perfBase:baseV,
    lastReal:realDays.length?realDays[realDays.length-1].iso:"",firstPlan:planDays.length?planDays[0].iso:"",
    pastPlan:planDays.filter(d=>d.past).map(d=>d.iso),
    missing:Object.entries(missing).filter(([,l])=>l.length).map(([m,l])=>({month:m,keys:l})),
    est:est.size,noHist:noHist.size,newOk:dev.filter(x=>x.became).length,
    noGroup:emps.filter(e=>!e.excluded&&!isLead(e)&&shiftOf(e)&&!(e.positionId&&gIdx.has(e.positionId))).length};
}
/* Pomocné pro zobrazení: Ø na den, podíl zkušených na směně a Ø zaškolení pracovníků v zácviku. */
function ctAvg(sum,n){return n>0?sum/n:null;}
/* výkon skupiny: ok/tr/all = kusy na odpracovaný den (2.45.1), nh = normohodiny na hodinu (doplňkově) */
function ctPerfFin(g){const v=x=>x.days>0?x.ks/x.days:null,h=x=>x.workH>0?x.normH/x.workH:null,r=v=>Math.round(v*10)/10;
  return {ok:v(g.ok),tr:v(g.tr),all:v(g.all),nh:{ok:h(g.ok),tr:h(g.tr),all:h(g.all)},ks:r(g.all.ks),days:g.all.days,normH:r(g.all.normH),workH:r(g.all.workH)};}
function ctShare(c){return c.onOk+c.onTr>0?c.onOk/(c.onOk+c.onTr):null;}
function ctFill(c){return c.rPlanH>0?c.realH/c.rPlanH:null;}
const CT_KIND={real:"vykázáno",plan:"plánováno",mix:"vykázáno a plán"};

/* odkud je hranice zaškolení (text do poznámek reportu) */
function ctTrainSrc(x){return x.okOwn?"hranice zaškolení z nastavení KPI":"úroveň "+x.thr+" z Matice dovedností";}
/* Excel kapacit a zaškolení: Souhrn, Po dnech, Po týdnech, Po měsících, Vývoj zaškolení. */
function capTimelineSheets(x){
  if(!x)return [];
  const used=new Set(),pc=v=>v==null?"":Math.round(v*1000)/10,n1=v=>v==null?"":Math.round(v*10)/10;
  const dl=iso=>{const [y,m,d]=iso.split("-").map(Number);return DOW[mkDay(y,m,d).dow]+" "+d+". "+m+". "+y;};
  const head=[["Kapacity a zaškolení – "+dayText(x.from)+" – "+dayText(x.to)],
    ["Vykázáno = pracovní dny s nahranou docházkou"+(x.lastReal?" (poslední "+dayText(x.lastReal)+")":"")+", plánováno = ostatní pracovní dny podle dnešního zařazení, směn a střídání skupin 1 a 2. Víkendy a svátky se nepočítají."],
    ["Zkušený pracovník = procento dovedností skupiny aspoň "+x.okPct+" % ("+ctTrainSrc(x)+"; u vykázaných dnů a stavů v minulosti podle historie hodnocení k danému dni, u plánu dnešní hodnocení). Ostatní ve skupině jsou pracovníci v zácviku; Ø zaškolení = jejich procento ÷ cíl ("+x.okPct+" %)."],
    ["Na směně = lidé ze skupin Matice dovedností v práci (vykázáno: hodiny bez kódu nepřítomnosti), nebo podle plánu (bez nemocných, vyřazených a vedoucích). Požadavek z KPI; v normě = na směně aspoň požadavek."],
    ...(x.pastPlan.length?[["Docházka chybí pro "+x.pastPlan.length+" pracovních dní v minulosti (např. "+x.pastPlan.slice(0,3).map(iso=>dayText(iso)).join(", ")+"), počítají se jako plán."]]:[]),
    ...x.missing.map(m=>["V docházce za "+monthLabel(m.month)+" chybí "+m.keys.length+" lidí ze skupin (jiné jméno, nebo tehdy nepracovali), do vykázaných dnů se nepočítají."]),
    ...(x.est||x.noHist?[["Historie hodnocení: u "+x.est+" lidí odhad podle nejbližšího zápisu, u "+x.noHist+" bez zápisu dnešní hodnocení."]]:[]),
    ...(x.noGroup?[[x.noGroup+" lidí se směnou nemá skupinu v Matici dovedností, do kapacit se nepočítají."]]:[]),
    ...(x.cut?[["Období je zkrácené na "+CT_MAX_DAYS+" dní."]]:[]),
    []];
  const gName=g=>g?g.name||"(bez názvu)":"Všechny skupiny",gDept=g=>g?deptOf(g):"";
  /* Souhrn */
  const sum=[...head,["Ukazatel","Na začátku ("+dayText(x.start.iso)+")","Na konci ("+dayText(x.end.iso)+")","Změna"]];
  const st=(a,b,t)=>sum.push([t,a,b,typeof a==="number"&&typeof b==="number"?Math.round((b-a)*10)/10:""]);
  const share=r=>r.n?Math.round(r.ok/r.n*1000)/10:"",trA=r=>r.tr?Math.round(r.trS/r.tr*1000)/10:"";
  st(x.start.tot.n,x.end.tot.n,"Lidí ve skupinách");st(x.start.tot.ok,x.end.tot.ok,"Zkušení pracovníci");st(x.start.tot.tr,x.end.tot.tr,"Pracovníci v zácviku");
  st(share(x.start.tot),share(x.end.tot),"Podíl zkušených %");st(trA(x.start.tot),trA(x.end.tot),"Ø zaškolení v zácviku %");
  sum.push([],["Pracovní dny",x.total.n,"vykázáno",x.real.n,"plánováno",x.plan.n],
    ["Dny s požadavkem",x.total.req,"v normě",x.total.met,"Ø požadavek",n1(x.total.reqAvg)],
    ["Nově zkušení v období",x.newOk,"lidí se změnou hodnocení",x.dev.length],[]);
  const gHead=["Oddělení","Skupina","Lidí na konci","Zkušení","V zácviku","Podíl zkušených %","Zkušení proti začátku","Ø zaškolení v zácviku %",
    "Ø na směně (vykázáno)","Ø zkušení na směně (vykázáno)","Ø na směně (plán)","Ø zkušení na směně (plán)","Plán h (vykázané dny)","Odpracováno h","Plnění hodin %","Plán h (plánované dny)",
    "Výkon zkušení (index)","Výkon v zácviku (index)","Výkon celkem (index)"];
  sum.push(gHead);
  const gRow=(g,i)=>{const e=i<0?x.end.tot:x.end.groups[i],s=i<0?x.start.tot:x.start.groups[i],R=i<0?x.real.tot:x.real.groups[i],P=i<0?x.plan.tot:x.plan.groups[i],
    pf=x.perf?(i<0?x.perf.idx.tot:x.perf.idx.groups[i]):null;
    return [gDept(g),gName(g),e.n,e.ok,e.tr,share(e),e.ok-s.ok,trA(e),
      n1(ctAvg(R.on,x.real.n)),n1(ctAvg(R.onOk,x.real.n)),n1(ctAvg(P.on,x.plan.n)),n1(ctAvg(P.onOk,x.plan.n)),
      Math.round(R.rPlanH*100)/100,Math.round(R.realH*100)/100,pc(ctFill(R)),Math.round(P.planH*100)/100,
      pf?n1(pf.ok):"",pf?n1(pf.tr):"",pf?n1(pf.all):""];};
  x.groups.forEach((g,i)=>{const e=x.end.groups[i],s=x.start.groups[i];if(e.n||s.n||x.total.groups[i].planN)sum.push(gRow(g,i));});
  sum.push(gRow(null,-1));
  /* Po dnech */
  const dHead=["Datum","Týden","Stav","Oddělení","Skupina","Lidí v plánu","Zkušení v plánu","V zácviku v plánu","Nemoc (mimo plán)","Na směně","Zkušení na směně","V zácviku na směně",
    "Podíl zkušených %","Ø zaškolení v zácviku %","Ranní","Odpolední","Skupina 1/2 (bez střídání)","Bez směny","Plán h","Odpracováno h","Plnění hodin %","Omluveno","Neomluveno / chybí",
    "Požadavek","V normě","Obsazenost (KPI)","Mimo skupiny h"];
  const dRows=[...head,dHead];
  const cellRow=(d,g,c,tot)=>[dl(d.iso),weekName(d.week),CT_KIND[d.kind],gDept(g),gName(g),c.planN,c.planOk,c.planTr,c.sick,c.on,c.onOk,c.onTr,pc(ctShare(c)),c.onTr?pc(c.onTrS/c.onTr):"",
    c.am,c.pm,c.rot,c.noshift,Math.round(c.planH*100)/100,d.kind==="real"?Math.round(c.realH*100)/100:"",pc(ctFill(c)),d.kind==="real"?c.excused:"",d.kind==="real"?c.miss:"",
    tot?d.req||"":"",tot&&d.req?(d.met?"ano":"ne"):"",tot&&d.audit!=null?d.audit:"",tot&&d.extraH?d.extraH:""];
  x.days.forEach(d=>{dRows.push(cellRow(d,null,d.tot,true));d.cells.forEach((c,i)=>{if(c.planN||c.sick||c.realH)dRows.push(cellRow(d,x.groups[i],c,false));});});
  /* Po týdnech */
  const wHead=["Týden","Od","Do","Stav","Oddělení","Skupina","Pracovní dny","Vykázáno dní","Plán dní","Ø na směně","Ø zkušení na směně","Ø v zácviku na směně","Podíl zkušených %",
    "Ø zaškolení v zácviku %","Dny s požadavkem","V normě","Ø požadavek","Plán h (vykázané dny)","Odpracováno h","Plnění hodin %","Plán h (plánované dny)"];
  const wRows=[...head,wHead];
  const wRow=(w,g,c,tot)=>[weekName(w.id),dayText(w.from),dayText(w.to),CT_KIND[w.kind],gDept(g),gName(g),w.n,w.real,w.plan,n1(ctAvg(c.on,w.n)),n1(ctAvg(c.onOk,w.n)),n1(ctAvg(c.onTr,w.n)),
    pc(ctShare(c)),c.onTr?pc(c.onTrS/c.onTr):"",tot?w.req:"",tot?w.met:"",tot?n1(w.reqAvg):"",Math.round(c.rPlanH*100)/100,Math.round(c.realH*100)/100,pc(ctFill(c)),Math.round((c.planH-c.rPlanH)*100)/100];
  x.weeks.forEach(w=>{wRows.push(wRow(w,null,w.tot,true));w.groups.forEach((c,i)=>{if(c.planN||c.realH)wRows.push(wRow(w,x.groups[i],c,false));});wRows.push([]);});
  /* Po měsících */
  const mHead=["Měsíc","Stav","Stav skupin k","Oddělení","Skupina","Lidí ve skupině","Zkušení","V zácviku","Podíl zkušených %","Zkušení proti předchozímu","Ø zaškolení v zácviku %",
    "Pracovní dny","Ø na směně","Ø zkušení na směně","Plnění hodin %","Výkon zkušení (index)","Výkon v zácviku (index)","Výkon celkem (index)","Dokončené kusy","Odpracované dny lidí s výkonem","Ø ks na odpracovaný den","Normohodiny","Odpracované hodiny lidí s normou"];
  const mRows=[...head,mHead];
  x.months.forEach((m,j)=>{
    const prev=j?x.months[j-1].roster:x.start;
    const mRow=(g,i)=>{const r=i<0?m.roster.tot:m.roster.groups[i],p=i<0?prev.tot:prev.groups[i],c=i<0?m.tot:m.groups[i],pf=m.perf?(i<0?m.perf.idx.tot:m.perf.idx.groups[i]):null,raw=m.perf?(i<0?m.perf.tot:m.perf.groups[i]):null;
      return [monthLabel(m.id),CT_KIND[m.kind],dayText(m.roster.iso),gDept(g),gName(g),r.n,r.ok,r.tr,share(r),r.ok-p.ok,trA(r),m.n,n1(ctAvg(c.on,m.n)),n1(ctAvg(c.onOk,m.n)),pc(ctFill(c)),
        pf?n1(pf.ok):"",pf?n1(pf.tr):"",pf?n1(pf.all):"",raw?raw.ks:"",raw?raw.days:"",raw&&raw.all!=null?n1(raw.all):"",raw&&raw.normH?raw.normH:"",raw&&raw.workH?raw.workH:""];};
    mRows.push(mRow(null,-1));
    x.groups.forEach((g,i)=>{if(m.roster.groups[i].n||m.groups[i].planN)mRows.push(mRow(g,i));});
    mRows.push([]);
  });
  if(x.perfBase)mRows.push(["Výkon = dokončené kusy (Docházka a výkony, jinak evidence práce) ÷ odpracované dny z docházky; index: celkem za "+monthLabel(x.months.find(m=>m.perf).id)+" = 100."]);
  /* Vývoj zaškolení */
  const vHead=["Příjmení","Jméno","ID v evidenci práce","Skupina na začátku","Na začátku %","Skupina na konci","Na konci %","Změna (body)","Na začátku","Na konci","Zkušený od","Změny hodnocení","Poznámka"];
  const vRows=[...head,vHead];
  const stt=s=>s.pos?(s.ok?"zkušený":"v zácviku"):"bez skupiny";
  x.dev.forEach(r=>vRows.push([r.last,r.first,r.wid,r.start.pos?r.start.pos.name:"",n1(r.start.pct),r.end.pos?r.end.pos.name:"",n1(r.end.pct),r.gain==null?"":r.gain,
    stt(r.start),stt(r.end),r.became?dayText(todayIso(r.became)):"",
    r.steps.map(s=>dayText(todayIso(s.at),false)+" "+(s.pos?(s.pos.name||"")+" ":"")+(s.pct!=null?nf(s.pct,1)+" %":"")).join("; "),
    [r.lost?"zpět v zácviku od "+dayText(todayIso(r.lost)):"",r.note].filter(Boolean).join(", ")]));
  return [{name:sheetName("Souhrn",used),rows:sum,cols:[24,22,14,12,12,14,14,14,14,14,14,14,14,12,12,14,14,14,14]},
    {name:sheetName("Po dnech",used),rows:dRows,cols:[16,10,12,16,20,10,10,10,10,10,10,10,11,12,8,9,11,9,9,11,10,9,10,10,8,11,10]},
    {name:sheetName("Po týdnech",used),rows:wRows,cols:[10,12,12,14,16,20,10,10,9,10,12,12,11,12,11,9,10,13,12,11,13]},
    {name:sheetName("Po měsících",used),rows:mRows,cols:[16,14,12,16,20,10,10,10,11,12,12,10,10,12,11,12,12,12,11,14]},
    {name:sheetName("Vývoj zaškolení",used),rows:vRows,cols:[16,12,12,20,11,20,11,11,12,12,12,60,24]}];
}

/* ---------- měsíční a týdenní souhrn podle vzoru uživatele (2.31) ----------
   Vzor: „Report docházky – měsíční zaškolenost a výkon“ a „Týdenní souhrn KW se zaškolením“.
   Zaškolený = zkušený pracovník (procento skupiny aspoň úroveň z reportu kapacit); výpočet
   capTimeline, tady jen výběr a souhrny pro jednu stránku. */
function ctMonthAdd(m,n){let y=+m.slice(0,4),mm=+m.slice(5,7)+n;while(mm>12){mm-=12;y++;}while(mm<1){mm+=12;y--;}return y+"-"+String(mm).padStart(2,"0");}
function ctLastDay(m){const y=+m.slice(0,4),mm=+m.slice(5,7);return m+"-"+String(new Date(Date.UTC(y,mm,0)).getUTCDate()).padStart(2,"0");}
/* Stav skupiny v týdnu: všechny dny v normě = ok, aspoň 80 % = mírně pod, jinak pod plánem. */
function ctState(met,n){return !n?"":met>=n?"ok":met/n>=0.8-1e-9?"warn":"crit";}
const CT_STATE_TEXT={ok:"OK",warn:"MÍRNĚ POD",crit:"POD PLÁNEM"};
/* Měsíční souhrn: vybraný měsíc a dva předchozí (graf), stav matice k poslednímu pracovnímu dni,
   výkon s indexem první měsíc okna = 100. */
function capMonthReport(month,opts){
  if(!PERIOD_ID.test(String(month)))return null;
  const ids=[ctMonthAdd(month,-2),ctMonthAdd(month,-1),month];
  const x=capTimeline(ids[0]+"-01",ctLastDay(month),opts);
  if(!x)return null;
  const months=ids.map(id=>x.months.find(m=>m.id===id)||null);
  const cur=months[2],prev=months[1];
  if(!cur)return null;
  const perf=m=>m&&m.perf?m.perf.idx:null;
  const groups=x.groups.map((g,i)=>{const r=cur.roster.groups[i],p=prev?prev.roster.groups[i]:null,pi=perf(cur);
    return {g,i,n:r.n,ok:r.ok,tr:r.tr,share:r.n?r.ok/r.n:null,dOk:p?r.ok-p.ok:null,perf:pi?pi.groups[i]:null};})
    .filter(r=>r.n||(prev&&prev.roster.groups[r.i].n));
  const T=cur.roster.tot,P=prev?prev.roster.tot:null;
  return {month,ids,x,months,cur,prev,groups,
    tot:{n:T.n,ok:T.ok,tr:T.tr,share:T.n?T.ok/T.n:null,dOk:P?T.ok-P.ok:null,perf:perf(cur)?perf(cur).tot:null},
    shares:months.map(m=>m&&m.roster.tot.n?m.roster.tot.ok/m.roster.tot.n:null),
    baseMonth:(x.months.find(m=>m.perf)||{}).id||"",
    from:month+"-01",to:ctLastDay(month),snap:cur.roster.iso,real:cur.real,plan:cur.plan,
    lastReal:cur.real?[...x.days].reverse().find(d=>d.month===month&&d.kind==="real").iso:"",
    firstPlan:cur.plan?x.days.find(d=>d.month===month&&d.kind!=="real").iso:"",
    noGroup:x.noGroup,thr:x.thr,okPct:x.okPct,okOwn:x.okOwn};
}
/* Týdenní souhrn: pracovní dny proti požadavku (z toho zaškolení) a průměr po skupinách.
   Plán skupiny = kdo měl přijít: ve vykázaném dni lidé ve skupině s docházkou bez omluvené
   nepřítomnosti (dovolená, nemoc …), v plánovaném dni dnešní zařazení; den v normě = dodáno ≥ plán. */
function capWeekReport(weekId,opts){
  const w=weekById(weekId);
  if(!w)return null;
  const x=capTimeline(w.from,w.to,opts);
  if(!x)return null;
  const n=x.days.length;
  // plán skupiny (2.69) = potřeba z Plánu kapacit; skupina bez plánu: kdo měl přijít (bez omluvených)
  const plan2=(d,c,i)=>d.need&&d.need[i]!=null?d.need[i]:d.kind==="real"?c.planN-c.excused:c.planN;
  const groups=x.groups.map((g,i)=>{
    let plan=0,on=0,ok=0,met=0;
    x.days.forEach(d=>{const c=d.cells[i],p=plan2(d,c,i);plan+=p;on+=c.on;ok+=c.onOk;if(c.on>=p-1e-9)met++;});
    return {g,i,plan:n?plan/n:0,on:n?on/n:0,ok:n?ok/n:0,share:on?ok/on:null,met,n,state:ctState(met,n),cap:x.days.some(d=>d.need&&d.need[i]!=null)};
  }).filter(r=>r.plan>0||r.on>0);
  let plan=0,on=0,ok=0;
  x.days.forEach(d=>{d.cells.forEach((c,i)=>{plan+=plan2(d,c,i);});on+=d.tot.on;ok+=d.tot.onOk;});
  // den v normě: s požadavkem z KPI na směně aspoň požadavek, bez něj aspoň plán skupin
  const planOf=d=>d.cells.reduce((s,c,i)=>s+plan2(d,c,i),0),inNorm=d=>d.req?!!d.met:d.tot.on>=planOf(d)-1e-9;
  const reqDays=x.days.filter(d=>d.req).length,met=x.days.filter(inNorm).length;
  const reqs=[...new Set(x.days.filter(d=>d.req).map(d=>d.req))];
  const days=Array.from({length:5},(_,i)=>{const iso=addDays(w.from,i),d=x.days.find(q=>q.iso===iso),[yy,mm,dd]=iso.split("-").map(Number),day=mkDay(yy,mm,dd);
    return d?{iso,day,kind:d.kind,on:d.tot.on,ok:d.tot.onOk,tr:d.tot.onTr,plan:Math.round(planOf(d)*1e6)/1e6,req:d.req,met:inNorm(d),half:d.half}:{iso,day,kind:"off",on:0,ok:0,tr:0,plan:0,req:null,met:null};});
  return {week:w,id:weekId,x,days,groups,n,req:x.total.reqAvg,reqSame:reqs.length===1,reqDays,met,
    tot:{plan:n?plan/n:0,on:n?on/n:0,ok:n?ok/n:0,share:on?ok/on:null,met,state:ctState(met,n)},
    real:x.real.n,plan:x.plan.n,kind:x.total.kind,thr:x.thr,okPct:x.okPct,okOwn:x.okOwn,noGroup:x.noGroup,
    cap:x.days.some(d=>d.needTot!=null),half:x.days.filter(d=>d.half).map(d=>d.iso)};
}
/* Stránky PDF pro období od–do: za každý měsíc měsíční souhrn a za ním týdenní souhrny týdnů,
   jejichž čtvrtek do měsíce patří (ISO týden). */
function capReportPages(from,to){
  const out=[];
  if(!ISO_DAY.test(String(from))||!ISO_DAY.test(String(to)))return out;
  if(from>to)[from,to]=[to,from];
  const weeks=[];
  for(let w=isoWeek(from).id,i=0;w&&i<160;w=shiftWeek(w,1),i++){const wk=weekById(w);if(wk.from>to)break;weeks.push(wk);}
  const months=monthsBetween(from.slice(0,7),to.slice(0,7)).slice(0,36);
  const used=new Set();
  months.forEach(m=>{
    out.push({kind:"month",id:m});
    weeks.forEach(wk=>{const th=addDays(wk.from,3);if(th.slice(0,7)===m&&!used.has(wk.id)){used.add(wk.id);out.push({kind:"week",id:wk.id});}});
  });
  // týdny, jejichž čtvrtek je mimo měsíce období (začátek nebo konec období uprostřed týdne)
  weeks.forEach(wk=>{if(!used.has(wk.id)){used.add(wk.id);const at=out.findIndex(p=>p.kind==="month"&&p.id>addDays(wk.from,3).slice(0,7));if(at<0)out.push({kind:"week",id:wk.id});else out.splice(at,0,{kind:"week",id:wk.id});}});
  return out;
}

