/* ==========================================================================
   AUDIT: lidé v práci a zpracované kusy (verze 2.17)
   Obsazenost ze souboru vedoucích (řádek = den, ranní a odpolední směna po skupinách)
   a výkaz práce z IS (datum, operace, kusy). Operace se přiřazují skupinám, skupina může
   být neproduktivní, nebo mimo IS (její práce se ve výkazu neobjeví). Kusy se počítají jen
   u operací přiřazených ke skupině (2.17.1). Každou hodnotu jde opravit s důvodem; původní
   hodnota zůstává uložená.
   ========================================================================== */
const WA_GROUPS=[
  {id:"brus",name:"Brusiči",am:"K",pm:"X",unprod:false,noIs:false},
  {id:"brush",name:"Brush",am:"L",pm:"Y",unprod:false,noIs:false},
  {id:"frez",name:"Frézování",am:"M",pm:"W",unprod:false,noIs:false},
  {id:"lep",name:"Lepení a značení dílů",am:"N",pm:"",unprod:false,noIs:false},
  {id:"kont",name:"Kontrola / balení / brigadýr / školitelé",am:"O",pm:"AA",unprod:true,noIs:false},
  {id:"tryska",name:"Obsluha tryskací kabiny",am:"P",pm:"Z",unprod:false,noIs:false},
  {id:"daiho",name:"Projekt Daiho",am:"S",pm:"",unprod:false,noIs:true}
];
/* Výchozí sloupce: obsazenost D (datum), ranní I plán, R absence, T celkem; odpolední U požadavek,
   V skutečnost. Výkaz práce A datum, H operace, J kusy. */
const WA_COLS={att:{date:"D",amPlan:"I",amTotal:"T",amAbs:"R",pmPlan:"U",pmTotal:"V"},work:{date:"A",op:"H",ks:"J"}};
const WA_COL_LABEL={date:"Datum",amPlan:"Ranní: mělo dorazit",amTotal:"Ranní: celkem v práci",amAbs:"Ranní: absence",pmPlan:"Odpolední: požadavek",pmTotal:"Odpolední: skutečně v práci",op:"Operace",ks:"Počet kusů"};
/* Odhad skupiny podle názvu operace: jen návrh na tlačítko v Nastavení, sám nic nepřiřadí. */
const WA_GUESS=[["tryska",/trysk|piskov|tryskac/],["brush",/brush|kartac/],["brus",/brus|brous/],["frez",/frez|cnc/],["lep",/lepen|znacen|lepi/],["kont",/kontrol|balen/]];
const WA_KEY=/^(am\.(plan|total|abs)|pm\.(plan|total)|g\.[A-Za-z0-9_]{1,20}\.(am|pm)|pcs\.o\d{1,6})$/;
const WA_ISO=/^\d{4}-\d{2}-\d{2}$/;
/* Požadavek lidí na pracovní den (2.18.1): pevně 100 lidí, null = podle plánu v souboru obsazenosti. */
const WA_TARGET=100;
function blankWorkAudit(){return {groups:WA_GROUPS.map(g=>({...g,mg:[]})),cols:JSON.parse(JSON.stringify(WA_COLS)),ops:[],days:{},pcs:{},edits:{},notes:{},files:[],seq:0,target:WA_TARGET,plan:blankWaPlan(),rep:{place:"",firm:""},trainPct:null,dv:blankDv(),drep:blankDrep()};}
/* Výrobní plán (2.18): vzor sloupců dvou listů, filtr technologie, kapacita brusičů. Položky plánu
   jsou mimo stav v šifrovaných souborech (chunks), ve stavu jsou jen součty po týdnech. */
