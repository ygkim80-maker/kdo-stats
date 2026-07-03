// KBO 선수 성적 스크래퍼 v4 — 기록실 타자/투수 목록 페이지 직접 수집
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const BASE = 'https://www.koreabaseball.com';
const YEAR = String(new Date().getFullYear());

const TEAM_MAP = {
  HT:'KIA', OB:'두산', SS:'삼성', LG:'LG', HH:'한화',
  LT:'롯데', KT:'KT', SK:'SSG', NC:'NC', WO:'키움',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          'Referer': BASE + '/',
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

// 기록실 타자 기본 목록 페이지에서 팀별 성적 수집
async function fetchHitters(teamCode) {
  const players = [];
  const seenNames = new Set();

  for (let page = 1; page <= 3; page++) {
    const url = `${BASE}/Record/Player/HitterBasic/Basic.aspx?teamCode=${teamCode}&sort=OPS&order=DESC&pageNo=${page}`;
    try {
      const html = await get(url);

      // 진단: 첫 팀 첫 페이지만
      if (teamCode === 'HT' && page === 1) {
        console.log(`\n=== HT 타자 목록 샘플 ===`);
        console.log(html.substring(0, 2000));
        console.log('=== 샘플 끝 ===');
        const rows = tableRows(html);
        console.log(`전체 tr 수: ${rows.length}`);
        if (rows.length > 0) console.log('첫 행:', JSON.stringify(rows[0]));
        if (rows.length > 1) console.log('두번째 행:', JSON.stringify(rows[1]));
      }

      const rows = tableRows(html);
      // 타자 성적 행: 0=순위 1=팀 2=선수 3=G 4=PA 5=AB 6=H 7=2B 8=3B 9=HR 10=RBI 11=R 12=SB 13=BB 14=SO 15=AVG 16=OBP 17=SLG 18=OPS
      const dataRows = rows.filter(r => r.length >= 14 && /^\d+$/.test(r[0]));
      if (dataRows.length === 0) break;

      for (const row of dataRows) {
        const name = row[2];
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);
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
      await sleep(300);
    } catch (e) {
      console.log(`  ${teamCode} 타자 p${page}: ${e.message}`);
      break;
    }
  }
  return players;
}

// 기록실 투수 기본 목록 페이지에서 팀별 성적 수집
async function fetchPitchers(teamCode) {
  const players = [];
  const seenNames = new Set();

  for (let page = 1; page <= 3; page++) {
    const url = `${BASE}/Record/Player/PitcherBasic/Basic.aspx?teamCode=${teamCode}&sort=ERA&order=ASC&pageNo=${page}`;
    try {
      const html = await get(url);
      const rows = tableRows(html);
      // 투수 성적 행: 0=순위 1=팀 2=선수 3=G 4=ERA 5=W 6=L 7=SV 8=HLD 9=IP 10=H 11=BB 12=HBP 13=SO 14=R 15=ER 16=WHIP
      const dataRows = rows.filter(r => r.length >= 10 && /^\d+$/.test(r[0]));
      if (dataRows.length === 0) break;
      for (const row of dataRows) {
        const name = row[2];
        if (!name || seenNames.has(name)) continue;
        seenNames.add(name);
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
      await sleep(300);
    } catch (e) {
      console.log(`  ${teamCode} 투수 p${page}: ${e.message}`);
      break;
    }
  }
  return players;
}

async function main() {
  if (!existsSync('data')) await mkdir('data');
  let grandTotal = 0;

  for (const [code, teamName] of Object.entries(TEAM_MAP)) {
    process.stdout.write(`${code}(${teamName}) 수집 중... `);
    const [hitters, pitchers] = await Promise.all([
      fetchHitters(code),
      fetchPitchers(code),
    ]);
    hitters.sort((a, b) => (b.stats.OPS||0) - (a.stats.OPS||0));
    pitchers.sort((a, b) => (a.stats.ERA||99) - (b.stats.ERA||99));
    await writeFile(
      `data/players-${code}.json`,
      JSON.stringify({ updatedAt: new Date().toISOString(), year: +YEAR, hitters, pitchers }, null, 2) + '\n',
    );
    grandTotal += hitters.length + pitchers.length;
    console.log(`타자${hitters.length} 투수${pitchers.length} 저장`);
    await sleep(500);
  }

  console.log(`\n완료: 총 ${grandTotal}명`);
  if (grandTotal === 0) { console.error('데이터를 하나도 수집하지 못함'); process.exit(1); }
}

main().catch(e => { console.error('치명 오류:', e.message); process.exit(1); });
