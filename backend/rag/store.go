package rag

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pgvector/pgvector-go"
)

// Store 封装 pgvector 存储：连接池 + 模式迁移 + 召回查询。
type Store struct {
	pool *pgxpool.Pool
	dim  int

	embedOnce sync.Once
	embedder  *embedClient
	embedErr  error
}

var (
	storeOnce sync.Once
	storeInst *Store
	storeErr  error
)

// cachedStore 进程内单例（执行器热路径复用连接池）。
func cachedStore() (*Store, error) {
	storeOnce.Do(func() {
		storeInst, storeErr = Open()
	})
	return storeInst, storeErr
}

// Open 建立新连接并完成模式迁移；CLI 等短生命周期调用方直接用本函数。
// 只依赖 PG_DSN——嵌入端点在首次嵌入时才解析（错误在正确的阶段暴露：
// 库没配好报库，嵌入没配好报嵌入）。
func Open() (*Store, error) {
	dsn := os.Getenv("PG_DSN")
	if dsn == "" {
		return nil, fmt.Errorf("PG_DSN 未配置（RAG 需要 PostgreSQL + pgvector，见 backend/docker-compose.yml；可在 backend/.env 配置）")
	}

	dim := 1024 // bge-m3 默认；不同嵌入模型经 EMBEDDING_DIM 覆盖
	if v := os.Getenv("EMBEDDING_DIM"); v != "" {
		if d, err := strconv.Atoi(v); err == nil && d > 0 {
			dim = d
		}
	}

	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		return nil, fmt.Errorf("pg 连接: %w", err)
	}
	s := &Store{pool: pool, dim: dim}
	if err := s.migrate(context.Background()); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}

// embedderLazy 首次使用时解析嵌入端点配置。
func (s *Store) embedderLazy() (*embedClient, error) {
	s.embedOnce.Do(func() {
		s.embedder, s.embedErr = embedClientFromEnv()
	})
	return s.embedder, s.embedErr
}

// migrate 建扩展与表（幂等）。向量维度由配置决定——换嵌入模型需重建索引并重新灌库。
func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.pool.Exec(ctx, "CREATE EXTENSION IF NOT EXISTS vector"); err != nil {
		return fmt.Errorf("CREATE EXTENSION vector（需 postgres 镜像带 pgvector）: %w", err)
	}
	schema := fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS kb_chunks (
  id BIGSERIAL PRIMARY KEY,
  kb_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(%d),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kb_chunks_kb ON kb_chunks (kb_id);
CREATE INDEX IF NOT EXISTS kb_chunks_hnsw ON kb_chunks USING hnsw (embedding vector_cosine_ops);
`, s.dim)
	if _, err := s.pool.Exec(ctx, schema); err != nil {
		return fmt.Errorf("建表: %w", err)
	}
	return nil
}

// Ingest 嵌入并写入一个知识库的分块（单事务），返回写入条数。
func (s *Store) Ingest(ctx context.Context, kb string, contents []string) (int, error) {
	if len(contents) == 0 {
		return 0, nil
	}
	vecs, err := s.embedLazy(ctx, contents)
	if err != nil {
		return 0, fmt.Errorf("嵌入失败: %w", err)
	}
	if len(vecs[0]) != s.dim {
		return 0, fmt.Errorf("嵌入维度 %d 与表维度 %d 不符（检查 EMBEDDING_DIM，换模型需重新灌库）", len(vecs[0]), s.dim)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	for i, content := range contents {
		if _, err := tx.Exec(ctx,
			"INSERT INTO kb_chunks (kb_id, content, embedding) VALUES ($1, $2, $3)",
			kb, content, pgvector.NewVector(vecs[i]),
		); err != nil {
			return 0, fmt.Errorf("写入分块 %d: %w", i, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	return len(contents), nil
}

// Clear 清空一个知识库，返回删除条数。
func (s *Store) Clear(ctx context.Context, kb string) (int64, error) {
	tag, err := s.pool.Exec(ctx, "DELETE FROM kb_chunks WHERE kb_id = $1", kb)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// Candidate 是召回结果。
type Candidate struct {
	Content string
	Score   float64
}

// Recall 余弦相似度召回 top-k（HNSW 索引加速，<=> 为余弦距离）。
func (s *Store) Recall(ctx context.Context, kb, query string, topK int) ([]Candidate, error) {
	vecs, err := s.embedLazy(ctx, []string{query})
	if err != nil {
		return nil, fmt.Errorf("查询嵌入失败: %w", err)
	}
	if len(vecs[0]) != s.dim {
		return nil, fmt.Errorf("查询嵌入维度 %d 与表维度 %d 不符", len(vecs[0]), s.dim)
	}

	rows, err := s.pool.Query(ctx, `
SELECT content, 1 - (embedding <=> $1) AS score
FROM kb_chunks
WHERE kb_id = $2
ORDER BY embedding <=> $1
LIMIT $3`,
		pgvector.NewVector(vecs[0]), kb, topK,
	)
	if err != nil {
		return nil, fmt.Errorf("召回查询: %w", err)
	}
	defer rows.Close()

	var out []Candidate
	for rows.Next() {
		var c Candidate
		if err := rows.Scan(&c.Content, &c.Score); err != nil {
			return nil, fmt.Errorf("召回行解析: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// embedLazy 经惰性解析的嵌入端点做批量嵌入。
func (s *Store) embedLazy(ctx context.Context, texts []string) ([][]float32, error) {
	e, err := s.embedderLazy()
	if err != nil {
		return nil, err
	}
	return e.Embed(ctx, texts)
}
