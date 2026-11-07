/* ==========================================================================
   DOCHÁZKA: ruční úpravy hodin a zámky (verze 2.51)
   S.attEdits[měsíc][klíč][den] = {h, c, note (důvod, povinný), at, by, wh, wc}: ručně zapsaná
   hodnota dne a hodnota ze souboru (wh hodiny, wc kód), na kterou se úprava vrátí. Úprava je
   zapsaná i přímo v S.periods (výpočty ji tak vidí všude) a po každém nahrání docházky se znovu
   použije (attProtect), takže ji nové nahrání nepřepíše.
   S.attLocks[měsíc] = {all, days[], at, by}: uzamčené dny se při nahrání nemění, uzamčený celý
   měsíc se nenahrává vůbec.
   ========================================================================== */
const ATT_EDIT_MAX=5000,ATT_MONTH_RE=/^\d{4}-\d{2}$/;
function attCode(v){const c=String(v==null?"":v).replace(/[^\p{L}\p{N}]/gu,"").toUpperCase().slice(0,10);return c||null;}
function attHrs(v){const n=typeof v==="number"?v:parseFloat(String(v==null?"":v).replace(",","."));return Number.isFinite(n)?Math.max(0,Math.min(24,Math.round(n*100)/100)):0;}
function cleanAttEdits(o){
  const out={};let n=0;
  const str=(v,max)=>String(v==null?"":v).replace(/[\u0000-\u001F\u007F]/g," ").trim().slice(0,max);
  Object.keys(o&&typeof o==="object"?o:{}).filter(m=>ATT_MONTH_RE.test(m)).sort().forEach(m=>{
    const M=o[m];if(!M||typeof M!=="object")return;
    Object.keys(M).forEach(k=>{
      const K=M[k];if(!k||k.length>200||!K||typeof K!=="object")return;
      Object.keys(K).filter(iso=>TK_ISO.test(iso)&&iso.startsWith(m)).sort().forEach(iso=>{
        const x=K[iso];if(!x||typeof x!=="object"||n>=ATT_EDIT_MAX)return;
        const note=str(x.note,300);if(!note)return;
        ((out[m]||(out[m]={}))[k]||(out[m][k]={}))[iso]={h:attHrs(x.h),c:attCode(x.c),note,at:Number.isFinite(+x.at)?+x.at:0,by:str(x.by,60),wh:attHrs(x.wh),wc:attCode(x.wc)};
        n++;
      });
    });
  });
  return out;
}
function cleanAttLocks(o){
  const out={};
  Object.keys(o&&typeof o==="object"?o:{}).filter(m=>ATT_MONTH_RE.test(m)).sort().forEach(m=>{
    const x=o[m];if(!x||typeof x!=="object")return;
    const days=[...new Set((Array.isArray(x.days)?x.days:[]).filter(d=>TK_ISO.test(d)&&d.startsWith(m)))].sort().slice(0,31);
    if(!x.all&&!days.length)return;
    out[m]={all:!!x.all,days,at:Number.isFinite(+x.at)?+x.at:0,by:String(x.by||"").slice(0,60)};
  });
  return out;
}
/** Je den (nebo bez dne celý měsíc) uzamčený? */
function attLocked(m,iso,st){
  const L=((st||S).attLocks||{})[m];
  if(!L)return false;
  if(L.all)return true;
  return !!iso&&L.days.includes(iso);
}
function attEditOf(m,key,iso,st){const E=(((st||S).attEdits||{})[m]||{})[key];return E&&E[iso]||null;}
function attCellAt(p,key,iso){
  const i=p?p.days.indexOf(iso):-1,r=p&&p.rows[key];
  return {i,found:!!r,h:r&&i>=0?(+r.h[i]||0):0,c:r&&i>=0?(r.c[i]||null):null};
}
function attRecodes(p){const codes={};Object.values(p.rows).forEach(r=>r.c.forEach(c=>{if(c)codes[c]=(codes[c]||0)+1;}));p.codes=codes;}
function attWrite(st,p,key,i,h,c){
  let r=p.rows[key];
  if(!r){const e=st.employees[key];if(!e)return false;r=p.rows[key]={first:e.first,last:e.last,h:p.days.map(()=>0),c:p.days.map(()=>null)};}
  r.h[i]=h;r.c[i]=c;
  return true;
}
/** Ruční úprava dne (hodiny, kód nepřítomnosti, povinný důvod). Hodnota rovná souboru úpravu
    zruší. Vrátí {ok, edit} nebo {err}. */
