/* ---------- parsování ---------- */
function serialToYMD(n){
  const ms=Math.round((n-25569)*864e5);
  const dt=new Date(ms);
  return {y:dt.getUTCFullYear(),m:dt.getUTCMonth()+1,d:dt.getUTCDate()};
}
function cellToDate(v){
  if(v==null||v==="")return null;
  if(v instanceof Date)return {y:v.getFullYear(),m:v.getMonth()+1,d:v.getDate()};
  if(typeof v==="number"){
    if(v>=20000&&v<80000)return serialToYMD(v);
    if(Number.isInteger(v)&&v>=1&&v<=31)return {d:v};
    return null;
  }
  const s=String(v).trim();
  if(!s)return null;
  let m=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m)return {y:+m[1],m:+m[2],d:+m[3]};
  m=s.match(/(\d{1,2})\s*[.\/-]\s*(\d{1,2})(?:\s*[.\/-]\s*(\d{2,4}))?/);
  if(m){const o={d:+m[1],m:+m[2]};if(m[3])o.y=+m[3]<100?2000+ +m[3]:+m[3];return o;}
  m=s.match(/^\D{0,3}(\d{1,2})\.?$/);
  if(m&&+m[1]>=1&&+m[1]<=31)return {d:+m[1]};
  return null;
}
function parseHours(v){
  if(v==null||v==="")return {h:0,code:null};
  if(typeof v==="number")return {h:v>0&&v<=24?v:0,code:null};
  if(v instanceof Date)return {h:0,code:null};
  const s=String(v).trim();
  if(!s)return {h:0,code:null};
  const t=s.replace(/\s/g,"").replace(",",".");
  if(/^\d+(\.\d+)?$/.test(t)){const n=parseFloat(t);return {h:n<=24?n:0,code:null};}
  const m=t.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if(m){const rest=(m[2]||"").replace(/[^\p{L}]/gu,"").toUpperCase();
    return {h:parseFloat(m[1])<=24?parseFloat(m[1]):0,code:rest||null};}
  const code=t.replace(/[^\p{L}]/gu,"").toUpperCase();
  return {h:0,code:code||null};
}
function parseCSV(text){
  const sep=(text.split("\n")[0].match(/;/g)||[]).length>=(text.split("\n")[0].match(/,/g)||[]).length?";":",";
  const rows=[];let row=[],cur="",q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else if(c==='"')q=true;
    else if(c===sep){row.push(cur);cur="";}
    else if(c==="\n"){row.push(cur);rows.push(row);row=[];cur="";}
    else if(c!=="\r")cur+=c;
  }
  row.push(cur);rows.push(row);
  return rows.map(r=>r.map(c=>{const t=c.trim();if(t==="")return null;
    const n=t.replace(",",".");return /^-?\d+(\.\d+)?$/.test(n)?parseFloat(n):t;}));
}
const SKIP_NAMES=["jmeno","jméno","prijmeni","příjmení","celkem","soucet","součet","osobni cislo","zamestnanec"];

