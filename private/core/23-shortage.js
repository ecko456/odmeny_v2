/* ==========================================================================
   SHORTAGE – chybějící díly z Excelu (2.27, sloupce 2.27.1, úpravy položek 2.28)
   Import: A = číslo objednávky, B = název dílu, C = EAN dílu (buňka má vložený hypertextový
   odkaz), D = index, E = urgentní množství, G = „TOP“ (TOP SHORTAGE, v seznamu vždy nahoře),
   H = probíhající operace. Každý import je samostatný seznam (snímek souboru), drží se
   posledních SH_MAX_LISTS. Do QR kódu v PDF jde jen activeBarcode z odkazu (shCode).
   2.28: položka má id, poznámku (note) a poslední záznam (rec) vložený ze schránky
   (A QR kód, B datum a čas, C počet ks, D stav); položky jde odebrat a přesouvat.
   2.29: položka má poddíly (subs) z výrobního plánu, seznam údaj o plánu (plan).
   ========================================================================== */
const SH_MAX_LISTS=30,SH_MAX_ITEMS=1000,SH_MAX_SUBS=500,SH_MAX_CANDS=100,SH_MAX_DEPTS=20,SH_MAX_DEPT_OPS=100,SH_MAX_GONE=1000;
const SH_MAX_NOTE=2000;
// Záznamy evidence pohybu uložené i pro zatím nepřiřazené kódy (QR varianty, pozdější plán).
// Samostatná aplikace jich drží 20 000, v šifrovaném sdíleném stavu V2 méně, ať se ukládání nenafukuje.
const SH_MAX_RECORDS=3000;
const shCleanLine=(v,max)=>String(v==null?'':v).replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
function shPlanningNote(value){
  const text=String(value==null?"":value).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  return text?("Poznámka od plánování: "+text).slice(0,SH_MAX_NOTE):"";
}
function shQrChoices(values){
  const out=[];
  (Array.isArray(values)?values:[]).slice(0,100).forEach(v=>{
    const link=shLink(v&&v.link),code=shCode(link);
    if(code&&!out.some(x=>x.code===code))out.push({link,code,op:shCleanLine(v.op,300),rec:shRecClean(v.rec,shCleanLine)});
  });
  return out;
}
function shRecordMap(list){
  const out=new Map();
  const add=(code,rec)=>{if(!code||!rec)return;const old=out.get(code);if(!old||!(old.ts&&rec.ts&&rec.ts<old.ts))out.set(code,rec);};
  (list.records||[]).forEach(r=>add(r.code,r));
  (list.items||[]).forEach(it=>{add(it.code,it.rec);(it.subs||[]).forEach(x=>add(x.code,x.rec));(it.qrChoices||[]).forEach(x=>add(x.code,x.rec));});
  return out;
}
function shSelectQr(list,id,code){
  const item=shEntry(list,id)?.entry,choice=item?.qrChoices?.find(x=>x.code===code);
  if(!choice||item.qrKey!==shPlanKey(item.ean,item.index,item.order))return false;
  const record=shRecordMap(list).get(code)||choice.rec||null;
  item.link=choice.link;item.code=choice.code;item.op=choice.op||'';item.qrConflict=false;
  item.rec=record?{...record}:null;
  return true;
}
function shAllSubs(item){
  const out=[...(Array.isArray(item.subs)?item.subs:[])].filter(s=>s&&typeof s==='object');
  (Array.isArray(item.cands)?item.cands:[]).filter(s=>s&&typeof s==='object').forEach(s=>{
    if(!out.some(x=>shPlanKeyPart(x.ean)===shPlanKeyPart(s.ean)&&x.code===s.code))out.push(s);
  });
  return out;
}
function shApplyNotes(list,items){
  let updated=0,missing=0,ambiguous=0;
  const all=list.items.flatMap(i=>[i,...(i.subs||[])]);
  for(const incoming of items){
    if(!incoming.note)continue;
    const exact=all.filter(x=>shItemKey(x)===shItemKey(incoming));
    const matches=exact.length?exact:all.filter(x=>shPlanKeyPart(x.ean)===shPlanKeyPart(incoming.ean));
    if(!matches.length){missing++;continue;}
    if(matches.length>1){ambiguous++;continue;}
    const item=matches[0],previous=item.planningNote||'';
    let manual=item.note||'';
    if(previous)manual=manual.replace(previous,'').replace(/^\s*·\s*|\s*·\s*$/g,'').trim();
    const next=manual.includes(incoming.note)?manual:[manual,incoming.note].filter(Boolean).join(' · ');
    if(next!==item.note){item.note=next.slice(0,SH_MAX_NOTE);updated++;}
    item.planningNote=incoming.note;
  }
  return {updated,missing,ambiguous};
}
function blankShortage(){return {lists:[],depts:[],cols:{},colors:{}};}
/** Cíl odkazu ze souboru xlsx: SheetJS 0.18.5 v něm nechá XML zápis (&amp; místo &, &#38; …). */
function shUnxml(s){
  return String(s==null?"":s).replace(/&(amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9a-f]{1,6});/gi,(m,e)=>{
    const k=e.toLowerCase(),named={amp:"&",lt:"<",gt:">",quot:'"',apos:"'"};
    if(named[k])return named[k];
    const n=k[1]==="x"?parseInt(k.slice(2),16):parseInt(k.slice(1),10);
    return n>0&&n<=0x10FFFF?String.fromCodePoint(n):m;
  });
}
/** Odkaz do tabulky v aplikaci: jen webová adresa (http, https; „www.…“ dostane https://), jinak "". */
function shLink(v){
  let s=String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g,"").trim();
  if(/^www\./i.test(s))s="https://"+s;
  return s.length<=2000&&/^https?:\/\/[^\s<>"]+$/i.test(s)?s:"";
}
/** Kód do QR: tisknutelné znaky bez mezer (ASCII), nejvýš 120, jinak "". */
function shCodeClean(v){
  const s=String(v==null?"":v).trim();
  return /^[\x21-\x7E]{1,120}$/.test(s)?s:"";
}
/** Kód do QR z odkazu: hodnota parametru activeBarcode (za „activeBarcode=“ do „&“), jinak "". */
function shCode(link){
  const m=String(link==null?"":link).match(/activeBarcode=([^&#]*)/i);
  if(!m)return "";
  let v=m[1];
  try{v=decodeURIComponent(v);}catch(e){/* nechá se, jak je */}
  return shCodeClean(v);
}
/** Poslední záznam položky {ts, when, qty, state, at, by}, nebo null. */
function shRecClean(r,line){
  if(!r||typeof r!=="object")return null;
  const n=v=>Number.isFinite(+v)?Math.max(0,+v):0;
  return {ts:n(r.ts),when:line(r.when,40),qty:line(r.qty,40),state:line(r.state,400),op:line(r.op,200),n:Math.min(99999,Math.round(n(r.n))),at:n(r.at),by:line(r.by,60)};
}
/** Datum a čas ze sloupce B („22.10.2026 9:15“, „22. 10. 26 9:15:30“, „2026-10-22 09:15“, pořadové číslo dne Excelu) → ms místního času, jinak 0. */
function shParseWhen(v){
  const s=String(v==null?"":v).trim();
  let m,y,mo,d,h=0,mi=0,se=0;
  if((m=s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))){d=+m[1];mo=+m[2];y=+m[3];if(y<100)y+=2000;h=+(m[4]||0);mi=+(m[5]||0);se=+(m[6]||0);}
  else if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/))){y=+m[1];mo=+m[2];d=+m[3];h=+(m[4]||0);mi=+(m[5]||0);se=+(m[6]||0);}
  else if(/^\d{5}(?:[.,]\d+)?$/.test(s)){
    const x=parseFloat(s.replace(",","."));
    if(x<20000||x>80000)return 0;
    const days=Math.floor(x),secs=Math.round((x-days)*86400),b=new Date(1899,11,30+days);
    return new Date(b.getFullYear(),b.getMonth(),b.getDate(),Math.floor(secs/3600),Math.floor(secs%3600/60),secs%60).getTime();
  }
  else return 0;
  if(mo<1||mo>12||d<1||d>31||h>23||mi>59||se>59)return 0;
  const t=new Date(y,mo-1,d,h,mi,se);
  return t.getMonth()===mo-1&&t.getDate()===d?t.getTime():0;
}
/** „22. 10. 2026 8:15“ z časové značky. */
function shWhenText(ts){const d=new Date(ts||0);return dayText(todayIso(ts||0))+" "+d.getHours()+":"+String(d.getMinutes()).padStart(2,"0");}
/** Řádky vypadají jako poslední záznamy (ve sloupci B je u většiny datum a čas), ne jako seznam. */
function shLooksLikeRecs(rows){
  const t=(r,c)=>String((r&&r[c]&&r[c].text)!=null?r[c].text:"").trim();
  const data=(Array.isArray(rows)?rows:[]).filter(r=>[0,1,2,3].some(c=>t(r,c)));
  const dated=data.filter(r=>t(r,0)&&shParseWhen(t(r,1))).length;
  return dated>0&&dated*2>=data.length-1;
}
/**
 * Poslední záznamy ze schránky: A QR kód (activeBarcode), B datum a čas, C počet ks, D stav.
 * Ke každému kódu se vezme nejnovější řádek. Vrací {recs: Map kód → {ts, when, qty, state}, rows, bad}.
 */
