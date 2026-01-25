FROM golang:1.25

WORKDIR /build
COPY ./ ./
RUN CGO_ENABLED=0 go build -a -tags "netgo" -ldflags "-w" -o /build/mnote ./cmd/mnote

FROM debian:12

WORKDIR /app
COPY --from=0 /build/mnote /app/mnote
COPY --from=0 /build/migrations /app/migrations
COPY config.example.json /app/config.json

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/app/mnote", "run", "--config", "/app/config.json"]