function attEditSet(st,m,key,iso,x,meta){
  const p=st.periods[m];
  if(!p)return {err:"Docházka za tento měsíc není nahraná."};
  const cell=attCellAt(p,key,iso);
  if(cell.i<0)return {err:"Den v docházce není."};
  if(!cell.found&&!st.employees[key])return {err:"Člověk v docházce není."};
  const note=String(x.note||"").replace(/[\u0000-\u001F\u007F]/g," ").trim().slice(0,300);
  if(note.length<3)return {err:"Napiš důvod úpravy (aspoň 3 znaky)."};
  const c=attCode(x.c),h=attHrs(x.h);
  st.attEdits=st.attEdits||{};
  const old=attEditOf(m,key,iso,st);
  const wh=old?old.wh:cell.h,wc=old?old.wc:cell.c;
  attWrite(st,p,key,cell.i,h,c);
  attRecodes(p);
  const M=st.attEdits[m]||(st.attEdits[m]={}),K=M[key]||(M[key]={});
  if(Math.abs(h-wh)<0.005&&c===wc){delete K[iso];if(!Object.keys(K).length)delete M[key];if(!Object.keys(M).length)delete st.attEdits[m];return {ok:true,edit:null,back:true};}
  K[iso]={h,c,note,at:meta.at||Date.now(),by:meta.by||"",wh,wc};
  return {ok:true,edit:K[iso]};
}
/** Zruší ruční úpravu: den dostane zpátky hodnotu ze souboru. */
function attEditDel(st,m,key,iso){
  const ed=attEditOf(m,key,iso,st),p=st.periods[m];
  if(!ed)return false;
  const cell=attCellAt(p,key,iso);
  if(p&&cell.i>=0&&cell.found){p.rows[key].h[cell.i]=ed.wh;p.rows[key].c[cell.i]=ed.wc;attRecodes(p);}
  const M=st.attEdits[m],K=M[key];
  delete K[iso];if(!Object.keys(K).length)delete M[key];if(!Object.keys(M).length)delete st.attEdits[m];
  return true;
}
/** Zámek dne (iso) nebo celého měsíce (iso prázdné). */
function attLockSet(st,m,iso,on,meta){
  st.attLocks=st.attLocks||{};
  const L=st.attLocks[m]||{all:false,days:[],at:0,by:""};
  if(!iso)L.all=!!on;
  else{L.days=L.days.filter(d=>d!==iso);if(on)L.days.push(iso);L.days.sort();}
  L.at=meta.at||Date.now();L.by=meta.by||"";
  if(!L.all&&!L.days.length)delete st.attLocks[m];else st.attLocks[m]=L;
}
function attEditCount(m,st){let n=0;Object.values(((st||S).attEdits||{})[m]||{}).forEach(K=>{n+=Object.keys(K).length;});return n;}
/** Po nahrání docházky (S.periods[m] už je nová): uzamčené dny dostanou hodnoty z předchozí
    docházky `old`, ruční úpravy se znovu zapíšou (u neuzamčených dnů si zapamatují novou
    hodnotu ze souboru). Vrátí {locked, edits} = počet uzamčených dnů a úprav. */
