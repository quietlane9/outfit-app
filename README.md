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

## 추천 로직 요약 (`docs/recommend.js`)
- 선택한 시간대의 **최저 체감온도** − 설정의 체감 보정 → 기온규칙 행 선택 → 목표 보온합·겉옷·목도리 규칙
- 운동은 귀가 시 체온 저하를 고려해 3℃ 더 춥게 계산
- 조합 = (상의+하의 또는 원피스) + 미들(선택) + 아우터(선택) + 소품(선택). 미들은 **코트 안에만** 겹침
- 점수: 보온합이 목표 밖이면 감점 · 쌀쌀한데 반팔/민소매 감점 · 목적의 격식/활동성 미달 감점 · 비 오면 '비오는날 피함' 감점 · 포인트색 2개 이상 감점 · 일교차 크면 앞트임 겉옷 가점
- 상의가 겹치지 않게 5개를 고름. 같은 날·조건이면 같은 순서

## 다음 단계
- "이거 입을게" → 착용기록 저장(`doPost`) · 최근 입은 옷 감점
- 하루 끝 추움/딱좋음/더움 피드백 → 체감 보정 자동 조정
