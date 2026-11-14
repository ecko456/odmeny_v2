/* =====================================================================
   SKŘÍŇKY (2.80): soupis skříněk spárovaný s lidmi. Kdo má a kdo nemá skříňku,
   kdo už u nás není (vyřazený, smazaný, „už nepracuje“) a skříňku je třeba vyprázdnit.
   Soupis se poprvé vloží z Excelu (Ctrl+V: A písmeno řady, B číslo, C jméno a příjmení).
   Jména jsou psaná ručně, proto párování snese překlepy, chybějící háčky, prohozené pořadí,
   jen příjmení nebo příjmení s iniciálou. Páruje se jen v prohlížeči, jména nikam neodcházejí.
   ===================================================================== */
const LK_MAX=3000,LK_TXT=120,LK_NOTE=300,LK_RANGE_MAX=500,LK_NOTICE_DAYS=7,LK_MORE_MAX=9;
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
/** Lidé ve skříňce (2.82): hlavní (key) a další (more [{key, name}], sdílená skříňka). */
function lkKeys(l){return l?[l.key,...((l.more||[]).map(m=>m.key))].filter(Boolean):[];}
function lkHas(l,key){return !!key&&lkKeys(l).includes(key);}
/** Číslo klíče (2.83): poslední znaky sériového čísla klíče, jen písmena a číslice, nejvýš 6 (zbytek zleva pryč). */
function lkSerialNorm(v){return String(v==null?"":v).normalize("NFC").toUpperCase().replace(/[^0-9A-Z]/g,"").slice(-6);}
/** Skříňka podle zápisu „A 12“, „a12“, „A-12“, „12“ (bez písmene jen když je to číslo jednoznačné). */
function lkByLabel(lk,text){
  const list=((lk||(S&&S.lockers)||{}).list)||[];
  const t=String(text==null?"":text).toUpperCase().replace(/[\s\-_.\/]+/g,"");
  const m=/^([A-Z]*)(\d+[A-Z]?)$/.exec(t);
  if(!m)return null;
  const no=lkNoNorm(m[2]);
  const hit=list.filter(l=>l.no===no&&(m[1]?l.row===m[1]:true));
  return m[1]?hit[0]||null:hit.length===1?hit[0]:list.find(l=>!l.row&&l.no===no)||null;
}
/** Skříňky s číslem klíče: stejné, nebo končící na zadaná čísla (z 1234 stačí napsat 234). */
function lkBySerial(lk,q,skipId){
  q=lkSerialNorm(q);
  if(!q)return [];
  return (((lk||(S&&S.lockers)||{}).list)||[]).filter(l=>l.serial&&l.id!==skipId&&(l.serial===q||l.serial.endsWith(q)||q.endsWith(l.serial)));
}
/** Zapíše číslo klíče (prázdné smaže); vrátí i skříňky se stejným číslem. */
function lkSetSerial(st,id,serial){
  const l=lkFind(st,id);if(!l)return {err:"Skříňka už v soupisu není."};
  const v=lkSerialNorm(serial);
  if(v)l.serial=v;else delete l.serial;
  return {l,dup:v?lkBySerial(st.lockers,v,id).filter(x=>x.serial===v):[]};
}
function lkNameIn(l,k){return k===l.key?l.name:((l.more||[]).find(x=>x.key===k)||{}).name||"";}
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
    let key=txt(x.key,200),pname=x.name;
    // další lidé (2.82): bez opakování, bez hlavního, nejvýš LK_MORE_MAX; bez hlavního se první povýší
    let more=(Array.isArray(x.more)?x.more:[]).map(m=>m&&typeof m==="object"?{key:txt(m.key,200),name:txt(m.name,LK_TXT)}:null).filter(m=>m&&m.key);
    if(!key&&more.length&&!txt(x.gone,LK_TXT)){const f=more.shift();key=f.key;pname=f.name;}
    const seen=new Set([key]);
    more=key?more.filter(m=>!seen.has(m.key)&&seen.add(m.key)).slice(0,LK_MORE_MAX).map(m=>({key:m.key,name:emps&&emps[m.key]?lkName(emps[m.key]):m.name})):[];
    const e=key&&emps?emps[key]:null;
    const l={id,row,no,key,name:key?(e?lkName(e):txt(pname,LK_TXT)):"",gone:key?"":txt(x.gone,LK_TXT),raw:txt(x.raw,LK_TXT),note:txt(x.note,LK_NOTE),
      at:Number.isFinite(+x.at)?+x.at:0,by:txt(x.by,80)};
    if(more.length)l.more=more;
    if(x.nokey===true)l.nokey=true;   // 2.82: skříňka nemá záložní klíč (štítek klíče se netiskne)
    const ser=lkSerialNorm(x.serial);
    if(ser)l.serial=ser;              // 2.83: poslední čísla sériového čísla klíče
    const n=lkCleanNotice(x.notice);
    if(n)l.notice=n;
    list.push(l);
  });
  return {list:list.sort(lkCmp)};
}
/* ---------- Výzva k vyklizení (2.81) ----------
   Štítek na skříňku K vyklizení: vyvěšeno (datum) a lhůta 7 pracovních dnů (bez víkendů a svátků),
   do které se má uživatel skříňky nahlásit. Výzva se uloží ke skříňce (notice {at, until, by}), opakovaný
   tisk drží stejnou lhůtu; přidělením nebo uvolněním skříňky výzva zmizí. */
