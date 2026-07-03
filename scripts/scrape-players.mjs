// KBO 선수 성적을 서버에서 직접 스크래핑해 data/players-{teamCode}.json 으로 저장.
// 브라우저 CORS 제약 없이 koreabaseball.com 에 직접 접근하므로 안정적으로 동작한다.
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BASE = 'https://www.koreabaseball.com';
const YEAR = new Date().getFullYear();

// 우리 코드 → KBO 사이트 팀명 (Roster URL용)
const TEAM_NAMES = {
  HT:'Kia', OB:'Doosan', SS:'Samsung', LG:'LG', HH:'Hanwha',
  LT:'Lotte', KT:'KT', SK:'SSG', NC:'NC', WO:'Kiwoom',
};
const TEAM_CODES = Object.keys(TEAM_NAMES);

function stripTags(s) {
  return (s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}

function extractTableRows(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let tm;
    while ((tm = tdRe.exec(m[1]))) cells.push(stripTags(tm[1]));
    if (cells.length >= 4) rows.push(cells);
  }
  return rows;
}

// playerId 링크를 파싱해서 {id, name} 목록 추출
function extractPlayerLinks(html) {
  const out = [];
  const re = /href="[^"]*playerId=(\d+)[^"]*"[^>]*>([^<]+)</gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(html))) {
    const id = m[1], name = m[2].trim();
    if (!seen.has(id) && name) { seen.add(id); out.push({ id, name }); }
  }
  return out;
}

