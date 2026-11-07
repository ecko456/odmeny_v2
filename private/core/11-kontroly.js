/* ================= verze 2.3: Kontroly (nutné úkony oddělení, namátkové kontroly) =================
   Ke každému oddělení se vede seznam nutných úkonů (body, které musí operátor dělat).
   Na týden dopředu se vygeneruje namátková kontrola: z každého oddělení se vybere 25 %
   zaměstnanců (zaokrouhleno nahoru, aspoň jeden) a rozloží se postupně na pracovní dny.
   Výběr je náhodný, ale přednost mají ti, kdo nejdéle nebyli kontrolovaní, takže se za
   čtyři týdny vystřídají všichni. U každého člověka se u každého bodu zapíše splněno nebo
   nesplněno; výsledek se ukáže v jeho kartě (Lidé, Profil). */
const AUD_DEFAULTS={pct:25};
/* Režim výběru (2.37): week = plán na týden dopředu, day = každý den jen z lidí, kteří podle
   nahraných příchodů (KPI, docházka a výkony) ten den přišli. */
const AUD_MODES={week:"Na týden dopředu",day:"Každý den podle příchodů"};
const AUD_STATES={plan:"Naplánováno",done:"Provedeno",skip:"Neproběhlo"};
function blankAudit(){return {tasks:{},plans:{},settings:{...AUD_DEFAULTS}};}
function audSet(){return {...AUD_DEFAULTS,mode:"week",...((S&&S.audit&&S.audit.settings)||{})};}
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
  const inPlan=new Set(p.items.map(i=>i.key)),last=audLast(),here=audPresent(it.day);
  // s nahranými příchody na ten den jen z lidí, kteří přišli (2.37)
  const cand=audPeople(it.dept).filter(e=>!inPlan.has(e.key)&&(!here||here.keys.has(e.key))).map(e=>({e,r:rnd(),last:last[e.key]||""}))
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
/* Kdo je podle nahraných příchodů ten den v práci (2.37): klíče lidí z evidence (podle ID
   zaměstnance) a ID, která v evidenci nejsou. Bez docházky na ten den null. */
function audPresent(iso){
  const day=S&&S.workAudit&&S.workAudit.dv&&S.workAudit.dv.pres[iso];
  if(!day)return null;
  const map=dvWidMap(),keys=new Set(),unknown=[];
  Object.entries(day).forEach(([wid,v])=>{if(v[0]==null&&v[1]==null)return;const e=map.get(wid);if(e)keys.add(e.key);else unknown.push(wid);});
  return {keys,unknown,n:keys.size+unknown.length};
}
/* Denní výběr podle příchodů (2.37): z každého oddělení se během týdne zkontroluje stejný
   podíl lidí jako u týdenního plánu, jen se losuje den po dni z těch, kdo ten den přišli.
   Na den připadne zbytek týdenního počtu rozdělený do zbývajících pracovních dní (nahoru).
   Kdo je v týdnu už naplánovaný nebo zkontrolovaný, znovu se nelosuje. Opakované losování
   téhož dne nahradí jen dosud nezapsané automatické kontroly toho dne. */
function generateDayChecks(weekId,iso,meta,rnd){
  rnd=rnd||Math.random;
  const days=audDays(weekId);
  if(!days.includes(iso))throw new Error(dayText(iso)+" není pracovní den týdne.");
  const here=audPresent(iso);
  if(!here)throw new Error("Na "+dayText(iso)+" nejsou nahrané příchody. Nahraj soubor s docházkou.");
  const pct=audSet().pct;
  let p=audPlan(weekId);
  if(!p)p=S.audit.plans[weekId]={at:(meta&&meta.at)||Date.now(),by:String((meta&&meta.by)||"").slice(0,60),pct,days,items:[]};
  p.items=p.items.filter(i=>!(i.day===iso&&i.state==="plan"&&!i.extra&&!i.sub));
  const inPlan=new Set(p.items.filter(i=>i.state!=="skip"||i.day===iso).map(i=>i.key)),last=audLast();
  const left=days.filter(d=>d>=iso).length,short=[];
  let added=0;
  audDepts().forEach(dept=>{
    const people=audPeople(dept);
    const used=p.items.filter(i=>i.dept===dept&&i.state!=="skip").length;
    const need=Math.ceil(Math.max(0,audCount(people.length,pct)-used)/Math.max(1,left));
    if(!need)return;
    const pool=people.filter(e=>here.keys.has(e.key)&&!inPlan.has(e.key)).map(e=>({e,r:rnd(),last:last[e.key]||""}))
      .sort((a,b)=>(a.last<b.last?-1:a.last>b.last?1:a.r-b.r)).slice(0,need);
    if(pool.length<need)short.push({dept,need,got:pool.length});
    pool.forEach(({e})=>{
      p.items.push({id:uid("k"),key:e.key,name:audName(e),dept,day:iso,state:"plan",done:"",checker:"",results:[],note:"",reason:"",extra:false,at:0,by:""});
      inPlan.add(e.key);added++;
    });
  });
  p.items.sort((a,b)=>(a.day<b.day?-1:a.day>b.day?1:0)||norm(a.dept).localeCompare(norm(b.dept),"cs")||norm(a.name).localeCompare(norm(b.name),"cs"));
  p.at=(meta&&meta.at)||Date.now();p.by=String((meta&&meta.by)||"").slice(0,60);p.pct=pct;
  return {plan:p,added,present:here.n,unknown:here.unknown.length,short};
}
/* Rychlá kontrola (2.39): vedoucí na telefonu zadá, kolik lidí chce zkontrolovat, a dostane
   seznam jmen. Losuje se z kontrolovaných lidí (ne nemocní, ne vedoucí), volitelně jen
   z oddělení, ze směny (ranní / odpolední podle zařazení a střídání skupin) a z lidí, kteří
   jsou podle nahraných příchodů dnes v práci. Kdo už má v týdnu kontrolu (naplánovanou nebo
   provedenou), se nelosuje. Přednost má ten, kdo nejdéle nebyl kontrolovaný (podle provedených
   kontrol), shodu rozhodne náhoda. Bez vybraného oddělení se počet rozdělí mezi oddělení
   podle počtu lidí v nabídce (největší zbytky), aby se nevylosovalo jen jedno oddělení. */
