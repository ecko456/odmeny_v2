/* ---------- původní zařazení z verze 2.3 ----------
   Při převodu pozic na skupiny si každý člověk ponese snímek původní pozice, úrovně a zaučení.
   Ukazuje se v jeho detailu, dokud ho vedoucí nesmaže tlačítkem „Převedeno do nové verze“. */
function legacyText(l){
  if(!l)return "";
  const main=l.pos?l.pos+(l.level?", úroveň "+l.level+(l.levelName?" ("+l.levelName+")":""):", bez úrovně"):"bez pozice";
  return main+(l.skills&&l.skills.length?"; zaučení: "+l.skills.map(x=>x.pos+" "+x.level+(x.levelName?" ("+x.levelName+")":"")).join(", "):"");
}
function legacyPending(){return Object.values(S.employees).filter(e=>e.legacy).length;}
/* vyřazení ze seznamu: člověk zůstává v evidenci, ale nehodnotí se a nikde se nenabízí;
   vedoucí pracovník se nehodnotí taky (je jen v matici jako vedoucí oddělení) */
function activeRows(){return allRows().filter(r=>!r.e.excluded&&!isLead(r.e));}
function excludedPeople(){return Object.values(S.employees).filter(e=>e.excluded&&!isLead(e))
  .sort((a,b)=>norm(a.last).localeCompare(norm(b.last),"cs"));}

function curPeriod(){return S.current?S.periods[S.current]:null;}
function periodName(p){return p?MONL[p.m-1]+" "+p.y:"bez importu";}

function issueWhat(tab,kafe){return tab+" "+tabW(tab)+(kafe?" + kafe":"");}

function dnW(n){n=Math.abs(n);return n===1?"den":(n>=2&&n<=4)?"dny":"dní";}
function smW(n){n=Math.abs(n);return n===1?"směna":(n>=2&&n<=4)?"směny":"směn";}

/* lidsky čitelné vysvětlení, proč vyšla srážka / bonus za docházku */
function attExplain(r){
  const a=r.att,t=r.at;
  if(!(a&&a.found))return "Bez importované docházky";
  /* "Absence 4 − 3 víkendy = 1": ať je vidět celý počet, ne jen výsledek */
  const calc=t.filled?"absence "+t.gross+" − "+t.filled+" "+(t.filled===1?"víkend":"víkendy")+" = "+t.missing:"absence "+t.gross;
  if(r.lost)return "Bez nároku: "+calc+", hranice je "+r.cut+" — ani tabák, ani kafe";
  if(!r.pos)return "Bez skupiny — pravidla docházky se neuplatní";
  if(t.kind==="pen")return calc+" → pravidlo ≥ "+t.rule.at+": −"+Math.abs(t.delta)+
    (t.wkLeft?"":", bonus ne (víkendy padly na vyplnění)");
  if(t.kind==="bonus")return (t.filled?calc+", ":"bez absence, ")+t.wkLeft+" víkend. "+smW(t.wkLeft)+" navíc → pravidlo ≥ "+t.rule.at+": +"+t.delta+
    (r.capped?", zastropováno na strop "+r.max+" (připsáno +"+Math.max(0,r.attEff)+")":"");
  if(t.missing>0)return calc+" — žádné pravidlo srážky nesedí";
  if(t.filled)return calc+" — vše vyplněno víkendem"+(t.wkLeft?", navíc "+t.wkLeft+" — pod prahem bonusu":"");
  return "Bez absence"+(t.wkLeft?", "+t.wkLeft+" víkend. "+smW(t.wkLeft)+" — pod prahem bonusu":"");
}

