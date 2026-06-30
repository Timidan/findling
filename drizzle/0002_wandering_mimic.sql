-- Embedding dimension change 1536 -> 384 (local bge-small-en-v1.5).
-- Existing vectors are regenerable (mock/stale) and a pgvector column type
-- can't be altered while an index depends on it, so: clear rows, drop the HNSW
-- index, retype the column, recreate the index. Re-embed afterwards.
TRUNCATE TABLE "moment_embeddings";--> statement-breakpoint
DROP INDEX IF EXISTS "moment_embeddings_hnsw";--> statement-breakpoint
ALTER TABLE "moment_embeddings" ALTER COLUMN "embedding" SET DATA TYPE vector(384);--> statement-breakpoint
CREATE INDEX "moment_embeddings_hnsw" ON "moment_embeddings" USING hnsw ("embedding" vector_cosine_ops);