/* Převede AOA na období. Vrací {ok,err,warn,period} */
function buildPeriod(aoa,fileName,forceY,forceM){
  const warn=[];
  if(!aoa||!aoa.length)return {ok:false,err:"Soubor je prázdný."};
  const width=Math.max(...aoa.map(r=>r?r.length:0));
  if(width<6)return {ok:false,err:"List má míň než 6 sloupců - docházka má začínat ve sloupci F."};
  // hlavička = řádek s nejvíc daty od sloupce F
  let hr=-1,best=0;
  for(let r=0;r<Math.min(aoa.length,25);r++){
    const row=aoa[r]||[];let c=0;
    for(let i=5;i<width;i++)if(cellToDate(row[i]))c++;
    if(c>best){best=c;hr=r;}
  }
  if(hr<0||best<5)return {ok:false,err:"Nenašel jsem řádek s daty. Očekávám datum (nebo čísla dnů) od sloupce F."};
  // období
  const full=[];
  for(let i=5;i<width;i++){const p=cellToDate((aoa[hr]||[])[i]);if(p&&p.y&&p.m)full.push(p);}
  let Y=forceY,M=forceM;
  if(!Y||!M){
    if(full.length){const cnt={};full.forEach(p=>{const k=p.y+"-"+p.m;cnt[k]=(cnt[k]||0)+1;});
      const k=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0].split("-");Y=+k[0];M=+k[1];}
    else{const now=new Date();const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
      Y=prev.getFullYear();M=prev.getMonth()+1;
      warn.push("V hlavičce byla jen čísla dnů bez měsíce - použil jsem "+MONL[M-1]+" "+Y+". Změňte v poli nad tabulkou, pokud nesedí.");}
  }
  // sloupce -> dny
  const cols=[];
  for(let i=5;i<width;i++){
    const p=cellToDate((aoa[hr]||[])[i]);
    if(!p||!p.d)continue;
    const y=p.y||Y, m=p.m||M;
    if(p.y&&p.m&&(y!==Y||m!==M))continue;          // jiný měsíc v témže listu ignorujeme
    if(p.d<1||p.d>31)continue;
    const dim=new Date(Date.UTC(y,m,0)).getUTCDate();
    if(p.d>dim)continue;
    cols.push({col:i,day:mkDay(y,m,p.d)});
  }
  if(!cols.length)return {ok:false,err:"Z hlavičky se nepodařilo poskládat žádný den."};
  cols.sort((a,b)=>a.day.iso<b.day.iso?-1:1);
  const days=cols.map(c=>c.day);
  // řádky lidí
  const rows={},codes={};let dupes=0;
  for(let r=hr+1;r<aoa.length;r++){
    const row=aoa[r]||[];
    const a=row[0]==null?"":String(row[0]).trim();
    const b=row[1]==null?"":String(row[1]).trim();
    if(!a&&!b)continue;
    if(SKIP_NAMES.includes(norm(a))||SKIP_NAMES.includes(norm(b)))continue;
    if(/celkem|součet|soucet|suma/i.test(a+" "+b))continue;
    const first=a,last=b||a;
    const key=norm(last)+"|"+norm(first);
    if(rows[key])dupes++;
    const hrs=[],cds=[];
    let any=false;
    cols.forEach(c=>{
      const p=parseHours(row[c.col]);
      hrs.push(p.h);cds.push(p.code);
      if(p.h>0||p.code)any=true;
      if(p.code)codes[p.code]=(codes[p.code]||0)+1;
    });
    if(!any&&!b)continue;                            // nadpisové bloky bez dat
    rows[key]={first,last,h:hrs,c:cds};
  }
  if(!Object.keys(rows).length)return {ok:false,err:"Nenašel jsem žádné zaměstnance ve sloupcích A a B pod hlavičkou."};
  if(dupes)warn.push(dupes+"&times; se opakovalo stejné jméno - ponechal jsem poslední řádek.");
  return {ok:true,warn,period:{id:Y+"-"+String(M).padStart(2,"0"),y:Y,m:M,days:days.map(d=>d.iso),
    rows,codes,file:fileName,at:Date.now(),headerRow:hr+1}};
}

/* ---------- kontrola párování docházky postaru (2.48) ----------
   Soubor docházky (A jméno, B příjmení) se přiřadí k lidem v systému, nikdo nový se nepřidá.
   Pořadí: přesně (příjmení|jméno), prohozené jméno a příjmení, stejná slova v jiném pořadí,
   podobnost (překlep do 2 znaků celkem, jen jednoznačně). Každý člověk nejvýš jednou. */
