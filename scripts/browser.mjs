/**
 * 개발 서버를 띄우고 브라우저로 열어 스크린샷을 남기는 도구.
 *
 *   node scripts/browser.mjs                     # 에디터 첫 화면 캡처
 *   node scripts/browser.mjs --out /tmp/shots    # 저장 위치 지정
 *   node scripts/browser.mjs --url /?foo=1       # 다른 경로 열기
 *   node scripts/browser.mjs --headed            # 창을 띄워서 보기 (X 서버 필요)
 *
 * 이미 dev 서버가 떠 있으면 그걸 그대로 쓰고, 없으면 직접 띄웠다가 끝날 때 정리한다.
 * 콘솔 오류와 처리되지 않은 예외를 모아서 마지막에 보고하므로, 화면은 그려졌지만
 * 조용히 터진 경우도 드러난다.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Chromium에 넘길 환경 변수.
 *
 * root로 `playwright install-deps`를 돌릴 수 없는 환경에서는
 * scripts/setup-browser-sysroot.sh가 필요한 .deb들을 홈 디렉터리에 풀어둔다.
 * 그 디렉터리가 있으면 라이브러리와 폰트 경로를 브라우저 프로세스에 물려준다.
 * 시스템에 정식으로 깔려 있으면 이 디렉터리가 없고, 그대로 기본 환경을 쓴다.
 */
function browserEnv() {
  const sysroot = process.env.CHROMIUM_SYSROOT
    ?? path.join(os.homedir(), '.local/share/chromium-sysroot');
  const root = path.join(sysroot, 'root');
  if (!existsSync(root)) return undefined;

  return {
    ...process.env,
    LD_LIBRARY_PATH: [
      path.join(root, 'usr/lib/x86_64-linux-gnu'),
      path.join(root, 'lib/x86_64-linux-gnu'),
      path.join(root, 'usr/lib'),
      process.env.LD_LIBRARY_PATH,
    ].filter(Boolean).join(':'),
    FONTCONFIG_PATH: path.join(root, 'etc/fonts'),
    XDG_DATA_DIRS: path.join(root, 'usr/share'),
  };
}

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const PORT = Number(flag('port', 3000));
const BASE = `http://127.0.0.1:${PORT}`;
const OUT_DIR = path.resolve(flag('out', 'screenshots'));
const ROUTE = flag('url', '/');
const HEADED = args.includes('--headed');

/** 서버가 응답할 때까지 기다린다 (최대 timeoutMs) */
async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return true;
    } catch {
      // 아직 안 떴을 뿐이므로 계속 기다린다
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function startDevServer() {
  if (await waitForServer(1000)) {
    console.log(`기존 dev 서버 사용: ${BASE}`);
    return null;
  }
  console.log('dev 서버 시작 중...');
  const child = spawn('npm', ['run', 'dev'], {
    stdio: 'ignore',
    // 파일 감시가 켜져 있으면 캡처 중에 HMR이 끼어들어 화면이 흔들린다
    env: { ...process.env, DISABLE_HMR: 'true' },
    detached: true,
  });
  if (!(await waitForServer())) {
    process.kill(-child.pid, 'SIGTERM');
    throw new Error(`dev 서버가 ${BASE}에서 응답하지 않습니다.`);
  }
  return child;
}

const server = await startDevServer();
const browser = await chromium.launch({ headless: !HEADED, env: browserEnv() });

try {
  await mkdir(OUT_DIR, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const problems = [];
  page.on('console', msg => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', err => problems.push(`예외: ${err.message}`));

  await page.goto(BASE + ROUTE, { waitUntil: 'networkidle' });
  // 캔버스 첫 렌더가 끝날 시간을 준다
  await page.waitForTimeout(500);

  const shot = path.join(OUT_DIR, 'editor.png');
  await page.screenshot({ path: shot, fullPage: false });
  console.log(`저장: ${shot}`);

  if (problems.length > 0) {
    console.log(`\n브라우저에서 보고된 문제 ${problems.length}건:`);
    problems.forEach(p => console.log(`  - ${p}`));
    process.exitCode = 1;
  } else {
    console.log('\n콘솔 오류 없음.');
  }
} finally {
  await browser.close();
  if (server) process.kill(-server.pid, 'SIGTERM');
}