function blankWaPlan(){return {tpl:null,tech:{words:["G2","G"],mode:"token"},cap:{group:"brus",perShift:25},chunks:[],weeks:{},items:0,files:[],at:0,by:""};}
function waLetter(v){const t=String(v==null?"":v).trim().toUpperCase();return /^[A-Z]{1,3}$/.test(t)?t:"";}
function waIndex(letter){const t=waLetter(letter);if(!t)return -1;let n=0;for(const ch of t)n=n*26+(ch.charCodeAt(0)-64);return n-1;}
function cleanWorkAudit(o){
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const str=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").slice(0,max);
  const cnt=v=>{if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)?Math.round(clamp(n,0,100000)*100)/100:null;};
  o=obj(o);
  const out=blankWorkAudit();
  if(Array.isArray(o.groups)){
    const seen=new Set();
    out.groups=o.groups.filter(g=>g&&typeof g==="object"&&/^[A-Za-z0-9_]{1,20}$/.test(String(g.id||""))).filter(g=>!seen.has(String(g.id))&&seen.add(String(g.id))).slice(0,20)
      .map(g=>({id:String(g.id),name:str(g.name,80)||String(g.id),am:waLetter(g.am),pm:waLetter(g.pm),unprod:!!g.unprod,noIs:!!g.noIs,
        /* skupiny Matice, jejichž lidé se počítají do skupiny KPI (2.42, soubor docházky a výkonů) */
        mg:[...new Set((Array.isArray(g.mg)?g.mg:[]).filter(x=>typeof x==="string"&&SAFE_ID.test(x)))].slice(0,40)}));
  }
  const gids=new Set(out.groups.map(g=>g.id));
  const ca=obj(obj(o.cols).att),cw=obj(obj(o.cols).work);
  Object.keys(WA_COLS.att).forEach(k=>{if(k in ca)out.cols.att[k]=waLetter(ca[k]);});
  Object.keys(WA_COLS.work).forEach(k=>{if(k in cw)out.cols.work[k]=waLetter(cw[k]);});
  if(!out.cols.att.date)out.cols.att.date=WA_COLS.att.date;
  ["date","op","ks"].forEach(k=>{if(!out.cols.work[k])out.cols.work[k]=WA_COLS.work[k];});
  const seenOps=new Set();
  out.ops=(Array.isArray(o.ops)?o.ops:[]).filter(x=>x&&typeof x==="object"&&/^o\d{1,6}$/.test(String(x.id||""))&&!seenOps.has(x.id)&&seenOps.add(x.id)).slice(0,800)
    .map(x=>({id:String(x.id),name:str(x.name,160),group:gids.has(x.group)?x.group:"",on:x.on!==false}));
  const opIds=new Set(out.ops.map(x=>x.id));
  out.seq=Math.max(Number.isFinite(+o.seq)?Math.round(+o.seq):0,...out.ops.map(x=>+x.id.slice(1)),0);
  Object.entries(obj(o.days)).slice(0,4000).forEach(([iso,d])=>{
    if(!WA_ISO.test(iso)||!d||typeof d!=="object")return;
    const am=obj(d.am),pm=obj(d.pm),g={};
    Object.entries(obj(d.g)).forEach(([id,v])=>{if(/^[A-Za-z0-9_]{1,20}$/.test(id)&&Array.isArray(v))g[id]=[cnt(v[0]),cnt(v[1])];});
    out.days[iso]={am:{plan:cnt(am.plan),total:cnt(am.total),abs:cnt(am.abs)},pm:{plan:cnt(pm.plan),total:cnt(pm.total)},g};
  });
  Object.entries(obj(o.pcs)).slice(0,4000).forEach(([iso,d])=>{
    if(!WA_ISO.test(iso))return;
    const day={};Object.entries(obj(d)).forEach(([id,v])=>{const n=cnt(v);if(opIds.has(id)&&n!=null)day[id]=n;});
    if(Object.keys(day).length)out.pcs[iso]=day;
  });
  Object.entries(obj(o.edits)).slice(0,4000).forEach(([iso,d])=>{
    if(!WA_ISO.test(iso))return;
    const day={};Object.entries(obj(d)).slice(0,200).forEach(([k,e])=>{
      if(!WA_KEY.test(k)||!e||typeof e!=="object")return;
      if(k.startsWith("pcs.")&&!opIds.has(k.slice(4)))return;
      day[k]={v:cnt(e.v),was:cnt(e.was),note:str(e.note,300),by:str(e.by,60),at:Number.isFinite(+e.at)?Math.round(+e.at):0};
    });
    if(Object.keys(day).length)out.edits[iso]=day;
  });
  Object.entries(obj(o.notes)).slice(0,4000).forEach(([iso,t])=>{const s=str(t,600).trim();if(WA_ISO.test(iso)&&s)out.notes[iso]=s;});
  out.files=(Array.isArray(o.files)?o.files:[]).filter(f=>f&&typeof f==="object").slice(-40).map(f=>({
    kind:f.kind==="work"?"work":"att",name:str(f.name,160),at:Number.isFinite(+f.at)?Math.round(+f.at):0,by:str(f.by,60),
    from:WA_ISO.test(String(f.from||""))?f.from:"",to:WA_ISO.test(String(f.to||""))?f.to:"",days:Math.round(clamp(+f.days||0,0,100000)),rows:Math.round(clamp(+f.rows||0,0,10000000))}));
  const tg=cnt(o.target);out.target=tg&&tg>=1?tg:null;
  out.plan=cleanWaPlan(o.plan,gids);
  /* záhlaví reportů (2.31): pracoviště a firma, jako „Report docházky — pracoviště“ ve vzoru */
  const rp=obj(o.rep);out.rep={place:str(rp.place,60).replace(/\s+/g," ").trim(),firm:str(rp.firm,80).replace(/\s+/g," ").trim()};
  /* hranice zaškolení (2.33): od kolika % dovedností skupiny je pracovník zaškolený; null = podle Matice */
  const tp=cnt(o.trainPct);out.trainPct=tp!=null&&tp>=1&&tp<=100?Math.round(tp):null;
  /* docházka a výkony z jednoho souboru (2.37) */
  out.dv=cleanDv(o.dv);
  /* report docházky (2.41): vlastní skupiny z oddělení a značky dnů (přesčas, práce ve svátek) */
  out.drep=cleanDrep(o.drep);
  return out;
}
const WA_PLAN_FIELDS=["order","ean","ks","index","due","tech"];
const WA_PLAN_LABEL={order:"Číslo objednávky",ean:"EAN",ks:"Počet kusů",index:"Index",due:"Termín dokončení",tech:"Technologie"};
const WA_WEEK=/^\d{4}-W\d{2}$/;
function cleanWaPlan(o,gids){
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const str=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g,"").slice(0,max);
  const int=(v,max)=>Math.round(clamp(+v||0,0,max));
  o=obj(o);
  const out=blankWaPlan();
  const t=obj(o.tpl);
  if(Array.isArray(t.sheets)&&t.sheets.length){
    out.tpl={file:str(t.file,160),at:int(t.at,1e13),by:str(t.by,60),sheets:t.sheets.slice(0,2).map(sh=>{
      sh=obj(sh);const c=obj(sh.cols),h=obj(sh.heads),cols={},heads={};
      WA_PLAN_FIELDS.forEach(f=>{cols[f]=waLetter(c[f]);heads[f]=str(h[f],80);});
      return {name:str(sh.name,80),header:int(sh.header,500),cols,heads};
    })};
  }
  const tech=obj(o.tech);
  if(Array.isArray(tech.words))out.tech.words=[...new Set(tech.words.map(w=>String(w==null?"":w).toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12)).filter(Boolean))].slice(0,12);
  out.tech.mode=tech.mode==="contains"?"contains":"token";
  const cap=obj(o.cap);
  if("group" in cap)out.cap.group=gids.has(cap.group)?cap.group:"";
  else if(!gids.has(out.cap.group))out.cap.group="";
  const ps=+cap.perShift;if(Number.isFinite(ps)&&ps>0)out.cap.perShift=Math.round(clamp(ps,0.1,10000)*10)/10;
  out.chunks=(Array.isArray(o.chunks)?o.chunks:[]).filter(id=>/^[a-f0-9]{32}$/.test(String(id))).slice(0,60);
  Object.entries(obj(o.weeks)).slice(0,800).forEach(([w,v])=>{if(!WA_WEEK.test(w))return;v=obj(v);const ks=+v.ks;if(Number.isFinite(ks)&&ks>0)out.weeks[w]={ks:Math.round(clamp(ks,0,1e9)*100)/100,n:int(v.n,1e7)};});
  out.items=int(o.items,1e7);
  out.at=int(o.at,1e13);out.by=str(o.by,60);
  out.files=(Array.isArray(o.files)?o.files:[]).filter(f=>f&&typeof f==="object").slice(-40).map(f=>({name:str(f.name,160),at:int(f.at,1e13),by:str(f.by,60),
    rows:int(f.rows,1e8),matched:int(f.matched,1e8),dupes:int(f.dupes,1e8),added:int(f.added,1e8),moved:int(f.moved,1e8),items:int(f.items,1e8)}));
  return out;
}

/* ---------- čtení souborů ---------- */
/* Obsazenost: všechny listy, řádek s datem v sloupci data je den. Prázdné dny (bez čísel) se
   přeskočí; stejný den na víc listech: platí poslední vyplněný. */
function waParseAttendance(sheets,cols,groups){
  const c={...WA_COLS.att,...(cols||{})};
  const at=(row,letter)=>{const i=waIndex(letter);return i<0?null:toNum(row[i]);};
  const days={};let rows=0,skipped=0;
  (sheets||[]).forEach(sheet=>(sheet.aoa||[]).forEach(row=>{
    row=row||[];
    const dt=cellToDateTime(row[waIndex(c.date)]);
    if(!dt||dt.y<2000||dt.y>2100)return;
    const iso=dt.y+"-"+String(dt.m).padStart(2,"0")+"-"+String(dt.d).padStart(2,"0");
    const d={am:{plan:at(row,c.amPlan),total:at(row,c.amTotal),abs:at(row,c.amAbs)},pm:{plan:at(row,c.pmPlan),total:at(row,c.pmTotal)},g:{}};
    (groups||[]).forEach(g=>{const a=g.am?at(row,g.am):null,p=g.pm?at(row,g.pm):null;if(a!=null||p!=null)d.g[g.id]=[a,p];});
    const any=[d.am.plan,d.am.total,d.am.abs,d.pm.plan,d.pm.total].some(v=>v!=null)||Object.keys(d.g).length>0;
    if(!any){skipped++;return;}
    days[iso]=d;rows++;
  }));
  const isos=Object.keys(days).sort();
  return {days,rows,skipped,from:isos[0]||"",to:isos[isos.length-1]||""};
}
/* Výkaz práce: datum, operace, kusy. Kusy se sčítají po dnech a operacích. */
function waParseWork(sheets,cols){
  const c={...WA_COLS.work,...(cols||{})};
  const di=waIndex(c.date),oi=waIndex(c.op),ki=waIndex(c.ks);
  const byDay={},ops={};let rows=0,skipped=0;
  (sheets||[]).forEach(sheet=>(sheet.aoa||[]).forEach(row=>{
    row=row||[];
    const dt=cellToDateTime(row[di]);
    const op=row[oi]==null?"":String(row[oi]).replace(/\s+/g," ").trim().slice(0,160);
    const ks=toNum(row[ki]);
    if(!dt||dt.y<2000||dt.y>2100){if(op&&ks!=null)skipped++;return;}
    if(!op||ks==null){skipped++;return;}
    const iso=dt.y+"-"+String(dt.m).padStart(2,"0")+"-"+String(dt.d).padStart(2,"0");
    const day=byDay[iso]||(byDay[iso]={});
    day[op]=(day[op]||0)+ks;
    ops[op]=(ops[op]||0)+ks;
    rows++;
  }));
  const isos=Object.keys(byDay).sort();
  return {byDay,ops,rows,skipped,from:isos[0]||"",to:isos[isos.length-1]||""};
}
/* Kusy pro KPI z evidence práce ve Výrobě (2.35): stejné řádky, sloupce podle mapování Výroby
   (datum, operace, kusy), počítá se jako import výkazu práce v KPI. Bez operace nebo kusů null. */
