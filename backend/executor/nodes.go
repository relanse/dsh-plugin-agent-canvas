package executor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	openai "github.com/sashabaranov/go-openai"

	"github.com/lanse/dsh-plugin-agent-canvas/tools"
)

// LLM 客户端在首次使用时惰性构造：main 里 godotenv.Load() 先于首个请求执行，
// 若在包 init 阶段读环境变量会拿到空值。
var (
	llmOnce  sync.Once
	llmInst  *openai.Client
	llmModel = "deepseek-chat"
)

func getLLMClient() *openai.Client {
	llmOnce.Do(func() {
		cfg := openai.DefaultConfig(os.Getenv("DEEPSEEK_API_KEY"))
		cfg.BaseURL = os.Getenv("DEEPSEEK_BASE_URL")
		if cfg.BaseURL == "" {
			// DeepSeek 兼容 OpenAI 协议，/v1 前缀与官方 SDK 约定一致
			cfg.BaseURL = "https://api.deepseek.com/v1"
		}
		// 默认模型可经环境变量对齐（工作流引擎直连公网 API，与会话模型是两条通道）
		if m := os.Getenv("DEEPSEEK_MODEL"); m != "" {
			llmModel = m
		}
		llmInst = openai.NewClientWithConfig(cfg)
	})
	return llmInst
}

// buildToolSchemas 把注册表里的 JSON Schema 转成 Function Calling 需要的形状，
// 事实来源只有一份：tools 包的注册表。
func buildToolSchemas() []openai.Tool {
	defs := tools.All()
	out := make([]openai.Tool, 0, len(defs))
	for _, def := range defs {
		out = append(out, openai.Tool{
			Type: openai.ToolTypeFunction,
			Function: &openai.FunctionDefinition{
				Name:        def.Name,
				Description: def.Description,
				Parameters:  def.Parameters,
			},
		})
	}
	return out
}

// toolCallMerger 按 Index 归并流式工具调用分片：同一个 ToolCall 的 name
// 只在首个分片出现，arguments 逐片追加，乱序到达也按 index 还原成完整对象。
type toolCallMerger struct {
	merged  map[int]openai.ToolCall
	indexes []int
}

func newToolCallMerger() *toolCallMerger {
	return &toolCallMerger{merged: make(map[int]openai.ToolCall)}
}

func (m *toolCallMerger) add(idx int, tc openai.ToolCall) {
	cur, seen := m.merged[idx]
	if !seen {
		m.indexes = append(m.indexes, idx)
		cur = openai.ToolCall{Type: openai.ToolTypeFunction}
	}
	if tc.ID != "" {
		cur.ID = tc.ID
	}
	if tc.Function.Name != "" {
		cur.Function.Name = tc.Function.Name
	}
	cur.Function.Arguments += tc.Function.Arguments
	m.merged[idx] = cur
}

// result 返回按 index 升序排列的完整工具调用列表。
func (m *toolCallMerger) result() []openai.ToolCall {
	sort.Ints(m.indexes)
	out := make([]openai.ToolCall, 0, len(m.indexes))
	for _, i := range m.indexes {
		out = append(out, m.merged[i])
	}
	return out
}

// streamChat 流式调用一次 LLM：文本 delta 即时推 llm_chunk 事件；
// 工具调用 delta 交给 toolCallMerger 按 Index 归并。
func streamChat(
	ctx context.Context,
	req openai.ChatCompletionRequest,
	nodeID string,
	send SendFunc,
) (string, []openai.ToolCall, error) {
	stream, err := getLLMClient().CreateChatCompletionStream(ctx, req)
	if err != nil {
		return "", nil, fmt.Errorf("create chat stream: %w", err)
	}
	defer stream.Close()

	var content strings.Builder
	merger := newToolCallMerger()

	for {
		resp, err := stream.Recv()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return "", nil, fmt.Errorf("stream recv: %w", err)
		}
		if len(resp.Choices) == 0 {
			continue
		}
		delta := resp.Choices[0].Delta

		if delta.Content != "" {
			content.WriteString(delta.Content)
			send(SSEEvent{
				Type:   "llm_chunk",
				NodeID: nodeID,
				Payload: map[string]string{
					"text": delta.Content,
				},
			})
		}

		for _, tc := range delta.ToolCalls {
			idx := 0
			if tc.Index != nil {
				idx = *tc.Index
			}
			merger.add(idx, tc)
		}
	}

	return content.String(), merger.result(), nil
}

