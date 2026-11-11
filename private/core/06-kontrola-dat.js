/* ---------------- načtení a kontrola dat ----------------
   Data přicházejí ze serveru (šifrovaná), ze zálohy nebo z JSON exportu původní
   aplikace. Každý vstup se převede do známého tvaru: neznámé klíče zmizí, čísla se
   omezí na rozumný rozsah a id mohou obsahovat jen bezpečné znaky. */
const SAFE_ID=/^[A-Za-z0-9_-]{1,40}$/;
const PERIOD_ID=/^\d{4}-\d{2}$/;
const ISO_DAY=/^\d{4}-\d{2}-\d{2}$/;
const OV_COLUMN_KEYS=["days","hours","wk","kafe","lvl","prod","att","pen","adj","iss","raise","ncut"];
const DATA_VERSION=51;
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
    /* konec trestu (2.43): datum, kdy člověk odchází; podle něj modul Konce trestů */
    if(ISO_DAY.test(String(e.end||"")))emp.end=String(e.end);
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
        c:days.map((_,i)=>{const c=arr(r.c)[i];const t=c==null?"":str(c,16);return t?t:null;})};   // prázdný kód = null hned (stálé čištění, audit 2.62)
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
    /* Vrátit zpět (2.45): odkazy na uložené změny a značka, že už je vrácená */
    const u=arr(x.u).filter(v=>UNDO_ID.test(String(v))).slice(0,20);if(u.length)entry.u=u;
    if(x.un&&typeof x.un==="object")entry.un={at:num(x.un.at,0,0,1e15),by:str(x.un.by,60)};
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
  out.undo=cleanUndo(o.undo);
  /* KPI – lidé v práci a zpracované kusy (2.17): starší data ho nemají, začíná prázdný */
  out.workAudit=cleanWorkAudit(o.workAudit);
  /* Servis – odeslání zařízení na servis (2.21): starší data ho nemají, začíná prázdný */
  out.service=cleanService(o.service);
  /* Shortage – chybějící díly z Excelu (2.27): starší data ho nemají, začíná prázdný */
  out.shortage=cleanShortage(o.shortage);
  /* Plán kapacit (2.38): starší data ho nemají, začíná prázdný; jen existující skupiny */
  out.capPlan=cleanCapPlan(o.capPlan,new Set(out.positions.filter(isGroup).map(x=>x.id)));
  /* Úkoly (2.46): starší data je nemají, začínají prázdné */
  out.tasks=cleanTasks(o.tasks);
  /* Docházka – ruční úpravy a zámky (2.51): starší data je nemají */
  out.attEdits=cleanAttEdits(o.attEdits);
  out.attLocks=cleanAttLocks(o.attLocks);
  /* Poznámky v kalendáři (2.65): starší data je nemají */
  out.calNotes=cleanCalNotes(o.calNotes);
  /* Časová osa (2.66): starší data ji nemají */
  out.agenda=cleanAgenda(o.agenda);
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
    item:col(v.item,true),iname:col(v.iname,true),op:col(v.op,true),
    heads:(Array.isArray(v.heads)?v.heads:[]).slice(0,60).map(h=>String(h==null?"":h).slice(0,80))};
  if(!Number.isFinite(Number(v.header)))out.header=-1;
  return out.name<0||out.date<0?null:out;
}

