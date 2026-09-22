import assert from 'node:assert/strict';
import { detectCandidates, analyzeStatic } from '../packages/analyzer/dist/index.js';
import { verifyCandidates } from '../packages/providers/dist/index.js';

function change(path, headContent, patch=headContent.split('\n').map(x=>'+'+x).join('\n')){
  return {
    platform:'github', repository:{id:'1',owner:'acme',name:'app'},
    change:{id:'1',number:1,title:'test change',baseSha:'a',headSha:'b',author:{id:'u',username:'dev'}},
    files:[{path,status:'modified',additions:headContent.split('\n').length,deletions:0,headContent,patch:`@@ -0,0 +1,${headContent.split('\n').length} @@\n${patch}`}],
    metadata:{draft:false,labels:[]}
  };
}

const cases = [
  ['async forEach bug','src/jobs.ts',`async function run(items: Item[]) {\n  items.forEach(async item => {\n    await save(item);\n  });\n}`, 'async-foreach'],
  ['SQL injection','src/users.ts',`async function find(name:string){\n return db.$queryRawUnsafe(\`SELECT * FROM users WHERE name = '${'${name}'}'\`);\n}`, 'sql-template'],
  ['unbounded concurrency','src/sync.ts',`async function sync(items: Item[]) {\n return Promise.all(items.map(async x => remote(x)));\n}`, 'promise-all-map'],
  ['empty catch','src/api.ts',`async function load(){\n try { await fetchData(); } catch (e) {}\n}`, 'catch-empty'],
  ['non-null assertion','src/profile.ts',`function email(user?: User){\n return user!.email;\n}`, 'ast-non-null'],
  ['destructive migration','migrations/1.sql',`ALTER TABLE users DROP COLUMN legacy_token;`, 'drop-column'],
  ['TLS disabled','src/http.ts',`const agent = new Agent({ rejectUnauthorized: false });`, 'tls-disabled'],
  ['check then create','src/register.ts',`async function register(email:string){\n const user = await db.user.findUnique({where:{email}});\n if (!user) return db.user.create({data:{email}});\n}`, 'check-then-create'],
];

for (const [name,path,source,detector] of cases){
  const c=change(path,source);
  const findings=detectCandidates(c);
  assert(findings.some(f=>f.detector===detector), `${name}: expected ${detector}, got ${findings.map(f=>f.detector).join(', ')}`);
}

// Ensure a benign docs-only change does not produce code candidates.
const clean=change('README.md','Improve installation documentation.');
assert.equal(detectCandidates(clean).length,0);

// Offline verification must work with no API key and must not introduce another AI dependency.
delete process.env.TYPESAFE_API_KEY;
const raceChange=change('src/pay.ts',`async function pay(id:string){\n const row = await db.invoice.findUnique({where:{id}});\n if (!row.paid) await db.invoice.update({where:{id},data:{paid:true}});\n}`);
const candidates=detectCandidates(raceChange);
const signals=analyzeStatic(raceChange);
const verified=await verifyCandidates(candidates,signals,'payment change');
assert(verified.every(f=>f.verification.provider==='offline'));
assert(verified.length>0);

console.log(`detector tests passed: ${cases.length} targeted cases + offline verification`);
