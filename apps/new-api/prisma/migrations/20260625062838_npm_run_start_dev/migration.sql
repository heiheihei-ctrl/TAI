-- AlterTable
ALTER TABLE "api_tokens" ALTER COLUMN "scopes" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "channels" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "model_provider_mapping" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "models" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "providers" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "updated_at" DROP DEFAULT;
