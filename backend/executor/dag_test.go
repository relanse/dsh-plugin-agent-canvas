package executor

import (
	"testing"
)

func nodes(ids ...string) []DAGNode {
	out := make([]DAGNode, 0, len(ids))
	for _, id := range ids {
		out = append(out, DAGNode{ID: id, Type: NodeTypeTool})
	}
	return out
}

func edge(source, target string) DAGEdge {
	return DAGEdge{Source: source, Target: target}
}

// validOrder 校验拓扑序合法性：每条边的 source 必须排在 target 前面。
func validOrder(order []string, edges []DAGEdge) bool {
	pos := make(map[string]int, len(order))
	for i, id := range order {
		pos[id] = i
	}
	for _, e := range edges {
		if pos[e.Source] >= pos[e.Target] {
			return false
		}
	}
	return true
}

func TestTopologicalSort_LinearChain(t *testing.T) {
	ns := nodes("a", "b", "c")
	es := []DAGEdge{edge("a", "b"), edge("b", "c")}

	order, err := TopologicalSort(ns, es)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := []string{"a", "b", "c"}; !equalStrings(order, want) {
		t.Fatalf("linear chain has unique order, got %v want %v", order, want)
	}
}

func TestTopologicalSort_Diamond(t *testing.T) {
	ns := nodes("a", "b", "c", "d")
	es := []DAGEdge{edge("a", "b"), edge("a", "c"), edge("b", "d"), edge("c", "d")}

	order, err := TopologicalSort(ns, es)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !validOrder(order, es) {
		t.Fatalf("order %v violates edges %v", order, es)
	}
	if order[0] != "a" || order[3] != "d" {
		t.Fatalf("diamond endpoints wrong: %v", order)
	}
}

func TestTopologicalSort_CycleDetected(t *testing.T) {
	ns := nodes("a", "b", "c")
	es := []DAGEdge{edge("a", "b"), edge("b", "c"), edge("c", "a")}

	_, err := TopologicalSort(ns, es)
	if err == nil {
		t.Fatal("expected cycle error, got nil")
	}
}

func TestTopologicalSort_SelfLoop(t *testing.T) {
	ns := nodes("a")
	_, err := TopologicalSort(ns, []DAGEdge{edge("a", "a")})
	if err == nil {
		t.Fatal("self-loop must be detected as a cycle")
	}
}

func TestTopologicalSort_DisconnectedComponents(t *testing.T) {
	ns := nodes("a", "b", "x", "y")
	es := []DAGEdge{edge("a", "b"), edge("x", "y")}

	order, err := TopologicalSort(ns, es)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !validOrder(order, es) {
		t.Fatalf("order %v violates edges %v", order, es)
	}
	if len(order) != 4 {
		t.Fatalf("expected all 4 nodes ordered, got %v", order)
	}
}

func TestTopologicalSort_EmptyGraph(t *testing.T) {
	order, err := TopologicalSort(nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(order) != 0 {
		t.Fatalf("expected empty order, got %v", order)
	}
}

func TestTopologicalSort_IsolatedNode(t *testing.T) {
	ns := nodes("solo")
	order, err := TopologicalSort(ns, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !equalStrings(order, []string{"solo"}) {
		t.Fatalf("got %v", order)
	}
}

// 环必须被静态拦截：即使环藏在长链尾部，也不能静默丢节点——
// 这是对「len(order) != len(nodes)」防御分支的直接覆盖。
func TestTopologicalSort_TailCycleNotSilentlyDropped(t *testing.T) {
	ns := nodes("a", "b", "x", "y")
	es := []DAGEdge{edge("a", "b"), edge("x", "y"), edge("y", "x")}

	_, err := TopologicalSort(ns, es)
	if err == nil {
		t.Fatal("partial cycle must fail the whole sort, not return a partial order")
	}
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