// executeLLMNode 是 Agent Loop 的核心：
// 每轮流式调用 LLM，返回工具调用就执行工具并把结果以 tool 角色追回 messages
// 让模型基于真实结果继续规划；自然停止（无工具调用）则返回本轮文本。
// maxSteps 是运行时熔断，距上限 3 步先推 step_limit_warning 预警。
func executeLLMNode(ctx context.Context, node *DAGNode, execCtx ExecutionContext, send SendFunc) (string, error) {
	if os.Getenv("DEEPSEEK_API_KEY") == "" {
		return "", fmt.Errorf("DEEPSEEK_API_KEY 未设置：LLM 节点需要它调用 DeepSeek API（可在 backend/.env 配置）")
	}

	systemPrompt := resolveTemplate(getString(node.Data, "systemPrompt", ""), execCtx)
	userPrompt := resolveTemplate(getString(node.Data, "userPrompt", ""), execCtx)
	if userPrompt == "" {
		userPrompt = execCtx["__last__"]
	}
	if userPrompt == "" {
		userPrompt = execCtx["__input__"]
	}

	if systemPrompt == "" && userPrompt == "" {
		return "", fmt.Errorf("LLM 节点 %q 缺少输入：请配置 systemPrompt 或提供上游输入", node.ID)
	}

	model := getString(node.Data, "model", llmModel)
	maxSteps := getInt(node.Data, "maxSteps", 20)
	temperature := float32(getFloat64(node.Data, "temperature", 0.7))

	messages := make([]openai.ChatCompletionMessage, 0, 2)
	if systemPrompt != "" {
		messages = append(messages, openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleSystem,
			Content: systemPrompt,
		})
	}
	if userPrompt != "" {
		messages = append(messages, openai.ChatCompletionMessage{
			Role:    openai.ChatMessageRoleUser,
			Content: userPrompt,
		})
	}

	toolSchemas := buildToolSchemas()
	callSeq := 0

	for step := 0; step < maxSteps; step++ {
		if maxSteps-step == 3 {
			send(SSEEvent{
				Type:   "step_limit_warning",
				NodeID: node.ID,
				Payload: map[string]interface{}{
					"currentStep": step + 1,
					"maxSteps":    maxSteps,
				},
			})
		}

		content, toolCalls, err := streamChat(ctx, openai.ChatCompletionRequest{
			Model:       model,
			Messages:    messages,
			Tools:       toolSchemas,
			Temperature: temperature,
		}, node.ID, send)
		if err != nil {
			return "", err
		}

		if len(toolCalls) == 0 {
			// FinishReason == stop：自然结束
			return content, nil
		}

		messages = append(messages, openai.ChatCompletionMessage{
			Role:      openai.ChatMessageRoleAssistant,
			Content:   content,
			ToolCalls: toolCalls,
		})

		for _, tc := range toolCalls {
			callSeq++
			callID := fmt.Sprintf("call-%s-%d", node.ID, callSeq)

			var args map[string]interface{}
			if err := json.Unmarshal([]byte(tc.Function.Arguments), &args); err != nil {
				args = map[string]interface{}{"_raw": tc.Function.Arguments}
			}

			send(SSEEvent{
				Type:   "tool_call",
				NodeID: node.ID,
				Payload: map[string]interface{}{
					"callId":   callID,
					"toolName": tc.Function.Name,
					"args":     args,
				},
			})

			start := time.Now()
			result, derr := tools.Dispatch(tc.Function.Name, args)
			durationMs := time.Since(start).Milliseconds()

			if derr != nil {
				send(SSEEvent{
					Type:   "tool_error",
					NodeID: node.ID,
					Payload: map[string]interface{}{
						"callId":     callID,
						"toolName":   tc.Function.Name,
						"error":      derr.Error(),
						"retryCount": step,
					},
				})
				// 错误上下文以 tool 角色追回 messages，让 LLM 重新规划而非终止节点
				messages = append(messages, openai.ChatCompletionMessage{
					Role:       openai.ChatMessageRoleTool,
					ToolCallID: tc.ID,
					Content:    "tool error: " + derr.Error(),
				})
				continue
			}

			send(SSEEvent{
				Type:   "tool_result",
				NodeID: node.ID,
				Payload: map[string]interface{}{
					"callId":     callID,
					"toolName":   tc.Function.Name,
					"result":     result,
					"durationMs": durationMs,
				},
			})
			messages = append(messages, openai.ChatCompletionMessage{
				Role:       openai.ChatMessageRoleTool,
				ToolCallID: tc.ID,
				Content:    result,
			})
		}
	}

	return "", fmt.Errorf("超出最大步数（%d 步），可能存在工具链死循环", maxSteps)
}

