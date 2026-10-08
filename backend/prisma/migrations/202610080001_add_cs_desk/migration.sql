-- Linglong customer-service desk

CREATE TABLE IF NOT EXISTS "CsConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadUser" INTEGER NOT NULL DEFAULT 0,
    "unreadAgent" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CsMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "senderId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'text',
    "content" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CsMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CsTicket" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CsQuickReply" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsQuickReply_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CsServicePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "description" TEXT,
    "tag" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsServicePackage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CsCollabRequest" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "projectId" TEXT,
    "pricePerMinute" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CsCollabRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CsConversation_status_lastMessageAt_idx" ON "CsConversation"("status", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "CsConversation_userId_status_lastMessageAt_idx" ON "CsConversation"("userId", "status", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "CsConversation_agentId_status_lastMessageAt_idx" ON "CsConversation"("agentId", "status", "lastMessageAt" DESC);
CREATE INDEX IF NOT EXISTS "CsMessage_conversationId_createdAt_idx" ON "CsMessage"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "CsTicket_conversationId_createdAt_idx" ON "CsTicket"("conversationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CsTicket_userId_createdAt_idx" ON "CsTicket"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CsTicket_status_createdAt_idx" ON "CsTicket"("status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CsQuickReply_enabled_sortOrder_idx" ON "CsQuickReply"("enabled", "sortOrder");
CREATE INDEX IF NOT EXISTS "CsServicePackage_enabled_sortOrder_idx" ON "CsServicePackage"("enabled", "sortOrder");
CREATE INDEX IF NOT EXISTS "CsCollabRequest_conversationId_createdAt_idx" ON "CsCollabRequest"("conversationId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "CsCollabRequest_status_createdAt_idx" ON "CsCollabRequest"("status", "createdAt" DESC);

ALTER TABLE "CsConversation" ADD CONSTRAINT "CsConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CsConversation" ADD CONSTRAINT "CsConversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CsMessage" ADD CONSTRAINT "CsMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CsConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CsTicket" ADD CONSTRAINT "CsTicket_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CsConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CsTicket" ADD CONSTRAINT "CsTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CsTicket" ADD CONSTRAINT "CsTicket_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CsCollabRequest" ADD CONSTRAINT "CsCollabRequest_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CsConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CsCollabRequest" ADD CONSTRAINT "CsCollabRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed defaults
INSERT INTO "CsQuickReply" ("id", "title", "body", "sortOrder", "enabled", "createdAt", "updatedAt")
VALUES
  ('cs-qr-welcome', '欢迎语', '您好，我是玲珑客服，很高兴为您服务，请问有什么可以帮您？', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cs-qr-template', '模板库指引', '您可以在画布左侧打开模板库，选择场景模板后一键生成效果图。如需我远程协助，可点击「发起协同」。', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cs-qr-package', '服务包说明', '基础服务包包含专属图库与人工服务窗口，详情我可以发给您服务包卡片。', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CsServicePackage" ("id", "name", "priceCents", "description", "tag", "sortOrder", "enabled", "createdAt", "updatedAt")
VALUES
  ('cs-pkg-basic', '基础服务包', 29900, '含专属供应链图库、模板库与人工服务窗口', '推荐', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cs-pkg-pro', '专业服务包', 99900, '含 IADU 协同操作额度与优先响应', '进阶', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
