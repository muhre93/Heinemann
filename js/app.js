/* Shop Bestilling – beregning, visning og eksport. Indlæses efter i18n.js og excel.js. */
'use strict';
/* =====================================================================
   Shop Bestilling (DA/EN) — én fil til GitHub Pages
   ===================================================================== */
const CATS = {
  ltc:      { suMode:'strict',  color:'var(--c-ltc)' },
  perfume:  { suMode:'none',    color:'var(--c-perfume)' },
  andet:    { suMode:'numeric', color:'var(--c-andet)' },
  cosmetic: { suMode:'numeric', color:'var(--c-cosmetic)' },
};
const CAT_KEYS = Object.keys(CATS);

/* Særregler: factor = antal stk i én kasse. Winpos lægger fejlagtigt
   solgt × factor til lageret ("New stock"), så lager nu = New stock − solgt × factor.
   Salget er i stk og regnes om til kasser. step = der bestilles i hele "step" kasser. */
const DEFAULT_SETTINGS = {
  v: 4, lang: 'da', theme: 'light',
  minShelf: { ltc:0, perfume:4, andet:4, cosmetic:4 },
  buffer: true, cover: 1, rounding: 'nearest', showWinposStock: false, showCalc: false,
  rules: [
    { match:'coca cola',   cats:'ltc', factor:24, step:99 },
    { match:'fanta',       cats:'ltc', factor:24, step:99 },
    { match:'redbull',     cats:'ltc', factor:24, step:1 },
    { match:'capri sonne', cats:'ltc', factor:4,  step:1 },
  ],
};

const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} },
};
const K_SET='sb_settings_v4', K_SU='sb_su_memory_v1', K_SES='sb_session_v1', K_RX='sb_receive_v1', K_RXP='sb_receive_pref_v1', K_UI='sb_ui_v3', K_HIST='sb_history_v1';

function loadSettings(){
  const d = structuredClone(DEFAULT_SETTINGS);
  let s = store.get(K_SET, null);
  if (!s){
    const old = store.get('sb_settings_v3', null);           // flyt gamle indstillinger med
    if (old){ s = { minShelf: old.minShelf, buffer: old.buffer, cover: old.cover, rounding: old.rounding, showWinposStock: old.showWinposStock }; }
  }
  if (!s) return d;
  const out = Object.assign(d, s, { minShelf: Object.assign(d.minShelf, s.minShelf||{}) });
  if (!s.rules) out.rules = d.rules;
  return out;
}
let settings = loadSettings();
let suMemory = store.get(K_SU, {});
let session  = store.get(K_SES, null) || { data:{}, overrides:{} };
for (const c of CAT_KEYS) session.overrides[c] = session.overrides[c] || {};
session.sup = session.sup || {}; session.supOv = session.supOv || {};
let rx = store.get(K_RX, null);
let rxPref = Object.assign({ autoZero:true, sep:';', dec:',', header:true, headers:['Article','Qty','Price/Qty'], mode:'split' }, store.get(K_RXP, {}));
let history = store.get(K_HIST, []);
const uiSaved = store.get(K_UI, {});
const ui  = { section: uiSaved.section || 'heinemann', sup: uiSaved.sup || 'overview', tab: uiSaved.tab || 'overview', filter:'all', q:'', sort:{key:null,dir:1} };
const rui = { inv:'all', filter:'all', q:'', colf:{}, sort:{key:null,dir:1} };
function saveUi(){ store.set(K_UI, { tab:ui.tab, section:ui.section, sup:ui.sup }); }
function saveSettingsStore(){ store.set(K_SET, settings); }

/* =====================================================================
   Sprog
   ===================================================================== */
const L = () => I18N[settings.lang] || I18N.da;
function t(k, ...a){ const v = L()[k] ?? I18N.da[k] ?? k; return typeof v === 'function' ? v(...a) : v; }
const catName = c => t('cat_' + c);
const locale = () => settings.lang === 'en' ? 'en-GB' : 'da-DK';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, d=0) => (n==null || isNaN(n)) ? '–' : Number(n).toLocaleString(locale(),{minimumFractionDigits:d,maximumFractionDigits:d});
const fmtq = n => fmt(n, Number.isInteger(Math.round(n*1000)/1000) ? 0 : 1);
const eur = (n, d=2) => fmt(n,d) + ' €';
function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>el.classList.remove('show'),3000); }
const q = text => `<span class="q" title="${esc(text)}" aria-label="${esc(text)}">?</span>`;
const ICON = {
  up:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 16V4M6 10l6-6 6 6M4 20h16"/></svg>',
  dl:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 4v12M6 10l6 6 6-6M4 20h16"/></svg>',
  sheet:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></svg>',
  copy:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  print:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z"/></svg>',
  gear:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  help:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01"/></svg>',
  moon:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>',
  sun:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  search:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  ok:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>',
  chev:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>',
  swap:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4v6h6M20 20v-6h-6"/><path d="M5 15a8 8 0 0 0 14 2M19 9A8 8 0 0 0 5 7"/></svg>',
  helm:'<svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="16" cy="16" r="8"/><circle cx="16" cy="16" r="2.5"/><path d="M16 3v5M16 24v5M3 16h5M24 16h5M6.8 6.8l3.5 3.5M21.7 21.7l3.5 3.5M6.8 25.2l3.5-3.5M21.7 10.3l3.5-3.5"/></svg>',
  ferry:'<svg viewBox="0 0 160 60" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 40 L148 40 L138 51 L24 51 Z"/><path d="M32 40 V30 H122 V40"/><path d="M46 30 V22 H106 V30"/><path d="M84 22 V11 H97 V22"/><path d="M40 35h6M54 35h6M68 35h6M82 35h6M96 35h6M110 35h6"/><path d="M2 57 q8 -4 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0" opacity=".6"/></svg>',
  logo:'<svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10" fill="none" stroke="#D4A23C" stroke-width="5"/><path d="M16 6v4M16 22v4M6 16h4M22 16h4" stroke="#fff" stroke-width="2.6"/></svg>',
};

/* =====================================================================
   BESTILLING
   ===================================================================== */
function parseWinpos(aoa){
  let h = -1;
  for (let i=0;i<Math.min(aoa.length,60);i++){
    const r = (aoa[i]||[]).map(x => String(x??'').trim().toLowerCase());
    if (r.includes('code') && r.includes('description')) { h=i; break; }
  }
  if (h<0) throw new Error('Kunne ikke finde kolonnerne "Code" og "Description".');
  const head = aoa[h].map(x => String(x??'').trim().toLowerCase());
  const col = (...names) => { for (const n of names){ const i=head.indexOf(n); if(i>=0) return i; } return -1; };
  const C = {
    code: col('code'), desc: col('description'), sold: col('quantity'),
    stock: col('new stock','in stock','stock'), price: col('purchase price eur','purchase price'),
    su: col('secondary unit'), art: col('artikel nr','artikel nr.','article no'), unit: col('unit'),
  };
  const missing = ['code','desc','sold','stock'].filter(k => C[k]<0);
  if (missing.length) throw new Error('Mangler kolonner: ' + missing.join(', '));
  const meta = {};
  for (let i=0;i<h;i++){ const r=aoa[i]||[]; const k=String(r[1]??'').trim(); if(k && r[2]!=null) meta[k]=String(r[2]).trim(); }
  const rows = [];
  for (let i=h+1;i<aoa.length;i++){
    const r = aoa[i]||[];
    const code = r[C.code];
    if (code==null || String(code).trim()==='') continue;
    const desc = String(r[C.desc]??'').replace(/ /g,' ').trim();
    if (!desc) continue;
    rows.push({
      code: String(code).trim(), desc,
      sold: parseNum(r[C.sold]) ?? 0, stock: parseNum(r[C.stock]) ?? 0, stockRaw: String(r[C.stock]??'').trim(),
      price: C.price>=0 ? (parseNum(r[C.price]) ?? 0) : 0,
      suRaw: C.su>=0 ? (r[C.su]==null ? '' : String(r[C.su]).trim()) : '',
      art: C.art>=0 ? (r[C.art]==null ? '' : String(r[C.art]).trim()) : '',
      unit: C.unit>=0 ? String(r[C.unit]??'').trim() : '',
    });
  }
  meta.__cur = /eur/.test(head[C.price]||'') ? '€' : 'kr.';
  return { meta, rows };
}

function roundTo(x, step, mode){
  if (x <= 0) return 0;
  return (mode==='up' ? Math.ceil(x/step - 1e-9) : Math.round(x/step + 1e-9)) * step;
}
function findRule(cat, desc){
  const d = desc.toLowerCase();
  return settings.rules.find(r => r.match && (!r.cats || r.cats.split(',').map(s=>s.trim()).includes(cat)) && d.includes(r.match.toLowerCase().trim())) || null;
}



/* =====================================================================
   Beregning
   ===================================================================== */
function calc(cat, row){
  const min = +settings.minShelf[cat] || 0;
  const cover = +settings.cover || 1;
  const flags = [];
  let su = 1, suSource = 'none', sug = 0, unit = '', real, soldDisp = row.sold, buf = 0, cx;
  const rule = findRule(cat, row.desc);

  if (rule){
    const f = +rule.factor || 1, step = +rule.step || 1;
    unit = t('cs');
    const realPcs = row.stock - row.sold * f;       // ret Winpos-fejlen
    real = realPcs / f; soldDisp = row.sold / f;
    buf = settings.buffer ? 1 : 0;
    const target = soldDisp * cover + buf, need = target - real;
    su = step; suSource = 'rule';
    sug = need > 0 ? Math.ceil(need / step - 1e-9) * step : 0;
    cx = need > 0 ? { k:'need', s:soldDisp*cover, b:buf, r:real, n:need, rd:true } : { k:'ok', r:real, tg:target };
    flags.push({ c:'teal', t:t('fl_rule', f) });
    if (realPcs < 0) flags.push({ c:'amber', t:t('fl_neg') });
  } else {
    real = row.stock - row.sold;
    if (CATS[cat].suMode !== 'none'){
      const fromFile = parseSU(row.suRaw), mem = suMemory[row.code];
      if (mem){ su = mem; suSource = 'memory'; }
      else if (fromFile){ su = fromFile; suSource = 'file'; }
      else if (CATS[cat].suMode === 'strict'){ su = 1; suSource = 'missing'; flags.push({ c:'red', t:t('fl_missing') }); }
      else { su = 1; suSource = 'ignored'; }
    }
    buf = settings.buffer && (suSource==='file' || suSource==='memory') ? su : 0;
    const base = row.sold * cover + buf, target = Math.max(base, min), need = target - real;
    sug = need > 0 ? roundTo(need, su, settings.rounding) : 0;
    if (min > 0 && real + sug < min) sug = Math.ceil((min - real) / su) * su;
    if (sug === 0 && real <= 0 && row.sold > 0) sug = su;
    cx = need > 0 ? (min > base ? { k:'min', m:min, r:real, n:need, rd:su>1 } : { k:'need', s:row.sold*cover, b:buf, r:real, n:need, rd:su>1 }) : { k:'ok', r:real, tg:target };
    if (real < 0) flags.push({ c:'amber', t:t('fl_neg') });
  }
  sug = Math.max(0, sug);
  const ov = session.overrides[cat][row.code];
  const manual = ov != null && ov !== '' && !isNaN(ov);
  const final = manual ? Math.max(0, +ov) : sug;
  if (manual) flags.push({ c:'blue', t:t('fl_manual', sug) });
  if (suSource === 'memory') flags.push({ c:'grey', t:t('fl_mem') });
  const status = flags.some(f=>f.c==='red') ? 'red' : flags.some(f=>f.c==='amber') ? 'amber' : 'ok';
  return { real, newStock: real + final, soldDisp, su, suSource, buf, sug, final, manual, unit, rule, cx, flags, status, value: final * (row.price||0) };
}
function calcText(x){
  const c = x.cx, d = v => x.rule ? fmt(v,1) : fmtq(v);
  if (!c) return '';
  if (c.k==='ok') return t('calc_ok', d(c.r), d(c.tg));
  if (c.k==='min') return t('calc_min', c.m, d(c.r), d(c.n), x.sug, c.rd);
  return t('calc_need', d(c.s), c.b, d(c.r), d(c.n), x.sug, c.rd);
}
function computed(cat){ const d = session.data[cat]; return d ? d.rows.map(r => Object.assign({ cat }, r, calc(cat, r))) : []; }
function summary(cat){
  const Lr = computed(cat);
  return { lines: Lr.length, order: Lr.filter(x=>x.final>0).length, units: Lr.reduce((a,x)=>a+x.final,0), value: Lr.reduce((a,x)=>a+x.value,0),
    red: Lr.filter(x=>x.status==='red').length, amber: Lr.filter(x=>x.status==='amber').length, manual: Lr.filter(x=>x.manual).length, list: Lr };
}
function currentWeek(){ for (const c of CAT_KEYS){ const w = session.data[c]?.week; if (w) return w; } return isoWeek(); }
function saveSession(){ store.set(K_SES, session); }
const loadedCats = () => CAT_KEYS.filter(c=>session.data[c]);

