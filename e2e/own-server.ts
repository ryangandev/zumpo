import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

export interface OwnServer {
  process: ChildProcess;
  port: number;
  url: string;
}

/**
 * A server of a test's own, beside the one every other test shares, started
 * from the production build as the host does; resolves once it listens. With
 * no port it takes any free one, so test runs side by side never collide;
 * pass the port it got to start it again where its players expect it. `env`
 * sets its own variables, such as shorter phases.
 */
export async function startServer(
  port = 0,
  env: Record<string, string> = {},
): Promise<OwnServer> {
  const child = spawn(process.execPath, ['server/build/server/server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      ...env,
      NODE_ENV: 'production',
      PORT: String(port),
      // Every player in a run is this one machine.
      PER_ADDRESS_LIMITS: 'off',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const bound = await new Promise<number>((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`server exited: ${code}`)));
    child.stdout?.on('data', (chunk: Buffer) => {
      const listening = /Listening on port (\d+)/.exec(chunk.toString());
      if (listening) resolve(Number(listening[1]));
    });
  });
  return {
    process: child,
    port: bound,
    url: `http://localhost:${bound}`,
  };
}
