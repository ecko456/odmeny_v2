/* ==========================================================================
   Sloučení souběžných změn (2.62). Když mezitím uložil někdo jiný (409), prohlížeč stáhne
   jeho verzi a sloučí ji s mými změnami tříbodově: base = verze, ze které jsem vycházel,
   mine = moje data, theirs = data ze serveru. Co změnil jen jeden, platí; objekty se slučují
   po klíčích, seznamy objektů s id po položkách (přidání, smazání, změna i pořadí). Střet je
   jen tam, kde oba změnili totéž jinak; pak rozhodne picks[cesta] = "mine" | "theirs"
   (bez volby platí moje). Data zůstávají šifrovaná, server nic neslučuje.
   ========================================================================== */
const MERGE_MAX_CONFLICTS=200;
function mergeIdArr(x){
  if(!Array.isArray(x))return false;
  const ids=new Set();
  for(const e of x){if(!isPlain(e)||typeof e.id!=="string"||!e.id||ids.has(e.id))return false;ids.add(e.id);}
  return true;
}
const MERGE_TOP={employees:"Lidé",positions:"Skupiny a pravidla",sanctions:"Sankce",sanReasons:"Důvody sankcí",periods:"Docházka",production:"Evidence práce",prodMap:"Spárování evidence práce",
  adjust:"Ruční úpravy",kafe:"Kafe",issued:"Výdej",marks:"Body prémie",capReport:"Směny a kapacita",settings:"Nastavení",eff:"Top 5",audit:"Kontroly",logbooks:"Protokoly",
  workAudit:"KPI",service:"Servis",shortage:"Shortage",late:"Po termínu",lockers:"Skříňky",capPlan:"Plán kapacit",tasks:"Úkoly",attEdits:"Úpravy docházky",attLocks:"Zámky docházky",calNotes:"Kalendář",agenda:"Časová osa",leadSkills:"Dovednosti vedoucích",
  normCutDone:"Srážky za neproduktivitu",demo:"Ukázková data"};
const MERGE_FIELD={note:"poznámka",rate:"hodnocení",positionId:"skupina",shift:"směna",sick:"nemoc od",end:"konec trestu",wid:"ID v evidenci práce",excluded:"vyřazen",
  first:"jméno",last:"příjmení",lead:"vedoucí oddělení",title:"název",name:"název",due:"termín",owner:"zodpovědná osoba",state:"stav",desc:"popis",qty:"množství",pct:"procento",
  text:"text",items:"položky",list:"seznam",lists:"seznamy",tl:"časová osa",repeat:"opakování",remind:"připomínka",order:"číslo objednávky",ean:"EAN",index:"index",op:"operace",
  top:"TOP",top2:"TOP 2",dept:"oddělení",subs:"poddíly",rec:"poslední záznam",max:"strop",maxTab:"tabáky za dovednosti",skillset:"dovednosti",tiers:"varianty prémie",
  devices:"zařízení",shipments:"odeslání",back:"vráceno",date:"datum",h:"hodiny",c:"kódy",rows:"řádky"};
function mergeSeg(k,v,parent){
  if(parent==="employees"&&isPlain(v))return ((v.last||"")+" "+(v.first||"")).trim()||k;
  if(k.startsWith("#")){const e=isPlain(v)?v:{};return String(e.name||e.title||e.text||e.ean||e.no||e.label||k.slice(1)).slice(0,60);}
  return MERGE_FIELD[k]||k;
}
/**
 * Tříbodové sloučení. Vrací {state, conflicts: [{key, path (čitelně), mine, theirs}], mine (počet
 * mých změn, které se přenesly), theirs (počet jejich)}.
 */
