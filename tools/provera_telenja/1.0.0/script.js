// ==UserScript==
// @name         AIRS – Provera telenja (VetAssist FINAL)
// @namespace    airs-successor-textarea
// @version      2.10.6.5
// @description  VetAssist verzija alata za proveru telenja: auto-start, auto-pick, rad sa bilo kog dela AIRS-a, XLS eksport, završni panel.
// @match        https://airsso.vet.minpolj.gov.rs/pls/aimcs_prod/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
(function(){
  'use strict';

  const root = (() => {
    try { return window.top || window; } catch { return window; }
  })();

  if (root.__vetassist_provera_telenja_final_loaded) {
    console.log("VetAssist tool already loaded: provera_telenja FINAL v2.10.6.5");
    return;
  }
  root.__vetassist_provera_telenja_final_loaded = true;

  console.log("VetAssist tool loaded: provera_telenja FINAL v2.10.6.5");

  const TOOL_CODE = "provera_telenja";
  const START_PAYLOADS_KEY = "vetassist_tool_start_payloads_v1";
  const ACTIVE_TOOL_KEY = "vetassist_active_tool_v1";
  const RETURN_BTN_ID = "vetassist-return-picker-btn";
  const COMPLETION_PANEL_ID = "vetassist-provera-telenja-complete-panel";

  const SS_KEY='airs_successor_textarea_v2106_xls';
  const FORM_URL='/pls/aimcs_prod/W_SUCCESSOR.STARTUP';

  const $=s=>document.querySelector(s);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const now =()=>new Date().toLocaleTimeString('sr-RS');
  const pad2=n=>String(n).padStart(2,'0');

  const ST=Object.assign({
    active:false, phase:'', idx:0,
    rows:[], results:[], log:[],
    delay:450, timeoutSec:3, tolDefault:0,
    selPrefix:'', selId:'', selSubmit:'',
    rawInput:'', includeDesc:false,
    debug:false, debugSnips:[],
    doubleCheck:true, dcFactor:1.6,
    dcMode:'idle', dcTriedIdx:-1, dcPending:null,
    dedupeDates:true,
    _exported:false,
    _runId:null
  }, JSON.parse(sessionStorage.getItem(SS_KEY)||'{}'));

  const save=()=>sessionStorage.setItem(SS_KEY, JSON.stringify(ST));

  function clearPendingStartPayload(){
    try{
      const all = JSON.parse(sessionStorage.getItem(START_PAYLOADS_KEY) || '{}');
      delete all[TOOL_CODE];
      sessionStorage.setItem(START_PAYLOADS_KEY, JSON.stringify(all));
    }catch{}
  }

  function getPendingStartPayload(){
    try{
      const all = JSON.parse(sessionStorage.getItem(START_PAYLOADS_KEY) || '{}');
      return all[TOOL_CODE] || null;
    }catch{
      return null;
    }
  }

  function clearActiveTool(){
    try{ sessionStorage.removeItem(ACTIVE_TOOL_KEY); }catch{}
  }

  function removeReturnButton(){
    try{
      const btn = document.getElementById(RETURN_BTN_ID) || window.top.document.getElementById(RETURN_BTN_ID);
      if(btn) btn.remove();
    }catch{}
  }

  function removeCompletionPanel(){
    try{
      const old = window.top.document.getElementById(COMPLETION_PANEL_ID);
      if(old) old.remove();
    }catch{}
  }

  function ensureCompletionStyles(){
    try{
      const d = window.top.document;
      if(d.getElementById('vetassist-provera-telenja-complete-styles')) return;
      const style=d.createElement('style');
      style.id='vetassist-provera-telenja-complete-styles';
      style.textContent=`
        #${COMPLETION_PANEL_ID}{
          position:fixed;top:120px;right:18px;width:380px;z-index:2147483647;
          background:#f7f5e8;border:1px solid #9e9b87;border-radius:10px;
          box-shadow:0 8px 24px rgba(0,0,0,.18);color:#222;font:13px/1.4 Arial,sans-serif
        }
        #${COMPLETION_PANEL_ID} .va-head{
          padding:10px 12px;background:#e9e3c6;border-bottom:1px solid #c9c19d;
          font-weight:700;font-size:14px
        }
        #${COMPLETION_PANEL_ID} .va-body{padding:12px}
        #${COMPLETION_PANEL_ID} .va-ok{
          margin-bottom:10px;padding:8px 10px;border:1px solid #9bc7a4;background:#f4fff6;border-radius:8px
        }
        #${COMPLETION_PANEL_ID} .va-meta{
          display:grid;grid-template-columns:1fr;gap:6px;margin-top:10px
        }
        #${COMPLETION_PANEL_ID} .va-row{
          padding:6px 8px;border:1px solid #d7d0b0;background:#faf7ea;border-radius:8px
        }
        #${COMPLETION_PANEL_ID} .va-actions{display:flex;gap:8px;margin-top:12px}
        #${COMPLETION_PANEL_ID} .va-btn{
          border:1px solid #9d9778;background:#fffdf2;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:700
        }
        #${COMPLETION_PANEL_ID} .va-btn-primary{
          border-color:#6e8f73;background:#eaf8ed
        }
      `;
      d.documentElement.appendChild(style);
    }catch{}
  }

  function showCompletionPanel(summary){
    try{
      const d = window.top.document;
      ensureCompletionStyles();
      removeCompletionPanel();

      const box=d.createElement('div');
      box.id=COMPLETION_PANEL_ID;
      box.innerHTML=
        `<div class="va-head">VetAssist — završeno</div>
         <div class="va-body">
           <div class="va-ok"><b>Obrada je uspešno završena.</b></div>
           <div class="va-meta">
             <div class="va-row">Obrađena grla: <b>${summary.rowCount}</b></div>
             <div class="va-row">Pozitivna poklapanja: <b>${summary.matchCount}</b></div>
             <div class="va-row">Nepoklapanja: <b>${summary.noMatchCount}</b></div>
             <div class="va-row">Fajl: <b>${summary.fileName || '-'}</b></div>
             <div class="va-row">Vreme završetka: <b>${summary.finishedAt || '-'}</b></div>
           </div>
           <div class="va-actions">
             <button id="va-pt-back" class="va-btn va-btn-primary">Nazad na alate</button>
             <button id="va-pt-close" class="va-btn">Zatvori</button>
           </div>
         </div>`;
      d.documentElement.appendChild(box);

      box.querySelector('#va-pt-back')?.addEventListener('click', ()=>{
        clearActiveTool();
        clearPendingStartPayload();
        removeCompletionPanel();
        location.reload();
      });

      box.querySelector('#va-pt-close')?.addEventListener('click', ()=>{
        removeCompletionPanel();
      });
    }catch(e){
      console.error('Completion panel failed', e);
    }
  }

  function ensureAutoPick(){
    ST.selPrefix='input[name="p_state"]';
    ST.selId='input[name="p_id_animal"]';
    ST.selSubmit='input[name="p_submit"], input[type="submit"], input[type="button"], button';
    save();
  }

  const setStatus=t=>{ const n=$('#sc-status'); if(n) n.textContent='Status: '+t; save(); };
  function log(m){ ST.log.push(`[${now()}] ${m}`); if(ST.log.length>3000) ST.log.shift(); save(); const ta=$('#sc-log'); if(ta){ ta.value=ST.log.join('\n'); ta.scrollTop=ta.scrollHeight; } }

  if(!document.getElementById('sc-panel')){
    const panel=document.createElement('div');
    Object.assign(panel.style,{
      position:'fixed',right:'20px',top:'20px',zIndex:999999,width:'640px',
      background:'#fff',border:'1px solid #dcdcdc',borderRadius:'12px',
      padding:'12px',boxShadow:'0 10px 26px rgba(0,0,0,.18)',font:'13px system-ui, Arial'
    });
    panel.id='sc-panel';
    panel.innerHTML=`
      <div style="font-weight:700;margin-bottom:8px">AIRS – Provera telenja (VetAssist)</div>
      <div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap">
        <button id="sc-autopick" style="padding:6px 8px">Auto-pick</button>
        <button id="sc-test" style="padding:6px 8px">Test selektora</button>
      </div>
      <textarea id="sc-data" rows="9" placeholder="DATE,PREFIX,ID ili PREFIX,ID,DATE" style="width:100%;box-sizing:border-box"></textarea>
      <div style="display:flex;gap:12px;align-items:center;margin:8px 0;flex-wrap:wrap">
        <label>Pauza (ms):</label><input id="sc-delay" type="number" min="150" value="${+ST.delay||450}" style="width:90px">
        <label>Max čekanje (s):</label><input id="sc-timeout" type="number" min="2" value="${+ST.timeoutSec||3}" style="width:80px">
        <label>Tolerancija ± (dani):</label><input id="sc-toldef" type="number" min="0" value="${+ST.tolDefault||0}" style="width:90px">
        <label style="display:inline-flex;gap:6px;align-items:center;">
          <input id="sc-desc" type="checkbox" ${ST.includeDesc?'checked':''}> Uključi unuke/praunuke (101+, 201+)
        </label>
        <label style="display:inline-flex;gap:6px;align-items:center;">
          <input id="sc-dedupe" type="checkbox" ${ST.dedupeDates?'checked':''}> Ukloni duplikate
        </label>
        <label style="display:inline-flex;gap:6px;align-items:center;">
          <input id="sc-debug" type="checkbox" ${ST.debug?'checked':''}> Debug
        </label>
        <label style="display:inline-flex;gap:6px;align-items:center;">
          <input id="sc-dc" type="checkbox" ${ST.doubleCheck?'checked':''}> Double-check
        </label>
        <label>DC faktor:</label><input id="sc-dcf" type="number" step="0.1" min="1.1" value="${+ST.dcFactor||1.6}" style="width:70px">
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="sc-start" style="flex:1;padding:8px 10px">Start</button>
        <button id="sc-stop"  style="padding:8px 10px">Stop</button>
        <button id="sc-reset" style="padding:8px 10px">Reset</button>
        <button id="sc-xls"   style="padding:8px 10px">Excel (.xls)</button>
        <button id="sc-dbgcsv" style="padding:8px 10px">Debug CSV</button>
        <button id="sc-dbgclr" style="padding:8px 10px">Obriši Debug</button>
      </div>
      <div id="sc-status" style="margin-top:8px">Status: ${ST.active?'u toku…':'spremno'}</div>
      <textarea id="sc-log" rows="12" readonly style="width:100%;box-sizing:border-box;margin-top:6px;background:#fafafa;border:1px solid #eee"></textarea>`;
    panel.style.display='none';
    document.body.appendChild(panel);
    $('#sc-log').value=(ST.log||[]).join('\n');
    $('#sc-data').value=ST.rawInput||'';
  }

  const setChk=(id,key)=>$(id).onchange=e=>{ ST[key]=e.target.checked; save(); };
  $('#sc-autopick').onclick=()=>{ ensureAutoPick(); log('Auto-pick postavljen'); setStatus('Auto-pick OK'); };
  $('#sc-test').onclick=async ()=>{ const pack=await ensureForm(true); log(pack?'TEST: forma pronađena ✓':'TEST: forma NIJE pronađena ✗'); };

  setChk('#sc-desc','includeDesc');
  setChk('#sc-dedupe','dedupeDates');
  setChk('#sc-debug','debug');
  setChk('#sc-dc','doubleCheck');
  $('#sc-dcf').onchange =e=>{ const v=Math.max(1.1,+e.target.value||1.6); ST.dcFactor=v; save(); log('DC faktor = '+v); };

  function dedupeDatesByValue(arr){
    const seen = new Set();
    const out = [];
    for(const d of arr){
      const key = d instanceof Date ? d.getTime() : String(d);
      if(seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
    return out;
  }

  function splitDateParts(s){
    const m = String(s).trim().match(/^(\d{1,4})[.\-\/](\d{1,2})[.\-\/](\d{1,4})$/);
    if(!m) return null;
    return [m[1], m[2], m[3]];
  }

  function validTargetRaw(s){
    return !!splitDateParts(s);
  }

  function makeDate(y,m,d){
    const dt = new Date(y, m-1, d);
    if(
      dt.getFullYear() !== y ||
      dt.getMonth() !== m-1 ||
      dt.getDate() !== d
    ) return null;
    return dt;
  }

  function dateToCanonical(dt){
    return `${pad2(dt.getDate())}.${pad2(dt.getMonth()+1)}.${dt.getFullYear()}`;
  }

  function parseTargetCandidates(raw){
    const parts = splitDateParts(raw);
    if(!parts) return [];

    const a = +parts[0];
    const b = +parts[1];
    const c = +parts[2];
    const out = [];

    if(/^\d{4}$/.test(parts[0])){
      const dt = makeDate(a,b,c);
      if(dt) out.push(dt);
      return dedupeDatesByValue(out);
    }

    if(a > 12 && b >= 1 && b <= 12){
      const dt = makeDate(c,b,a);
      if(dt) out.push(dt);
      return dedupeDatesByValue(out);
    }

    if(b > 12 && a >= 1 && a <= 12){
      const dt = makeDate(c,a,b);
      if(dt) out.push(dt);
      return dedupeDatesByValue(out);
    }

    const dt1 = makeDate(c,b,a);
    const dt2 = makeDate(c,a,b);
    if(dt1) out.push(dt1);
    if(dt2) out.push(dt2);

    return dedupeDatesByValue(out);
  }

  function normalizeTarget(raw){
    const cands = parseTargetCandidates(raw);
    if(!cands.length) return String(raw).trim();
    return dateToCanonical(cands[0]);
  }

  function toDate(s){
    if(s instanceof Date) return s;
    const cands = parseTargetCandidates(s);
    return cands[0] || null;
  }

  function getTargetCandidateDates(raw){
    return parseTargetCandidates(raw);
  }

  function fmtShort(s){
    const dt = toDate(s);
    if(!dt) return String(s);
    return `${pad2(dt.getDate())}.${pad2(dt.getMonth()+1)}.${String(dt.getFullYear()).slice(2)}`;
  }

  function dayDiff(a,b){
    const A = a instanceof Date ? new Date(a) : toDate(a);
    const B = b instanceof Date ? new Date(b) : toDate(b);
    if(!A || !B) return NaN;
    A.setHours(0,0,0,0);
    B.setHours(0,0,0,0);
    return Math.round((A-B)/86400000);
  }

  function withinTol(targetRaw,cand,tol){
    const candidateDate = cand instanceof Date ? cand : toDate(cand);
    if(!candidateDate) return false;
    const targets = getTargetCandidateDates(targetRaw);
    return targets.some(t => Math.abs(dayDiff(candidateDate, t)) <= tol);
  }

  function bestDiffForTarget(targetRaw, foundDates){
    const targets = getTargetCandidateDates(targetRaw);
    if(!targets.length || !foundDates.length) return '';

    let best = null;
    for(const fd of foundDates){
      const f = fd instanceof Date ? fd : toDate(fd);
      if(!f) continue;
      for(const t of targets){
        const diff = dayDiff(f, t);
        if(best === null || Math.abs(diff) < Math.abs(best)) best = diff;
      }
    }
    return best === null ? '' : ((best >= 0 ? '+' : '') + best);
  }

  function normalizeIdString(s){
    s=String(s).trim();
    const sci=/^(\d+(?:[.,]\d+)?)e\+?(\d+)$/i.exec(s);
    if(sci){
      const mant=sci[1].replace(',','.');
      const exp=+sci[2];
      const parts=mant.split('.');
      const ints=parts[0];
      const decs=(parts[1]||'');
      const zeros=Math.max(0, exp - decs.length);
      return (ints + decs + '0'.repeat(zeros)).replace(/^0+/, '') || '0';
    }
    return s.replace(/\D+/g,'');
  }

  function parseTextarea(text){
    const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean), out=[];
    for(const l of lines){
      const sep=/;/.test(l)?';':/\t/.test(l)?'\t':',';
      const cols=l.split(sep).map(s=>s.trim());
      if(cols.length<3){ log(`Preskačem nevalidan red: "${l}"`); continue; }

      let dateRaw='', prefix='', idRaw='';

      if(validTargetRaw(cols[0])){
        dateRaw=cols[0];
        prefix=cols[1]||'';
        idRaw=cols[2]||'';
      } else if(validTargetRaw(cols[2])){
        dateRaw=cols[2];
        prefix=cols[0]||'';
        idRaw=cols[1]||'';
      } else {
        log(`Preskačem (nema validnog datuma u 1. ili 3. koloni): "${l}"`);
        continue;
      }

      if(!prefix || !idRaw){
        log(`Preskačem (nema prefix/id): "${l}"`);
        continue;
      }

      const id = normalizeIdString(idRaw);
      if(!id){
        log(`Preskačem (ID nije prepoznat): "${l}"`);
        continue;
      }

      out.push({
        prefix,
        id,
        targetRaw: dateRaw.trim(),
        target: normalizeTarget(dateRaw.trim())
      });
    }
    return out;
  }

  function getRunId(){
    try{
      if(window.top.__AIRS_RUN_ID){ ST._runId = window.top.__AIRS_RUN_ID; save(); return ST._runId; }
    }catch{}
    if(!ST._runId){
      ST._runId = 'run_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
      try{ window.top.__AIRS_RUN_ID = ST._runId; }catch{}
      save();
    }
    return ST._runId;
  }

  function allowExportOnce(){
    const runId = getRunId();
    try{
      if(window.top.__AIRS_EXPORT_DONE) return false;
      const g = localStorage.getItem('airs_exported_global');
      if(g === '1') return false;
    }catch{}
    if(ST._exported) return false;
    try{
      if(window.top.__AIRS_EXPORTED_RUNID === runId) return false;
    }catch{}
    try{
      if(localStorage.getItem('airs_exported_'+runId)==='1') return false;
    }catch{}

    ST._exported = true; save();
    try{ window.top.__AIRS_EXPORTED_RUNID = runId; }catch{}
    try{ localStorage.setItem('airs_exported_'+runId,'1'); }catch{}
    return true;
  }

  function finishExportMark(){
    try{ window.top.__AIRS_EXPORT_DONE = true; }catch{}
    try{ localStorage.setItem('airs_exported_global','1'); }catch{}
  }

  function downloadBinary(blob, filename){
    if(!allowExportOnce()){ log('Auto-izvoz: preskočen (guard)'); return ''; }
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=filename;
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{
      URL.revokeObjectURL(url);
      a.remove();
      finishExportMark();
    }, 800);
    return filename;
  }

  function exportXLS(rows){
    const esc = v => String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const th = t => `<th style="border:1px solid #ccc;padding:4px;background:#f5f5f5;text-align:left">${esc(t)}</th>`;
    const td = (t,{warn=false}={})=>{
      const base='border:1px solid #ddd;padding:4px;';
      const st = warn ? base+'color:#c00;font-weight:700;background:#ffecec' : base;
      return `<td style="${st}">${esc(t)}</td>`;
    };
    const headRow = `<tr>${th('OZNAKA DRŽAVE')}${th('ID BROJ GRLA')}${th('TRAŽENI DATUM')}${th('NAĐENI DATUM')}${th('TAČNO')}${th('DANA RAZLIKE')}${th('DC')}</tr>`;
    const body = (rows||[]).map(r=>{
      const warn = String(r.match||'')==='NE';
      return `<tr>${td(r.prefix||'')}${td(r.id||'',{warn})}${td(r.target||'')}${td(r.found||'',{warn})}${td(r.match||'',{warn})}${td(r.diff||'')}${td(r.dc?'1':'')}</tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="content-type" content="application/vnd.ms-excel; charset=UTF-8"></head><body>
<table border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:12px">
  ${headRow}${body}
</table></body></html>`;
    return new Blob([html], { type: 'application/vnd.ms-excel' });
  }

  function dbgPush(obj){
    if(!ST.debug) return;
    try{
      ST.debugSnips.push(obj);
      if(ST.debugSnips.length>1000) ST.debugSnips.shift();
      save();
    }catch(e){ log('DEBUG push err: '+e); }
  }

  function dbgCsv(){
    const esc = v => `"${String(v??'').replace(/"/g,'""').replace(/\r?\n/g,'⏎')}"`;
    const head = [
      'IDX','OZNAKA DRŽAVE','ID BROJ GRLA','TRAŽENI DATUM','PHASE','WHY','CODE','FOUND_COUNT',
      'ROW_TEXT','CELL0','CELL1','CELL2','CELL3','CELL4','ROW_HTML','TIMESTAMP'
    ].join(';');
    const body = (ST.debugSnips||[]).map(d=>[
      d.idx, d.prefix, d.id, d.target, d.phase, d.why, d.code, (d.foundCount||0),
      d.rowText, (d.cells?.[0]??''), (d.cells?.[1]??''), (d.cells?.[2]??''), (d.cells?.[3]??''), (d.cells?.[4]??''),
      d.rowHtml, d.ts
    ].map(esc).join(';')).join('\r\n');
    return '\uFEFF'+head+'\r\n'+body;
  }

  $('#sc-dbgcsv').onclick=()=>{
    if(!(ST.debugSnips||[]).length){ setStatus('Debug prazan'); return; }
    const blob=new Blob([dbgCsv()],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`AIRS_telenje_DEBUG_${new Date().toISOString().slice(0,10)}.csv`;
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },700);
  };
  $('#sc-dbgclr').onclick =()=>{ ST.debugSnips=[]; save(); setStatus('Debug obrisan'); log('DEBUG cleared'); };

  function getAllDocuments(){
    const docs = [];
    const seen = new Set();

    function addDoc(doc){
      try{
        if(!doc) return;
        if(seen.has(doc)) return;
        seen.add(doc);
        docs.push(doc);
      }catch{}
    }

    function walk(win){
      try{
        addDoc(win.document);
      }catch{}

      try{
        for(let i=0;i<win.frames.length;i++){
          walk(win.frames[i]);
        }
      }catch{}

      try{
        const frameEls = win.document.querySelectorAll('frame, iframe');
        frameEls.forEach(el=>{
          try{
            if(el.contentWindow) walk(el.contentWindow);
            else if(el.contentDocument) addDoc(el.contentDocument);
          }catch{}
        });
      }catch{}
    }

    try{
      walk(window.top);
    }catch{
      addDoc(document);
    }

    return docs;
  }

  let GO_LOCK=false;
  let DC_LOCK=false;

  $('#sc-start').onclick=()=>{
    removeCompletionPanel();
    ensureAutoPick();

    if(!ST.selPrefix||!ST.selId){ setStatus('Selektori nisu pronađeni'); return; }
    ST.delay=Math.max(150,+$('#sc-delay').value||450);
    ST.timeoutSec=Math.max(2,+$('#sc-timeout').value||3);
    ST.tolDefault=Math.max(0,+$('#sc-toldef').value||0);
    ST.rawInput=$('#sc-data').value;
    ST.includeDesc=$('#sc-desc').checked;
    ST.dedupeDates=$('#sc-dedupe').checked;
    ST.rows=parseTextarea(ST.rawInput);
    if(!ST.rows.length){ setStatus('Nijedan red nije validan'); save(); return; }
    if(!Array.isArray(ST.debugSnips)) ST.debugSnips=[];

    ST.results=[];
    ST.idx=0;
    ST.active=true;
    ST.phase='enter';
    ST.dcMode='idle';
    ST.dcTriedIdx=-1;
    ST.dcPending=null;
    ST._exported=false;

    try{
      if(window.top.__AIRS_RUN_ID){ ST._runId = window.top.__AIRS_RUN_ID; }
      else {
        ST._runId = 'run_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
        window.top.__AIRS_RUN_ID = ST._runId;
      }
    }catch{
      ST._runId = 'run_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
    }
    save();

    try{ localStorage.removeItem('airs_exported_global'); }catch{}
    try{ window.top.__AIRS_EXPORT_DONE = false; }catch{}

    log(`Start: redova=${ST.rows.length}, delay=${ST.delay}, timeout=${ST.timeoutSec}, tol=${ST.tolDefault}, desc=${ST.includeDesc?'DA':'NE'}, debug=${ST.debug?'ON':'OFF'}, DC=${ST.doubleCheck?'ON':'OFF'}`);
    setStatus('Krećem…');
    go();
  };

  $('#sc-stop').onclick =()=>{ ST.active=false; save(); setStatus('Zaustavljeno'); log('STOP'); };
  $('#sc-reset').onclick=()=>{
    Object.assign(ST,{
      active:false, phase:'', idx:0, rows:[], results:[], log:[],
      rawInput:ST.rawInput, debug:ST.debug, debugSnips:ST.debugSnips,
      doubleCheck:ST.doubleCheck, dcFactor:ST.dcFactor, dcMode:'idle',
      dcTriedIdx:-1, dcPending:null, dedupeDates:ST.dedupeDates,
      _exported:false, _runId:ST._runId
    });
    save();
    $('#sc-log').value='';
    setStatus('Reset.');
  };
  $('#sc-xls').onclick  =()=>{
    if(!ST.results.length){ setStatus('Nema rezultata za Excel'); return; }
    downloadBinary(exportXLS(ST.results), `AIRS_telenje_${new Date().toISOString().slice(0,10)}.xls`);
  };

  async function go(){
    if(!ST.active) return;
    if(GO_LOCK || ST.dcMode!=='idle'){
      if(ST.dcMode!=='idle') log('go(): DC u toku → skip');
      return;
    }
    GO_LOCK=true;
    try{
      if(ST.idx>=ST.rows.length){
        ST.active=false; save();

        let fileName = '';
        if(ST.results.length){
          fileName = downloadBinary(exportXLS(ST.results), `AIRS_telenje_${new Date().toISOString().slice(0,10)}.xls`) || '';
          if(ST._exported) log('Auto-izvoz: Excel (.xls) preuzet.');
          setStatus('Gotovo (XLS preuzet)');
        } else {
          setStatus('Gotovo (nema rezultata)');
          log('Kraj obrade – nema rezultata.');
        }

        clearPendingStartPayload();
        clearActiveTool();
        removeReturnButton();

        const matchCount = (ST.results||[]).filter(r => String(r.match||'') === 'DA').length;
        const noMatchCount = (ST.results||[]).filter(r => String(r.match||'') !== 'DA').length;
        showCompletionPanel({
          rowCount: (ST.results||[]).length,
          matchCount,
          noMatchCount,
          fileName,
          finishedAt: new Date().toLocaleTimeString('sr-RS')
        });
        return;
      }

      const row=ST.rows[ST.idx];
      if(ST.phase!=='enter'&&ST.phase!=='scan'){ ST.phase='enter'; save(); }

      if(ST.phase==='enter'){
        const ok=await submitForm(row.prefix,row.id);
        if(!ok){
          log('submitForm: neuspeh');
          pushRes(row,row.targetRaw || row.target,'(nema u VB)','NE','');
          return await nextAndForm();
        }
      }

      if(ST.phase==='scan'){
        log('waitPotomak: start');
        let datesRaw=await waitPotomak(ST.timeoutSec, row.prefix, row.id, ST.includeDesc, {broad:false});

        if((!datesRaw || !datesRaw.length) && ST.doubleCheck && ST.dcTriedIdx!==ST.idx){
          ST.dcMode='armed';
          ST.dcTriedIdx=ST.idx;
          ST.dcPending={prefix:row.prefix,id:row.id,target:row.target,targetRaw:row.targetRaw,idx:ST.idx};
          save();
          log('DC: prvi prolaz nema redova → ARM + resubmit (kratki)');
          await dcResubmit(row.prefix,row.id);
          return;
        }

        if(!datesRaw || !datesRaw.length){
          pushRes(row,row.targetRaw || row.target,'(nema u VB)','NE','', true);
          log(`Rezultat: ${row.prefix} ${row.id} → [nema u VB], match=NE`);
          await nextAndForm();
          return;
        }

        renderAndStoreResult(row, datesRaw, false);
        await nextAndForm();
      }
    } finally {
      GO_LOCK=false;
    }
  }

  function renderAndStoreResult(row, datesRaw, isDC){
    const freq=new Map();
    for(const d of datesRaw) freq.set(d,(freq.get(d)||0)+1);
    const unique=[...freq.keys()];

    const foundDisplay = ST.dedupeDates
      ? unique.map(d => fmtShort(d)).join(' | ')
      : unique.map(d => {
          const n=freq.get(d);
          const s=fmtShort(d);
          return n>1 ? `${s}x${n}` : s;
        }).join(' | ');

    const targetLabel = row.targetRaw || row.target;
    const tol=ST.tolDefault;
    const match=unique.some(d=>withinTol(targetLabel, d, tol));
    const diffStr = bestDiffForTarget(targetLabel, unique);

    pushRes(row, targetLabel, foundDisplay, match?'DA':'NE', diffStr, isDC);
    log(`Rezultat${isDC?' (DC)':''}: ${row.prefix} ${row.id} → [${foundDisplay||'nema'}], match=${match?'DA':'NE'}, diff=${diffStr}`);
  }

  async function nextAndForm(){
    ST.idx++;
    ST.phase='enter';
    save();
    try{ window.top.location.href=FORM_URL; }catch{}
    setTimeout(()=>{ if(ST.active && ST.dcMode==='idle'){ log('Kick: povratak na formu → go()'); go(); } }, 350);
  }

  function getDocUrl(d){
    try{ return String(d.defaultView?.location?.href || ''); }catch{ return ''; }
  }

  function docLooksLikeSuccessor(d){
    try{
      const url = getDocUrl(d).toUpperCase();
      const txt = String(d.body?.innerText || '').toUpperCase();
      return url.includes('/W_SUCCESSOR.STARTUP') || txt.includes('POTOMSTVO ŽIVOTINJE') || txt.includes('POTOMSTVO ZIVOTINJE') || txt.includes('POTOMAK ŽIVOTINJE') || txt.includes('POTOMAK ZIVOTINJE');
    }catch{
      return false;
    }
  }

  function topLooksLikeSuccessor(){
    try{
      const url = String(window.top.location.href || '').toUpperCase();
      const txt = String(window.top.document?.body?.innerText || '').toUpperCase();
      return url.includes('/W_SUCCESSOR.STARTUP') || txt.includes('POTOMSTVO ŽIVOTINJE') || txt.includes('POTOMSTVO ZIVOTINJE') || txt.includes('POTOMAK ŽIVOTINJE') || txt.includes('POTOMAK ZIVOTINJE');
    }catch{
      return false;
    }
  }

  function findSubmit(d){
    if(ST.selSubmit){
      try{
        const el=d.querySelector(ST.selSubmit);
        if(el) return el;
      }catch{}
    }
    const candidates=[...d.querySelectorAll('button, input[type="submit"], input[type="button"], input[name="p_submit"]')];
    let btn = candidates.find(el=>/potvrdi|prikaži potomstvo|prikazi potomstvo/i.test(el.value||el.textContent||''))||null;
    if(!btn) btn = candidates[0]||null;
    return btn;
  }

  function findFormInDocs(){
    for(const d of getAllDocuments()){
      try{
        if(!docLooksLikeSuccessor(d)) continue;

        const inpPrefix = ST.selPrefix ? d.querySelector(ST.selPrefix) : d.querySelector('input[name="p_state"]');
        const inpId     = ST.selId     ? d.querySelector(ST.selId)     : d.querySelector('input[name="p_id_animal"]');

        if(inpPrefix && inpId){
          const form = inpPrefix.closest('form') || inpId.closest('form') || (d.forms ? d.forms[0] : null);
          if(form){
            const btn = findSubmit(d);
            return {doc:d, form, inpPrefix, inpId, btn};
          }
        }
      }catch{}
    }
    return null;
  }

  async function ensureForm(testOnly=false){
    const deadline=Date.now()+12000;

    while(Date.now()<deadline){
      if(!topLooksLikeSuccessor()){
        if(testOnly) return null;
        try{ window.top.location.href=FORM_URL; }catch{}
        await sleep(220);
        continue;
      }

      const pack=findFormInDocs();
      if(pack) return pack;

      if(testOnly) return null;
      await sleep(150);
    }
    return null;
  }

  function realClick(el){
    if(!el) return;
    const ev = (type) => el.dispatchEvent(new MouseEvent(type, {bubbles:true, cancelable:true, view:window}));
    el.focus();
    ev('mousedown');
    ev('mouseup');
    ev('click');
  }

  async function submitForm(prefix,id){
    const pack=await ensureForm();
    if(!pack){
      log('Forma nije pronađena na W_SUCCESSOR');
      return false;
    }

    const {form,inpPrefix,inpId,btn}=pack;
    const typeWrite=(el,val)=>{
      el.focus();
      el.value='';
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.value=val;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    };

    typeWrite(inpPrefix, String(prefix).trim());
    typeWrite(inpId, String(id));
    log(`Uneto na W_SUCCESSOR: PREFIX=${prefix}, ID=${id}`);

    ST.phase='scan';
    save();

    await sleep(Math.max(150, ST.delay));

    try{
      if(btn){
        realClick(btn);
        log('realClick(POTVRDI / PRIKAŽI POTOMSTVO) poslat');
      } else if(typeof form.requestSubmit==='function'){
        form.requestSubmit();
        log('form.requestSubmit() poslat (fallback)');
      } else if(typeof form.submit==='function'){
        form.submit();
        log('form.submit() poslat (fallback)');
      } else {
        form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
        log('submit event dispatch (fallback)');
      }
    }catch(e){
      log('submit exception: '+e);
    }

    setTimeout(()=>{
      if(ST.active && ST.phase==='scan' && ST.dcMode==='idle'){
        log('Kick nakon submit-a → go()');
        go();
      }
    }, 250);
    return true;
  }

  async function dcResubmit(prefix,id){
    ST.dcMode='resubmitted';
    save();
    try{ window.top.location.href=FORM_URL; }catch{}
  }

  async function dcResume(){
    if(DC_LOCK) return;
    DC_LOCK=true;
    try{
      if(!ST.active) return;
      if(ST.dcMode!=='resubmitted' && ST.dcMode!=='armed') return;

      const dc = ST.dcPending;
      if(!dc || typeof dc.idx!=='number'){
        log('DC resume: nema dcPending');
        ST.dcMode='idle'; ST.dcPending=null; save();
        return;
      }

      const ok = await submitForm(dc.prefix, dc.id);
      if(!ok){
        const row = ST.rows[dc.idx] || {prefix:dc.prefix, id:dc.id, target:dc.target, targetRaw:dc.targetRaw};
        pushRes(row, row.targetRaw || row.target, '(nema u VB)', 'NE', '', true);
        log(`Rezultat (DC): ${row.prefix} ${row.id} → [nema u VB] (NO_FORM)`);
        ST.dcMode='idle'; ST.dcPending=null; save();
        await nextAndForm();
        return;
      }

      ST.phase='scan';
      ST.idx=dc.idx;
      ST.dcMode='scanning';
      save();

      log('DC: resume → resubmit urađen, kratki broad sken');
      const dcTimeout = Math.max(2, Math.round((+ST.timeoutSec||3)*(+ST.dcFactor||1.6)));
      let datesRaw = await waitPotomak(dcTimeout, dc.prefix, dc.id, true, {broad:true});
      const row = ST.rows[dc.idx] || {prefix:dc.prefix, id:dc.id, target:dc.target, targetRaw:dc.targetRaw};

      if(!datesRaw || !datesRaw.length){
        pushRes(row, row.targetRaw || row.target, '(nema u VB)', 'NE', '', true);
        log(`Rezultat (DC): ${row.prefix} ${row.id} → [nema u VB]`);
      } else {
        renderAndStoreResult(row, datesRaw, true);
      }

      ST.dcMode='idle';
      ST.dcPending=null;
      save();
      await nextAndForm();
    } finally {
      DC_LOCK=false;
    }
  }

  function makeAllRegex(broad){
    const lead = broad
      ? String.raw`\b(?:ro[đdj]en[ao]?|ро[ђд]ен[ао]?|telenje|телење|oteljen|oteljena|otelilo|телила|tele|otele)\b[^0-9]{0,25}`
      : String.raw`\b(?:ro[đdj]en[ao]?|ро[ђд]ен[ао]?|datum\s+(?:ro[đdj]enja|rođenja|telenja)|telenje|телење)\b[^0-9]{0,15}`;

    const dmy = String.raw`(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4}|\d{2})`;
    const ymd = String.raw`(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})`;

    return {
      dmy: new RegExp(lead + dmy, 'gi'),
      ymd: new RegExp(lead + ymd, 'gi')
    };
  }

  function extractAllDates(txt, broad){
    const out=[];
    const re = makeAllRegex(broad);

    for(const mm of txt.matchAll(re.dmy)){
      const a=+mm[1], b=+mm[2], yRaw=mm[3];
      const Y=(+yRaw<100)?(+yRaw+2000):+yRaw;

      if(a > 12 && b >= 1 && b <= 12){
        out.push(`${pad2(a)}.${pad2(b)}.${Y}`);
      } else if(b > 12 && a >= 1 && a <= 12){
        out.push(`${pad2(b)}.${pad2(a)}.${Y}`);
      } else {
        out.push(`${pad2(a)}.${pad2(b)}.${Y}`);
      }
    }

    for(const mm of txt.matchAll(re.ymd)){
      const Y=+mm[1], m=+mm[2], d=+mm[3];
      if(Y>=2000 && Y<=2099){
        out.push(`${pad2(d)}.${pad2(m)}.${Y}`);
      }
    }

    return out;
  }

  async function waitPotomak(timeoutSec, prefix, wantedId, includeDesc, opts){
    opts=opts||{};
    const broad = !!opts.broad;
    const wanted=String(wantedId).replace(/\D+/g,'');
    const reMother = new RegExp(`(Majka|МАЈКА)\\s*:\\s*${prefix}\\s*${wanted}\\b`,'i');
    const ctxWords = /(ro[đdj]en|ро[ђд]ен|telen|телењ|oteljen|majka|мајка|potomak|потомак|potomstvo|потомство)/i;
    const isHeaderNoise = (txt)=>/(AIMCS|POČETNA STRANA|ПОЧЕТНА|Gazdinstva|Lista Rasa|Lista Zemalja|UNIVERZITET|DEPARTMAN)/i.test(txt);

    const deadline=Date.now()+Math.max(2000, timeoutSec*1000);
    const POLL_STEP_MS=180;

    const textOf = el => (el && (el.innerText || el.textContent) || '').replace(/\u00A0/g,' ').replace(/\r\n/g,'\n');

    function getScanRoots(d){
      const roots = new Set();

      d.querySelectorAll('table').forEach(tbl=>{
        try{
          const hasDate = /\d{1,4}[.\-\/]\d{1,2}[.\-\/]\d{1,4}/.test(textOf(tbl));
          const hasId = new RegExp(`${prefix}\\s*${wanted}|${wanted}`).test(textOf(tbl));
          if(hasDate || hasId){
            roots.add(tbl);
          }
        }catch{}
      });

      d.querySelectorAll('div, table, center, form, body').forEach(el=>{
        try{
          const t=textOf(el);
          if(
            /(Potomak|Потомак|Potomstvo|ПОТОМСТВО|Majka|МАЈКА|Rođen|Rodjen|Телење|Telenje)/i.test(t) &&
            /\d{1,4}[.\-\/]\d{1,2}[.\-\/]\d{1,4}/.test(t)
          ){
            roots.add(el);
          }
        }catch{}
      });

      return [...roots];
    }

    while(Date.now()<deadline){
      let found=[], explicitNoData=false, dbgRows=[];

      for(const d of getAllDocuments()){
        try{
          if(!docLooksLikeSuccessor(d)) continue;

          const roots=getScanRoots(d);
          if(!roots.length) continue;

          for(const root of roots){
            const rootTxt = textOf(root);
            if(/\bNEMA PODATAKA\b|\bNIJE PRONAĐEN\b|\bNE POSTOJI\b|НЕ ПОСТОЈИ|НЕМА ПОДАТАКА/.test(rootTxt.toUpperCase())){
              explicitNoData=true;
            }

            const rows = root.querySelectorAll('tr');
            if(rows.length){
              rows.forEach(tr=>{
                const cells=[...tr.cells||[]].map(td => textOf(td).trim());
                const rowTxt = textOf(tr).trim();
                if(!rowTxt) return;

                const relatedByMother = reMother.test(rowTxt);
                const relatedById = rowTxt.includes(wanted);
                const relatedByContext = ctxWords.test(rowTxt) || cells.some(c=>ctxWords.test(c));

                if(!includeDesc && !relatedByMother && !relatedById && !relatedByContext){
                  if(ST.debug){
                    dbgRows.push({idx:ST.idx,phase:broad?'scan-DC-broad':'scan',why:'row-not-related',foundCount:0,rowText:rowTxt.slice(0,220)});
                  }
                  return;
                }

                let hit=[];
                for(const c of cells){
                  const dd = extractAllDates(c, broad);
                  if(dd.length) hit.push(...dd);
                }
                if(hit.length===0){
                  const dd = extractAllDates(rowTxt, broad);
                  if(dd.length) hit.push(...dd);
                }

                if(hit.length){
                  found.push(...hit);
                } else if(ST.debug){
                  dbgRows.push({idx:ST.idx,phase:broad?'scan-DC-broad':'scan',why:'no-date-in-row',foundCount:0,rowText:rowTxt.slice(0,300)});
                }
              });
            } else {
              const bigTxt = rootTxt.split('\n').filter(l=>!isHeaderNoise(l)).join('\n');
              const dd = extractAllDates(bigTxt, broad || true);
              if(dd.length) found.push(...dd);
            }

            if(broad && found.length===0){
              const bigTxt = rootTxt.split('\n').filter(l=>!isHeaderNoise(l)).join('\n');
              const dd = extractAllDates(bigTxt, true);
              if(dd.length) found.push(...dd);
            }
          }
        }catch{}
      }

      if(ST.debug && dbgRows.length){
        dbgRows.forEach(d=>dbgPush(d));
        log(`DEBUG: redova bez datuma: ${dbgRows.length}${broad?' (DC-broad)':''}`);
      }

      if(found.length) return found;
      if(explicitNoData) return [];
      await sleep(POLL_STEP_MS);
    }

    if(ST.debug){
      dbgPush({
        idx:ST.idx,
        phase:opts.broad?'scan-DC-broad':'scan',
        why:'timeout',
        foundCount:0,
        rowText:'TIMEOUT čekanja potomstva'
      });
    }
    return [];
  }

  function pushRes(row,target,foundJoin,match,diffDays,dcFlag){
    ST.results.push({prefix:row.prefix,id:row.id,target,found:foundJoin,match, diff:diffDays, dc: dcFlag?'1':''});
    save();
  }

  setInterval(()=>{ try{ if(ST.active && ST.dcMode==='idle') go(); }catch{} }, 900);
  setInterval(()=>{ try{ if(ST.active && (ST.dcMode==='resubmitted' || ST.dcMode==='armed')){ log('Watchdog: DC resume kick'); setTimeout(()=>{ dcResume(); }, 100); } }catch{} }, 700);

  window.VetAssistTools = window.VetAssistTools || {};
  window.VetAssistTools.provera_telenja = {
    start: function(cfg){
      try{
        const all = JSON.parse(sessionStorage.getItem(START_PAYLOADS_KEY) || '{}');
        all[TOOL_CODE] = cfg || {};
        sessionStorage.setItem(START_PAYLOADS_KEY, JSON.stringify(all));
      }catch{}

      const ta = $('#sc-data');
      if(ta){
        ta.value = Array.isArray(cfg?.rows) ? cfg.rows.join('\n') : '';
      }
      if($('#sc-start')) $('#sc-start').click();
    },
    stop: function(){
      if($('#sc-stop')) $('#sc-stop').click();
    },
    debugState: function(){
      return JSON.parse(JSON.stringify(ST));
    }
  };

  let bootstrapRan = false;

  function bootstrapAutoStart(){
    if(bootstrapRan) return;
    bootstrapRan = true;

    try{
      $('#sc-log') && ($('#sc-log').value=(ST.log||[]).join('\n'));
      $('#sc-data') && ($('#sc-data').value=ST.rawInput||'');
      $('#sc-status') && setStatus(ST.active?'u toku…':'spremno');
      ensureAutoPick();

      const pending = getPendingStartPayload();

      if(!ST.active && pending && Array.isArray(pending.rows) && pending.rows.length){
        ST.rawInput = pending.rows.join('\n');
        $('#sc-data') && ($('#sc-data').value = ST.rawInput);
        $('#sc-delay') && ($('#sc-delay').value = String(pending.delay || ST.delay || 450));
        $('#sc-timeout') && ($('#sc-timeout').value = String(pending.timeoutSec || ST.timeoutSec || 3));
        $('#sc-toldef') && ($('#sc-toldef').value = String(pending.tolDefault ?? ST.tolDefault ?? 0));
        if($('#sc-desc') && typeof pending.includeDesc === 'boolean') $('#sc-desc').checked = pending.includeDesc;
        if($('#sc-dedupe') && typeof pending.dedupeDates === 'boolean') $('#sc-dedupe').checked = pending.dedupeDates;
        if($('#sc-dc') && typeof pending.doubleCheck === 'boolean') $('#sc-dc').checked = pending.doubleCheck;
        if($('#sc-dcf') && pending.dcFactor) $('#sc-dcf').value = String(pending.dcFactor);

        log('Skripta učitana – pending start iz VetAssist panela');
        setTimeout(()=>{ $('#sc-start') && $('#sc-start').click(); }, 80);
        return;
      }

      if(ST.active){
        if(ST.dcMode==='resubmitted' || ST.dcMode==='armed'){
          log(`Skripta učitana – resume (DC mode=${ST.dcMode}), idx=${ST.idx}/${ST.rows.length} → dcResume()`);
          setTimeout(()=>{ dcResume(); }, 120);
        } else {
          log(`Skripta učitana – resume: phase=${ST.phase}, idx=${ST.idx}/${ST.rows.length}`);
          setTimeout(()=>{ go(); }, 100);
        }
      } else {
        log('Skripta učitana – spremno.');
      }
    }catch(e){
      console.error('bootstrapAutoStart error', e);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(bootstrapAutoStart, 20);
  } else {
    window.addEventListener('load', ()=> setTimeout(bootstrapAutoStart, 20), { once: true });
    document.addEventListener('DOMContentLoaded', ()=> setTimeout(bootstrapAutoStart, 20), { once: true });
  }

})();