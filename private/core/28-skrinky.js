/* =====================================================================
   SKŘÍŇKY (2.80): soupis skříněk spárovaný s lidmi. Kdo má a kdo nemá skříňku,
   kdo už u nás není (vyřazený, smazaný, „už nepracuje“) a skříňku je třeba vyprázdnit.
   Soupis se poprvé vloží z Excelu (Ctrl+V: A písmeno řady, B číslo, C jméno a příjmení).
   Jména jsou psaná ručně, proto párování snese překlepy, chybějící háčky, prohozené pořadí,
   jen příjmení nebo příjmení s iniciálou. Páruje se jen v prohlížeči, jména nikam neodcházejí.
   ===================================================================== */
const LK_MAX=3000,LK_TXT=120,LK_NOTE=300,LK_RANGE_MAX=500;
const LK_STATES={free:"Volná",used:"Obsazená",unknown:"Nespárovaná",clear:"K vyklizení"};
const LK_HOW={exact:"přesně",surname:"podle příjmení",initial:"příjmení a iniciála",fuzzy:"podobné",manual:"ručně",none:"nejisté"};
function blankLockers(){return {list:[]};}
/** Písmeno (řada) skříňky: velká písmena a číslice bez mezer, nejvýš 6 znaků („a “ → „A“). */
function lkRowNorm(v){return String(v==null?"":v).normalize("NFC").replace(/\s+/g,"").toUpperCase().slice(0,6);}
/** Číslo skříňky: „012“ → „12“, 12.0 → „12“; text (třeba „12a“) zůstane, nejvýš 10 znaků. */
function lkNoNorm(v){
  if(typeof v==="number"&&Number.isFinite(v))return String(Math.round(v));
  const t=String(v==null?"":v).replace(/\s+/g,"").slice(0,10);
  if(/^\d+([.,]0+)?$/.test(t))return String(parseInt(t,10));
  return t.toUpperCase();
}
function lkLabel(l){return [l&&l.row,l&&l.no].filter(Boolean).join(" ")||"?";}
function lkCmp(a,b){
  const r=String(a.row||"").localeCompare(String(b.row||""),"cs");
  if(r)return r;
  const x=parseInt(a.no,10),y=parseInt(b.no,10);
  if(Number.isFinite(x)&&Number.isFinite(y)&&x!==y)return x-y;
  return String(a.no||"").localeCompare(String(b.no||""),"cs",{numeric:true});
}
function lkNewId(){return "lk"+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function lkName(e){return e?[e.last,e.first].filter(Boolean).join(" "):"";}
/** Čištění soupisu: platné id, skříňka podle řady a čísla jen jednou, texty omezené; jméno
    (snímek) se obnoví podle Lidí, ať je vidět i po smazání člověka. */
function cleanLockers(o,emps){
  o=o&&typeof o==="object"?o:{};
  const txt=(v,n)=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,n);
  const ids=new Set(),labels=new Set(),list=[];
  (Array.isArray(o.list)?o.list:[]).forEach(x=>{
    if(!x||typeof x!=="object"||list.length>=LK_MAX)return;
    const row=lkRowNorm(x.row),no=lkNoNorm(x.no);
    if(!no)return;
    const lab=row+"|"+no;
    if(labels.has(lab))return;
    let id=String(x.id||"");
    if(!/^lk[0-9a-z]{4,40}$/.test(id)||ids.has(id))id=lkNewId();
    ids.add(id);labels.add(lab);
    const key=txt(x.key,200),e=key&&emps?emps[key]:null;
    const l={id,row,no,key,name:key?(e?lkName(e):txt(x.name,LK_TXT)):"",gone:key?"":txt(x.gone,LK_TXT),raw:txt(x.raw,LK_TXT),note:txt(x.note,LK_NOTE),
      at:Number.isFinite(+x.at)?+x.at:0,by:txt(x.by,80)};
    list.push(l);
  });
  return {list:list.sort(lkCmp)};
}
/** Stav skříňky: free, used (člověk v Lidech), unknown (jméno z importu bez člověka),
    clear = K vyklizení (vyřazený, není v Lidech, nebo „už u nás nepracuje“). */
