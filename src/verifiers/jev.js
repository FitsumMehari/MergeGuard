import { verificationQuestions, IMPACT_LABELS } from "./questions.js";
import { clamp01 } from "../utils.js";

export async function verifyWithJev(items, config) {
  const key = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY;
  if (!key) throw new Error("Jev verifier selected but TYPESAFE_API_KEY/JEV_API_KEY is not set");
  const out = [];
  for (const { candidate, context } of items) {
    const response = await fetch(config.jev.url, { method:"POST", headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"}, body:JSON.stringify({model:config.jev.model,state:context,questions:verificationQuestions}) });
    if (!response.ok) throw new Error(`Jev verification failed with HTTP ${response.status}`);
    const json = await response.json();
    out.push(normalize(candidate, json.answers || {}, config));
  }
  return out;
}

function normalize(candidate, answers, config) {
  const noul=(k,f)=>typeof answers[k]?.noul==="number"?answers[k].noul:f;
  const plausible=noul("plausible",candidate.reviewerConfidence??.6), reachable=noul("reachable",.68), existingProtection=noul("protected",.2), worthReporting=noul("report",candidate.reviewerConfidence??.6);
  const impact=scoreTo01(answers.severe,candidate.severity);
  const strength=plausible*.31+reachable*.18+impact*.12+(1-existingProtection)*.14+worthReporting*.25;
  return {plausible:r(plausible),reachable:r(reachable),impact:r(impact),existingProtection:r(existingProtection),worthReporting:r(worthReporting),strength:r(strength),verdict:strength>=config.confidence?"report":"suppress",provider:"jev"};
}
function scoreTo01(answer,severity){if(typeof answer?.score==="number")return answer.score>1?Math.min(1,answer.score/4):clamp01(answer.score);if(answer?.choice)return IMPACT_LABELS[answer.choice]??.55;if(answer?.probabilities){let n=0,d=0;for(const [k,p] of Object.entries(answer.probabilities))if(k in IMPACT_LABELS){n+=IMPACT_LABELS[k]*p;d+=p;}if(d)return n/d;}return {critical:1,high:.8,medium:.55,low:.3,info:.15}[severity]??.55;}
function r(v){return Number(clamp01(v).toFixed(3));}
