# 오늘의 옷 — 날씨 기반 옷 추천

내 옷장(구글 시트) + 기상청 단기예보로 오늘/내일, 시간대별·목적별 옷 조합을 추천하는 개인용 웹앱.

```
[모바일 웹 (GitHub Pages, 다음 단계)]
      ↕ JSON
[Google Apps Script 웹앱]  ← apps-script/  (clasp으로 배포)
      ├ 기상청 단기예보 호출 (1시간 캐시)
      └ 구글 시트 읽기
[Google Sheet: 옷장 — 오늘의 옷]
   옷장 · 기온규칙 · 목적 · 착용기록 · 설정 · 설명
```

- 시트: https://docs.google.com/spreadsheets/d/1I2dhjTvyBqNEwKTqTD8hw3VR3EtMwth4Z6-isFk0ztc/edit
- 시트 ID: `1I2dhjTvyBqNEwKTqTD8hw3VR3EtMwth4Z6-isFk0ztc`
- 지역: 서울 송파구, 기상청 격자 nx=62, ny=126
- 옷 사진: `../보정/C01.jpg ~ C27.jpg`

## 1. 처음 한 번 — 사람이 직접

1. https://script.google.com/home/usersettings 에서 **Google Apps Script API 사용**을 켭니다.
2. 터미널에서:
   ```
   npm install -g @google/clasp
   clasp login
   ```
   브라우저가 열리면 구글 로그인 후 허용.

## 2. Claude Code가 할 일

> 이 폴더에서 Claude Code에게: "README 2번대로 앱스크립트 연결하고 올려줘"

1. `apps-script/` 폴더에서 위 시트에 **연결된(container-bound) 스크립트**를 만든다.
   - clasp 버전에 따라 명령이 다르므로 `clasp --version`, `clasp --help`로 확인.
   - 예) `clasp create --type sheets --title "오늘의 옷" --parentId 1I2dhjTvyBqNEwKTqTD8hw3VR3EtMwth4Z6-isFk0ztc --rootDir .`
     (v3에서는 `clasp create-script ...`)
   - 생성 시 `appsscript.json`이 덮어써지면 이 저장소의 버전으로 되돌린다.
2. `clasp push` (기존 원격 파일을 덮어쓸지 물으면 yes).
3. 웹앱 배포: `clasp deploy --description "v1"` (v3: `clasp create-deployment`). 배포 ID와 웹앱 URL을 알려준다.
   - 웹앱 URL 형식: `https://script.google.com/macros/s/<배포ID>/exec`
4. 코드 수정 후에는 `clasp push` → 같은 배포 ID로 `clasp deploy -i <배포ID>` 해서 URL 유지.

## 3. 처음 한 번 — 스크립트 편집기에서 (사람)

`clasp open-script` (또는 시트 → 확장 프로그램 → Apps Script)

1. **프로젝트 설정(톱니바퀴) → 스크립트 속성 추가**
   - `KMA_KEY` = 공공데이터포털 **일반 인증키 (Decoding)**
   - `APP_TOKEN` = 아무 긴 문자열 (예: 비밀번호 생성기로 20자) — 웹앱 주소가 새어도 옷장이 보이지 않게
2. 함수 `setupSheets` 실행 → 권한 허용
   ("확인되지 않은 앱" 경고가 나오면 고급 → 이동 → 허용. 내가 만든 스크립트라 정상)
3. 함수 `testWeather` 실행 → 실행 로그에 오늘/내일 아침·낮·저녁 요약이 나오면 성공
   - `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`면 키 승인 직후라 아직 반영 전 → 30분~1시간 뒤 재시도
4. 브라우저에서 `웹앱URL?token=<APP_TOKEN>` 열어 JSON 확인

## 키 보안
- 키는 코드에 넣지 않고 **스크립트 속성**에만. GitHub에 올라가는 건 코드뿐.
- `.clasp.json`의 scriptId는 비밀 아님. `~/.clasprc.json`(로그인 토큰)은 절대 커밋 금지.

