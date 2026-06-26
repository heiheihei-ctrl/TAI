CREATE TYPE "TokenStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "ProviderStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "ChannelStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "ModelStatus" AS ENUM ('active', 'disabled');
CREATE TYPE "TaskType" AS ENUM ('video', 'image', 'chat', 'audio', 'other');
CREATE TYPE "ProtocolType" AS ENUM ('task', 'sync', 'stream');
CREATE TYPE "TaskStatus" AS ENUM ('queued', 'processing', 'succeeded', 'failed');

CREATE TABLE "api_tokens" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE,
  "status" "TokenStatus" NOT NULL DEFAULT 'active',
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "last_used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "providers" (
  "id" TEXT PRIMARY KEY,
  "provider_key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" "ProviderStatus" NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "channels" (
  "id" TEXT PRIMARY KEY,
  "provider_id" TEXT NOT NULL,
  "channel_key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "status" "ChannelStatus" NOT NULL DEFAULT 'active',
  "base_url" TEXT,
  "credential_type" TEXT NOT NULL,
  "credentials_encrypted" TEXT,
  "credentials_json" JSONB,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "rate_limit_qps" INTEGER,
  "timeout_ms" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "channels_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "models" (
  "id" TEXT PRIMARY KEY,
  "model_key" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "task_type" "TaskType" NOT NULL,
  "protocol_type" "ProtocolType" NOT NULL,
  "status" "ModelStatus" NOT NULL DEFAULT 'active',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "model_provider_mapping" (
  "id" TEXT PRIMARY KEY,
  "model_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "channel_id" TEXT NOT NULL,
  "route_key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "fallback_order" INTEGER,
  "config_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "model_provider_mapping_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "model_provider_mapping_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "model_provider_mapping_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "tasks" (
  "id" TEXT PRIMARY KEY,
  "internal_task_id" TEXT NOT NULL UNIQUE,
  "task_type" "TaskType" NOT NULL,
  "model_key" TEXT NOT NULL,
  "provider_key" TEXT,
  "channel_key" TEXT,
  "upstream_task_id" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'queued',
  "upstream_status" TEXT,
  "request_payload_json" JSONB NOT NULL,
  "normalized_response_json" JSONB,
  "upstream_response_json" JSONB,
  "error_message" TEXT,
  "callback_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3)
);

CREATE TABLE "request_logs" (
  "id" TEXT PRIMARY KEY,
  "request_id" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "model_key" TEXT,
  "provider_key" TEXT,
  "channel_key" TEXT,
  "status_code" INTEGER NOT NULL,
  "latency_ms" INTEGER NOT NULL,
  "success" BOOLEAN NOT NULL,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "channel_health_logs" (
  "id" TEXT PRIMARY KEY,
  "provider_key" TEXT NOT NULL,
  "channel_key" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "detail_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "channels_provider_id_idx" ON "channels"("provider_id");
CREATE INDEX "model_provider_mapping_model_id_enabled_priority_idx" ON "model_provider_mapping"("model_id", "enabled", "priority");
CREATE INDEX "tasks_model_key_status_idx" ON "tasks"("model_key", "status");
CREATE INDEX "request_logs_request_id_idx" ON "request_logs"("request_id");
CREATE INDEX "request_logs_created_at_idx" ON "request_logs"("created_at");
CREATE INDEX "channel_health_logs_provider_key_channel_key_created_at_idx" ON "channel_health_logs"("provider_key", "channel_key", "created_at");
