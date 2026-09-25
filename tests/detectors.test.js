import test from "node:test";
import assert from "node:assert/strict";
import { patternCandidates, diffRegressionCandidates } from "../src/detectors/patterns.js";

function added(path, content) {
  const lines=content.split("\n");
  return {path,status:"modified",patch:`diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,0 +1,${lines.length} @@\n${lines.map((x)=>`+${x}`).join("\n")}`,headContent:content};
}

test("language-specific high-signal detectors",()=>{
  const cases=[
    ["x.js","exec(`rm -rf ${userInput}`)","js-shell-interpolation"],
    ["x.py","subprocess.run(cmd, shell=True)","python-shell-true"],
    ["X.java",'Runtime.getRuntime().exec("tool " + request.getParameter("x"));',"java-process-exec"],
    ["x.go",'exec.Command("sh", "-c", fmt.Sprintf("tool %s", input))',"go-shell-command"],
    ["x.php",'system("tool " . $_GET["x"]);',"php-shell"],
    ["x.rb",'system("tool #{input}")',"ruby-shell-interpolation"],
    ["X.cs",'Process.Start($"tool {Request.Query["x"]}");',"csharp-process"],
  ];
  for(const [path,content,id] of cases){
    const found=patternCandidates([added(path,content)]);
    assert(found.some((item)=>item.detector===id),`${path}: expected ${id}, got ${found.map((x)=>x.detector).join(",")}`);
  }
});

test("diff regression finds removed transaction",()=>{
  const patch=`diff --git a/x.ts b/x.ts\n--- a/x.ts\n+++ b/x.ts\n@@ -1,5 +1,3 @@\n-await db.$transaction(async tx => {\n- await tx.a.create({data:a});\n- await tx.b.update({where:{id},data:b});\n-});\n+await db.a.create({data:a});\n+await db.b.update({where:{id},data:b});`;
  const found=diffRegressionCandidates([{path:"x.ts",status:"modified",patch}]);
  assert(found.some((item)=>item.detector==="transaction-boundary-removed"));
});
