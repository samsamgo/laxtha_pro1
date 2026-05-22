# 종합 업그레이드 (A 데이터 정확성 + C 접근성/UX + D SEO/배포) — Codex 작업 지시서

## 컨텍스트
6명 에이전트 병렬 검수 결과 + 사용자 명시적 승인 항목 일괄 처리.
사용자 원칙:
- 디자인 크게 변경 금지 (레이아웃·색 톤·구조 그대로, 작은 시각 보강만)
- 새 기능 추가 시 사전 보고 — 본 PR의 추가 3건(ISO 병기 / 로딩 스피너 / CSP)은 이미 사용자 컨펌 완료
- 분리된 작은 커밋, 각 단계 빌드 통과
- `git push origin main`까지

저장소: `C:\Users\user\Desktop\claude\github_inspect\laxtha_pro1`

---

## A. 데이터 정확성 (GPT 분석에 직접 영향)

### A1. BPM 통계에 invalid 샘플 누적 차단
파일: `src/lib/fx2Realtime.ts` (applyIncomingMessage `stats` 갱신 부근, 라인 ~333)
- 현재: `min/max/averageHeartRate` 가 `message.bpm` 그대로 사용 → `ppgValid=false` 시 fallbackState 값이 그대로 누적.
- 수정: 다음 조건일 때만 stats 갱신:
  ```ts
  const bpmCounted = message.ppgValid && message.bpm > 0;
  ```
- 평균은 별도 카운터로:
  ```ts
  // 새 필드 추가: stats.bpmSampleCount, stats.bpmSum
  ```
  또는 기존 `sampleCount` 대신 `bpmSampleCount` 사용. 두 가지 방법 중 더 간결한 것 선택.
- `Fx2SessionStats` 타입에 `bpmSampleCount: number` 추가, `createEmptyStats`에 0으로 초기화.

### A2. EEG NaN → 0 치환으로 평균 왜곡 차단
파일: `src/lib/fx2Realtime.ts` (라인 ~264-265, 349)
- 현재: `ch1ForStats = Number.isFinite(message.ch1) ? message.ch1 : 0` 등 NaN을 0으로 치환 후 ch1Sum/ch2Sum 누적.
- 수정: NaN 샘플은 **제외**:
  ```ts
  const eegCounted = message.eegValid && Number.isFinite(message.ch1) && Number.isFinite(message.ch2);
  ```
- `Fx2SessionStats`에 `eegSampleCount: number` 추가.
- ch1PeakAbs/ch2PeakAbs도 `eegCounted` 일 때만 갱신.
- summarizeFx2State 의 `leftChannelAverage = stats.ch1Sum / stats.eegSampleCount` 로 변경 (분모 정확화).

### A3. JSON NaN 직렬화 정책 명시
파일: `src/lib/eegSessionRecorder.ts` (`exportJson` 라인 ~162)
- 현재: `JSON.stringify(data)` 가 NaN을 `null`로 변환.
- 수정: 
  - JSON.stringify에 **replacer 함수** 사용해 NaN/Infinity → `null` (현재와 동일 결과)
  - `EegSessionExport` 메타에 다음 추가:
    ```ts
    nanPolicy: "null"  // "Any NaN value in samples (e.g. EEG with detached electrode) is serialized as null. Use eegValid/ppgValid flags to distinguish."
    ```
  - 타입 `EegSessionExport`에도 `nanPolicy: string` 추가.

### A4. FftEpoch 시간 ISO 병기 (추가 — 컨펌됨)
파일: `src/lib/fftAccumulator.ts` 의 FftEpoch 타입 + 생성 로직, `src/types/eegRecorder.ts`
- `FftEpoch` 타입에 다음 추가 (기존 ms 필드는 유지):
  ```ts
  startedAtIso: string;   // KST ISO (+09:00)
  endedAtIso: string;
  ```
- accumulator 가 epoch 완성 시 `toKstIso(startedAt)`, `toKstIso(endedAt)` 채움.
- JSON export 그대로 두면 추가 필드 자동 포함됨.

### A5. 세션 재시작 시 fftEpochs/PCD/통계 초기화 보강
파일: `src/context/Fx2RealtimeContext.tsx` (`startSession` 라인 ~258-264)
- 현재: `setState(createInitialFx2State("serial"))` 호출하지만 `fftAccumulatorRef`, `recordedFftEpochCountRef` 등 ref 초기화가 명시적이지 않을 수 있음. 확인 후 다음 보강:
  ```ts
  fftAccumulatorRef.current.reset();   // 이미 reset() 메서드 있음
  recordedFftEpochCountRef.current = 0;
  pendingHardwareRef.current = [];
  ```
- `createInitialFx2State`에 `fftEpochs: []` 와 `pcdBuffer: new Array(32).fill(null)` 가 포함되는지 확인. 누락 시 추가.

