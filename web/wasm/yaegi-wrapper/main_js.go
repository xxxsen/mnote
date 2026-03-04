//go:build js && wasm

package main

import (
	"strings"
	"syscall/js"
)

func main() {
	js.Global().Set("GO_EXEC_ERROR", "")
	js.Global().Set("GO_AUTOIMPORT_APPLIED", "")

	source := js.Global().Get("GOSOURCE").String()
	if source == "" || source == "undefined" {
		js.Global().Set("GO_EXEC_ERROR", "No source code found in GOSOURCE")
		return
	}

	applied, err := runWithAutoImport(source, 8)
	if len(applied) > 0 {
		js.Global().Set("GO_AUTOIMPORT_APPLIED", strings.Join(applied, ", "))
	}
	if err != nil {
		js.Global().Set("GO_EXEC_ERROR", err.Error())
	}
}
