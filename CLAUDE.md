# FX2 웹 대시보드 — Claude 하네스

## 프로젝트 한 줄 요약
FX2 뇌파(EEG) 장치 출력을 Chrome 전용 실시간 웹 대시보드로 시각화.
서버 없음, WebSocket 없음, Chrome Web Serial / Web Bluetooth API 전용. Netlify 배포.

---

## 기술 스택
- **프레임워크**: React 18 + TypeScript 5.6 + Vite
- **스타일**: Tailwind CSS 3 (`dark:` class 방식 다크모드)
- **차트**: uPlot (EEGChartV2 메인 EEG 차트) + lightweight-charts (LineChartCard 심박 추이)
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
│   ├── eegRecorder.ts          # EEG 세션 녹화 타입 (EegSessionData, ExtWindowSeconds 등)
│   └── web-apis.d.ts           # Web Serial / Web Bluetooth 타입 선언
│
├── lib/
│   ├── fx2Realtime.ts          # 순수 함수 계층: 상태 생성/업데이트/요약/파싱
│   │                           # MAX_CHART_POINTS=18000, LOG_HISTORY_LIMIT=40
│   └── eegSessionRecorder.ts   # EegSessionRecorder 클래스: 데이터 수집/내보내기
│
├── services/
│   └── fx2Hardware.ts          # Fx2HardwareService: OMC-M10 SPP(Web Serial) / UART / BLE fallback
│
├── context/
│   ├── Fx2RealtimeContext.tsx  # 전역 상태: 세션, 모드, 하드웨어 상태
│   │                           # mockTimer(1Hz setInterval), hardwareRef
│   └── ThemeContext.tsx        # 다크모드 (localStorage + .dark 클래스)
│
├── hooks/
│   ├── useFx2Realtime.ts       # (현재 미사용, context에 통합됨)
│   └── useEegSessionRecorder.ts # EEG 세션 녹화 훅
│
├── components/
│   ├── Layout.tsx              # 사이드바 + 햄버거 메뉴 (모바일) + 토스트 알림 시스템
│   ├── EEGChartV2.tsx          # 메인 EEG 차트 (uPlot, memo 적용, ResizeObserver cleanup)
│   │                           # 윈도우 10/30/60/120/300s (더보기 드롭다운)
│   │                           # 일시정지, 줌/팬, Go Live, PNG 캡처
│   ├── LineChartCard.tsx       # 심박/PPG/sdPPG/RR 추이 차트 (lightweight-charts)
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
Demo:     setInterval(1000ms) → createMockMessage() → applyIncomingMessage() → setState
OMC-M10:  Bluetooth SPP(COM10/AMP-SPP) → Web Serial → processBinaryBuffer() → parseBinaryFrame() → parseUartBinaryFrame() → applyIncomingMessage() → setState
UART:     Web Serial binary → processBinaryBuffer() → parseBinaryFrame() → parseUartBinaryFrame() → applyIncomingMessage() → setState
BLE:      Web Bluetooth notify → parseHardwarePayload() → applyIncomingMessage() → setState

