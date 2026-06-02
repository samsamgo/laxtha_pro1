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
type StateLabel = "활기·긍정" | "긴장·예민" | "편안·안정" | "나른·피로" | "평온·중립" | "신호 점검";
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
  if (aHigh) return vNeg ? "긴장·예민" : "활기·긍정";
  if (aLow) return vNeg ? "나른·피로" : "편안·안정";
  return "평온·중립";
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
const STATE_INFO: Record<StateLabel, { emoji: string; color: string; headline: string; desc: string; tip: string }> = {
  "활기·긍정": { emoji: "✨", color: "#2563EB", headline: "기분 좋고 활력이 넘쳐요", desc: "지금 당신은 의욕적이고 활기찬 상태예요. 무언가에 몰입하기 딱 좋아요.", tip: "지금 흐름을 살려 중요한 일을 이어가 보세요." },
  "긴장·예민": { emoji: "⚡", color: "#EF4444", headline: "긴장하고 예민한 상태예요", desc: "지금 당신은 신경이 곤두서 있어요. 마음이 분주하거나 스트레스를 느끼고 있을 수 있어요.", tip: "잠깐 심호흡하거나 가볍게 스트레칭해 보세요." },
  "편안·안정": { emoji: "😌", color: "#22C55E", headline: "편안하고 안정돼 있어요", desc: "지금 당신은 마음이 차분하고 여유로운 상태예요. 기분 좋게 이완돼 있어요.", tip: "휴식이나 명상에 좋은 시간이에요. 잠시 즐겨보세요." },
  "나른·피로": { emoji: "😴", color: "#F59E0B", headline: "나른하고 피곤해 보여요", desc: "지금 당신은 에너지가 가라앉아 졸리거나 피곤한 상태예요.", tip: "환기하거나 짧게 눈을 붙여 쉬어보세요." },
  "평온·중립": { emoji: "🙂", color: "#06B6D4", headline: "평온한 보통 상태예요", desc: "지금 당신은 특별히 들뜨거나 가라앉지 않은 평온한 상태예요.", tip: "편안한 기본 컨디션이에요. 하던 일을 이어가도 좋아요." },
  "신호 점검": { emoji: "🔧", color: "#64748B", headline: "측정이 조금 불안정해요", desc: "신호가 흔들려 지금 상태를 정확히 읽기 어려워요.", tip: "전극을 다시 맞추고 편하게 앉아 다시 측정해 보세요." },
};

const CONF_CLR: Record<ConfLabel, string> = { "높음": "#22C55E", "중간": "#F59E0B", "낮음": "#EF4444" };

