const ZONES = [
  {
    key: 'micro',
    tone: 'ok',
    title: 'Microgravity',
    sub: 'ISS and free-flying Cygnus experiments. This is the data in the catalog.',
  },
  {
    key: 'partial',
    tone: 'gap',
    title: 'Partial gravity',
    sub: 'Moon 0.16 g, Mars 0.38 g. No combustion data in PSI yet (LUCI and FM2 are expected to add some).',
  },
  {
    key: 'normal',
    tone: 'muted',
    title: 'Normal gravity',
    sub: '1 g reference. Not part of this catalog.',
  },
];

export default function GravityStrip({ gravity }) {
  const active = gravity === 0 ? 'micro' : gravity >= 1 ? 'normal' : 'partial';
  return (
    <section className="gravity" aria-label="Gravity coverage of the data">
      <div className="gravity-zones">
        {ZONES.map((z) => (
          <div key={z.key} className={`gz gz-${z.tone} ${active === z.key ? 'gz-active' : ''}`}>
            {active === z.key && <span className="gz-marker">Your environment · {gravity} g</span>}
            <strong>{z.title}</strong>
            <span>{z.sub}</span>
          </div>
        ))}
      </div>
      {active === 'partial' && (
        <p className="gravity-note">
          This environment has partial gravity, but every experiment here ran in microgravity.
          Microgravity and normal-gravity results could bound what happens in between; they do not
          replace partial-gravity data.
        </p>
      )}
    </section>
  );
}
