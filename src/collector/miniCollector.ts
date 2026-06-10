import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { CopilotSpanRecord, parseOtlpBody } from './spanParser';

const DEFAULT_OTLP_PORT = 4318;
const DEFAULT_API_PORT = 4319;
const MAX_SPANS = 5000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
/** Reject OTLP payloads above this size — token spans are tiny. */
const MAX_BODY_BYTES = 1024 * 1024;

export class MiniCollector {
  private otlpServer?: http.Server;
  private apiServer?: http.Server;
  private spans: CopilotSpanRecord[] = [];
  private spanIds = new Set<string>();
  private otlpPort = DEFAULT_OTLP_PORT;
  private apiPort = DEFAULT_API_PORT;
  private storagePath: string;
  private tokenPath: string;
  private authToken = '';

  constructor(storageDir?: string) {
    const base = storageDir ?? path.join(os.homedir(), '.tokguess');
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base, { recursive: true, mode: 0o700 });
    }
    try {
      fs.chmodSync(base, 0o700);
    } catch {
      /* best effort on non-POSIX */
    }
    this.storagePath = path.join(base, 'otel-spans.jsonl');
    this.tokenPath = path.join(base, 'collector-token');
    this.loadOrCreateToken();
    this.loadFromDisk();
  }

  /** Shared secret required on /v1/traces and /api/spans (Bearer). */
  getAuthToken(): string {
    return this.authToken;
  }

  getOtlpPort(): number {
    return this.otlpPort;
  }

  getApiPort(): number {
    return this.apiPort;
  }

  isRunning(): boolean {
    return Boolean(this.otlpServer && this.apiServer);
  }

  getSpanCount(): number {
    return this.spans.length;
  }

  getLastSpanAt(): number | null {
    if (!this.spans.length) {
      return null;
    }
    return this.spans[this.spans.length - 1].timestamp;
  }

  async start(): Promise<void> {
    if (this.isRunning()) {
      return;
    }
    this.otlpPort = await this.findPort(DEFAULT_OTLP_PORT);
    this.apiPort = await this.findPort(Math.max(DEFAULT_API_PORT, this.otlpPort + 1));

    await new Promise<void>((resolve, reject) => {
      this.otlpServer = http.createServer((req, res) => this.handleOtlp(req, res));
      this.otlpServer.on('error', reject);
      this.otlpServer.listen(this.otlpPort, '127.0.0.1', () => resolve());
    });

    await new Promise<void>((resolve, reject) => {
      this.apiServer = http.createServer((req, res) => this.handleApi(req, res));
      this.apiServer.on('error', reject);
      this.apiServer.listen(this.apiPort, '127.0.0.1', () => resolve());
    });
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.closeServer(this.otlpServer),
      this.closeServer(this.apiServer)
    ]);
    this.otlpServer = undefined;
    this.apiServer = undefined;
  }

  getSpansSince(since: number): CopilotSpanRecord[] {
    return this.spans.filter((s) => s.timestamp >= since);
  }

  private isAuthorized(req: http.IncomingMessage): boolean {
    const header = req.headers.authorization ?? '';
    const expected = `Bearer ${this.authToken}`;
    if (header.length !== expected.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  }

  private handleOtlp(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === 'POST' && (req.url === '/v1/traces' || req.url?.endsWith('/v1/traces'))) {
      if (!this.isAuthorized(req)) {
        res.writeHead(401);
        res.end('unauthorized');
        return;
      }
      const chunks: Buffer[] = [];
      let received = 0;
      req.on('data', (c: Buffer) => {
        received += c.length;
        if (received > MAX_BODY_BYTES) {
          res.writeHead(413);
          res.end('payload too large');
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        if (received > MAX_BODY_BYTES) {
          return;
        }
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          const body = raw ? (JSON.parse(raw) as unknown) : {};
          const incoming = parseOtlpBody(body);
          this.ingest(incoming);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{"partialSuccess":{}}');
        } catch {
          res.writeHead(400);
          res.end('bad request');
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  }

  private handleApi(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.apiPort}`);

    if (url.pathname === '/' || url.pathname === '') {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TokGuess Collector</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #1e1e1e; color: #d4d4d4; }
    h1 { color: #f8b4d9; }
    .card { background: #2d2d2d; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #f8b4d9; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 12px; background: #4ade80; color: #000; font-weight: 600; font-size: 0.9em; }
    code { background: #3c3c3c; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    pre { background: #0d0d0d; padding: 15px; border-radius: 6px; overflow-x: auto; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .endpoint { margin: 15px 0; }
    .method { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 0.85em; }
    .get { background: #3b82f6; color: white; }
    .post { background: #10b981; color: white; }
    .locked { color: #f59e0b; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>🎯 TokGuess Collector</h1>
  <div class="card">
    <p><span class="status">● RUNNING</span></p>
    <p><strong>Spans collected:</strong> ${this.spans.length} / ${MAX_SPANS}</p>
    <p><strong>OTLP Port:</strong> ${this.otlpPort}</p>
    <p><strong>API Port:</strong> ${this.apiPort}</p>
  </div>

  <div class="card">
    <h2>📡 Available Endpoints</h2>
    
    <div class="endpoint">
      <span class="method get">GET</span> <code>/health</code>
      <p>Health check (no auth required)</p>
      <a href="/health" target="_blank">→ Test it</a>
    </div>

    <div class="endpoint">
      <span class="method get">GET</span> <code>/api/spans?since=0</code>
      <p class="locked">🔒 Requires Bearer authentication</p>
    </div>

    <div class="endpoint">
      <span class="method post">POST</span> <code>/v1/traces</code>
      <p class="locked">🔒 OTLP endpoint (requires Bearer authentication)</p>
    </div>
  </div>

  <div class="card">
    <h2>💡 Usage</h2>
    <p>This is TokGuess's local OpenTelemetry collector. It receives token usage data from:</p>
    <ul>
      <li><strong>Copilot Chat</strong> via file export (OTel)</li>
      <li><strong>Claude Code</strong> or other tools via OTLP (HTTP)</li>
    </ul>
    <p>All data stays on your machine. Nothing leaves <code>127.0.0.1</code>.</p>
    
    <h3>Test with curl:</h3>
    <pre>curl http://localhost:${this.apiPort}/health</pre>
  </div>

  <div class="card" style="border-left-color: #60a5fa;">
    <p style="margin: 0;">⚡ Managed by <strong>TokGuess VS Code Extension</strong></p>
  </div>
</body>
</html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (url.pathname === '/health') {
      this.json(res, 200, {
        ok: true,
        spans: this.spans.length,
        otlpPort: this.otlpPort,
        apiPort: this.apiPort
      });
      return;
    }

    if (url.pathname === '/api/spans') {
      if (!this.isAuthorized(req)) {
        this.json(res, 401, { error: 'unauthorized' });
        return;
      }
      const since = Number(url.searchParams.get('since') ?? '0');
      this.json(res, 200, { spans: this.getSpansSince(since) });
      return;
    }

    res.writeHead(404);
    res.end();
  }

  private ingest(incoming: CopilotSpanRecord[]): void {
    for (const span of incoming) {
      if (this.spanIds.has(span.id)) {
        continue;
      }
      this.spanIds.add(span.id);
      this.spans.push(span);
      this.appendDisk(span);
    }
    if (this.spans.length > MAX_SPANS) {
      const removed = this.spans.splice(0, this.spans.length - MAX_SPANS);
      for (const r of removed) {
        this.spanIds.delete(r.id);
      }
    }
    this.rotateFileIfNeeded();
  }

  private json(res: http.ServerResponse, code: number, data: unknown): void {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private loadFromDisk(): void {
    if (!fs.existsSync(this.storagePath)) {
      return;
    }
    try {
      fs.chmodSync(this.storagePath, 0o600);
    } catch {
      /* best effort on non-POSIX */
    }
    try {
      const lines = fs.readFileSync(this.storagePath, 'utf8').split('\n').filter(Boolean);
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const line of lines) {
        const span = JSON.parse(line) as CopilotSpanRecord;
        if (span.timestamp >= cutoff && !this.spanIds.has(span.id)) {
          this.spanIds.add(span.id);
          this.spans.push(span);
        }
      }
    } catch {
      /* ignore corrupt file */
    }
  }

  private loadOrCreateToken(): void {
    try {
      if (fs.existsSync(this.tokenPath)) {
        const existing = fs.readFileSync(this.tokenPath, 'utf8').trim();
        if (existing.length >= 32) {
          this.authToken = existing;
          fs.chmodSync(this.tokenPath, 0o600);
          return;
        }
      }
    } catch {
      /* regenerate below */
    }
    this.authToken = crypto.randomBytes(24).toString('hex');
    try {
      fs.writeFileSync(this.tokenPath, this.authToken, { encoding: 'utf8', mode: 0o600 });
    } catch {
      /* in-memory token still works for this session */
    }
  }

  private appendDisk(span: CopilotSpanRecord): void {
    try {
      fs.appendFileSync(this.storagePath, `${JSON.stringify(span)}\n`, {
        encoding: 'utf8',
        mode: 0o600
      });
    } catch {
      /* ignore */
    }
  }

  private rotateFileIfNeeded(): void {
    try {
      if (!fs.existsSync(this.storagePath)) {
        return;
      }
      if (fs.statSync(this.storagePath).size > MAX_FILE_BYTES) {
        const keep = this.spans.slice(-Math.floor(MAX_SPANS / 2));
        fs.writeFileSync(
          this.storagePath,
          keep.map((s) => JSON.stringify(s)).join('\n') + '\n',
          { encoding: 'utf8', mode: 0o600 }
        );
      }
    } catch {
      /* ignore */
    }
  }

  private closeServer(server?: http.Server): Promise<void> {
    if (!server) {
      return Promise.resolve();
    }
    return new Promise((resolve) => server.close(() => resolve()));
  }

  private findPort(start: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const tester = http.createServer();
      tester.once('error', () => resolve(this.findPort(start + 1)));
      tester.once('listening', () => {
        tester.close(() => resolve(start));
      });
      tester.listen(start, '127.0.0.1');
      tester.on('error', reject);
    });
  }
}
