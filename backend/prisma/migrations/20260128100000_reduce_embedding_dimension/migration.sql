-- Reduce embedding dimension from 1024 to 512
-- CLAP model outputs 512-dim embeddings, we were padding with zeros

-- Drop and recreate with correct dimension (pgvector can't alter dimension in place)
DROP TABLE IF EXISTS "track_embeddings";

CREATE TABLE "track_embeddings" (
    "track_id" TEXT NOT NULL,
    "embedding" vector(512) NOT NULL,
    "model_version" VARCHAR(50) NOT NULL DEFAULT 'laion-clap-music',
    "analyzed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_embeddings_pkey" PRIMARY KEY ("track_id")
);

-- Recreate foreign key
ALTER TABLE "track_embeddings" ADD CONSTRAINT "track_embeddings_track_id_fkey"
    FOREIGN KEY ("track_id") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Recreate indexes
CREATE INDEX "track_embeddings_model_version_idx" ON "track_embeddings"("model_version");

-- IVFFlat index for approximate nearest neighbor search (512-dim version)
CREATE INDEX "track_embeddings_embedding_idx" ON "track_embeddings"
    USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 224);