/* ---------- Indlæsning: Heinemann-kategori eller anden leverandør ---------- */
const isHeinemann = meta => /heinem/i.test(meta?.Supplier || '');
async function parseFile(file){
  const sheets = await readSheets(file);
  try { const p = parseWinpos(sheets[0].aoa); if (p.rows.length) return { kind:'winpos', ...p, sheets }; } catch(e){}
  try { const c = parseCDL(sheets); return { kind:'cdl', cdl:c, sheets }; } catch(e){}
  throw new Error(t('errFormat'));
}
function storeHeinemann(cat, file, p, quiet){
  session.data[cat] = { fileName:file.name, meta:p.meta, rows:p.rows, week: detectWeek(file.name), loadedAt: Date.now() };
  session.overrides[cat] = {};
  saveSession();
  if (!quiet){ Object.assign(ui, { section:'heinemann', tab:cat, filter:'all', q:'', sort:{key:null,dir:1} }); saveUi(); }
  render();
  const s = summary(cat);
  toast(t('tLoaded', catName(cat), s.order, s.lines, s.red));
}
function supKeyOf(meta, fileName){
  const m = /^(\d+)\s+(.+)$/.exec(meta?.Supplier || '');
  if (m) return { key:m[1], name:m[2].trim() };
  const n = String(fileName).replace(/\.[^.]+$/,'').replace(/^[0-9a-f]{8}-/,'').replace(/[_-]?(week|uge)[_\s-]*\d+/i,'').trim();
  return { key:n.toLowerCase(), name:n };
}
function storeSupplier(file, p, quiet){
  const { key, name } = supKeyOf(p.meta, file.name);
  session.sup[key] = { key, name, port: p.meta.Port || '', fileName:file.name, meta:p.meta, rows:p.rows, cur: p.meta.__cur || 'kr.', week: detectWeek(file.name), loadedAt: Date.now() };
  session.supOv[key] = {};
  saveSession();
  if (!quiet){ Object.assign(ui, { section:'others', sup:key, filter:'all', q:'', sort:{key:null,dir:1} }); saveUi(); }
  render();
  const s = supSummary(key);
  toast(t('tLoaded', name, s.order, s.lines, s.red));
}
/** Én fil hvor brugeren selv har valgt Heinemann-kategori */
async function loadOrderFile(cat, file, quiet){
  try{
    const p = await parseFile(file);
    if (p.kind === 'cdl'){ return rxLoad(file); }
    if (p.meta.Supplier && !isHeinemann(p.meta)) return storeSupplier(file, p, quiet);
    const g = guessCat(file.name);
    if (g && g !== cat && CATS[g] && !confirm(t('cMismatch', file.name, catName(g), catName(cat)))) return;
    storeHeinemann(cat, file, p, quiet);
  }catch(e){ console.error(e); alert(t('errRead') + '\n' + file.name + '\n' + e.message); }
}
/** En eller flere filer — appen finder selv ud af hvad de er */
async function loadAny(files, hint){
  const unknown = [];
  let heinCount = 0, supCount = 0, many = files.length > 1;
  for (const f of files){
    try{
      const p = await parseFile(f);
      if (p.kind === 'cdl'){ await rxLoad(f); continue; }
      if (p.meta.Supplier && !isHeinemann(p.meta)){ storeSupplier(f, p, many); supCount++; continue; }
      let c = guessCat(f.name);
      if (c === 'cdl') c = null;
      if (!c && CATS[hint]) c = hint;
      if (!c && !many && ui.section==='heinemann' && CATS[ui.tab]) c = ui.tab;
      if (c){ storeHeinemann(c, f, p, many); heinCount++; } else unknown.push(f.name);
    }catch(e){ console.error(e); unknown.push(f.name); }
  }
  if (many){
    if (heinCount && !supCount){ ui.section='heinemann'; ui.tab='overview'; }
    else if (supCount && !heinCount){ ui.section='others'; ui.sup='overview'; }
    saveUi(); render();
    toast(t('tMany', heinCount, supCount));
  }
  if (unknown.length) setTimeout(()=>toast(t('tUnknown', unknown.join(', '))), many ? 1600 : 0);
}

/* =====================================================================
   Topbjælke og sidehoved
   ===================================================================== */
const catDot = c => `<span class="dt" style="--cat:${CATS[c].color}"></span>`;
function issuesIn(c){ return session.data[c] ? summary(c).red : 0; }

function renderTop(){
  const others = ui.section === 'others';
  const loaded = loadedCats();
  const heinIssues = loaded.reduce((a,c)=>a+issuesIn(c),0) + (rx ? rxInvoices().filter(i=>i.check==='diff').length : 0);
  const supIssues = supKeys().reduce((a,k)=>a+supSummary(k).red,0);
  const cntB = n => n ? `<span class="cnt">${n}</span>` : '';
  let primary;
  if (others) primary = ui.sup==='overview'
      ? `<button class="btn primary" data-act="sup-export-all" ${supKeys().length?'':'disabled'}>${ICON.dl}<span class="lbl">${t('xlsAll')}</span></button>`
      : `<button class="btn primary" data-act="sup-export" data-sup="${esc(ui.sup)}">${ICON.dl}<span class="lbl">${t('orderList')}</span></button>`;
  else primary = ui.tab==='receive'
      ? `<button class="btn primary" data-act="rx-export" ${rx?'':'disabled'}>${ICON.dl}<span class="lbl">${t('csv')}</span></button>`
      : `<button class="btn primary" data-act="export-order" ${loaded.length?'':'disabled'}>${ICON.dl}<span class="lbl">${t('order')}</span></button>`;
  $('#top').innerHTML = `
    <div class="brand">${ICON.helm}<div><b>${esc(t('title'))}</b><span>M/F Norrøna · ${esc(t('week', currentWeek()))}</span></div></div>
    <nav class="mnav" aria-label="${esc(t('title'))}">
      <button class="${!others?'on':''}" data-act="section" data-v="heinemann">Heinemann${cntB(heinIssues)}</button>
      <button class="${others?'on':''}" data-act="section" data-v="others">${t('secOthers')}${cntB(supIssues)}</button>
    </nav>
    <div class="tools">
      <div class="lang" role="group" aria-label="Sprog / Language"><button class="${settings.lang==='da'?'on':''}" data-act="lang" data-v="da">DA</button><button class="${settings.lang==='en'?'on':''}" data-act="lang" data-v="en">EN</button></div>
      <button class="ib" data-act="theme" title="${t('theme')}" aria-label="${t('theme')}">${settings.theme==='dark'?ICON.sun:ICON.moon}</button>
      <button class="ib" data-act="settings" title="${t('settings')}" aria-label="${t('settings')}">${ICON.gear}</button>
      <button class="ib" data-act="help" title="${t('help')}" aria-label="${t('help')}">${ICON.help}</button>
      ${primary}
    </div>`;
  let tabs;
  if (others){
    tabs = [['overview', t('tabOverview'), 0]].concat(supKeys().map(k=>[k, session.sup[k].name, supSummary(k).red]));
    $('#subnav').innerHTML = `<nav class="nav">${tabs.map(([k,n,c])=>`<button class="${ui.sup===k?'on':''}" data-act="sup" data-v="${esc(k)}">${esc(n)}${cntB(c)}</button>`).join('')}
      <button data-act="pick" data-cat="any" class="add">+ ${t('addSupplier')}</button></nav>`;
  } else {
    tabs = [['overview', t('tabOverview'), loaded.reduce((a,c)=>a+issuesIn(c),0)]].concat(CAT_KEYS.map(c=>[c, catName(c), issuesIn(c)])).concat([['receive', t('tabReceive'), rx ? rxInvoices().filter(i=>i.check==='diff').length : 0]]);
    $('#subnav').innerHTML = `<nav class="nav">${tabs.map(([k,n,c])=>`<button class="${ui.tab===k?'on':''}" data-act="tab" data-v="${k}">${esc(n)}${cntB(c)}</button>`).join('')}</nav>`;
  }
  const h = $('.hdr'); if (h) document.documentElement.style.setProperty('--hdr-h', h.offsetHeight + 'px');
}
function phead(title, meta, acts, cat){
  return `<div class="phead"><div><h1>${cat?`<span class="dot" style="--cat:${CATS[cat].color}"></span>`:''}${esc(title)}</h1>${meta?`<p class="meta">${meta}</p>`:''}</div><div class="acts">${acts||''}</div></div>`;
}
const dropZone = (cat, title, text) => `<button class="drop" data-act="pick" data-cat="${cat}" data-drop="${cat}">
  <span class="ico">${ICON.ferry}</span><h2>${title}</h2><p>${text}</p><div class="hint">${t('emptyClick')}</div></button>`;

/* =====================================================================
   Overblik
   ===================================================================== */
