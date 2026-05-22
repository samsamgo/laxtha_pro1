# 차트 정정 3차 + KST 시간 — Codex 작업 지시서

## 컨텍스트
사용자 추가 요청:
> "심박 간격도 왜 띄어 논건대 그리고 json파일들에 시간 한국시간으로 마치고 왜 자꾸 이상한 것들 올려 좀 정확하게 데이터를 넘겨 줘야 재대로 분석할거 아냐"

두 가지 처리 필요:
1. **RR interval(심박 간격) 시계열 차트 제거** — 250Hz 샘플링에서 심박 펄스는 1~2초당 1회 발생, 그 외 시간엔 이전 RR 값이 그대로 유지되어 계단/평탄선만 보임. 사용자 입장에서 "왜 띄워뒀냐"로 불만 정당함. 차트만 제거하고 데이터(요약 통계·JSON·CSV)는 보존.
2. **JSON/CSV의 모든 시간 표시를 KST(Asia/Seoul, UTC+9)로 변환** — 현재 `2026-05-21T13:00:00.000Z` (UTC) → `2026-05-21T22:00:00.000+09:00` (KST, ISO 8601 with offset). 사용자가 한국 시간으로 바로 읽고 GPT 분석할 수 있도록.

## 수정 사항

### A. RR interval 시계열 차트 제거 (UI 만)

파일: `src/pages/LivePage.tsx`
- 보조차트 섹션에서 `<LineChartCard values={secondary.rrInterval} ... />` 블록 1개를 **삭제**.
- 그리드 컨테이너 구조 유지. 디자인/색 변경 금지 — 차트 카드 1개만 단순 제거.
- secondary 객체 의존성 배열에 rrInterval이 더 이상 차트로 안 쓰여도 `appendSample`에서 사용 중이면 그대로 둠. 차트만 제거하고 데이터 흐름은 유지.

### B. RR/심박 통계는 다른 곳에서 보존

- 요약 페이지(SummaryPage.tsx) 또는 SidebarSummary 에서 RR 평균/min/max 등 통계 표시되는 부분이 있다면 그대로 유지.
- `EegSample.rrInterval`, JSON `samples[].rrInterval`, CSV 컬럼 `rr_interval_ms`는 그대로 유지.
- `state.rrInterval[]` 배열도 그대로 유지 (통계용).
- 즉 **차트 1개만 사라지고, 나머지는 모두 동일**.

### C. KST(Asia/Seoul) ISO 8601 시간 변환

#### 변환 함수 추가 (공통 모듈)

새 파일 또는 기존 `src/lib/` 안에 추가 (예: `src/lib/timeFormat.ts`):

```ts
const KST_OFFSET_MIN = 9 * 60;
const KST_OFFSET_MS = KST_OFFSET_MIN * 60 * 1000;

const pad2 = (n: number) => String(n).padStart(2, "0");
const pad3 = (n: number) => String(n).padStart(3, "0");

/**
 * Convert epoch ms or Date to KST (Asia/Seoul, UTC+9) ISO-8601 string with explicit offset.
 * Example output: "2026-05-21T22:00:00.000+09:00"
 */
export function toKstIso(input: number | Date): string {
  const ms = typeof input === "number" ? input : input.getTime();
  const k = new Date(ms + KST_OFFSET_MS);
  const y = k.getUTCFullYear();
  const mo = pad2(k.getUTCMonth() + 1);
  const d = pad2(k.getUTCDate());
  const h = pad2(k.getUTCHours());
  const mi = pad2(k.getUTCMinutes());
  const s = pad2(k.getUTCSeconds());
  const ms3 = pad3(k.getUTCMilliseconds());
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms3}+09:00`;
}

