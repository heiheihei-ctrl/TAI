CREATE TABLE "VisualAgentSession" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "agentId" TEXT NOT NULL, "environmentId" TEXT NOT NULL,
  "upstreamId" TEXT NOT NULL, "ownsAgent" BOOLEAN NOT NULL DEFAULT false,
  "ownsEnvironment" BOOLEAN NOT NULL DEFAULT false, "closing" BOOLEAN NOT NULL DEFAULT false, "activeTurnId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisualAgentSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisualAgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VisualAgentSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VisualAgentSession_upstreamId_key" ON "VisualAgentSession"("upstreamId");
CREATE INDEX "VisualAgentSession_userId_projectId_updatedAt_idx" ON "VisualAgentSession"("userId", "projectId", "updatedAt");
CREATE TABLE "VisualAgentTurn" (
  "id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL, "referenceUrls" TEXT[] NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued',
  "submission" TEXT NOT NULL DEFAULT 'pending', "cancelRequested" BOOLEAN NOT NULL DEFAULT false, "outcome" TEXT, "artifactSyncUntil" TIMESTAMP(3), "apiUsageId" TEXT, "cursor" TEXT,
  "seenRunning" BOOLEAN NOT NULL DEFAULT false, "events" JSONB NOT NULL DEFAULT '[]',
  "artifacts" JSONB NOT NULL DEFAULT '[]', "error" TEXT, "leaseOwner" TEXT, "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisualAgentTurn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisualAgentTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VisualAgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VisualAgentTurn_apiUsageId_key" ON "VisualAgentTurn"("apiUsageId");
CREATE UNIQUE INDEX "VisualAgentTurn_sessionId_requestId_key" ON "VisualAgentTurn"("sessionId", "requestId");
CREATE INDEX "VisualAgentTurn_status_leaseUntil_idx" ON "VisualAgentTurn"("status", "leaseUntil");
