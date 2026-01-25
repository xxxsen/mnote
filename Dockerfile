FROM golang:1.25

WORKDIR /build
COPY ./ ./
RUN CGO_ENABLED=0 go build -a -tags "netgo" -ldflags "-w" -o /build/mnote ./cmd/mnote

FROM alpine:3.21

WORKDIR /app
COPY --from=0 /build/mnote /app/mnote
COPY config.example.json /app/config.json

ENV PORT=8080
EXPOSE 8080

ENTRYPOINT ["/app/mnote"]
CMD ["run", "--config", "/app/config.json"]