function waParseProd(aoa,map){
  if(!map||map.op==null||map.ks==null||map.date==null||map.op<0||map.ks<0||map.date<0)return null;
  const rows=(aoa||[]).slice(Math.max(0,(+map.header||0)+1));
  return waParseWork([{aoa:rows}],{date:colLetter(map.date),op:colLetter(map.op),ks:colLetter(map.ks)});
}
function waGuessGroup(name,groups){
  const n=norm(name);
  const hit=WA_GUESS.find(([id,re])=>re.test(n)&&groups.some(g=>g.id===id));
  return hit?hit[0]:"";
}
/* Nahrání: dny ze souboru nahradí uložené dny (úpravy zůstanou), ostatní dny se nemění.
   Nová operace přijde bez skupiny, takže se nezapočítá, dokud ji uživatel nepřiřadí. */
function waApplyAttendance(wa,parsed,meta){
  Object.entries(parsed.days).forEach(([iso,d])=>{wa.days[iso]=d;});
  wa.files.push({kind:"att",name:(meta&&meta.name)||"",at:(meta&&meta.at)||Date.now(),by:(meta&&meta.by)||"",from:parsed.from,to:parsed.to,days:Object.keys(parsed.days).length,rows:parsed.rows});
  wa.files=wa.files.slice(-40);
  return {days:Object.keys(parsed.days).length};
}
function waApplyWork(wa,parsed,meta){
  const byName=new Map(wa.ops.map(x=>[norm(x.name),x]));
  const added=[];
  Object.keys(parsed.ops).sort((a,b)=>a.localeCompare(b,"cs")).forEach(name=>{
    if(byName.has(norm(name)))return;
    wa.seq=(wa.seq||0)+1;
    const op={id:"o"+wa.seq,name,group:"",on:true};
    wa.ops.push(op);byName.set(norm(name),op);added.push(op);
  });
  Object.entries(parsed.byDay).forEach(([iso,day])=>{
    const out={};Object.entries(day).forEach(([name,ks])=>{const op=byName.get(norm(name));out[op.id]=Math.round(((out[op.id]||0)+ks)*100)/100;});
    wa.pcs[iso]=out;
  });
  wa.files.push({kind:"work",name:(meta&&meta.name)||"",at:(meta&&meta.at)||Date.now(),by:(meta&&meta.by)||"",from:parsed.from,to:parsed.to,days:Object.keys(parsed.byDay).length,rows:parsed.rows});
  wa.files=wa.files.slice(-40);
  return {days:Object.keys(parsed.byDay).length,added};
}

/* ---------- hodnoty dne (s úpravami) ---------- */
function waRaw(wa,iso,key){
  const d=wa.days[iso];
  if(key.startsWith("pcs.")){const p=wa.pcs[iso];return p&&p[key.slice(4)]!=null?p[key.slice(4)]:null;}
  if(!d)return null;
  const [a,b,c]=key.split(".");
  if(a==="am"||a==="pm")return d[a][b]??null;
  const g=d.g[b];return g?g[c==="am"?0:1]??null:null;
}
function waVal(wa,iso,key){const e=(wa.edits[iso]||{})[key];return e?e.v:waRaw(wa,iso,key);}
function waKeyLabel(wa,key){
  const [a,b,c]=key.split(".");
  const sh={am:"Ranní",pm:"Odpolední"};
  if(a==="pcs"){const op=wa.ops.find(x=>x.id===b);return "Kusy – "+(op?op.name:b);}
  if(a==="g"){const g=wa.groups.find(x=>x.id===b);return sh[c]+", "+(g?g.name:b);}
  return sh[a]+", "+{plan:a==="am"?"mělo dorazit":"požadavek",total:"celkem v práci",abs:"absence"}[b];
}
const waSum=list=>{const v=list.filter(x=>x!=null);return v.length?Math.round(v.reduce((s,x)=>s+x,0)*100)/100:null;};
/* Jeden den: obsazenost po směnách a skupinách, kusy po operacích a skupinách, kontrola součtů. */
function waDay(wa,iso){
  const [y,m,dd]=iso.split("-").map(Number);
  const day=mkDay(y,m,dd);
  const v=k=>waVal(wa,iso,k);
  const am={plan:v("am.plan"),total:v("am.total"),abs:v("am.abs")},pm={plan:v("pm.plan"),total:v("pm.total")};
  const g={};
  wa.groups.forEach(gr=>{const a=v("g."+gr.id+".am"),p=v("g."+gr.id+".pm");g[gr.id]={am:a,pm:p,sum:waSum([a,p])};});
  const pcs={};const groupPcs={};let pcsTotal=null,noGroup=null;
  wa.ops.forEach(op=>{
    const n=v("pcs."+op.id);if(n==null)return;pcs[op.id]=n;
    if(!op.on)return;
    if(!op.group){noGroup=(noGroup||0)+n;return;}   // bez skupiny se nezapočítá
    pcsTotal=(pcsTotal||0)+n;
    groupPcs[op.group]=(groupPcs[op.group]||0)+n;
  });
  const people=waSum([am.total,pm.total]);
  const plan=waSum([am.plan,pm.plan]);
  let prodPeople=null,unprodPeople=null,noIsPeople=null,prodPcs=null;
  wa.groups.forEach(gr=>{
    const n=g[gr.id].sum;
    if(gr.noIs){if(n!=null)noIsPeople=(noIsPeople||0)+n;return;}
    if(gr.unprod){if(n!=null)unprodPeople=(unprodPeople||0)+n;return;}
    if(n!=null)prodPeople=(prodPeople||0)+n;
    if(groupPcs[gr.id]!=null)prodPcs=(prodPcs||0)+groupPcs[gr.id];
  });
  const amSum=waSum(wa.groups.map(gr=>g[gr.id].am)),pmSum=waSum(wa.groups.map(gr=>g[gr.id].pm));
  const edits=wa.edits[iso]||{};
  return {iso,day,am,pm,g,pcs,groupPcs,pcsTotal,noGroup,people,plan,prodPeople,unprodPeople,noIsPeople,prodPcs,
    perProd:prodPcs!=null&&prodPeople?prodPcs/prodPeople:null,
    fill:people!=null&&plan?people/plan:null,
    check:{am:amSum!=null&&am.total!=null?Math.round((amSum-am.total)*100)/100:null,pm:pmSum!=null&&pm.total!=null?Math.round((pmSum-pm.total)*100)/100:null},
    hasAtt:!!wa.days[iso],hasWork:!!wa.pcs[iso],edited:Object.keys(edits),note:wa.notes[iso]||""};
}
/* Dny období: všechny dny s daty, všechny pracovní dny (i bez dat, ať je chybějící den vidět)
   a svátky ve všední den (ať je jasné, proč data chybí). Víkend bez dat se vynechá. */
