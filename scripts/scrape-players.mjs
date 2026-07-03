// KBO 선수 성적 스크래퍼 v6 — Playwright + 시스템 Chrome으로 JS 렌더링
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = 'https://www.koreabaseball.com';
const YEAR = String(new Date().getFullYear());

const TEAM_MAP = {
  HT:'KIA', OB:'두산', SS:'삼성', LG:'LG', HH:'한화',
  LT:'롯데', KT:'KT', SK:'SSG', NC:'NC', WO:'키움',
};
const TEAM_CODES = Object.keys(TEAM_MAP);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 시스템에 설치된 Chrome/Chromium 경로 탐색
function findChrome() {
  const candidates = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // which 명령으로도 시도
  try {
    return execSync('which google-chrome-stable chromium-browser chromium 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
  } catch { return null; }
}

function stripTags(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function tableRows(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let tm;
    while ((tm = tdRe.exec(m[1]))) cells.push(stripTags(tm[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

// Playwright로 JS 렌더링 후 테이블 데이터 추출
async function scrapeWithPlaywright(teamCode, type) {
  const { chromium } = await import('playwright');
  const chromePath = findChrome();
  console.log(`  Chrome: ${chromePath || '(not found, using default)'}`);

  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  };
  if (chromePath) launchOpts.executablePath = chromePath;

  const browser = await chromium.launch(launchOpts);
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ko-KR,ko;q=0.9',
    });

    const suffix = type === 'hitter' ? 'HitterBasic/Basic.aspx' : 'PitcherBasic/Basic.aspx';
    const url = `${BASE}/Record/Player/${suffix}?teamCode=${teamCode}&sort=${type === 'hitter' ? 'OPS' : 'ERA'}&order=${type === 'hitter' ? 'DESC' : 'ASC'}`;

    console.log(`  ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // 테이블이 로드될 때까지 대기
    try {
      await page.waitForSelector('table tbody tr td', { timeout: 10000 });
    } catch {
      // 타임아웃 — 현재 HTML에서 최선을 다해 추출
    }

    const html = await page.content();

    if (teamCode === 'HT' && type === 'hitter') {
      const title = await page.title();
      console.log(`  페이지 제목: ${title}`);
      const hasTable = html.includes('<table');
      const hasTd = html.includes('<td');
      console.log(`  table: ${hasTable}, td: ${hasTd}, len: ${html.length}`);
      console.log('  HTML 샘플:', html.substring(0, 500).replace(/\n/g, ' '));
    }

    return tableRows(html);
  } finally {
    await browser.close();
  }
}

async function parseHitters(rows) {
  // 타자 행: 0=순위 1=팀 2=선수 3=G 4=PA 5=AB 6=H 7=2B 8=3B 9=HR 10=RBI 11=R 12=SB 13=BB 14=SO 15=AVG 16=OBP 17=SLG 18=OPS
  const players = [];
  for (const row of rows) {
    if (row.length < 16 || !/^\d+$/.test(row[0])) continue;
    const name = row[2];
    if (!name) continue;
    const avg = parseFloat(row[15]) || 0;
    const obp = parseFloat(row[16]) || 0;
    const slg = parseFloat(row[17]) || 0;
    players.push({
      name, pos: '타자', type: 'hitter',
      stats: {
        G: +row[3]||0, PA: +row[4]||0, AB: +row[5]||0, H: +row[6]||0,
        '2B': +row[7]||0, '3B': +row[8]||0, HR: +row[9]||0,
        RBI: +row[10]||0, R: +row[11]||0, SB: +row[12]||0,
        BB: +row[13]||0, SO: +row[14]||0,
        AVG: avg, OBP: obp, SLG: slg,
        OPS: parseFloat((obp+slg).toFixed(3)),
        ISO: parseFloat((slg-avg).toFixed(3)), WAR: null,
      },
    });
  }
  return players;
}

async function parsePitchers(rows) {
  // 투수 행: 0=순위 1=팀 2=선수 3=G 4=ERA 5=W 6=L 7=SV 8=HLD 9=IP 10=H 11=BB 12=HBP 13=SO 14=R 15=ER 16=WHIP
  const players = [];
  for (const row of rows) {
    if (row.length < 10 || !/^\d+$/.test(row[0])) continue;
    const name = row[2];
    if (!name) continue;
    players.push({
      name, pos: '투수', type: 'pitcher',
      stats: {
        G: +row[3]||0, ERA: parseFloat(row[4])||0,
        W: +row[5]||0, L: +row[6]||0, SV: +row[7]||0, HLD: +row[8]||0,
        IP: row[9]||'0', H: +row[10]||0, BB: +row[11]||0,
        SO: +row[13]||0, WHIP: parseFloat(row[16])||0,
        HR: 0, QS: 0, WAR: null,
      },
    });
  }
  return players;
}

async function main() {
  if (!existsSync('data')) await mkdir('data');

  // Playwright 브라우저 한 번에 하나씩 (브라우저 재사용은 복잡하므로 팀별 새 인스턴스)
  let grandTotal = 0;

  for (const code of TEAM_CODES) {
    console.log(`\n${code}(${TEAM_MAP[code]}) 수집 중...`);
    try {
      const [hitterRows, pitcherRows] = await Promise.all([
        scrapeWithPlaywright(code, 'hitter'),
        scrapeWithPlaywright(code, 'pitcher'),
      ]);

      const hitters = (await parseHitters(hitterRows)).sort((a,b) => (b.stats.OPS||0) - (a.stats.OPS||0));
      const pitchers = (await parsePitchers(pitcherRows)).sort((a,b) => (a.stats.ERA||99) - (b.stats.ERA||99));

      await writeFile(
        `data/players-${code}.json`,
        JSON.stringify({ updatedAt: new Date().toISOString(), year: +YEAR, hitters, pitchers }, null, 2) + '\n',
      );
      grandTotal += hitters.length + pitchers.length;
      console.log(`  → 타자${hitters.length} 투수${pitchers.length} 저장`);
    } catch (e) {
      console.log(`  ${code} 실패: ${e.message}`);
    }
    await sleep(500);
  }

  console.log(`\n완료: 총 ${grandTotal}명`);
  if (grandTotal === 0) { console.error('데이터를 하나도 수집하지 못함'); process.exit(1); }
}

main().catch(e => { console.error('치명 오류:', e.message, e.stack); process.exit(1); });