function quickLastDone(){
  const m={};
  Object.values((S.audit&&S.audit.plans)||{}).forEach(p=>p.items.forEach(it=>{
    if(it.state==="done"&&it.done&&(!m[it.key]||it.done>m[it.key]))m[it.key]=it.done;
  }));
  return m;
}
function quickPool(opt){
  opt=opt||{};
  const today=opt.today||todayIso(),week=isoWeek(today).id;
  const mg=morningGroup(week,(S.capReport||{}).s1am);
  const here=opt.present?audPresent(today):null;
  const busy=new Set(((audPlan(week)||{}).items||[]).filter(i=>i.state!=="skip").map(i=>i.key));
  const skip=new Set(opt.not||[]);
  const last=quickLastDone();
  const out=[];
  audDepts().forEach(dept=>{
    if(opt.dept&&opt.dept!==dept)return;
    audPeople(dept).forEach(e=>{
      if(e.sick||busy.has(e.key)||skip.has(e.key))return;
      const slot=slotOn(e,mg);
      if(opt.slot&&slot!==opt.slot)return;
      if(opt.present&&(!here||!here.keys.has(e.key)))return;
      out.push({key:e.key,name:audName(e),dept,wid:e.wid||"",slot,last:last[e.key]||""});
    });
  });
  return {list:out,week,today,mg,present:here?here.n:null,busy:busy.size};
}
const quickOrder=(a,b)=>(a.last<b.last?-1:a.last>b.last?1:a.r-b.r);
function quickPick(opt,rnd){
  rnd=rnd||Math.random;
  const pool=quickPool(opt),want=Math.max(0,Math.floor(+opt.n||0));
  const by=new Map();
  pool.list.forEach(x=>{if(!by.has(x.dept))by.set(x.dept,[]);by.get(x.dept).push({...x,r:rnd()});});
  by.forEach(l=>l.sort(quickOrder));
  const total=pool.list.length,n=Math.min(want,total);
  // podíl oddělení: celé části, zbytek podle největších zbytků (shodu rozhodne náhoda)
  const quota=[...by.entries()].map(([dept,l])=>{const q=n*l.length/(total||1);return {dept,l,k:Math.floor(q),f:q-Math.floor(q),r:rnd()};});
  let left=n-quota.reduce((x,q)=>x+q.k,0);
  quota.slice().sort((a,b)=>b.f-a.f||a.r-b.r).forEach(q=>{if(left>0&&q.k<q.l.length){q.k++;left--;}});
  const list=[];
  quota.forEach(q=>q.l.slice(0,q.k).forEach(x=>list.push(x)));
  list.forEach(x=>{delete x.r;});
  return {list,pool:total,want,short:Math.max(0,want-list.length),present:pool.present,week:pool.week,today:pool.today};
}
/* Náhradník za jednoho z vylosovaných: ze stejného oddělení (a stejných filtrů), kdo v seznamu
   ještě není; když v oddělení nikdo nezbyl, z kteréhokoli oddělení v nabídce. */
function quickSwap(opt,keys,key,rnd){
  rnd=rnd||Math.random;
  const pool=quickPool({...opt,not:keys}).list.map(x=>({...x,r:rnd()})).sort(quickOrder);
  const was=S.employees[key],dept=was?empDept(was):"";
  const x=pool.find(y=>y.dept===dept)||pool[0]||null;
  if(x)delete x.r;
  return x;
}
/* Uloží vylosované lidi do dnešních kontrol (plán týdne, „přidán ručně“). */
function quickSave(keys,meta,today){
  today=today||todayIso((meta&&meta.at)||Date.now());
  const week=isoWeek(today).id;
  if(!audDays(week).includes(today))throw new Error("Dnes není pracovní den, do plánu kontrol se seznam uložit nedá.");
  const p=audPlan(week);
  const have=new Set(((p||{}).items||[]).filter(i=>i.state!=="skip").map(i=>i.key));
  const added=[];
  keys.forEach(k=>{if(!have.has(k)&&S.employees[k]&&empDept(S.employees[k])){added.push(addToPlan(week,k,today,meta));have.add(k);}});
  return {week,day:today,added};
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
  return {tasks,plans,settings:{pct:Math.round(num(st.pct,AUD_DEFAULTS.pct,5,100)),...(st.mode==="day"?{mode:"day"}:{})}};
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

