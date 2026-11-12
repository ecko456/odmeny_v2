/* ================= Konce trestů a směnnost (2.43) =================
   Import tabulky: A příjmení, B jméno, C konec trestu, D směnnost (Stálá ranní, Stálá odpolední,
   Skupina 1, Skupina 2, NEMOC). Aktualizuje u lidí směnu, nemoc a konec trestu; přehled po
   měsících ukazuje, kdy a z jakého oddělení lidé odchází. */
const END_COLS={last:"A",first:"B",end:"C",shift:"D"};
const END_SHIFT_T={R:"Stálá ranní",O:"Stálá odpolední",S1:"Skupina 1",S2:"Skupina 2",SICK:"NEMOC"};
function endDateText(iso){const p=String(iso||"").split("-");return p.length===3?(+p[2])+". "+(+p[1])+". "+p[0]:"";}
/** Text směnnosti → R, O, S1, S2, SICK; prázdné ""; neznámé null. labels = ruční nebo AI převod. */
function endShiftOf(v,labels){
  const t=norm(String(v==null?"":v)).replace(/[._\-–]+/g," ").replace(/\s+/g," ").trim();
  if(!t)return "";
  if(labels&&labels[t])return labels[t];
  if(/^(nemoc|nem|pn|neschopnost|pracovni neschopnost|nemocny|nemocna)$/.test(t))return "SICK";
  if(/^(stala )?ranni( stala)?$|^r$|^sr$|^ranni smena$/.test(t))return "R";
  if(/^(stala )?odpoledni( stala)?$|^o$|^so$|^odpoledni smena$/.test(t))return "O";
  if(/^(smennost )?(skupina|skup|sk|s) ?1$|^1 ?(skupina|sk)$/.test(t))return "S1";
  if(/^(smennost )?(skupina|skup|sk|s) ?2$|^2 ?(skupina|sk)$/.test(t))return "S2";
  return null;
}
function endKey(t){return norm(String(t==null?"":t)).replace(/\s+/g," ").trim();}

/* ---------- Párování jmen se soubory (2.75.1) ----------
   Dřív jen přesný klíč „příjmení|jméno“ (a prohozené pořadí), takže člověk přejmenovaný v Lidech,
   s druhým jménem, titulem, pomlčkou, celým jménem v jednom sloupci nebo s překlepem vyšel jako
   nový. Teď po stupních: ID (je-li sloupec), přesně (i podle jména v Lidech), prohozené, stejná
   slova v jiném pořadí, část jména (aspoň dvě společná slova), podobné jméno (překlep), vždy jen
   jednoznačně a každý člověk nejvýš jednou (kromě přesné shody: stejný člověk dvakrát se hlásí). */
