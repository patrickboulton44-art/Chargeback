// Strip ```json fences (sometimes the model adds them despite instructions),
// then parse and validate the schema. Fails loud — never pass garbage downstream.

const FENCE_RE = /^```(?:json)?\s*([\s\S]*?)\s*```$/;

export function parseAndValidate(raw) {
  if (typeof raw !== 'string') {
    throw new Error('Claude response is not a string');
  }

  let text = raw.trim();
  const fenced = text.match(FENCE_RE);
  if (fenced) text = fenced[1].trim();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Claude response is not valid JSON: ${err.message}\n--- raw ---\n${raw}`);
  }

  const errors = [];

  if (typeof parsed.cover_statement !== 'string' || !parsed.cover_statement.trim()) {
    errors.push('cover_statement must be a non-empty string');
  }

  if (!Array.isArray(parsed.timeline)) {
    errors.push('timeline must be an array');
  } else {
    parsed.timeline.forEach((entry, i) => {
      if (typeof entry?.timestamp !== 'string') errors.push(`timeline[${i}].timestamp missing`);
      if (typeof entry?.event !== 'string') errors.push(`timeline[${i}].event missing`);
    });
  }

  if (!Array.isArray(parsed.key_evidence)) {
    errors.push('key_evidence must be an array');
  } else {
    parsed.key_evidence.forEach((entry, i) => {
      if (typeof entry?.label !== 'string') errors.push(`key_evidence[${i}].label missing`);
      if (entry?.value === undefined) errors.push(`key_evidence[${i}].value missing`);
      if (typeof entry?.significance !== 'string') errors.push(`key_evidence[${i}].significance missing`);
    });
  }

  if (!Array.isArray(parsed.missing_evidence_flags)) {
    errors.push('missing_evidence_flags must be an array');
  } else {
    parsed.missing_evidence_flags.forEach((entry, i) => {
      if (typeof entry !== 'string') errors.push(`missing_evidence_flags[${i}] must be a string`);
    });
  }

  if (errors.length) {
    throw new Error(`Schema validation failed:\n- ${errors.join('\n- ')}\n--- raw ---\n${raw}`);
  }

  return parsed;
}