## 파일
| 파일 | 내용 |
|---|---|
| `apps-script/Code.js` | 웹앱 `doGet` — 날씨 요약·옷장·규칙·설정 JSON |
| `apps-script/Weather.js` | 기상청 단기예보 호출, 체감온도, 오늘/내일×시간대 요약, 격자 변환, `testWeather` |
| `apps-script/Setup.js` | `setupSheets` — 탭 생성·서식 |
| `apps-script/appsscript.json` | 시간대 Asia/Seoul, 권한, 웹앱 설정 |

## 4. 모바일 화면 — GitHub Pages

`docs/` 폴더가 화면이다 (`index.html`, `recommend.js`, `config.js`, `images/`).

> Claude Code에게: "README 4번대로 GitHub Pages에 올려줘"

1. `docs/config.js`의 `OUTFIT_API`를 실제 웹앱 URL(…/exec)로 바꾼다. **토큰은 넣지 않는다.**
2. GitHub에 새 저장소(예: `outfit-app`)를 만들고 이 폴더 전체를 push.
   - 무료 계정은 Pages를 쓰려면 **공개(public)** 저장소여야 함 → 옷 사진이 공개됨(신상 정보는 없음). 코드·사진만 올라가고 키·토큰은 안 올라감.
3. 저장소 Settings → Pages → Source: `main` 브랜치 `/docs` 폴더 → 저장.
   (`gh api -X POST repos/<owner>/outfit-app/pages -f "source[branch]=main" -f "source[path]=/docs"`)
4. 1~2분 뒤 `https://<owner>.github.io/outfit-app/` 열림.

### 휴대폰 첫 설정
- 휴대폰에서 `https://<owner>.github.io/outfit-app/#token=<APP_TOKEN>` 을 한 번 열면 토큰이 저장되고 주소에서 지워짐.
  (또는 그냥 열고 입력칸에 토큰 입력)
- 브라우저 메뉴 → **홈 화면에 추가** 하면 앱처럼 사용.

### 화면 사용법
- 오늘/내일 탭 → 아침·낮·저녁 중 **밖에 있는 시간대**를 눌러 선택 (오늘 지난 시간대는 흐리게)
- 목적(일상·운동·모임·격식) 선택 → 추천 5개를 이전/다음으로 넘겨봄
- 마지막으로 받은 정보는 저장돼서 통신이 안 될 때도 보임
- 👚 옷장: 품목별 전체 옷 보기. 사진의 ♡를 누르면 시트 옷장 탭 '좋아요' 칸에 Y 저장(doPost) → 추천 가점 +1.5
- 👚 옷장에서 옷을 누르면 상세 시트: ✨ 이 옷으로 코디 · ✏️ 수정(이름·보온·격식·계절·색이름·색HEX) · ♡ 좋아요 · 🗑 옷장에서 빼기(사용 N)
- ✨ 이 옷으로 코디: 그 옷을 반드시 넣은 조합 5개. '날씨 무시'를 켜면 옷의 계절 기온(가을 15℃·겨울 2℃·여름 24℃) 기준
- 🎨 색: 팔레트 보기(트렌드 색·어울리는 베이직·내 옷·추천 페어)와 편집. 저장하면 시트 '팔레트색'·'팔레트페어' 탭에 기록, 탭이 없으면 docs/palette.json(Pinterest 2026) 기본값

## 5. 새 옷 추가 (PC에서 모아서)

사진은 GitHub `docs/images/`에 두고, 속성은 구글 시트 '옷장' 탭에 둔다. 파일명 = 시트의 `사진` 칸 = `C{번호}.jpg`.

