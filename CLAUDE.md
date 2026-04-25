# FX2 웹 대시보드 — Claude 하네스

## 프로젝트 한 줄 요약
FX2 뇌파(EEG) 장치 출력을 Chrome 전용 실시간 웹 대시보드로 시각화.
서버 없음, WebSocket 없음, Chrome Web Serial / Web Bluetooth API 전용. Netlify 배포.

---

## 기술 스택
- **프레임워크**: React 18 + TypeScript 5.6 + Vite
- **스타일**: Tailwind CSS 3 (`dark:` class 방식 다크모드)
- **차트**: lightweight-charts 5 (TradingView) + chart.js 4 (심박 추이용)
- **배포**: Netlify (`netlify.toml`, SPA redirect 설정됨)
- **URL**: https://laxtha.netlify.app

---

## 파일 맵

```
src/
├── App.tsx                     # 라우터 (/, /live, /summary)
├── main.tsx                    # React 진입점
├── index.css                   # Tailwind + .fx2-card / .fx2-title 등 전역 컴포넌트 클래스
│
├── types/
│   ├── fx2.ts                  # Fx2State, Fx2IncomingMessage, DeviceMode 등 핵심 타입
│   └── web-apis.d.ts           # Web Serial / Web Bluetooth 타입 선언
│
├── lib/
│   └── fx2Realtime.ts          # 순수 함수 계층: 상태 생성/업데이트/요약/파싱
│                               # MAX_CHART_POINTS=3000, LOG_HISTORY_LIMIT=40
│
├── services/
│   └── fx2Hardware.ts          # Fx2HardwareService: BLE / UART 연결, 이벤트 emit
│
├── context/
│   ├── Fx2RealtimeContext.tsx  # 전역 상태: 세션, 모드, 하드웨어 상태
│   │                           # mockTimer(1Hz setInterval), hardwareRef
│   └── ThemeContext.tsx        # 다크모드 (localStorage + .dark 클래스)
│
├── hooks/
│   └── useFx2Realtime.ts       # (현재 미사용, context에 통합됨)
│
├── components/
│   ├── Layout.tsx              # 사이드바 + 햄버거 메뉴 (모바일)
│   ├── EEGChartV2.tsx          # 메인 EEG 차트 (lightweight-charts, memo 적용)
│   │                           # ResizeObserver cleanup 구현됨
│   │                           # 윈도우(10/30/60s), 일시정지, 줌/팬, Go Live
│   ├── LineChartCard.tsx       # 심박 추이 차트 (chart.js - 계속 사용 중)
│   ├── HiddenDemoPanel.tsx     # 시연용 슬라이드 패널 (preset 적용)
│   └── StatusCard.tsx          # (현재 미사용, LivePage에서 인라인 처리)
│
└── pages/
    ├── HomePage.tsx            # 모드 선택 + 측정 시작 버튼
    ├── LivePage.tsx            # 실시간 대시보드 (메인 화면)
    └── SummaryPage.tsx         # 세션 요약
```

---

## 데이터 흐름

```
Demo:   setInterval(1000ms) → createMockMessage() → applyIncomingMessage() → setState
BLE:    Web Bluetooth notify → parseHardwarePayload() → applyIncomingMessage() → setState
UART:   Web Serial readline → parseHardwarePayload() → applyIncomingMessage() → setState

Fx2State 배열 상한: ch1/ch2/timestamps/ppg = 3000pt, heartRateHistory = 180pt, logs = 40건
```

---

## 패킷 포맷

**BLE/Demo (JSON)**
```json
{"ch1": 0.82, "ch2": 0.74, "bpm": 72, "wear": "worn", "signal": "good", "ts": 1713180000}
```
또는 comma-separated: `ch1,ch2,bpm,wearing,signalQuality,connection,noise[,timestamp]`

**UART**: 0-255 정수 한 줄, ch1=ch2=동일값, stepped line 모드

---

## 디자인 토큰

```
--bg: #F4F7FB      (페이지 배경, 다크: #0F172A)
--card: #FFFFFF    (카드, 다크: #1E293B)
--sidebar: #0F172A
--primary: #2563EB (CH2, 버튼)
--accent: #06B6D4  (CH1, 강조)
--success: #22C55E
--warning: #F59E0B
--danger: #EF4444
--text-primary: #111827
--text-secondary: #6B7280
```

Tailwind 클래스: `fx2-card`, `fx2-outline`, `fx2-surface`, `fx2-title` (index.css 정의)

---

## 현재 상태 (2026-04-25 기준)

### 완료
- [x] EEGChartV2 (lightweight-charts, 크로스헤어/줌/팬/일시정지/Go Live)
- [x] 3존 레이아웃 (상태바 + 메인차트 + 하단 보조)
- [x] 다크모드 전역 (ThemeContext, localStorage)
- [x] 한국어 UI 통일
- [x] 빈 상태 컴포넌트 (이벤트 로그)
- [x] 모바일 햄버거 메뉴
- [x] 다운샘플링 (10s→50pt / 30s→150pt / 60s→300pt)
- [x] TypeScript 오류 0개, 빌드 성공
- [x] netlify.toml SPA redirect

### 미완료 (v3 계획)
- [ ] **[성능] summarizeFx2State()** — 매 state 업데이트마다 3000개 배열에 Math.max 실행
      위치: `lib/fx2Realtime.ts:420-474`, 컨텍스트: `context/Fx2RealtimeContext.tsx:241`
      해결: `useMemo`로 분리하거나 stats에서 점진적 계산
- [ ] **[성능] 고주파 UART 데이터 throttle** — 현재 rate 제한 없음
      해결: `useRef`로 throttle 16ms 적용
- [ ] **[코드] LineChartCard → lightweight-charts 마이그레이션** — chart.js 의존성 제거
- [ ] **[UX] 시작 버튼 로딩 스피너** — HomePage.tsx:189, 현재 클릭 즉시 navigate
- [ ] **[UX] 버튼 툴바 통합** — 10s/30s/60s + ⏸ + CH1/CH2 + 다운로드를 하나의 toolbox로
- [ ] **[기능] 동영상 저장** — MediaRecorder + canvas.captureStream(30fps)
- [ ] **[기능] 토스트 알림** — 연결 성공/실패/재연결
- [ ] **[배포] Netlify 재배포** — git push origin main 으로 자동 배포
- [ ] **[하드웨어] UART 실기기 테스트** — USB 연결 후 0-255 데이터 확인
- [ ] **[하드웨어] BLE 테스트** — Android BLE 앱 빌드 후 HTTPS 환경에서 페어링

---

## 개발 명령어

```bash
cd /c/Users/dmast/Desktop/pro/laxtha_pro1

npm run dev      # 개발 서버 (localhost:5173)
npm run build    # tsc + vite build → dist/
npm run preview  # dist/ 미리보기

# 배포: git push하면 Netlify 자동 빌드
git push origin main
```

---

## 중요 제약사항

1. **Chrome / Edge 전용** — Web Serial, Web Bluetooth는 Firefox/Safari 미지원
2. **HTTPS 필수** — Web Bluetooth는 localhost 또는 HTTPS에서만 작동
3. **서버 없음** — 모든 통신은 브라우저 Web API 직접 사용
4. **BLE UUID**: Service `12345678-1234-1234-1234-123456789abc`, Char `...abd`

---

## Notion 프로젝트 페이지

- 메인: https://www.notion.so/3427b08f46a880ed9babe7d4bd559f84
- 실행 보드: https://www.notion.so/84c2e09a934b44a2b12093a8e00189de
- v3 계획: https://www.notion.so/3497b08f46a8819fa0c4f649a63d7dc6
