// Package rag 提供 RAG 节点的召回-重排两阶段检索：
// 嵌入（OpenAI 兼容 /embeddings）→ pgvector HNSW 余弦召回 → DeepSeek listwise 重排。
package rag

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// embedClient 对接任意 OpenAI 兼容 /embeddings 端点
// （SiliconFlow bge-m3 / OpenAI text-embedding-3 / 智谱 / Ollama 兼容层均可）。
type embedClient struct {
	baseURL string // 形如 https://api.siliconflow.cn/v1（不带 /embeddings）
	apiKey  string
	model   string
	client  *http.Client
}

func embedClientFromEnv() (*embedClient, error) {
	base := os.Getenv("EMBEDDING_BASE_URL")
	key := os.Getenv("EMBEDDING_API_KEY")
	model := os.Getenv("EMBEDDING_MODEL")
	if base == "" || model == "" {
		return nil, fmt.Errorf("EMBEDDING_BASE_URL / EMBEDDING_MODEL 未配置（RAG 需要，可在 backend/.env 配置；嵌入端点须兼容 OpenAI /embeddings 协议，如 SiliconFlow 的 BAAI/bge-m3）")
	}
	return &embedClient{
		baseURL: base,
		apiKey:  key,
		model:   model,
		client:  &http.Client{Timeout: 30 * time.Second},
	}, nil
}

// Embed 批量嵌入；返回向量维度以调用方为准（建表/查询需要一致）。
func (c *embedClient) Embed(ctx context.Context, texts []string) ([][]float32, error) {
	payload, _ := json.Marshal(map[string]interface{}{
		"model": c.model,
		"input": texts,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/embeddings", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("build embeddings request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embeddings request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return nil, fmt.Errorf("embeddings API %d: %s", resp.StatusCode, string(errBody))
	}

	var out struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("embeddings decode: %w", err)
	}
	if len(out.Data) != len(texts) {
		return nil, fmt.Errorf("embeddings 返回数量不符：请求 %d 实回 %d", len(texts), len(out.Data))
	}
	vecs := make([][]float32, len(out.Data))
	for i, d := range out.Data {
		vecs[i] = d.Embedding
	}
	return vecs, nil
}
