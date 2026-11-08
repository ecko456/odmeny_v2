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
    if((x.end||"")!==(y.end||""))add("person","",{key:k,m:"end:"+k,p:n+": konec trestu ",v0:x.end?endDateText(x.end):"neuveden",v1:y.end?endDateText(y.end):"neuveden"});
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
  const uma=(ua.settings||{}).mode||"week",umb=(ub.settings||{}).mode||"week";
  if(uma!==umb)add("settings","",{m:"audset:mode",p:"Kontroly – výběr lidí: ",v0:AUD_MODES[uma]||uma,v1:AUD_MODES[umb]||umb});
  lbChanges(a.logbooks||[],b.logbooks||[],add);
  waChanges(a.workAudit,b.workAudit,add);
  svChanges(a.service,b.service,add);
  shChanges(a.shortage,b.shortage,add);
  cpChanges(a.capPlan,b.capPlan,add,b);
  tkChanges(a.tasks,b.tasks,add);
  attEditChanges(a,b,add);
  calChanges(a.calNotes,b.calNotes,add);
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
        if(old.u||en.u)en={...en,u:[...new Set([...(old.u||[]),...(en.u||[])])].slice(-20)};
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

