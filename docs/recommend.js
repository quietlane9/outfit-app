/**
 * 오늘의 옷 — 추천 로직 (브라우저·Node 공용)
 * recommend(data, {day:'today'|'tomorrow', purpose:'일상', slots:['아침','낮','저녁']}) → {ctx, combos}
 */
(function (root) {
  const num = (v, d) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));
  const yes = (v) => String(v).trim().toUpperCase() === 'Y';

  function seasonOf(month) {
    return month <= 2 || month === 12 ? '겨울' : month <= 5 ? '봄' : month <= 8 ? '여름' : '가을';
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
      season: seasonOf(Number(String(day.date).slice(4, 6)))
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

    const bases = [];
    tops.forEach((t) => bottoms.forEach((b) => bases.push([t, b])));
    dresses.forEach((d) => bases.push([d]));

    const outerRule = String(ctx.rule['겉옷'] || '');
    const mufflerRule = String(ctx.rule['목도리'] || 'N').toUpperCase();
    const P = ctx.purpose;
    const formalMin = num(P['격식 최소'], 1), activeMin = num(P['활동성 최소'], 1);
    const denimOK = P['데님 허용'] == null ? true : yes(P['데님 허용']);
    const frontBonus = yes(P['앞트임 우대']);

    let accOpts = [null];
    if (mufflerRule === 'Y') accOpts = mufflers.slice();
    else if (mufflerRule === '선택') accOpts = [null, ...mufflers, ...scarves];
    else if (ctx.design >= 8 && ctx.design <= 22) accOpts = [null, ...scarves];
    if (!accOpts.length) accOpts = [null];

    const combos = [];
    for (const base of bases) {
      for (const mid of [null, ...mids]) {
        for (const outer of [null, ...outers]) {
          if (mid && outer && !/코트/.test(outer['이름'])) continue; // 재킷 위에 재킷은 X, 코트 안에만 레이어드
          if (outerRule === '없음' && outer) continue;
          if (/필수/.test(outerRule) && /아우터/.test(outerRule) && !outer) continue;
          if (/미들 필수/.test(outerRule) && !mid && !outer) continue;
          for (const a of accOpts) {
            const wear = [...base, mid, outer].filter(Boolean);
            const all = a ? [...wear, a] : wear;
            const warm = all.reduce((s, x) => s + num(x['보온(1-5)'], 2), 0);
            let score = 0; const why = [];

            // 보온 목표
            if (warm < ctx.warmMin) score -= 2.5 * (ctx.warmMin - warm);
            if (warm > ctx.warmMax) score -= 2 * (warm - ctx.warmMax);
            // 겉옷 권장
            if (/미들 권장/.test(outerRule) && (mid || outer)) score += 1;
            if (/아우터 권장/.test(outerRule) && outer) score += 1.5;
            // 반팔·민소매는 쌀쌀하면 감점
            if (ctx.design < 15 && base.some((x) => /반팔|민소매/.test(x['이름']))) score -= 3;
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
            if (ctx.rainy) all.forEach((x) => { if (yes(x['비오는날 피함'])) { score -= 3; } });
            // 일교차 → 벗을 수 있는 겉옷
            const removable = [mid, outer].some((x) => x && yes(x['앞트임']));
            if (ctx.bigSwing && removable) score += 1.5;
            // 색: 포인트는 하나만 (소품 포함)
            const points = all.filter((x) => x['색계열'] === '포인트').length;
            if (points > 1) score -= 2.5 * (points - 1);
            if (points === 0 && a) score -= 0.5; // 무채색 소품만 더하는 건 의미 적음
            // 계절
            all.forEach((x) => { if (x['계절'] && !String(x['계절']).includes(ctx.season) && x['레이어'] !== '소품') score -= 0.5; });

            score += hash(ctx.day.date + opt.purpose + all.map((x) => x['ID']).join()) * 0.8;
            combos.push({ base, mid, outer, acc: a, warm, score, removable, points });
          }
        }
      }
    }
    combos.sort((x, y) => y.score - x.score);

    // 다양성: 상의(원피스)·하의·겉옷이 다른 조합 위주로 5개
    const picked = [];
    for (const c of combos) {
      const key = (x) => [x.base[0]['ID'], (x.outer || x.mid || {})['ID']];
      if (picked.some((p) => p.base[0]['ID'] === c.base[0]['ID'])) continue;
      if (picked.filter((p) => key(p)[1] === key(c)[1]).length >= 2) continue;
      picked.push(c);
      if (picked.length >= 5) break;
    }
    picked.forEach((c) => (c.notes = notes(c, ctx)));
    return { ctx, combos: picked };
  }

  function notes(c, ctx) {
    const n = [];
    if (ctx.rainy) n.push('☂ 우산 챙기기');
    if (ctx.bigSwing && c.removable) n.push('낮엔 ' + (c.outer || c.mid)['이름'] + ' 벗기');
    if (c.acc && /목도리/.test(c.acc['이름'])) n.push('바람 막는 목도리');
    if (ctx.wsdMax >= 5) n.push('바람 강함 ' + ctx.wsdMax + 'm/s');
    return n;
  }

  const api = { recommend, context };
  if (typeof module !== 'undefined') module.exports = api; else root.Outfit = api;
})(this);
