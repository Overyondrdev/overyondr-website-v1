// Address checking.
//   1. Built-in checks always run: required fields, postal-code formats, US state / ZIP agreement,
//      Canadian provinces, UK postcodes, and safe clean-ups (ZIP leading zeros, state names to codes).
//   2. When the GOOGLE_MAPS_API_KEY secret is set, the Google Address Validation API confirms the
//      address exists and suggests corrections (USPS CASS data for US addresses).
// Result: { status, provider, issues[], suggestion, cleaned, checkedAt }
//   status: verified | suggested | needs_review | unverified | invalid
//   cleaned: the input after safe clean-ups (what gets stored when no suggestion is accepted)

export const FIELDS = ['line1', 'line2', 'city', 'region', 'postal_code', 'country'];

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico', VI: 'U.S. Virgin Islands', GU: 'Guam', AS: 'American Samoa', MP: 'Northern Mariana Islands',
  AA: 'Armed Forces Americas', AE: 'Armed Forces Europe', AP: 'Armed Forces Pacific',
};
const CA_PROVINCES = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia', NT: 'Northwest Territories', NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island',
  QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};
// First three ZIP digits -> state (USPS sectional centers). Used only to warn, never to block.
const ZIP3 = [
  [5, 5, 'NY'], [6, 7, 'PR'], [8, 8, 'VI'], [9, 9, 'PR'], [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'],
  [50, 54, 'VT'], [55, 55, 'MA'], [56, 59, 'VT'], [60, 69, 'CT'], [70, 89, 'NJ'], [90, 99, 'AE'], [100, 149, 'NY'],
  [150, 196, 'PA'], [197, 199, 'DE'], [200, 200, 'DC'], [201, 201, 'VA'], [202, 205, 'DC'], [206, 219, 'MD'],
  [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'], [290, 299, 'SC'], [300, 319, 'GA'], [320, 339, 'FL'],
  [340, 340, 'AA'], [341, 349, 'FL'], [350, 369, 'AL'], [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'],
  [400, 427, 'KY'], [430, 459, 'OH'], [460, 479, 'IN'], [480, 499, 'MI'], [500, 528, 'IA'], [530, 549, 'WI'],
  [550, 567, 'MN'], [569, 569, 'DC'], [570, 577, 'SD'], [580, 588, 'ND'], [590, 599, 'MT'], [600, 629, 'IL'],
  [630, 658, 'MO'], [660, 679, 'KS'], [680, 693, 'NE'], [700, 714, 'LA'], [716, 729, 'AR'], [730, 732, 'OK'],
  [733, 733, 'TX'], [734, 749, 'OK'], [750, 799, 'TX'], [800, 816, 'CO'], [820, 831, 'WY'], [832, 838, 'ID'],
  [840, 847, 'UT'], [850, 865, 'AZ'], [870, 884, 'NM'], [885, 885, 'TX'], [889, 898, 'NV'], [900, 961, 'CA'],
  [962, 966, 'AP'], [967, 968, 'HI'], [969, 969, 'GU'], [970, 979, 'OR'], [980, 994, 'WA'], [995, 999, 'AK'],
];
// Countries without postal codes (no postal code required).
const NO_POSTAL = new Set(['AE', 'AG', 'AO', 'AW', 'BF', 'BI', 'BJ', 'BO', 'BS', 'BW', 'BZ', 'CD', 'CF', 'CG', 'CI', 'CK', 'CM',
  'DJ', 'DM', 'ER', 'FJ', 'GA', 'GD', 'GH', 'GM', 'GQ', 'GY', 'HK', 'IE', 'KI', 'KM', 'KN', 'KP', 'LY', 'ML', 'MO', 'MR', 'MW',
  'NR', 'NU', 'QA', 'RW', 'SB', 'SC', 'SL', 'SR', 'ST', 'SY', 'TF', 'TG', 'TK', 'TL', 'TO', 'TV', 'UG', 'VU', 'YE', 'ZW']);
const POSTAL = {
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] \d[ABCEGHJ-NPRSTV-Z]\d$/,
  GB: /^([A-Z]{1,2}\d[A-Z\d]?|GIR) \d[A-Z]{2}$/,
  AU: /^\d{4}$/, NZ: /^\d{4}$/, DE: /^\d{5}$/, FR: /^\d{5}$/, ES: /^\d{5}$/, IT: /^\d{5}$/, NL: /^\d{4} ?[A-Z]{2}$/,
  BE: /^\d{4}$/, DK: /^\d{4}$/, NO: /^\d{4}$/, SE: /^\d{3} ?\d{2}$/, FI: /^\d{5}$/, CH: /^\d{4}$/, AT: /^\d{4}$/,
  PL: /^\d{2}-\d{3}$/, PT: /^\d{4}-\d{3}$/, JP: /^\d{3}-?\d{4}$/, SG: /^\d{6}$/, IN: /^\d{6}$/, MX: /^\d{5}$/,
  BR: /^\d{5}-?\d{3}$/, ZA: /^\d{4}$/, MY: /^\d{5}$/, KR: /^\d{5}$/,
};
const COUNTRY_ALIASES = {
  USA: 'US', 'UNITED STATES': 'US', 'UNITED STATES OF AMERICA': 'US', AMERICA: 'US', 'U.S.': 'US', 'U.S.A.': 'US',
  UK: 'GB', 'UNITED KINGDOM': 'GB', 'GREAT BRITAIN': 'GB', BRITAIN: 'GB', ENGLAND: 'GB', SCOTLAND: 'GB', WALES: 'GB',
  'NORTHERN IRELAND': 'GB', CANADA: 'CA', IRELAND: 'IE', GERMANY: 'DE', FRANCE: 'FR', SPAIN: 'ES', ITALY: 'IT',
  NETHERLANDS: 'NL', 'THE NETHERLANDS': 'NL', HOLLAND: 'NL', AUSTRALIA: 'AU', 'NEW ZEALAND': 'NZ', JAPAN: 'JP',
  SINGAPORE: 'SG', INDIA: 'IN', MEXICO: 'MX', SWITZERLAND: 'CH', SWEDEN: 'SE', NORWAY: 'NO', DENMARK: 'DK',
  FINLAND: 'FI', BELGIUM: 'BE', AUSTRIA: 'AT', POLAND: 'PL', PORTUGAL: 'PT', MALAYSIA: 'MY', 'HONG KONG': 'HK',
  'SOUTH AFRICA': 'ZA', 'UNITED ARAB EMIRATES': 'AE', UAE: 'AE', BRAZIL: 'BR', 'SOUTH KOREA': 'KR',
};

const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function countryCode(v) {
  const s = tidy(v).toUpperCase();
  if (!s) return 'US';
  if (/^[A-Z]{2}$/.test(s)) return s === 'UK' ? 'GB' : s;
  return COUNTRY_ALIASES[s] || COUNTRY_ALIASES[s.replace(/\./g, '')] || s.slice(0, 2);
}

function stateCode(v, table) {
  const s = tidy(v);
  if (!s) return s;
  const up = s.toUpperCase().replace(/\./g, '');
  if (table[up]) return up;
  const hit = Object.entries(table).find(([, name]) => name.toUpperCase() === up);
  return hit ? hit[0] : s;
}

// Safe, meaning-preserving clean-ups. Returns a new address object.
export function cleanAddress(a) {
  const out = {};
  for (const f of FIELDS) out[f] = tidy(a[f]);
  out.country = countryCode(out.country);
  if (out.country === 'US') {
    out.region = stateCode(out.region, US_STATES);
    let z = out.postal_code.replace(/\s/g, '');
    if (/^\d{9}$/.test(z)) z = z.slice(0, 5) + '-' + z.slice(5);
    if (/^\d{3,4}$/.test(z)) z = z.padStart(5, '0'); // spreadsheets drop leading zeros (02134 -> 2134)
    out.postal_code = z;
  } else if (out.country === 'CA') {
    out.region = stateCode(out.region, CA_PROVINCES);
    const z = out.postal_code.toUpperCase().replace(/\s/g, '');
    out.postal_code = z.length === 6 ? z.slice(0, 3) + ' ' + z.slice(3) : out.postal_code.toUpperCase();
  } else if (out.country === 'GB') {
    const z = out.postal_code.toUpperCase().replace(/\s/g, '');
    out.postal_code = z.length >= 5 ? z.slice(0, -3) + ' ' + z.slice(-3) : z;
  } else if (out.postal_code) {
    out.postal_code = out.postal_code.toUpperCase();
  }
  return out;
}

const issue = (field, message, severity = 'warning') => ({ field, message, severity });

// Built-in checks on a cleaned address.
export function basicIssues(a) {
  const issues = [];
  if (!a.line1) issues.push(issue('line1', 'Add the street address.', 'error'));
  if (!a.city) issues.push(issue('city', 'Add the city or town.', 'error'));
  if (!/^[A-Z]{2}$/.test(a.country)) issues.push(issue('country', 'Choose a country.', 'error'));
  const needsPostal = !NO_POSTAL.has(a.country);
  if (needsPostal && !a.postal_code) issues.push(issue('postal_code', a.country === 'US' ? 'Add the ZIP code.' : 'Add the postal code.', 'error'));
  else if (a.postal_code && POSTAL[a.country] && !POSTAL[a.country].test(a.postal_code)) {
    const ex = { US: '12345 or 12345-6789', CA: 'A1A 1A1', GB: 'SW1A 1AA' }[a.country];
    issues.push(issue('postal_code', `This doesn't look like a valid ${a.country === 'US' ? 'ZIP' : 'postal'} code${ex ? ` (expected ${ex})` : ''}.`, 'error'));
  }
  if (a.country === 'US') {
    if (!a.region) issues.push(issue('region', 'Add the state.', 'error'));
    else if (!US_STATES[a.region]) issues.push(issue('region', `"${a.region}" isn't a US state.`, 'error'));
    else if (/^\d{5}/.test(a.postal_code)) {
      const n = parseInt(a.postal_code.slice(0, 3), 10);
      const hit = ZIP3.find(([lo, hi]) => n >= lo && n <= hi);
      if (hit && hit[2] !== a.region) {
        issues.push(issue('postal_code', `ZIP ${a.postal_code.slice(0, 5)} is usually in ${US_STATES[hit[2]] || hit[2]}, not ${US_STATES[a.region]}. Check the ZIP or state.`));
      }
    }
  } else if (a.country === 'CA') {
    if (!a.region) issues.push(issue('region', 'Add the province.', 'error'));
    else if (!CA_PROVINCES[a.region]) issues.push(issue('region', `"${a.region}" isn't a Canadian province or territory.`, 'error'));
  } else if (a.country === 'AU' && !a.region) {
    issues.push(issue('region', 'Add the state or territory.', 'error'));
  }
  if (a.line1 && !/\d/.test(a.line1 + ' ' + a.line2) && !/^(p\.?\s?o\.?\s?box|post office box)/i.test(a.line1)) {
    issues.push(issue('line1', 'There is no building number in the street address.'));
  }
  return issues;
}

// --------------------------------------------------------------------------- comparison
const ABBR = {
  street: 'st', avenue: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', lane: 'ln', court: 'ct', place: 'pl',
  terrace: 'ter', parkway: 'pkwy', highway: 'hwy', circle: 'cir', square: 'sq', suite: 'ste', apartment: 'apt',
  building: 'bldg', floor: 'fl', north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw',
  southeast: 'se', southwest: 'sw', unit: 'unit', number: '#', no: '#', saint: 'st', mount: 'mt', fort: 'ft',
};
export function norm(s) {
  return tidy(s).toLowerCase().replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean).map((w) => ABBR[w] || w).join(' ');
}
// Fields whose difference is more than formatting (case, punctuation, abbreviations, ZIP+4).
export function changedFields(a, b) {
  const out = [];
  const lines = (x) => norm([x.line1, x.line2].filter(Boolean).join(' '));
  if (lines(a) !== lines(b)) {
    if (norm(a.line1) !== norm(b.line1)) out.push('line1');
    if (norm(a.line2) !== norm(b.line2)) out.push('line2');
    if (!out.length) out.push('line1');
  }
  if (norm(a.city) !== norm(b.city)) out.push('city');
  if (norm(a.region) !== norm(b.region)) out.push('region');
  const pc = (x) => (x.country === 'US' ? tidy(x.postal_code).slice(0, 5) : tidy(x.postal_code).toUpperCase().replace(/\s/g, ''));
  if (pc(a) !== pc(b)) out.push('postal_code');
  if (a.country !== b.country) out.push('country');
  return out;
}

// --------------------------------------------------------------------------- Google
const MISSING = {
  street_number: ['line1', 'The building number is missing.'],
  route: ['line1', 'The street name is missing.'],
  subpremise: ['line2', 'A suite, floor or apartment number looks to be missing.'],
  locality: ['city', 'The city is missing.'],
  postal_code: ['postal_code', 'The postal code is missing.'],
  administrative_area_level_1: ['region', 'The state or region is missing.'],
};
const COMPONENT_FIELD = {
  street_number: 'line1', route: 'line1', subpremise: 'line2', premise: 'line1', locality: 'city', postal_town: 'city',
  postal_code: 'postal_code', administrative_area_level_1: 'region', country: 'country',
};
const LABEL = { line1: 'street address', line2: 'suite / unit', city: 'city', region: 'state / region', postal_code: 'postal code', country: 'country' };

async function google(a, key) {
  const body = {
    address: {
      regionCode: a.country,
      addressLines: [a.line1, a.line2].filter(Boolean),
      locality: a.city || undefined,
      administrativeArea: a.region || undefined,
      postalCode: a.postal_code || undefined,
    },
    enableUspsCass: a.country === 'US',
  };
  const res = await fetch(`https://addressvalidation.googleapis.com/v1:validateAddress?key=${encodeURIComponent(key)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || '';
    if (res.status === 400 && /region|unsupported/i.test(msg)) return { unsupported: true };
    throw new Error(`google ${res.status} ${msg}`.slice(0, 200));
  }
  return data.result || {};
}

function fromGoogle(a, r) {
  const v = r.verdict || {};
  const addr = r.address || {};
  const pa = addr.postalAddress || {};
  const usps = r.uspsData || {};
  const issues = [];
  for (const t of addr.missingComponentTypes || []) {
    const [field, msg] = MISSING[t] || ['line1', `Part of the address is missing (${t.replace(/_/g, ' ')}).`];
    issues.push(issue(field, msg));
  }
  const suspicious = (addr.addressComponents || []).filter((c) => c.confirmationLevel === 'UNCONFIRMED_AND_SUSPICIOUS');
  for (const c of suspicious) {
    const field = COMPONENT_FIELD[c.componentType] || 'line1';
    issues.push(issue(field, `We couldn't confirm "${c.componentName?.text || ''}" (${LABEL[field]}).`));
  }
  if ((addr.unresolvedTokens || []).length) {
    issues.push(issue('line1', `We didn't recognise: ${addr.unresolvedTokens.join(', ')}.`));
  }
  const dpv = usps.dpvConfirmation;
  if (dpv === 'N') issues.push(issue('line1', "USPS doesn't list this as a deliverable address."));
  else if (dpv === 'D' && !issues.some((i) => i.field === 'line2')) issues.push(issue('line2', 'USPS says this building needs a suite or apartment number.'));
  else if (dpv === 'S') issues.push(issue('line2', "USPS couldn't confirm the suite or apartment number."));

  const lines = pa.addressLines || [];
  const suggestion = {
    line1: lines[0] || '',
    line2: lines.slice(1).join(', '),
    city: pa.locality || pa.sublocality || '',
    region: pa.administrativeArea || '',
    postal_code: pa.postalCode || '',
    country: pa.regionCode || a.country,
  };
  // Keep fields Google left empty as the person typed them (e.g. countries without states).
  for (const f of ['city', 'region', 'postal_code']) if (!suggestion[f] && a[f]) suggestion[f] = a[f];
  const precise = ['PREMISE', 'SUB_PREMISE'].includes(v.validationGranularity);
  const usable = precise || ['PREMISE_PROXIMITY', 'BLOCK', 'ROUTE'].includes(v.validationGranularity);
  if (!precise && !issues.length) issues.push(issue('line1', "We couldn't pinpoint this exact building."));

  const changed = usable && suggestion.line1 ? changedFields(a, suggestion) : [];
  let status;
  if (precise && v.addressComplete && !issues.length) status = changed.length ? 'suggested' : 'verified';
  else status = 'needs_review';
  return { status, issues, suggestion: changed.length ? suggestion : null, changed, formatted: addr.formattedAddress || '' };
}

// --------------------------------------------------------------------------- entry point
async function cacheKey(a) {
  const bytes = new TextEncoder().encode(JSON.stringify(FIELDS.map((f) => a[f].toLowerCase())));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const CACHE_DAYS = 60;

// Check many addresses; cache hits cost no API call. `limit` caps concurrent Google calls.
export async function verifyMany(list, env) {
  const cleaned = list.map(cleanAddress);
  const keys = await Promise.all(cleaned.map(cacheKey));
  const cached = new Map();
  const uniq = [...new Set(keys)];
  for (let i = 0; i < uniq.length; i += 90) {
    const part = uniq.slice(i, i + 90);
    const { results } = await env.DB.prepare(`SELECT key, result, created_at FROM verify_cache WHERE key IN (${part.map(() => '?').join(',')})`).bind(...part).all();
    const cutoff = Date.now() - CACHE_DAYS * 864e5;
    for (const r of results) if (Date.parse(r.created_at) > cutoff) cached.set(r.key, JSON.parse(r.result));
  }
  const fresh = new Map();
  const todo = [];
  cleaned.forEach((a, i) => { if (!cached.has(keys[i]) && !fresh.has(keys[i])) { fresh.set(keys[i], null); todo.push(i); } });
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const i = todo[next++];
      fresh.set(keys[i], await verifyOne(cleaned[i], env));
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, todo.length) }, worker));
  const writes = [...fresh.entries()].filter(([, r]) => r && r.provider === 'google' && !r.error)
    .map(([k, r]) => env.DB.prepare('INSERT OR REPLACE INTO verify_cache (key, result, created_at) VALUES (?, ?, ?)').bind(k, JSON.stringify(r), r.checkedAt));
  if (writes.length) await env.DB.batch(writes);
  return cleaned.map((a, i) => ({ ...(cached.get(keys[i]) || fresh.get(keys[i])), cleaned: a }));
}

export async function verifyAddress(input, env) {
  return (await verifyMany([input], env))[0];
}

async function verifyOne(a, env) {
  const checkedAt = new Date().toISOString();
  const issues = basicIssues(a);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length) return { status: 'invalid', provider: 'basic', issues, suggestion: null, checkedAt };
  const key = env.GOOGLE_MAPS_API_KEY;
  if (key) {
    try {
      const r = await google(a, key);
      if (!r.unsupported) {
        const g = fromGoogle(a, r);
        // A ZIP/state mismatch the built-in check found is moot once Google has a precise match.
        return { ...g, provider: 'google', checkedAt };
      }
      return { status: issues.length ? 'needs_review' : 'unverified', provider: 'basic', issues, suggestion: null, checkedAt, note: 'unsupported_country' };
    } catch (e) {
      return { status: issues.length ? 'needs_review' : 'unverified', provider: 'basic', issues, suggestion: null, checkedAt, error: String(e.message || e).slice(0, 200) };
    }
  }
  return { status: issues.length ? 'needs_review' : 'unverified', provider: 'basic', issues, suggestion: null, checkedAt };
}
