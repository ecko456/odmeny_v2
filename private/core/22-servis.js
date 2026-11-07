/* ==========================================================================
   SERVIS: odeslání zařízení na servis (verze 2.21)
   Odeslání = předávací protokol (datum, servis, zařízení). Každá položka nese snímek údajů
   zařízení z doby odeslání (protokol se zpětně nemění) a odkaz na zařízení v evidenci.
   Zařízení vznikne při prvním odeslání; další odeslání se k němu přiřadí podle interního ID,
   výrobního čísla nebo dodatečného označení. Z položek je historie: kolikrát a jak často
   zařízení jezdí na servis a jak dlouho tam je.
   ========================================================================== */
const SV_MAX_ITEMS=60;
/* Účel odeslání a zaškrtávané závady (u položky, zadání uživatele). */
const SV_PURPOSE=[["repair","K opravě"],["scrap","K vyřazení"]];
const SV_FAULTS=[["start","Nelze spustit"],["rpm","Nedrží stabilně otáčky"],["heat","Přehřívá se"],["vibr","Nadměrné rezonance – nejde dlouho držet v ruce"],["damage","Poškozené zařízení"]];
const SV_FAULT_KEYS=SV_FAULTS.map(x=>x[0]);
/* Text poznámky do protokolu, když jsou nečitelná obě čísla. */
const SV_MARK_TEXT="Interní ID i výrobní číslo jsou nečitelné, proto bylo zařízení dodatečně označeno na spodní stěně horního krytu, kde je řídicí jednotka.";
function blankService(){return {devices:[],shipments:[],templates:[]};}
function blankSvItem(){return {dev:"",kind:"",brand:"",model:"",made:"",iid:"",sn:"",iidBad:false,snBad:false,mark:"",purpose:"repair",faults:[],fault:"",back:"",backNote:""};}
const SV_ISO=/^\d{4}-\d{2}-\d{2}$/;
function cleanService(o){
  o=o&&typeof o==="object"?o:{};
  const str=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").trim().slice(0,max);
  const iso=v=>SV_ISO.test(String(v||""))?String(v):"";
  const seen=new Set(),uniq=(v,p)=>{let x=typeof v==="string"&&SAFE_ID.test(v)?v:uid(p);while(seen.has(x))x=uid(p);seen.add(x);return x;};
  const ident=x=>{const iidBad=!!x.iidBad,snBad=!!x.snBad;
    return {kind:str(x.kind,80),brand:str(x.brand,80),model:str(x.model,80),made:str(x.made,10),iid:iidBad?"":str(x.iid,60),sn:snBad?"":str(x.sn,80),iidBad,snBad,mark:str(x.mark,60)};};
  const devices=(Array.isArray(o.devices)?o.devices:[]).filter(d=>d&&typeof d==="object").slice(0,3000)
    .map(d=>({id:uniq(d.id,"dv"),...ident(d),note:str(d.note,1000),at:Number.isFinite(+d.at)?Math.max(0,+d.at):0,by:str(d.by,60)}));
  const ids=new Set(devices.map(d=>d.id));
  const shipments=(Array.isArray(o.shipments)?o.shipments:[]).filter(x=>x&&typeof x==="object"&&iso(x.date)).slice(0,2000).map(x=>({
    id:uniq(x.id,"sv"),no:Math.round(clamp(+x.no||1,1,9999)),year:Math.round(clamp(+x.year||+String(x.date).slice(0,4),2000,2100)),
    date:iso(x.date),to:str(x.to,160),note:str(x.note,1000),by:str(x.by,60),at:Number.isFinite(+x.at)?Math.max(0,+x.at):0,
    items:(Array.isArray(x.items)?x.items:[]).filter(i=>i&&typeof i==="object").slice(0,SV_MAX_ITEMS).map(i=>{
      const back=iso(i.back);
      return {dev:ids.has(i.dev)?i.dev:"",...ident(i),purpose:i.purpose==="scrap"?"scrap":"repair",
        faults:SV_FAULT_KEYS.filter(k=>Array.isArray(i.faults)&&i.faults.includes(k)),
        fault:str(i.fault,600),back:back&&back>=x.date?back:"",backNote:str(i.backNote,300),
        /* vyřazeno servisem (2.56): s přílohou protokolu k vyřazení; vrácení pak neplatí */
        ...(svRejClean(i.rej,x.date)?{rej:svRejClean(i.rej,x.date)}:{})};
    }).map(i=>{if(i.rej){i.back="";i.backNote="";}return i;}),
    /* digitální podpis předávajícího (2.26): obrázek je šifrovaný soubor (Vault), tady jen id, jméno a kdy */
    ...(svSignClean(x.sign)?{sign:svSignClean(x.sign)}:{}),
    /* uzamčený protokol (2.53): jen když je všechno vrácené (nebo k vyřazení) */
    ...(x.lock&&typeof x.lock==="object"?{lock:{at:Number.isFinite(+x.lock.at)?Math.max(0,+x.lock.at):0,by:str(x.lock.by,60)}}:{})})).map(x=>{if(x.lock&&!svShipDone(x))delete x.lock;return x;});
  /* vzory zařízení (2.22): druh, značka a model k rychlému vyplnění položky */
  const tkeys=new Set();
  const templates=(Array.isArray(o.templates)?o.templates:[]).filter(t=>t&&typeof t==="object").slice(0,300)
    .map(t=>({id:uniq(t.id,"tp"),kind:str(t.kind,80),brand:str(t.brand,80),model:str(t.model,80)}))
    .filter(t=>{const k=svTplKey(t);if(k==="||"||tkeys.has(k))return false;tkeys.add(k);return true;});
  return {devices,shipments,templates};
}
function svTplKey(t){return [t.kind,t.brand,t.model].map(v=>String(v||"").trim().toLowerCase().replace(/\s+/g," ")).join("|");}
/* Uloží vzor (druh, značka, model); stejný vzor podruhé nepřidá. Vrací {t, existed}. */
function svAddTemplate(svc,x){
  svc.templates=svc.templates||[];
  const t={kind:String(x.kind||"").trim().slice(0,80),brand:String(x.brand||"").trim().slice(0,80),model:String(x.model||"").trim().slice(0,80)};
  if(!t.kind&&!t.brand&&!t.model)return null;
  const same=svc.templates.find(y=>svTplKey(y)===svTplKey(t));
  if(same)return {t:same,existed:true};
  const out={id:uid("tp"),...t};
  svc.templates.push(out);
  return {t:out,existed:false};
}
/* Závady položky lidsky: zaškrtnuté v pořadí seznamu a jiná závada („…; jiná: …“). */
function svFaultText(i){
  const list=SV_FAULTS.filter(([k])=>(i.faults||[]).includes(k)).map(x=>x[1]);
  if(i.fault)list.push(list.length?"jiná: "+i.fault:i.fault);
  return list.join(", ");
}
function svPurposeText(i){return i.purpose==="scrap"?"k vyřazení":"k opravě";}
/* Porovnání čísel: bez mezer, pomlček, teček a lomítek, velkými písmeny. */
function svKey(v){return String(v||"").toUpperCase().replace(/[\s\-_.\/\\]+/g,"");}
/* Číslo protokolu „2026/001“. */
function svNo(x){return x.year+"/"+String(x.no).padStart(3,"0");}
function svNextNo(svc,year){return Math.max(0,...svc.shipments.filter(x=>x.year===year).map(x=>x.no))+1;}
/* Zařízení v evidenci podle čitelného interního ID, výrobního čísla, nebo dodatečného označení.
   Interní ID rozhoduje (2.22.2): podle výrobního čísla nebo označení se najde jen zařízení, které
   nemá jiné čitelné interní ID. */