function lkIso(v){return typeof v==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:"";}
function lkCleanNotice(n){
  if(!n||typeof n!=="object")return null;
  const at=lkIso(n.at),until=lkIso(n.until);
  return at&&until&&until>=at?{at,until,by:String(n.by==null?"":n.by).replace(/\s+/g," ").trim().slice(0,80)}:null;
}
/** Datum o n pracovních dnů později (víkendy a státní svátky se nepočítají). */
function lkWorkDaysAdd(iso,n){
  let d=iso,left=n;
  while(left>0){d=addDays(d,1);const w=new Date(utcOf(d)).getUTCDay();if(w!==0&&w!==6&&!calHoliday(d))left--;}
  return d;
}
/** Vyvěsí výzvu (nebo vrátí tu, která už visí). Jen u skříňky K vyklizení. */
function lkSetNotice(st,id,today,meta){
  const l=lkFind(st,id);if(!l)return {err:"Skříňka už v soupisu není."};
  if(lkState(l,st.employees||{},today).st!=="clear")return {err:`Skříňka ${lkLabel(l)} není K vyklizení.`};
  if(l.notice)return {l,n:l.notice,fresh:false};
  l.notice={at:today,until:lkWorkDaysAdd(today,LK_NOTICE_DAYS),by:(meta&&meta.by)||""};
  return {l,n:l.notice,fresh:true};
}
/** Texty štítku s výzvou (co nejkratší: kdo, do kdy, co bude potom). */
function lkNoticeLines(l,n){
  return {title:"VÝZVA K VYKLIZENÍ",label:"SKŘÍŇKA "+lkLabel(l),
    ask:"Používáte tuto skříňku? Nahlaste se u vedoucího nejpozději",
    until:"do "+dayText(n.until)+" ("+LK_NOTICE_DAYS+" pracovních dnů).",
    then:"Poté bude skříňka komisionálně otevřena a vyklizena.",
    at:"Vyvěšeno "+dayText(n.at)};
}

/** Stav skříňky: free, used (člověk v Lidech), unknown (jméno z importu bez člověka),
    clear = K vyklizení (vyřazený, není v Lidech, nebo „už u nás nepracuje“). */
