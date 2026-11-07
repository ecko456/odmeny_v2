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
  (aoa||[]).forEach((row,i)=>{
    row=row||[];
    const last=txt(row[ix("last")]),first=txt(row[ix("first")]),endRaw=row[ix("end")],shiftRaw=txt(row[ix("shift")]);
    if(!last&&!first&&!txt(endRaw)&&!shiftRaw)return;
    if(i<5&&/prijmeni|jmeno|^name/.test(norm(last+" "+first))&&endDateOf(endRaw)==null){header=true;return;}
    const issues=[],add=(l,t)=>issues.push({l,t});
    if(!last||!first)add("e","chybí "+(!last?"příjmení":"jméno")+", řádek se přeskočí");
    const key=(norm(last)+"|"+norm(first));
    let e=S.employees[key]||null,swapped=false;
    if(!e&&last&&first){const k2=norm(first)+"|"+norm(last);if(S.employees[k2]){e=S.employees[k2];swapped=true;add("w","jméno a příjmení jsou prohozené, spáruje se s "+(e.last+" "+e.first).trim());}}
    const end=endDateOf(endRaw);
    if(end===null)add("e","konec trestu „"+txt(endRaw)+"“ není datum, nezmění se");
    else if(!end)add("w","konec trestu chybí, nezmění se");
    else if(end<today)add("w","konec trestu "+endDateText(end)+" už minul");
    else if(daysBetween(today,end)>365*40)add("w","konec trestu "+endDateText(end)+" je přes 40 let");
    let shift=endShiftOf(shiftRaw,labels);
    if(shift===null){add("e","směnnost „"+shiftRaw+"“ neznám, nezmění se");const k=endKey(shiftRaw);unknown.set(k,(unknown.get(k)||{text:shiftRaw,n:0}));unknown.get(k).n++;}
    else if(!shift)add("w","směnnost chybí, nezmění se");
    if(last&&first){
      const k=e?e.key:key;
      if(seen.has(k))add("e","stejný člověk už je na řádku "+seen.get(k)+", použije se poslední");
      seen.set(k,i+1);
      if(!e)add("w","v Lidech není, přidá se jako nový (bez skupiny)");
      else{
        if(e.excluded)add("w","v Lidech je vyřazený");
        if(end&&e.end&&e.end!==end)add("i","konec trestu "+endDateText(e.end)+" → "+endDateText(end));
        if(shift&&shift!=="SICK"&&(e.shift||"")!==shift)add("i","směna "+shiftName(e.shift)+" → "+shiftName(shift));
        if(shift==="SICK"&&!e.sick)add("i","nemoc od dneška");
        if(shift&&shift!=="SICK"&&e.sick)add("i","zpět po nemoci");
      }
    }
    rows.push({n:i+1,last,first,key:e?e.key:key,e,swapped,end,endRaw:txt(endRaw),shift,shiftRaw,issues});
  });
  const inFile=new Set(rows.filter(r=>r.last&&r.first).map(r=>r.key));
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
  const lastRow=new Map();parsed.rows.forEach(r=>{if(r.last&&r.first)lastRow.set(r.key,r);});
  parsed.rows.forEach(r=>{
    if(!r.last||!r.first){out.skipped++;return;}
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
