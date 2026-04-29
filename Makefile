.PHONY: build test test-coverage install-golangci-lint lint-go backend-build backend-test backend-check build-image build-web-image build-yaegi-wasm run-web run run-dev-docker web-install web-lint web-test web-build

BIN ?= mnote
GO_TEST_PKGS ?= ./cmd/... ./internal/...
GOBIN ?= $(CURDIR)/bin
GOCACHE ?= $(CURDIR)/.cache/go-build
GOLANGCI_LINT_CACHE ?= $(CURDIR)/.cache/golangci-lint
GOLANGCI_LINT_VERSION ?= v2.11.4
GOLANGCI_LINT ?= $(GOBIN)/golangci-lint
GO_COVERAGE_THRESHOLD ?= 95

build:
	GOCACHE=$(GOCACHE) go build -o $(BIN) ./cmd/mnote

test:
	GOCACHE=$(GOCACHE) go test -race $(GO_TEST_PKGS)

test-coverage:
	GOCACHE=$(GOCACHE) bash scripts/check-go-coverage.sh $(GO_COVERAGE_THRESHOLD)

install-golangci-lint:
	GOBIN=$(GOBIN) GOCACHE=$(GOCACHE) go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)

lint-go:
	GOCACHE=$(GOCACHE) GOLANGCI_LINT_CACHE=$(GOLANGCI_LINT_CACHE) $(GOLANGCI_LINT) run --config .golangci.yml ./cmd/... ./internal/...

backend-build: build

backend-test: test-coverage

backend-check: backend-build backend-test lint-go

build-image:
	./scripts/build-image.sh

build-web-image:
	./scripts/build-web-image.sh

build-yaegi-wasm:
	$(MAKE) -C web/wasm/yaegi-wrapper build

run-web:
	./scripts/run-web.sh

run:
	./scripts/run.sh $(CONFIG)

run-dev-docker:
	docker compose -f docker/docker-compose.yml up --build

web-install:
	cd web && npm ci

web-lint:
	cd web && npm run lint

web-test:
	cd web && npm run test:coverage

web-build:
	cd web && npm run build