function thisMonthId(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");}
function monthLabel(id){const p=String(id||"").split("-");
  return p.length===2&&MONL[+p[1]-1]?MONL[+p[1]-1]+" "+p[0]:(id||"—");}
function nameOf(key){const e=S.employees[key];return e?e.last+" "+e.first:key;}

/* ---------------- export ---------------- */
function exportRows(rows){
  const p=curPeriod();
  /* jedna definice sloupce = hlavička, buňka i to, jestli se sčítá */
  const C=[
    {t:"Příjmení",v:r=>r.e.last},
    {t:"Jméno",v:r=>r.e.first},
    {t:"Skupina",v:r=>r.pos?r.pos.name:""},
    {t:"Směna",v:r=>shiftOf(r.e)?shiftName(shiftOf(r.e)):""},
    {t:"Jen Kafe",v:r=>r.kafeOnly?"ano":""},
    {t:"Dovednosti %",v:r=>r.L.pct!=null?r.L.pct:(r.L.n||"")},
    {t:"Zkrácený pátek",v:r=>r.att&&r.att.fridays?r.att.fridays+"× odpolední":""},
    {t:"Odpracované dny",v:r=>r.att&&r.att.found?r.att.workDays:"",s:1},
    {t:"Hodiny celkem",v:r=>r.att&&r.att.found?n2(r.att.totalHours):"",s:1},
    {t:"Fond hodin",v:r=>r.att&&r.att.found?n2(r.att.fund):""},
    {t:"Kafe práh (h)",v:r=>r.kafeTh!=null?n2(r.kafeTh):""},
    {t:"Kafe",v:r=>r.att&&r.att.found?(r.kafe?"ano":"ne"):""},
    {t:"Víkendové směny",v:r=>r.att&&r.att.found?r.att.wkDays:"",s:1},
    {t:"Absence (dny)",v:r=>r.att&&r.att.found?r.at.gross:"",s:1},
    {t:"Vyplněno víkendem",v:r=>r.att&&r.att.found?r.at.filled:"",s:1},
    {t:"Bez nároku",v:r=>r.lost?"ano":""},
    {t:"Omluvená absence (dny)",v:r=>r.att&&r.att.found?r.att.excusedDays:"",s:1},
    {t:"Tabáky za dovednosti",v:r=>r.L.base,s:1},
    {t:"Docházka ± (podle pravidla)",v:r=>r.at.delta,s:1},
    {t:"Pravidlo docházky",v:r=>attExplain(r)},
    {t:"Maximum (strop)",v:r=>r.pos?r.max:""},
    {t:"Nárok",v:r=>r.narok,s:1},
    {t:"Sankce %",v:r=>r.pctSum||0},
    {t:"Sankce (tabáky)",v:r=>r.pen?-r.pen:0,s:1},
    {t:"Důvody sankcí",v:r=>reasonsOf(r.e.key)},
    {t:"Ruční úprava",v:r=>r.adj,s:1},
    {t:"Tabáky celkem",v:r=>r.total,s:1},
    {t:"Vydáno dne",v:r=>r.issued?new Date(r.issued.at).toLocaleDateString("cs-CZ"):""},
    {t:"Vydáno tabáků",v:r=>r.issued?r.issued.tabaky:"",s:1},
    {t:"Vydáno kafe",v:r=>r.issued?(r.issued.kafe?"ano":"ne"):""},
    {t:"Změna od výdeje",v:r=>r.issuedChanged?"ano":""},
    {t:"Vyrobené kusy",v:r=>r.prod?n2(r.prod.total):"",s:1},
    {t:"Ø kusů na odpracovaný den",v:r=>{const a=avgPerDay(r.prod,r.att);return a==null?"":n2(a);}},
    {t:"Ø kusů na hodinu",v:r=>(r.prod&&r.att&&r.att.totalHours)?n2(r.prod.total/r.att.totalHours):""},
    {t:"Zápisů v evidenci",v:r=>r.prod?r.prod.entries:"",s:1},
    {t:"Strávený čas (h)",v:r=>r.perf&&r.perf.spent!=null?n2(r.perf.spent/60):"",s:1},
    {t:"Norma (h)",v:r=>r.perf&&r.perf.normMin!=null?n2(r.perf.normMin/60):"",s:1},
    {t:"Docházka %",v:r=>r.perf&&r.perf.att!=null?r.perf.att:""},
    {t:"Plnění normy %",v:r=>r.perf&&r.perf.norm!=null?r.perf.norm:""},
    {t:"Využití fondu %",v:r=>r.perf&&r.perf.use!=null?r.perf.use:""},
    {t:"Srážka ze mzdy za neproduktivitu %",v:r=>r.ncut&&r.ncut.pct?r.ncut.pct:""},
    {t:"Srážka za neproduktivitu zpracována",v:r=>r.ncut&&r.ncut.done?new Date(r.ncut.done.at).toLocaleDateString("cs-CZ"):""},
    {t:"Prémie (varianta)",v:r=>r.tier&&r.tier.lvl?r.tier.name:""},
    {t:"Navýšení mzdy %",v:r=>r.tier&&r.tier.pct?r.tier.pct:""},
    {t:"Odměna prémie",v:r=>r.tier&&r.tier.reward?r.tier.reward:""},
    {t:"Série měsíců",v:r=>r.tier&&r.tier.streaks?r.tier.streaks.filter(x=>x.have).map(x=>x.name+": "+x.have+"/"+x.months+(x.ok?" – "+x.label:"")).join("; "):""},
    {t:"Chybí do dalšího stupně",v:r=>r.tier&&r.tier.next?r.tier.next.t.name+": "+r.tier.next.checks.filter(c=>!c.ok).map(c=>c.label+" ("+c.txt+")").join(", "):""}
  ];
  const head=C.map(c=>c.t);
  const body=rows.map(r=>C.map(c=>c.v(r)));
  body.push(C.map((c,i)=>i===0?"CELKEM":i===1?rows.length+" lidí":
    c.s?n2(rows.reduce((x,r)=>x+(+c.v(r)||0),0)):""));
  return {head,body,title:"Hodnoceni "+(p?p.id:"bez-obdobi")};
}

/* ---------------- export a import zařazení ----------------
   Cíl: zařazení na pozice a podkategorie vyplnit jednou a pak jen načítat.
   Soubor jde editovat v Excelu a poslat zpátky - matchuje se na příjmení + jméno. */
function rosterSheets(){
  const people=Object.values(S.employees).sort((a,b)=>norm(a.last).localeCompare(norm(b.last),"cs"));
  const main=[["Příjmení","Jméno","Skupina","Směna","Dovednosti %","Tabáky za dovednosti","Zkrácený pátek","Vyřazen ze seznamu","Poznámka","Oddělení","ID v evidenci práce","Vedoucí oddělení"]];
  people.forEach(e=>{const L=levelOf(e);
    main.push([e.last,e.first,L.pos?L.pos.name:"",shiftOf(e)?shiftName(shiftOf(e)):"",L.pct!=null?L.pct:"",L.pos&&L.pos.onlyKafe?"jen Kafe":L.pos?L.base:"",
      e.shortFri?"ano":"",e.excluded?"ano":"",e.note||"",L.pos?deptOf(L.pos):"",e.wid||"",isLead(e)?(e.lead.join(", ")||"ano"):""]);});
  /* hodnocení: sloupec za každou dovednost „Skupina · Dovednost“, hodnoty 0–4 */
  const cols=S.positions.filter(isGroup).flatMap(p=>groupSkills(p).map(x=>({p,x})));
  const rates=[["Příjmení","Jméno",...cols.map(c=>(c.p.name||"?")+" · "+c.x.name)]];
  people.forEach(e=>rates.push([e.last,e.first,...cols.map(c=>rateOf(e,c.x.id))]));
  const posSheet=[["Skupina","Oddělení","Dovednost","Popis",...STD_SCALE.map((_,i)=>"Úroveň "+i),"Nutnost"]];
  S.positions.filter(isGroup).forEach(p=>groupSkills(p).forEach(x=>posSheet.push([p.name,deptOf(p),x.name,x.desc||"",...skillScale(x).map(l=>l.name+(l.desc?": "+l.desc:"")),optText(x)])));
  const rules=[["Skupina","Typ","Práh","Tabáky / odměna","Význam"]];
  S.positions.forEach(p=>{
    if(isGroup(p))rules.push([p.name,"maximum za dovednosti","",+p.maxTab||0,"všechny dovednosti na úrovni 4 = 100 %, každá úroveň 25 %"+(groupSkills(p).some(x=>x.opt)?"; dovednosti, které nejsou nutností, mají v průměru čtvrtinovou váhu":"")]);
    rules.push([p.name,"strop celkem","",p.max!=null&&p.max!==""?+p.max:"",p.max!=null&&p.max!==""?"vlastní strop":"bez stropu"]);
    (p.penalty||[]).forEach(r=>rules.push([p.name,"srážka",+r.at,-Math.abs(+r.t||0),"chybí aspoň "+r.at+" prac. "+dnW(+r.at)]));
    (p.bonus||[]).forEach(r=>rules.push([p.name,"bonus",+r.at,Math.abs(+r.t||0),"aspoň "+r.at+" víkend. "+smW(+r.at)+" navíc"]));
    const nc=normCutRule(p);
    if(nc)nc.rows.forEach((r,i)=>rules.push([p.name,"srážka ze mzdy za neproduktivitu",+r.max,"−"+r.pct+" % mzdy",(i?"plnění normy nad "+nf(nc.rows[i-1].max,1)+" do ":"plnění normy do ")+nf(r.max,1)+" %"+(nc.from?", od "+monthLabel(nc.from):"")]));
    (p.tiers||[]).forEach(t=>rules.push([p.name,"prémie: "+t.name,"",(+t.raise?"+"+nf(+t.raise,1)+" % mzdy":"")+(t.reward?(+t.raise?", ":"")+t.reward:""),tierConds(t,p).join(", ")+(t.streak?"; "+t.streak.months+" měsíců v řadě: "+t.streak.label:"")]));
  });
  return {main,rates,posSheet,rules};
}
/* Podmínky stupně prémie jako text (Excel, pravidla do PDF); p = skupina (nepovinné dovednosti 2.25). */
function tierConds(t,p){
  const c=[];
  if(+t.minSkill>0)c.push("všechny "+(p&&needSkills(p).length<groupSkills(p).length?"nutné ":"")+"dovednosti aspoň "+t.minSkill);
  (t.skills||[]).forEach(r=>{const f=skillIn(S,r.id);if(f)c.push(f.x.name+" aspoň "+r.lvl);});
  if(t.maxAbs!=null)c.push("absence v pracovní dny nejvýš "+t.maxAbs);
  if(t.minWknd!=null)c.push("víkendové směny aspoň "+t.minWknd);
  PERF_KEYS.forEach(([,label,f])=>{if(t[f]!=null)c.push(label+" aspoň "+nf(+t[f],1)+" %");});
  if(t.maxKt!=null)c.push(ktLabel(+t.maxKt));
  if(t.moral)c.push(MORAL_TEXT);
  (t.manual||[]).forEach(m=>c.push(m.text));
  return c.length?c:["bez podmínek"];
}

/* Import zařazení: první list (Příjmení, Jméno, Skupina, Směna…), volitelně list s hodnocením
   dovedností (sloupce „Skupina · Dovednost“, hodnoty 0–4). Starší soubory se sloupci Pozice
   a Úroveň se načtou taky (úroveň se u skupiny v novém tvaru nepoužije). */
function applyRoster(aoa,rateAoa){
  if(!aoa||!aoa.length)return {err:"Soubor je prázdný."};
  let hr=-1,map={};
  for(let r=0;r<Math.min(aoa.length,15);r++){
    const row=(aoa[r]||[]).map(c=>norm(c));
    const m={};row.forEach((c,i)=>{
      if(c.startsWith("prijmeni"))m.last=i;
      else if(c.startsWith("jmeno"))m.first=i;
      else if(c.startsWith("pozice")||c.startsWith("skupina"))m.pos=i;
      else if(c.startsWith("smena"))m.shift=i;
      else if(c.startsWith("uroven")&&m.lvl==null)m.lvl=i;
      else if(c.startsWith("nazev uroven"))m.lvlName=i;
      else if(c.startsWith("zkraceny patek"))m.fri=i;
      else if(c.startsWith("vyrazen"))m.excl=i;
      else if(c.startsWith("vedouci"))m.lead=i;
      else if(c.startsWith("poznamka"))m.note=i;
      else if(c.startsWith("id v evidenci")||c==="id")m.wid=i;});
    if(m.last!=null&&m.first!=null&&m.pos!=null){hr=r;map=m;break;}
  }
  if(hr<0)return {err:"Nenašel jsem hlavičku se sloupci Příjmení, Jméno, Skupina."};
  const findPos=name=>{const n=norm(name);if(!n)return null;
    let p=S.positions.find(x=>norm(x.name)===n);
    if(!p){p=mkPos(uid("p"),String(name).trim(),[]);S.positions.push(p);}
    return p;};
  const readShift=v=>{const n=norm(v);if(!n)return "";
    const hit=SHIFTS.find(([k,label])=>norm(k)===n||norm(label)===n);if(hit)return hit[0];
    if(n.includes("ranni"))return "R";if(n.includes("odpoledni"))return "O";if(/(skupina|sk\.?)\s*1|^1$/.test(n))return "S1";if(/(skupina|sk\.?)\s*2|^2$/.test(n))return "S2";return "";};
  /* úroveň (stará pozice): číslo 1-4, nebo název úrovně (např. "Profík") */
  const readLevel=(pos,v,vName)=>{
    const t=norm(v);
    if(/^[1-4]$/.test(t))return +t;
    const byName=nm=>{const n=norm(nm);if(!n||!pos)return 0;
      const i=pos.levels.findIndex(l=>norm(l.name)===n);return i>=0?i+1:0;};
    return byName(v)||byName(vName)||0;
  };
  let touched=0,created=0,newPos=S.positions.length,noLvl=0,rated=0;
  for(let r=hr+1;r<aoa.length;r++){
    const row=aoa[r]||[];
    const last=String(row[map.last]==null?"":row[map.last]).trim();
    const first=String(row[map.first]==null?"":row[map.first]).trim();
    if(!last&&!first)continue;
    if(SKIP_NAMES.includes(norm(last))||SKIP_NAMES.includes(norm(first)))continue;
    const key=norm(last)+"|"+norm(first);
    let e=S.employees[key];
    if(!e){e=S.employees[key]={key,first,last,positionId:null,level:null,note:""};created++;}
    const pos=findPos(row[map.pos]);
    e.positionId=pos?pos.id:null;
    if(pos&&!isGroup(pos)&&(map.lvl!=null||map.lvlName!=null)){
      const n=readLevel(pos,map.lvl!=null?row[map.lvl]:null,map.lvlName!=null?row[map.lvlName]:null);
      if(n)e.level=n;else noLvl++;
      if(!e.level)e.level=1;
    }
    const yes=v=>["ano","a","1","x","true","yes","ok"].includes(norm(v));
    if(map.shift!=null){const sh=readShift(row[map.shift]);if(sh)e.shift=sh;else delete e.shift;}
    if(map.fri!=null)e.shortFri=yes(row[map.fri]);
    if(map.excl!=null)e.excluded=yes(row[map.excl]);
    /* Vedoucí oddělení: prázdné = není vedoucí, „ano“ = vedoucí, jinak seznam oddělení (čárkou) */
    if(map.lead!=null){
      const v=String(row[map.lead]==null?"":row[map.lead]).trim();
      if(!v)delete e.lead;
      else{const deps=departments(),list=v.split(/[,;]/).map(x=>deps.find(d=>norm(d)===norm(x))).filter(Boolean);
        e.lead=yes(v)?(isLead(e)?e.lead:[]):[...new Set(list)];delete e.excluded;}
    }
    if(map.note!=null&&row[map.note]!=null)e.note=String(row[map.note]).trim();
    if(map.wid!=null&&row[map.wid]!=null&&String(row[map.wid]).trim())setWid(e.key,row[map.wid]);
    touched++;
  }
  newPos=S.positions.length-newPos;
  if(!touched)return {err:"Pod hlavičkou nebyla žádná jména."};
  /* hodnocení dovedností z druhého listu */
  if(rateAoa&&rateAoa.length){
    const cols=S.positions.filter(isGroup).flatMap(p=>groupSkills(p).map(x=>({key:norm((p.name||"?")+" · "+x.name),id:x.id})));
    const head=(rateAoa[0]||[]).map(c=>norm(c));
    const li=head.findIndex(c=>c.startsWith("prijmeni")),fi=head.findIndex(c=>c.startsWith("jmeno"));
    const hits=head.map(h=>{const c=cols.find(x=>x.key===h);return c?c.id:null;});
    if(li>=0&&fi>=0)for(let r=1;r<rateAoa.length;r++){
      const row=rateAoa[r]||[];
      const e=S.employees[norm(row[li])+"|"+norm(row[fi])];if(!e)continue;
      hits.forEach((id,i)=>{if(!id)return;const v=Math.round(+row[i]);if(!(v>=0&&v<=4)||String(row[i]==null?"":row[i]).trim()==="")return;
        e.rate=e.rate||{};if(v)e.rate[id]=v;else delete e.rate[id];rated++;});
      if(e.rate&&!Object.keys(e.rate).length)delete e.rate;
    }
  }
  return {touched,created,newPos,noLvl,rated};
}

/* ---------------- ID zaměstnanců pro evidenci práce ----------------
   Evidence práce může místo jmen obsahovat ID. Seznam „kdo má jaké ID“ se nahraje v Nastavení
   (nebo se ID zadá u člověka); stejné ID nesmí mít dva lidé. */
function setWid(key,raw){
  const e=S.employees[key];if(!e)return false;
  const v=String(raw==null?"":raw).trim().slice(0,40);
  if(!v){delete e.wid;return true;}
  const other=keyByWid(v);
  if(other&&other!==key)return false;
  e.wid=v;return true;
}
function widSheet(){
  const rows=[["Příjmení","Jméno","Pozice","ID v evidenci práce"]];
  Object.values(S.employees).sort((a,b)=>norm(a.last).localeCompare(norm(b.last),"cs"))
    .forEach(e=>{const p=posOf(e);rows.push([e.last,e.first,p?p.name:"",e.wid||""]);});
  return rows;
}
/* Najde člověka podle „Příjmení“ + „Jméno“, nebo podle celého jména v jednom sloupci (v obou pořadích). */
function keyByName(last,first,full){
  if(last||first){const k=norm(last)+"|"+norm(first);if(S.employees[k])return k;}
  const t=norm(full||[first,last].filter(Boolean).join(" ")).split(" ").filter(Boolean);
  if(t.length<2)return null;
  const a=t.slice(1).join(" ")+"|"+t[0],b=t.slice(0,-1).join(" ")+"|"+t[t.length-1];
  return S.employees[a]?a:S.employees[b]?b:null;
}
function applyWids(aoa){
  if(!aoa||!aoa.length)return {err:"Soubor je prázdný."};
  let hr=-1,m={};
  for(let r=0;r<Math.min(aoa.length,15);r++){
    const row=(aoa[r]||[]).map(c=>norm(c)),x={};
    row.forEach((c,i)=>{
      if(!c)return;
      if(c.startsWith("prijmeni"))x.last=i;
      else if(c==="jmeno"||c==="krestni jmeno")x.first=i;
      else if(/^(jmeno a prijmeni|prijmeni a jmeno|cele jmeno|zamestnanec|pracovnik|jmeno)/.test(c)&&x.full==null)x.full=i;
      else if(x.id==null&&(c==="id"||c.startsWith("id ")||c.includes("osobni cislo")||c.startsWith("os. c")||c.startsWith("cislo")||c.startsWith("kod")))x.id=i;
    });
    if(x.id!=null&&(x.last!=null||x.full!=null)){hr=r;m=x;break;}
  }
  if(hr<0)return {err:"Nenašel jsem hlavičku se jménem (Příjmení a Jméno, nebo Jméno a příjmení) a sloupcem ID."};
  const cell=(row,i)=>i==null||row[i]==null?"":String(row[i]).trim();
  const seen=new Map(),res={set:0,same:0,unknown:[],dup:[],clash:[]};
  const pending=[];
  for(let r=hr+1;r<aoa.length;r++){
    const row=aoa[r]||[];
    const id=cell(row,m.id),last=cell(row,m.last),first=cell(row,m.first),full=cell(row,m.full);
    if(!id)continue;
    const name=full||[last,first].filter(Boolean).join(" ");
    const key=keyByName(last,first,full);
    if(!key){if(name)res.unknown.push(name+" ("+id+")");continue;}
    const w=widKey(id);
    if(seen.has(w)&&seen.get(w)!==key){res.dup.push(id);continue;}
    seen.set(w,key);pending.push([key,id]);
  }
  /* Soubor platí: ID se nejdřív odebere dosavadnímu majiteli (i při prohození dvou lidí), pak se přiřadí.
     Kdo o ID přišel a v souboru nové nedostal, je v přehledu výsledku. */
  const pendingKeys=new Set(pending.map(p=>p[0]));
  pending.forEach(([key,id])=>{const o=keyByWid(id);
    if(o&&o!==key){if(!pendingKeys.has(o))res.clash.push(id+": "+nameOf(o)+" → "+nameOf(key));delete S.employees[o].wid;}});
  pending.forEach(([key,id])=>{const e=S.employees[key];if(e.wid&&widKey(e.wid)===widKey(id)){res.same++;return;}
    if(setWid(key,id))res.set++;else res.dup.push(id);});
  return res;
}

/* ---------------- ukázková data ---------------- */
function rng(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
const DEMO_RAISE=i=>({raise:5*i,minAtt:90,minNorm:[0,85,95,105][i],minUse:[0,70,75,80][i]});
/* ukázkové stupně prémie (id začínají „tdemo“, po smazání ukázky zmizí) */
const DEMO_TIERS=()=>[
  {id:"tdemo1",name:"Prémie",minSkill:3,skills:[],raise:20,reward:"",maxAbs:3,minWknd:2,minAtt:null,minNorm:80,minUse:null,maxKt:null,moral:true,
    manual:[],streak:null},
  {id:"tdemo2",name:"Extra bonus",minSkill:4,skills:[],raise:30,reward:"",maxAbs:1,minWknd:3,minAtt:null,minNorm:95,minUse:null,maxKt:0,moral:true,
    manual:[],streak:{months:4,label:"možnost získat 2. platovou třídu"}}];
/* Po ukázce zůstávají pozice, ale ukázkové navýšení platu ne (vlastní úpravy ano). */
function dropDemoRaise(positions){
  /* ukázkové stupně prémie zmizí, upravené během ukázky zůstanou */
  const sig=t=>JSON.stringify([t.name,+t.minSkill||0,+t.raise||0,t.reward||"",t.maxAbs,t.minWknd,t.minAtt,t.minNorm,t.minUse,
    (t.manual||[]).map(m=>m.text),t.streak?[t.streak.months,t.streak.label]:null,(t.skills||[]).length,t.maxKt??null,!!t.moral]);
  const demo=new Set(DEMO_TIERS().map(sig));
  (positions||[]).forEach(p=>{if(Array.isArray(p.tiers))p.tiers=p.tiers.filter(t=>!(String(t.id).startsWith("tdemo")&&demo.has(sig(t))));});
  (positions||[]).forEach(p=>p.levels.forEach((lv,i)=>{
    if(!i)return;const d=DEMO_RAISE(i);
    if(Object.keys(d).every(k=>lv[k]===d[k])){lv.raise=0;lv.minAtt=null;lv.minNorm=null;lv.minUse=null;}
  }));
}
function demoData(){
  const st=blank();st.demo=true;
  const now=new Date(),pm=new Date(now.getFullYear(),now.getMonth()-1,1);
  const Y=pm.getFullYear(),M=pm.getMonth()+1;
  const dim=new Date(Date.UTC(Y,M,0)).getUTCDate();
  const days=[];for(let d=1;d<=dim;d++)days.push(mkDay(Y,M,d));
  const people=[
    ["Petr","Dvořák","p_cnc",4,0,4],["Jana","Svobodová","p_kon",3,1,2],["Martin","Novák","p_cnc",2,2,1],
    ["Lukáš","Procházka","p_bru",3,0,3],["Eva","Kučerová","p_lep",2,1,0],["Tomáš","Veselý","p_dai",4,0,2],
    ["Marie","Horáková","p_pis",1,3,0],["Jiří","Černý","p_dai",2,1,1]
  ];
  const rows={},codes={};
  people.forEach((p,i)=>{
    const [first,last,posId,lvl,miss,wk]=p;
    const sf=last==="Svobodová";            // ukázka zkráceného pátku
    const r=rng(i*7919+Y*31+M);
    const h=[],c=[];let left=miss,sat=wk;
    days.forEach(d=>{
      if(d.work){
        if(left>0&&r()<0.28){left--;h.push(0);c.push("D");codes.D=(codes.D||0)+1;}
        else if(sf&&d.dow===5){h.push(6.5);c.push(null);}
        else{const x=r();h.push(x<0.06?6:x>0.93?9:7.5);c.push(null);}
      }else if(d.sat&&sat>0){sat--;h.push(r()<0.4?6:7.5);c.push(null);}
      else{h.push(0);c.push(null);}
    });
    const key=norm(last)+"|"+norm(first);
    rows[key]={first,last,h,c};
    /* hodnocení dovedností kolem úrovně člověka, směny na střídačku */
    const g=st.positions.find(x=>x.id===posId),rate={};
    groupSkills(g).forEach((x,j)=>{const v=clamp(lvl+[0,0,-1,1,0,-1][(i+j)%6],0,4);if(v)rate[x.id]=v;});
    st.employees[key]={key,first,last,positionId:posId,level:lvl,shortFri:sf,note:"",rate,shift:["R","S1","S2"][i%3]};
  });
  const id=Y+"-"+String(M).padStart(2,"0");
  /* evidence práce - jeden zápis denně, u Veselého schválně s překlepem v příjmení,
     aby bylo na čem ukázat ruční spárování */
  const names={};
  people.forEach((p,i)=>{
    const first=p[0], last=p[1];
    const shown=(last==="Veselý"?"Veselí":last);
    const r=rng(i*104729+Y+M), base=[38,26,44,31,52,29,61,35][i%8];
    const key=norm(first+" "+shown);
    const rec={name:first+" "+shown,total:0,count:0,days:{},spent:0,norm:0,nspent:0};
    const row=rows[norm(last)+"|"+norm(first)];
    /* strávený čas nad zakázkami a norma v minutách: každý jinak rychlý a jinak vytížený */
    const speed=[1.08,0.93,0.86,1.02,0.97,1.12,0.8,0.95][i%8],busy=[0.9,0.84,0.72,0.88,0.8,0.93,0.66,0.78][i%8];
    days.forEach((d,j)=>{
      if(!row||!(row.h[j]>0))return;
      const ks=Math.max(1,Math.round(base*(0.72+r()*0.56)*(row.h[j]/7.5)));
      const spent=Math.round(row.h[j]*60*busy*(0.94+r()*0.12));
      rec.days[d.iso]=ks;rec.total+=ks;rec.count++;
      rec.spent+=spent;rec.nspent+=spent;rec.norm+=Math.round(spent*speed*(0.95+r()*0.1));
    });
    if(rec.count)names[key]=rec;
  });
  st.production={};
  st.production[id]={id,names,file:"ukázka-evidence-prace.xlsx",at:Date.now(),time:true,
    records:Object.values(names).reduce((x,r)=>x+r.count,0),
    total:Object.values(names).reduce((x,r)=>x+r.total,0)};
  /* stupně prémie u každé skupiny (ukázka) */
  st.positions.forEach(p=>{p.tiers=DEMO_TIERS().map(t=>({...t,id:t.id+p.id.replace(/[^a-z0-9]/gi,""),
    manual:t.manual.map(m=>({...m,id:m.id+p.id.replace(/[^a-z0-9]/gi,"")}))}));});
  const sk=(last,first,name,pctV,note)=>({id:uid("x"),key:norm(last)+"|"+norm(first),period:id,name,pct:pctV,note,at:Date.now()});
  st.sanctions=[
    sk("Dvořák","Petr","Zničení dílů",30,"2 ks hřídele, špatné upnutí"),
    sk("Novák","Martin","Nedodržování stanovených přestávek",10,""),
    sk("Kučerová","Eva","Nedodržení BOZP",50,"bez brýlí u brusky"),
    sk("Kučerová","Eva","Zničení dílů",50,"")
  ];
  st.periods[id]={id,y:Y,m:M,days:days.map(d=>d.iso),rows,codes,file:"ukázka-dochazka.xlsx",at:Date.now(),headerRow:1};
  st.current=id;
  /* výdej dopočítá init() z opravdového hodnocení; Dvořákovi "vydáme" o 2 víc, jako by to bylo před sankcí */
  st._demoIssue=[["prochazka|lukas",0],["dvorak|petr",2]];
  return st;
}