### A6. JSON `channels` 목록에 단위/유효성 플래그 추가
파일: `src/lib/eegSessionRecorder.ts` (라인 ~138)
- 현재 `channels: ["pc", "ch1_uv", ...]` 에서 `ppg`, `sdppg`, `power_spectrum`은 단위 없이 표기.
- 수정:
  ```ts
  channels: [
    "pc", "ch1_uv", "ch2_uv", "bpm", "ppg_au", "sdppg_au",
    "rr_interval_ms", "power_spectrum_raw_div10", "wear", "signal", "mode",
    "heartbeat_event", "ch1_saturation", "ch2_saturation",
    "battery_percent", "eeg_valid", "ppg_valid"
  ]
  ```
- CSV header도 동일한 컬럼명으로 맞춰 일관성 유지 (CSV는 `ch1_uv,ch2_uv` 등 이미 단위 있고 `ppg`만 단위 없음).

### A7. CSV `power_spectrum` 단위 주석 + 컬럼명
파일: `src/lib/eegSessionRecorder.ts` 헤더/CSV 부분
- CSV metadata 코멘트에 다음 줄 추가:
  ```
  # power_spectrum_raw_div10: CH3 raw byte pair / 10 per LXD141 §Power Spectrum (CH3); time-series of n-indexed bins, not band power
  ```
- CSV 컬럼 헤더: `power_spectrum` → `power_spectrum_raw_div10`.

---

## C. 접근성/UX

### C1. 라이트/다크 색 대비 WCAG AA 미달 텍스트 색 교체
파일들: `src/pages/LivePage.tsx` (라인 400, 420, 444, 474), `src/pages/SummaryPage.tsx` (라인 287, 244, 250, 256, 263, 271)
- 라이트 모드:
  - `text-[#9CA3AF]` → `text-[#6B7280]` (4.5:1 이상 확보)
  - `text-slate-500` (밝은 배경 위) → `text-slate-600`
- 다크 모드:
  - `text-slate-500` (`#1E293B` 배경) → `text-slate-300`
- 디자인 톤 변화 최소 — 카테고리 색 자체는 유지.

### C2. 도움말 모달 포커스 트랩 + 포커스 복원
파일: `src/pages/LivePage.tsx` 라인 ~720
- 현재 ESC 닫기는 있으나 포커스 트랩 미흡.
- 수정:
  - 모달 열 때 닫기(X) 버튼에 자동 포커스
  - 모달 안에서 Tab 키가 모달 밖으로 벗어나지 않게 (간단한 trap 구현: querySelectorAll('[tabindex],button,a,input,select') 첫/마지막 노드 순환)
  - 모달 닫을 때 직전 활성 요소(opener)로 포커스 복귀
- 별도 훅 `useFocusTrap(ref, isOpen)` 생성 권장 (`src/lib/useFocusTrap.ts` 또는 hooks 폴더).

### C3. LineChartCard ARIA 라벨 추가
파일: `src/components/LineChartCard.tsx` 라인 ~233
- 차트 컨테이너 div에 `role="img"`, `aria-label={`${label}: 최근 ${WINDOW_SECONDS}초 추이`}` 추가.
- 단, label이 비어 있으면 ARIA 라벨 생략 (current 디자인: 일부 카드는 label 없을 수도 있음).

### C4. 측정 시작/종료 버튼 로딩 스피너 (추가 — 컨펌됨)
파일: `src/pages/LivePage.tsx`
- 측정 시작 버튼: `isConnecting` 시 작은 `<svg class="animate-spin h-3.5 w-3.5">` 아이콘 추가.
- 측정 종료 버튼: `isStopping` 시 동일 스피너.
- Tailwind 기본 `animate-spin` 클래스 사용, 추가 SVG는 inline (이미 다른 곳에서 사용 패턴 있을 가능성). 디자인 변경 최소화: 텍스트 옆에 4px 간격으로만 추가.

### C5. 토스트 role 일관화
파일: `src/components/Layout.tsx` 라인 ~310
- 현재: 에러 토스트만 `role="alert"`.
- 수정: 정보/성공 토스트는 `role="status"` 명시. `aria-live` 도 함께 (`alert`/`status`는 implicit이지만 명시가 안전).

---

## D. SEO/배포 + 자잘한 정리

### D1. index.html '60Hz' 잔존 → '250Hz'
파일: `index.html` 라인 13, 31
- "60Hz 실시간 차트" → "250Hz 실시간 차트"
- 동일 문구 두 곳 모두 수정.

### D2. Netlify CSP 보안 헤더 (추가 — 컨펌됨)
파일: `netlify.toml`
- 기존 헤더 섹션에 추가:
  ```toml
  [[headers]]
    for = "/*"
    [headers.values]
      Content-Security-Policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  ```
