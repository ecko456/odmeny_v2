/* ==========================================================================
   AUDIT: docházka a výkony z jednoho souboru (verze 2.37)
   List „Docházka“: A ID zaměstnance, od B dvojice sloupců příchod / odchod pro každý den
   (datum v hlavičce nad dvojicí). List „vykázaná práce“: A ID, D název dílu, E operace,
   F množství v zakázce, G dokončené množství, J strávený čas; sloupec s datem, když je,
   se najde sám. S.workAudit.dv = {cols, unit, pres, perf, files}:
   pres{iso: {id: [příchod, odchod]}} v minutách od půlnoci (odchod menší = přes půlnoc),
   perf{YYYY-MM: {id: {p: {díl: [dokončeno, zakázka, minuty, řádků]}, o: {operace: [dokončeno, minuty, řádků]}}}}.
   Projekt = skupina Matice dovedností, kam člověk patří. Docházku pro odměny (S.periods) nemění.
   ========================================================================== */
const DV_COLS={att:{id:"A",first:"B"},work:{id:"A",part:"D",op:"E",order:"F",done:"G",time:"J",date:"",norm:""}};
const DV_COL_LABEL={id:"ID zaměstnance",first:"První den (příchod)",part:"Název dílu",op:"Operace",order:"Množství v zakázce",done:"Dokončené množství",time:"Strávený čas",date:"Datum (prázdné = najde se samo)",norm:"Norma (prázdné = soubor normu nemá)"};
const DV_MAX_DAYS=800,DV_MAX_MONTHS=36,DV_MAX_PEOPLE=800,DV_MAX_PARTS=300,DV_MAX_OPS=100,DV_MAX_NORM=1000;
const DV_UNITS=["auto","min","h"];
/* Normy z vykázaných časů (2.74): záznam s dokončenými kusy a časem do DV_NORM_MIN minut se do
   norem nepočítá (nejspíš chyba v evidenci); perf[m][id].n {díl: {operace: [kusy, minuty, řádků]}},
   perf[m][id].s = počet takových krátkých záznamů. */
