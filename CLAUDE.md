# FX2 웹 대시보드 — Claude 하네스

## 프로젝트 한 줄 요약
FX2 뇌파(EEG) 장치 출력을 Chrome 전용 실시간 웹 대시보드로 시각화.
서버 없음, WebSocket 없음, Chrome Web Serial / Web Bluetooth API 전용. Netlify 배포.

---

## 기술 스택
- **프레임워크**: React 18 + TypeScript 5.6 + Vite
- **스타일**: Tailwind CSS 3 (`dark:` class 방식 다크모드)
- **차트**: uPlot 전용 — EEGChartV2 (메인 EEG), LineChartCard (보조 5개, 4Hz throttle)
- **배포**: Netlify (`netlify.toml`, SPA redirect 설정됨)
- **URL**: https://laxtha.netlify.app

---

## 파일 맵

```
src/
├── App.tsx                     # 라우터 (/live, /summary) — * → /live redirect
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
│   └── useEegSessionRecorder.ts # EEG 세션 녹화 훅
│
├── components/
│   ├── Layout.tsx              # 사이드바 + 햄버거 메뉴 (모바일) + 토스트 알림 시스템
│   ├── EEGChartV2.tsx          # 메인 EEG 차트 (uPlot, memo 적용, ResizeObserver cleanup)
│   │                           # 윈도우 10/30/60/120/300s (더보기 드롭다운)
│   │                           # 일시정지, 줌/팬, Go Live, PNG 캡처
│   └── LineChartCard.tsx       # 보조 차트 (uPlot, 4Hz throttle, ResizeObserver, no header)
│
└── pages/
    ├── LivePage.tsx            # 실시간 대시보드 — 모드 선택 + 측정 시작/종료 CTA 포함
    └── SummaryPage.tsx         # 세션 요약
```

---

## 데이터 흐름

