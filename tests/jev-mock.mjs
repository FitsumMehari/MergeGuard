import assert from 'node:assert/strict';
import { verifyWithJev } from '../packages/providers/dist/index.js';

process.env.TYPESAFE_API_KEY='test-key-not-real';
process.env.JEV_API_URL='https://example.invalid/v1/systemone';
let seen;
globalThis.fetch=async (url,init)=>{
  seen={url,init,body:JSON.parse(init.body)};
  return new Response(JSON.stringify({answers:{
    plausible:{noul:.96}, reachable:{noul:.88}, severe:{choice:'high'}, protected:{noul:.08}, report:{noul:.94}
  }}),{status:200,headers:{'content-type':'application/json'}});
};
const finding={detector:'read-check-write',category:'concurrency',severity:'high',title:'race',description:'race candidate',file:'src/pay.ts',evidence:['read then update'],reviewerConfidence:.75};
const v=await verifyWithJev(finding,{changeTitle:'pay',staticSignals:[],state:{candidateFinding:finding,sourceContext:'example'}});
assert.equal(seen.url,'https://example.invalid/v1/systemone');
assert.equal(seen.init.headers.Authorization,'Bearer test-key-not-real');
assert.equal(seen.body.questions.plausible.type,'noul');
assert.equal(seen.body.questions.severe.type,'score');
assert.equal(v.provider,'jev');
assert.equal(v.verdict,'report');
assert(v.plausible>.9 && v.existingProtection<.1);
console.log('Jev mocked-provider test passed');
