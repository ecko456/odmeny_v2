/* ==========================================================================
   VRÁTIT ZPĚT (verze 2.45)
   Každé uložení si zapamatuje, co přesně změnilo: seznam cest ve stavu s hodnotou před změnou
   (b, nebo d = předtím nebylo) a otiskem hodnoty po změně (h, „-“ = smazáno). S.undo drží
   záznamy za poslední 3 dny (UNDO_DAYS), velké změny nad limit se neukládají (pak zbývá
   Historie verzí). Vrácení zapíše zpátky jen ty cesty, které od té doby nikdo nezměnil
   (otisk sedí); ostatní přeskočí, takže pozdější práce se nepřepíše.
   ========================================================================== */
const UNDO_DAYS=3,UNDO_ID=/^u[a-z0-9]{4,24}$/,UNDO_MAX=400,UNDO_PATCH_MAX=1000000,UNDO_TOTAL_MAX=2500000;
const UNDO_SKIP=new Set(["log","undo","v","current","_demoIssue"]);
const isPlain=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
/** JSON se seřazenými klíči (stejná data = stejný text bez ohledu na pořadí klíčů). */
function undoCanon(v){
  if(v===undefined)return "~";
  if(Array.isArray(v))return "["+v.map(x=>x===undefined?"null":undoCanon(x)).join(",")+"]";
  if(isPlain(v))return "{"+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+":"+undoCanon(v[k])).join(",")+"}";
  return JSON.stringify(v);
}
/** Otisk hodnoty (FNV-1a nad kanonickým JSON, 2 × 32 bitů), „-“ = hodnota chybí. */
function undoHash(v){
  if(v===undefined)return "-";
  const s=undoCanon(v);let a=0x811c9dc5,b=0x9747b28c;
  for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,0x01000193)+((b>>>13)|0);}
  return (a>>>0).toString(36)+(b>>>0).toString(36)+":"+s.length.toString(36);
}
function undoEq(a,b){
  if(a===b)return true;
  if(typeof a!=="object"||typeof b!=="object"||a===null||b===null)return false;
  if(Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a)){if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(!undoEq(a[i],b[i]))return false;return true;}
  const ka=Object.keys(a).filter(k=>a[k]!==undefined),kb=Object.keys(b).filter(k=>b[k]!==undefined);
  if(ka.length!==kb.length)return false;
  for(const k of ka){if(!(k in b)||!undoEq(a[k],b[k]))return false;}
  return true;
}
/** Změny mezi dvěma stavy: objekty po klíčích, pole a hodnoty celé. */
function undoDiff(A,B){
  const out=[];
  const walk=(a,b,p)=>{
    if(isPlain(a)&&isPlain(b)){
      new Set([...Object.keys(a),...Object.keys(b)]).forEach(k=>{
        if(!p.length&&UNDO_SKIP.has(k))return;
        const x=a[k],y=b[k];
        if(x===undefined&&y===undefined)return;
        if(x===undefined)out.push({p:[...p,k],d:1,h:undoHash(y)});
        else if(y===undefined)out.push({p:[...p,k],b:x,h:"-"});
        else walk(x,y,[...p,k]);
      });
      return;
    }
    if(!undoEq(a,b))out.push({p,b:a,h:undoHash(b)});
  };
  walk(A||{},B||{},[]);
  return out;
}
function undoGet(st,p){let o=st;for(const k of p){if(!isPlain(o)&&!Array.isArray(o))return undefined;o=o[k];if(o===undefined)return undefined;}return o;}
function undoSet(st,p,v,del){
  let o=st;
  for(let i=0;i<p.length-1;i++){if(!isPlain(o[p[i]])){if(del)return;o[p[i]]={};}o=o[p[i]];}
  if(del)delete o[p[p.length-1]];else o[p[p.length-1]]=JSON.parse(JSON.stringify(v));
}
/** Nový záznam pro S.undo, nebo {big: true}, když je změna moc velká na uložení. */
function undoRecord(base,shared,meta){
  const ch=undoDiff(base,shared);
  if(!ch.length)return null;
  const size=JSON.stringify(ch).length;
  if(size>UNDO_PATCH_MAX)return {big:true};
  return {id:"u"+(meta.at||Date.now()).toString(36)+Math.random().toString(36).slice(2,6),at:meta.at||Date.now(),by:meta.by||"",card:meta.card||"",ch,size};
}
/** Jen poslední 3 dny a celkem do limitu (nejstarší pryč). */
function undoPrune(list,now){
  const from=(now||Date.now())-UNDO_DAYS*864e5;
  let out=(list||[]).filter(u=>u.at>=from).slice(-UNDO_MAX);
  let total=out.reduce((s,u)=>s+(u.size||JSON.stringify(u.ch).length),0);
  while(out.length&&total>UNDO_TOTAL_MAX){total-=out[0].size||JSON.stringify(out[0].ch).length;out=out.slice(1);}
  return out;
}
function cleanUndo(list){
  return (Array.isArray(list)?list:[]).filter(u=>u&&typeof u==="object"&&UNDO_ID.test(String(u.id))&&Array.isArray(u.ch)).slice(-UNDO_MAX).map(u=>({
    id:String(u.id),at:Number.isFinite(+u.at)?Math.round(+u.at):0,by:String(u.by==null?"":u.by).slice(0,60),card:/^[a-f0-9]{16}$/.test(String(u.card))?String(u.card):"",
    ch:u.ch.filter(c=>c&&Array.isArray(c.p)&&c.p.length&&c.p.length<=16&&c.p.every(k=>typeof k==="string"&&k.length<=200)&&typeof c.h==="string"&&!UNDO_SKIP.has(c.p[0]))
      .map(c=>c.d?{p:c.p.slice(),d:1,h:c.h.slice(0,40)}:{p:c.p.slice(),b:c.b===undefined?null:c.b,h:c.h.slice(0,40)}),
    size:Number.isFinite(+u.size)?Math.round(+u.size):0,
  }));
}
/** Záznamy historie, které jde vrátit: v posledních 3 dnech, nevrácené, se všemi změnami uloženými. */
function undoable(entry,st){
  st=st||S;
  if(!entry||!entry.u||!entry.u.length||entry.un)return false;
  const ids=new Set((st.undo||[]).map(u=>u.id));
  return entry.u.every(id=>ids.has(id));
}
/** Vrátí uložené změny (od nejnovější). Vrací {done, skip, ids, entries} – entries = záznamy
    historie, kterých se vrácení týká (sdílejí stejné uložení). */