function waDays(wa,from,to){
  const out=[];
  if(!WA_ISO.test(from)||!WA_ISO.test(to)||from>to)return out;
  for(let iso=from,i=0;iso<=to&&i<1200;iso=addDays(iso,1),i++){
    const has=wa.days[iso]||wa.pcs[iso]||wa.edits[iso]||wa.notes[iso];
    const [y,m,d]=iso.split("-").map(Number);
    const day=mkDay(y,m,d);
    if(!has&&!day.work&&!(day.hol&&!day.weekend))continue;
    out.push(waDay(wa,iso));
  }
  return out;
}
/* Souhrn za skupinu dnů (období, týden, měsíc). Osobosměna = jeden člověk na jedné směně. */
function waTotals(wa,days){
  const add=(a,b)=>b==null?a:(a||0)+b;
  const t={days:days.length,workDays:0,offDays:0,offWorked:0,missingAtt:0,missingWork:0,shifts:null,amShifts:null,pmShifts:null,plan:null,planned:null,
    abs:null,pcs:null,noGroup:null,prodShifts:null,prodPcs:null,unprodShifts:null,noIsShifts:null,edits:0,group:{}};
  wa.groups.forEach(g=>{t.group[g.id]={shifts:null,am:null,pm:null,pcs:null,work:null};});
  let fillPeople=0,fillPlan=0,workPeople=0,workWithAtt=0,workPlan=0,workWithPlan=0,reqSum=0;
  // Požadavek na pracovní den (2.18): pevný počet lidí z Nastavení, jinak plán ze souboru (mělo dorazit + požadavek).
  t.reqDays=0;t.metDays=0;t.balance=null;
  days.forEach(d=>{
    const req=d.day.work&&d.people!=null?waReq(wa,d):null;
    if(req){t.reqDays++;reqSum+=req;if(d.people>=req)t.metDays++;t.balance=Math.round(((t.balance||0)+d.people-req)*100)/100;}
    if(d.day.work)t.workDays++;else{t.offDays++;if(d.people)t.offWorked++;}
    if(d.day.work&&!d.hasAtt)t.missingAtt++;
    if(d.day.work&&!d.hasWork)t.missingWork++;
    t.shifts=add(t.shifts,d.people);t.amShifts=add(t.amShifts,d.am.total);t.pmShifts=add(t.pmShifts,d.pm.total);
    t.plan=add(t.plan,d.plan);t.abs=add(t.abs,d.am.abs);t.pcs=add(t.pcs,d.pcsTotal);t.noGroup=add(t.noGroup,d.noGroup);
    t.prodShifts=add(t.prodShifts,d.prodPeople);t.prodPcs=add(t.prodPcs,d.prodPcs);t.unprodShifts=add(t.unprodShifts,d.unprodPeople);t.noIsShifts=add(t.noIsShifts,d.noIsPeople);
    if(d.people!=null&&d.plan){fillPeople+=d.people;fillPlan+=d.plan;}
    if(d.day.work&&d.people!=null){workPeople+=d.people;workWithAtt++;if(d.plan){workPlan+=d.plan;workWithPlan++;}}
    t.edits+=d.edited.length;
    wa.groups.forEach(g=>{const x=t.group[g.id],y=d.g[g.id];x.shifts=add(x.shifts,y.sum);x.am=add(x.am,y.am);x.pm=add(x.pm,y.pm);x.pcs=add(x.pcs,d.groupPcs[g.id]);
      if(d.day.work&&d.people!=null)x.work=add(x.work,y.sum);});
  });
  t.fill=fillPlan?fillPeople/fillPlan:null;
  t.avgPeople=workWithAtt?workPeople/workWithAtt:null;
  t.avgPlan=workWithPlan?workPlan/workWithPlan:null;
  t.avgReq=t.reqDays?reqSum/t.reqDays:null;
  t.metShare=t.reqDays?t.metDays/t.reqDays:null;
  t.perShift=t.prodShifts&&t.prodPcs!=null?t.prodPcs/t.prodShifts:null;
  t.perDay=t.workDays&&t.pcs!=null?t.pcs/Math.max(1,days.filter(d=>d.hasWork).length):null;
  t.unprodShare=t.shifts&&t.unprodShifts!=null?t.unprodShifts/t.shifts:null;
  // skupina: průměr na pracovní den s obsazeností a podíl na lidech v práci (2.17.2)
  wa.groups.forEach(g=>{const x=t.group[g.id];x.per=!g.unprod&&!g.noIs&&x.shifts&&x.pcs!=null?x.pcs/x.shifts:null;
    x.avg=workWithAtt&&x.work!=null?x.work/workWithAtt:null;x.share=workPeople&&x.work!=null?x.work/workPeople:null;});
  return t;
}
/* Týdny (ISO, od pondělí) a měsíce období. */
function waWeeks(wa,days){
  const map=new Map();
  days.forEach(d=>{const w=isoWeek(d.iso);if(!map.has(w.id))map.set(w.id,{id:w.id,label:weekName(w.id),range:weekRange(w),days:[]});map.get(w.id).days.push(d);});
  return [...map.values()].map(w=>({...w,t:waTotals(wa,w.days)}));
}
function waMonths(wa,days){
  const map=new Map();
  days.forEach(d=>{const id=d.iso.slice(0,7);if(!map.has(id))map.set(id,{id,label:monthLabel(id),days:[]});map.get(id).days.push(d);});
  return [...map.values()].map(m=>({...m,t:waTotals(wa,m.days)}));
}
/* Rozsah dat: první a poslední den s obsazeností nebo kusy. */
function waSpan(wa){
  const isos=[...Object.keys(wa.days),...Object.keys(wa.pcs)].sort();
  return isos.length?{from:isos[0],to:isos[isos.length-1]}:null;
}
/* Úprava hodnoty: null = vrátit původní. Úprava stejná jako zdroj se neukládá. */
function waSetEdit(wa,iso,key,value,note,by,now){
  if(!WA_ISO.test(iso)||!WA_KEY.test(key))return false;
  const raw=waRaw(wa,iso,key);
  const day=wa.edits[iso]||(wa.edits[iso]={});
  if(value===undefined||value===raw){delete day[key];if(!Object.keys(day).length)delete wa.edits[iso];return true;}
  day[key]={v:value,was:raw,note:String(note||"").slice(0,300),by:String(by||"").slice(0,60),at:now||Date.now()};
  return true;
}
function waEditList(wa,from,to){
  const out=[];
  Object.entries(wa.edits).forEach(([iso,day])=>{
    if((from&&iso<from)||(to&&iso>to))return;
    Object.entries(day).forEach(([key,e])=>out.push({iso,key,label:waKeyLabel(wa,key),...e,now:waRaw(wa,iso,key)}));
  });
  return out.sort((a,b)=>a.iso.localeCompare(b.iso)||a.label.localeCompare(b.label,"cs"));
}

