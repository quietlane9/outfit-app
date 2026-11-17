/**
 * 기상청 단기예보(getVilageFcst) 조회 · 요약
 * - 키: 스크립트 속성 KMA_KEY (공공데이터포털 '일반 인증키 Decoding')
 * - 결과는 1시간 캐시 → 하루 호출 수십 건 이하
 */
const TZ = 'Asia/Seoul';
const KMA_URL = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst';
const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];
const PTY_NAME = { 0: '없음', 1: '비', 2: '비/눈', 3: '눈', 4: '소나기' };
const SKY_NAME = { 1: '맑음', 3: '구름많음', 4: '흐림' };

function ymdH_(date) {
  const s = Utilities.formatDate(date, TZ, 'yyyyMMdd HH');
  return { ymd: s.slice(0, 8), h: Number(s.slice(9)) };
}

/** 지금 받을 수 있는 가장 최근 발표시각 (발표 후 약 10분 뒤 제공 → 15분 여유) */
function latestBase_(now) {
  const t = ymdH_(new Date(now.getTime() - 15 * 60 * 1000));
  const past = BASE_HOURS.filter(function (b) { return b <= t.h; });
  if (past.length) return { date: t.ymd, time: pad2_(past[past.length - 1]) + '00' };
  const y = ymdH_(new Date(now.getTime() - 15 * 60 * 1000 - 24 * 3600 * 1000));
  return { date: y.ymd, time: '2300' };
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function fetchKma_(base, nx, ny) {
  const key = PropertiesService.getScriptProperties().getProperty('KMA_KEY');
  if (!key) throw new Error('스크립트 속성 KMA_KEY가 없습니다 (프로젝트 설정 → 스크립트 속성).');
  const url = KMA_URL + '?serviceKey=' + encodeURIComponent(key) +
    '&pageNo=1&numOfRows=1500&dataType=JSON' +
    '&base_date=' + base.date + '&base_time=' + base.time + '&nx=' + nx + '&ny=' + ny;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const text = res.getContentText();
  let json;
  try { json = JSON.parse(text); } catch (e) {
    // 키 오류 등은 XML로 옴 (예: SERVICE_KEY_IS_NOT_REGISTERED_ERROR)
    throw new Error('기상청 응답 오류(HTTP ' + res.getResponseCode() + '): ' + text.slice(0, 300));
  }
  const header = json.response && json.response.header;
  if (!header || header.resultCode !== '00') {
    throw new Error('기상청 결과 오류: ' + (header ? header.resultCode + ' ' + header.resultMsg : text.slice(0, 300)));
  }
  return json.response.body.items.item || [];
}

/** 시간별 예보 배열 [{date, hour, tmp, feels, pop, pty, sky, wsd, reh, pcp}] */
function getHourly_(nx, ny) {
  const now = new Date();
  const latest = latestBase_(now);
  const cacheKey = 'wx_' + nx + '_' + ny + '_' + latest.date + latest.time;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  const map = {};
  const put = function (items) {
    items.forEach(function (it) {
      const k = it.fcstDate + it.fcstTime;
      (map[k] = map[k] || { date: it.fcstDate, hour: Number(it.fcstTime.slice(0, 2)) })[it.category] = it.fcstValue;
    });
  };
  // 오늘 이른 시간대를 채우려고 오늘 02시 발표분을 먼저 깔고, 최신 발표분으로 덮어씀
  const today = ymdH_(now).ymd;
  if (!(latest.date === today && latest.time === '0200') && latest.date === today) {
    put(fetchKma_({ date: today, time: '0200' }, nx, ny));
  }
  put(fetchKma_(latest, nx, ny));

  const hourly = Object.keys(map).sort().map(function (k) {
    const r = map[k];
    const tmp = Number(r.TMP), wsd = Number(r.WSD || 0);
    return {
      date: r.date, hour: r.hour, tmp: tmp, feels: feelsLike_(tmp, wsd),
      pop: Number(r.POP || 0), pty: Number(r.PTY || 0), sky: Number(r.SKY || 1),
      wsd: wsd, reh: Number(r.REH || 0), pcp: r.PCP || '강수없음'
    };
  }).filter(function (r) { return !isNaN(r.tmp); });

  const out = { base: latest, hourly: hourly };
  cache.put(cacheKey, JSON.stringify(out), 3600);
  return out;
}

/** 체감온도: 기온 10℃ 이하 & 풍속 1.3m/s 이상이면 기상청 겨울철 체감온도식, 아니면 기온 */
function feelsLike_(t, v) {
  if (t > 10 || v < 1.3) return t;
  const k = Math.pow(v * 3.6, 0.16);
  return Math.round((13.12 + 0.6215 * t - 11.37 * k + 0.3965 * k * t) * 10) / 10;
}

/** 시간대 문자열 '7-10' → [7,10] */
function parseRange_(s, def) {
  const m = String(s || '').match(/(\d+)\s*-\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : def;
}

/** 오늘/내일 × 아침·낮·저녁 요약 */
function summarize_(hourly, settings) {
  const slots = [
    { name: '아침', range: parseRange_(settings['아침 시간'], [7, 10]) },
    { name: '낮', range: parseRange_(settings['낮 시간'], [11, 16]) },
    { name: '저녁', range: parseRange_(settings['저녁 시간'], [17, 22]) }
  ];
  const now = new Date();
  const today = ymdH_(now).ymd;
  const tomorrow = ymdH_(new Date(now.getTime() + 24 * 3600 * 1000)).ymd;

  function agg(rows) {
    if (!rows.length) return null;
    const f = rows.map(function (r) { return r.feels; });
    const t = rows.map(function (r) { return r.tmp; });
    const ptys = rows.map(function (r) { return r.pty; }).filter(function (p) { return p > 0; });
    const skies = rows.map(function (r) { return r.sky; });
    return {
      hours: rows.map(function (r) { return r.hour; }),
      tmpMin: Math.min.apply(null, t), tmpMax: Math.max.apply(null, t),
      feelsMin: Math.min.apply(null, f), feelsMax: Math.max.apply(null, f),
      popMax: Math.max.apply(null, rows.map(function (r) { return r.pop; })),
      wsdMax: Math.max.apply(null, rows.map(function (r) { return r.wsd; })),
      precip: ptys.length ? PTY_NAME[Math.max.apply(null, ptys)] : '없음',
      sky: SKY_NAME[Math.max.apply(null, skies)] || ''
    };
  }

  const days = {};
  [['today', today], ['tomorrow', tomorrow]].forEach(function (d) {
    const rows = hourly.filter(function (r) { return r.date === d[1]; });
    const day = { date: d[1], all: agg(rows), slots: {} };
    slots.forEach(function (s) {
      day.slots[s.name] = agg(rows.filter(function (r) { return r.hour >= s.range[0] && r.hour <= s.range[1]; }));
    });
    days[d[0]] = day;
  });
  return days;
}

/** 위경도 → 기상청 격자 (지역 바꿀 때 사용) */
function latLonToGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136, D = Math.PI / 180;
  const re = RE / GRID, s1 = SLAT1 * D, s2 = SLAT2 * D, olon = OLON * D, olat = OLAT * D;
  let sn = Math.tan(Math.PI * 0.25 + s2 * 0.5) / Math.tan(Math.PI * 0.25 + s1 * 0.5);
  sn = Math.log(Math.cos(s1) / Math.cos(s2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + s1 * 0.5); sf = Math.pow(sf, sn) * Math.cos(s1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5); ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + lat * D * 0.5); ra = re * sf / Math.pow(ra, sn);
  let th = lon * D - olon; if (th > Math.PI) th -= 2 * Math.PI; if (th < -Math.PI) th += 2 * Math.PI; th *= sn;
  return { nx: Math.floor(ra * Math.sin(th) + XO + 0.5), ny: Math.floor(ro - ra * Math.cos(th) + YO + 0.5) };
}

/** 편집기에서 실행해 확인: 실행 로그에 오늘/내일 요약 출력 */
function testWeather() {
  const s = readSettings_();
  const wx = getHourly_(s['격자 nx'] || 62, s['격자 ny'] || 126);
  Logger.log('발표: %s %s, 시간 수: %s', wx.base.date, wx.base.time, wx.hourly.length);
  Logger.log(JSON.stringify(summarize_(wx.hourly, s), null, 2));
}
