import test from 'node:test';
import assert from 'node:assert/strict';
import { COL, lastSeasonLine } from '../src/players/statline.js';

const row = (season, team, gp, pts, extra = {}) => {
  const r = new Array(19).fill(0);
  r[COL.season] = season;
  r[COL.team] = team;
  r[COL.gp] = gp;
  r[COL.pts] = pts;
  for (const [k, v] of Object.entries(extra)) r[COL[k]] = v;
  return r;
};

test('statline: sem carreira devolve null', () => {
  assert.equal(lastSeasonLine(null), null);
  assert.equal(lastSeasonLine({ rows: [] }), null);
});

test('statline: usa a temporada mais recente e pondera passagens por mais de um time', () => {
  const line = lastSeasonLine({ rows: [row(2025, 'BOS', 82, 30), row(2026, 'BOS', 20, 10, { fgm: 4, fga: 10 }), row(2026, 'LAL', 60, 20, { fgm: 8, fga: 16 })] });
  assert.equal(line.season, 2026);
  assert.equal(line.gp, 80);
  assert.equal(line.pts, 17.5);
  assert.ok(Math.abs(line.fgPct - (7 / 14.5) * 100) < 1e-9);
  assert.equal(line.tpPct, null); // sem tentativas de três não inventa percentual
});