/* Kusy po operacích za dny období (jen operace, které v období mají kusy). */
function waOpTotals(wa,days){
  const map=new Map();
  days.forEach(d=>Object.entries(d.pcs).forEach(([id,n])=>map.set(id,(map.get(id)||0)+n)));
  return wa.ops.filter(op=>map.has(op.id)).map(op=>({...op,ks:Math.round(map.get(op.id)*100)/100})).sort((a,b)=>b.ks-a.ks||a.name.localeCompare(b.name,"cs"));
}
/* Co má auditor nebo vedoucí zkontrolovat: chybějící dny, nesedící součty, práce o víkendu
   a ve svátek, kusy bez skupiny a operace, které se nezapočítávají. */
function waIssues(wa,days){
  const ops=waOpTotals(wa,days);
  return {
    missingAtt:days.filter(d=>d.day.work&&!d.hasAtt).map(d=>d.iso),
    missingWork:days.filter(d=>d.day.work&&!d.hasWork).map(d=>d.iso),
    mismatch:days.flatMap(d=>["am","pm"].filter(k=>d.check[k]).map(k=>({iso:d.iso,shift:k,diff:d.check[k]}))),
    offWorked:days.filter(d=>!d.day.work&&(d.people||d.pcsTotal)).map(d=>({iso:d.iso,people:d.people,pcs:d.pcsTotal,hol:d.day.hol,weekend:d.day.weekend})),
    noGroup:ops.filter(op=>op.on&&!op.group),
    off:ops.filter(op=>!op.on)
  };
}
/* Typ dne pro tabulky a exporty. */
function waDayType(day){return day.hol?"svátek – "+day.hol:day.sat?"sobota":day.sun?"neděle":"pracovní den";}
const waR=(v,d=2)=>v==null?null:Math.round(v*10**d)/10**d;
/* Historický přehled po týdnech (2.18): posledních `weeks` týdnů do posledního dne s daty (0 = vše),
   od pondělí, ale ne před prvním dnem s daty. */
function waHistRange(wa,weeks){
  const span=waSpan(wa);
  if(!span)return null;
  // Celé týdny zpět od týdne posledních dat, ale ne před prvním dnem s daty: dny před ním by se jinak
  // počítaly jako pracovní dny bez obsazenosti. wFrom = pondělí prvního týdne (popisky týdnů).
  let from=weeks>0?addDays(isoWeek(span.to).from,-7*(weeks-1)):span.from;
  if(from<span.from)from=span.from;
  return {from,to:span.to,wFrom:isoWeek(from).from};
}
/* Vlastní období přehledu (2.19.1): od–do podle uživatele, oříznuté na dny s daty (dny mimo data
   by se počítaly jako pracovní dny bez obsazenosti). want = zadané období; empty = v něm nejsou data. */
function waCustomRange(wa,from,to){
  const span=waSpan(wa);
  if(!span)return null;
  if(!WA_ISO.test(String(from)))from=span.from;
  if(!WA_ISO.test(String(to)))to=span.to;
  if(from>to)[from,to]=[to,from];
  const want={from,to};
  const f=from<span.from?span.from:from,t=to>span.to?span.to:to;
  if(f>t)return {from,to,wFrom:isoWeek(from).from,want,empty:true};
  return {from:f,to:t,wFrom:isoWeek(f).from,want,clipped:f!==from||t!==to};
}
/* Požadavek lidí na pracovní den: pevný z Nastavení, jinak plán ze souboru. */
function waReq(wa,d){return wa.target||d.plan||null;}
/* Obsazenost proti požadavku (2.18): dny se splněným požadavkem, kumulovaná bilance (člověkodny)
   a výpadky: od dne, kdy bilance klesne pod nulu, do dne, kdy se znovu dorovná. Otevřený výpadek
   má návrh dorovnání: tolik lidí navíc, kolik průměrně chybělo, a na kolik pracovních dní. */
function waStaffing(wa,days){
  const rows=[];let cum=0,met=0;
  days.forEach(d=>{
    if(!d.day.work||d.people==null)return;
    const req=waReq(wa,d);if(!req)return;
    const diff=Math.round((d.people-req)*100)/100;
    cum=Math.round((cum+diff)*100)/100;
    if(d.people>=req)met++;
    rows.push({iso:d.iso,people:d.people,req,diff,cum,met:d.people>=req});
  });
  const episodes=[];let ep=null;
  rows.forEach(r=>{
    if(!ep&&r.cum<0)ep={from:r.iso,to:null,days:0,worst:r.cum,short:0,shortDays:0};
    if(ep){
      ep.days++;ep.worst=Math.min(ep.worst,r.cum);
      if(r.diff<0){ep.short+=-r.diff;ep.shortDays++;}
      if(r.cum>=0){ep.to=r.iso;episodes.push(ep);ep=null;}
    }
  });
  let open=null;
  if(ep){
    const avg=ep.shortDays?ep.short/ep.shortDays:0;
    const extra=Math.max(1,Math.ceil(avg-1e-9));
    const deficit=-cum;
    open={from:ep.from,days:ep.days,worst:ep.worst,deficit,avgShort:Math.round(avg*10)/10,extra,needDays:Math.ceil(deficit/extra-1e-9)};
    episodes.push(ep);
  }
  return {rows,n:rows.length,met,share:rows.length?met/rows.length:null,balance:cum,episodes:episodes.map(e=>({from:e.from,to:e.to,days:e.days,worst:e.worst})),open};
}
/* Čísla celku, nebo jedné skupiny (2.17.2): skupina nemá plán ani obsazenost, má podíl na lidech. */
function waFx(t,gid){
  if(gid){const g=t.group[gid]||{};return {workDays:t.workDays,avg:g.avg??null,plan:null,fill:null,shifts:g.shifts??null,planShifts:null,pcs:g.pcs??null,per:g.per??null,share:g.share??null,
    req:null,reqDays:0,metDays:0,metShare:null,balance:null};}
  return {workDays:t.workDays,avg:t.avgPeople,plan:t.avgPlan,fill:t.fill,shifts:t.shifts,planShifts:t.plan,pcs:t.pcs,per:t.perShift,share:null,
    req:t.avgReq,reqDays:t.reqDays,metDays:t.metDays,metShare:t.metShare,balance:t.balance};
}
function waGroupKind(g){return g.noIs?"mimo IS":g.unprod?"neproduktivní":"produktivní";}
const waPct=v=>v==null?null:Math.round(v*1000)/10;
/* Řádek souhrnu za týden: jen fakta pro auditora (2.18 bez osobosměn, se splněným požadavkem). */
const WA_FACT_HEAD=["Pracovní dny","Ø lidí v práci na pracovní den","Ø požadavek na pracovní den","Dny se splněným požadavkem","Podíl dní se splněným požadavkem %","Bilance proti požadavku (člověkodny)","Zpracované kusy","Kusy na osobosměnu"];
const WA_GFACT_HEAD=["Pracovní dny","Ø lidí v práci na pracovní den","Podíl na lidech v práci %","Zpracované kusy","Kusy na osobosměnu"];
function waFacts(t,gid){
  const f=waFx(t,gid);
  return gid?[f.workDays,waR(f.avg,1),waPct(f.share),f.pcs,waR(f.per,1)]
    :[f.workDays,waR(f.avg,1),waR(f.req,1),f.reqDays?f.metDays:null,waPct(f.metShare),f.balance,f.pcs,waR(f.per,1)];
}
/* Listy Excelu pro auditora (2.18): souhrn, skupiny, výpadky a týdny (bez měsíců, dnů a interních
   podkladů). S vybranou skupinou jen čísla té skupiny. */