function shRecBuild(rows,cols){
  const t=(r,c)=>c<0?"":String((r&&r[c]&&r[c].text)!=null?r[c].text:"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  const n=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  // sloupce evidence pohybu (2.61): výchozí A QR kód, B datum a čas, C ks, D stav
  const x=shColIdx("move",cols);
  const recs=new Map(),cnt=new Map();let count=0,bad=0;
  (Array.isArray(rows)?rows:[]).forEach(r=>{
    const raw=t(r,x.code),when=t(r,x.when),qty=t(r,x.qty),state=t(r,x.state),op=t(r,x.op);
    if(!raw&&!when&&!qty&&!state)return;
    const ts=shParseWhen(when),code=shCodeClean(raw);
    if(!ts&&(/^(qr|kod|code|barcode)/.test(n(raw))||/datum|cas/.test(n(when))&&/stav/.test(n(state))))return;   // nadpisy
    if(!code){bad++;return;}
    count++;
    cnt.set(code,(cnt.get(code)||0)+1);
    const prev=recs.get(code);
    if(!prev||ts>=prev.ts)recs.set(code,{ts,when:ts?shWhenText(ts):when.slice(0,40),qty:qty.slice(0,40),state:state.slice(0,400),op:op.slice(0,200)});
  });
  recs.forEach((r,code)=>{r.n=cnt.get(code)||1;});
  return {recs,rows:count,bad};
}
/**
 * Přiřadí poslední záznamy k položkám seznamu podle kódu. Novější nebo stejně starý záznam
 * nahradí uložený, starší ne. Vrací {matched, updated, same, older, missing: [kódy, které v seznamu nejsou]}.
 */
function shApplyRecs(list,recs,meta){
  const by=new Map();
  list.items.forEach(it=>[it,...(it.subs||[]),...(it.qrChoices||[])].forEach(i=>{if(i.code){if(!by.has(i.code))by.set(i.code,[]);by.get(i.code).push(i);}}));
  const saved=shRecordMap(list);
  const out={matched:0,updated:0,same:0,older:0,added:0,wpa:0,missing:[],cached:0,truncated:0};
  const stamp=r=>({...r,at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60)});
  recs.forEach((r,code)=>{
    const previous=saved.get(code);
    if(!previous||!(previous.ts&&r.ts&&r.ts<previous.ts)){
      saved.set(code,{...stamp(r),code});out.cached++;
    }
    const items=by.get(code);
    if(!items){out.missing.push(code);return;}
    out.matched++;
    items.forEach(i=>{
      const p=i.rec;
      if(p&&p.ts===r.ts&&p.qty===r.qty&&p.state===r.state&&p.when===r.when&&(p.op||"")===(r.op||"")&&(p.n||0)===(r.n||0)){out.same++;return;}
      if(p&&p.ts&&r.ts&&r.ts<p.ts){out.older++;return;}
      i.rec=stamp(r);
      out.updated++;
    });
  });
  const entries=[...saved.entries()].sort((a,b)=>(b[1].ts||0)-(a[1].ts||0));
  out.truncated=Math.max(0,entries.length-SH_MAX_RECORDS);
  list.records=entries.slice(0,SH_MAX_RECORDS).map(([code,r])=>({...r,code}));
  return out;
}
/** Přesune položku na index `to` (výsledné místo). TOP SHORTAGE zůstanou nahoře: položka se hýbe jen ve své skupině. */
function shMoveItem(list,id,to){
  const from=list.items.findIndex(i=>i.id===id);
  if(from<0)return false;
  const it=list.items[from],r=shRank(it);
  const lo=list.items.filter(i=>shRank(i)<r).length,hi=lo+list.items.filter(i=>shRank(i)===r).length-1;
  to=Math.max(lo,Math.min(hi,Math.round(+to||0)));
  if(to===from)return false;
  list.items.splice(from,1);
  list.items.splice(to,0,it);
  return true;
}
/** Pořadí skupin: TOP SHORTAGE 0, TOP 2 (zpracovat hned po TOP, 2.32) 1, ostatní 2. */
function shRank(i){return i.top?0:i.top2?1:2;}
/** Položky TOP SHORTAGE první, za nimi TOP 2, jinak pořadí ze souboru nebo ruční. */
function shTopFirst(items){return [0,1,2].flatMap(r=>items.filter(i=>shRank(i)===r));}
/** Ruční TOP (2.31) a TOP 2 (2.32): tier "top" | "top2" | "". Položka jde na konec nové skupiny
    (po snížení na začátek), pořadí ostatních zůstane. */
