// KBO 팀 순위표를 서버(GitHub Actions)에서 직접 스크래핑해 data/standings.json으로 저장.
// 브라우저 CORS 프록시에 의존하지 않으므로 훨씬 안정적으로 동작한다.
import { writeFile, readFile } from 'node:fs/promises';

const STANDINGS_URL = 'https://www.koreabaseball.com/Record/TeamRank/TeamRank.aspx';
const OUT_PATH = new URL('../data/standings.json', import.meta.url);

const TEAM_NAMES = ['KIA','두산','삼성','LG','한화','롯데','KT','SSG','NC','키움'];

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function extractRows(html) {
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

async function main() {
  const res = await fetch(STANDINGS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('fetch failed: ' + res.status);
  const html = await res.text();
  const rows = extractRows(html).filter(cells => {
    if (cells.length < 8) return false;
    return /^\d+$/.test(cells[0]) && Number(cells[0]) <= TEAM_NAMES.length;
  });
  if (!rows.length) throw new Error('순위표 행을 찾지 못함 (사이트 구조 변경 가능성)');

  const data = {
    updatedAt: new Date().toISOString(),
    rows: rows.map(cells => ({
      rank: cells[0],
      team: cells[1],
      cols: cells.slice(2, 12),
    })),
  };
  await writeFile(OUT_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('saved', rows.length, 'rows');
}

main().catch(async (e) => {
  console.error('scrape failed:', e.message);
  // 실패 시 기존 파일은 그대로 두고(마지막 성공 데이터 유지) 0이 아닌 코드로 종료해 워크플로에 실패를 알림
  process.exit(1);
});