function lkState(l,emps,today){
  emps=emps||(S&&S.employees)||{};
  const keys=lkKeys(l);
  if(keys.length){
    // sdílená skříňka (2.82): K vyklizení, až když v ní nezůstane nikdo aktivní; kdo odešel, je „odebrat“
    const people=keys.map(k=>{const e=emps[k]||null;return {key:k,e,name:e?lkName(e):lkNameIn(l,k)||"člověk",why:!e?"už není v Lidech":e.excluded?"vyřazený ze seznamu":""};});
    const act=people.filter(p=>!p.why);
    if(!act.length)return lkClearOut({st:"clear",why:people.length>1?"nikdo z nich už není v seznamu":people[0].why,e:people[0].e,people,leaving:[]},l,today);
    const e=act[0].e;
    return {st:"used",e,people,leaving:people.filter(p=>p.why),endPast:e.end&&e.end<(today||todayIso())?e.end:""};
  }
  if(l.gone)return lkClearOut({st:"clear",why:"už u nás nepracuje",e:null},l,today);
  if(l.raw)return {st:"unknown",e:null};
  return {st:"free",e:null};
}
function lkClearOut(o,l,today){if(l.notice){o.notice=l.notice;o.noticeLate=(today||todayIso())>l.notice.until;}return o;}
/** Souhrn: počty stavů, skříňky po lidech, lidé bez skříňky (nevyřazení), lidé s víc skříňkami. */
function lkOverview(lk,emps,today){
  emps=emps||(S&&S.employees)||{};today=today||todayIso();
  const list=((lk||(S&&S.lockers)||{}).list)||[];
  const out={total:list.length,free:0,used:0,unknown:0,clear:0,leave:0,nokey:0,shared:0,serial:0,serialDup:new Map(),rows:[],byKey:new Map(),without:[],multi:[]};
  list.forEach(l=>{
    const s=lkState(l,emps,today);
    out[s.st]++;
    if(s.leaving&&s.leaving.length)out.leave++;
    if(l.nokey)out.nokey++;
    if(lkKeys(l).length>1)out.shared++;
    if(l.serial){out.serial++;out.serialDup.set(l.serial,[...(out.serialDup.get(l.serial)||[]),l]);}
    out.rows.push({l,...s});
    lkKeys(l).forEach(k=>{if(!out.byKey.has(k))out.byKey.set(k,[]);out.byKey.get(k).push(l);});
  });
  out.without=Object.values(emps).filter(e=>e&&e.key&&!e.excluded&&!out.byKey.has(e.key))
    .sort((a,b)=>lkName(a).localeCompare(lkName(b),"cs"));
  out.multi=[...out.byKey.entries()].filter(([,v])=>v.length>1).map(([k])=>k);
  [...out.serialDup.keys()].forEach(k=>{if(out.serialDup.get(k).length<2)out.serialDup.delete(k);});
  return out;
}
/** Skříňky člověka (pro detail v Lidech a upozornění při vyřazení). */
function lkOf(key,lk){return key?(((lk||S.lockers||{}).list)||[]).filter(l=>lkHas(l,key)):[];}

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
    const e=r.key?(st.employees||{})[r.key]:null,was=l.key+"|"+l.gone,oldKey=l.key;
    l.key=e?r.key:"";l.name=e?lkName(e):"";
    if(l.more&&(l.key!==oldKey||!l.key))delete l.more;
    l.gone=e?"":String(r.gone||"").slice(0,LK_TXT);
    if(was!==l.key+"|"+l.gone)delete l.notice;
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
  l.key=key||"";l.name=e?lkName(e):"";l.gone="";l.raw="";l.at=m.at;l.by=m.by;delete l.notice;
  // další lidé zůstanou (jen ne nový hlavní dvakrát); bez člověka skříňka nikomu nepatří
  if(l.more)l.more=key?l.more.filter(x=>x.key!==key):[];
  if(l.more&&!l.more.length)delete l.more;
  return {l};
}
/** Sdílená skříňka (2.82): přidá dalšího člověka (u volné skříňky se stane hlavním). */
function lkAddPerson(st,id,key,meta){
  const l=lkFind(st,id),e=key?(st.employees||{})[key]:null;
  if(!l)return {err:"Skříňka už v soupisu není."};
  if(!e)return {err:"Člověk už v Lidech není."};
  if(lkHas(l,key))return {err:`${lkName(e)} už ve skříňce ${lkLabel(l)} je.`};
  if(!l.key){const r=lkAssign(st,id,key,meta);return r;}
  if((l.more||[]).length>=LK_MORE_MAX)return {err:`Ve skříňce může být nejvýš ${LK_MORE_MAX+1} lidí.`};
  const m=lkMeta(meta);
  l.more=[...(l.more||[]),{key,name:lkName(e)}];l.at=m.at;l.by=m.by;delete l.notice;
  return {l};
}
/** Odebere člověka ze skříňky; za hlavního nastoupí první další, poslední odebraný skříňku uvolní. */
function lkRemovePerson(st,id,key,meta){
  const l=lkFind(st,id);if(!l)return {err:"Skříňka už v soupisu není."};
  if(!lkHas(l,key))return {err:"Ten člověk ve skříňce není."};
  const m=lkMeta(meta);
  if(l.key===key){const nx=(l.more||[]).shift();l.key=nx?nx.key:"";l.name=nx?nx.name:"";if(!nx){l.raw="";delete l.notice;}}
  else l.more=(l.more||[]).filter(x=>x.key!==key);
  if(l.more&&!l.more.length)delete l.more;
  l.at=m.at;l.by=m.by;
  return {l};
}
/** Není záložní klíč (2.82): štítek na záložní klíč se pro skříňku netiskne. */
function lkSetNoKey(st,id,on){const l=lkFind(st,id);if(!l)return {err:"Skříňka už v soupisu není."};if(on)l.nokey=true;else delete l.nokey;return {l};}
function lkSetGone(st,id,name,meta){
  const l=lkFind(st,id);if(!l)return {err:"Skříňka už v soupisu není."};
  const m=lkMeta(meta),was=l.key?(lkName((st.employees||{})[l.key])||l.name):"";
  l.gone=String(name||was||l.raw||l.name||"neznámý").slice(0,LK_TXT);l.key="";l.name="";l.raw="";l.at=m.at;l.by=m.by;delete l.more;
  return {l};
}
/** Uvolní skříňku (i po vyklizení): bez člověka, jména i textu z importu. */
function lkFree(st,id,meta){
  const l=lkFind(st,id);if(!l)return {err:"Skříňka už v soupisu není."};
  const m=lkMeta(meta);l.key="";l.name="";l.gone="";l.raw="";l.at=m.at;l.by=m.by;delete l.notice;delete l.more;
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
  (list||[]).slice().sort(lkCmp).forEach(l=>{const t=lkLabel(l);if(lo)out.push({kind:"locker",text:t,id:l.id});if(ke&&!l.nokey)out.push({kind:"key",text:t,id:l.id});});
  return out;
}
/* ---------- ZPL pro Zebru (2.81) ----------
   Tiskárna 203 dpi (8 bodů na mm): štítek 100 × 35 mm = 800 × 280 bodů. Obsah štítku je obrázek (^GFA),
   takže čeština i písmo jsou stejné jako v PDF; velikost, počátek a počet kopií nese sám ZPL
   (^PW800^LL280^LH0,0 … ^PQ1), v tisku se nic nenastavuje. */