```
Demo:     setInterval(1000ms) → createMockMessage() → applyIncomingMessage() → setState
OMC-M10:  Bluetooth SPP(COM10/AMP-SPP) → Web Serial → processBinaryBuffer() → parseBinaryFrame() → parseUartBinaryFrame() → applyIncomingMessage() → setState

Fx2State 배열 상한: ch1/ch2/timestamps/ppg/sdppg/rrInterval = 72000pt (60Hz 20분), heartRateHistory = 180pt, logs = 40건
EegSessionRecorder: 전체 샘플 무제한 보관 (React state 외부), 세션 종료 후 CSV/JSON 내보내기
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

## 현재 상태 (2026-05-06 기준)

최신 커밋: `608ca72 fix(EEGChartV2): freeze Y axis between 1s updates to stop plotted values shifting`

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
- [x] LineChartCard → Chart.js 마이그레이션 — TradingView 워터마크/브랜딩 완전 제거 (ToS 위반 없음)
- [x] 마우스 휠 스크롤 줌 — EEGChartV2 X축 커서 위치 기준 줌인/아웃
- [x] 터치 핀치 줌 — EEGChartV2 두 손가락 핀치 제스처로 모바일에서도 줌인/아웃
- [x] 줌 초기화 버튼 — 스크롤 줌 후 amber 버튼 표시, 클릭 시 windowSeconds 기준 라이브 복귀
- [x] 차트 줌 후 라이브 멈춤 버그 수정 — zoomedWindowRef 패턴으로 live-follow 유지
- [x] MAX_CHART_POINTS 18000 → 72000 — 60Hz에서 5분→20분, 데이터 너무 빨리 사라지는 문제 해소
- [x] CSV 자동 저장 — 측정 중 "종료 시 CSV 저장" 체크박스, 종료 시 자동 exportCsv() 호출
- [x] CSV UTF-8 BOM + 메타데이터 헤더 — Excel 한글 깨짐 없음, 세션 정보 9줄 주석 포함
- [x] EegSessionRecorder → Fx2RealtimeContext 이관 — 페이지 이동 후에도 데이터 유지
- [x] SummaryPage 데이터 저장 섹션 — 요약 페이지에서 CSV/JSON 다운로드 가능
- [x] LivePage 세션 상태 배지 — 측정 중(녹색 pulse)/중지됨/대기
- [x] LivePage 진단 스트립 접기/펼치기 버튼
- [x] LivePage 보조 신호 차트 섹션 헤더 + 접기/펼치기
- [x] EEG 차트 아래 조작 힌트 텍스트 (휠/핀치/드래그/시간창)
- [x] 데이터 저장 섹션 개선 — 녹색 좌측 테두리, "차트에서 사라진 데이터도 CSV에 모두 포함" 안내
- [x] OMC-M10/UART 통합 — DeviceMode "uart" 제거, connectOmc() 단일 경로
- [x] 측정 종료 버튼 — LivePage에 빨간 "측정 종료" 버튼 추가
- [x] 스크롤바 제거 — `scrollbar-gutter: stable`로 교체 (overflow-y: scroll 제거, Chrome 94+ 지원)
- [x] DeviceMode "omc" → "serial" 전체 리네임 (types, context, services, pages, components)
- [x] `connectOmc()` → `connectSerial()` 메서드 리네임 (Fx2HardwareService)
- [x] 재연결 race condition 수정 — disconnect() FIRST, 그 다음 포트 피커 표시
- [x] modeLabelMap Layout.tsx에 추가 — raw "SERIAL" 노출 수정
- [x] SummaryPage 빈 상태 — sampleCount === 0 시 안내 화면 표시
- [x] BPM 색상 코딩 — <50/>130=빨강, 50-60/100-130=주황, 60-100=정상
- [x] 신호 품질 프로그레스 바 — 2px 높이, 90%+=녹색, 60-90%=주황, <60%=빨강
- [x] 다크/라이트 토글 — SVG 해/달 아이콘 추가 (사이드바)
- [x] SidebarSummary stabilityScore 0 → "—" 표시
- [x] EEGChartV2 Y축 진폭 줌 — Auto / ±0.5 / ±1 / ±2 / ±5 / ±10 μV 프리셋 버튼
- [x] EEGChartV2 Y축 μV 레이블 — uPlot axis.label 사용
- [x] EEGChartV2 일시정지 오버레이 배지 — amber 도트 + "Space 재개" 힌트
- [x] EEGChartV2 키보드 단축키 — Space=일시정지, L=라이브 (input/button에서는 비활성)
- [x] LineChartCard 시간 기반 X축 — timestamps 옵션 prop, PPG/sdPPG 차트에 HH:MM:SS 레이블
- [x] LivePage 파일 크기 추정 — 내보내기 섹션에 CSV/JSON 용량 표시
- [x] SummaryPage 파일 크기 추정 — 녹화 섹션에 CSV/JSON 용량 표시
- [x] SummaryPage RR 간격 패널 — 평균/최소/최대 RR + 샘플 수 (실기기 데이터 있을 때만 표시)
- [x] SummaryPage 세션 시작 시간 / 녹화 시간 — 세션 정보 섹션에 추가
- [x] LivePage BPM 미니 스파크라인 — 최근 30포인트 SVG, 심박 상태 카드 내부
- [x] LivePage 신호 품질 미니 스파크라인 — 신호 상태 카드 내부 (signalQualityHistory)
- [x] LineChartCard 빈 상태 — 측정 전 "--" + placeholder 텍스트 표시
- [x] HomePage 2열 그리드 (max-w-xl), 헤더 간소화, 모바일 풀-너비 버튼
- [x] SummaryPage 세션 항목 구분선, 카드 테두리, 레이블 타이포그래피
- [x] Y-axis amplitude zoom 프리셋 (Auto/±0.5/±1/±2/±5/±10 μV), μV 레이블, 일시정지 오버레이 배지
- [x] Space/L 키보드 단축키 (EEGChartV2), 조작 힌트 텍스트 추가
- [x] BPM + 신호품질 미니 스파크라인 (상태 카드 내)
- [x] SummaryPage RR/HRV 패널 + 세션 시작시간/녹화시간 + 파일크기 추정
- [x] **[세션7 최적화]** LineChartCard → uPlot 완전 교체 (Chart.js/react-chartjs-2 제거, ResizeObserver)
- [x] 보조 차트 데이터 4Hz throttle — 60Hz 하드웨어에서 2차 차트 렌더 압박 방지
- [x] hardwareDiagnostics 상태 제거 — 60Hz setState 없앰 (소비자 없는 dead 상태)
- [x] HiddenDemoPanel, StatusCard, useFx2Realtime.ts 삭제 (dead code)
- [x] pushManualUpdate / applyPreset / DemoPreset / buildMessageFromState context에서 제거
- [x] LivePage 진단 스트립(11타일), 데모 패널, auto-save 체크박스, SidebarSummary 제거
- [x] LineChartCard: title/subtitle/latest-value 배지 제거 — 차트 캔버스만 표시
- [x] **[세션8 — 15개 UX 피드백]** stopSession() 포트 비해제 + sessionActiveRef 게이팅 (재연결 부드러움)
- [x] startSession() — getStatus()==="connected" 시 포트 피커 생략
- [x] HomePage.tsx 삭제 — /live로 통합, * → /live 리디렉트
- [x] LivePage 인라인 Demo/Serial 토글 (실행 중 아닐 때만 표시)
- [x] LivePage 단일 CTA — "측정 시작" / "측정 종료" 버튼 (연결 단계 분리 없앰)
- [x] LineChartCard label prop — 차트 아래 작은 대문자 텍스트 레이블
- [x] LineChartCard 슬라이딩 윈도우 — 최근 200pt만 유지, 오래된 데이터 자동 제거
- [x] EEGChartV2 Y축 프리셋 버튼 제거 — 항상 auto scale
- [x] EEGChartV2 mode prop 제거, UART 0-255 배지 제거
- [x] 보조 차트 기본 숨김 — 토글 버튼 한 번으로 표시/숨기기
- [x] Layout 헤더 다크모드 버튼 lg:hidden (사이드바가 데스크톱 처리)
- [x] Layout 토스트 — 에러/미지원만 표시 (성공/정보 제거)
- [x] Layout 홈 nav 항목 제거
- [x] **[세션9]** EEGChartV2 Y축 freeze — `auto:false` + `setScale("y")` 최대 1Hz → 이미 찍힌 값이 스크롤 시 이동하는 현상 해소
- [x] **[세션9]** LivePage 측정중 연결해제 버튼 제거 (레이아웃 shift 방지)
- [x] **[세션9]** Bluetooth COM 재연결 race condition 수정 — disconnect() 후 300ms 대기
- [x] **[세션9]** LineChartCard fill(스플라인) 제거 — series 오직 선만 표시
- [x] **[세션9]** MAX_RENDER_POINTS 600→3600, setData(false) — downsampling 노이즈 제거
- [x] **[세션10]** EEGChartV2 smoothArr centered MA → causal MA(win=7) — 라이브 엣지 플러터 수정 (마지막 3점 비대칭 평균 문제)
- [x] **[세션10]** EEGChartV2 Y스케일 P2/P98 percentile + rate-limit 200ms(5Hz) + EMA α=0.04→0.25 — ADC 불량 후 ±600 고착 문제 해소

### 미완료
- [ ] **[하드웨어] OMC-M10 실기기 연결 검증** — PPD=1 수신, BPM/RR 정상값, 차트 시간창 timestamp 확인
- [ ] **[하드웨어] PPG/sdPPG/RR/파워스펙트럼 신호 검증** — CH4/CH5/CH6/CH3 실기기에서 값 변화 여부
- [ ] **[하드웨어] 장시간 성능** — 5분 이상 연결 시 메모리/CPU 안정성 확인

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
- [핸드오프] 세션2 진단 강화: https://www.notion.so/3557b08f46a881d6bde5e6b6e0ff69b0
- **[최신 핸드오프] 세션3 UI/UX 업그레이드**: https://www.notion.so/3567b08f46a8810eaed5e33a71917e08
