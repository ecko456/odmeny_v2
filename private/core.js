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
const SAN_PCTS=[5,10,15,20,25,30,35,40,45,50];   // posuvník po 5 % (do verze 2.3 jen 10/30/50)
const DEF_SAN_REASONS=["Nedodržení BOZP","Nedodržení výrobních předpisů","Malá produktivita",
  "Nedodržování stanovených přestávek","Zničení dílů"];
/* ---------- matice dovedností (verze 2.4) ----------
   Skupina (do verze 2.3 „pozice“) má dovednosti hodnocené 0–4. Každá úroveň je 25 %: procento
   skupiny = průměr úrovní dovedností ÷ 4 (dvě dovednosti, jedna na 4 a druhá na 0 = 50 %).
   Dovednost, která „není nutností“ (opt, 2.25), má v průměru váhu OPT_W (čtvrtinu); u prémie
   s podmínkou „všechny dovednosti aspoň X“ se nevyžaduje a v reportu kapacit se ukáže jen
   v celkovém skóre.
   Tabáky za dovednosti = maximum skupiny × procento, zaokrouhleno na celé. */
const STD_SCALE=[
  {name:"Žádná úroveň",desc:"Osoba nemá žádné relevantní znalosti ani zkušenosti v této dovednosti."},
  {name:"Základní úroveň",desc:"Osoba má omezené znalosti a při používání této dovednosti může potřebovat vedení."},
  {name:"Střední úroveň",desc:"Osoba dokáže provádět úkoly pod mírným dohledem a projevuje se u ní rostoucí porozumění."},
  {name:"Pokročilá úroveň",desc:"Osoba dokáže samostatně pracovat na složitých úkolech a může pomáhat nebo vést ostatní."},
  {name:"Odborná úroveň",desc:"Osoba prokazuje hluboké odborné znalosti, poskytuje mentorství a podílí se na strategických rozhodnutích týkajících se této dovednosti."}];
/* Směny lidí: stálá ranní a dvě skupiny, které se střídají (ranní / odpolední). */
/* „O“ = stálá odpolední (verze 2.8): vždy odpoledne, v obou variantách střídání skupin 1 a 2 */
const SHIFTS=[["R","Stálá ranní"],["O","Stálá odpolední"],["S1","Směnnost – skupina 1"],["S2","Směnnost – skupina 2"]];
const SHIFT_KEYS=SHIFTS.map(x=>x[0]);
function mkSkill(name,desc){return {id:uid("s"),name,desc:desc||"",scale:null};}   // scale null = standardní schéma
/* Úroveň: tabáky, popis a navýšení platu (%) s podmínkami v % (null = podmínka se nehlídá). */
function mkLevel(name,tabaky,desc){return {name,tabaky,desc:desc||"",raise:0,minAtt:null,minNorm:null,minUse:null};}
function mkPos(id,name,descs,skills){
  return {id,name,max:null,          // strop celkem; null = bez stropu (víkendy se přičtou k dovednostem)
    onlyKafe:false,                  // skupina bez tabáků: hodnotí se jen Kafe (a prémie)
    levels:LEVEL_NAMES.map((n,i)=>mkLevel(n,(i+1)*2,descs[i])),   // úrovně z verze 2.3, jen pro převod a stará data
    skillset:(skills||[]).map(x=>mkSkill(x)),maxTab:8,tiers:[],
    penalty:JSON.parse(JSON.stringify(DEF_PENALTY)),
    bonus:JSON.parse(JSON.stringify(DEF_BONUS))};
}
const DEF_POSITIONS=[
  mkPos("p_cnc","CNC",["Zaučuje se, pracuje pod dohledem.","Plně samostatný na běžných dílech.",
    "Zvládá hliník i plast.","Zvládá náročné projekty, zaučuje ostatní."],["Obsluha stroje","Seřízení a výměna nástrojů","Úprava programu","Měření a kontrola dílů"]),
  mkPos("p_kon","Kontrola",["Zaučuje se, měří pod dohledem.","Samostatně měří běžné díly.",
    "Měření na 3D.","Uvolňuje první kus, řeší reklamace."],["Měření běžných dílů","Měření na 3D","Uvolnění prvního kusu","Řešení reklamací"]),
  mkPos("p_bru","Brusič",["Zaučuje se, pracuje pod dohledem.","Samostatný na běžných dílech.",
    "Zvládá tenké díly.","Zvládá náročné díly, zaučuje ostatní."],["Broušení běžných dílů","Tenké a citlivé díly","Seřízení brusky"]),
  mkPos("p_pis","Pískování",["Zaučuje se, pracuje pod dohledem.","Samostatný.",
    "Sám nastaví tlak a zrno.","Náročné povrchy, zaučuje ostatní."],["Pískování","Nastavení tlaku a zrna","Náročné povrchy"]),
  mkPos("p_lep","Lepení / Značení",["Zaučuje se, pracuje pod dohledem.","Samostatný.",
    "Laserové značení.","Náročné zakázky, zaučuje ostatní."],["Lepení","Laserové značení","Náročné zakázky"]),
  mkPos("p_dai","Daiho",["Zaučuje se, pracuje pod dohledem.","Plně samostatný.",
    "Sám seřídí stroj.","Zvládá náročné projekty, zaučuje ostatní."],["Obsluha stroje","Seřízení stroje","Náročné projekty"])
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
function save(){_prodIdx=null;_effCache=null;if(typeof onStateChange==="function")onStateChange();}

function blank(){return {positions:JSON.parse(JSON.stringify(DEF_POSITIONS)),employees:{},periods:{},adjust:{},
  sanctions:[],sanReasons:DEF_SAN_REASONS.slice(),production:{},prodMap:{},kafe:{},issued:{},current:null,
  settings:{...DEF_SETTINGS},demo:false,log:[],eff:blankEff(),audit:blankAudit(),marks:{},capReport:blankCapReport(),leadSkills:[],normCutDone:{},logbooks:[],workAudit:blankWorkAudit(),service:blankService(),shortage:blankShortage(),v:DATA_VERSION};}
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
/* sankce - záznam u člověka a měsíce; nové mají pct (5–50 % po 5), starší záznamy mají pevné points.
   wage = srážka ze mzdy: benefity nekrátí, zpracuje se ve mzdách (done = kdo a kdy ji zpracoval). */
function sanFor(key,period){return S.sanctions.filter(s=>s.key===key&&s.period===period);}
function sanLabel(s){
  return s.pct!=null?s.name+" "+s.pct+" %"+(s.wage?" ze mzdy":"")+(s.note?" – "+s.note:"")
                    :(s.reason||"Sankce")+" (−"+(+s.points||0)+" tab., starý záznam)";
}
function reasonsOf(key){return sanFor(key,adjKey()).map(sanLabel).join("; ");}
/* Srážka ze mzdy: upozornění od týdne před koncem měsíce sankce, dokud ji vedoucí neoznačí jako zpracovanou. */
function wageFrom(period){const y=+period.slice(0,4),m=+period.slice(5,7);return addDays(isoOf(Date.UTC(y,m,0)),-7);}
function wageOpen(){return S.sanctions.filter(s=>s.wage&&!s.done&&PERIOD_ID.test(s.period));}
function wagePending(today){const t=today||todayIso();return wageOpen().filter(s=>t>=wageFrom(s.period))
  .sort((a,b)=>a.period.localeCompare(b.period)||norm(nameOfKey(a.key)).localeCompare(norm(nameOfKey(b.key)),"cs"));}
function nameOfKey(key){const e=S.employees[key];return e?(e.last+" "+e.first).trim():key;}
function setWageDone(id,done,meta){
  const s=S.sanctions.find(x=>x.id===id&&x.wage);if(!s)return false;
  if(done)s.done={at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60)};else delete s.done;
  return true;
}
/* Srážky ze mzdy za neproduktivitu (2.12): u skupiny pásma „plnění normy do X %“ → srážka Y %
   ze mzdy (normCut {from, rows[{max, pct}]}, pásma vzestupně). Platí nejnižší pásmo, do kterého
   plnění spadá; bez údaje o normě srážka není. Benefity nekrátí a zpracuje se ve mzdách stejně
   jako ruční srážka ze mzdy: upozornění od týdne před koncem měsíce, „Srážka zpracována“ uloží
   snímek (normCutDone {měsíc: {člověk: {pct, norm, at, by}}}), který se už nepřepočítá. */