Fx2State 배열 상한: ch1/ch2/timestamps/ppg/sdppg/rrInterval = 18000pt, heartRateHistory = 180pt, logs = 40건
```

---

## 패킷 포맷

**OMC-M10 / UART — LXSDF T2A 바이너리 20바이트 프레임** (Bluetooth SPP COM10 또는 UART, 115200 8N1)
```
[0]  0xFF  [1]  0xFE  — 동기 헤더
[2]  PPD              — 0=대기/충전, 1=측정모드 (PPD=1일 때만 유효 신호)
[3]  PUD0             — bit7=심박이벤트, bit6=착용, bit5=전극연결, bit4=배터리, bit2=PPG정상
[4]  PC               — 0~31 순환 카운터
[5]  BPM              — 심박수
[6]  PCD              — PC에 따라 배터리/포화/펌웨어 등 상태값
[7]  전극상태          — bit5=CH1전극, bit4=CH2전극, bit3=REF전극
[8..9]   CH1 좌뇌 EEG
[10..11] CH2 우뇌 EEG
[12..13] CH3 Power Spectrum ×10 (2.048s마다 갱신)
[14..15] CH4 PPG
[16..17] CH5 sdPPG
[18..19] CH6 RR 간격 ms
```
신호 변환: `EEG_μV = (raw - 16384) × 0.03606`  (raw = (high & 0x7F) × 256 + low, 15비트)

**BLE/Demo (JSON)** — Demo 모드 및 BLE fallback 테스트용
```json
{"ch1": 0.82, "ch2": 0.74, "bpm": 72, "wear": "worn", "signal": "good", "ts": 1713180000}
```

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

## 현재 상태 (2026-05-01 기준)

최신 기능 기준 커밋: `5896586 Add OMC-M10 live diagnostics strip`

### 완료
- [x] EEGChartV2 (uPlot, 크로스헤어/줌/팬/일시정지/Go Live/PNG 캡처)
- [x] 3존 레이아웃 (상태바 + 메인차트 + 하단 보조)
- [x] 다크모드 전역 (ThemeContext, localStorage)
- [x] 한국어 UI 통일
- [x] 빈 상태 컴포넌트 (이벤트 로그)
- [x] 모바일 햄버거 메뉴
- [x] timestamp 기준 차트 윈도우 + uPlot 내부 downsampling
- [x] TypeScript 오류 0개, 빌드 성공
- [x] netlify.toml SPA redirect
- [x] 시작 버튼 로딩 스피너 (isConnecting 상태, HomePage.tsx)
- [x] 버튼 툴바 통합 (더보기 드롭다운, EEGChartV2.tsx)
- [x] 토스트 알림 (ToastItem/addToast, Layout.tsx)
- [x] LineChartCard → lightweight-charts 마이그레이션 완료
- [x] EEG 세션 녹화 기능 (EegSessionRecorder, useEegSessionRecorder)
- [x] 동영상 녹화 (MediaRecorder + canvas.captureStream(30fps), EEGChartV2.tsx)
- [x] 재연결 오류 메시지 버그 수정
- [x] summarizeFx2State() 성능 최적화 (점진적 집계)
- [x] 바이너리 프로토콜 파서 (Fx2BinaryFrame, processBinaryBuffer, parseUartBinaryFrame)
- [x] 6채널 데이터 타입 (EEG CH1/CH2 μV, PPG, sdPPG, RR 간격 ms, Power Spectrum)
- [x] OMC-M10 Bluetooth SPP 연결 (Web Serial 포트 프롬프트, COM10/AMP-SPP)
- [x] `/live`의 OMC-M10 연결/해제 버튼
- [x] PPG/sdPPG/RR 추이 카드 표시
- [x] CSV/JSON에 PPG/sdPPG/RR 포함
- [x] `/live` OMC-M10 실기기 진단 스트립 (Frames, PPD=1/0, PUD0, BPM, RR, CH1/CH2 raw)
- [x] HomePage OMC-M10 SPP/Web Serial 안내 문구 정리

### 미완료
- [ ] **[하드웨어] OMC-M10 실데이터 의미 검증** — 새 진단 스트립에서 Frames, PPD=1/0, PUD0, BPM, RR, CH1/CH2 raw를 보며 115200 baud, `0xFF 0xFE` 헤더, PUD0 비트, RR 간격 해석 확인
- [ ] **[UI] 남은 한글/문서 표현 정리** — 화면 우선, 문서는 Claude 인수인계 기준으로 계속 업데이트

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
4. **OMC-M10 Bluetooth SPP**: OMC-M10은 BLE가 아닌 Bluetooth Classic SPP로 연결 → Windows에서 COM 포트로 노출됨. 현재 확인 포트는 COM10/AMP-SPP.

---

## Notion 프로젝트 페이지

- 프로젝트 HQ: https://app.notion.com/p/3537b08f46a881e3ba50df94083f28f1
- Command Center: https://app.notion.com/p/3427b08f46a880ed9babe7d4bd559f84
- Role Component Hub: https://app.notion.com/p/3517b08f46a8816196d6cc9177f2144a
- 실행 보드: https://www.notion.so/84c2e09a934b44a2b12093a8e00189de
