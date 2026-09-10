package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleExecute accepts a DAGRequest as JSON and streams execution progress
// as a text/event-stream response. The connection stays open until the
// workflow finishes or the client disconnects.
func HandleExecute(c *gin.Context) {
	var req DAGRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Nodes) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workflow has no nodes"})
		return
	}

	// Validate before opening the SSE stream so a cycle returns a clean 400.
	if _, err := TopologicalSort(req.Nodes, req.Edges); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	// Prevent nginx and other reverse proxies from buffering the event stream.
	c.Writer.Header().Set("X-Accel-Buffering", "no")

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	send := func(event SSEEvent) {
		data, _ := json.Marshal(event)
		fmt.Fprintf(c.Writer, "data: %s\n\n", data)
		c.Writer.(http.Flusher).Flush()
	}

	_, _ = Execute(ctx, req, send)
}

// HandleExecuteSync runs the same execution pipeline but collects events
// in memory and answers with a single JSON document. This is the endpoint
// the host-side run_workflow tool calls — the DSH tool protocol needs a
// plain response, not a stream.
func HandleExecuteSync(c *gin.Context) {
	var req DAGRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Nodes) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "workflow has no nodes"})
		return
	}
	if _, err := TopologicalSort(req.Nodes, req.Edges); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var eventCount int
	send := func(SSEEvent) { eventCount++ }

	output, err := Execute(c.Request.Context(), req, send)
	if err != nil {
		// node_error / workflow_error 已在事件流里；这里给出可读的失败响应
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error(), "eventCount": eventCount})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"output":     output,
		"nodeCount":  len(req.Nodes),
		"eventCount": eventCount,
	})
}

// HandleValidateDAG runs Kahn's algorithm on the submitted graph and returns
// either the valid execution order or the detected cycle — without executing
// any nodes.
func HandleValidateDAG(c *gin.Context) {
	var req DAGRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"valid": false, "error": err.Error()})
		return
	}

	order, err := TopologicalSort(req.Nodes, req.Edges)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"valid": false, "error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":          true,
		"nodeCount":      len(req.Nodes),
		"edgeCount":      len(req.Edges),
		"executionOrder": order,
	})
}