function attDist(a,b){
  if(a===b)return 0;
  const m=a.length,n=b.length;if(!m||!n)return Math.max(m,n);
  let prev=Array.from({length:n+1},(_,j)=>j);
  for(let i=1;i<=m;i++){const cur=[i];for(let j=1;j<=n;j++)cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));prev=cur;}
  return prev[n];
}
function attSig(a,b){return norm(a+" "+b).split(/[\s\-]+/).filter(Boolean).sort().join(" ");}
function attMatch(per,emps){
  emps=emps||S.employees;
  const list=Object.values(emps||{}).filter(e=>e&&e.key);
  const byKey=new Map(list.map(e=>[e.key,e]));
  const bySig=new Map();
  list.forEach(e=>{const g=attSig(e.last,e.first);bySig.set(g,(bySig.get(g)||[]).concat(e.key));});
  const rows=Object.entries(per.rows||{}).map(([k,r])=>({k,first:r.first||"",last:r.last||"",emp:null,how:"none",cand:[]}));
  const used=new Map();
  const take=(x,key,how)=>{if(used.has(key)){x.how="dup";x.cand=[key];x.dupOf=used.get(key);return false;}used.set(key,x.k);x.emp=key;x.how=how;return true;};
  rows.forEach(x=>{if(byKey.has(x.k))take(x,x.k,"exact");});
  rows.forEach(x=>{
    if(x.how!=="none")return;
    const sw=norm(x.first)+"|"+norm(x.last);
    if(byKey.has(sw)){take(x,sw,"swap");return;}
    const c=(bySig.get(attSig(x.first,x.last))||[]).filter(k=>!used.has(k));
    if(c.length===1)take(x,c[0],"swap");else if(c.length>1)x.cand=c;
  });
  rows.forEach(x=>{
    if(x.how!=="none"||x.cand.length)return;
    const a=norm(x.first),b=norm(x.last);
    if((a+b).length<5)return;
    let best=3,cand=[];
    list.forEach(e=>{
      if(used.has(e.key))return;
      const f=norm(e.first),l=norm(e.last);
      const d=Math.min(attDist(b,l)+attDist(a,f),attDist(a,l)+attDist(b,f));
      if(d<best){best=d;cand=[e.key];}else if(d===best)cand.push(e.key);
    });
    if(best<=2&&cand.length===1)take(x,cand[0],"fuzzy");else if(best<=2)x.cand=cand;
  });
  const n={exact:0,swap:0,fuzzy:0,none:0,dup:0};rows.forEach(x=>n[x.how]++);
  const inFile=new Set(rows.filter(x=>x.emp).map(x=>x.emp));
  const missing=list.filter(e=>!e.excluded&&!isLead(e)&&!inFile.has(e.key)).map(e=>e.key);
  return {rows,n,missing};
}
/** Docházka jen s přiřazenými lidmi: řádky pod klíčem a jménem člověka v systému, ostatní pryč. */
function attRemap(per,assign,emps){
  emps=emps||S.employees;
  const rows={};let skipped=0;
  Object.entries(per.rows||{}).forEach(([k,r])=>{
    const key=assign.get(k);const e=key&&emps[key];
    if(!e||rows[key]){skipped++;return;}
    rows[key]={...r,first:e.first,last:e.last};
  });
  return {period:{...per,rows},skipped};
}

/* ---------- evidence práce (vyrobené kusy) ---------- */
function cellToDateTime(v){
  if(v==null||v==="")return null;
  if(v instanceof Date)return {y:v.getFullYear(),m:v.getMonth()+1,d:v.getDate()};
  if(typeof v==="number")return (v>=20000&&v<80000)?serialToYMD(Math.floor(v)):null;
  const s=String(v).trim();
  let m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(m)return {y:+m[1],m:+m[2],d:+m[3]};
  m=s.match(/^(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{2,4})/);
  if(m)return {y:+m[3]<100?2000+ +m[3]:+m[3],m:+m[2],d:+m[1]};
  return null;
}
function toNum(v){
  if(v==null||v==="")return null;
  if(typeof v==="number")return isFinite(v)?v:null;
  const t=String(v).replace(/\s/g,"").replace(",",".");
  return /^-?\d+(\.\d+)?$/.test(t)?parseFloat(t):null;
}
/* ID zaměstnance z evidence práce: bez mezer a velikosti písmen, číslo bez úvodních nul
   (Excel z „0123“ udělá 123). */
