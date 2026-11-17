// docs/images 의 사진마다 내용 해시를 manifest.json 에 기록 → 앱이 ?v=해시 를 붙여 캐시 무효화
// 사용: node tools/img-manifest.js   (사진을 바꾸거나 추가한 뒤, 커밋 전에 실행)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const dir = path.join(__dirname, '..', 'docs', 'images');
const out = {};
for (const f of fs.readdirSync(dir).sort()) {
  if (!/\.(jpe?g|png|webp)$/i.test(f)) continue;
  out[f] = crypto.createHash('sha1').update(fs.readFileSync(path.join(dir, f))).digest('hex').slice(0, 8);
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(out, null, 1) + '\n');
console.log('manifest.json: ' + Object.keys(out).length + '장');
