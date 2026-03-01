.PHONY: build-image build-web-image build run-web run run-dev-docker test install-golangci-lint lint-go

GOBIN ?= $(CURDIR)/bin
GOCACHE ?= $(CURDIR)/.cache/go-build
GOLANGCI_LINT_CACHE ?= $(CURDIR)/.cache/golangci-lint
GOLANGCI_LINT_VERSION ?= v1.64.8
GOLANGCI_LINT ?= $(GOBIN)/golangci-lint

build-image:
	./scripts/build-image.sh

build-web-image:
	./scripts/build-web-image.sh

build:
	./scripts/build.sh

run-web:
	./scripts/run-web.sh

run:
	./scripts/run.sh $(CONFIG)

run-dev-docker:
	docker compose -f docker/docker-compose.yml up --build

test:
	go test ./...

install-golangci-lint:
	GOBIN=$(GOBIN) GOCACHE=$(GOCACHE) go install github.com/golangci/golangci-lint/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)

lint-go:
	GOCACHE=$(GOCACHE) GOLANGCI_LINT_CACHE=$(GOLANGCI_LINT_CACHE) $(GOLANGCI_LINT) run --config .golangci.yml ./...
