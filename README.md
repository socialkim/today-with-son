# 오늘, 아들과

초등학교 4학년 아들과 서울에서 갈 만한 장소를 실시간 혼잡도, 활동 성향,
소요 시간, 실내외 조건, 거리로 추천하는 독립형 웹서비스입니다.

**서비스 바로가기:** [today-with-son.vercel.app](https://today-with-son.vercel.app)

## 주요 기능

- 초4 눈높이로 큐레이션한 서울 나들이 장소 20곳
- 서울시 실시간 도시데이터 기반 혼잡도와 향후 예측
- 뛰놀기·탐험·배움·휴식 성향별 추천
- 2시간·반나절·하루 일정 필터
- 현재 위치 또는 주소 기준 거리 반영
- 장소별 아이 미션과 아빠용 팁
- 브라우저에만 저장되는 찜 목록
- 모바일·태블릿·데스크톱 반응형 지도

로그인과 ChatGPT 호출은 전혀 사용하지 않습니다. 추천 점수는 브라우저에서
동작하는 명시적인 규칙으로 계산합니다.

## 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm install
npm run dev
```

검증용 빌드는 다음과 같습니다.

```bash
npm run build
npx tsc --noEmit
npm test
```

## 실시간 데이터 연결

`SEOUL_API_KEY`가 있으면 서버가 서울 열린데이터광장의
`citydata_ppltn` API를 직접 호출합니다.

```bash
SEOUL_API_KEY=발급받은_키
```

서울 열린데이터광장 인증키는 무료로 발급할 수 있습니다. 키가 설정되지 않은
개인용 데모에서는 이 프로젝트를 만들 때 참고한 인파레이더의 공개 서울시
데이터 피드를 사용하고, 해당 피드도 사용할 수 없으면 장소 정보만 보여주는
오프라인 모드로 자동 전환됩니다.

## 주소 검색

주소 검색은 서버 프록시를 통해 OpenStreetMap Nominatim 공개 서비스를
사용합니다. 사용자가 제출한 한 건의 검색만 처리하고 자동완성이나 일괄 검색은
하지 않으며, 응답은 캐시합니다. 이 공개 서비스는 개인·소규모 이용과 초당
1회 이하 요청을 전제로 하므로 상용 또는 대규모 서비스로 확장할 때는 자체
지오코더나 국내 지도 사업자의 API로 교체해야 합니다.

## 배포

이 저장소는 Cloudflare Workers 호환 `vinext` 빌드를 사용하며 Vercel에도
배포할 수 있습니다. 공개 배포 환경에는 자체 `SEOUL_API_KEY`를 설정하는 것을
권장합니다.

```bash
npm run build
```

출처 표시는 서비스 하단에 포함되어 있습니다.

- [서울 실시간 도시데이터](https://data.seoul.go.kr/SeoulRtd/)
- [OpenStreetMap](https://www.openstreetmap.org/copyright)
- [Nominatim 이용 정책](https://operations.osmfoundation.org/policies/nominatim/)
