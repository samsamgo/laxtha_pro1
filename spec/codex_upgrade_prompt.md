# FX2 대시보드 사양 정합성 업그레이드 — Codex 작업 지시서

## 컨텍스트
이 저장소는 `samsamgo/laxtha_pro1` (Chrome 기반 FX2 EEG 실시간 대시보드).
사용자가 **LXD141 통신 규격(V4)** 및 **LXD142 사용자 매뉴얼(V3)** PDF를
`spec/` 폴더에 추가했으며, 현재 구현이 사양과 **다수의 결정적 불일치**가 있어
"이상한 데이터"가 차트/CSV에 섞이는 문제가 보고됨. 또한 FFT(Power Spectrum)
값을 **JSON 내보내기에 포함**시켜 달라는 요청.

**중요**: `AGENTS.md`는 통상 "FFT, spectrograms 등 heavy feature 추가 금지"라고
명시하지만, **사용자가 이번 작업에서 명시적으로 FFT 추가를 요청**했으므로
이 예외 케이스를 적용한다. 이 작업의 PR 메시지에 그 사실을 기록할 것.

## 사양 핵심 요약 (`spec/LXD141_CommunicationSpec.pdf`, `spec/LXD142_UserManual.pdf`)

### 측정 모드 (PPD=1) — 250 packets/sec, 4ms 주기
프레임 20바이트:
```
[0]=0xFF [1]=0xFE   sync
[2] PPD: 0=대기, 1=측정, 2=충전 (오직 1일 때 스트림 유효)
[3] PUD0: bit7=심박이벤트, bit6=착용, bit5=귓불전극정상, bit4=배터리OK,
          bit3=reserved, bit2=PPG정상, bit1=reserved,
          bit0=2초 epoch 개시점 (FFT 트리거)
[4] PC: 0~31 순환 카운터
[5] PUD1: 측정모드=BPM(30~240), 대기모드=배터리%
[6] PCD[PC]: 인덱싱된 상수/상태. 주요 값:
            PCD[1]  = 배터리 잔량 % (5% 단위)
            PCD[20] = 좌뇌 EEG 포화도 (0~255, 128=이상적, 양 끝=포화)
            PCD[21] = 우뇌 EEG 포화도
            PCD[23] = 펌웨어 리비전 (10)
            PCD[25] = 펌웨어 ID (25)
            PCD[26] = 통신경로 (2=Bluetooth SPP)
            PCD[27] = 샘플수 (1)
            PCD[28] = 채널수 (6)
            PCD[30] = LXDeviceID (35)
            PCD[31] = COM Port 탐색 (109)
[7] CRD_PUD2_TYPE: bit5=CH1전극, bit4=CH2전극, bit3=REF전극
[8..9]   CH1 (좌뇌 EEG, 15bit, 0~32767, center 16384)
[10..11] CH2 (우뇌 EEG)
[12..13] CH3 (Power Spectrum × 10, 2.048s마다 분할 갱신)
[14..15] CH4 (PPG, 15bit, 0~32767, center 16384, AGC, au단위)
[16..17] CH5 (sdPPG, au단위)
[18..19] CH6 (RR interval ms, 250~2000, 정밀도 4ms)
```
- EEG μV 변환: `(raw - 16384) × 0.03606`  (raw = (hi & 0x7F)*256 + lo)
- **PPG/sdPPG는 EEG 변환 적용 금지** — au 단위 유지 (raw 또는 raw - 16384)
- 통과대역(-3dB): 3~41Hz, 내부 잡음: ≤0.8 µVrms, 입력 범위 ±590µV
- Baud rate: **115200 bps** (LXD141 본문의 11520은 오타; LXD142 표[5]가 정답)

### Power Spectrum (CH3) 복원 규칙 (LXD141 V4 p.14)
1. `PUD0.bit0 == 1` 시점이 epoch 시작점. 이때 `n = 0` 으로 초기화.
2. 이후 매 패킷에서 `n++`. CH3 raw 값 / 10 = 실제 파워.
3. 분배:
   - `n=0~102` (총 103개) → 좌뇌 스펙트럼 `PS_CH1[m=n]`
   - `n=103~205` (총 103개) → 우뇌 스펙트럼 `PS_CH2[m=n-103]`
   - `n>205` → 무시
4. `m=0` 은 DC, `m+1` 당 0.488Hz (= 1/2.048).
5. 대역(좌/우 동일 인덱스 범위):
   - θ Theta (4~8Hz)  : m=9~16
   - α Alpha (8~12Hz) : m=17~24
   - L-β  (12~15Hz)   : m=25~30
   - M-β  (15~20Hz)   : m=31~40
   - H-β  (20~30Hz)   : m=41~61
   - γ Gamma (30~40Hz): m=62~82

