// ragctl：知识库灌库 CLI。
//
//	go run ./cmd/ragctl ingest --kb kb_main --file 知识库.txt [--chunk 800]
//
// 分块策略：按空行切段落，段落累计到约 chunk 字符切成一块（保段落完整性优先）。
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/joho/godotenv"

	"github.com/lanse/dsh-plugin-agent-canvas/rag"
)

func main() {
	_ = godotenv.Load()

	var (
		kb     = flag.String("kb", "", "知识库 id（RAG 节点的 knowledgeBaseId）")
		file   = flag.String("file", "", "要灌入的文本文件路径")
		chunk  = flag.Int("chunk", 800, "分块目标大小（字符）")
		drop   = flag.Bool("drop", false, "灌库前清空该知识库")
	)
	flag.Parse()

	if *kb == "" || *file == "" {
		fmt.Fprintln(os.Stderr, "用法：ragctl ingest --kb <id> --file <path> [--chunk 800] [--drop]")
		os.Exit(2)
	}

	raw, err := os.ReadFile(*file)
	if err != nil {
		fatal(err)
	}
	chunks := splitChunks(string(raw), *chunk)
	if len(chunks) == 0 {
		fatal(fmt.Errorf("文件没有可灌入的内容"))
	}

	store, err := rag.Open()
	if err != nil {
		fatal(err)
	}
	ctx := context.Background()

	if *drop {
		if n, err := store.Clear(ctx, *kb); err != nil {
			fatal(err)
		} else {
			fmt.Printf("已清空知识库 %q 的 %d 条旧分块\n", *kb, n)
		}
	}

	n, err := store.Ingest(ctx, *kb, chunks)
	if err != nil {
		fatal(err)
	}
	fmt.Printf("✓ 知识库 %q 灌入 %d 个分块（来源：%s）\n", *kb, n, *file)
}

func splitChunks(text string, target int) []string {
	paras := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\n\n")
	var chunks []string
	var buf strings.Builder
	flush := func() {
		if s := strings.TrimSpace(buf.String()); s != "" {
			chunks = append(chunks, s)
		}
		buf.Reset()
	}
	for _, p := range paras {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if buf.Len() > 0 && utf8.RuneCountInString(buf.String())+utf8.RuneCountInString(p) > target {
			flush()
		}
		if buf.Len() > 0 {
			buf.WriteString("\n\n")
		}
		buf.WriteString(p)
		// 单段落超长（如压缩过的大段）：硬切
		for utf8.RuneCountInString(buf.String()) > target*2 {
			runes := []rune(buf.String())
			chunks = append(chunks, string(runes[:target]))
			buf.Reset()
			buf.WriteString(string(runes[target:]))
		}
	}
	flush()
	return chunks
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, "✗", err)
	os.Exit(1)
}
