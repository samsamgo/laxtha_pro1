import { useCallback, useMemo, useRef, useState } from "react";
import type { EegSessionExport } from "../types/eegRecorder";
import type { FftBandPowers } from "../lib/fftAccumulator";

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
interface Bands { theta: number; alpha: number; beta: number; gamma: number }
interface Scores { focus: number; fatigue: number; arousal: number; relax: number; tension: number }
type StateLabel = "집중" | "안정 집중" | "이완" | "저각성 이완" | "피로/졸림" | "긴장/과각성" | "신호 점검";

// ── 대역 계산 ──
function computeBands(session: EegSessionExport): Bands | null {
  const ep = session.fftEpochs;
  if (!ep?.length) return null;
  let t = 0, a = 0, b = 0, g = 0, n = 0;
  for (const e of ep) {
    for (const ch of [e.bands.ch1, e.bands.ch2] as FftBandPowers[]) {
      t += ch.theta; a += ch.alpha; b += ch.lBeta + ch.mBeta + ch.hBeta; g += ch.gamma; n++;
    }
  }
  if (!n) return null;
  t /= n; a /= n; b /= n; g /= n;
  const base = t + a + b;
  if (!base) return null;
  return { theta: (t / base) * 100, alpha: (a / base) * 100, beta: (b / base) * 100, gamma: g };
}

// ── 점수 ──
function calcScores(r: Bands, bpm: number): Scores {
  const bf = bpm > 0 ? clamp((bpm - 50) / 80, 0, 1) : 0.5;
  const gn = clamp(r.gamma / 50, 0, 1);
  return {
    focus: clamp(Math.round(r.beta * 1.2 - r.theta * 0.5), 0, 100),
    fatigue: clamp(Math.round(r.theta * 1.3 - r.beta * 0.4), 0, 100),
    arousal: clamp(Math.round(r.beta * 0.8 + bf * 30), 0, 100),
    relax: clamp(Math.round(r.alpha * 1.4 - gn * 20 - Math.abs(bpm - 70) * 0.3), 0, 100),
    tension: clamp(Math.round(gn * 40 + (r.beta > 50 ? (r.beta - 50) * 0.8 : 0) + (bpm > 90 ? (bpm - 90) * 0.5 : 0)), 0, 100),
  };
}

// ── 상태 판단 ──
function calcState(r: Bands, s: Scores, eegRate: number, satRate: number): StateLabel {
  if (eegRate < 20 || satRate > 20) return "신호 점검";
  if (s.tension >= 60) return "긴장/과각성";

  const thetaDom = r.theta > r.alpha && r.theta > r.beta;
  const alphaDom = r.alpha >= r.theta && r.alpha >= r.beta;

  if (thetaDom && s.fatigue >= 50) return "피로/졸림";
  if (thetaDom && r.alpha > 20) return "저각성 이완";
  if (alphaDom && s.relax >= 30) return "이완";
  if (r.beta > 35 && r.alpha > 15 && s.focus >= 30) return "안정 집중";
  if (r.beta > 35 && s.focus >= 40) return "집중";
  if (thetaDom) return "피로/졸림";
  if (alphaDom) return "이완";
  return "안정 집중";
}

function dominantBand(r: Bands): string {
  const m: [string, number][] = [["Theta", r.theta], ["Alpha", r.alpha], ["Beta", r.beta]];
  m.sort((a, b) => b[1] - a[1]);
  return m[0][1] - m[1][1] < 5 ? "Mixed" : m[0][0];
}

// ── 상태별 설명 (유저 친화적) ──
const STATE_INFO: Record<StateLabel, { emoji: string; color: string; desc: string; tip: string }> = {
  "집중": { emoji: "🎯", color: "#2563EB", desc: "뇌가 활발하게 일하고 있어요. 업무나 공부에 적합한 상태입니다.", tip: "지금 하던 일을 계속하세요!" },
  "안정 집중": { emoji: "🧘‍♂️", color: "#06B6D4", desc: "긴장 없이 편안하게 집중하고 있어요. 가장 이상적인 상태입니다.", tip: "이 상태를 유지해 보세요." },
  "이완": { emoji: "😌", color: "#22C55E", desc: "마음이 편안하고 이완된 상태예요. 휴식이 잘 되고 있습니다.", tip: "명상이나 가벼운 음악 감상에 좋아요." },
  "저각성 이완": { emoji: "🌙", color: "#14B8A6", desc: "깊이 이완되어 있어요. 졸음이 올 수 있는 상태입니다.", tip: "잠시 눈을 감고 쉬어도 좋아요." },
  "피로/졸림": { emoji: "😴", color: "#F59E0B", desc: "뇌의 활동이 낮아져 있어요. 피로가 쌓여 있을 수 있습니다.", tip: "잠깐 휴식을 취하거나 환기해 보세요." },
  "긴장/과각성": { emoji: "⚡", color: "#EF4444", desc: "뇌가 과도하게 긴장하고 있어요. 스트레스 상태일 수 있습니다.", tip: "심호흡이나 스트레칭으로 긴장을 풀어보세요." },
  "신호 점검": { emoji: "🔧", color: "#64748B", desc: "측정 신호가 불안정합니다. 전극 부착 상태를 확인해 주세요.", tip: "전극을 다시 부착하고 측정해 보세요." },
};

