CREATE TABLE "Repository" (
  "id" TEXT NOT NULL, "platform" TEXT NOT NULL, "externalId" TEXT NOT NULL, "owner" TEXT NOT NULL, "name" TEXT NOT NULL, "url" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Repository_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Repository_platform_externalId_key" ON "Repository"("platform", "externalId");
CREATE TABLE "ChangeRequest" (
  "id" TEXT NOT NULL, "repositoryId" TEXT NOT NULL, "externalId" TEXT NOT NULL, "number" INTEGER NOT NULL, "title" TEXT NOT NULL, "author" TEXT NOT NULL,
  "baseSha" TEXT NOT NULL, "headSha" TEXT NOT NULL, "url" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChangeRequest_repositoryId_externalId_key" ON "ChangeRequest"("repositoryId", "externalId");
ALTER TABLE "ChangeRequest" ADD CONSTRAINT "ChangeRequest_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "AnalysisRun" (
  "id" TEXT NOT NULL, "changeRequestId" TEXT NOT NULL, "headSha" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "riskLevel" TEXT, "riskScore" INTEGER,
  "riskConfidence" DOUBLE PRECISION, "filesReviewed" INTEGER NOT NULL DEFAULT 0, "relatedFilesReviewed" INTEGER NOT NULL DEFAULT 0, "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AnalysisRun_changeRequestId_createdAt_idx" ON "AnalysisRun"("changeRequestId", "createdAt");
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "ChangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "Finding" (
  "id" TEXT NOT NULL, "analysisRunId" TEXT NOT NULL, "category" TEXT NOT NULL, "severity" TEXT NOT NULL, "confidence" DOUBLE PRECISION NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "file" TEXT NOT NULL, "startLine" INTEGER, "endLine" INTEGER, "evidence" JSONB NOT NULL,
  "executionPath" JSONB, "edgeCase" JSONB, "remediation" TEXT, "suggestedTest" TEXT, "verification" JSONB NOT NULL, "source" TEXT NOT NULL,
  "feedback" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Finding_analysisRunId_severity_idx" ON "Finding"("analysisRunId", "severity");
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "StaticSignalRecord" (
  "id" TEXT NOT NULL, "analysisRunId" TEXT NOT NULL, "category" TEXT NOT NULL, "severity" TEXT NOT NULL, "file" TEXT, "line" INTEGER,
  "title" TEXT NOT NULL, "description" TEXT NOT NULL, "confidence" DOUBLE PRECISION NOT NULL, "evidence" JSONB, CONSTRAINT "StaticSignalRecord_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "StaticSignalRecord" ADD CONSTRAINT "StaticSignalRecord_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "WebhookDelivery" (
  "id" TEXT NOT NULL, "platform" TEXT NOT NULL, "deliveryId" TEXT NOT NULL, "event" TEXT NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookDelivery_platform_deliveryId_key" ON "WebhookDelivery"("platform", "deliveryId");
CREATE TABLE "RepositoryIndex" (
  "id" TEXT NOT NULL, "repositoryId" TEXT NOT NULL, "sha" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ready', "model" JSONB NOT NULL,
  "fileCount" INTEGER NOT NULL DEFAULT 0, "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RepositoryIndex_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RepositoryIndex_repositoryId_sha_key" ON "RepositoryIndex"("repositoryId", "sha");
CREATE INDEX "RepositoryIndex_repositoryId_generatedAt_idx" ON "RepositoryIndex"("repositoryId", "generatedAt");
ALTER TABLE "RepositoryIndex" ADD CONSTRAINT "RepositoryIndex_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
