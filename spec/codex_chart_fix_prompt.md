# 보조차트/메인차트 정합성 종합 수정 — Codex 작업 지시서

## 컨텍스트
이전 PR(`2b928e4`~`1d922cf`)에서 샘플링 60→250Hz, PPG/sdPPG 단위(au), FFT 등 사양 정합성 작업을 완료했지만 **차트 컴포넌트의 60Hz 가정 상수들이 그대로 남아 있어** 사용자 화면에서 보조차트(PPG/sdPPG/RR/PowerSpectrum)와 메인 EEG 차트가 시각적으로 깨져 보이고 있다.

사용자 인용: "보조차트들이 좀 이상해 졌어 정확한거 맞아?" "현재의 디자인은 크게 바꾸지 말고 이상한 부분들 판단하고 좀 정확한 데이터들 나오게끔 다 고쳐봐 왜 하나 고치면 다른게 이상해지고 맨날그래"

**목표**: 디자인은 손대지 말고 데이터 흐름·차트 윈도우·단위 표기만 정확하게.

## 확인된 결함 (수정 필요)

### A. LineChartCard 윈도우/포인트 캡 250Hz 미지원
파일: `src/components/LineChartCard.tsx`
```
const WINDOW_SECONDS = 60;
const MAX_POINTS = 7200;     // 60Hz × 60s = 3600 기준, 250Hz × 60s = 15000 필요
```
**증상**: 60초 X-축인데 데이터는 최근 ~28.8초만 채워져 좌측 절반이 비어 보임.
**수정 방향** (둘 중 한 쪽 채택):
- (선호) `MAX_POINTS = 18000` 로 상향 (250Hz × 60s = 15000 + 20% 버퍼). uPlot에서 18000pt는 충분히 처리 가능.
- 또는 동일한 60초 윈도우를 유지하면서 stride downsampling으로 표시 포인트를 ~6000개로 줄이는 방식도 가능. 이 경우 시각적 매끄러움이 약간 떨어질 수 있으니 첫 번째를 우선 시도.

### B. EEGChartV2 60Hz 상수
파일: `src/components/EEGChartV2.tsx`
```
const DEFAULT_SAMPLE_INTERVAL_SECONDS = 1 / 60;        // 60Hz fallback — 250Hz로 변경
const MAX_DUPLICATE_SAMPLE_INTERVAL_SECONDS = 1 / 30;  // 33ms — 250Hz(4ms 간격)에서 정상 샘플도 duplicate로 잘못 판정될 수 있음
```
**수정**:
- `DEFAULT_SAMPLE_INTERVAL_SECONDS = 1 / 250`
- `MAX_DUPLICATE_SAMPLE_INTERVAL_SECONDS = 1 / 125` (=8ms, 즉 정상 4ms 간격의 2배). 250Hz 데이터에서 같은 timestamp가 두 번 들어오는 비정상 사례만 잡고 정상 흐름은 통과시킴.
- 추가 점검: 이 파일 안에서 `60`이라는 상수가 다른 의미로 쓰인 곳이 있는지 grep — fps/throttle 등은 60 그대로 두고, 샘플 레이트 관련만 바꾼다.

### C. MAX_CHART_POINTS 의도 복원
파일: `src/lib/fx2Realtime.ts:11`
```
export const MAX_CHART_POINTS = 72000; // 4.8 min at 250 Hz
```
**근거**: 이전 CLAUDE.md 세션9 메모는 "60Hz에서 20분 = 72000" 의 의도. 이제 250Hz이므로 동일 시간 보장을 위해 **300000** 로 상향 (= 20분 × 250Hz).
- 메모리 영향: 약 10여 개 배열 × 300000 × 8byte ≈ 24MB. 6GB 시스템에서도 허용 범위.
- 만약 메모리가 부담스럽다고 판단되면 150000 (10분)으로 절충 — 그러나 가급적 300000 권장. 차트 디스플레이는 windowSeconds로 별도 제한되므로 메모리 외 부작용 없음.
- 주석도 갱신: `// 20 min at 250 Hz hardware (memory ≈ 24MB across all arrays)`.

