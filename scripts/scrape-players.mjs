// KBO 선수 성적 스크래퍼 v8 — Basic1.aspx 확인 완료, 팀별 필터 및 투수 URL 탐색
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BASE = 'https://www.koreabaseball.com';
const YEAR = String(new Date().getFullYear());

// KBO 팀 코드: ASMX GetTeamList에서 확인된 코드
const TEAM_MAP = {
  HT: 'KIA', OB: '두산', SS: '삼성', LG: 'LG', HH: '한화',
  LT: '롯데', KT: 'KT', SK: 'SSG', NC: 'NC', WO: '키움',
};
const TEAM_CODES = Object.keys(TEAM_MAP);

const HITTER_COLS = ['rank','name','team','AVG','G','PA','AB','R','H','2B','3B','HR','TB','RBI','SB','BB','SO','GDP','SLG','OBP'];
const PITCHER_COLS = ['rank','name','team','ERA','G','W','L','SV','HLD','IP','H','HR','BB','HBP','SO','R','ER','WHIP'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchHtml(url, headers = {}) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      ...headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
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

// POST to ASP.NET ASMX web service
async function callAsmx(endpoint, method, params = {}) {
  const url = `${BASE}/ws/${endpoint}.asmx/${method}`;
  const body = JSON.stringify(params);
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'User-Agent': 'Mozilla/5.0',
      'Referer': `${BASE}/Record/Player/HitterBasic/Basic1.aspx`,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  const text = await r.text();
  console.log(`  ASMX ${endpoint}/${method} → ${r.status}: ${text.substring(0, 200)}`);
  if (!r.ok) return null;
  try { return JSON.parse(text); } catch { return text; }
}

// Playwright로 페이지 탐색 + 팀별 필터 시도
async function scrapeWithPlaywright(browser) {
  const page = await browser.newPage();
  const apiCalls = [];

  page.on('response', async res => {
    const u = res.url();
    const ct = res.headers()['content-type'] || '';
    if ((ct.includes('json') || u.includes('.asmx') || u.includes('ashx')) && u.includes('koreabaseball')) {
      try {
        const body = await res.text().catch(() => '');
        if (body.length > 20) apiCalls.push({ url: u, body });
      } catch { /* ignore */ }
    }
  });

  // 1. 타자 Basic1 페이지에서 팀 드롭다운 찾기
  console.log('\n[Playwright] 타자 Basic1.aspx 로드...');
  await page.goto(`${BASE}/Record/Player/HitterBasic/Basic1.aspx`, { waitUntil: 'networkidle', timeout: 25000 });

  const hitterHtml = await page.content();
  const hitterRows = tableRows(hitterHtml).filter(r => r.length >= 5 && /^\d+$/.test(r[0]));
  console.log(`  타자 행수: ${hitterRows.length}`);
  if (hitterRows.length > 0) console.log(`  샘플: ${JSON.stringify(hitterRows[0])}`);

  // 드롭다운 select 요소 찾기
  const selects = await page.$$eval('select', els => els.map(el => ({
    name: el.name, id: el.id, options: [...el.options].map(o => ({ v: o.value, t: o.text }))
  })));
  console.log(`  select 요소: ${JSON.stringify(selects)}`);

  // 팀 관련 select 찾기
  const teamSelect = selects.find(s => s.options.some(o => ['LG','SS','KT','HT','HH','LT','OB','SK','NC','WO'].includes(o.v)));
  if (teamSelect) {
    console.log(`  팀 선택 드롭다운 발견: ${teamSelect.name || teamSelect.id}`);
    console.log(`  팀 옵션: ${JSON.stringify(teamSelect.options)}`);
  }

  // URL 파라미터로 팀 필터 시도
  console.log('\n[Playwright] 팀 파라미터 테스트...');
  const testTeam = 'LG';
  const testUrls = [
    `${BASE}/Record/Player/HitterBasic/Basic1.aspx?teamCode=${testTeam}`,
    `${BASE}/Record/Player/HitterBasic/Basic1.aspx?strTeamCode=${testTeam}`,
    `${BASE}/Record/Player/HitterBasic/Basic1.aspx?teamCode=${testTeam}&sort=HRA_RT`,
  ];
  for (const url of testUrls) {
    apiCalls.length = 0;
    await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    const html = await page.content();
    const rows = tableRows(html).filter(r => r.length >= 5 && /^\d+$/.test(r[0]));
    console.log(`  ${url.replace(BASE, '')}: ${rows.length}행, API:${apiCalls.length}개`);
    if (rows.length > 0 && rows.length < 30) {
      console.log('  -> 팀 필터 작동! 샘플:', JSON.stringify(rows[0]));
    }
    if (apiCalls.length > 0) {
      console.log('  API 호출:');
      apiCalls.forEach(c => console.log(`    ${c.url}\n      ${c.body.substring(0, 150)}`));
    }
  }

  // 투수 페이지 테스트
  console.log('\n[Playwright] 투수 URL 테스트...');
  const pitcherUrls = [
    `${BASE}/Record/Player/PitcherBasic/Basic1.aspx`,
    `${BASE}/Record/Player/PitcherBasic/Basic2.aspx`,
    `${BASE}/Record/Player/Pitcher/Basic1.aspx`,
  ];
  for (const url of pitcherUrls) {
    try {
      apiCalls.length = 0;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      const title = await page.title();
      const html = await page.content();
      const rows = tableRows(html).filter(r => r.length >= 5 && /^\d+$/.test(r[0]));
      console.log(`  ${url.replace(BASE, '')}: "${title}", ${rows.length}행`);
      if (rows.length > 0) console.log(`  샘플: ${JSON.stringify(rows[0])}`);
    } catch (e) {
      console.log(`  ${url.replace(BASE, '')}: 오류 ${e.message}`);
    }
  }

  // 드롭다운이 있으면 팀별 데이터 수집
  await page.goto(`${BASE}/Record/Player/HitterBasic/Basic1.aspx`, { waitUntil: 'networkidle', timeout: 25000 });
  const selectsAgain = await page.$$eval('select', els => els.map(el => ({
    name: el.name, id: el.id, options: [...el.options].map(o => ({ v: o.value, t: o.text }))
  })));
  const ts = selectsAgain.find(s => s.options.some(o => ['LG','SS','KT','HT','HH','LT','OB','SK','NC','WO'].includes(o.v)));

  if (ts) {
    console.log('\n[Playwright] 드롭다운으로 팀별 수집 시도...');
    const selectEl = await page.$(`select[name="${ts.name}"], select#${ts.id}`);
    if (selectEl) {
      for (const opt of ts.options.filter(o => TEAM_CODES.includes(o.v))) {
        await selectEl.selectOption(opt.v);
        await sleep(500);
        // 폼 submit 또는 이벤트 트리거
        try {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 8000 }).catch(() => {}),
            selectEl.dispatchEvent('change'),
          ]);
          const html = await page.content();
          const rows = tableRows(html).filter(r => r.length >= 5 && /^\d+$/.test(r[0]));
          console.log(`  ${opt.v}(${opt.t}): ${rows.length}행`);
          if (rows.length > 0) console.log(`    샘플: ${JSON.stringify(rows[0])}`);
        } catch (e) {
          console.log(`  ${opt.v}: ${e.message}`);
        }
      }
    }
  }

  await page.close();
  return { hitterRows };
}

