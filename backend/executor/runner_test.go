package executor

import (
	"context"
	"strings"
	"testing"
)

func TestResolveTemplate_SubstitutesKnownKeys(t *testing.T) {
	execCtx := ExecutionContext{"n1": "42", "__last__": "hi", "__input__": "q"}
	got := resolveTemplate("{{n1}} then {{__last__}} then {{__input__}}", execCtx)
	if got != "42 then hi then q" {
		t.Fatalf("got %q", got)
	}
}

func TestGetString_FallbackOnMissingOrWrongType(t *testing.T) {
	data := NodeData{"s": "x", "n": 3.0}
	if getString(data, "s", "d") != "x" {
		t.Error("existing string should win")
	}
	if getString(data, "n", "d") != "d" {
		t.Error("non-string must fall back")
	}
	if getString(data, "missing", "d") != "d" {
		t.Error("missing key must fall back")
	}
}

// JSON 反序列化进 map[string]interface{} 后数字全是 float64，
// getInt 必须同时接住 float64 和 int 两种来源。
func TestGetInt_AcceptsFloat64AndInt(t *testing.T) {
	data := NodeData{"fromJSON": 20.0, "native": 5, "missing": nil}
	if getInt(data, "fromJSON", 1) != 20 {
		t.Error("float64 (JSON path) not converted")
	}
	if getInt(data, "native", 1) != 5 {
		t.Error("native int not accepted")
	}
	if getInt(data, "missing", 1) != 1 {
		t.Error("fallback broken")
	}
}

func TestGetFloat64(t *testing.T) {
	data := NodeData{"f": 0.5, "i": 2}
	if getFloat64(data, "f", 1) != 0.5 {
		t.Error("float64 broken")
	}
	if getFloat64(data, "i", 1) != 2.0 {
		t.Error("int→float64 broken")
	}
	if getFloat64(data, "x", 0.7) != 0.7 {
		t.Error("fallback broken")
	}
}

func TestTruncate(t *testing.T) {
	if truncate("short", 500) != "short" {
		t.Error("short string must pass through")
	}
	long := strings.Repeat("a", 600)
	got := truncate(long, 500)
	if len(got) != 500+len("…") { // 截断到 500 字节 + 省略号（3 字节 UTF-8）
		t.Errorf("expected %d bytes, got %d", 500+len("…"), len(got))
	}
	if !strings.HasSuffix(got, "…") {
		t.Error("must end with ellipsis")
	}
}

func TestGetLabel(t *testing.T) {
	if getLabel(&DAGNode{Data: NodeData{"label": "计算节点"}}) != "计算节点" {
		t.Error("explicit label should win")
	}
	if getLabel(&DAGNode{Type: NodeTypeLLM, Data: NodeData{}}) != "llm" {
		t.Error("fallback to type name broken")
	}
}

// --- Execute 全链路（无 LLM）：tool → condition，事件序列与上下文传递 ---

func TestExecute_ToolConditionChain_EventSequence(t *testing.T) {
	req := DAGRequest{
		Nodes: []DAGNode{
			{ID: "calc", Type: NodeTypeTool, Data: NodeData{
				"toolName": "calculator", "staticArgs": map[string]interface{}{"expression": "6 * 7"},
			}},
			{ID: "cond", Type: NodeTypeCondition, Data: NodeData{"condition": "len == 2"}},
		},
		Edges: []DAGEdge{edge("calc", "cond")},
		UserInput: "ignored-here",
	}

	send, events := collect()
	last, err := Execute(context.Background(), req, send)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// calc 输出 "42"（2 runes）→ len == 2 为 true
	if last != "true" {
		t.Fatalf("last output should be condition result, got %q", last)
	}

	want := []string{
		"workflow_start",
		"node_start", "tool_call", "tool_result", "node_done", // calc
		"node_start", "node_done",                              // cond
		"workflow_done",
	}
	if got := eventTypes(events); !equalStrings(got, want) {
		t.Fatalf("event sequence:\n got  %v\n want %v", got, want)
	}

	// workflow_start 应携带拓扑执行序
	start := (*events)[0]
	payload := start.Payload.(map[string]interface{})
	order := payload["executionOrder"].([]string)
	if !equalStrings(order, []string{"calc", "cond"}) {
		t.Errorf("executionOrder wrong: %v", order)
	}
}

func TestExecute_CycleReturnsWorkflowError(t *testing.T) {
	req := DAGRequest{
		Nodes: []DAGNode{{ID: "a"}, {ID: "b"}},
		Edges: []DAGEdge{edge("a", "b"), edge("b", "a")},
	}
	send, events := collect()
	if _, err := Execute(context.Background(), req, send); err == nil {
		t.Fatal("cycle must fail execution")
	}
	if got := eventTypes(events); !equalStrings(got, []string{"workflow_error"}) {
		t.Fatalf("cycle should emit exactly one workflow_error, got %v", got)
	}
}

func TestExecute_NodeErrorStopsAndEmitsNodeError(t *testing.T) {
	req := DAGRequest{
		Nodes: []DAGNode{
			{ID: "bad", Type: NodeTypeTool, Data: NodeData{"toolName": "no-such-tool"}},
		},
	}
	send, events := collect()
	if _, err := Execute(context.Background(), req, send); err == nil {
		t.Fatal("unknown tool must fail")
	}
	got := eventTypes(events)
	if !equalStrings(got, []string{"workflow_start", "node_start", "tool_call", "tool_error", "node_error"}) {
		t.Fatalf("failed node event sequence wrong: %v", got)
	}
}

func TestExecute_UnknownNodeTypeRejected(t *testing.T) {
	req := DAGRequest{Nodes: []DAGNode{{ID: "x", Type: NodeType("magic")}}}
	send, _ := collect()
	if _, err := Execute(context.Background(), req, send); err == nil {
		t.Fatal("unknown node type must be rejected")
	}
}
