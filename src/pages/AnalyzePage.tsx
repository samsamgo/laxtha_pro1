import { useCallback, useMemo, useRef, useState } from "react";
import type { EegSessionExport } from "../types/eegRecorder";

function validateJson(data: unknown): data is EegSessionExport {
  if (!data || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  return Array.isArray(obj.samples) && typeof obj.sampleCount === "number" && typeof obj.startedAt === "string";
}

const formatMs = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── 타입 ──
// 주파수 대역(양 채널 평균, 상대비율 %) — 분포 표시용
interface Bands { theta: number; alpha: number; beta: number; gamma: number }
// 참고 지표 (Valence-Arousal에서 파생)
interface Scores { focus: number; relax: number; tension: number; fatigue: number }
type StateLabel = "활기·긍정" | "긴장·각성" | "이완·안정" | "저각성·피로" | "중립·균형" | "신호 점검";
type ConfLabel = "높음" | "중간" | "낮음";

interface Analysis {
  bands: Bands;            // 양 채널 평균 상대비율(%)
  dom: string;             // 우세 대역
  alphaL: number;          // 좌(CH1) 평균 알파 절대파워
  alphaR: number;          // 우(CH2) 평균 알파 절대파워
  faa: number;             // ln(αR) - ln(αL), 양수=좌측 활성 우세=접근/긍정
  valence: number;         // -1(부정/회피) .. +1(긍정/접근)
  arousal: number;         // 0(저각성) .. 1(고각성)
  arousalFromHrv: boolean; // HRV가 각성 추정에 반영됐는지
  scores: Scores;          // 참고 지표
  validEpochs: number;
}

// ── 분석 엔진 ──
// FFT epoch에서 좌/우 채널을 분리해 FAA(전전두 알파 비대칭)와 밴드 분포를 계산한다.
function computeAnalysis(session: EegSessionExport): Analysis | null {
  const ep = session.fftEpochs;
  if (!ep?.length) return null;

  let t = 0, a = 0, b = 0, g = 0, n = 0; // 양 채널 평균(분포용)
  let aL = 0, aR = 0, ne = 0;            // 채널별 알파(FAA용): CH1=좌, CH2=우
  for (const e of ep) {
    const c1 = e.bands.ch1, c2 = e.bands.ch2;
    for (const ch of [c1, c2]) {
      t += ch.theta; a += ch.alpha; b += ch.lBeta + ch.mBeta + ch.hBeta; g += ch.gamma; n++;
    }
    aL += c1.alpha; aR += c2.alpha; ne++;
  }
  if (!n || !ne) return null;
  t /= n; a /= n; b /= n; g /= n;
  aL /= ne; aR /= ne;

  const base = t + a + b;
  if (!base) return null;
  const relT = (t / base) * 100;
  const relA = (a / base) * 100;
  const relB = (b / base) * 100;

  // ── FAA (전전두 알파 비대칭) ──
  // 알파 파워는 피질 활성과 역상관(Klimesch 1999). 좌측 알파가 낮으면 좌측 활성↑ → 접근/긍정(Davidson; Coan & Allen 2004).
  // 산식: FAA = ln(αR) - ln(αL) (Allen, Coan & Nazarian 2004). 양수 → 좌측 활성 우세.
  const eps = 1e-6;
  const faa = Math.log(aR + eps) - Math.log(aL + eps);
  const valence = Math.tanh(faa * 1.5); // -1..1, 단일측정·이마 2채널이므로 경향치

  // ── Arousal ──
  // 고주파(beta)/알파 비는 각성·관여 지표로 보고됨. 알파 우세 → 저각성, 베타 우세 → 고각성.
  const betaAlpha = b / (a + eps);
  const arousalEeg = 1 / (1 + Math.exp(-(betaAlpha - 1) * 1.5)); // 0..1, center=1.0

  // 참고 지표 (V-A + 밴드에서 파생)
  const aPct = arousalEeg * 100;
  const vPct = (valence + 1) / 2 * 100;
  const gnorm = clamp(g / 50, 0, 1);
  const scores: Scores = {
    focus: clamp(Math.round(relB * 1.0 - relT * 0.4 + (aPct - 50) * 0.4), 0, 100),
    relax: clamp(Math.round(relA * 1.2 - (aPct - 50) * 0.5 + (vPct - 50) * 0.3), 0, 100),
    tension: clamp(Math.round((aPct - 50) * 0.9 + (vPct < 50 ? (50 - vPct) * 0.6 : 0) + gnorm * 25), 0, 100),
    fatigue: clamp(Math.round(relT * 1.1 - relB * 0.3 + (50 - aPct) * 0.4), 0, 100),
  };

  // 우세 대역
  const m: [string, number][] = [["Theta", relT], ["Alpha", relA], ["Beta", relB]];
  m.sort((x, y) => y[1] - x[1]);
  const dom = m[0][1] - m[1][1] < 5 ? "Mixed" : m[0][0];

  return {
    bands: { theta: relT, alpha: relA, beta: relB, gamma: g },
    dom,
    alphaL: aL,
    alphaR: aR,
    faa,
    valence,
    arousal: arousalEeg, // HRV 블렌드는 호출부에서 적용
    arousalFromHrv: false,
    scores,
    validEpochs: ne,
  };
}

// ── 상태 라벨 (V-A 사분면) ──
function calcState(valence: number, arousal: number, eegRate: number, satRate: number, validEpochs: number): StateLabel {
  if (eegRate < 30 || satRate > 25 || validEpochs < 2) return "신호 점검";
  const aHigh = arousal >= 0.58, aLow = arousal <= 0.42;
  const vNeg = valence <= -0.1;
  if (aHigh) return vNeg ? "긴장·각성" : "활기·긍정";
  if (aLow) return vNeg ? "저각성·피로" : "이완·안정";
  return "중립·균형";
}

// ── 신뢰도 ──
// 단일 측정·baseline 없음 → 상한 90. 신호품질/유효 epoch/FAA 크기/PPG 유효성으로 감점.
function calcConfidence(args: {
  eegRate: number; satRate: number; validEpochs: number; faa: number; ppgValidRate: number;
}): { score: number; label: ConfLabel } {
  let c = 90;
  if (args.eegRate < 60) c -= (60 - args.eegRate) * 0.5;
  if (args.satRate > 10) c -= (args.satRate - 10) * 1.0;
  if (args.validEpochs < 5) c -= (5 - args.validEpochs) * 6;
  if (Math.abs(args.faa) < 0.05) c -= 15; // valence 신호 약함
  if (args.ppgValidRate < 50) c -= 5;
  c = clamp(Math.round(c), 5, 90);
  const label: ConfLabel = c >= 65 ? "높음" : c >= 40 ? "중간" : "낮음";
  return { score: c, label };
}

// ── 표시 메타 ──
const STATE_INFO: Record<StateLabel, { emoji: string; color: string; desc: string; tip: string }> = {
  "활기·긍정": { emoji: "✨", color: "#2563EB", desc: "각성도가 높고 좌측 전전두 활성이 우세해, 긍정·접근 경향이 추정됩니다.", tip: "몰입이 잘 되는 시간대예요. 중요한 일을 이어가 보세요." },
  "긴장·각성": { emoji: "⚡", color: "#EF4444", desc: "각성도가 높고 우측 전전두 활성이 우세해, 긴장·회피 경향이 추정됩니다.", tip: "심호흡이나 짧은 휴식으로 각성을 낮춰보세요." },
  "이완·안정": { emoji: "😌", color: "#22C55E", desc: "각성도가 낮고 알파가 우세해, 편안하고 안정된 경향이 추정됩니다.", tip: "휴식·명상에 좋은 상태입니다. 잠시 유지해 보세요." },
  "저각성·피로": { emoji: "😴", color: "#F59E0B", desc: "각성도가 낮고 세타가 우세해, 피로·졸림 경향이 추정됩니다.", tip: "환기하거나 짧은 휴식을 취해보세요." },
  "중립·균형": { emoji: "🙂", color: "#06B6D4", desc: "특정 방향으로 치우치지 않은 균형 상태로 추정됩니다.", tip: "특별히 조정할 필요 없는 평이한 컨디션이에요." },
  "신호 점검": { emoji: "🔧", color: "#64748B", desc: "측정 신호가 불안정해 감정 추정을 보류합니다.", tip: "전극을 다시 부착하고 안정된 상태에서 재측정해 주세요." },
};

const CONF_CLR: Record<ConfLabel, string> = { "높음": "#22C55E", "중간": "#F59E0B", "낮음": "#EF4444" };

const BAND_CLR = { theta: "#8B5CF6", alpha: "#22C55E", beta: "#F59E0B" };
const BAND_KR: Record<string, string> = { theta: "세타", alpha: "알파", beta: "베타" };
const BAND_DESC: Record<string, string> = { theta: "졸림·명상", alpha: "편안·안정", beta: "사고·집중" };

const SCORE_META: { key: keyof Scores; label: string; color: string }[] = [
  { key: "focus", label: "집중도", color: "#2563EB" },
  { key: "relax", label: "이완도", color: "#22C55E" },
  { key: "tension", label: "긴장도", color: "#EF4444" },
  { key: "fatigue", label: "피로도", color: "#F59E0B" },
];

export default function AnalyzePage() {
  const [session, setSession] = useState<EegSessionExport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [modal, setModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback((file: File) => {
    setError(null);
    if (!file.name.endsWith(".json")) { setError("JSON 파일만 가능합니다."); return; }
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const d = JSON.parse(e.target?.result as string);
        if (!validateJson(d)) { setError("FX2 JSON 형식이 아닙니다."); return; }
        setSession(d);
      } catch { setError("JSON 파싱 실패."); }
    };
    r.readAsText(file);
  }, []);

  const result = useMemo(() => {
    if (!session) return null;
    const sam = session.samples, len = sam.length;
    let bS = 0, bN = 0, eN = 0, gN = 0, satN = 0, pN = 0;
    for (let i = 0; i < len; i++) {
      const s = sam[i];
      if (s.bpm > 0) { bS += s.bpm; bN++; }
      if (s.eegValid) eN++;
      if (s.signal === "good") gN++;
      if (s.ppgValid) pN++;
      if ((s.ch1Saturation !== null && (s.ch1Saturation <= 16 || s.ch1Saturation >= 239)) ||
          (s.ch2Saturation !== null && (s.ch2Saturation <= 16 || s.ch2Saturation >= 239))) satN++;
    }
    const avgBpm = bN > 0 ? Math.round(bS / bN) : 0;
    const eegRate = len > 0 ? Math.round((eN / len) * 100) : 0;
    const sigRate = len > 0 ? Math.round((gN / len) * 100) : 0;
    const satRate = len > 0 ? Math.round((satN / len) * 100) : 0;
    const ppgValidRate = len > 0 ? Math.round((pN / len) * 100) : 0;

    const an = computeAnalysis(session);
    if (!an) return null;

    // ── HRV ──
    const validRr = sam.filter((s) => s.rrInterval > 0).map((s) => s.rrInterval);
    let hrvData: { avgRr: number; sdnn: number; rmssd: number; pnn50: number } | null = null;
    if (validRr.length >= 2) {
      const rrN = validRr.length;
      const rrMean = validRr.reduce((p, q) => p + q, 0) / rrN;
      let varS = 0, sqD = 0, nn50 = 0;
      for (let i = 0; i < rrN; i++) {
        varS += (validRr[i] - rrMean) ** 2;
        if (i > 0) {
          const d = validRr[i] - validRr[i - 1];
          sqD += d * d;
          if (Math.abs(d) > 50) nn50++;
        }
      }
      hrvData = {
        avgRr: Math.round(rrMean),
        sdnn: Math.round(Math.sqrt(varS / (rrN - 1)) * 10) / 10,
        rmssd: Math.round(Math.sqrt(sqD / (rrN - 1)) * 10) / 10,
        pnn50: Math.round((nn50 / (rrN - 1)) * 100 * 10) / 10,
      };
    }

    // ── Arousal: HRV 블렌드 (PPG가 충분히 유효할 때만) ──
    let arousal = an.arousal;
    let arousalFromHrv = false;
    if (hrvData && ppgValidRate >= 50) {
      const arousalHrv = clamp((40 - hrvData.rmssd) / 40, 0, 1); // RMSSD 낮을수록 각성↑
      arousal = clamp(an.arousal * 0.7 + arousalHrv * 0.3, 0, 1);
      arousalFromHrv = true;
    }

    const st = calcState(an.valence, arousal, eegRate, satRate, an.validEpochs);
    const conf = calcConfidence({ eegRate, satRate, validEpochs: an.validEpochs, faa: an.faa, ppgValidRate });

    return { an: { ...an, arousal, arousalFromHrv }, st, conf, avgBpm, eegRate, sigRate, satRate, ppgValidRate, hrvData };
  }, [session]);

  const shareText = useMemo(() => {
    if (!session || !result) return "";
    const { an, st, conf } = result;
    const info = STATE_INFO[st];
    const vTxt = an.valence >= 0.1 ? "긍정" : an.valence <= -0.1 ? "부정" : "중립";
    const aTxt = an.arousal >= 0.58 ? "높음" : an.arousal <= 0.42 ? "낮음" : "중간";
    return [
      `${info.emoji} ${st} (신뢰도 ${conf.label})`,
      ``,
      info.desc,
      ``,
      `정서가(valence): ${vTxt} · 각성도(arousal): ${aTxt}`,
      `전전두 알파 비대칭 FAA ${an.faa >= 0 ? "+" : ""}${an.faa.toFixed(2)}`,
      `세타 ${an.bands.theta.toFixed(1)}% | 알파 ${an.bands.alpha.toFixed(1)}% | 베타 ${an.bands.beta.toFixed(1)}%`,
      ``,
      `${new Date(session.startedAt).toLocaleDateString("ko-KR")} ${formatMs(session.durationMs)} 측정`,
      `※ 연구기반 추정치이며 의료 진단이 아닙니다.`,
      `#뇌파분석 #LAXTHA`,
    ].filter(Boolean).join("\n");
  }, [session, result]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(shareText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareText]);

  const handleLinkCopy = useCallback(async () => {
    await navigator.clipboard.writeText("https://laxtha.netlify.app/analyze");
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, []);

  const reset = () => { setSession(null); setError(null); setModal(false); setCopied(false); setLinkCopied(false); };

  // ── 업로드 ──
  if (!session) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="fx2-card fx2-outline flex flex-col items-center gap-5 py-10 text-center lg:col-span-8 lg:col-start-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF0F8] dark:bg-slate-800">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 text-[#2563EB]">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-[#111827] dark:text-white">뇌파 감정 분석</h2>
            <p className="mt-1 text-sm text-[#6B7280] dark:text-slate-400">FX2 JSON 파일을 업로드하세요</p>
          </div>
          <div
            className={`w-full cursor-pointer rounded-2xl border-2 border-dashed p-6 transition-colors ${dragOver ? "border-[#2563EB] bg-blue-50 dark:bg-blue-950/20" : "border-gray-200 hover:border-[#2563EB] dark:border-slate-700"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) load(f); }}
            onClick={() => fileRef.current?.click()}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileRef.current?.click(); }}
          >
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto h-7 w-7 text-[#6B7280]">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="mt-2 text-sm font-semibold text-[#111827] dark:text-white">드래그 또는 클릭</p>
          </div>
          {error ? <p className="w-full rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800/40 dark:bg-red-500/5 dark:text-red-400">{error}</p> : null}
        </section>
      </div>
    );
  }

  // ── FFT 없음 ──
  if (!result) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="fx2-card fx2-outline flex flex-col items-center gap-4 py-10 text-center lg:col-span-8 lg:col-start-3">
          <p className="text-lg font-bold text-[#111827] dark:text-white">FFT 데이터 없음</p>
          <p className="text-sm text-[#6B7280] dark:text-slate-400">감정 추정에는 주파수 대역(FFT) 데이터가 필요합니다.</p>
          <button type="button" onClick={reset} className="fx2-btn-primary !px-5 !py-2 !text-sm">다른 파일</button>
        </section>
      </div>
    );
  }

  const { an, st, conf, avgBpm, eegRate, satRate, hrvData } = result;
  const info = STATE_INFO[st];
  const bands = an.bands;

  // V-A 좌표 (0~100%)
  const dotLeft = ((an.valence + 1) / 2) * 100;
  const dotTop = (1 - an.arousal) * 100;
  const vTxt = an.valence >= 0.1 ? "긍정" : an.valence <= -0.1 ? "부정" : "중립";
  const aTxt = an.arousal >= 0.58 ? "높음" : an.arousal <= 0.42 ? "낮음" : "중간";

  // FAA 막대 정규화
  const alphaMax = Math.max(an.alphaL, an.alphaR, 1e-6);
  const barL = (an.alphaL / alphaMax) * 100;
  const barR = (an.alphaR / alphaMax) * 100;
  const faaDir = an.faa >= 0.05 ? "좌측 우세 → 접근·긍정 경향" : an.faa <= -0.05 ? "우측 우세 → 회피·부정 경향" : "좌우 균형 → 중립";

  // ── 결과 ──
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 상태 카드 */}
        <section className="fx2-card fx2-outline text-center py-8 lg:col-span-8 lg:col-start-3">
          <p className="text-5xl">{info.emoji}</p>
          <h2 className="mt-3 text-2xl font-bold text-[#111827] dark:text-white">{st}</h2>
          <span
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold"
            style={{ backgroundColor: `${CONF_CLR[conf.label]}1A`, color: CONF_CLR[conf.label] }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CONF_CLR[conf.label] }} />
            신뢰도 {conf.label} ({conf.score})
          </span>
          <p className="mt-2 text-sm text-[#6B7280] dark:text-slate-300 max-w-sm mx-auto leading-relaxed">{info.desc}</p>
          <p className="mt-3 inline-block rounded-full bg-[#EAF0F8] px-4 py-1.5 text-xs font-semibold text-[#374151] dark:bg-slate-800 dark:text-slate-200">{info.tip}</p>
          <p className="mt-3 text-[10px] text-[#9CA3AF] dark:text-slate-500">
            {new Date(session.startedAt).toLocaleString("ko-KR")} · {formatMs(session.durationMs)}{avgBpm > 0 ? ` · ${avgBpm}bpm` : ""}
          </p>
        </section>

        {/* Valence–Arousal 2D 좌표 */}
        <section className="fx2-card fx2-outline lg:col-span-8 lg:col-start-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400 text-center">정서 좌표 (Valence–Arousal)</p>
          <div className="relative mx-auto mt-4 aspect-square w-full max-w-[260px] rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* 사분면 틴트 */}
            <div className="absolute left-0 top-0 h-1/2 w-1/2 bg-red-500/5" />
            <div className="absolute right-0 top-0 h-1/2 w-1/2 bg-blue-500/5" />
            <div className="absolute left-0 bottom-0 h-1/2 w-1/2 bg-amber-500/5" />
            <div className="absolute right-0 bottom-0 h-1/2 w-1/2 bg-green-500/5" />
            {/* 축 */}
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-300 dark:border-slate-600" />
            <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-gray-300 dark:border-slate-600" />
            {/* 축 레이블 */}
            <span className="absolute left-1/2 top-1 -translate-x-1/2 text-[9px] text-[#9CA3AF] dark:text-slate-500">높은 각성</span>
            <span className="absolute left-1/2 bottom-1 -translate-x-1/2 text-[9px] text-[#9CA3AF] dark:text-slate-500">낮은 각성</span>
            <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-[#9CA3AF] dark:text-slate-500">부정</span>
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-[#9CA3AF] dark:text-slate-500">긍정</span>
            {/* 좌표점 */}
            <div
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white shadow dark:ring-slate-900 transition-all"
              style={{ left: `${dotLeft}%`, top: `${dotTop}%`, backgroundColor: info.color }}
            />
          </div>
          <div className="mt-4 flex justify-center gap-8">
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: info.color }}>{vTxt}</p>
              <p className="text-[10px] text-[#9CA3AF] dark:text-slate-500 mt-0.5">정서가 (FAA {an.faa >= 0 ? "+" : ""}{an.faa.toFixed(2)})</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: info.color }}>{aTxt}</p>
              <p className="text-[10px] text-[#9CA3AF] dark:text-slate-500 mt-0.5">각성도 {an.arousalFromHrv ? "(EEG+HRV)" : "(EEG)"}</p>
            </div>
          </div>
        </section>

        {/* 좌우 알파 비대칭 (FAA) */}
        <section className="fx2-card fx2-outline lg:col-span-8 lg:col-start-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400">전전두 알파 비대칭</p>
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <span className="w-16 text-[11px] text-[#6B7280] dark:text-slate-400">좌 (CH1)</span>
              <div className="relative h-2.5 flex-1 rounded-full bg-gray-100 dark:bg-slate-800">
                <div className="absolute inset-y-0 left-0 rounded-full bg-[#06B6D4]" style={{ width: `${barL}%` }} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 text-[11px] text-[#6B7280] dark:text-slate-400">우 (CH2)</span>
              <div className="relative h-2.5 flex-1 rounded-full bg-gray-100 dark:bg-slate-800">
                <div className="absolute inset-y-0 left-0 rounded-full bg-[#2563EB]" style={{ width: `${barR}%` }} />
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs font-semibold text-[#111827] dark:text-white">{faaDir}</p>
          <p className="mt-1 text-center text-[10px] text-[#9CA3AF] dark:text-slate-500 leading-relaxed">
            알파 파워는 피질 활성과 역상관 · 이마 2채널 기반 전전두 추정치 (정통 F3/F4 아님)
          </p>
        </section>

        {/* 주파수 대역 분포 */}
        <section className="fx2-card fx2-outline lg:col-span-8 lg:col-start-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400 text-center">주파수 대역 분포</p>
          <div className="mt-4 flex h-4 overflow-hidden rounded-full">
            {(["theta", "alpha", "beta"] as const).map((b) => (
              <div key={b} style={{ width: `${bands[b]}%`, backgroundColor: BAND_CLR[b] }} className="transition-all" />
            ))}
          </div>
          <div className="mt-3 flex justify-center gap-5">
            {(["theta", "alpha", "beta"] as const).map((b) => (
              <div key={b} className="text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BAND_CLR[b] }} />
                  <span className="text-xs font-semibold text-[#111827] dark:text-white">{bands[b].toFixed(1)}%</span>
                </div>
                <p className="text-[10px] text-[#6B7280] dark:text-slate-400">{BAND_KR[b]}</p>
                <p className="text-[9px] text-[#9CA3AF] dark:text-slate-500">{BAND_DESC[b]}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-[10px] text-[#9CA3AF] dark:text-slate-500">우세: {an.dom === "Theta" ? "세타" : an.dom === "Alpha" ? "알파" : an.dom === "Beta" ? "베타" : "혼합"} · Delta 미측정</p>
        </section>

        {/* 참고 지표 */}
        <section className="fx2-card fx2-outline lg:col-span-8 lg:col-start-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400 mb-3">참고 지표</p>
          <div className="space-y-2">
            {SCORE_META.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-[#6B7280] dark:text-slate-400">{label}</span>
                <div className="relative h-2 flex-1 rounded-full bg-gray-100 dark:bg-slate-800">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${an.scores[key]}%`, backgroundColor: color }} />
                </div>
                <span className="w-7 text-right text-xs font-bold text-[#111827] dark:text-white">{an.scores[key]}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-[#9CA3AF] dark:text-slate-500 leading-relaxed">
            ※ 참고 지표는 Valence–Arousal 추정에서 파생된 보조 수치입니다. 신호 유효율 {eegRate}%{satRate > 0 ? ` · 포화 ${satRate}%` : ""}.
          </p>
        </section>

        {/* HRV */}
        {hrvData ? (() => {
          const hrvState = hrvData.rmssd >= 40
            ? { emoji: "😌", label: "몸이 편안하게 쉬고 있어요", color: "#22C55E", detail: "심장 박동이 유연하게 변하고 있어서, 긴장 없이 편안한 상태입니다." }
            : hrvData.rmssd >= 20
            ? { emoji: "🙂", label: "보통 상태예요", color: "#F59E0B", detail: "특별히 긴장하거나 피곤하지 않은 평범한 컨디션입니다." }
            : { emoji: "😰", label: "몸이 좀 긴장하고 있어요", color: "#EF4444", detail: "심장 박동이 일정해서, 스트레스를 받고 있거나 피로가 쌓여 있을 수 있습니다." };
          return (
            <section className="fx2-card fx2-outline lg:col-span-8 lg:col-start-3 text-center py-6">
              <p className="text-3xl">{hrvState.emoji}</p>
              <p className="mt-2 text-lg font-bold text-[#111827] dark:text-white">{hrvState.label}</p>
              <p className="mt-1 text-sm text-[#6B7280] dark:text-slate-300 max-w-xs mx-auto">{hrvState.detail}</p>
              <div className="mt-5 flex justify-center gap-6">
                <div>
                  <p className="text-xl font-bold" style={{ color: hrvState.color }}>{hrvData.sdnn}</p>
                  <p className="text-[10px] text-[#9CA3AF] dark:text-slate-500 mt-0.5">SDNN</p>
                </div>
                <div>
                  <p className="text-xl font-bold" style={{ color: hrvState.color }}>{hrvData.rmssd}</p>
                  <p className="text-[10px] text-[#9CA3AF] dark:text-slate-500 mt-0.5">RMSSD</p>
                </div>
                <div>
                  <p className="text-xl font-bold" style={{ color: hrvState.color }}>{hrvData.pnn50}%</p>
                  <p className="text-[10px] text-[#9CA3AF] dark:text-slate-500 mt-0.5">pNN50</p>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-[#9CA3AF] dark:text-slate-500">평균 심박 간격 {hrvData.avgRr}ms</p>
            </section>
          );
        })() : null}

        {/* 하단 */}
        <section className="fx2-card fx2-outline space-y-3 lg:col-span-8 lg:col-start-3">
          <p className="text-[10px] text-center text-[#9CA3AF] dark:text-slate-500 leading-relaxed">
            ※ 본 결과는 전전두 알파 비대칭(FAA)·Valence–Arousal 모델에 기반한 <b>연구기반 추정치</b>이며, 감정의 직접 판독이나 의료 진단이 아닙니다.
            단일 측정·이마 2채널·개인 baseline 부재로 인한 한계가 있습니다.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setCopied(false); setModal(true); }}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#2563EB] py-2.5 text-sm font-semibold text-white hover:opacity-90">
              결과 공유하기
            </button>
            <button type="button" onClick={reset}
              className="rounded-xl bg-[#EAF0F8] px-4 py-2.5 text-sm font-semibold text-[#374151] hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
              다른 파일
            </button>
          </div>
        </section>
      </div>

      {/* ── 공유 모달 ── */}
      {modal ? (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setModal(false)}>
          <div className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#111827] dark:text-white">결과 공유하기</h3>
              <button type="button" onClick={() => setModal(false)} className="rounded-lg p-1 text-[#6B7280] hover:bg-gray-100 dark:hover:bg-slate-800">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
              </button>
            </div>

            {/* 미리보기 카드 */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-center text-2xl">{info.emoji}</p>
              <p className="text-center text-sm font-bold text-[#111827] dark:text-white mt-1">{st}</p>
              <p className="text-center text-[11px] mt-1" style={{ color: CONF_CLR[conf.label] }}>신뢰도 {conf.label} · 정서가 {vTxt} · 각성 {aTxt}</p>
              <div className="mt-2 flex justify-center gap-3 text-[11px]">
                {(["theta", "alpha", "beta"] as const).map((b) => (
                  <span key={b} style={{ color: BAND_CLR[b] }} className="font-semibold">{BAND_KR[b]} {bands[b].toFixed(1)}%</span>
                ))}
              </div>
            </div>

            {/* 공유 버튼들 */}
            <div className="mt-4 grid grid-cols-4 gap-2">
              <button type="button"
                onClick={() => { window.open(`https://sharer.kakao.com/talk/friends/picker/shorturl?url=${encodeURIComponent("https://laxtha.netlify.app/analyze")}&text=${encodeURIComponent(shareText)}`, "_blank", "noopener,width=480,height=640"); }}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-3 text-xs font-semibold text-[#111827] hover:bg-gray-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#FEE500">
                  <path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.67-.15.56-.96 3.6-.99 3.83 0 0-.02.17.09.24.11.06.24.01.24.01.32-.04 3.7-2.44 4.28-2.86.56.08 1.14.12 1.72.12 5.52 0 10-3.58 10-7.94C22 6.58 17.52 3 12 3z"/>
                </svg>
                카카오톡
              </button>
              <button type="button" onClick={handleCopy}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-3 text-xs font-semibold text-[#111827] hover:bg-gray-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#5865F2">
                  <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.11 13.11 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                {copied ? "복사됨!" : "디스코드"}
              </button>
              <button type="button"
                onClick={() => { window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,width=550,height=420"); }}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-3 text-xs font-semibold text-[#111827] hover:bg-gray-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X
              </button>
              <button type="button" onClick={handleLinkCopy}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-3 text-xs font-semibold text-[#111827] hover:bg-gray-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 text-[#6B7280]">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" strokeLinecap="round" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" strokeLinecap="round" />
                </svg>
                {linkCopied ? "복사됨!" : "링크 복사"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