### 신호 유효성/포화 판정
- 측정 모드(PPD=1) **아님** → 스트림 데이터 무효 (현재 처리됨)
- CH1, CH2, REF 전극 중 하나라도 미부착(`CRD_PUD2_TYPE.bit5/4/3==0`) → EEG 신호 무효
- PCD[20] 또는 PCD[21] 이 ≤16 또는 ≥239 → 해당 채널 포화 (신호 불안정)
- PUD0.bit2==0 → PPG 신호 비정상
- PUD0.bit4==0 → 배터리 부족 경고

## 현재 코드 진단 (구체적 결함)

### A. 샘플링 레이트 (Critical) — 250Hz가 60Hz로 잘못 가정
- `src/context/Fx2RealtimeContext.tsx:27` : `HARDWARE_SAMPLE_RATE_HZ = 60` → **250**
- `src/context/Fx2RealtimeContext.tsx:28` : 자동 파생, 변경 불필요
- `src/lib/fx2Realtime.ts:15` : `HARDWARE_TIMESTAMP_STEP_MS = 1000 / 60` → **`1000 / 250` (=4)**
- `src/lib/fx2Realtime.ts:11` 주석 수정 : "60 Hz hardware; months at 1 Hz demo" → "250 Hz hardware (4.8 min @ 72000)"

### B. PPG/sdPPG 단위 오류 — EEG_SCALE 잘못 적용
- `src/lib/fx2Realtime.ts:170-171`:
  ```
  const ppg = (frame.ch4Raw - EEG_CENTER) * EEG_SCALE;     // 잘못
  const sdppg = (frame.ch5Raw - EEG_CENTER) * EEG_SCALE;   // 잘못
  ```
  **수정**:
  ```
  const ppg = frame.ch4Raw - EEG_CENTER;     // au 단위, 중심 0
  const sdppg = frame.ch5Raw - EEG_CENTER;   // au 단위, 중심 0
  ```

### C. CH6 RR-interval 유효성
- `src/lib/fx2Realtime.ts:172` : `const rrInterval = frame.ch6Raw;`
  → 사양에 따라 `250 <= raw <= 2000` 만 유효; 그 외엔 `0` (CSV/JSON에서 무효 표시).
  ```
  const rrRaw = frame.ch6Raw;
  const rrInterval = (rrRaw >= 250 && rrRaw <= 2000) ? rrRaw : 0;
  ```

### D. BPM 상한
- `src/lib/fx2Realtime.ts:178` : `clampNumber(frame.bpm, 30, 220)`
  → 사양 30~240 (CommSpec). **220 → 240**.

### E. 전극 미부착 시 데이터 누적되는 문제 — "이상한 자료"의 핵심 원인
- 현재: PPD=1이기만 하면 전극이 떨어져 있어도 raw EEG가 차트/CSV에 들어간다.
- 수정: `parseUartBinaryFrame`에서 다음 정책 적용
  - `electrodeStatus` 비트 검사: `bit5(CH1)`, `bit4(CH2)`, `bit3(REF)` 모두 1 이어야 EEG 유효.
  - 전극 미부착 시: `ch1`, `ch2` 는 `NaN`을 반환하지 말고 **메시지 자체를 dropped로 처리하지 않음**(설정 가능). 대안: 별도 플래그 `eegValid: boolean` 을 `Fx2IncomingMessage`에 추가하여 하위 계층에서 차트에 표시할지 결정.
  - **PPG는 별개**: PPG 센서가 귓불 집게에 있으므로 REF 전극 부착 상태 + `PUD0.bit2(PPG정상)` 만 검사. CH1/CH2 부착과 무관.
  - 결론적으로 두 개의 유효성 플래그를 만든다:
    ```ts
    eegValid: boolean   // ch1/ch2 신뢰 가능
    ppgValid: boolean   // ppg/sdppg/rrInterval/bpm 신뢰 가능
    ```
  - `applyIncomingMessage`에서 `eegValid===false` 이면 `ch1`/`ch2` 배열에 `NaN`을 push (uPlot은 NaN을 간극으로 렌더 → 차트에 "구멍").
    - **단, CSV/JSON 저장 단계(LivePage 등에서 `appendSample`)에서는** 별도로 `eegValid`/`ppgValid` 컬럼을 저장하여 후처리 가능하게.

