// KBO 선수 성적 스크래퍼 v5
// 전략: 기록실 전체 선수 목록 페이지에서 모든 팀 동시에 수집 후 팀명으로 분류
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BASE = 'https://www.koreabaseball.com';
const YEAR = String(new Date().getFullYear());

// KBO 사이트 팀명 → 내부 코드 매핑
const TEAM_NAME_MAP = {
  'KIA':'HT', 'Kia':'HT', '기아':'HT',
  '두산':'OB', 'Doosan':'OB',
  '삼성':'SS', 'Samsung':'SS',
  'LG':'LG',
  '한화':'HH', 'Hanwha':'HH',
  '롯데':'LT', 'Lotte':'LT',
  'KT':'KT',
  'SSG':'SK',
  'NC':'NC',
  '키움':'WO', 'Kiwoom':'WO',
};

const TEAM_CODES = ['HT','OB','SS','LG','HH','LT','KT','SK','NC','WO'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Referer': BASE + '/Record/Player/',
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

function stripTags(s) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim();
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

function teamNameToCode(name) {
  return TEAM_NAME_MAP[name?.trim()] || null;
}

// 전체 타자 목록 수집 (여러 페이지)
async function fetchAllHitters() {
  const byTeam = {};
  TEAM_CODES.forEach(c => (byTeam[c] = []));
  const seen = new Set();

  // 전체 선수 목록 페이지 시도
  const listUrls = [
    `${BASE}/Record/Player/HitterDetail/Basic1.aspx`,
    `${BASE}/Record/Player/HitterBasic/Basic.aspx`,
    `${BASE}/Record/Player/Hitter/Basic.aspx`,
  ];

  let html = null;
  let usedUrl = '';
  for (const url of listUrls) {
    try {
      const h = await get(url);
      if (h.includes('<table') && h.includes('<td') && !h.includes('errorcon')) {
        html = h; usedUrl = url;
        console.log(`타자 목록 URL 성공: ${url.split('/').slice(-2).join('/')}`);
        break;
      } else {
        console.log(`타자 URL 실패(에러페이지): ${url.split('/').slice(-2).join('/')}`);
      }
    } catch (e) {
      console.log(`타자 URL 예외: ${e.message}`);
    }
  }

  if (!html) {
    console.log('모든 타자 목록 URL 실패');
    return byTeam;
  }

  // 진단
  console.log('=== 타자 목록 HTML 샘플 ===');
  console.log(html.substring(0, 1500));
  console.log('=== 샘플 끝 ===');

  const rows = tableRows(html);
  console.log(`전체 행 수: ${rows.length}`);
  if (rows.length > 0) console.log('첫 행:', JSON.stringify(rows[0]));
  if (rows.length > 1) console.log('두번째 행:', JSON.stringify(rows[1]));

  // 행 파싱: 0=순위 1=팀 2=선수 ...
  for (const row of rows) {
    if (row.length < 14 || !/^\d+$/.test(row[0])) continue;
    const teamCode = teamNameToCode(row[1]);
    if (!teamCode) continue;
    const name = row[2];
    if (!name || seen.has(teamCode + ':' + name)) continue;
    seen.add(teamCode + ':' + name);
    const avg = parseFloat(row[15]) || 0;
    const obp = parseFloat(row[16]) || 0;
    const slg = parseFloat(row[17]) || 0;
    byTeam[teamCode].push({
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
  return byTeam;
}

// 전체 투수 목록 수집
async function fetchAllPitchers() {
  const byTeam = {};
  TEAM_CODES.forEach(c => (byTeam[c] = []));
  const seen = new Set();

  const listUrls = [
    `${BASE}/Record/Player/PitcherDetail/Basic1.aspx`,
    `${BASE}/Record/Player/PitcherBasic/Basic.aspx`,
    `${BASE}/Record/Player/Pitcher/Basic.aspx`,
  ];

  let html = null;
  for (const url of listUrls) {
    try {
      const h = await get(url);
      if (h.includes('<table') && h.includes('<td') && !h.includes('errorcon')) {
        html = h;
        console.log(`투수 목록 URL 성공: ${url.split('/').slice(-2).join('/')}`);
        break;
      }
    } catch (e) { /* continue */ }
  }

  if (!html) { console.log('모든 투수 목록 URL 실패'); return byTeam; }

  const rows = tableRows(html);
  for (const row of rows) {
    if (row.length < 10 || !/^\d+$/.test(row[0])) continue;
    const teamCode = teamNameToCode(row[1]);
    if (!teamCode) continue;
    const name = row[2];
    if (!name || seen.has(teamCode + ':' + name)) continue;
    seen.add(teamCode + ':' + name);
    byTeam[teamCode].push({
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
  return byTeam;
}

async function main() {
  if (!existsSync('data')) await mkdir('data');

  console.log('타자 목록 수집 중...');
  const hittersByTeam = await fetchAllHitters();
  await sleep(500);

  console.log('\n투수 목록 수집 중...');
  const pitchersByTeam = await fetchAllPitchers();

  let grandTotal = 0;
  for (const code of TEAM_CODES) {
    const hitters = (hittersByTeam[code] || []).sort((a,b) => (b.stats.OPS||0)-(a.stats.OPS||0));
    const pitchers = (pitchersByTeam[code] || []).sort((a,b) => (a.stats.ERA||99)-(b.stats.ERA||99));
    await writeFile(
      `data/players-${code}.json`,
      JSON.stringify({ updatedAt: new Date().toISOString(), year: +YEAR, hitters, pitchers }, null, 2) + '\n',
    );
    grandTotal += hitters.length + pitchers.length;
    console.log(`${code}: 타자${hitters.length} 투수${pitchers.length}`);
  }

  console.log(`\n완료: 총 ${grandTotal}명`);
  if (grandTotal === 0) { console.error('데이터를 하나도 수집하지 못함'); process.exit(1); }
}

main().catch(e => { console.error('치명 오류:', e.message); process.exit(1); });
