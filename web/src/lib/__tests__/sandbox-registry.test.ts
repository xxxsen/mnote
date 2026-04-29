import { describe, it, expect, vi, beforeEach } from "vitest";

const workerInstances: MockWorker[] = [];

class MockWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    workerInstances.push(this);
  }
}

beforeEach(() => {
  vi.resetModules();
  workerInstances.length = 0;
  vi.stubGlobal("Worker", MockWorker);
  const origURL = globalThis.URL;
  vi.stubGlobal("URL", Object.assign(
    function MockURL(this: URL, ...args: ConstructorParameters<typeof URL>) {
      return new origURL(...args);
    },
    { createObjectURL: vi.fn().mockReturnValue("blob://test") },
  ));
  vi.stubGlobal("Blob", class MockBlob { constructor() { /* noop */ } });
});

async function loadRegistry() {
  const mod = await import("../sandbox-registry");
  return mod.sandboxRegistry;
}

describe("SandboxRegistry", () => {
  it("creates a worker and posts run message", async () => {
    const registry = await loadRegistry();
    const onMessage = vi.fn();
    registry.run({ code: "console.log(1)", language: "js", onMessage });
    expect(workerInstances).toHaveLength(1);
    expect(workerInstances[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "run", code: "console.log(1)" })
    );
  });

  it("reuses worker for same normalized language", async () => {
    const registry = await loadRegistry();
    const msg = vi.fn();
    registry.run({ code: "x", language: "js", onMessage: msg });
    registry.run({ code: "y", language: "javascript", onMessage: msg });
    expect(workerInstances).toHaveLength(1);
  });

  it("normalizes py to python", async () => {
    const registry = await loadRegistry();
    const msg = vi.fn();
    registry.run({ code: "x", language: "py", onMessage: msg });
    registry.run({ code: "y", language: "python", onMessage: msg });
    expect(workerInstances).toHaveLength(1);
  });

  it("normalizes golang to go", async () => {
    const registry = await loadRegistry();
    const msg = vi.fn();
    registry.run({ code: "x", language: "golang", onMessage: msg });
    registry.run({ code: "y", language: "go", onMessage: msg });
    expect(workerInstances).toHaveLength(1);
  });

  it("terminate removes worker and creates new on next run", async () => {
    const registry = await loadRegistry();
    const onMessage = vi.fn();
    registry.run({ code: "x", language: "javascript", onMessage });
    registry.terminate("javascript");
    registry.run({ code: "y", language: "javascript", onMessage });
    expect(workerInstances).toHaveLength(2);
  });

  it("forwards worker messages to onMessage callback", async () => {
    const registry = await loadRegistry();
    const onMessage = vi.fn();
    registry.run({ code: "x", language: "lua", onMessage });
    workerInstances[0].onmessage!({ data: { type: "stdout", content: "hello" } });
    expect(onMessage).toHaveBeenCalledWith({ type: "stdout", content: "hello" });
  });

  it("creates workers for c language", async () => {
    const registry = await loadRegistry();
    registry.run({ code: "x", language: "c", onMessage: vi.fn() });
    expect(workerInstances).toHaveLength(1);
  });

  it("creates workers for go language with wasmUrl", async () => {
    const registry = await loadRegistry();
    const onMessage = vi.fn();
    registry.run({ code: "x", language: "go", wasmUrl: "test.wasm", onMessage });
    expect(workerInstances[0].postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "run", code: "x", wasmUrl: "test.wasm" })
    );
  });

  it("handles unknown language by creating worker", async () => {
    const registry = await loadRegistry();
    registry.run({ code: "x", language: "unknown", onMessage: vi.fn() });
    expect(workerInstances).toHaveLength(1);
  });

  it("terminate on non-existing language is a no-op", async () => {
    const registry = await loadRegistry();
    expect(() => registry.terminate("nonexistent")).not.toThrow();
  });
});