### F. PCD 배열 추적 — 배터리/포화도 추출 누락
- 현재 `frame.pcd` 는 단일 바이트만 저장 (PC가 그때 그때 다른 의미).
- 수정: `Fx2RealtimeContext` 또는 `fx2Realtime.ts`에 32-element `pcdBuffer` 상태를 두고
  매 프레임 `pcdBuffer[frame.pc] = frame.pcd` 로 갱신.
- 파생 상태:
  - `batteryPercent: number | null` ← `pcdBuffer[1]`
  - `ch1Saturation: number | null` ← `pcdBuffer[20]`
  - `ch2Saturation: number | null` ← `pcdBuffer[21]`
- `Fx2State`에 추가:
  ```ts
  batteryPercent: number | null;
  ch1Saturation: number | null;
  ch2Saturation: number | null;
  pcdBuffer: (number | null)[];  // 32 elements, null until first packet at that PC
  ```
- 포화 경고: 포화도 ≤16 또는 ≥239 시 `noise: true` 추가 처리.

### G. 심박 이벤트 추적 (PUD0.bit7)
- `Fx2IncomingMessage` 에 `heartbeatEvent: boolean` 추가 (`Boolean(pud0 & 0x80)`)
- `Fx2State` 에 `heartbeatTimestamps: number[]` 추가 (이벤트가 true인 프레임의 timestamp만 누적)
- 측정 윈도우 동안 누적된 RR 간격으로 HRV 분석 데이터 확보.

### H. **Power Spectrum 완전 재구성 + JSON 내보내기 추가 (메인 요청)**

새 파일 `src/lib/fftAccumulator.ts` 생성:

```ts
export interface FftEpoch {
  startedAt: number;              // n=0 시점 timestamp(ms)
  endedAt: number;                // n=205 시점 timestamp(ms)
  freqResolutionHz: number;       // 0.4882812 (= 1/2.048)
  ch1Bins: number[];              // 길이 103, m=0..102
  ch2Bins: number[];              // 길이 103, m=0..102
  bands: {
    ch1: FftBandPowers;
    ch2: FftBandPowers;
  };
}

export interface FftBandPowers {
  theta: number;   // sum of m=9..16
  alpha: number;   // sum of m=17..24
  lBeta: number;   // sum of m=25..30
  mBeta: number;   // sum of m=31..40
  hBeta: number;   // sum of m=41..61
  gamma: number;   // sum of m=62..82
  total: number;   // sum of m=1..82 (DC 제외)
}

export class FftAccumulator {
  // 매 프레임 호출, n 자동 추적, epoch 완성 시 콜백/리턴
  // PUD0.bit0=1 시 n=0 리셋, 이후 n=0..102→ch1, n=103..205→ch2
  // n=205에 도달하거나 다음 bit0=1 트리거 시 epoch finalize
  ingest(ch3Raw: number, pud0Bit0: boolean, timestamp: number): FftEpoch | null;
  reset(): void;
}
```

대역 인덱스 상수는 `lib/fftAccumulator.ts` 에서 정의:
```ts
const BAND_RANGES = {
  theta: [9, 16],   alpha: [17, 24],
  lBeta: [25, 30],  mBeta: [31, 40],
  hBeta: [41, 61],  gamma: [62, 82],
};
```

### I. 컨텍스트 통합
- `Fx2RealtimeContext`에서 `fftAccumulator: FftAccumulator` 인스턴스 ref 보유.
- 매 hardware 프레임 처리 시 `ingest` 호출, epoch 완성되면 `Fx2State.fftEpochs` 에 push.
- `Fx2State`에 추가:
  ```ts
  fftEpochs: FftEpoch[];   // 최근 N개 (예: 60개 = 약 2분치) 누적
  ```
- 차트 표시는 이번 작업 범위에서 **제외** (사용자 요청은 데이터/JSON임).
  추후 UI에서 사용할 수 있도록 데이터만 마련해 둔다.

### J. JSON 내보내기에 FFT 포함
`src/lib/eegSessionRecorder.ts` 수정:
- `EegSessionRecorder` 에 별도 메서드 `appendFftEpoch(epoch: FftEpoch)` 추가.
- `fftEpochs: FftEpoch[]` 내부 필드 보관.
- `exportJson()` 에서 `EegSessionExport` 에 `fftEpochs` 와 메타데이터 포함:
  ```ts
  device: "neuroNicle FX2",
  app: "FX2 Web Dashboard",
  samplingRateHz: 250,
  eegConversionUvPerDigit: 0.03606,
  eegCenter: 16384,
  bandwidthHz: [3, 41],
  fftFrequencyResolutionHz: 0.4882812,
  fftBins: 103,
  bandIndices: { theta:[9,16], alpha:[17,24], ... },
  startedAt, endedAt, durationMs,
  sampleCount, samples,
  fftEpochCount, fftEpochs,
  ```