const moodLabel = (v: number) => (v >= 0.1 ? "좋음" : v <= -0.1 ? "안 좋음" : "보통");
const energyLabel = (a: number) => (a >= 0.58 ? "활발" : a <= 0.42 ? "차분" : "보통");

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
    const { an, st } = result;
    const info = STATE_INFO[st];
    return [
      `${info.emoji} ${st}`,
      info.headline,
      ``,
      info.desc,
      ``,
      `기분 ${moodLabel(an.valence)} · 에너지 ${energyLabel(an.arousal)}`,
      `${new Date(session.startedAt).toLocaleDateString("ko-KR")} ${formatMs(session.durationMs)} 측정`,
      ``,
      `※ 뇌파 기반 추정치 (의료 진단 아님)`,
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

  const { an, st, conf, avgBpm } = result;
  const info = STATE_INFO[st];

  // 기분 지도 좌표 (0~100%)
  const dotLeft = ((an.valence + 1) / 2) * 100;
  const dotTop = (1 - an.arousal) * 100;
  const moodTxt = moodLabel(an.valence);
  const energyTxt = energyLabel(an.arousal);

  // ── 결과 ──
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 현재 상태 히어로 */}
        <section
          className="fx2-card fx2-outline text-center py-10 lg:col-span-6 lg:col-start-4"
          style={{ background: `radial-gradient(120% 80% at 50% 0%, ${info.color}14, transparent 70%)` }}
        >
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full text-6xl" style={{ backgroundColor: `${info.color}1A` }}>
            {info.emoji}
          </div>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#9CA3AF] dark:text-slate-500">지금 당신은</p>
          <h2 className="mt-1 text-3xl font-extrabold" style={{ color: info.color }}>{st}</h2>
          <p className="mt-2 text-base font-semibold text-[#111827] dark:text-white">{info.headline}</p>
          <p className="mt-3 text-sm text-[#6B7280] dark:text-slate-300 max-w-xs mx-auto leading-relaxed">{info.desc}</p>
          <p className="mt-4 inline-block rounded-full bg-[#EAF0F8] px-4 py-1.5 text-xs font-semibold text-[#374151] dark:bg-slate-800 dark:text-slate-200">💡 {info.tip}</p>
          <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-[#9CA3AF] dark:text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: `${CONF_CLR[conf.label]}1A`, color: CONF_CLR[conf.label] }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CONF_CLR[conf.label] }} />신뢰도 {conf.label}
            </span>
            <span>·</span>
            <span>{new Date(session.startedAt).toLocaleDateString("ko-KR")} {formatMs(session.durationMs)}{avgBpm > 0 ? ` · ${avgBpm}bpm` : ""}</span>
          </div>
        </section>

        {/* 기분 지도 */}
        <section className="fx2-card fx2-outline lg:col-span-6 lg:col-start-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400 text-center">기분 지도</p>
          <div className="relative mx-auto mt-4 aspect-square w-full max-w-[240px] rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* 사분면 틴트 */}
            <div className="absolute left-0 top-0 h-1/2 w-1/2 bg-red-500/5" />
            <div className="absolute right-0 top-0 h-1/2 w-1/2 bg-blue-500/5" />
            <div className="absolute left-0 bottom-0 h-1/2 w-1/2 bg-amber-500/5" />
            <div className="absolute right-0 bottom-0 h-1/2 w-1/2 bg-green-500/5" />
            {/* 사분면 이름 */}
            <span className="absolute left-2.5 top-2 text-[9px] font-semibold text-red-400">긴장·예민</span>
            <span className="absolute right-2.5 top-2 text-[9px] font-semibold text-blue-400">활기·긍정</span>
            <span className="absolute left-2.5 bottom-2 text-[9px] font-semibold text-amber-500">나른·피로</span>
            <span className="absolute right-2.5 bottom-2 text-[9px] font-semibold text-green-500">편안·안정</span>
            {/* 축 */}
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-300 dark:border-slate-600" />
            <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-gray-300 dark:border-slate-600" />
            {/* 현재 위치 (펄스) */}
            <div className="absolute -translate-x-1/2 -translate-y-1/2 transition-all" style={{ left: `${dotLeft}%`, top: `${dotTop}%` }}>
              <span className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-40" style={{ backgroundColor: info.color }} />
              <span className="relative block h-4 w-4 rounded-full ring-2 ring-white shadow dark:ring-slate-900" style={{ backgroundColor: info.color }} />
            </div>
          </div>
          {/* 축 의미 */}
          <div className="mt-3 flex justify-between px-1 text-[10px] text-[#9CA3AF] dark:text-slate-500">
            <span>← 기분 안 좋음</span><span>기분 좋음 →</span>
          </div>
          <p className="mt-1 text-center text-[10px] text-[#9CA3AF] dark:text-slate-500">위 = 활발 · 아래 = 차분</p>
          {/* 한 줄 요약 */}
          <div className="mt-4 flex justify-center gap-3">
            <span className="rounded-full bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#374151] dark:bg-slate-800 dark:text-slate-200">기분 {moodTxt}</span>
            <span className="rounded-full bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#374151] dark:bg-slate-800 dark:text-slate-200">에너지 {energyTxt}</span>
          </div>
        </section>

        {/* 상태 점수 */}
        <section className="fx2-card fx2-outline lg:col-span-6 lg:col-start-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400 mb-3 text-center">상태 점수</p>
          <div className="space-y-2.5">
            {SCORE_META.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-[#6B7280] dark:text-slate-400">{label}</span>
                <div className="relative h-2 flex-1 rounded-full bg-gray-100 dark:bg-slate-800">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${an.scores[key]}%`, backgroundColor: color }} />
                </div>
                <span className="w-8 text-right text-xs font-bold text-[#111827] dark:text-white">{an.scores[key]}</span>
              </div>
            ))}
          </div>
        </section>

        {/* 하단 */}
        <section className="fx2-card fx2-outline space-y-3 lg:col-span-6 lg:col-start-4">
          <p className="text-[10px] text-center text-[#9CA3AF] dark:text-slate-500 leading-relaxed">
            ※ 뇌파 기반 추정치이며 의료 진단이 아닙니다. 자세한 수치는 요약에서 확인하세요.
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
              <p className="text-center text-sm font-bold mt-1" style={{ color: info.color }}>{st}</p>
              <p className="text-center text-[11px] text-[#6B7280] dark:text-slate-300 mt-0.5">{info.headline}</p>
              <div className="mt-2 flex justify-center gap-3 text-[11px] font-semibold text-[#374151] dark:text-slate-200">
                <span>기분 {moodTxt}</span>
                <span>에너지 {energyTxt}</span>
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