async function get(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR,ko;q=0.9' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ── 타자 성적 파싱 (HitterDetail/Basic1 페이지) ─────────────────
// 열 순서: 순위 팀명 선수명 경기 타석 타수 안타 2루타 3루타 홈런 타점 득점 도루 볼넷 삼진 타율 출루율 장타율
function parseHitterRow(cells) {
  if (cells.length < 18) return null;
  const name = cells[2];
  if (!name || /합계|평균|계/.test(name)) return null;
  const avg = parseFloat(cells[15]) || 0;
  const obp = parseFloat(cells[16]) || 0;
  const slg = parseFloat(cells[17]) || 0;
  return {
    name,
    pos: '타자',
    stats: {
      G: parseInt(cells[3])||0, PA: parseInt(cells[4])||0, AB: parseInt(cells[5])||0,
      H: parseInt(cells[6])||0, '2B': parseInt(cells[7])||0, '3B': parseInt(cells[8])||0,
      HR: parseInt(cells[9])||0, RBI: parseInt(cells[10])||0, R: parseInt(cells[11])||0,
      SB: parseInt(cells[12])||0, BB: parseInt(cells[13])||0, SO: parseInt(cells[14])||0,
      AVG: avg, OBP: obp, SLG: slg,
      OPS: parseFloat((obp + slg).toFixed(3)),
      ISO: parseFloat((slg - avg).toFixed(3)),
      WAR: null,
    },
  };
}

// ── 투수 성적 파싱 (PitcherDetail/Basic1 페이지) ─────────────────
// 열 순서: 순위 팀명 선수명 경기 승 패 세 홀드 이닝 피안타 피홈런 볼넷 삼진 방어율 WHIP
function parsePitcherRow(cells) {
  if (cells.length < 15) return null;
  const name = cells[2];
  if (!name || /합계|평균|계/.test(name)) return null;
  return {
    name,
    pos: '투수',
    stats: {
      G: parseInt(cells[3])||0,
      W: parseInt(cells[4])||0, L: parseInt(cells[5])||0,
      SV: parseInt(cells[6])||0, HLD: parseInt(cells[7])||0,
      IP: cells[8]||'0',
      H: parseInt(cells[9])||0, HR: parseInt(cells[10])||0,
      BB: parseInt(cells[11])||0, SO: parseInt(cells[12])||0,
      ERA: parseFloat(cells[13])||0,
      WHIP: parseFloat(cells[14])||0,
      WAR: null,
    },
  };
}

// 특정 URL에서 테이블 행 파싱 후 파서 적용
async function scrapeStatPage(url, parser) {
  const html = await get(url);
  const rows = extractTableRows(html);
  const results = [];
  for (const cells of rows) {
    const p = parser(cells);
    if (p) results.push(p);
  }
  return { html, results };
}

// 팀별 성적 페이지 (league-wide 목록에서 팀 필터링)
// URL 패턴: ?teamId=팀코드&sort=컬럼명
async function scrapeTeamStats(teamCode) {
  const hitterUrl  = `${BASE}/Record/Player/HitterDetail/Basic1.aspx?teamId=${teamCode}&sort=HRA_RT`;
  const pitcherUrl = `${BASE}/Record/Player/PitcherDetail/Basic1.aspx?teamId=${teamCode}&sort=ERA`;

  let hitters = [], pitchers = [];
  try {
    ({ results: hitters } = await scrapeStatPage(hitterUrl, parseHitterRow));
  } catch (e) { console.warn(`  hitter fetch failed for ${teamCode}:`, e.message); }
  try {
    ({ results: pitchers } = await scrapeStatPage(pitcherUrl, parsePitcherRow));
  } catch (e) { console.warn(`  pitcher fetch failed for ${teamCode}:`, e.message); }

  // 팀 필터 페이지가 동작 안할 경우 → 리그 전체 페이지에서 팀명으로 필터링 시도
  if (!hitters.length && !pitchers.length) {
    console.warn(`  teamId 필터 실패, 리그 전체 페이지에서 팀명 필터 시도: ${teamCode}`);
    const teamKorMap = {
      HT:'KIA',OB:'두산',SS:'삼성',LG:'LG',HH:'한화',LT:'롯데',KT:'KT',SK:'SSG',NC:'NC',WO:'키움'
    };
    const kor = teamKorMap[teamCode] || teamCode;
    try {
      const allH = await get(`${BASE}/Record/Player/HitterDetail/Basic1.aspx`);
      const allRows = extractTableRows(allH);
      for (const cells of allRows) {
        if (cells[1] && cells[1].includes(kor)) {
          const p = parseHitterRow(cells);
          if (p) hitters.push(p);
        }
      }
    } catch(e) { console.warn('  league hitter page failed:', e.message); }
    try {
      const allP = await get(`${BASE}/Record/Player/PitcherDetail/Basic1.aspx`);
      const allRows = extractTableRows(allP);
      for (const cells of allRows) {
        if (cells[1] && cells[1].includes(kor)) {
          const p = parsePitcherRow(cells);
          if (p) pitchers.push(p);
        }
      }
    } catch(e) { console.warn('  league pitcher page failed:', e.message); }
  }

  return { hitters, pitchers };
}

async function main() {
  if (!existsSync('data')) await mkdir('data');

  let totalPlayers = 0;
  for (const code of TEAM_CODES) {
    process.stdout.write(`${code} 조회 중...`);
    try {
      const { hitters, pitchers } = await scrapeTeamStats(code);
      const out = {
        updatedAt: new Date().toISOString(),
        year: YEAR,
        hitters: hitters.sort((a,b) => (b.stats.OPS||0)-(a.stats.OPS||0)),
        pitchers: pitchers.sort((a,b) => (a.stats.ERA||99)-(b.stats.ERA||99)),
      };
      await writeFile(`data/players-${code}.json`, JSON.stringify(out, null, 2) + '\n');
      totalPlayers += hitters.length + pitchers.length;
      console.log(` ✓ 타자${hitters.length}명 투수${pitchers.length}명`);
    } catch (e) {
      console.log(` ✗ 실패: ${e.message}`);
    }
    // 서버 부하 방지를 위해 요청 간 짧은 딜레이
    await new Promise(r => setTimeout(r, 500));
  }
  console.log(`완료: 총 ${totalPlayers}명`);
  if (totalPlayers === 0) { console.error('데이터를 하나도 수집하지 못함'); process.exit(1); }
}

main().catch(e => { console.error('치명 오류:', e); process.exit(1); });