function renderOverview(){
  const el = $('#main');
  const loaded = loadedCats();
  const w = currentWeek();
  const head = phead(t('tabOverview'), `${t('week', w)}, ${t('filesLoaded', loaded.length, CAT_KEYS.length)}`,
    `<button class="btn" data-act="pick" data-cat="any">${ICON.up} ${t('load')}</button>
     <button class="btn" data-act="export-overview" ${loaded.length?'':'disabled'}>${ICON.sheet} ${t('xlsOverview')}</button>`);
  if (!loaded.length){
    el.innerHTML = head + dropZone('any', t('emptyTitle'), t('emptyText'));
    return;
  }
  const S = Object.fromEntries(loaded.map(c=>[c, summary(c)]));
  const all = loaded.flatMap(c => S[c].list);
  const total = all.reduce((a,x)=>a+x.value,0);
  const ordered = all.filter(x=>x.final>0);
  const issues = all.filter(x=>x.status==='red').concat(all.filter(x=>x.status==='amber'));
  const units = ordered.reduce((a,x)=>a+x.final,0);
  const prev = history.filter(h=>h.week !== w).slice(-1)[0];
  const delta = prev && prev.value > 0 ? t('vsWeek', ((total-prev.value)/prev.value>=0?'+':'') + fmt((total-prev.value)/prev.value*100,0) + '%', prev.week) : t('kpiBuySub');
  const maxV = Math.max(1, ...loaded.map(c=>S[c].value));
  const top = ordered.slice().sort((a,b)=>b.value-a.value).slice(0,8);

  el.innerHTML = head + `
    <section class="panel stats">
      <div class="stat"><span class="l">${t('kpiBuy')}</span><span class="v">${eur(total,0)}</span><span class="d">${esc(delta)}</span></div>
      <div class="stat"><span class="l">${t('kpiLines')}</span><span class="v">${fmt(ordered.length)}</span><span class="d">${t('kpiLinesSub', fmt(all.length))}</span></div>
      <div class="stat"><span class="l">${t('kpiUnits')}</span><span class="v">${fmt(units)}</span><span class="d">${t('kpiUnitsSub')}</span></div>
      <div class="stat"><span class="l">${t('kpiCheck')}</span><span class="v ${issues.length?'red':''}">${fmt(issues.length)}</span><span class="d">${issues.length?t('kpiCheckSub'):t('noIssues')}</span></div>
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="ph"><h2>${t('cardCats')}</h2><span class="s">${t('cardCatsSub')}</span></div>
      ${CAT_KEYS.map(c => {
        const d = session.data[c];
        if (!d) return `<div class="catrow off" data-act="pick" data-cat="${c}" data-drop="${c}">${catDot(c)}<div class="nm"><b>${esc(catName(c))}</b><span>${t('notLoadedLong')}</span></div><div></div><span></span><span></span><span class="iss">${t('load')}</span><span class="ch">${ICON.chev}</span></div>`;
        const s = S[c];
        return `<div class="catrow" data-act="tab" data-v="${c}">${catDot(c)}<div class="nm"><b>${esc(catName(c))}</b><span title="${esc(d.fileName)}">${t('items', fmt(s.lines))}</span></div>
          <div class="bar" style="--cat:${CATS[c].color}"><i style="width:${s.value/maxV*100}%"></i></div>
          <span class="n">${t('lines', s.order)}</span><span class="n v">${eur(s.value,0)}</span>
          <span class="iss ${s.red?'r':''}">${s.red ? t('toCheck', s.red) : s.amber ? t('warnings', s.amber) : t('ready')}</span><span class="ch">${ICON.chev}</span></div>`;
      }).join('')}
    </section>
    <div class="cols">
      <section class="panel">
        <div class="ph"><h2>${t('cardCheck')}</h2><span class="s">${t('cardCheckSub')}</span></div>
        ${issues.length ? issues.slice(0,10).map(x=>`<div class="li">${catDot(x.cat)}
            <div class="t"><b>${esc(x.desc)}</b><span>${esc(catName(x.cat))}, ${t('col_sold').toLowerCase()} ${fmtq(x.soldDisp)}, ${t('col_real').toLowerCase()} ${fmtq(x.real)}</span></div>
            ${x.flags.filter(f=>f.c==='red'||f.c==='amber').slice(0,1).map(f=>`<span class="st ${f.c}">${esc(f.t)}</span>`).join('')}
            <button class="btn sm" data-act="goto" data-cat="${x.cat}" data-code="${esc(x.code)}">${t('fix')}</button></div>`).join('')
          + (issues.length>10 ? `<div class="more">${t('more', issues.length-10)}</div>` : '')
          : `<div class="allok">${ICON.ok} ${t('noIssues')}</div>`}
      </section>
      <section class="panel">
        <div class="ph"><h2>${t('cardTop')}</h2><span class="s">${t('cardTopSub')}</span></div>
        ${top.map(x=>`<div class="li" style="grid-template-columns:8px minmax(0,1fr) auto">${catDot(x.cat)}<div class="t"><b>${esc(x.desc)}</b><span>${esc(catName(x.cat))}, ${fmt(x.final)}${x.unit?' '+x.unit:' '+t('pcs')}</span></div><span class="v"><b>${eur(x.value)}</b></span></div>`).join('')
          || `<div class="more">${t('nothing')}</div>`}
      </section>
    </div>`;
}

/* =====================================================================
   Kategori-tabel
   ===================================================================== */
function catLead(cat){
  if (cat==='ltc') return t('desc_ltc');
  if (cat==='perfume') return t('desc_perfume', settings.minShelf.perfume);
  return t('desc_andet', settings.minShelf[cat]);
}
function renderCat(cat){
  const el = $('#main');
  const d = session.data[cat];
  if (!d){
    el.innerHTML = phead(catName(cat), t('notLoadedLong'), '', cat) + dropZone(cat, t('loadCat', esc(catName(cat))), t('loadCatText'));
    return;
  }
  const all = computed(cat), s = summary(cat);
  const counts = { all: all.length, order: s.order, check: all.filter(x=>x.status!=='ok').length, manual: s.manual };
  const showSU = CATS[cat].suMode !== 'none', showStock = settings.showWinposStock;
  const th = (k,n,cls='',title='') => `<th class="${cls}" data-act="sort" data-k="${k}" ${title?`title="${esc(title)}"`:''}>${esc(n)}${ui.sort.key===k?` <span class="arr">${ui.sort.dir>0?'▲':'▼'}</span>`:''}</th>`;
  const seg = (k,n,c,isRed) => `<button class="${ui.filter===k?'on':''}" data-act="filter" data-v="${k}">${esc(n)}<span class="c ${isRed&&c?'r':''}">${c}</span></button>`;
  const meta = `${t('catMeta', s.order, s.lines, eur(s.value))} <span class="q" title="${esc(d.fileName + (d.meta['Print date'] ? ', ' + d.meta['Print date'] : ''))}">i</span>`;
  el.innerHTML = phead(catName(cat), meta,
      `<button class="btn ghost" data-act="pick" data-cat="${cat}">${ICON.swap} ${t('replace')}</button>
       <button class="btn ghost" data-act="clear" data-cat="${cat}">${t('remove')}</button>
       <button class="btn" data-act="export-cat" data-cat="${cat}">${ICON.sheet} ${t('xlsShort')}</button>`, cat)
    + `<p class="lead">${esc(catLead(cat))}</p>
    <div class="toolbar">
      <div class="search">${ICON.search}<input id="q" type="search" placeholder="${esc(t('search'))}" value="${esc(ui.q)}"></div>
      <div class="seg">${seg('all',t('fAll'),counts.all)}${seg('order',t('fOrder'),counts.order)}${seg('check',t('fCheck'),counts.check,true)}${seg('manual',t('fManual'),counts.manual)}</div>
      <label class="toggle"><input type="checkbox" data-act-change="calc" ${settings.showCalc?'checked':''}> ${t('showCalc')}</label>
      ${counts.manual ? `<button class="btn ghost sm" data-act="reset-ov">${t('resetEdits')}</button>` : ''}
      <button class="btn ghost sm" data-act="print" title="${t('print')}" aria-label="${t('print')}">${ICON.print}</button>
    </div>
    <div class="tablewrap"><table>
      <thead><tr>
        ${th('code',t('col_code'))}${th('art',t('col_art'))}${th('desc',t('col_desc'))}${th('sold',t('col_sold'),'r')}
        ${showStock ? th('stock',t('col_winpos'),'r',t('tip_winpos')) : ''}
        ${th('real',t('col_real'),'r',t('tip_real'))}
        ${showSU ? th('su',t('col_su'),'r',t('tip_su')) : ''}
        ${th('final',t('col_order'),'r col-order')}${th('newStock',t('col_new'),'r',t('tip_new'))}${th('price',t('col_price'),'r')}${th('value',t('col_value'),'r')}
      </tr></thead>
      <tbody id="tbody"></tbody><tfoot id="tfoot"></tfoot></table></div>
    <div class="legend"><span class="st red">${t('lgMissing')}</span><span class="st amber">${t('lgNeg')}</span><span class="st blue">${t('lgManual')}</span><span>${t('lgEnter')}</span></div>`;
  renderCatBody(cat, all);
}

function catRows(all){
  const qq = ui.q.trim().toLowerCase();
  let R = all.filter(x => {
    if (ui.filter==='order' && !(x.final>0)) return false;
    if (ui.filter==='check' && x.status==='ok') return false;
    if (ui.filter==='manual' && !x.manual) return false;
    if (qq && !(x.desc.toLowerCase().includes(qq) || x.code.includes(qq) || x.art.includes(qq))) return false;
    return true;
  });
  const { key, dir } = ui.sort;
  if (key){
    const get = { pcs:x=>x.pcs, code:x=>+x.code||x.code, art:x=>+x.art||x.art, desc:x=>x.desc.toLowerCase(), sold:x=>x.soldDisp ?? x.sold, stock:x=>x.stock,
      real:x=>x.real, su:x=>x.su ?? x.pack, price:x=>x.price, final:x=>x.final, newStock:x=>x.newStock, value:x=>x.value }[key];
    R = R.slice().sort((a,b)=>{ const A=get(a),B=get(b); return (A>B?1:A<B?-1:0)*dir; });
  } else { const rank = { red:0, amber:1, ok:2 }; R = R.slice().sort((a,b)=> rank[a.status]-rank[b.status]); }
  return R;
}
function renderCatBody(cat, all){
  all = all || computed(cat);
  const showSU = CATS[cat].suMode !== 'none', showStock = settings.showWinposStock, extra = (showSU?1:0)+(showStock?1:0);
  const R = catRows(all);
  $('#tbody').innerHTML = R.map(x => rowHtml(x, showSU, showStock)).join('') || `<tr><td colspan="${9+extra}"><div class="empty-state">${t('noRows')}</div></td></tr>`;
  const ord = R.filter(x=>x.final>0);
  $('#tfoot').innerHTML = `<tr><td colspan="3">${t('foot', fmt(R.length), fmt(ord.length))}</td><td colspan="${2+extra}"></td>
    <td class="r"><b>${fmt(ord.reduce((a,x)=>a+x.final,0))}</b></td><td></td><td></td><td class="r"><b>${eur(ord.reduce((a,x)=>a+x.value,0))}</b></td></tr>`;
}
function rowHtml(x, showSU, showStock){
  const step = x.su || 1;
  const u = x.unit ? `<span class="u">${esc(x.unit)}</span>` : '';
  const d = v => x.rule ? fmt(v, Number.isInteger(Math.round(v*10)/10) ? 0 : 1) : fmtq(v);
  let suCell = '';
  if (showSU){
    suCell = x.rule ? `<td class="r">${x.rule.factor}${u}</td>`
      : `<td class="r"><input class="su-in ${x.suSource==='missing'?'missing':''}" data-su="${esc(x.code)}" inputmode="numeric" aria-label="${t('col_su')}"
          value="${x.suSource==='missing'||x.suSource==='ignored' ? '' : x.su}" placeholder="${x.suSource==='missing'?'?':'–'}" title="${esc(x.suSource==='ignored' ? 'Winpos: '+x.suRaw : t('tip_su'))}"></td>`;
  }
  const tags = x.flags.filter(f => f.c!=='grey');
  return `<tr class="st-${x.status} ${x.final>0?'':'zero'}">
    <td class="code">${esc(x.code)}</td><td class="code">${esc(x.art)}</td>
    <td class="desc"><div class="d">${esc(x.desc)}</div>
      ${tags.length?`<div class="flags">${tags.map(f=>`<span class="st ${f.c}">${esc(f.t)}</span>`).join('')}</div>`:''}
      ${settings.showCalc?`<div class="why">${esc(calcText(x))}</div>`:''}</td>
    <td class="r">${d(x.soldDisp)}${u}</td>
    ${showStock ? `<td class="r" title="${esc(x.stockRaw)}">${fmt(x.stock)}</td>` : ''}
    <td class="r ${x.real<0?'neg':''}">${d(x.real)}${u}</td>
    ${suCell}
    <td class="r col-order" title="${esc(calcText(x))}"><span class="qty ${x.manual?'manual':x.final>0?'has':''}">
      <button data-act="step" data-d="-${step}" data-code="${esc(x.code)}" tabindex="-1" aria-label="−">−</button>
      <input data-qty="${esc(x.code)}" inputmode="numeric" value="${x.final}" aria-label="${t('col_order')}">
      <button data-act="step" data-d="${step}" data-code="${esc(x.code)}" tabindex="-1" aria-label="+">+</button></span></td>
    <td class="r newst ${x.newStock<0?'neg':''}">${d(x.newStock)}${u}</td>
    <td class="r">${fmt(x.price,2)}</td>
    <td class="r">${x.final>0?eur(x.value):'–'}</td></tr>`;
}
function setOverride(cat, code, val){
  const row = session.data[cat].rows.find(r=>r.code===code);
  const sug = calc(cat, row).sug, n = parseInt(val,10);
  if (val==='' || isNaN(n) || n===sug) delete session.overrides[cat][code]; else session.overrides[cat][code] = Math.max(0,n);
  saveSession(); refresh();
}
function refresh(focusSel){
  const a = document.activeElement;
  const sel = focusSel || (a?.dataset?.qty!=null ? `[data-qty="${CSS.escape(a.dataset.qty)}"]` : a?.dataset?.su!=null ? `[data-su="${CSS.escape(a.dataset.su)}"]` : null);
  const st = document.querySelector('.tablewrap')?.scrollTop;
  render();
  const w = document.querySelector('.tablewrap'); if (w && st!=null) w.scrollTop = st;
  if (sel){ const n = document.querySelector(sel); if (n){ n.focus(); n.select?.(); } }
}