function attProtect(m,old,st){
  st=st||S;
  const p=st.periods[m];
  if(!p)return {locked:0,edits:0};
  let locked=0,edits=0;
  if(old)p.days.forEach((iso,i)=>{
    if(!attLocked(m,iso,st))return;
    locked++;
    const oi=old.days.indexOf(iso);
    Object.entries(p.rows).forEach(([k,r])=>{const o=old.rows[k];r.h[i]=o&&oi>=0?(+o.h[oi]||0):0;r.c[i]=o&&oi>=0?(o.c[oi]||null):null;});
    if(oi>=0)Object.entries(old.rows).forEach(([k,o])=>{
      if(p.rows[k]||!(+o.h[oi]||o.c[oi]))return;
      p.rows[k]={first:o.first,last:o.last,h:p.days.map(()=>0),c:p.days.map(()=>null)};
      p.rows[k].h[i]=+o.h[oi]||0;p.rows[k].c[i]=o.c[oi]||null;
    });
  });
  Object.entries((st.attEdits||{})[m]||{}).forEach(([k,K])=>Object.entries(K).forEach(([iso,ed])=>{
    const cell=attCellAt(p,k,iso);
    if(cell.i<0)return;
    if(!attLocked(m,iso,st)){ed.wh=cell.h;ed.wc=cell.c;}
    if(attWrite(st,p,k,cell.i,ed.h,ed.c))edits++;
  }));
  attRecodes(p);
  return {locked,edits};
}
function attValText(h,c){return c?c+(h>0?" ("+String(h).replace(".",",")+" h)":""):h>0?String(h).replace(".",",")+" h":"nic";}
/* Historie změn: úprava dne (s důvodem), zrušení úpravy, zámky dnů a měsíce. */
function attEditChanges(a,b,add){
  const A=a.attEdits||{},B=b.attEdits||{};
  const who=(m,k)=>{const r=((b.periods||{})[m]||{}).rows&&b.periods[m].rows[k]||(a.periods&&a.periods[m]&&a.periods[m].rows[k])||(b.employees||{})[k];return r?(r.last+" "+r.first).trim():k;};
  new Set([...Object.keys(A),...Object.keys(B)]).forEach(m=>{
    const MA=A[m]||{},MB=B[m]||{};
    new Set([...Object.keys(MA),...Object.keys(MB)]).forEach(k=>{
      const KA=MA[k]||{},KB=MB[k]||{};
      new Set([...Object.keys(KA),...Object.keys(KB)]).forEach(iso=>{
        const x=KA[iso],y=KB[iso];
        if(y&&(!x||x.h!==y.h||x.c!==y.c||x.note!==y.note))add("adjust","Docházka – "+who(m,k)+", "+dayText(iso)+": "+attValText(x?x.h:y.wh,x?x.c:y.wc)+" → "+attValText(y.h,y.c)+" (důvod: "+y.note+")",{key:k,m:"atte:"+m+":"+k+":"+iso});
        else if(x&&!y)add("adjust","Docházka – "+who(m,k)+", "+dayText(iso)+": ruční úprava zrušena",{key:k,m:"atte:"+m+":"+k+":"+iso});
      });
    });
  });
  const LA=a.attLocks||{},LB=b.attLocks||{};
  new Set([...Object.keys(LA),...Object.keys(LB)]).forEach(m=>{
    const x=LA[m]||{all:false,days:[]},y=LB[m]||{all:false,days:[]};
    if(!!x.all!==!!y.all)add("adjust","Docházka za "+monthLabel(m)+": celý měsíc "+(y.all?"uzamčen":"odemčen"),{m:"attl:"+m});
    const xs=new Set(x.days),ys=new Set(y.days);
    y.days.filter(d=>!xs.has(d)).forEach(d=>add("adjust","Docházka: den "+dayText(d)+" uzamčen",{m:"attl:"+d}));
    x.days.filter(d=>!ys.has(d)).forEach(d=>add("adjust","Docházka: den "+dayText(d)+" odemčen",{m:"attl:"+d}));
  });
}

