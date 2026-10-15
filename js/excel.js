/* Shop Bestilling – læsning af Winpos- og CDL-filer (inkl. indbygget .xlsx-læser)
   Indlæses i rækkefølgen i18n.js → excel.js → app.js (almindelige scripts, fælles globalt scope). */
'use strict';
/** Tal fra Winpos-celler: 46 · "46 Stk" · "9.872 0,33ltr" (punktum = tusind) · "2,5" */
function parseNum(v){
  if (v==null || v==='') return null;
  if (typeof v === 'number') return v;
  const m = String(v).replace(/ /g,' ').trim().match(/^-?[\d.,]+/);
  if (!m) return null;
  let s = m[0];
  if (s.includes(',')) s = s.replace(/\./g,'').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
/** Sekundær enhed tæller kun hvis det er et rent tal (12, 24 …) */
function parseSU(v){
  if (v==null || v==='') return null;
  if (typeof v === 'number') return v > 0 ? v : null;
  const s = String(v).trim();
  return /^\d+$/.test(s) && +s > 0 ? +s : null;
}
function detectWeek(name){ const m = String(name||'').match(/(?:week|uge|wk)[\s_-]*(\d{1,2})/i); return m ? +m[1] : null; }
function isoWeek(d=new Date()){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(),0,1))) / 86400000 + 1) / 7);
}
function guessCat(name){
  const n = String(name||'').toLowerCase();
  if (/cosm|hygi|hyg/.test(n)) return 'cosmetic';
  if (/ltc/.test(n)) return 'ltc';
  if (/perfum|parfum/.test(n)) return 'perfume';
  if (/andet|other|misc/.test(n)) return 'andet';
  if (/cdl|transp/.test(n)) return 'cdl';
  return null;
}


/* =====================================================================
   Indbygget .xlsx-læser.
   Heinemanns CDL-filer er pakket med Windows-stier ("xl\worksheets\…"),
   som Excel-biblioteket ikke kan åbne. Denne læser klarer det.
   ===================================================================== */
async function inflateRaw(u8){
  const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
function unzip(buf){
  const dv = new DataView(buf), u8 = new Uint8Array(buf), td = new TextDecoder();
  let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50){ e = i; break; }
  if (e < 0) throw new Error('Ikke en .xlsx-fil');
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const files = {};
  for (let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++){
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, '/').replace(/^\/+/, '');
    files[name.toLowerCase()] = { method, csize, off };
    p += 46 + nlen + xlen + clen;
  }
  return {
    async text(path){
      const f = files[path.replace(/\\/g,'/').replace(/^\/+/, '').toLowerCase()];
      if (!f) return null;
      const start = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
      const raw = u8.subarray(start, start + f.csize);
      const out = f.method === 0 ? raw : await inflateRaw(raw);
      return new TextDecoder().decode(out).replace(/^﻿/, '');
    }
  };
}
async function readXlsxNative(buf){
  const z = unzip(buf);
  const P = s => new DOMParser().parseFromString(s, 'application/xml');
  const wbTxt = await z.text('xl/workbook.xml');
  if (!wbTxt) throw new Error('Mangler workbook.xml');
  const wb = P(wbTxt);
  const rels = {};
  const relTxt = await z.text('xl/_rels/workbook.xml.rels');
  if (relTxt) for (const r of P(relTxt).getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
  const ss = [];
  const ssTxt = await z.text('xl/sharedStrings.xml');
  if (ssTxt) for (const si of P(ssTxt).getElementsByTagName('si')){
    let t = ''; for (const x of si.getElementsByTagName('t')) if (x.parentNode.nodeName !== 'rPh') t += x.textContent; ss.push(t);
  }
  const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref||''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n*26 + ch.charCodeAt(0) - 64; return n - 1; };
  const out = [];
  let si = 0;
  for (const sh of wb.getElementsByTagName('sheet')){
    si++;
    const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    let target = (rels[rid] || `worksheets/sheet${si}.xml`).replace(/\\/g,'/');
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//,'');
    const txt = await z.text(target);
    if (!txt) continue;
    const doc = P(txt), aoa = [];
    let rAuto = 0;
    for (const row of doc.getElementsByTagName('row')){
      const ri = row.getAttribute('r') ? +row.getAttribute('r') - 1 : rAuto;
      rAuto = ri + 1;
      const arr = []; let cAuto = 0;
      for (const c of row.getElementsByTagName('c')){
        let ci = colIdx(c.getAttribute('r')); if (ci < 0) ci = cAuto; cAuto = ci + 1;
        const t = c.getAttribute('t'), vEl = c.getElementsByTagName('v')[0], v = vEl ? vEl.textContent : null;
        let val = null;
        if (t === 's') val = v != null ? ss[+v] : null;
        else if (t === 'inlineStr'){ const is = c.getElementsByTagName('t'); val = [...is].map(x=>x.textContent).join(''); }
        else if (t === 'str' || t === 'e') val = v;
        else if (t === 'b') val = v === '1';
        else if (v != null && v !== ''){ const n = +v; val = isNaN(n) ? v : n; }
        arr[ci] = val;
      }
      for (let i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = null;
      aoa[ri] = arr;
    }
    for (let i = 0; i < aoa.length; i++) if (!aoa[i]) aoa[i] = [];
    out.push({ name: sh.getAttribute('name'), aoa });
  }
  if (!out.length) throw new Error('Ingen ark fundet');
  return out;
}
/** Læs regneark → [{name, aoa}] — indbygget læser til .xlsx, Excel-biblioteket til .xls */
async function readSheets(file){
  const buf = await file.arrayBuffer();
  const isZip = new Uint8Array(buf, 0, 2)[0] === 0x50 && new Uint8Array(buf, 0, 2)[1] === 0x4b;
  let nativeErr = null;
  if (isZip && typeof DecompressionStream !== 'undefined'){
    try { return await readXlsxNative(buf); } catch(e){ nativeErr = e; console.warn('Indbygget læser fejlede, prøver biblioteket', e); }
  }
  if (typeof XLSX === 'undefined') throw nativeErr || new Error('Excel-læseren kunne ikke indlæses (kræver internet første gang).');
  const wb = XLSX.read(buf, { type:'array' });
  return wb.SheetNames.map(n => ({ name:n, aoa: XLSX.utils.sheet_to_json(wb.Sheets[n], { header:1, raw:true, defval:null }) }));
}

