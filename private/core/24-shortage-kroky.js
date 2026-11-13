/* ================= Shortage ve třech krocích (2.61) =================
   1. urgentní díly (barva výplně EANu → TOP / TOP 2), 2. výrobní plán (poddíly sestav),
   3. evidence pohybu (poslední záznamy). Sloupce každého importu navrhne AI z nadpisů prvních
   řádků (jen nadpisy a typy buněk), bez AI odhad podle nadpisů; nastavení se pamatuje. */
const SH_COLS={
  list:{order:"A",name:"B",ean:"C",index:"D",qty:"E",top:"G",op:"H",note:""},
  planItem:{ean:"A",order:"",index:"",op:"",qty:""},
  plan:{asm:"A",sub:"E",index:"H",order:"M",op:"AM",qty:""},
  move:{code:"A",when:"B",qty:"C",state:"D",op:""},
  // Po termínu (2.79): tabulka položek po termínu, ve sloupci F skluz (čím větší, tím hůř)
  late:{order:"A",name:"B",ean:"C",index:"D",qty:"E",delay:"F",op:"",note:""},
};
const SH_URGENT_COLS={order:"F",name:"C",ean:"A",index:"G",qty:"H",top:"",op:"S",note:"S"};
const SH_MAX_CLIP_COLS=80;
function shListBase(rows,saved){
  const width=Math.max(0,...(rows||[]).slice(0,50).map(r=>(r||[]).length));
  const sig=c=>{const {note,noteChosen,...rest}=shColsClean("list",c);return JSON.stringify(rest);};
  // Vlastní ruční mapování zachovat, pokud se jeho sloupce do tabulky vejdou.
  if(saved&&sig(saved)!==sig(SH_COLS.list)&&sig(saved)!==sig(SH_URGENT_COLS)
    &&Object.values(shColIdx("list",saved)).every(i=>i<width))return {...saved,note:saved.noteChosen?saved.note:(saved.note||(width>=19?'S':''))};
  const base=width>=19?SH_URGENT_COLS:SH_COLS.list;
  return saved&&sig(saved)===sig(base)&&saved.noteChosen?{...base,note:saved.note,noteChosen:true}:base;
}
const SH_COL_NEED={list:["ean"],planItem:["ean"],plan:["asm","sub"],move:["code","when"],late:["ean","delay"]};
const SH_COL_NAMES={
  list:{order:"Číslo objednávky",name:"Název dílu",ean:"EAN (s odkazem, barva = TOP)",index:"Index",qty:"Urgentní množství",top:"TOP (text)",op:"Oddělení / operace v procesu",note:"Poznámka od plánování"},
  planItem:{ean:"EAN dílu (s odkazem)",order:"Číslo objednávky",index:"Line / index",op:"Probíhající operace (volitelné)",qty:"Množství zakázky (volitelné)"},
  plan:{asm:"EAN sestavy",sub:"EAN poddílu (s odkazem)",index:"Index",order:"Číslo objednávky",op:"Probíhající operace",qty:"Množství zakázky (volitelné)"},
  move:{code:"QR kód",when:"Datum a čas",qty:"Počet ks",state:"Stav",op:"Operace / pracoviště"},
  late:{order:"Číslo objednávky",name:"Název dílu",ean:"EAN (s odkazem)",index:"Index",qty:"Množství",delay:"Skluz (čím větší, tím hůř)",op:"Oddělení / operace v procesu",note:"Poznámka"},
};
const SH_COL_WORDS={
  list:{order:/objedn|zakaz/,name:/nazev|popis|^dil\b/,ean:/\bean\b|carov/,index:/^index|^idx|\bline\b|^radek\b|cislo radku/,qty:/mnozstv|urgent|^ks\b|pocet/,top:/^top\b|priorit/,op:/operac|probih|oddeleni|kde.*proces/,note:/poznam|planovan/},
  // „Množství zakázky“ není číslo objednávky (2.71): objednávka bez slov o množství
  planItem:{ean:/\bean\b|carov/,order:/^(?!.*(mnozstv|pocet|\bks\b|\bqty\b)).*(objedn|zakaz|\border\b)/,index:/^index|^idx|\bline\b|^radek\b|cislo radku/,op:/probih|operac/,qty:/mnozstv|^pocet|\bks\b|\bqty\b|quantity/},
  plan:{asm:/sestav/,sub:/poddil|komponent/,index:/^index|^idx|\bline\b|^radek\b|cislo radku/,order:/^(?!.*(mnozstv|pocet|\bks\b|\bqty\b)).*(objedn|zakaz)/,op:/probih|operac/,qty:/mnozstv|^pocet|\bks\b|\bqty\b|quantity/},
  move:{code:/\bqr\b|barcode|^kod/,when:/datum|\bcas\b|time/,qty:/\bks\b|mnozstv|pocet/,state:/stav|status|udalost/,op:/operac|pracovist/},
  late:{order:/^(?!.*skluz).*(objedn|zakaz)/,name:/nazev|popis|^dil\b/,ean:/\bean\b|carov/,index:/^index|^idx|\bline\b|^radek\b|cislo radku/,qty:/mnozstv|^ks\b|pocet/,delay:/skluz|zpozd|prodlen|po termin|dni po|delay|overdue/,op:/operac|probih|oddeleni|kde.*proces/,note:/poznam/},
};
const SH_TIERS=["top","top2","none","done"],SH_MAX_COLORS=40;   // done = Hotovo (2.76)
/** Barva jako šest číslic HEX velkými (FF0000), jinak "". Bílá a bez výplně = "". */
function shHex(v){const t=String(v==null?"":v).trim().replace(/^#/,"").toUpperCase();const h=/^[0-9A-F]{8}$/.test(t)?t.slice(2):t;return /^[0-9A-F]{6}$/.test(h)&&h!=="FFFFFF"?h:"";}
function shColLetter(v){const t=String(v==null?"":v).trim().toUpperCase();return /^[A-Z]{1,3}$/.test(t)?t:"";}
/** Uložené sloupce importu: písmena polí (prázdné = není), u plánu i název listu. */
function shColsClean(kind,c){
  c=c&&typeof c==="object"?c:{};
  const out={};
  Object.keys(SH_COLS[kind]).forEach(f=>{out[f]=f in c?shColLetter(c[f]):SH_COLS[kind][f];});
  SH_COL_NEED[kind].forEach(f=>{if(!out[f])out[f]=SH_COLS[kind][f];});
  if(kind==="plan"||kind==="planItem")out.sheet=String(c.sheet==null?"":c.sheet).replace(/[\u0000-\u001F\u007F]/g," ").trim().slice(0,80);
  if(kind==="planItem")out.matchVersion=c.matchVersion===1?1:0;
  if(kind==="list")out.noteChosen=c.noteChosen===true;
  // přednastavení (2.78): nadpisy vybraných sloupců v potvrzeném souboru a kdo ho uložil
  const hd={};
  if(c.heads&&typeof c.heads==="object")Object.keys(SH_COLS[kind]).forEach(f=>{const v=String(c.heads[f]==null?"":c.heads[f]).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,80);if(v&&out[f])hd[f]=v;});
  if(Object.keys(hd).length)out.heads=hd;
  if(c.set&&typeof c.set==="object"&&Number.isFinite(+c.set.at)&&+c.set.at>0)out.set={at:Math.round(+c.set.at),by:String(c.set.by==null?"":c.set.by).replace(/[\u0000-\u001F\u007F]/g," ").trim().slice(0,60)};
  return out;
}
/* ---------- Přednastavení sloupců (2.78) ----------
   Po potvrzení sloupců se ke každému vybranému sloupci uloží jeho nadpis. Další soubor se stejnými
   nadpisy na stejných místech se načte rovnou podle přednastavení (bez AI a bez okna, kolega nic
   nevybírá); když jsou stejné nadpisy jinde, sloupce se najdou podle nich. Jinak navrhne AI a ukáže se
   okno s upozorněním, že soubor neodpovídá přednastavení. */
const shHeadNorm=v=>String(v==null?"":v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
/** Jen písmena sloupců (a volby), bez listu, nadpisů a autora: na porovnání návrhu s přednastavením. */
function shColsLetters(kind,c){const {sheet,heads,set,...rest}=shColsClean(kind,c);return JSON.stringify(rest);}
/** Nadpisy vybraných sloupců z řádku header (aoa = řádky hodnot). */
function shColsHeads(kind,cols,aoa,header){
  const row=(aoa||[])[Math.max(0,header|0)]||[],c=shColsClean(kind,cols),out={};
  Object.keys(SH_COLS[kind]).forEach(f=>{if(c[f]){const v=row[waIndex(c[f])];const t=String(v==null?"":(v&&typeof v==="object"?v.text:v)).replace(/\s+/g," ").trim().slice(0,80);if(t)out[f]=t;}});
  return out;
}
/**
 * Soubor proti přednastavení: aoa = první řádky souboru. Vrací {how: "same" | "moved", cols, header,
 * moved: [pole]} nebo null (bez přednastavení, nadpisy nesedí). Platí jen přednastavení, které má nadpisy
 * aspoň u dvou sloupců a u všech povinných polí.
 */
function shColsPreset(kind,preset,aoa){
  if(!preset||!preset.heads)return null;
  const c=shColsClean(kind,preset),heads=c.heads||{},fields=Object.keys(heads);
  if(fields.length<2||SH_COL_NEED[kind].some(f=>!heads[f]))return null;
  const used=Object.keys(SH_COLS[kind]).filter(f=>c[f]);
  const rows=(aoa||[]).slice(0,10).map(r=>(r||[]).map(v=>shHeadNorm(v&&typeof v==="object"?v.text:v)));
  // stejné nadpisy na stejných místech
  for(let h=0;h<rows.length;h++){
    if(fields.every(f=>rows[h][waIndex(c[f])]===shHeadNorm(heads[f])))return {how:"same",cols:c,header:h,moved:[]};
  }
  // stejné nadpisy jinde: každý nadpis v řádku právě jednou a sloupec bez nadpisu v přednastavení nesmí být
  if(used.some(f=>!heads[f]))return null;
  for(let h=0;h<rows.length;h++){
    const at={};let ok=true;
    for(const f of fields){const want=shHeadNorm(heads[f]);const idx=rows[h].map((v,i)=>v===want?i:-1).filter(i=>i>=0);if(idx.length!==1){ok=false;break;}at[f]=colLetter(idx[0]);}
    if(!ok||new Set(Object.values(at)).size!==fields.length)continue;
    const cols={...c};fields.forEach(f=>{cols[f]=at[f];});
    return {how:"moved",cols:shColsClean(kind,cols),header:h,moved:fields.filter(f=>at[f]!==c[f])};
  }
  return null;
}
/** Sloupce jako indexy od 0 (-1 = pole v souboru není). */
function shColIdx(kind,cols){
  const c=shColsClean(kind,cols||SH_COLS[kind]),out={};
  Object.keys(SH_COLS[kind]).forEach(f=>{out[f]=c[f]?waIndex(c[f]):-1;});
  return out;
}
/** Uložené sloupce importu, jinak výchozí. */
function shColsOf(kind,sh){return shColsClean(kind,((sh||S.shortage||{}).cols||{})[kind]||SH_COLS[kind]);}
/**
 * Odhad sloupců podle nadpisů v prvních řádcích (aoa = řádky hodnot). Hledá řádek s nejvíc
 * poznanými nadpisy; co nenajde, nechá z uloženého nastavení. Vrací {cols, header, found}.
 */
function shColsGuess(kind,aoa,base){
  if(kind==="list")base=shListBase(aoa,base);
  const n=s=>String(s==null?"":s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
  const words=SH_COL_WORDS[kind],fields=Object.keys(words);
  let best={hits:0,row:-1,map:{}};
  (aoa||[]).slice(0,10).forEach((r,ri)=>{
    const map={},used=new Set();
    fields.forEach(f=>{
      const k=(r||[]).findIndex((v,ci)=>!used.has(ci)&&typeof v==="string"&&words[f].test(n(v)));
      if(k>=0){map[f]=colLetter(k);used.add(k);}
    });
    // „EAN sestavy“ a „EAN poddílu“: první EAN bez upřesnění je sestava, druhý poddíl
    if(kind==="plan"){
      const eans=(r||[]).map((v,ci)=>typeof v==="string"&&/\bean\b/.test(n(v))&&!used.has(ci)?ci:-1).filter(ci=>ci>=0);
      if(!map.asm&&eans.length){map.asm=colLetter(eans.shift());}
      if(!map.sub&&eans.length){map.sub=colLetter(eans.shift());}
    }
    if(kind==="move"&&!map.code){const ci=(r||[]).findIndex((v,c)=>!used.has(c)&&typeof v==="string"&&/\bean\b|kod/.test(n(v)));if(ci>=0)map.code=colLetter(ci);}
    // Hodnoty jako index „TOP“ nebo název „Držák urgent“ nejsou hlavička.
    if(kind==="list"&&!map.ean&&!(map.name&&map.order))return;
    const hits=Object.keys(map).length;
    if(hits>best.hits)best={hits,row:ri,map};
  });
  const found=best.hits>=(kind==="planItem"?1:2);
  const cols=shColsClean(kind,{...shColsClean(kind,base||SH_COLS[kind]),...(found?best.map:{}),...(kind==="list"&&base&&base.noteChosen?{note:base.note,noteChosen:true}:{})});
  return {cols,header:found?best.row:-1,found:found?Object.keys(best.map):[]};
}
/** Návrh AI (písmena, u plánu i list) sloučený s odhadem: prázdné pole z AI = v souboru není (jen u nepovinných). */
function shColsFromAi(kind,ai,base){
  const c={...shColsClean(kind,base)};
  if(!ai||typeof ai!=="object"||!ai.cols||typeof ai.cols!=="object")return c;
  Object.keys(SH_COLS[kind]).forEach(f=>{if(f in ai.cols){const v=shColLetter(ai.cols[f]);if(v||!SH_COL_NEED[kind].includes(f))c[f]=v;}});
  if(kind==="plan"&&typeof ai.sheet==="string"&&ai.sheet.trim())c.sheet=ai.sheet.trim().slice(0,80);
  return shColsClean(kind,c);
}
/** Barvy EANu podle vzorníku: top = TOP SHORTAGE, top2 = TOP 2, done = stav Hotovo (2.76, položka
    jde na konec seznamu); text TOP ve sloupci má přednost. meta = {at, by} pro stav. */
function shApplyColors(items,colors,meta){
  (items||[]).forEach(i=>{
    const t=i.fill&&colors?colors[i.fill]:"";
    if(t==="top"){i.top=true;i.top2=false;}
    else if(t==="top2"&&!i.top)i.top2=true;
    else if(t==="done"){i.st="done";i.stAt=(meta&&meta.at)||Date.now();i.stBy=(meta&&meta.by)||"";}
  });
  return items;
}
/** Výchozí přiřazení barvy, kterou vzorník ještě nezná: červená = TOP, oranžová a žlutá = TOP 2,
    zelená = Hotovo (2.76). */
function shColorGuess(hex){
  const h=shHex(hex);if(!h)return "none";
  const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  if(r>=170&&g<=110&&b<=110)return "top";
  if(r>=200&&g>=110&&b<=120)return "top2";
  // zelená i světle zelená (C6EFCE, E2EFDA) a žlutozelená (92D050); tyrkysová a šedá ne
  if(g>=100&&g-Math.max(r,b)>=12)return "done";
  return "none";
}
/** Standardní paleta Excelu (indexované barvy 0–63), SheetJS je u výplně nepřevede na RGB. */
const SH_INDEXED=("000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF "
  +"800000 008000 000080 808000 800080 008080 C0C0C0 808080 9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF "
  +"000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF 00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 "
  +"3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 003366 339966 003300 333300 993300 993366 333399 333333").split(" ");
function shIndexed(i){i=+i;return Number.isInteger(i)&&i>=0&&i<SH_INDEXED.length?SH_INDEXED[i]:"";}
/** Ukázka souboru pro AI: první řádky listů (rows = pole hodnot), jen nadpisy a typy buněk. */
function shAiSample(sheets){
  const txt=v=>String(v==null?"":v).trim();
  // datový řádek = číslo, datum nebo text se třemi a víc číslicemi (EAN, kód, objednávka); nadpisy jen nad ním, nejvýš první 3 řádky
  const isData=r=>(r||[]).some(v=>typeof v==="number"||v instanceof Date||(/\d.*\d.*\d/.test(txt(v))));
  const type=v=>{
    if(v==null||txt(v)==="")return v;
    if(v instanceof Date)return v;
    if(typeof v==="number")return Number.isInteger(v)?"<celé číslo>":"<číslo>";
    const t=txt(v);
    if(/^\d{1,2}:\d{2}(:\d{2})?$/.test(t))return "<čas>";
    const d=dvDateAny(t);if(d)return "<datum "+d+">";
    return /\d/.test(t)?"<text s číslicemi>":"<text>";
  };
  return dvAiSample((sheets||[]).map(sh=>{
    const rows=(sh.rows||[]).filter(r=>Array.isArray(r)&&r.some(c=>txt(c)!==""));
    let at=rows.findIndex(isData);if(at<0||at>3)at=Math.min(3,rows.length);
    return {name:sh.name,aoa:rows.map((r,i)=>i<at?r.map(v=>typeof v==="number"?type(v):v):r.map(type))};
  }),Object.values((S&&S.employees)||{}));
}
/**
 * Rozbor položky (2.61): co se s ní děje. cur = probíhající operace (seznam, jinak plán), last =
 * poslední záznam z evidence pohybu, subs = všechny poddíly z plánu (Hala 2 i jiné operace) se
 * záznamem, note = věta do poznámky.
 */
function shAnalysis(it,list){
  const rec=it.rec||null;
  // 2.71: množství zakázky proti odeslanému na WPA (list = seznam se záznamy „Odesláno na WPA“)
  const sent=shSentOf(list,it);
  const subs=[...(it.subs||[]).map(s=>({...s,rec:s.rec||null,hall:shSubOp(s.op),byRec:!!s.byRec,sent:shSentOf(list,s)})),
    ...(it.cands||[]).map(c=>({ean:c.ean,code:c.code,op:c.op,rec:null,hall:false,byRec:false}))];
  const cur=it.op||it.pop||"";
  const recText=r=>[r.state,r.op&&!String(r.state||"").includes(r.op)?r.op:"",r.qty?(/^[\d\s.,]+$/.test(r.qty)?r.qty+" ks":r.qty):"",r.when].filter(Boolean).join(", ");
  const noRec=subs.filter(s=>!s.rec).length;
  const parts=[cur?"Probíhá: "+cur:"Probíhající operace neuvedena",
    rec?"poslední záznam: "+recText(rec)+(rec.n>1?" ("+rec.n+(rec.n<=4?" záznamy)":" záznamů)"):""):"bez interního záznamu"];
  if(sent)parts.push(shSentText(sent));
  if(subs.length)parts.push("poddíly "+subs.length+(noRec?" ("+noRec+" bez záznamu)":", všechny se záznamem"));
  const here=subs.filter(s=>s.sent&&s.sent.st==="here").length;
  if(here)parts.push("u nás "+here+" "+(here===1?"poddíl":here<=4?"poddíly":"poddílů"));
  return {cur,last:rec,internal:!!rec,subs,noRec,sent,note:parts.join(" · ").slice(0,300),recText};
}
/** Rozbor seznamu do Excelu: položky a pod nimi všechny poddíly. */
function shAnalysisSheet(l){
  // 2.71 na konci: množství zakázky, odesláno na WPA, zbývá, díl u nás
  const rows=[["#","Typ","TOP","Číslo objednávky","Název dílu","EAN","Index","Urgentní množství","QR kód","Probíhající operace","Poslední záznam: stav","Operace v záznamu","Ks v záznamu","Datum a čas záznamu","Počet záznamů","Interní záznam","Poznámka","Rozbor","Množství zakázky","Odesláno na WPA (ks)","Zbývá (ks)","Díl u nás","Předchozí záznamy"]];
  const qcols=x=>x?[x.order==null?"":x.order,x.sent,x.left==null?"":x.left,x.st==="here"?"ano":x.st==="done"?"ne, odesláno vše":""]:["","","",""];
  // 2.78: dva předchozí záznamy dílu (novější první)
  const prevText=r=>((r&&r.prev)||[]).map(x=>[x.when,x.state,x.qty?(/^[\d\s.,]+$/.test(x.qty)?x.qty+" ks":x.qty):""].filter(Boolean).join(", ")).join(" | ");
  (l&&l.items||[]).forEach((it,j)=>{
    const a=shAnalysis(it,l),r=it.rec||{};
    rows.push([j+1,a.subs.length?"sestava":"díl",it.top?"TOP SHORTAGE":it.top2?"TOP 2":"",it.order,it.name,it.ean,it.index,it.qty,it.code,a.cur,r.state||"",r.op||"",r.qty||"",r.when||"",r.n||(it.rec?1:0),it.rec?"ano":"ne",it.note||"",a.note,...qcols(a.sent),prevText(it.rec)]);
    a.subs.forEach((s,k)=>{const q=s.rec||{};rows.push([(j+1)+"."+(k+1),s.hall?"poddíl":"poddíl (jiná operace)","",s.order||it.order,s.name||"",s.ean,s.index||it.index,s.qty||"",s.code,s.op,q.state||"",q.op||"",q.qty||"",q.when||"",q.n||(s.rec?1:0),s.rec?"ano":"ne",s.note||"","",...qcols(s.sent),prevText(s.rec)]);});
  });
  return {name:"Rozbor",rows,cols:[6,18,13,18,30,16,8,10,18,26,28,18,10,18,9,9,30,60,12,12,10,16,60]};
}
/** „22. 10. 2026 8:15“ ze časové značky seznamu. */
function shWhen(l){return shWhenText(l.at||0);}
function shItemsN(n){return n===1?"položka":n>=2&&n<=4?"položky":"položek";}
function shChanges(A,B,add){
  A=A||blankShortage();B=B||blankShortage();
  const ia=new Set(A.lists.map(l=>l.id)),ib=new Set(B.lists.map(l=>l.id));
  // oddělení a jejich operace (2.32)
  const da=new Map((A.depts||[]).map(d=>[d.id,d])),db=new Map((B.depts||[]).map(d=>[d.id,d]));
  db.forEach((d,id)=>{const p=da.get(id);if(!p)add("shortage","Shortage: nové oddělení "+d.name,{m:"shdp:"+id});else if(p.name!==d.name)add("shortage","Shortage: oddělení "+p.name+" přejmenováno na "+d.name,{m:"shdp:"+id});});
  da.forEach((d,id)=>{if(!db.has(id))add("shortage","Shortage: smazáno oddělení "+d.name,{m:"shdx:"+id});});
  const opA=new Map(),opB=new Map();
  (A.depts||[]).forEach(d=>d.ops.forEach(o=>opA.set(o.key,{d,o})));(B.depts||[]).forEach(d=>d.ops.forEach(o=>opB.set(o.key,{d,o})));
  opB.forEach((x,k)=>{const p=opA.get(k);if(!p||p.d.id!==x.d.id)add("shortage","Shortage: operace "+x.o.label+" patří do oddělení "+x.d.name,{m:"shdo:"+k});});
  opA.forEach((x,k)=>{if(!opB.has(k)&&db.has(x.d.id))add("shortage","Shortage: operace "+x.o.label+" už nepatří do žádného oddělení",{m:"shdo:"+k});});
  // sloupce importů a barvy EANu (2.61)
  const KIND={list:"urgentních dílů",planItem:"prvního listu výrobního plánu",plan:"druhého listu výrobního plánu",move:"evidence pohybu"};
  Object.keys(KIND).forEach(k=>{
    const a=(A.cols||{})[k],b=(B.cols||{})[k];
    if(b&&JSON.stringify(a||null)!==JSON.stringify(b))add("shortage","Shortage: sloupce "+KIND[k]+": "+Object.keys(SH_COL_NAMES[k]).filter(f=>b[f]).map(f=>SH_COL_NAMES[k][f].split(" (")[0]+" "+b[f]).join(", ")+(b.sheet?", list "+b.sheet:"")+(b.set&&(!a||!a.set||a.set.at!==b.set.at)?" · uloženo jako přednastavení (soubor se stejnými nadpisy se příště načte sám)":""),{m:"shc:"+k});
  });
  const TIER={top:"TOP SHORTAGE",top2:"TOP 2",none:"běžná shortage",done:"Hotovo"};
  Object.keys(B.colors||{}).forEach(h=>{if((A.colors||{})[h]!==B.colors[h])add("shortage","Shortage: barva EANu #"+h+" = "+TIER[B.colors[h]],{m:"shk:"+h});});
  B.lists.forEach(l=>{const o=A.lists.find(x=>x.id===l.id);if(o&&l.moves&&JSON.stringify(o.moves||null)!==JSON.stringify(l.moves))add("shortage","Shortage: evidence pohybu "+(l.moves.file||"")+" u seznamu "+shWhen(l)+" ("+l.moves.rows+" záznamů)",{m:"shv:"+l.id+":"+l.moves.at});});
  const what=l=>{const n=l.items.length,top=l.items.filter(i=>i.top&&i.st!=="done").length,pin=l.items.filter(i=>i.pin).length,done=l.items.filter(i=>i.st==="done").length;return " ("+n+" "+shItemsN(n)+(top?", z toho "+top+" TOP":"")+(done?", hotovo "+done:"")+(pin?", připnuté "+pin:"")+(l.file?", "+l.file:"")+")";};
  B.lists.forEach(l=>{if(!ia.has(l.id))add("shortage","Shortage: nahrán seznam "+shWhen(l)+what(l),{m:"shl:"+l.id});});
  // Rychlý scan (2.77): potvrzená načtení z mobilu, jeden záznam na potvrzení dávky
  const scA=new Set((A.scans||[]).map(s=>s.id)),scNew=(B.scans||[]).filter(s=>!scA.has(s.id));
  if(scNew.length){
    const byPos=new Map();scNew.forEach(s=>{const x=byPos.get(s.pos)||{n:0,q:0};x.n++;x.q=Math.round((x.q+s.qty)*1000)/1000;byPos.set(s.pos,x);});
    add("shortage","Shortage: rychlý scan "+[...byPos.entries()].map(([p,x])=>p+" "+x.n+" "+(x.n===1?"kód":x.n<=4?"kódy":"kódů")+" ("+nf(x.q,3)+" ks)").join(", "),{m:"shsc:"+scNew[scNew.length-1].id});
  }
  // zabalení dne (2.73)
  B.lists.forEach(l=>{const o=A.lists.find(x=>x.id===l.id);if(o&&!!o.packed!==!!l.packed)add("shortage",l.packed?"Shortage: zabalen seznam "+shWhen(l)+" ("+l.items.length+" "+shItemsN(l.items.length)+")":"Shortage: rozbalen seznam "+shWhen(l),{m:"shpk:"+l.id});});
  // smazání má vlastní klíč, ať v historii zůstane i záznam o nahrání
  A.lists.forEach(l=>{if(!ib.has(l.id))add("shortage","Shortage: smazán seznam "+shWhen(l)+what(l),{m:"shd:"+l.id});});
  // úpravy položek seznamu (2.28): odebrání, poznámka, poslední záznamy, pořadí; poddíly z plánu (2.29)
  B.lists.forEach(l=>{
    const o=A.lists.find(x=>x.id===l.id);
    if(!o)return;
    const label=i=>((i.ean||"")+" "+(i.name||"")).trim()||"bez názvu",ol=o.items.map(i=>i.id),nl=l.items.map(i=>i.id);
    const oi=new Map(o.items.map(i=>[i.id,i])),ni=new Map(l.items.map(i=>[i.id,i]));
    const subsOf=list=>new Map(list.items.flatMap(i=>(i.subs||[]).map(x=>[x.id,{s:x,i}])));
    const os=subsOf(o),ns=subsOf(l),planChanged=JSON.stringify(o.plan||null)!==JSON.stringify(l.plan||null);
    o.items.forEach(i=>{if(!ni.has(i.id))add("shortage","Shortage: ze seznamu "+shWhen(l)+" odebrána položka "+label(i),{m:"shr:"+l.id+":"+i.id});});
    // doplnění chybějících (2.36)
    const fresh=l.items.filter(i=>!oi.has(i.id)&&!i.dup);
    // duplikát do jiného oddělení a připnutí (2.75)
    const dupName=i=>i.dept==="-"?"Nezařazeno":i.dept===SH_CHECK_DEPT?SH_CHECK_NAME:i.dept?((B.depts||[]).find(d=>d.id===i.dept)||{}).name||"oddělení":"podle operace";
    l.items.filter(i=>!oi.has(i.id)&&i.dup).forEach(i=>add("shortage","Shortage: položka "+label(i)+" zduplikována, kopie v oddělení "+dupName(i)+" (seznam "+shWhen(l)+")",{m:"shdup:"+l.id+":"+i.id}));
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&!!p.pin!==!!i.pin)add("shortage","Shortage: položka "+label(i)+(i.pin?" připnuta (přejde i do dalších seznamů)":" odepnuta")+" (seznam "+shWhen(l)+")",{m:"shpin:"+l.id+":"+i.id});});
    if(fresh.length)add("shortage","Shortage: do seznamu "+shWhen(l)+" doplněn"+(fresh.length===1?"a ":fresh.length<=4?"y ":"o ")+fresh.length+" "+shItemsN(fresh.length)+": "+fresh.slice(0,5).map(label).join(", ")+(fresh.length>5?" …":""),{m:"shm:"+l.id+":"+fresh[0].id});   // každé doplnění zvlášť
    l.items.forEach(i=>{
      const p=oi.get(i.id);
      if(p&&(p.note||"")!==(i.note||""))add("shortage",i.note?"Shortage: poznámka k položce "+label(i)+" (seznam "+shWhen(l)+"): "+i.note:"Shortage: smazána poznámka k položce "+label(i)+" (seznam "+shWhen(l)+")",{m:"shn:"+l.id+":"+i.id});
    });
    if(planChanged&&l.plan){
      const n=l.items.reduce((a,i)=>a+(i.subs||[]).length,0),k=l.items.filter(i=>(i.subs||[]).length).length;
      add("shortage","Shortage: poddíly z výrobního plánu "+(l.plan.file||"")+" u seznamu "+shWhen(l)+": "+n+" "+(n===1?"poddíl":n>=2&&n<=4?"poddíly":"poddílů")+" u "+k+" "+(k===1?"sestavy":"sestav"),{m:"shp:"+l.id});
    }else{
      os.forEach((x,id)=>{if(ni.has(x.i.id)&&!ns.has(id))add("shortage","Shortage: odebrán poddíl "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+")",{m:"shr:"+l.id+":"+id});});
      ns.forEach((x,id)=>{if(oi.has(x.i.id)&&!os.has(id)&&x.s.byRec)add("shortage","Shortage: podle posledního záznamu přidán poddíl "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+")",{m:"sha:"+l.id+":"+id});});
    }
    ns.forEach((x,id)=>{
      const p=os.get(id);
      if(p&&(p.s.note||"")!==(x.s.note||""))add("shortage",x.s.note?"Shortage: poznámka k poddílu "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+"): "+x.s.note:"Shortage: smazána poznámka k poddílu "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+")",{m:"shn:"+l.id+":"+id});
    });
    // ruční TOP SHORTAGE a plné zobrazení sestavy (2.31)
    const tier=i=>i.top?" ručně označena jako TOP SHORTAGE":i.top2?" označena jako TOP 2 (zpracovat hned po TOP shortage)":"";
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&(!!p.top!==!!i.top||!!p.top2!==!!i.top2))add("shortage","Shortage: položka "+label(i)+(tier(i)||(p.top?" už není TOP SHORTAGE":" už není TOP 2"))+" (seznam "+shWhen(l)+")",{m:"sht:"+l.id+":"+i.id});});
    // ruční přesun do oddělení (2.32)
    const dName=id=>id==="-"?"nezařazeno":id===SH_CHECK_DEPT?SH_CHECK_NAME:((B.depts||[]).find(d=>d.id===id)||{}).name||"oddělení";
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&(p.dept||"")!==(i.dept||""))add("shortage","Shortage: položka "+label(i)+(i.dept?" ručně přesunuta: "+dName(i.dept):" zase v oddělení podle operace")+" (seznam "+shWhen(l)+")",{m:"shdi:"+l.id+":"+i.id});});
    // alternativní objednávka z výrobního plánu (2.72)
    const ordLab=x=>(x.order||"—")+" · index "+(x.index||"—");
    l.items.forEach(i=>{
      const p=oi.get(i.id);
      if(!p)return;
      const moved=p.order!==i.order||p.index!==i.index;
      if(i.was&&moved&&(p.planAlts||[]).some(a=>a.order===i.order&&a.index===i.index))add("shortage","Shortage: u položky "+label(i)+" vybrána objednávka z plánu "+ordLab(i)+" (v urgentech "+ordLab(i.was)+", seznam "+shWhen(l)+")",{m:"shalt:"+l.id+":"+i.id});
      else if(p.was&&!i.was)add("shortage","Shortage: u položky "+label(i)+" vrácena objednávka z urgentů "+ordLab(i)+" (seznam "+shWhen(l)+")",{m:"shalt:"+l.id+":"+i.id});
    });
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&!!p.full!==!!i.full)add("shortage","Shortage: sestava "+label(i)+(i.full?" zobrazena plně (QR kód, záznam, kolonky)":" zase jen orientačně")+" (seznam "+shWhen(l)+")",{m:"shf:"+l.id+":"+i.id});});
    // poddíl na jiném oddělení zobrazený plně (2.78)
    ns.forEach((x,id)=>{const p=os.get(id);if(p&&!!p.s.full!==!!x.s.full)add("shortage","Shortage: poddíl "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+(x.s.full?" zobrazen plně i na jiném oddělení (QR kód)":" na jiném oddělení zase bez QR kódu")+" (seznam "+shWhen(l)+")",{m:"shsf:"+l.id+":"+id});});
    // skrytí v PDF (2.29.1)
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&(p.st||"")!==(i.st||""))add("shortage","",{m:"shst:"+l.id+":"+i.id,p:"Shortage: položka "+label(i)+" – stav: ",v0:shStName(p.st)||"bez stavu",v1:shStName(i.st)||"bez stavu"});});
    ns.forEach((x,id)=>{const p=os.get(id);if(p&&(p.s.st||"")!==(x.s.st||""))add("shortage","",{m:"shst:"+l.id+":"+id,p:"Shortage: poddíl "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" – stav: ",v0:shStName(p.s.st)||"bez stavu",v1:shStName(x.s.st)||"bez stavu"});});
    l.items.forEach(i=>{const p=oi.get(i.id);if(p&&!!p.pdfHide!==!!i.pdfHide)add("shortage","Shortage: položka "+label(i)+(i.pdfHide?" skryta v PDF":" znovu v PDF")+" (seznam "+shWhen(l)+")",{m:"shh:"+l.id+":"+i.id});});
    ns.forEach((x,id)=>{const p=os.get(id);if(p&&!!p.s.pdfHide!==!!x.s.pdfHide)add("shortage","Shortage: poddíl "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+(x.s.pdfHide?" skryt v PDF":" znovu v PDF")+" (seznam "+shWhen(l)+")",{m:"shh:"+l.id+":"+id});});
    const recN=l.items.filter(i=>oi.has(i.id)&&JSON.stringify(oi.get(i.id).rec||null)!==JSON.stringify(i.rec||null)).length
      +[...ns.entries()].filter(([id,x])=>os.has(id)&&JSON.stringify(os.get(id).s.rec||null)!==JSON.stringify(x.s.rec||null)).length;
    if(recN)add("shortage","Shortage: poslední záznamy u "+recN+" "+(recN===1?"položky":"položek")+" seznamu "+shWhen(l),{m:"shz:"+l.id});
    // 2.71: množství zakázky (plán nebo ručně) a nové záznamy „Odesláno na WPA“
    const qch=[...l.items.filter(i=>oi.has(i.id)&&(oi.get(i.id).oqty??null)!==(i.oqty??null)).map(i=>({x:i,lab:"u položky "+label(i)})),
      ...[...ns.entries()].filter(([id,x])=>os.has(id)&&(os.get(id).s.oqty??null)!==(x.s.oqty??null)).map(([id,x])=>({x:x.s,lab:"u poddílu "+(x.s.ean||x.s.code)+" položky "+label(x.i)}))];
    if(qch.length===1)add("shortage","Shortage: množství zakázky "+qch[0].lab+" (seznam "+shWhen(l)+"): "+(qch[0].x.oqty!=null?nf(qch[0].x.oqty,3)+" ks":"smazáno"),{m:"shq:"+l.id+":"+qch[0].x.id});
    else if(qch.length)add("shortage","Shortage: množství zakázky u "+qch.length+" položek a poddílů seznamu "+shWhen(l),{m:"shq:"+l.id});
    const sentN=c=>Object.values(c||{}).reduce((a,v)=>a+v.length,0),sn=sentN(l.sent)-sentN(o.sent);
    if(sn>0)add("shortage","Shortage: odesláno na WPA, "+sn+" "+(sn===1?"nový záznam":sn<=4?"nové záznamy":"nových záznamů")+" u seznamu "+shWhen(l),{m:"shw:"+l.id+":"+sentN(l.sent)});   // každé nahrání zvlášť (jinak by druhé do 10 minut přepsalo počet prvního)
    // přesun kvůli změně TOP se jako změna pořadí nepočítá
    const keep=id=>oi.has(id)&&ni.has(id)&&shRank(oi.get(id))===shRank(ni.get(id))&&(oi.get(id).dept||"")===(ni.get(id).dept||"");
    if(ol.filter(keep).join()!==nl.filter(keep).join())add("shortage","Shortage: změněno pořadí položek v seznamu "+shWhen(l),{m:"sho:"+l.id});
  });
}

if(typeof module==="object"&&module.exports){
  module.exports={setState:v=>{S=v;_prodIdx=null;_effCache=null;},getState:()=>S};
}
