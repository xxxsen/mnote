.PHONY: build-image build-web-image build run-web run

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