// HTML 파싱으로 직접 수집 (팀 필터 없이 전체)
async function scrapeAllHitters() {
  console.log('\n[HTTP] 타자 전체 수집 시도...');
  const results = { hitters: [], pitchers: [] };

  // 기본 타자 페이지
  try {
    const html = await fetchHtml(`${BASE}/Record/Player/HitterBasic/Basic1.aspx`);
    const rows = tableRows(html).filter(r => r.length >= 10 && /^\d+$/.test(r[0]));
    console.log(`  타자 기본: ${rows.length}행`);
    for (const row of rows) {
      const teamKor = row[2];
      const teamCode = Object.entries(TEAM_MAP).find(([,v]) => v === teamKor)?.[0] || row[2];
      results.hitters.push({
        name: row[1], team: teamCode, teamKor,
        AVG: parseFloat(row[3]) || 0,
        G: +row[4] || 0, PA: +row[5] || 0, AB: +row[6] || 0,
        R: +row[7] || 0, H: +row[8] || 0,
        '2B': +row[9] || 0, '3B': +row[10] || 0, HR: +row[11] || 0,
        TB: +row[12] || 0, RBI: +row[13] || 0, SB: +row[14] || 0,
        BB: +row[15] || 0,
      });
    }
  } catch (e) {
    console.log('  타자 기본 실패:', e.message);
  }

  return results;
}