function mergeStates(base,mine,theirs,picks){
  picks=picks||{};
  const conflicts=[];let nMine=0,nTheirs=0;
  const merge=(b,m,t,p,lab)=>{
    if(undoEq(m,t))return m;
    if(undoEq(b,m)){nTheirs++;return t;}
    if(undoEq(b,t)){nMine++;return m;}
    if(isPlain(m)&&isPlain(t)){
      const bb=isPlain(b)?b:{},out={};
      new Set([...Object.keys(t),...Object.keys(m),...Object.keys(bb)]).forEach(k=>{
        if(!p.length&&k==="v")return;
        const r=merge(bb[k],m[k],t[k],[...p,k],[...lab,p.length?mergeSeg(k,m[k]!==undefined?m[k]:t[k],p[p.length-1]):(MERGE_TOP[k]||k)]);
        if(r!==undefined)out[k]=r;
      });
      return out;
    }
    if(Array.isArray(m)&&Array.isArray(t)&&(b===undefined||!b.length||mergeIdArr(b))&&(!m.length||mergeIdArr(m))&&(!t.length||mergeIdArr(t))&&(m.length||t.length)){
      const bb=Array.isArray(b)?b:[];
      const B=new Map(bb.map(e=>[e.id,e])),M=new Map(m.map(e=>[e.id,e])),T=new Map(t.map(e=>[e.id,e]));
      const order=(x,y)=>x.map(e=>e.id).filter(id=>y.has(id)).join("\u0001");
      // moje pořadí platí, když jsem přeřadil já a oni ne
      const mineMoved=order(m,B)!==order(bb,M),theirsMoved=order(t,B)!==order(bb,T);
      const [first,second]=mineMoved&&!theirsMoved?[m,t]:[t,m];
      const ids=first.map(e=>e.id),have=new Set(ids);
      second.forEach((e,i)=>{
        if(have.has(e.id))return;
        let at=-1;for(let j=i-1;j>=0;j--){const k=ids.indexOf(second[j].id);if(k>=0){at=k;break;}}
        ids.splice(at+1,0,e.id);have.add(e.id);
      });
      bb.forEach(e=>{if(!have.has(e.id)){ids.push(e.id);have.add(e.id);}});
      const out=[];
      ids.forEach(id=>{const v=merge(B.get(id),M.get(id),T.get(id),[...p,"#"+id],[...lab,mergeSeg("#"+id,M.get(id)||T.get(id)||B.get(id))]);if(v!==undefined)out.push(v);});
      return out;
    }
    // oba změnili totéž jinak
    const key=JSON.stringify(p);
    if(conflicts.length<MERGE_MAX_CONFLICTS)conflicts.push({key,path:lab.join(" › "),mine:m,theirs:t});
    return picks[key]==="theirs"?t:m;
  };
  const state=merge(base||{},mine||{},theirs||{},[],[]);
  state.v=DATA_VERSION;
  return {state,conflicts,mine:nMine,theirs:nTheirs};
}
/**
 * Zapíše src do target na místě: stejné objekty a pole zůstanou (položky seznamů s id podle id),
 * jen se změní hodnoty. Obsluha formuláře, která drží odkaz na člověka nebo položku, tak dál
 * píše do platných dat.
 */
function mergeInto(target,src){
  if(isPlain(target)&&isPlain(src)){
    Object.keys(target).forEach(k=>{if(!(k in src))delete target[k];});
    Object.keys(src).forEach(k=>{
      const a=target[k],b=src[k];
      if((isPlain(a)&&isPlain(b))||(Array.isArray(a)&&Array.isArray(b)))target[k]=mergeInto(a,b);
      else target[k]=b;
    });
    return target;
  }
  if(Array.isArray(target)&&Array.isArray(src)){
    if(mergeIdArr(src)&&mergeIdArr(target)){
      const old=new Map(target.map(e=>[e.id,e]));
      const next=src.map(e=>old.has(e.id)?mergeInto(old.get(e.id),e):e);
      target.length=0;next.forEach(e=>target.push(e));
    }else{target.length=0;src.forEach(e=>target.push(e));}
    return target;
  }
  return src;
}
/** Krátký text hodnoty do okna střetu. */
function mergeShow(v){
  if(v===undefined||v===null)return "(smazáno)";
  if(typeof v==="string")return v.length>80?v.slice(0,79)+"…":v||"(prázdné)";
  if(typeof v==="number"||typeof v==="boolean")return v===true?"ano":v===false?"ne":String(v);
  if(Array.isArray(v))return v.length+" "+(v.length===1?"položka":v.length>=2&&v.length<=4?"položky":"položek");
  const t=v.name||v.title||v.text||v.note||"";
  return t?String(t).slice(0,80):"změněno";
}

/* Nové stavy zařazení do historie lidí (pro profil a vyhodnocení starších měsíců). */
function applyHist(st,hist){
  hist.forEach(([k,h])=>{
    const e=st.employees[k];if(!e)return;
    e.hist=e.hist||[];
    const last=e.hist[e.hist.length-1];
    if(last&&last.pos===h.pos&&last.lvl===h.lvl&&last.pct===h.pct)return;
    e.hist.push({at:h.at,pos:h.pos,lvl:h.lvl,...(h.pct!=null?{pct:h.pct}:{})});
    if(e.hist.length>HIST_MAX)e.hist=e.hist.slice(-HIST_MAX);
  });
}

/* Zařazení platné k danému okamžiku; před prvním záznamem platí ten první
   (kdo byl zařazen až po importu, hodnotí se i zpětně podle prvního zařazení). */
