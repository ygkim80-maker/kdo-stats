// KBO 선수 성적 스크래퍼 v7b — TeamRank 페이지에서 nav 링크 추출 후 Playwright로 탐색
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BASE = 'https://www.koreabaseball.com';
const YEAR = String(new Date().getFullYear());

const TEAM_MAP = {
  HT:'KIA', OB:'두산', SS:'삼성', LG:'LG', HH:'한화',
  LT:'롯데', KT:'KT', SK:'SSG', NC:'NC', WO:'키움',
};
const TEAM_CODES = Object.keys(TEAM_MAP);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
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

// TeamRank.aspx HTML에서 모든 링크를 추출해 player stats URL 후보 탐색
async function discoverPlayerUrls() {
  console.log('TeamRank 페이지에서 링크 탐색 중...');
  const html = await get(`${BASE}/Record/TeamRank/TeamRank.aspx`);

  // 모든 href 값 추출
  const hrefRe = /href="([^"]+)"/gi;
  const hrefs = new Set();
  let m;
  while ((m = hrefRe.exec(html))) {
    const h = m[1];
    if (h.startsWith('/') || h.startsWith(BASE)) hrefs.add(h);
  }

  const allLinks = [...hrefs].map(h => h.startsWith('/') ? BASE + h : h);
  console.log(`=== TeamRank 페이지 .aspx 링크 전체 (${allLinks.filter(l=>l.includes('.aspx')).length}개) ===`);
  allLinks.filter(l => l.includes('.aspx')).forEach(l => console.log('  ' + l));

  // JS 파일에서 player stats URL 탐색
  const jsRe = /src="([^"]*\.js[^"]*)"/gi;
  const jsFiles = [];
  while ((m = jsRe.exec(html))) {
    const s = m[1];
    jsFiles.push(s.startsWith('/') ? BASE + s : s);
  }
  console.log(`\nJS 파일 수: ${jsFiles.length}`);

  // player/hitter 관련 링크 필터
  const playerLinks = allLinks.filter(l =>
    /hitter|pitcher|player|record.*player|player.*record/i.test(l)
  );
  console.log(`\n선수/기록 관련 링크: ${playerLinks.length}개`);
  playerLinks.forEach(l => console.log('  ' + l));

  // 전체 HTML에서 aspx 경로 패턴 검색 (href 이외)
  const aspxRe = /\/[A-Za-z\/]+\.aspx/g;
  const aspxPaths = new Set();
  while ((m = aspxRe.exec(html))) {
    if (m[0].match(/[Hh]itter|[Pp]itcher|[Pp]layer/)) aspxPaths.add(m[0]);
  }
  console.log('\nHTML 내 player/hitter/pitcher .aspx 경로:');
  aspxPaths.forEach(p => console.log('  ' + p));

  return playerLinks;
}

// Playwright로 URL 테스트 + API 인터셉트
async function testWithPlaywright(browser, urls) {
  const page = await browser.newPage();
  const apiCalls = [];

  page.on('response', async res => {
    const u = res.url();
    const ct = res.headers()['content-type'] || '';
    if ((ct.includes('json') || u.includes('.asmx') || u.includes('ashx') || u.includes('api'))
        && u.includes('koreabaseball')) {
      try {
        const body = await res.text().catch(() => '');
        if (body.length > 50) apiCalls.push({ url: u, snippet: body.substring(0, 200) });
      } catch { /* ignore */ }
    }
  });

  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      const title = await page.title();
      const html = await page.content();
      const rows = tableRows(html);
      const dataRows = rows.filter(r => r.length >= 5 && /^\d+$/.test(r[0]));
      console.log(`\n${url}`);
      console.log(`  제목: ${title}, 행수: ${dataRows.length}, API감지: ${apiCalls.length}개`);
      if (dataRows.length > 0) {
        console.log('  샘플행:', JSON.stringify(dataRows[0]));
      }
      if (apiCalls.length > 0) {
        console.log('  API 호출:');
        apiCalls.forEach(c => console.log(`    ${c.url}\n      ${c.snippet}`));
        apiCalls.length = 0;
      }
    } catch (e) {
      console.log(`  오류: ${e.message}`);
    }
  }
  await page.close();
}

async function main() {
  if (!existsSync('data')) await mkdir('data');

  // 단계 1: 링크 탐색
  const discovered = await discoverPlayerUrls().catch(e => {
    console.log('링크 탐색 실패:', e.message);
    return [];
  });

  // 단계 2: Playwright로 추가 URL 탐색
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const testUrls = [
      ...discovered.slice(0, 5),
      // 추가 후보들
      `${BASE}/Record/Player/HitterBasic/BasicOps.aspx`,
      `${BASE}/Stats/Hitter/BasicHitting.aspx`,
      `${BASE}/Record/Player/Hitter/BasicHitting.aspx`,
      `${BASE}/Record/TeamRank/TeamRank.aspx`, // 기준점 (작동 확인)
    ];
    await testWithPlaywright(browser, testUrls);
  } finally {
    await browser.close();
  }

  // 빈 파일 생성 (에러 방지)
  for (const code of TEAM_CODES) {
    const path = `data/players-${code}.json`;
    if (!existsSync(path)) {
      await writeFile(path, JSON.stringify({
        updatedAt: new Date().toISOString(), year: +YEAR,
        hitters: [], pitchers: [],
      }, null, 2) + '\n');
    }
  }

  console.log('\n탐색 완료. 로그에서 올바른 URL 확인 필요.');
  process.exit(1);
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
