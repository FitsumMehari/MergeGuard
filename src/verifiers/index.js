import { stableId, clamp01 } from "../utils.js";
import { offlineVerify } from "./offline.js";
import { detectLaya, verifyWithLaya } from "./laya.js";
import { verifyWithJev } from "./jev.js";

export async function verifyCandidates(candidates, contextFor, config, { onWarning } = {}) {
  const items = candidates.map((candidate) => ({ candidate, context: contextFor(candidate) }));
  let verifications;
  let provider = config.verifier;
  if (provider === "auto") provider = detectLaya(config).available ? "laya" : "offline";

  if (provider === "laya") {
    try { verifications = verifyWithLaya(items, config); }
    catch (error) {
      if (config.verifier === "laya") throw error;
      onWarning?.(`Laya unavailable; falling back to deterministic verification (${error.message})`);
      provider = "offline";
    }
  }
  if (provider === "jev") verifications = await verifyWithJev(items, config);
  if (!verifications) verifications = items.map(({candidate,context}) => offlineVerify(candidate,context,config));

  const findings=[];
  for(let i=0;i<candidates.length;i++){
    const candidate=candidates[i], verification=verifications[i];
    if(verification.verdict!=="report") continue;
    const confidence=clamp01((candidate.reviewerConfidence??.6)*.34+verification.plausible*.24+verification.reachable*.12+(1-verification.existingProtection)*.10+verification.worthReporting*.20);
    findings.push({...candidate,id:candidate.id||stableId([candidate.file,candidate.detector||candidate.title,String(candidate.startLine||0)]),confidence:Number(confidence.toFixed(3)),verification});
  }
  findings.sort((a,b)=>severityScore(b.severity)-severityScore(a.severity)||b.confidence-a.confidence);
  return { findings, provider };
}

function severityScore(s){return {critical:5,high:4,medium:3,low:2,info:1}[s]||0;}
export { detectLaya } from "./laya.js";
