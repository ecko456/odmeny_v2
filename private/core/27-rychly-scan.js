/* ================= Rychlý scan (2.77) =================
   Doplnění interní evidence z mobilu: zvolí se jedna pozice (stav záznamu, třeba „Odesláno na WPA“),
   kamerou se rychle načte víc QR kódů a po každém se zadá jen množství. Hromadně se kódy sbírají
   do dávky a potvrdí se najednou, jinak se zapíše každý hned. Do Shortage jdou stejnou cestou jako
   evidence pohybu (shApplyRecs: poslední záznam položky, záznamy i pro nepřiřazené kódy, odesláno
   na WPA), navíc se každé potvrzené načtení uloží do deníku S.shortage.scans kvůli výstupu do Excelu. */
const SC_MAX_LOG=3000,SC_MAX_BATCH=500,SC_MAX_POS=120;
/** Kód z načteného textu: odkaz s activeBarcode → jeho hodnota (jako QR v PDF), jinak text jako kód.
    Odkaz bez activeBarcode ani text s mezerami kódem nejsou (""). */
function scCode(raw){
  const t=String(raw==null?"":raw).trim();
  if(!t)return "";
  const c=shCode(t);
  if(c)return c;
  if(/^(https?:\/\/|www\.)/i.test(t))return "";
  return shCodeClean(t);
}
/** Množství: kladné číslo („5“, „2,5“, „1 200“, „12 ks“), jinak null. */
function scQty(v){const q=shQtyNum(v);return q!=null&&q>0&&q<1e7?Math.round(q*1000)/1000:null;}
function scQtyText(q){return String(q).replace(".",",");}
function scPos(v){return String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,SC_MAX_POS);}
/** Přidá načtení do dávky [{code, qty, n, at}]: stejný kód se sečte (n = počet načtení). Vrací {row, merged}, plná dávka null. */
function scAdd(batch,code,qty,at){
  const c=shCodeClean(code),q=scQty(qty);
  if(!c||q==null)return null;
  const row=batch.find(r=>r.code===c);
  if(row){row.qty=Math.round((row.qty+q)*1000)/1000;row.n++;row.at=at||Date.now();return {row,merged:true};}
  if(batch.length>=SC_MAX_BATCH)return null;
  const r={code:c,qty:q,n:1,at:at||Date.now()};
  batch.push(r);
  return {row:r,merged:false};
}
/** Co ke kódu patří v seznamu: položka, poddíl, nebo varianta QR. {item, sub, label, ean, name, order, index} nebo null. */
function scFind(list,code){
  for(const it of (list&&list.items)||[]){
    const base={item:it,ean:it.ean||"",name:it.name||"",order:it.order||"",index:it.index||""};
    if(it.code===code)return {...base,sub:null,kind:"item"};
    const s=(it.subs||[]).find(x=>x.code===code);
    if(s)return {...base,sub:s,ean:s.ean||it.ean||"",kind:"sub"};
    if((it.qrChoices||[]).some(x=>x.code===code))return {...base,sub:null,kind:"qr"};
  }
  return null;
}
/** Záznamy evidence z dávky ve tvaru shRecBuild: {recs: Map kód → záznam, sent, rows}. Stav záznamu = pozice. */
function scRecs(batch,pos){
  const state=scPos(pos),recs=new Map(),sent=new Map();
  (batch||[]).forEach(r=>{
    const ts=Math.round(r.at||Date.now());
    recs.set(r.code,{ts,when:shWhenText(ts),qty:scQtyText(r.qty),state,op:"",n:r.n||1});
    if(shWpa(state))sent.set(r.code,new Map([[ts+"|"+r.qty,[ts,r.qty]]]));
  });
  return {recs,sent,rows:(batch||[]).length};
}
/**
 * Zapíše dávku do seznamu (list = nezabalený seznam ze sh.lists): poslední záznamy a odesláno na WPA
 * přes shApplyRecs, odkud jsou (list.moves) a deník skenů sh.scans (nejnovější první). Vrací výsledek
 * shApplyRecs a {rows, logged}.
 */
