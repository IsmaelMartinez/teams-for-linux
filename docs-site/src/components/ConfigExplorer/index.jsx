import React, {useState, useMemo} from 'react';
import schemaData from '@site/static/config-schema.json';
import styles from './styles.module.css';

// Fed by the schema generated in Phase 1 (scripts/generateConfigDocs.js). The
// explorer never hardcodes the option list, so it stays in sync with the code.
const OPTIONS = schemaData.options;
const TYPES = ['all', ...Array.from(new Set(OPTIONS.map((o) => o.type).filter(Boolean))).sort()];

export default function ConfigExplorer() {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  // name -> chosen value (seeded from the option's default when first included)
  const [selected, setSelected] = useState({});
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return OPTIONS.filter((o) => {
      if (typeFilter !== 'all' && o.type !== typeFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        o.name.toLowerCase().includes(q) ||
        (o.description || '').toLowerCase().includes(q)
      );
    });
  }, [query, typeFilter]);

  function toggle(opt) {
    setSelected((prev) => {
      const next = {...prev};
      if (opt.name in next) {
        delete next[opt.name];
      } else {
        next[opt.name] = opt.default;
      }
      return next;
    });
  }

  function setValue(name, value) {
    setSelected((prev) => ({...prev, [name]: value}));
  }

  const selectedNames = Object.keys(selected);
  const json = JSON.stringify(selected, null, 2);

  function copy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className={styles.explorer}>
      <div className={styles.controls}>
        <input
          type="search"
          className={styles.search}
          placeholder={`Search ${OPTIONS.length} options by name or description...`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search configuration options"
        />
        <select
          className={styles.typeFilter}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by type"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t === 'all' ? 'All types' : t}
            </option>
          ))}
        </select>
        <span className={styles.count}>{filtered.length} shown</span>
      </div>

      <div className={styles.layout}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th aria-label="Include in config" />
                <th>Option</th>
                <th>Type</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.name}>
                  <td>
                    <input
                      type="checkbox"
                      checked={o.name in selected}
                      onChange={() => toggle(o)}
                      aria-label={`Include ${o.name}`}
                    />
                  </td>
                  <td>
                    <code>{o.name}</code>
                  </td>
                  <td>{o.type}</td>
                  <td>
                    <code>{JSON.stringify(o.default)}</code>
                  </td>
                  <td>{o.description}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    No options match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className={styles.builder}>
          <h3>Your config.json</h3>
          {selectedNames.length === 0 ? (
            <p className={styles.hint}>
              Tick options on the left to add them. Boolean, string, and number values are
              editable here; object defaults are included as-is for you to tweak after copying.
            </p>
          ) : (
            <div className={styles.editors}>
              {selectedNames.map((name) => {
                const opt = OPTIONS.find((o) => o.name === name);
                const val = selected[name];
                return (
                  <label key={name} className={styles.editorRow}>
                    <code>{name}</code>
                    {opt.type === 'boolean' ? (
                      <select
                        value={String(val)}
                        onChange={(e) => setValue(name, e.target.value === 'true')}
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : opt.type === 'number' ? (
                      <input
                        type="number"
                        value={val}
                        onChange={(e) =>
                          setValue(name, e.target.value === '' ? '' : Number(e.target.value))
                        }
                      />
                    ) : opt.type === 'string' ? (
                      <input
                        type="text"
                        value={val ?? ''}
                        onChange={(e) => setValue(name, e.target.value)}
                      />
                    ) : (
                      <span className={styles.readonly}>{JSON.stringify(val)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
          <pre className={styles.json}>{json}</pre>
          <button
            type="button"
            className={styles.copy}
            onClick={copy}
            disabled={selectedNames.length === 0}
          >
            {copied ? 'Copied!' : 'Copy config.json'}
          </button>
        </aside>
      </div>
    </div>
  );
}
