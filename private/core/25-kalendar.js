/* ==========================================================================
   KALENDÁŘ V PRAVÉM PANELU (2.65): ke každému dni svátek, víkend, úkoly s termínem, konce trestů
   a vlastní poznámky. Poznámky jsou ve sdílených datech:
   S.calNotes[≤ 3000] = {id 'cn…', date ISO, text ≤ 1000, at, by}
   ========================================================================== */
const CAL_NOTES_MAX=3000, CAL_NOTE_LEN=1000;
function cleanCalNotes(a){
  const ids=new Set(), out=[];
  (Array.isArray(a)?a:[]).forEach(n=>{
    if(!n||typeof n!=="object")return;
    const id=String(n.id||""), date=String(n.date||""), text=String(n.text||"").trim().slice(0,CAL_NOTE_LEN);
    if(!/^cn[0-9a-z]{1,40}$/.test(id)||ids.has(id)||!ISO_DAY.test(date)||!text)return;
    ids.add(id);
    out.push({id,date,text,at:Number.isFinite(+n.at)?+n.at:0,by:String(n.by||"").slice(0,60)});
  });
  return out.sort((x,y)=>x.date<y.date?-1:x.date>y.date?1:x.at-y.at).slice(-CAL_NOTES_MAX);
}
function calNoteAdd(st,date,text,meta){
  text=String(text||"").trim().slice(0,CAL_NOTE_LEN);
  if(!ISO_DAY.test(String(date||"")))return {err:"Neplatné datum."};
  if(!text)return {err:"Napiš text poznámky."};
  st.calNotes=st.calNotes||[];
  if(st.calNotes.length>=CAL_NOTES_MAX)return {err:"Poznámek je moc (nejvýš "+CAL_NOTES_MAX+"), smaž nějaké starší."};
  const n={id:"cn"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),date,text,at:(meta&&meta.at)||Date.now(),by:(meta&&meta.by)||""};
  st.calNotes.push(n);
  st.calNotes=cleanCalNotes(st.calNotes);
  return n;
}
function calNoteDel(st,id){
  const n=(st.calNotes||[]).length;
  st.calNotes=(st.calNotes||[]).filter(x=>x.id!==id);
  return st.calNotes.length<n;
}
/** Svátek dne (název), nebo "" */
function calHoliday(iso){
  const y=+iso.slice(0,4),m=+iso.slice(5,7),d=+iso.slice(8,10);
  return holidays(y)[m+"-"+d]||"";
}
/** Události ve dnech od–do (ISO včetně): {iso: [{k: hol|task|end|note, text, id?, key?, late?}]} */
function calEvents(from,to,st,today){
  st=st||S;
  const out={};
  const put=(iso,e)=>{if(iso>=from&&iso<=to)(out[iso]=out[iso]||[]).push(e);};
  for(let t=Date.UTC(+from.slice(0,4),+from.slice(5,7)-1,+from.slice(8,10)),end=Date.UTC(+to.slice(0,4),+to.slice(5,7)-1,+to.slice(8,10));t<=end;t+=864e5){
    const iso=new Date(t).toISOString().slice(0,10), h=calHoliday(iso);
    if(h)put(iso,{k:"hol",text:h});
  }
  ((st.tasks&&st.tasks.list)||[]).forEach(t=>{
    if(!t.due||!TK_OPEN.has(t.state))return;
    put(t.due,{k:"task",id:t.id,text:t.person?"Požadavek: "+t.title+(t.pname?" ("+t.pname+")":""):t.title,late:!!(today&&t.due<today)});
  });
  Object.values(st.employees||{}).forEach(e=>{
    if(e.end&&!e.excluded)put(e.end,{k:"end",key:e.key,text:"Konec trestu: "+e.last+" "+e.first});
  });
  (st.calNotes||[]).forEach(n=>put(n.date,{k:"note",id:n.id,text:n.text,by:n.by,at:n.at}));
  return out;
}
/** Mřížka měsíce pro kalendář: týdny od pondělí, dny mimo měsíc mají out: true */
function calGrid(month){
  const y=+month.slice(0,4),m=+month.slice(5,7);
  const first=Date.UTC(y,m-1,1), dow=(new Date(first).getUTCDay()+6)%7;
  const start=first-dow*864e5, last=Date.UTC(y,m,0), days=Math.round((last-start)/864e5)+1, n=Math.ceil(days/7)*7;
  const out=[];
  for(let i=0;i<n;i++){
    const d=new Date(start+i*864e5), iso=d.toISOString().slice(0,10), wd=(d.getUTCDay()+6)%7;
    out.push({iso,d:d.getUTCDate(),out:iso.slice(0,7)!==month,we:wd>=5,hol:calHoliday(iso)});
  }
  return out;
}
function calChanges(A,B,add){
  const a=A||[],b=B||[];
  const am=new Map(a.map(n=>[n.id,n])), bm=new Set(b.map(n=>n.id));
  const short=t=>t.length>80?t.slice(0,80)+"…":t;
  b.forEach(n=>{
    const o=am.get(n.id);
    if(!o)add("task","Poznámka v kalendáři na "+dayText(n.date)+": „"+short(n.text)+"“",{m:"cal:"+n.id});
    else if(o.text!==n.text||o.date!==n.date)add("task","Poznámka v kalendáři na "+dayText(n.date)+" upravena: „"+short(n.text)+"“",{m:"cal:"+n.id+":e"});
  });
  a.filter(n=>!bm.has(n.id)).forEach(n=>add("task","Poznámka v kalendáři na "+dayText(n.date)+" smazána: „"+short(n.text)+"“",{m:"cal:"+n.id+":x"}));
}