/* =====================================================================
   Eksport
   ===================================================================== */
const asCell = v => (/^[1-9]\d{0,14}$/.test(String(v)) ? Number(v) : String(v ?? ''));   // behold foranstillede nuller (fx 086016)
function needXLSX(){ if (typeof XLSX==='undefined'){ toast(t('noXlsx')); return false; } return true; }
function exportLines(cats){ const out=[]; for (const c of cats) for (const x of computed(c)) if (x.final>0) out.push({ cat:c, code:x.code, art:x.art, qty:x.final }); return out; }
function openExport(){
  const loaded = loadedCats();
  const pref = store.get('sb_export_pref', { cats: loaded, mode:'one' });
  $('#mExportT').textContent = t('expTitle');
  $('#exportBody').innerHTML = `
    <div class="field"><span class="lab">${t('expCats')}</span>
      ${loaded.map(c=>{ const s=summary(c); return `<label class="check"><input type="checkbox" name="ecat" value="${c}" ${pref.cats.includes(c)||!pref.cats.length?'checked':''}>
        <b>${esc(catName(c))}</b> <span class="help">${t('lines', s.order)}, ${eur(s.value)}</span>${s.red?` <span class="tag red">${s.red}</span>`:''}</label>`; }).join('')}</div>
    <div class="field"><span class="lab">${t('expFiles')}</span>
      <div class="seg"><label><input type="radio" name="emode" value="one" ${pref.mode!=='split'?'checked':''}>${t('expOne')}</label><label><input type="radio" name="emode" value="split" ${pref.mode==='split'?'checked':''}>${t('expSplit')}</label></div></div>
    <div id="exportInfo"></div><div class="help">${t('expCols')}</div>`;
  $('#exportFoot').innerHTML = `<button class="btn" data-act="close">${t('cancel')}</button><button class="btn primary" data-act="do-export">${ICON.dl} ${t('download')}</button>`;
  const upd = () => {
    const cats = [...document.querySelectorAll('[name=ecat]:checked')].map(i=>i.value);
    const lines = exportLines(cats), red = cats.reduce((a,c)=>a+summary(c).red,0), noArt = lines.filter(l=>!l.art).length;
    $('#exportInfo').innerHTML = `<div class="note ${red?'bad':'ok'}">${t('expReady', fmt(lines.length), fmt(lines.reduce((a,l)=>a+l.qty,0)))}${red?'<br>'+t('expRed', red):''}${noArt?'<br>'+t('expNoArt', noArt):''}</div>`;
  };
  $('#exportBody').onchange = upd; upd();
  $('#mExport').classList.add('show');
}
function doExport(){
  if (!needXLSX()) return;
  const cats = [...document.querySelectorAll('[name=ecat]:checked')].map(i=>i.value);
  const mode = document.querySelector('[name=emode]:checked').value;
  if (!cats.length){ toast(t('pickCat')); return; }
  store.set('sb_export_pref', { cats, mode });
  const w = currentWeek(), groups = mode==='split' ? cats.map(c=>[c]) : [cats];
  let n = 0;
  for (const g of groups){
    const lines = exportLines(g); if (!lines.length) continue;
    const ws = XLSX.utils.aoa_to_sheet([['GH article no.','Customer article no.','Order quantity']].concat(lines.map(l=>[asCell(l.code), asCell(l.art), l.qty])));
    ws['!cols'] = [{wch:16},{wch:22},{wch:15}];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Tabelle1');
    XLSX.writeFile(wb, `Order Heinemann ${t('week', w)}${mode==='split' ? ' ' + catName(g[0]) : ''}.xlsx`); n++;
  }
  // gem ugens tal til sammenligning næste uge
  const snap = { week:w, date:new Date().toISOString().slice(0,10), value: loadedCats().reduce((a,c)=>a+summary(c).value,0) };
  history = history.filter(h=>h.week!==w).concat([snap]).slice(-12); store.set(K_HIST, history);
  $('#mExport').classList.remove('show');
  toast(n ? t('tExported', n) : t('tNothing'));
}
function exportOverview(cats){
  if (!needXLSX()) return;
  cats = cats || loadedCats();
  const r2 = n => Math.round(n*100)/100, w = currentWeek();
  const wb = XLSX.utils.book_new();
  for (const c of cats){
    const showSU = CATS[c].suMode !== 'none';
    const head = [t('col_code'), t('col_desc'), t('col_sold'), t('col_winpos'), t('col_real'), t('col_unit')].concat(showSU?[t('col_su')]:[])
      .concat([t('col_order'), t('col_new'), t('col_price')+' EUR', t('col_value')+' EUR', t('col_art'), t('col_sug'), t('col_note')]);
    const rows = computed(c).map(x => [asCell(x.code), x.desc, r2(x.soldDisp), x.stock, r2(x.real), x.rule ? t('cs') : (x.unit || 'Stk')]
      .concat(showSU ? [(x.suSource==='file'||x.suSource==='memory') ? x.su : x.rule ? x.rule.factor : ''] : [])
      .concat([x.final, r2(x.newStock), x.price, r2(x.value), asCell(x.art), x.manual ? x.sug : '', x.flags.filter(f=>f.c!=='grey'&&f.c!=='teal').map(f=>f.t).join(', ')]));
    const tot = computed(c).reduce((a,x)=>a+x.value,0);
    const blank = head.map(()=> '');
    const sum = blank.slice(); sum[1] = t('total'); sum[head.indexOf(t('col_value')+' EUR')] = r2(tot);
    const ws = XLSX.utils.aoa_to_sheet([head].concat(rows, [blank, sum]));
    ws['!cols'] = head.map((h,i)=>({ wch: i===1 ? 44 : i===head.length-1 ? 26 : Math.max(9, h.length+2) }));
    ws['!autofilter'] = { ref: `A1:${String.fromCharCode(64+head.length)}${rows.length+1}` };
    XLSX.utils.book_append_sheet(wb, ws, catName(c).replace(/[\\/?*[\]:]/g,'').slice(0,31));
  }
  XLSX.writeFile(wb, `${cats.length===1 ? catName(cats[0]) : t('tabOverview')} ${t('week', w)}.xlsx`);
  toast(t('tOverview'));
}
/* =====================================================================
   Varemodtagelse — CDL fra Heinemann → CSV til Winpos
   ===================================================================== */
