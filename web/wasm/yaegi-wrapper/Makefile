.PHONY: build test clean

OUTPUT ?= ../../public/yaegi.wasm
GOCACHE ?= $(CURDIR)/../../../.cache/go-build

build:
	GOCACHE=$(GOCACHE) GOOS=js GOARCH=wasm go build -trimpath -ldflags="-s -w" -o $(OUTPUT) .

test:
	GOCACHE=$(GOCACHE) go test ./...

clean:
	rm -f $(OUTPUT)
