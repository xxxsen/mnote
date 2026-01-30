package main

import (
	"fmt"
	"syscall/js"

	"github.com/traefik/yaegi/interp"
	"github.com/traefik/yaegi/stdlib"
)

func main() {
	// Get the source code from the global JS variable
	source := js.Global().Get("GOSOURCE").String()
	if source == "" || source == "undefined" {
		fmt.Println("No source code found in GOSOURCE")
		return
	}

	// Initialize the interpreter
	i := interp.New(interp.Options{})

	// Load the standard library
	if err := i.Use(stdlib.Symbols); err != nil {
		fmt.Printf("Failed to load stdlib: %v\n", err)
		return
	}

	// Execute the code
	_, err := i.Eval(source)
	if err != nil {
		fmt.Printf("Execution error: %v\n", err)
	}
}