function svFindDevice(svc,x){return svFinder(svc)(x);}
/* Jak se zařízení jmenuje: druh, značka a model; identifikace ID, v. č. nebo označení. */
function svDevName(d){return [d.kind,[d.brand,d.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ")||"Zařízení";}
function svDevIdent(d){
  const out=[];
  if(d.iid)out.push("ID "+d.iid);else if(d.iidBad)out.push("ID nečitelné");
  if(d.sn)out.push("v. č. "+d.sn);else if(d.snBad)out.push("v. č. nečitelné");
  if(d.mark)out.push("označení "+d.mark);
  return out.join(" · ");
}
/* Položka je identifikovatelná: čitelné ID nebo výrobní číslo, nebo dodatečné označení. */
function svItemProblem(i){
  if(!i.kind&&!i.brand&&!i.model&&!i.iid&&!i.sn&&!i.mark&&!i.iidBad&&!i.snBad)return "prázdná položka";
  if(!i.iidBad&&!i.iid&&!i.snBad&&!i.sn&&!i.mark)return "chybí interní ID nebo výrobní číslo";
  if(i.iidBad&&i.snBad&&!i.mark)return "obě čísla jsou nečitelná: doplň dodatečné označení";
  return "";
}
/* Duplicity (2.22.1, pravidla 2.22.2). Klíče: čitelné interní ID (i:), čitelné výrobní číslo (s:)
   a dodatečné označení (m:), bez mezer a pomlček, velkými (svKey). */
function svIdKeys(x){
  return {i:!x.iidBad&&svKey(x.iid)||"",s:!x.snBad&&svKey(x.sn)||"",m:svKey(x.mark)};
}
function svDupKeys(x){
  const k=svIdKeys(x);
  return [k.i&&"i:"+k.i,k.s&&"s:"+k.s,k.m&&"m:"+k.m].filter(Boolean);
}
/* Je to stejné zařízení? Interní ID rozhoduje: dvě čitelná a různá interní ID jsou vždy dvě
   zařízení, i když mají stejné výrobní číslo nebo označení. Jinak stačí stejné interní ID,
   výrobní číslo nebo označení. Vrací klíč shody („s:SN1“), nebo "". */
function svSameK(a,b){
  if(a.i&&b.i)return a.i===b.i?"i:"+a.i:"";
  if(a.s&&a.s===b.s)return "s:"+a.s;
  if(a.m&&a.m===b.m)return "m:"+a.m;
  return "";
}
function svSameKey(a,b){return svSameK(svIdKeys(a),svIdKeys(b));}
/* Klíč lidsky („interní ID B-12“) a proč jsou dvě věci stejné („stejné interní ID B-12“). */
function svKeyText(key,x){
  const t=key.slice(0,2);
  return t==="i:"?"interní ID "+x.iid:t==="s:"?"výrobní číslo "+x.sn:"dodatečné označení "+x.mark;
}
function svDupWhy(key,x,dv){
  if(key.startsWith("d:"))return "stejné zařízení z evidence"+(dv?": "+svDevName(dv)+(svDevIdent(dv)?" ("+svDevIdent(dv)+")":""):"");
  return "stejné "+svKeyText(key,x);
}
/* Souvislé skupiny z dvojic [a, b] (n věcí). Skupiny po dvou a víc v pořadí prvního výskytu. */
function svComponents(n,pairs){
  const par=Array.from({length:n},(_,i)=>i);
  const find=i=>{while(par[i]!==i){par[i]=par[par[i]];i=par[i];}return i;};
  pairs.forEach(([a,b])=>{const x=find(a),y=find(b);if(x!==y)par[Math.max(x,y)]=Math.min(x,y);});
  const by=new Map();
  for(let i=0;i<n;i++){const r=find(i);if(!by.has(r))by.set(r,[]);by.get(r).push(i);}
  return [...by.values()].filter(g=>g.length>1).sort((a,b)=>a[0]-b[0]);
}
/* Klíče zařízení v evidenci → zařízení (v pořadí evidence). */
function svDevIndex(svc){
  const idx=new Map();
  (svc.devices||[]).forEach(d=>svDupKeys(d).forEach(k=>{if(!idx.has(k))idx.set(k,[]);idx.get(k).push(d);}));
  return idx;
}
/* Hledání v evidenci jedním průchodem (svFindDevice pro hodně položek najednou). */
function svFinder(svc){
  const idx=svDevIndex(svc);
  return x=>{
    const k=svIdKeys(x);
    if(k.i&&idx.has("i:"+k.i))return idx.get("i:"+k.i)[0];
    const ok=d=>!(k.i&&svIdKeys(d).i);   // jiné čitelné interní ID = jiné zařízení
    if(k.s){const d=(idx.get("s:"+k.s)||[]).find(ok);if(d)return d;}
    if(k.m){const d=(idx.get("m:"+k.m)||[]).find(ok);if(d)return d;}
    return null;
  };
}
/* Ke kterému zařízení z evidence položky protokolu patří:
   - položka s odkazem (vybraná z evidence, nebo z upravovaného protokolu) u něj zůstává;
     jiné interní ID než zařízení je oprava čísla (nebo evidence byla mezitím opravená),
     ledaže na stejné zařízení odkazuje i jiná položka: pak odkaz drží jen ta se shodným ID
     a ostatní se hledají podle svých čísel (verze 2.21 a 2.22 takhle omylem spojily dvě
     zařízení se stejným výrobním číslem);
   - jinak podle čísel (svFindDevice). Prázdné položky → null. */
function svOwners(svc,items){
  const find=svFinder(svc);
  const byId=new Map((svc.devices||[]).map(d=>[d.id,d]));
  const live=items.map(it=>!!it&&svItemProblem(it)!=="prázdná položka");
  const linked=items.map((it,i)=>live[i]&&it.dev&&byId.get(it.dev)||null);
  return items.map((it,i)=>{
    if(!live[i])return null;
    const l=linked[i];
    if(l){
      const a=svIdKeys(it).i,b=svIdKeys(l).i;
      if(!(a&&b&&a!==b))return l;
      if(!linked.some((x,j)=>j!==i&&x===l))return l;
    }
    return find(it);
  });
}
/* Kontrola duplicit v protokolu:
   - match[i]: se kterými položkami je i-tá stejné zařízení, [{j, why}] (svSameKey, nebo stejné
     zařízení z evidence podle svOwners);
   - groups: souvislé skupiny duplicit [{idx, why}] (kvůli pořadí nahoře pod sebou);
   - clash: číslo položky má v evidenci jiné zařízení, které je podle pravidel stejné (uložením
     by se v evidenci zařízení zdvojilo), [{i, dev, what:"výrobní číslo SN-1"}]. Duplicita, která
     už v evidenci je, protokol neblokuje (ukazuje ji evidence);
   - own: zařízení z evidence ke každé položce (svOwners).
   Prázdné položky se nepočítají. */
function svDupCheck(svc,items){
  const idx=svDevIndex(svc);
  const own=svOwners(svc,items);
  const keys=items.map(it=>it?svIdKeys(it):null);
  const live=own.map((o,i)=>!!items[i]&&svItemProblem(items[i])!=="prázdná položka");
  const match=items.map(()=>[]),pairs=[];
  for(let a=0;a<items.length;a++){
    if(!live[a])continue;
    for(let b=a+1;b<items.length;b++){
      if(!live[b])continue;
      let k=svSameK(keys[a],keys[b]);
      if(!k&&own[a]&&own[a]===own[b])k="d:"+own[a].id;
      if(!k)continue;
      const why=svDupWhy(k,items[a],k.startsWith("d:")?own[a]:null);
      match[a].push({j:b,why});match[b].push({j:a,why});pairs.push([a,b,why]);
    }
  }
  const groups=svComponents(items.length,pairs).map(idx=>({idx,why:(pairs.find(p=>p[0]===idx[0]||p[1]===idx[0])||[])[2]||""}));
  const clash=[];
  items.forEach((it,i)=>{
    const o=own[i];
    if(!o)return;
    const seen=new Set([o]);
    for(const k of svDupKeys(it))for(const d of idx.get(k)||[]){
      if(seen.has(d))continue;
      seen.add(d);
      const key=svSameKey(it,d);
      if(key&&!svSameKey(o,d)){clash.push({i,dev:d,what:svKeyText(key,it)});return;}
    }
  });
  return {groups,match,clash,own};
}
/* Pořadí, ve kterém jdou duplicity nahoru: skupiny za sebou (členové pod sebou), pak položky se
   shodou v evidenci, pak ostatní v původním pořadí. Vrací pole původních indexů. */
function svDupOrder(n,groups,clash){
  const first=[...groups.flatMap(g=>g.idx),...(clash||[]).map(c=>c.i)].filter((v,j,a)=>a.indexOf(v)===j);
  const set=new Set(first);
  return [...first,...Array.from({length:n},(_,i)=>i).filter(i=>!set.has(i))];
}
/* Zařízení v evidenci, která jsou podle pravidel stejná (stejné interní ID, nebo stejné výrobní
   číslo či označení, když jedno z nich interní ID nemá). Vrací {groups: [{ids, why}], match:
   Map id → [{id, why}]}. Porovnávají se jen zařízení se společným klíčem. */
function svDevDups(svc){
  const list=svc.devices||[];
  const keys=list.map(svIdKeys);
  const idx=new Map();
  list.forEach((d,n)=>svDupKeys(d).forEach(k=>{if(!idx.has(k))idx.set(k,[]);idx.get(k).push(n);}));
  const pairs=[],seen=new Set();
  idx.forEach(ns=>{
    for(let a=0;a<ns.length;a++)for(let b=a+1;b<ns.length;b++){
      const x=Math.min(ns[a],ns[b]),y=Math.max(ns[a],ns[b]),pk=x+","+y;
      if(seen.has(pk))continue;
      seen.add(pk);
      const k=svSameK(keys[x],keys[y]);
      if(k)pairs.push([x,y,svDupWhy(k,list[x],null)]);
    }
  });
  const match=new Map();
  pairs.forEach(([x,y,why])=>{
    [[x,y],[y,x]].forEach(([p,q])=>{if(!match.has(list[p].id))match.set(list[p].id,[]);match.get(list[p].id).push({id:list[q].id,why});});
  });
  const groups=svComponents(list.length,pairs).map(g=>({ids:g.map(i=>list[i].id),why:match.get(list[g[0]].id)[0].why}));
  return {groups,match};
}
/* Uložení odeslání (nové i upravené). Položky bez odkazu najdou zařízení v evidenci, nebo ho
   založí; evidence se doplní o novější údaje z položky. Vrací {ship, created[]}. */
/* Podpis předávajícího (2.26): {file: id šifrovaného PNG, name, at, by}; bez platného id null. */
const SV_FILE_ID=/^[0-9a-f]{32}$/;
/** Protokol je vyřízený (2.53): má zařízení a každé je vrácené, nebo jde k vyřazení. Jen ten jde uzamknout. */
function svShipDone(x){return !!(x&&x.items&&x.items.length&&x.items.every(i=>i.back||i.rej||i.purpose==="scrap"));}
/* Vyřazeno servisem (2.56): {date, note, files[] (šifrované díly přílohy), name, type, size, at, by}.
   Příloha je PDF nebo fotka protokolu k vyřazení, bez ní záznam neplatí. */
const SV_REJ_TYPES=["application/pdf","image/jpeg","image/png"];
const SV_REJ_PARTS=12;
function svRejClean(r,shipDate){
  if(!r||typeof r!=="object"||!SV_ISO.test(String(r.date||"")))return null;
  const date=String(r.date);
  if(shipDate&&date<shipDate)return null;
  const files=(Array.isArray(r.files)?r.files:[]).map(String).filter(f=>SV_FILE_ID.test(f)).slice(0,SV_REJ_PARTS);
  if(!files.length)return null;
  const txt=(v,m)=>String(v==null?"":v).replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,m);
  return {date,note:txt(r.note,300),files,name:txt(r.name,120)||"protokol",type:SV_REJ_TYPES.includes(r.type)?r.type:"application/pdf",
    size:Number.isFinite(+r.size)?Math.max(0,Math.round(+r.size)):0,at:Number.isFinite(+r.at)?Math.max(0,+r.at):0,by:txt(r.by,60)};
}
function svSignClean(x){
  if(!x||typeof x!=="object"||!SV_FILE_ID.test(String(x.file||"")))return null;
  const name=String(x.name==null?"":x.name).replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,80);
  return name?{file:String(x.file),name,at:Number.isFinite(+x.at)?Math.max(0,+x.at):0,by:String(x.by==null?"":x.by).slice(0,60)}:null;
}
/* Soubory Servisu (podpisy) do zálohy. */
function svFileIds(st){return [...new Set((((st||S).service||{}).shipments||[]).flatMap(x=>[x.sign&&x.sign.file,...(x.items||[]).flatMap(i=>i&&i.rej?i.rej.files:[])]).filter(Boolean))];}
function svSaveShipment(svc,draft,meta){
  meta=meta||{};
  const clean=cleanService({devices:svc.devices,shipments:[{...draft,id:draft.id||"x",no:1,year:+String(draft.date).slice(0,4)}]});
  const src=clean.shipments[0];
  if(!src)throw new Error("Datum odeslání chybí.");
  const items=src.items.map((it,j)=>({...it,dev:(draft.items[j]&&draft.items[j].dev)||it.dev}));
  const created=[];
  // upravovaný protokol: do evidence jde jen to, co se v položce teď změnilo (jinak by starší
  // protokol přepsal novější údaje, třeba interní ID opravené v evidenci)
  const orig=draft.id&&svc.shipments.find(x=>x.id===draft.id);
  const origOf=it=>orig?orig.items.find(o=>o.dev&&o.dev===it.dev&&svKey(o.iid)===svKey(it.iid))||orig.items.find(o=>o.dev&&o.dev===it.dev)||null:null;
  const owners=svOwners(svc,items);
  items.forEach((it,j)=>{
    let d=owners[j]||svFindDevice(svc,it),o=origOf(it);
    if(!d){d={id:uid("dv"),kind:"",brand:"",model:"",made:"",iid:"",sn:"",iidBad:false,snBad:false,mark:"",note:"",at:meta.at||Date.now(),by:meta.by||""};svc.devices.push(d);created.push(d);o=null;}
    else if(o&&o.dev!==d.id)o=null;
    const same=k=>!!o&&String(o[k]||"")===String(it[k]||"");
    // evidence = poslední známé údaje; prázdné pole v položce nic nesmaže a jinak zapsané
    // stejné číslo („x9“ proti „X-9“) evidenci nepřepíše
    ["kind","brand","model","made"].forEach(k=>{if(it[k]&&!same(k))d[k]=it[k];});
    if(it.mark&&!same("mark")&&svKey(it.mark)!==svKey(d.mark))d.mark=it.mark;
    if(!(same("iid")&&same("iidBad"))){if(it.iid){if(svKey(it.iid)!==svKey(d.iid))d.iid=it.iid;d.iidBad=false;}else if(it.iidBad&&!d.iid)d.iidBad=true;}
    if(!(same("sn")&&same("snBad"))){if(it.sn){if(svKey(it.sn)!==svKey(d.sn))d.sn=it.sn;d.snBad=false;}else if(it.snBad&&!d.sn)d.snBad=true;}
    it.dev=d.id;
  });
  const year=+src.date.slice(0,4);
  let ship=draft.id&&svc.shipments.find(x=>x.id===draft.id);
  if(ship){
    if(ship.year!==year){ship.year=year;ship.no=svNextNo({shipments:svc.shipments.filter(x=>x!==ship)},year);}
    Object.assign(ship,{date:src.date,to:src.to,note:src.note,items});
  }else{
    ship={id:uid("sv"),no:svNextNo(svc,year),year,date:src.date,to:src.to,note:src.note,by:meta.by||"",at:meta.at||Date.now(),items};
    svc.shipments.push(ship);
  }
  return {ship,created};
}
/* Historie zařízení: odeslání od nejstaršího, počet, dny na servisu, průměrný odstup odeslání
   a zda je teď na servisu (poslední odeslání bez vrácení). */
function svHistory(svc,devId,today){
  today=today||todayIso();
  const list=svc.shipments.flatMap(x=>x.items.filter(i=>i.dev===devId).map(i=>({ship:x,item:i})))
    .sort((a,b)=>a.ship.date.localeCompare(b.ship.date)||a.ship.at-b.ship.at);
  const done=list.filter(h=>h.item.back&&!h.item.rej&&h.item.purpose!=="scrap");
  const days=done.map(h=>daysBetween(h.ship.date,h.item.back));
  const gaps=list.slice(1).map((h,i)=>daysBetween(list[i].ship.date,h.ship.date));
  const last=list[list.length-1]||null;
  // odesláno k vyřazení = zařízení je vyřazené (na servisu se nepočítá, pokud se nevrátilo)
  // vyřazeno servisem (2.56) = vyřazené ke dni z protokolu servisu
  const retired=last&&last.item.rej?last.item.rej.date:last&&last.item.purpose==="scrap"&&!last.item.back?last.ship.date:"";
  const out=!!(last&&!last.item.back&&!retired);
  return {list,count:list.length,first:list[0]?list[0].ship.date:"",last:last?last.ship.date:"",
    out,outDays:out?daysBetween(last.ship.date,today):0,retired,rejBy:!!(last&&last.item.rej),
    avgDays:days.length?Math.round(days.reduce((a,b)=>a+b,0)/days.length):null,
    totalDays:days.reduce((a,b)=>a+b,0),
    avgGap:gaps.length?Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length):null,
    year:list.filter(h=>h.ship.date>=addDays(today,-365)).length};
}
/* Historie změn v Servisu. */
function svChanges(A,B,add){
  A=A||blankService();B=B||blankService();
  const dev=(svc,id)=>svc.devices.find(d=>d.id===id);
  const nm=(svc,i)=>{const d=dev(svc,i.dev)||i;return svDevName(d)+(svDevIdent(i)?" ("+svDevIdent(i)+")":"");};
  const ma=new Map(A.shipments.map(x=>[x.id,x]));
  B.shipments.forEach(x=>{
    const o=ma.get(x.id);
    const head="Servis "+svNo(x);
    if(!o){add("service","Servis: odeslání "+svNo(x)+" ("+dayText(x.date)+(x.to?", "+x.to:"")+"): "+x.items.length+" zařízení – "+x.items.map(i=>nm(B,i)+(i.purpose==="scrap"?" k vyřazení":"")).join("; "),{m:"svs:"+x.id});return;}
    const key=i=>JSON.stringify([i.dev,i.kind,i.brand,i.model,i.made,i.iid,i.sn,i.iidBad,i.snBad,i.mark,i.purpose,i.faults,i.fault]);
    if(o.date!==x.date||o.to!==x.to||o.note!==x.note||JSON.stringify(o.items.map(key))!==JSON.stringify(x.items.map(key)))
      add("service",head+": upraven protokol ("+dayText(x.date)+(x.to?", "+x.to:"")+", "+x.items.length+" zařízení)",{m:"svs:"+x.id});
    if(!!o.lock!==!!x.lock)add("service",head+(x.lock?": protokol uzamčen (vše vráceno)":": protokol odemčen"),{m:"svlock:"+x.id});
    const sa=o.sign||null,sb=x.sign||null;
    if((sa&&sa.file)!==(sb&&sb.file))add("service",sb?head+": podepsal předávající "+sb.name+(sa?" (nový podpis)":""):head+": odebrán podpis předávajícího ("+sa.name+")",{m:"svsign:"+x.id});
    x.items.forEach(i=>{
      const p=o.items.find(y=>y.dev===i.dev);
      if(!p)return;
      const ra=p.rej||null,rb=i.rej||null;
      if(JSON.stringify(ra)!==JSON.stringify(rb)){
        if(rb)add("service",head+": vyřazeno servisem "+dayText(rb.date)+" – "+nm(B,i)+" (protokol k vyřazení: "+rb.name+")"+(rb.note?" · "+rb.note:""),{m:"svr:"+x.id+":"+i.dev});
        else add("service",head+": zrušeno vyřazení servisem – "+nm(B,i),{m:"svr:"+x.id+":"+i.dev});
      }
      if(p.back===i.back&&p.backNote===i.backNote||rb||ra&&!i.back)return;
      if(i.back)add("service",head+": vráceno ze servisu "+dayText(i.back)+" – "+nm(B,i)+(i.backNote?" ("+i.backNote+")":""),{m:"svb:"+x.id+":"+i.dev});
      else add("service",head+": zrušeno vrácení – "+nm(B,i),{m:"svb:"+x.id+":"+i.dev});
    });
  });
  A.shipments.forEach(x=>{if(!B.shipments.some(y=>y.id===x.id))add("service","Servis: smazán protokol "+svNo(x)+" ("+dayText(x.date)+", "+x.items.length+" zařízení)",{m:"svs:"+x.id});});
  const FIELDS={kind:"druh",brand:"značka",model:"model",made:"rok výroby",iid:"interní ID",sn:"výrobní číslo",iidBad:"ID nečitelné",snBad:"v. č. nečitelné",mark:"dodatečné označení",note:"poznámka"};
  const da=new Map(A.devices.map(d=>[d.id,d]));
  B.devices.forEach(d=>{
    const o=da.get(d.id);
    if(!o)return;   // nové zařízení je v záznamu o odeslání
    const ch=Object.keys(FIELDS).filter(k=>o[k]!==d[k]);
    if(ch.length)add("service","Servis – zařízení "+svDevName(d)+": upravené údaje – "+ch.map(k=>FIELDS[k]).join(", "),{m:"svd:"+d.id+":"+ch.join()});
  });
  A.devices.forEach(d=>{if(!B.devices.some(y=>y.id===d.id))add("service","Servis: smazáno zařízení "+svDevName(d)+(svDevIdent(d)?" ("+svDevIdent(d)+")":""),{m:"svd:"+d.id});});
  const ta=A.templates||[],tb=B.templates||[];
  tb.forEach(t=>{if(!ta.some(y=>y.id===t.id))add("service","Servis: nový vzor zařízení "+svDevName(t),{m:"svt:"+t.id});});
  ta.forEach(t=>{if(!tb.some(y=>y.id===t.id))add("service","Servis: smazán vzor zařízení "+svDevName(t),{m:"svt:"+t.id});});
}

