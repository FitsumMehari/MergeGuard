const fs=require('node:fs');
const path=require('node:path');
const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
const roots=['apps','packages'];
let checked=0, failures=[];
function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){const q=path.join(p,e.name);if(e.isDirectory()){if(e.name!=='dist'&&e.name!=='node_modules')walk(q)}else if(/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')){const src=fs.readFileSync(q,'utf8');const out=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve},fileName:q,reportDiagnostics:true});const ds=(out.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(ds.length)failures.push([q,ds.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' '))]);checked++;}}}
roots.forEach(walk);
if(failures.length){for(const [f,ds] of failures){console.error(f,ds)}process.exit(1)}
console.log(`syntax/transpile check passed: ${checked} TypeScript/TSX files`);