function waSheets(wa,r,gid){
  const g=gid?wa.groups.find(x=>x.id===gid):null;
  if(!g)gid="";
  const head=gid?WA_GFACT_HEAD:WA_FACT_HEAD;
  const days=waDays(wa,r.from,r.to);
  const t=waTotals(wa,days);
  const weeks=waWeeks(wa,days);
  const f=waFacts(t,gid);
  const st=gid?null:waStaffing(wa,days);
  const sum=[["Lidé v práci a zpracované kusy"+(g?" – "+g.name:"")],["Období",dayText(r.from)+" – "+dayText(r.to)],...(g?[["Skupina",g.name+" ("+waGroupKind(g)+")"]]:[]),
    ...(gid?[]:[["Požadavek lidí na pracovní den",wa.target?"pevně "+wa.target:"podle plánu v souboru (mělo dorazit + požadavek)"]]),[],
    ...head.map((h,i)=>[h,f[i]]),[],
    ["Člověkoden = jeden člověk v práci jeden den. Bilance = lidé v práci minus požadavek; záporná = chybějící lidé, které je potřeba dorovnat. Kusy jen z operací přiřazených ke skupinám; kusy na osobosměnu jen u produktivních skupin."]];
  const out=[{name:"Souhrn",cols:[44,16],rows:sum}];
  if(!gid){
    const gh=["Skupina","Zařazení","Ø lidí v práci na pracovní den","Podíl na lidech v práci %","Zpracované kusy","Kusy na osobosměnu"];
    out.push({name:"Skupiny",cols:[36,14,14,14,14,14],rows:[gh,...wa.groups.map(x=>{const v=waFx(t,x.id);return [x.name,waGroupKind(x),waR(v.avg,1),waPct(v.share),v.pcs,waR(v.per,1)];})]});
    if(st.episodes.length)out.push({name:"Výpadky",cols:[12,12,22,24],rows:[["Od","Dorovnáno","Pracovních dní do dorovnání","Největší ztráta (člověkodny)"],
      ...st.episodes.map(e=>[e.from,e.to||"zatím ne",e.days,e.worst])]});
  }
  let cum=0;
  out.push({name:"Týdny",cols:[10,11,11,...head.map(()=>14),...(gid?[]:[14])],rows:[["Týden","Od","Do",...head,...(gid?[]:["Kumulovaná bilance (člověkodny)"])],...weeks.map(w=>{
    const wk=weekById(w.id);const row=[w.label,wk.from<r.from?r.from:wk.from,wk.to>r.to?r.to:wk.to,...waFacts(w.t,gid)];
    if(!gid){cum=Math.round((cum+(w.t.balance||0))*100)/100;row.push(w.t.reqDays?cum:null);}
    return row;})]});
  return out;
}

/* ---------- výrobní plán (2.18) ---------- */
/* Odhad sloupce podle nadpisu (jen předvyplnění ve vzoru). */
const WA_PLAN_GUESS={order:/objedn|zakazk|order/,ean:/(^|[^a-z])ean([^a-z]|$)|carov|barcode/,ks:/pocet|mnozstv|(^|[^a-z])ks([^a-z]|$)|kusu|qty|quantit/,
  index:/index|cislo dilu|artikl|material/,due:/termin|dokonc|due|deadline|datum dod/,tech:/technolog|postup|(^|[^a-z])tech([^a-z]|$)/};
function waPlanGuess(headers){
  const out={},used=new Set();
  WA_PLAN_FIELDS.forEach(f=>{
    const i=headers.findIndex((h,j)=>!used.has(j)&&WA_PLAN_GUESS[f].test(norm(h)));
    if(i>=0){out[f]=i;used.add(i);}
  });
  return out;
}
/* Řádek s nadpisy: v prvních 40 řádcích ten s nejvíc textovými buňkami. */
function waPlanHeaderRow(rows){
  let best=0,score=-1;
  rows.slice(0,40).forEach((r,i)=>{const n=(r||[]).filter(v=>typeof v==="string"&&v.trim()&&!/^\d+([.,]\d+)?$/.test(v.trim())).length;if(n>score){score=n;best=i;}});
  return best;
}
/* Sloupce listu podle vzoru: nadpisy hledá nejdřív na řádku ze vzoru (plán je má na 2. řádku),
   pak v prvních 60 řádcích (soubor se mohl posunout). Sloupec podle názvu; když je stejný název
   víckrát, má přednost sloupec se stejným písmenem jako ve vzoru. Nenalezené pole se čte podle
   písmene ze vzoru a je v `missing`. Vrací {header, idx: {pole: index sloupce}, found, missing}. */
function waPlanCols(rows,sh){
  const fields=WA_PLAN_FIELDS.filter(f=>sh.cols[f]);
  const want=fields.filter(f=>sh.heads[f]).map(f=>[f,norm(sh.heads[f]),waIndex(sh.cols[f])]);
  if(want.length){
    const n=Math.min(rows.length,60);
    const order=[sh.header,...Array.from({length:n},(_,i)=>i).filter(i=>i!==sh.header)].filter(i=>i<rows.length);
    for(const i of order){
      const r=Array.from(rows[i]||[],v=>norm(v==null?"":v));
      const idx={};want.forEach(([f,h,c])=>{const j=r[c]===h?c:r.indexOf(h);if(j>=0)idx[f]=j;});
      if(Object.keys(idx).length>=Math.min(3,want.length)){
        const missing=fields.filter(f=>!(f in idx));
        missing.forEach(f=>{idx[f]=waIndex(sh.cols[f]);});
        return {header:i,idx,found:true,missing};
      }
    }
  }
  const idx={};fields.forEach(f=>{idx[f]=waIndex(sh.cols[f]);});
  return {header:sh.header,idx,found:false,missing:[]};
}
/* Technologie: „G2“ nebo „G“ jako samostatné označení (G2/B, G + K), nebo kdekoli v textu. */
function waPlanMatch(tech,cfg){
  if(!cfg||!cfg.words||!cfg.words.length)return true;
  const t=String(tech==null?"":tech).toUpperCase();
  if(cfg.mode==="contains")return cfg.words.some(w=>t.includes(w));
  const toks=t.split(/[^A-Z0-9]+/);
  return cfg.words.some(w=>toks.includes(w));
}
function waPlanPart(v){
  if(v==null)return "";
  if(typeof v==="number")return Number.isFinite(v)?String(Number.isInteger(v)?v:+v.toFixed(6)):"";
  return String(v).trim().replace(/\s+/g," ").toUpperCase().replace(/^(\d+)\.0+$/,"$1");
}
/* Sloučení řádků plánu do položek: klíč = objednávka + index + EAN. Duplicita (v souboru i proti
   dřívějším plánům) si nechá verzi s nejpozdějším termínem; při stejném termínu platí novější.
   rows: [objednávka, EAN, ks, index, termín, technologie] (surové buňky); sedmá hodnota 1 = list bez
   sloupce technologie, řádek se bere bez filtru. map: klíč → [ISO, ks]. */
