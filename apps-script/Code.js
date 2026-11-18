/**
 * 오늘의 옷 — 웹앱 API
 * GET ?token=...            → 날씨 요약 + 옷장 + 규칙 + 설정 + 팔레트(시트에 있으면) (JSON)
 * GET ?token=...&action=weather → 날씨만
 * 스크립트 속성 APP_TOKEN 이 있으면 token 파라미터가 같아야 응답 (주소가 새어도 옷장 정보 보호)
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    const token = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
    if (token && p.token !== token) return json_({ error: 'unauthorized' });

    const settings = readSettings_();
    const nx = settings['격자 nx'] || 62, ny = settings['격자 ny'] || 126;
    const wx = getHourly_(nx, ny);
    const weather = { base: wx.base, region: settings['지역'], days: summarize_(wx.hourly, settings), hourly: wx.hourly };
    if (p.action === 'weather') return json_({ weather: weather });

    return json_({
      updated: Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      weather: weather,
      closet: readTable_('옷장').filter(function (r) { return r['ID'] && r['사용'] !== 'N'; }),
      rules: readTable_('기온규칙'),
      purposes: readTable_('목적'),
      settings: settings,
      palette: readPalette_()   // 시트에 팔레트 탭이 없으면 null → 화면이 palette.json 기본값 사용
    });
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 헤더 1행 기준으로 객체 배열 */
function readTable_(name) {
  const sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) return [];
  const v = sh.getDataRange().getValues();
  const head = v.shift().map(String);
  return v.filter(function (r) { return r.some(function (c) { return c !== ''; }); })
    .map(function (r) { const o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o; });
}

/** 설정 탭 (항목 | 값) → {항목: 값} */
function readSettings_() {
  const o = {};
  readTable_('설정').forEach(function (r) { o[r['항목']] = r['값']; });
  return o;
}

/**
 * POST (본문: JSON 텍스트, 화면에서는 preflight 피하려고 Content-Type: text/plain)
 * {action:'like', id, value:true|false}  → 옷장 '좋아요' Y/빈칸
 * {action:'hide', id}                    → 옷장 '사용' N (시트에서 Y로 되살림)
 * {action:'update', id, fields:{이름, 보온(1-5), 격식(1-3), 계절, 색이름, 색HEX}} → 해당 칸 수정
 * {action:'palette', palette:{colors:[...], official_pairs:[...]}} → 팔레트색·팔레트페어 탭 다시 쓰기
 */
const EDITABLE = ['이름', '보온(1-5)', '격식(1-3)', '계절', '색이름', '색HEX'];

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const token = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
    if (token && body.token !== token) return json_({ error: 'unauthorized' });
    const id = String(body.id || '');
    if (body.action === 'like') return json_(setCells_(id, { '좋아요': body.value ? 'Y' : '' }));
    if (body.action === 'hide') return json_(setCells_(id, { '사용': 'N' }));
    if (body.action === 'update') {
      const f = {};
      Object.keys(body.fields || {}).forEach(function (k) { if (EDITABLE.indexOf(k) >= 0) f[k] = body.fields[k]; });
      if (!Object.keys(f).length) throw new Error('수정할 항목 없음');
      return json_(setCells_(id, f));
    }
    if (body.action === 'palette') return json_(writePalette_(body.palette || {}));
    return json_({ error: 'unknown action' });
  } catch (err) {
    return json_({ error: String(err && err.message || err) });
  }
}

/** 옷장 탭에서 ID 행의 여러 칸을 기록 (칸이 없으면 맨 오른쪽에 추가) */
function setCells_(id, values) {
  if (!id) throw new Error('id 없음');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName('옷장');
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    const ids = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getValues().map(function (r) { return String(r[0]); });
    const row = ids.indexOf(id) + 2;
    if (row < 2) throw new Error('ID ' + id + ' 를 옷장 탭에서 찾을 수 없음');
    Object.keys(values).forEach(function (h) {
      let col = head.indexOf(h) + 1;
      if (!col) {
        head.push(h); col = head.length;
        sh.getRange(1, col).setValue(h);
        sh.getRange(1, 1, 1, col).setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');
      }
      sh.getRange(row, col).setValue(values[h]);
    });
    return { ok: true, id: id, values: values };
  } finally {
    lock.releaseLock();
  }
}

/* ── 팔레트: '팔레트색' 탭 (ID | 이름 | HEX | 역할 | 어울리는 베이직 | 메모), '팔레트페어' 탭 (색1 | 색2 | 무드) ── */
function readPalette_() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName('팔레트색')) return null;
  const colors = readTable_('팔레트색').filter(function (r) { return r['ID'] && r['HEX']; }).map(function (r) {
    return {
      id: String(r['ID']), name_ko: String(r['이름'] || r['ID']), hex: String(r['HEX']).trim(),
      role: String(r['역할'] || 'base'), with: String(r['어울리는 베이직'] || '').split(/[,\s]+/).filter(Boolean), note: String(r['메모'] || '')
    };
  });
  const pairs = readTable_('팔레트페어').filter(function (r) { return r['색1'] && r['색2']; }).map(function (r) {
    return { colors: [String(r['색1']), String(r['색2'])], mood: String(r['무드'] || '') };
  });
  const s = readSettings_();
  return {
    source: String(s['팔레트 출처'] || '내 팔레트'),
    colors: colors,
    official_pairs: pairs,
    suggested_pairs_with_basics: colors.filter(function (c) { return c.with.length; })
      .map(function (c) { return { trend: c.id, with: c.with, note: c.note }; }),
    rules: { max_accent_per_outfit: Number(s['강조색 최대'] || 1), accent_area: 'small' }
  };
}

function writePalette_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActive();
    const colors = (p.colors || []).filter(function (c) { return c.id && c.hex; });
    const pairs = (p.official_pairs || []).filter(function (x) { return x.colors && x.colors.length === 2; });
    writeTab_(ss, '팔레트색', ['ID', '이름', 'HEX', '역할', '어울리는 베이직', '메모'],
      colors.map(function (c) { return [c.id, c.name_ko || c.id, c.hex, c.role || 'base', (c.with || []).join(', '), c.note || '']; }));
    writeTab_(ss, '팔레트페어', ['색1', '색2', '무드'],
      pairs.map(function (x) { return [x.colors[0], x.colors[1], x.mood || '']; }));
    return { ok: true, colors: colors.length, pairs: pairs.length };
  } finally {
    lock.releaseLock();
  }
}

function writeTab_(ss, name, header, rows) {
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  sh.clearContents();
  sh.getRange(1, 1, 1, header.length).setValues([header])
    .setBackground('#37474F').setFontColor('#FFFFFF').setFontWeight('bold');
  sh.setFrozenRows(1);
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
}