function undoApply(st,ids,meta){
  const want=new Set(ids);
  const recs=(st.undo||[]).filter(u=>want.has(u.id)).sort((a,b)=>b.at-a.at);
  let done=0,skip=0;
  const left=new Map();
  recs.forEach(u=>{
    const keep=[];
    u.ch.forEach(c=>{
      const cur=undoGet(st,c.p);
      if(undoHash(cur)!==c.h){skip++;keep.push(c);return;}
      undoSet(st,c.p,c.b,!!c.d);done++;
    });
    left.set(u.id,keep);
  });
  const entries=(st.log||[]).filter(x=>x.u&&x.u.some(id=>want.has(id)));
  if(done){
    // vrácené části z uložených změn pryč; co se přeskočilo (mezitím změněné), zůstane
    st.undo=(st.undo||[]).map(u=>left.has(u.id)?{...u,ch:left.get(u.id),size:JSON.stringify(left.get(u.id)).length}:u).filter(u=>u.ch.length);
    // jako vrácené se označí záznamy, jejichž všechna uložení se teď vracela
    entries.filter(x=>x.u.every(id=>want.has(id))).forEach(x=>{x.un={at:(meta&&meta.at)||Date.now(),by:(meta&&meta.by)||""};});
  }
  return {done,skip,entries,recs:recs.length};
}