const RX_COLS = [
  { k:'inv', h:['billing document'] }, { k:'art', h:['article'] }, { k:'desc', h:['article description'] },
  { k:'qty', h:['delivery quantity'], num:true }, { k:'price', h:['price per sales unit'], num:true }, { k:'net', h:['net value'], num:true },
  { k:'ref', h:['customer reference','po number'] }, { k:'brand', h:['brand name'] }, { k:'mgrp', h:['material group'] },
  { k:'unit', h:['sales unit'], hidden:true }, { k:'credit', h:['credit price'], num:true, hidden:true }, { k:'gtin', h:['gtin'], hidden:true },
];
const RX_SHOW = RX_COLS.filter(c=>!c.hidden);
function rxSave(){ store.set(K_RX, rx); }
function parseCDL(sheets){
  for (const { aoa } of sheets){
    let h = -1;
    for (let i=0;i<Math.min(aoa.length,40);i++){ const r = (aoa[i]||[]).map(x=>String(x??'').trim().toLowerCase()); if (r.includes('billing document') && r.includes('article')) { h=i; break; } }
    if (h<0) continue;
    const head = aoa[h].map(x=>String(x??'').trim().toLowerCase());
    const idx = {}; for (const c of RX_COLS) idx[c.k] = c.h.map(n=>head.indexOf(n)).find(i=>i>=0) ?? -1;
    if (idx.art<0 || idx.qty<0 || idx.price<0) throw new Error('Article / Delivery Quantity / Price per Sales Unit ?');
    const rows = [], sums = {}; let total = null;
    for (let i=h+1;i<aoa.length;i++){
      const r = aoa[i]||[], inv = String(r[idx.inv]??'').trim();
      if (!inv) continue;
      if (/[ƩΣ]/.test(inv)){ const no = inv.replace(/[ƩΣ]/g,'').trim(), v = { qty: parseNum(r[idx.qty]) ?? 0, net: parseNum(r[idx.net]) ?? 0 }; if (no) sums[no] = v; else total = v; continue; }
      const o = { id: rows.length };
      for (const c of RX_COLS){ const v = idx[c.k]>=0 ? r[idx[c.k]] : null; o[c.k] = c.num ? (parseNum(v) ?? 0) : String(v ?? '').trim(); }
      if (!o.art) continue;
      o.tester = /^T\s/.test(o.desc) || /^T8/i.test(o.mgrp);
      o.posm = /^X/i.test(o.mgrp) || /pseudo/i.test(o.brand) || /posm/i.test(o.ref);
      o.on = !(rxPref.autoZero && o.price === 0);
      rows.push(o);
    }
    if (rows.length) return { rows, sums, total };
  }
  throw new Error('"Billing Document" / "Article" ?');
}
async function rxLoad(file){
  try{
    const p = parseCDL(await readSheets(file));
    if (rx && rx.rows?.some(r=>!r.on && r.price!==0) && !confirm(t('cRxReplace'))) return;
    rx = { fileName:file.name, loadedAt:Date.now(), rows:p.rows, sums:p.sums, total:p.total };
    rxSave();
    Object.assign(rui, { inv:'all', filter:'all', q:'', colf:{}, sort:{key:null,dir:1} });
    ui.tab = 'receive'; saveUi(); render();
    toast(t('tRx', p.rows.length, rxInvoices().length, p.rows.filter(r=>!r.on).length));
  }catch(e){ console.error(e); alert(t('errRead') + '\n' + e.message); }
}
function rxInvoices(){
  if (!rx) return [];
  const m = new Map();
  for (const r of rx.rows){
    if (!m.has(r.inv)) m.set(r.inv, { no:r.inv, lines:0, qty:0, net:0, on:0, onNet:0, refs:new Set(), zero:0 });
    const v = m.get(r.inv); v.lines++; v.qty += r.qty; v.net += r.net; if (r.ref) v.refs.add(r.ref);
    if (r.on){ v.on++; v.onNet += r.net; } if (r.price===0) v.zero++;
  }
  return [...m.values()].map(v => { const s = rx.sums?.[v.no]; v.sum = s; v.check = s ? (Math.abs(s.net - v.net) < 0.05 && Math.abs(s.qty - v.qty) < 0.001 ? 'ok' : 'diff') : 'none'; return v; });
}
function colMatch(col, val, f){
  f = f.trim(); if (!f) return true;
  if (col.num){
    const m = f.match(/^(>=|<=|<>|!=|>|<|=)\s*(-?[\d.,]+)$/);
    if (m){ const n = parseNum(m[2]); switch(m[1]){ case '>':return val>n; case '<':return val<n; case '>=':return val>=n; case '<=':return val<=n; case '=':return val===n; default:return val!==n; } }
    if (/^-?[\d.,]+$/.test(f)) return val === parseNum(f);
  }
  const neg = /^(!|<>)/.test(f), needle = f.replace(/^(!|<>)/,'').toLowerCase(), hit = String(val).toLowerCase().includes(needle);
  return neg ? !hit : hit;
}
function rxVisible(){
  if (!rx) return [];
  const qq = rui.q.trim().toLowerCase();
  let R = rx.rows.filter(r => {
    if (rui.inv!=='all' && r.inv!==rui.inv) return false;
    if (rui.filter==='on' && !r.on) return false;
    if (rui.filter==='off' && r.on) return false;
    if (rui.filter==='zero' && r.price!==0) return false;
    if (rui.filter==='tester' && !r.tester) return false;
    if (qq && !(r.desc.toLowerCase().includes(qq) || r.art.includes(qq) || r.brand.toLowerCase().includes(qq) || (r.gtin||'').includes(qq))) return false;
    for (const c of RX_SHOW){ const f = rui.colf[c.k]; if (f && !colMatch(c, r[c.k], f)) return false; }
    return true;
  });
  const { key, dir } = rui.sort;
  if (key){
    const col = RX_COLS.find(c=>c.k===key);
    const get = key==='on' ? (r=>r.on?1:0) : col?.num ? (r=>r[key]) : (r=>{ const v=r[key]; return /^\d+$/.test(v) ? +v : String(v).toLowerCase(); });
    R = R.slice().sort((a,b)=>{ const A=get(a),B=get(b); return (A>B?1:A<B?-1:0)*dir; });
  }
  return R;
}
function renderReceive(){
  const el = $('#main');
  if (!rx){
    el.innerHTML = phead(t('tabReceive'), esc(t('desc_receive')), '') + dropZone('cdl', t('rxEmptyTitle'), t('rxEmptyText'));
    return;
  }
  const invs = rxInvoices(), allNet = invs.reduce((a,i)=>a+i.net,0);
  const excl = rx.rows.filter(r=>!r.on).length;
  const totOk = !rx.total || Math.abs(rx.total.net-allNet) < 0.05;
  const cnt = rx.rows.filter(r=>rui.inv==='all'||r.inv===rui.inv);
  const seg = (k,n,c) => `<button class="${rui.filter===k?'on':''}" data-act="rx-filter" data-v="${k}">${esc(n)}<span class="c">${c}</span></button>`;
  const th = c => `<th class="${c.num?'r':''}" data-act="rx-sort" data-k="${c.k}">${esc(t('rc_'+c.k))}${rui.sort.key===c.k?` <span class="arr">${rui.sort.dir>0?'▲':'▼'}</span>`:''}</th>`;
  const anyF = Object.values(rui.colf).some(x=>x && x.trim());
  const stTxt = i => i.check==='ok' ? `<span class="st teal">${t('sumOk')}</span>` : i.check==='diff' ? `<span class="st red">${t('sumDiff')}</span>` : `<span class="st grey">${t('noSum')}</span>`;
  el.innerHTML = phead(t('tabReceive'), `${esc(rx.fileName.replace(/^[0-9a-f]{8}-/,''))}`,
      `<button class="btn ghost" data-act="pick" data-cat="cdl">${ICON.swap} ${t('replace')}</button>
       <button class="btn ghost" data-act="rx-clear">${t('remove')}</button>`)
    + `<p class="lead">${esc(t('desc_receive'))}</p>
    <section class="panel" style="margin-bottom:16px">
      <div class="ph"><h2>${t('rxInvoices')}</h2><span class="s">${t('lines', fmt(rx.rows.length))}${excl?', '+t('rxExcludedN', excl):''}</span></div>
      <div class="invrow ${rui.inv==='all'?'on':''}" data-act="rx-inv" data-v="all"><div class="no">${t('allInv')}</div><span class="n">${t('lines', rx.rows.length)}</span>
        ${rx.total ? (totOk ? `<span class="st teal">${t('totalOk')}</span>` : `<span class="st red">${t('totalDiff')}</span>`) : '<span></span>'}<span class="v">${eur(allNet)}</span><span class="ch">${ICON.chev}</span></div>
      ${invs.map(i=>`<div class="invrow ${rui.inv===i.no?'on':''}" data-act="rx-inv" data-v="${esc(i.no)}">
        <div class="no">${esc(i.no)}<span title="${esc([...i.refs].join(' / '))}">${esc([...i.refs].join(' / '))}</span></div>
        <span class="n">${t('lines', i.lines)}${i.lines!==i.on?`, ${i.lines-i.on} ${t('fOff').toLowerCase()}`:''}</span>${stTxt(i)}<span class="v">${eur(i.net)}</span><span class="ch">${ICON.chev}</span></div>`).join('')}
    </section>
    <div class="toolbar">
      <div class="search">${ICON.search}<input id="rxQ" type="search" placeholder="${esc(t('rxSearch'))}" value="${esc(rui.q)}"></div>
      <div class="seg">${seg('all',t('fAll'),cnt.length)}${seg('on',t('fOn'),cnt.filter(r=>r.on).length)}${seg('off',t('fOff'),cnt.filter(r=>!r.on).length)}${seg('zero',t('fZero'),cnt.filter(r=>r.price===0).length)}${seg('tester',t('fTester'),cnt.filter(r=>r.tester).length)}</div>
      <button class="btn ghost sm" data-act="rx-all" data-v="1">${t('incShown')}</button>
      <button class="btn ghost sm" data-act="rx-all" data-v="0">${t('excShown')}</button>
      ${anyF ? `<button class="btn ghost sm" data-act="rx-clearf" id="rxClearF">${t('clearF')}</button>` : ''}
      ${q(t('rxQ'))}
    </div>
    <div class="tablewrap"><table class="rx-table">
      <thead><tr><th class="chk" data-act="rx-sort" data-k="on">${t('rc_on')}</th>${RX_SHOW.map(th).join('')}</tr>
        <tr class="f"><th class="chk"></th>${RX_SHOW.map(c=>`<th><input data-colf="${c.k}" value="${esc(rui.colf[c.k]||'')}" class="${rui.colf[c.k]?'act':''}" placeholder="${c.num?t('filtNum'):t('filt')}" aria-label="${esc(t('filt')+' '+t('rc_'+c.k))}"></th>`).join('')}</tr></thead>
      <tbody id="rxBody"></tbody><tfoot id="rxFoot"></tfoot></table></div>`;
  rxRenderBody();
}
function rxRenderBody(){
  const R = rxVisible();
  $('#rxBody').innerHTML = R.map(r => `<tr class="${r.on?'':'off'}">
      <td class="chk"><input type="checkbox" data-rxon="${r.id}" ${r.on?'checked':''} aria-label="${t('rc_on')}"></td>
      <td class="code">${esc(r.inv)}</td><td class="code">${esc(r.art)}</td>
      <td class="desc"><div class="d">${esc(r.desc)}</div>${(r.tester||r.posm||r.price===0)?`<div class="flags">${r.tester?'<span class="st amber">Tester</span>':''}${r.posm?'<span class="st grey">POSM</span>':''}${r.price===0?`<span class="st red">${t('fZero')}</span>`:''}</div>`:''}</td>
      <td class="r">${fmt(r.qty)}</td><td class="r">${fmt(r.price,2)}</td><td class="r">${fmt(r.net,2)}</td>
      <td style="white-space:nowrap;font-size:13px;color:var(--ink-2)">${esc(r.ref)}</td><td style="font-size:13px">${esc(r.brand)}</td><td class="code">${esc(r.mgrp)}</td></tr>`).join('')
    || `<tr><td colspan="${RX_SHOW.length+1}"><div class="empty-state">${t('noRows')}</div></td></tr>`;
  const on = R.filter(r=>r.on);
  $('#rxFoot').innerHTML = `<tr><td></td><td colspan="3">${t('rxFoot', fmt(R.length), fmt(on.length))}</td><td class="r">${fmt(on.reduce((a,r)=>a+r.qty,0))}</td><td></td><td class="r">${fmt(on.reduce((a,r)=>a+r.net,0),2)}</td><td colspan="3" style="font-weight:500;color:var(--ink-3)">${t('rxFootSum')}</td></tr>`;
}
const csvField = (v, sep) => { const s = String(v ?? ''); return /["\r\n]/.test(s) || s.includes(sep) ? '"' + s.replace(/"/g,'""') + '"' : s; };
const csvNum = (n, dec) => { const s = String(Math.round(n*10000)/10000); return dec===',' ? s.replace('.', ',') : s; };
function buildCsv(rows, p){
  const sep = p.sep==='tab' ? '\t' : p.sep, out = [];
  if (p.header) out.push(p.headers.map(h=>csvField(h,sep)).join(sep));
  for (const r of rows) out.push([csvField(r.art,sep), csvNum(r.qty,p.dec), csvNum(r.price,p.dec)].join(sep));
  return out.join('\r\n') + '\r\n';
}
function download(name, text){
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type:'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function openCsv(){
  if (!rx) return;
  const invs = rxInvoices(), pre = rui.inv==='all' ? invs.map(i=>i.no) : [rui.inv];
  const seg = (name, opts, cur) => `<div class="seg">${opts.map(([v,l])=>`<label><input type="radio" name="${name}" value="${v}" ${String(cur)===String(v)?'checked':''}>${l}</label>`).join('')}</div>`;
  $('#mCsvT').textContent = t('csvTitle');
  $('#csvBody').innerHTML = `
    <div class="field"><span class="lab">${t('csvInv')}</span>
      ${invs.map(i=>`<label class="check"><input type="checkbox" name="cinv" value="${esc(i.no)}" ${pre.includes(i.no)?'checked':''}><b>${esc(i.no)}</b> <span class="help">${i.on}/${i.lines}, ${eur(i.onNet)}</span>${i.check==='diff'?` <span class="tag red">${t('sumDiff')}</span>`:''}</label>`).join('')}</div>
    <div class="field"><span class="lab">${t('csvFiles')}</span>${seg('cmode',[['split',t('csvSplit')],['one',t('csvOne')]], rxPref.mode)}</div>
    <div class="row3">
      <div class="field"><span class="lab">${t('csvSep')}</span>${seg('csep',[[';',' ; '],[',',' , '],['tab','Tab']], rxPref.sep)}</div>
      <div class="field"><span class="lab">${t('csvDec')}</span>${seg('cdec',[[',','0,64'],['.','0.64']], rxPref.dec)}</div>
      <div class="field"><span class="lab">${t('csvHead')}</span>${seg('chead',[['1',t('with')],['0',t('without')]], rxPref.header?'1':'0')}</div></div>
    <div class="field" id="headNames"><span class="lab">${t('csvHeadNames')}</span>
      <div class="row3">${rxPref.headers.map((h,i)=>`<input type="text" data-hn="${i}" value="${esc(h)}" style="padding:8px 10px;border:1px solid var(--line-2);border-radius:9px;background:var(--card);min-width:0">`).join('')}</div>
      <span class="help">${t('csvHelp')}</span></div>
    <div class="field"><span class="lab">${t('csvPrev')}</span><div class="csv-preview" id="csvPrev"></div></div>`;
  $('#csvFoot').innerHTML = `<button class="btn" data-act="close">${t('cancel')}</button><button class="btn primary" data-act="do-csv">${ICON.dl} ${t('download')}</button>`;
  const upd = () => {
    const p = csvPref(); $('#headNames').style.display = p.header ? '' : 'none';
    const sel = [...document.querySelectorAll('[name=cinv]:checked')].map(i=>i.value), rows = rx.rows.filter(r=>r.on && sel.includes(r.inv));
    $('#csvPrev').textContent = buildCsv(rows.slice(0,6), p).trimEnd().split('\r\n').join('\n') + (rows.length>6 ? '\n' + t('csvMore', rows.length) : '');
  };
  $('#csvBody').oninput = upd; $('#csvBody').onchange = upd; upd();
  $('#mCsv').classList.add('show');
}
function csvPref(){
  const g = n => document.querySelector(`[name=${n}]:checked`)?.value;
  return Object.assign({}, rxPref, { mode:g('cmode'), sep:g('csep'), dec:g('cdec'), header:g('chead')==='1', headers:[0,1,2].map(i => document.querySelector(`[data-hn="${i}"]`)?.value ?? rxPref.headers[i]) });
}
function doCsv(){
  const p = csvPref(); rxPref = Object.assign(rxPref, p); store.set(K_RXP, rxPref);
  const sel = [...document.querySelectorAll('[name=cinv]:checked')].map(i=>i.value);
  if (!sel.length){ toast(t('pickInv')); return; }
  const groups = p.mode==='split' ? sel.map(s=>[s]) : [sel]; let n = 0;
  groups.forEach((g, gi) => {
    const rows = rx.rows.filter(r=>r.on && g.includes(r.inv)); if (!rows.length) return;
    const name = p.mode==='split' ? `CSV PC ${g[0]}.csv` : `CSV PC ${sel.length===1 ? sel[0] : new Date().toISOString().slice(0,10)}.csv`;
    setTimeout(() => download(name, buildCsv(rows, p)), gi*400); n++;
  });
  $('#mCsv').classList.remove('show');
  toast(n ? t('tCsv', n) : t('csvNone'));
}

/* =====================================================================
   ANDRE LEVERANDØRER
   Kolli-størrelsen står i kolonne F "Unit" (fx 16xStk, 48Stk, 5x15g).
   Winpos lægger "solgt × kolli" til lageret i New stock — samme fejl som
   Cola hos Heinemann — så lager nu = New stock − solgt × kolli.
   Indkøbsprisen er pr. kolli, og der bestilles i hele kolli.
   ===================================================================== */
const supKeys = () => Object.keys(session.sup).sort((a,b)=>session.sup[a].name.localeCompare(session.sup[b].name));
const money = (v, cur, d=2) => cur === '€' ? eur(v,d) : `${fmt(v,d)} ${cur}`;
function packFromUnit(u){
  const s = String(u||'').trim();
  const m = /^(\d+)\s*x/i.exec(s) || /^(\d+)\s*(stk|pcs|pc)\.?$/i.exec(s);
  return m ? +m[1] : null;
}
function stockUnitSize(row){
  const suf = String(row.stockRaw||'').replace(/^-?[\d.,]+\s*/,'');
  const m = /^(\d+)\s*x/i.exec(suf);
  return m ? +m[1] : 1;
}
function calcSup(key, row){
  const flags = [], cover = +settings.cover || 1;
  const memKey = 's:' + key + ':' + row.code;
  let pack = suMemory[memKey], src = 'memory';
  if (!pack){ pack = packFromUnit(row.unit); src = pack ? 'file' : 'missing'; }
  if (!pack){ pack = 1; flags.push({ c:'red', t:t('fl_missing') }); }
  const f = Math.max(1, pack / stockUnitSize(row));       // lagerenheder pr. kolli
  const real = row.stock - row.sold * f;                   // ret Winpos-fejlen
  const buf = settings.buffer && src !== 'missing' ? f : 0;
  const target = row.sold * cover + buf, need = target - real;
  let sug = need > 0 ? roundTo(need / f, 1, settings.rounding) : 0;
  if (sug === 0 && real <= 0 && row.sold > 0) sug = 1;
  if (real < 0) flags.push({ c:'amber', t:t('fl_neg') });
  const ov = session.supOv[key]?.[row.code];
  const manual = ov != null && ov !== '' && !isNaN(ov);
  const final = manual ? Math.max(0, +ov) : sug;
  if (manual) flags.push({ c:'blue', t:t('fl_manual', sug) });
  const status = flags.some(x=>x.c==='red') ? 'red' : flags.some(x=>x.c==='amber') ? 'amber' : 'ok';
  const cx = need > 0 ? { k:'need', s:row.sold*cover, b:buf?1:0, r:real, n:need, rd:true } : { k:'ok', r:real, tg:target };
  return { pack, f, src, memKey, real, sug, final, manual, pcs: final * f, newStock: real + final * f, flags, status, cx, value: final * (row.price||0) };
}
function supComputed(key){ const d = session.sup[key]; return d ? d.rows.map(r => Object.assign({ sup:key }, r, calcSup(key, r))) : []; }
function supSummary(key){
  const L2 = supComputed(key);
  return { lines:L2.length, order:L2.filter(x=>x.final>0).length, packs:L2.reduce((a,x)=>a+x.final,0), value:L2.reduce((a,x)=>a+x.value,0),
    red:L2.filter(x=>x.status==='red').length, amber:L2.filter(x=>x.status==='amber').length, manual:L2.filter(x=>x.manual).length, list:L2 };
}
function supCalcText(x){
  const c = x.cx; if (!c) return '';
  if (c.k==='ok') return t('calc_ok', fmtq(c.r), fmtq(c.tg));
  return t('calc_need_sup', fmtq(c.s), c.b, fmtq(c.r), fmtq(c.n), x.f, x.sug);
}

function renderOthers(){
  if (ui.sup !== 'overview' && !session.sup[ui.sup]) ui.sup = 'overview';
  if (ui.sup === 'overview') return renderSupOverview();
  return renderSup(ui.sup);
}
function renderSupOverview(){
  const el = $('#main'), keys = supKeys();
  const head = phead(t('secOthers'), keys.length ? t('supCount', keys.length) : esc(t('othersLead')),
    `<button class="btn" data-act="pick" data-cat="any">${ICON.up} ${t('load')}</button>
     <button class="btn" data-act="sup-export-all" ${keys.length?'':'disabled'}>${ICON.sheet} ${t('xlsAll')}</button>`);
  if (!keys.length){ el.innerHTML = head + dropZone('any', t('supEmptyTitle'), t('supEmptyText')); return; }
  const S = Object.fromEntries(keys.map(k=>[k, supSummary(k)]));
  const byCur = {};
  keys.forEach(k => { const c = session.sup[k].cur; byCur[c] = (byCur[c]||0) + S[k].value; });
  const valTxt = Object.entries(byCur).map(([c,v])=>money(v,c,0)).join(' + ');
  const lines = keys.reduce((a,k)=>a+S[k].order,0), red = keys.reduce((a,k)=>a+S[k].red+S[k].amber,0);
  const maxV = Math.max(1, ...keys.map(k=>S[k].value));
  const issues = keys.flatMap(k=>S[k].list.filter(x=>x.status!=='ok'));
  el.innerHTML = head + `
    <section class="panel stats">
      <div class="stat"><span class="l">${t('kpiBuy')}</span><span class="v">${valTxt}</span><span class="d">${t('supCount', keys.length)}</span></div>
      <div class="stat"><span class="l">${t('kpiLines')}</span><span class="v">${fmt(lines)}</span><span class="d">${t('kpiLinesSub', fmt(keys.reduce((a,k)=>a+S[k].lines,0)))}</span></div>
      <div class="stat"><span class="l">${t('kpiPacks')}</span><span class="v">${fmt(keys.reduce((a,k)=>a+S[k].packs,0))}</span><span class="d">${t('kpiPacksSub')}</span></div>
      <div class="stat"><span class="l">${t('kpiCheck')}</span><span class="v ${red?'red':''}">${fmt(red)}</span><span class="d">${red?t('kpiCheckSub'):t('noIssues')}</span></div>
    </section>
    <section class="panel" style="margin-top:16px">
      <div class="ph"><h2>${t('suppliers')}</h2><span class="s">${t('cardCatsSub')}</span></div>
      ${keys.map(k => { const d = session.sup[k], s = S[k];
        return `<div class="catrow" data-act="sup" data-v="${esc(k)}"><span class="dt" style="--cat:var(--sea)"></span>
          <div class="nm"><b>${esc(d.name)}</b><span>${d.port?esc(d.port)+', ':''}${t('items', fmt(s.lines))}</span></div>
          <div class="bar" style="--cat:var(--sea)"><i style="width:${s.value/maxV*100}%"></i></div>
          <span class="n">${t('lines', s.order)}</span><span class="n v">${money(s.value, d.cur, 0)}</span>
          <span class="iss ${s.red?'r':''}">${s.red ? t('toCheck', s.red) : s.amber ? t('warnings', s.amber) : t('ready')}</span><span class="ch">${ICON.chev}</span></div>`; }).join('')}
    </section>
    ${issues.length ? `<section class="panel" style="margin-top:16px"><div class="ph"><h2>${t('cardCheck')}</h2><span class="s">${t('cardCheckSub')}</span></div>
      ${issues.slice(0,10).map(x=>`<div class="li"><span class="dt" style="--cat:var(--sea)"></span><div class="t"><b>${esc(x.desc)}</b><span>${esc(session.sup[x.sup].name)}, ${t('col_sold').toLowerCase()} ${fmtq(x.sold)}, ${t('col_real').toLowerCase()} ${fmtq(x.real)}</span></div>
        ${x.flags.filter(f=>f.c==='red'||f.c==='amber').slice(0,1).map(f=>`<span class="st ${f.c}">${esc(f.t)}</span>`).join('')}
        <button class="btn sm" data-act="sup-goto" data-sup="${esc(x.sup)}" data-code="${esc(x.code)}">${t('fix')}</button></div>`).join('')}</section>` : ''}`;
}
function renderSup(key){
  const el = $('#main'), d = session.sup[key], all = supComputed(key), s = supSummary(key);
  const counts = { all: all.length, order: s.order, check: all.filter(x=>x.status!=='ok').length, manual: s.manual };
  const showStock = settings.showWinposStock;
  const th = (k,n,cls='',title='') => `<th class="${cls}" data-act="sort" data-k="${k}" ${title?`title="${esc(title)}"`:''}>${esc(n)}${ui.sort.key===k?` <span class="arr">${ui.sort.dir>0?'▲':'▼'}</span>`:''}</th>`;
  const seg = (k,n,c,isRed) => `<button class="${ui.filter===k?'on':''}" data-act="filter" data-v="${k}">${esc(n)}<span class="c ${isRed&&c?'r':''}">${c}</span></button>`;
  el.innerHTML = phead(d.name, `${d.port?esc(d.port)+', ':''}${t('catMeta', s.order, s.lines, money(s.value, d.cur))} <span class="q" title="${esc(d.fileName)}">i</span>`,
      `<button class="btn ghost" data-act="pick" data-cat="any">${ICON.swap} ${t('replace')}</button>
       <button class="btn ghost" data-act="sup-clear" data-sup="${esc(key)}">${t('remove')}</button>`)
    + `<p class="lead">${esc(t('lead_sup'))}</p>
    <div class="toolbar">
      <div class="search">${ICON.search}<input id="q" type="search" placeholder="${esc(t('searchSup'))}" value="${esc(ui.q)}"></div>
      <div class="seg">${seg('all',t('fAll'),counts.all)}${seg('order',t('fOrder'),counts.order)}${seg('check',t('fCheck'),counts.check,true)}${seg('manual',t('fManual'),counts.manual)}</div>
      <label class="toggle"><input type="checkbox" data-act-change="calc" ${settings.showCalc?'checked':''}> ${t('showCalc')}</label>
      ${counts.manual ? `<button class="btn ghost sm" data-act="reset-ov">${t('resetEdits')}</button>` : ''}
      <button class="btn ghost sm" data-act="print" title="${t('print')}" aria-label="${t('print')}">${ICON.print}</button>
    </div>
    <div class="tablewrap"><table>
      <thead><tr>
        ${th('code',t('col_code_sup'))}${th('art',t('col_art'))}${th('desc',t('col_desc'))}${th('sold',t('col_sold'),'r')}
        ${showStock ? th('stock',t('col_winpos'),'r',t('tip_winpos')) : ''}
        ${th('real',t('col_real'),'r',t('tip_real_sup'))}${th('su',t('col_su'),'r',t('tip_su_sup'))}
        ${th('final',t('col_packs'),'r col-order')}${th('pcs',t('col_pcs'),'r')}${th('newStock',t('col_new'),'r',t('tip_new'))}
        ${th('price',t('col_pprice'),'r')}${th('value',t('col_value'),'r')}
      </tr></thead>
      <tbody id="tbody"></tbody><tfoot id="tfoot"></tfoot></table></div>
    <div class="legend"><span class="st red">${t('lgMissing')}</span><span class="st amber">${t('lgNeg')}</span><span class="st blue">${t('lgManual')}</span><span>${t('lgEnter')}</span></div>`;
  renderSupBody(key, all);
}
function renderSupBody(key, all){
  all = all || supComputed(key);
  const d = session.sup[key], showStock = settings.showWinposStock, extra = showStock ? 1 : 0;
  const R = catRows(all);
  $('#tbody').innerHTML = R.map(x => `<tr class="st-${x.status} ${x.final>0?'':'zero'}">
      <td class="code">${esc(x.code)}</td><td class="code">${esc(x.art)}</td>
      <td class="desc"><div class="d">${esc(x.desc)}</div>
        ${x.flags.length?`<div class="flags">${x.flags.map(f=>`<span class="st ${f.c}">${esc(f.t)}</span>`).join('')}</div>`:''}
        ${settings.showCalc?`<div class="why">${esc(supCalcText(x))}</div>`:''}</td>
      <td class="r">${fmtq(x.sold)}</td>
      ${showStock ? `<td class="r" title="${esc(x.stockRaw)}">${fmt(x.stock)}</td>` : ''}
      <td class="r ${x.real<0?'neg':''}">${fmtq(x.real)}</td>
      <td class="r"><input class="su-in ${x.src==='missing'?'missing':''}" data-su="${esc(x.code)}" inputmode="numeric" aria-label="${t('col_su')}"
        value="${x.src==='missing' ? '' : x.pack}" placeholder="${x.src==='missing'?'?':''}" title="${esc('Winpos: ' + (x.unit||'–'))}"></td>
      <td class="r col-order" title="${esc(supCalcText(x))}"><span class="qty ${x.manual?'manual':x.final>0?'has':''}">
        <button data-act="step" data-d="-1" data-code="${esc(x.code)}" tabindex="-1" aria-label="−">−</button>
        <input data-qty="${esc(x.code)}" inputmode="numeric" value="${x.final}" aria-label="${t('col_packs')}">
        <button data-act="step" data-d="1" data-code="${esc(x.code)}" tabindex="-1" aria-label="+">+</button></span></td>
      <td class="r">${x.final>0 ? fmtq(x.pcs) : '–'}</td>
      <td class="r newst ${x.newStock<0?'neg':''}">${fmtq(x.newStock)}</td>
      <td class="r">${fmt(x.price,2)}</td>
      <td class="r">${x.final>0 ? money(x.value, d.cur) : '–'}</td></tr>`).join('')
    || `<tr><td colspan="${11+extra}"><div class="empty-state">${t('noRows')}</div></td></tr>`;
  const ord = R.filter(x=>x.final>0);
  $('#tfoot').innerHTML = `<tr><td colspan="3">${t('foot', fmt(R.length), fmt(ord.length))}</td><td colspan="${3+extra}"></td>
    <td class="r"><b>${fmt(ord.reduce((a,x)=>a+x.final,0))}</b></td><td class="r">${fmt(ord.reduce((a,x)=>a+x.pcs,0))}</td><td></td><td></td><td class="r"><b>${money(ord.reduce((a,x)=>a+x.value,0), d.cur)}</b></td></tr>`;
}
function setSupOverride(key, code, val){
  const row = session.sup[key].rows.find(r=>r.code===code);
  const sug = calcSup(key, row).sug, n = parseInt(val,10);
  session.supOv[key] = session.supOv[key] || {};
  if (val==='' || isNaN(n) || n===sug) delete session.supOv[key][code]; else session.supOv[key][code] = Math.max(0,n);
  saveSession(); refresh();
}
/** Bestillingsliste til leverandøren: én fane pr. leverandør */
function exportSuppliers(keys){
  if (!needXLSX()) return;
  const wb = XLSX.utils.book_new(), w = currentWeek();
  let n = 0;
  for (const k of keys){
    const d = session.sup[k], L2 = supComputed(k).filter(x=>x.final>0);
    const head = [t('col_code_sup'), t('col_art'), t('col_desc'), t('col_packs'), t('col_su'), t('col_pcs'), t('col_pprice'), t('col_value')];
    const rows = L2.map(x => [asCell(x.code), asCell(x.art), x.desc, x.final, x.pack, x.pcs, x.price, Math.round(x.value*100)/100]);
    const tot = L2.reduce((a,x)=>a+x.value,0);
    const ws = XLSX.utils.aoa_to_sheet([[`${d.name}${d.port?' – '+d.port:''}`, '', t('week', w)], [], head].concat(rows, [[], ['', '', t('total'), L2.reduce((a,x)=>a+x.final,0), '', L2.reduce((a,x)=>a+x.pcs,0), '', Math.round(tot*100)/100]]));
    ws['!cols'] = [{wch:12},{wch:13},{wch:44},{wch:13},{wch:15},{wch:8},{wch:14},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws, d.name.replace(/[\\/?*[\]:]/g,'').slice(0,31) || k);
    n++;
  }
  if (!n){ toast(t('tNothing')); return; }
  const name = keys.length === 1 ? `${t('orderFile')} ${session.sup[keys[0]].name} ${t('week', w)}.xlsx` : `${t('orderFile')} ${t('secOthers')} ${t('week', w)}.xlsx`;
  XLSX.writeFile(wb, name);
  toast(t('tExported', 1));
}

/* =====================================================================
   Indstillinger og hjælp
   ===================================================================== */
function openSettings(){
  const s = settings;
  $('#mSetT').textContent = t('sTitle');
  $('#settingsBody').innerHTML = `
    <div class="field"><span class="lab">${t('sOrder')}</span>
      <label class="check"><input type="checkbox" id="setBuffer" ${s.buffer?'checked':''}> ${t('sBuffer')}</label>
      <label class="check"><input type="checkbox" id="setStock" ${s.showWinposStock?'checked':''}> ${t('sWinpos')}</label></div>
    <div class="field"><span class="lab">${t('sMin')}</span>
      <div class="row4">${CAT_KEYS.map(c=>`<div class="field"><span class="help">${esc(catName(c))}</span><input type="number" min="0" id="min_${c}" value="${s.minShelf[c]}"></div>`).join('')}</div></div>
    <div class="row3">
      <div class="field"><label for="setCover">${t('sCover')}</label><select id="setCover">${[1,1.5,2,3].map(v=>`<option value="${v}" ${+s.cover===v?'selected':''}>${fmt(v,v%1?1:0)} ×</option>`).join('')}</select></div>
      <div class="field"><label for="setRound">${t('sRound')}</label><select id="setRound"><option value="nearest" ${s.rounding==='nearest'?'selected':''}>${t('sNearest')}</option><option value="up" ${s.rounding==='up'?'selected':''}>${t('sUp')}</option></select></div>
    </div>
    <div class="field"><span class="lab">${t('sRules')}</span>
      <table class="rules-table"><thead><tr><th>${t('sText')}</th><th>${t('sFactor')}</th><th>${t('sStep')}</th><th></th></tr></thead><tbody id="rulesBody">${s.rules.map(ruleRow).join('')}</tbody></table>
      <div><button class="btn sm" data-act="add-rule">+ ${t('sAddRule')}</button></div><span class="help">${t('sRulesHelp')}</span></div>
    <div class="field"><span class="lab">${t('sMem')}</span><span class="help">${t('sMemN', Object.keys(suMemory).length)} <button class="btn sm" data-act="clear-su" ${Object.keys(suMemory).length?'':'disabled'}>${t('sClear')}</button></span></div>`;
  $('#setFoot').innerHTML = `<button class="btn" data-act="backup">${t('sBackup')}</button><button class="btn" data-act="restore">${t('sRestore')}</button><button class="btn" data-act="reset-settings">${t('sReset')}</button><button class="btn primary" data-act="save-settings">${t('sSave')}</button>`;
  $('#mSettings').classList.add('show');
}
function ruleRow(r){
  return `<tr><td><input type="text" data-r="match" value="${esc(r.match)}"></td><td><input type="number" min="1" data-r="factor" value="${r.factor}" style="width:84px"></td>
    <td><input type="number" min="1" data-r="step" value="${r.step||1}" style="width:84px"><input type="hidden" data-r="cats" value="${esc(r.cats||'ltc')}"></td>
    <td><button class="x-btn" data-act="del-rule" aria-label="×">×</button></td></tr>`;
}
function saveSettings(){
  for (const c of CAT_KEYS) settings.minShelf[c] = Math.max(0, parseInt($('#min_'+c).value,10)||0);
  settings.buffer = $('#setBuffer').checked; settings.showWinposStock = $('#setStock').checked;
  settings.cover = +$('#setCover').value || 1; settings.rounding = $('#setRound').value;
  settings.rules = [...document.querySelectorAll('#rulesBody tr')].map(tr => { const g = k => tr.querySelector(`[data-r="${k}"]`).value;
    return { match:g('match').trim().toLowerCase(), factor:Math.max(1,+g('factor')||1), step:Math.max(1,+g('step')||1), cats:g('cats')||'ltc' }; }).filter(r=>r.match);
  saveSettingsStore(); $('#mSettings').classList.remove('show'); render(); toast(t('tSaved'));
}
function applyTheme(){ document.documentElement.dataset.theme = settings.theme === 'dark' ? 'dark' : 'light'; document.documentElement.lang = settings.lang; }
function openHelp(){
  $('#mHelpT').textContent = t('hTitle');
  const li = a => a.map(x=>`<li>${esc(x)}</li>`).join('');
  $('#helpBody').innerHTML = `<div><h3>${t('hOrder')}</h3><ol>${li(L().hO)}</ol></div><div><h3>${t('hCalc')}</h3><ul>${li(L().hC)}</ul></div><div><h3>${t('hSup')}</h3><ol>${li(L().hS)}</ol></div><div><h3>${t('hRx')}</h3><ol>${li(L().hR)}</ol></div><p class="help">${t('hPriv')}</p>`;
  $('#mHelp').classList.add('show');
}

/* =====================================================================
   Render + hændelser
   ===================================================================== */
function render(){
  if (!(ui.tab in CATS) && ui.tab!=='overview' && ui.tab!=='receive') ui.tab = 'overview';
  applyTheme(); renderTop();
  if (ui.section === 'others') renderOthers();
  else if (ui.tab==='overview') renderOverview(); else if (ui.tab==='receive') renderReceive(); else renderCat(ui.tab);
  renderTop();
}
function pickFile(cat){ const i = $('#file_'+cat); if (i){ i.value=''; i.click(); } }
function rerenderTable(){ ui.section==='others' ? renderSup(ui.sup) : renderCat(ui.tab); }
function rerenderBody(){ ui.section==='others' ? renderSupBody(ui.sup) : renderCatBody(ui.tab); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  if (el.tagName === 'INPUT' && a !== 'none') return;
  switch (a){
    case 'section': ui.section = el.dataset.v; Object.assign(ui, { filter:'all', q:'', sort:{key:null,dir:1} }); saveUi(); render(); window.scrollTo({top:0}); break;
    case 'sup': ui.section='others'; ui.sup = el.dataset.v; Object.assign(ui, { filter:'all', q:'', sort:{key:null,dir:1} }); saveUi(); render(); break;
    case 'sup-goto': Object.assign(ui, { section:'others', sup:el.dataset.sup, filter:'all', q:el.dataset.code, sort:{key:null,dir:1} }); saveUi(); render(); break;
    case 'sup-clear': if (confirm(t('cRemove', session.sup[el.dataset.sup].name))){ delete session.sup[el.dataset.sup]; delete session.supOv[el.dataset.sup]; saveSession(); ui.sup='overview'; saveUi(); render(); } break;
    case 'sup-export': exportSuppliers([el.dataset.sup]); break;
    case 'sup-export-all': exportSuppliers(supKeys()); break;
    case 'tab': ui.section='heinemann'; ui.tab = el.dataset.v; Object.assign(ui, { filter:'all', q:'', sort:{key:null,dir:1} }); saveUi(); render(); break;
    case 'lang': settings.lang = el.dataset.v; saveSettingsStore(); render(); break;
    case 'theme': settings.theme = settings.theme==='dark' ? 'light' : 'dark'; saveSettingsStore(); render(); break;
    case 'pick': pickFile(el.dataset.cat); break;
    case 'clear': if (confirm(t('cRemove', catName(el.dataset.cat)))){ delete session.data[el.dataset.cat]; session.overrides[el.dataset.cat]={}; saveSession(); render(); } break;
    case 'filter': ui.filter = el.dataset.v; rerenderTable(); break;
    case 'sort': { const k=el.dataset.k; ui.sort = ui.sort.key===k ? {key:k,dir:-ui.sort.dir} : {key:k,dir:(['desc','code','art'].includes(k)?1:-1)}; rerenderTable(); break; }
    case 'step': if (ui.section==='others'){ const x = supComputed(ui.sup).find(r=>r.code===el.dataset.code); setSupOverride(ui.sup, el.dataset.code, Math.max(0, x.final + (+el.dataset.d))); break; } { const x = computed(ui.tab).find(r=>r.code===el.dataset.code); setOverride(ui.tab, el.dataset.code, Math.max(0, x.final + (+el.dataset.d))); break; }
    case 'goto': Object.assign(ui, { tab:el.dataset.cat, filter:'all', q:el.dataset.code, sort:{key:null,dir:1} }); saveUi(); render(); break;
    case 'reset-ov': if (ui.section==='others') session.supOv[ui.sup]={}; else session.overrides[ui.tab]={}; saveSession(); render(); toast(t('tReset')); break;
    case 'print': window.print(); break;
    case 'export-order': openExport(); break;
    case 'do-export': doExport(); break;
    case 'export-overview': exportOverview(); break;
    case 'export-cat': exportOverview([el.dataset.cat]); break;
    case 'settings': openSettings(); break;
    case 'save-settings': saveSettings(); break;
    case 'reset-settings': if (confirm(t('cReset'))){ const lang=settings.lang, theme=settings.theme; settings = structuredClone(DEFAULT_SETTINGS); settings.lang=lang; settings.theme=theme; saveSettingsStore(); openSettings(); render(); } break;
    case 'add-rule': $('#rulesBody').insertAdjacentHTML('beforeend', ruleRow({match:'',factor:24,step:1,cats:'ltc'})); break;
    case 'del-rule': el.closest('tr').remove(); break;
    case 'clear-su': if (confirm(t('cClearSu'))){ suMemory={}; store.set(K_SU,suMemory); el.disabled=true; render(); } break;
    case 'backup': { const b=document.createElement('a'); b.href=URL.createObjectURL(new Blob([JSON.stringify({settings,suMemory,rxPref,history,v:4},null,2)],{type:'application/json'})); b.download='shop-bestilling-backup.json'; b.click(); break; }
    case 'restore': $('#inRestore').value=''; $('#inRestore').click(); break;
    case 'help': openHelp(); break;
    case 'close': el.closest('.modal-bg').classList.remove('show'); break;
    case 'rx-clear': if (confirm(t('cRxRemove'))){ rx=null; store.del(K_RX); render(); } break;
    case 'rx-inv': rui.inv = el.dataset.v; renderReceive(); break;
    case 'rx-filter': rui.filter = el.dataset.v; renderReceive(); break;
    case 'rx-sort': { const k=el.dataset.k; rui.sort = rui.sort.key===k ? {key:k,dir:-rui.sort.dir} : {key:k,dir:RX_COLS.find(c=>c.k===k)?.num?-1:1}; renderReceive(); break; }
    case 'rx-all': { const on = el.dataset.v==='1', R = rxVisible(); R.forEach(r=>r.on=on); rxSave(); render(); toast(t('tRxAll', R.length, on)); break; }
    case 'rx-clearf': rui.colf = {}; renderReceive(); break;
    case 'rx-export': openCsv(); break;
    case 'do-csv': doCsv(); break;
  }
});
document.addEventListener('keydown', e => {
  const el = e.target;
  if ((e.key==='Enter' || e.key===' ') && el.classList?.contains('drop')){ e.preventDefault(); el.click(); return; }
  if (e.key==='/' && !/INPUT|TEXTAREA|SELECT/.test(el.tagName)){ const s = $('#q') || $('#rxQ'); if (s){ e.preventDefault(); s.focus(); } return; }
  if (e.key==='Enter' && (el.dataset?.qty!=null || el.dataset?.su!=null)){
    e.preventDefault();
    const attr = el.dataset.qty!=null ? 'data-qty' : 'data-su', list = [...document.querySelectorAll(`[${attr}]`)];
    const next = list[list.indexOf(el) + (e.shiftKey?-1:1)]?.getAttribute(attr);
    const nextSel = next!=null ? `[${attr}="${CSS.escape(next)}"]` : '';
    el.dataset.nextSel = nextSel; el.blur();
    if (nextSel){ const n = document.querySelector(nextSel); if (n){ n.focus(); n.select(); } }
  }
  if (e.key==='Escape') document.querySelectorAll('.modal-bg.show').forEach(m=>m.classList.remove('show'));
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id?.startsWith('file_') && el.files.length){
    const cat = el.id.slice(5), files = [...el.files];
    if (cat==='any') loadAny(files); else if (cat==='cdl') rxLoad(files[0]); else loadOrderFile(cat, files[0]);
    return;
  }
  if (el.id==='inRestore' && el.files[0]){
    el.files[0].text().then(txt => {
      try{ const j = JSON.parse(txt);
        if (j.settings){ const lang=settings.lang, theme=settings.theme; store.set(K_SET, j.settings.v===4 ? j.settings : { minShelf:j.settings.minShelf, buffer:j.settings.buffer }); settings = loadSettings(); settings.lang=lang; settings.theme=theme; }
        if (j.suMemory) suMemory = j.suMemory; if (j.rxPref) rxPref = Object.assign(rxPref, j.rxPref); if (j.history) history = j.history;
        store.set(K_SU,suMemory); store.set(K_RXP, rxPref); store.set(K_HIST, history); saveSettingsStore(); openSettings(); render(); toast(t('tRestored')); }
      catch(err){ alert(t('badBackup')); }
    });
    return;
  }
  if (el.dataset.actChange==='calc'){ settings.showCalc = el.checked; saveSettingsStore(); rerenderBody(); return; }
  if (el.dataset.qty!=null){ const ns = el.dataset.nextSel; ui.section==='others' ? setSupOverride(ui.sup, el.dataset.qty, el.value) : setOverride(ui.tab, el.dataset.qty, el.value); if (ns){ const n=document.querySelector(ns); if(n){ n.focus(); n.select(); } } return; }
  if (el.dataset.su!=null){
    const v = parseSU(el.value), code = el.dataset.su, ns = el.dataset.nextSel, others = ui.section==='others';
    const mk = others ? 's:' + ui.sup + ':' + code : code;
    if (el.value.trim()==='') delete suMemory[mk]; else if (!v){ toast(t('tSuBad')); render(); return; } else suMemory[mk] = v;
    store.set(K_SU, suMemory); if (others) delete session.supOv[ui.sup]?.[code]; else delete session.overrides[ui.tab][code]; saveSession();
    refresh(ns || undefined); toast(v ? t('tSu', v) : t('tSuDel'));
    return;
  }
  if (el.dataset.rxon!=null){
    rx.rows[+el.dataset.rxon].on = el.checked; rxSave();
    const st = document.querySelector('.tablewrap')?.scrollTop; render(); const w=document.querySelector('.tablewrap'); if (w && st!=null) w.scrollTop = st;
  }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id==='q'){ ui.q = el.value; rerenderBody(); return; }
  if (el.id==='rxQ'){ rui.q = el.value; rxRenderBody(); return; }
  if (el.dataset.colf!=null){ rui.colf[el.dataset.colf] = el.value; el.classList.toggle('act', !!el.value.trim()); rxRenderBody(); const b=$('#rxClearF'); if (b) b.disabled = !Object.values(rui.colf).some(x=>x&&x.trim()); }
});
['dragenter','dragover'].forEach(ev => document.addEventListener(ev, e => {
  e.preventDefault(); const z = e.target.closest?.('[data-drop]');
  document.querySelectorAll('[data-drop]').forEach(x=>x.classList.toggle('drag', x===z));
}));
document.addEventListener('dragleave', e => { if (!e.relatedTarget) document.querySelectorAll('.drag').forEach(x=>x.classList.remove('drag')); });
document.addEventListener('drop', e => {
  e.preventDefault(); document.querySelectorAll('.drag').forEach(x=>x.classList.remove('drag'));
  const files = [...(e.dataTransfer?.files||[])]; if (!files.length) return;
  const c = e.target.closest?.('[data-drop]')?.dataset.drop;
  if (c && c!=='any' && files.length===1) return c==='cdl' ? rxLoad(files[0]) : loadOrderFile(c, files[0]);
  loadAny(files);
});
document.querySelectorAll('.modal-bg').forEach(m => m.addEventListener('mousedown', e => { if (e.target===m) m.classList.remove('show'); }));

render();
