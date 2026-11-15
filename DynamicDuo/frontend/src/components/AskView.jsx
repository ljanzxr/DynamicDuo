import { useState } from 'react';
import { askQuestion } from '../api';

const EXAMPLES = [
  'smoke detector alarm threshold',
  'heat release rate oxygen consumption',
  'extinguishment reduced air flow',
  'silicone flammability microgravity',
  'flame spread thick PMMA',
];

const hasArabic = (s) => /[\u0600-\u06FF]/.test(s);
// The backend matches words longer than 3 letters as plain substrings, so punctuation breaks matches.
const clean = (s) => s.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const keywordsOf = (s) => [...new Set(clean(s).toLowerCase().split(' ').filter((w) => w.length > 3))];
const escapeRegex = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text, keywords) {
  if (!keywords.length) return text;
  const pattern = new RegExp(`(${keywords.map(escapeRegex).join('|')})`, 'gi');
  return text.split(pattern).map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
}

export default function AskView() {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function submit(q) {
    const cleaned = clean(q);
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    try {
      const data = await askQuestion(cleaned);
      setResult({ ...data, keywords: keywordsOf(cleaned) });
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h2 className="section-title">Ask the NASA sources</h2>
      <p className="muted">
        Search the indexed NASA NTRS reports. When an Anthropic API key is configured on the backend,
        Claude writes a short cited answer from the retrieved passages. Without the key you still get
        the matching excerpts with file and page numbers. Ask in English.
      </p>

      <form className="ask-form" onSubmit={(e) => { e.preventDefault(); submit(question); }}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. smoke detector alarm threshold" aria-label="Question" />
        <button type="submit" disabled={loading || !clean(question)}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {hasArabic(question) && (
        <p className="warn-box">
          The indexed documents are in English, so an Arabic question will not match anything. Rewrite
          it with English keywords.
        </p>
      )}

      <div className="examples">
        <span className="muted">Try:</span>
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" className="example"
            onClick={() => { setQuestion(ex); submit(ex); }}>
            {ex}
          </button>
        ))}
      </div>

      {error && <div className="error-box"><p>{error}</p></div>}

      {result && (
        <div>
          <p>
            <strong>{result.answer}</strong>
            {result.answer_source === 'llm' && (
              <span className="badge badge-muted" style={{ marginLeft: 8 }}>Claude</span>
            )}
          </p>
          {result.citations?.length > 0 ? (
            <ul className="cites">
              {result.citations.map((c, i) => (
                <li key={`${c.source_file}-${c.page_number}-${i}`} className="cite">
                  <div className="cite-head">
                    <strong>{c.source_file}</strong>
                    <span>page {c.page_number}</span>
                    <span className="badge badge-muted">matched {c.score} term{c.score === 1 ? '' : 's'}</span>
                  </div>
                  <p>{highlight(c.excerpt, result.keywords)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="warn-box">
              Nothing matched. Try fewer, more specific words (for example “silicone”, “alarm”,
              “extinguishment”).
            </p>
          )}
        </div>
      )}
    </section>
  );
}
