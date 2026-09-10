package executor

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/lanse/dsh-plugin-agent-canvas/tools"
)

// 测试专用慢工具：让并发效果可观测（总耗时 ≈ 单节点耗时而非 N 倍）
func init() {
	tools.Register(&tools.ToolDef{
		Name:        "test_sleep_ms",
		Description: "test-only: sleep given milliseconds",
		Parameters: map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{"ms": map[string]interface{}{"type": "number"}},
		},
		Handler: func(args map[string]interface{}) (string, error) {
			ms, _ := args["ms"].(float64)
			time.Sleep(time.Duration(ms) * time.Millisecond)
			return "slept", nil
		},
	})
}

func sleepNode(id string, ms int) DAGNode {
	return DAGNode{ID: id, Type: NodeTypeTool, Data: NodeData{
		"toolName":   "test_sleep_ms",
		"staticArgs": map[string]interface{}{"ms": float64(ms)},
	}}
}

// 同层四个慢节点：串行 ≥ 4×150ms，并发 ≈ 150ms。上限留出 Windows
// 调度余量；下限防假阳性（没真跑）。
func TestExecute_LayerNodesRunConcurrently(t *testing.T) {
	req := DAGRequest{Nodes: []DAGNode{
		sleepNode("a", 150), sleepNode("b", 150), sleepNode("c", 150), sleepNode("d", 150),
	}}
	send, _ := collect()

	start := time.Now()
	last, err := Execute(context.Background(), req, send)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if last != "slept" {
		t.Fatalf("last output %q", last)
	}
	if elapsed < 140*time.Millisecond {
		t.Fatalf("too fast to have executed: %v", elapsed)
	}
	if elapsed > 450*time.Millisecond {
		t.Fatalf("layer did not run concurrently (sequential would be 600ms): %v", elapsed)
	}
}

// 并发不改数据流语义：a 完成后 b/c 并发，d 在第三层能引用 {{b}} 与 {{c}}
func TestExecute_ConcurrentLayersPreserveDataFlow(t *testing.T) {
	req := DAGRequest{
		Nodes: []DAGNode{
			sleepNode("a", 60),
			{ID: "b", Type: NodeTypeTool, Data: NodeData{
				"toolName": "calculator", "staticArgs": map[string]interface{}{"expression": "6 * 7"},
			}},
			{ID: "c", Type: NodeTypeTool, Data: NodeData{
				"toolName": "calculator", "staticArgs": map[string]interface{}{"expression": "1 + 1"},
			}},
			{ID: "d", Type: NodeTypeTool, Data: NodeData{
				"toolName": "string_transform",
				"staticArgs": map[string]interface{}{
					"text": "b={{b}} c={{c}}", "operation": "word_count",
				},
			}},
		},
		Edges: []DAGEdge{edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")},
	}
	send, events := collect()
	last, err := Execute(context.Background(), req, send)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// "b=42 c=2" 按空白切分是 2 个词
	if last != "2" {
		t.Fatalf("cross-layer template broken: last=%q", last)
	}
	// d 的 node_done 必须晚于 b 和 c 的 node_done
	pos := map[string]int{}
	for i, e := range *events {
		if e.Type == "node_done" {
			pos[e.NodeID] = i
		}
	}
	if !(pos["b"] < pos["d"] && pos["c"] < pos["d"]) {
		t.Fatalf("layer ordering violated: %v", pos)
	}
}

// 同层一个节点失败：工作流以错误收场、不产生 workflow_done。
// 注：已开跑的同层工具节点不可中断（builtin 工具是纯函数调用，
// context 取消作用于 LLM 流式调用与未启动的节点）。
func TestExecute_LayerFailureFailsWorkflow(t *testing.T) {
	req := DAGRequest{
		Nodes: []DAGNode{
			{ID: "bad", Type: NodeTypeTool, Data: NodeData{
				"toolName": "calculator", "staticArgs": map[string]interface{}{"expression": "1/0"},
			}},
			sleepNode("slow", 80),
		},
	}
	send, events := collect()
	_, err := Execute(context.Background(), req, send)
	if err == nil {
		t.Fatal("expected workflow error")
	}
	for _, e := range *events {
		if e.Type == "workflow_done" {
			t.Fatal("failed workflow must not emit workflow_done")
		}
	}
	nodeErrors := 0
	for _, e := range *events {
		if e.Type == "node_error" {
			nodeErrors++
		}
	}
	if nodeErrors != 1 {
		t.Fatalf("expected exactly one node_error, got %d", nodeErrors)
	}
}

// 客户端断开（ctx 取消）：慢层完成后，外层循环检测到取消并以
// workflow_error 收场，不再调度下一层
func TestExecute_ClientDisconnectStopsScheduling(t *testing.T) {
	req := DAGRequest{
		Nodes: []DAGNode{
			sleepNode("l1", 60),
			sleepNode("l2", 60),
		},
		Edges: []DAGEdge{edge("l1", "l2")},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	send, events := collect()
	_, err := Execute(ctx, req, send)
	if err == nil {
		t.Fatal("expected disconnect error")
	}
	// l1（60ms < 100ms）应完成；取消发生在 l1 完成到调度 l2 之间或之后，
	// 无论如何不能出现 workflow_done
	for _, e := range *events {
		if e.Type == "workflow_done" {
			t.Fatal("disconnected workflow must not emit workflow_done")
		}
	}
	foundDisconnect := false
	for _, e := range *events {
		if e.Type == "workflow_error" {
			foundDisconnect = true
		}
	}
	if !foundDisconnect {
		t.Fatal("expected workflow_error on disconnect")
	}
}

// --- 分层排序 ---

func TestLayeredTopologicalSort_Shapes(t *testing.T) {
	// 线性链 → 三层各一
	layers, err := LayeredTopologicalSort(nodes("a", "b", "c"), []DAGEdge{edge("a", "b"), edge("b", "c")})
	if err != nil {
		t.Fatal(err)
	}
	if len(layers) != 3 || !equalStrings(layers[0], []string{"a"}) || !equalStrings(layers[2], []string{"c"}) {
		t.Fatalf("chain layers wrong: %v", layers)
	}

	// 菱形 → 中间层两个节点同层
	layers, err = LayeredTopologicalSort(
		nodes("a", "b", "c", "d"),
		[]DAGEdge{edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(layers) != 3 || !equalStrings(layers[1], []string{"b", "c"}) {
		t.Fatalf("diamond layers wrong: %v", layers)
	}

	// 环 → 报错
	if _, err = LayeredTopologicalSort(
		nodes("a", "b"),
		[]DAGEdge{edge("a", "b"), edge("b", "a")},
	); err == nil || !strings.Contains(err.Error(), "cycle") {
		t.Fatalf("cycle must error, got %v", err)
	}
}
