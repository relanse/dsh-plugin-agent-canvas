package tools

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// exprRe 容错解析 "N op N"：运算符两侧空格可有可无（LLM 常给 "12*12" 这种无空格形式）
var exprRe = regexp.MustCompile(`^\s*(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)\s*$`)

func init() {
	Register(&ToolDef{
		Name:        "web_search",
		Description: "Search the web for up-to-date information via Tavily API, returns top 5 results with title/url/snippet",
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

// tavilySearchResp 只解码工具输出需要的字段
type tavilySearchResp struct {
	Results []struct {
		Title   string `json:"title"`
		URL     string `json:"url"`
		Content string `json:"content"`
	} `json:"results"`
}

// handleWebSearch 调 Tavily Search API 返回真实搜索结果。
// 无 Key 时明确报错（LLM 读到错误可改用其他工具），不悄悄降级为 stub。
func handleWebSearch(args map[string]interface{}) (string, error) {
	query, _ := args["query"].(string)
	if query == "" {
		return "", fmt.Errorf("query is required")
	}
	apiKey := os.Getenv("TAVILY_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("TAVILY_API_KEY 未设置：web_search 需要它（可在 backend/.env 配置）")
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"query":       query,
		"max_results": 5,
	})
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.tavily.com/search", bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("build tavily request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("tavily request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 300))
		return "", fmt.Errorf("tavily API %d: %s", resp.StatusCode, string(errBody))
	}

	var out tavilySearchResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("tavily decode: %w", err)
	}
	if len(out.Results) == 0 {
		return fmt.Sprintf("no results for %q", query), nil
	}

	var sb strings.Builder
	fmt.Fprintf(&sb, "web_search %q 结果：\n", query)
	for i, r := range out.Results {
		content := []rune(r.Content)
		if len(content) > 200 {
			content = content[:200]
		}
		fmt.Fprintf(&sb, "%d. %s\n   %s\n   来源：%s\n", i+1, r.Title, string(content), r.URL)
	}
	return sb.String(), nil
}

func handleCalculator(args map[string]interface{}) (string, error) {
	expr, _ := args["expression"].(string)
	if expr == "" {
		return "", fmt.Errorf("expression is required")
	}
	m := exprRe.FindStringSubmatch(strings.TrimSpace(expr))
	if m == nil {
		return "", fmt.Errorf("unsupported expression %q: expected 'N op N' (op: + - * /), e.g. '12*12' or '3 + 4'", expr)
	}
	a, err1 := strconv.ParseFloat(m[1], 64)
	b, err2 := strconv.ParseFloat(m[3], 64)
	if err1 != nil || err2 != nil {
		return "", fmt.Errorf("invalid operands in expression %q", expr)
	}
	switch m[2] {
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
		return "", fmt.Errorf("unknown operator %q", m[2])
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