function widKey(v){
  let t=norm(v==null?"":String(v)).replace(/\s+/g,"");
  if(/^\d+(\.0+)?$/.test(t))t=String(parseInt(t,10));
  return t;
}
function keyByWid(raw){
  const w=widKey(raw);if(!w)return null;
  for(const e of Object.values(S.employees))if(e.wid&&widKey(e.wid)===w)return e.key;
  return null;
}
/* Kód z kartičky (skener, 2.13) → člověk podle ID v evidenci práce: nejdřív celý kód, pak jeho
   části z písmen a číslic (QR může nést víc údajů, např. „ID:123;Novák“). */
function keyByScan(raw){
  const t=String(raw==null?"":raw).trim();
  if(!t)return null;
  const k=keyByWid(t);if(k)return k;
  /* nejdřív části oddělené mezerou nebo oddělovačem (ID může mít pomlčku), pak jen písmena a číslice */
  for(const re of [/[\s;,:|=\/]+/,/[^0-9A-Za-z]+/])for(const part of t.split(re).filter(Boolean)){const x=keyByWid(part);if(x)return x;}
  return null;
}
/* Vypadá jako ID (ne jako jméno): bez mezer a s číslicí. */
function looksLikeId(raw){const t=String(raw==null?"":raw).trim();return !!t&&!/\s/.test(t)&&/\d/.test(t);}
function prodLabel(raw){return looksLikeId(raw)?"ID "+String(raw).trim():String(raw);}
/* "Petr Dvořák" nebo ID -> klíč zaměstnance; ruční spárování má přednost, pak ID, pak jméno */
function prodKeyFor(raw){
  const n=norm(raw);
  if(!n)return null;
  if(S.prodMap[n]&&S.employees[S.prodMap[n]])return S.prodMap[n];
  const byId=keyByWid(raw);
  if(byId)return byId;
  const t=n.split(" ").filter(Boolean);
  if(t.length<2)return null;
  const asFirstLast=t.slice(1).join(" ")+"|"+t[0];          // Jméno Příjmení
  if(S.employees[asFirstLast])return asFirstLast;
  const asLastFirst=t.slice(0,-1).join(" ")+"|"+t[t.length-1]; // Příjmení Jméno
  if(S.employees[asLastFirst])return asLastFirst;
  if(t.length>2){                                            // prostřední jméno navíc
    const a=t[t.length-1]+"|"+t[0];
    if(S.employees[a])return a;
  }
  return null;
}
let _prodIdx=null;
function prodPeriod(){return S.current?S.production[S.current]:null;}
function prodIndex(){
  if(_prodIdx)return _prodIdx;
  const idx={},pp=prodPeriod();
  if(pp)Object.values(pp.names).forEach(rec=>{
    const key=prodKeyFor(rec.name);
    if(!key)return;
    const a=idx[key]||(idx[key]={total:0,entries:0,days:{},sources:[],spent:0,norm:0,nspent:0});
    a.total+=rec.total;a.entries+=rec.count;a.sources.push(rec.name);
    a.spent+=rec.spent||0;a.norm+=rec.norm||0;a.nspent+=rec.nspent||0;
    Object.entries(rec.days).forEach(([iso,ks])=>{a.days[iso]=(a.days[iso]||0)+ks;});
  });
  Object.values(idx).forEach(a=>{
    a.prodDays=Object.keys(a.days).length;              // dnů, kdy něco zapsal
    a.avgEntryDay=a.prodDays?a.total/a.prodDays:0;      // jen doplňkový údaj
  });
  return _prodIdx=idx;
}
function productionOf(key){return prodIndex()[key]||null;}
/* Průměr na den se počítá vůči odpracovaným dnům z docházky, ne vůči dnům se zápisem:
   díl přes několik dnů se zapíše jednou, ale pracovalo se na něm celou dobu. */