function levelAt(e,ts){
  const h=e.hist||[];
  if(!h.length)return {pos:e.positionId||null,lvl:e.level||null,pct:null};
  let cur=h[0];
  for(const x of h){if(x.at<=ts)cur=x;else break;}
  return {pos:cur.pos,lvl:cur.lvl,pct:cur.pct!=null?cur.pct:null};
}

/* Dočasně přepne vybrané období (výpočty v core pracují s S.current). */
function withPeriod(id,fn){
  const keep=S.current;
  S.current=id;_prodIdx=null;
  try{return fn();}finally{S.current=keep;_prodIdx=null;}
}
function monthEnd(id){const y=+id.slice(0,4),m=+id.slice(5,7);return new Date(y,m,1).getTime()-1;}
function monthsBetween(from,to){
  const out=[];if(!PERIOD_ID.test(from)||!PERIOD_ID.test(to)||from>to)return out;
  let y=+from.slice(0,4),m=+from.slice(5,7);
  for(let guard=0;guard<600;guard++){
    const id=y+"-"+String(m).padStart(2,"0");out.push(id);
    if(id>=to)break;
    m++;if(m>12){m=1;y++;}
  }
  return out;
}

/* Měsíce, ve kterých má člověk jakýkoli záznam: docházku, výrobu, sankci, úpravu nebo výdej. */
function personMonths(key){
  const ids=new Set();
  Object.values(S.periods).forEach(p=>{if(p.rows[key])ids.add(p.id);});
  Object.entries(S.production).forEach(([id,pp])=>{if(Object.values(pp.names).some(rec=>prodKeyFor(rec.name)===key))ids.add(id);});
  S.sanctions.forEach(s=>{if(s.key===key&&PERIOD_ID.test(s.period))ids.add(s.period);});
  Object.entries(S.adjust).forEach(([id,b])=>{if(PERIOD_ID.test(id)&&b[key])ids.add(id);});
  Object.entries(S.issued||{}).forEach(([id,b])=>{if(PERIOD_ID.test(id)&&b[key])ids.add(id);});
  return [...ids].sort();
}

/* Profil člověka za období od–do (včetně). Úroveň se bere z potvrzeného výdeje, jinak
   z historie zařazení ke konci měsíce; pravidla pozic jsou dnešní. */