const DV_NORM_MIN=2;
function blankDv(){return {cols:JSON.parse(JSON.stringify(DV_COLS)),unit:"auto",sheets:{att:"",work:""},pres:{},perf:{},files:[]};}
/** Datum bez času (hlavička docházky): číslo dne z Excelu, „1.10.2026“, „2026-10-01“. */
function dvDate(v,ref){
  if(typeof v==="number"&&v%1)return null;
  if(typeof v==="string"&&/\d:\d/.test(v))return null;
  /* 2.42.4: hlavička docházkového systému „01.10. Čt“ (den, měsíc, zkratka dne, bez roku), nebo
     „01.10.2026 Čt“. Rok chybí → ten, se kterým je datum nejblíž dnešku (soubor za prosinec
     nahraný v lednu je loňský). */
  if(typeof v==="string"){
    const m=v.trim().match(/^(\d{1,2})\.\s?(\d{1,2})\.?\s?(\d{4})?\.?(?:\s*\p{L}{1,3}\.?)?$/u);
    if(m){
      const dd=+m[1],mm=+m[2];
      if(mm<1||mm>12||dd<1||dd>31)return null;
      const pad=n=>String(n).padStart(2,"0"),ok=y=>{const t=new Date(Date.UTC(y,mm-1,dd));return t.getUTCMonth()===mm-1;};
      if(m[3]){const y=+m[3];return y>=2000&&y<=2100&&ok(y)?y+"-"+pad(mm)+"-"+pad(dd):null;}
      const r=String(ref||todayIso()),ry=+r.slice(0,4),rt=Date.UTC(ry,+r.slice(5,7)-1,+r.slice(8,10));
      const y=[ry-1,ry,ry+1].filter(ok).sort((a,b)=>Math.abs(Date.UTC(a,mm-1,dd)-rt)-Math.abs(Date.UTC(b,mm-1,dd)-rt))[0];
      return y?y+"-"+pad(mm)+"-"+pad(dd):null;
    }
  }
  const d=cellToDateTime(v);
  return d&&d.y>=2000&&d.y<=2100&&d.m>=1&&d.m<=12&&d.d>=1&&d.d<=31?d.y+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0"):null;
}
/** Datum řádku vykázané práce (i s časem). */
function dvDateAny(v){const d=cellToDateTime(v);return d&&d.y>=2000&&d.y<=2100?d.y+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0"):null;}
/** Čas dne → minuty od půlnoci: zlomek dne z Excelu, datum s časem, „6:30“, „06:30:00“,
    „1.10.2026 6:30“; číslo 1–23 jako hodiny (6,5 = 6:30). Jinak null. */
function dvClock(v){
  if(v==null||v==="")return null;
  if(typeof v==="number"){
    if(!isFinite(v)||v<0)return null;
    if(v<1)return Math.round(v*1440)%1440;
    if(v<24)return Math.round(v*60);
    if(v>=20000&&v<80000)return Math.round((v%1)*1440)%1440;
    return null;
  }
  const m=String(v).match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if(!m)return null;
  const h=+m[1],mi=+m[2];
  return h<24&&mi<60?h*60+mi:null;
}
/** Délka pobytu v minutách (odchod dřív než příchod = přes půlnoc), bez odchodu null. */
function dvStay(a,b){if(a==null||b==null)return null;let d=b-a;if(d<0)d+=1440;return d;}
/** Strávený čas → minuty: „1:30“ vždy jako hodiny a minuty, číslo podle jednotky (frac = zlomek dne). */
function dvDur(v,unit){
  if(v==null||v==="")return null;
  if(typeof v==="string"){const m=v.trim().match(/^(\d{1,4}):(\d{2})(?::(\d{2}))?$/);if(m)return +m[1]*60+ +m[2]+(m[3]?+m[3]/60:0);}
  const n=toNum(v);
  if(n==null||n<0)return null;
  return unit==="frac"?n*1440:unit==="h"?n*60:n;
}
/** Listy souboru (2.42.3): zapamatovaný název listu, jinak podle názvu (Docházka, vykázaná práce),
    jinak docházka na 2. listu (přání uživatele: „docházka je vždy v tom 2. listu“) a práce na
    tom druhém. Soubor s jedním listem = docházka. */
function dvSheetName(s){return String((s&&s.name)||"").split("›").pop().trim();}
function dvSheets(sheets,pick){
  const list=(sheets||[]).filter(s=>s&&Array.isArray(s.aoa));
  const nm=s=>norm(dvSheetName(s));
  const by=n=>n?list.find(s=>dvSheetName(s)===n)||null:null;
  pick=pick||{};
  const att=by(pick.att)||list.find(s=>/dochaz/.test(nm(s)))||(list.length>1?list[1]:list[0])||null;
  const pw=by(pick.work);
  const work=(pw&&pw!==att?pw:null)||list.find(s=>s!==att&&/vykaz|prace|vykon/.test(nm(s)))||list.find(s=>s!==att)||null;
  return {att,work};
}
function dvParse(sheets,dv,unit,ref){
  dv=dv||blankDv();
  const {att,work}=dvSheets(sheets,dv.sheets);
  return {att:att?dvParseAtt(att,dv.cols.att,ref):null,work:work?dvParseWork(work,dv.cols.work,unit||dv.unit):null};
}
function dvParseAtt(sheet,c,ref){
  const rows=sheet.aoa||[],idc=Math.max(0,waIndex(c.id)),first=Math.max(0,waIndex(c.first));
  const name=String(sheet.name||"").split("›").pop().trim();
  // hlavička: řádek s nejvíc daty (jen datum bez času) od prvního sloupce dne
  let hr=-1,best=0;
  for(let r=0;r<Math.min(rows.length,20);r++){
    const row=rows[r]||[];let n=0;
    for(let k=first;k<row.length;k++)if(dvDate(row[k],ref))n++;
    if(n>best){best=n;hr=r;}
  }
  if(hr<0)return {ok:false,name,err:"V listu "+name+" není v hlavičce žádné datum (čeká se např. 1.10.2026 nad sloupci příchod a odchod)."};
  const head=rows[hr]||[],pairs=[];
  for(let k=first;k<head.length;){const iso=dvDate(head[k],ref);if(iso){pairs.push({iso,c:k});k+=2;}else k++;}
  const pres={},abs={},people=new Set(),ids=new Set();let n=0,codes=0;
  const code=v=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim().toUpperCase().slice(0,16);
  for(let r=hr+1;r<rows.length;r++){
    const row=rows[r]||[],wid=widKey(row[idc]);
    if(!wid||!/\d/.test(wid)||wid.length>30)continue;   // podnadpis Příchod / Odchod, souhrny, prázdné řádky
    n++;ids.add(wid);
    pairs.forEach(p=>{
      const a=dvClock(row[p.c]),b=dvClock(row[p.c+1]);
      /* buňka bez času = kód nepřítomnosti (D, NEM…), od 2.42 jde do docházky pro odměny */
      if(a==null&&b==null){const t=code(row[p.c])||code(row[p.c+1]);if(t){codes++;(abs[p.iso]||(abs[p.iso]={}))[wid]=t;}return;}
      (pres[p.iso]||(pres[p.iso]={}))[wid]=[a,b];
      people.add(wid);
    });
  }
  const dates=pairs.map(p=>p.iso).sort();
  return {ok:!!n,name,err:n?"":"V listu "+name+" není žádný řádek s ID zaměstnance ve sloupci "+c.id+".",pres,abs,ids:[...ids],dates,from:dates[0]||"",to:dates[dates.length-1]||"",
    days:Object.keys(pres).length,people:people.size,rows:n,codes,header:hr};
}
function dvParseWork(sheet,c,unit){
  const rows=sheet.aoa||[],ix=k=>waIndex(c[k]);
  const name=String(sheet.name||"").split("›").pop().trim();
  const I={id:Math.max(0,ix("id")),part:ix("part"),op:ix("op"),order:ix("order"),done:ix("done"),time:ix("time"),norm:c.norm?ix("norm"):-1};
  const txt=v=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  const at=(r,i)=>i<0?null:r[i];
  const isData=r=>{const w=widKey(r[I.id]);return !!w&&/\d/.test(w)&&w.length<=30&&(toNum(at(r,I.done))!=null||at(r,I.time)!=null&&at(r,I.time)!==""||txt(at(r,I.part))||txt(at(r,I.op)));};
  const first=rows.findIndex(r=>r&&isData(r));
  if(first<0)return {ok:false,name,err:"V listu "+name+" není žádný řádek s ID zaměstnance ve sloupci "+c.id+".",recs:[]};
  const data=rows.slice(first).filter(r=>r&&isData(r));
  const headOf=i=>{for(let r=first-1;r>=0;r--){const t=txt((rows[r]||[])[i]);if(t)return norm(t);}return "";};
  // datum: zadaný sloupec, jinak sloupec mimo ostatní, kde je u většiny řádků datum
  // (hlavička „Datum“ má přednost; čísla zakázek by jinak vypadala jako data z Excelu, proto
  // u sloupce bez takové hlavičky jen buňky formátované jako datum a nejvýš 100 dní od sebe)
  let di=c.date?waIndex(c.date):-1;
  if(!c.date){
    const used=new Set(Object.values(I)),sample=data.slice(0,300),width=Math.min(40,Math.max(0,...sample.map(r=>r.length)));
    const need=Math.max(1,Math.ceil(sample.length*0.6)),span=l=>{const t=l.map(x=>Date.parse(x)).sort((a,b)=>a-b);return t.length?(t[t.length-1]-t[0])/864e5:0;};
    let best=null;
    for(let k=0;k<width;k++){
      if(used.has(k))continue;
      const named=/datum|date|\bden\b/.test(headOf(k)),fmt=!!(sheet.dateCols&&sheet.dateCols.has(k));
      // číslo je datum jen pod hlavičkou Datum nebo v buňkách formátovaných jako datum (sheet.dateCols)
      const l=sample.map(r=>typeof r[k]==="number"&&!named&&!fmt?null:dvDateAny(r[k])).filter(Boolean);
      if(l.length<need)continue;
      if(!named&&span(l)>100)continue;
      const score=(named?1e6:0)+l.length;
      if(!best||score>best.score)best={k,score};
    }
    di=best?best.k:-1;
  }
  // jednotka času: auto podle hodnot a hlavičky (zlomky dne = čas z Excelu, „min“, „hod“)
  let u=unit==="min"||unit==="h"?unit:"";
  const nums=data.map(r=>at(r,I.time)).filter(v=>typeof v==="number"&&v>0);
  if(!u){
    const h=headOf(I.time);
    if(nums.length&&nums.every(v=>v<1))u="frac";
    else if(/min/.test(h))u="min";
    else if(/hod|\(h\)|\bh\b/.test(h))u="h";
    else{const s=nums.slice().sort((a,b)=>a-b),med=s.length?s[Math.floor(s.length/2)]:0;u=s.length&&med<=16?"h":"min";}
  }
  const recs=[];let skipped=0;
  data.forEach(r=>{
    const part=txt(at(r,I.part)).slice(0,120),op=txt(at(r,I.op)).slice(0,120);
    const f=toNum(at(r,I.order)),g=toNum(at(r,I.done)),t=dvDur(at(r,I.time),u),nm=I.norm>=0?dvDur(at(r,I.norm),u):null;
    if(!part&&!op&&!(g>0)&&!(t>0)){skipped++;return;}
    recs.push({wid:widKey(r[I.id]),part:part||"(bez názvu dílu)",op,f:f>0?f:0,g:g>0?g:0,t:t>0?t:0,n:nm>0?nm:0,iso:di>=0?dvDateAny(r[di])||"":""});
  });
  const isos=recs.map(x=>x.iso).filter(Boolean).sort();
  const sum=k=>recs.reduce((a,x)=>a+x[k],0);
  return {ok:!!recs.length,name,err:recs.length?"":"V listu "+name+" nejsou žádné záznamy práce.",recs,rows:recs.length,skipped,unit:u,dateCol:di>=0?colLetter(di):"",
    dated:isos.length>=Math.ceil(recs.length*0.6),from:isos[0]||"",to:isos[isos.length-1]||"",people:new Set(recs.map(x=>x.wid)).size,t:sum("t"),g:sum("g"),f:sum("f"),
    norm:I.norm>=0,normCol:I.norm>=0?colLetter(I.norm):""};
}
/** Uloží docházku a výkony: dny ze souboru nahradí uložené dny (i den, kdy nikdo nepřišel),
    výkony nahradí celé měsíce ze souboru (bez data řádku = měsíc konce docházky). S audit
    a datem u řádků se kusy podle operací zapíšou i do KPI jako výkaz práce. */
function dvApply(wa,p,meta,opts){
  opts=opts||{};meta=meta||{};
  const dv=wa.dv||(wa.dv=blankDv()),a=p.att&&p.att.ok?p.att:null,w=p.work&&p.work.ok?p.work:null;
  if(a)a.dates.forEach(iso=>{if(a.pres[iso])dv.pres[iso]=a.pres[iso];else delete dv.pres[iso];});
  const months=[];let audit=null,short=0;
  if(w){
    const fallback=((a&&a.to)||w.to||todayIso(meta.at)).slice(0,7),by={};
    const r2=v=>Math.round(v*100)/100;
    w.recs.forEach(x=>{
      const m=x.iso&&w.dated?x.iso.slice(0,7):fallback,pm=by[m]||(by[m]={}),q=pm[x.wid]||(pm[x.wid]={p:{},o:{},n:{},s:0});
      const pp=q.p[x.part]||(q.p[x.part]=[0,0,0,0]);pp[0]+=x.g;pp[1]+=x.f;pp[2]+=x.t;pp[3]++;
      if(x.op){const oo=q.o[x.op]||(q.o[x.op]=[0,0,0]);oo[0]+=x.g;oo[1]+=x.t;oo[2]++;}
      // normy (2.74): jen záznamy s kusy a časem nad DV_NORM_MIN minut
      if(x.g>0){if(x.t>DV_NORM_MIN){const np=q.n[x.part]||(q.n[x.part]={}),nn=np[x.op]||(np[x.op]=[0,0,0]);nn[0]+=x.g;nn[1]+=x.t;nn[2]++;}else{q.s++;short++;}}
    });
    Object.values(by).forEach(pm=>Object.values(pm).forEach(q=>{Object.values(q.p).forEach(v=>v.forEach((n,i)=>{v[i]=r2(n);}));Object.values(q.o).forEach(v=>v.forEach((n,i)=>{v[i]=r2(n);}));
      Object.values(q.n).forEach(np=>Object.values(np).forEach(v=>v.forEach((n,i)=>{v[i]=r2(n);})));if(!Object.keys(q.n).length)delete q.n;if(!q.s)delete q.s;}));
    Object.keys(by).sort().forEach(m=>{dv.perf[m]=by[m];months.push(m);});
    if(w.dated&&(opts.audit||w.recs.some(x=>dvOwns(x.iso)))){
      /* kusy do KPI: od listopadu 2026 vždy, dřív jen na přání (zaškrtnutí v dialogu) */
      const byDay={},ops={};let rows=0;
      w.recs.forEach(x=>{if(!x.iso||!x.op||!(opts.audit||dvOwns(x.iso)))return;const d=byDay[x.iso]||(byDay[x.iso]={});d[x.op]=(d[x.op]||0)+x.g;ops[x.op]=(ops[x.op]||0)+x.g;rows++;});
      const isos=Object.keys(byDay).sort();
      if(isos.length)audit=waApplyWork(wa,{byDay,ops,rows,skipped:0,from:isos[0],to:isos[isos.length-1]},meta);
    }
  }
  dv.files.push({name:String(meta.name||"").slice(0,160),at:meta.at||Date.now(),by:String(meta.by||"").slice(0,60),from:a?a.from:(w?w.from:""),to:a?a.to:(w?w.to:""),
    people:a?a.people:0,days:a?a.days:0,rows:w?w.rows:0,months:months.slice(0,24),...(short?{short}:{})});
  dv.files=dv.files.slice(-40);
  /* od listopadu 2026 (2.42) jediný zdroj: docházka pro odměny, evidence práce a obsazenost v KPI */
  const periods=a?dvToPeriods(a,meta):[];
  const prod=w?dvToProduction(w,meta,((a&&a.to)||w.to||todayIso(meta.at)).slice(0,7)):[];
  const occ=a?dvToAudit(wa,a.dates,a.abs):[];
  return {days:a?a.dates.length:0,months,audit,periods,prod,occ,short};
}
/** Vzor načtení (2.42.3): první člověk z listu docházky (prvních n dní s příchodem, odchodem,
    kódem a hodinami pro odměny) a jeho první záznamy práce, ať je vidět, co se odkud čte. */
function dvPreview(p,n){
  n=n||3;
  const a=p&&p.att&&p.att.ok?p.att:null,w=p&&p.work&&p.work.ok?p.work:null;
  const wid=a?(a.ids||[]).find(id=>a.dates.some(iso=>(a.pres[iso]||{})[id]))||(a.ids||[])[0]||"":(w&&w.recs[0]?w.recs[0].wid:"");
  const e=wid?dvWidMap().get(wid)||null:null;
  const days=a?a.dates.slice(0,n).map(iso=>{const v=(a.pres[iso]||{})[wid]||null,c=((a.abs||{})[iso]||{})[wid]||"";
    const r=v?dvRound(v[0],v[1]):null;return {iso,in:v?v[0]:null,out:v?v[1]:null,rin:r?r[0]:null,rout:r?r[1]:null,code:v?"":c,h:v?dvHours(v[0],v[1]):0};}):[];
  const recs=w?w.recs.filter(x=>x.wid===wid).slice(0,n):[];
  return {wid,name:e?(e.last+" "+e.first).trim():"",known:!!e,days,recs:recs.length?recs:(w?w.recs.slice(0,n):[]),own:recs.length>0,
    att:a?{name:a.name,days:a.dates.length,people:a.people,rows:a.rows}:null,work:w?{name:w.name,rows:w.rows,unit:w.unit,dateCol:w.dateCol}:null,
    errAtt:p&&p.att&&!p.att.ok?p.att.err:"",errWork:p&&p.work&&!p.work.ok?p.work.err:""};
}
/** Ukázka souboru pro AI (2.42.2), ať správně nastaví sloupce: první řádky listů. Skutečný text
    zůstane jen v nadpisech (řádky před prvním datovým řádkem), jména z Lidí se v nich nahradí
    [osoba N]. Hodnoty datových řádků (ID, časy, kusy, díly) jdou jen jako typ buňky. */
function dvAiSample(sheets,employees){
  const W=70,ROWS=6;
  const txt=v=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").replace(/\s+/g," ").trim();
  const isId=v=>typeof v==="number"?Number.isFinite(v):/^[A-Za-z]{0,4}[-\/]?\d[\w\-\/]{0,28}$/.test(txt(v));
  const iso=v=>{const d=dvDateAny(v);return d?"<datum "+d+">":null;};
  const out=(sheets||[]).filter(sh=>sh&&Array.isArray(sh.aoa)).slice(0,4).map(sh=>{
    const rows=sh.aoa.filter(r=>Array.isArray(r)&&r.some(c=>txt(c)!=="")).slice(0,ROWS);
    const dataAt=rows.findIndex(r=>{const k=r.findIndex(c=>txt(c)!=="");return k>=0&&k<3&&isId(r[k]);});
    const dateCol=k=>!!(sh.dateCols&&sh.dateCols.has(k));
    return {name:txt(String(sh.name||"").split("›").pop()).slice(0,60),rows:rows.map((r,i)=>{
      const head=dataAt<0||i<dataAt,cells={};
      r.slice(0,W).forEach((v,k)=>{
        let t=txt(v);if(t==="")return;
        if(v instanceof Date)t=iso(v)||"<datum>";
        else if(typeof v==="number"){
          if(dateCol(k)||(Number.isInteger(v)&&v>20000&&v<80000&&head))t=iso(v)||"<číslo>";
          else if(head)t=String(v);
          else t=v>0&&v<1?"<čas>":Number.isInteger(v)?"<celé číslo>":"<číslo>";
        }else if(/\d/.test(t)){
          t=/^\d{1,2}:\d{2}(:\d{2})?$/.test(t)?"<čas>":(iso(t)||(head&&t.length<=40?t:"<text s číslicemi>"));
        }else if(!head)t="<text>";
        cells[colLetter(k)]=t.slice(0,60);
      });
      return cells;
    })};
  });
  /* jména lidí v nadpisech (třeba nadpis listu se jménem vedoucího) */
  const flat=[];out.forEach(sh=>sh.rows.forEach(r=>Object.keys(r).forEach(k=>flat.push([r,k]))));
  const masked=maskNamesMany(flat.map(([r,k])=>r[k]),employees||[]).texts;
  flat.forEach(([r,k],i)=>{r[k]=masked[i];});
  return out;
}
