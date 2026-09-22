-- Prevent duplicate analysis runs for repeated webhook deliveries/retries of the same PR/MR head.
CREATE UNIQUE INDEX "AnalysisRun_changeRequestId_headSha_key"
ON "AnalysisRun"("changeRequestId", "headSha");
