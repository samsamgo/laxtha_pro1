# 차트 정정 2차 — Codex 작업 지시서

## 컨텍스트
사용자가 "ppg이상하게 나오고 eeg파워 스팩트럼 저렇게 나오면 차라리 차트에 띄우질 마" 라고 정확히 두 가지 결함을 지적함.

근본 원인:
1. **PPG/sdPPG**: 직전 PR(`2b928e4`)에서 `(raw - 16384) * 0.03606` (잘못된 EEG 스케일) → `raw - 16384` 로 바꿨는데, 이것도 사용자에게 익숙하지 않은 형태. **LAXTHA 원본 nnFX2_Viewer 는 raw 그대로 표시함** (LXD142 V3 그림[14] 확인: PPG ~5000-25000 raw, sdPPG ~15000-26000 raw). 사양서 LXD141 V4 §맥파(PPG, CH4) "데이터 범위는 0~32767. DC 기준은 16384"는 신호 특성 설명이지 표시 시 baseline subtract 강요가 아니다.
2. **powerSpectrum 시계열 차트**: 사양상 CH3는 PUD0.bit0=1 트리거 후 n=0~102 좌뇌, n=103~205 우뇌 bins가 **시간 순으로** 흘러나옴. 이걸 시계열 line chart로 plot 하면 DC bin(m=0)이 매우 크고 나머지는 작은 톱니/노이즈 형태로만 보임. 본질적으로 의미 없는 차트. 사용자가 "띄우질 마"라고 명시적 요청. **차트 제거**.

## 수정 사항

### A. PPG/sdPPG raw 값으로 복원

파일: `src/lib/fx2Realtime.ts` (라인 ~214-215)
Before:
```ts
const ppg = frame.ch4Raw - EEG_CENTER;
const sdppg = frame.ch5Raw - EEG_CENTER;
```
After:
```ts
const ppg = frame.ch4Raw;   // raw 15-bit au (0~32767, DC ~16384) — LAXTHA viewer 표준
const sdppg = frame.ch5Raw; // raw 15-bit au
```

라벨/단위 표기는 이미 `(au)`로 되어 있으니 유지. PPG/sdPPG는 **raw 15-bit unsigned value**이며 단위는 여전히 au(arbitrary unit).

JSON/CSV export 단위 일관성 확인:
- `EegSample.ppg`, `EegSample.sdppg` 는 그대로 number — semantic은 "raw au"로 통일
- `EegSessionExport` 메타데이터에 다음 두 줄 추가/갱신 (eegSessionRecorder.ts buildExport 부근):
  ```ts
  ppgUnit: "au",
  ppgRawRange: [0, 32767],
  ppgRawCenter: 16384,
  ```
- 채널 라벨 채널 목록에서 `ppg`/`sdppg` 표기 그대로 유지

### B. powerSpectrum 시계열 차트 제거 (UI만)

파일: `src/pages/LivePage.tsx`
- 보조차트 섹션에서 다음 `LineChartCard` 블록을 **삭제**:
  ```tsx
  <LineChartCard
    values={secondary.powerSpectrum}
    color="#EC4899"
    label="..."
    description="..."
  />
  ```
- 해당 차트가 들어 있던 `<div>` 그리드 구조는 유지 (남은 차트들만 표시). 디자인/레이아웃 변경 금지 — 차트 5개 → 4개로 단순 감소만.
- secondary 객체에서 powerSpectrum 의존성을 더 이상 안 쓰면 useEffect 의존성 배열에서 제거 (정리 차원).

### C. powerSpectrum 데이터는 보존

- `Fx2State.powerSpectrum: number[]` 배열은 **그대로 유지** (제거하지 말 것).
- `EegSample.powerSpectrum` 도 유지.
- JSON export 의 `samples[i].powerSpectrum` 도 유지 (구버전 호환).
- 이유: fftEpochs로 의미 있는 FFT는 별도 제공하지만, 단일 스칼라 powerSpectrum 시계열 자체는 raw 패킷 원본의 일부이므로 데이터 보존 가치는 있음. 다만 **차트로 띄우는 행위만 부적절**하므로 UI에서만 제거.

### D. LineChartCard description 미세 갱신 (PPG/sdPPG)

파일: `src/pages/LivePage.tsx`
- PPG description 예: `"심장 박동에 따라 변하는 빛 흡수량. 맥파 모양을 보여줍니다."` → 그대로 유지 OK.
- sdPPG description 예: `"PPG의 변화율. 혈관 탄성·수축 강도 추정에 사용됩니다."` → 그대로 OK.
- 라벨 `혈류 신호 (PPG, au)`, `혈류 미분 (sdPPG, au)` 유지.
- raw 값 범위가 0~32767로 크기 때문에 사용자 가독성 위해 description 끝에 "(raw 15bit, 0~32767)" 추가도 가능하지만 디자인 변경 최소화 원칙 따라 **유지 권장**. 추가하지 말 것.

## 검증 체크리스트

- [ ] `npm run build` 통과
- [ ] PPG/sdPPG 차트에서 raw 값이 0~32767 범위로 표시되는지 코드 리뷰로 확인
- [ ] powerSpectrum LineChartCard 가 LivePage에 더 이상 렌더되지 않는지 확인
- [ ] Fx2State.powerSpectrum 배열은 그대로 (제거되지 않음)
- [ ] EegSample.powerSpectrum 필드 그대로 (제거되지 않음)
- [ ] fftEpochs 정상 동작 (JSON export 포함)
- [ ] grep "powerSpectrum" 결과: LivePage 의 LineChartCard 1줄만 줄어들고 나머지는 변동 없음

## 절차

1. 다음 단위로 분리된 커밋 (작은 단위 유지):
   - `fix(parser): show PPG/sdPPG as raw au (LAXTHA viewer convention)`
   - `chore(ui): remove powerSpectrum time-series chart (meaningless single-sample trace)`
   - `chore(export): annotate PPG unit/range in JSON metadata`
2. 빌드 통과 후 `git push origin main`.
3. 한국어 보고: 무엇을 바꿨는지, 빌드, 커밋, push 상태.

## 절대 하지 말 것
- **차트 레이아웃/색·간격·카드 디자인 변경 금지** (powerSpectrum 차트 1개만 삭제, 나머지 동일).
- **PPG/sdPPG raw 값에 또 다른 변환 적용 금지** (그냥 raw 그대로).
- **state/export 의 powerSpectrum 필드 제거 금지** (UI만 제거).
- **fftAccumulator/fftEpochs 건드리기 금지** — 이미 의미 있는 FFT 데이터 흐름이라 별개.
- 새 컴포넌트 추가 금지.
- 무관 파일 수정 금지.
- 파괴적 git 명령 금지.
