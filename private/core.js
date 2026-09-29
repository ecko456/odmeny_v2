'use strict';

/*
 * Odměny – výpočty a importy bez vazby na stránku.
 *
 * Logika pochází z původní aplikace hodnoceni-operatoru.html. Změny proti ní
 * jsou označené komentářem „Oprava:“ a hlídá je test tests/test_core.js, který
 * porovnává výsledky s původním souborem.
 */


/* Oprava: id z kryptografického generátoru místo Math.random. */
const uid=p=>p+Array.from(crypto.getRandomValues(new Uint8Array(5)),b=>(b%36).toString(36)).join("");
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=s=>String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const nf=(n,d=1)=>Number(n||0).toLocaleString("cs-CZ",{minimumFractionDigits:0,maximumFractionDigits:d});
const pct=n=>Math.round(n*100);
const DOW=["Ne","Po","Út","St","Čt","Pá","So"];
const MON=["led","úno","bře","dub","kvě","čvn","čvc","srp","zář","říj","lis","pro"];
const MONL=["leden","únor","březen","duben","květen","červen","červenec","srpen","září","říjen","listopad","prosinec"];

/* ---------- svátky ČR ---------- */
function easter(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),
  g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,
  m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;
  return new Date(Date.UTC(y,mo-1,da));}
const _holCache={};
function holidays(y){
  if(_holCache[y])return _holCache[y];
  const h={"1-1":"Nový rok","5-1":"Svátek práce","5-8":"Den vítězství","7-5":"Cyril a Metoděj","7-6":"Jan Hus",
    "9-28":"Den české státnosti","10-28":"Vznik ČSR","11-17":"Den boje za svobodu",
    "12-24":"Štědrý den","12-25":"1. svátek vánoční","12-26":"2. svátek vánoční"};
  const e=easter(y);
  const gf=new Date(e.getTime()-2*864e5), em=new Date(e.getTime()+864e5);
  h[(gf.getUTCMonth()+1)+"-"+gf.getUTCDate()]="Velký pátek";
  h[(em.getUTCMonth()+1)+"-"+em.getUTCDate()]="Velikonoční pondělí";
  return _holCache[y]=h;
}
function mkDay(y,m,d){
  const dt=new Date(Date.UTC(y,m-1,d));
  const dow=dt.getUTCDay();
  const hol=holidays(y)[m+"-"+d]||null;
  return {y,m,d,iso:y+"-"+String(m).padStart(2,"0")+"-"+String(d).padStart(2,"0"),dow,
    sat:dow===6,sun:dow===0,weekend:dow===0||dow===6,hol,work:dow!==0&&dow!==6&&!hol};
}

/* ---------- výchozí data ----------
   Hodnocení v tabácích: úroveň (1-4) dává základ, docházka ho automaticky sníží
   nebo zvýší podle pravidel pozice, pak sankce a ruční úprava.
   Kafe je samostatná fajfka: odpracované hodiny >= práh (výchozí = fond). */
const LEVEL_NAMES=["Nováček","Pokročilý","Samostatný","Profík"];
const DEF_PENALTY=[{at:1,t:1},{at:2,t:2}];     // chybí od X prac. dnů -> -t tabáků
const DEF_BONUS=[{at:2,t:1},{at:3,t:2}];       // od X víkendových směn -> +t tabáků
/* Sankce se zadávají u každého člověka zvlášť: důvod ze společného seznamu + srážka 10/30/50 %
   z nároku (úroveň + docházka, po stropu pozice). Procenta se sčítají, 2x 50 % = 0. */
const SAN_PCTS=[10,30,50];
const DEF_SAN_REASONS=["Nedodržení BOZP","Nedodržení výrobních předpisů","Malá produktivita",
  "Nedodržování stanovených přestávek","Zničení dílů"];
/* Úroveň: tabáky, popis a navýšení platu (%) s podmínkami v % (null = podmínka se nehlídá). */
function mkLevel(name,tabaky,desc){return {name,tabaky,desc:desc||"",raise:0,minAtt:null,minNorm:null,minUse:null};}
function mkPos(id,name,descs){
  return {id,name,max:null,          // null = strop podle nejvyšší úrovně
    onlyKafe:false,                  // pozice bez tabáků: hodnotí se jen Kafe (a navýšení platu)
    levels:LEVEL_NAMES.map((n,i)=>mkLevel(n,(i+1)*2,descs[i])),
    penalty:JSON.parse(JSON.stringify(DEF_PENALTY)),
    bonus:JSON.parse(JSON.stringify(DEF_BONUS))};
}
const DEF_POSITIONS=[
  mkPos("p_cnc","CNC",["Zaučuje se, pracuje pod dohledem.","Plně samostatný na běžných dílech.",
    "Zvládá hliník i plast.","Zvládá náročné projekty, zaučuje ostatní."]),
  mkPos("p_kon","Kontrola",["Zaučuje se, měří pod dohledem.","Samostatně měří běžné díly.",
    "Měření na 3D.","Uvolňuje první kus, řeší reklamace."]),
  mkPos("p_bru","Brusič",["Zaučuje se, pracuje pod dohledem.","Samostatný na běžných dílech.",
    "Zvládá tenké díly.","Zvládá náročné díly, zaučuje ostatní."]),
  mkPos("p_pis","Pískování",["Zaučuje se, pracuje pod dohledem.","Samostatný.",
    "Sám nastaví tlak a zrno.","Náročné povrchy, zaučuje ostatní."]),
  mkPos("p_lep","Lepení / Značení",["Zaučuje se, pracuje pod dohledem.","Samostatný.",
    "Laserové značení.","Náročné zakázky, zaučuje ostatní."]),
  mkPos("p_dai","Daiho",["Zaučuje se, pracuje pod dohledem.","Plně samostatný.",
    "Sám seřídí stroj.","Zvládá náročné projekty, zaučuje ostatní."])
];
const DEF_SETTINGS={
  shift:7.5,
  excused:"D,DOV,N,NEM,PN,L,P,OČR,ŠK,S,V,NV",
  excusedReducesFund:false,
  friShift:6.5,            // zkrácený pátek - platí jen pro lidi se zaškrtnutým shortFri
  absenceCutoff:null,      // od kolika dní absence (po vyplnění víkendem) nemá nárok na nic; null = vypnuto
  adjStep:1,
  adjOver:2,               // o kolik smí ruční úprava jít nad maximum pozice
  hiddenCols:[],           // skryté sloupce přehledu
  lockMinutes:15,          // zamčení po nečinnosti (minuty)
  prodCols:null            // sloupce importu výroby (jméno, datum, kusy, čas, norma); null = C, D, E
};
const n2=v=>Math.round((+v||0)*100)/100;
const sgn=v=>(v>0?"+":v<0?"−":"")+Math.abs(Math.round(v));
function tabW(n){n=Math.abs(Math.round(n));return n===1?"tabák":(n>=2&&n<=4)?"tabáky":"tabáků";}

/* ---------- stav ---------- */
let S=null;
/* Po každé změně stavu; aplikace sem připojí šifrované ukládání. */
let onStateChange=null;
function save(){_prodIdx=null;if(typeof onStateChange==="function")onStateChange();}

function blank(){return {positions:JSON.parse(JSON.stringify(DEF_POSITIONS)),employees:{},periods:{},adjust:{},
  sanctions:[],sanReasons:DEF_SAN_REASONS.slice(),production:{},prodMap:{},kafe:{},issued:{},current:null,
  settings:{...DEF_SETTINGS},demo:false,log:[],v:3};}
/* Převod ze staršího modelu (procenta + zaškrtávané podkategorie) na úrovně a tabáky. */
function migrate(o){
  o.positions.forEach(p=>{
    if(!Array.isArray(p.levels)||p.levels.length!==4){
      const max=Math.max(1,Math.round(+p.max||8));
      const old=Array.isArray(p.skills)?p.skills:[];
      p.levels=LEVEL_NAMES.map((n,i)=>mkLevel(n,Math.max(1,Math.round(max*(i+1)/4)),old[i]?old[i].name:""));
      p._old=true;                     // staré body-maximum nepřenášíme, strop dopočítá nejvyšší úroveň
    }
    if(!Array.isArray(p.penalty))p.penalty=JSON.parse(JSON.stringify(DEF_PENALTY));
    if(!Array.isArray(p.bonus))p.bonus=JSON.parse(JSON.stringify(DEF_BONUS));
  });
  Object.values(o.employees).forEach(e=>{
    if(e.level!==undefined)return;
    const p=o.positions.find(x=>x.id===e.positionId);
    if(p&&Array.isArray(p.skills)&&p.skills.length){
      const tot=p.skills.reduce((s,x)=>s+(+x.pts||0),0)||1;
      const set=new Set(Array.isArray(e.skills)?e.skills:[]);
      const have=p.skills.filter(x=>set.has(x.id)).reduce((s,x)=>s+(+x.pts||0),0);
      e.level=clamp(Math.ceil(have/tot*4),1,4);   // podíl zaškrtnutých -> úroveň 1..4
    }else e.level=p?1:null;
  });
  o.positions.forEach(p=>{if(p._old){delete p.skills;p.max=null;delete p._old;}
    if(p.max===undefined)p.max=null;});
  /* staré zaškrtávané podkategorie (pole); nové zaučení na dalších pozicích je objekt a zůstává */
  Object.values(o.employees).forEach(e=>{if(Array.isArray(e.skills))delete e.skills;});
  ["wAtt","wSkill","wFund","wOt","otBase","bonusOverMax"].forEach(k=>{delete o.settings[k];});
  o.kafe=o.kafe||{};
  o.issued=o.issued||{};
  if(!Array.isArray(o.sanReasons))o.sanReasons=DEF_SAN_REASONS.slice();
  return o;
}

