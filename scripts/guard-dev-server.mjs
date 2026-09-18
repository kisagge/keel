/**
 * e2e 앞에서 3000 번이 **성한지** 본다.
 *
 * `reuseExistingServer` 는 포트가 열려 있는지만 보고 응답하는지는 안 본다.
 * 그래서 먹통이 된 dev 서버가 하나 떠 있으면 Playwright 가 그것을 물고,
 * 멀쩡한 코드에서 `page.goto('/')` 가 통째로 실패한다 — 진짜 회귀보다
 * 사람을 더 헷갈리게 하는 실패다.
 *
 * 세 갈래로 나뉜다.
 *   - 아무도 안 듣는다  → Playwright 가 직접 띄운다. 통과.
 *   - 듣고 응답한다     → 그것을 쓴다. 통과.
 *   - 듣는데 응답이 없다 → 여기서 세운다. 무엇을 죽여야 하는지 찍어 준다.
 *
 * CI 에서는 `reuseExistingServer` 가 어차피 꺼지므로 그냥 빠진다.
 */
import { execFileSync } from 'node:child_process';
import net from 'node:net';

const PORT = 3000;
const TCP_TIMEOUT_MS = 1_000;
const HTTP_TIMEOUT_MS = 5_000;

if (process.env['CI']) process.exit(0);

/** 포트에 TCP 로 붙어 보고, 붙으면 true. */
function isListening() {
  return new Promise((resolve) => {
    const socket = net.connect({ port: PORT, host: '127.0.0.1' });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(TCP_TIMEOUT_MS);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

/** HTTP 로 실제 응답이 오는지. 상태 코드는 따지지 않는다 — 살아만 있으면 된다. */
async function responds() {
  try {
    await fetch(`http://localhost:${PORT}/`, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

/** 누가 물고 있는지. 못 찾으면 빈 문자열 — 진단용이라 실패해도 그냥 넘어간다. */
function holder() {
  try {
    return execFileSync('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

if (!(await isListening())) process.exit(0);
if (await responds()) process.exit(0);

const who = holder();
console.error(
  [
    '',
    `✗ ${PORT} 번을 물고 있는데 ${HTTP_TIMEOUT_MS / 1000}초 안에 응답하지 않는다.`,
    '',
    '  이대로 두면 Playwright 가 이 죽은 서버를 재사용해서',
    '  e2e 가 통째로 거짓 실패한다. 먼저 정리한다:',
    '',
    who ? `${who}\n` : '',
    `    lsof -nP -iTCP:${PORT} -sTCP:LISTEN   # PID 확인`,
    '    kill <PID>',
    '',
  ].join('\n'),
);
process.exit(1);
