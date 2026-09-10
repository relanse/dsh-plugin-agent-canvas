package rag

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"

	openai "github.com/sashabaranov/go-openai"
)

// rerankLLM 用 DeepSeek（复用 DEEPSEEK_API_KEY）做 listwise 重排：
// 把召回候选整体给模型，让它按与 query 的相关度选出前 N 条。
// 重排失败时回退召回序——召回结果本身可用，不让排序层阻塞检索。
func rerankLLM(ctx context.Context, query string, cands []Candidate, topN int) []Candidate {
	if len(cands) <= topN || len(cands) <= 1 {
		return cands
	}
	key := os.Getenv("DEEPSEEK_API_KEY")
	if key == "" {
		return cands[:topN]
	}

	cfg := openai.DefaultConfig(key)
	cfg.BaseURL = os.Getenv("DEEPSEEK_BASE_URL")
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.deepseek.com/v1"
	}
	client := openai.NewClientWithConfig(cfg)

	var sb strings.Builder
	fmt.Fprintf(&sb, "查询：%s\n\n候选段落（编号: 内容）：\n", query)
	for i, c := range cands {
		content := []rune(c.Content)
		if len(content) > 300 {
			content = content[:300]
		}
		fmt.Fprintf(&sb, "%d: %s\n", i+1, string(content))
	}
	sb.WriteString(fmt.Sprintf("\n从上述候选中选出与查询最相关的 %d 条。只输出 JSON 数组，元素为候选编号（整数），按相关度降序，例如 [3,1,5]。", topN))

	resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model:       llmModelName(),
		Temperature: 0,
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleUser, Content: sb.String()},
		},
	})
	if err != nil || len(resp.Choices) == 0 {
		return cands[:topN]
	}

	content := strings.TrimSpace(resp.Choices[0].Message.Content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	var idx []int
	if err := json.Unmarshal([]byte(content), &idx); err != nil {
		return cands[:topN]
	}

	out := make([]Candidate, 0, topN)
	seen := map[int]bool{}
	for _, i := range idx {
		if i >= 1 && i <= len(cands) && !seen[i] {
			out = append(out, cands[i-1])
			seen[i] = true
		}
		if len(out) == topN {
			break
		}
	}
	// 模型给的数量不足时用召回序补齐
	for i := range cands {
		if len(out) >= topN {
			break
		}
		if !seen[i+1] {
			out = append(out, cands[i])
			seen[i+1] = true
		}
	}
	return out
}

func llmModelName() string {
	if m := os.Getenv("DEEPSEEK_MODEL"); m != "" {
		return m
	}
	return "deepseek-chat"
}

// QueryInput 是 RAG 节点的检索参数。
type QueryInput struct {
	KB         string
	Query      string
	TopK       int // 召回条数
	RerankTopK int // 重排后保留条数（<=TopK；0 表示不重排）
}

// Query 召回-重排两阶段检索的对外入口，返回拼装好的上下文段落。
func Query(ctx context.Context, in QueryInput) (string, error) {
	s, err := cachedStore()
	if err != nil {
		return "", err
	}
	if in.TopK <= 0 {
		in.TopK = 20
	}
	cands, err := s.Recall(ctx, in.KB, in.Query, in.TopK)
	if err != nil {
		return "", err
	}
	if len(cands) == 0 {
		return fmt.Sprintf("[RAG] 知识库 %q 中没有召回任何段落（库为空或 kb_id 不符）", in.KB), nil
	}

	if in.RerankTopK > 0 && in.RerankTopK < len(cands) {
		cands = rerankLLM(ctx, in.Query, cands, in.RerankTopK)
	} else {
		sort.SliceStable(cands, func(i, j int) bool { return cands[i].Score > cands[j].Score })
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "[RAG] 知识库 %q 召回 %d 段（query=%q）：\n\n", in.KB, len(cands), in.Query)
	for i, c := range cands {
		fmt.Fprintf(&sb, "【段落 %d｜相似度 %.3f】\n%s\n\n", i+1, c.Score, c.Content)
	}
	return sb.String(), nil
}
