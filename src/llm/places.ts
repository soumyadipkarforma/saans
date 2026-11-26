// shortcut: the largest Indian cities' Devanagari names only, because Open-Meteo's geocoder is queried in English
// and finds no Devanagari; any other Hindi city name is not recognised. Upgrade by translating via a geocoder that supports Hindi.
const HINDI_CITIES: Record<string, string> = {
  दिल्ली: 'Delhi',
  मुंबई: 'Mumbai',
  कोलकाता: 'Kolkata',
  चेन्नई: 'Chennai',
  बेंगलुरु: 'Bengaluru',
  बैंगलोर: 'Bengaluru',
  हैदराबाद: 'Hyderabad',
  पुणे: 'Pune',
  लखनऊ: 'Lucknow',
  जयपुर: 'Jaipur',
  अहमदाबाद: 'Ahmedabad',
  पटना: 'Patna',
  भोपाल: 'Bhopal',
  कानपुर: 'Kanpur',
  नागपुर: 'Nagpur',
  इंदौर: 'Indore',
  सूरत: 'Surat',
  वाराणसी: 'Varanasi',
  बनारस: 'Varanasi',
  आगरा: 'Agra',
  चंडीगढ़: 'Chandigarh',
  नोएडा: 'Noida',
  गुरुग्राम: 'Gurugram',
  गाज़ियाबाद: 'Ghaziabad',
  ग़ाज़ियाबाद: 'Ghaziabad',
  गाजियाबाद: 'Ghaziabad',
  लुधियाना: 'Ludhiana',
  रांची: 'Ranchi',
  राँची: 'Ranchi',
  गुवाहाटी: 'Guwahati',
};
// Keys are matched after Unicode normalisation, so nukta spellings (ड़ vs ड + nukta) compare equal.
const HINDI_KEYS = Object.entries(HINDI_CITIES).map(([k, v]) => [k.normalize('NFC'), v] as const);

const MAX_CANDIDATES = 3;
const MAX_WORDS = 3;
const PREPOSITIONS = new Set(['in', 'at', 'from', 'near']);
const ARTICLES = new Set(['the', 'a', 'an']);
// Words that end a place phrase: pronouns, verbs, times of day and everyday places that are not cities.
const STOP = new Set(
  (
    'i we my our he she it is am are was do does and but or so today tomorrow tonight now every each daily ' +
    'morning afternoon evening night with to for on by how what why when since because live stay cycle walk ' +
    'drive go play work commute travel take have has home school college office park house car bus metro traffic'
  ).split(' '),
);

const strip = (w: string) => w.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
const endsClause = (w: string) => /[,.;:!?]$/.test(w);

// The phrase right after "in/at/from/near": up to 3 words, ended by punctuation, a digit or a stop word.
function afterPreposition(tokens: string[]): string[] {
  const out: string[] = [];
  tokens.forEach((tok, i) => {
    if (!PREPOSITIONS.has(strip(tok).toLowerCase()) || endsClause(tok)) return;
    const words: string[] = [];
    for (let j = i + 1; j < tokens.length && words.length < MAX_WORDS; j++) {
      const w = strip(tokens[j] ?? '');
      const lower = w.toLowerCase();
      if (!/^[a-z][a-z'-]*$/i.test(w)) break;
      if (words.length === 0 && ARTICLES.has(lower)) continue;
      if (STOP.has(lower) || PREPOSITIONS.has(lower)) break;
      words.push(w);
      if (endsClause(tokens[j] ?? '')) break;
    }
    if (words.length > 0) out.push(words.join(' '));
  });
  return out;
}

// Runs of capitalised words that do not start a sentence ("I" excluded).
function capitalised(tokens: string[]): string[] {
  const out: string[] = [];
  let run: string[] = [];
  const flush = () => {
    if (run.length > 0) out.push(run.join(' '));
    run = [];
  };
  tokens.forEach((tok, i) => {
    const w = strip(tok);
    const starts = i === 0 || /[.!?]$/.test(tokens[i - 1] ?? '');
    if (!starts && /^\p{Lu}\p{Ll}+$/u.test(w) && run.length < MAX_WORDS) run.push(w);
    else flush();
    if (endsClause(tok)) flush();
  });
  flush();
  return out;
}

// Up to 3 city-name guesses from a sentence, in order: after a preposition, a known Devanagari city, a capitalised word.
export function placeCandidates(text: string): string[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const normal = text.normalize('NFC');
  const hindi = HINDI_KEYS.filter(([k]) => normal.includes(k))
    .sort(([a], [b]) => normal.indexOf(a) - normal.indexOf(b))
    .map(([, v]) => v);
  const seen = new Set<string>();
  return [...afterPreposition(tokens), ...hindi, ...capitalised(tokens)]
    .filter((c) => !seen.has(c.toLowerCase()) && seen.add(c.toLowerCase()))
    .slice(0, MAX_CANDIDATES);
}
