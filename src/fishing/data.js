// Loads the fish database (data/fishing): index.json → region, sources, species files, litter.
// In the browser it fetches; node tests pass their own reader (readJSON).

export const FORMAT = 'ocean-fish/1';

export async function loadDB(base, readJSON = async (p) => {
  const r = await fetch(base + p);
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json();
}) {
  const index = await readJSON('index.json');
  if (index.format !== FORMAT) throw new Error('unknown format ' + index.format);
  const region = await readJSON(index.regions[0]);
  const sourcesFile = await readJSON(index.sources);
  const sources = Object.fromEntries(sourcesFile.sources.map((s) => [s.id, s]));
  const species = await Promise.all(index.species.map((p) => readJSON(p)));
  const junk = (await readJSON(index.junk)).items;
  for (const j of junk) j.kind = 'junk';
  return { index, region, sources, species, junk, catchables: [...species, ...junk] };
}

// structural check used by the tests: every datum has a source, a license and a status
export function validateSpecies(sp, sources) {
  const problems = [];
  const STATUS = ['verified', 'partial', 'illustrative', 'game-design'];
  const need = ['names.zh', 'names.scientific', 'length.type', 'length.catch.p50', 'length.catch.p95', 'length.min', 'length.maxCommon',
    'lengthWeight.a', 'lengthWeight.b', 'habitat', 'intro', 'conservation.release.mode'];
  const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
  for (const p of need) if (get(sp, p) == null) problems.push(`${sp.id}: missing ${p}`);
  const walk = (o, path) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return;
    if ('value' in o) {
      if (!STATUS.includes(o.status)) problems.push(`${sp.id}: ${path} has no valid status`);
      if (o.status !== 'game-design' && !(o.src && o.src.length) && !o.license) problems.push(`${sp.id}: ${path} has no source`);
      for (const id of o.src || []) if (!sources[id]) problems.push(`${sp.id}: ${path} cites unknown source ${id}`);
      if (!o.license && !(o.src || []).every((id) => sources[id]?.license)) problems.push(`${sp.id}: ${path} has no license`);
      return;
    }
    for (const [k, x] of Object.entries(o)) if (k !== 'art' && k !== 'game') walk(x, path ? `${path}.${k}` : k);
  };
  walk(sp, '');
  return problems;
}