function profileData(key,fromId,toId){
  const e=S.employees[key];if(!e)return null;
  const all=personMonths(key);
  const ids=all.filter(id=>(!fromId||id>=fromId)&&(!toId||id<=toId));
  const months=ids.map(id=>withPeriod(id,()=>{
    const p=S.periods[id]||null;
    const iss=issuedOf(key);
    const snap=iss&&iss.pos?{pos:iss.pos,lvl:iss.lvl||null,pct:iss.pct!=null?iss.pct:null,from:"issued"}:{...levelAt(e,monthEnd(id)),from:"hist"};
    /* skupina: procento dovedností z výdeje nebo z historie; bez záznamu dnešní hodnocení */
    const ev=evaluate({...e,positionId:snap.pos,level:snap.lvl,_pct:snap.pct},p);
    const a=ev.att&&ev.att.found?ev.att:null;
    const prod=productionOf(key);
    const days=workedDays(a);
    const perf=perfOf(ev.att,prod);
    let raise=isGroup(ev.pos)?tierOf({...e,positionId:snap.pos},ev,perf,id,false):legacyTier(raiseOf(ev.L,perf));
    /* stupeň prémie potvrzený při výdeji má přednost před výpočtem s dnešním hodnocením */
    if(iss&&iss.tier!=null){const t=isGroup(ev.pos)&&iss.tier?(ev.pos.tiers||[])[iss.tier-1]:null;
      raise={...raise,lvl:iss.tier,pct:iss.raise!=null?iss.raise:(t?+t.raise||0:0),name:iss.tier?(t?t.name:"varianta "+iss.tier):"",fromIssue:true};}
    return {id,label:monthLabel(id),hasAtt:!!a,from:snap.from,perf,raise,tier:raise,kafeOnly:ev.kafeOnly,
      skillPct:ev.L.pct,
      posId:snap.pos,pos:ev.pos?ev.pos.name:(snap.pos?"(smazaná skupina)":""),lvl:ev.L.n,lvlName:ev.L.lv?ev.L.lv.name:"",base:ev.L.base,
      workDays:a?a.workDays:0,wkDays:a?a.wkDays:0,hours:a?n2(a.totalHours):0,capped:a?n2(a.cappedHours):0,fund:a?n2(a.fund):0,
      absence:a?ev.at.gross:0,missing:a?ev.at.missing:0,excused:a?a.excusedDays:0,shortDays:a?a.shortDays:0,codes:a?a.codes:{},
      attDelta:a?ev.at.delta:0,attEff:a?ev.attEff:0,lost:ev.lost,narok:ev.narok,max:ev.max,
      pctSum:ev.pctSum,pen:ev.pen,adj:ev.adj,total:ev.total,kafe:ev.kafe,kafeTh:ev.kafeTh,
      issued:iss?{tabaky:iss.tabaky,kafe:!!iss.kafe,at:iss.at}:null,
      prod:prod?{total:prod.total,days,perDay:days?prod.total/days:null,perHour:a&&a.totalHours?prod.total/a.totalHours:null}:null,
      sanctions:sanFor(key,id).map(s=>({name:s.pct!=null?s.name:(s.reason||"Sankce"),pct:s.pct!=null?s.pct:null,points:s.pct==null?(+s.points||0):null,note:s.note||"",at:s.at,
        wage:!!s.wage,done:s.done?s.done.at:null})),
      cells:a?a.cells.map(c=>({d:c.d.d,dow:c.d.dow,h:c.h,ah:c.ah||0,c:c.c||"",ex:!!c.isEx,wk:!!(c.d.weekend||c.d.hol),hol:c.d.hol||"",ds:c.ds})):null};
  }));
  const sum=f=>months.reduce((x,m)=>x+(+f(m)||0),0);
  const att=months.filter(m=>m.hasAtt);
  const prodMonths=months.filter(m=>m.prod);
  const prodDays=prodMonths.reduce((x,m)=>x+(m.prod.days||0),0);
  const prodTotal=prodMonths.reduce((x,m)=>x+m.prod.total,0);
  const fund=att.reduce((x,m)=>x+m.fund,0);
  const totals={months:months.length,attMonths:att.length,
    workDays:sum(m=>m.workDays),wkDays:sum(m=>m.wkDays),hours:n2(sum(m=>m.hours)),fund:n2(fund),
    attendance:fund>0?att.reduce((x,m)=>x+m.capped,0)/fund:null,
    absence:sum(m=>m.absence),missing:sum(m=>m.missing),excused:sum(m=>m.excused),lost:months.filter(m=>m.lost).length,
    kafe:att.filter(m=>m.kafe).length,tabaky:att.reduce((x,m)=>x+m.total,0),max:att.reduce((x,m)=>x+m.max,0),
    issuedMonths:months.filter(m=>m.issued).length,issuedTab:sum(m=>m.issued?m.issued.tabaky:0),issuedKafe:months.filter(m=>m.issued&&m.issued.kafe).length,
    sanctions:sum(m=>m.sanctions.length),pen:sum(m=>m.pen),adj:sum(m=>m.adj),
    prodTotal,prodDays,perDay:prodDays?prodTotal/prodDays:null,
    /* souhrn za období: normované ÷ strávené minuty a strávený čas ÷ hodiny v práci (jen měsíce s časem) */
    ...(()=>{let nm=0,ns=0,sp=0,hr=0;months.forEach(m=>{if(m.perf.norm!=null){nm+=m.perf.normMin||0;ns+=m.perf.nspent||0;}
      if(m.perf.use!=null){sp+=m.perf.spent||0;hr+=m.hours;}});
      return {normPct:ns>0?round1(nm/ns*100):null,usePct:hr>0?round1(sp/(hr*60)*100):null};})()};
  const endTs=toId?monthEnd(toId):Infinity,startTs=fromId?new Date(+fromId.slice(0,4),+fromId.slice(5,7)-1,1).getTime():-Infinity;
  const hText=h=>lvlText(S,h.pos,h.lvl)+(h.pct!=null?" · dovednosti "+h.pct+" %":"");
  const changes=(e.hist||[]).map((h,i,arr)=>({at:h.at,pos:h.pos,lvl:h.lvl,pct:h.pct,text:hText(h),first:i===0,prev:i?hText(arr[i-1]):null}))
    .filter(h=>h.at<=endTs&&(h.first||h.at>=startTs));
  return {key,e,all,from:fromId||all[0]||null,to:toId||all[all.length-1]||null,months,totals,changes};
}

