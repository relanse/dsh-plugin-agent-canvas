package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// SendFunc pushes a single SSE event to the client. Implementations must
// flush after each write.
type SendFunc func(SSEEvent)

// Execute runs the DAG defined by req, emitting SSE events via send as each
// node starts, produces output, or fails. Execution stops at the first node
// error; the caller is responsible for closing the SSE stream afterwards.
// The first return value is the last successful node output — the sync
// endpoint surfaces it as the workflow result.
func Execute(ctx context.Context, req DAGRequest, send SendFunc) (string, error) {
	order, err := TopologicalSort(req.Nodes, req.Edges)
	if err != nil {
		send(SSEEvent{Type: "workflow_error", Payload: map[string]string{"error": err.Error()}})
		return "", err
	}

	send(SSEEvent{
		Type: "workflow_start",
		Payload: map[string]interface{}{
			"totalNodes":     len(req.Nodes),
			"executionOrder": order,
		},
	})

	execCtx := make(ExecutionContext)
	if req.UserInput != "" {
		execCtx["__input__"] = req.UserInput
	}

	wallStart := time.Now()
	lastOutput := ""

	for _, nodeID := range order {
		node := findNode(req.Nodes, nodeID)
		if node == nil {
			continue
		}

		select {
		case <-ctx.Done():
			send(SSEEvent{Type: "workflow_error", Payload: map[string]string{"error": "client disconnected"}})
			return "", ctx.Err()
		default:
		}

		nodeStart := time.Now()
		send(SSEEvent{
			Type:   "node_start",
			NodeID: nodeID,
			Payload: map[string]string{
				"nodeType":  string(node.Type),
				"nodeLabel": getLabel(node),
			},
		})

		output, execErr := dispatchNode(ctx, node, execCtx, send)
		durationMs := time.Since(nodeStart).Milliseconds()

		if execErr != nil {
			send(SSEEvent{
				Type:   "node_error",
				NodeID: nodeID,
				Payload: map[string]interface{}{
					"error":      execErr.Error(),
					"durationMs": durationMs,
				},
			})
			return "", execErr
		}

		// 输出同时挂到节点 ID 和 __last__：后者供条件节点取上游、
		// LLM 节点做默认输入，也可在模板里显式引用 {{__last__}}
		execCtx[nodeID] = output
		execCtx["__last__"] = output
		lastOutput = output
		send(SSEEvent{
			Type:   "node_done",
			NodeID: nodeID,
			Payload: map[string]interface{}{
				"output":     truncate(output, 500),
				"durationMs": durationMs,
			},
		})
	}

	send(SSEEvent{
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
