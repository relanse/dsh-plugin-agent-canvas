package executor

// NodeType identifies the kind of work a node performs.
type NodeType string

const (
	NodeTypeLLM       NodeType = "llm"
	NodeTypeTool      NodeType = "tool"
	NodeTypeCondition NodeType = "condition"
	NodeTypeRAG       NodeType = "rag"
)

// NodeData is an open map so each node type can carry its own config fields.
type NodeData map[string]interface{}

type DAGNode struct {
	ID   string   `json:"id"`
	Type NodeType `json:"type"`
	Data NodeData `json:"data"`
}

type DAGEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
}

type DAGRequest struct {
	Nodes     []DAGNode `json:"nodes"`
	Edges     []DAGEdge `json:"edges"`
	UserInput string    `json:"userInput,omitempty"`
}

// SSEEvent is the wire format pushed to the client via text/event-stream.
type SSEEvent struct {
	Type    string      `json:"type"`
	NodeID  string      `json:"nodeId,omitempty"`
	Payload interface{} `json:"payload,omitempty"`
}

// ExecutionContext passes node outputs to downstream nodes, keyed by node ID.
type ExecutionContext map[string]string