- `EegSessionExport` 타입(`src/types/eegRecorder.ts`)도 동일하게 확장.
- CSV는 변경하지 말 것 (FFT 행은 CSV에 부적합).
- Context의 `appendFftEpoch` 도 노출하여 LivePage / Context에서 호출.

### K. EegSample 확장 (선택)
`src/types/eegRecorder.ts` `EegSample`:
- `heartbeatEvent: boolean` 추가
- `ch1Saturation: number | null`, `ch2Saturation: number | null`
- `batteryPercent: number | null`
- `eegValid: boolean`, `ppgValid: boolean`

CSV header도 그에 맞게 확장 (뒤에 추가만, 기존 순서 유지).

### L. CLAUDE.md 사양 메모 업데이트
`laxtha_pro1/CLAUDE.md` 패킷 포맷 섹션 (74~96행):
- 헤더에 250Hz 명기 (현재는 표기 없음).
- bit5=귓불전극, bit4=배터리OK, bit0=2초 epoch 시작점 추가.
- baud rate 115200 8N1 유지.
- 새 sections 추가:
  - "## Power Spectrum (CH3) 분할 규칙" — n 인덱스/대역 표.
  - "## 신호 유효성 규칙" — 전극/포화/PPG 정상 검사 정책.
- 완료 체크리스트 끝에 다음 항목 추가:
  - [x] **[세션11]** 사양 정합성 — 샘플링 60→250Hz, PPG/sdPPG au 단위, RR 250~2000ms 검증, BPM 240, PCD[1/20/21] 추출, 전극 미부착 시 EEG 무효 처리
  - [x] **[세션11]** FFT(Power Spectrum) 복원 — PUD0.bit0 트리거, n=0~205 좌/우뇌 분리, 대역 파워 계산, JSON 내보내기 포함
  - [x] **[세션11]** JSON 내보내기 확장 — fftEpochs/bandIndices/메타데이터 포함, EegSample에 heartbeat/saturation/battery/validity 컬럼 추가

## 작업 절차

1. 작업 브랜치는 `main` 직접 작업 (AGENTS.md 정책).
2. 변경 후 **반드시** `npm run build` 통과 확인.
3. 다음 단위로 **분리된 커밋** 생성 (한 PR 안 작은 커밋 묶음):
   - `fix(realtime): correct sampling rate 60→250Hz and PPG/sdPPG unit (au)`
   - `feat(parser): validate electrodes, RR range, BPM upper bound`
   - `feat(state): track PCD buffer for battery and EEG saturation`
   - `feat(fft): reconstruct power spectrum per LXD141 §Power Spectrum`
   - `feat(export): include FFT epochs and metadata in JSON export`
   - `docs(claude.md): update spec section per LXD141/LXD142`
4. 커밋 메시지 본문에 사양 문서(LXD141 V4 / LXD142 V3) 참조 명기.
5. 최종 `git push origin main`.
6. 추가 파일은 `spec/` (PDF 사양서)도 함께 커밋해 둔다 — 향후 재참조용.

## 검증 체크
- `npm run build` 통과 (TypeScript 오류 0)
- 새 단위 테스트는 만들지 않아도 됨(저장소에 test runner 없음). 대신 `parseUartBinaryFrame` 의
  주요 변환식이 사양과 맞는지 코드 리뷰로 확인.
- 데모 모드 createMockMessage 에는 새 필드(heartbeatEvent, eegValid, ppgValid) 기본값 채워 둘 것.
- AGENTS.md 의 "Do not seed fake initial waveform data" 원칙 유지.

## 절대 하지 말 것
- 차트 엔진 교체/대체 (uPlot 유지).
- 무관한 dirty 파일 건드리기 (이 저장소 외부의 `Desktop\claude\*.py` 등).
- IndexedDB/Web Worker/스토리지 신규 도입.
- 데모 시드 파형 데이터 추가.
- `--no-verify` 같은 hook 우회.
- 파괴적 git 명령 (reset --hard, push --force 등).

## 최종 보고 형식 (한국어)
- 무엇을 바꿨는지 (커밋 단위 요약)
- 빌드 결과
- 커밋 해시 / push 상태
- 미해결 항목/주의사항