function shSetTier(list,id,tier){
  const it=list&&list.items.find(i=>i.id===id);
  if(!it)return false;
  const top=tier==="top",top2=tier==="top2";
  if(!!it.top===top&&!!it.top2===top2)return false;
  it.top=top;it.top2=top2;
  const order=shTopFirst(list.items);
  list.items.splice(0,list.items.length,...order);
  return true;
}
function shSetTop(list,id,on){return shSetTier(list,id,on?"top":"");}
/* Oddělení (2.32): S.shortage.depts = [{id, name, ops: [{key, label}]}], operace (klíč shOpKey)
   patří nejvýš do jednoho oddělení. Položka jde do oddělení podle své operace, sestava bez
   zařazené operace podle prvního poddílu; ruční přesun item.dept = id oddělení, „-“ = ručně
   nezařazená, "" = podle operace. Poddíly jdou se sestavou. */
function shDeptMap(sh){const m=new Map();((sh&&sh.depts)||[]).forEach(d=>d.ops.forEach(o=>{if(!m.has(o.key))m.set(o.key,d.id);}));return m;}
function shAutoDept(sh,it,map){
  map=map||shDeptMap(sh);
  const own=map.get(shOpKey(it.op));
  if(own)return own;
  for(const x of it.subs||[]){const d=map.get(shOpKey(x.op));if(d)return d;}
  return "";
}
/** Oddělení položky: id, nebo "" = nezařazená. */
function shDeptOf(sh,it,map){
  const ids=new Set(((sh&&sh.depts)||[]).map(d=>d.id));
  if(it.dept==="-")return "";
  if(it.dept&&ids.has(it.dept))return it.dept;
  return shAutoDept(sh,it,map);
}
/** Bloky seznamu podle oddělení (v pořadí oddělení, nezařazené na konci); bez oddělení jeden blok. */
function shSections(sh,items){
  const depts=(sh&&sh.depts)||[],map=shDeptMap(sh);
  if(!depts.length)return [{id:"",name:"",items:items.slice()}];
  const by=new Map(depts.map(d=>[d.id,[]]));by.set("",[]);
  items.forEach(i=>by.get(shDeptOf(sh,i,map)).push(i));
  return depts.map(d=>({id:d.id,name:d.name,items:by.get(d.id)})).concat([{id:"",name:"Nezařazeno",items:by.get("")}]).filter(x=>x.items.length);
}
/** Ruční přesun (2.32): položka do oddělení dept ("" = nezařazená) před položku before, bez ní na konec
    oddělení. Pořadí TOP / TOP 2 / ostatní zůstane (shTopFirst). Vrací true, když se něco změnilo. */
