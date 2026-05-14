/**
 * External integration endpoints used by the dashboard.
 *
 * LAXTHA_GPT_URL: Custom ChatGPT GPT ("LAXTHA 뇌파 브리핑") that ingests the FX2
 * EegSessionExport JSON the user downloads from the dashboard and produces a
 * friendly, non-diagnostic briefing. The instructions/guardrails for this GPT
 * are defined in ChatGPT's GPT Builder, not in this repo.
 */
export const LAXTHA_GPT_URL =
  "https://chatgpt.com/g/g-6a052f3d7dac819180256c6afc57e894-laxtha-noepa-beuriping";

export const LAXTHA_GPT_LABEL = "LAXTHA 뇌파 브리핑";

/**
 * Opens the LAXTHA briefing GPT in a new tab.
 * Must be called inside a user-gesture handler so the popup is not blocked.
 */
export function openLaxthaGpt(): void {
  window.open(LAXTHA_GPT_URL, "_blank", "noopener,noreferrer");
}
