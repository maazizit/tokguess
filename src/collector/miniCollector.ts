import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { CopilotSpanRecord, parseOtlpBody } from './spanParser';

const DEFAULT_OTLP_PORT = 4318;
const DEFAULT_API_PORT = 4319;
const MAX_SPANS = 5000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export class MiniCollector {
  private otlpServer?: http.Server;
  private apiServer?: http.Server;
  private spans: CopilotSpanRecord[] = [];
  private spanIds = new Set<string>();
  private otlpPort = DEFAULT_OTLP_PORT;
  private apiPort = DEFAULT_API_PORT;
  private storagePath: string;

  constructor(storageDir?: string) {
    const base = storageDir ?? path.join(os.homedir(), '.tokguess');
    if (!fs.existsSync(base)) {
      fs.mkdirSync(base, { recursive: true });
    }
    this.storagePath = path.join(base, 'otel-spans.jsonl');
    this.loadFromDisk();
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
    this.apiPort = await this.findPort(DEFAULT_API_PORT);

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

  private handleOtlp(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === 'POST' && (req.url === '/v1/traces' || req.url?.endsWith('/v1/traces'))) {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
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

  private appendDisk(span: CopilotSpanRecord): void {
    try {
      fs.appendFileSync(this.storagePath, `${JSON.stringify(span)}\n`, 'utf8');
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
          'utf8'
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
