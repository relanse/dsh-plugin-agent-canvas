# Adding Custom Tools

A tool is a Go function with a standard JSON Schema description. Register it once; the LLM can call it immediately, and it appears in the frontend node palette automatically.

---

## 1. Define the tool in `backend/tools/builtin.go`

```go
func init() {
    tools.Register(&tools.ToolDef{
        Name:        "get_weather",
        Description: "Get the current weather for a city",
        Parameters: map[string]interface{}{
            "type": "object",
            "properties": map[string]interface{}{
                "city": map[string]interface{}{
                    "type":        "string",
                    "description": "City name, e.g. 'Shanghai'",
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
    // Call a real weather API here (OpenWeatherMap, WeatherAPI, etc.).
    return fmt.Sprintf("Weather in %s: 22°C, partly cloudy", city), nil
}
```

## 2. Restart the backend

```bash
cd backend && go run main.go
```

The tool is now visible at `GET /api/tools` and available to all LLM nodes in the canvas.

## 3. Use it in a workflow

Drag a **Tool Node** onto the canvas. In the tool selector, pick `get_weather`. Set `city` to `{{__input__}}` to forward the workflow's user input, or to a hardcoded string.

---

## Tool Handler Contract

| | Rule |
|---|---|
| Input | `args map[string]interface{}` — always type-assert with comma-ok |
| Output | `(string, error)` — return a plain string the LLM can read |
| Registration | Call `tools.Register` inside an `init()` function |
| Schema | Use `"description"` on every parameter — the LLM reads this |
| Required | Mark required fields in `"required"` |
| Enums | Use `"enum"` to constrain string values |