const LK_DOTS=8,LK_ZW=800,LK_ZH=280;
/** Počet opakování v kompresi ZPL: G–Y = 1–19, g–z = 20–400 (násobky 20). */
function lkZplCount(n){
  let out="";
  while(n>400){out+="z";n-=400;}
  if(n>=20){out+="ghijklmnopqrstuvwxyz"[Math.floor(n/20)-1];n%=20;}
  if(n>0)out+="GHIJKLMNOPQRSTUVWXY"[n-1];
  return out;
}
/** Bitmapa (bity po řádcích, 1 = černá; bits[y*w+x]) → ^GFA s kompresí ZPL (opakování, „,“ zbytek nul,
    „!“ zbytek jedniček, „:“ stejný řádek jako předchozí). */
function lkZplGfa(bits,w,h){
  const bpr=Math.ceil(w/8),total=bpr*h;
  let data="",prev=null;
  for(let y=0;y<h;y++){
    let hex="";
    for(let b=0;b<bpr;b++){
      let v=0;
      for(let i=0;i<8;i++){const x=b*8+i;if(x<w&&bits[y*w+x])v|=128>>i;}
      hex+=(v<16?"0":"")+v.toString(16).toUpperCase();
    }
    if(hex===prev){data+=":";continue;}
    prev=hex;
    let row=hex,tail="";
    const z=/0+$/.exec(row),f=/F+$/.exec(row);
    if(z&&z[0].length>2){row=row.slice(0,z.index);tail=",";}
    else if(f&&f[0].length>2){row=row.slice(0,f.index);tail="!";}
    let enc="";
    for(let i=0;i<row.length;){
      let j=i;while(j<row.length&&row[j]===row[i])j++;
      const n=j-i;enc+=(n>1?lkZplCount(n):"")+row[i];i=j;
    }
    data+=enc+tail;
  }
  return "^GFA,"+total+","+total+","+bpr+","+data;
}
/** Celý štítek: ^XA^PW800^LL280^LH0,0^FO0,0^GFA…^FS^PQ1^XZ. */
function lkZplLabel(bits){return "^XA^PW"+LK_ZW+"^LL"+LK_ZH+"^LH0,0^FO0,0"+lkZplGfa(bits,LK_ZW,LK_ZH)+"^FS^PQ1^XZ";}