const BAND_CLR = { theta: "#8B5CF6", alpha: "#22C55E", beta: "#F59E0B" };
const BAND_KR: Record<string, string> = { theta: "세타", alpha: "알파", beta: "베타" };
const BAND_DESC: Record<string, string> = {
  theta: "졸림·명상",
  alpha: "편안·안정",
  beta: "사고·집중",
};

const SCORE_META: { key: keyof Scores; label: string; color: string }[] = [
  { key: "focus", label: "집중도", color: "#2563EB" },
  { key: "fatigue", label: "피로도", color: "#F59E0B" },
  { key: "arousal", label: "각성도", color: "#06B6D4" },
  { key: "relax", label: "이완도", color: "#22C55E" },
  { key: "tension", label: "긴장도", color: "#EF4444" },
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
    let bS = 0, bN = 0, eN = 0, gN = 0, satN = 0;
    for (let i = 0; i < len; i++) {
      const s = sam[i];
      if (s.bpm > 0) { bS += s.bpm; bN++; }
      if (s.eegValid) eN++;
      if (s.signal === "good") gN++;
      if ((s.ch1Saturation !== null && (s.ch1Saturation <= 16 || s.ch1Saturation >= 239)) ||
          (s.ch2Saturation !== null && (s.ch2Saturation <= 16 || s.ch2Saturation >= 239))) satN++;
    }
    const avgBpm = bN > 0 ? Math.round(bS / bN) : 0;
    const eegRate = len > 0 ? Math.round((eN / len) * 100) : 0;
    const sigRate = len > 0 ? Math.round((gN / len) * 100) : 0;
    const satRate = len > 0 ? Math.round((satN / len) * 100) : 0;
    const bands = computeBands(session);
    if (!bands) return null;
    const sc = calcScores(bands, avgBpm);
    const st = calcState(bands, sc, eegRate, satRate);
    const dom = dominantBand(bands);

    const validRr = sam.filter((s) => s.rrInterval > 0).map((s) => s.rrInterval);
    let hrvData: { avgRr: number; sdnn: number; rmssd: number; pnn50: number } | null = null;
    if (validRr.length >= 2) {
      const rrN = validRr.length;
      const rrSum = validRr.reduce((a, b) => a + b, 0);
      const rrMean = rrSum / rrN;
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

    return { bands, sc, st, dom, avgBpm, eegRate, sigRate, hrvData };
  }, [session]);

  const shareText = useMemo(() => {
    if (!session || !result) return "";
    const { bands: b, sc, st, dom, avgBpm } = result;
    const info = STATE_INFO[st];
    return [
      `${info.emoji} ${st}`,
      ``,
      info.desc,
      ``,
      `세타 ${b.theta.toFixed(1)}% | 알파 ${b.alpha.toFixed(1)}% | 베타 ${b.beta.toFixed(1)}%`,
      `우세 대역: ${dom === "Theta" ? "세타" : dom === "Alpha" ? "알파" : dom === "Beta" ? "베타" : dom}`,
      ``,
      `집중 ${sc.focus} · 피로 ${sc.fatigue} · 이완 ${sc.relax} · 긴장 ${sc.tension}`,
      avgBpm > 0 ? `심박 ${avgBpm}bpm` : "",
      ``,
      `${new Date(session.startedAt).toLocaleDateString("ko-KR")} ${formatMs(session.durationMs)} 측정`,
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
            <h2 className="text-lg font-bold text-[#111827] dark:text-white">뇌파 분석</h2>
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
          <p className="text-sm text-[#6B7280] dark:text-slate-400">주파수 대역 분석에 FFT 데이터가 필요합니다.</p>
          <button type="button" onClick={reset} className="fx2-btn-primary !px-5 !py-2 !text-sm">다른 파일</button>
        </section>
      </div>
    );
  }

  const { bands, sc, st, dom, avgBpm, hrvData } = result;
  const info = STATE_INFO[st];

  // ── 결과 ──
  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* 상태 카드 */}
        <section className="fx2-card fx2-outline text-center py-8 lg:col-span-8 lg:col-start-3">
          <p className="text-5xl">{info.emoji}</p>
          <h2 className="mt-3 text-2xl font-bold text-[#111827] dark:text-white">{st}</h2>
          <p className="mt-2 text-sm text-[#6B7280] dark:text-slate-300 max-w-xs mx-auto leading-relaxed">{info.desc}</p>
          <p className="mt-3 inline-block rounded-full bg-[#EAF0F8] px-4 py-1.5 text-xs font-semibold text-[#374151] dark:bg-slate-800 dark:text-slate-200">{info.tip}</p>
          <p className="mt-3 text-[10px] text-[#9CA3AF] dark:text-slate-500">
            {new Date(session.startedAt).toLocaleString("ko-KR")} · {formatMs(session.durationMs)} · {avgBpm > 0 ? `${avgBpm}bpm` : ""}
          </p>
        </section>

        {/* 주파수 대역 분포 */}
        <section className="fx2-card fx2-outline lg:col-span-8 lg:col-start-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400 text-center">주파수 대역 분포</p>

          {/* 비율 바 */}
          <div className="mt-4 flex h-4 overflow-hidden rounded-full">
            {(["theta", "alpha", "beta"] as const).map((b) => (
              <div key={b} style={{ width: `${bands[b]}%`, backgroundColor: BAND_CLR[b] }} className="transition-all" />
            ))}
          </div>

          {/* 범례 */}
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

          <p className="mt-3 text-center text-[10px] text-[#9CA3AF] dark:text-slate-500">우세: {dom === "Theta" ? "세타" : dom === "Alpha" ? "알파" : dom === "Beta" ? "베타" : "혼합"} · Delta 미측정</p>
        </section>

        {/* 점수 + 설명 */}
        <section className="fx2-card fx2-outline lg:col-span-8 lg:col-start-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6B7280] dark:text-slate-400 mb-3">상태 점수</p>
          <div className="space-y-2">
            {SCORE_META.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-[#6B7280] dark:text-slate-400">{label}</span>
                <div className="relative h-2 flex-1 rounded-full bg-gray-100 dark:bg-slate-800">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${sc[key]}%`, backgroundColor: color }} />
                </div>
                <span className="w-7 text-right text-xs font-bold text-[#111827] dark:text-white">{sc[key]}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-[#F8FAFC] p-4 dark:bg-slate-800/50 text-xs leading-relaxed text-[#6B7280] dark:text-slate-300 space-y-2">
            <p>
              <span className="font-semibold text-[#111827] dark:text-white">집중도 {sc.focus}</span> — {sc.focus >= 50 ? "베타파 활동이 높아 인지 작업에 몰입하고 있습니다." : sc.focus >= 20 ? "보통 수준의 집중 상태입니다. 주의력이 분산될 수 있습니다." : "집중력이 낮은 상태입니다. 뇌가 휴식을 원하고 있을 수 있습니다."}
            </p>
            <p>
              <span className="font-semibold text-[#111827] dark:text-white">피로도 {sc.fatigue}</span> — {sc.fatigue >= 50 ? "세타파가 우세하여 피로가 쌓여 있습니다. 충분한 휴식이 필요합니다." : sc.fatigue >= 20 ? "약간의 피로감이 감지됩니다." : "피로도가 낮고 컨디션이 양호합니다."}
            </p>
            <p>
              <span className="font-semibold text-[#111827] dark:text-white">이완도 {sc.relax}</span> — {sc.relax >= 50 ? "알파파가 활발하여 심신이 안정된 상태입니다." : sc.relax >= 20 ? "적당히 이완된 상태입니다." : "이완이 부족합니다. 긴장을 풀어보세요."}
            </p>
            <p>
              <span className="font-semibold text-[#111827] dark:text-white">긴장도 {sc.tension}</span> — {sc.tension >= 50 ? "고주파 베타/감마 활동이 높아 스트레스 상태일 수 있습니다." : sc.tension >= 20 ? "가벼운 긴장감이 있습니다." : "긴장도가 낮고 편안한 상태입니다."}
            </p>
          </div>
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
          <p className="text-[10px] text-center text-[#9CA3AF] dark:text-slate-500">※ 건강 정보 참고용이며 의료 진단이 아닙니다.</p>
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