/* ---------------- matice dovedností ---------------- */
const ILUO=["","◔","◑","◕","●"];
function deptOf(p){return (p&&(p.dept||"").trim())||(p&&p.name)||"Bez oddělení";}
function departments(){const out=[];S.positions.forEach(p=>{const d=deptOf(p);if(!out.includes(d))out.push(d);});return out;}
function skillOf(e,posId){return e.positionId===posId?(e.level||0):((e.skills&&e.skills[posId])||0);}
/* Lidé × pozice oddělení: hlavní pozice podle zařazení, další podle zaučení. dept=null = všechna oddělení. */
function skillMatrix(dept){
  const cols=S.positions.filter(p=>!dept||deptOf(p)===dept);
  const ids=new Set(cols.map(p=>p.id));
  const order=new Map(S.positions.map((p,i)=>[p.id,i]));
  const rows=Object.values(S.employees).filter(e=>!e.excluded&&!isLead(e)&&((e.positionId&&ids.has(e.positionId))||cols.some(p=>skillOf(e,p.id)>0)))
    .map(e=>({e,home:!!(e.positionId&&ids.has(e.positionId)),pos:posOf(e),cells:cols.map(p=>({lvl:skillOf(e,p.id),main:e.positionId===p.id}))}))
    .sort((x,y)=>(y.home-x.home)||((order.get(x.e.positionId)??999)-(order.get(y.e.positionId)??999))||((y.e.level||0)-(x.e.level||0))||norm(x.e.last).localeCompare(norm(y.e.last),"cs"));
  const coverage=cols.map((p,i)=>{const c=[0,0,0,0,0];rows.forEach(r=>{c[r.cells[i].lvl]++;});return {counts:c,ready:c[3]+c[4],trained:c[1]+c[2]+c[3]+c[4]};});
  return {dept,cols,rows,coverage};
}
function sheetName(name,used){
  let n=String(name).replace(/[\[\]:*?\/\\]/g,"-").replace(/\s+/g," ").trim().slice(0,31)||"List";
  let base=n,i=2;while(used.has(n.toLowerCase())){n=(base.slice(0,28)+" "+i++).slice(0,31);}
  used.add(n.toLowerCase());return n;
}
/* Řádek „Vedoucí oddělení“ pro Excel matice (jen když nějaký vedoucí je). */
function leadLine(groups){
  if(!leadPeople().length)return "";
  const deps=[...new Set(groups.map(deptOf))];
  return "Vedoucí oddělení: "+deps.map(d=>d+" – "+(leadsOf(d).map(e=>e.last+" "+e.first).join(", ")||"—")).join("; ");
}
/* Listy pro Excel: matice všech skupin, list za každou skupinu, popis dovedností a kapacita směn. */
function matrixSheets(){
  const used=new Set(),sheets=[];
  const build=(title,m)=>{
    const rows=[[title+" – matice dovedností ("+new Date().toLocaleDateString("cs-CZ")+")"],
      ["","","","",...m.cols.map(c=>c.p.name)],
      ["Příjmení","Jméno","Směna","Skupina","Dovednosti %",...m.cols.map(c=>c.s.name)]];
    rows[1].splice(4,0,"");
    const lead=leadLine(m.cols.map(c=>c.p));
    if(lead)rows.splice(1,0,[lead]);
    m.rows.forEach(r=>rows.push([r.e.last,r.e.first,r.shift?shiftName(r.shift):"",r.pos?r.pos.name:"",r.pct!=null?Math.round(r.pct):"",...r.cells]));
    rows.push([]);
    [...SHIFT_KEYS,""].forEach(k=>{if(m.rows.some(r=>r.shift===k))rows.push(["Úroveň 3–4: "+shiftName(k),"","","","",...m.coverage.map(c=>c.by[k].ready)]);});
    rows.push(["Úroveň 3–4 celkem","","","","",...m.coverage.map(c=>c.ready)]);
    rows.push(["Hodnoceno 1–4 celkem","","","","",...m.coverage.map(c=>c.trained)]);
    if(m.sick)rows.push(["V nemoci: "+m.sick+" (do počtů úrovní se dočasně nepočítají)"]);
    rows.push([]);
    rows.push(["Úrovně: "+STD_SCALE.map((l,i)=>i+" "+l.name).join(" · ")]);
    return rows;
  };
  const all=skillGrid(null,"*");
  sheets.push({name:sheetName("Všechny skupiny",used),rows:build("Všechny skupiny",all),cols:[16,12,18,16,10,...all.cols.map(()=>12)]});
  S.positions.filter(p=>isGroup(p)&&groupSkills(p).length).forEach(p=>{const m=skillGrid(p.id,"*");
    sheets.push({name:sheetName(p.name||"Skupina",used),rows:build(p.name||"Skupina",m),cols:[16,12,18,16,10,...m.cols.map(()=>14)]});});
  /* vedoucí a jejich dovednosti (2.10) */
  const ls=S.leadSkills||[],lp=leadPeople();
  if(ls.length&&lp.length){
    const rows=[["Vedoucí – dovednosti ("+new Date().toLocaleDateString("cs-CZ")+")"],["Příjmení","Jméno","Oddělení","Dovednosti %",...ls.map(x=>x.name)]];
    lp.forEach(e=>rows.push([e.last,e.first,e.lead.join(", "),Math.round(leadPct(e)),...ls.map(x=>rateOf(e,x.id))]));
    rows.push([]);rows.push(["Úrovně: "+STD_SCALE.map((l,i)=>i+" "+l.name).join(" · ")]);
    sheets.push({name:sheetName("Vedoucí",used),rows,cols:[16,12,22,12,...ls.map(()=>14)]});
  }
  const legend=[["Skupina","Dovednost","Popis",...STD_SCALE.map((_,i)=>"Úroveň "+i),"Nutnost"]];
  S.positions.filter(isGroup).forEach(p=>groupSkills(p).forEach(x=>legend.push([p.name,x.name,x.desc||"",...skillScale(x).map(l=>l.name+(l.desc?": "+l.desc:"")),optText(x)])));
  sheets.push({name:sheetName("Popis dovedností",used),rows:legend,cols:[16,24,40,30,30,30,30,30,22]});
  return sheets;
}