function scApply(sh,list,batch,pos,meta){
  const state=scPos(pos);
  if(!list||list.packed||!state||!(batch||[]).length)return null;
  const r=scRecs(batch,state);
  const at=(meta&&meta.at)||Date.now(),by=String((meta&&meta.by)||"").slice(0,60);
  const res=shApplyRecs(list,r.recs,{at,by},r.sent);
  list.moves={file:("Rychlý scan · "+state).slice(0,160),at,by,rows:r.rows};
  const log=batch.map(b=>{const f=scFind(list,b.code);return {id:uid("sc"),ts:Math.round(b.at||at),code:b.code,qty:b.qty,n:b.n||1,pos:state,by,list:list.id,
    hit:!!f,kind:f?f.kind:"",ean:f?f.ean:"",name:f?f.name:"",order:f?f.order:"",index:f?f.index:""};});
  sh.scans=scClean([...log.slice().reverse(),...(sh.scans||[])]);
  return {...res,rows:r.rows,logged:log.length};
}
/** Deník skenů: platné záznamy, nejnovější první, nejvýš SC_MAX_LOG, jedinečné id. */
function scClean(a){
  const line=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max);
  const seen=new Set();
  return (Array.isArray(a)?a:[]).filter(x=>x&&typeof x==="object"&&shCodeClean(x.code)&&scQty(x.qty)!=null&&scPos(x.pos)).map(x=>{
    let id=typeof x.id==="string"&&SAFE_ID.test(x.id)?x.id:uid("sc");
    while(seen.has(id))id=uid("sc");
    seen.add(id);
    return {id,ts:Number.isFinite(+x.ts)?Math.max(0,Math.round(+x.ts)):0,code:shCodeClean(x.code),qty:scQty(x.qty),n:Math.min(99999,Math.max(1,Math.round(+x.n||1))),pos:scPos(x.pos),
      by:line(x.by,60),list:typeof x.list==="string"&&SAFE_ID.test(x.list)?x.list:"",hit:x.hit===true,kind:["item","sub","qr"].includes(x.kind)?x.kind:"",
      ean:line(x.ean,60),name:line(x.name,200),order:line(x.order,80),index:line(x.index,40)};
  }).sort((p,q)=>q.ts-p.ts).slice(0,SC_MAX_LOG);
}
/** Návrhy pozic: pozice z deníku skenů, stavy uložených záznamů a „Odesláno na WPA“; nejčastější první. */
function scPositions(sh){
  const m=new Map();
  const add=(v,w)=>{const p=scPos(v);if(!p)return;const k=shOpNorm(p);const x=m.get(k);if(x)x.n+=w;else m.set(k,{pos:p,n:w});};
  ((sh&&sh.scans)||[]).forEach(s=>add(s.pos,3));
  ((sh&&sh.lists)||[]).forEach(l=>{(l.records||[]).forEach(r=>add(r.state,1));(l.items||[]).forEach(i=>{if(i.rec)add(i.rec.state,1);});});
  add("Odesláno na WPA",0);
  return [...m.values()].sort((a,b)=>b.n-a.n||a.pos.localeCompare(b.pos,"cs")).map(x=>x.pos).slice(0,30);
}
/** Záznamy deníku v období: range today | week (7 dní) | all. */
function scRange(scans,range,today){
  const t=today||todayIso();
  if(range==="all")return (scans||[]).slice();
  const from=range==="week"?addDays(t,-6):t;
  return (scans||[]).filter(s=>{const d=todayIso(s.ts);return d>=from&&d<=t;});
}
/** Excel z deníku skenů: list Záznamy (po načteních) a Souhrn (po kódech a pozicích). */
function scSheets(scans){
  const rows=[["Datum","Čas","Pozice","QR kód","Množství","Počet načtení","Název dílu","EAN","Číslo objednávky","Index","V seznamu Shortage","Načetl"]];
  const tm=ts=>{const d=new Date(ts);return d.getHours()+":"+String(d.getMinutes()).padStart(2,"0");};
  const KIND={item:"položka",sub:"poddíl",qr:"varianta QR"};
  (scans||[]).forEach(s=>rows.push([dayText(todayIso(s.ts)),tm(s.ts),s.pos,s.code,s.qty,s.n,s.kind==="sub"&&s.name?"poddíl sestavy "+s.name:s.name,s.ean,s.order,s.index,s.hit?KIND[s.kind]||"ano":"ne",s.by]));
  const sum=new Map();
  (scans||[]).forEach(s=>{const k=s.code+"|"+shOpNorm(s.pos);const x=sum.get(k)||{code:s.code,pos:s.pos,qty:0,n:0,name:s.name,ean:s.ean,order:s.order,last:0};x.qty=Math.round((x.qty+s.qty)*1000)/1000;x.n+=s.n;if(s.ts>x.last)x.last=s.ts;sum.set(k,x);});
  const srows=[["Pozice","QR kód","Množství celkem","Počet načtení","Název dílu","EAN","Číslo objednávky","Naposledy"]];
  [...sum.values()].sort((a,b)=>a.pos.localeCompare(b.pos,"cs")||b.last-a.last).forEach(x=>srows.push([x.pos,x.code,x.qty,x.n,x.name,x.ean,x.order,shWhenText(x.last)]));
  return [{name:"Záznamy",rows,cols:[12,7,24,20,10,9,30,16,18,8,14,18]},{name:"Souhrn",rows:srows,cols:[24,20,14,12,30,16,18,16]}];
}
