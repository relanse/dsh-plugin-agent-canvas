package tools

import "sync"

// ToolHandler receives resolved arguments and returns a string result or error.
type ToolHandler func(args map[string]interface{}) (string, error)

// ToolDef mirrors the JSON Schema shape used by Function Calling so the
// frontend can render the tool palette from the same data.
type ToolDef struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
	Handler     ToolHandler            `json:"-"`
}

var (
	mu       sync.RWMutex
	registry = map[string]*ToolDef{}
)

// Register adds or replaces a tool definition. Safe to call from init().
func Register(def *ToolDef) {
	mu.Lock()
	defer mu.Unlock()
	registry[def.Name] = def
}

// Get returns a tool definition by name.
func Get(name string) (*ToolDef, bool) {
	mu.RLock()
	defer mu.RUnlock()
	t, ok := registry[name]
	return t, ok
}

// All returns every registered tool definition as a slice.
// Handler fields are stripped so the result is safe to serialise.
func All() []*ToolDef {
	mu.RLock()
	defer mu.RUnlock()
	out := make([]*ToolDef, 0, len(registry))
	for _, t := range registry {
		out = append(out, t)
	}
	return out
}
