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

## 현재 상태 (2026-05-03 기준)

최신 커밋: `5da92d9 Add PUD0 bit breakdown labels to diagnostics tile`

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
- [x] OMC-M10 Bluetooth SPP 연결 (Web Serial 포트 프롬프트, COM10/AMP-SPP)
- [x] `/live`의 OMC-M10 연결/해제 버튼
- [x] PPG/sdPPG/RR/파워스펙트럼 추이 카드 표시 (6채널 차트 완비)
- [x] CSV/JSON에 PPG/sdPPG/RR/powerSpectrum 포함
- [x] `/live` OMC-M10 실기기 진단 스트립 (11타일: Frames/PC/드롭/PPD=1/0/PUD0/BPM/RR/CH1/CH2 raw/전극)
- [x] HomePage OMC-M10 SPP/Web Serial 안내 문구 정리
- [x] 모드 레이블 수정 — `BLUETOOTH` → `OMC-M10` (HomePage, LivePage, SummaryPage)
- [x] DeviceMode 리네임 — `"bluetooth"` → `"omc"` (전체 코드베이스)
- [x] BLE dead code 완전 제거 — `fx2Hardware.ts`에서 Web Bluetooth API 코드, BLE 재연결 로직, `parseHardwarePayload`, `toBoolean`/`toNumber`/`toConnection` 헬퍼 제거
- [x] `modeLabelMap` 키 `"bluetooth"` → `"omc"` 수정 (HomePage, LivePage, SummaryPage)
- [x] `web-apis.d.ts` Web Bluetooth 타입 선언 제거 — Web Serial 타입만 유지
- [x] `parseUartBinaryFrame` 세션 모드 보존 수정 — `mode: "uart"` 하드코딩 → `fallbackState.mode` 사용
- [x] `connectBluetooth()` → `connectOmc()` 메서드 리네임 (`Fx2HardwareService`)
- [x] 미사용 `Fx2HardwareMode` export 및 `DeviceMode` import 제거 (`fx2Hardware.ts`)
- [x] 이벤트 로그 스팸 수정 — 60Hz 하드웨어에서 상태 전환(착용/신호)시만 로그 기록
- [x] 하드웨어 연결 끊김 경고 배너 (세션 running 중 연결 유실 시 amber 경고 표시)
- [x] 파워 스펙트럼 (CH3) Fx2State 추적 + LineChartCard 표시 + CSV/JSON 내보내기
- [x] PC 프레임 카운터(0-31) + 드롭 프레임 감지 — PC 비연속 시 droppedFrames++ 빨간 표시
- [x] 전극 상태 (byte[7] bit5=E1/bit4=E2/bit3=REF) 진단 타일 — 녹/적 도트 표시

### 미완료
- [ ] **[하드웨어] OMC-M10 실기기 검증** — 진단 스트립: Frames 증가, PPD=1 수신, PC 0-31 순환, 드롭=0, PUD0 bit6/bit2, BPM/RR 정상값, 전극 도트 방향(1=연결?) 확인
- [ ] **[하드웨어] 차트 시간창 실기기 확인** — 30s/60s 선택 시 실제 timestamp 기준으로 맞는지 확인
- [ ] **[하드웨어] PPG/sdPPG/RR/파워스펙트럼 0 고정 여부** — CH4/CH5/CH6/CH3 실기기에서 움직이는지 확인
- [ ] **[하드웨어] 장시간 성능** — 5분 이상 연결 시 메모리/CPU 안정성 확인
- [ ] **[검증 후] 전극 도트 방향 수정** — 하드웨어 테스트 후 bit5/4/3이 1=연결인지 1=분리인지 확인하고 수정

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
- **[최신 핸드오프] 세션2 진단 강화**: https://www.notion.so/3557b08f46a881d6bde5e6b6e0ff69b0
