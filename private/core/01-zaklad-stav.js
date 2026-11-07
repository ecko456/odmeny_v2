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
  friShift:6.5,            // zkrácený pátek - od 2.53 jen odpolední směna v pátek (friShort), sám od sebe
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
  settings:{...DEF_SETTINGS},demo:false,log:[],eff:blankEff(),audit:blankAudit(),marks:{},capReport:blankCapReport(),leadSkills:[],normCutDone:{},logbooks:[],workAudit:blankWorkAudit(),service:blankService(),shortage:blankShortage(),capPlan:blankCapPlan(),tasks:blankTasks(),attEdits:{},attLocks:{},undo:[],v:DATA_VERSION};}
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