/** Excel: soupis skříněk a lidé bez skříňky. */
function lkSheets(lk,emps,today,positions){
  const ov=lkOverview(lk,emps,today),pos=positions||(S&&S.positions)||[],gr=e=>{const p=e?pos.find(g=>g.id===e.positionId):null;return p?p.name:"";};
  const who=x=>x.people?x.people.map(p=>p.name).join("; "):x.l.gone||x.l.name||x.l.raw||"";
  const ids=x=>x.people?x.people.map(p=>p.e&&p.e.wid).filter(Boolean).join("; "):"";
  const warn=x=>x.st==="clear"?"Je třeba vyprázdnit ("+x.why+")"+(x.notice?(x.noticeLate?", lhůta výzvy uplynula "+dayText(x.notice.until):", výzva do "+dayText(x.notice.until)):"")
    :[...(x.leaving||[]).map(p=>"odebrat "+p.name+" ("+p.why+")"),...(x.people||[]).filter(p=>ov.multi.includes(p.key)).map(p=>p.name+" má víc skříněk")].join("; ");
  const rows=[["Skříňka","Řada","Číslo","Pracovník","ID","Skupina","Stav","Upozornění","Záložní klíč","Číslo klíče","Z importu","Poznámka"]];
  ov.rows.forEach(x=>{
    const dup=x.l.serial&&ov.serialDup.has(x.l.serial)?ov.serialDup.get(x.l.serial).filter(o=>o!==x.l).map(lkLabel):[];
    rows.push([lkLabel(x.l),x.l.row,x.l.no,who(x),ids(x),gr(x.e),LK_STATES[x.st],[warn(x),dup.length?"stejné číslo klíče jako "+dup.join(", "):""].filter(Boolean).join("; "),x.l.nokey?"není":"ano",x.l.serial||"",x.l.raw||"",x.l.note||""]);
  });
  const w=[["Příjmení a jméno","ID","Skupina","Vedoucí"]];
  ov.without.forEach(e=>w.push([lkName(e),e.wid||"",gr(e),isLead(e)?"ano":""]));
  return [{name:"Skříňky",rows},{name:"Bez skříňky",rows:w}];
}
/** Historie změn (kind locker): přidání a smazání skříňky, přidělení, uvolnění, „už nepracuje“, další lidé
    (2.82), záložní klíč (2.82), výzva, poznámka. */
