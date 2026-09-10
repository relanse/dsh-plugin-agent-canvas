package executor

import "fmt"

// TopologicalSort returns node IDs in a valid execution order using Kahn's
// algorithm. Returns an error when the graph contains a cycle — which the
// executor treats as a hard validation failure rather than a runtime guard.
func TopologicalSort(nodes []DAGNode, edges []DAGEdge) ([]string, error) {
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

	// Seed the queue with all zero-in-degree nodes.
	queue := make([]string, 0, len(nodes))
	for id, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, id)
		}
	}

	order := make([]string, 0, len(nodes))
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		order = append(order, cur)
		for _, next := range adj[cur] {
			inDegree[next]--
			if inDegree[next] == 0 {
				queue = append(queue, next)
			}
		}
	}

	if len(order) != len(nodes) {
		return nil, fmt.Errorf("cycle detected: workflow graph is not a DAG")
	}
	return order, nil
}
