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

