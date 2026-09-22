import { api } from "@/lib/api";
import { pillClass, type AnalysisSummary } from "@/lib/types";

export default async function Home() {
  let rows: AnalysisSummary[] = [];
  let loadError = false;
  try {
    rows = await api<AnalysisSummary[]>("/api/analyses");
  } catch {
    loadError = true;
  }

  const highRisk = rows.filter((row) => row.riskLevel === "high" || row.riskLevel === "critical").length;
  const findings = rows.reduce((total, row) => total + (row._count?.findings || 0), 0);

  return (
    <>
      <h1>Code review intelligence</h1>
      <p className="muted">
        High-confidence bugs, security risks, performance problems and edge cases from GitHub PRs and GitLab MRs.
      </p>
      <div className="grid">
        <div className="card">
          <div className="metric">{rows.length}</div>
          <div className="muted">Recent analyses</div>
        </div>
        <div className="card">
          <div className="metric">{highRisk}</div>
          <div className="muted">High-risk changes</div>
        </div>
        <div className="card">
          <div className="metric">{findings}</div>
          <div className="muted">Reportable findings</div>
        </div>
      </div>
      <h2>Recent reviews</h2>
      {loadError ? (
        <div className="card">The dashboard could not reach the MergeGuard API. Confirm API_URL and DASHBOARD_API_KEY.</div>
      ) : rows.length === 0 ? (
        <div className="card">
          No analyses yet. Install the GitHub App or configure a GitLab webhook, then open/update a PR/MR.
        </div>
      ) : (
        rows.map((row) => (
          <a key={row.id} href={`/analyses/${row.id}`}>
            <div className="card row">
              <div>
                <strong>
                  {row.changeRequest.repository.owner}/{row.changeRequest.repository.name} #{row.changeRequest.number}
                </strong>
                <div>{row.changeRequest.title}</div>
                <small className="muted">{new Date(row.createdAt).toLocaleString()}</small>
              </div>
              <div>
                <span className={`pill ${pillClass(row.riskLevel)}`}>{row.riskLevel || row.status}</span> · {row._count.findings} findings
              </div>
            </div>
          </a>
        ))
      )}
    </>
  );
}