const END_TITLES=new Set(["bc","ing","mgr","mudr","mvdr","mddr","judr","phdr","rndr","paeddr","thdr","phd","dis","csc","drsc","mba","bba","doc","prof","dr","ml","st","mladsi","starsi","jr","sr"]);
function endTok(s){return norm(String(s==null?"":s)).replace(/\b(ph|th)\.?\s?d\.?(?=[\s,;]|$)/g,"$1d").replace(/[.,;:()\[\]{}"'`´’‘“”/\\_*+]+/g," ").replace(/[-–—]+/g," ").split(" ").filter(t=>t&&!END_TITLES.has(t));}
function endNameT(last,first){const L=endTok(last),F=endTok(first);return {l:L.join(" "),f:F.join(" "),all:[...L,...F],sig:[...L,...F].sort().join(" ")};}
/** Řádky souboru [{n, last, first, wid}] → [{key, how, cand}]; how: id | exact | swap | words | part |
    fuzzy | manual | new | none. assign = ruční přiřazení (Map n → klíč, "" = nový člověk). */
function endMatch(rows,emps,assign){
  emps=emps||S.employees;
  const P=Object.values(emps||{}).filter(e=>e&&e.key).map(e=>({key:e.key,...endNameT(e.last,e.first)}));
  const byKey=new Map(P.map(p=>[p.key,p])),multi=(m,k,p)=>{if(!k)return;if(!m.has(k))m.set(k,[]);m.get(k).push(p);};
  const byLF=new Map(),bySig=new Map();
  P.forEach(p=>{multi(byLF,p.l+"|"+p.f,p);multi(bySig,p.sig,p);});
  const wids=new Map();Object.values(emps||{}).forEach(e=>{const w=widKey(e.wid);if(w&&e.key)wids.set(w,wids.has(w)&&wids.get(w)!==e.key?null:e.key);});
  const out=rows.map(()=>({key:null,how:"none",cand:[]})),used=new Set();
  const T=rows.map(r=>endNameT(r.last,r.first));
  const open=i=>out[i].how==="none"&&!out[i].cand.length;
  const take=(i,p,how)=>{out[i]={key:p.key,how,cand:[]};used.add(p.key);};
  const free=list=>(list||[]).filter(p=>!used.has(p.key));
  // ruční přiřazení z okna importu má přednost
  rows.forEach((r,i)=>{
    if(!assign||!assign.has(r.n))return;
    const k=assign.get(r.n);
    if(k&&byKey.has(k))take(i,byKey.get(k),"manual");else out[i]={key:null,how:"new",cand:[]};
  });
  // ID zaměstnance (nepovinný sloupec)
  rows.forEach((r,i)=>{if(!open(i))return;const k=wids.get(widKey(r.wid));if(k&&byKey.has(k))take(i,byKey.get(k),"id");});
  // přesně: klíč, nebo jméno a příjmení jako v Lidech (stejný člověk na víc řádcích zůstane, hlásí se zvlášť)
  rows.forEach((r,i)=>{
    if(!open(i))return;
    const t=T[i],k=byKey.get(norm(r.last)+"|"+norm(r.first)),lf=t.l&&t.f?byLF.get(t.l+"|"+t.f)||[]:[];
    if(k)take(i,k,"exact");else if(lf.length===1)take(i,lf[0],"exact");else if(lf.length>1)out[i].cand=lf.map(p=>p.key);
  });
  // prohozené jméno a příjmení
  rows.forEach((r,i)=>{
    if(!open(i))return;
    const t=T[i],c=t.l&&t.f?free(byLF.get(t.f+"|"+t.l)):[];
    if(c.length===1)take(i,c[0],"swap");else if(c.length>1)out[i].cand=c.map(p=>p.key);
  });
  // stejná slova v jiném pořadí, s pomlčkou, s titulem, celé jméno v jednom sloupci
  rows.forEach((r,i)=>{
    if(!open(i)||T[i].all.length<2)return;
    const c=free(bySig.get(T[i].sig));
    if(c.length===1)take(i,c[0],"words");else if(c.length>1)out[i].cand=c.map(p=>p.key);
  });
  // část jména: všechna slova kratšího jména jsou v delším (druhé jméno, druhé příjmení), aspoň dvě společná
  rows.forEach((r,i)=>{
    if(!open(i)||T[i].all.length<2)return;
    const a=new Set(T[i].all);
    const c=free(P).filter(p=>{const b=new Set(p.all),[s,l]=a.size<=b.size?[a,b]:[b,a];return s.size>=2&&[...s].every(x=>l.has(x));});
    if(c.length===1)take(i,c[0],"part");else if(c.length>1)out[i].cand=c.map(p=>p.key);
  });
  // podobné jméno (překlep): do 1 znaku u krátkých, do 2 u delších jmen; jinak jen návrhy
  rows.forEach((r,i)=>{
    if(!open(i))return;
    const t=T[i],len=(t.l+t.f).replace(/ /g,"").length;
    if(len<4)return;
    const lim=len>=9?2:len>=5?1:0;
    const scored=free(P).map(p=>({p,d:Math.min(attDist(t.l,p.l)+attDist(t.f,p.f),attDist(t.l,p.f)+attDist(t.f,p.l),attDist(t.sig,p.sig))})).sort((x,y)=>x.d-y.d);
    if(!scored.length)return;
    const best=scored[0].d,top=scored.filter(x=>x.d===best);
    if(best<=lim&&top.length===1)take(i,top[0].p,"fuzzy");
    else out[i].cand=scored.filter(x=>x.d<=Math.max(lim+1,3)).slice(0,4).map(x=>x.p.key);
  });
  return out;
}
/** Konec trestu z buňky: datum Excelu, Date, „31.12.2026“, ISO. */
function endDateOf(v){
  if(v==null||v==="")return "";
  const d=cellToDateTime(v);
  return d&&d.y>=1990&&d.y<=2100&&d.m>=1&&d.m<=12&&d.d>=1&&d.d<=31?d.y+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0"):null;
}
/** Přečte řádky a zkontroluje je proti Lidem. Vrací {rows, header, labels (neznámé texty směnnosti),
    sum}. Řádek: {n, last, first, key, e, swapped, end, endRaw, shift, shiftRaw, issues[{l:e|w|i, t}]}. */
function endParse(aoa,cols,opts){
  opts=opts||{};cols=Object.assign({},END_COLS,cols||{});
  const today=opts.today||todayIso(),labels=opts.labels||{};
  const ix=k=>waIndex(cols[k]);
  const txt=v=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  const rows=[],seen=new Map(),unknown=new Map();let header=false;
  // nejdřív řádky souboru, pak párování všech najednou (přesné shody mají přednost před podobnými)
  const raw=[];
  (aoa||[]).forEach((row,i)=>{
    row=row||[];
    const last=txt(row[ix("last")]),first=txt(row[ix("first")]),endRaw=row[ix("end")],shiftRaw=txt(row[ix("shift")]),wid=cols.wid?txt(row[ix("wid")]):"";
    if(!last&&!first&&!txt(endRaw)&&!shiftRaw)return;
    if(i<5&&/prijmeni|jmeno|^name/.test(norm(last+" "+first))&&endDateOf(endRaw)==null){header=true;return;}
    raw.push({i,n:i+1,last,first,endRaw,shiftRaw,wid});
  });
  const match=endMatch(raw,S.employees,opts.assign);
  const nm=e=>(e.last+" "+e.first).trim();
  const HOW={id:"podle ID",swap:"jméno a příjmení jsou prohozené",words:"jinak zapsané jméno",part:"liší se část jména",fuzzy:"podobné jméno (překlep?)",manual:"ručně přiřazeno"};
  raw.forEach((x,k)=>{
    const {i,last,first,endRaw,shiftRaw}=x,m=match[k];
    const issues=[],add=(l,t)=>issues.push({l,t});
    let e=m.key?S.employees[m.key]||null:null;
    const swapped=m.how==="swap";
    const key=e?e.key:(norm(last)+"|"+norm(first));
    if((!last||!first)&&!e)add("e","chybí "+(!last?"příjmení":"jméno")+", řádek se přeskočí");
    if(e&&m.how!=="exact")add(m.how==="manual"||m.how==="id"?"i":"w",HOW[m.how]+", spáruje se s "+nm(e));
    const end=endDateOf(endRaw);
    if(end===null)add("e","konec trestu „"+txt(endRaw)+"“ není datum, nezmění se");
    else if(!end)add("w","konec trestu chybí, nezmění se");
    else if(end<today)add("w","konec trestu "+endDateText(end)+" už minul");
    else if(daysBetween(today,end)>365*40)add("w","konec trestu "+endDateText(end)+" je přes 40 let");
    let shift=endShiftOf(shiftRaw,labels);
    if(shift===null){add("e","směnnost „"+shiftRaw+"“ neznám, nezmění se");const k=endKey(shiftRaw);unknown.set(k,(unknown.get(k)||{text:shiftRaw,n:0}));unknown.get(k).n++;}
    else if(!shift)add("w","směnnost chybí, nezmění se");
    if((last&&first)||e){
      const k=e?e.key:key;
      if(seen.has(k))add("e","stejný člověk už je na řádku "+seen.get(k)+", použije se poslední");
      seen.set(k,i+1);
      if(!e&&m.how==="new")add("w","ručně: nový člověk, přidá se (bez skupiny)");
      else if(!e&&m.cand.length)add("w","v Lidech není přesně, podobní: "+m.cand.map(c=>S.employees[c]?nm(S.employees[c]):c).join(", ")+". Vyber v tabulce, jinak se přidá jako nový");
      else if(!e)add("w","v Lidech není, přidá se jako nový (bez skupiny)");
      else{
        if(e.excluded)add("w","v Lidech je vyřazený");
        if(end&&e.end&&e.end!==end)add("i","konec trestu "+endDateText(e.end)+" → "+endDateText(end));
        if(shift&&shift!=="SICK"&&(e.shift||"")!==shift)add("i","směna "+shiftName(e.shift)+" → "+shiftName(shift));
        if(shift==="SICK"&&!e.sick)add("i","nemoc od dneška");
        if(shift&&shift!=="SICK"&&e.sick)add("i","zpět po nemoci");
      }
    }
    rows.push({n:i+1,last,first,key,e,swapped,how:e?m.how:m.how==="new"?"new":"none",cand:m.cand,end,endRaw:txt(endRaw),shift,shiftRaw,issues});
  });
  const inFile=new Set(rows.filter(r=>r.e||(r.last&&r.first)).map(r=>r.key));
  /* lidé z Lidí, kteří v souboru nejsou (2.44.1: v okně se dají vyřadit ze seznamu) */
  const missingP=Object.values(S.employees).filter(e=>!e.excluded&&!isLead(e)&&!inFile.has(e.key))
    .map(e=>({key:e.key,name:(e.last+" "+e.first).trim(),wid:e.wid||"",dept:endDeptOf(e),end:e.end||"",sick:!!e.sick}))
    .sort((a,b)=>a.name.localeCompare(b.name,"cs"));
  const missing=missingP.map(x=>x.name);
  const cnt=l=>rows.filter(r=>r.issues.some(x=>x.l===l)).length;
  return {rows,header,unknown:[...unknown.values()],missing,missingP,
    sum:{rows:rows.length,err:cnt("e"),warn:cnt("w"),fresh:rows.filter(r=>!r.e&&r.last&&r.first).length,
      ends:rows.filter(r=>r.end).length,shifts:rows.filter(r=>r.shift&&r.shift!=="SICK").length,sick:rows.filter(r=>r.shift==="SICK").length}};
}
/** Zapíše řádky do Lidí (poslední řádek člověka vyhrává). Nový člověk jen s opts.add. */
function endApply(parsed,opts){
  opts=opts||{};const today=opts.today||todayIso();
  const out={ends:0,shifts:0,sick:0,back:0,added:0,skipped:0,excluded:0};
  const ok=r=>!!(r.e&&S.employees[r.key])||!!(r.last&&r.first);   // spárovaný člověk i s celým jménem v jednom sloupci (2.75.1)
  const lastRow=new Map();parsed.rows.forEach(r=>{if(ok(r))lastRow.set(r.key,r);});
  parsed.rows.forEach(r=>{
    if(!ok(r)){out.skipped++;return;}
    if(lastRow.get(r.key)!==r)return;   // stejný člověk víckrát: platí poslední řádek
    let e=S.employees[r.key];
    if(!e){
      if(!opts.add){out.skipped++;return;}
      e=S.employees[r.key]={key:r.key,first:r.first,last:r.last,positionId:null,level:null,note:""};out.added++;
    }
    if(r.end&&e.end!==r.end){e.end=r.end;out.ends++;}
    if(r.shift==="SICK"){if(!e.sick){e.sick=today;out.sick++;}}
    else if(r.shift){
      if(e.shift!==r.shift){e.shift=r.shift;out.shifts++;}
      if(e.sick){delete e.sick;out.back++;}
    }
  });
  /* vyřadit vybrané lidi, kteří v souboru chybí (jen ty z parsed.missingP, ne vedoucí) */
  const can=new Set((parsed.missingP||[]).map(x=>x.key));
  (opts.exclude||[]).forEach(k=>{const e=S.employees[k];if(e&&can.has(k)&&!e.excluded&&!isLead(e)){e.excluded=true;out.excluded++;}});
  return out;
}
const END_ST={ok:"Zaškolený",tr:"V zácviku",none:"Bez skupiny"};
/** Docházka za měsíc k exportu (2.45.2): každý člověk s oddělením, hodiny v pracovní dny,
    o víkendu a celkem (jen odpracované, bez hodin u kódu nepřítomnosti), součty za oddělení
    a celkem. Řazeno po odděleních (pořadí skupin), v oddělení podle příjmení. */
function attExport(p){
  if(!p||!p.rows)return null;
  const order=[...departments(),"Bez skupiny","Vedoucí","Není v Lidech"];
  const people=Object.keys(p.rows).map(k=>{const r=p.rows[k],e=S.employees[k],a=attendance(p,k);
    return {key:k,name:(r.last+" "+r.first).trim(),wid:e&&e.wid?String(e.wid):"",dept:e?endDeptOf(e):"Není v Lidech",group:e&&e.positionId?((S.positions.find(x=>x.id===e.positionId)||{}).name||""):"",
      days:a.workDays,hours:a.workHours,wkDays:a.wkDays,wkHours:a.wkHours,total:a.totalHours,abs:a.missed,exc:a.excusedDays,
      /* po dnech (2.45.2): hodiny, kód nepřítomnosti (s hodinami „D (8 h)“), prázdné = nic; dh = odpracované hodiny dne */
      cells:p.days.map((iso,i)=>{const h=Math.max(0,+((r.h||[])[i])||0),c=String((r.c||[])[i]||"").trim();return c?(h?c+" ("+nf(h,2)+" h)":c):h?h:"";}),
      dh:p.days.map((iso,i)=>(r.c||[])[i]?0:Math.max(0,+((r.h||[])[i])||0))};});
  const rank=d=>{const i=order.indexOf(d);return i<0?order.length:i;};
  people.sort((x,y)=>rank(x.dept)-rank(y.dept)||x.dept.localeCompare(y.dept,"cs")||norm(x.name).localeCompare(norm(y.name),"cs"));
  const sum=list=>{const o={n:list.length,days:0,hours:0,wkDays:0,wkHours:0,total:0,abs:0,exc:0};list.forEach(x=>Object.keys(o).forEach(k=>{if(k!=="n")o[k]+=x[k];}));
    ["hours","wkHours","total"].forEach(k=>{o[k]=Math.round(o[k]*100)/100;});return o;};
  const depts=[...new Set(people.map(x=>x.dept))].map(d=>{const list=people.filter(x=>x.dept===d);return {name:d,people:list,tot:sum(list)};});
  return {id:p.id,file:p.file||"",meta:periodMeta(p),depts,people,tot:sum(people)};
}
function attExportSheets(x){
  const r2=v=>Math.round(v*100)/100;
  const head=["Oddělení","Příjmení a jméno","ID","Skupina","Pracovní dny","Hodiny v pracovní dny","Víkendové dny","Hodiny o víkendu","Hodiny celkem","Absence (dny)","Omluveno (dny)"];
  const row=q=>[q.dept,q.name,q.wid,q.group,q.days,r2(q.hours),q.wkDays,r2(q.wkHours),r2(q.total),q.abs,q.exc];
  const tot=(l,t)=>[l,t.n+" "+(t.n===1?"člověk":t.n<5&&t.n>1?"lidé":"lidí"),"","",t.days,t.hours,t.wkDays,t.wkHours,t.total,t.abs,t.exc];
  const rows=[["Docházka – "+monthLabel(x.id)+", fond "+x.meta.fund+" h ("+x.meta.work+" pracovních dnů)"],[],head];
  x.depts.forEach(d=>{d.people.forEach(q=>rows.push(row(q)));rows.push(tot("Celkem "+d.name,d.tot));rows.push([]);});
  rows.push(tot("CELKEM",x.tot));
  const sum=[["Oddělení","Lidí","Hodiny v pracovní dny","Hodiny o víkendu","Hodiny celkem","Absence (dny)"],...x.depts.map(d=>[d.name,d.tot.n,d.tot.hours,d.tot.wkHours,d.tot.total,d.tot.abs]),["CELKEM",x.tot.n,x.tot.hours,x.tot.wkHours,x.tot.total,x.tot.abs]];
  /* Po dnech: každý den jeden sloupec, za oddělení a celkem součet odpracovaných hodin dne */
  const dl=x.meta.days.map(d=>d.d+"."+d.m+". "+DOW[d.dow]+(d.hol&&!d.weekend?" svátek":""));
  const dSum=list=>x.meta.days.map((d,i)=>r2(list.reduce((t,q)=>t+q.dh[i],0)));
  const byDay=[["Docházka po dnech – "+monthLabel(x.id)+" (číslo = odpracované hodiny, text = kód nepřítomnosti)"],[],["Oddělení","Příjmení a jméno","ID",...dl,"Hodiny celkem"]];
  x.depts.forEach(d=>{d.people.forEach(q=>byDay.push([q.dept,q.name,q.wid,...q.cells,r2(q.total)]));byDay.push(["Celkem "+d.name,"","",...dSum(d.people),d.tot.total]);byDay.push([]);});
  byDay.push(["CELKEM","","",...dSum(x.people),x.tot.total]);
  return [{name:"Docházka",rows,cols:[18,26,10,16,12,14,12,14,12,12,12]},{name:"Po dnech",rows:byDay,cols:[18,26,10,...dl.map(()=>9),12]},{name:"Oddělení",rows:sum,cols:[20,8,16,14,12,12]}];
}
/* Barvy dnů v docházce (2.50): ranní, odpolední, přesčas o víkendu nebo ve svátek, nepřítomnost.
   Směna dne podle příchodu ze souboru Docházka a výkony (před 12:00 ranní, jinak odpolední),
   bez příchodu podle směny člověka (střídání skupin podle Směny a kapacita). */
const ATT_KIND={am:"ranní",pm:"odpolední",ot:"přesčas (víkend / svátek)",work:"odpracováno (směna neznámá)",abs:"nepřítomnost (kód)",miss:"chybí",off:"volno"};
function attSlotOf(e,iso){
  if(!e)return null;
  const pres=S.workAudit&&S.workAudit.dv&&S.workAudit.dv.pres&&S.workAudit.dv.pres[iso];
  const w=e.wid?widKey(e.wid):"";
  if(pres&&w&&pres[w]&&pres[w][0]!=null)return pres[w][0]<DV_PM_FROM?"am":"pm";
  const sl=slotOn(e,morningGroup(isoWeek(iso).id,(S.capReport||{}).s1am));
  return sl==="am"||sl==="pm"?sl:null;
}
function attDayKind(e,c){
  if(c.h>0)return c.d.weekend||c.d.hol?"ot":attSlotOf(e,c.d.iso)||"work";
  if(c.c)return "abs";
  return c.d.work?"miss":"off";
}
/** Docházka po dnech do jednoho listu (2.50, přání uživatele): lidé po skupinách směn (Stálá ranní,
    Stálá odpolední, Skupina 1, Skupina 2, bez směny), ve skupině podle příjmení a jména;
    u každého dne hodiny nebo kód a druh dne (barva). */
function attShiftSheet(p){
  if(!p||!p.rows)return null;
  const meta=periodMeta(p),groups=[...SHIFTS.map(([k,n])=>({k,name:n,people:[]})),{k:"",name:"Bez směny",people:[]}];
  Object.keys(p.rows).forEach(k=>{
    const r=p.rows[k],e=S.employees[k]||null,a=attendance(p,k);
    const q={key:k,first:(e?e.first:r.first)||"",last:(e?e.last:r.last)||"",wid:e&&e.wid?String(e.wid):"",total:Math.round(a.totalHours*100)/100,
      days:a.cells.map(c=>({v:c.c?(c.ah?c.c+" ("+nf(c.ah,2)+" h)":c.c):c.h>0?c.h:"",kind:attDayKind(e,c),h:c.h}))};
    const g=groups.find(x=>x.k===((e&&e.shift)||""))||groups[groups.length-1];g.people.push(q);
  });
  groups.forEach(g=>g.people.sort((a,b)=>norm(a.last).localeCompare(norm(b.last),"cs")||norm(a.first).localeCompare(norm(b.first),"cs")));
  const out=groups.filter(g=>g.people.length);
  const dayTot=meta.days.map((d,i)=>Math.round(out.reduce((t,g)=>t+g.people.reduce((u,q)=>u+q.days[i].h,0),0)*100)/100);
  return {id:p.id,meta,groups:out,dayTot,total:Math.round(out.reduce((t,g)=>t+g.people.reduce((u,q)=>u+q.total,0),0)*100)/100,
    n:out.reduce((t,g)=>t+g.people.length,0)};
}
/** Přehled odchodů: po měsících a odděleních od tohoto měsíce na n měsíců. */