function lkState(l,emps,today){
  emps=emps||(S&&S.employees)||{};
  if(l.key){
    const e=emps[l.key];
    if(!e)return {st:"clear",why:"už není v Lidech",e:null};
    if(e.excluded)return {st:"clear",why:"vyřazený ze seznamu",e};
    return {st:"used",e,endPast:e.end&&e.end<(today||todayIso())?e.end:""};
  }
  if(l.gone)return {st:"clear",why:"už u nás nepracuje",e:null};
  if(l.raw)return {st:"unknown",e:null};
  return {st:"free",e:null};
}
/** Souhrn: počty stavů, skříňky po lidech, lidé bez skříňky (nevyřazení), lidé s víc skříňkami. */
function lkOverview(lk,emps,today){
  emps=emps||(S&&S.employees)||{};today=today||todayIso();
  const list=((lk||(S&&S.lockers)||{}).list)||[];
  const out={total:list.length,free:0,used:0,unknown:0,clear:0,rows:[],byKey:new Map(),without:[],multi:[]};
  list.forEach(l=>{
    const s=lkState(l,emps,today);
    out[s.st]++;
    out.rows.push({l,...s});
    if(l.key){if(!out.byKey.has(l.key))out.byKey.set(l.key,[]);out.byKey.get(l.key).push(l);}
  });
  out.without=Object.values(emps).filter(e=>e&&e.key&&!e.excluded&&!out.byKey.has(e.key))
    .sort((a,b)=>lkName(a).localeCompare(lkName(b),"cs"));
  out.multi=[...out.byKey.entries()].filter(([,v])=>v.length>1).map(([k])=>k);
  return out;
}
/** Skříňky člověka (pro detail v Lidech a upozornění při vyřazení). */
function lkOf(key,lk){return key?(((lk||S.lockers||{}).list)||[]).filter(l=>l.key===key):[];}

/* ---------- Vložení z Excelu (Ctrl+V) ---------- */
/** Řádky schránky [[A, B, C], …] → {items[{n, row, no, text}], skipped[{n, why}], dup[štítky], header}. */
function lkParse(rows){
  const out={items:[],skipped:[],dup:[],header:false};
  const seen=new Set();
  const cell=v=>String(v==null?"":(typeof v==="object"&&v.text!=null?v.text:v)).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  (rows||[]).forEach((r,i)=>{
    const a=cell(r[0]),b=cell(r[1]),c=cell(r[2]).slice(0,LK_TXT);
    if(!a&&!b&&!c)return;
    // nadpis: číslo není číslo a v řádku jsou slova jako řada, číslo, jméno
    if(!out.items.length&&!out.skipped.length&&!/\d/.test(b)&&/(rad|pism|skrin|cisl|jmen|prijm|name|locker|osob)/.test(norm(a+" "+b+" "+c))){out.header=true;return;}
    const row=lkRowNorm(a),no=lkNoNorm(b);
    if(!no){out.skipped.push({n:i+1,why:c?"chybí číslo skříňky":"prázdný řádek",text:c});return;}
    const lab=row+"|"+no;
    if(seen.has(lab)){out.dup.push(lkLabel({row,no}));return;}
    seen.add(lab);
    out.items.push({n:i+1,row,no,text:c});
  });
  return out;
}

/* ---------- Párování ručně psaných jmen s Lidmi ----------
   Tokeny bez diakritiky, titulů a interpunkce (endTok). Příjmení se hledá mezi všemi slovy
   (pořadí nevadí), zbytek se porovná se jménem, jedno písmeno = iniciála. Podobnost slov
   podle počtu překlepů (attDist) i po „fonetickém“ srovnání (y/i, w/v, zdvojená písmena).
   Jistě se spáruje jen jednoznačná shoda; ostatní dostanou návrhy k ručnímu výběru. */