function shDrop(sh,list,id,dept,before){
  const it=list&&list.items.find(i=>i.id===id);
  if(!it)return false;
  const ids=new Set(((sh&&sh.depts)||[]).map(d=>d.id));
  if(dept&&!ids.has(dept))return false;
  const was=JSON.stringify([it.dept||"",list.items.map(i=>i.id)]);
  const auto=shAutoDept(sh,it);
  it.dept=dept===auto?"":(dept||"-");
  const rest=list.items.filter(i=>i!==it),map=shDeptMap(sh);
  let at=before?rest.findIndex(i=>i.id===before):-1;
  if(at<0){at=rest.length;for(let k=rest.length-1;k>=0;k--){if(shDeptOf(sh,rest[k],map)===(dept||"")){at=k+1;break;}}}
  rest.splice(at,0,it);
  list.items.splice(0,list.items.length,...shTopFirst(rest));
  return JSON.stringify([it.dept||"",list.items.map(i=>i.id)])!==was;
}
/** Nastavení oddělení: přiřazení operace (klíč) oddělení, "" = žádnému. */
function shAssignOp(sh,key,label,deptId){
  if(!sh||!Array.isArray(sh.depts))return false;
  let changed=false;
  // z ostatních oddělení pryč, v cílovém zůstane (opakované přiřazení nic nemění)
  sh.depts.forEach(d=>{if(d.id===deptId)return;const n=d.ops.length;d.ops=d.ops.filter(o=>o.key!==key);if(d.ops.length!==n)changed=true;});
  const d=sh.depts.find(x=>x.id===deptId);
  if(d&&!d.ops.some(o=>o.key===key)){d.ops.push({key,label:String(label||key).replace(/\s+/g," ").trim().slice(0,120)});changed=true;}
  return changed;
}
/* Filtr podle probíhající operace (2.31): klíč operace bez diakritiky a velikosti písmen,
   položka bez operace má klíč „-“. */
