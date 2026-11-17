/**
 * 오늘의 옷 — 웹앱 API
 * GET ?token=...            → 날씨 요약 + 옷장 + 규칙 + 설정 (JSON)
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
      settings: settings
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
