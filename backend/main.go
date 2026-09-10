package main

import (
	"log"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"github.com/lanse/dsh-plugin-agent-canvas/executor"
	"github.com/lanse/dsh-plugin-agent-canvas/tools"
)

func main() {
	_ = godotenv.Load()

	r := gin.Default()
	r.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "OPTIONS"},
		AllowHeaders:    []string{"*"},
	}))

	api := r.Group("/api")
	{
		api.POST("/execute", executor.HandleExecute)
		api.POST("/validate", executor.HandleValidateDAG)
		api.GET("/tools", tools.HandleListTools)
		api.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok", "version": "0.1.0"})
		})
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Agent Canvas backend on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
