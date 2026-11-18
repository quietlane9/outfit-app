/**
 * 오늘의 옷 — 추천 로직 (브라우저·Node 공용)
 * recommend(data, {day:'today'|'tomorrow', purpose:'일상', slots:['아침','낮','저녁']}) → {ctx, combos}
 */
(function (root) {
  const num = (v, d) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));
  const yes = (v) => String(v).trim().toUpperCase() === 'Y';

  // 체감온도로 계절 판단: 20℃↑ 여름, 12~20℃ 봄/가을(1~6월은 봄), 12℃↓ 겨울
  function seasonByTemp(t, month) {
    if (t >= 20) return '여름';
    if (t >= 12) return month >= 1 && month <= 6 ? '봄' : '가을';
    return '겨울';
  }


  // ── 색: 색이름 → HEX (시트에 '색HEX' 칸이 있으면 우선) ──
  const COLOR_HEX = {
    '검정': '#1A1A1A', '블랙': '#1A1A1A', '네이비': '#1F2A44', '그레이': '#808080', '차콜': '#36454F', '흑백': '#808080',
    '아이보리': '#F5F0E6', '오트밀': '#E8DFCF', '화이트': '#FFFFFF', '베이지': '#D8C7A8', '토프': '#9C8B7A', '카멜': '#C19A6B',
    '브라운': '#5C4033', '카키': '#7D7A4F', '버건디': '#5A1F2E', '와인': '#5A1F2E', '네이비퍼플': '#3A2E4F',
    '코발트블루': '#1F5FD0', '스카이블루': '#A9C8E8', '블루': '#4A6A9A', '핑크': '#E7A9B6', '연핑크': '#F3CCD3',
    '진핑크': '#D2457A', '핑크베이지': '#E6C8BE', '라벤더': '#B7A9D0', '퍼플': '#7B5EA7', '그린': '#1F4D3A',
    '화이트/블랙 스트라이프': '#808080'
  };
  function itemHex(x) {
    if (x['색HEX'] && /^#?[0-9a-f]{6}$/i.test(String(x['색HEX']).trim())) return '#' + String(x['색HEX']).trim().replace('#', '');
    const n = String(x['색이름'] || '').trim();
    if (COLOR_HEX[n]) return COLOR_HEX[n];
    const k = Object.keys(COLOR_HEX).sort((a, b) => b.length - a.length).find((key) => n.includes(key));
    return k ? COLOR_HEX[k] : null;
  }
  function lab(hex) {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    const x = (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047, y = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722, z = (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  }
  const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const chroma = (p) => Math.hypot(p[1], p[2]);
  const hue = (p) => (Math.atan2(p[2], p[1]) * 180 / Math.PI + 360) % 360;
  // 트렌드 색과 '같은 색'인지: 색차 24 이하 + 채도·색상 비슷 (검정·네이비가 플럼으로 잡히지 않게)
  function sameTrend(p, t) {
    if (dE(p, t) > 24 || chroma(p) < chroma(t) * 0.5) return false;
    if (chroma(t) < 6) return true;
    let dh = Math.abs(hue(p) - hue(t)); dh = Math.min(dh, 360 - dh);
    return dh <= 35;
  }
  // palette.json(2026 원본 형식)과 시트 형식을 같은 모양으로: colors[].with/note ↔ suggested_pairs_with_basics
  function normalizePalette(p) {
    if (!p || !p.colors) return null;
    const sp = p.suggested_pairs_with_basics || [];
    const colors = p.colors.map((c) => {
      const s = sp.find((x) => x.trend === c.id) || {};
      return { id: c.id, name_ko: c.name_ko || c.id, hex: c.hex, role: c.role || 'base',
        with: (c.with && c.with.length ? c.with : s.with) || [], note: c.note || s.note || '' };
    });
    return {
      source: p.source || '', version: p.version || '', colors,
      official_pairs: (p.official_pairs || []).map((x) => ({ colors: x.colors.slice(0, 2), mood: x.mood || '' })),
      suggested_pairs_with_basics: colors.filter((c) => c.with.length).map((c) => ({ trend: c.id, with: c.with, note: c.note })),
      rules: p.rules || { max_accent_per_outfit: 1, accent_area: 'small' }
    };
  }
  // 팔레트 색별로 해당하는 내 옷
  function paletteMatches(items, palette) {
    const PI = paletteIndex(items, palette); const out = {};
    if (!PI) return out;
    Object.keys(PI.trends).forEach((id) => (out[id] = []));
    PI.map.forEach((v, x) => v.trends.forEach((t) => out[t].push(x)));
    return out;
  }
  // 아이템별 팔레트 정보 미리 계산
  function paletteIndex(items, palette) {
    palette = normalizePalette(palette);
    if (!palette) return null;
    const trends = palette.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c.hex)).map((c) => ({ ...c, lab: lab(c.hex) }));
    const map = new Map();
    items.forEach((x) => {
      const h = itemHex(x); if (!h) return map.set(x, { trends: [], lab: null });
      const p = lab(h);
      map.set(x, { lab: p, trends: trends.filter((t) => sameTrend(p, t.lab)).map((t) => t.id) });
    });
    return { trends: Object.fromEntries(trends.map((t) => [t.id, t])), map, palette };
  }
  // 한 벌의 팔레트 점수와 설명
  function paletteScore(all, PI) {
    if (!PI) return { score: 0, notes: [] };
    let score = 0; const notes = [];
    const info = all.map((x) => ({ x, ...(PI.map.get(x) || { trends: [], lab: null }) }));
    const present = new Set(info.flatMap((i) => i.trends));
    const nm = (id) => (PI.trends[id] || {}).name_ko || id;
    (PI.palette.official_pairs || []).forEach((pr) => {
      if (pr.colors.every((c) => present.has(c))) { score += 1.0; notes.push('🎨 ' + pr.colors.map(nm).join(' × ')); }
    });
    (PI.palette.suggested_pairs_with_basics || []).forEach((sp) => {
      if (!present.has(sp.trend)) return;
      const basics = sp.with.filter((h) => /^#[0-9a-f]{6}$/i.test(h)).map(lab);
      const mate = info.find((i) => i.lab && !i.trends.includes(sp.trend) && basics.some((b) => dE(i.lab, b) <= 15));
      if (mate) { score += 0.5; notes.push('🎨 ' + nm(sp.trend) + ' + ' + mate.x['이름']); }
    });
    const rules = PI.palette.rules || {};
    const accents = info.filter((i) => i.trends.some((t) => (PI.trends[t] || {}).role === 'accent'));
    const maxA = rules.max_accent_per_outfit == null ? 1 : rules.max_accent_per_outfit;
    if (accents.length > maxA) score -= 2 * (accents.length - maxA);
    if (rules.accent_area === 'small') accents.forEach((i) => { if (i.x['레이어'] !== '소품') score -= 0.5; });
    return { score, notes };
  }

  // 결정적 난수 (같은 날·같은 조건이면 같은 순서)
  function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

  function context(data, opt) {
    const day = data.weather.days[opt.day];
    const s = data.settings || {};
    const slots = opt.slots.map((n) => day.slots[n]).filter(Boolean);
    const src = slots.length ? slots : [day.all];
    const feelsMin = Math.min(...src.map((x) => x.feelsMin));
    const feelsMax = Math.max(...src.map((x) => x.feelsMax));
    const popMax = Math.max(...src.map((x) => x.popMax));
    const wsdMax = Math.max(...src.map((x) => x.wsdMax));
    const precip = src.map((x) => x.precip).find((p) => p && p !== '없음') || '없음';
    const purpose = (data.purposes || []).find((p) => p['목적'] === opt.purpose) || { '목적': opt.purpose };
    let design = feelsMin - num(s['체감 보정(℃)'], 0);
    if (opt.purpose === '운동') design -= 3; // 운동 후 귀가 시 체온 저하 → 한 단계 따뜻하게
    const rule = (data.rules || []).find((r) => design >= num(r['체감온도 하한(℃)'], -99) && design <= num(r['체감온도 상한(℃)'], 99)) ||
      (data.rules || [])[0] || {};
    const swing = feelsMax - feelsMin;
    return {
      day, feelsMin, feelsMax, popMax, wsdMax, precip, purpose, rule, design,
      rainy: precip !== '없음' || popMax >= 60,
      bigSwing: swing >= num(s['일교차 기준(℃)'], 10),
      swing,
      warmMin: num(rule['목표 보온합 최소'], 0), warmMax: num(rule['목표 보온합 최대'], 99),
      season: seasonByTemp(design, Number(String(day.date).slice(4, 6)))
    };
  }

  function recommend(data, opt) {
    const ctx = context(data, opt);
    const items = (data.closet || []).filter((c) => c['ID']);
    const by = (layer) => items.filter((c) => c['레이어'] === layer);
    const tops = by('이너'), bottoms = by('하의'), dresses = by('원피스'), mids = by('미들'), outers = by('아우터');
    const acc = items.filter((c) => c['레이어'] === '소품');
    const scarves = acc.filter((a) => /스카프/.test(a['이름']));
    const mufflers = acc.filter((a) => /목도리/.test(a['이름']));

    const PI = paletteIndex(items, data.palette);
    const palW = num((data.settings || {})['팔레트 가중치'], 1);   // 설정 탭: 0이면 끔, 2면 두 배
    // 특정 옷 코디(opt.pin) · 날씨 무시(opt.ignoreWeather)
    const pin = opt.pin ? items.find((x) => String(x['ID']) === String(opt.pin)) : null;
    const W = !opt.ignoreWeather;
    const pinL = pin ? pin['레이어'] : '';
    const bases = [];
    (pinL === '이너' ? [pin] : tops).forEach((t) => (pinL === '하의' ? [pin] : bottoms).forEach((b) => bases.push([t, b])));
    if (!pinL || pinL === '원피스' || !['이너', '하의'].includes(pinL)) (pinL === '원피스' ? [pin] : dresses).forEach((d) => bases.push([d]));
    const midOpts = pinL === '미들' ? [pin] : [null, ...mids];
    const outerOpts = pinL === '아우터' ? [pin] : [null, ...outers];
    ctx.pin = pin; ctx.ignoreWeather = !W;
    if (!W) {
      // 날씨 무시: 고른 옷의 계절 기온을 가상 날씨로 사용 (가을옷 15℃, 겨울옷 2℃, 여름옷 24℃)
      const ps = pin ? String(pin['계절'] || '') : '';
      const vs = ['가을', '봄', '겨울', '여름'].find((q) => ps.includes(q)) || '가을';
      const vt = { '여름': 24, '봄': 15, '가을': 15, '겨울': 2 }[vs];
      const vr = (data.rules || []).find((r) => vt >= num(r['체감온도 하한(℃)'], -99) && vt <= num(r['체감온도 상한(℃)'], 99)) || ctx.rule;
      Object.assign(ctx, { design: vt, season: vs, rule: vr, virtualSeason: vs,
        warmMin: num(vr['목표 보온합 최소'], 0), warmMax: num(vr['목표 보온합 최대'], 99) });
    }
    if (pin && W) {
      const warn = [];
      if (pinL !== '미들' && pin['계절'] && !String(pin['계절']).includes(ctx.season)) warn.push('이 옷은 ' + pin['계절'] + '용인데 지금 날씨는 ' + ctx.season + ' 기준이에요');
      if (pinL === '아우터' && String(ctx.rule['겉옷'] || '') === '없음') warn.push('겉옷 없이도 되는 날씨예요');
      if (num(pin['보온(1-5)'], 2) > ctx.warmMax) warn.push('이 옷만으로도 목표 보온보다 따뜻해요');
      ctx.pinWarn = warn;
    }

    const outerRule = String(ctx.rule['겉옷'] || '');
    const mufflerRule = String(ctx.rule['목도리'] || 'N').toUpperCase();
    const P = ctx.purpose;
    const formalMin = num(P['격식 최소'], 1), activeMin = num(P['활동성 최소'], 1);
    const denimOK = P['데님 허용'] == null ? true : yes(P['데님 허용']);
    const frontBonus = yes(P['앞트임 우대']);

    let accOpts = [null];
    if (pinL === '소품') accOpts = [pin];
    else if (mufflerRule === 'Y') accOpts = mufflers.slice();
    else if (mufflerRule === '선택') accOpts = [null, ...mufflers, ...scarves];
    else if (ctx.design >= 8 && ctx.design <= 22) accOpts = [null, ...scarves];
    if (!accOpts.length) accOpts = [null];

    const combos = [];
    for (const base of bases) {
      for (const mid of midOpts) {
        for (const outer of outerOpts) {
          if (mid && outer && !/코트|패딩/.test(outer['이름'])) continue; // 재킷 위에 재킷은 X, 코트·패딩 안에만 레이어드
          if (outerRule === '없음' && outer && outer !== pin) continue;
          if (/필수/.test(outerRule) && /아우터/.test(outerRule) && !outer && pinL !== '미들') continue;
          if (/미들 필수/.test(outerRule) && !mid && !outer) continue;
          for (const a of accOpts) {
            const wear = [...base, mid, outer].filter(Boolean);
            const all = a ? [...wear, a] : wear;
            const warm = all.reduce((s, x) => s + num(x['보온(1-5)'], 2), 0);
            let score = 0; const why = [];

            {
            // 보온 목표
            if (warm < ctx.warmMin) score -= 2.5 * (ctx.warmMin - warm);
            if (warm > ctx.warmMax) score -= 2 * (warm - ctx.warmMax);
            // 겉옷 권장
            if (/미들 권장/.test(outerRule) && (mid || outer)) score += 1;
            if (/아우터 권장/.test(outerRule) && outer) score += 1.5;
            // 반팔·민소매는 쌀쌀하면 감점
            if (ctx.design < 15 && base.some((x) => /반팔|민소매/.test(x['이름']))) score -= 3;
            }
            // 목적: 격식
            const formal = Math.min(...wear.map((x) => num(x['격식(1-3)'], 2)));
            if (formal < formalMin) score -= 3 * (formalMin - formal);
            if (opt.purpose === '격식') {
              const top = outer || mid;
              if (!top || num(top['격식(1-3)'], 2) < 3) score -= 4;
            }
            if (!denimOK && wear.some((x) => /데님/.test(x['메모'] || ''))) score -= 6;
            // 목적: 활동성
            wear.forEach((x) => { if (num(x['활동성(1-3)'], 2) < activeMin) score -= 1.5; });
            if (frontBonus) { const o = outer || mid; if (o && yes(o['앞트임'])) score += 1; }
            // 비
            if (W && ctx.rainy) all.forEach((x) => { if (yes(x['비오는날 피함'])) { score -= 3; } });
            // 일교차 → 벗을 수 있는 겉옷
            const removable = [mid, outer].some((x) => x && yes(x['앞트임']));
            if (W && ctx.bigSwing && removable) score += 1.5;
            // 색: 포인트는 하나만 (소품 포함)
            const points = all.filter((x) => x['색계열'] === '포인트').length;
            if (points > 1) score -= 2.5 * (points - 1);
            if (points === 0 && a) score -= 0.5; // 무채색 소품만 더하는 건 의미 적음
            // 계절 (체감온도 기준). 코트·패딩 안에 겹친 미들은 예외
            all.forEach((x) => {
              if (!x['계절'] || String(x['계절']).includes(ctx.season)) return;
              if (x['레이어'] === '소품') score -= 0.5;
              else if (x === mid && outer) return;
              else score -= 1.5;
            });
            // Pinterest 팔레트
            const pal = paletteScore(all, PI); score += pal.score * palW;
            // 좋아요
            all.forEach((x) => { if (yes(x['좋아요'])) score += 1.5; });

            score += hash(ctx.day.date + opt.purpose + all.map((x) => x['ID']).join()) * 0.8;
            combos.push({ base, mid, outer, acc: a, warm, score, removable, points, pal: palW > 0 ? pal.notes : [] });
          }
        }
      }
    }
    combos.sort((x, y) => y.score - x.score);

    // 다양성: 주인공 옷(상의/원피스, 특정 옷 코디면 그 옷 다음 주요 옷)은 겹치지 않게, 나머지는 5개 중 최대 2번
    const picked = [], used = {};
    const ids = (c) => [...c.base, c.mid, c.outer, c.acc].filter(Boolean).filter((x) => x !== pin).map((x) => x['ID']);
    const key = (c) => { const m = [c.base[0], c.base[1], c.outer || c.mid].find((x) => x && x !== pin); return m ? m['ID'] : ''; };
    for (const c of combos) {
      if (picked.some((p) => key(p) === key(c))) continue;
      if (ids(c).some((id) => (used[id] || 0) >= 2)) continue;
      picked.push(c); ids(c).forEach((id) => (used[id] = (used[id] || 0) + 1));
      if (picked.length >= 5) break;
    }
    picked.forEach((c) => (c.notes = notes(c, ctx)));
    return { ctx, combos: picked };
  }

  function notes(c, ctx) {
    const n = [];
    if (!ctx.ignoreWeather && ctx.rainy) n.push('☂ 우산 챙기기');
    if (!ctx.ignoreWeather && ctx.bigSwing && c.removable) n.push('낮엔 ' + (c.outer || c.mid)['이름'] + ' 벗기');
    if (c.acc && /목도리/.test(c.acc['이름'])) n.push('바람 막는 목도리');
    if (!ctx.ignoreWeather && ctx.wsdMax >= 5) n.push('바람 강함 ' + ctx.wsdMax + 'm/s');
    (c.pal || []).slice(0, 2).forEach((p) => n.push(p));
    return n;
  }

  const api = { recommend, context, normalizePalette, paletteMatches, itemHex, COLOR_HEX };
  if (typeof module !== 'undefined') module.exports = api; else root.Outfit = api;
})(this);