/* Profil do Excelu: měsíce, sankce a změny zařazení. */
function profileSheets(pd){
  const e=pd.e,name=e.last+" "+e.first;
  const months=[["Profil: "+name+" · "+(pd.from?monthLabel(pd.from):"")+" – "+(pd.to?monthLabel(pd.to):"")],
    ["Měsíc","Skupina","Dovednosti %","Dny","Víkend. směny","Hodiny","Fond","Absence (dny)","Po vyplnění víkendem","Kafe","Docházka ±","Sankce %","Sankce (tab.)","Ruční úprava","Tabáky (výpočet)","Vydáno tabáků","Vydáno kafe","Vyrobeno ks","Ø ks/den","Docházka %","Plnění normy %","Využití fondu %","Prémie","Navýšení mzdy %"]];
  const pv=v=>v==null?"":v;
  pd.months.forEach(m=>months.push([m.label,m.pos,m.skillPct!=null?m.skillPct:(m.lvl?m.lvl+" · "+m.lvlName:""),m.hasAtt?m.workDays:"",m.hasAtt?m.wkDays:"",m.hasAtt?m.hours:"",m.hasAtt?m.fund:"",
    m.hasAtt?m.absence:"",m.hasAtt?m.missing:"",m.hasAtt?(m.kafe?"ano":"ne"):"",m.hasAtt?m.attDelta:"",m.pctSum||"",m.pen?-m.pen:"",m.adj||"",m.hasAtt?(m.kafeOnly?"jen Kafe":m.total):"",
    m.issued?m.issued.tabaky:"",m.issued?(m.issued.kafe?"ano":"ne"):"",m.prod?Math.round(m.prod.total):"",m.prod&&m.prod.perDay!=null?n2(m.prod.perDay):"",
    pv(m.perf.att),pv(m.perf.norm),pv(m.perf.use),m.raise.lvl?m.raise.name:"",m.raise.pct||""]));
  const t=pd.totals;
  months.push(["CELKEM","","",t.workDays,t.wkDays,t.hours,t.fund,t.absence,t.missing,t.kafe+"×","","",t.pen?-t.pen:"",t.adj||"",t.tabaky,t.issuedTab,t.issuedKafe+"×",Math.round(t.prodTotal),t.perDay!=null?n2(t.perDay):"",
    t.attendance!=null?round1(t.attendance*100):"",pv(t.normPct),pv(t.usePct),"",""]);
  const sans=[["Měsíc","Důvod","Srážka","Poznámka","Zadáno"]];
  pd.months.forEach(m=>m.sanctions.forEach(s=>sans.push([m.label,s.name,s.pct!=null?s.pct+" %"+(s.wage?" ze mzdy":""):"−"+s.points+" tab.",s.note,s.at?new Date(s.at).toLocaleDateString("cs-CZ"):""])));
  const hist=[["Od","Skupina a dovednosti"]];
  pd.changes.forEach(h=>hist.push([h.at?new Date(h.at).toLocaleDateString("cs-CZ"):"od začátku evidence",h.text]));
  return [{name:"Měsíce",rows:months,cols:[14,16,12,6,8,8,8,8,10,6,10,9,10,10,12,12,10,12,10,10,12,12,16,12]},
    {name:"Sankce",rows:sans,cols:[14,30,10,40,12]},{name:"Zařazení",rows:hist,cols:[20,40]}];
}