function normCutRule(p){return isGroup(p)&&p.normCut&&Array.isArray(p.normCut.rows)&&p.normCut.rows.length?p.normCut:null;}
function normCutBand(rule,nv){if(!rule||nv==null)return null;return rule.rows.find(r=>nv<=r.max+1e-9)||null;}
function normPctOf(prod){return prod&&prod.nspent>0?Math.round(prod.norm/prod.nspent*1000)/10:null;}
function normCutDoneOf(pid,key){const b=S.normCutDone&&S.normCutDone[pid];return b&&b[key]?b[key]:null;}
/* Srážka člověka za měsíc pid; prod = jeho evidence práce za ten měsíc (bez ní se dohledá). */
function normCutOf(e,pid,prod){
  const done=normCutDoneOf(pid,e.key),rule=normCutRule(posOf(e));
  const on=!!rule&&!e.excluded&&!isLead(e)&&PERIOD_ID.test(String(pid))&&(!rule.from||pid>=rule.from);
  if(!on&&!done)return null;
  const nv=on?normPctOf(prod!==undefined?prod:pid===S.current?productionOf(e.key):withPeriod(pid,()=>productionOf(e.key))):null;
  const band=on?normCutBand(rule,nv):null;
  return {rule:on?rule:null,norm:nv,band,pct:done?done.pct:band?band.pct:0,done};
}
/* Srážky za neproduktivitu ke zpracování: měsíce s evidencí práce od týdne před koncem měsíce. */
function normCutPending(today){
  const t=today||todayIso(),out=[];
  const groups=S.positions.filter(normCutRule);
  if(!groups.length)return out;
  Object.keys(S.production||{}).filter(id=>PERIOD_ID.test(id)&&t>=wageFrom(id)).sort().forEach(pid=>{
    const people=Object.values(S.employees).filter(e=>!e.excluded&&!isLead(e)&&!normCutDoneOf(pid,e.key)
      &&groups.some(g=>g.id===e.positionId&&(!g.normCut.from||pid>=g.normCut.from)));
    if(!people.length)return;
    const calc=()=>people.map(e=>{const x=normCutOf(e,pid,productionOf(e.key));
      return x&&x.pct>0?{kind:"norm",id:"n:"+pid+":"+e.key,key:e.key,period:pid,pct:x.pct,norm:x.norm,name:"neproduktivita, plnění normy "+nf(x.norm,1)+" %",note:""}:null;}).filter(Boolean);
    out.push(...(pid===S.current?calc():withPeriod(pid,calc)));
  });
  return out;
}
/* item = {pct, norm} → zpracováno (snímek), null → zase ke zpracování */
function setNormCutDone(pid,key,item,meta){
  S.normCutDone=S.normCutDone||{};
  const b=S.normCutDone[pid]||(S.normCutDone[pid]={});
  if(item)b[key]={pct:item.pct,norm:item.norm==null?null:item.norm,at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60)};
  else delete b[key];
  if(!Object.keys(b).length)delete S.normCutDone[pid];
}
/* Všechny srážky ze mzdy ke zpracování: ruční (sankce) i za neproduktivitu, podle měsíce a jména. */
function wageAllPending(today){
  return [...wagePending(today).map(s=>({kind:"san",id:s.id,key:s.key,period:s.period,pct:s.pct,name:s.name,note:s.note||""})),...normCutPending(today)]
    .sort((a,b)=>a.period.localeCompare(b.period)||norm(nameOfKey(a.key)).localeCompare(norm(nameOfKey(b.key)),"cs"));
}
function normCutText(nc){
  if(!nc||!nc.rows||!nc.rows.length)return "vypnuto";
  return nc.rows.map((r,i)=>(i?"nad "+nf(nc.rows[i-1].max,1)+" do ":"do ")+nf(r.max,1)+" % → "+r.pct+" %").join(", ")+(nc.from?" (od "+monthLabel(nc.from)+")":"");
}
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
const PROD_DEFAULT={header:-1,name:2,date:3,ks:4,spent:null,norm:null,unit:"min",normPer:"row",item:null,iname:null};
const PROD_FIELDS=[["name","Zaměstnanec (jméno nebo ID)"],["date","Datum"],["ks","Kusy"],["spent","Strávený čas"],["norm","Norma (min)"],["item","EAN / položka"],["iname","Název položky"]];
const PROD_WORDS={
  name:["jmeno","pracovnik","zamestnanec","operator","osoba","prijmeni","id zamestnance","id pracovnika","osobni cislo","cislo zamestnance","os. c","os.c","id"],
  date:["datum","den","date","dne"],
  ks:["ks","kusy","kusu","mnozstvi","pocet","vyrobeno","dobre"],
  spent:["straveny cas","skutecny cas","cas skutecny","odpracovany cas","doba","trvani","straveno","cas"],
  norm:["norma","normocas","normohod","norm"],
  /* položka pro Top 5 nejméně efektivních (verze 2.2) */
  item:["ean","polozka","cislo polozky","kod polozky","id polozky","cislo dilu","kod dilu","dil","cislo vyrobku","kod vyrobku","vyrobek","artikl","produkt"],
  iname:["nazev polozky","nazev dilu","nazev vyrobku","nazev artiklu","popis polozky","popis dilu","nazev","popis"]
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
    ["name","date","norm","spent","ks","item","iname"].forEach(f=>{
      const words=PROD_WORDS[f];let hit=null;
      /* „ID zakázky“ nebo „Operace“ není zaměstnanec; „Název zakázky“ není název položky */
      const skip=c=>(f==="name"&&/zakaz|operac|stroj|vyrob|dilu|polozk/.test(norm(c.head)))
        ||((f==="item"||f==="iname")&&/zakaz|operac|zamest|pracovn|stroj|osob/.test(norm(c.head)))
        ||(f==="item"&&/nazev|popis/.test(norm(c.head)));
      for(const w of words){hit=cols.find(c=>!used.has(c.i)&&c.head&&!skip(c)&&(norm(c.head)===w||norm(c.head).split(/[^a-z0-9]+/).includes(w)||(w.includes(" ")&&norm(c.head).includes(w))));if(hit)break;}
      if(!hit)for(const w of words.filter(x=>x.length>=4)){hit=cols.find(c=>!used.has(c.i)&&c.head&&!skip(c)&&norm(c.head).includes(w));if(hit)break;}
      guess[f]=hit?hit.i:(f==="spent"||f==="norm"||f==="item"||f==="iname"?null:guess[f]);
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
    shortFri:sf,fridays:0,absDays:0,shortHours:0,shortDays:0,codedDays:0,codedHours:0};
  let fund=0;
  meta.days.forEach((d,i)=>{
    const raw=row?(row.h[i]||0):0, c=row?(row.c[i]||null):null;
    /* Oprava (2.25.1, přání uživatele, stejně jako Plán a skutečnost): den s kódem nepřítomnosti
       je nepřítomnost i s hodinami („8 D“); hodiny u kódu se nepočítají jako odpracované (Kafe,
       fond, víkendy, absence). Původní aplikace je brala jako práci. */
    const h=c?0:raw;
    if(c&&raw>0){r.codedDays++;r.codedHours+=raw;}
    /* Oprava: kód z buňky se porovnává stejně normalizovaný jako seznam (OČR = OCR). */
    const isEx=!!(c&&ex.has(norm(c).toUpperCase())), ds=dayShift(d,sf);
    if(c)r.codes[c]=(r.codes[c]||0)+1;
    if(h>0){r.totalDays++;r.totalHours+=h;}
    if(d.work){
      fund+=ds;
      if(d.dow===5)r.fridays++;
      /* absence = celý pracovní den bez docházky (i den s kódem a hodinami, 2.25.1); kratší směna není
         absence (projeví se jen v hodinách a u Kafe) */
      if(h>0){r.workDays++;r.workHours+=h;r.cappedHours+=Math.min(h,ds);
        r.otWeek+=Math.max(0,h-ds);
        if(h<ds-1e-9){r.shortDays++;r.shortHours+=ds-h;}
      }else if(isEx){r.excusedDays++;r.excusedHours+=ds;
        if(!S.settings.excusedReducesFund)r.absDays++;
      }else{r.missed++;r.absDays++;}
    }else if(h>0){r.wkDays++;r.wkHours+=h;}
    r.cells.push({d,h,c,isEx,ds,ah:c?raw:0});   // ah = hodiny u kódu (jen pro informaci)
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
/* Skupina v novém tvaru (verze 2.4) má seznam dovedností. Pozice ve starém tvaru (jen úrovně)
   se počítá postaru, dokud ji sanitizeState nepřevede. */
function isGroup(p){return !!(p&&Array.isArray(p.skillset));}
function groupSkills(p){return isGroup(p)?p.skillset:[];}
function skillScale(s){return s&&Array.isArray(s.scale)&&s.scale.length===5?s.scale:STD_SCALE;}
function rateOf(e,id){const v=e&&e.rate?Math.round(+e.rate[id]):0;return v>=0&&v<=4?v:0;}
/* váha dovednosti v procentu skupiny: nutná 1, „není nutností“ čtvrtina (2.25) */
const OPT_W=0.25;
function skillW(s){return s&&s.opt?OPT_W:1;}
function optText(s){return s&&s.opt?"není nutností (váha ¼)":"nutná";}
/* nutné dovednosti skupiny; když jsou všechny nepovinné, platí všechny */
function needSkills(p){const l=groupSkills(p),n=l.filter(s=>!s.opt);return n.length?n:l;}
/* procento skupiny: vážený průměr úrovní jejích dovedností ÷ 4; skupina bez dovedností = null.
   Bez nepovinných dovedností je to prostý průměr jako do verze 2.24 (váhy 1 a ¼ jsou v binárním
   zápisu přesné, takže se výsledek nezmění ani o zaokrouhlení). */
function skillPct(e,p){
  const l=groupSkills(p);
  if(!l.length)return null;
  let w=0,v=0;
  l.forEach(s=>{const k=skillW(s);w+=k;v+=k*rateOf(e,s.id);});
  return v/(w*4)*100;
}
/* nejnižší úroveň nutných dovedností (prémie „všechny dovednosti aspoň X“) */
function minRate(e,p){const l=needSkills(p);return l.length?Math.min(...l.map(s=>rateOf(e,s.id))):0;}
/* tabáky za dovednosti: maximum skupiny × procento, zaokrouhleno na celé (6,5 → 7) */
function skillTab(p,pv){return p&&!p.onlyKafe&&pv!=null?Math.max(0,Math.round((+p.maxTab||0)*pv/100+1e-9)):0;}
function levelOf(e){
  const pos=posOf(e);
  if(pos&&!isGroup(pos)){
    const n=(e.level>=1&&e.level<=4)?e.level:0;
    const lv=n?pos.levels[n-1]:null;
    return {pos,n,lv,pct:null,base:lv&&!pos.onlyKafe?Math.max(0,Math.round(+lv.tabaky||0)):0,legacy:true};
  }
  /* _pct: procento z dřívějška (výdej, historie zařazení) pro výpočet minulých měsíců v profilu */
  const pv=pos?(e._pct!=null&&groupSkills(pos).length?+e._pct:skillPct(e,pos)):null;
  /* n = průměrná úroveň 0–4 jen pro zobrazení; výpočet jde z procenta */
  return {pos,n:pv==null?0:Math.round(pv/25),pct:pv==null?null:Math.round(pv*10)/10,
    lv:pv==null?null:{name:nf(pv,0)+" %",desc:""},base:skillTab(pos,pv),min:pos?minRate(e,pos):0,skills:groupSkills(pos).length};
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
/* strop: ruční hodnota, jinak maximum za dovednosti + nejvyšší bonus za víkendy (bez stropu);
   pozice ve starém tvaru: nejvyšší úroveň */
function posMaxAuto(p){
  if(!p||p.onlyKafe)return 0;
  if(isGroup(p))return Math.max(0,Math.round(+p.maxTab||0))+Math.max(0,...(p.bonus||[]).map(r=>Math.round(+r.t||0)));
  return Math.max(0,...p.levels.map(l=>Math.round(+l.tabaky||0)));
}
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
  const ben=sans.filter(s=>!s.wage);           // srážka ze mzdy benefity nekrátí
  const pctSum=Math.min(100,ben.reduce((x,s)=>x+(s.pct!=null?+s.pct||0:0),0));
  const pctCount=ben.filter(s=>s.pct!=null&&+s.pct>0).length;
  const legacy=ben.reduce((x,s)=>x+(s.pct==null?Math.round(+s.points||0):0),0);
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
    sans,wage:sans.filter(s=>s.wage),pctSum,pctCount,sanT,legacy,pen,sub,adj,adjMin,adjMax,total,
    kafe,kafeTh:kth,pctv:max?pct(Math.min(1,total/max)):0};
}
function allRows(){
  const p=S.current?S.periods[S.current]:null;
  return Object.values(S.employees).map(e=>{
    const ev=evaluate(e,p),prod=productionOf(e.key),perf=perfOf(ev.att,prod);
    const tier=isGroup(ev.pos)?tierOf(e,ev,perf,S.current,true):legacyTier(raiseOf(ev.L,perf));
    return {e,p,prod,...ev,perf,tier,raise:tier,ncut:normCutOf(e,S.current,prod)};
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
function hasRaise(p){return isGroup(p)?!!(p.tiers&&p.tiers.length):!!(p&&p.levels.some(l=>+l.raise>0));}
function pctText(v){return v==null?"—":nf(v,1)+" %";}
function raiseText(x){return x&&x.pct>0?"+"+nf(x.pct,1)+" %":"—";}

/* ---------- prémie skupiny (verze 2.4) ----------
   Stupně prémie (např. Prémie, Extra bonus) mají podmínky: všechny dovednosti skupiny aspoň
   na úrovni X, absence v pracovní dny nejvýš Y, víkendové směny aspoň Z, plnění normy, docházka
   nebo využití fondu aspoň %, a body, které posuzuje vedoucí (např. pracovní morálka). Bod
   vedoucího platí jako splněný, dokud ho u člověka a měsíce neoznačí jako nesplněný. Platí
   nejvyšší stupeň, jehož podmínky člověk za měsíc splnil. Stupeň může mít sérii: kdo ho má
   N měsíců v řadě, má nárok (např. na 2. platovou třídu). */
/* Varianty prémie (2.11): každá varianta má zaškrtnuté podmínky. K původním (všechny dovednosti
   aspoň X, absence, víkendy, docházka, norma, využití fondu, body vedoucího) přibyly vybrané
   dovednosti s úrovní (skills [{id, lvl}], i z jiných skupin), bezproblémové kontroly (maxKt =
   nejvýš tolik provedených kontrol s nálezem v měsíci) a pracovní morálka (moral): jedno
   označení u člověka a měsíce platí pro všechny varianty (bod MORAL_ID). */
const MORAL_ID="moral",MORAL_TEXT="Dodržování řádné pracovní morálky";
/* Kontroly člověka za měsíc pid: provedené a kolik z nich mělo nález (nesplněný bod). */
function ktOf(key,pid){
  const r={n:0,bad:0};
  if(!PERIOD_ID.test(String(pid)))return r;
  Object.values((S.audit&&S.audit.plans)||{}).forEach(p=>(p.items||[]).forEach(it=>{
    if(it.key===key&&it.state==="done"&&String(it.done).slice(0,7)===pid){r.n++;if((it.results||[]).some(x=>!x.ok))r.bad++;}}));
  return r;
}
/* Dovednost podle id ve stavu st (skupina a dovednost), jinak null. */
function skillIn(st,id){for(const g of (st&&st.positions)||[])for(const x of groupSkills(g))if(x.id===id)return {p:g,x};return null;}
/* Smazané dovednosti zmizí i z vybraných dovedností ve variantách prémie. */
function dropTierSkills(ids){S.positions.forEach(q=>(q.tiers||[]).forEach(t=>{if(t.skills)t.skills=t.skills.filter(r=>!ids.has(r.id));}));}
function ktLabel(n){return n?"kontroly: nejvýš "+n+" s nálezem":"bezproblémové kontroly (žádný nález)";}
function markOf(pid,key,pointId){const b=S.marks&&S.marks[pid]&&S.marks[pid][key];return b&&b[pointId]!=null?b[pointId]:null;}
/* note = důvod (i prázdný) → nesplněno; null → zase splněno */
function setMark(pid,key,pointId,note){
  S.marks=S.marks||{};
  const per=S.marks[pid]||(S.marks[pid]={}),box=per[key]||(per[key]={});
  if(note==null)delete box[pointId];else box[pointId]=String(note).slice(0,300);
  if(!Object.keys(box).length)delete per[key];
  if(!Object.keys(per).length)delete S.marks[pid];
}
function tierChecks(t,e,ev,perf,pid){
  const a=ev.att&&ev.att.found?ev.att:null,p=ev.pos,out=[];
  if(+t.minSkill>0){const n=groupSkills(p).length,m=minRate(e,p),opt=n&&needSkills(p).length<n;
    out.push({k:"skill",label:"všechny "+(opt?"nutné ":"")+"dovednosti aspoň na úrovni "+t.minSkill,val:n?m:null,txt:n?"nejnižší úroveň "+m:"skupina nemá dovednosti",ok:n>0&&m>=+t.minSkill});}
  (t.skills||[]).forEach(r=>{const f=skillIn(S,r.id);if(!f)return;const v=rateOf(e,r.id);
    out.push({k:"skill1",id:r.id,label:f.x.name+(f.p!==p?" ("+(f.p.name||"jiná skupina")+")":"")+" aspoň na úrovni "+r.lvl,val:v,txt:"úroveň "+v,ok:v>=r.lvl});});
  if(t.maxAbs!=null||t.minWknd!=null)out.push({k:"att",label:"nahraná docházka za měsíc",val:null,txt:a?"ano":"chybí",ok:!!a});
  if(t.maxAbs!=null)out.push({k:"abs",label:"absence v pracovní dny nejvýš "+t.maxAbs,val:a?a.absDays:null,txt:a?a.absDays+" "+dnW(a.absDays):"—",ok:!!a&&a.absDays<=+t.maxAbs});
  if(t.minWknd!=null)out.push({k:"wknd",label:"víkendové směny aspoň "+t.minWknd,val:a?a.wkDays:null,txt:a?String(a.wkDays):"—",ok:!!a&&a.wkDays>=+t.minWknd});
  PERF_KEYS.forEach(([k,label,f])=>{if(t[f]!=null){const v=perf?perf[k]:null;
    out.push({k,label:label+" aspoň "+nf(+t[f],1)+" %",val:v,txt:v==null?"bez údaje":nf(v,1)+" %",ok:v!=null&&v>=+t[f]-1e-9});}});
  if(t.maxKt!=null){const k=ktOf(e.key,pid);
    out.push({k:"kt",label:ktLabel(+t.maxKt),val:k.bad,txt:k.n?k.n+" "+(k.n===1?"kontrola":k.n<=4?"kontroly":"kontrol")+", s nálezem "+k.bad:"v měsíci bez kontroly",ok:k.bad<=+t.maxKt});}
  const pts=[...(t.moral?[{id:MORAL_ID,text:MORAL_TEXT}]:[]),...(t.manual||[])];
  pts.forEach(pt=>{const m=markOf(pid,e.key,pt.id);
    out.push({k:"manual",id:pt.id,label:pt.text,val:null,txt:m==null?"splněno":"nesplněno"+(m?" – "+m:""),ok:m==null});});
  if(ev.lost)out.push({k:"lost",label:"bez ztráty nároku za absenci",val:null,txt:"bez nároku",ok:false});
  return out;
}
function prevMonth(id){let y=+id.slice(0,4),m=+id.slice(5,7)-1;if(m<1){m=12;y--;}return y+"-"+String(m).padStart(2,"0");}
/* Nejvyšší splněný stupeň za měsíc pid. withStreak = spočítat i série měsíců v řadě. */
function tierOf(e,ev,perf,pid,withStreak){
  const p=ev.pos,tiers=isGroup(p)?(p.tiers||[]):[];
  const res={pct:0,lvl:0,tier:null,name:"",reward:"",checks:[],next:null,list:[],streaks:[]};
  if(!tiers.length)return res;
  tiers.forEach((t,i)=>{const checks=tierChecks(t,e,ev,perf,pid);res.list.push({t,i,lvl:i+1,checks,ok:checks.every(c=>c.ok)});});
  const best=res.list.slice().reverse().find(x=>x.ok)||null;
  if(best)Object.assign(res,{tier:best.t,lvl:best.lvl,pct:+best.t.raise||0,name:best.t.name,reward:best.t.reward||"",checks:best.checks});
  res.next=res.list.find(x=>x.lvl>res.lvl)||null;
  if(withStreak&&pid&&PERIOD_ID.test(pid))res.list.forEach(x=>{
    if(!x.t.streak)return;
    const have=x.ok||res.lvl>=x.lvl?tierStreak(e,x.lvl,pid,x.t.streak.months):0;
    res.streaks.push({lvl:x.lvl,name:x.t.name,months:x.t.streak.months,label:x.t.streak.label,have,ok:have>=x.t.streak.months});
  });
  return res;
}
/* Stupeň člověka v měsíci: z potvrzeného výdeje, jinak spočítaný z docházky a evidence práce. */
function tierLevelIn(e,id){
  const iss=S.issued&&S.issued[id]&&S.issued[id][e.key];
  if(iss&&iss.tier!=null)return iss.tier;
  if(!S.periods[id])return 0;
  return withPeriod(id,()=>{const ev=evaluate(e,S.periods[id]);return tierOf(e,ev,perfOf(ev.att,productionOf(e.key)),id,false).lvl;});
}
/* Kolik měsíců v řadě (do pid včetně) měl člověk aspoň stupeň lvl; počítá nejvýš do cap. */
function tierStreak(e,lvl,pid,cap){
  let n=0,id=pid;
  for(let i=0;i<Math.max(1,cap||12);i++){if(tierLevelIn(e,id)>=lvl){n++;id=prevMonth(id);}else break;}
  return n;
}
/* Stará data (pozice s úrovněmi před převodem): navýšení platu podle úrovně ve tvaru stupně. */
function legacyTier(x){return {pct:x.pct,lvl:x.lvl,tier:null,name:x.pct>0?"Úroveň "+x.lvl:"",reward:"",checks:x.checks,next:null,list:[],streaks:[],own:x.own};}

/* ---------- směny a kapacita (verze 2.4) ---------- */
function shiftOf(e){return e&&SHIFT_KEYS.includes(e.shift)?e.shift:"";}
function shiftName(k){const x=SHIFTS.find(y=>y[0]===k);return x?x[1]:"Bez směny";}
/* detail (2.25): rozpis dovedností v reportu kapacit – need = celkové skóre a nutné dovednosti
   (výchozí, neukládá se, takže se aktualizací data nezmění), all = i nepovinné, none = jen celkové skóre */
const CAP_DETAIL=["need","all","none"];
function blankCapReport(){return {groups:[],thr:3,hidden:[],note:"",s1am:""};}
/* Vedoucí pracovník (2.7): e.lead = oddělení, která má na starosti (může být prázdné).
   Nepočítá se do tabáků, Kafe, prémií, sankcí, kontrol ani kapacity; v matici je jen jako
   vedoucí svých oddělení. */
function isLead(e){return !!(e&&Array.isArray(e.lead));}
function leadsOf(dept){return Object.values(S.employees).filter(e=>isLead(e)&&e.lead.includes(dept))
  .sort((a,b)=>norm(a.last+" "+a.first).localeCompare(norm(b.last+" "+b.first),"cs"));}
/* Průměr dovedností vedoucího v % (každá úroveň 25 %), bez dovedností null. */
function leadPct(e){const sk=S.leadSkills||[];return sk.length?sk.reduce((x,k)=>x+rateOf(e,k.id),0)/sk.length*25:null;}
function leadPeople(){return Object.values(S.employees).filter(isLead).sort((a,b)=>norm(a.last+" "+a.first).localeCompare(norm(b.last+" "+b.first),"cs"));}
/* Přejmenované oddělení: vedoucí ho mají dál zaškrtnuté, pokud staré jméno už žádná skupina nemá. */
function leadsFollowDept(before,after){
  if(!before||before===after||departments().includes(before))return;
  Object.values(S.employees).forEach(e=>{if(isLead(e)&&e.lead.includes(before))e.lead=[...new Set(e.lead.map(d=>d===before?after:d))];});
}
/* Kdo se v matici ukazuje: nevyřazení (a ne vedoucí) se skupinou nebo s nějakým hodnocením. */
function matrixPeople(){return Object.values(S.employees).filter(e=>!e.excluded&&!isLead(e)&&(e.positionId||(e.rate&&Object.keys(e.rate).length)));}
/* ID z evidence práce (2.20): řazení čísel podle hodnoty, lidé bez ID na konci. */
function widCmp(a,b){
  const x=a.wid!=null?String(a.wid):"",y=b.wid!=null?String(b.wid):"";
  if(!x!==!y)return x?-1:1;
  return x.localeCompare(y,"cs",{numeric:true});
}
/* Matice: lidé × dovednosti (všech skupin, jedné skupiny, nebo jednoho oddělení). Řádky = lidé
   těch skupin a lidé odjinud, kteří mají některou z dovedností ohodnocenou (zaučení).
   Řazení podle směny, vlastní skupiny, pořadí skupin a jména (byId: podle ID z evidence práce).
   Nemocní v řádcích jsou, do pokrytí úrovní se dočasně nepočítají (2.20, stejně jako kapacita). */
function skillGrid(groupId,shift,dept,byId){
  const groups=S.positions.filter(p=>isGroup(p)&&groupSkills(p).length&&(!groupId||p.id===groupId)&&(!dept||deptOf(p)===dept));
  const cols=groups.flatMap(p=>groupSkills(p).map(s=>({p,s})));
  const order=new Map(S.positions.map((p,i)=>[p.id,i])),so=k=>{const i=SHIFT_KEYS.indexOf(k);return i<0?9:i;};
  const all=!groupId&&!dept,ids=new Set(groups.map(p=>p.id));
  const rows=matrixPeople().filter(e=>(shift==null||shift==="*"||shiftOf(e)===shift)&&(all||ids.has(e.positionId)||cols.some(c=>rateOf(e,c.s.id)>0)))
    .map(e=>{const pos=posOf(e);return {e,pos,shift:shiftOf(e),home:all||ids.has(e.positionId),pct:isGroup(pos)?skillPct(e,pos):null,cells:cols.map(c=>rateOf(e,c.s.id))};})
    .sort((x,y)=>so(x.shift)-so(y.shift)||(y.home-x.home)||((order.get(x.e.positionId)??999)-(order.get(y.e.positionId)??999))||(byId?widCmp(x.e,y.e):0)||norm(x.e.last+" "+x.e.first).localeCompare(norm(y.e.last+" "+y.e.first),"cs"));
  const live=rows.filter(r=>!r.e.sick);
  const coverage=cols.map((c,j)=>{const by={};[...SHIFT_KEYS,""].forEach(k=>{by[k]={ready:0,trained:0};});
    live.forEach(r=>{const v=r.cells[j];if(v>=1)by[r.shift].trained++;if(v>=3)by[r.shift].ready++;});
    return {by,ready:live.filter(r=>r.cells[j]>=3).length,trained:live.filter(r=>r.cells[j]>=1).length,opt:!!c.s.opt};});   // opt: slabé pokrytí není riziko (2.25)
  return {groups,cols,rows,coverage,sick:rows.length-live.length};
}
/* Kapacita dovedností po směnách: kolik lidí dovednost zvládá aspoň na úrovni thr a součet úrovní.
   Stálá ranní je vždy ráno, stálá odpolední vždy odpoledne, skupiny 1 a 2 se střídají:
   varianta A = ráno stálá ranní + skupina 1, odpoledne stálá odpolední + skupina 2;
   varianta B = ráno stálá ranní + skupina 2, odpoledne stálá odpolední + skupina 1.
   V zaškolování (2.23) je zvlášť, do schopných se nepočítá: člen skupiny pod úrovní thr
   (i s nulou) a člověk odjinud s dovedností ohodnocenou 1 až thr − 1 (zaučuje se).
   U členů skupiny: schopný = průměr dovedností skupiny aspoň thr (capableIn). */
function capableIn(e,p,thr){const v=skillPct(e,p);return v!=null&&v>=thr*25-1e-9;}
function capacity(groupIds,thr,hidden){
  thr=clamp(Math.round(+thr||3),1,4);
  const all=Object.values(S.employees).filter(e=>!e.excluded&&!isLead(e));
  const people=all.filter(e=>!e.sick);   // nemocní se dočasně nepočítají (2.9)
  const head={R:0,O:0,S1:0,S2:0,"":0};people.forEach(e=>{head[shiftOf(e)]++;});
  const hide=new Set(hidden||[]);
  const groups=S.positions.filter(p=>isGroup(p)&&(!groupIds||!groupIds.length||groupIds.includes(p.id))).map(p=>{
    const skills=groupSkills(p).filter(s=>!hide.has(s.id)).map(s=>{
      const by={};[...SHIFT_KEYS,""].forEach(k=>{by[k]={n:0,sum:0,any:0,tr:0,trK:[]};});
      people.forEach(e=>{const v=rateOf(e,s.id),b=by[shiftOf(e)];
        if(v<thr&&(v>=1||e.positionId===p.id)){b.tr++;b.trK.push(e.key);}
        if(!v)return;b.sum+=v;b.any++;if(v>=thr)b.n++;});
      const A={am:by.R.n+by.S1.n,pm:by.O.n+by.S2.n,amT:by.R.tr+by.S1.tr,pmT:by.O.tr+by.S2.tr},
        B={am:by.R.n+by.S2.n,pm:by.O.n+by.S1.n,amT:by.R.tr+by.S2.tr,pmT:by.O.tr+by.S1.tr};
      return {s,opt:!!s.opt,by,A,B,diff:by.S1.n-by.S2.n,weakest:Math.min(A.pm,B.pm),total:by.R.n+by.O.n+by.S1.n+by.S2.n+by[""].n,
        training:by.R.tr+by.O.tr+by.S1.tr+by.S2.tr+by[""].tr};
    });
    const members=people.filter(e=>e.positionId===p.id);
    /* zaškolení pracovníka v zácviku (2.25.2): procento skupiny ÷ cíl (úroveň zkušeného × 25 %), nejvýš 1;
       trS = součet za lidi v zácviku, průměr = trS ÷ počet (zaokrouhluje až zobrazení) */
    const prog=e=>Math.min(1,(skillPct(e,p)||0)/(thr*25));
    const bySh={};[...SHIFT_KEYS,""].forEach(k=>{const m=members.filter(e=>shiftOf(e)===k),okL=m.filter(e=>capableIn(e,p,thr));
      const trL=m.filter(e=>!capableIn(e,p,thr));
      bySh[k]={n:m.length,pct:m.length?m.reduce((x,e)=>x+(skillPct(e,p)||0),0)/m.length:null,ok:okL.length,tr:trL.length,trS:trL.reduce((x,e)=>x+prog(e),0)};});
    const ok=members.filter(e=>capableIn(e,p,thr)).length;
    /* celkové skóre (2.25): schopní členové skupiny podle procenta skupiny (vážený průměr)
       na ranní a odpolední v obou variantách; pod nimi členové v zaškolování */
    const sh=k=>bySh[k];
    const score={A:{am:sh("R").ok+sh("S1").ok,pm:sh("O").ok+sh("S2").ok,amT:sh("R").tr+sh("S1").tr,pmT:sh("O").tr+sh("S2").tr,amTs:sh("R").trS+sh("S1").trS,pmTs:sh("O").trS+sh("S2").trS},
      B:{am:sh("R").ok+sh("S2").ok,pm:sh("O").ok+sh("S1").ok,amT:sh("R").tr+sh("S2").tr,pmT:sh("O").tr+sh("S1").tr,amTs:sh("R").trS+sh("S2").trS,pmTs:sh("O").trS+sh("S1").trS},
      none:{n:sh("").ok,tr:sh("").tr,trS:sh("").trS},
      weaker:sh("S1").ok===sh("S2").ok?((sh("S1").pct||0)===(sh("S2").pct||0)?"":(sh("S1").pct||0)<(sh("S2").pct||0)?"S1":"S2"):sh("S1").ok<sh("S2").ok?"S1":"S2"};
    const trS=Object.values(bySh).reduce((x,b)=>x+b.trS,0);
    return {p,skills,members:members.length,ok,training:members.length-ok,trS,bySh,score,opt:groupSkills(p).filter(s=>s.opt).length};
  }).filter(g=>g.skills.length);
  return {thr,head,groups,sick:all.length-people.length};
}

/* Průměr zaškolení v % (2.25.2): součet zaškolení ÷ počet lidí v zácviku; bez lidí null. */
function trainAvg(sum,n){return n>0?Math.round(sum/n*1000)/10:null;}
/* Celkové skóre po odděleních (2.25): skupiny reportu kapacit seskupené podle oddělení v pořadí
   skupin; u oddělení s víc skupinami součet (člověk je jen v jedné skupině, nic se nezdvojí). */
function capScoreByDept(cap){
  const out=[];
  cap.groups.forEach(g=>{const d=deptOf(g.p);let x=out.find(o=>o.dept===d);if(!x)out.push(x={dept:d,groups:[],total:null});x.groups.push(g);});
  const add=(a,b)=>{Object.keys(b).forEach(k=>{if(typeof b[k]==="number")a[k]=(a[k]||0)+b[k];});return a;};
  out.forEach(x=>{
    if(x.groups.length<2)return;
    const t={members:0,ok:0,training:0,trS:0,A:{},B:{},none:{}};
    x.groups.forEach(g=>{t.members+=g.members;t.ok+=g.ok;t.training+=g.training;t.trS+=g.trS;["A","B","none"].forEach(v=>add(t[v],g.score[v]));});
    x.total=t;
  });
  return out;
}

/* Střídání skupin 1 a 2 po týdnu (2.8): ref = týden, kdy má skupina 1 ranní.
   Vrací "S1" nebo "S2" (kdo má ranní v daném týdnu), bez ref "". */
function morningGroup(weekId,ref){
  const a=weekById(ref),b=weekById(weekId);
  if(!a||!b)return "";
  const d=Math.round((utcOf(b.from)-utcOf(a.from))/(7*DAY_MS));
  return ((d%2)+2)%2===0?"S1":"S2";
}
/* Varianta kapacity pro týden: A = skupina 1 ranní, B = skupina 2 ranní. */
function capWeekVar(weekId,ref){const g=morningGroup(weekId,ref);return g==="S1"?"A":g==="S2"?"B":"";}
/* Pracovní dny týdne: pondělí až pátek bez státních svátků. */
function workDays(weekId){
  const w=weekById(weekId);if(!w)return 5;
  let n=0;
  for(let i=0;i<5;i++){const [y,m,d]=addDays(w.from,i).split("-").map(Number);if(!holidays(y)[m+"-"+d])n++;}
  return n;
}
/* Plánovaná kapacita skupiny (2.9): na osobu za směnu (ks nebo h) × lidé skupiny na směně.
   v = varianta A (skupina 1 ranní) / B (skupina 2 ranní); ranní = stálá ranní + skupina
   s ranní, odpolední = stálá odpolední + druhá skupina; týden = den × pracovní dny.
   Lidé bez směny, nemocní, vyřazení a vedoucí se nepočítají. Bez zapnuté kapacity null.
   S thr (2.23) navíc ok a tr: totéž jen za schopné (průměr dovedností aspoň thr) a za lidi
   v zaškolování; celkové am/pm/day/week zůstávají (počítá s nimi úvod a Audit). */
function groupPlan(p,v,days,thr){
  if(!p||!p.plan||!(+p.plan.v>0))return null;
  const all=Object.values(S.employees).filter(e=>!e.excluded&&!isLead(e)&&e.positionId===p.id);
  const m=all.filter(e=>!e.sick);
  const by=k=>m.filter(e=>shiftOf(e)===k).length;
  const amN=by("R")+(v==="B"?by("S2"):by("S1")),pmN=by("O")+(v==="B"?by("S1"):by("S2"));
  const per=+p.plan.v,d=days==null?5:days,r=x=>Math.round(x*10)/10;
  const out={per,unit:p.plan.unit==="h"?"h":"ks",amN,pmN,am:r(amN*per),pm:r(pmN*per),day:r((amN+pmN)*per),days:d,week:r((amN+pmN)*per*d),none:by(""),sick:all.length-m.length};
  if(thr!=null){
    const t=clamp(Math.round(+thr||3),1,4);
    const part=list=>{const n=k=>list.filter(e=>shiftOf(e)===k).length;
      const a=n("R")+(v==="B"?n("S2"):n("S1")),b=n("O")+(v==="B"?n("S1"):n("S2"));
      return {amN:a,pmN:b,am:r(a*per),pm:r(b*per),day:r((a+b)*per),week:r((a+b)*per*d)};};
    out.ok=part(m.filter(e=>capableIn(e,p,t)));
    out.tr=part(m.filter(e=>!capableIn(e,p,t)));
  }
  return out;
}

/* ---------- plánovaná obsazenost dne (2.15) ----------
   Kdo má podle zařazení ranní a kdo odpolední: stálá ranní ráno, stálá odpolední odpoledne,
   skupiny 1 a 2 podle týdenního střídání (Matice → Směny a kapacita, S.capReport.s1am).
   Bez nastaveného střídání jsou skupiny 1 a 2 zvlášť („rot“). Nemocní, vyřazení a vedoucí
   se nepočítají. O víkendu a ve svátek se ukáže nejbližší pracovní den.
   Po odděleních: lidé na směně, plánovaná kapacita (ks/h na osobu × lidé skupiny) a dovednosti,
   které na směně nikdo (nebo jen jeden) nezvládá aspoň na úrovni z reportu kapacit. */
const DAY_SLOTS=["am","pm"];
/* Směna člověka v týdnu: am / pm, „rot“ = skupina 1 nebo 2 bez nastaveného střídání, „none“ = bez směny. */
function slotOn(e,mg){const s=shiftOf(e);return s==="R"?"am":s==="O"?"pm":s==="S1"||s==="S2"?(mg?(s===mg?"am":"pm"):"rot"):"none";}
function staffDay(from){
  from=from||todayIso();
  let day=from;
  for(let i=0;i<14;i++){const [y,m,d]=day.split("-").map(Number);if(mkDay(y,m,d).work)break;day=addDays(day,1);}
  const week=isoWeek(day).id,rep=S.capReport||blankCapReport(),mg=morningGroup(week,rep.s1am);
  const thr=clamp(Math.round(+rep.thr||3),1,4);
  const slotOf=e=>slotOn(e,mg);
  const all=Object.values(S.employees).filter(e=>!e.excluded&&!isLead(e));
  const live=all.filter(e=>!e.sick);
  const rows=new Map();
  const row=d=>{if(!rows.has(d))rows.set(d,{dept:d,am:[],pm:[],rot:[],none:[],sick:[],plan:{am:{ks:0,h:0},pm:{ks:0,h:0}},risks:[]});return rows.get(d);};
  departments().forEach(row);
  all.forEach(e=>{const r=row(empDept(e)||"Bez skupiny");(e.sick?r.sick:r[slotOf(e)]).push(e);});
  S.positions.forEach(p=>{
    if(!isGroup(p))return;
    const r=rows.get(deptOf(p)),members=live.filter(e=>e.positionId===p.id);
    const per=p.plan&&+p.plan.v>0?+p.plan.v:0,unit=p.plan&&p.plan.unit==="h"?"h":"ks";
    DAY_SLOTS.forEach(sl=>{
      const here=members.filter(e=>slotOf(e)===sl);
      if(per)r.plan[sl][unit]+=here.length*per;
      // riziko jen tam, kde skupina na směně někoho má (oddělení bez odpolední nehlásí nic)
      if(!here.length)return;
      groupSkills(p).filter(s=>!s.opt).forEach(s=>{   // nepovinná dovednost riziko není (2.25)
        const n=live.filter(e=>slotOf(e)===sl&&rateOf(e,s.id)>=thr).length;
        if(n<=1)r.risks.push({slot:sl,group:p.name||"",skill:s.name,n});
      });
    });
  });
  const r1=x=>Math.round(x*10)/10;
  const depts=[...rows.values()].filter(r=>r.am.length+r.pm.length+r.rot.length+r.none.length+r.sick.length)
    .map(r=>({...r,plan:{am:{ks:r1(r.plan.am.ks),h:r1(r.plan.am.h)},pm:{ks:r1(r.plan.pm.ks),h:r1(r.plan.pm.h)}}}));
  const total={am:0,pm:0,rot:0,none:0,sick:0};
  depts.forEach(r=>Object.keys(total).forEach(k=>{total[k]+=r[k].length;}));
  // kontroly naplánované na ten den a termíny Top 5 (po termínu a na ten den)
  const ap=audPlan(week);
  const checks=ap?ap.items.filter(i=>i.day===day&&i.state!=="skip").map(i=>{const e=S.employees[i.key];return {item:i,e:e||null,slot:e?slotOf(e):"none"};}):[];
  const dl=S.eff&&Array.isArray(S.eff.cases)?effDeadlines(day,0):[];
  return {from,day,today:day===from,week,mg,thr,depts,total,
    checks:{list:checks,open:checks.filter(c=>c.item.state==="plan").length,done:checks.filter(c=>c.item.state==="done").length},
    deadlines:{late:dl.filter(x=>x.late).length,due:dl.filter(x=>!x.late).length}};
}

/* ---------- plán a skutečnost podle docházky (2.24, přepočet 2.24.2) ----------
   Týden zpětně, jen pracovní dny (víkend a svátek se nepočítají ani s hodinami) a jen dny
   s nahranou docházkou.
   - V plánu je každý, kdo je v tom týdnu ve skupině (historie zařazení, levelAt ke konci týdne)
     a není vedoucí; směna jen určuje ranní / odpolední (bez směny = „bez směny“, pořád v plánu).
     Vyřazený (dnešní stav) je v plánu, jen když má v tom týdnu v docházce hodiny nebo kód (tehdy
     ještě pracoval). Plánované hodiny = délka směny (zkrácený pátek).
   - Skutečnost = hodiny a kódy z docházky. Odpracované jsou jen hodiny ze dnů v práci: den s kódem
     nepřítomnosti (dovolená, nemoc, neomluveno…) se nepočítá, ani když má u kódu hodiny („8 D“).
     Odpracováno počítá jen lidi v plánu; hodiny lidí mimo
     plán (bez skupiny, vedoucí, jména z docházky, která v Lidech nejsou) jsou zvlášť jako navíc
     a do plnění se nepočítají.
   - Zkušení pracovníci a pracovníci v zácviku zvlášť (dřív „schopní“ a „v zaškolování“, pojmy
     v reportech od 2.25): zkušený = průměr dovedností skupiny aspoň práh reportu
     (capableIn, dnešní hodnocení).
   Páruje se podle jména: řádek docházky má stejný klíč jako člověk (příjmení|jméno). */
const PR_SLOT={am:"ranní",pm:"odpolední",rot:"skupina 1/2",noshift:"bez směny",none:""};
/* Docházka člověka v jeden den: {h, c, found}, nebo null, když pro ten den docházka není. */
function attDay(key,iso){
  const p=S.periods&&S.periods[iso.slice(0,7)];
  const i=p&&Array.isArray(p.days)?p.days.indexOf(iso):-1;
  if(i<0)return null;
  const row=p.rows&&p.rows[key];
  return {h:row?Math.max(0,+row.h[i]||0):0,c:row&&row.c&&row.c[i]?String(row.c[i]):"",found:!!row};
}
/* Týdny, pro které je nahraná aspoň část docházky, od nejnovějšího. */
function attWeeks(){
  const set=new Set();
  Object.values(S.periods||{}).forEach(p=>(p.days||[]).forEach(iso=>set.add(isoWeek(iso).id)));
  return [...set].sort().reverse();
}
/* Počty a hodiny jedné buňky souhrnu (den nebo týden, skupina nebo celkem). */
function prBlank(){
  const part=()=>({planN:0,present:0,planH:0,realH:0,excusedH:0});
  return {planN:0,am:0,pm:0,rot:0,noshift:0,present:0,excused:0,miss:0,planH:0,realH:0,excusedH:0,extraN:0,extraH:0,ok:part(),tr:part()};
}
function prAdd(t,x){
  ["planN","am","pm","rot","noshift","present","excused","miss","planH","realH","excusedH","extraN","extraH"].forEach(k=>{t[k]+=x[k];});
  ["ok","tr"].forEach(p=>["planN","present","planH","realH","excusedH"].forEach(k=>{t[p][k]+=x[p][k];}));
  return t;
}
function prRound(t){
  const r=v=>Math.round(v*100)/100;
  t.planH=r(t.planH);t.realH=r(t.realH);t.excusedH=r(t.excusedH);t.extraH=r(t.extraH);
  ["ok","tr"].forEach(p=>{t[p].planH=r(t[p].planH);t[p].realH=r(t[p].realH);t[p].excusedH=r(t[p].excusedH);});
  return t;
}
function planReality(weekId){
  const w=weekById(weekId);
  if(!w)return null;
  const rep=S.capReport||blankCapReport(),mg=morningGroup(weekId,rep.s1am),thr=clamp(Math.round(+rep.thr||3),1,4);
  const ex=excusedSet(),r2=x=>Math.round(x*100)/100;
  const week=Array.from({length:7},(_,i)=>{const [y,m,d]=addDays(w.from,i).split("-").map(Number);const x=mkDay(y,m,d);
    const p=S.periods&&S.periods[x.iso.slice(0,7)];x.has=!!p&&Array.isArray(p.days)&&p.days.includes(x.iso);return x;});
  const days=week.filter(d=>d.work);   // jen pracovní dny (víkend a svátek se nepočítají)
  const [ty,tm,td]=w.to.split("-").map(Number),endTs=new Date(ty,tm-1,td,23,59,59).getTime();
  const keys=new Set(Object.keys(S.employees));
  days.forEach(d=>{if(d.has)Object.keys(S.periods[d.iso.slice(0,7)].rows||{}).forEach(k=>keys.add(k));});
  const rows=[];
  keys.forEach(key=>{
    const e=S.employees[key]||null;
    const att=days.map(d=>d.has?attDay(key,d.iso):null);
    const inAtt=att.some(a=>a&&a.found),active=att.some(a=>a&&(a.h>0||a.c));
    const posId=e?levelAt(e,endTs).pos:null;
    const pos=posId?S.positions.find(p=>p.id===posId)||null:null;
    const lead=!!e&&isLead(e),out=!!e&&!!e.excluded;
    const planned=!!e&&!!pos&&!lead&&(!out||active);
    const slot=planned?(shiftOf(e)?slotOn(e,mg):"noshift"):"none";
    const capable=planned&&capableIn(e,pos,thr);
    const cells=days.map((d,i)=>{
      const a=att[i],plan=planned&&d.has?dayShift(d,!!e.shortFri):0;
      /* den s kódem je nepřítomnost i s hodinami („8 D“): ty hodiny nejsou odpracované (w = 0) */
      let kind="";
      if(a){if(a.c)kind=ex.has(norm(a.c).toUpperCase())?"excused":"code";else if(a.h>0)kind="work";else if(plan)kind="miss";}
      return {plan,h:a?a.h:null,c:a?a.c:"",kind,w:kind==="work"?a.h:0,absH:a&&a.c?a.h:0};
    });
    const sumH=cells.reduce((x,c)=>x+c.w,0),absH=cells.reduce((x,c)=>x+c.absH,0);
    if(!planned&&sumH<=0)return;   // mimo plán a nepracoval: do výstupu nepatří
    let first=e?e.first:"",last=e?e.last:"";
    if(!e)days.some(d=>{const row=d.has&&S.periods[d.iso.slice(0,7)].rows[key];if(row){first=row.first||"";last=row.last||"";}return !!row;});
    const codes={};
    cells.forEach(c=>{if(c.c)codes[c.c]=(codes[c.c]||0)+1;});
    const planH=r2(cells.reduce((x,c)=>x+c.plan,0));
    rows.push({key,e,first,last,wid:e&&e.wid!=null?String(e.wid):"",pos,dept:pos?deptOf(pos):"",shift:e?shiftOf(e):"",slot,planned,capable,
      note:!e?"v Lidech není":lead?"vedoucí, mimo plán":!pos?"bez skupiny, mimo plán":out?"dnes vyřazen":!shiftOf(e)?"bez směny":!inAtt?"v docházce není (jiné jméno?)":"",
      pct:e&&pos?skillPct(e,pos):null,cells,codes,
      planH,realH:planned?r2(sumH):0,extraH:planned?0:r2(sumH),absH:r2(absH),fill:planned&&planH>0?sumH/planH:null,
      planDays:cells.filter(c=>c.plan).length,workDays:cells.filter(c=>c.plan&&c.kind==="work").length,
      excused:cells.filter(c=>c.plan&&c.kind==="excused").length,miss:cells.filter(c=>c.plan&&(c.kind==="miss"||c.kind==="code")).length,
      extraDays:planned?0:cells.filter(c=>c.w>0).length});
  });
  const order=new Map(S.positions.map((p,i)=>[p.id,i]));
  const ord=r=>r.pos?order.get(r.pos.id):999;
  rows.sort((a,b)=>(ord(a)-ord(b))||(b.planned-a.planned)||(b.capable-a.capable)||norm(a.last+" "+a.first).localeCompare(norm(b.last+" "+b.first),"cs"));
  const byGroup=new Map();
  rows.forEach(r=>{
    const id=r.planned&&r.pos?r.pos.id:"";
    if(!byGroup.has(id))byGroup.set(id,{pos:id?r.pos:null,dept:id?deptOf(r.pos):"",name:id?r.pos.name||"(bez názvu)":"Mimo plán",days:days.map(prBlank)});
    const g=byGroup.get(id),part=r.capable?"ok":"tr";
    r.cells.forEach((c,i)=>{
      const t=g.days[i];
      if(r.planned){
        if(c.plan){t.planN++;t[r.slot]++;t.planH+=c.plan;t[part].planN++;t[part].planH+=c.plan;
          if(c.kind==="work"){t.present++;t[part].present++;}else if(c.kind==="excused"){t.excused++;t.excusedH+=c.plan;t[part].excusedH+=c.plan;}else t.miss++;}
        t.realH+=c.w;t[part].realH+=c.w;
      }else if(c.w>0){t.extraN++;t.extraH+=c.w;}
    });
  });
  const groups=[...byGroup.values()].sort((a,b)=>(a.pos?order.get(a.pos.id):999)-(b.pos?order.get(b.pos.id):999));
  groups.forEach(g=>{g.days.forEach(prRound);g.week=prRound(g.days.reduce(prAdd,prBlank()));});
  const total=prRound(groups.map(g=>g.week).reduce(prAdd,prBlank()));
  const totalDays=days.map((_,i)=>prRound(groups.map(g=>g.days[i]).reduce(prAdd,prBlank())));
  return {week:w,id:weekId,mg,thr,days,rows,groups,total,totalDays,missing:days.filter(d=>!d.has).map(d=>d.iso),
    holidays:week.filter(d=>d.hol&&!d.weekend).map(d=>({iso:d.iso,name:d.hol})),
    unpaired:rows.filter(r=>/v docházce není|v Lidech není/.test(r.note)).length};
}
/* Plnění hodin v % (na desetiny), bez plánu "". */
function prPct(real,plan){return plan>0?Math.round(real/plan*1000)/10:"";}
/* Excel plánu a skutečnosti: Souhrn (týden po skupinách), Po dnech (skupina × den) a Lidé. */
function planRealitySheets(weekId){
  const x=planReality(weekId);
  if(!x)return [];
  const used=new Set(),dl=d=>DOW[d.dow]+" "+d.d+". "+d.m+".";
  const head=[["Plán a skutečnost podle docházky – "+weekLong(x.id)],
    ["Plán = zařazení z Matice dovedností (skupina platná v tom týdnu, směna podle dnešního zařazení, "+(x.mg?"ranní tento týden: skupina "+(x.mg==="S1"?1:2):"střídání skupin 1 a 2 není nastavené")+"), skutečnost = nahraná docházka. Páruje se podle jména."],
    ["Počítají se jen pracovní dny; víkendy a svátky se nepočítají ani s odpracovanými hodinami."+(x.holidays.length?" Svátek v tomto týdnu: "+x.holidays.map(h=>dayText(h.iso,false)+" ("+h.name+")").join(", ")+".":"")],
    ["Odpracováno = jen hodiny ze dnů v práci; den s kódem nepřítomnosti (dovolená, nemoc, neomluveno…) se do odpracovaných hodin nepočítá, ani když má u kódu hodiny (např. 8 D). Odpracováno a plnění jen za lidi v plánu; hodiny lidí mimo plán (bez skupiny, vedoucí, jména mimo Lidi) jsou zvlášť ve sloupcích Mimo plán. Plnění = odpracováno ÷ plán; omluveno = plánované hodiny dnů s omluveným kódem (dovolená, nemoc…), plnění bez omluvených je odpracováno ÷ (plán − omluveno). Zkušený pracovník = průměr dovedností skupiny aspoň úroveň "+x.thr+" (dnešní hodnocení), ostatní jsou pracovníci v zácviku."],
    ...(x.missing.length?[["Docházka chybí pro: "+x.missing.map(iso=>dl(x.days.find(d=>d.iso===iso))).join(", ")+" (tyto dny se neporovnávají)."]]:[]),
    ...(x.unpaired?[["Nespárováno podle jména: "+x.unpaired+" (viz list Lidé, sloupec Poznámka)."]]:[]),
    []];
  /* pojmy v reportech (2.25, přání uživatele): Zkušení pracovníci a Pracovníci v zácviku */
  const PRO="Zkušení pracovníci: ",TRN="Pracovníci v zácviku: ";
  const hoursHead=["Plán h","Odpracováno h","Rozdíl h","Plnění %","Omluveno h","Plnění bez omluvených %",PRO+"lidí v plánu",PRO+"přišlo",PRO+"plán h",PRO+"odpracováno h",PRO+"plnění %",
    TRN+"lidí v plánu",TRN+"přišlo",TRN+"plán h",TRN+"odpracováno h",TRN+"plnění %","Mimo plán: lidodny s hodinami","Mimo plán: h"];
  const hours=t=>[t.planH,t.realH,Math.round((t.realH-t.planH)*100)/100,prPct(t.realH,t.planH),t.excusedH,prPct(t.realH,t.planH-t.excusedH),
    t.ok.planN,t.ok.present,t.ok.planH,t.ok.realH,prPct(t.ok.realH,t.ok.planH),t.tr.planN,t.tr.present,t.tr.planH,t.tr.realH,prPct(t.tr.realH,t.tr.planH),t.extraN,t.extraH];
  const counts=t=>[t.planN,t.present,t.excused,t.miss];
  const sumRows=[...head,["Oddělení","Skupina","Lidodny v plánu","Přišlo","Omluveno","Neomluveno / chybí",...hoursHead]];
  x.groups.forEach(g=>sumRows.push([g.dept,g.name,...counts(g.week),...hours(g.week)]));
  sumRows.push(["","Celkem",...counts(x.total),...hours(x.total)]);
  const dayRows=[...head,["Oddělení","Skupina","Den","Plán lidí","Ranní","Odpolední","Skupina 1/2 (bez střídání)","Bez směny","Přišlo","Omluveno","Neomluveno / chybí",...hoursHead]];
  const dayLine=(g,label,t)=>[g.dept,g.name,label,t.planN,t.am,t.pm,t.rot,t.noshift,t.present,t.excused,t.miss,...hours(t)];
  x.groups.forEach(g=>{
    x.days.forEach((d,i)=>{const t=g.days[i];if(d.has&&(t.planN||t.realH||t.extraH))dayRows.push(dayLine(g,dl(d),t));});
    dayRows.push(dayLine(g,"Celý týden",g.week));
    dayRows.push([]);
  });
  x.days.forEach((d,i)=>{if(d.has)dayRows.push(dayLine({dept:"",name:"Všechny skupiny"},dl(d),x.totalDays[i]));});
  dayRows.push(dayLine({dept:"",name:"Všechny skupiny"},"Celý týden",x.total));
  const pHead=["Příjmení","Jméno","ID v evidenci práce","Oddělení","Skupina","Směna","V týdnu","Dovednosti %","Zkušený pracovník",
    ...x.days.flatMap(d=>[dl(d)+" plán",dl(d)+" skutečnost"]),
    "Plán h","Odpracováno h","Rozdíl h","Plnění %","Mimo plán h","Hodiny u nepřítomnosti (nepočítají se)","Plánované dny","Přišel","Omluveno","Neomluveno / chybí","Kódy","Poznámka"];
  const pRows=[...head,pHead];
  x.rows.forEach(r=>pRows.push([r.last,r.first,r.wid,r.dept,r.pos?r.pos.name:"",r.shift?shiftName(r.shift):"",PR_SLOT[r.slot]||"mimo plán",
    r.pct!=null?Math.round(r.pct):"",r.planned?(r.capable?"ano":"v zácviku"):"",
    ...x.days.flatMap((d,i)=>{const c=r.cells[i];
      if(!d.has)return ["bez docházky","bez docházky"];
      return [c.plan||"",c.c?(c.h>0?c.c+" ("+nf(c.h,2)+" h)":c.c):c.h>0?c.h:c.plan?"chybí":""];}),
    r.planH,r.realH,r.planned?Math.round((r.realH-r.planH)*100)/100:"",r.fill!=null?Math.round(r.fill*1000)/10:"",r.extraH||"",r.absH||"",r.planDays,r.workDays,r.excused,r.miss,
    Object.entries(r.codes).map(([k,n])=>k+(n>1?" ×"+n:"")).join(", "),r.note]));
  const hc=[9,13,9,9,10,12,16,14,14,18,16,16,14,14,18,16,12,10];
  return [{name:sheetName("Souhrn",used),rows:sumRows,cols:[16,20,10,8,10,12,...hc]},
    {name:sheetName("Po dnech",used),rows:dayRows,cols:[16,20,12,9,8,10,12,10,8,10,12,...hc]},
    {name:sheetName("Lidé",used),rows:pRows,cols:[16,12,12,16,18,18,12,11,17,...x.days.flatMap(()=>[11,12]),9,13,9,9,11,16,12,8,10,12,16,30]}];
}

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

/* ---------------- načtení a kontrola dat ----------------
   Data přicházejí ze serveru (šifrovaná), ze zálohy nebo z JSON exportu původní
   aplikace. Každý vstup se převede do známého tvaru: neznámé klíče zmizí, čísla se
   omezí na rozumný rozsah a id mohou obsahovat jen bezpečné znaky. */
const SAFE_ID=/^[A-Za-z0-9_-]{1,40}$/;
const PERIOD_ID=/^\d{4}-\d{2}$/;
const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
const OV_COLUMN_KEYS=["days","hours","wk","kafe","lvl","prod","att","pen","adj","iss","raise","ncut"];
const DATA_VERSION=27;
const LOG_MAX=2000;
const HIST_MAX=200;
const LOG_KINDS=["person","level","sanction","adjust","issue","import","position","settings","data","eff","audit","logbook","workaudit","service","shortage"];
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
  /* Matice dovedností (verze 2.4): skupina = dřívější pozice s dovednostmi, maximem tabáků
     a stupni prémie. Pozice bez seznamu dovedností (data do verze 2.3) se převede tak, aby
     výpočty zůstaly stejné: jedna dovednost se schématem z úrovní pozice, hodnocení = úroveň
     člověka, maximum = tabáky nejvyšší úrovně, strop jako dřív (nejvyšší úroveň nebo vlastní
     maximum) a navýšení platu u úrovní jako stupně prémie. */
  const migrated=new Map();      // id převedené pozice -> id její dovednosti
  const sid=(v,p)=>typeof v==="string"&&SAFE_ID.test(v)?v:uid(p);
  const scaleClean=sc=>Array.isArray(sc)&&sc.length===5?sc.map((x,i)=>{x=obj(x);return {name:str(x.name,60).trim()||STD_SCALE[i].name,desc:str(x.desc,500)};}):null;
  const optInt=(v,hi)=>v==null||v===""||!Number.isFinite(Number(v))?null:int(v,0,0,hi);
  const tierClean=(t,i)=>{t=obj(t);const st=obj(t.streak),seen=new Set();
    return {id:sid(t.id,"t"),name:str(t.name,60).trim()||"Varianta "+(i+1),minSkill:int(t.minSkill,0,0,4),
      raise:pctOpt(t.raise,100)||0,reward:str(t.reward,200),maxAbs:optInt(t.maxAbs,31),minWknd:optInt(t.minWknd,31),
      minAtt:pctOpt(t.minAtt,100),minNorm:pctOpt(t.minNorm,300),minUse:pctOpt(t.minUse,100),
      maxKt:optInt(t.maxKt,31),moral:!!t.moral,
      skills:arr(t.skills).filter(x=>x&&typeof x==="object"&&typeof x.id==="string"&&SAFE_ID.test(x.id)).slice(0,60)
        .map(x=>({id:x.id,lvl:int(x.lvl,1,1,4)})).filter((x,j,l)=>l.findIndex(y=>y.id===x.id)===j),
      manual:arr(t.manual).filter(m=>m&&typeof m==="object").slice(0,10).map(m=>({id:sid(m.id,"m"),text:str(m.text,200).trim()}))
        .filter(m=>m.text&&!seen.has(m.id)&&seen.add(m.id)),
      streak:t.streak&&+st.months>=2?{months:int(st.months,4,2,24),label:str(st.label,80).trim()||"nárok"}:null};};
  const skillIds=new Set();
  out.positions=o.positions.filter(p=>typeof p.id==="string"&&SAFE_ID.test(p.id)).slice(0,100).map(p=>{
    const g={id:p.id,name:str(p.name,80),dept:str(p.dept,60).trim(),
      max:(p.max==null||p.max==="")?null:int(p.max,0,0,500),
      onlyKafe:!!p.onlyKafe,
      levels:LEVEL_NAMES.map((n,i)=>{const l=obj(arr(p.levels)[i]);
        return {name:str(l.name==null?n:l.name,40),tabaky:int(l.tabaky,(i+1)*2,0,100),desc:str(l.desc,500),
          raise:pctOpt(l.raise,100)||0,minAtt:pctOpt(l.minAtt,100),minNorm:pctOpt(l.minNorm,300),minUse:pctOpt(l.minUse,100)};}),
      penalty:rules(p.penalty),bonus:rules(p.bonus)};
    /* plánovaná kapacita (2.9): na osobu za směnu v kusech, nebo v hodinách; jen u skupin, kde je zapnutá */
    /* srážky ze mzdy za neproduktivitu (2.12): pásma plnění normy vzestupně, bez dvojic */
    if(p.normCut&&typeof p.normCut==="object"&&!Array.isArray(p.normCut)){
      const nc=p.normCut,rows=[];
      arr(nc.rows).filter(r=>r&&typeof r==="object").slice(0,10).forEach(r=>{
        const mx=Number(r.max),pc=Math.round(Number(r.pct));
        if(!Number.isFinite(mx)||!Number.isFinite(pc)||pc<1)return;
        const x={max:Math.round(clamp(mx,0,300)*10)/10,pct:Math.min(100,pc)};
        if(!rows.some(y=>y.max===x.max))rows.push(x);
      });
      if(rows.length)g.normCut={from:PERIOD_ID.test(String(nc.from))?String(nc.from):"",rows:rows.sort((a,b)=>a.max-b.max)};
    }
    const pl=obj(p.plan);
    if(+pl.v>0)g.plan=pl.unit==="h"?{v:Math.round(num(pl.v,0,0.1,1000)*10)/10,unit:"h"}:{v:int(pl.v,1,1,100000),unit:"ks"};
    if(Array.isArray(p.skillset)){
      g.skillset=p.skillset.filter(x=>x&&typeof x==="object").slice(0,60).map(x=>({id:sid(x.id,"s"),name:str(x.name,80).trim()||"Dovednost",
        desc:str(x.desc,1000),scale:scaleClean(x.scale),...(x.opt===true?{opt:true}:{})})).filter(x=>!skillIds.has(x.id)&&skillIds.add(x.id));
      g.maxTab=int(p.maxTab,0,0,500);
      g.tiers=arr(p.tiers).slice(0,10).map(tierClean);
    }else{
      /* id odvozená z pozice: převod dá na každém zařízení stejný výsledek, i než se uloží */
      const own=("s"+g.id).slice(0,40),id=skillIds.has(own)?uid("s"):own;migrated.set(g.id,id);skillIds.add(id);
      g.skillset=[{id,name:g.name||"Dovednost",desc:"Převedeno z pozice ve verzi 2.3: úroveň 1–4 odpovídá původní úrovni na pozici.",
        scale:[{...STD_SCALE[0]},...g.levels.map(l=>({name:l.name,desc:l.desc}))]}];
      const top=Math.max(0,...g.levels.map(l=>l.tabaky));
      g.maxTab=top;
      if(!g.onlyKafe&&g.max==null)g.max=top;          // dřív strop = nejvyšší úroveň, bonus za víkendy výš nepustí
      g.tiers=g.levels.map((l,i)=>[l,i]).filter(([l])=>l.raise>0).map(([l,i])=>tierClean({id:("t"+(i+1)+g.id).slice(0,40),name:"Úroveň "+(i+1)+" – "+l.name,minSkill:i+1,
        raise:l.raise,minAtt:l.minAtt,minNorm:l.minNorm,minUse:l.minUse},i));
    }
    return g;
  });
  /* varianty prémie (2.11): vybrané dovednosti jen ty, které ve skupinách existují */
  const grpSkillIds=new Set(out.positions.flatMap(p=>isGroup(p)?groupSkills(p).map(x=>x.id):[]));
  out.positions.forEach(p=>(p.tiers||[]).forEach(t=>{t.skills=t.skills.filter(x=>grpSkillIds.has(x.id));}));
  /* data před 2.11: bod vedoucího „pracovní morálka“ (text ze zadání) je teď podmínka moral;
     označení nesplnění se převede na společný bod MORAL_ID */
  const moralIds=new Set();
  if(!(+o.v>=12)){
    const texts=new Set(["dodrzovani radne pracovni moralky","pracovni moralka","radna pracovni moralka"]);
    out.positions.forEach(p=>(p.tiers||[]).forEach(t=>{
      const m=t.manual.filter(x=>texts.has(norm(x.text)));
      if(!m.length)return;
      t.moral=true;m.forEach(x=>moralIds.add(x.id));t.manual=t.manual.filter(x=>!m.includes(x));
    }));
  }
  /* dovednosti vedoucích (2.10): jeden seznam pro všechny, hodnotí se standardním schématem 0–4 */
  out.leadSkills=arr(o.leadSkills).filter(x=>x&&typeof x==="object").slice(0,60).map(x=>({id:sid(x.id,"l"),name:str(x.name,80).trim()||"Dovednost",desc:str(x.desc,1000)}))
    .filter(x=>!skillIds.has(x.id)&&skillIds.add(x.id));
  const posIds=new Set(out.positions.map(p=>p.id));
  const posById=new Map(out.positions.map(p=>[p.id,p]));
  Object.entries(o.employees).slice(0,5000).forEach(([key_,e])=>{
    const k=key(key_,200);if(!k)return;
    out.employees[k]={key:k,first:str(e.first,80),last:str(e.last,80),
      positionId:posIds.has(e.positionId)?e.positionId:null,
      level:(e.level>=1&&e.level<=4)?Math.round(e.level):null,
      note:str(e.note,500)};
    if(e.shortFri)out.employees[k].shortFri=true;
    if(e.excluded)out.employees[k].excluded=true;
    /* vedoucí pracovník (verze 2.7): oddělení, která má na starosti */
    if(Array.isArray(e.lead))out.employees[k].lead=[...new Set(e.lead.map(d=>str(d,60).trim()).filter(Boolean))].slice(0,50);
    /* ID v evidenci práce (verze 2.1) */
    if(e.wid!=null&&String(e.wid).trim())out.employees[k].wid=str(String(e.wid).trim(),40);
    const emp=out.employees[k];
    /* zaučení na dalších pozicích (jen pro matici dovedností, tabáky neovlivní) */
    const skills={};
    Object.entries(obj(e.skills)).forEach(([id,l])=>{const n=Math.round(+l);if(posIds.has(id)&&id!==emp.positionId&&n>=1&&n<=4)skills[id]=n;});
    if(Object.keys(skills).length)emp.skills=skills;
    /* hodnocení dovedností 0–4 (verze 2.4; 0 se neukládá) a směna */
    const rate={};
    Object.entries(obj(e.rate)).forEach(([id,v])=>{const n=Math.round(+v);if(skillIds.has(id)&&n>=1&&n<=4)rate[id]=n;});
    if(migrated.has(emp.positionId)&&emp.level)rate[migrated.get(emp.positionId)]=emp.level;
    Object.entries(skills).forEach(([id,n])=>{if(migrated.has(id))rate[migrated.get(id)]=n;});
    if(Object.keys(rate).length)emp.rate=rate;
    if(SHIFT_KEYS.includes(e.shift))emp.shift=e.shift;
    /* nemoc (2.9): od kdy; dočasně se nepočítá do kapacit směn */
    if(ISO_DAY.test(String(e.sick||"")))emp.sick=String(e.sick);
    /* původní zařazení z verze 2.3: snímek při převodu, dokud ho vedoucí nesmaže */
    const lg=obj(e.legacy);
    if(e.legacy&&typeof e.legacy==="object"){
      emp.legacy={at:num(lg.at,0,0,1e15),pos:str(lg.pos,80),dept:str(lg.dept,60),level:int(lg.level,0,0,4),levelName:str(lg.levelName,40),
        levelDesc:str(lg.levelDesc,500),tabaky:int(lg.tabaky,0,0,1000),onlyKafe:!!lg.onlyKafe,raise:pctOpt(lg.raise,100)||0,
        skills:arr(lg.skills).filter(x=>x&&typeof x==="object").slice(0,100).map(x=>({pos:str(x.pos,80),level:int(x.level,1,1,4),levelName:str(x.levelName,40)}))};
    }else if((emp.positionId&&migrated.has(emp.positionId))||Object.keys(skills).some(id=>migrated.has(id))){
      const g=emp.positionId?posById.get(emp.positionId):null,lv=g&&emp.level?g.levels[emp.level-1]:null;
      emp.legacy={at:Date.now(),pos:g?g.name:"",dept:g?g.dept:"",level:emp.level||0,levelName:lv?lv.name:"",levelDesc:lv?lv.desc:"",
        tabaky:lv&&!g.onlyKafe?lv.tabaky:0,onlyKafe:!!(g&&g.onlyKafe),raise:lv?lv.raise:0,
        skills:Object.entries(skills).filter(([id])=>migrated.has(id)).map(([id,n])=>{const q=posById.get(id);return {pos:q.name,level:n,levelName:q.levels[n-1].name};})};
    }
    /* historie zařazení; kdo ji ještě nemá, dostane výchozí stav platný „odjakživa“ */
    emp.hist=arr(e.hist).filter(h=>h&&typeof h==="object").slice(-HIST_MAX).map(h=>({at:num(h.at,0,0,1e15),
      pos:typeof h.pos==="string"&&SAFE_ID.test(h.pos)?h.pos:null,lvl:(h.lvl>=1&&h.lvl<=4)?Math.round(h.lvl):null,
      ...(h.pct!=null&&Number.isFinite(+h.pct)?{pct:Math.round(clamp(+h.pct,0,100)*10)/10}:{})}))
      .sort((x,y)=>x.at-y.at);
    if(!emp.hist.length&&emp.positionId)emp.hist.push({at:0,pos:emp.positionId,lvl:emp.level});
    /* převedená pozice: úroveň 1–4 = jedna dovednost na úrovni 1–4, tedy 25 % za úroveň */
    emp.hist.forEach(h=>{if(h.pct==null&&h.pos&&migrated.has(h.pos))h.pct=(h.lvl||0)*25;});
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
    if(x.pct!=null){const r={...base,name:str(x.name,100),pct:SAN_PCTS.includes(+x.pct)?+x.pct:int(x.pct,10,0,100)};
      /* srážka ze mzdy (verze 2.4) */
      if(x.wage===true){r.wage=true;if(x.done&&typeof x.done==="object")r.done={at:num(x.done.at,0,0,1e15),by:str(x.done.by,60)};}
      return r;}
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
    /* položky (EAN) pro Top 5 nejméně efektivních, verze 2.2; bez sloupce EAN klíč chybí */
    if(pp.items&&typeof pp.items==="object"&&!Array.isArray(pp.items)){
      const items={},inMonth=iso=>ISO_DAY.test(iso)&&iso.startsWith(id);
      const nums=(a,n)=>Array.from({length:n},(_,i)=>Math.round(num(arr(a)[i],0,0,1e9)*100)/100);
      Object.entries(pp.items).slice(0,20000).forEach(([ean,it])=>{
        const k=itemKey(ean);
        if(!k||!it||typeof it!=="object")return;
        const d={};Object.entries(obj(it.d)).forEach(([iso,a])=>{if(inMonth(iso))d[iso]=nums(a,5);});
        if(!Object.keys(d).length)return;
        const w={};
        Object.entries(obj(it.w)).slice(0,1000).forEach(([wk,days])=>{
          const kk=key(wk,200);if(!kk)return;
          const x={};Object.entries(obj(days)).forEach(([iso,a])=>{if(inMonth(iso))x[iso]=nums(a,4);});
          if(Object.keys(x).length)w[kk]=x;
        });
        items[k]={name:str(it.name,120),d,w};
      });
      out.production[id].items=items;
    }
  });
  Object.entries(o.prodMap).forEach(([n,k])=>{if(typeof k==="string"&&key(n,200)&&key(k,200))out.prodMap[key(n,200)]=key(k,200);});
  Object.entries(obj(o.kafe)).forEach(([id,v])=>{if(PERIOD_ID.test(id)&&v!==""&&v!=null&&Number.isFinite(+v))out.kafe[id]=num(v,0,0,1000);});
  Object.entries(obj(o.issued)).forEach(([id,b])=>{
    const box={};Object.entries(obj(b)).forEach(([k,v])=>{if(v&&typeof v==="object"&&key(k,200)){
      const rec={at:num(v.at,0,0,1e15),tabaky:int(v.tabaky,0,0,1000),kafe:!!v.kafe};
      /* zařazení v době výdeje, ať profil ukáže skutečnost i po pozdějším povýšení */
      if(typeof v.pos==="string"&&SAFE_ID.test(v.pos))rec.pos=v.pos;
      if(v.lvl>=1&&v.lvl<=4)rec.lvl=Math.round(v.lvl);
      /* verze 2.4: procento dovedností a stupeň prémie v době výdeje */
      if(v.pct!=null&&Number.isFinite(+v.pct))rec.pct=Math.round(clamp(+v.pct,0,100)*10)/10;
      if(v.tier!=null&&Number.isFinite(+v.tier))rec.tier=int(v.tier,0,0,10);
      if(v.raise!=null&&Number.isFinite(+v.raise))rec.raise=pctOpt(v.raise,100)||0;
      if(rec.pct==null&&rec.pos&&migrated.has(rec.pos))rec.pct=(rec.lvl||0)*25;   // výdej z verze 2.3 na převedené pozici
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
  /* Top 5 nejméně efektivních (verze 2.2): starší data ho nemají, začíná prázdný */
  out.eff=cleanEff(o.eff);
  /* Kontroly (verze 2.3): starší data je nemají, začínají prázdné */
  out.audit=cleanAudit(o.audit);
  /* prémie: body vedoucího označené jako nesplněné {měsíc: {člověk: {bod: důvod}}} (verze 2.4) */
  const pointIds=new Set(out.positions.flatMap(p=>(p.tiers||[]).flatMap(t=>t.manual.map(m=>m.id))));
  if(out.positions.some(p=>(p.tiers||[]).some(t=>t.moral)))pointIds.add(MORAL_ID);
  Object.entries(obj(o.marks)).forEach(([id,b])=>{
    if(!PERIOD_ID.test(id))return;
    const per={};
    Object.entries(obj(b)).slice(0,5000).forEach(([k,box])=>{
      const kk=key(k,200),x={};if(!kk)return;
      Object.entries(obj(box)).forEach(([pt,note])=>{const to=moralIds.has(pt)?MORAL_ID:pt;   // převod morálky: první důvod platí
        if(pointIds.has(to)&&!(to in x))x[to]=str(note,300);});
      if(Object.keys(x).length)per[kk]=x;
    });
    if(Object.keys(per).length)out.marks[id]=per;
  });
  /* srážky za neproduktivitu zpracované ve mzdách (2.12): snímek srážky v době zpracování */
  Object.entries(obj(o.normCutDone)).forEach(([id,b])=>{
    if(!PERIOD_ID.test(id))return;
    const per={};
    Object.entries(obj(b)).slice(0,5000).forEach(([k,x])=>{
      const kk=key(k,200);x=obj(x);if(!kk)return;
      const nv=Number(x.norm);
      per[kk]={pct:int(x.pct,0,0,100),norm:x.norm==null||!Number.isFinite(nv)?null:Math.round(clamp(nv,0,10000)*10)/10,at:num(x.at,0,0,1e15),by:str(x.by,60)};
    });
    if(Object.keys(per).length)out.normCutDone[id]=per;
  });
  /* report kapacit směn: vybrané skupiny, práh úrovně, skryté dovednosti, závěr a týden,
     kdy má skupina 1 ranní (s1am, 2.8; skupiny se střídají po týdnu) */
  const cr=obj(o.capReport);
  out.capReport={groups:arr(cr.groups).filter(id=>posIds.has(id)).slice(0,100),thr:int(cr.thr,3,1,4),
    hidden:arr(cr.hidden).filter(id=>skillIds.has(id)).slice(0,500),note:str(cr.note,4000),
    s1am:weekById(cr.s1am)?String(cr.s1am):"",...(cr.detail==="all"||cr.detail==="none"?{detail:cr.detail}:{})};
  /* Protokoly – provozní deníky strojů (2.16): starší data je nemají, začínají prázdné */
  out.logbooks=cleanLogbooks(o.logbooks);
  /* Audit – lidé v práci a zpracované kusy (2.17): starší data ho nemají, začíná prázdný */
  out.workAudit=cleanWorkAudit(o.workAudit);
  /* Servis – odeslání zařízení na servis (2.21): starší data ho nemají, začíná prázdný */
  out.service=cleanService(o.service);
  /* Shortage – chybějící díly z Excelu (2.27): starší data ho nemají, začíná prázdný */
  out.shortage=cleanShortage(o.shortage);
  // data před 2.18.1: požadavek lidí je pevných 100 (zadání), dřív se bral jen ze souboru
  if(!(+o.v>=17)&&out.workAudit.target==null)out.workAudit.target=WA_TARGET;
  out.v=DATA_VERSION;
  return out;
}

/* Mapování sloupců importu výroby (indexy sloupců od 0). */
function cleanProdCols(v){
  if(!v||typeof v!=="object"||Array.isArray(v))return null;
  const col=(x,opt)=>{if((x==null||x==="")&&opt)return null;const n=Math.round(Number(x));return Number.isFinite(n)&&n>=0&&n<60?n:(opt?null:-1);};
  const out={header:Math.max(-1,Math.min(14,Math.round(Number(v.header))||0)),name:col(v.name),date:col(v.date),ks:col(v.ks,true),
    spent:col(v.spent,true),norm:col(v.norm,true),unit:v.unit==="h"?"h":"min",normPer:v.normPer==="piece"?"piece":"row",
    item:col(v.item,true),iname:col(v.iname,true),
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
  if(!posId)return "bez skupiny";
  const p=posIn(st,posId);
  if(isGroup(p))return p.name||"(bez názvu)";
  if(!p&&!n)return "(smazaná skupina)";
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
  /* procento dovedností do historie zařazení (jen skupiny v novém tvaru) */
  const pctH=(st,e)=>{const g=posIn(st,e.positionId);return isGroup(g)&&groupSkills(g).length?{pct:Math.round(skillPct(e,g)*10)/10}:{};};
  added.forEach(k=>{if(eb[k].positionId)hist.push([k,{at,pos:eb[k].positionId,lvl:eb[k].level||null,...pctH(b,eb[k])}]);});
  const moves=[],widMoves=[],rateChanges=[];
  const skillLabel=(st,id)=>{for(const g of st.positions||[])for(const x of groupSkills(g))if(x.id===id)return (g.name||"?")+" – "+x.name;
    for(const x of st.leadSkills||[])if(x.id===id)return "vedoucí – "+x.name;return "(smazaná dovednost)";};
  Object.keys(eb).filter(k=>ea[k]).forEach(k=>{
    const x=ea[k],y=eb[k],n=who(k);
    const hx=pctH(a,x),hy=pctH(b,y);
    /* úroveň 1–4 platí jen u pozic bez dovedností (stará data); ve skupině rozhoduje hodnocení dovedností */
    const lvlMoved=(x.level||null)!==(y.level||null)&&!isGroup(posIn(b,y.positionId));
    if((x.positionId||null)!==(y.positionId||null)||lvlMoved){
      moves.push(k);
      hist.push([k,{at,pos:y.positionId||null,lvl:y.level||null,...hy}]);
    }else if(hy.pct!=null&&hx.pct!==hy.pct)hist.push([k,{at,pos:y.positionId||null,lvl:y.level||null,...hy}]);
    const ra=x.rate||{},rb=y.rate||{};
    [...new Set([...Object.keys(ra),...Object.keys(rb)])].filter(id=>(ra[id]||0)!==(rb[id]||0)).forEach(id=>rateChanges.push([k,id,ra[id]||0,rb[id]||0]));
    if(shiftOf(x)!==shiftOf(y))add("person","",{key:k,m:"shift:"+k,p:n+": směna ",v0:shiftName(shiftOf(x)),v1:shiftName(shiftOf(y))});
    if(x.legacy&&!y.legacy)add("person",n+": původní zařazení z verze 2.3 převedeno do nové verze a smazáno ("+legacyText(x.legacy)+")",{key:k});
    if(!!x.excluded!==!!y.excluded)add("person",n+(y.excluded?" vyřazen ze seznamu":" vrácen do seznamu"),{key:k});
    if(isLead(x)!==isLead(y)||(isLead(y)&&!same(x.lead,y.lead))){
      const dl=l=>l.length?l.join(", "):"bez oddělení";
      add("person",!isLead(y)?n+" už není vedoucí pracovník":!isLead(x)?n+" je vedoucí pracovník ("+dl(y.lead)+")":"",
        isLead(x)&&isLead(y)?{key:k,m:"lead:"+k,p:n+": vedoucí oddělení ",v0:dl(x.lead),v1:dl(y.lead)}:{key:k});
    }
    if(!!x.shortFri!==!!y.shortFri)add("person",n+": zkrácený pátek "+(y.shortFri?"zapnut":"vypnut"),{key:k});
    if(!!x.sick!==!!y.sick)add("person",n+(y.sick?": nemoc, dočasně se nepočítá do kapacit":": zpět po nemoci, zase v kapacitách"),{key:k});
    if((x.note||"")!==(y.note||""))add("person",n+": upravena poznámka",{key:k,m:"note:"+k});
    if((x.wid||"")!==(y.wid||""))widMoves.push([k,x.wid||"",y.wid||""]);
    const sx=x.skills||{},sy=y.skills||{};
    [...new Set([...Object.keys(sx),...Object.keys(sy)])].filter(id=>(sx[id]||0)!==(sy[id]||0)).forEach(id=>{
      const p=posIn(b,id)||posIn(a,id);
      add("level","",{key:k,m:"skill:"+k+":"+id,p:n+": zaučení ve skupině "+(p?p.name:"?")+" ",v0:String(sx[id]||0),v1:String(sy[id]||0)});
    });
  });
  if(widMoves.length>8)add("person","ID v evidenci práce změněno u "+widMoves.length+" lidí: "+list(widMoves.map(m=>who(m[0]))));
  else widMoves.forEach(([k,v0,v1])=>add("person","",{key:k,m:"wid:"+k,p:who(k)+": ID v evidenci práce ",v0:v0||"—",v1:v1||"—"}));
  if(rateChanges.length>12)add("level","Hodnocení dovedností změněno u "+new Set(rateChanges.map(r=>r[0])).size+" lidí ("+rateChanges.length+" hodnocení)");
  else rateChanges.forEach(([k,id,v0,v1])=>add("level","",{key:k,m:"rate:"+k+":"+id,p:who(k)+": "+skillLabel(b,id)+" ",v0:String(v0),v1:String(v1)}));
  if(moves.length>8)add("level","Změněno zařazení u "+moves.length+" lidí: "+list(moves.map(who)));
  else moves.forEach(k=>add("level","",{key:k,m:"lvl:"+k,p:who(k)+": ",v0:lvlText(a,ea[k].positionId,ea[k].level),v1:lvlText(b,eb[k].positionId,eb[k].level)}));

  /* sankce */
  const sanTxt=s=>who(s.key)+" – "+(s.pct!=null?s.name+" "+s.pct+" %"+(s.wage?" ze mzdy":""):(s.reason||"Sankce")+" −"+(+s.points||0)+" tab.")+" ("+mon(s.period)+")"+(s.note?": "+s.note:"");
  const SA=new Map((a.sanctions||[]).map(s=>[s.id,s])),SB=new Map((b.sanctions||[]).map(s=>[s.id,s]));
  SB.forEach((s,id)=>{if(!SA.has(id))add("sanction","Sankce: "+sanTxt(s),{key:s.key,...per(s.period)});});
  SB.forEach((s,id)=>{const o=SA.get(id);if(o&&!!o.done!==!!s.done)
    add("sanction",(s.done?"Srážka ze mzdy zpracována: ":"Zrušeno zpracování srážky ze mzdy: ")+sanTxt(s),{key:s.key,...per(s.period)});});
  SA.forEach((s,id)=>{if(!SB.has(id))add("sanction","Smazána sankce: "+sanTxt(s),{key:s.key,...per(s.period)});});
  /* srážky ze mzdy za neproduktivitu (2.12): zpracování a jeho zrušení */
  const NA=a.normCutDone||{},NB=b.normCutDone||{};
  [...new Set([...Object.keys(NA),...Object.keys(NB)])].sort().forEach(id=>{const A=NA[id]||{},B=NB[id]||{};
    [...new Set([...Object.keys(A),...Object.keys(B)])].forEach(k=>{if(!!A[k]===!!B[k])return;const x=B[k]||A[k];
      add("sanction",(B[k]?"Srážka ze mzdy za neproduktivitu zpracována: ":"Zrušeno zpracování srážky ze mzdy za neproduktivitu: ")+who(k)+" – plnění normy "+(x.norm==null?"—":nf(x.norm,1)+" %")+", srážka "+x.pct+" % ze mzdy ("+mon(id)+")",{key:k,...per(id)});});});

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

  /* skupiny (do verze 2.3 pozice) */
  const PA=new Map((a.positions||[]).map(p=>[p.id,p])),PB=new Map((b.positions||[]).map(p=>[p.id,p]));
  const tierText=t=>{const c=[];if(+t.minSkill>0)c.push("dovednosti ≥ "+t.minSkill);
    (t.skills||[]).forEach(r=>{const f=skillIn(b,r.id);c.push((f?f.x.name:"dovednost")+" ≥ "+r.lvl);});
    if(t.maxAbs!=null)c.push("absence ≤ "+t.maxAbs);
    if(t.minWknd!=null)c.push("víkendy ≥ "+t.minWknd);PERF_KEYS.forEach(([,label,f])=>{if(t[f]!=null)c.push(label+" ≥ "+nf(t[f],1)+" %");});
    if(t.maxKt!=null)c.push(+t.maxKt?"kontroly s nálezem ≤ "+t.maxKt:"kontroly bez nálezu");
    if(t.moral)c.push("pracovní morálka");
    (t.manual||[]).forEach(m=>c.push(m.text));
    return (c.join(", ")||"bez podmínek")+" → "+(+t.raise?"+"+nf(+t.raise,1)+" % mzdy":"")+(t.reward?(+t.raise?", ":"")+t.reward:"")+(t.streak?"; "+t.streak.months+" měsíců v řadě: "+t.streak.label:"");};
  PB.forEach((p,id)=>{
    const q=PA.get(id),nm=p.name||"(bez názvu)",G=isGroup(p)?"Skupina":"Pozice";
    if(!q){add("position",(isGroup(p)?"Nová skupina: ":"Nová pozice: ")+nm);return;}
    if(q.name!==p.name)add("position","",{m:"pname:"+id,p:G+" přejmenována: ",v0:"„"+(q.name||"")+"“",v1:"„"+nm+"“"});
    if((q.dept||"")!==(p.dept||""))add("position","",{m:"pdept:"+id,p:G+" "+nm+", oddělení: ",v0:q.dept||"—",v1:p.dept||"—"});
    const capT=v=>v==null?(isGroup(p)?"bez stropu":"podle úrovní"):String(v);
    if((q.max==null?null:+q.max)!==(p.max==null?null:+p.max))add("position","",{m:"pmax:"+id,p:G+" "+nm+", strop celkem: ",v0:capT(q.max),v1:capT(p.max)});
    if(isGroup(p)&&isGroup(q)){
      if((+q.maxTab||0)!==(+p.maxTab||0))add("position","",{m:"pmt:"+id,p:"Skupina "+nm+", maximum tabáků za dovednosti: ",v0:String(+q.maxTab||0),v1:String(+p.maxTab||0)});
      const pt=x=>x&&x.plan?nf(x.plan.v,x.plan.unit==="h"?1:0)+(x.plan.unit==="h"?" h":" ks")+" na osobu za směnu":"vypnuto";
      if(!same(q.plan||null,p.plan||null))add("position","",{m:"plan:"+id,p:"Skupina "+nm+", plánovaná kapacita: ",v0:pt(q),v1:pt(p)});
      const KA=new Map(groupSkills(q).map(x=>[x.id,x])),KB=new Map(groupSkills(p).map(x=>[x.id,x]));
      KB.forEach((x,sid)=>{const o=KA.get(sid);
        if(!o)add("position","Skupina "+nm+": nová dovednost „"+x.name+"“"+(x.opt?" (není nutností)":""),{m:"sk:"+sid});
        else{if(o.name!==x.name)add("position","",{m:"skn:"+sid,p:"Skupina "+nm+", dovednost: ",v0:"„"+o.name+"“",v1:"„"+x.name+"“"});
          if(o.desc!==x.desc||!same(o.scale,x.scale))add("position","Skupina "+nm+": upraven popis nebo hodnoticí schéma dovednosti „"+x.name+"“",{m:"skd:"+sid});
          if(!!o.opt!==!!x.opt)add("position","Skupina "+nm+": dovednost „"+x.name+"“ "+(x.opt?"není nutností (v procentu skupiny čtvrtinová váha)":"je zase nutná"),{m:"skopt:"+sid});}});
      KA.forEach((x,sid)=>{if(!KB.has(sid))add("position","Skupina "+nm+": smazána dovednost „"+x.name+"“",{m:"sk:"+sid});});
      const oa=groupSkills(q).filter(x=>KB.has(x.id)).map(x=>x.id).join(),ob=groupSkills(p).filter(x=>KA.has(x.id)).map(x=>x.id).join();
      if(oa!==ob)add("position","Skupina "+nm+": změněno pořadí dovedností",{m:"sko:"+id});
      const TA=new Map((q.tiers||[]).map(t=>[t.id,t])),TB=new Map((p.tiers||[]).map(t=>[t.id,t]));
      TB.forEach((t,tid)=>{const o=TA.get(tid);
        if(!o)add("position","Skupina "+nm+": nová varianta prémie „"+t.name+"“ ("+tierText(t)+")",{m:"tier:"+tid});
        else if(!same(o,t))add("position","Skupina "+nm+": varianta prémie „"+t.name+"“ ("+tierText(t)+")",{m:"tier:"+tid});});
      TA.forEach((t,tid)=>{if(!TB.has(tid))add("position","Skupina "+nm+": smazána varianta prémie „"+t.name+"“",{m:"tier:"+tid});});
      if((q.tiers||[]).filter(t=>TB.has(t.id)).map(t=>t.id).join()!==(p.tiers||[]).filter(t=>TA.has(t.id)).map(t=>t.id).join())add("position","Skupina "+nm+": změněno pořadí variant prémie",{m:"tiero:"+id});
      if(normCutText(q.normCut)!==normCutText(p.normCut))add("position","",{m:"ncut:"+id,p:"Skupina "+nm+", srážky ze mzdy za neproduktivitu: ",v0:normCutText(q.normCut),v1:normCutText(p.normCut)});
    }
    const P0=isGroup(p)?"Skupina ":"Pozice ";
    if(!!q.onlyKafe!==!!p.onlyKafe)add("position",P0+nm+(p.onlyKafe?": jen Kafe, bez tabáků":": znovu s tabáky"),{m:"pkafe:"+id});
    if(!same(q.penalty,p.penalty)||!same(q.bonus,p.bonus))add("position",P0+nm+": upravena pravidla docházky",{m:"prules:"+id});
    /* úrovně 1–4 s tabáky a navýšením mají jen pozice ze starších dat (ve skupině se nepoužívají) */
    if(isGroup(p))return;
    p.levels.forEach((lv,i)=>{const o=q.levels[i]||{};
      if((+o.tabaky||0)!==(+lv.tabaky||0))add("position","",{m:"ptab:"+id+":"+i,p:"Pozice "+nm+", úroveň "+(i+1)+" (tabáky): ",v0:String(+o.tabaky||0),v1:String(+lv.tabaky||0)});});
    if(p.levels.some((lv,i)=>(q.levels[i]||{}).name!==lv.name||(q.levels[i]||{}).desc!==lv.desc))add("position","Pozice "+nm+": upraveny názvy nebo popisy úrovní",{m:"pdesc:"+id});
    const cond=lv=>PERF_KEYS.filter(([,,f])=>lv[f]!=null).map(([,label,f])=>label+" ≥ "+nf(lv[f],1)+" %").join(", ")||"bez podmínek";
    p.levels.forEach((lv,i)=>{const o=q.levels[i]||{};
      if((+o.raise||0)!==(+lv.raise||0))add("position","",{m:"praise:"+id+":"+i,p:"Pozice "+nm+", úroveň "+(i+1)+" (navýšení platu): ",v0:raiseText({pct:+o.raise||0}),v1:raiseText({pct:+lv.raise||0})});
      if(cond(o)!==cond(lv))add("position","",{m:"pcond:"+id+":"+i,p:"Pozice "+nm+", úroveň "+(i+1)+" (podmínky navýšení): ",v0:cond(o),v1:cond(lv)});});
  });
  PA.forEach((q,id)=>{if(!PB.has(id))add("position",(isGroup(q)?"Smazána skupina: ":"Smazána pozice: ")+(q.name||"(bez názvu)"));});

  /* prémie: body vedoucího označené jako nesplněné */
  const ptText=(st,ptId)=>{if(ptId===MORAL_ID)return MORAL_TEXT;for(const g of st.positions||[])for(const t of g.tiers||[])for(const m of t.manual||[])if(m.id===ptId)return m.text;return "bod prémie";};
  const MA=a.marks||{},MB=b.marks||{};
  [...new Set([...Object.keys(MA),...Object.keys(MB)])].sort().forEach(id=>{
    const A=MA[id]||{},B=MB[id]||{};
    [...new Set([...Object.keys(A),...Object.keys(B)])].forEach(k=>{
      const x=A[k]||{},y=B[k]||{};
      [...new Set([...Object.keys(x),...Object.keys(y)])].forEach(pt=>{
        if(x[pt]===y[pt])return;
        add("person",who(k)+" ("+mon(id)+"), prémie: „"+ptText(b,pt)+"“ "+(y[pt]!=null?"nesplněno"+(y[pt]?" – "+y[pt]:""):"zase splněno"),{key:k,...per(id),m:"mark:"+id+":"+k+":"+pt});
      });
    });
  });
  if(!same(a.capReport||null,b.capReport||null))add("settings","Upraven report kapacit směn",{m:"capreport"});

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

  /* dovednosti vedoucích (2.10) */
  const LA=new Map((a.leadSkills||[]).map(x=>[x.id,x])),LB=new Map((b.leadSkills||[]).map(x=>[x.id,x]));
  LB.forEach((x,id)=>{const o=LA.get(id);
    if(!o)add("position","Dovednosti vedoucích: nová dovednost „"+x.name+"“",{m:"lsk:"+id});
    else{if(o.name!==x.name)add("position","",{m:"lskn:"+id,p:"Dovednosti vedoucích: ",v0:"„"+o.name+"“",v1:"„"+x.name+"“"});
      if(o.desc!==x.desc)add("position","Dovednosti vedoucích: upraven popis „"+x.name+"“",{m:"lskd:"+id});}});
  LA.forEach((x,id)=>{if(!LB.has(id))add("position","Dovednosti vedoucích: smazána dovednost „"+x.name+"“",{m:"lsk:"+id});});
  /* Top 5 nejméně efektivních: nové záznamy z historie případů, nastavení a vydané reporty */
  const fa=a.eff||blankEff(),fb=b.eff||blankEff();
  const CA=new Map((fa.cases||[]).map(c=>[c.id,c]));
  (fb.cases||[]).forEach(c=>{
    const old=CA.get(c.id),seen=new Set(((old&&old.log)||[]).map(e=>e.at+"|"+e.t));
    const head="P-"+c.no+" ("+c.ean+(c.name?", "+c.name:"")+"): ";
    c.log.filter(e=>!seen.has(e.at+"|"+e.t)).forEach(e=>add("eff",head+e.t,{m:"eff:"+c.id+":"+e.t.slice(0,80)}));
  });
  const CB=new Set((fb.cases||[]).map(c=>c.id));
  (fa.cases||[]).filter(c=>!CB.has(c.id)).forEach(c=>add("eff","P-"+c.no+" ("+c.ean+(c.name?", "+c.name:"")+"): zrušený případ smazán natrvalo",{m:"effdel:"+c.id}));
  const WA=fa.weeks||{},WB=fb.weeks||{};
  const entTxt=e=>e.ean+(e.name?" "+e.name:"")+": "+nf(e.spent/60,2)+" h, norma "+nf(e.norm/60,2)+" h"+(e.spent>0?" (plnění "+nf(e.norm/e.spent*100,1)+" %)":"");
  [...new Set([...Object.keys(WA),...Object.keys(WB)])].sort().forEach(id=>{
    const ia=new Map(((WA[id]||{}).items||[]).filter(e=>e.ean).map(e=>[e.id,e])),ib=new Map(((WB[id]||{}).items||[]).filter(e=>e.ean).map(e=>[e.id,e]));
    ib.forEach((e,eid)=>{const o=ia.get(eid);if(!o||!same(o,e))add("eff","Top 5 "+weekName(id)+": "+entTxt(e),{m:"effw:"+id+":"+eid});});
    ia.forEach((e,eid)=>{if(!ib.has(eid))add("eff","Top 5 "+weekName(id)+": odebrán "+e.ean+(e.name?" "+e.name:""),{m:"effw:"+id+":"+eid});});
  });
  const EFF_SET={min:["Top 5 – minimální čas položky za týden",v=>nf(v/60,2)+" h"],unit:["Top 5 – zadávání času",v=>v==="min"?"v minutách":"v hodinách"],target:["Top 5 – cílové plnění pro ověření",v=>v+" %"],
    d1:["Top 5 – první ověření po dokončení opatření",v=>v+" dní"],d2:["Top 5 – druhé ověření po prvním",v=>v+" dní"]};
  Object.entries(EFF_SET).forEach(([k,[label,fmt]])=>{
    const x=(fa.settings||{})[k],y=(fb.settings||{})[k];
    if(x!=null&&y!=null&&x!==y)add("settings","",{m:"effset:"+k,p:label+": ",v0:fmt(x),v1:fmt(y)});
  });
  const RA=new Map((fa.reports||[]).map(r=>[r.week,r]));
  (fb.reports||[]).forEach(r=>{
    const old=RA.get(r.week);
    if(!old||old.rev!==r.rev)add("eff","Top 5: vydán týdenní report "+weekName(r.week)+(r.rev>1?" (revize "+r.rev+")":""));
  });
  /* Kontroly: nutné úkony oddělení, plány namátkových kontrol a zapsané výsledky */
  const ua=a.audit||blankAudit(),ub=b.audit||blankAudit();
  const UTA=ua.tasks||{},UTB=ub.tasks||{};
  [...new Set([...Object.keys(UTA),...Object.keys(UTB)])].sort().forEach(d=>{
    const la=new Map((UTA[d]||[]).map(t=>[t.id,t])),lb=new Map((UTB[d]||[]).map(t=>[t.id,t]));
    lb.forEach((t,tid)=>{
      const o=la.get(tid);
      if(!o)add("audit","Nutné úkony – "+d+": přidán bod „"+t.text+"“",{m:"audt:"+d+":"+tid});
      else if(o.text!==t.text)add("audit","Nutné úkony – "+d+": bod „"+o.text+"“ změněn na „"+t.text+"“",{m:"audt:"+d+":"+tid});
    });
    la.forEach((t,tid)=>{if(!lb.has(tid))add("audit","Nutné úkony – "+d+": odebrán bod „"+t.text+"“",{m:"audt:"+d+":"+tid});});
    const oa=(UTA[d]||[]).filter(t=>lb.has(t.id)).map(t=>t.id).join(),ob=(UTB[d]||[]).filter(t=>la.has(t.id)).map(t=>t.id).join();
    if(oa!==ob)add("audit","Nutné úkony – "+d+": změněno pořadí bodů",{m:"audo:"+d});
  });
  const UPA=ua.plans||{},UPB=ub.plans||{};
  Object.keys(UPB).sort().forEach(w=>{
    const pb=UPB[w],pa=UPA[w];
    const wk=weekName(w);
    if(!pa||pa.at!==pb.at){
      const n=pb.items.filter(i=>i.state==="plan").length;
      add("audit","Kontroly "+wk+": "+(pa?"plán přegenerován":"vygenerován plán")+", naplánováno "+n+" "+(n===1?"člověk":n>=2&&n<=4?"lidé":"lidí")
        +" ("+pb.pct+" % z každého oddělení)",{m:"audp:"+w});
    }
    const ia=new Map((pa?pa.items:[]).map(i=>[i.id,i]));
    pb.items.forEach(i=>{
      const o=ia.get(i.id),who=i.name+" ("+i.dept+")";
      if(!o){if(i.extra)add("audit","Kontroly "+wk+": přidán "+who+" na "+dayText(i.day),{m:"audi:"+i.id});
        else if(i.sub)add("audit","Kontroly "+wk+": náhradník "+who+" na "+dayText(i.day),{m:"audi:"+i.id});}
      else if(o.day!==i.day&&i.state==="plan")add("audit","Kontroly "+wk+": "+who+" přesunut na "+dayText(i.day),{m:"audd:"+i.id});
      if(o?o.state===i.state&&same(o.results,i.results)&&o.done===i.done&&o.reason===i.reason:i.state==="plan")return;
      if(i.state==="done"){
        const sc=checkScore(i);
        add("audit","Kontrola "+who+" "+dayText(i.done)+(i.checker?", kontroloval "+i.checker:"")+": splněno "+sc.ok+" z "+sc.n
          +(sc.fail.length?" (nesplněno: "+sc.fail.map(r=>r.text).join("; ")+")":""),{m:"audr:"+i.id,key:i.key});
      }else if(i.state==="skip")add("audit","Kontrola "+who+" "+dayText(i.day)+": neproběhla"+(i.reason?" – "+i.reason:""),{m:"audr:"+i.id,key:i.key});
      else add("audit","Kontrola "+who+": zrušen zápis",{m:"audr:"+i.id,key:i.key});
    });
    if(pa&&pa.at===pb.at)ia.forEach((o,iid)=>{if(!pb.items.some(i=>i.id===iid))add("audit","Kontroly "+wk+": odebrán "+o.name+" ("+o.dept+")",{m:"audi:"+iid});});
  });
  Object.keys(UPA).forEach(w=>{if(!UPB[w])add("audit","Kontroly "+weekName(w)+": plán smazán",{m:"audp:"+w});});
  const uka=(ua.settings||{}).pct,ukb=(ub.settings||{}).pct;
  if(uka!=null&&ukb!=null&&uka!==ukb)add("settings","",{m:"audset:pct",p:"Kontroly – podíl lidí z oddělení: ",v0:uka+" %",v1:ukb+" %"});
  lbChanges(a.logbooks||[],b.logbooks||[],add);
  waChanges(a.workAudit,b.workAudit,add);
  svChanges(a.service,b.service,add);
  shChanges(a.shortage,b.shortage,add);
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

/* ================= verze 2.2: Top 5 nejméně efektivních položek =================
   Z evidence práce (EAN, strávený čas, norma) se po týdnech (ISO, pondělí až neděle) spočítá
   plnění normy každé položky. Pět nejhorších pod 100 % jde do týdenního žebříčku. Ke každé
   položce se vede případ: proč se to stalo, co s tím jde dělat, okamžitá opatření, opatření
   s procesním časem a dvě ověření účinnosti (standardně 14 dní po dokončení opatření a 30 dní
   po prvním ověření). Neúčinné řešení otevře v témž případu nové kolo, takže se nic neřeší
   dvakrát a historie zůstane pohromadě. */
const EFF_TOP=5;
const EFF_DEFAULTS={min:60,target:85,d1:14,d2:30,unit:"h"};
const EFF_CATS=[["lide","Lidé a zaučení"],["metoda","Metoda a pracovní postup"],["stroj","Stroj, nástroj, přípravek"],
  ["material","Materiál a polotovar"],["mereni","Měření a kontrola"],["tok","Organizace a tok materiálu"],
  ["norma","Norma a technologický postup"],["pozadavky","Výkres a požadavky (pohledovost)"],["jine","Jiné"]];
const EFF_STATES={new:"Analýza příčiny",act:"Opatření běží",v1:"Čeká na 1. ověření",v2:"Čeká na 2. ověření",
  fail:"Neúčinné, nové kolo",ok:"Uzavřeno, účinné",zrus:"Zrušeno"};
const WEEK_ID=/^\d{4}-W\d{2}$/;
const CASE_NO=/^\d{4}-\d{3,5}$/;
const DAY_MS=864e5;
function blankEff(){return {weeks:{},cases:[],reports:[],settings:{...EFF_DEFAULTS},nos:{}};}
function effSet(){return (S&&S.eff&&S.eff.settings)||{...EFF_DEFAULTS};}
function effCatLabel(k){const c=EFF_CATS.find(x=>x[0]===k);return c?c[1]:"";}

/* EAN nebo kód položky: bez mezer a velkými písmeny (číslo z Excelu jako text). */
function itemKey(v){
  if(v==null||v==="")return "";
  return String(v).trim().replace(/\s+/g,"").toUpperCase().slice(0,40);
}

/* ---------- dny a týdny (ISO 8601, týden začíná pondělím) ---------- */
function isoOf(t){return new Date(t).toISOString().slice(0,10);}
function utcOf(iso){const [y,m,d]=String(iso).split("-").map(Number);return Date.UTC(y,m-1,d);}
function addDays(iso,n){return isoOf(utcOf(iso)+n*DAY_MS);}
function daysBetween(a,b){return Math.round((utcOf(b)-utcOf(a))/DAY_MS);}
function todayIso(now){const d=now?new Date(now):new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
const _weekOf={};
function isoWeek(iso){
  if(_weekOf[iso])return _weekOf[iso];
  const t=utcOf(iso),mon=t-((new Date(t).getUTCDay()+6)%7)*DAY_MS;
  const y=new Date(mon+3*DAY_MS).getUTCFullYear();
  const j4=Date.UTC(y,0,4),w1=j4-((new Date(j4).getUTCDay()+6)%7)*DAY_MS;
  const w=1+Math.round((mon-w1)/(7*DAY_MS));
  return _weekOf[iso]={id:y+"-W"+String(w).padStart(2,"0"),y,w,from:isoOf(mon),to:isoOf(mon+6*DAY_MS)};
}
function weekById(id){
  const m=/^(\d{4})-W(\d{2})$/.exec(String(id||""));
  if(!m)return null;
  const j4=Date.UTC(+m[1],0,4),w1=j4-((new Date(j4).getUTCDay()+6)%7)*DAY_MS;
  const wk=isoWeek(isoOf(w1+(+m[2]-1)*7*DAY_MS));
  return wk.id===id?wk:null;
}
function shiftWeek(id,n){const w=weekById(id);return w?isoWeek(addDays(w.from,7*n)).id:null;}
function dayText(iso,year=true){if(!iso)return "";const [y,m,d]=iso.split("-").map(Number);return d+". "+m+"."+(year?" "+y:"");}
function weekRange(w){
  const [y1,m1,d1]=w.from.split("-").map(Number),[y2,m2,d2]=w.to.split("-").map(Number);
  if(y1!==y2)return d1+". "+m1+". "+y1+" – "+d2+". "+m2+". "+y2;
  if(m1!==m2)return d1+". "+m1+". – "+d2+". "+m2+". "+y2;
  return d1+".–"+d2+". "+m2+". "+y2;
}
function weekName(id){const w=weekById(id);return w?"T"+w.w+"/"+w.y:"";}
function weekLong(id){const w=weekById(id);return w?"Týden "+w.w+"/"+w.y+" ("+weekRange(w)+")":"";}

/* ---------- položky z evidence práce ---------- */
let _effCache=null;
function effCache(){return _effCache||(_effCache={rank:{},weeks:null,hist:null});}
/* Položky za období od–do (ISO, včetně) ze všech nahraných měsíců evidence práce.
   only = jen jedna položka (rychlejší). Plnění = norma ÷ čas u řádků, kde je čas i norma. */
function itemStats(from,to,only){
  const out={};
  Object.keys(S.production||{}).sort().forEach(id=>{
    const pp=S.production[id];
    if(!pp||!pp.items||id+"-31"<from||id+"-01">to)return;
    const list=only?(pp.items[only]?[[only,pp.items[only]]]:[]):Object.entries(pp.items);
    list.forEach(([ean,it])=>{
      Object.entries(it.d).forEach(([iso,a])=>{
        if(iso<from||iso>to)return;
        const r=out[ean]||(out[ean]={ean,name:"",ks:0,spent:0,norm:0,nspent:0,rows:0,days:0,w:{}});
        r.ks+=a[0];r.spent+=a[1];r.norm+=a[2];r.nspent+=a[3];r.rows+=a[4];r.days++;
        if(it.name)r.name=it.name;
      });
      const r=out[ean];
      if(!r)return;
      Object.entries(it.w||{}).forEach(([wk,days])=>Object.entries(days).forEach(([iso,a])=>{
        if(iso<from||iso>to)return;
        const x=r.w[wk]||(r.w[wk]={spent:0,norm:0,nspent:0,ks:0});
        x.spent+=a[0];x.norm+=a[1];x.nspent+=a[2];x.ks+=a[3];
      }));
    });
  });
  Object.values(out).forEach(r=>{
    r.eff=r.nspent>0&&r.norm>0?r.norm/r.nspent*100:null;
    r.lost=Math.max(0,r.nspent-r.norm);
    r.workers=Object.keys(r.w).length;
  });
  return out;
}
/* Poslední známý název položky. */
function itemName(ean){
  const ids=Object.keys(S.production||{}).sort().reverse();
  for(const id of ids){const it=S.production[id].items&&S.production[id].items[ean];if(it&&it.name)return it.name;}
  return "";
}
/* Snímek ukazatelů pro případ a report (zaokrouhlený, ať se dá porovnat a uložit). */
function effMetrics(r){
  if(!r)return null;
  return {eff:r.eff==null?null:Math.round(r.eff*10)/10,nspent:Math.round(r.nspent),norm:Math.round(r.norm),
    spent:Math.round(r.spent),ks:Math.round(r.ks*100)/100,rows:r.rows,workers:r.workers};
}
/* Týdny s ručním zápisem nebo s EAN v evidenci práce, od nejnovějšího. */
function effWeeks(){
  const c=effCache();
  if(c.weeks)return c.weeks;
  const set=new Set(Object.keys((S.eff&&S.eff.weeks)||{}).filter(id=>weekEntries(id).length));
  Object.values(S.production||{}).forEach(pp=>{if(pp&&pp.items)Object.values(pp.items).forEach(it=>Object.keys(it.d).forEach(iso=>set.add(isoWeek(iso).id)));});
  return c.weeks=[...set].sort().reverse();
}

/* ---------- ruční zápis týdne ----------
   Uživatel zapisuje Top 5 ručně: EAN, název dílu, strávený čas a normu (v minutách).
   Plnění = norma ÷ strávený čas, neplnění = 100 % − plnění. Výpočet z evidence práce
   (weekRanking) platí jen pro týdny bez ručního zápisu a slouží k předvyplnění. */
function entryMetrics(e){
  const spent=Math.max(0,+e.spent||0),norm=Math.max(0,+e.norm||0);
  return {eff:spent>0?Math.round(norm/spent*1000)/10:null,nspent:Math.round(spent),norm:Math.round(norm),spent:Math.round(spent),ks:0,rows:0,workers:0};
}
/* Platné řádky ručního zápisu (EAN a strávený čas), od nejnižšího plnění. */
function weekEntries(id){
  const wk=S.eff&&S.eff.weeks&&S.eff.weeks[id];
  if(!wk)return [];
  return wk.items.filter(e=>e.ean&&+e.spent>0).map(e=>({...e,...entryMetrics(e),lost:Math.max(0,Math.round(e.spent-e.norm))}))
    .sort((a,b)=>a.eff-b.eff||b.lost-a.lost||(a.ean<b.ean?-1:1));
}
/* Top 5 týdne: ruční zápis, a když žádný není, výpočet z evidence práce s EAN. */
function weekTop(id){
  const manual=weekEntries(id);
  if(manual.length)return {src:"manual",items:manual.slice(0,EFF_TOP)};
  const rk=weekRanking(id);
  return {src:rk&&rk.top.length?"import":"",items:rk?rk.top:[]};
}
/* Převzetí výpočtu z evidence práce do ručního zápisu (dál jde upravit). */
function importWeekToManual(id,meta){
  const rk=weekRanking(id);
  if(!rk||!rk.top.length)return 0;
  S.eff.weeks[id]={items:rk.top.map(r=>({id:uid("e"),ean:r.ean,name:r.name||"",spent:Math.round(r.nspent),norm:Math.round(r.norm)})),
    at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60)};
  return rk.top.length;
}
/* Žebříček týdne: položky pod 100 % s aspoň `min` minutami práce s normou, od nejnižšího plnění. */
function weekRanking(id){
  const c=effCache();
  if(c.rank[id])return c.rank[id];
  const w=weekById(id);
  if(!w)return null;
  const stats=Object.values(itemStats(w.from,w.to));
  const st=effSet();
  const under=stats.filter(r=>r.eff!=null&&r.eff<100);
  const ranked=under.filter(r=>r.nspent>=st.min).sort((a,b)=>a.eff-b.eff||b.lost-a.lost||(a.ean<b.ean?-1:1));
  const sum=f=>stats.reduce((x,r)=>x+f(r),0);
  const norm=sum(r=>r.norm),nspent=sum(r=>r.nspent);
  return c.rank[id]={id,week:w,items:stats.length,withNorm:stats.filter(r=>r.eff!=null).length,ranked,top:ranked.slice(0,EFF_TOP),
    under:under.length,small:under.length-ranked.length,
    tot:{norm,nspent,spent:sum(r=>r.spent),ks:sum(r=>r.ks),eff:nspent>0&&norm>0?norm/nspent*100:null,lost:ranked.slice(0,EFF_TOP).reduce((x,r)=>x+r.lost,0)}};
}
/* Ve kterých týdnech byla položka v Top 5 (od nejstaršího). */
function topHistory(){
  const c=effCache();
  if(c.hist)return c.hist;
  const h={};
  effWeeks().slice().reverse().forEach(id=>weekTop(id).items.forEach(r=>(h[r.ean]||(h[r.ean]=[])).push(id)));
  return c.hist=h;
}
/* Plnění položky po týdnech až do týdne `id` (n týdnů zpět): z ručního zápisu, jinak
   z evidence práce; null = bez údaje. */
function itemTrend(ean,id,n=8){
  const out=[];
  for(let i=n-1;i>=0;i--){
    const wid=shiftWeek(id,-i),w=weekById(wid);
    const man=weekEntries(wid).find(e=>e.ean===ean);
    if(man){out.push({week:wid,eff:man.eff,nspent:man.nspent,src:"manual"});continue;}
    const r=itemStats(w.from,w.to,ean)[ean];
    out.push({week:wid,eff:r&&r.eff!=null?Math.round(r.eff*10)/10:null,nspent:r?Math.round(r.nspent):0,src:r?"import":""});
  }
  return out;
}
/* Kdo na položce v období pracoval (jména z evidence práce, spárovaná jako v hodnocení). */
function itemWorkers(ean,from,to){
  const r=itemStats(from,to,ean)[ean];
  if(!r)return [];
  const label=wk=>{
    let raw=wk;
    for(const pp of Object.values(S.production))if(pp.names&&pp.names[wk]){raw=pp.names[wk].name;break;}
    const key=prodKeyFor(raw);
    return key&&S.employees[key]?(S.employees[key].last+" "+S.employees[key].first).trim():prodLabel(raw);
  };
  return Object.entries(r.w).map(([wk,x])=>({key:wk,name:label(wk),spent:x.spent,norm:x.norm,nspent:x.nspent,ks:x.ks,
    eff:x.nspent>0&&x.norm>0?x.norm/x.nspent*100:null})).sort((a,b)=>b.nspent-a.nspent||(a.name<b.name?-1:1));
}

/* ---------- případy ---------- */
function effCase(id){return (S.eff.cases||[]).find(c=>c.id===id)||null;}
function caseLabel(c){return "P-"+c.no;}
function curRound(c){return c.rounds[c.rounds.length-1];}
/* Případ položky, který platí: poslední nezrušený (jedna položka = jeden případ). */
function caseOfItem(ean){
  return S.eff.cases.filter(c=>c.ean===ean&&!c.cancelled).sort((a,b)=>b.at-a.at)[0]||null;
}
/* Číslo smazaného případu se znovu nepoužije (S.eff.nos = nejvyšší smazané číslo za rok, 2.6). */
function nextCaseNo(at){
  const y=new Date(at).getFullYear();
  const n=S.eff.cases.reduce((m,c)=>c.no.startsWith(y+"-")?Math.max(m,+c.no.slice(5)||0):m,+((S.eff.nos||{})[y])||0)+1;
  return y+"-"+String(n).padStart(3,"0");
}
/* Záznam do historie případu. merge = opakovaná stejná úprava od téhož člověka do 10 minut
   jen posune čas (např. psaní příčiny). */
function effNote(c,meta,text,merge){
  const at=(meta&&meta.at)||Date.now(),by=String((meta&&meta.by)||"").slice(0,60),t=String(text).slice(0,500);
  const last=c.log[c.log.length-1];
  if(merge&&last&&last.t===t&&last.by===by&&at-last.at<10*60000){last.at=at;return;}
  c.log.push({at,by,t});
  if(c.log.length>500)c.log.splice(0,c.log.length-500);
}
function newRound(n,meta,extra){
  const st=effSet();
  return {n,at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60),reason:"",week:"",base:null,
    cat:"",cause:"",options:"",actions:[],v:[],d1:st.d1,d2:st.d2,p1:"",p2:"",p1why:"",p2why:"",...(extra||{})};
}
/* Ukazatele položky v týdnu: z ručního zápisu, jinak z evidence práce. */
function weekMetrics(ean,weekId){
  const w=weekById(weekId);
  if(!w)return null;
  const man=weekEntries(weekId).find(e=>e.ean===ean);
  return man?entryMetrics(man):effMetrics(itemStats(w.from,w.to,ean)[ean]);
}
/* Název dílu: z ručního zápisu (nejnovější), jinak z evidence práce. */
function effItemName(ean){
  const ids=Object.keys((S.eff&&S.eff.weeks)||{}).sort().reverse();
  for(const id of ids){const e=S.eff.weeks[id].items.find(x=>x.ean===ean&&x.name);if(e)return e.name;}
  return itemName(ean);
}
function createCase(ean,weekId,meta){
  const at=(meta&&meta.at)||Date.now(),m={...meta,at};
  const base=weekMetrics(ean,weekId);
  const c={id:uid("c"),no:nextCaseNo(at),ean,name:effItemName(ean),at,by:String(m.by||"").slice(0,60),
    week:weekById(weekId)?weekId:"",base,cancelled:null,rounds:[],log:[],comments:[]};
  c.rounds.push(newRound(1,m,{week:c.week,base}));
  effNote(c,m,"Případ založen"+(c.week?" z Top 5 "+weekName(c.week)+(base&&base.eff!=null?", plnění "+nf(base.eff,1)+" %":""):""));
  S.eff.cases.push(c);
  return c;
}
/* Komentáře o vývoji případu (2.19): co se děje, co se domluvilo, na co se čeká. Každý zápis
   jde i do historie případu (a odtud do historie změn). round = kolo, ke kterému komentář patří. */
const CASE_COMMENT_MAX=2000;
function commentShort(t){t=String(t).replace(/\s+/g," ").trim();return t.length>120?t.slice(0,117)+"…":t;}
function addCaseComment(c,text,meta){
  const t=String(text==null?"":text).trim().slice(0,CASE_COMMENT_MAX);
  if(!t)return null;
  const at=(meta&&meta.at)||Date.now();
  const x={id:uid("k"),at,by:String((meta&&meta.by)||"").slice(0,60),text:t,round:curRound(c).n,ed:null};
  c.comments.push(x);
  if(c.comments.length>500)c.comments.splice(0,c.comments.length-500);
  effNote(c,{...meta,at},"Komentář: „"+commentShort(t)+"“");
  return x;
}
function editCaseComment(c,id,text,meta){
  const x=c.comments.find(k=>k.id===id);
  const t=String(text==null?"":text).trim().slice(0,CASE_COMMENT_MAX);
  if(!x||!t||t===x.text)return false;
  const at=(meta&&meta.at)||Date.now();
  x.text=t;x.ed={at,by:String((meta&&meta.by)||"").slice(0,60)};
  effNote(c,{...meta,at},"Upraven komentář z "+dayText(todayIso(x.at))+": „"+commentShort(t)+"“");
  return true;
}
function deleteCaseComment(c,id,meta){
  const x=c.comments.find(k=>k.id===id);
  if(!x)return false;
  c.comments=c.comments.filter(k=>k!==x);
  effNote(c,meta,"Smazán komentář z "+dayText(todayIso(x.at))+": „"+commentShort(x.text)+"“");
  return true;
}
function lastComment(c){return c.comments&&c.comments.length?c.comments[c.comments.length-1]:null;}
/* Nové kolo v témž případu: původní řešení nestačilo (nebo se položka vrátila do Top 5). */
function reopenCase(c,reason,weekId,meta){
  const at=(meta&&meta.at)||Date.now(),m={...meta,at};
  const n=c.rounds.length+1;
  const base=weekMetrics(c.ean,weekId);
  c.rounds.push(newRound(n,m,{reason:String(reason||"").slice(0,1000),week:weekById(weekId)?weekId:"",base}));
  if(c.cancelled)c.cancelled=null;
  effNote(c,m,"Znovu otevřeno, kolo "+n+(base&&base.eff!=null?" ("+weekName(weekId)+", plnění "+nf(base.eff,1)+" %)":"")+": "+reason);
  return c;
}
function cancelCase(c,reason,meta){
  c.cancelled={at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60),reason:String(reason||"").slice(0,500)};
  effNote(c,meta,"Případ zrušen: "+reason);
}
function restoreCase(c,meta){c.cancelled=null;effNote(c,meta,"Zrušení případu vráceno");}
/* Definitivní smazání (2.6), jen u zrušeného případu: zmizí ze seznamu, souhrnů a termínů
   i z vydaných reportů (položka v žebříčku tam zůstane, jen bez odkazu na případ). Nikde se
   už nepočítá; v historii změn zůstane jen záznam o smazání (describeChanges). */
function deleteCase(id){
  const c=effCase(id);
  if(!c||!c.cancelled)return false;
  S.eff.cases=S.eff.cases.filter(x=>x.id!==id);
  const y=c.no.slice(0,4);
  S.eff.nos=S.eff.nos||{};
  S.eff.nos[y]=Math.max(+S.eff.nos[y]||0,+c.no.slice(5)||0);
  (S.eff.reports||[]).forEach(r=>{
    const d=r.data||{};
    (d.top||[]).forEach(t=>{if(t.case===id)t.case="";});
    if(Array.isArray(d.cases))d.cases=d.cases.filter(x=>x.id!==id);
    if(Array.isArray(d.deadlines))d.deadlines=d.deadlines.filter(x=>x.case!==id);
  });
  return true;
}
/* Datum, kdy byla hotová všechna opatření kola (poslední splněné), jinak "". */
/* Opatření bez textu (rozepsaný řádek) se nepočítají. */
function liveActions(r){return r.actions.filter(a=>String(a.text||"").trim());}
function roundDone(r){
  const list=liveActions(r);
  if(!list.length||list.some(a=>!a.done))return "";
  return list.reduce((m,a)=>a.done>m?a.done:m,"");
}
/* Termíny kola: 1. ověření d1 dní po dokončení opatření, 2. ověření d2 dní po provedeném
   1. ověření. Ručně posunutý termín (p1, p2) má přednost. */
function roundPlan(r){
  const done=roundDone(r),v1=r.v[0]||null,v2=r.v[1]||null;
  const p1=done?(r.p1||addDays(done,r.d1)):"";
  const p2=v1&&v1.result==="ok"&&v1.done?(r.p2||addDays(v1.done,r.d2)):"";
  return {done,p1,p2,v1,v2};
}
function caseState(c,today){
  today=today||todayIso();
  if(c.cancelled)return {k:"zrus",label:EFF_STATES.zrus,due:"",late:false,round:curRound(c).n,closed:""};
  const r=curRound(c),p=roundPlan(r);
  let k="new",due="",closed="";
  if(r.v.some(x=>x&&x.result==="fail")){k="fail";closed=r.v.find(x=>x&&x.result==="fail").done;}
  else if(p.v2&&p.v2.result==="ok"){k="ok";closed=p.v2.done;}
  else if(p.v1&&p.v1.result==="ok"){k="v2";due=p.p2;}
  else if(p.done){k="v1";due=p.p1;}
  else if(liveActions(r).length){k="act";due=liveActions(r).filter(a=>!a.done&&a.due).map(a=>a.due).sort()[0]||"";}
  return {k,label:EFF_STATES[k],due,late:!!due&&due<today,round:r.n,closed};
}
/* Období, ze kterého se měří účinnost: 1. ověření od dne po dokončení opatření, 2. ověření
   od dne po 1. ověření; do data ověření (nebo do plánovaného termínu). */
function verifyWindow(r,idx,date){
  const p=roundPlan(r);
  if(idx===0)return p.done?{from:addDays(p.done,1),to:date||(r.v[0]&&r.v[0].done)||p.p1}:null;
  return p.v1&&p.v1.result==="ok"?{from:addDays(p.v1.done,1),to:date||(r.v[1]&&r.v[1].done)||p.p2}:null;
}
function measureItem(ean,from,to){
  if(!from||!to||from>to)return null;
  const m=effMetrics(itemStats(from,to,ean)[ean]);
  return m&&m.nspent>0?m:null;
}
/* Zapíše provedené ověření s plněním za období (snímek, ať pozdější import nezmění záznam).
   manual = ručně zapsaný strávený čas a norma za období {spent, norm} v minutách; bez něj se
   plnění vezme z evidence práce, pokud v ní položka je. */
function recordVerify(c,idx,date,result,note,meta,manual){
  const r=curRound(c),win=verifyWindow(r,idx,date);
  if(!win)throw new Error(idx?"Druhé ověření jde až po účinném prvním.":"Ověření jde až po dokončení všech opatření.");
  const m=manual&&+manual.spent>0?entryMetrics(manual):measureItem(c.ean,win.from,win.to);
  const p=roundPlan(r);
  r.v[idx]={done:date,result:result==="ok"?"ok":"fail",note:String(note||"").slice(0,1000),from:win.from,to:win.to,
    plan:idx?p.p2:p.p1,eff:m?m.eff:null,nspent:m?m.nspent:0,norm:m?m.norm:0,ks:m?m.ks:0,rows:m?m.rows:0,
    src:manual&&+manual.spent>0?"manual":m?"import":"",
    at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60)};
  r.v.length=idx+1;
  effNote(c,meta,(idx?"2.":"1.")+" ověření "+dayText(date)+": "+(result==="ok"?"účinné":"neúčinné")
    +(m&&m.eff!=null?" (plnění "+nf(m.eff,1)+" % za "+dayText(win.from,false)+"–"+dayText(win.to)+")":" (bez hodnot za období)")+(note?". "+note:""));
}
function undoVerify(c,idx,meta){
  const r=curRound(c);
  if(!r.v[idx])return;
  r.v.length=idx;
  effNote(c,meta,"Zrušen záznam "+(idx?"2.":"1.")+" ověření");
}

/* ---------- souhrny, termíny, reporty ---------- */
/* Termíny: plánovaná ověření a opatření s termínem, od nejbližšího. */
function effDeadlines(today,horizon){
  today=today||todayIso();
  const out=[];
  S.eff.cases.forEach(c=>{
    const s=caseState(c,today);
    if(s.k==="zrus"||s.k==="ok"||s.k==="fail")return;
    if((s.k==="v1"||s.k==="v2")&&s.due)out.push({date:s.due,kind:s.k,case:c.id,text:s.k==="v1"?"1. ověření účinnosti":"2. ověření účinnosti",owner:""});
    liveActions(curRound(c)).filter(a=>!a.done&&a.due).forEach(a=>out.push({date:a.due,kind:a.kind,case:c.id,text:a.text,owner:a.owner}));
  });
  return out.filter(x=>!horizon||x.date<=addDays(today,horizon)).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0)
    .map(x=>({...x,late:x.date<today}));
}
/* Plnění před a po: při zjištění (kolo 1) a poslední ověření s daty. */
function caseBeforeAfter(c){
  const first=c.rounds[0]&&c.rounds[0].base;
  let after=null;
  c.rounds.forEach(r=>r.v.forEach(v=>{if(v&&v.eff!=null)after=v;}));
  return {before:first&&first.eff!=null?first.eff:null,after:after?after.eff:null,afterDate:after?after.done:""};
}
function effSummary(today){
  today=today||todayIso();
  const list=S.eff.cases.map(c=>({c,s:caseState(c,today)}));
  const n=k=>list.filter(x=>x.s.k===k).length;
  const verifs=S.eff.cases.flatMap(c=>c.rounds.flatMap(r=>r.v.filter(v=>v&&v.result)));
  const closed=list.filter(x=>x.s.k==="ok");
  const lead=closed.map(x=>daysBetween(todayIso(x.c.at),x.s.closed)).filter(d=>d>=0);
  return {total:list.length,open:n("new")+n("act"),verify:n("v1")+n("v2"),fail:n("fail"),ok:n("ok"),zrus:n("zrus"),
    reopened:S.eff.cases.filter(c=>c.rounds.length>1).length,verifs:verifs.length,verifOk:verifs.filter(v=>v.result==="ok").length,
    leadAvg:lead.length?lead.reduce((a,b)=>a+b,0)/lead.length:null,
    lost:S.eff.cases.reduce((x,c)=>x+c.rounds.reduce((y,r)=>y+(r.base?Math.max(0,r.base.nspent-r.base.norm):0),0),0),
    late:effDeadlines(today).filter(x=>x.late).length};
}
/* Kopie případu do vydaného reportu (bez historie, ta je v případu). */
function caseCopy(c){const x=JSON.parse(JSON.stringify(c));delete x.log;delete x.comments;return x;}
/* Obsah týdenního reportu: žebříček, ukazatele a stav řešení k okamžiku vydání. */
function weekReportData(id,today){
  today=today||todayIso();
  const w=weekById(id),hist=topHistory();
  if(!w)return null;
  const wt=weekTop(id),rk=wt.src==="import"?weekRanking(id):null;
  const top=wt.items.map((r,i)=>{
    const c=caseOfItem(r.ean);
    const workers=wt.src==="import"?itemWorkers(r.ean,w.from,w.to).filter(x=>x.eff!=null).map(x=>x.eff):[];
    const m=wt.src==="manual"?entryMetrics(r):effMetrics(r);
    return {rank:i+1,ean:r.ean,name:r.name||effItemName(r.ean),...m,lost:Math.round(r.lost),
      wmin:workers.length?Math.round(Math.min(...workers)):null,wmax:workers.length?Math.round(Math.max(...workers)):null,
      times:(hist[r.ean]||[]).filter(x=>x<=id).length,trend:itemTrend(r.ean,id,6).map(x=>x.eff),case:c?c.id:""};
  });
  const ids=[...new Set(top.map(t=>t.case).filter(Boolean))];
  const norm=top.reduce((x,t)=>x+t.norm,0),nspent=top.reduce((x,t)=>x+t.nspent,0);
  return {week:id,src:wt.src,items:rk?rk.items:null,under:rk?rk.under:null,small:rk?rk.small:null,
    tot:{eff:nspent>0?Math.round(norm/nspent*1000)/10:null,norm:Math.round(norm),nspent:Math.round(nspent),lost:top.reduce((x,t)=>x+t.lost,0),ks:Math.round(top.reduce((x,t)=>x+(t.ks||0),0))},
    top,cases:ids.map(i=>caseCopy(effCase(i))),settings:{...effSet()},
    deadlines:effDeadlines(today,21).map(x=>{const c=effCase(x.case);return {...x,no:c?c.no:"",ean:c?c.ean:""};}),
    summary:effSummary(today)};
}
/* Vydání týdenního reportu: uloží snímek. Když se obsah od poslední revize nezměnil,
   zůstane původní; jinak vznikne nová revize (starší obsah se nahradí, počet revizí zůstane). */
function issueWeekReport(id,meta){
  const data=weekReportData(id);
  if(!data)return null;
  const old=S.eff.reports.find(r=>r.week===id);
  const comparable=d=>JSON.stringify({...d,summary:null,deadlines:null});
  if(old&&comparable(old.data)===comparable(data))return old;
  const rep={id:old?old.id:uid("r"),week:id,rev:old?old.rev+1:1,at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60),data};
  S.eff.reports=S.eff.reports.filter(r=>r.week!==id).concat(rep).sort((a,b)=>a.week<b.week?-1:1);
  return rep;
}

/* ---------- kontrola dat (sanitizeState) ---------- */
function cleanEff(input){
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const arr=v=>Array.isArray(v)?v:[];
  const str=(v,max)=>String(v==null?"":v).slice(0,max);
  const num=(v,d,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?clamp(n,lo,hi):d;};
  const int=(v,d,lo,hi)=>Math.round(num(v,d,lo,hi));
  const day=v=>ISO_DAY.test(String(v))?String(v):"";
  const week=v=>WEEK_ID.test(String(v))?String(v):"";
  const o=obj(input),st=obj(o.settings);
  const metrics=m=>{
    if(!m||typeof m!=="object")return null;
    return {eff:m.eff==null||m.eff===""||!Number.isFinite(Number(m.eff))?null:Math.round(num(m.eff,0,0,1000)*10)/10,
      nspent:num(m.nspent,0,0,1e9),norm:num(m.norm,0,0,1e9),spent:num(m.spent,0,0,1e9),ks:num(m.ks,0,0,1e12),
      rows:int(m.rows,0,0,1e9),workers:int(m.workers,0,0,1e6)};
  };
  const round=(r,i)=>{
    r=obj(r);
    const v=[];
    for(const x of arr(r.v).slice(0,2)){
      if(!x||typeof x!=="object"||!day(x.done))break;
      v.push({done:day(x.done),result:x.result==="ok"?"ok":"fail",note:str(x.note,1000),from:day(x.from),to:day(x.to),plan:day(x.plan),
        eff:x.eff==null||!Number.isFinite(Number(x.eff))?null:Math.round(num(x.eff,0,0,1000)*10)/10,
        nspent:num(x.nspent,0,0,1e9),norm:num(x.norm,0,0,1e9),ks:num(x.ks,0,0,1e12),rows:int(x.rows,0,0,1e9),
        src:x.src==="manual"||x.src==="import"?x.src:"",at:num(x.at,0,0,1e15),by:str(x.by,60)});
      if(v[v.length-1].result!=="ok")break;
    }
    return {n:i+1,at:num(r.at,0,0,1e15),by:str(r.by,60),reason:str(r.reason,1000),week:week(r.week),base:metrics(r.base),
      cat:EFF_CATS.some(c=>c[0]===r.cat)?r.cat:"",cause:str(r.cause,4000),options:str(r.options,4000),
      actions:arr(r.actions).filter(a=>a&&typeof a==="object").slice(0,100).map(a=>({
        id:typeof a.id==="string"&&SAFE_ID.test(a.id)?a.id:uid("a"),kind:a.kind==="process"?"process":"now",
        text:str(a.text,1000),owner:str(a.owner,120),due:day(a.due),done:day(a.done),note:str(a.note,500)})),
      v,d1:int(r.d1,EFF_DEFAULTS.d1,1,365),d2:int(r.d2,EFF_DEFAULTS.d2,1,365),p1:day(r.p1),p2:day(r.p2),
      p1why:str(r.p1why,300),p2why:str(r.p2why,300)};
  };
  const kase=c=>{
    c=obj(c);
    const rounds=arr(c.rounds).slice(0,50).map(round);
    const ean=itemKey(c.ean);
    if(!ean||!CASE_NO.test(String(c.no))||!rounds.length)return null;
    const cc=c.cancelled&&typeof c.cancelled==="object"?{at:num(c.cancelled.at,0,0,1e15),by:str(c.cancelled.by,60),reason:str(c.cancelled.reason,500)}:null;
    return {id:typeof c.id==="string"&&SAFE_ID.test(c.id)?c.id:uid("c"),no:String(c.no),ean,name:str(c.name,120),
      at:num(c.at,0,0,1e15),by:str(c.by,60),week:week(c.week),base:metrics(c.base),cancelled:cc,rounds,
      log:arr(c.log).filter(e=>e&&typeof e==="object"&&typeof e.t==="string").slice(-500).map(e=>({at:num(e.at,0,0,1e15),by:str(e.by,60),t:str(e.t,500)})),
      comments:arr(c.comments).filter(k=>k&&typeof k==="object"&&typeof k.text==="string"&&k.text.trim()).slice(-500).map(k=>({
        id:typeof k.id==="string"&&SAFE_ID.test(k.id)?k.id:uid("k"),at:num(k.at,0,0,1e15),by:str(k.by,60),text:str(k.text,CASE_COMMENT_MAX).trim(),
        round:int(k.round,1,1,50),ed:k.ed&&typeof k.ed==="object"?{at:num(k.ed.at,0,0,1e15),by:str(k.ed.by,60)}:null}))};
  };
  const cases=[],seenId=new Set(),seenNo=new Set();
  arr(o.cases).slice(0,5000).forEach(c=>{
    const x=kase(c);
    if(!x||seenId.has(x.id)||seenNo.has(x.no))return;
    seenId.add(x.id);seenNo.add(x.no);cases.push(x);
  });
  const reports=[];
  arr(o.reports).forEach(r=>{
    r=obj(r);const d=obj(r.data);
    if(!week(r.week)||reports.some(x=>x.week===r.week))return;
    const top=arr(d.top).slice(0,EFF_TOP).map((t,i)=>{t=obj(t);return {rank:i+1,ean:itemKey(t.ean),name:str(t.name,120),...(metrics(t)||metrics({})),
      lost:num(t.lost,0,0,1e9),wmin:t.wmin==null?null:int(t.wmin,0,0,1000),wmax:t.wmax==null?null:int(t.wmax,0,0,1000),times:int(t.times,0,0,1000),
      trend:arr(t.trend).slice(0,12).map(x=>x==null||!Number.isFinite(Number(x))?null:Math.round(num(x,0,0,1000)*10)/10),
      case:typeof t.case==="string"&&SAFE_ID.test(t.case)?t.case:""};}).filter(t=>t.ean);
    const tot=obj(d.tot);
    const optInt=v=>v==null||v===""||!Number.isFinite(Number(v))?null:int(v,0,0,1e6);
    reports.push({id:typeof r.id==="string"&&SAFE_ID.test(r.id)?r.id:uid("r"),week:r.week,rev:int(r.rev,1,1,1000),
      at:num(r.at,0,0,1e15),by:str(r.by,60),data:{week:r.week,src:d.src==="manual"||d.src==="import"?d.src:"",items:optInt(d.items),under:optInt(d.under),small:optInt(d.small),
        tot:{eff:tot.eff==null||!Number.isFinite(Number(tot.eff))?null:Math.round(num(tot.eff,0,0,1000)*10)/10,norm:num(tot.norm,0,0,1e12),
          nspent:num(tot.nspent,0,0,1e12),lost:num(tot.lost,0,0,1e12),ks:num(tot.ks,0,0,1e12)},
        top,cases:arr(d.cases).slice(0,EFF_TOP).map(kase).filter(Boolean).map(c=>{delete c.log;delete c.comments;return c;}),
        settings:{min:int(obj(d.settings).min,EFF_DEFAULTS.min,0,6000),target:int(obj(d.settings).target,EFF_DEFAULTS.target,1,200),
          d1:int(obj(d.settings).d1,EFF_DEFAULTS.d1,1,365),d2:int(obj(d.settings).d2,EFF_DEFAULTS.d2,1,365),unit:obj(d.settings).unit==="min"?"min":"h"},
        deadlines:arr(d.deadlines).slice(0,200).map(x=>{x=obj(x);return {date:day(x.date),kind:["v1","v2","now","process"].includes(x.kind)?x.kind:"now",
          case:typeof x.case==="string"&&SAFE_ID.test(x.case)?x.case:"",text:str(x.text,1000),owner:str(x.owner,120),late:!!x.late,
          no:CASE_NO.test(String(x.no))?String(x.no):"",ean:itemKey(x.ean)};}).filter(x=>x.date),
        summary:d.summary&&typeof d.summary==="object"?Object.fromEntries(["total","open","verify","fail","ok","zrus","reopened","verifs","verifOk","lost","late"]
          .map(k=>[k,num(d.summary[k],0,0,1e12)]).concat([["leadAvg",d.summary.leadAvg==null?null:num(d.summary.leadAvg,0,0,1e6)]])):null}});
  });
  /* ruční zápis týdnů: nejvýš 5 řádků (rozepsané řádky bez EAN zůstanou, ať se neztratí) */
  const weeks={};
  Object.entries(obj(o.weeks)).forEach(([id,wk])=>{
    if(!week(id))return;
    wk=obj(wk);
    const items=arr(wk.items).filter(e=>e&&typeof e==="object").slice(0,EFF_TOP).map(e=>({
      id:typeof e.id==="string"&&SAFE_ID.test(e.id)?e.id:uid("e"),ean:itemKey(e.ean),name:str(e.name,120),
      spent:Math.round(num(e.spent,0,0,1e7)*100)/100,norm:Math.round(num(e.norm,0,0,1e7)*100)/100}));
    if(items.length)weeks[id]={items,at:num(wk.at,0,0,1e15),by:str(wk.by,60)};
  });
  const nos={};
  Object.entries(obj(o.nos)).slice(0,200).forEach(([y,n])=>{if(/^\d{4}$/.test(y))nos[y]=int(n,0,0,999999);});
  return {weeks,cases,reports:reports.sort((a,b)=>a.week<b.week?-1:1).slice(-400),
    settings:{min:int(st.min,EFF_DEFAULTS.min,0,6000),target:int(st.target,EFF_DEFAULTS.target,1,200),
      d1:int(st.d1,EFF_DEFAULTS.d1,1,365),d2:int(st.d2,EFF_DEFAULTS.d2,1,365),unit:st.unit==="min"?"min":"h"},nos};
}

/* ================= verze 2.3: Kontroly (nutné úkony oddělení, namátkové kontroly) =================
   Ke každému oddělení se vede seznam nutných úkonů (body, které musí operátor dělat).
   Na týden dopředu se vygeneruje namátková kontrola: z každého oddělení se vybere 25 %
   zaměstnanců (zaokrouhleno nahoru, aspoň jeden) a rozloží se postupně na pracovní dny.
   Výběr je náhodný, ale přednost mají ti, kdo nejdéle nebyli kontrolovaní, takže se za
   čtyři týdny vystřídají všichni. U každého člověka se u každého bodu zapíše splněno nebo
   nesplněno; výsledek se ukáže v jeho kartě (Lidé, Profil). */
const AUD_DEFAULTS={pct:25};
const AUD_STATES={plan:"Naplánováno",done:"Provedeno",skip:"Neproběhlo"};
function blankAudit(){return {tasks:{},plans:{},settings:{...AUD_DEFAULTS}};}
function audSet(){return {...AUD_DEFAULTS,...((S&&S.audit&&S.audit.settings)||{})};}
/* Oddělení člověka podle jeho pozice; bez pozice do kontrol nepatří. */
function empDept(e){const p=e&&e.positionId?posIn(S,e.positionId):null;return p?deptOf(p):"";}
function audName(e){return e?(e.last+" "+e.first).trim():"";}
/* Lidé oddělení, kteří se kontrolují: nevyřazení, s pozicí v oddělení. */
function audPeople(dept){
  return Object.values(S.employees).filter(e=>!e.excluded&&!isLead(e)&&empDept(e)===dept)
    .sort((a,b)=>norm(audName(a)).localeCompare(norm(audName(b)),"cs"));
}
/* Oddělení, která mají aspoň jednoho kontrolovaného člověka, v pořadí pozic. */
function audDepts(){return departments().filter(d=>audPeople(d).length);}
function audTasks(dept){return ((S.audit&&S.audit.tasks)||{})[dept]||[];}
function audCount(n,pct){return n?Math.max(1,Math.ceil(n*(pct==null?audSet().pct:pct)/100)):0;}
/* Pracovní dny týdne (bez víkendu a státních svátků). */
function audDays(weekId){
  const w=weekById(weekId);
  if(!w)return [];
  const out=[];
  for(let i=0;i<7;i++){const iso=addDays(w.from,i),[y,m,d]=iso.split("-").map(Number);if(mkDay(y,m,d).work)out.push(iso);}
  return out;
}
function audPlan(weekId){return (S.audit&&S.audit.plans&&S.audit.plans[weekId])||null;}
function audItem(weekId,id){const p=audPlan(weekId);return p?p.items.find(x=>x.id===id)||null:null;}
/* Poslední provedená kontrola každého člověka (datum), pro spravedlivé střídání. */
function audLast(){
  const m={};
  Object.values((S.audit&&S.audit.plans)||{}).forEach(p=>p.items.forEach(it=>{
    const d=it.state==="done"?it.done:it.state==="plan"?it.day:"";
    if(d&&(!m[it.key]||d>m[it.key]))m[it.key]=d;
  }));
  return m;
}
/* Den s nejmenším počtem lidí z oddělení, pak nejmenším počtem celkem; shodu rozhodne náhoda. */
function audPickDay(days,items,dept,rnd){
  const order={};days.forEach(d=>{order[d]=rnd();});
  const dl=d=>items.filter(i=>i.dept===dept&&i.day===d&&i.state!=="skip").length;
  const tl=d=>items.filter(i=>i.day===d&&i.state!=="skip").length;
  return days.slice().sort((a,b)=>dl(a)-dl(b)||tl(a)-tl(b)||order[a]-order[b])[0];
}
/* Vygeneruje (nebo přegeneruje) plán týdne. Provedené a neproběhlé kontroly zůstanou,
   nahradí se jen naplánované. rnd = zdroj náhody (testy ho dodají pevný). */
function generatePlan(weekId,meta,rnd){
  rnd=rnd||Math.random;
  const days=audDays(weekId);
  if(!days.length)throw new Error("Týden nemá žádný pracovní den.");
  /* v běžícím týdnu jen dny od dneška (do minulých dnů nemá smysl plánovat) */
  const today=todayIso((meta&&meta.at)||Date.now()),free=days.filter(d=>d>=today);
  if(!free.length)throw new Error("Týden už nemá žádný zbývající pracovní den.");
  const old=audPlan(weekId);
  const items=old?old.items.filter(i=>i.state!=="plan"):[];
  const inPlan=new Set(items.map(i=>i.key));
  const last=audLast(),pct=audSet().pct;
  audDepts().forEach(dept=>{
    const people=audPeople(dept);
    const need=Math.max(0,audCount(people.length,pct)-items.filter(i=>i.dept===dept&&i.state==="done").length);
    const pool=people.filter(e=>!inPlan.has(e.key)).map(e=>({e,r:rnd(),last:last[e.key]||""}))
      .sort((a,b)=>(a.last<b.last?-1:a.last>b.last?1:a.r-b.r)).slice(0,need);
    pool.forEach(({e})=>{
      items.push({id:uid("k"),key:e.key,name:audName(e),dept,day:audPickDay(free,items,dept,rnd),state:"plan",
        done:"",checker:"",results:[],note:"",reason:"",extra:false,at:0,by:""});
      inPlan.add(e.key);
    });
  });
  S.audit.plans[weekId]={at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60),pct,days,
    items:items.sort((a,b)=>(a.day<b.day?-1:a.day>b.day?1:0)||norm(a.dept).localeCompare(norm(b.dept),"cs")||norm(a.name).localeCompare(norm(b.name),"cs"))};
  return S.audit.plans[weekId];
}
/* Zápis kontroly: answers = {idBodu: true|false}, notes = {idBodu: text}. Body se uloží
   i s textem (pozdější změna nutných úkonů zápis nezmění). */
function recordCheck(weekId,itemId,data,meta){
  const it=audItem(weekId,itemId);
  if(!it)throw new Error("Kontrola v plánu není.");
  const tasks=audTasks(it.dept);
  if(!tasks.length)throw new Error("Oddělení "+it.dept+" nemá nutné úkony.");
  const ans=data.answers||{},notes=data.notes||{};
  const missing=tasks.filter(t=>typeof ans[t.id]!=="boolean");
  if(missing.length)throw new Error("U každého bodu vyber splněno, nebo nesplněno ("+missing.length+" chybí).");
  if(!ISO_DAY.test(String(data.date||"")))throw new Error("Vyber datum kontroly.");
  it.state="done";it.done=data.date;it.checker=String(data.checker||"").trim().slice(0,60);
  it.results=tasks.map(t=>({t:t.id,text:t.text,ok:ans[t.id],note:String(notes[t.id]||"").trim().slice(0,300)}));
  it.note=String(data.note||"").trim().slice(0,1000);it.reason="";
  it.at=(meta&&meta.at)||Date.now();it.by=String((meta&&meta.by)||"").slice(0,60);
  const e=S.employees[it.key];if(e)it.name=audName(e);
  return it;
}
function skipCheck(weekId,itemId,reason,meta){
  const it=audItem(weekId,itemId);
  if(!it)return null;
  it.state="skip";it.reason=String(reason||"").trim().slice(0,300);it.done="";it.results=[];
  it.at=(meta&&meta.at)||Date.now();it.by=String((meta&&meta.by)||"").slice(0,60);
  return it;
}
function undoCheck(weekId,itemId){
  const it=audItem(weekId,itemId);
  if(!it)return null;
  it.state="plan";it.done="";it.checker="";it.results=[];it.note="";it.reason="";it.at=0;it.by="";
  return it;
}
/* Náhradník za člověka, u kterého kontrola neproběhla: jiný z téhož oddělení, který v plánu
   týdne není (přednost má ten, kdo nejdéle nebyl kontrolovaný). Den zůstane stejný. */
function substituteCheck(weekId,itemId,reason,meta,rnd){
  rnd=rnd||Math.random;
  const p=audPlan(weekId),it=audItem(weekId,itemId);
  if(!p||!it)return null;
  const inPlan=new Set(p.items.map(i=>i.key)),last=audLast();
  const cand=audPeople(it.dept).filter(e=>!inPlan.has(e.key)).map(e=>({e,r:rnd(),last:last[e.key]||""}))
    .sort((a,b)=>(a.last<b.last?-1:a.last>b.last?1:a.r-b.r))[0];
  if(!cand)return null;
  if(it.state==="plan")skipCheck(weekId,itemId,reason||"náhradník",meta);
  const sub={id:uid("k"),key:cand.e.key,name:audName(cand.e),dept:it.dept,day:it.day,state:"plan",done:"",checker:"",results:[],note:"",
    reason:"",extra:false,sub:it.id,at:0,by:""};
  p.items.splice(p.items.indexOf(it)+1,0,sub);
  return sub;
}
function addToPlan(weekId,key,day,meta){
  const e=S.employees[key],dept=empDept(e);
  if(!e||!dept)throw new Error("Člověk nemá pozici, nejde ho zařadit do kontroly.");
  const days=audDays(weekId);
  if(!days.includes(day))throw new Error("Vyber pracovní den týdne.");
  let p=audPlan(weekId);
  if(!p)p=S.audit.plans[weekId]={at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60),pct:audSet().pct,days,items:[]};
  if(p.items.some(i=>i.key===key&&i.state==="plan"))throw new Error(audName(e)+" už v plánu týdne je.");
  const it={id:uid("k"),key,name:audName(e),dept,day,state:"plan",done:"",checker:"",results:[],note:"",reason:"",extra:true,at:0,by:""};
  p.items.push(it);
  p.items.sort((a,b)=>(a.day<b.day?-1:a.day>b.day?1:0));
  return it;
}
function removeFromPlan(weekId,itemId){
  const p=audPlan(weekId);
  if(!p)return;
  p.items=p.items.filter(i=>!(i.id===itemId&&i.state==="plan"));
}
/* Výsledek jedné kontroly: počet bodů, splněných, nesplněné body. */
function checkScore(it){
  const n=it.results.length,ok=it.results.filter(r=>r.ok).length;
  return {n,ok,fail:it.results.filter(r=>!r.ok),pct:n?ok/n*100:null};
}
/* Provedené kontroly člověka od nejnovější (pro jeho kartu). */
function personChecks(key,from,to){
  const out=[];
  Object.entries((S.audit&&S.audit.plans)||{}).forEach(([w,p])=>p.items.forEach(it=>{
    if(it.key===key&&it.state==="done"&&(!from||it.done>=from)&&(!to||it.done<=to))out.push({...it,week:w,score:checkScore(it)});
  }));
  return out.sort((a,b)=>(a.done<b.done?1:a.done>b.done?-1:0));
}
function personAuditStats(key,from,to){
  const list=personChecks(key,from,to);
  const n=list.reduce((x,c)=>x+c.score.n,0),ok=list.reduce((x,c)=>x+c.score.ok,0);
  return {checks:list.length,points:n,ok,pct:n?ok/n*100:null,clean:list.filter(c=>c.score.ok===c.score.n).length,last:list[0]||null};
}
/* Souhrn týdne: plán, provedeno, neproběhlo, nezapsáno po termínu, plnění bodů. */
function planSummary(weekId,today){
  today=today||todayIso();
  const p=audPlan(weekId);
  if(!p)return null;
  const live=p.items.filter(i=>i.state!=="skip");
  const done=p.items.filter(i=>i.state==="done");
  const pts=done.reduce((x,i)=>x+i.results.length,0),ok=done.reduce((x,i)=>x+i.results.filter(r=>r.ok).length,0);
  return {planned:live.length,done:done.length,skip:p.items.length-live.length,late:p.items.filter(i=>i.state==="plan"&&i.day<today).length,
    today:p.items.filter(i=>i.state==="plan"&&i.day===today).length,points:pts,ok,pct:pts?ok/pts*100:null,clean:done.filter(i=>i.results.every(r=>r.ok)).length};
}
/* Kontroly po termínu (naplánované na den, který už minul, a nezapsané). */
function auditLate(today){
  today=today||todayIso();
  let n=0;
  Object.values((S.audit&&S.audit.plans)||{}).forEach(p=>p.items.forEach(i=>{if(i.state==="plan"&&i.day<today)n++;}));
  return n;
}
/* Výsledky za období: po odděleních a nejčastěji nesplněné body. */
function auditResults(from,to,dept){
  const rows=[];
  Object.entries((S.audit&&S.audit.plans)||{}).forEach(([w,p])=>p.items.forEach(it=>{
    if(it.state==="done"&&(!from||it.done>=from)&&(!to||it.done<=to)&&(!dept||it.dept===dept))rows.push({...it,week:w,score:checkScore(it)});
  }));
  rows.sort((a,b)=>(a.done<b.done?1:a.done>b.done?-1:0));
  const byDept={};
  rows.forEach(r=>{
    const d=byDept[r.dept]||(byDept[r.dept]={dept:r.dept,checks:0,points:0,ok:0,people:new Set(),clean:0});
    d.checks++;d.points+=r.score.n;d.ok+=r.score.ok;d.people.add(r.key);if(r.score.ok===r.score.n)d.clean++;
  });
  const fails={};
  rows.forEach(r=>r.results.forEach(x=>{
    const k=r.dept+"|"+x.text;
    const f=fails[k]||(fails[k]={dept:r.dept,text:x.text,n:0,fail:0});
    f.n++;if(!x.ok)f.fail++;
  }));
  return {rows,depts:Object.values(byDept).map(d=>({...d,people:d.people.size,pct:d.points?d.ok/d.points*100:null})).sort((a,b)=>norm(a.dept).localeCompare(norm(b.dept),"cs")),
    fails:Object.values(fails).filter(f=>f.fail).sort((a,b)=>b.fail/b.n-a.fail/a.n||b.fail-a.fail).slice(0,15)};
}
/* Seznamy nutných úkonů pro oddělení, která už nemají žádnou pozici (např. po přejmenování). */
function auditOrphans(){
  const d=new Set(departments());
  return Object.keys((S.audit&&S.audit.tasks)||{}).filter(k=>!d.has(k)&&S.audit.tasks[k].length);
}
function cleanAudit(input){
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const arr=v=>Array.isArray(v)?v:[];
  const str=(v,max)=>String(v==null?"":v).slice(0,max);
  const num=(v,d,lo,hi)=>{const n=Number(v);return Number.isFinite(n)?clamp(n,lo,hi):d;};
  const day=v=>ISO_DAY.test(String(v))?String(v):"";
  const key=(v,max)=>{const k=str(v,max).trim();return (k==="__proto__"||k==="constructor"||k==="prototype")?"":k;};
  const id=(v,p)=>typeof v==="string"&&SAFE_ID.test(v)?v:uid(p);
  const o=obj(input),st=obj(o.settings);
  const tasks={};
  Object.entries(obj(o.tasks)).forEach(([d,list])=>{
    const k=key(d,60);
    if(!k)return;
    const seen=new Set();
    const l=arr(list).filter(t=>t&&typeof t==="object").slice(0,50).map(t=>({id:id(t.id,"t"),text:str(t.text,300).trim()}))
      .filter(t=>t.text&&!seen.has(t.id)&&seen.add(t.id));
    if(l.length)tasks[k]=l;
  });
  const plans={};
  Object.entries(obj(o.plans)).filter(([w])=>WEEK_ID.test(w)).sort().slice(-260).forEach(([w,p])=>{
    p=obj(p);
    const seen=new Set();
    const items=arr(p.items).filter(i=>i&&typeof i==="object").slice(0,3000).map(i=>{
      const state=["plan","done","skip"].includes(i.state)?i.state:"plan";
      return {id:id(i.id,"k"),key:key(i.key,120),name:str(i.name,120),dept:key(i.dept,60),day:day(i.day),state,
        done:state==="done"?day(i.done):"",checker:str(i.checker,60),
        results:state==="done"?arr(i.results).filter(r=>r&&typeof r==="object").slice(0,50).map(r=>({t:str(r.t,40),text:str(r.text,300),ok:r.ok===true,note:str(r.note,300)})):[],
        note:str(i.note,1000),reason:str(i.reason,300),extra:!!i.extra,...(typeof i.sub==="string"&&SAFE_ID.test(i.sub)?{sub:i.sub}:{}),
        at:num(i.at,0,0,1e15),by:str(i.by,60)};
    }).filter(i=>i.key&&i.dept&&i.day&&!(i.state==="done"&&!i.done)&&!seen.has(i.id)&&seen.add(i.id));
    plans[w]={at:num(p.at,0,0,1e15),by:str(p.by,60),pct:Math.round(num(p.pct,AUD_DEFAULTS.pct,1,100)),
      days:arr(p.days).map(day).filter(Boolean).slice(0,7),items};
  });
  return {tasks,plans,settings:{pct:Math.round(num(st.pct,AUD_DEFAULTS.pct,5,100))}};
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

/* ================= Protokoly: provozní deníky strojů (verze 2.16) =================
   Každý stroj má svůj deník: údaje o stroji, fotku a úkony s postupem, kritériem, kdo je
   provádí, fotkami a intervalem. Z intervalů vzniká doporučení na každý den archu
   („Doporučení: 1, 2, 4“). Doporučení je plán; záznamem je až vyplněný a podepsaný řádek. */
const LB_EVERY=[["shift","Každou směnu"],["day","Denně"],["week","Týdně"],["weeks","Každých N týdnů"],
  ["month","Měsíčně"],["months","Každých N měsíců"],["year","Ročně"],["ndays","Každých N dní"],
  ["hours","Po N motohodinách"],["need","Podle potřeby"]];
const LB_EVERY_KEYS=LB_EVERY.map(x=>x[0]);
const LB_WHO=[["obsluha","Obsluha"],["serizovac","Seřizovač"],["udrzba","Údržba"],["vedouci","Vedoucí"]];
const LB_PHOTOS=3;
const LB_MAX_DAYS=731;   // tisk nejvýš na dva roky dopředu
const FILE_ID=/^[a-f0-9]{32}$/;
const DOW_SHORT=["Ne","Po","Út","St","Čt","Pá","So"];
const MONTH_NAME=["leden","únor","březen","duben","květen","červen","červenec","srpen","září","říjen","listopad","prosinec"];

function blankStep(){return {id:uid("u"),name:"",how:"",ok:"",who:"obsluha",stop:false,every:{k:"day",n:1,dow:1,day:1,month:1},photos:[]};}
function blankLogbook(){return {id:uid("lb"),name:"",inv:"",maker:"",model:"",serial:"",year:"",dept:"",place:"",owner:"",service:"",
  manual:"",safety:"",note:"",weekend:false,shifts:1,counter:false,from:"",photo:"",steps:[]};}

function cleanLogbooks(list){
  const str=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").slice(0,max);
  const int=(v,d,lo,hi)=>{const n=Math.round(Number(v));return Number.isFinite(n)?clamp(n,lo,hi):d;};
  const id=(v,p)=>typeof v==="string"&&SAFE_ID.test(v)?v:uid(p);
  const seen=new Set(),uniq=(v,p)=>{let x=id(v,p);while(seen.has(x))x=uid(p);seen.add(x);return x;};
  return (Array.isArray(list)?list:[]).filter(b=>b&&typeof b==="object").slice(0,200).map(b=>({
    id:uniq(b.id,"lb"),name:str(b.name,120),inv:str(b.inv,60),maker:str(b.maker,80),model:str(b.model,80),serial:str(b.serial,60),
    year:str(b.year,10),dept:str(b.dept,80),place:str(b.place,120),owner:str(b.owner,80),service:str(b.service,120),
    manual:str(b.manual,300),safety:str(b.safety,1500),note:str(b.note,1500),
    weekend:!!b.weekend,shifts:int(b.shifts,1,1,3),counter:!!b.counter,
    from:/^\d{4}-\d{2}-\d{2}$/.test(String(b.from||""))?String(b.from):"",
    photo:FILE_ID.test(String(b.photo||""))?String(b.photo):"",
    steps:(Array.isArray(b.steps)?b.steps:[]).filter(x=>x&&typeof x==="object").slice(0,60).map(x=>{
      const e=x.every&&typeof x.every==="object"?x.every:{};
      return {id:uniq(x.id,"u"),name:str(x.name,160),how:str(x.how,2000),ok:str(x.ok,600),
        who:LB_WHO.some(w=>w[0]===x.who)?x.who:"obsluha",stop:!!x.stop,
        every:{k:LB_EVERY_KEYS.includes(e.k)?e.k:"day",n:int(e.n,1,1,5000),dow:int(e.dow,1,1,7),day:int(e.day,1,0,28),month:int(e.month,1,1,12)},
        photos:[...new Set((Array.isArray(x.photos)?x.photos:[]).map(String).filter(v=>FILE_ID.test(v)))].slice(0,LB_PHOTOS)};
    }),
  }));
}
/* Všechny fotky v denících (pro zálohu a úklid). */
function lbFileIds(st){return [...new Set(((st||S).logbooks||[]).flatMap(b=>[b.photo,...b.steps.flatMap(x=>x.photos)]).filter(Boolean))];}

/* Interval lidsky: „Týdně (pondělí)“, „Každé 3 měsíce (1. pracovní den)“… */
function lbEveryText(e){
  e=e||{};
  const dowName=["","pondělí","úterý","středa","čtvrtek","pátek","sobota","neděle"][e.dow||1];
  const dayTxt=e.day?e.day+". den v měsíci":"1. pracovní den";
  switch(e.k){
    case "shift":return "Každou směnu";
    case "day":return "Denně";
    case "week":return "Týdně ("+dowName+")";
    case "weeks":return (e.n>1?"Každý "+e.n+". týden":"Týdně")+" ("+dowName+")";
    case "month":return "Měsíčně ("+dayTxt+")";
    case "months":return (e.n===3?"Čtvrtletně":e.n===6?"Pololetně":e.n===12?"Ročně":e.n>4?"Každých "+e.n+" měsíců":e.n>1?"Každé "+e.n+" měsíce":"Měsíčně")+" ("+dayTxt+")";
    case "year":return "Ročně ("+MONTH_NAME[(e.month||1)-1]+", "+dayTxt+")";
    case "ndays":return e.n>4?"Každých "+e.n+" dní":e.n>1?"Každé "+e.n+" dny":"Denně";
    case "hours":return "Po "+e.n+" motohodinách";
    default:return "Podle potřeby";
  }
}
/* Pracuje stroj ten den? Víkend jen se zapnutým provozem o víkendu, státní svátek ne. */
function lbWork(book,iso){const [y,m,d]=iso.split("-").map(Number);const x=mkDay(y,m,d);return !x.hol&&(book.weekend||!x.weekend);}
/* Termín, který padne na den bez provozu, se posune na nejbližší další pracovní den stroje. */
function lbShift(book,iso){for(let i=0;i<15&&!lbWork(book,iso);i++)iso=addDays(iso,1);return iso;}
/* Dny v rozsahu from..to, kdy je úkon na řadě. Fáze opakování se počítá od „platí od“
   (book.from), takže posunutý termín nemění další termíny. */
function lbDue(book,step,from,to){
  const e=step.every||{},out=new Set(),anchor=book.from||from;
  const add=iso=>{const w=lbShift(book,iso);if(w>=from&&w<=to)out.add(w);};
  if(e.k==="shift"||e.k==="day"){for(let d=from;d<=to;d=addDays(d,1))if(lbWork(book,d))out.add(d);return out;}
  if(e.k==="week"||e.k==="weeks"){
    const n=e.k==="week"?1:Math.max(1,e.n||1),a=isoWeek(anchor).from;
    for(let mon=isoWeek(addDays(from,-14)).from;mon<=to;mon=addDays(mon,7)){
      const w=Math.round((utcOf(mon)-utcOf(a))/(7*DAY_MS));
      if(((w%n)+n)%n===0)add(addDays(mon,(e.dow||1)-1));
    }
    return out;
  }
  if(e.k==="month"||e.k==="months"||e.k==="year"){
    const n=e.k==="months"?Math.max(1,e.n||1):1,[ay,am]=anchor.split("-").map(Number),ai=ay*12+am-1;
    const [fy,fm]=addDays(from,-31).split("-").map(Number),[ty,tm]=to.split("-").map(Number);
    for(let i=fy*12+fm-1;i<=ty*12+tm-1;i++){
      const y=Math.floor(i/12),m=i%12+1;
      if(e.k==="year"&&m!==(e.month||1))continue;
      if(e.k==="months"&&((i-ai)%n+n)%n!==0)continue;
      add(y+"-"+String(m).padStart(2,"0")+"-"+String(e.day||1).padStart(2,"0"));
    }
    return out;
  }
  if(e.k==="ndays"){
    const n=Math.max(1,e.n||1),gap=Math.round((utcOf(from)-utcOf(anchor))/DAY_MS);
    for(let d=addDays(anchor,(Math.floor(gap/n)-1)*n);d<=to;d=addDays(d,n))add(d);
    return out;
  }
  return out;   // motohodiny a podle potřeby: bez pevného termínu
}
/* Arch na období: den po dni, co je doporučené. day = úkony na den (do prvního řádku),
   shift = úkony každou směnu (do každého řádku dne). */
function lbPlan(book,from,to){
  const due=book.steps.map(s=>lbDue(book,s,from,to)),days=[];
  for(let d=from;d<=to;d=addDays(d,1)){
    const [y,m,dd]=d.split("-").map(Number),x=mkDay(y,m,dd),day=[],shift=[];
    book.steps.forEach((s,i)=>{if(due[i].has(d))(s.every.k==="shift"?shift:day).push(i+1);});
    days.push({iso:d,dow:x.dow,weekend:x.weekend,hol:x.hol||"",work:lbWork(book,d),day,shift});
  }
  return days;
}
/* Doporučení pro řádek archu (row 0 = první směna dne). */
function lbRowSteps(d,row){return (row?d.shift:[...d.shift,...d.day]).sort((a,b)=>a-b);}
/* Rozsah tisku: celý rok, nebo vlastní od–do (nejvýš dva roky). */
function lbRange(mode,year,from,to){
  if(mode==="year"){const y=Math.round(+year);if(!(y>=2000&&y<=2100))return null;return {from:y+"-01-01",to:y+"-12-31"};}
  const ok=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""));
  if(!ok(from)||!ok(to)||from>to)return null;
  return daysBetween(from,to)+1>LB_MAX_DAYS?{from,to:addDays(from,LB_MAX_DAYS-1),cut:true}:{from,to};
}

/* Historie změn v Protokolech. */
function lbChanges(A,B,add){
  const same=(x,y)=>JSON.stringify(x)===JSON.stringify(y);
  const ma=new Map(A.map(b=>[b.id,b])),mb=new Map(B.map(b=>[b.id,b]));
  const nm=b=>(b.name||"(bez názvu)")+(b.inv?" ("+b.inv+")":"");
  const FIELDS={name:"název",inv:"evidenční číslo",maker:"výrobce",model:"typ",serial:"výrobní číslo",year:"rok výroby",dept:"oddělení",place:"umístění",
    owner:"odpovědná osoba",service:"kontakt na údržbu",manual:"návod",safety:"bezpečnost",note:"poznámka",weekend:"provoz o víkendu",shifts:"záznamů za den",counter:"počitadlo",from:"platí od",photo:"fotka stroje"};
  mb.forEach((b,id)=>{
    const o=ma.get(id);
    if(!o){add("logbook","Protokoly: nový deník "+nm(b),{m:"lb:"+id});return;}
    const changed=Object.keys(FIELDS).filter(k=>!same(o[k],b[k]));
    // klíč sloučení podle polí: opakované psaní do téhož pole je jeden záznam, jiné pole nepřepíše dřívější
    if(changed.length)add("logbook","Protokoly – "+nm(b)+": upravené údaje – "+changed.map(k=>FIELDS[k]).join(", "),{m:"lbf:"+id+":"+changed.join()});
    const sa=new Map(o.steps.map((x,i)=>[x.id,[x,i]])),sb=new Map(b.steps.map((x,i)=>[x.id,[x,i]]));
    sb.forEach(([x,i],sid)=>{
      const p=sa.get(sid);
      if(!p)add("logbook","Protokoly – "+nm(b)+": přidán úkon "+(i+1)+" „"+(x.name||"bez názvu")+"“ ("+lbEveryText(x.every).toLowerCase()+")",{m:"lbs:"+sid});
      else{
        const [y]=p;
        if(!same(y.every,x.every))add("logbook","",{m:"lbe:"+sid,p:"Protokoly – "+nm(b)+", úkon „"+(x.name||"bez názvu")+"“: ",v0:lbEveryText(y.every),v1:lbEveryText(x.every)});
        if(y.name!==x.name||y.how!==x.how||y.ok!==x.ok||y.who!==x.who||y.stop!==x.stop)add("logbook","Protokoly – "+nm(b)+": upraven úkon „"+(x.name||"bez názvu")+"“",{m:"lbs:"+sid});
        if(!same(y.photos,x.photos))add("logbook","Protokoly – "+nm(b)+": fotky úkonu „"+(x.name||"bez názvu")+"“ ("+x.photos.length+")",{m:"lbp:"+sid});
      }
    });
    sa.forEach(([x],sid)=>{if(!sb.has(sid))add("logbook","Protokoly – "+nm(b)+": odebrán úkon „"+(x.name||"bez názvu")+"“",{m:"lbs:"+sid});});
    const oa=o.steps.filter(x=>sb.has(x.id)).map(x=>x.id).join(),ob=b.steps.filter(x=>sa.has(x.id)).map(x=>x.id).join();
    if(oa!==ob)add("logbook","Protokoly – "+nm(b)+": změněno pořadí úkonů",{m:"lbo:"+id});
  });
  ma.forEach((b,id)=>{if(!mb.has(id))add("logbook","Protokoly: smazán deník "+nm(b),{m:"lb:"+id});});
}

/* ==========================================================================
   AUDIT: lidé v práci a zpracované kusy (verze 2.17)
   Obsazenost ze souboru vedoucích (řádek = den, ranní a odpolední směna po skupinách)
   a výkaz práce z IS (datum, operace, kusy). Operace se přiřazují skupinám, skupina může
   být neproduktivní, nebo mimo IS (její práce se ve výkazu neobjeví). Kusy se počítají jen
   u operací přiřazených ke skupině (2.17.1). Každou hodnotu jde opravit s důvodem; původní
   hodnota zůstává uložená.
   ========================================================================== */
const WA_GROUPS=[
  {id:"brus",name:"Brusiči",am:"K",pm:"X",unprod:false,noIs:false},
  {id:"brush",name:"Brush",am:"L",pm:"Y",unprod:false,noIs:false},
  {id:"frez",name:"Frézování",am:"M",pm:"W",unprod:false,noIs:false},
  {id:"lep",name:"Lepení a značení dílů",am:"N",pm:"",unprod:false,noIs:false},
  {id:"kont",name:"Kontrola / balení / brigadýr / školitelé",am:"O",pm:"AA",unprod:true,noIs:false},
  {id:"tryska",name:"Obsluha tryskací kabiny",am:"P",pm:"Z",unprod:false,noIs:false},
  {id:"daiho",name:"Projekt Daiho",am:"S",pm:"",unprod:false,noIs:true}
];
/* Výchozí sloupce: obsazenost D (datum), ranní I plán, R absence, T celkem; odpolední U požadavek,
   V skutečnost. Výkaz práce A datum, H operace, J kusy. */
const WA_COLS={att:{date:"D",amPlan:"I",amTotal:"T",amAbs:"R",pmPlan:"U",pmTotal:"V"},work:{date:"A",op:"H",ks:"J"}};
const WA_COL_LABEL={date:"Datum",amPlan:"Ranní: mělo dorazit",amTotal:"Ranní: celkem v práci",amAbs:"Ranní: absence",pmPlan:"Odpolední: požadavek",pmTotal:"Odpolední: skutečně v práci",op:"Operace",ks:"Počet kusů"};
/* Odhad skupiny podle názvu operace: jen návrh na tlačítko v Nastavení, sám nic nepřiřadí. */
const WA_GUESS=[["tryska",/trysk|piskov|tryskac/],["brush",/brush|kartac/],["brus",/brus|brous/],["frez",/frez|cnc/],["lep",/lepen|znacen|lepi/],["kont",/kontrol|balen/]];
const WA_KEY=/^(am\.(plan|total|abs)|pm\.(plan|total)|g\.[A-Za-z0-9_]{1,20}\.(am|pm)|pcs\.o\d{1,6})$/;
const WA_ISO=/^\d{4}-\d{2}-\d{2}$/;
/* Požadavek lidí na pracovní den (2.18.1): pevně 100 lidí, null = podle plánu v souboru obsazenosti. */
const WA_TARGET=100;
function blankWorkAudit(){return {groups:JSON.parse(JSON.stringify(WA_GROUPS)),cols:JSON.parse(JSON.stringify(WA_COLS)),ops:[],days:{},pcs:{},edits:{},notes:{},files:[],seq:0,target:WA_TARGET,plan:blankWaPlan()};}
/* Výrobní plán (2.18): vzor sloupců dvou listů, filtr technologie, kapacita brusičů. Položky plánu
   jsou mimo stav v šifrovaných souborech (chunks), ve stavu jsou jen součty po týdnech. */
function blankWaPlan(){return {tpl:null,tech:{words:["G2","G"],mode:"token"},cap:{group:"brus",perShift:25},chunks:[],weeks:{},items:0,files:[],at:0,by:""};}
function waLetter(v){const t=String(v==null?"":v).trim().toUpperCase();return /^[A-Z]{1,3}$/.test(t)?t:"";}
function waIndex(letter){const t=waLetter(letter);if(!t)return -1;let n=0;for(const ch of t)n=n*26+(ch.charCodeAt(0)-64);return n-1;}
function cleanWorkAudit(o){
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const str=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,"").slice(0,max);
  const cnt=v=>{if(v==null||v==="")return null;const n=Number(v);return Number.isFinite(n)?Math.round(clamp(n,0,100000)*100)/100:null;};
  o=obj(o);
  const out=blankWorkAudit();
  if(Array.isArray(o.groups)){
    const seen=new Set();
    out.groups=o.groups.filter(g=>g&&typeof g==="object"&&/^[A-Za-z0-9_]{1,20}$/.test(String(g.id||""))).filter(g=>!seen.has(g.id)&&seen.add(g.id)).slice(0,20)
      .map(g=>({id:String(g.id),name:str(g.name,80)||String(g.id),am:waLetter(g.am),pm:waLetter(g.pm),unprod:!!g.unprod,noIs:!!g.noIs}));
  }
  const gids=new Set(out.groups.map(g=>g.id));
  const ca=obj(obj(o.cols).att),cw=obj(obj(o.cols).work);
  Object.keys(WA_COLS.att).forEach(k=>{if(k in ca)out.cols.att[k]=waLetter(ca[k]);});
  Object.keys(WA_COLS.work).forEach(k=>{if(k in cw)out.cols.work[k]=waLetter(cw[k]);});
  if(!out.cols.att.date)out.cols.att.date=WA_COLS.att.date;
  ["date","op","ks"].forEach(k=>{if(!out.cols.work[k])out.cols.work[k]=WA_COLS.work[k];});
  const seenOps=new Set();
  out.ops=(Array.isArray(o.ops)?o.ops:[]).filter(x=>x&&typeof x==="object"&&/^o\d{1,6}$/.test(String(x.id||""))&&!seenOps.has(x.id)&&seenOps.add(x.id)).slice(0,800)
    .map(x=>({id:String(x.id),name:str(x.name,160),group:gids.has(x.group)?x.group:"",on:x.on!==false}));
  const opIds=new Set(out.ops.map(x=>x.id));
  out.seq=Math.max(Number.isFinite(+o.seq)?Math.round(+o.seq):0,...out.ops.map(x=>+x.id.slice(1)),0);
  Object.entries(obj(o.days)).slice(0,4000).forEach(([iso,d])=>{
    if(!WA_ISO.test(iso)||!d||typeof d!=="object")return;
    const am=obj(d.am),pm=obj(d.pm),g={};
    Object.entries(obj(d.g)).forEach(([id,v])=>{if(/^[A-Za-z0-9_]{1,20}$/.test(id)&&Array.isArray(v))g[id]=[cnt(v[0]),cnt(v[1])];});
    out.days[iso]={am:{plan:cnt(am.plan),total:cnt(am.total),abs:cnt(am.abs)},pm:{plan:cnt(pm.plan),total:cnt(pm.total)},g};
  });
  Object.entries(obj(o.pcs)).slice(0,4000).forEach(([iso,d])=>{
    if(!WA_ISO.test(iso))return;
    const day={};Object.entries(obj(d)).forEach(([id,v])=>{const n=cnt(v);if(opIds.has(id)&&n!=null)day[id]=n;});
    if(Object.keys(day).length)out.pcs[iso]=day;
  });
  Object.entries(obj(o.edits)).slice(0,4000).forEach(([iso,d])=>{
    if(!WA_ISO.test(iso))return;
    const day={};Object.entries(obj(d)).slice(0,200).forEach(([k,e])=>{
      if(!WA_KEY.test(k)||!e||typeof e!=="object")return;
      if(k.startsWith("pcs.")&&!opIds.has(k.slice(4)))return;
      day[k]={v:cnt(e.v),was:cnt(e.was),note:str(e.note,300),by:str(e.by,60),at:Number.isFinite(+e.at)?Math.round(+e.at):0};
    });
    if(Object.keys(day).length)out.edits[iso]=day;
  });
  Object.entries(obj(o.notes)).slice(0,4000).forEach(([iso,t])=>{const s=str(t,600).trim();if(WA_ISO.test(iso)&&s)out.notes[iso]=s;});
  out.files=(Array.isArray(o.files)?o.files:[]).filter(f=>f&&typeof f==="object").slice(-40).map(f=>({
    kind:f.kind==="work"?"work":"att",name:str(f.name,160),at:Number.isFinite(+f.at)?Math.round(+f.at):0,by:str(f.by,60),
    from:WA_ISO.test(String(f.from||""))?f.from:"",to:WA_ISO.test(String(f.to||""))?f.to:"",days:Math.round(clamp(+f.days||0,0,100000)),rows:Math.round(clamp(+f.rows||0,0,10000000))}));
  const tg=cnt(o.target);out.target=tg&&tg>=1?tg:null;
  out.plan=cleanWaPlan(o.plan,gids);
  return out;
}
const WA_PLAN_FIELDS=["order","ean","ks","index","due","tech"];
const WA_PLAN_LABEL={order:"Číslo objednávky",ean:"EAN",ks:"Počet kusů",index:"Index",due:"Termín dokončení",tech:"Technologie"};
const WA_WEEK=/^\d{4}-W\d{2}$/;
function cleanWaPlan(o,gids){
  const obj=v=>(v&&typeof v==="object"&&!Array.isArray(v))?v:{};
  const str=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g,"").slice(0,max);
  const int=(v,max)=>Math.round(clamp(+v||0,0,max));
  o=obj(o);
  const out=blankWaPlan();
  const t=obj(o.tpl);
  if(Array.isArray(t.sheets)&&t.sheets.length){
    out.tpl={file:str(t.file,160),at:int(t.at,1e13),by:str(t.by,60),sheets:t.sheets.slice(0,2).map(sh=>{
      sh=obj(sh);const c=obj(sh.cols),h=obj(sh.heads),cols={},heads={};
      WA_PLAN_FIELDS.forEach(f=>{cols[f]=waLetter(c[f]);heads[f]=str(h[f],80);});
      return {name:str(sh.name,80),header:int(sh.header,500),cols,heads};
    })};
  }
  const tech=obj(o.tech);
  if(Array.isArray(tech.words))out.tech.words=[...new Set(tech.words.map(w=>String(w==null?"":w).toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12)).filter(Boolean))].slice(0,12);
  out.tech.mode=tech.mode==="contains"?"contains":"token";
  const cap=obj(o.cap);
  if("group" in cap)out.cap.group=gids.has(cap.group)?cap.group:"";
  else if(!gids.has(out.cap.group))out.cap.group="";
  const ps=+cap.perShift;if(Number.isFinite(ps)&&ps>0)out.cap.perShift=Math.round(clamp(ps,0.1,10000)*10)/10;
  out.chunks=(Array.isArray(o.chunks)?o.chunks:[]).filter(id=>/^[a-f0-9]{32}$/.test(String(id))).slice(0,60);
  Object.entries(obj(o.weeks)).slice(0,800).forEach(([w,v])=>{if(!WA_WEEK.test(w))return;v=obj(v);const ks=+v.ks;if(Number.isFinite(ks)&&ks>0)out.weeks[w]={ks:Math.round(clamp(ks,0,1e9)*100)/100,n:int(v.n,1e7)};});
  out.items=int(o.items,1e7);
  out.at=int(o.at,1e13);out.by=str(o.by,60);
  out.files=(Array.isArray(o.files)?o.files:[]).filter(f=>f&&typeof f==="object").slice(-40).map(f=>({name:str(f.name,160),at:int(f.at,1e13),by:str(f.by,60),
    rows:int(f.rows,1e8),matched:int(f.matched,1e8),dupes:int(f.dupes,1e8),added:int(f.added,1e8),moved:int(f.moved,1e8),items:int(f.items,1e8)}));
  return out;
}

/* ---------- čtení souborů ---------- */
/* Obsazenost: všechny listy, řádek s datem v sloupci data je den. Prázdné dny (bez čísel) se
   přeskočí; stejný den na víc listech: platí poslední vyplněný. */
function waParseAttendance(sheets,cols,groups){
  const c={...WA_COLS.att,...(cols||{})};
  const at=(row,letter)=>{const i=waIndex(letter);return i<0?null:toNum(row[i]);};
  const days={};let rows=0,skipped=0;
  (sheets||[]).forEach(sheet=>(sheet.aoa||[]).forEach(row=>{
    row=row||[];
    const dt=cellToDateTime(row[waIndex(c.date)]);
    if(!dt||dt.y<2000||dt.y>2100)return;
    const iso=dt.y+"-"+String(dt.m).padStart(2,"0")+"-"+String(dt.d).padStart(2,"0");
    const d={am:{plan:at(row,c.amPlan),total:at(row,c.amTotal),abs:at(row,c.amAbs)},pm:{plan:at(row,c.pmPlan),total:at(row,c.pmTotal)},g:{}};
    (groups||[]).forEach(g=>{const a=g.am?at(row,g.am):null,p=g.pm?at(row,g.pm):null;if(a!=null||p!=null)d.g[g.id]=[a,p];});
    const any=[d.am.plan,d.am.total,d.am.abs,d.pm.plan,d.pm.total].some(v=>v!=null)||Object.keys(d.g).length>0;
    if(!any){skipped++;return;}
    days[iso]=d;rows++;
  }));
  const isos=Object.keys(days).sort();
  return {days,rows,skipped,from:isos[0]||"",to:isos[isos.length-1]||""};
}
/* Výkaz práce: datum, operace, kusy. Kusy se sčítají po dnech a operacích. */
function waParseWork(sheets,cols){
  const c={...WA_COLS.work,...(cols||{})};
  const di=waIndex(c.date),oi=waIndex(c.op),ki=waIndex(c.ks);
  const byDay={},ops={};let rows=0,skipped=0;
  (sheets||[]).forEach(sheet=>(sheet.aoa||[]).forEach(row=>{
    row=row||[];
    const dt=cellToDateTime(row[di]);
    const op=row[oi]==null?"":String(row[oi]).replace(/\s+/g," ").trim().slice(0,160);
    const ks=toNum(row[ki]);
    if(!dt||dt.y<2000||dt.y>2100){if(op&&ks!=null)skipped++;return;}
    if(!op||ks==null){skipped++;return;}
    const iso=dt.y+"-"+String(dt.m).padStart(2,"0")+"-"+String(dt.d).padStart(2,"0");
    const day=byDay[iso]||(byDay[iso]={});
    day[op]=(day[op]||0)+ks;
    ops[op]=(ops[op]||0)+ks;
    rows++;
  }));
  const isos=Object.keys(byDay).sort();
  return {byDay,ops,rows,skipped,from:isos[0]||"",to:isos[isos.length-1]||""};
}
function waGuessGroup(name,groups){
  const n=norm(name);
  const hit=WA_GUESS.find(([id,re])=>re.test(n)&&groups.some(g=>g.id===id));
  return hit?hit[0]:"";
}
/* Nahrání: dny ze souboru nahradí uložené dny (úpravy zůstanou), ostatní dny se nemění.
   Nová operace přijde bez skupiny, takže se nezapočítá, dokud ji uživatel nepřiřadí. */
function waApplyAttendance(wa,parsed,meta){
  Object.entries(parsed.days).forEach(([iso,d])=>{wa.days[iso]=d;});
  wa.files.push({kind:"att",name:(meta&&meta.name)||"",at:(meta&&meta.at)||Date.now(),by:(meta&&meta.by)||"",from:parsed.from,to:parsed.to,days:Object.keys(parsed.days).length,rows:parsed.rows});
  wa.files=wa.files.slice(-40);
  return {days:Object.keys(parsed.days).length};
}
function waApplyWork(wa,parsed,meta){
  const byName=new Map(wa.ops.map(x=>[norm(x.name),x]));
  const added=[];
  Object.keys(parsed.ops).sort((a,b)=>a.localeCompare(b,"cs")).forEach(name=>{
    if(byName.has(norm(name)))return;
    wa.seq=(wa.seq||0)+1;
    const op={id:"o"+wa.seq,name,group:"",on:true};
    wa.ops.push(op);byName.set(norm(name),op);added.push(op);
  });
  Object.entries(parsed.byDay).forEach(([iso,day])=>{
    const out={};Object.entries(day).forEach(([name,ks])=>{const op=byName.get(norm(name));out[op.id]=Math.round(((out[op.id]||0)+ks)*100)/100;});
    wa.pcs[iso]=out;
  });
  wa.files.push({kind:"work",name:(meta&&meta.name)||"",at:(meta&&meta.at)||Date.now(),by:(meta&&meta.by)||"",from:parsed.from,to:parsed.to,days:Object.keys(parsed.byDay).length,rows:parsed.rows});
  wa.files=wa.files.slice(-40);
  return {days:Object.keys(parsed.byDay).length,added};
}

/* ---------- hodnoty dne (s úpravami) ---------- */
function waRaw(wa,iso,key){
  const d=wa.days[iso];
  if(key.startsWith("pcs.")){const p=wa.pcs[iso];return p&&p[key.slice(4)]!=null?p[key.slice(4)]:null;}
  if(!d)return null;
  const [a,b,c]=key.split(".");
  if(a==="am"||a==="pm")return d[a][b]??null;
  const g=d.g[b];return g?g[c==="am"?0:1]??null:null;
}
function waVal(wa,iso,key){const e=(wa.edits[iso]||{})[key];return e?e.v:waRaw(wa,iso,key);}
function waKeyLabel(wa,key){
  const [a,b,c]=key.split(".");
  const sh={am:"Ranní",pm:"Odpolední"};
  if(a==="pcs"){const op=wa.ops.find(x=>x.id===b);return "Kusy – "+(op?op.name:b);}
  if(a==="g"){const g=wa.groups.find(x=>x.id===b);return sh[c]+", "+(g?g.name:b);}
  return sh[a]+", "+{plan:a==="am"?"mělo dorazit":"požadavek",total:"celkem v práci",abs:"absence"}[b];
}
const waSum=list=>{const v=list.filter(x=>x!=null);return v.length?Math.round(v.reduce((s,x)=>s+x,0)*100)/100:null;};
/* Jeden den: obsazenost po směnách a skupinách, kusy po operacích a skupinách, kontrola součtů. */
function waDay(wa,iso){
  const [y,m,dd]=iso.split("-").map(Number);
  const day=mkDay(y,m,dd);
  const v=k=>waVal(wa,iso,k);
  const am={plan:v("am.plan"),total:v("am.total"),abs:v("am.abs")},pm={plan:v("pm.plan"),total:v("pm.total")};
  const g={};
  wa.groups.forEach(gr=>{const a=v("g."+gr.id+".am"),p=v("g."+gr.id+".pm");g[gr.id]={am:a,pm:p,sum:waSum([a,p])};});
  const pcs={};const groupPcs={};let pcsTotal=null,noGroup=null;
  wa.ops.forEach(op=>{
    const n=v("pcs."+op.id);if(n==null)return;pcs[op.id]=n;
    if(!op.on)return;
    if(!op.group){noGroup=(noGroup||0)+n;return;}   // bez skupiny se nezapočítá
    pcsTotal=(pcsTotal||0)+n;
    groupPcs[op.group]=(groupPcs[op.group]||0)+n;
  });
  const people=waSum([am.total,pm.total]);
  const plan=waSum([am.plan,pm.plan]);
  let prodPeople=null,unprodPeople=null,noIsPeople=null,prodPcs=null;
  wa.groups.forEach(gr=>{
    const n=g[gr.id].sum;
    if(gr.noIs){if(n!=null)noIsPeople=(noIsPeople||0)+n;return;}
    if(gr.unprod){if(n!=null)unprodPeople=(unprodPeople||0)+n;return;}
    if(n!=null)prodPeople=(prodPeople||0)+n;
    if(groupPcs[gr.id]!=null)prodPcs=(prodPcs||0)+groupPcs[gr.id];
  });
  const amSum=waSum(wa.groups.map(gr=>g[gr.id].am)),pmSum=waSum(wa.groups.map(gr=>g[gr.id].pm));
  const edits=wa.edits[iso]||{};
  return {iso,day,am,pm,g,pcs,groupPcs,pcsTotal,noGroup,people,plan,prodPeople,unprodPeople,noIsPeople,prodPcs,
    perProd:prodPcs!=null&&prodPeople?prodPcs/prodPeople:null,
    fill:people!=null&&plan?people/plan:null,
    check:{am:amSum!=null&&am.total!=null?Math.round((amSum-am.total)*100)/100:null,pm:pmSum!=null&&pm.total!=null?Math.round((pmSum-pm.total)*100)/100:null},
    hasAtt:!!wa.days[iso],hasWork:!!wa.pcs[iso],edited:Object.keys(edits),note:wa.notes[iso]||""};
}
/* Dny období: všechny dny s daty, všechny pracovní dny (i bez dat, ať je chybějící den vidět)
   a svátky ve všední den (ať je jasné, proč data chybí). Víkend bez dat se vynechá. */
function waDays(wa,from,to){
  const out=[];
  if(!WA_ISO.test(from)||!WA_ISO.test(to)||from>to)return out;
  for(let iso=from,i=0;iso<=to&&i<1200;iso=addDays(iso,1),i++){
    const has=wa.days[iso]||wa.pcs[iso]||wa.edits[iso]||wa.notes[iso];
    const [y,m,d]=iso.split("-").map(Number);
    const day=mkDay(y,m,d);
    if(!has&&!day.work&&!(day.hol&&!day.weekend))continue;
    out.push(waDay(wa,iso));
  }
  return out;
}
/* Souhrn za skupinu dnů (období, týden, měsíc). Osobosměna = jeden člověk na jedné směně. */
function waTotals(wa,days){
  const add=(a,b)=>b==null?a:(a||0)+b;
  const t={days:days.length,workDays:0,offDays:0,offWorked:0,missingAtt:0,missingWork:0,shifts:null,amShifts:null,pmShifts:null,plan:null,planned:null,
    abs:null,pcs:null,noGroup:null,prodShifts:null,prodPcs:null,unprodShifts:null,noIsShifts:null,edits:0,group:{}};
  wa.groups.forEach(g=>{t.group[g.id]={shifts:null,am:null,pm:null,pcs:null,work:null};});
  let fillPeople=0,fillPlan=0,workPeople=0,workWithAtt=0,workPlan=0,workWithPlan=0,reqSum=0;
  // Požadavek na pracovní den (2.18): pevný počet lidí z Nastavení, jinak plán ze souboru (mělo dorazit + požadavek).
  t.reqDays=0;t.metDays=0;t.balance=null;
  days.forEach(d=>{
    const req=d.day.work&&d.people!=null?waReq(wa,d):null;
    if(req){t.reqDays++;reqSum+=req;if(d.people>=req)t.metDays++;t.balance=Math.round(((t.balance||0)+d.people-req)*100)/100;}
    if(d.day.work)t.workDays++;else{t.offDays++;if(d.people)t.offWorked++;}
    if(d.day.work&&!d.hasAtt)t.missingAtt++;
    if(d.day.work&&!d.hasWork)t.missingWork++;
    t.shifts=add(t.shifts,d.people);t.amShifts=add(t.amShifts,d.am.total);t.pmShifts=add(t.pmShifts,d.pm.total);
    t.plan=add(t.plan,d.plan);t.abs=add(t.abs,d.am.abs);t.pcs=add(t.pcs,d.pcsTotal);t.noGroup=add(t.noGroup,d.noGroup);
    t.prodShifts=add(t.prodShifts,d.prodPeople);t.prodPcs=add(t.prodPcs,d.prodPcs);t.unprodShifts=add(t.unprodShifts,d.unprodPeople);t.noIsShifts=add(t.noIsShifts,d.noIsPeople);
    if(d.people!=null&&d.plan){fillPeople+=d.people;fillPlan+=d.plan;}
    if(d.day.work&&d.people!=null){workPeople+=d.people;workWithAtt++;if(d.plan){workPlan+=d.plan;workWithPlan++;}}
    t.edits+=d.edited.length;
    wa.groups.forEach(g=>{const x=t.group[g.id],y=d.g[g.id];x.shifts=add(x.shifts,y.sum);x.am=add(x.am,y.am);x.pm=add(x.pm,y.pm);x.pcs=add(x.pcs,d.groupPcs[g.id]);
      if(d.day.work&&d.people!=null)x.work=add(x.work,y.sum);});
  });
  t.fill=fillPlan?fillPeople/fillPlan:null;
  t.avgPeople=workWithAtt?workPeople/workWithAtt:null;
  t.avgPlan=workWithPlan?workPlan/workWithPlan:null;
  t.avgReq=t.reqDays?reqSum/t.reqDays:null;
  t.metShare=t.reqDays?t.metDays/t.reqDays:null;
  t.perShift=t.prodShifts&&t.prodPcs!=null?t.prodPcs/t.prodShifts:null;
  t.perDay=t.workDays&&t.pcs!=null?t.pcs/Math.max(1,days.filter(d=>d.hasWork).length):null;
  t.unprodShare=t.shifts&&t.unprodShifts!=null?t.unprodShifts/t.shifts:null;
  // skupina: průměr na pracovní den s obsazeností a podíl na lidech v práci (2.17.2)
  wa.groups.forEach(g=>{const x=t.group[g.id];x.per=!g.unprod&&!g.noIs&&x.shifts&&x.pcs!=null?x.pcs/x.shifts:null;
    x.avg=workWithAtt&&x.work!=null?x.work/workWithAtt:null;x.share=workPeople&&x.work!=null?x.work/workPeople:null;});
  return t;
}
/* Týdny (ISO, od pondělí) a měsíce období. */
function waWeeks(wa,days){
  const map=new Map();
  days.forEach(d=>{const w=isoWeek(d.iso);if(!map.has(w.id))map.set(w.id,{id:w.id,label:weekName(w.id),range:weekRange(w),days:[]});map.get(w.id).days.push(d);});
  return [...map.values()].map(w=>({...w,t:waTotals(wa,w.days)}));
}
function waMonths(wa,days){
  const map=new Map();
  days.forEach(d=>{const id=d.iso.slice(0,7);if(!map.has(id))map.set(id,{id,label:monthLabel(id),days:[]});map.get(id).days.push(d);});
  return [...map.values()].map(m=>({...m,t:waTotals(wa,m.days)}));
}
/* Rozsah dat: první a poslední den s obsazeností nebo kusy. */
function waSpan(wa){
  const isos=[...Object.keys(wa.days),...Object.keys(wa.pcs)].sort();
  return isos.length?{from:isos[0],to:isos[isos.length-1]}:null;
}
/* Úprava hodnoty: null = vrátit původní. Úprava stejná jako zdroj se neukládá. */
function waSetEdit(wa,iso,key,value,note,by,now){
  if(!WA_ISO.test(iso)||!WA_KEY.test(key))return false;
  const raw=waRaw(wa,iso,key);
  const day=wa.edits[iso]||(wa.edits[iso]={});
  if(value===undefined||value===raw){delete day[key];if(!Object.keys(day).length)delete wa.edits[iso];return true;}
  day[key]={v:value,was:raw,note:String(note||"").slice(0,300),by:String(by||"").slice(0,60),at:now||Date.now()};
  return true;
}
function waEditList(wa,from,to){
  const out=[];
  Object.entries(wa.edits).forEach(([iso,day])=>{
    if((from&&iso<from)||(to&&iso>to))return;
    Object.entries(day).forEach(([key,e])=>out.push({iso,key,label:waKeyLabel(wa,key),...e,now:waRaw(wa,iso,key)}));
  });
  return out.sort((a,b)=>a.iso.localeCompare(b.iso)||a.label.localeCompare(b.label,"cs"));
}

/* Kusy po operacích za dny období (jen operace, které v období mají kusy). */
function waOpTotals(wa,days){
  const map=new Map();
  days.forEach(d=>Object.entries(d.pcs).forEach(([id,n])=>map.set(id,(map.get(id)||0)+n)));
  return wa.ops.filter(op=>map.has(op.id)).map(op=>({...op,ks:Math.round(map.get(op.id)*100)/100})).sort((a,b)=>b.ks-a.ks||a.name.localeCompare(b.name,"cs"));
}
/* Co má auditor nebo vedoucí zkontrolovat: chybějící dny, nesedící součty, práce o víkendu
   a ve svátek, kusy bez skupiny a operace, které se nezapočítávají. */
function waIssues(wa,days){
  const ops=waOpTotals(wa,days);
  return {
    missingAtt:days.filter(d=>d.day.work&&!d.hasAtt).map(d=>d.iso),
    missingWork:days.filter(d=>d.day.work&&!d.hasWork).map(d=>d.iso),
    mismatch:days.flatMap(d=>["am","pm"].filter(k=>d.check[k]).map(k=>({iso:d.iso,shift:k,diff:d.check[k]}))),
    offWorked:days.filter(d=>!d.day.work&&(d.people||d.pcsTotal)).map(d=>({iso:d.iso,people:d.people,pcs:d.pcsTotal,hol:d.day.hol,weekend:d.day.weekend})),
    noGroup:ops.filter(op=>op.on&&!op.group),
    off:ops.filter(op=>!op.on)
  };
}
/* Typ dne pro tabulky a exporty. */
function waDayType(day){return day.hol?"svátek – "+day.hol:day.sat?"sobota":day.sun?"neděle":"pracovní den";}
const waR=(v,d=2)=>v==null?null:Math.round(v*10**d)/10**d;
/* Historický přehled po týdnech (2.18): posledních `weeks` týdnů do posledního dne s daty (0 = vše),
   od pondělí, ale ne před prvním dnem s daty. */
function waHistRange(wa,weeks){
  const span=waSpan(wa);
  if(!span)return null;
  // Celé týdny zpět od týdne posledních dat, ale ne před prvním dnem s daty: dny před ním by se jinak
  // počítaly jako pracovní dny bez obsazenosti. wFrom = pondělí prvního týdne (popisky týdnů).
  let from=weeks>0?addDays(isoWeek(span.to).from,-7*(weeks-1)):span.from;
  if(from<span.from)from=span.from;
  return {from,to:span.to,wFrom:isoWeek(from).from};
}
/* Vlastní období přehledu (2.19.1): od–do podle uživatele, oříznuté na dny s daty (dny mimo data
   by se počítaly jako pracovní dny bez obsazenosti). want = zadané období; empty = v něm nejsou data. */
function waCustomRange(wa,from,to){
  const span=waSpan(wa);
  if(!span)return null;
  if(!WA_ISO.test(String(from)))from=span.from;
  if(!WA_ISO.test(String(to)))to=span.to;
  if(from>to)[from,to]=[to,from];
  const want={from,to};
  const f=from<span.from?span.from:from,t=to>span.to?span.to:to;
  if(f>t)return {from,to,wFrom:isoWeek(from).from,want,empty:true};
  return {from:f,to:t,wFrom:isoWeek(f).from,want,clipped:f!==from||t!==to};
}
/* Požadavek lidí na pracovní den: pevný z Nastavení, jinak plán ze souboru. */
function waReq(wa,d){return wa.target||d.plan||null;}
/* Obsazenost proti požadavku (2.18): dny se splněným požadavkem, kumulovaná bilance (člověkodny)
   a výpadky: od dne, kdy bilance klesne pod nulu, do dne, kdy se znovu dorovná. Otevřený výpadek
   má návrh dorovnání: tolik lidí navíc, kolik průměrně chybělo, a na kolik pracovních dní. */
function waStaffing(wa,days){
  const rows=[];let cum=0,met=0;
  days.forEach(d=>{
    if(!d.day.work||d.people==null)return;
    const req=waReq(wa,d);if(!req)return;
    const diff=Math.round((d.people-req)*100)/100;
    cum=Math.round((cum+diff)*100)/100;
    if(d.people>=req)met++;
    rows.push({iso:d.iso,people:d.people,req,diff,cum,met:d.people>=req});
  });
  const episodes=[];let ep=null;
  rows.forEach(r=>{
    if(!ep&&r.cum<0)ep={from:r.iso,to:null,days:0,worst:r.cum,short:0,shortDays:0};
    if(ep){
      ep.days++;ep.worst=Math.min(ep.worst,r.cum);
      if(r.diff<0){ep.short+=-r.diff;ep.shortDays++;}
      if(r.cum>=0){ep.to=r.iso;episodes.push(ep);ep=null;}
    }
  });
  let open=null;
  if(ep){
    const avg=ep.shortDays?ep.short/ep.shortDays:0;
    const extra=Math.max(1,Math.ceil(avg-1e-9));
    const deficit=-cum;
    open={from:ep.from,days:ep.days,worst:ep.worst,deficit,avgShort:Math.round(avg*10)/10,extra,needDays:Math.ceil(deficit/extra-1e-9)};
    episodes.push(ep);
  }
  return {rows,n:rows.length,met,share:rows.length?met/rows.length:null,balance:cum,episodes:episodes.map(e=>({from:e.from,to:e.to,days:e.days,worst:e.worst})),open};
}
/* Čísla celku, nebo jedné skupiny (2.17.2): skupina nemá plán ani obsazenost, má podíl na lidech. */
function waFx(t,gid){
  if(gid){const g=t.group[gid]||{};return {workDays:t.workDays,avg:g.avg??null,plan:null,fill:null,shifts:g.shifts??null,planShifts:null,pcs:g.pcs??null,per:g.per??null,share:g.share??null,
    req:null,reqDays:0,metDays:0,metShare:null,balance:null};}
  return {workDays:t.workDays,avg:t.avgPeople,plan:t.avgPlan,fill:t.fill,shifts:t.shifts,planShifts:t.plan,pcs:t.pcs,per:t.perShift,share:null,
    req:t.avgReq,reqDays:t.reqDays,metDays:t.metDays,metShare:t.metShare,balance:t.balance};
}
function waGroupKind(g){return g.noIs?"mimo IS":g.unprod?"neproduktivní":"produktivní";}
const waPct=v=>v==null?null:Math.round(v*1000)/10;
/* Řádek souhrnu za týden: jen fakta pro auditora (2.18 bez osobosměn, se splněným požadavkem). */
const WA_FACT_HEAD=["Pracovní dny","Ø lidí v práci na pracovní den","Ø požadavek na pracovní den","Dny se splněným požadavkem","Podíl dní se splněným požadavkem %","Bilance proti požadavku (člověkodny)","Zpracované kusy","Kusy na osobosměnu"];
const WA_GFACT_HEAD=["Pracovní dny","Ø lidí v práci na pracovní den","Podíl na lidech v práci %","Zpracované kusy","Kusy na osobosměnu"];
function waFacts(t,gid){
  const f=waFx(t,gid);
  return gid?[f.workDays,waR(f.avg,1),waPct(f.share),f.pcs,waR(f.per,1)]
    :[f.workDays,waR(f.avg,1),waR(f.req,1),f.reqDays?f.metDays:null,waPct(f.metShare),f.balance,f.pcs,waR(f.per,1)];
}
/* Listy Excelu pro auditora (2.18): souhrn, skupiny, výpadky a týdny (bez měsíců, dnů a interních
   podkladů). S vybranou skupinou jen čísla té skupiny. */
function waSheets(wa,r,gid){
  const g=gid?wa.groups.find(x=>x.id===gid):null;
  if(!g)gid="";
  const head=gid?WA_GFACT_HEAD:WA_FACT_HEAD;
  const days=waDays(wa,r.from,r.to);
  const t=waTotals(wa,days);
  const weeks=waWeeks(wa,days);
  const f=waFacts(t,gid);
  const st=gid?null:waStaffing(wa,days);
  const sum=[["Lidé v práci a zpracované kusy"+(g?" – "+g.name:"")],["Období",dayText(r.from)+" – "+dayText(r.to)],...(g?[["Skupina",g.name+" ("+waGroupKind(g)+")"]]:[]),
    ...(gid?[]:[["Požadavek lidí na pracovní den",wa.target?"pevně "+wa.target:"podle plánu v souboru (mělo dorazit + požadavek)"]]),[],
    ...head.map((h,i)=>[h,f[i]]),[],
    ["Člověkoden = jeden člověk v práci jeden den. Bilance = lidé v práci minus požadavek; záporná = chybějící lidé, které je potřeba dorovnat. Kusy jen z operací přiřazených ke skupinám; kusy na osobosměnu jen u produktivních skupin."]];
  const out=[{name:"Souhrn",cols:[44,16],rows:sum}];
  if(!gid){
    const gh=["Skupina","Zařazení","Ø lidí v práci na pracovní den","Podíl na lidech v práci %","Zpracované kusy","Kusy na osobosměnu"];
    out.push({name:"Skupiny",cols:[36,14,14,14,14,14],rows:[gh,...wa.groups.map(x=>{const v=waFx(t,x.id);return [x.name,waGroupKind(x),waR(v.avg,1),waPct(v.share),v.pcs,waR(v.per,1)];})]});
    if(st.episodes.length)out.push({name:"Výpadky",cols:[12,12,22,24],rows:[["Od","Dorovnáno","Pracovních dní do dorovnání","Největší ztráta (člověkodny)"],
      ...st.episodes.map(e=>[e.from,e.to||"zatím ne",e.days,e.worst])]});
  }
  let cum=0;
  out.push({name:"Týdny",cols:[10,11,11,...head.map(()=>14),...(gid?[]:[14])],rows:[["Týden","Od","Do",...head,...(gid?[]:["Kumulovaná bilance (člověkodny)"])],...weeks.map(w=>{
    const wk=weekById(w.id);const row=[w.label,wk.from<r.from?r.from:wk.from,wk.to>r.to?r.to:wk.to,...waFacts(w.t,gid)];
    if(!gid){cum=Math.round((cum+(w.t.balance||0))*100)/100;row.push(w.t.reqDays?cum:null);}
    return row;})]});
  return out;
}

/* ---------- výrobní plán (2.18) ---------- */
/* Odhad sloupce podle nadpisu (jen předvyplnění ve vzoru). */
const WA_PLAN_GUESS={order:/objedn|zakazk|order/,ean:/(^|[^a-z])ean([^a-z]|$)|carov|barcode/,ks:/pocet|mnozstv|(^|[^a-z])ks([^a-z]|$)|kusu|qty|quantit/,
  index:/index|cislo dilu|artikl|material/,due:/termin|dokonc|due|deadline|datum dod/,tech:/technolog|postup|(^|[^a-z])tech([^a-z]|$)/};
function waPlanGuess(headers){
  const out={},used=new Set();
  WA_PLAN_FIELDS.forEach(f=>{
    const i=headers.findIndex((h,j)=>!used.has(j)&&WA_PLAN_GUESS[f].test(norm(h)));
    if(i>=0){out[f]=i;used.add(i);}
  });
  return out;
}
/* Řádek s nadpisy: v prvních 40 řádcích ten s nejvíc textovými buňkami. */
function waPlanHeaderRow(rows){
  let best=0,score=-1;
  rows.slice(0,40).forEach((r,i)=>{const n=(r||[]).filter(v=>typeof v==="string"&&v.trim()&&!/^\d+([.,]\d+)?$/.test(v.trim())).length;if(n>score){score=n;best=i;}});
  return best;
}
/* Sloupce listu podle vzoru: nadpisy hledá nejdřív na řádku ze vzoru (plán je má na 2. řádku),
   pak v prvních 60 řádcích (soubor se mohl posunout). Sloupec podle názvu; když je stejný název
   víckrát, má přednost sloupec se stejným písmenem jako ve vzoru. Nenalezené pole se čte podle
   písmene ze vzoru a je v `missing`. Vrací {header, idx: {pole: index sloupce}, found, missing}. */
function waPlanCols(rows,sh){
  const fields=WA_PLAN_FIELDS.filter(f=>sh.cols[f]);
  const want=fields.filter(f=>sh.heads[f]).map(f=>[f,norm(sh.heads[f]),waIndex(sh.cols[f])]);
  if(want.length){
    const n=Math.min(rows.length,60);
    const order=[sh.header,...Array.from({length:n},(_,i)=>i).filter(i=>i!==sh.header)].filter(i=>i<rows.length);
    for(const i of order){
      const r=Array.from(rows[i]||[],v=>norm(v==null?"":v));
      const idx={};want.forEach(([f,h,c])=>{const j=r[c]===h?c:r.indexOf(h);if(j>=0)idx[f]=j;});
      if(Object.keys(idx).length>=Math.min(3,want.length)){
        const missing=fields.filter(f=>!(f in idx));
        missing.forEach(f=>{idx[f]=waIndex(sh.cols[f]);});
        return {header:i,idx,found:true,missing};
      }
    }
  }
  const idx={};fields.forEach(f=>{idx[f]=waIndex(sh.cols[f]);});
  return {header:sh.header,idx,found:false,missing:[]};
}
/* Technologie: „G2“ nebo „G“ jako samostatné označení (G2/B, G + K), nebo kdekoli v textu. */
function waPlanMatch(tech,cfg){
  if(!cfg||!cfg.words||!cfg.words.length)return true;
  const t=String(tech==null?"":tech).toUpperCase();
  if(cfg.mode==="contains")return cfg.words.some(w=>t.includes(w));
  const toks=t.split(/[^A-Z0-9]+/);
  return cfg.words.some(w=>toks.includes(w));
}
function waPlanPart(v){
  if(v==null)return "";
  if(typeof v==="number")return Number.isFinite(v)?String(Number.isInteger(v)?v:+v.toFixed(6)):"";
  return String(v).trim().replace(/\s+/g," ").toUpperCase().replace(/^(\d+)\.0+$/,"$1");
}
/* Sloučení řádků plánu do položek: klíč = objednávka + index + EAN. Duplicita (v souboru i proti
   dřívějším plánům) si nechá verzi s nejpozdějším termínem; při stejném termínu platí novější.
   rows: [objednávka, EAN, ks, index, termín, technologie] (surové buňky); sedmá hodnota 1 = list bez
   sloupce technologie, řádek se bere bez filtru. map: klíč → [ISO, ks]. */
function waPlanMerge(map,rows,cfg){
  const st={rows:0,bad:0,notTech:0,matched:0,dupes:0,added:0,moved:0,older:0,same:0};
  const seen=new Set(),techs=new Map();
  rows.forEach(r=>{
    st.rows++;
    const tech=r[5]==null?"":String(r[5]).trim();
    const ok=r[6]===1||waPlanMatch(tech,cfg);
    const tc=techs.get(tech);if(tc)tc[0]++;else if(techs.size<2000)techs.set(tech,[1,ok]);
    if(!ok){st.notTech++;return;}
    const ks=toNum(r[2]),dt=cellToDateTime(r[4]);
    const key=[r[0],r[3],r[1]].map(waPlanPart).join("|");
    if(ks==null||ks<=0||!dt||dt.y<2000||dt.y>2100||key==="||"){st.bad++;return;}
    st.matched++;
    const iso=dt.y+"-"+String(dt.m).padStart(2,"0")+"-"+String(dt.d).padStart(2,"0");
    if(seen.has(key))st.dupes++;else seen.add(key);
    const old=map.get(key);
    if(!old){map.set(key,[iso,ks]);st.added++;return;}
    if(iso>old[0]){map.set(key,[iso,ks]);st.moved++;}
    else if(iso===old[0]){map.set(key,[iso,ks]);st.same++;}
    else st.older++;
  });
  st.items=map.size;
  // nejčastější hodnoty technologie, ať je vidět, co filtr bere
  st.techs=[...techs.entries()].sort((a,b)=>b[1][0]-a[1][0]).slice(0,12).map(([t,[n,ok]])=>({tech:t,n,ok}));
  return st;
}
/* Fronta souborů do uloženého plánu (2.18.2): stejné pravidlo jako waPlanMerge (pozdější termín
   vyhrává, při stejném termínu platí fronta). Statistika je proti uloženému plánu. */
function waPlanMergeMap(map,src){
  const st={added:0,moved:0,older:0,same:0};
  src.forEach((v,k)=>{
    const o=map.get(k);
    if(!o){map.set(k,v);st.added++;}
    else if(v[0]>o[0]){map.set(k,v);st.moved++;}
    else if(v[0]===o[0]){map.set(k,v);st.same++;}
    else st.older++;
  });
  st.items=map.size;
  return st;
}
/* Uložení položek: sloupcově (klíče, dny od 1. 1. 1970, kusy), ať se dobře komprimuje. */
function waPlanEncode(map){
  const k=[],d=[],q=[];
  map.forEach((v,key)=>{k.push(key);d.push(Math.round(utcOf(v[0])/DAY_MS));q.push(v[1]);});
  return {v:1,k,d,q};
}
function waPlanDecode(o){
  const map=new Map();
  if(!o||o.v!==1||!Array.isArray(o.k)||!Array.isArray(o.d)||!Array.isArray(o.q))return map;
  for(let i=0;i<o.k.length;i++){
    const key=o.k[i],day=o.d[i],ks=o.q[i];
    if(typeof key!=="string"||!Number.isFinite(day)||!Number.isFinite(ks)||ks<=0)continue;
    map.set(key,[isoOf(day*DAY_MS),ks]);
  }
  return map;
}
/* Součty po týdnech termínu (do stavu). */
function waPlanWeeks(map){
  const out={};
  map.forEach(([iso,ks])=>{const w=isoWeek(iso).id;const x=out[w]||(out[w]={ks:0,n:0});x.ks=Math.round((x.ks+ks)*100)/100;x.n++;});
  return out;
}
/* Kapacita brusičů po týdnech: skutečná (směny skupiny podle obsazenosti × ks na směnu), pracovní
   dny bez obsazenosti doplní odhad z průměru posledních 20 pracovních dnů s obsazeností (est = počet
   odhadnutých dnů; actual = celý týden podle obsazenosti). Skluz = kusy, které se v týdnu nestihnou
   a přejdou do dalšího (nevyužitá kapacita se nepřenáší, skluz neklesne pod 0). */
function waPlanCapacity(wa,weekIds){
  const p=wa.plan,grp=p.cap.group,per=p.cap.perShift||25;
  const recent=Object.keys(wa.days).sort().reverse().filter(iso=>{const [y,m,d]=iso.split("-").map(Number);return mkDay(y,m,d).work;}).slice(0,20);
  const val=(iso,k)=>waVal(wa,iso,"g."+grp+"."+k);
  const avgGr=grp&&recent.length?recent.reduce((a,iso)=>a+(val(iso,"am")||0)+(val(iso,"pm")||0),0)/recent.length:null;
  let cum=0;
  return weekIds.map(id=>{
    const w=weekById(id);const plan=(p.weeks[id]||{}).ks||0,n=(p.weeks[id]||{}).n||0;
    let workDays=0,shifts=0,att=0,est=0;
    for(let i=0;i<7;i++){
      const iso=addDays(w.from,i);const [y,m,d]=iso.split("-").map(Number);
      const work=mkDay(y,m,d).work;
      if(work)workDays++;
      if(!grp)continue;
      if(wa.days[iso]){att++;shifts+=(val(iso,"am")||0)+(val(iso,"pm")||0);}
      else if(work&&avgGr!=null){est++;shifts+=avgGr;}
    }
    const known=att+est>0;
    const cap=grp&&known?Math.round(shifts*per*10)/10:null;
    if(cap!=null)cum=Math.max(0,Math.round((cum+plan-cap)*10)/10);
    return {id,label:weekName(id),range:weekRange(w),plan,n,workDays,cap,actual:att>0&&!est,est,grinders:known?Math.round(shifts/(att+est)*100)/100:null,
      need:workDays&&per?plan/per/workDays:null,diff:cap==null?null:Math.round((cap-plan)*10)/10,cum:cap==null?null:cum};
  });
}
function waPlanFileIds(st){return ((((st||S).workAudit||{}).plan||{}).chunks||[]).slice();}

/* ---------- historie změn ---------- */
function waChanges(A,B,add){
  A=A||blankWorkAudit();B=B||blankWorkAudit();
  const ga=new Map(A.groups.map(g=>[g.id,g])),opa=new Map(A.ops.map(x=>[x.id,x]));
  const gname=(st,id)=>{const g=st.groups.find(x=>x.id===id);return g?g.name:"—";};
  B.groups.forEach(g=>{
    const o=ga.get(g.id);
    if(!o){add("workaudit","Audit: nová skupina „"+g.name+"“",{m:"wag:"+g.id});return;}
    if(o.name!==g.name)add("workaudit","",{m:"wan:"+g.id,p:"Audit – skupina přejmenována: ",v0:"„"+o.name+"“",v1:"„"+g.name+"“"});
    if(o.unprod!==g.unprod)add("workaudit","",{m:"wau:"+g.id,p:"Audit – "+g.name+", neproduktivní pozice: ",v0:o.unprod?"ano":"ne",v1:g.unprod?"ano":"ne"});
    if(o.noIs!==g.noIs)add("workaudit","",{m:"wai:"+g.id,p:"Audit – "+g.name+", projekt není evidován v IS: ",v0:o.noIs?"ano":"ne",v1:g.noIs?"ano":"ne"});
    if(o.am!==g.am||o.pm!==g.pm)add("workaudit","",{m:"wac:"+g.id,p:"Audit – "+g.name+", sloupce ranní/odpolední: ",v0:(o.am||"—")+"/"+(o.pm||"—"),v1:(g.am||"—")+"/"+(g.pm||"—")});
  });
  A.groups.forEach(g=>{if(!B.groups.some(x=>x.id===g.id))add("workaudit","Audit: smazána skupina „"+g.name+"“",{m:"wag:"+g.id});});
  B.ops.forEach(x=>{
    const o=opa.get(x.id);if(!o)return;   // nové operace přicházejí s importem
    if(o.group!==x.group)add("workaudit","",{m:"wao:"+x.id,p:"Audit – operace „"+x.name+"“, skupina: ",v0:o.group?gname(A,o.group):"bez skupiny",v1:x.group?gname(B,x.group):"bez skupiny"});
    if(o.on!==x.on)add("workaudit","",{m:"waon:"+x.id,p:"Audit – operace „"+x.name+"“: ",v0:o.on?"započítává se":"nezapočítává se",v1:x.on?"započítává se":"nezapočítává se"});
  });
  if(JSON.stringify(A.cols)!==JSON.stringify(B.cols))add("workaudit","Audit: změněny sloupce souborů",{m:"wacols"});
  if((A.target||null)!==(B.target||null))add("workaudit","",{m:"watarget",p:"Audit – požadavek lidí na pracovní den: ",v0:A.target?String(A.target):"podle plánu v souboru",v1:B.target?String(B.target):"podle plánu v souboru"});
  const pa=A.plan||blankWaPlan(),pb=B.plan||blankWaPlan();
  const techText=p=>p.tech.words.join(", ")+(p.tech.mode==="contains"?" (kdekoli v textu)":"");
  if(techText(pa)!==techText(pb))add("workaudit","",{m:"waptech",p:"Audit – výrobní plán, technologie: ",v0:techText(pa)||"vše",v1:techText(pb)||"vše"});
  if(pa.cap.group!==pb.cap.group)add("workaudit","",{m:"wapgrp",p:"Audit – výrobní plán, kapacita skupiny: ",v0:pa.cap.group?gname(A,pa.cap.group):"žádná",v1:pb.cap.group?gname(B,pb.cap.group):"žádná"});
  if(pa.cap.perShift!==pb.cap.perShift)add("workaudit","",{m:"wapper",p:"Audit – výrobní plán, kusů na směnu: ",v0:nf(pa.cap.perShift,1),v1:nf(pb.cap.perShift,1)});
  if(JSON.stringify(pa.tpl)!==JSON.stringify(pb.tpl))add("workaudit",pb.tpl?"Audit: vzor výrobního plánu podle souboru "+(pb.tpl.file||"—"):"Audit: vzor výrobního plánu smazán",{m:"waptpl"});
  const isos=new Set([...Object.keys(A.edits),...Object.keys(B.edits)]);
  const fmt=v=>v==null?"prázdné":nf(v,2);
  [...isos].sort().forEach(iso=>{
    const ea=A.edits[iso]||{},eb=B.edits[iso]||{};
    new Set([...Object.keys(ea),...Object.keys(eb)]).forEach(k=>{
      const x=ea[k],y=eb[k];
      if(y&&(!x||x.v!==y.v||x.note!==y.note))add("workaudit","Audit "+dayText(iso)+" – "+waKeyLabel(B,k)+": "+fmt(y.was)+" → "+fmt(y.v)+(y.note?" ("+y.note+")":""),{m:"wae:"+iso+":"+k});
      else if(x&&!y)add("workaudit","Audit "+dayText(iso)+" – "+waKeyLabel(A,k)+": úprava zrušena, platí "+fmt(waRaw(B,iso,k)),{m:"wae:"+iso+":"+k});
    });
  });
  new Set([...Object.keys(A.notes),...Object.keys(B.notes)]).forEach(iso=>{
    if((A.notes[iso]||"")!==(B.notes[iso]||""))add("workaudit","Audit "+dayText(iso)+": "+(B.notes[iso]?"poznámka ke dni „"+B.notes[iso].slice(0,80)+"“":"poznámka smazána"),{m:"wanote:"+iso});
  });
}

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
        fault:str(i.fault,600),back:back&&back>=x.date?back:"",backNote:str(i.backNote,300)};
    }),
    /* digitální podpis předávajícího (2.26): obrázek je šifrovaný soubor (Vault), tady jen id, jméno a kdy */
    ...(svSignClean(x.sign)?{sign:svSignClean(x.sign)}:{})}));
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
function svSignClean(x){
  if(!x||typeof x!=="object"||!SV_FILE_ID.test(String(x.file||"")))return null;
  const name=String(x.name==null?"":x.name).replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,80);
  return name?{file:String(x.file),name,at:Number.isFinite(+x.at)?Math.max(0,+x.at):0,by:String(x.by==null?"":x.by).slice(0,60)}:null;
}
/* Soubory Servisu (podpisy) do zálohy. */
function svFileIds(st){return [...new Set((((st||S).service||{}).shipments||[]).map(x=>x.sign&&x.sign.file).filter(Boolean))];}
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
  const done=list.filter(h=>h.item.back&&h.item.purpose!=="scrap");
  const days=done.map(h=>daysBetween(h.ship.date,h.item.back));
  const gaps=list.slice(1).map((h,i)=>daysBetween(list[i].ship.date,h.ship.date));
  const last=list[list.length-1]||null;
  // odesláno k vyřazení = zařízení je vyřazené (na servisu se nepočítá, pokud se nevrátilo)
  const retired=last&&last.item.purpose==="scrap"&&!last.item.back?last.ship.date:"";
  const out=!!(last&&!last.item.back&&!retired);
  return {list,count:list.length,first:list[0]?list[0].ship.date:"",last:last?last.ship.date:"",
    out,outDays:out?daysBetween(last.ship.date,today):0,retired,
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
    const sa=o.sign||null,sb=x.sign||null;
    if((sa&&sa.file)!==(sb&&sb.file))add("service",sb?head+": podepsal předávající "+sb.name+(sa?" (nový podpis)":""):head+": odebrán podpis předávajícího ("+sa.name+")",{m:"svsign:"+x.id});
    x.items.forEach(i=>{
      const p=o.items.find(y=>y.dev===i.dev);
      if(!p||p.back===i.back&&p.backNote===i.backNote)return;
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
const SH_MAX_LISTS=30,SH_MAX_ITEMS=1000,SH_MAX_SUBS=50;
function blankShortage(){return {lists:[]};}
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
  return {ts:n(r.ts),when:line(r.when,40),qty:line(r.qty,40),state:line(r.state,400),at:n(r.at),by:line(r.by,60)};
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
function shRecBuild(rows){
  const t=(r,c)=>String((r&&r[c]&&r[c].text)!=null?r[c].text:"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  const n=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const recs=new Map();let count=0,bad=0;
  (Array.isArray(rows)?rows:[]).forEach(r=>{
    const raw=t(r,0),when=t(r,1),qty=t(r,2),state=t(r,3);
    if(!raw&&!when&&!qty&&!state)return;
    const ts=shParseWhen(when),code=shCodeClean(raw);
    if(!ts&&(/^(qr|kod|code|barcode)/.test(n(raw))||/datum|cas/.test(n(when))&&/stav/.test(n(state))))return;   // nadpisy
    if(!code){bad++;return;}
    count++;
    const prev=recs.get(code);
    if(!prev||ts>=prev.ts)recs.set(code,{ts,when:ts?shWhenText(ts):when.slice(0,40),qty:qty.slice(0,40),state:state.slice(0,400)});
  });
  return {recs,rows:count,bad};
}
/**
 * Přiřadí poslední záznamy k položkám seznamu podle kódu. Novější nebo stejně starý záznam
 * nahradí uložený, starší ne. Vrací {matched, updated, same, older, missing: [kódy, které v seznamu nejsou]}.
 */
function shApplyRecs(list,recs,meta){
  const by=new Map();
  // položky i jejich poddíly (2.29)
  list.items.forEach(it=>[it,...(it.subs||[])].forEach(i=>{if(i.code){if(!by.has(i.code))by.set(i.code,[]);by.get(i.code).push(i);}}));
  const out={matched:0,updated:0,same:0,older:0,missing:[]};
  recs.forEach((r,code)=>{
    const items=by.get(code);
    if(!items){out.missing.push(code);return;}
    out.matched++;
    items.forEach(i=>{
      const p=i.rec;
      if(p&&p.ts===r.ts&&p.qty===r.qty&&p.state===r.state&&p.when===r.when){out.same++;return;}
      if(p&&p.ts&&r.ts&&r.ts<p.ts){out.older++;return;}
      i.rec={...r,at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60)};
      out.updated++;
    });
  });
  return out;
}
/** Přesune položku na index `to` (výsledné místo). TOP SHORTAGE zůstanou nahoře: položka se hýbe jen ve své skupině. */
function shMoveItem(list,id,to){
  const from=list.items.findIndex(i=>i.id===id);
  if(from<0)return false;
  const it=list.items[from],tops=list.items.filter(i=>i.top).length;
  const lo=it.top?0:tops,hi=it.top?tops-1:list.items.length-1;
  to=Math.max(lo,Math.min(hi,Math.round(+to||0)));
  if(to===from)return false;
  list.items.splice(from,1);
  list.items.splice(to,0,it);
  return true;
}
/** Položky TOP SHORTAGE první, jinak pořadí ze souboru. */
function shTopFirst(items){return items.filter(i=>i.top).concat(items.filter(i=>!i.top));}
function cleanShortage(o){
  o=o&&typeof o==="object"?o:{};
  const line=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().slice(0,max);
  const num=v=>Number.isFinite(+v)?Math.max(0,+v):0;
  const seen=new Set(),uniq=(v,p)=>{let x=typeof v==="string"&&SAFE_ID.test(v)?v:uid(p);while(seen.has(x))x=uid(p);seen.add(x);return x;};
  // poddíl z výrobního plánu (2.29): EAN a odkaz poddílu, kód do QR, operace, poznámka, poslední záznam
  const sub=s=>({id:"",ean:line(s.ean,60),link:shLink(s.link),code:"code" in s?shCodeClean(s.code):shCode(s.link),op:line(s.op,300),note:line(s.note,300),rec:shRecClean(s.rec,line),_id:s.id});
  const lists=(Array.isArray(o.lists)?o.lists:[]).filter(l=>l&&typeof l==="object"&&Array.isArray(l.items)).map(l=>({
    id:uniq(l.id,"sh"),at:num(l.at),by:line(l.by,60),file:line(l.file,160),sheet:line(l.sheet,80),
    plan:l.plan&&typeof l.plan==="object"?{file:line(l.plan.file,160),at:num(l.plan.at),by:line(l.plan.by,60)}:null,
    // seznam ze 2.27 nemá top, op ani code: kód se dopočítá z odkazu; seznam ze 2.27.1 nemá id, note ani rec; ze 2.28 nemá subs
    items:shTopFirst(l.items.filter(i=>i&&typeof i==="object").map(i=>({id:"",order:line(i.order,80),name:line(i.name,200),ean:line(i.ean,60),
      index:line(i.index,40),qty:line(i.qty,40),top:i.top===true,op:line(i.op,300),link:shLink(i.link),
      code:"code" in i?shCodeClean(i.code):shCode(i.link),note:line(i.note,300),rec:shRecClean(i.rec,line),
      subs:(Array.isArray(i.subs)?i.subs:[]).filter(s=>s&&typeof s==="object").map(sub).filter(s=>s.ean||s.code).slice(0,SH_MAX_SUBS),_id:i.id})).filter(i=>i.ean||i.name)).slice(0,SH_MAX_ITEMS),
  }));
  lists.forEach(l=>{
    // id položek i poddílů jsou jedinečné v celém seznamu
    const ids=new Set(),give=(x,p)=>{let v=typeof x._id==="string"&&SAFE_ID.test(x._id)&&!ids.has(x._id)?x._id:uid(p);while(ids.has(v))v=uid(p);ids.add(v);x.id=v;delete x._id;};
    l.items.forEach(i=>give(i,"si"));
    l.items.forEach(i=>i.subs.forEach(s=>give(s,"sp")));
  });
  // nejnovější první; nad SH_MAX_LISTS se nejstarší zahodí
  lists.sort((a,b)=>b.at-a.at);
  return {lists:lists.slice(0,SH_MAX_LISTS)};
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
function shBuild(rows){
  rows=Array.isArray(rows)?rows:[];
  const t=(r,c)=>String((r&&r[c]&&r[c].text)!=null?r[c].text:"").replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  let header=-1;
  for(let i=0;i<Math.min(rows.length,15);i++)if(shIsHeader([0,1,2,3,4].map(c=>t(rows[i],c)))){header=i;break;}
  const items=[],warn={noLink:0,noCode:0,noEan:0,skipped:0};
  rows.forEach((r,ri)=>{
    if(ri<=header)return;
    const order=t(r,0),name=t(r,1),ean=t(r,2),index=t(r,3),qty=t(r,4),op=t(r,7);
    if(!order&&!name&&!ean&&!index&&!qty&&!op)return;
    if(!ean&&!name){warn.skipped++;return;}
    const cell=c=>String((r&&r[c]&&r[c].link)||"").trim();
    const raw=cell(2)||[0,1,3,4,5,6,7].map(cell).find(Boolean)||"",code=shCode(raw);
    if(!raw)warn.noLink++;else if(!code)warn.noCode++;
    if(!ean)warn.noEan++;
    items.push({order,name,ean,index,qty,top:/^top\b/i.test(t(r,6)),op,link:shLink(raw),code});
  });
  const all=shTopFirst(items);
  return {items:all.slice(0,SH_MAX_ITEMS),more:Math.max(0,all.length-SH_MAX_ITEMS),header,top:items.filter(i=>i.top).length,warn};
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
   EANem, indexem i číslem objednávky a vloží se jen s operací ze SH_SUB_OPS. */
const SH_SUB_OPS=["Broušení – hala 2","Brush Hala 2","Frézování Hala 2","Frézování VF-11","gravírování Hala 2","řez kotoučovou pilou 2","Odjehlení hala 2","Label Hala 2","Lepení 3M-Hala 2","Pískování – hala 2","Leštění – hala 2"];
/** Operace bez diakritiky, malými, pomlčky jako mezery („Broušení – hala 2“ = „brouseni hala 2“). */
function shOpNorm(s){return String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[‐-―−_\-]+/g," ").replace(/\s+/g," ").trim();}
const SH_SUB_OPSET=new Set(SH_SUB_OPS.map(shOpNorm));
function shSubOp(op){return SH_SUB_OPSET.has(shOpNorm(op));}
/** Část klíče sestavy: bez mezer, velkými, číslo bez nul na začátku (EAN z plánu bývá číslo). */
function shPlanKeyPart(v){let s=String(v==null?"":v).replace(/\s+/g,"").toUpperCase();if(/^\d+$/.test(s))s=s.replace(/^0+(?=\d)/,"");return s;}
function shPlanKey(ean,index,order){return shPlanKeyPart(ean)+"|"+shPlanKeyPart(index)+"|"+shPlanKeyPart(order);}
/** Prázdný přehled plánu: rows = klíč sestavy → [{ean, link, code, op}] (jen operace Hala 2), other = klíč → počet řádků s jinou operací. */
function shPlanBlank(file){return {file:String(file||"").slice(0,160),at:Date.now(),sheet:"",total:0,rows:new Map(),other:new Map()};}
/** Jeden řádek plánu (a EAN sestavy, e EAN poddílu, h index, m objednávka, op operace, link cíl odkazu u E). */
function shPlanRow(plan,a,e,h,m,op,link){
  if(!shPlanKeyPart(a)||!String(e==null?"":e).trim())return;
  const k=shPlanKey(a,h,m);
  if(!shSubOp(op)){plan.other.set(k,(plan.other.get(k)||0)+1);return;}
  if(!plan.rows.has(k))plan.rows.set(k,[]);
  const t=String(link||"").trim();
  plan.rows.get(k).push({ean:String(e).replace(/\s+/g," ").trim().slice(0,60),link:shLink(t),code:shCode(t),op:String(op).replace(/\s+/g," ").trim().slice(0,120)});
}
/**
 * Poddíly z plánu k položkám seznamu. U položky se poddíly nahradí podle plánu; poddíl, který
 * v plánu zůstal, si nechá id, poznámku i poslední záznam. Víc operací téhož poddílu se spojí.
 * Vrací {items (sestav s poddíly), subs, noCode, other (sestav jen s jinou operací), changed}.
 */
function shApplyPlan(list,plan){
  const out={items:0,subs:0,noCode:0,other:0,changed:0};
  list.items.forEach(it=>{
    const k=shPlanKey(it.ean,it.index,it.order),rows=plan.rows.get(k)||[];
    if(!rows.length&&plan.other.get(k))out.other++;
    const by=new Map(),self=shPlanKeyPart(it.ean);
    rows.forEach(r=>{
      if(shPlanKeyPart(r.ean)===self)return;   // sestava sama sebe není poddíl
      const key=shPlanKeyPart(r.ean)+"|"+r.code,x=by.get(key);
      if(x){if(r.op&&!x.ops.includes(r.op))x.ops.push(r.op);if(!x.link&&r.link)x.link=r.link;}
      else by.set(key,{ean:r.ean,link:r.link,code:r.code,ops:r.op?[r.op]:[]});
    });
    const old=new Map((it.subs||[]).map(s=>[shPlanKeyPart(s.ean)+"|"+s.code,s]));
    const subs=[...by.entries()].slice(0,SH_MAX_SUBS).map(([key,x])=>{const p=old.get(key);return {id:p?p.id:"",ean:x.ean,link:x.link,code:x.code,op:x.ops.join(" · "),note:p?p.note:"",rec:p?p.rec:null};});
    const sig=a=>JSON.stringify((a||[]).map(s=>[s.ean,s.code,s.op]));
    if(sig(subs)!==sig(it.subs))out.changed++;
    it.subs=subs;
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
/** „22. 10. 2026 8:15“ ze časové značky seznamu. */
function shWhen(l){return shWhenText(l.at||0);}
function shItemsN(n){return n===1?"položka":n>=2&&n<=4?"položky":"položek";}
function shChanges(A,B,add){
  A=A||blankShortage();B=B||blankShortage();
  const ia=new Set(A.lists.map(l=>l.id)),ib=new Set(B.lists.map(l=>l.id));
  const what=l=>{const n=l.items.length,top=l.items.filter(i=>i.top).length;return " ("+n+" "+shItemsN(n)+(top?", z toho "+top+" TOP":"")+(l.file?", "+l.file:"")+")";};
  B.lists.forEach(l=>{if(!ia.has(l.id))add("shortage","Shortage: nahrán seznam "+shWhen(l)+what(l),{m:"shl:"+l.id});});
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
    l.items.forEach(i=>{
      const p=oi.get(i.id);
      if(p&&(p.note||"")!==(i.note||""))add("shortage",i.note?"Shortage: poznámka k položce "+label(i)+" (seznam "+shWhen(l)+"): "+i.note:"Shortage: smazána poznámka k položce "+label(i)+" (seznam "+shWhen(l)+")",{m:"shn:"+l.id+":"+i.id});
    });
    if(planChanged&&l.plan){
      const n=l.items.reduce((a,i)=>a+(i.subs||[]).length,0),k=l.items.filter(i=>(i.subs||[]).length).length;
      add("shortage","Shortage: poddíly z výrobního plánu "+(l.plan.file||"")+" u seznamu "+shWhen(l)+": "+n+" "+(n===1?"poddíl":n>=2&&n<=4?"poddíly":"poddílů")+" u "+k+" "+(k===1?"sestavy":"sestav"),{m:"shp:"+l.id});
    }else os.forEach((x,id)=>{if(ni.has(x.i.id)&&!ns.has(id))add("shortage","Shortage: odebrán poddíl "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+")",{m:"shr:"+l.id+":"+id});});
    ns.forEach((x,id)=>{
      const p=os.get(id);
      if(p&&(p.s.note||"")!==(x.s.note||""))add("shortage",x.s.note?"Shortage: poznámka k poddílu "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+"): "+x.s.note:"Shortage: smazána poznámka k poddílu "+(x.s.ean||x.s.code)+" u položky "+label(x.i)+" (seznam "+shWhen(l)+")",{m:"shn:"+l.id+":"+id});
    });
    const recN=l.items.filter(i=>oi.has(i.id)&&JSON.stringify(oi.get(i.id).rec||null)!==JSON.stringify(i.rec||null)).length
      +[...ns.entries()].filter(([id,x])=>os.has(id)&&JSON.stringify(os.get(id).s.rec||null)!==JSON.stringify(x.s.rec||null)).length;
    if(recN)add("shortage","Shortage: poslední záznamy u "+recN+" "+(recN===1?"položky":"položek")+" seznamu "+shWhen(l),{m:"shz:"+l.id});
    if(ol.filter(id=>ni.has(id)).join()!==nl.filter(id=>oi.has(id)).join())add("shortage","Shortage: změněno pořadí položek v seznamu "+shWhen(l),{m:"sho:"+l.id});
  });
}

if(typeof module==="object"&&module.exports){
  module.exports={setState:v=>{S=v;_prodIdx=null;_effCache=null;},getState:()=>S};
}
