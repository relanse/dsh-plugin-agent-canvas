package executor

import (
	"fmt"
	"sort"
)

// LayeredTopologicalSort 在 Kahn 算法基础上输出分层结果：同一层的节点
// 互不依赖（以当前剩余子图的零入度节点为界），可以安全并发执行；
// 层内按 id 排序保证事件流的确定性。有向环仍是硬校验错误。
func LayeredTopologicalSort(nodes []DAGNode, edges []DAGEdge) ([][]string, error) {
	inDegree := make(map[string]int, len(nodes))
	adj := make(map[string][]string, len(nodes))

	for _, n := range nodes {
		inDegree[n.ID] = 0
		adj[n.ID] = nil
	}
	for _, e := range edges {
		adj[e.Source] = append(adj[e.Source], e.Target)
		inDegree[e.Target]++
	}

	var layers [][]string
	current := make([]string, 0, len(nodes))
	for id, deg := range inDegree {
		if deg == 0 {
			current = append(current, id)
		}
	}

	sorted := 0
	for len(current) > 0 {
		sort.Strings(current)
		layers = append(layers, current)
		sorted += len(current)

		next := make([]string, 0, len(current))
		for _, id := range current {
			for _, target := range adj[id] {
				inDegree[target]--
				if inDegree[target] == 0 {
					next = append(next, target)
				}
			}
		}
		current = next
	}

	if sorted != len(nodes) {
		return nil, fmt.Errorf("cycle detected: workflow graph is not a DAG")
	}
	return layers, nil
}

// TopologicalSort returns node IDs in a valid execution order using Kahn's
// algorithm. Returns an error when the graph contains a cycle — which the
// executor treats as a hard validation failure rather than a runtime guard.
func TopologicalSort(nodes []DAGNode, edges []DAGEdge) ([]string, error) {
	layers, err := LayeredTopologicalSort(nodes, edges)
	if err != nil {
		return nil, err
	}
	total := 0
	for _, l := range layers {
		total += len(l)
	}
	order := make([]string, 0, total)
	for _, layer := range layers {
		order = append(order, layer...)
	}
	return order, nil
}