function waPlanMerge(map,rows,cfg){
  const st={rows:0,bad:0,notTech:0,matched:0,dupes:0,added:0,moved:0,older:0,same:0};
  const seen=new Set(),techs=new Map();
  rows.forEach(r=>{
    st.rows++;
    const tech=r[5]==null?"":String(r[5]).trim();
    const ok=r[6]===1||waPlanMatch(tech,cfg);
    const tc=techs.get(tech);if(tc)tc[0]++;else if(techs.size<2000)techs.set(tech,[1,ok]);
    if(!ok){st.notTech++;return;}
    const ks=toNum(r[2]),dt=cellToDateTime(r[4]);
    const key=[r[0],r[3],r[1]].map(waPlanPart).join("|");
    if(ks==null||ks<=0||!dt||dt.y<2000||dt.y>2100||key==="||"){st.bad++;return;}
    st.matched++;
    const iso=dt.y+"-"+String(dt.m).padStart(2,"0")+"-"+String(dt.d).padStart(2,"0");
    if(seen.has(key))st.dupes++;else seen.add(key);
    const old=map.get(key);
    if(!old){map.set(key,[iso,ks]);st.added++;return;}
    if(iso>old[0]){map.set(key,[iso,ks]);st.moved++;}
    else if(iso===old[0]){map.set(key,[iso,ks]);st.same++;}
    else st.older++;
  });
  st.items=map.size;
  // nejčastější hodnoty technologie, ať je vidět, co filtr bere
  st.techs=[...techs.entries()].sort((a,b)=>b[1][0]-a[1][0]).slice(0,12).map(([t,[n,ok]])=>({tech:t,n,ok}));
  return st;
}
/* Fronta souborů do uloženého plánu (2.18.2): stejné pravidlo jako waPlanMerge (pozdější termín
   vyhrává, při stejném termínu platí fronta). Statistika je proti uloženému plánu. */
function waPlanMergeMap(map,src){
  const st={added:0,moved:0,older:0,same:0};
  src.forEach((v,k)=>{
    const o=map.get(k);
    if(!o){map.set(k,v);st.added++;}
    else if(v[0]>o[0]){map.set(k,v);st.moved++;}
    else if(v[0]===o[0]){map.set(k,v);st.same++;}
    else st.older++;
  });
  st.items=map.size;
  return st;
}
/* Uložení položek: sloupcově (klíče, dny od 1. 1. 1970, kusy), ať se dobře komprimuje. */
function waPlanEncode(map){
  const k=[],d=[],q=[];
  map.forEach((v,key)=>{k.push(key);d.push(Math.round(utcOf(v[0])/DAY_MS));q.push(v[1]);});
  return {v:1,k,d,q};
}
function waPlanDecode(o){
  const map=new Map();
  if(!o||o.v!==1||!Array.isArray(o.k)||!Array.isArray(o.d)||!Array.isArray(o.q))return map;
  for(let i=0;i<o.k.length;i++){
    const key=o.k[i],day=o.d[i],ks=o.q[i];
    if(typeof key!=="string"||!Number.isFinite(day)||!Number.isFinite(ks)||ks<=0)continue;
    map.set(key,[isoOf(day*DAY_MS),ks]);
  }
  return map;
}
/* Součty po týdnech termínu (do stavu). */
function waPlanWeeks(map){
  const out={};
  map.forEach(([iso,ks])=>{const w=isoWeek(iso).id;const x=out[w]||(out[w]={ks:0,n:0});x.ks=Math.round((x.ks+ks)*100)/100;x.n++;});
  return out;
}
/* Kapacita brusičů po týdnech: skutečná (směny skupiny podle obsazenosti × ks na směnu), pracovní
   dny bez obsazenosti doplní odhad z průměru posledních 20 pracovních dnů s obsazeností (est = počet
   odhadnutých dnů; actual = celý týden podle obsazenosti). Skluz = kusy, které se v týdnu nestihnou
   a přejdou do dalšího (nevyužitá kapacita se nepřenáší, skluz neklesne pod 0). */
function waPlanCapacity(wa,weekIds){
  const p=wa.plan,grp=p.cap.group,per=p.cap.perShift||25;
  const recent=Object.keys(wa.days).sort().reverse().filter(iso=>{const [y,m,d]=iso.split("-").map(Number);return mkDay(y,m,d).work;}).slice(0,20);
  const val=(iso,k)=>waVal(wa,iso,"g."+grp+"."+k);
  const avgGr=grp&&recent.length?recent.reduce((a,iso)=>a+(val(iso,"am")||0)+(val(iso,"pm")||0),0)/recent.length:null;
  let cum=0;
  return weekIds.map(id=>{
    const w=weekById(id);const plan=(p.weeks[id]||{}).ks||0,n=(p.weeks[id]||{}).n||0;
    let workDays=0,shifts=0,att=0,est=0;
    for(let i=0;i<7;i++){
      const iso=addDays(w.from,i);const [y,m,d]=iso.split("-").map(Number);
      const work=mkDay(y,m,d).work;
      if(work)workDays++;
      if(!grp)continue;
      if(wa.days[iso]){att++;shifts+=(val(iso,"am")||0)+(val(iso,"pm")||0);}
      else if(work&&avgGr!=null){est++;shifts+=avgGr;}
    }
    const known=att+est>0;
    const cap=grp&&known?Math.round(shifts*per*10)/10:null;
    if(cap!=null)cum=Math.max(0,Math.round((cum+plan-cap)*10)/10);
    return {id,label:weekName(id),range:weekRange(w),plan,n,workDays,cap,actual:att>0&&!est,est,grinders:known?Math.round(shifts/(att+est)*100)/100:null,
      need:workDays&&per?plan/per/workDays:null,diff:cap==null?null:Math.round((cap-plan)*10)/10,cum:cap==null?null:cum};
  });
}
function waPlanFileIds(st){return ((((st||S).workAudit||{}).plan||{}).chunks||[]).slice();}

