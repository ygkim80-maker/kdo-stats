// KBO 선수 성적 스크래퍼 v2
// 전략: 팀 로스터 페이지에서 playerId 목록 추출 → 개인 성적 상세 페이지에서 현재 시즌 성적 파싱
// standings 스크래퍼와 동일하게 koreabaseball.com에 직접 접근 (GH Actions = CORS 없음)
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BASE = 'https://www.koreabaseball.com';
const YEAR = String(new Date().getFullYear());
const CONCURRENCY = 8;   // 동시 요청 수

const TEAM_MAP = {
  HT:'Kia', OB:'Doosan', SS:'Samsung', LG:'LG', HH:'Hanwha',
  LT:'Lotte', KT:'KT', SK:'SSG', NC:'NC', WO:'Kiwoom',
};

// ── HTTP ────────────────────────────────────────────────────────────
async function get(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; kbo-stats-bot/2.0)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      if (i === retries) throw e;
      await sleep(800 * (i + 1));
    }
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 동시 실행 수 제한 풀
async function pool(items, fn, limit) {
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]).catch(e => null);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ── HTML 파싱 유틸 ──────────────────────────────────────────────────
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

// ── 1단계: 팀 로스터 페이지에서 선수 목록 추출 ──────────────────────
async function fetchRoster(teamCode) {
  const url = `${BASE}/Team/Player/${TEAM_MAP[teamCode]}.aspx`;
  const html = await get(url);
  const players = [];
  const seen = new Set();

  // playerId 링크 파싱
  const linkRe = /href="([^"]*playerId=(\d+)[^"]*)"[^>]*>([^<]+)</gi;
  // 행별로 포지션 파악을 위해 테이블도 파싱
  const rows = tableRows(html);

  // 먼저 링크에서 id+name 추출
  const idNames = {};
  let lm;
  while ((lm = linkRe.exec(html))) {
    const id = lm[2], name = lm[3].trim();
    if (id && name && !seen.has(id)) { seen.add(id); idNames[id] = name; }
  }

  // 테이블 행에서 id + 포지션 연결
  for (const cells of rows) {
    const rowText = cells.join(' ');
    const pidM = rowText.match(/playerId=(\d+)/);
    if (!pidM) continue;
    const id = pidM[1];
    if (!idNames[id]) continue;
    const posText = cells.slice(0, 5).join(' ');
    const isPitcher = /투수|P\b/.test(posText);
    players.push({ id, name: idNames[id], type: isPitcher ? 'pitcher' : 'hitter' });
  }

  // 링크 파싱만 된 경우 (테이블 매칭 실패) — 기본값으로 추가
  for (const [id, name] of Object.entries(idNames)) {
    if (!players.find(p => p.id === id)) {
      players.push({ id, name, type: null }); // 포지션 불명
    }
  }

  return players;
}

// ── 2단계: 개인 성적 상세 페이지에서 현재 시즌 성적 파싱 ────────────
async function fetchPlayerStats(player) {
  // 타자/포지션 불명 → 타자 먼저 시도, 실패 시 투수 시도
  const types = player.type === 'pitcher'
    ? ['pitcher', 'hitter']
    : ['hitter', 'pitcher'];

  for (const type of types) {
    try {
      const url = type === 'hitter'
        ? `${BASE}/Record/Player/HitterDetail/Basic.aspx?playerId=${player.id}`
        : `${BASE}/Record/Player/PitcherDetail/Basic.aspx?playerId=${player.id}`;
      const html = await get(url);
      const rows = tableRows(html);

      // 현재 연도(YEAR) 행 찾기
      const row = rows.find(cells => cells[0] === YEAR && cells.length >= (type === 'hitter' ? 15 : 11));
      if (!row) continue;

      if (type === 'hitter') {
        const avg = parseFloat(row[13]) || 0;
        const obp = parseFloat(row[14]) || 0;
        const slg = parseFloat(row[15]) || 0;
        return {
          name: player.name, pos: '타자', type: 'hitter',
          stats: {
            G: +row[1]||0, PA: +row[2]||0, AB: +row[3]||0, H: +row[4]||0,
            '2B': +row[5]||0, '3B': +row[6]||0, HR: +row[7]||0,
            RBI: +row[8]||0, R: +row[9]||0, SB: +row[10]||0,
            BB: +row[11]||0, SO: +row[12]||0,
            AVG: avg, OBP: obp, SLG: slg,
            OPS: parseFloat((obp + slg).toFixed(3)),
            ISO: parseFloat((slg - avg).toFixed(3)),
            WAR: null,
          },
        };
      } else {
        return {
          name: player.name, pos: '투수', type: 'pitcher',
          stats: {
            G: +row[1]||0,
            ERA: parseFloat(row[2])||0,
            W: +row[3]||0, L: +row[4]||0,
            SV: +row[5]||0, HLD: +row[6]||0,
            IP: row[7]||'0',
            H: +row[8]||0, BB: +row[9]||0, SO: +row[12]||0,
            WHIP: parseFloat(row[11])||0,
            HR: 0, QS: 0, WAR: null,
          },
        };
      }
    } catch { continue; }
  }
  return null;
}

// ── MAIN ────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync('data')) await mkdir('data');

  let grandTotal = 0;
  for (const code of Object.keys(TEAM_MAP)) {
    process.stdout.write(`${code} 로스터 조회... `);
    let roster;
    try { roster = await fetchRoster(code); }
    catch (e) { console.log(`로스터 실패: ${e.message}`); continue; }

    process.stdout.write(`${roster.length}명 → 성적 수집 중... `);

    // 중복 제거
    const unique = [...new Map(roster.map(p => [p.id, p])).values()];
    const statsAll = await pool(unique, fetchPlayerStats, CONCURRENCY);

    const hitters = statsAll.filter(p => p?.type === 'hitter');
    const pitchers = statsAll.filter(p => p?.type === 'pitcher');

    // OPS 내림차순 / ERA 오름차순 정렬
    hitters.sort((a, b) => (b.stats.OPS || 0) - (a.stats.OPS || 0));
    pitchers.sort((a, b) => (a.stats.ERA || 99) - (b.stats.ERA || 99));

    await writeFile(
      `data/players-${code}.json`,
      JSON.stringify({ updatedAt: new Date().toISOString(), year: +YEAR, hitters, pitchers }, null, 2) + '\n',
    );

    const total = hitters.length + pitchers.length;
    grandTotal += total;
    console.log(`타자${hitters.length} 투수${pitchers.length} 저장`);

    await sleep(300); // 팀 간 딜레이
  }

  console.log(`\n완료: 총 ${grandTotal}명`);
  if (grandTotal === 0) { console.error('데이터를 하나도 수집하지 못함'); process.exit(1); }
}

main().catch(e => { console.error('치명 오류:', e.message); process.exit(1); });