function lkPh(t){return t.replace(/y/g,"i").replace(/w/g,"v").replace(/q/g,"k").replace(/(.)\1+/g,"$1");}
function lkSim(a,b){
  if(a===b)return 1;
  const pa=lkPh(a),pb=lkPh(b);
  if(pa===pb)return 0.95;
  const d=Math.min(attDist(a,b),attDist(pa,pb)),L=Math.max(a.length,b.length);
  return L?Math.max(0,1-d/L):0;
}
function lkTokens(s){return endTok(s).filter(t=>!/\d/.test(t)&&(t.length===1||!END_HEAD.has(t)));}   // jedno písmeno je iniciála (i „c“)
/** Skóre jednoho řádku proti člověku: {s 0–1, sur (příjmení), first (jméno, null = v řádku není), init}. */
function lkScore(r,p){
  if(!r.length||!p.L.length)return {s:0};
  // příjmení: každé slovo příjmení si vezme nejlepší slovo řádku
  const usedIx=new Set();
  let surSum=0,surBest=0;
  p.L.forEach(lt=>{
    let best=0,bi=-1;
    r.forEach((t,i)=>{if(usedIx.has(i)||t.length<2)return;const v=lkSim(t,lt);if(v>best){best=v;bi=i;}});
    if(bi>=0&&best>=0.5)usedIx.add(bi);
    surSum+=best;surBest=Math.max(surBest,best);
  });
  const surExact=surBest===1;   // aspoň jedno slovo příjmení přesně (i jen první část dvojitého)
  // u složeného příjmení stačí i jedno slovo (druhé příjmení se často nepíše)
  const sur=Math.max(surSum/p.L.length,p.L.length>1?surBest*0.9:0);
  const rest=r.filter((t,i)=>!usedIx.has(i));
  let first=null,init=false;
  if(rest.length&&p.F.length){
    first=0;
    rest.forEach(t=>p.F.forEach(ft=>{
      if(t.length===1){if(ft[0]===t&&0.9>first){first=0.9;init=true;}}
      else{const v=lkSim(t,ft);if(v>first){first=v;init=false;}}
    }));
  }
  return {s:first==null?sur*0.85:0.6*sur+0.4*first,sur,first,init,surExact};
}
/** rows [{n, text}] → [{key, how, s, cand[klíče]}]. assign = Map n → klíč (ruční výběr má přednost). */
function lkMatch(rows,emps,assign){
  emps=emps||S.employees||{};
  const P=Object.values(emps).filter(e=>e&&e.key).map(e=>({key:e.key,L:endTok(e.last),F:endTok(e.first),excluded:!!e.excluded}));
  const out=rows.map(()=>({key:null,how:"none",s:0,cand:[]}));
  const used=new Set();
  const scored=rows.map((r,i)=>{
    if(assign&&assign.has(r.n)){const k=assign.get(r.n);if(k&&emps[k]){out[i]={key:k,how:"manual",s:1,cand:[]};used.add(k);}return null;}
    const t=lkTokens(r.text);
    if(!t.length)return null;
    const list=P.map(p=>({p,...lkScore(t,p)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
    return {t,list};
  });
  // jisté shody: přesně, jen příjmení (jediné v Lidech), příjmení a iniciála (jediná), překlep (jasně nejlepší)
  const sure=[];
  scored.forEach((x,i)=>{
    if(!x||!x.list.length)return;
    const [a,b]=x.list,next=b?b.s:0;
    let how=null;
    if(a.sur===1&&a.first===1&&next<1)how="exact";
    else if(a.surExact&&a.first==null&&x.t.length===1&&!x.list.slice(1).some(y=>y.surExact))how="surname";
    else if(a.sur===1&&a.init&&!(b&&b.sur===1&&b.init))how="initial";
    else if(a.s>=0.8&&a.s-next>=0.12&&a.sur>=0.8)how="fuzzy";
    if(how)sure.push({i,p:a.p,how,s:a.s});
  });
  // přesná shoda má přednost před překlepem, i když má překlep vyšší skóre (jméno navíc)
  const rank={exact:0,surname:1,initial:1,fuzzy:2};
  sure.sort((a,b)=>(rank[a.how]-rank[b.how])||b.s-a.s).forEach(m=>{
    if(used.has(m.p.key))return;   // stejný člověk podruhé = nejisté (ukáže se jako návrh)
    out[m.i]={key:m.p.key,how:m.how,s:Math.round(m.s*100)/100,cand:[]};used.add(m.p.key);
  });
  // nejisté: návrhy (nejdřív nespárovaní lidé), nejvýš 5
  scored.forEach((x,i)=>{
    if(!x||out[i].key)return;
    const c=x.list.filter(y=>y.s>=0.6&&y.sur>=0.6).sort((a,b)=>(used.has(a.p.key)-used.has(b.p.key))||b.s-a.s).slice(0,5);
    out[i]={key:null,how:"none",s:c.length?Math.round(c[0].s*100)/100:0,cand:c.map(y=>y.p.key)};
  });
  return out;
}

/* ---------- Úpravy soupisu ---------- */
function lkMeta(meta){return {at:(meta&&meta.at)||Date.now(),by:(meta&&meta.by)||""};}
/** Uloží vložený soupis: rows [{row, no, key, gone, raw}]; existující skříňka (řada + číslo) se
    přepíše, nová přibude; s replace se smažou skříňky, které ve vloženém seznamu nejsou. */
function lkApply(st,rows,opts,meta){
  opts=opts||{};const m=lkMeta(meta);
  st.lockers=st.lockers&&Array.isArray(st.lockers.list)?st.lockers:blankLockers();
  const L=st.lockers.list,by=new Map(L.map(l=>[l.row+"|"+l.no,l])),keep=new Set();
  const out={added:0,updated:0,removed:0,used:0,gone:0,unknown:0,free:0};
  (rows||[]).forEach(r=>{
    const row=lkRowNorm(r.row),no=lkNoNorm(r.no);
    if(!no)return;
    const k=row+"|"+no;keep.add(k);
    let l=by.get(k);
    if(!l){if(L.length>=LK_MAX)return;l={id:lkNewId(),row,no,key:"",name:"",gone:"",raw:"",note:"",at:0,by:""};L.push(l);by.set(k,l);out.added++;}
    else out.updated++;
    const e=r.key?(st.employees||{})[r.key]:null;
    l.key=e?r.key:"";l.name=e?lkName(e):"";
    l.gone=e?"":String(r.gone||"").slice(0,LK_TXT);
    l.raw=String(r.raw||"").slice(0,LK_TXT);
    l.at=m.at;l.by=m.by;
    out[l.key?"used":l.gone?"gone":l.raw?"unknown":"free"]++;
  });
  if(opts.replace){const before=L.length;st.lockers.list=L.filter(l=>keep.has(l.row+"|"+l.no));out.removed=before-st.lockers.list.length;}
  st.lockers.list.sort(lkCmp);
  return out;
}
function lkFind(st,id){return ((st.lockers&&st.lockers.list)||[]).find(l=>l.id===id)||null;}
/** Přidělí skříňku člověku (key) nebo ji zapíše jako skříňku člověka, který u nás už nepracuje (gone). */
function lkAssign(st,id,key,meta){
  const l=lkFind(st,id),e=key?(st.employees||{})[key]:null;
  if(!l)return {err:"Skříňka už v soupisu není."};
  if(key&&!e)return {err:"Člověk už v Lidech není."};
  const m=lkMeta(meta);
  l.key=key||"";l.name=e?lkName(e):"";l.gone="";l.raw="";l.at=m.at;l.by=m.by;
  return {l};
}
function lkSetGone(st,id,name,meta){
  const l=lkFind(st,id);if(!l)return {err:"Skříňka už v soupisu není."};
  const m=lkMeta(meta),was=l.key?(lkName((st.employees||{})[l.key])||l.name):"";
  l.gone=String(name||was||l.raw||l.name||"neznámý").slice(0,LK_TXT);l.key="";l.name="";l.raw="";l.at=m.at;l.by=m.by;
  return {l};
}
/** Uvolní skříňku (i po vyklizení): bez člověka, jména i textu z importu. */
function lkFree(st,id,meta){
  const l=lkFind(st,id);if(!l)return {err:"Skříňka už v soupisu není."};
  const m=lkMeta(meta);l.key="";l.name="";l.gone="";l.raw="";l.at=m.at;l.by=m.by;
  return {l};
}
function lkSetNote(st,id,note){const l=lkFind(st,id);if(!l)return {err:"Skříňka už v soupisu není."};l.note=String(note||"").replace(/\s+/g," ").trim().slice(0,LK_NOTE);return {l};}
function lkDelete(st,id){const L=(st.lockers&&st.lockers.list)||[],i=L.findIndex(l=>l.id===id);if(i<0)return false;L.splice(i,1);return true;}
/** Přidá řadu volných skříněk (od–do); existující přeskočí. */
function lkAddRange(st,row,from,to,meta){
  row=lkRowNorm(row);from=parseInt(from,10);to=parseInt(to,10);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<0)return {err:"Zadej čísla od a do."};
  if(to<from)[from,to]=[to,from];
  if(to-from+1>LK_RANGE_MAX)return {err:`Najednou nejvýš ${LK_RANGE_MAX} skříněk.`};
  st.lockers=st.lockers&&Array.isArray(st.lockers.list)?st.lockers:blankLockers();
  const L=st.lockers.list,have=new Set(L.map(l=>l.row+"|"+l.no)),m=lkMeta(meta);
  let added=0,skip=0;
  for(let n=from;n<=to;n++){
    const no=String(n);
    if(have.has(row+"|"+no)){skip++;continue;}
    if(L.length>=LK_MAX)return {err:`Skříněk je nejvýš ${LK_MAX}.`,added,skip};
    L.push({id:lkNewId(),row,no,key:"",name:"",gone:"",raw:"",note:"",at:m.at,by:m.by});added++;
  }
  L.sort(lkCmp);
  return {added,skip};
}
/** Štítky (Zebra 100 × 35 mm, jeden štítek = jedna strana PDF): ke každé skříňce štítek na skříňku
    (jen označení, beze jména) a štítek na záložní klíč (označení a „Záložní klíč“ na polovině,
    druhou polovinou se klíč zalepí). opts {locker, key} vybere druhy; pořadí podle soupisu, po dvojicích. */
function lkLabelSeq(list,opts){
  opts=opts||{};const lo=opts.locker!==false,ke=opts.key!==false,out=[];
  (list||[]).slice().sort(lkCmp).forEach(l=>{const t=lkLabel(l);if(lo)out.push({kind:"locker",text:t,id:l.id});if(ke)out.push({kind:"key",text:t,id:l.id});});
  return out;
}
/** Excel: soupis skříněk a lidé bez skříňky. */
function lkSheets(lk,emps,today,positions){
  const ov=lkOverview(lk,emps,today),pos=positions||(S&&S.positions)||[],gr=e=>{const p=e?pos.find(g=>g.id===e.positionId):null;return p?p.name:"";};
  const who=x=>x.e?lkName(x.e):x.l.gone||x.l.name||x.l.raw||"";
  const rows=[["Skříňka","Řada","Číslo","Pracovník","ID","Skupina","Stav","Upozornění","Z importu","Poznámka"]];
  ov.rows.forEach(x=>{
    rows.push([lkLabel(x.l),x.l.row,x.l.no,who(x),x.e?x.e.wid||"":"",gr(x.e),LK_STATES[x.st],x.st==="clear"?"Je třeba vyprázdnit ("+x.why+")":ov.multi.includes(x.l.key)?"má víc skříněk":"",x.l.raw||"",x.l.note||""]);
  });
  const w=[["Příjmení a jméno","ID","Skupina","Vedoucí"]];
  ov.without.forEach(e=>w.push([lkName(e),e.wid||"",gr(e),isLead(e)?"ano":""]));
  return [{name:"Skříňky",rows},{name:"Bez skříňky",rows:w}];
}
/** Historie změn (kind locker): přidání a smazání skříňky, přidělení, uvolnění, „už nepracuje“, poznámka. */
function lkChanges(A,B,add){
  const a=((A&&A.list)||[]),b=((B&&B.list)||[]),am=new Map(a.map(l=>[l.id,l])),bm=new Set(b.map(l=>l.id));
  const nm=(l,emps)=>l.key?(lkName(emps&&emps[l.key])||l.name||"člověk"):"";
  b.forEach(l=>{
    const o=am.get(l.id),lab=lkLabel(l);
    if(!o){add("locker","Skříňka "+lab+" přidána"+(l.key?": "+(l.name||"člověk"):l.gone?": "+l.gone+" (už u nás nepracuje)":""),{m:"lk:"+l.id+":n",...(l.key?{key:l.key}:{})});return;}
    if(o.key!==l.key||o.gone!==l.gone){
      // přidělení, „už nepracuje“ a uvolnění se v historii neslučují (vyprázdnění musí zůstat vidět)
      const mk="lk:"+l.id+":k:"+(l.key?"p":l.gone?"g":"f");
      if(l.key)add("locker","Skříňka "+lab+" přidělena: "+(l.name||"člověk")+(o.key?" (dřív "+(o.name||"jiný člověk")+")":""),{m:mk,key:l.key});
      else if(l.gone)add("locker","Skříňka "+lab+": "+l.gone+" už u nás nepracuje, je třeba vyprázdnit",{m:mk,...(o.key?{key:o.key}:{})});
      else add("locker","Skříňka "+lab+" uvolněna"+(o.key||o.gone?" ("+(o.name||o.gone)+")":""),{m:mk,...(o.key?{key:o.key}:{})});
    }
    if(o.note!==l.note)add("locker","Skříňka "+lab+": poznámka „"+(l.note||"—")+"“",{m:"lk:"+l.id+":t"});
  });
  a.filter(l=>!bm.has(l.id)).forEach(l=>add("locker","Skříňka "+lkLabel(l)+" smazána"+(l.key?" ("+(l.name||"člověk")+")":""),{m:"lk:"+l.id+":x"}));
}
