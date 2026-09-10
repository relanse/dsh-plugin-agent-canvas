package tools

import (
	"fmt"
	"strconv"
	"strings"
)

func init() {
	Register(&ToolDef{
		Name:        "web_search",
		Description: "Search the web for up-to-date information",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"query": map[string]interface{}{
					"type":        "string",
					"description": "The search query",
				},
			},
			"required": []string{"query"},
		},
		Handler: handleWebSearch,
	})

	Register(&ToolDef{
		Name:        "calculator",
		Description: "Evaluate a simple arithmetic expression, e.g. '3 + 4' or '10 / 2.5'",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"expression": map[string]interface{}{
					"type":        "string",
					"description": "Arithmetic expression: 'A op B' where op is +, -, *, or /",
				},
			},
			"required": []string{"expression"},
		},
		Handler: handleCalculator,
	})

	Register(&ToolDef{
		Name:        "string_transform",
		Description: "Transform a string: uppercase, lowercase, reverse, or word_count",
		Parameters: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"text":      map[string]interface{}{"type": "string"},
				"operation": map[string]interface{}{"type": "string", "enum": []string{"uppercase", "lowercase", "reverse", "word_count"}},
			},
			"required": []string{"text", "operation"},
		},
		Handler: handleStringTransform,
	})
}

func handleWebSearch(args map[string]interface{}) (string, error) {
	query, _ := args["query"].(string)
	if query == "" {
		return "", fmt.Errorf("query is required")
	}
	// Stub: replace with a real search API (Tavily, SerpAPI, Brave).
	return fmt.Sprintf("[web_search stub] Results for %q:\n1. Example result A\n2. Example result B\n\nReplace handleWebSearch in tools/builtin.go with a real API call.", query), nil
}

func handleCalculator(args map[string]interface{}) (string, error) {
	expr, _ := args["expression"].(string)
	if expr == "" {
		return "", fmt.Errorf("expression is required")
	}
	var a, b float64
	var op string
	n, err := fmt.Sscanf(strings.TrimSpace(expr), "%f %s %f", &a, &op, &b)
	if err != nil || n != 3 {
		return "", fmt.Errorf("unsupported expression %q: expected 'N op N' (e.g. '3 + 4')", expr)
	}
	switch op {
	case "+":
		return strconv.FormatFloat(a+b, 'f', -1, 64), nil
	case "-":
		return strconv.FormatFloat(a-b, 'f', -1, 64), nil
	case "*":
		return strconv.FormatFloat(a*b, 'f', -1, 64), nil
	case "/":
		if b == 0 {
			return "", fmt.Errorf("division by zero")
		}
		return strconv.FormatFloat(a/b, 'f', -1, 64), nil
	default:
		return "", fmt.Errorf("unknown operator %q", op)
	}
}

func handleStringTransform(args map[string]interface{}) (string, error) {
	text, _ := args["text"].(string)
	op, _ := args["operation"].(string)
	switch op {
	case "uppercase":
		return strings.ToUpper(text), nil
	case "lowercase":
		return strings.ToLower(text), nil
	case "reverse":
		runes := []rune(text)
		for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
			runes[i], runes[j] = runes[j], runes[i]
		}
		return string(runes), nil
	case "word_count":
		return fmt.Sprintf("%d", len(strings.Fields(text))), nil
	default:
		return "", fmt.Errorf("unknown operation %q", op)
	}
}