/** KST timezone label for metadata. */
export const KST_TIMEZONE = "Asia/Seoul";
```

#### 호출처 일괄 교체

다음 위치들의 `new Date(x).toISOString()` 호출을 모두 `toKstIso(x)` 로 교체:

- `src/lib/eegSessionRecorder.ts`
  - 라인 ~61, 62 (`getSummary().startedAt/endedAt`)
  - 라인 ~80, 81, 85 (CSV metadata header — Started/Ended/Exported)
  - 라인 ~131, 132 (`exportJson` 의 startedAt/endedAt)
- `src/lib/fx2Realtime.ts`
  - 라인 ~89 (createInitialFx2State 의 startedAt)
  - 라인 ~235 (sessionStartedAt fallback)
  - 라인 ~312 (lastUpdated)
- `src/pages/LivePage.tsx`
  - 라인 ~305 (`EegSample.timestamp` 직렬화)

import 라인 추가 (해당 파일 상단):
```ts
import { toKstIso, KST_TIMEZONE } from "../lib/timeFormat";   // 경로는 파일 위치에 맞게 조정
```

#### EegSessionExport 메타데이터에 timezone 명시

`src/lib/eegSessionRecorder.ts` 의 `exportJson()` 에서 export 객체에 다음 두 필드 추가:
```ts
timezone: "Asia/Seoul",
timezoneOffset: "+09:00",
```
타입(`src/types/eegRecorder.ts` `EegSessionExport`)에도 동일하게 추가:
```ts
timezone: string;
timezoneOffset: string;
```

CSV metadata header에도 한 줄 추가:
```
# Timezone: Asia/Seoul (+09:00)
```

#### 파일명도 KST 기준이라 별도 처리 불필요

- `eegSessionRecorder.ts` 의 `buildFilename` 은 이미 로컬 시간 기반(`d.getFullYear()` 등) 이라 사용자 PC가 KST면 자동으로 KST 파일명. 변경 불필요.
- 단, 만약 사용자가 비 KST PC에서 쓸 가능성이 있다면 `toKstIso` 결과를 파싱해 사용. 우선순위 낮음 — 변경하지 말 것.

## 검증 체크리스트

- [ ] `npm run build` 통과
- [ ] LivePage에서 RR interval 차트(`secondary.rrInterval` 입력) 가 렌더되지 않음
- [ ] JSON export 의 `startedAt`, `endedAt`, `samples[].timestamp`, `fftEpochs[].startedAt/endedAt`(ms 숫자 그대로 유지 OK), `timezone`, `timezoneOffset` 모두 KST(+09:00) 또는 정확한 메타 정보
- [ ] CSV header 의 # Started/Ended/Exported/Timezone 줄에 +09:00 포함
- [ ] `toIsoString()` 호출이 직접적으로 남아 있지 않음 (`grep "toISOString" src/` 로 확인 — 외부 라이브러리 제외)
- [ ] EegSample.rrInterval 필드, state.rrInterval 배열, JSON samples 의 rrInterval 모두 그대로 유지
- [ ] 한국 시간 변환 결과 예시: UTC `2026-05-21T13:00:00.000Z` → KST `2026-05-21T22:00:00.000+09:00`

## 절차

1. 다음 단위로 분리된 커밋:
   - `chore(ui): remove RR-interval time-series chart (data preserved in JSON/CSV)`
   - `feat(time): output JSON/CSV timestamps in KST (Asia/Seoul +09:00)`
2. 빌드 통과 후 `git push origin main`.
3. 한국어로 보고: 무엇을 바꿨는지, 빌드, 커밋 해시, push 상태.

## 절대 하지 말 것
- **차트 레이아웃·색·간격·카드 디자인 변경 금지** — RR 카드 1개만 단순 삭제.
- `state.rrInterval`, `EegSample.rrInterval`, JSON 필드 `rrInterval` 제거 금지.
- 새 컴포넌트 추가 금지.
- 데모/mock 재도입 금지.
- 무관 파일 변경 금지.
- 파괴적 git 명령 금지.
- `--no-verify`/`--no-gpg-sign` 금지.
