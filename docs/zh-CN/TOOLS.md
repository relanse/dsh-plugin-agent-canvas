# 添加自定义工具

[English](../TOOLS.md) | 简体中文

一个工具就是一个带标准 JSON Schema 描述的 Go 函数。注册一次，LLM 立即可调用它，前端节点面板也会自动出现它。

---

## 1. 在 `backend/tools/builtin.go` 中定义工具

```go
func init() {
    tools.Register(&tools.ToolDef{
        Name:        "get_weather",
        Description: "查询指定城市的当前天气",
        Parameters: map[string]interface{}{
            "type": "object",
            "properties": map[string]interface{}{
                "city": map[string]interface{}{
                    "type":        "string",
                    "description": "城市名，例如 'Shanghai'",
                },
                "unit": map[string]interface{}{
                    "type": "string",
                    "enum": []string{"celsius", "fahrenheit"},
                },
            },
            "required": []string{"city"},
        },
        Handler: handleGetWeather,
    })
}

func handleGetWeather(args map[string]interface{}) (string, error) {
    city, _ := args["city"].(string)
    if city == "" {
        return "", fmt.Errorf("city is required")
    }
    // 在这里调用真实的天气 API（OpenWeatherMap、WeatherAPI 等）。
    return fmt.Sprintf("Weather in %s: 22°C, partly cloudy", city), nil
}
```

## 2. 重启后端

```bash
cd backend && go run main.go
```

现在工具在 `GET /api/tools` 中可见，画布中所有 LLM 节点都可以使用它。

## 3. 在工作流中使用

把**工具节点**拖到画布上，在工具选择器中选中 `get_weather`。把 `city` 设为 `{{__input__}}` 以转发工作流的用户输入，或设为一个固定字符串。

---

## 工具 Handler 约定

| | 规则 |
|---|---|
| 输入 | `args map[string]interface{}` —— 始终用 comma-ok 方式做类型断言 |
| 输出 | `(string, error)` —— 返回一段 LLM 能直接阅读的纯字符串 |
| 注册 | 在 `init()` 函数内调用 `tools.Register` |
| Schema | 每个参数都要写 `"description"` —— LLM 会读它 |
| 必填 | 在 `"required"` 中标记必填字段 |
| 枚举 | 用 `"enum"` 约束字符串取值 |
