package executor

import (
	"context"
	"strings"
	"testing"
)

func collect() (SendFunc, *[]SSEEvent) {
	events := make([]SSEEvent, 0)
	return func(e SSEEvent) { events = append(events, e) }, &events
}

func eventTypes(events *[]SSEEvent) []string {
	out := make([]string, 0, len(*events))
	for _, e := range *events {
		out = append(out, e.Type)
	}
	return out
}

// --- 条件节点：len <op> N，rune 计数对中文友好 ---

func TestConditionNode_BasicOps(t *testing.T) {
	ctx := ExecutionContext{"__last__": "hello"} // 5 runes

	cases := []struct {
		cond string
		want string
	}{
		{"len > 3", "true"},
		{"len > 5", "false"},
		{"len >= 5", "true"},
		{"len < 10", "true"},
		{"len <= 4", "false"},
		{"len == 5", "true"},
		{"len >= 5 ", "true"}, // 尾部空白容忍
	}
	for _, c := range cases {
		node := &DAGNode{ID: "cond", Type: NodeTypeCondition, Data: NodeData{"condition": c.cond}}
		send, _ := collect()
		got, err := executeConditionNode(context.Background(), node, ctx, send)
		if err != nil {
			t.Fatalf("cond %q: %v", c.cond, err)
		}
		if got != c.want {
			t.Errorf("cond %q on 5-rune input: got %s want %s", c.cond, got, c.want)
		}
	}
}

// 中文按 rune 计数而非字节：\"你好世界\" 是 4 个字符、12 个 UTF-8 字节。
func TestConditionNode_ChineseRuneCount(t *testing.T) {
	ctx := ExecutionContext{"__last__": "你好世界"}

	node := &DAGNode{ID: "c", Type: NodeTypeCondition, Data: NodeData{"condition": "len == 4"}}
	send, _ := collect()
	got, err := executeConditionNode(context.Background(), node, ctx, send)
	if err != nil {
		t.Fatal(err)
	}
	if got != "true" {
		t.Fatalf("expected true for 4 Chinese runes, got %s", got)
	}
}

func TestConditionNode_RejectsInvalidExpression(t *testing.T) {
	for _, bad := range []string{"size > 3", "len > abc", "len", "> 3", "len != 3"} {
		node := &DAGNode{ID: "c", Type: NodeTypeCondition, Data: NodeData{"condition": bad}}
		send, _ := collect()
		if _, err := executeConditionNode(context.Background(), node, ctx0(), send); err == nil {
			t.Errorf("condition %q should be rejected", bad)
		}
	}
}

func ctx0() ExecutionContext { return ExecutionContext{} }

// --- 工具节点 ---

func TestToolNode_CalculatorRegression_NoSpaces(t *testing.T) {
	// 回归：LLM 联调时生成 "12*12"（无空格）被旧 Sscanf 实现拒绝（commit 18a6279 修复）
	node := &DAGNode{ID: "calc", Type: NodeTypeTool, Data: NodeData{
		"toolName":   "calculator",
		"staticArgs": map[string]interface{}{"expression": "12*12"},
	}}
	send, events := collect()
	got, err := executeToolNode(context.Background(), node, ctx0(), send)
	if err != nil {
		t.Fatalf("no-space expression must be accepted: %v", err)
	}
	if got != "144" {
		t.Fatalf("got %q want 144", got)
	}
	types := eventTypes(events)
	if !equalStrings(types, []string{"tool_call", "tool_result"}) {
		t.Fatalf("event sequence wrong: %v", types)
	}
}

func TestToolNode_TemplateArgsReferenceUpstream(t *testing.T) {
	// staticArgs 里 {{upstream}} / {{__last__}} 引用上游输出
	execCtx := ExecutionContext{"upstream": "5", "__last__": "5"}
	node := &DAGNode{ID: "calc", Type: NodeTypeTool, Data: NodeData{
		"toolName":   "calculator",
		"staticArgs": map[string]interface{}{"expression": "{{upstream}} + {{__last__}}"},
	}}
	send, _ := collect()
	got, err := executeToolNode(context.Background(), node, execCtx, send)
	if err != nil {
		t.Fatal(err)
	}
	if got != "10" {
		t.Fatalf("template resolution failed: got %q want 10", got)
	}
}

func TestToolNode_MissingToolName(t *testing.T) {
	node := &DAGNode{ID: "t", Type: NodeTypeTool, Data: NodeData{}}
	send, _ := collect()
	if _, err := executeToolNode(context.Background(), node, ctx0(), send); err == nil {
		t.Fatal("expected error for missing toolName")
	}
}

func TestToolNode_ToolErrorEmitsToolErrorEvent(t *testing.T) {
	node := &DAGNode{ID: "t", Type: NodeTypeTool, Data: NodeData{
		"toolName":   "calculator",
		"staticArgs": map[string]interface{}{"expression": "1/0"},
	}}
	send, events := collect()
	_, err := executeToolNode(context.Background(), node, ctx0(), send)
	if err == nil {
		t.Fatal("division by zero must fail")
	}
	types := eventTypes(events)
	if !equalStrings(types, []string{"tool_call", "tool_error"}) {
		t.Fatalf("event sequence wrong: %v", types)
	}
}

// --- 模板解析 ---

func TestResolveTemplateDeep_NestedStructures(t *testing.T) {
	execCtx := ExecutionContext{"upstream": "42", "__last__": "hello"}
	in := map[string]interface{}{
		"expr":  "{{upstream}} * 2",
		"nested": map[string]interface{}{
			"q":  "总结：{{__last__}}",
			"n":  7, // 非字符串原样保留
		},
		"list": []interface{}{"{{upstream}}", true, nil},
	}

	out := resolveTemplateDeep(in, execCtx).(map[string]interface{})
	if out["expr"] != "42 * 2" {
		t.Errorf("expr: %v", out["expr"])
	}
	nested := out["nested"].(map[string]interface{})
	if nested["q"] != "总结：hello" {
		t.Errorf("nested.q: %v", nested["q"])
	}
	if nested["n"] != 7 {
		t.Errorf("non-string value must pass through: %v", nested["n"])
	}
	list := out["list"].([]interface{})
	if list[0] != "42" || list[1] != true || list[2] != nil {
		t.Errorf("list: %v", list)
	}
}

func TestResolveTemplate_MissingKeyStaysLiteral(t *testing.T) {
	got := resolveTemplate("{{nonexistent}}-tail", ExecutionContext{"other": "x"})
	if got != "{{nonexistent}}-tail" {
		t.Fatalf("unknown placeholder should stay literal, got %q", got)
	}
}

// --- RAG 节点（stub 行为锁定） ---

func TestRAGNode_StubOutputContainsConfig(t *testing.T) {
	node := &DAGNode{ID: "r", Type: NodeTypeRAG, Data: NodeData{
		"knowledgeBaseId": "kb-1",
		"topK":            20,
		"rerankTopK":      5,
		"query":           "什么是 {{__last__}}",
	}}
	send, _ := collect()
	got, err := executeRAGNode(context.Background(), node, ExecutionContext{"__last__": "DAG"}, send)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"kb-1", "RAG stub", "什么是 DAG"} {
		if !strings.Contains(got, want) {
			t.Errorf("stub output missing %q: %s", want, got)
		}
	}
}

func TestRAGNode_MissingKnowledgeBase(t *testing.T) {
	node := &DAGNode{ID: "r", Type: NodeTypeRAG, Data: NodeData{}}
	send, _ := collect()
	if _, err := executeRAGNode(context.Background(), node, ctx0(), send); err == nil {
		t.Fatal("expected error for missing knowledgeBaseId")
	}
}
