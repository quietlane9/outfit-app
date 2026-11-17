/**
 * 처음 한 번 편집기에서 실행: setupSheets
 * - 첫 탭 이름을 '옷장'으로, 기온규칙·목적·착용기록·설정·설명 탭을 만듦 (이미 있으면 건너뜀)
 * - 노란 칸 = 직접 고치는 입력값
 */
const HEADER_BG = '#37474F', INPUT_BG = '#FFF8E1';

function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  if (!ss.getSheetByName('옷장')) ss.getSheets()[0].setName('옷장');
  styleHeader_(ss.getSheetByName('옷장'));
  const closet = ss.getSheetByName('옷장');
  if (closet.getLastRow() > 1) closet.getRange(2, 8, closet.getLastRow() - 1, 3).setBackground(INPUT_BG);

  makeTab_(ss, '기온규칙',
    ['체감온도 하한(℃)', '체감온도 상한(℃)', '목표 보온합 최소', '목표 보온합 최대', '겉옷', '목도리', '설명'],
    [[23, 40, 2, 3, '없음', 'N', '반팔·민소매 가능'],
     [20, 22.9, 3, 4, '선택', 'N', ''],
     [17, 19.9, 4, 5, '미들 권장', 'N', '니트재킷·카디건'],
     [12, 16.9, 5, 7, '미들 필수', 'N', '일교차 크면 탈착'],
     [9, 11.9, 7, 8, '아우터 권장', '선택', '스카프 추천'],
     [5, 8.9, 8, 10, '아우터 필수', 'Y', ''],
     [-30, 4.9, 10, 14, '아우터 필수', 'Y', '한겨울 옷 추가 전 임시: 롱코트+목도리']],
    function (sh, n) { sh.getRange(2, 1, n, 4).setBackground(INPUT_BG); });

  makeTab_(ss, '목적',
    ['목적', '격식 최소', '활동성 최소', '앞트임 우대', '데님 허용', '시간대 기준', '설명'],
    [['일상', 1, 2, 'N', 'Y', '외출~귀가', '장보기·동네'],
     ['운동', 1, 3, 'Y', 'Y', '귀가 시간 +1단계 따뜻하게', '헬스·수영: 갈아입기 쉽게, 운동 후 체온 저하'],
     ['모임', 2, 1, 'N', 'Y', '저녁 기준', '같은 모임에서 최근 입은 옷 피하기'],
     ['격식', 3, 1, 'N', 'N', '외출~귀가', '미들/아우터 격식 3, 하의 격식 2 이상']],
    function (sh, n) { sh.getRange(2, 2, n, 4).setBackground(INPUT_BG); });

  makeTab_(ss, '착용기록',
    ['날짜', '목적', '상의/원피스', '하의', '미들', '아우터', '소품', '최저 체감(℃)', '최고 체감(℃)', '체감 피드백', '메모'], [], null);

  makeTab_(ss, '설정', ['항목', '값', '설명'],
    [['지역', '서울 송파구', ''],
     ['격자 nx', 62, '기상청 격자 X (송파구청 기준, latLonToGrid로 계산)'],
     ['격자 ny', 126, '기상청 격자 Y'],
     ['아침 시간', '7-10', '시작-끝 시각'],
     ['낮 시간', '11-16', ''],
     ['저녁 시간', '17-22', ''],
     ['체감 보정(℃)', 0, '추위 타면 + (피드백으로 자동 조정 예정)'],
     ['일교차 기준(℃)', 10, '이 이상이면 탈착 가능한 겉옷 표시'],
     ['최근 착용 회피(일)', 5, '이 기간 안에 입은 옷은 감점']],
    function (sh, n) { sh.getRange(2, 2, n, 1).setBackground(INPUT_BG); });

  makeTab_(ss, '설명', ['설명'], [
    ['노란 칸 = 직접 고치는 입력값'],
    ['보온: 1 얇음 ~ 5 매우 따뜻함. 상의+하의+미들+아우터+소품 합을 기온규칙의 목표 보온합과 비교'],
    ['격식: 1 캐주얼 / 2 단정 / 3 격식 · 활동성: 1 불편 / 2 보통 / 3 편함'],
    ['레이어: 이너 / 미들(니트재킷·카디건, 단독 겉옷 가능) / 아우터(코트·재킷) / 하의 / 원피스 / 소품'],
    ['색계열: 무채(무채색·네이비·브라운·베이지) / 포인트 — 한 벌에 포인트는 하나만'],
    ['사용: N이면 추천 제외 (세탁·수선 중 등)'],
    ['스크립트 속성: KMA_KEY(기상청 Decoding 키), APP_TOKEN(웹앱 접근용 임의 문자열)']], null);
  ss.getSheetByName('설명').setColumnWidth(1, 700);
}

function makeTab_(ss, name, header, rows, extra) {
  if (ss.getSheetByName(name)) return;
  const sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, header.length).setValues([header]);
  if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
  styleHeader_(sh);
  sh.autoResizeColumns(1, header.length);
  if (extra) extra(sh, rows.length);
}

function styleHeader_(sh) {
  const r = sh.getRange(1, 1, 1, sh.getLastColumn());
  r.setBackground(HEADER_BG).setFontColor('#FFFFFF').setFontWeight('bold');
  sh.setFrozenRows(1);
}
