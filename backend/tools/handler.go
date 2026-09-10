package tools

import "github.com/gin-gonic/gin"

// HandleListTools returns the full tool catalogue as JSON. The frontend uses
// this to populate the node palette without hardcoding tool metadata.
func HandleListTools(c *gin.Context) {
	c.JSON(200, gin.H{"tools": All()})
}