/* ---------------- pravidla hodnocení (PDF) ----------------
   Obsah dokumentu s pravidly: obecná pravidla a každá pozice s úrovněmi, tabáky,
   navýšením platu a podmínkami. Vykreslení do PDF je v app.js. */
function rulesDoc(){
  const st=S.settings;
  const cut=cutoffDays();
  const general=[
    ["Dovednosti","Každá skupina má své dovednosti hodnocené na stupnici 0–4. Každá úroveň je 25 % (0 = 0 %, 4 = 100 %). Procento skupiny je průměr všech jejích dovedností: když má skupina dvě dovednosti a člověk umí jednu na úrovni 4 a druhou vůbec, má 50 %. Dovednost označená „není nutností“ se do průměru počítá jen čtvrtinovou vahou (nutná na 4 a nepovinná na 0 = 80 %) a u prémie s podmínkou „všechny dovednosti aspoň na úrovni“ se nevyžaduje."],
    ["Tabáky","Tabáky za dovednosti = maximum skupiny × procento dovedností, zaokrouhleno na celé. Docházka je podle pravidel skupiny sníží (srážka za absenci) nebo zvýší (bonus za víkendové směny navíc); případný strop skupiny se nepřekročí. Sankce strhávají "+SAN_PCTS[0]+"–"+SAN_PCTS[SAN_PCTS.length-1]+" % z nároku (po 5 %), každá aspoň jeden tabák; součet 100 % a víc znamená nic. Srážka ze mzdy benefity nekrátí, zpracuje se ve mzdách."],
    ["Absence","Absence je celý pracovní den bez docházky; den s kódem nepřítomnosti (dovolená, nemoc…) je absence i s hodinami u kódu (např. 8 D) a ty hodiny se nepočítají jako odpracované ani do Kafe. Kratší směna absencí není. Každá odpracovaná víkendová nebo sváteční směna vyplní jeden den absence: srážka pak není, ale ani bonus za víkend. Omluvená absence (kódy "+(st.excused||"—")+")"+(st.excusedReducesFund?" snižuje fond hodin.":" se počítá jako absence.")],
    ["Kafe","Kafe dostane, kdo odpracuje aspoň fond hodin měsíce (pracovní dny × "+nf(st.shift)+" h"+(st.friShift&&st.friShift!==st.shift?"; kdo má zkrácený pátek, má v pátek plnou směnu "+nf(st.friShift)+" h":"")+"), pokud pro měsíc není nastaven jiný práh."],
  ];
  if(cut)general.push(["Bez nároku","Od "+cut+" "+dnW(cut)+" absence (po vyplnění víkendem) není nárok na tabáky, Kafe ani prémii."]);
  general.push(["Prémie","Skupina může mít víc variant prémie (např. Prémie a Extra bonus). Každá varianta má zaškrtnuté podmínky: norma, docházka, absence, víkendové směny, bezproblémové kontroly, pracovní morálka, vybrané dovednosti na dané úrovni a další body vedoucího. Variantu dostane, kdo za měsíc splní všechny její podmínky; platí nejvyšší splněná varianta. Pracovní morálka a body, které posuzuje vedoucí, platí jako splněné, dokud je vedoucí u člověka a měsíce neoznačí jako nesplněné. Některé varianty dávají po několika měsících v řadě další nárok (např. 2. platovou třídu)."]);
  general.push(["Ukazatele","Docházka = odpracované hodiny ve všední dny (nejvýš celá směna) z fondu hodin měsíce. Plnění normy = normovaný čas ÷ skutečně strávený čas nad zakázkami podle evidence práce; kdo je rychlejší než norma, má přes 100 %. Využití fondu = čas strávený nad zakázkami ÷ hodiny v práci podle docházky."]);
  const groups=S.positions.filter(isGroup).map(p=>{
    const mt=Math.max(0,+p.maxTab||0);
    return {name:p.name||"(bez názvu)",dept:(p.dept||"").trim(),onlyKafe:!!p.onlyKafe,maxTab:mt,
      steps:[0,1,2,3,4].map(l=>({l,pct:l*25,tab:p.onlyKafe?"—":String(Math.round(mt*l/4+1e-9))})),
      skills:groupSkills(p).map(x=>({name:x.name,desc:x.desc||"",std:!x.scale,opt:!!x.opt,scale:skillScale(x).map((l,i)=>({n:i,name:l.name,desc:l.desc||""}))})),
      rules:p.onlyKafe?["Jen Kafe, bez tabáků."]:[
        "Maximum za dovednosti: "+mt+" "+tabW(mt)+" (všechny dovednosti na úrovni 4)."+(p.max!=null&&p.max!==""?" Strop celkem včetně bonusu: "+p.max+" "+tabW(+p.max)+".":" Bonus za víkendy se přičte navíc."),
        "Srážka za absenci: "+((p.penalty||[]).length?p.penalty.slice().sort((a,b)=>a.at-b.at).map(r=>"od "+r.at+" "+dnW(r.at)+" −"+r.t).join(", "):"žádná")+".",
        "Bonus za víkendy navíc: "+((p.bonus||[]).length?p.bonus.slice().sort((a,b)=>a.at-b.at).map(r=>"od "+r.at+" "+smW(r.at)+" +"+r.t).join(", "):"žádný")+"."].concat(normCutRule(p)?["Srážka ze mzdy za neproduktivitu (plnění normy): "+normCutText(p.normCut)+". Benefity nekrátí."]:[]),
      tiers:(p.tiers||[]).map(t=>({name:t.name,conds:tierConds(t,p),reward:[+t.raise?"navýšení mzdy o "+nf(+t.raise,1)+" %":"",t.reward||""].filter(Boolean).join(", ")||"—",
        streak:t.streak?"Po "+t.streak.months+" měsících v řadě: "+t.streak.label+".":""}))};
  });
  return {title:"Pravidla hodnocení",sub:"Matice dovedností, tabáky, Kafe a prémie podle skupin",date:new Date().toLocaleDateString("cs-CZ"),
    general,groups,std:STD_SCALE.map((l,i)=>({n:i,name:l.name,desc:l.desc})),reasons:(S.sanReasons||[]).slice()};
}