/* ---------- historie změn ---------- */
function waChanges(A,B,add){
  A=A||blankWorkAudit();B=B||blankWorkAudit();
  const ga=new Map(A.groups.map(g=>[g.id,g])),opa=new Map(A.ops.map(x=>[x.id,x]));
  const gname=(st,id)=>{const g=st.groups.find(x=>x.id===id);return g?g.name:"—";};
  B.groups.forEach(g=>{
    const o=ga.get(g.id);
    if(!o){add("workaudit","KPI: nová skupina „"+g.name+"“",{m:"wag:"+g.id});return;}
    if(o.name!==g.name)add("workaudit","",{m:"wan:"+g.id,p:"KPI – skupina přejmenována: ",v0:"„"+o.name+"“",v1:"„"+g.name+"“"});
    if(o.unprod!==g.unprod)add("workaudit","",{m:"wau:"+g.id,p:"KPI – "+g.name+", neproduktivní pozice: ",v0:o.unprod?"ano":"ne",v1:g.unprod?"ano":"ne"});
    if(o.noIs!==g.noIs)add("workaudit","",{m:"wai:"+g.id,p:"KPI – "+g.name+", projekt není evidován v IS: ",v0:o.noIs?"ano":"ne",v1:g.noIs?"ano":"ne"});
    if((o.mg||[]).join()!==(g.mg||[]).join()){const nm=l=>(l||[]).map(id=>{const p=S.positions.find(x=>x.id===id);return p?p.name:id;}).join(", ")||"podle názvu";
      add("workaudit","",{m:"wam:"+g.id,p:"KPI – "+g.name+", skupiny Matice: ",v0:nm(o.mg),v1:nm(g.mg)});}
    if(o.am!==g.am||o.pm!==g.pm)add("workaudit","",{m:"wac:"+g.id,p:"KPI – "+g.name+", sloupce ranní/odpolední: ",v0:(o.am||"—")+"/"+(o.pm||"—"),v1:(g.am||"—")+"/"+(g.pm||"—")});
  });
  A.groups.forEach(g=>{if(!B.groups.some(x=>x.id===g.id))add("workaudit","KPI: smazána skupina „"+g.name+"“",{m:"wag:"+g.id});});
  B.ops.forEach(x=>{
    const o=opa.get(x.id);if(!o)return;   // nové operace přicházejí s importem
    if(o.group!==x.group)add("workaudit","",{m:"wao:"+x.id,p:"KPI – operace „"+x.name+"“, skupina: ",v0:o.group?gname(A,o.group):"bez skupiny",v1:x.group?gname(B,x.group):"bez skupiny"});
    if(o.on!==x.on)add("workaudit","",{m:"waon:"+x.id,p:"KPI – operace „"+x.name+"“: ",v0:o.on?"započítává se":"nezapočítává se",v1:x.on?"započítává se":"nezapočítává se"});
  });
  if(JSON.stringify(A.cols)!==JSON.stringify(B.cols))add("workaudit","KPI: změněny sloupce souborů",{m:"wacols"});
  if((A.target||null)!==(B.target||null))add("workaudit","",{m:"watarget",p:"KPI – požadavek lidí na pracovní den: ",v0:A.target?String(A.target):"podle plánu v souboru",v1:B.target?String(B.target):"podle plánu v souboru"});
  const qa=A.drep||blankDrep(),qb=B.drep||blankDrep();
  const rgT=g=>g.depts.length?g.depts.join(", "):"bez oddělení";
  qb.groups.forEach(g=>{
    const o=qa.groups.find(x=>x.id===g.id);
    if(!o){add("workaudit","Report docházky: nová skupina „"+g.name+"“ ("+rgT(g)+")",{m:"wadrg:"+g.id});return;}
    if(o.name!==g.name)add("workaudit","",{m:"wadrn:"+g.id,p:"Report docházky – skupina přejmenována: ",v0:"„"+o.name+"“",v1:"„"+g.name+"“"});
    if(o.depts.join("|")!==g.depts.join("|"))add("workaudit","",{m:"wadrd:"+g.id,p:"Report docházky – "+g.name+", oddělení: ",v0:rgT(o),v1:rgT(g)});
  });
  qa.groups.forEach(g=>{if(!qb.groups.some(x=>x.id===g.id))add("workaudit","Report docházky: smazána skupina „"+g.name+"“",{m:"wadrg:"+g.id});});
  new Set([...Object.keys(qa.marks),...Object.keys(qb.marks)]).forEach(iso=>{
    if((qa.marks[iso]||"")!==(qb.marks[iso]||""))add("workaudit","",{m:"wadrm:"+iso,p:"Report docházky "+dayText(iso)+": ",v0:DR_MARK[qa.marks[iso]]||"počítá se do normy",v1:DR_MARK[qb.marks[iso]]||"počítá se do normy"});
  });
  const da=A.dv||blankDv(),db=B.dv||blankDv();
  if(JSON.stringify(da.cols)!==JSON.stringify(db.cols)||da.unit!==db.unit||JSON.stringify(da.sheets||{})!==JSON.stringify(db.sheets||{}))add("workaudit","KPI: změněny sloupce souboru docházky a výkonů",{m:"wadvcols"});
  if((A.trainPct||null)!==(B.trainPct||null))add("workaudit","",{m:"watrain",p:"KPI – hranice zaškolení: ",v0:A.trainPct?"od "+A.trainPct+" %":"podle Matice dovedností",v1:B.trainPct?"od "+B.trainPct+" %":"podle Matice dovedností"});
  const ra=A.rep||{},rb=B.rep||{};
  if((ra.place||"")!==(rb.place||"")||(ra.firm||"")!==(rb.firm||""))add("workaudit","",{m:"warep",p:"KPI – záhlaví reportů: ",v0:[ra.place,ra.firm].filter(Boolean).join(" · ")||"bez názvu",v1:[rb.place,rb.firm].filter(Boolean).join(" · ")||"bez názvu"});
  const pa=A.plan||blankWaPlan(),pb=B.plan||blankWaPlan();
  const techText=p=>p.tech.words.join(", ")+(p.tech.mode==="contains"?" (kdekoli v textu)":"");
  if(techText(pa)!==techText(pb))add("workaudit","",{m:"waptech",p:"KPI – výrobní plán, technologie: ",v0:techText(pa)||"vše",v1:techText(pb)||"vše"});
  if(pa.cap.group!==pb.cap.group)add("workaudit","",{m:"wapgrp",p:"KPI – výrobní plán, kapacita skupiny: ",v0:pa.cap.group?gname(A,pa.cap.group):"žádná",v1:pb.cap.group?gname(B,pb.cap.group):"žádná"});
  if(pa.cap.perShift!==pb.cap.perShift)add("workaudit","",{m:"wapper",p:"KPI – výrobní plán, kusů na směnu: ",v0:nf(pa.cap.perShift,1),v1:nf(pb.cap.perShift,1)});
  if(JSON.stringify(pa.tpl)!==JSON.stringify(pb.tpl))add("workaudit",pb.tpl?"KPI: vzor výrobního plánu podle souboru "+(pb.tpl.file||"—"):"KPI: vzor výrobního plánu smazán",{m:"waptpl"});
  const isos=new Set([...Object.keys(A.edits),...Object.keys(B.edits)]);
  const fmt=v=>v==null?"prázdné":nf(v,2);
  [...isos].sort().forEach(iso=>{
    const ea=A.edits[iso]||{},eb=B.edits[iso]||{};
    new Set([...Object.keys(ea),...Object.keys(eb)]).forEach(k=>{
      const x=ea[k],y=eb[k];
      if(y&&(!x||x.v!==y.v||x.note!==y.note))add("workaudit","KPI "+dayText(iso)+" – "+waKeyLabel(B,k)+": "+fmt(y.was)+" → "+fmt(y.v)+(y.note?" ("+y.note+")":""),{m:"wae:"+iso+":"+k});
      else if(x&&!y)add("workaudit","KPI "+dayText(iso)+" – "+waKeyLabel(A,k)+": úprava zrušena, platí "+fmt(waRaw(B,iso,k)),{m:"wae:"+iso+":"+k});
    });
  });
  new Set([...Object.keys(A.notes),...Object.keys(B.notes)]).forEach(iso=>{
    if((A.notes[iso]||"")!==(B.notes[iso]||""))add("workaudit","KPI "+dayText(iso)+": "+(B.notes[iso]?"poznámka ke dni „"+B.notes[iso].slice(0,80)+"“":"poznámka smazána"),{m:"wanote:"+iso});
  });
}

