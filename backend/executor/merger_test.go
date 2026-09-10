package executor

import (
	"encoding/json"
	"testing"

	openai "github.com/sashabaranov/go-openai"
)

func chunk(idx int, id, name, args string) openai.ToolCall {
	tc := openai.ToolCall{
		ID: id,
		Function: openai.FunctionCall{Name: name, Arguments: args},
	}
	i := idx
	tc.Index = &i
	return tc
}

// 真实流式分片形状：name 和 ID 只在首片出现，后续分片只带 arguments 增量。
func TestToolCallMerger_NameOnceArgsAppend(t *testing.T) {
	m := newToolCallMerger()
	m.add(0, chunk(0, "call-1", "calculator", `{"expr`))
	m.add(0, chunk(0, "", "", `ession":"12*12"}`))

	got := m.result()
	if len(got) != 1 {
		t.Fatalf("expected 1 merged call, got %d", len(got))
	}
	if got[0].ID != "call-1" || got[0].Function.Name != "calculator" {
		t.Fatalf("id/name lost: %+v", got[0])
	}
	var args map[string]interface{}
	if err := json.Unmarshal([]byte(got[0].Function.Arguments), &args); err != nil {
		t.Fatalf("merged arguments not valid JSON: %q (%v)", got[0].Function.Arguments, err)
	}
	if args["expression"] != "12*12" {
		t.Fatalf("arguments wrong: %v", args)
	}
}

// 并行工具调用：多个 index 交错、乱序到达，结果必须按 index 升序完整还原。
func TestToolCallMerger_InterleavedOutOfOrder(t *testing.T) {
	m := newToolCallMerger()
	// 先到 index 1 的首片，再到 index 0 的首片（乱序）
	m.add(1, chunk(1, "call-b", "word_count", `{"text":"`))
	m.add(0, chunk(0, "call-a", "calculator", `{"expr`))
	// 增量交错
	m.add(1, chunk(1, "", "", `你好世界"}`))
	m.add(0, chunk(0, "", "", `ession":"1+1"}`))

	got := m.result()
	if len(got) != 2 {
		t.Fatalf("expected 2 merged calls, got %d", len(got))
	}
	if got[0].Function.Name != "calculator" || got[1].Function.Name != "word_count" {
		t.Fatalf("index order broken: [%s, %s]", got[0].Function.Name, got[1].Function.Name)
	}
	for _, tc := range got {
		if json.Valid([]byte(tc.Function.Arguments)) == false {
			t.Errorf("arguments of %s invalid: %q", tc.Function.Name, tc.Function.Arguments)
		}
	}
}

func TestToolCallMerger_IDInLaterChunk(t *testing.T) {
	m := newToolCallMerger()
	m.add(0, chunk(0, "", "calculator", `{"expression":`))
	m.add(0, chunk(0, "call-late", "", ` "3+4"}`))

	got := m.result()
	if got[0].ID != "call-late" {
		t.Fatalf("ID arriving in later chunk must be captured, got %q", got[0].ID)
	}
}

func TestToolCallMerger_Empty(t *testing.T) {
	if got := newToolCallMerger().result(); len(got) != 0 {
		t.Fatalf("empty merger must return empty slice, got %v", got)
	}
}