function shOpKey(op){return shOpNorm(op)||"-";}
/** Operace v seznamu (položky i poddíly): [{key, label, n}], nejčastější první. */
function shOpList(list){
  const m=new Map();
  const add=op=>{const k=shOpKey(op);const x=m.get(k);if(x)x.n++;else m.set(k,{key:k,label:k==="-"?"bez operace":String(op).trim(),n:1});};
  ((list&&list.items)||[]).forEach(i=>{add(i.op);(i.subs||[]).forEach(x=>add(x.op));});
  return [...m.values()].sort((a,b)=>b.n-a.n||(a.key==="-")-(b.key==="-")||a.label.localeCompare(b.label,"cs"));
}
/** Operace ze všech seznamů a z nastavení oddělení (pro přiřazení k oddělení): [{key, label, n}]. */
function shOpsAll(sh){
  const m=new Map();
  ((sh&&sh.lists)||[]).forEach(l=>shOpList(l).forEach(o=>{const x=m.get(o.key);if(x)x.n+=o.n;else m.set(o.key,{...o});}));
  ((sh&&sh.depts)||[]).forEach(d=>d.ops.forEach(o=>{if(!m.has(o.key))m.set(o.key,{key:o.key,label:o.label,n:0});}));
  return [...m.values()].sort((a,b)=>(a.key==="-")-(b.key==="-")||a.label.localeCompare(b.label,"cs"));
}
/** Položky s vybranými operacemi: poddíly jen s vybranou operací, sestava i kvůli poddílu. keys = Set klíčů, prázdný = vše. */
function shOpPick(items,keys){
  if(!keys||!keys.size)return items;
  return items.map(i=>{const subs=(i.subs||[]).filter(x=>keys.has(shOpKey(x.op)));return keys.has(shOpKey(i.op))||subs.length?{...i,subs}:null;}).filter(Boolean);
}
function shStClean(x,line){return SH_ST_KEYS.has(x.st)?{st:x.st,stAt:Number.isFinite(+x.stAt)?Math.max(0,+x.stAt):0,stBy:line(x.stBy,60)}:{};}
/* Stav položky nebo poddílu (2.65): zadává se ručně v modulu i v pravém panelu, v PDF je vidět jen zvolený stav */
const SH_ST=[["plan","Bude rozpracováno"],["run","Rozpracováno"],["wait","Čekáme na díl"],["done","Hotovo"]];
const SH_ST_KEYS=new Set(SH_ST.map(x=>x[0]));
const shStName=k=>(SH_ST.find(x=>x[0]===k)||["",""])[1];
function shSetStatus(list,id,st,meta){
  const hit=shEntry(list,id);
  if(!hit)return false;
  const e=hit.entry,v=SH_ST_KEYS.has(st)?st:"";
  if((e.st||"")===v)return false;
  if(v){e.st=v;e.stAt=(meta&&meta.at)||Date.now();e.stBy=(meta&&meta.by)||"";}else{delete e.st;delete e.stAt;delete e.stBy;}
  return true;
}
function cleanShortage(o){
  o=o&&typeof o==="object"?o:{};
  const line=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max);
  const num=v=>Number.isFinite(+v)?Math.max(0,+v):0;
  const seen=new Set(),uniq=(v,p)=>{let x=typeof v==="string"&&SAFE_ID.test(v)?v:uid(p);while(seen.has(x))x=uid(p);seen.add(x);return x;};
  // poddíl z výrobního plánu (2.29): EAN a odkaz poddílu, kód do QR, operace, poznámka, poslední záznam
  const sub=s=>({id:"",ean:line(s.ean,60),link:shLink(s.link),code:"code" in s?shCodeClean(s.code):shCode(s.link),op:line(s.op,300),name:line(s.name,200),order:line(s.order,80),index:line(s.index,40),qty:line(s.qty,40),manual:s.manual===true,sourceKey:line(s.sourceKey,160),planningNote:line(s.planningNote,SH_MAX_NOTE),note:line(s.note,SH_MAX_NOTE),rec:shRecClean(s.rec,line),byRec:s.byRec===true,pdfHide:s.pdfHide===true,...shStClean(s,line),_id:s.id});
  // Staré čekající poddíly se přes shAllSubs převedou mezi běžné poddíly.
  const meta=m=>m&&typeof m==="object"?{file:line(m.file,160),at:num(m.at),by:line(m.by,60),rows:Math.round(num(m.rows))}:null;
  const lists=(Array.isArray(o.lists)?o.lists:[]).filter(l=>l&&typeof l==="object"&&Array.isArray(l.items)).map(l=>({
    id:uniq(l.id,"sh"),at:num(l.at),by:line(l.by,60),file:line(l.file,160),sheet:line(l.sheet,80),
    plan:l.plan&&typeof l.plan==="object"?{file:line(l.plan.file,160),at:num(l.plan.at),by:line(l.plan.by,60)}:null,
    // evidence pohybu (2.61, 3. krok): odkud jsou poslední záznamy
    moves:meta(l.moves),
    records:(Array.isArray(l.records)?l.records:[]).slice(0,SH_MAX_RECORDS).filter(r=>r&&shCodeClean(r.code)).map(r=>({...shRecClean(r,line),code:shCodeClean(r.code)})),
    // ručně odebrané položky (2.36): při doplnění chybějících se samy nevrátí
    gone:[...new Set((Array.isArray(l.gone)?l.gone:[]).filter(k=>typeof k==="string"&&k).map(k=>k.slice(0,240)))].slice(-SH_MAX_GONE),
    // seznam ze 2.27 nemá top, op ani code: kód se dopočítá z odkazu; seznam ze 2.27.1 nemá id, note ani rec; ze 2.28 nemá subs
    items:shTopFirst(l.items.filter(i=>i&&typeof i==="object").map(i=>({id:"",order:line(i.order,80),name:line(i.name,200),ean:line(i.ean,60),
      index:line(i.index,40),qty:line(i.qty,40),top:i.top===true,top2:i.top2===true&&i.top!==true,op:line(i.op,300),link:shLink(i.link),
      qrKey:line(i.qrKey,240),qrChoices:i.qrKey===shPlanKey(i.ean,i.index,i.order)?shQrChoices(i.qrChoices):[],qrConflict:i.qrConflict===true,planMismatch:i.planMismatch===true,planningNote:line(i.planningNote,SH_MAX_NOTE),code:"code" in i?shCodeClean(i.code):shCode(i.link),note:line(i.note,SH_MAX_NOTE),rec:shRecClean(i.rec,line),pdfHide:i.pdfHide===true,full:i.full===true,
      dept:i.dept==="-"||(typeof i.dept==="string"&&SAFE_ID.test(i.dept))?i.dept:"",...shStClean(i,line),...(line(i.pop,300)?{pop:line(i.pop,300)}:{}),
      subs:shAllSubs(i).map(sub).filter(s=>s.ean||s.code).slice(0,SH_MAX_SUBS),
      cands:[],_id:i.id})).filter(i=>i.ean||i.name)).slice(0,SH_MAX_ITEMS),
  }));
  lists.forEach(l=>{
    // id položek i poddílů jsou jedinečné v celém seznamu
    const ids=new Set(),give=(x,p)=>{let v=typeof x._id==="string"&&SAFE_ID.test(x._id)&&!ids.has(x._id)?x._id:uid(p);while(ids.has(v))v=uid(p);ids.add(v);x.id=v;delete x._id;};
    l.items.forEach(i=>give(i,"si"));
    l.items.forEach(i=>i.subs.forEach(s=>give(s,"sp")));
  });
  // oddělení (2.32): jedinečné id a název, operace nejvýš v jednom oddělení
  const dSeen=new Set(),opSeen=new Set();
  const depts=(Array.isArray(o.depts)?o.depts:[]).filter(d=>d&&typeof d==="object").map(d=>{
    let id=typeof d.id==="string"&&SAFE_ID.test(d.id)?d.id:uid("sd");while(dSeen.has(id))id=uid("sd");dSeen.add(id);
    const ops=(Array.isArray(d.ops)?d.ops:[]).filter(x=>x&&typeof x==="object").map(x=>({key:shOpKey(x.key),label:line(x.label||x.key,120)}))
      .filter(x=>x.key&&!opSeen.has(x.key)&&(opSeen.add(x.key),true)).slice(0,SH_MAX_DEPT_OPS);
    return {id,name:line(d.name,60)||"Oddělení",ops};
  }).slice(0,SH_MAX_DEPTS);
  const dIds=new Set(depts.map(d=>d.id));
  lists.forEach(l=>l.items.forEach(i=>{if(i.dept&&i.dept!=="-"&&!dIds.has(i.dept))i.dept="";}));   // smazané oddělení: zase podle operace
  // nejnovější první; nad SH_MAX_LISTS se nejstarší zahodí
  lists.sort((a,b)=>b.at-a.at);
  // sloupce tří importů (2.61) a barvy výplně buňky EANu → TOP / TOP 2 / běžná shortage
  const cols={};
  Object.keys(SH_COLS).forEach(k=>{if(o.cols&&o.cols[k]&&typeof o.cols[k]==="object")cols[k]=shColsClean(k,o.cols[k]);});
  const colors={};
  if(o.colors&&typeof o.colors==="object")Object.keys(o.colors).slice(0,SH_MAX_COLORS).forEach(k=>{const h=shHex(k);if(h&&SH_TIERS.includes(o.colors[k]))colors[h]=o.colors[k];});
  return {lists:lists.slice(0,SH_MAX_LISTS),depts,cols,colors};
}
/** Řádek s nadpisy sloupců (Číslo objednávky, Název dílu, EAN …), ne položka: aspoň dva nadpisy, v E žádná číslice. */
function shIsHeader(t){
  const n=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const re=[/objedn|zakaz/,/nazev|^dil\b|popis/,/\bean\b|kod|carov/,/^index\b/,/mnozstv|^ks\b|pocet/];
  return re.filter((r,i)=>r.test(n(t[i]))).length>=2&&!/\d/.test(String(t[4]||""));
}
/**
 * Řádky listu → položky seznamu. rows[r][c] = {text, link}: text jak ho ukazuje Excel,
 * link = cíl hypertextového odkazu buňky. Odkaz se bere z EANu (C), když tam není, z jiné
 * buňky řádku. Nadpisy sloupců se poznají v prvních 15 řádcích (nad nimi může být titulek).
 * Vrací {items, more, header, top, warn}; položky TOP SHORTAGE jsou první.
 */