function workedDays(att){return att?(att.workDays+att.wkDays):0;}
/** Odpracované dny přepočtené na směny (2.49, KPI Výkonnost na osobu): den s celou směnou
    (7,5 h, u zkráceného pátku jeho směna) = 1 den, kratší den = hodiny ÷ směna, víc než směna
    se počítá jako 1. Dny s kódem nepřítomnosti se nepočítají (attendance je má s 0 h). */
function shiftDays(att){
  if(!att||!att.found)return 0;
  let d=0;att.cells.forEach(c=>{if(c.h>0&&c.ds>0)d+=Math.min(c.h,c.ds)/c.ds;});
  return Math.round(d*100)/100;
}
function avgPerDay(prod,att){const d=workedDays(att);return (prod&&d)?prod.total/d:null;}
function avgTitle(prod,att){
  if(!prod)return "";
  const d=workedDays(att);
  if(!d)return nf(prod.total,0)+" ks, ale v docházce nemá odpracovaný žádný den";
  return nf(prod.total,0)+" ks ÷ "+d+" odpracovaných dnů ("+att.workDays+" všedních + "+att.wkDays+" víkendových)";
}
function prodUnmatched(){
  const pp=prodPeriod();if(!pp)return [];
  return Object.values(pp.names).filter(rec=>!prodKeyFor(rec.name)).sort((a,b)=>b.total-a.total);
}
/* Čas z buňky na minuty: číslo (minuty, nebo hodiny u unit "h"), zlomek dne z Excelu (frac),
   text „h:mm“ nebo „h:mm:ss“. */