async function main() {
  if (!existsSync('data')) await mkdir('data');

  // HTTP로 타자 데이터 수집
  const { hitters } = await scrapeAllHitters();
  console.log(`수집된 타자: ${hitters.length}명`);

  // Playwright로 추가 탐색
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    await scrapeWithPlaywright(browser);
  } finally {
    await browser.close();
  }

  // ASMX 웹서비스 직접 호출 시도
  console.log('\n[ASMX] 웹서비스 직접 호출 시도...');
  const asmxEndpoints = [
    ['Record', 'GetHitterBasicList', { gameTypeCode: 'RS', teamCode: 'LG', sortColumn: 'HRA_RT', sortOrder: 'DESC', currentPage: 1 }],
    ['Record', 'GetHitterList', { teamCode: 'LG', gameTypeCode: 'RS' }],
    ['Player', 'GetHitterBasicList', { teamCode: 'LG' }],
    ['Stats', 'GetHitterBasicList', { teamCode: 'LG' }],
  ];
  for (const [svc, method, params] of asmxEndpoints) {
    await callAsmx(svc, method, params).catch(e => console.log(`  ${svc}/${method} 오류: ${e.message}`));
    await sleep(300);
  }

  // 결과 저장 (HTTP로 수집한 타자 데이터, 팀별 분류)
  const byTeam = {};
  for (const code of TEAM_CODES) byTeam[code] = { hitters: [], pitchers: [] };

  for (const h of hitters) {
    const code = TEAM_CODES.find(c => TEAM_MAP[c] === h.teamKor) || Object.keys(TEAM_MAP).find(k => k === h.team);
    if (code && byTeam[code]) {
      byTeam[code].hitters.push({
        name: h.name, pos: '타자', type: 'hitter',
        stats: {
          G: h.G, PA: h.PA, AB: h.AB, H: h.H,
          '2B': h['2B'], '3B': h['3B'], HR: h.HR,
          RBI: h.RBI, R: h.R, SB: h.SB, BB: h.BB,
          SO: 0, AVG: h.AVG, OBP: 0, SLG: 0, OPS: 0, ISO: 0, WAR: null,
        },
      });
    }
  }

  let savedCount = 0;
  for (const code of TEAM_CODES) {
    const d = byTeam[code];
    if (d.hitters.length > 0 || d.pitchers.length > 0) {
      await writeFile(`data/players-${code}.json`, JSON.stringify({
        updatedAt: new Date().toISOString(),
        year: +YEAR,
        hitters: d.hitters,
        pitchers: d.pitchers,
      }, null, 2) + '\n');
      console.log(`저장: data/players-${code}.json (타자:${d.hitters.length}, 투수:${d.pitchers.length})`);
      savedCount++;
    }
  }

  if (savedCount === 0) {
    console.log('\n데이터 없음 — 빈 파일 생성 (탐색 결과 확인 필요)');
    for (const code of TEAM_CODES) {
      const path = `data/players-${code}.json`;
      if (!existsSync(path)) {
        await writeFile(path, JSON.stringify({
          updatedAt: new Date().toISOString(), year: +YEAR,
          hitters: [], pitchers: [],
        }, null, 2) + '\n');
      }
    }
    process.exit(1);
  }

  console.log(`\n완료: ${savedCount}개 팀 저장됨`);
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
