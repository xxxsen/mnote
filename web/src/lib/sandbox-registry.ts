type WorkerMessage = {
  type: "stdout" | "stderr" | "system" | "done" | "error";
  content?: string;
};

type RunOptions = {
  code: string;
  language: string;
  wasmUrl?: string;
  onMessage: (msg: WorkerMessage) => void;
};

class SandboxRegistry {
  private workers: Record<string, Worker> = {};
  private activeListeners: Record<string, ((msg: WorkerMessage) => void) | null> = {};

  private getWorkerCode(language: string): string {
    if (language === "javascript" || language === "js") {
      return `
        self.onmessage = async (e) => {
          if (e.data.type === 'run') {
            const originalLog = console.log;
            const originalError = console.error;
            const originalWarn = console.warn;

            console.log = (...args) => self.postMessage({ type: 'stdout', content: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
            console.error = (...args) => self.postMessage({ type: 'stderr', content: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });
            console.warn = (...args) => self.postMessage({ type: 'stderr', content: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ') });

            try {
              self.postMessage({ type: 'system', content: 'Executing JavaScript...' });
              const result = await eval(\`(async () => { \${e.data.code} })()\`);
              if (result !== undefined) {
                self.postMessage({ type: 'stdout', content: 'Return: ' + JSON.stringify(result) });
              }
              self.postMessage({ type: 'system', content: 'Process finished.' });
              self.postMessage({ type: 'done' });
            } catch (err) {
              self.postMessage({ type: 'error', content: err.stack || err.message });
            } finally {
              console.log = originalLog;
              console.error = originalError;
              console.warn = originalWarn;
            }
          }
        };
      `;
    }
    if (language === "python" || language === "py") {
      return `
        self.importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.2/full/pyodide.js');
        let pyodide;
        self.onmessage = async (e) => {
          if (e.data.type === 'run') {
            try {
              if (!pyodide) {
                self.postMessage({ type: 'system', content: 'Loading Pyodide (Wasm)...' });
                pyodide = await self.loadPyodide();
              }
              self.postMessage({ type: 'system', content: 'Executing Python...' });
              pyodide.setStdout({
                batched: (str) => self.postMessage({ type: 'stdout', content: str })
              });
              pyodide.setStderr({
                batched: (str) => self.postMessage({ type: 'stderr', content: str })
              });
              await pyodide.runPythonAsync(e.data.code);
              self.postMessage({ type: 'system', content: 'Process finished.' });
              self.postMessage({ type: 'done' });
            } catch (err) {
              self.postMessage({ type: 'error', content: err.message });
            }
          }
        };
      `;
    }
    if (language === "go" || language === "golang") {
      return `
        self.importScripts('https://cdn.jsdelivr.net/gh/golang/go@master/lib/wasm/wasm_exec.js');
        self.onmessage = async (e) => {
          if (e.data.type === 'run') {
            const go = new self.Go();
            const decoder = new TextDecoder();
            const originalWriteSync = self.fs.writeSync;
            self.fs.writeSync = (fd, buf) => {
              const content = decoder.decode(buf);
              if (fd === 1 || fd === 2) {
                self.postMessage({ 
                  type: fd === 1 ? 'stdout' : 'stderr', 
                  content: content.replace(/\\n$/, '') 
                });
              }
              return buf.length;
            };
            try {
              self.postMessage({ type: 'system', content: 'Loading yaegi.wasm...' });
              const response = await fetch(e.data.wasmUrl);
              const buffer = await response.arrayBuffer();
              const { instance } = await WebAssembly.instantiate(buffer, go.importObject);
              self.postMessage({ type: 'system', content: 'Executing Go...' });
              self.GOSOURCE = e.data.code;
              await go.run(instance);
              self.postMessage({ type: 'system', content: 'Process finished.' });
              self.postMessage({ type: 'done' });
            } catch (err) {
              self.postMessage({ type: 'error', content: err.message });
            }
          }
        };
      `;
    }
    if (language === "lua") {
      return `
        self.window = self;
        self.importScripts('https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js');
        self.onmessage = async (e) => {
          if (e.data.type === 'run') {
            try {
              const fengari = self.fengari;
              const lua = fengari.lua;
              const lauxlib = fengari.lauxlib;
              const lualib = fengari.lualib;
              const L = lauxlib.luaL_newstate();
              lualib.luaL_openlibs(L);

              // Override print to capture output
              lua.lua_pushcfunction(L, (L) => {
                const n = lua.lua_gettop(L);
                const parts = [];
                for (let i = 1; i <= n; i++) {
                  lauxlib.luaL_tolstring(L, i);
                  parts.push(fengari.to_jsstring(lua.lua_tolstring(L, -1)));
                  lua.lua_pop(L, 2);
                }
                self.postMessage({ type: 'stdout', content: parts.join('\\t') });
                return 0;
              });
              lua.lua_setglobal(L, fengari.to_luastring('print'));

              self.postMessage({ type: 'system', content: 'Executing Lua...' });
              const code = fengari.to_luastring(e.data.code);
              const status = lauxlib.luaL_dostring(L, code);
              if (status !== lua.LUA_OK) {
                const errMsg = lua.lua_tojsstring(L, -1);
                self.postMessage({ type: 'error', content: errMsg });
                return;
              }
              self.postMessage({ type: 'system', content: 'Process finished.' });
              self.postMessage({ type: 'done' });
            } catch (err) {
              self.postMessage({ type: 'error', content: err.message });
            }
          }
        };
      `;
    }
    if (language === "c") {
      return `
        self.importScripts('https://cdn.jsdelivr.net/npm/JSCPP@2.0.6/dist/JSCPP.es5.min.js');
        self.onmessage = async (e) => {
          if (e.data.type === 'run') {
            try {
              self.postMessage({ type: 'system', content: 'Loading JSCPP runtime...' });
              const config = {
                stdio: {
                  write: (s) => {
                    self.postMessage({ type: 'stdout', content: s.replace(/\\n$/, '') });
                  }
                }
              };
              self.postMessage({ type: 'system', content: 'Executing C...' });
              JSCPP.run(e.data.code, '', config);
              self.postMessage({ type: 'system', content: 'Process finished.' });
              self.postMessage({ type: 'done' });
            } catch (err) {
              self.postMessage({ type: 'error', content: err.message || String(err) });
            }
          }
        };
      `;
    }
    return "";
  }

  private getOrCreateWorker(language: string): Worker {
    const key = this.getLangKey(language);
    if (!this.workers[key]) {
      const code = this.getWorkerCode(key);
      const blob = new Blob([code], { type: "application/javascript" });
      const worker = new Worker(URL.createObjectURL(blob));
      this.workers[key] = worker;
      worker.onmessage = (e) => {
        const listener = this.activeListeners[key];
        if (listener) listener(e.data);
      };
    }
    return this.workers[key];
  }

  private getLangKey(language: string): string {
    if (language === "js") return "javascript";
    if (language === "py") return "python";
    if (language === "golang") return "go";
    return language;
  }

  public run({ code, language, wasmUrl, onMessage }: RunOptions) {
    const key = this.getLangKey(language);
    const worker = this.getOrCreateWorker(key);

    // Set current active listener
    this.activeListeners[key] = onMessage;

    worker.postMessage({ type: "run", code, wasmUrl });
  }

  public terminate(language: string) {
    const key = this.getLangKey(language);
    if (this.workers[key]) {
      this.workers[key].terminate();
      delete this.workers[key];
      delete this.activeListeners[key];
    }
  }
}

export const sandboxRegistry = new SandboxRegistry();