// executeToolNode 直接调用注册表中的工具，参数值支持 {{nodeId}} / {{__input__}} 模板。
// 与 LLM 节点不同：无模型参与，确定性执行，失败即节点失败。
func executeToolNode(ctx context.Context, node *DAGNode, execCtx ExecutionContext, send SendFunc) (string, error) {
	name := getString(node.Data, "toolName", "")
	if name == "" {
		return "", fmt.Errorf("工具节点 %q 未配置 toolName", node.ID)
	}

	rawArgs, _ := node.Data["staticArgs"].(map[string]interface{})
	args, _ := resolveTemplateDeep(rawArgs, execCtx).(map[string]interface{})
	if args == nil {
		args = map[string]interface{}{}
	}

	callID := fmt.Sprintf("call-%s", node.ID)
	send(SSEEvent{
		Type:   "tool_call",
		NodeID: node.ID,
		Payload: map[string]interface{}{
			"callId":   callID,
			"toolName": name,
			"args":     args,
		},
	})

	start := time.Now()
	result, err := tools.Dispatch(name, args)
	durationMs := time.Since(start).Milliseconds()

	if err != nil {
		send(SSEEvent{
			Type:   "tool_error",
			NodeID: node.ID,
			Payload: map[string]interface{}{
				"callId":     callID,
				"toolName":   name,
				"error":      err.Error(),
				"retryCount": 0,
			},
		})
		return "", err
	}

	send(SSEEvent{
		Type:   "tool_result",
		NodeID: node.ID,
		Payload: map[string]interface{}{
			"callId":     callID,
			"toolName":   name,
			"result":     result,
			"durationMs": durationMs,
		},
	})
	return result, nil
}

var conditionRe = regexp.MustCompile(`^len\s*(>=|<=|==|>|<)\s*(-?\d+)$`)

// executeConditionNode 评估最小条件 DSL：`len <op> N`，统计对象是最近一个
// 上游输出的字符数（rune 计数，对中文友好）。输出 "true"/"false"。
// 已知限制：执行器按拓扑序线性执行，尚未根据分支跳过下游节点（生产化路径见文档）。
func executeConditionNode(ctx context.Context, node *DAGNode, execCtx ExecutionContext, send SendFunc) (string, error) {
	cond := strings.TrimSpace(getString(node.Data, "condition", "len > 100"))
	m := conditionRe.FindStringSubmatch(cond)
	if m == nil {
		return "", fmt.Errorf("不支持的条件表达式 %q：目前仅支持 'len <op> N'（op: > >= < <= ==）", cond)
	}

	subject := execCtx["__last__"]
	limit, err := strconv.Atoi(m[2])
	if err != nil {
		return "", fmt.Errorf("条件阈值无效: %q", m[2])
	}

	length := utf8.RuneCountInString(subject)
	var ok bool
	switch m[1] {
	case ">":
		ok = length > limit
	case ">=":
		ok = length >= limit
	case "<":
		ok = length < limit
	case "<=":
		ok = length <= limit
	case "==":
		ok = length == limit
	}

	if ok {
		return "true", nil
	}
	return "false", nil
}

// executeRAGNode 是占位实现：生产化路径为 pgvector 向量召回 + 重排模型两阶段检索。
func executeRAGNode(ctx context.Context, node *DAGNode, execCtx ExecutionContext, send SendFunc) (string, error) {
	kb := getString(node.Data, "knowledgeBaseId", "")
	if kb == "" {
		return "", fmt.Errorf("RAG 节点 %q 未配置 knowledgeBaseId", node.ID)
	}
	topK := getInt(node.Data, "topK", 20)
	rerankTopK := getInt(node.Data, "rerankTopK", 5)

	query := resolveTemplate(getString(node.Data, "query", ""), execCtx)
	if query == "" {
		query = execCtx["__last__"]
	}

	return fmt.Sprintf(
		"[RAG stub] knowledgeBase=%s topK=%d rerankTopK=%d query=%q — 召回与重排待接入 pgvector（当前返回占位结果）",
		kb, topK, rerankTopK, query,
	), nil
}

// resolveTemplateDeep 对嵌套的 map / slice / string 递归做 {{nodeId}} 模板替换，
// 供工具节点的 staticArgs 使用。
func resolveTemplateDeep(v interface{}, execCtx ExecutionContext) interface{} {
	switch t := v.(type) {
	case string:
		return resolveTemplate(t, execCtx)
	case map[string]interface{}:
		for k, val := range t {
			t[k] = resolveTemplateDeep(val, execCtx)
		}
		return t
	case []interface{}:
		for i, val := range t {
			t[i] = resolveTemplateDeep(val, execCtx)
		}
		return t
	default:
		return v
	}
}