/* ruční úprava tabáků - drží se u období, ne u člověka */
function adjKey(){return S.current||"_";}
function adjOf(key){return (S.adjust[adjKey()]||{})[key]||0;}
function setAdj(key,val){
  const b=S.adjust[adjKey()]||(S.adjust[adjKey()]={});
  const v=Math.round(val);
  if(!v)delete b[key];else b[key]=v;
  save();
}
/* sankce - záznam u člověka a měsíce; nové mají pct (10/30/50), starší záznamy mají pevné points */
function sanFor(key,period){return S.sanctions.filter(s=>s.key===key&&s.period===period);}
function sanLabel(s){
  return s.pct!=null?s.name+" "+s.pct+" %"+(s.note?" – "+s.note:"")
                    :(s.reason||"Sankce")+" (−"+(+s.points||0)+" tab., starý záznam)";
}
function reasonsOf(key){return sanFor(key,adjKey()).map(sanLabel).join("; ");}
/* potvrzení výdeje benefitu - u měsíce, se snímkem toho, co se vydalo */
function issuedOf(key){const b=S.issued&&S.issued[adjKey()];return b&&b[key]?b[key]:null;}
function setIssued(key,val){
  S.issued=S.issued||{};
  const b=S.issued[adjKey()]||(S.issued[adjKey()]={});
  if(val)b[key]=val;else delete b[key];
  save();
}
function shortDate(ts){return new Date(ts).toLocaleDateString("cs-CZ",{day:"numeric",month:"numeric"});}

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
const PROD_DEFAULT={header:-1,name:2,date:3,ks:4,spent:null,norm:null,unit:"min",normPer:"row"};
const PROD_FIELDS=[["name","Zaměstnanec (jméno nebo ID)"],["date","Datum"],["ks","Kusy"],["spent","Strávený čas"],["norm","Norma (min)"]];
const PROD_WORDS={
  name:["jmeno","pracovnik","zamestnanec","operator","osoba","prijmeni","id zamestnance","id pracovnika","osobni cislo","cislo zamestnance","os. c","os.c","id"],
  date:["datum","den","date","dne"],
  ks:["ks","kusy","kusu","mnozstvi","pocet","vyrobeno","dobre"],
  spent:["straveny cas","skutecny cas","cas skutecny","odpracovany cas","doba","trvani","straveno","cas"],
  norm:["norma","normocas","normohod","norm"]
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
    /* datum dřív než čas, ať „Datum a čas“ nevezme strávený čas */
    ["name","date","norm","spent","ks"].forEach(f=>{
      const words=PROD_WORDS[f];let hit=null;
      /* „ID zakázky“ nebo „Operace“ není zaměstnanec */
      const skip=c=>f==="name"&&/zakaz|operac|stroj|vyrob|dilu|polozk/.test(norm(c.head));
      for(const w of words){hit=cols.find(c=>!used.has(c.i)&&c.head&&!skip(c)&&(norm(c.head)===w||norm(c.head).split(/[^a-z0-9]+/).includes(w)||(w.includes(" ")&&norm(c.head).includes(w))));if(hit)break;}
      if(!hit)for(const w of words.filter(x=>x.length>=4)){hit=cols.find(c=>!used.has(c.i)&&c.head&&!skip(c)&&norm(c.head).includes(w));if(hit)break;}
      guess[f]=hit?hit.i:(f==="spent"||f==="norm"?null:guess[f]);
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
    const k=norm(nm);
    const rec=b.names[k]||(b.names[k]={name:nm,total:0,count:0,days:{}});
    const q=ks>0?ks:0;
    rec.total+=q;rec.count++;rec.days[iso]=(rec.days[iso]||0)+q;
    if(m.spent!=null){
      rec.spent=(rec.spent||0)+(spent>0?spent:0);
      if(spent>0&&nrm>0){rec.norm=(rec.norm||0)+nrm;rec.nspent=(rec.nspent||0)+spent;}
    }
    b.records++;b.total+=q;used++;
  }
  if(!used)return {ok:false,err:map?"Ve vybraných sloupcích jsem nenašel žádný použitelný řádek (jméno, datum a kusy nebo čas).":"Nenašel jsem žádný použitelný řádek. Čekám jméno ve sloupci C, datum ve sloupci D a počet kusů ve sloupci E."};
  return {ok:true,buckets,used,skipped};
}

/* ---------- výpočty ---------- */
function periodDays(p){return p.days.map(iso=>{const[a,b,c]=iso.split("-").map(Number);return mkDay(a,b,c);});}
function excusedSet(){return new Set(S.settings.excused.split(/[,;\s]+/).map(s=>norm(s).toUpperCase()).filter(Boolean));}
function periodMeta(p){
  const days=periodDays(p);
  const work=days.filter(d=>d.work).length;
  const sats=days.filter(d=>d.sat).length;
  const suns=days.filter(d=>d.sun).length;
  const hols=days.filter(d=>d.hol&&!d.weekend).length;
  return {days,work,sats,suns,hols,otCap:sats,fund:work*S.settings.shift};
}
/* délka směny pro konkrétní den: kdo má zkrácený pátek, má v pátek plnou směnu už při friShift hodinách */
function friShift(){const f=+S.settings.friShift;return f>0?f:S.settings.shift;}
function dayShift(d,shortFri){return (shortFri&&d.dow===5)?friShift():S.settings.shift;}
function attendance(p,key){
  const meta=periodMeta(p), row=p.rows[key];
  const ex=excusedSet();
  const emp=S.employees[key], sf=!!(emp&&emp.shortFri);
  const r={found:!!row,workDays:0,workHours:0,cappedHours:0,wkDays:0,wkHours:0,otWeek:0,
    missed:0,excusedDays:0,excusedHours:0,codes:{},cells:[],totalDays:0,totalHours:0,
    shortFri:sf,fridays:0,absDays:0,shortHours:0,shortDays:0};
  let fund=0;
  meta.days.forEach((d,i)=>{
    const h=row?(row.h[i]||0):0, c=row?(row.c[i]||null):null;
    /* Oprava: kód z buňky se porovnává stejně normalizovaný jako seznam (OČR = OCR). */
    const isEx=!!(c&&ex.has(norm(c).toUpperCase())), ds=dayShift(d,sf);
    if(c)r.codes[c]=(r.codes[c]||0)+1;
    if(h>0){r.totalDays++;r.totalHours+=h;}
    if(d.work){
      fund+=ds;
      if(d.dow===5)r.fridays++;
      /* absence = celý pracovní den bez docházky; kratší směna není absence (projeví se jen v hodinách a u Kafe) */
      if(h>0){r.workDays++;r.workHours+=h;r.cappedHours+=Math.min(h,ds);
        r.otWeek+=Math.max(0,h-ds);
        if(h<ds-1e-9){r.shortDays++;r.shortHours+=ds-h;}
      }else if(isEx){r.excusedDays++;r.excusedHours+=ds;
        if(!S.settings.excusedReducesFund)r.absDays++;
      }else{r.missed++;r.absDays++;}
    }else if(h>0){r.wkDays++;r.wkHours+=h;}
    r.cells.push({d,h,c,isEx,ds});
  });
  if(S.settings.excusedReducesFund)fund=Math.max(0,fund-r.excusedHours);
  r.fund=fund;
  r.fundRatio=fund>0?clamp(r.cappedHours/fund,0,1):1;
  r.otCap=meta.otCap;
  /* o kolik je osobní fond nižší než společný (kvůli zkrácenému pátku) - sníží i práh Kafe */
  r.friDiff=sf?Math.max(0,r.fridays*(S.settings.shift-friShift())):0;
  return r;
}
function posOf(e){return S.positions.find(p=>p.id===e.positionId)||null;}
function levelOf(e){
  const pos=posOf(e);
  const n=(pos&&e.level>=1&&e.level<=4)?e.level:0;
  const lv=n?pos.levels[n-1]:null;
  return {pos,n,lv,base:lv&&!pos.onlyKafe?Math.max(0,Math.round(+lv.tabaky||0)):0};
}
/* nejvyšší splněný řádek pravidel: {at: práh, t: tabáky} */
function pickRule(rules,val){
  let best=null;
  (rules||[]).forEach(r=>{const at=+r.at||0;if(at>0&&val>=at&&(!best||at>+best.at))best=r;});
  return best;
}
/* Docházka v tabácích.
   Chybějící hodiny ve všední dny -> celé dny (zaokrouhleno, 7,5 h = 1 den).
   Každá víkendová směna vyplní jeden chybějící den. Co zbyde chybět -> srážka podle pravidel pozice.
   Když nic nechybí, zbylé víkendové směny -> bonus podle pravidel pozice. */
function attTabaky(a,pos){
  const r={gross:0,filled:0,missing:0,wkLeft:0,delta:0,rule:null,kind:null};
  if(!a||!a.found)return r;
  r.gross=a.absDays;                          // dny absence (celé dny bez docházky)
  r.filled=Math.min(a.wkDays,r.gross);
  r.missing=r.gross-r.filled;
  r.wkLeft=a.wkDays-r.filled;
  if(!pos||pos.onlyKafe)return r;
  if(r.missing>0){
    const ru=pickRule(pos.penalty,r.missing);
    if(ru){r.rule=ru;r.kind="pen";r.delta=-Math.abs(Math.round(+ru.t||0));}
  }else{
    const ru=pickRule(pos.bonus,r.wkLeft);
    if(ru){r.rule=ru;r.kind="bonus";r.delta=Math.abs(Math.round(+ru.t||0));}
  }
  return r;
}
/* Kafe: globální práh hodin pro vybraný měsíc; bez ručního nastavení = fond (prac. dny x směna) */
function kafeThreshold(p){
  if(!p)return null;
  const o=S.kafe?S.kafe[p.id]:null;
  return (o!=null&&o!==""&&isFinite(+o))?+o:periodMeta(p).fund;
}
function kafeIsCustom(p){return !!(p&&S.kafe&&S.kafe[p.id]!=null&&S.kafe[p.id]!=="");}
/* prázdná hodnota nebo přesně fond = bez vlastního prahu, takže bude dál sledovat fond */
function setKafe(v){
  const p=curPeriod();if(!p)return;
  S.kafe=S.kafe||{};
  const t=String(v==null?"":v).trim().replace(",",".");
  if(t===""||!isFinite(+t)||Math.abs(+t-periodMeta(p).fund)<1e-9)delete S.kafe[p.id];
  else S.kafe[p.id]=Math.max(0,n2(+t));
}
/* strop pozice: ruční hodnota, jinak nejvyšší úroveň */
function posMaxAuto(p){return p&&!p.onlyKafe?Math.max(0,...p.levels.map(l=>Math.round(+l.tabaky||0))):0;}
function posMax(p){
  if(!p||p.onlyKafe)return 0;
  return (p.max!=null&&p.max!==""&&isFinite(+p.max))?Math.max(0,Math.round(+p.max)):posMaxAuto(p);
}
/* srážka v tabácích z % součtu: zaokrouhlení na celé, ale každá sankce stojí aspoň 1 tabák; 100 % a víc = vše */
function sanDeduct(narok,pctSum,count=1){
  if(narok<=0||pctSum<=0)return 0;
  if(pctSum>=100)return narok;
  /* Oprava: aspoň 1 tabák za každou sankci (dřív jen 1 celkem, i když nápověda slibovala každou). */
  return Math.min(narok,Math.max(Math.max(1,count),Math.round(narok*pctSum/100)));
}
function cutoffDays(){const c=+S.settings.absenceCutoff;return (S.settings.absenceCutoff!=null&&c>0)?Math.round(c):0;}
function evaluate(e,p){
  const a=p?attendance(p,e.key):null;
  const L=levelOf(e);
  const at=attTabaky(a,L.pos);
  const max=posMax(L.pos);
  /* ztráta nároku: při velké absenci nedostane nic - ani tabák, ani kafe, ani ruční úpravou */
  const cut=cutoffDays();
  const lost=!!(a&&a.found&&cut&&at.missing>=cut);
  const raw=L.base+at.delta;
  const capped=!lost&&raw>max;                 // úroveň + docházka nikdy nad maximum pozice
  const narok=lost?0:Math.max(0,Math.min(raw,max));
  const sans=sanFor(e.key,adjKey());
  const pctSum=Math.min(100,sans.reduce((x,s)=>x+(s.pct!=null?+s.pct||0:0),0));
  const pctCount=sans.filter(s=>s.pct!=null&&+s.pct>0).length;
  const legacy=sans.reduce((x,s)=>x+(s.pct==null?Math.round(+s.points||0):0),0);
  const sanT=sanDeduct(narok,pctSum,pctCount);
  const pen=Math.min(narok,sanT+legacy);       // tabáky stržené sankcemi
  const sub=narok-pen;
  /* ruční úprava drží výsledek v 0..maximum + povolený přesah (jen ručně, bonus za víkendy strop nepřekročí) */
  const over=Math.max(0,Math.round(+S.settings.adjOver||0));
  const kafeOnly=!!(L.pos&&L.pos.onlyKafe);   // pozice bez tabáků: ani ruční úprava je nepřidá
  const adjMin=-sub, adjMax=lost||kafeOnly?0:Math.max(0,max+over-sub);
  const adj=Math.round(clamp(adjOf(e.key),adjMin,adjMax));
  const total=clamp(sub+adj,0,lost||kafeOnly?0:max+over);
  const kth0=kafeThreshold(p);
  const kth=kth0==null?null:Math.max(0,kth0-(a?a.friDiff:0));   // zkrácený pátek sníží i práh Kafe
  const kafe=!lost&&!!(a&&a.found&&kth!=null&&a.totalHours>=kth-1e-9);
  const issued=p?issuedOf(e.key):null;
  const issuedChanged=!!(issued&&(issued.tabaky!==total||!!issued.kafe!==kafe));
  const toIssue=total>0||kafe;
  return {att:a,L,at,pos:L.pos,kafeOnly,max,raw,capped,narok,lost,cut,attEff:lost?-L.base:narok-L.base,
    issued,issuedChanged,toIssue,
    sans,pctSum,pctCount,sanT,legacy,pen,sub,adj,adjMin,adjMax,total,
    kafe,kafeTh:kth,pctv:max?pct(Math.min(1,total/max)):0};
}
function allRows(){
  const p=S.current?S.periods[S.current]:null;
  return Object.values(S.employees).map(e=>{
    const ev=evaluate(e,p),prod=productionOf(e.key),perf=perfOf(ev.att,prod);
    return {e,p,prod,...ev,perf,raise:raiseOf(ev.L,perf)};
  });
}

/* ---------- navýšení platu ----------
   Tři ukazatele v % za měsíc:
   - docházka = odpracované hodiny (ve všední dny, nejvýš směna) z fondu hodin, jako u grafu profilu;
   - plnění normy = normované minuty ÷ strávené minuty (jen řádky evidence, kde je čas i norma);
     rychlejší práce než norma dává přes 100 %;
   - využití fondu = čas strávený nad zakázkami ÷ hodiny v práci podle docházky.
   Hodnoty se porovnávají zaokrouhlené na desetiny (jak je vidět v aplikaci). */
const round1=v=>Math.round(v*10)/10;
function perfOf(att,prod){
  const a=att&&att.found?att:null,pp=prodPeriod();
  const time=!!(pp&&pp.time);
  return {
    att:a?round1(a.fundRatio*100):null,
    norm:prod&&prod.nspent>0?round1(prod.norm/prod.nspent*100):null,
    use:a&&a.totalHours>0&&time?round1((prod?prod.spent:0)/(a.totalHours*60)*100):null,
    spent:prod&&time?prod.spent:null,normMin:prod&&time?prod.norm:null,nspent:prod&&time?prod.nspent:null,time
  };
}
const PERF_KEYS=[["att","docházka","minAtt"],["norm","plnění normy","minNorm"],["use","využití fondu","minUse"]];
function levelChecks(lv,perf){
  return PERF_KEYS.filter(([,,f])=>lv[f]!=null).map(([k,label,f])=>({k,label,min:+lv[f],val:perf[k],ok:perf[k]!=null&&perf[k]>=+lv[f]-1e-9}));
}
/* Navýšení platu: nejvyšší úroveň do úrovně člověka včetně, která má navýšení a jejíž podmínky splnil.
   own = podmínky vlastní úrovně (i když nesplněné), ať je vidět, co chybí. */
function raiseOf(L,perf){
  const out={pct:0,lvl:0,checks:[],own:null};
  if(!L||!L.pos||!L.n)return out;
  for(let n=L.n;n>=1;n--){
    const lv=L.pos.levels[n-1],pct=+lv.raise||0;
    if(!(pct>0))continue;
    const checks=levelChecks(lv,perf);
    if(!out.own)out.own={lvl:n,pct,checks};
    if(checks.every(c=>c.ok))return {...out,pct,lvl:n,checks};
  }
  return out;
}
function hasRaise(p){return !!(p&&p.levels.some(l=>+l.raise>0));}
function pctText(v){return v==null?"—":nf(v,1)+" %";}
function raiseText(x){return x&&x.pct>0?"+"+nf(x.pct,1)+" %":"—";}
/* vyřazení ze seznamu: člověk zůstává v evidenci, ale nehodnotí se a nikde se nenabízí */
function activeRows(){return allRows().filter(r=>!r.e.excluded);}
function excludedPeople(){return Object.values(S.employees).filter(e=>e.excluded)
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
  if(!r.pos)return "Bez pozice — pravidla docházky se neuplatní";
  if(t.kind==="pen")return calc+" → pravidlo ≥ "+t.rule.at+": −"+Math.abs(t.delta)+
    (t.wkLeft?"":", bonus ne (víkendy padly na vyplnění)");
  if(t.kind==="bonus")return (t.filled?calc+", ":"bez absence, ")+t.wkLeft+" víkend. "+smW(t.wkLeft)+" navíc → pravidlo ≥ "+t.rule.at+": +"+t.delta+
    (r.capped?", zastropováno na maximum pozice "+r.max+" (připsáno +"+Math.max(0,r.attEff)+")":"");
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
    {t:"Pozice",v:r=>r.pos?r.pos.name:""},
    {t:"Jen Kafe",v:r=>r.kafeOnly?"ano":""},
    {t:"Úroveň",v:r=>r.L.n||""},
    {t:"Název úrovně",v:r=>r.L.n?r.L.lv.name:""},
    {t:"Zkrácený pátek",v:r=>r.e.shortFri?"ano":""},
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
    {t:"Tabáky za úroveň",v:r=>r.L.base,s:1},
    {t:"Docházka ± (podle pravidla)",v:r=>r.at.delta,s:1},
    {t:"Pravidlo docházky",v:r=>attExplain(r)},
    {t:"Maximum pozice",v:r=>r.pos?r.max:""},
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
    {t:"Navýšení platu %",v:r=>r.raise&&r.raise.pct?r.raise.pct:""},
    {t:"Navýšení podle úrovně",v:r=>r.raise&&r.raise.pct?r.raise.lvl:""},
    {t:"Nesplněno pro navýšení",v:r=>r.raise&&r.raise.own&&r.raise.lvl!==r.raise.own.lvl?r.raise.own.checks.filter(c=>!c.ok).map(c=>c.label+" "+pctText(c.val)+" z "+nf(c.min,1)+" %").join(", "):""}
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
  const main=[["Příjmení","Jméno","Pozice","Úroveň (1-4)","Název úrovně","Tabáky za úroveň","Zkrácený pátek","Vyřazen ze seznamu","Poznámka","Oddělení","ID v evidenci práce"]];
  people.forEach(e=>{const L=levelOf(e);
    main.push([e.last,e.first,L.pos?L.pos.name:"",L.n||"",L.n?L.lv.name:"",L.pos&&L.pos.onlyKafe?"jen Kafe":L.n?L.base:"",e.shortFri?"ano":"",e.excluded?"ano":"",e.note||"",L.pos?deptOf(L.pos):"",e.wid||""]);});
  const posSheet=[["Pozice","Úroveň","Název úrovně","Tabáky","Co úroveň obnáší","Navýšení platu %","Docházka ≥ %","Plnění normy ≥ %","Využití fondu ≥ %"]];
  S.positions.forEach(p=>p.levels.forEach((lv,i)=>posSheet.push([p.name,i+1,lv.name,p.onlyKafe?"jen Kafe":+lv.tabaky||0,lv.desc||"",+lv.raise||"",lv.minAtt??"",lv.minNorm??"",lv.minUse??""])));
  const rules=[["Pozice","Typ","Práh","Tabáky","Význam"]];
  S.positions.forEach(p=>{
    rules.push([p.name,"maximum","",posMax(p),p.max!=null&&p.max!==""?"vlastní strop pozice":"podle nejvyšší úrovně"]);
    (p.penalty||[]).forEach(r=>rules.push([p.name,"srážka",+r.at,-Math.abs(+r.t||0),"chybí aspoň "+r.at+" prac. "+dnW(+r.at)]));
    (p.bonus||[]).forEach(r=>rules.push([p.name,"bonus",+r.at,Math.abs(+r.t||0),"aspoň "+r.at+" víkend. "+smW(+r.at)+" navíc"]));
  });
  return {main,posSheet,rules};
}

function applyRoster(aoa){
  if(!aoa||!aoa.length)return {err:"Soubor je prázdný."};
  let hr=-1,map={};
  for(let r=0;r<Math.min(aoa.length,15);r++){
    const row=(aoa[r]||[]).map(c=>norm(c));
    const m={};row.forEach((c,i)=>{
      if(c.startsWith("prijmeni"))m.last=i;
      else if(c.startsWith("jmeno"))m.first=i;
      else if(c.startsWith("pozice"))m.pos=i;
      else if(c.startsWith("uroven")&&m.lvl==null)m.lvl=i;
      else if(c.startsWith("nazev uroven"))m.lvlName=i;
      else if(c.startsWith("zkraceny patek"))m.fri=i;
      else if(c.startsWith("vyrazen"))m.excl=i;
      else if(c.startsWith("poznamka"))m.note=i;
      else if(c.startsWith("id v evidenci")||c==="id")m.wid=i;});
    if(m.last!=null&&m.first!=null&&m.pos!=null){hr=r;map=m;break;}
  }
  if(hr<0)return {err:"Nenašel jsem hlavičku se sloupci Příjmení, Jméno, Pozice."};
  const findPos=name=>{const n=norm(name);if(!n)return null;
    let p=S.positions.find(x=>norm(x.name)===n);
    if(!p){p=mkPos(uid("p"),String(name).trim(),[]);S.positions.push(p);}
    return p;};
  /* úroveň: číslo 1-4, nebo název úrovně dané pozice (např. "Profík") */
  const readLevel=(pos,v,vName)=>{
    const t=norm(v);
    if(/^[1-4]$/.test(t))return +t;
    const byName=nm=>{const n=norm(nm);if(!n||!pos)return 0;
      const i=pos.levels.findIndex(l=>norm(l.name)===n);return i>=0?i+1:0;};
    return byName(v)||byName(vName)||0;
  };
  let touched=0,created=0,newPos=S.positions.length,noLvl=0;
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
    if(map.lvl!=null||map.lvlName!=null){
      const n=readLevel(pos,map.lvl!=null?row[map.lvl]:null,map.lvlName!=null?row[map.lvlName]:null);
      if(n)e.level=n;else if(pos)noLvl++;
    }
    if(pos&&!e.level)e.level=1;
    const yes=v=>["ano","a","1","x","true","yes","ok"].includes(norm(v));
    if(map.fri!=null)e.shortFri=yes(row[map.fri]);
    if(map.excl!=null)e.excluded=yes(row[map.excl]);
    if(map.note!=null&&row[map.note]!=null)e.note=String(row[map.note]).trim();
    if(map.wid!=null&&row[map.wid]!=null&&String(row[map.wid]).trim())setWid(e.key,row[map.wid]);
    touched++;
  }
  newPos=S.positions.length-newPos;
  if(!touched)return {err:"Pod hlavičkou nebyla žádná jména."};
  return {touched,created,newPos,noLvl};
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
/* Po ukázce zůstávají pozice, ale ukázkové navýšení platu ne (vlastní úpravy ano). */
function dropDemoRaise(positions){
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
    st.employees[key]={key,first,last,positionId:posId,level:lvl,shortFri:sf,note:""};
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
  /* navýšení platu u úrovní 2–4 s podmínkami (ukázka) */
  st.positions.forEach(p=>p.levels.forEach((lv,i)=>{if(i>0)Object.assign(lv,DEMO_RAISE(i));}));
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

/* ---------------- načtení a kontrola dat ----------------
   Data přicházejí ze serveru (šifrovaná), ze zálohy nebo z JSON exportu původní
   aplikace. Každý vstup se převede do známého tvaru: neznámé klíče zmizí, čísla se
   omezí na rozumný rozsah a id mohou obsahovat jen bezpečné znaky. */
const SAFE_ID=/^[A-Za-z0-9_-]{1,40}$/;
const PERIOD_ID=/^\d{4}-\d{2}$/;
const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
const OV_COLUMN_KEYS=["days","hours","wk","kafe","lvl","prod","att","pen","adj","iss","raise"];
const DATA_VERSION=3;
const LOG_MAX=2000;
const HIST_MAX=200;
const LOG_KINDS=["person","level","sanction","adjust","issue","import","position","settings","data"];
function sanitizeState(input){
  const o=(input&&typeof input==="object"&&!Array.isArray(input))?input:{};
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const arr=v=>Array.isArray(v)?v:[];
  const str=(v,max)=>String(v==null?"":v).slice(0,max);
  const num=(v,d,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?clamp(n,lo,hi):d;};
  const int=(v,d,lo,hi)=>Math.round(num(v,d,lo,hi));
  const rules=list=>arr(list).filter(r=>r&&typeof r==="object").slice(0,20).map(r=>({at:int(r.at,1,1,31),t:int(r.t,0,0,100)}));
  /* klíče z dat nesmí přepsat prototyp objektu (__proto__ apod.) */
  const key=(v,max)=>{const k=str(v,max);return (k==="__proto__"||k==="constructor"||k==="prototype")?"":k;};
  const pid=v=>(PERIOD_ID.test(String(v))||v==="_")?String(v):"";
  /* převod ze staršího tvaru (původní load + migrate) */
  o.settings={...DEF_SETTINGS,...obj(o.settings)};
  o.positions=arr(o.positions).filter(x=>x&&typeof x==="object");
  o.employees=obj(o.employees);o.periods=obj(o.periods);o.adjust=obj(o.adjust);
  o.sanctions=arr(o.sanctions);o.production=obj(o.production);o.prodMap=obj(o.prodMap);
  Object.keys(o.employees).forEach(k=>{if(!o.employees[k]||typeof o.employees[k]!=="object")delete o.employees[k];});
  migrate(o);

  const out=blank();
  out.demo=!!o.demo;
  /* procenta s jedním desetinným místem; prázdná podmínka = nehlídá se */
  const pctOpt=(v,hi)=>(v==null||v===""||!Number.isFinite(Number(v)))?null:Math.round(clamp(Number(v),0,hi)*10)/10;
  out.positions=o.positions.filter(p=>typeof p.id==="string"&&SAFE_ID.test(p.id)).slice(0,100).map(p=>({
    id:p.id,name:str(p.name,80),dept:str(p.dept,60).trim(),
    max:(p.max==null||p.max==="")?null:int(p.max,0,0,200),
    onlyKafe:!!p.onlyKafe,
    levels:LEVEL_NAMES.map((n,i)=>{const l=obj(arr(p.levels)[i]);
      return {name:str(l.name==null?n:l.name,40),tabaky:int(l.tabaky,(i+1)*2,0,100),desc:str(l.desc,500),
        raise:pctOpt(l.raise,100)||0,minAtt:pctOpt(l.minAtt,100),minNorm:pctOpt(l.minNorm,300),minUse:pctOpt(l.minUse,100)};}),
    penalty:rules(p.penalty),bonus:rules(p.bonus)
  }));
  const posIds=new Set(out.positions.map(p=>p.id));
  Object.entries(o.employees).slice(0,5000).forEach(([key_,e])=>{
    const k=key(key_,200);if(!k)return;
    out.employees[k]={key:k,first:str(e.first,80),last:str(e.last,80),
      positionId:posIds.has(e.positionId)?e.positionId:null,
      level:(e.level>=1&&e.level<=4)?Math.round(e.level):null,
      note:str(e.note,500)};
    if(e.shortFri)out.employees[k].shortFri=true;
    if(e.excluded)out.employees[k].excluded=true;
    /* ID v evidenci práce (verze 2.1) */
    if(e.wid!=null&&String(e.wid).trim())out.employees[k].wid=str(String(e.wid).trim(),40);
    const emp=out.employees[k];
    /* zaučení na dalších pozicích (jen pro matici dovedností, tabáky neovlivní) */
    const skills={};
    Object.entries(obj(e.skills)).forEach(([id,l])=>{const n=Math.round(+l);if(posIds.has(id)&&id!==emp.positionId&&n>=1&&n<=4)skills[id]=n;});
    if(Object.keys(skills).length)emp.skills=skills;
    /* historie zařazení; kdo ji ještě nemá, dostane výchozí stav platný „odjakživa“ */
    emp.hist=arr(e.hist).filter(h=>h&&typeof h==="object").slice(-HIST_MAX).map(h=>({at:num(h.at,0,0,1e15),
      pos:typeof h.pos==="string"&&SAFE_ID.test(h.pos)?h.pos:null,lvl:(h.lvl>=1&&h.lvl<=4)?Math.round(h.lvl):null}))
      .sort((x,y)=>x.at-y.at);
    if(!emp.hist.length&&emp.positionId)emp.hist.push({at:0,pos:emp.positionId,lvl:emp.level});
  });
  Object.entries(o.periods).forEach(([id,p])=>{
    if(!PERIOD_ID.test(id)||!p||typeof p!=="object")return;
    const days=arr(p.days).filter(d=>typeof d==="string"&&ISO_DAY.test(d)&&d.startsWith(id)).slice(0,31);
    if(!days.length)return;
    const rows={};
    Object.entries(obj(p.rows)).slice(0,5000).forEach(([k,r])=>{
      if(!r||typeof r!=="object"||!key(k,200))return;
      rows[key(k,200)]={first:str(r.first,80),last:str(r.last,80),
        h:days.map((_,i)=>num(arr(r.h)[i],0,0,24)),
        c:days.map((_,i)=>{const c=arr(r.c)[i];return c==null||c===""?null:str(c,16);})};
    });
    const codes={};Object.entries(obj(p.codes)).slice(0,200).forEach(([c,n])=>{if(key(c,16))codes[key(c,16)]=int(n,0,0,100000);});
    out.periods[id]={id,y:+id.slice(0,4),m:+id.slice(5,7),days,rows,codes,file:str(p.file,200),at:num(p.at,0,0,1e15),headerRow:int(p.headerRow,1,1,1000)};
  });
  Object.entries(o.adjust).forEach(([id,b])=>{
    const box={};Object.entries(obj(b)).forEach(([k,v])=>{const n=int(v,0,-100,100);if(n&&key(k,200))box[key(k,200)]=n;});
    if(pid(id)&&Object.keys(box).length)out.adjust[pid(id)]=box;
  });
  out.sanctions=o.sanctions.filter(x=>x&&typeof x==="object"&&typeof x.key==="string").slice(0,20000).map(x=>{
    const base={id:typeof x.id==="string"&&SAFE_ID.test(x.id)?x.id:uid("x"),key:str(x.key,200),period:PERIOD_ID.test(String(x.period))?String(x.period):"",
      note:str(x.note,300),at:num(x.at,Date.now(),0,1e15)};
    if(x.pct!=null)return {...base,name:str(x.name,100),pct:SAN_PCTS.includes(+x.pct)?+x.pct:int(x.pct,10,0,100)};
    return {...base,reason:str(x.reason,100),points:int(x.points,0,0,1000)};
  }).filter(x=>x.period);
  out.sanReasons=arr(o.sanReasons).map(r=>str(r,100).trim()).filter(Boolean).slice(0,60);
  if(!Array.isArray(o.sanReasons))out.sanReasons=DEF_SAN_REASONS.slice();
  Object.entries(o.production).forEach(([id,pp])=>{
    if(!PERIOD_ID.test(id)||!pp||typeof pp!=="object")return;
    const names={};
    Object.entries(obj(pp.names)).slice(0,5000).forEach(([n,rec])=>{
      if(!rec||typeof rec!=="object"||!key(n,200))return;
      const days={};Object.entries(obj(rec.days)).forEach(([iso,ks])=>{if(ISO_DAY.test(iso))days[iso]=num(ks,0,0,1e9);});
      const r={name:str(rec.name,160),total:num(rec.total,0,0,1e12),count:int(rec.count,0,0,1e9),days};
      /* minuty z evidence práce: strávený čas, norma a čas u řádků s normou */
      if(pp.time){r.spent=num(rec.spent,0,0,1e9);r.norm=num(rec.norm,0,0,1e9);r.nspent=num(rec.nspent,0,0,1e9);}
      names[key(n,200)]=r;
    });
    out.production[id]={id,names,records:int(pp.records,0,0,1e9),total:num(pp.total,0,0,1e12),file:str(pp.file,200),at:num(pp.at,0,0,1e15)};
    if(pp.time)out.production[id].time=true;
  });
  Object.entries(o.prodMap).forEach(([n,k])=>{if(typeof k==="string"&&key(n,200)&&key(k,200))out.prodMap[key(n,200)]=key(k,200);});
  Object.entries(obj(o.kafe)).forEach(([id,v])=>{if(PERIOD_ID.test(id)&&v!==""&&v!=null&&Number.isFinite(+v))out.kafe[id]=num(v,0,0,1000);});
  Object.entries(obj(o.issued)).forEach(([id,b])=>{
    const box={};Object.entries(obj(b)).forEach(([k,v])=>{if(v&&typeof v==="object"&&key(k,200)){
      const rec={at:num(v.at,0,0,1e15),tabaky:int(v.tabaky,0,0,1000),kafe:!!v.kafe};
      /* zařazení v době výdeje, ať profil ukáže skutečnost i po pozdějším povýšení */
      if(typeof v.pos==="string"&&SAFE_ID.test(v.pos))rec.pos=v.pos;
      if(v.lvl>=1&&v.lvl<=4)rec.lvl=Math.round(v.lvl);
      box[key(k,200)]=rec;}});
    if(pid(id)&&Object.keys(box).length)out.issued[pid(id)]=box;
  });
  out.log=arr(o.log).filter(x=>x&&typeof x==="object"&&typeof x.text==="string").slice(-LOG_MAX).map(x=>{
    const entry={at:num(x.at,0,0,1e15),by:str(x.by,60),card:/^[a-f0-9]{16}$/.test(String(x.card))?String(x.card):"",
      kind:LOG_KINDS.includes(x.kind)?x.kind:"data",text:str(x.text,400)};
    if(typeof x.key==="string"&&key(x.key,200))entry.key=key(x.key,200);
    if(PERIOD_ID.test(String(x.period)))entry.period=String(x.period);
    /* slučování rychle po sobě jdoucích úprav téže věci (viz appendLog) */
    if(typeof x.m==="string"&&x.m)entry.m=str(x.m,120);
    if(entry.m&&x.v1!=null){entry.p=str(x.p,200);entry.v0=str(x.v0,120);entry.v1=str(x.v1,120);}
    return entry;
  });
  const st=obj(o.settings);
  out.settings={
    shift:num(st.shift,7.5,1,24),
    excused:str(st.excused==null?DEF_SETTINGS.excused:st.excused,300),
    excusedReducesFund:!!st.excusedReducesFund,
    friShift:num(st.friShift,6.5,1,24),
    absenceCutoff:(st.absenceCutoff==null||st.absenceCutoff===""||!(+st.absenceCutoff>0))?null:int(st.absenceCutoff,1,1,31),
    adjStep:int(st.adjStep,1,1,5),
    adjOver:int(st.adjOver,2,0,10),
    hiddenCols:arr(st.hiddenCols).filter(k=>OV_COLUMN_KEYS.includes(k)),
    lockMinutes:int(st.lockMinutes,15,1,240),
    prodCols:cleanProdCols(st.prodCols)
  };
  out.current=(typeof o.current==="string"&&PERIOD_ID.test(o.current))?o.current:null;
  if(!out.current||!out.periods[out.current])out.current=Object.keys(out.periods).sort().reverse()[0]||null;
  out.v=DATA_VERSION;
  return out;
}

/* Mapování sloupců importu výroby (indexy sloupců od 0). */
function cleanProdCols(v){
  if(!v||typeof v!=="object"||Array.isArray(v))return null;
  const col=(x,opt)=>{if((x==null||x==="")&&opt)return null;const n=Math.round(Number(x));return Number.isFinite(n)&&n>=0&&n<60?n:(opt?null:-1);};
  const out={header:Math.max(-1,Math.min(14,Math.round(Number(v.header))||0)),name:col(v.name),date:col(v.date),ks:col(v.ks,true),
    spent:col(v.spent,true),norm:col(v.norm,true),unit:v.unit==="h"?"h":"min",normPer:v.normPer==="piece"?"piece":"row",
    heads:(Array.isArray(v.heads)?v.heads:[]).slice(0,60).map(h=>String(h==null?"":h).slice(0,80))};
  if(!Number.isFinite(Number(v.header)))out.header=-1;
  return out.name<0||out.date<0?null:out;
}

/* ================= verze 2: osobní pohled, historie změn, profil, matice dovedností ================= */

/* Vybrané období, skryté sloupce a doba zamčení patří jen jedné kartičce (osobní nastavení);
   se sdílenými daty na server nejdou. */
function sharedState(st){
  const out=JSON.parse(JSON.stringify(st));
  delete out.current;delete out._demoIssue;
  if(out.settings){delete out.settings.hiddenCols;delete out.settings.lockMinutes;}
  out.v=DATA_VERSION;
  return out;
}

function posIn(st,id){return (st.positions||[]).find(p=>p.id===id)||null;}
function lvlText(st,posId,n){
  if(!posId)return "bez pozice";
  const p=posIn(st,posId);
  const lv=p&&n?p.levels[n-1]:null;
  return (p?p.name:"(smazaná pozice)")+(n?" "+n+(lv&&lv.name?" ("+lv.name+")":""):", bez úrovně");
}
const sgn0=v=>{v=Math.round(+v||0);return v>0?"+"+v:v<0?"−"+Math.abs(v):"0";};

/* Lidsky čitelný seznam změn mezi dvěma uloženými stavy (kdo, co, kdy). Běží při ukládání,
   takže zachytí každou ruční úpravu bez ohledu na to, kde v aplikaci vznikla.
   Vrací i nové záznamy do historie zařazení (hist) jednotlivých lidí. */
function describeChanges(a,b,meta){
  const entries=[],hist=[];
  if(!a||!b)return {entries,hist};
  const at=(meta&&meta.at)||Date.now();
  const base={at,by:String((meta&&meta.by)||"").slice(0,60),card:(meta&&meta.card)||""};
  const add=(kind,text,extra)=>{
    const en={...base,kind,...(extra||{})};
    en.text=String(en.v1!=null?en.p+en.v0+" → "+en.v1:text).slice(0,400);
    entries.push(en);
  };
  const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
  const ea=a.employees||{},eb=b.employees||{};
  const nameIn=(st,k)=>{const e=(st.employees||{})[k];return e?(e.last+" "+e.first).trim():k;};
  const who=k=>nameIn(eb[k]?b:a,k);
  const list=(names,max=4)=>names.slice(0,max).join(", ")+(names.length>max?" a další ("+(names.length-max)+")":"");
  const mon=id=>id==="_"?"bez období":monthLabel(id);
  const per=id=>PERIOD_ID.test(id)?{period:id}:{};
  if(a.demo&&!b.demo)add("data","Ukázková data nahrazena vlastními");

  /* lidé a zařazení */
  const added=Object.keys(eb).filter(k=>!ea[k]),removed=Object.keys(ea).filter(k=>!eb[k]);
  if(added.length>5)add("person","Přidáno "+added.length+" lidí: "+list(added.map(who)));
  else added.forEach(k=>add("person","Přidán do evidence: "+who(k),{key:k}));
  if(removed.length>5)add("person","Smazáno "+removed.length+" lidí: "+list(removed.map(k=>nameIn(a,k))));
  else removed.forEach(k=>add("person","Smazán z evidence: "+nameIn(a,k)));
  added.forEach(k=>{if(eb[k].positionId)hist.push([k,{at,pos:eb[k].positionId,lvl:eb[k].level||null}]);});
  const moves=[],widMoves=[];
  Object.keys(eb).filter(k=>ea[k]).forEach(k=>{
    const x=ea[k],y=eb[k],n=who(k);
    if((x.positionId||null)!==(y.positionId||null)||(x.level||null)!==(y.level||null)){
      moves.push(k);
      hist.push([k,{at,pos:y.positionId||null,lvl:y.level||null}]);
    }
    if(!!x.excluded!==!!y.excluded)add("person",n+(y.excluded?" vyřazen ze seznamu":" vrácen do seznamu"),{key:k});
    if(!!x.shortFri!==!!y.shortFri)add("person",n+": zkrácený pátek "+(y.shortFri?"zapnut":"vypnut"),{key:k});
    if((x.note||"")!==(y.note||""))add("person",n+": upravena poznámka",{key:k,m:"note:"+k});
    if((x.wid||"")!==(y.wid||""))widMoves.push([k,x.wid||"",y.wid||""]);
    const sx=x.skills||{},sy=y.skills||{};
    [...new Set([...Object.keys(sx),...Object.keys(sy)])].filter(id=>(sx[id]||0)!==(sy[id]||0)).forEach(id=>{
      const p=posIn(b,id)||posIn(a,id);
      add("level","",{key:k,m:"skill:"+k+":"+id,p:n+": zaučení na pozici "+(p?p.name:"?")+" ",v0:String(sx[id]||0),v1:String(sy[id]||0)});
    });
  });
  if(widMoves.length>8)add("person","ID v evidenci práce změněno u "+widMoves.length+" lidí: "+list(widMoves.map(m=>who(m[0]))));
  else widMoves.forEach(([k,v0,v1])=>add("person","",{key:k,m:"wid:"+k,p:who(k)+": ID v evidenci práce ",v0:v0||"—",v1:v1||"—"}));
  if(moves.length>8)add("level","Změněno zařazení u "+moves.length+" lidí: "+list(moves.map(who)));
  else moves.forEach(k=>add("level","",{key:k,m:"lvl:"+k,p:who(k)+": ",v0:lvlText(a,ea[k].positionId,ea[k].level),v1:lvlText(b,eb[k].positionId,eb[k].level)}));

  /* sankce */
  const sanTxt=s=>who(s.key)+" – "+(s.pct!=null?s.name+" "+s.pct+" %":(s.reason||"Sankce")+" −"+(+s.points||0)+" tab.")+" ("+mon(s.period)+")"+(s.note?": "+s.note:"");
  const SA=new Map((a.sanctions||[]).map(s=>[s.id,s])),SB=new Map((b.sanctions||[]).map(s=>[s.id,s]));
  SB.forEach((s,id)=>{if(!SA.has(id))add("sanction","Sankce: "+sanTxt(s),{key:s.key,...per(s.period)});});
  SA.forEach((s,id)=>{if(!SB.has(id))add("sanction","Smazána sankce: "+sanTxt(s),{key:s.key,...per(s.period)});});

  /* ruční úpravy a výdej (po měsících) */
  const perKey=(xa,xb,fn)=>{
    [...new Set([...Object.keys(xa||{}),...Object.keys(xb||{})])].sort().forEach(id=>{
      const A=(xa||{})[id]||{},B=(xb||{})[id]||{};
      const keys=[...new Set([...Object.keys(A),...Object.keys(B)])].filter(k=>!same(A[k],B[k]));
      if(keys.length)fn(id,keys,A,B);
    });
  };
  perKey(a.adjust,b.adjust,(id,keys,A,B)=>{
    if(keys.length>8)add("adjust","Ruční úpravy tabáků u "+keys.length+" lidí ("+mon(id)+")",per(id));
    else keys.forEach(k=>add("adjust","",{key:k,...per(id),m:"adj:"+id+":"+k,p:"Ruční úprava "+who(k)+" ("+mon(id)+"): ",v0:sgn0(A[k]),v1:sgn0(B[k])}));
  });
  perKey(a.issued,b.issued,(id,keys,A,B)=>{
    const given=keys.filter(k=>B[k]&&!A[k]),undone=keys.filter(k=>A[k]&&!B[k]),changed=keys.filter(k=>A[k]&&B[k]);
    if(given.length>8)add("issue","Potvrzen výdej u "+given.length+" lidí ("+mon(id)+")",per(id));
    else given.forEach(k=>add("issue","Potvrzen výdej "+who(k)+" ("+mon(id)+"): "+issueWhat(B[k].tabaky,B[k].kafe),{key:k,...per(id)}));
    undone.forEach(k=>add("issue","Zrušeno potvrzení výdeje "+who(k)+" ("+mon(id)+")",{key:k,...per(id)}));
    changed.forEach(k=>add("issue","Znovu potvrzen výdej "+who(k)+" ("+mon(id)+"): "+issueWhat(B[k].tabaky,B[k].kafe),{key:k,...per(id)}));
  });

  /* importy */
  const pa=a.periods||{},pb=b.periods||{};
  Object.keys(pb).sort().forEach(id=>{
    const p=pb[id],info=" ("+Object.keys(p.rows||{}).length+" lidí"+(p.file?", "+p.file:"")+")";
    if(!pa[id])add("import","Nahrána docházka za "+mon(id)+info,per(id));
    else if(pa[id].at!==p.at)add("import","Docházka za "+mon(id)+" nahrána znovu"+info,per(id));
  });
  Object.keys(pa).filter(id=>!pb[id]).forEach(id=>add("import","Smazána docházka za "+mon(id),per(id)));
  const qa=a.production||{},qb=b.production||{};
  Object.keys(qb).sort().forEach(id=>{
    const p=qb[id],info=" ("+(p.records||0)+" zápisů"+(p.file?", "+p.file:"")+")";
    if(!qa[id])add("import","Nahrána evidence práce za "+mon(id)+info,per(id));
    else if(qa[id].at!==p.at)add("import","Evidence práce za "+mon(id)+" nahrána znovu"+info,per(id));
  });
  Object.keys(qa).filter(id=>!qb[id]).forEach(id=>add("import","Smazána evidence práce za "+mon(id),per(id)));
  const prodName=(st,n)=>{for(const p of Object.values(st.production||{}))if(p.names&&p.names[n])return p.names[n].name;return n;};
  const ma=a.prodMap||{},mb=b.prodMap||{};
  Object.keys(mb).filter(n=>ma[n]!==mb[n]).forEach(n=>add("import","Jméno z evidence práce „"+prodName(b,n)+"“ spárováno s "+who(mb[n]),{key:mb[n]}));
  Object.keys(ma).filter(n=>!(n in mb)).forEach(n=>add("import","Zrušeno spárování „"+prodName(a,n)+"“ s "+who(ma[n]),{key:ma[n]}));

  /* pozice */
  const PA=new Map((a.positions||[]).map(p=>[p.id,p])),PB=new Map((b.positions||[]).map(p=>[p.id,p]));
  PB.forEach((p,id)=>{
    const q=PA.get(id),nm=p.name||"(bez názvu)";
    if(!q){add("position","Nová pozice: "+nm);return;}
    if(q.name!==p.name)add("position","",{m:"pname:"+id,p:"Pozice přejmenována: ",v0:"„"+(q.name||"")+"“",v1:"„"+nm+"“"});
    if((q.dept||"")!==(p.dept||""))add("position","",{m:"pdept:"+id,p:"Pozice "+nm+", oddělení: ",v0:q.dept||"—",v1:p.dept||"—"});
    if((q.max==null?null:+q.max)!==(p.max==null?null:+p.max))add("position","",{m:"pmax:"+id,p:"Pozice "+nm+", maximum: ",v0:q.max==null?"podle úrovní":String(q.max),v1:p.max==null?"podle úrovní":String(p.max)});
    p.levels.forEach((lv,i)=>{const o=q.levels[i]||{};
      if((+o.tabaky||0)!==(+lv.tabaky||0))add("position","",{m:"ptab:"+id+":"+i,p:"Pozice "+nm+", úroveň "+(i+1)+" (tabáky): ",v0:String(+o.tabaky||0),v1:String(+lv.tabaky||0)});});
    if(p.levels.some((lv,i)=>(q.levels[i]||{}).name!==lv.name||(q.levels[i]||{}).desc!==lv.desc))add("position","Pozice "+nm+": upraveny názvy nebo popisy úrovní",{m:"pdesc:"+id});
    if(!!q.onlyKafe!==!!p.onlyKafe)add("position","Pozice "+nm+(p.onlyKafe?": jen Kafe, bez tabáků":": znovu s tabáky"),{m:"pkafe:"+id});
    const cond=lv=>PERF_KEYS.filter(([,,f])=>lv[f]!=null).map(([,label,f])=>label+" ≥ "+nf(lv[f],1)+" %").join(", ")||"bez podmínek";
    p.levels.forEach((lv,i)=>{const o=q.levels[i]||{};
      if((+o.raise||0)!==(+lv.raise||0))add("position","",{m:"praise:"+id+":"+i,p:"Pozice "+nm+", úroveň "+(i+1)+" (navýšení platu): ",v0:raiseText({pct:+o.raise||0}),v1:raiseText({pct:+lv.raise||0})});
      if(cond(o)!==cond(lv))add("position","",{m:"pcond:"+id+":"+i,p:"Pozice "+nm+", úroveň "+(i+1)+" (podmínky navýšení): ",v0:cond(o),v1:cond(lv)});});
    if(!same(q.penalty,p.penalty)||!same(q.bonus,p.bonus))add("position","Pozice "+nm+": upravena pravidla docházky",{m:"prules:"+id});
  });
  PA.forEach((q,id)=>{if(!PB.has(id))add("position","Smazána pozice: "+(q.name||"(bez názvu)"));});

  /* nastavení */
  const SET={shift:["délka směny",v=>nf(v)+" h"],friShift:["zkrácený pátek",v=>nf(v)+" h"],excused:["kódy omluvené absence",v=>v||"—"],
    excusedReducesFund:["omluvená absence snižuje fond",v=>v?"ano":"ne"],absenceCutoff:["bez nároku od dní absence",v=>v==null?"vypnuto":String(v)],
    adjStep:["krok ruční úpravy",v=>String(v)],adjOver:["ruční úprava smí přes maximum o",v=>String(v)]};
  Object.entries(SET).forEach(([k,[label,fmt]])=>{
    const x=(a.settings||{})[k],y=(b.settings||{})[k];
    if(!same(x,y))add("settings","",{m:"set:"+k,p:"Nastavení – "+label+": ",v0:fmt(x),v1:fmt(y)});
  });
  const ka=a.kafe||{},kb=b.kafe||{};
  [...new Set([...Object.keys(ka),...Object.keys(kb)])].filter(id=>ka[id]!==kb[id]).forEach(id=>
    add("settings","",{...per(id),m:"kafe:"+id,p:"Práh Kafe za "+mon(id)+": ",v0:ka[id]==null?"fond":nf(ka[id])+" h",v1:kb[id]==null?"fond":nf(kb[id])+" h"}));
  if(!same(a.sanReasons,b.sanReasons))add("settings","Upraven seznam důvodů sankcí",{m:"reasons"});
  if(!same((a.settings||{}).prodCols||null,(b.settings||{}).prodCols||null))add("settings","Nastavení – sloupce importu výroby",{m:"prodcols"});
  return {entries,hist};
}

/* Přidá záznamy do historie. Opakovanou úpravu téže věci od stejné kartičky do 10 minut
   sloučí do jednoho záznamu „původně → teď“; když se hodnota vrátí, záznam zmizí. */
function appendLog(log,entries){
  const out=(log||[]).slice();
  entries.forEach(item=>{
    let en=item;
    if(en.m){
      for(let i=out.length-1;i>=Math.max(0,out.length-60);i--){
        const old=out[i];
        if(old.m!==en.m)continue;
        if(old.card!==en.card||en.at-old.at>10*60000)break;
        out.splice(i,1);
        if(old.v0!=null&&en.v1!=null){
          en={...en,v0:old.v0,text:(en.p+old.v0+" → "+en.v1).slice(0,400)};
          if(old.v0===en.v1)en=null;
        }
        break;
      }
    }
    if(en)out.push(en);
  });
  return out.slice(-LOG_MAX);
}

/* Nové stavy zařazení do historie lidí (pro profil a vyhodnocení starších měsíců). */
function applyHist(st,hist){
  hist.forEach(([k,h])=>{
    const e=st.employees[k];if(!e)return;
    e.hist=e.hist||[];
    const last=e.hist[e.hist.length-1];
    if(last&&last.pos===h.pos&&last.lvl===h.lvl)return;
    e.hist.push({at:h.at,pos:h.pos,lvl:h.lvl});
    if(e.hist.length>HIST_MAX)e.hist=e.hist.slice(-HIST_MAX);
  });
}

/* Zařazení platné k danému okamžiku; před prvním záznamem platí ten první
   (kdo byl zařazen až po importu, hodnotí se i zpětně podle prvního zařazení). */
function levelAt(e,ts){
  const h=e.hist||[];
  if(!h.length)return {pos:e.positionId||null,lvl:e.level||null};
  let cur=h[0];
  for(const x of h){if(x.at<=ts)cur=x;else break;}
  return {pos:cur.pos,lvl:cur.lvl};
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
    const snap=iss&&iss.pos?{pos:iss.pos,lvl:iss.lvl||null,from:"issued"}:{...levelAt(e,monthEnd(id)),from:"hist"};
    const ev=evaluate({...e,positionId:snap.pos,level:snap.lvl},p);
    const a=ev.att&&ev.att.found?ev.att:null;
    const prod=productionOf(key);
    const days=workedDays(a);
    const perf=perfOf(ev.att,prod),raise=raiseOf(ev.L,perf);
    return {id,label:monthLabel(id),hasAtt:!!a,from:snap.from,perf,raise,kafeOnly:ev.kafeOnly,
      posId:snap.pos,pos:ev.pos?ev.pos.name:(snap.pos?"(smazaná pozice)":""),lvl:ev.L.n,lvlName:ev.L.n?ev.L.lv.name:"",base:ev.L.base,
      workDays:a?a.workDays:0,wkDays:a?a.wkDays:0,hours:a?n2(a.totalHours):0,capped:a?n2(a.cappedHours):0,fund:a?n2(a.fund):0,
      absence:a?ev.at.gross:0,missing:a?ev.at.missing:0,excused:a?a.excusedDays:0,shortDays:a?a.shortDays:0,codes:a?a.codes:{},
      attDelta:a?ev.at.delta:0,attEff:a?ev.attEff:0,lost:ev.lost,narok:ev.narok,max:ev.max,
      pctSum:ev.pctSum,pen:ev.pen,adj:ev.adj,total:ev.total,kafe:ev.kafe,kafeTh:ev.kafeTh,
      issued:iss?{tabaky:iss.tabaky,kafe:!!iss.kafe,at:iss.at}:null,
      prod:prod?{total:prod.total,days,perDay:days?prod.total/days:null,perHour:a&&a.totalHours?prod.total/a.totalHours:null}:null,
      sanctions:sanFor(key,id).map(s=>({name:s.pct!=null?s.name:(s.reason||"Sankce"),pct:s.pct!=null?s.pct:null,points:s.pct==null?(+s.points||0):null,note:s.note||"",at:s.at})),
      cells:a?a.cells.map(c=>({d:c.d.d,dow:c.d.dow,h:c.h,c:c.c||"",ex:!!c.isEx,wk:!!(c.d.weekend||c.d.hol),hol:c.d.hol||"",ds:c.ds})):null};
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
  const changes=(e.hist||[]).map((h,i,arr)=>({at:h.at,pos:h.pos,lvl:h.lvl,text:lvlText(S,h.pos,h.lvl),first:i===0,prev:i?lvlText(S,arr[i-1].pos,arr[i-1].lvl):null}))
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
  const rows=Object.values(S.employees).filter(e=>!e.excluded&&((e.positionId&&ids.has(e.positionId))||cols.some(p=>skillOf(e,p.id)>0)))
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
/* Listy pro Excel: přehled všech oddělení, list za každé oddělení a popis úrovní. */
function matrixSheets(){
  const used=new Set(),sheets=[];
  const cell=c=>c.lvl?ILUO[c.lvl]+" "+c.lvl+(c.main?" *":""):"";
  const build=(title,m)=>{
    const head=["Příjmení","Jméno","Hlavní pozice","Úroveň",...m.cols.map(p=>p.name)];
    const rows=[[title+" – matice dovedností ("+new Date().toLocaleDateString("cs-CZ")+")"],
      m.dept?[]:["","","","",...m.cols.map(p=>deptOf(p))],head];
    m.rows.forEach(r=>rows.push([r.e.last,r.e.first,r.pos?r.pos.name:"",r.e.level?r.e.level+(r.pos&&r.pos.levels[r.e.level-1]?" · "+r.pos.levels[r.e.level-1].name:""):"",...r.cells.map(cell)]));
    rows.push([]);
    rows.push(["Samostatní (úroveň 3–4)","","","",...m.coverage.map(c=>c.ready)]);
    rows.push(["Zaučení celkem (1–4)","","","",...m.coverage.map(c=>c.trained)]);
    rows.push([]);
    rows.push(["◔ 1 zaučuje se · ◑ 2 pokročilý · ◕ 3 samostatný · ● 4 profík, zaučuje ostatní · * hlavní pozice"]);
    return rows;
  };
  sheets.push({name:sheetName("Všechna oddělení",used),rows:build("Všechna oddělení",skillMatrix(null)),cols:[16,12,16,16,...S.positions.map(()=>12)]});
  departments().forEach(d=>{const m=skillMatrix(d);sheets.push({name:sheetName(d,used),rows:build(d,m),cols:[16,12,16,16,...m.cols.map(()=>14)]});});
  const legend=[["Oddělení","Pozice","Úroveň","Značka","Název úrovně","Co člověk na úrovni zvládá"]];
  S.positions.forEach(p=>p.levels.forEach((lv,i)=>legend.push([deptOf(p),p.name,i+1,ILUO[i+1],lv.name,lv.desc||""])));
  sheets.push({name:sheetName("Popis úrovní",used),rows:legend,cols:[16,16,8,8,14,60]});
  return sheets;
}

/* Profil do Excelu: měsíce, sankce a změny zařazení. */
function profileSheets(pd){
  const e=pd.e,name=e.last+" "+e.first;
  const months=[["Profil: "+name+" · "+(pd.from?monthLabel(pd.from):"")+" – "+(pd.to?monthLabel(pd.to):"")],
    ["Měsíc","Pozice","Úroveň","Dny","Víkend. směny","Hodiny","Fond","Absence (dny)","Po vyplnění víkendem","Kafe","Docházka ±","Sankce %","Sankce (tab.)","Ruční úprava","Tabáky (výpočet)","Vydáno tabáků","Vydáno kafe","Vyrobeno ks","Ø ks/den","Docházka %","Plnění normy %","Využití fondu %","Navýšení platu %"]];
  const pv=v=>v==null?"":v;
  pd.months.forEach(m=>months.push([m.label,m.pos,m.lvl?m.lvl+" · "+m.lvlName:"",m.hasAtt?m.workDays:"",m.hasAtt?m.wkDays:"",m.hasAtt?m.hours:"",m.hasAtt?m.fund:"",
    m.hasAtt?m.absence:"",m.hasAtt?m.missing:"",m.hasAtt?(m.kafe?"ano":"ne"):"",m.hasAtt?m.attDelta:"",m.pctSum||"",m.pen?-m.pen:"",m.adj||"",m.hasAtt?(m.kafeOnly?"jen Kafe":m.total):"",
    m.issued?m.issued.tabaky:"",m.issued?(m.issued.kafe?"ano":"ne"):"",m.prod?Math.round(m.prod.total):"",m.prod&&m.prod.perDay!=null?n2(m.prod.perDay):"",
    pv(m.perf.att),pv(m.perf.norm),pv(m.perf.use),m.raise.pct||""]));
  const t=pd.totals;
  months.push(["CELKEM","","",t.workDays,t.wkDays,t.hours,t.fund,t.absence,t.missing,t.kafe+"×","","",t.pen?-t.pen:"",t.adj||"",t.tabaky,t.issuedTab,t.issuedKafe+"×",Math.round(t.prodTotal),t.perDay!=null?n2(t.perDay):"",
    t.attendance!=null?round1(t.attendance*100):"",pv(t.normPct),pv(t.usePct),""]);
  const sans=[["Měsíc","Důvod","Srážka","Poznámka","Zadáno"]];
  pd.months.forEach(m=>m.sanctions.forEach(s=>sans.push([m.label,s.name,s.pct!=null?s.pct+" %":"−"+s.points+" tab.",s.note,s.at?new Date(s.at).toLocaleDateString("cs-CZ"):""])));
  const hist=[["Od","Zařazení"]];
  pd.changes.forEach(h=>hist.push([h.at?new Date(h.at).toLocaleDateString("cs-CZ"):"od začátku evidence",h.text]));
  return [{name:"Měsíce",rows:months,cols:[14,16,16,6,8,8,8,8,10,6,10,9,10,10,12,12,10,12,10,10,12,12,12]},
    {name:"Sankce",rows:sans,cols:[14,30,10,40,12]},{name:"Zařazení",rows:hist,cols:[20,40]}];
}

/* ---------------- pravidla hodnocení (PDF) ----------------
   Obsah dokumentu s pravidly: obecná pravidla a každá pozice s úrovněmi, tabáky,
   navýšením platu a podmínkami. Vykreslení do PDF je v app.js. */
function rulesDoc(){
  const st=S.settings;
  const pct=v=>v==null?"—":"≥ "+nf(v,1)+" %";
  const cut=cutoffDays();
  const general=[
    ["Tabáky","Úroveň člověka na pozici dává základní počet tabáků. Docházka ho podle pravidel pozice sníží (srážka za absenci) nebo zvýší (bonus za víkendové směny navíc), nejvýš do maxima pozice. Sankce strhávají "+SAN_PCTS.join(" / ")+" % z nároku, každá aspoň jeden tabák; součet 100 % a víc znamená nic."],
    ["Absence","Absence je celý pracovní den bez docházky; kratší směna absencí není. Každá odpracovaná víkendová nebo sváteční směna vyplní jeden den absence. Omluvená absence (kódy "+(st.excused||"—")+")"+(st.excusedReducesFund?" snižuje fond hodin.":" se počítá jako absence.")],
    ["Kafe","Kafe dostane, kdo odpracuje aspoň fond hodin měsíce (pracovní dny × "+nf(st.shift)+" h"+(st.friShift&&st.friShift!==st.shift?"; kdo má zkrácený pátek, má v pátek plnou směnu "+nf(st.friShift)+" h":"")+"), pokud pro měsíc není nastaven jiný práh."],
  ];
  if(cut)general.push(["Bez nároku","Od "+cut+" "+dnW(cut)+" absence (po vyplnění víkendem) není nárok na tabáky ani Kafe."]);
  general.push(["Navýšení platu","Navýšení platu určuje úroveň člověka na pozici. Dostane ho, když za měsíc splní všechny podmínky své úrovně. Když je nesplní, platí nejvyšší nižší úroveň, jejíž podmínky splnil. Prázdná podmínka se nehlídá."]);
  general.push(["Ukazatele","Docházka = odpracované hodiny ve všední dny (nejvýš celá směna) z fondu hodin měsíce. Plnění normy = normovaný čas ÷ skutečně strávený čas nad zakázkami podle evidence práce; kdo je rychlejší než norma, má přes 100 %. Využití fondu = čas strávený nad zakázkami ÷ hodiny v práci podle docházky."]);
  const positions=S.positions.map(p=>({
    name:p.name||"(bez názvu)",dept:(p.dept||"").trim(),onlyKafe:!!p.onlyKafe,max:posMax(p),raise:hasRaise(p),
    levels:p.levels.map((lv,i)=>({n:i+1,name:lv.name,desc:lv.desc||"",tabaky:p.onlyKafe?"—":String(+lv.tabaky||0),
      raise:+lv.raise?"+"+nf(+lv.raise,1)+" %":"—",att:pct(lv.minAtt),norm:pct(lv.minNorm),use:pct(lv.minUse)})),
    rules:p.onlyKafe?[]:[
      "Maximum: "+posMax(p)+" "+tabW(posMax(p))+(p.max!=null&&p.max!==""?"":" (podle nejvyšší úrovně)")+".",
      "Srážka za absenci: "+((p.penalty||[]).length?p.penalty.slice().sort((a,b)=>a.at-b.at).map(r=>"od "+r.at+" "+dnW(r.at)+" −"+r.t).join(", "):"žádná")+".",
      "Bonus za víkendy navíc: "+((p.bonus||[]).length?p.bonus.slice().sort((a,b)=>a.at-b.at).map(r=>"od "+r.at+" "+smW(r.at)+" +"+r.t).join(", "):"žádný")+"."]
  }));
  return {title:"Pravidla hodnocení",sub:"Tabáky, Kafe a navýšení platu podle pozic",date:new Date().toLocaleDateString("cs-CZ"),
    general,positions,reasons:(S.sanReasons||[]).slice()};
}

/* Oprava: CSV z Excelu bývá ve Windows-1250, z Google Tabulek a Macu v UTF-8.
   Původní aplikace četla vše jako Windows-1250 a UTF-8 soubory měly rozbitou diakritiku. */
function decodeText(buffer){
  const bytes=new Uint8Array(buffer);
  if(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF)return new TextDecoder("utf-8").decode(bytes.subarray(3));
  try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes);}
  catch(e){return new TextDecoder("windows-1250").decode(bytes);}
}

/* Oprava: buňka začínající =, +, − nebo @ by se v Excelu spustila jako vzorec. */
function safeCell(v){
  if(typeof v!=="string")return v;
  return /^[=+\-@\t\r]/.test(v)?"'"+v:v;
}

if(typeof module==="object"&&module.exports){
  module.exports={setState:v=>{S=v;_prodIdx=null;},getState:()=>S};
}