function toMinutes(v,unit,frac){
  if(v==null||v==="")return null;
  if(v instanceof Date)return v.getHours()*60+v.getMinutes()+v.getSeconds()/60;
  if(typeof v==="string"){
    const m=v.trim().match(/^(\d{1,4}):(\d{1,2})(?::(\d{1,2}))?$/);
    if(m)return +m[1]*60+ +m[2]+(m[3]?+m[3]/60:0);
  }
  const n=toNum(v);
  if(n==null||n<0)return null;
  return frac?n*1440:unit==="h"?n*60:n;
}
/* Výchozí sloupce evidence práce (bez hlavičky): jméno C, datum D, kusy E. */
const PROD_DEFAULT={header:-1,name:2,date:3,ks:4,spent:null,norm:null,unit:"min",normPer:"row",item:null,iname:null,op:null};
const PROD_FIELDS=[["name","Zaměstnanec (jméno nebo ID)"],["date","Datum"],["ks","Kusy"],["spent","Strávený čas"],["norm","Norma (min)"],["item","EAN / položka"],["iname","Název položky"],["op","Operace (pro KPI)"]];
const PROD_WORDS={
  name:["jmeno","pracovnik","zamestnanec","operator","osoba","prijmeni","id zamestnance","id pracovnika","osobni cislo","cislo zamestnance","os. c","os.c","id"],
  date:["datum","den","date","dne"],
  ks:["ks","kusy","kusu","mnozstvi","pocet","vyrobeno","dobre"],
  spent:["straveny cas","skutecny cas","cas skutecny","odpracovany cas","doba","trvani","straveno","cas"],
  norm:["norma","normocas","normohod","norm"],
  /* položka pro Top 5 nejméně efektivních (verze 2.2) */
  item:["ean","polozka","cislo polozky","kod polozky","id polozky","cislo dilu","kod dilu","dil","cislo vyrobku","kod vyrobku","vyrobek","artikl","produkt"],
  iname:["nazev polozky","nazev dilu","nazev vyrobku","nazev artiklu","popis polozky","popis dilu","nazev","popis"],
  /* operace pro kusy v KPI (verze 2.35): stejný soubor pak stačí nahrát jednou */
  op:["operace","nazev operace","pracovni operace","cinnost","ukon"]
};
function colLetter(i){let s="";i++;while(i>0){const r=(i-1)%26;s=String.fromCharCode(65+r)+s;i=Math.floor((i-1)/26);}return s;}
/* Najde řádek s hlavičkou a odhadne, co je ve kterém sloupci. */
function prodColumns(aoa){
  const rows=aoa||[];let header=-1,best=0;
  for(let r=0;r<Math.min(rows.length,15);r++){
    const texts=(rows[r]||[]).filter(c=>typeof c==="string"&&c.trim()&&toNum(c)==null&&!cellToDateTime(c));
    const hits=texts.filter(c=>Object.values(PROD_WORDS).some(w=>w.some(x=>norm(c).includes(x)))).length;
    if(hits>=2&&hits>best){best=hits;header=r;}
  }
  const width=Math.min(60,Math.max(0,...rows.slice(0,Math.max(header+30,30)).map(r=>(r||[]).length)));
  const first=rows.slice(header+1).find(r=>(r||[]).some(c=>c!=null&&c!==""))||[];
  const cols=[];for(let i=0;i<width;i++){
    const head=header>=0&&rows[header][i]!=null?String(rows[header][i]).trim().slice(0,80):"";
    /* ukázka hodnoty: datum z Excelu (pořadové číslo dne nebo Date) jako datum */
    const v=first[i];
    const sample=v==null?"":v instanceof Date?v.toLocaleDateString("cs-CZ"):typeof v==="number"&&v>=20000&&v<80000&&cellToDateTime(v)?(d=>d.d+". "+d.m+". "+d.y)(cellToDateTime(v)):String(v);
    cols.push({i,letter:colLetter(i),head,sample:sample.slice(0,40)});
  }
  const guess={...PROD_DEFAULT,header};
  if(header>=0){
    const used=new Set();
    /* datum dřív než čas, ať „Datum a čas“ nevezme strávený čas; položka až nakonec,
       ať nezmění odhad sloupců u souborů bez EAN */
    ["name","date","norm","spent","ks","op","item","iname"].forEach(f=>{
      const words=PROD_WORDS[f];let hit=null;
      /* „ID zakázky“ nebo „Operace“ není zaměstnanec; „Název zakázky“ není název položky */
      const skip=c=>(f==="name"&&/zakaz|operac|stroj|vyrob|dilu|polozk/.test(norm(c.head)))
        ||((f==="item"||f==="iname")&&/zakaz|operac|zamest|pracovn|stroj|osob/.test(norm(c.head)))
        ||(f==="item"&&/nazev|popis/.test(norm(c.head)))
        ||(f==="op"&&/norm|cas|kus|pocet|mnozstvi|cislo|kod|\bid\b/.test(norm(c.head)));
      for(const w of words){hit=cols.find(c=>!used.has(c.i)&&c.head&&!skip(c)&&(norm(c.head)===w||norm(c.head).split(/[^a-z0-9]+/).includes(w)||(w.includes(" ")&&norm(c.head).includes(w))));if(hit)break;}
      if(!hit)for(const w of words.filter(x=>x.length>=4)){hit=cols.find(c=>!used.has(c.i)&&c.head&&!skip(c)&&norm(c.head).includes(w));if(hit)break;}
      guess[f]=hit?hit.i:(f==="spent"||f==="norm"||f==="item"||f==="iname"||f==="op"?null:guess[f]);
      if(hit)used.add(hit.i);
    });
  }
  return {header,cols,guess,heads:cols.map(c=>c.head)};
}
/* Uložené mapování sedí na soubor, když má stejnou hlavičku (nebo oba žádnou). */
function prodMapFits(map,info){
  if(!map)return false;
  const h=map.heads||[];
  if(map.header<0||!h.length)return info.header<0;
  return info.header===map.header&&h.every((x,i)=>!x||norm(x)===norm(info.heads[i]||""));
}
function buildProduction(aoa,fileName,map){
  if(!aoa||!aoa.length)return {ok:false,err:"Soubor je prázdný."};
  const m={...PROD_DEFAULT,...(map||{})};
  const at=(row,i)=>i==null||i<0?null:row[i];
  /* sloupec času samými zlomky dne = časový formát z Excelu (1:30 = 0,0625) */
  let frac=false;
  if(m.spent!=null){
    const nums=aoa.slice(m.header+1).map(r=>(r||[])[m.spent]).filter(v=>typeof v==="number"&&v>0);
    frac=nums.length>0&&nums.every(v=>v<1);
  }
  const buckets={};let used=0,skipped=0;
  for(let r=Math.max(0,m.header+1);r<aoa.length;r++){
    const row=aoa[r]||[];
    const raw=at(row,m.name);
    const nm=raw==null?"":String(raw).trim();
    const dt=cellToDateTime(at(row,m.date));
    const ks=m.ks!=null?toNum(at(row,m.ks)):null;
    const spent=m.spent!=null?toMinutes(at(row,m.spent),m.unit,frac):null;
    let nrm=m.norm!=null?toNum(at(row,m.norm)):null;
    if(nrm!=null&&m.normPer==="piece")nrm=ks>0?nrm*ks:null;
    const item=m.item!=null?itemKey(at(row,m.item)):"";
    const good=(ks!=null&&ks>0)||(spent!=null&&spent>0)||(nrm!=null&&nrm>0);
    if(!nm||!dt||!good){
      if(nm&&(at(row,m.date)!=null||at(row,m.ks)!=null)&&!SKIP_NAMES.includes(norm(nm)))skipped++;
      continue;
    }
    if(SKIP_NAMES.includes(norm(nm)))continue;
    const pid=dt.y+"-"+String(dt.m).padStart(2,"0");
    const iso=pid+"-"+String(dt.d).padStart(2,"0");
    const b=buckets[pid]||(buckets[pid]={id:pid,names:{},records:0,total:0,file:fileName,at:Date.now()});
    if(m.spent!=null)b.time=true;
    if(m.item!=null&&!b.items)b.items={};
    const k=norm(nm);
    const rec=b.names[k]||(b.names[k]={name:nm,total:0,count:0,days:{}});
    const q=ks>0?ks:0;
    rec.total+=q;rec.count++;rec.days[iso]=(rec.days[iso]||0)+q;
    if(m.spent!=null){
      rec.spent=(rec.spent||0)+(spent>0?spent:0);
      if(spent>0&&nrm>0){rec.norm=(rec.norm||0)+nrm;rec.nspent=(rec.nspent||0)+spent;}
    }
    /* Top 5: položka po dnech [kusy, čas, norma, čas u řádků s normou, řádků] a po pracovnících */
    if(item){
      const it=b.items[item]||(b.items[item]={name:"",d:{},w:{}});
      const iname=m.iname!=null&&at(row,m.iname)!=null?String(at(row,m.iname)).trim().slice(0,120):"";
      if(iname)it.name=iname;
      const sp=spent>0?spent:0,both=spent>0&&nrm>0;
      const d=it.d[iso]||(it.d[iso]=[0,0,0,0,0]);
      d[0]+=q;d[1]+=sp;if(both){d[2]+=nrm;d[3]+=spent;}d[4]++;
      const wk=it.w[k]||(it.w[k]={}),wd=wk[iso]||(wk[iso]=[0,0,0,0]);
      wd[0]+=sp;if(both){wd[1]+=nrm;wd[2]+=spent;}wd[3]+=q;
    }
    b.records++;b.total+=q;used++;
  }
  /* minuty na setiny, ať data zbytečně nebobtnají */
  const r2=v=>Math.round(v*100)/100;
  Object.values(buckets).forEach(b=>Object.values(b.items||{}).forEach(it=>{
    Object.values(it.d).forEach(a=>a.forEach((v,i)=>{a[i]=r2(v);}));
    Object.values(it.w).forEach(days=>Object.values(days).forEach(a=>a.forEach((v,i)=>{a[i]=r2(v);})));
  }));
  if(!used)return {ok:false,err:map?"Ve vybraných sloupcích jsem nenašel žádný použitelný řádek (jméno, datum a kusy nebo čas).":"Nenašel jsem žádný použitelný řádek. Čekám jméno ve sloupci C, datum ve sloupci D a počet kusů ve sloupci E."};
  return {ok:true,buckets,used,skipped};
}