| 단계 | 누가 | 할 일 |
|---|---|---|
| 1. 촬영 | 나 | 밝은 단색 배경 · 자연광 · 정면. 옷 1벌당 1장. `C:\작업\개인작업\옷\추가\`에 모으기 |
| 2. 보정·속성 초안 | Claude | "옷\추가 폴더 사진 옷장에 등록해줘" → 배경 제거·색보정·기울기/좌우 맞춤, 다음 ID(현재 마지막 C27) 부여, 속성 초안 표 |
| 3. 확인 | 나 | 이름·색·보온/격식/활동성·좌우맞춤 여부 확인, 고칠 것 알려주기 |
| 4. 파일 저장 | Claude | 보정본(1000px) → `옷\보정\C28.jpg`, 웹용(600px) → `outfit-app\docs\images\C28.jpg`, 원본 → `옷\추가\완료\` |
| 5. 시트 행 추가 | Claude 또는 나 | Google Sheets 커넥터가 켜져 있으면 Claude가 직접 추가, 아니면 붙여넣기용 행을 받아 '옷장' 탭 맨 아래에 붙이기 |
| 6. 배포 | Claude Code | `node tools/img-manifest.js` 실행 → docs 커밋·push → 1~2분 뒤 앱 반영 (앱에서 ⟳ 새로고침) |

규칙
- ID는 겉옷/상의/하의 구분 없이 C + 두 자리 연번, 소품은 A + 연번. 지운 번호는 재사용하지 않음.
- 사진 칸이 비어 있거나 파일이 없으면 앱은 색 동그라미로 표시(소품처럼).
- 옷을 정리할 땐 행을 지우지 말고 `사용`을 N으로 → 추천에서만 빠지고 기록은 남음.
- 사진만 다시 찍어 바꿀 때: 같은 파일명으로 2·4·6단계만.
- **사진 캐시**: 같은 파일명으로 바꾸면 휴대폰이 옛 사진을 계속 보여줌. 그래서 앱은 `docs/images/manifest.json`의 해시를 `?v=`로 붙여 불러온다.
  사진을 추가·교체한 뒤에는 **커밋 전에 반드시 `node tools/img-manifest.js`** 를 실행해 manifest를 갱신할 것.

## 추천 로직 요약 (`docs/recommend.js`)
- 선택한 시간대의 **최저 체감온도** − 설정의 체감 보정 → 기온규칙 행 선택 → 목표 보온합·겉옷·목도리 규칙
- 운동은 귀가 시 체온 저하를 고려해 3℃ 더 춥게 계산
- 조합 = (상의+하의 또는 원피스) + 미들(선택) + 아우터(선택) + 소품(선택). 미들은 **코트 안에만** 겹침
- 계절: 체감온도 기준(20℃↑ 여름, 12~20℃ 봄/가을, 12℃↓ 겨울). 안 맞으면 감점(코트·패딩 안 미들은 예외)
- 색 팔레트(`docs/palette.json`, Pinterest 2026): 트렌드 색 옷 + 추천 베이직 색 조합 +0.5, 공식 페어 +1.0, 강조색(accent)은 한 벌에 1개·소품 위주. 설정 탭 '팔레트 가중치'(기본 1, 0이면 끔). 색은 색이름→HEX(시트에 '색HEX' 칸을 만들면 그 값 우선). 팔레트가 바뀌면 palette.json만 교체
- 좋아요(Y) 옷 +1.5 · 추천 5개 안에서 같은 옷은 최대 2번(상의는 겹치지 않게)
- 점수: 보온합이 목표 밖이면 감점 · 쌀쌀한데 반팔/민소매 감점 · 목적의 격식/활동성 미달 감점 · 비 오면 '비오는날 피함' 감점 · 포인트색 2개 이상 감점 · 일교차 크면 앞트임 겉옷 가점
- 상의가 겹치지 않게 5개를 고름. 같은 날·조건이면 같은 순서

## 다음 단계
- "이거 입을게" → 착용기록 저장(`doPost`) · 최근 입은 옷 감점
- 하루 끝 추움/딱좋음/더움 피드백 → 체감 보정 자동 조정