### D. RR 간격 0 spike — chart gap으로 처리
파일: `src/lib/fx2Realtime.ts:225`
```
const rrInterval = ppgValid && rrRaw >= 250 && rrRaw <= 2000 ? rrRaw : 0;
```
**증상**: RR 차트가 250~2000 범위인데 invalid 시 0으로 떨어져 큰 수직 스파이크가 발생.
**수정 방향**:
- 옵션 1 (우선): `Number.NaN` 사용 → uPlot/LineChartCard가 알아서 gap으로 렌더 (LineChartCard:54~56에서 `Number.isFinite` 체크로 이미 NaN skip 처리됨).
- JSON/CSV export 단계에서는 NaN을 0으로 다시 매핑 (구버전 호환). 즉,
  - state 배열에는 `NaN` 저장
  - `appendSample` 호출부(LivePage.tsx:314 부근)와 EegSample의 `rrInterval` 필드 직렬화에서 `Number.isFinite(rr) ? rr : 0`로 치환.
- 옵션 2: state에 0 유지하고 LineChartCard 에 prop `gapOnZero?: boolean` 추가하여 RR 차트만 0을 gap 처리. 옵션 1이 더 깔끔.

### E. createMockMessage dead code 정리 (선택)
파일: `src/lib/fx2Realtime.ts:159-196`
- `createMockMessage` 는 어떤 호출처도 없는 dead code (사용자 데모 모드 제거 완료 상태).
- AGENTS.md 의 "Do not seed fake initial waveform data" 원칙과 함께 그냥 삭제 권장.
- 만약 향후 재도입 가능성을 우려해 남기고 싶다면 jsdoc로 `@deprecated unused — kept for potential demo reuse` 표기.
- 우선 **삭제** 채택.

### F. LineChartCard NaN 처리 확인 (현재 정상이지만 회귀 방지 차원에서 점검만)
- 이미 `Number.isFinite(value)` 체크가 있으므로 NaN은 skip. → D 수정 후 자연스럽게 RR 0-스파이크 사라짐.
- 추가 변경 불필요.

### G. 단위 표기 명확화 (디자인 변경 아님 — 라벨 텍스트만)
파일: `src/pages/LivePage.tsx` (LineChartCard description prop)
- PPG/sdPPG 차트의 description 또는 label 끝에 "(au)" 표기 추가 — 사용자가 단위 혼동 안 하도록.
- 예: `description="귓불 PPG (au)"`. 기존 description이 있으면 끝에 ` (au)` 만 append.
- 차트의 시각적 디자인은 변경 금지 (색, 크기, 레이아웃 모두 동일).

## 검증 체크리스트

각 변경 후:
- [ ] `npm run build` 통과 (tsc + vite)
- [ ] EEGChartV2 main chart에서 250Hz 샘플 흐름 정상 (duplicate 잘못 판정 안 됨)
- [ ] LineChartCard 60초 윈도우가 끝까지 채워짐 (250Hz 가정)
- [ ] RR 차트에서 0-스파이크 사라짐 (NaN gap 처리)
- [ ] JSON/CSV에는 invalid RR이 0으로 직렬화되어 호환성 유지
- [ ] grep 으로 60Hz/Hz 60 가정이 남은 곳 0건

## 절차

1. 작업 브랜치 main 그대로.
2. 다음 단위로 분리된 커밋:
   - `fix(chart): bump LineChartCard MAX_POINTS for 250Hz hardware`
   - `fix(chart): correct EEGChartV2 sample-interval constants for 250Hz`
   - `fix(state): restore MAX_CHART_POINTS to 20min @ 250Hz`
   - `fix(parser): emit NaN for invalid RR so chart renders a gap, keep 0 in export`
   - `chore: remove unused createMockMessage`
   - `chore(ui): label PPG/sdPPG charts as (au)`
3. 빌드 통과 후 `git push origin main`.
4. 보고 형식 (한국어):
   - 무엇을 바꿨는지 (커밋 단위)
   - 빌드 결과
   - 커밋 해시 / push 상태
   - 검증한 항목과 미해결 사항

## 절대 하지 말 것
- **차트 디자인/레이아웃 변경 금지** (색·간격·카드 배치 그대로).
- 새 컴포넌트/차트 추가 금지.
- 데모/mock 시드 파형 데이터 재도입 금지 (AGENTS.md 정책).
- IndexedDB/Web Worker 도입 금지.
- 무관한 파일/리포 외부 dirty 파일 건드리기 금지.
- 파괴적 git 명령 (reset --hard, push --force) 금지.
- `--no-verify` hook 우회 금지.
