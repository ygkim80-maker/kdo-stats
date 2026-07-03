// KBO 선수 성적 스크래퍼 v7 — Playwright으로 KBO 홈에서 실제 URL 탐색 후 데이터 수집
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BASE = 'https://www.koreabaseball.com';
const YEAR = String(new Date().getFullYear());

const TEAM_MAP = {
  HT:'KIA', OB:'두산', SS:'삼성', LG:'LG', HH:'한화',
  LT:'롯데', KT:'KT', SK:'SSG', NC:'NC', WO:'키움',
};
const TEAM_CODES = Object.keys(TEAM_MAP);

// 사이트에서 실제로 쓰는 팀명 → 코드
const SITE_TEAM_TO_CODE = {
  'KIA':'HT', '기아':'HT',
  '두산':'OB',
  '삼성':'SS',
  'LG':'LG',
  '한화':'HH',
  '롯데':'LT',
  'KT':'KT',
  'SSG':'SK',
  'NC':'NC',
  '키움':'WO',
};

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

async function findPlayerStatsUrls(browser) {
  const page = await browser.newPage();
  const apiCalls = [];

  // 네트워크 요청 가로채기
  page.on('request', req => {
    const url = req.url();
    if (req.resourceType() !== 'document' && req.resourceType() !== 'image'
        && req.resourceType() !== 'stylesheet' && req.resourceType() !== 'font'
        && !url.includes('google') && !url.includes('analytics')) {
      apiCalls.push({ url, method: req.method(), type: req.resourceType() });
    }
  });

  try {
    console.log('KBO 홈페이지 탐색 중...');
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });

    // 네비게이션 메뉴에서 기록/선수 관련 링크 찾기
    const navLinks = await page.$$eval('a', as =>
      as.map(a => ({ href: a.href, text: a.textContent.trim() }))
        .filter(l => l.href && l.href.includes('koreabaseball.com') && l.text.length > 0)
    );

    const statsLinks = navLinks.filter(l =>
      l.text.match(/기록|선수|타자|투수|스탯|Record|Player|Hitter|Pitcher/i) ||
      l.href.match(/Record|Player|Hitter|Pitcher|Stats/i)
    );
    console.log('=== 기록/선수 관련 링크 ===');
    statsLinks.slice(0, 30).forEach(l => console.log(`  ${l.text}: ${l.href}`));

    // 기록 페이지로 직접 이동 시도
    const recordPage = statsLinks.find(l => l.href.includes('/Record'));
    if (recordPage) {
      console.log(`\n기록 페이지로 이동: ${recordPage.href}`);
      await page.goto(recordPage.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const subLinks = await page.$$eval('a', as =>
        as.map(a => ({ href: a.href, text: a.textContent.trim() }))
          .filter(l => l.href && l.href.includes('koreabaseball.com')
                    && (l.href.includes('Hitter') || l.href.includes('Pitcher') || l.href.includes('Player')))
      );
      console.log('=== 선수 기록 하위 링크 ===');
      subLinks.slice(0, 20).forEach(l => console.log(`  ${l.text}: ${l.href}`));
    }

    // 전체 링크 중 .aspx 경로 추출
    const allLinks = await page.$$eval('a', as => as.map(a => a.href));
    const aspxLinks = [...new Set(allLinks.filter(h => h.includes('.aspx') && h.includes('koreabaseball.com')))];
    console.log('\n=== 현재 페이지의 .aspx 링크 (최대 30개) ===');
    aspxLinks.slice(0, 30).forEach(l => console.log('  ' + l));

    console.log('\n=== API/XHR 호출 감지 ===');
    apiCalls.slice(0, 20).forEach(c => console.log(`  [${c.type}] ${c.method} ${c.url.substring(0, 100)}`));

    return statsLinks;
  } finally {
    await page.close();
  }
}

async function scrapeWithPlaywright(page, url) {
  const apiCalls = [];
  page.on('response', async res => {
    const u = res.url();
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json') && u.includes('koreabaseball')) {
      try {
        const body = await res.text();
        if (body.length > 100) apiCalls.push({ url: u, body: body.substring(0, 500) });
      } catch { /* ignore */ }
    }
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 25000 });

  const title = await page.title();
  const html = await page.content();
  const isError = title.includes('에러') || html.includes('errorcon');

  if (apiCalls.length > 0) {
    console.log(`  JSON API 응답 감지 (${apiCalls.length}개):`);
    apiCalls.slice(0, 3).forEach(c => console.log(`    ${c.url}\n      ${c.body.substring(0, 200)}`));
  }

  if (!isError) {
    console.log(`  성공: ${title} (len=${html.length})`);
    return html;
  }
  console.log(`  에러 페이지: ${title}`);
  return null;
}

async function main() {
  if (!existsSync('data')) await mkdir('data');
  const { chromium } = await import('playwright');

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    // 단계 1: 실제 URL 탐색
    await findPlayerStatsUrls(browser);

    // 단계 2: 알려진 URL들 시도 (진단용)
    const testUrls = [
      `${BASE}/Record/Player/HitterBasic/Basic.aspx`,
      `${BASE}/Record/Player/PitcherBasic/Basic.aspx`,
      `${BASE}/Stats/Player/Hitter.aspx`,
      `${BASE}/Record/Hitter/Basic.aspx`,
      `${BASE}/Record/Player/Hitter/Basic.aspx`,
      `${BASE}/Record/TeamRank/TeamRank.aspx`,
    ];

    console.log('\n=== URL 테스트 ===');
    const page2 = await browser.newPage();
    for (const url of testUrls) {
      const html = await scrapeWithPlaywright(page2, url);
      if (html) {
        const rows = tableRows(html);
        const dataRows = rows.filter(r => r.length >= 5 && /^\d+$/.test(r[0]));
        console.log(`  데이터 행 수: ${dataRows.length}`);
        if (dataRows.length > 0) console.log(`  샘플: ${JSON.stringify(dataRows[0])}`);
      }
    }
    await page2.close();

  } finally {
    await browser.close();
  }

  // 데이터 수집 실패 시 빈 파일 저장 (에러 방지)
  if (!existsSync('data')) await mkdir('data');
  for (const code of TEAM_CODES) {
    const path = `data/players-${code}.json`;
    if (!existsSync(path)) {
      await writeFile(path, JSON.stringify({
        updatedAt: new Date().toISOString(), year: +YEAR,
        hitters: [], pitchers: [],
      }, null, 2) + '\n');
    }
  }

  console.log('\n탐색 완료. 로그를 확인하여 올바른 URL을 파악하세요.');
  process.exit(1); // 아직 데이터 없음
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
