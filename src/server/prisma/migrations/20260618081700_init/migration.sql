-- CreateTable
CREATE TABLE "health_ping" (
    "id" UUID NOT NULL,
    "note" TEXT NOT NULL DEFAULT 'ok',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_ping_pkey" PRIMARY KEY ("id")
);
