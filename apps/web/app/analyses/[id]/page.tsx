import { api } from "@/lib/api";
import { pillClass, type AnalysisDetail } from "@/lib/types";

export default async function Analysis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let analysis: AnalysisDetail | null = null;
  try {
    analysis = await api<AnalysisDetail>(`/api/analyses/${id}`);
  } catch {
    analysis = null;
  }

  if (!analysis) {
    return (
      <>
        <a className="muted" href="/">
          ← Reviews
        </a>
        <div className="card">This analysis was not found or the API is unavailable.</div>
      </>
    );
  }

  return (
    <>
      <a className="muted" href="/">
        ← Reviews
      </a>
      <div className="card">
        <div className="row">
          <div>
            <h1>{analysis.changeRequest.title}</h1>
            <div className="muted">
              {analysis.changeRequest.repository.owner}/{analysis.changeRequest.repository.name} #{analysis.changeRequest.number}
            </div>
          </div>
          <div>
            <span className={`pill ${pillClass(analysis.riskLevel)}`}>{analysis.riskLevel}</span>
            <div className="metric">{analysis.riskScore ?? "–"}/100</div>
          </div>
        </div>
      </div>
      <div className="grid">
        <div className="card">
          <div className="metric">{analysis.findings.length}</div>
          <div className="muted">Findings</div>
        </div>
        <div className="card">
          <div className="metric">{analysis.filesReviewed}</div>
          <div className="muted">Files reviewed</div>
        </div>
        <div className="card">
          <div className="metric">{Math.round((analysis.riskConfidence || 0) * 100)}%</div>
          <div className="muted">Risk confidence</div>
        </div>
      </div>
      <h2>Findings</h2>
      {analysis.findings.length === 0 ? (
        <div className="card">No reportable high-confidence issues.</div>
      ) : (
        analysis.findings.map((finding) => (
          <article key={finding.id} className={`card finding ${pillClass(finding.severity)}`}>
            <div className="row">
              <div>
                <span className={`pill ${pillClass(finding.severity)}`}>{finding.severity}</span>{" "}
                <span className="pill">{finding.category}</span>
              </div>
              <strong>{Math.round(finding.confidence * 100)}% confidence</strong>
            </div>
            <h3 style={{ marginTop: 12 }}>{finding.title}</h3>
            <div className="code">
              {finding.file}
              {finding.startLine ? `:${finding.startLine}` : ""}
            </div>
            <p>{finding.description}</p>
            {finding.executionPath ? (
              <>
                <strong>Execution path</strong>
                <pre>{finding.executionPath.join("\n→ ")}</pre>
              </>
            ) : null}
            {finding.edgeCase ? (
              <>
                <strong>Edge case</strong>
                <pre>{JSON.stringify(finding.edgeCase, null, 2)}</pre>
              </>
            ) : null}
            {finding.remediation ? (
              <>
                <strong>Suggested remediation</strong>
                <p>{finding.remediation}</p>
              </>
            ) : null}
            {finding.suggestedTest ? (
              <>
                <strong>Suggested regression test</strong>
                <pre>{finding.suggestedTest}</pre>
              </>
            ) : null}
          </article>
        ))
      )}
    </>
  );
}
