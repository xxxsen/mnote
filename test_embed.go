package main
import (
	"embed"
	"fmt"
	"io/fs"
)
//go:embed internal/repo/migrations/*.sql
var f embed.FS
func main() {
	entries, err := fs.ReadDir(f, "internal/repo/migrations")
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	for _, e := range entries {
		fmt.Println(e.Name())
	}
}