function shBuild(rows,cols,colors){
  rows=Array.isArray(rows)?rows:[];
  const t=(r,c)=>c<0?"":String((r&&r[c]&&r[c].text)!=null?r[c].text:"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  // Podle šířky tabulky urgenty A–S nebo Shortage z Kooperace A–H; ruční volba má přednost.
  const x=shColIdx("list",cols||shListBase(rows));
  let header=-1;
  for(let i=0;i<Math.min(rows.length,15);i++)if(shIsHeader([x.order,x.name,x.ean,x.index,x.qty].map(c=>t(rows[i],c)))){header=i;break;}
  const items=[],warn={noLink:0,noCode:0,noEan:0,skipped:0},fills=new Map();
  const width=Math.max(8,...rows.slice(0,50).map(r=>(r||[]).length));
  rows.forEach((r,ri)=>{
    if(ri<=header)return;
    const order=t(r,x.order),name=t(r,x.name),ean=t(r,x.ean),index=t(r,x.index),qty=t(r,x.qty),op=t(r,x.op);
    if(!order&&!name&&!ean&&!index&&!qty&&!op)return;
    if(!ean&&!name){warn.skipped++;return;}
    const cell=c=>c<0?"":String((r&&r[c]&&r[c].link)||"").trim();
    let raw=cell(x.ean);
    for(let c=0;!raw&&c<width;c++)if(c!==x.ean)raw=cell(c);
    const code=shCode(raw);
    if(!raw)warn.noLink++;else if(!code)warn.noCode++;
    if(!ean)warn.noEan++;
    // G: „TOP“ = TOP SHORTAGE, „TOP2“ / „TOP 2“ = zpracovat hned po TOP (2.32)
    const g=t(r,x.top),top2=/^top\s*-?\s*2\b/i.test(g);
    // barva výplně buňky EANu (2.61): vzorník po importu přiřadí barvám TOP / TOP 2
    const fill=shHex(r&&r[x.ean]&&r[x.ean].fill);
    if(fill)fills.set(fill,(fills.get(fill)||0)+1);
    items.push({order,name,ean,index,qty,top:!top2&&/^top\b/i.test(g),top2,op,link:shLink(raw),code,note:shPlanningNote(t(r,x.note)),planningNote:shPlanningNote(t(r,x.note)),...(fill?{fill}:{})});
  });
  if(colors)shApplyColors(items,colors);
  const all=shTopFirst(items);
  return {items:all.slice(0,SH_MAX_ITEMS),more:Math.max(0,all.length-SH_MAX_ITEMS),header,top:items.filter(i=>i.top).length,top2:items.filter(i=>i.top2).length,warn,fills};
}
/* Doplnění chybějících (2.36): položka se pozná podle EANu (bez něj podle názvu), indexu
   a čísla objednávky, stejně jako sestava u poddílů z plánu. */
function shItemKey(i){i=i||{};return (shPlanKeyPart(i.ean)||"#"+shOpNorm(i.name))+"|"+shPlanKeyPart(i.index)+"|"+shPlanKeyPart(i.order);}
/** Co z nově vložených položek v seznamu chybí: add = k doplnění (v pořadí ze souboru),
    have = kolik už v seznamu je, gone = ručně odebrané (vrátí se jen s back). Stejná položka
    víckrát se počítá po kusech: dvakrát v souboru a jednou v seznamu = jedna chybí. */
function shMergePlan(list,items,back){
  const left=new Map();
  ((list&&list.items)||[]).forEach(i=>{const k=shItemKey(i);left.set(k,(left.get(k)||0)+1);});
  const gone=new Set((list&&list.gone)||[]),out={add:[],have:0,gone:[]};
  (items||[]).forEach(i=>{
    const k=shItemKey(i),n=left.get(k)||0;
    if(n>0){left.set(k,n-1);out.have++;}
    else if(gone.has(k)&&!back)out.gone.push(i);
    else out.add.push(i);
  });
  return out;
}
/** Text ze schránky (buňky oddělené tabulátorem, řádky novým řádkem, Excel dává do uvozovek buňky s tabulátorem nebo zalomením). */
function shTsv(text){
  const rows=[],s=String(text==null?"":text).replace(/\r\n?/g,"\n");
  let row=[],cell="",q=false;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(q){if(ch==='"'){if(s[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=ch;}
    else if(ch==='"'&&cell==="")q=true;
    else if(ch==="\t"){row.push(cell);cell="";}
    else if(ch==="\n"){row.push(cell);rows.push(row);row=[];cell="";}
    else cell+=ch;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}
/* ---------- Poddíly z výrobního plánu (2.29) ----------
   2. list plánu: A EAN sestavy, E EAN poddílu (s odkazem jako EAN v seznamu), H index,
   M číslo objednávky, AM probíhající operace. Poddíl patří k položce seznamu se stejným
   EANem, indexem i číslem objednávky. Od 2.70 se vloží poddíly všech operací; SH_SUB_OPS jen
   označí operace Haly 2 (rozbor položek: „mimo Halu 2“). */
const SH_SUB_OPS=["Broušení – hala 2","Brush Hala 2","Frézování Hala 2","Frézování VF-11","gravírování Hala 2","řez kotoučovou pilou 2","Odjehlení hala 2","Label Hala 2","Lepení 3M-Hala 2","Pískování – hala 2","Leštění – hala 2"];
/** Operace bez diakritiky, malými, pomlčky jako mezery („Broušení – hala 2“ = „brouseni hala 2“). */
function shOpNorm(s){return String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[‐-―−_\-]+/g," ").replace(/\s+/g," ").trim();}
const SH_SUB_OPSET=new Set(SH_SUB_OPS.map(shOpNorm));
function shSubOp(op){return SH_SUB_OPSET.has(shOpNorm(op));}
/** Část klíče sestavy: bez mezer, velkými, číslo bez nul na začátku (EAN z plánu bývá číslo). */
function shPlanKeyPart(v){let s=String(v==null?"":v).replace(/\s+/g,"").toUpperCase();if(/^\d+$/.test(s))s=s.replace(/^0+(?=\d)/,"");return s;}
function shPlanKey(ean,index,order){return shPlanKeyPart(ean)+"|"+shPlanKeyPart(index)+"|"+shPlanKeyPart(order);}
/** Prázdný přehled plánu: rows = klíč sestavy → [{ean, link, code, op}] (jen operace Hala 2),
    other = klíč → počet řádků s jinou operací, cands = klíč → poddíly s jinou operací a s kódem (2.29.1). */
function shPlanBlank(file){return {file:String(file||"").slice(0,160),at:Date.now(),sheet:"",itemSheet:"",total:0,rows:new Map(),other:new Map(),cands:new Map(),direct:new Map(),operations:new Map(),itemEans:new Set(),firstKeys:new Set()};}
/** Jeden řádek plánu (a EAN sestavy, e EAN poddílu, h index, m objednávka, op operace, link cíl odkazu u E). */
function shPlanDirectRow(plan,ean,link,op,index='',order=''){
  if(!shPlanKeyPart(ean))return;
  const key=shPlanKey(ean,index,order),url=shLink(link),code=shCode(link);
  plan.itemEans.add(shPlanKeyPart(ean));plan.firstKeys.add(key);
  if(key&&op!==undefined){
    const value=String(op==null?'':op).replace(/[\u0000-\u001F\u007F]/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
    const ops=plan.operations.get(key)||[];
    if(!ops.some(x=>x.code===code&&x.op===value))ops.push({code,op:value});
    plan.operations.set(key,ops);
  }
  if(!key||!code)return;
  const list=plan.direct.get(key)||[];
  if(!list.some(x=>x.code===code))list.push({link:url,code});
  plan.direct.set(key,list);
}
function shPlanRow(plan,a,e,h,m,op,link){
  if(!shPlanKeyPart(a)||!String(e==null?"":e).trim())return;
  const k=shPlanKey(a,h,m),t=String(link||"").trim();
  const row={ean:String(e).replace(/\s+/g," ").trim().slice(0,60),link:shLink(t),code:shCode(t),op:String(op==null?"":op).replace(/\s+/g," ").trim().slice(0,120)};
  if(!plan.rows.has(k))plan.rows.set(k,[]);
  plan.rows.get(k).push(row);
}
/** Stav posledního záznamu „Odesláno na WPA“: takový poddíl se podle záznamu nepřidá. */
function shWpa(state){return /odeslano na wpa/.test(shOpNorm(state));}
/**
 * Poddíly z plánu k položkám seznamu. U položky se poddíly nahradí podle plánu; poddíl, který
 * v plánu zůstal, si nechá id, poznámku i poslední záznam. Víc operací téhož poddílu se spojí.
 * Poddíly s jinou operací se uloží jako čekající (cands), přidá je až poslední záznam (2.29.1);
 * poddíl už přidaný podle záznamu (byRec) zůstane, dokud je v plánu.
 * Vrací {items (sestav s poddíly), subs, noCode, other (sestav jen s jinou operací), cands, changed}.
 */
function shApplyPlan(list,plan){
  const out={items:0,subs:0,noCode:0,other:0,cands:0,changed:0,linked:0,ambiguous:0,truncated:0,operations:0,unmatchedFirst:0,conflicts:0};
  let selfOps=[];
  let selfFound=false;
  const records=shRecordMap(list);
  const group=(rows,self)=>{
    const by=new Map();
    rows.forEach(r=>{
      if(shPlanKeyPart(r.ean)===self){selfFound=true;if(r.op&&!selfOps.includes(r.op))selfOps.push(r.op);return;}
      const key=shPlanKeyPart(r.ean)+"|"+r.code,x=by.get(key);
      if(x){if(r.op&&!x.ops.includes(r.op))x.ops.push(r.op);if(!x.link&&r.link)x.link=r.link;}
      else by.set(key,{ean:r.ean,link:r.link,code:r.code,ops:r.op?[r.op]:[]});
    });
    return by;
  };
  list.items.forEach(it=>{
    const k=shPlanKey(it.ean,it.index,it.order);
    const matches=plan.direct?.get(k)||[];
    it.planMismatch=!!(plan.itemEans?.has(shPlanKeyPart(it.ean))&&!plan.firstKeys.has(k));
    if(it.planMismatch)out.unmatchedFirst++;
    it.qrConflict=!!(it.code&&matches.length&&!matches.some(x=>x.code===it.code));
    if(it.qrConflict)out.conflicts++;
    it.qrKey=k;
    // První list: přesná shoda EANu, line/indexu a objednávky. Bez fallbacku jen na EAN.
    if(!it.code&&plan.direct){
      if(matches.length===1){it.link=matches[0].link;it.code=matches[0].code;out.linked++;}
      else if(matches.length>1)out.ambiguous++;
    }
    it.qrChoices=matches.length>1||it.qrConflict?shQrChoices(matches.map(x=>({...x,
      op:[...new Set((plan.operations?.get(k)||[]).filter(v=>v.code===x.code).map(v=>v.op).filter(Boolean))].join(' · '),
      rec:records.get(x.code)||null,
    }))):[];
    if(it.code&&records.has(it.code))it.rec={...records.get(it.code)};
    const rows=[...(plan.rows.get(k)||[]),...((plan.cands&&plan.cands.get(k))||[])],self=shPlanKeyPart(it.ean);
    selfOps=[];
    selfFound=false;
    const by=group(rows,self);
    it.pop=selfOps.join(" · ").slice(0,300);
    const candidates=plan.operations?.get(k)||[];
    const exact=it.code?candidates.filter(x=>x.code===it.code):[];
    if(candidates.length||selfFound){
      const ops=candidates.length?[...new Set((exact.length?exact:candidates).map(x=>x.op).filter(Boolean))]:selfOps;
      const next=ops.join(' · ').slice(0,300);
      if(next!==(it.op||''))out.operations++;
      it.op=next;
    }
    out.truncated+=Math.max(0,by.size-SH_MAX_SUBS);
    const old=new Map((it.subs||[]).map(s=>[s.sourceKey||shPlanKeyPart(s.ean)+"|"+s.code,s]));
    const subs=[...by.entries()].slice(0,SH_MAX_SUBS).map(([key,x])=>{
      const p=old.get(key);
      if(p&&p.op!==x.ops.join(' · '))out.operations++;
      if(p&&p.manual)return {...p,op:x.ops.join(' · '),rec:records.get(p.code)||p.rec||null};
      return {...(p||{}),id:p?p.id:"",ean:x.ean,link:x.link,code:x.code,op:x.ops.join(" · "),note:p?p.note:"",rec:records.get(x.code)||(p?p.rec:null),byRec:!!(p&&p.byRec),pdfHide:!!(p&&p.pdfHide)};
    });
    // Ručně opravené poddíly zachovat i po změně EANu nebo kódu v plánu.
    old.forEach((p,key)=>{if(p.manual&&!by.has(key)&&subs.length<SH_MAX_SUBS)subs.push({...p});});
    const sig=a=>JSON.stringify((a||[]).map(s=>[s.ean,s.code,s.op]));
    if(sig(subs)!==sig(it.subs))out.changed++;
    it.subs=subs;
    it.cands=[];
    if(subs.length){out.items++;out.subs+=subs.length;out.noCode+=subs.filter(s=>!s.code).length;}
  });
  return out;
}
/** Položka nebo poddíl seznamu podle id → {entry, item (sestava), sub (je poddíl)}. */
function shEntry(list,id){
  for(const it of (list&&list.items)||[]){
    if(it.id===id)return {entry:it,item:it,sub:false};
    const s=(it.subs||[]).find(x=>x.id===id);
    if(s)return {entry:s,item:it,sub:true};
  }
  return null;
}
