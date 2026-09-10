package tools

import "fmt"

// Dispatch looks up name in the registry and calls its Handler with args.
func Dispatch(name string, args map[string]interface{}) (string, error) {
	tool, ok := Get(name)
	if !ok {
		return "", fmt.Errorf("unknown tool %q — check that it is registered in tools/builtin.go", name)
	}
	return tool.Handler(args)
}