/* ---------------- přeformulování textu (verze 2.5) ----------------
   Před odesláním textu k přeformulování (✦ u příčiny v Top 5) se jména lidí z evidence
   nahradí značkami [osoba N], i ve skloňovaných tvarech (kmen jména + nejvýš 3 písmena
   koncovky). Rozlišují se velká písmena, takže „černý povrch“ zůstane, „Černý“ ne.
   Každý nalezený tvar má svou značku, po návratu se vrátí přesně původní tvar. */
const AI_NAME_VOWEL=/[aáeéěiíoóuúůyý]$/i;
function nameStems(employees){
  const set=new Set();
  Object.values(employees||{}).forEach(e=>[e&&e.first,e&&e.last].forEach(n=>{
    String(n||"").split(/[\s-]+/).forEach(w=>{
      w=w.replace(/[^\p{L}]/gu,"");
      if(w.length<3)return;
      set.add(w.length>=4&&AI_NAME_VOWEL.test(w)?w.slice(0,-1):w);   // Jana → Jan(ě, ou), Nováková → Novákov(é)
    });
  }));
  return [...set].sort((a,b)=>b.length-a.length);
}
/* Víc textů najednou (části případu): značky jsou společné, stejné jméno má všude stejnou. */
function maskNamesMany(texts,employees){
  const src=(texts||[]).map(t=>String(t==null?"":t)),stems=nameStems(employees),map=[];
  if(!stems.length)return {texts:src,map};
  const rx=s=>s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  const re=new RegExp("(^|[^\\p{L}\\p{N}])((?:"+stems.map(rx).join("|")+")\\p{L}{0,3})(?=[^\\p{L}\\p{N}]|$)","gu");
  const byForm=new Map();
  /* čísla značek až za těmi, které v textech už jsou, ať se při návratu nic nepoplete */
  const start=Math.max(0,...src.flatMap(t=>[...t.matchAll(/\[osoba (\d+)\]/g)].map(m=>+m[1])));
  const mark=form=>{if(!byForm.has(form)){const ph="[osoba "+(start+byForm.size+1)+"]";byForm.set(form,ph);map.push([ph,form]);}return byForm.get(form);};
  /* dvakrát: sousední jména („Petr Dvořák“) sdílejí oddělovač, který první průchod spotřebuje */
  const out=src.map(t=>t.replace(re,(m,pre,form)=>pre+mark(form)).replace(re,(m,pre,form)=>pre+mark(form)));
  return {texts:out,map};
}
function maskNames(text,employees){
  const r=maskNamesMany([text],employees);
  return {text:r.texts[0],map:r.map};
}
function unmaskNames(text,map){
  let out=String(text==null?"":text);
  (map||[]).slice().sort((a,b)=>b[0].length-a[0].length).forEach(([ph,form])=>{out=out.split(ph).join(form);});
  return out;
}

