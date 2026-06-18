-- CreateEnum
CREATE TYPE "registry_status" AS ENUM ('Active', 'Deprecated');

-- CreateEnum
CREATE TYPE "field_data_type" AS ENUM ('String', 'Number', 'Date', 'Boolean', 'Collection');

-- CreateTable
CREATE TABLE "registry_entity" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "status" "registry_status" NOT NULL DEFAULT 'Active',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),

    CONSTRAINT "registry_entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registry_field" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "data_type" "field_data_type" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "allowed_values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "status" "registry_status" NOT NULL DEFAULT 'Active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registry_field_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registry_entity_key_key" ON "registry_entity"("key");

-- CreateIndex
CREATE UNIQUE INDEX "registry_field_entity_id_name_key" ON "registry_field"("entity_id", "name");

-- AddForeignKey
ALTER TABLE "registry_field" ADD CONSTRAINT "registry_field_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "registry_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
