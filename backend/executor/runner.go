package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"
)

// SendFunc pushes a single SSE event to the client. Implementations must
// flush after each write.
type SendFunc func(SSEEvent)

// Execute 分层调度 DAG：每轮取当前零入度的一层节点并发执行
// （sync.WaitGroup），层完成后进入下一层。并发安全三件套：
//   - safeSend 用 mutex 串行化事件写入（gin Writer 非并发安全），
//     单节点内事件顺序保持不变，跨节点按完成实时交错；
//   - 每层开始前对 execCtx 做快照传入节点——同层节点本就互不依赖，
//     快照消除 map 并发读写竞态；
//   - 任一节点失败 cancel 整层 context，未启动的同层节点直接跳过。
//
// 第一个返回值是最后完成的节点输出（同步端点作为工作流结果返回）。
func Execute(ctx context.Context, req DAGRequest, send SendFunc) (string, error) {
	layers, err := LayeredTopologicalSort(req.Nodes, req.Edges)
	if err != nil {
		send(SSEEvent{Type: "workflow_error", Payload: map[string]string{"error": err.Error()}})
		return "", err
	}

	order := make([]string, 0, len(req.Nodes))
	for _, l := range layers {
		order = append(order, l...)
	}
	send(SSEEvent{
		Type: "workflow_start",
		Payload: map[string]interface{}{
			"totalNodes":     len(req.Nodes),
			"executionOrder": order,
			"layerCount":     len(layers),
		},
	})

	execCtx := make(ExecutionContext)
	if req.UserInput != "" {
		execCtx["__input__"] = req.UserInput
	}

	var mu sync.Mutex
	safeSend := func(e SSEEvent) {
		mu.Lock()
		defer mu.Unlock()
		send(e)
	}

	wallStart := time.Now()
	var lastOutput string

	for _, layer := range layers {
		if ctx.Err() != nil {
			safeSend(SSEEvent{Type: "workflow_error", Payload: map[string]string{"error": "client disconnected"}})
			return "", ctx.Err()
		}

		// 层前快照：本层所有节点读到的是上一层完成后的稳定视图
		mu.Lock()
		snapshot := make(ExecutionContext, len(execCtx))
		for k, v := range execCtx {
			snapshot[k] = v
		}
		mu.Unlock()

		layerCtx, cancel := context.WithCancel(ctx)
		var wg sync.WaitGroup
		var layerErr error

		for _, nodeID := range layer {
			node := findNode(req.Nodes, nodeID)
			if node == nil {
				continue
			}
			wg.Add(1)
			go func(node *DAGNode, snap ExecutionContext) {
				defer wg.Done()
				// 兄弟节点已失败：未启动的节点不再执行
				if layerCtx.Err() != nil {
					return
				}

				nodeStart := time.Now()
				safeSend(SSEEvent{
					Type:   "node_start",
					NodeID: node.ID,
					Payload: map[string]string{
						"nodeType":  string(node.Type),
						"nodeLabel": getLabel(node),
					},
				})

				output, execErr := dispatchNode(layerCtx, node, snap, safeSend)
				durationMs := time.Since(nodeStart).Milliseconds()

				if execErr != nil {
					cancel()
					safeSend(SSEEvent{
						Type:   "node_error",
						NodeID: node.ID,
						Payload: map[string]interface{}{
							"error":      execErr.Error(),
							"durationMs": durationMs,
						},
					})
					mu.Lock()
					if layerErr == nil {
						layerErr = execErr
					}
					mu.Unlock()
					return
				}

				mu.Lock()
				// 输出同时挂到节点 ID 和 __last__：__last__ 供条件节点取上游、
				// LLM 节点做默认输入，模板里也可显式引用 {{__last__}}
				execCtx[node.ID] = output
				execCtx["__last__"] = output
				lastOutput = output
				mu.Unlock()

				safeSend(SSEEvent{
					Type:   "node_done",
					NodeID: node.ID,
					Payload: map[string]interface{}{
						"output":     truncate(output, 500),
						"durationMs": durationMs,
					},
				})
			}(node, snapshot)
		}
		wg.Wait()
		cancel()

		// 层后取消检查：ctx 在层执行途中到期时（工具节点不可中断），
		// 也必须以 workflow_error 收场而不是继续/完成
		if ctx.Err() != nil {
			safeSend(SSEEvent{Type: "workflow_error", Payload: map[string]string{"error": "client disconnected"}})
			return "", ctx.Err()
		}
		if layerErr != nil {
			return "", layerErr
		}
	}

	safeSend(SSEEvent{
		Type: "workflow_done",
		Payload: map[string]interface{}{
			"totalDurationMs": time.Since(wallStart).Milliseconds(),
			"nodeCount":       len(order),
		},
	})
	return lastOutput, nil
}

func dispatchNode(ctx context.Context, node *DAGNode, execCtx ExecutionContext, send SendFunc) (string, error) {
	switch node.Type {
	case NodeTypeLLM:
		return executeLLMNode(ctx, node, execCtx, send)
	case NodeTypeTool:
		return executeToolNode(ctx, node, execCtx, send)
	case NodeTypeCondition:
		return executeConditionNode(ctx, node, execCtx, send)
	case NodeTypeRAG:
		return executeRAGNode(ctx, node, execCtx, send)
	default:
		return "", fmt.Errorf("unknown node type: %q", node.Type)
	}
}

func resolveTemplate(tmpl string, execCtx ExecutionContext) string {
	result := tmpl
	for id, output := range execCtx {
		result = strings.ReplaceAll(result, "{{"+id+"}}", output)
	}
	return result
}

func findNode(nodes []DAGNode, id string) *DAGNode {
	for i := range nodes {
		if nodes[i].ID == id {
			return &nodes[i]
		}
	}
	return nil
}

func getLabel(node *DAGNode) string {
	if v, ok := node.Data["label"].(string); ok && v != "" {
		return v
	}
	return string(node.Type)
}

func getString(data NodeData, key, fallback string) string {
	if v, ok := data[key].(string); ok {
		return v
	}
	return fallback
}

func getFloat64(data NodeData, key string, fallback float64) float64 {
	switch v := data[key].(type) {
	case float64:
		return v
	case int:
		return float64(v)
	}
	return fallback
}

func getInt(data NodeData, key string, fallback int) int {
	switch v := data[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	}
	return fallback
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}

func marshalArgs(v interface{}) interface{} {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%v", v)
	}
	var out interface{}
	_ = json.Unmarshal(b, &out)
	return out
}
