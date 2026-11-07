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
/* Oprava (2.53, přání uživatele): zkrácená směna (friShift, 6,5 h) je jen odpolední směna v pátek
   a pozná se sama: podle příchodu v souboru Docházka a výkony (od 12:00 odpolední), bez něj podle
   směny člověka a střídání skupin (attSlotOf). Ruční zaškrtnutí u člověka (e.shortFri) se už
   nepoužívá; v původní aplikaci platil zkrácený pátek jen pro zaškrtnuté a pro všechny jejich pátky. */
function friShort(e,d){return !!e&&d.dow===5&&attSlotOf(e,d.iso)==="pm";}
function attendance(p,key){
  const meta=periodMeta(p), row=p.rows[key];
  const ex=excusedSet();
  const emp=S.employees[key];
  const r={found:!!row,workDays:0,workHours:0,cappedHours:0,wkDays:0,wkHours:0,otWeek:0,
    missed:0,excusedDays:0,excusedHours:0,codes:{},cells:[],totalDays:0,totalHours:0,
    shortFri:false,fridays:0,absDays:0,shortHours:0,shortDays:0,codedDays:0,codedHours:0};
  let fund=0;
  meta.days.forEach((d,i)=>{
    const raw=row?(row.h[i]||0):0, c=row?(row.c[i]||null):null;
    /* Oprava (2.25.1, přání uživatele, stejně jako Plán a skutečnost): den s kódem nepřítomnosti
       je nepřítomnost i s hodinami („8 D“); hodiny u kódu se nepočítají jako odpracované (Kafe,
       fond, víkendy, absence). Původní aplikace je brala jako práci. */
    const h=c?0:raw;
    if(c&&raw>0){r.codedDays++;r.codedHours+=raw;}
    /* Oprava: kód z buňky se porovnává stejně normalizovaný jako seznam (OČR = OCR). */
    const sf=d.dow===5&&friShort(emp,d);   // 2.53: jen odpolední v pátek
    const isEx=!!(c&&ex.has(norm(c).toUpperCase())), ds=dayShift(d,sf);
    if(c)r.codes[c]=(r.codes[c]||0)+1;
    if(h>0){r.totalDays++;r.totalHours+=h;}
    if(d.work){
      fund+=ds;
      if(sf)r.fridays++;   // 2.53: zkrácené (odpolední) pátky
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
  r.shortFri=r.fridays>0;
  r.friDiff=Math.max(0,r.fridays*(S.settings.shift-friShift()));
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
   v zaškolování; celkové am/pm/day/week zůstávají (počítá s nimi úvod a KPI). */
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

