-- CreateEnum
CREATE TYPE "rule_phase" AS ENUM ('Derive', 'Validate', 'Route');

-- CreateTable
CREATE TABLE "rule" (
    "id" UUID NOT NULL,
    "rule_key" TEXT NOT NULL,
    "rule_set" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "phase" "rule_phase" NOT NULL DEFAULT 'Validate',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_version" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "definition_json" JSONB NOT NULL,
    "author_nl" TEXT,
    "interpreter_version" TEXT,
    "authored_by" TEXT NOT NULL DEFAULT 'system',
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_data" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,

    CONSTRAINT "reference_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_trace" (
    "id" UUID NOT NULL,
    "correlation_id" TEXT,
    "rule_key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "phase" "rule_phase" NOT NULL,
    "applied" BOOLEAN NOT NULL,
    "assert_result" BOOLEAN,
    "produced_outcome_json" JSONB,
    "conditions_json" JSONB NOT NULL,
    "facts_read_json" JSONB NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "decision_trace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rule_rule_key_key" ON "rule"("rule_key");

-- CreateIndex
CREATE INDEX "rule_version_is_active_effective_date_idx" ON "rule_version"("is_active", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "rule_version_rule_id_version_key" ON "rule_version"("rule_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "reference_data_source_key_key" ON "reference_data"("source", "key");

-- CreateIndex
CREATE INDEX "decision_trace_correlation_id_idx" ON "decision_trace"("correlation_id");

-- AddForeignKey
ALTER TABLE "rule_version" ADD CONSTRAINT "rule_version_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
