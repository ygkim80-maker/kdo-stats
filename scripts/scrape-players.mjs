// KBO 선수 성적 스크래퍼 v9 — 팀별 드롭다운 + 투수 페이지 확인
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BASE = 'https://www.koreabaseball.com';
const YEAR = String(new Date().getFullYear());

const TEAM_MAP = {
  HT: 'KIA', OB: '두산', SS: '삼성', LG: 'LG', HH: '한화',
  LT: '롯데', KT: 'KT', SK: 'SSG', NC: 'NC', WO: '키움',
};
const TEAM_CODES = Object.keys(TEAM_MAP);

const HITTER_URL = `${BASE}/Record/Player/HitterBasic/Basic1.aspx`;
const PITCHER_URL = `${BASE}/Record/Player/PitcherBasic/Basic1.aspx`;

const TEAM_SELECT = 'select[id*="ddlTeam"]';

const sleep = ms => new Promise(r => setTimeout(r, ms));

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

function parseHitter(row) {
  // cols: rank, name, team, AVG, G, PA, AB, R, H, 2B, 3B, HR, TB, RBI, SB, BB, ...
  if (row.length < 14) return null;
  return {
    name: row[1],
    pos: '타자',
    type: 'hitter',
    stats: {
      G:   +row[4]  || 0,
      PA:  +row[5]  || 0,
      AB:  +row[6]  || 0,
      H:   +row[8]  || 0,
      '2B': +row[9] || 0,
      '3B': +row[10]|| 0,
      HR:  +row[11] || 0,
      RBI: +row[13] || 0,
      R:   +row[7]  || 0,
      SB:  +row[14] || 0,
      BB:  +row[15] || 0,
      SO:  +row[16] || 0,
      AVG: parseFloat(row[3]) || 0,
      OBP: 0, SLG: 0, OPS: 0, ISO: 0, WAR: null,
    },
  };
}

function parsePitcher(row) {
  // cols: rank, name, team, ERA, G, W, L, SV, HLD, PCT, IP, H, HR, BB, HBP, SO, R, ER, WHIP
  if (row.length < 18) return null;
  return {
    name: row[1],
    pos: '투수',
    type: 'pitcher',
    stats: {
      G:    +row[4]  || 0,
      ERA:  parseFloat(row[3]) || 0,
      W:    +row[5]  || 0,
      L:    +row[6]  || 0,
      SV:   +row[7]  || 0,
      HLD:  +row[8]  || 0,
      IP:   row[10]  || '0',
      H:    +row[11] || 0,
      BB:   +row[13] || 0,
      SO:   +row[15] || 0,
      WHIP: parseFloat(row[18]) || 0,
      HR:   +row[12] || 0,
      QS: 0, WAR: null,
    },
  };
}

async function scrapeTeamStats(page, url, parseRow, label) {
  const results = {};
  for (const code of TEAM_CODES) {
    try {
      // 매 팀마다 새로 페이지 로드 후 ASP.NET postback 대기
      await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });
      await page.waitForSelector(TEAM_SELECT, { timeout: 8000 });

      // selectOption → ASP.NET __doPostBack 트리거 → 페이지 재로드
      // Promise.all로 navigation과 selectOption을 동시에 시작해야 race condition 방지
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
        page.selectOption(TEAM_SELECT, code),
      ]);
      await sleep(500); // 렌더링 안정화

      const html = await page.content();
      const rows = tableRows(html).filter(r => r.length >= 5 && /^\d+$/.test(r[0]));
      const players = rows.map(parseRow).filter(Boolean);
      results[code] = players;
      console.log(`${label} ${code}(${TEAM_MAP[code]}): ${players.length}명`);
      if (players.length > 0) console.log(`  샘플: ${players[0].name}`);
    } catch (e) {
      console.log(`${label} ${code} 오류: ${e.message.split('\n')[0]}`);
      results[code] = [];
    }
  }
  return results;
}

async function main() {
  if (!existsSync('data')) await mkdir('data');

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  let hittersByTeam = {}, pitchersByTeam = {};
  try {
    const page = await browser.newPage();

    console.log('=== 타자 팀별 수집 ===');
    hittersByTeam = await scrapeTeamStats(page, HITTER_URL, parseHitter, '타자');

    console.log('\n=== 투수 팀별 수집 ===');
    pitchersByTeam = await scrapeTeamStats(page, PITCHER_URL, parsePitcher, '투수');

    await page.close();
  } finally {
    await browser.close();
  }

  let savedCount = 0;
  for (const code of TEAM_CODES) {
    const hitters = hittersByTeam[code] || [];
    const pitchers = pitchersByTeam[code] || [];
    if (hitters.length > 0 || pitchers.length > 0) {
      await writeFile(`data/players-${code}.json`, JSON.stringify({
        updatedAt: new Date().toISOString(),
        year: +YEAR,
        hitters,
        pitchers,
      }, null, 2) + '\n');
      console.log(`저장: data/players-${code}.json (타자:${hitters.length}, 투수:${pitchers.length})`);
      savedCount++;
    }
  }

  if (savedCount === 0) {
    console.error('데이터 없음 — 모든 팀 수집 실패');
    process.exit(1);
  }
  console.log(`\n완료: ${savedCount}개 팀 저장됨`);
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