function lkChanges(A,B,add){
  const a=((A&&A.list)||[]),b=((B&&B.list)||[]),am=new Map(a.map(l=>[l.id,l])),bm=new Set(b.map(l=>l.id));
  const names=l=>lkKeys(l).map(k=>lkNameIn(l,k)||"člověk").join(", ");
  b.forEach(l=>{
    const o=am.get(l.id),lab=lkLabel(l);
    if(!o){add("locker","Skříňka "+lab+" přidána"+(l.key?": "+names(l):l.gone?": "+l.gone+" (už u nás nepracuje)":""),{m:"lk:"+l.id+":n",...(l.key?{key:l.key}:{})});return;}
    const oK=lkKeys(o),nK=lkKeys(l);
    if(oK.join("|")!==nK.join("|")||o.gone!==l.gone){
      if(oK.length&&nK.length&&!(oK.length===1&&nK.length===1)){
        // sdílená skříňka: kdo přibyl a kdo ubyl (každý zvlášť, ať jde dohledat)
        nK.filter(k=>!oK.includes(k)).forEach(k=>add("locker","Skříňka "+lab+": přidán další člověk "+(lkNameIn(l,k)||"člověk"),{m:"lk:"+l.id+":a:"+k,key:k}));
        oK.filter(k=>!nK.includes(k)).forEach(k=>add("locker","Skříňka "+lab+": odebrán "+(lkNameIn(o,k)||"člověk"),{m:"lk:"+l.id+":r:"+k,key:k}));
      }else{
        // přidělení, „už nepracuje“ a uvolnění se v historii neslučují (vyprázdnění musí zůstat vidět)
        const mk="lk:"+l.id+":k:"+(nK.length?"p":l.gone?"g":"f");
        if(nK.length)add("locker","Skříňka "+lab+" přidělena: "+names(l)+(oK.length?" (dřív "+names(o)+")":""),{m:mk,key:l.key});
        else if(l.gone)add("locker","Skříňka "+lab+": "+l.gone+" už u nás nepracuje, je třeba vyprázdnit",{m:mk,...(o.key?{key:o.key}:{})});
        else add("locker","Skříňka "+lab+" uvolněna"+(oK.length||o.gone?" ("+(oK.length?names(o):o.gone)+")":""),{m:mk,...(o.key?{key:o.key}:{})});
      }
    }
    if(!!o.nokey!==!!l.nokey)add("locker","Skříňka "+lab+": "+(l.nokey?"není záložní klíč":"záložní klíč je"),{m:"lk:"+l.id+":z"});
    if((o.serial||"")!==(l.serial||""))add("locker","Skříňka "+lab+": "+(l.serial?"číslo klíče …"+l.serial:"číslo klíče smazáno"),{m:"lk:"+l.id+":s"});
    const on=o.notice?o.notice.until:"",nn=l.notice?l.notice.until:"";
    if(nn&&on!==nn)add("locker","Skříňka "+lab+": vyvěšena výzva k vyklizení, lhůta do "+dayText(nn),{m:"lk:"+l.id+":v",...(o.key?{key:o.key}:{})});
    if(o.note!==l.note)add("locker","Skříňka "+lab+": poznámka „"+(l.note||"—")+"“",{m:"lk:"+l.id+":t"});
  });
  a.filter(l=>!bm.has(l.id)).forEach(l=>add("locker","Skříňka "+lkLabel(l)+" smazána"+(l.key?" ("+names(l)+")":""),{m:"lk:"+l.id+":x"}));
}