- `wasm-unsafe-eval` 은 uPlot 일부 WASM 또는 Web Serial 폴리필 호환용.
- 기존 X-Frame-Options/HSTS/Permissions-Policy 유지.

### D3. og:url 동적 업데이트
파일: `src/App.tsx` 또는 `src/main.tsx`
- 라우트 변경 시 `<meta property="og:url">` 값을 현재 URL 로 업데이트:
  ```ts
  useEffect(() => {
    const meta = document.querySelector('meta[property="og:url"]');
    if (meta) meta.setAttribute('content', window.location.href);
  }, [location.pathname]);
  ```
- 기존 react-router 의 `useLocation` 활용. 한 줄 훅 컴포넌트 권장.

### D4. Vite chunk-split 명시
파일: `vite.config.ts`
- `build.rollupOptions.output.manualChunks` 설정 추가:
  ```ts
  manualChunks: {
    uplot: ['uplot'],
    react: ['react', 'react-dom', 'react-router-dom'],
  }
  ```
- `minify: 'terser'` 명시 또는 기본값 유지.
- 결과: 큰 라이브러리(uplot)를 별도 chunk로 분리해 초기 로드 캐시 효율↑.

### D5. JSON-LD applicationCategory 정정
파일: `index.html` 라인 70
- "HealthApplication" → "UtilityApplication" (의료기기 아님 명확화).

### D6. 매직 넘버 일부 상수화 (E 카테고리에서 가져온 안전한 것만)
파일: `src/pages/LivePage.tsx` BPM 색상 코딩 부분
- BPM 임계값 상수 분리:
  ```ts
  const BPM_THRESHOLDS = { veryLow: 50, low: 60, high: 100, veryHigh: 130 } as const;
  ```
- 신호 품질 임계값:
  ```ts
  const SIGNAL_QUALITY_THRESHOLDS = { good: 90, normal: 60 } as const;
  ```
- 동작 변화는 없음, 가독성만 향상.

### D7. dead code `setSelectedMode` 정리
파일: `src/context/Fx2RealtimeContext.tsx` 라인 ~301
- 호출처 없는 no-op 함수와 context value 의 해당 키 모두 제거.
- 인터페이스 `Fx2RealtimeContextValue`에서도 제거.

---

## 검증 체크리스트

각 변경 단위마다:
- [ ] `npm run build` 통과
- [ ] grep으로 잔존 magic number/dead code 확인
- [ ] WCAG AA(4.5:1) 미달 색 모두 교체됐는지 변경 라인 카운트로 확인 (최소 8건)
- [ ] CSP 헤더가 응답에 포함되는지 (Netlify 빌드 후 실제 검증 불가능하므로 toml 문법 정확성만 점검)
- [ ] index.html "60Hz" 잔존 0건
- [ ] JSON export 결과를 임시로 콘솔에 출력해 `samples[0].ch1`이 NaN인 케이스 발생 시 null로 변환되는지(코드 리뷰만으로 OK)

## 분리 커밋 (각각 별도)
1. `fix(stats): exclude invalid samples from BPM/EEG averages`
2. `fix(export): annotate NaN serialization policy in JSON metadata`
3. `feat(fft): add KST ISO startedAt/endedAt fields alongside epoch ms`
4. `fix(session): reset FFT accumulator and PCD buffer on session restart`
5. `chore(export): rename channels with explicit units (au, raw_div10)`
6. `chore(a11y): bump WCAG AA color contrast on muted text`
7. `feat(a11y): focus trap + restore for help modal`
8. `feat(a11y): aria-label on LineChartCard`
9. `feat(ui): loading spinner on measurement start/stop buttons`
10. `chore(a11y): role=status on info toasts`
11. `chore(seo): correct 60Hz to 250Hz in index.html meta`
12. `chore(security): add Content-Security-Policy header on Netlify`
13. `feat(seo): update og:url on route change`
14. `chore(build): split uplot/react into separate chunks`
15. `chore(seo): JSON-LD applicationCategory to UtilityApplication`
16. `refactor: extract BPM/signal quality thresholds to constants`
17. `chore: remove unused setSelectedMode no-op`

빌드 통과 후 `git push origin main`.

## 절대 하지 말 것
- 차트 디자인/색 톤 큰 폭 변경 금지 (텍스트 색만 WCAG AA 충족하도록 톤 다운, 시각 톤은 유지).
- 새 페이지/라우트 추가 금지.
- IndexedDB/Web Worker 도입 금지 (이번 PR 범위 아님).
- mock/demo 시드 재도입 금지.
- 무관 파일 변경 금지.
- 파괴적 git 명령 금지.
- `--no-verify` hook 우회 금지.
- PWA PNG 자산 신규 생성 금지 (스킵). manifest 그대로.

## 보고 형식 (한국어)
- 각 커밋 해시 + 한 줄 요약
- 빌드 결과 (`npm run build` 출력)
- push 상태
- 미해결/주의사항
