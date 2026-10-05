import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { authorizedFetch, BACKEND_URL } from '../lib/authorizedFetch';

const SETTINGS = [
  { key: 'trust_fee', label: 'Trust fee (₹ per booking)' },
  { key: 'platform_commission_percent', label: 'Commission (% of service price)' },
  { key: 'min_withdrawal', label: 'Minimum partner withdrawal (₹)' }
];

// How each piece of app text is edited. "lines" fields are lists edited
// one entry per line.
const CONTENT = {
  faq: {
    title: 'FAQ',
    note: '{trust_fee} and {commission_percent} are replaced with the current settings.',
    fields: [
      { name: 'q', label: 'Question' },
      { name: 'a', label: 'Answer', multiline: true }
    ],
    blank: { q: '', a: '' }
  },
  terms: {
    title: 'Terms & Policy',
    fields: [
      { name: 'title', label: 'Section title' },
      { name: 'points', label: 'Points (one per line)', multiline: true, lines: true }
    ],
    blank: { title: '', points: [] }
  },
  offline_steps: {
    title: 'Offline mode steps',
    note: 'Icon is a Material Symbols name, e.g. call, payments, build.',
    fields: [
      { name: 'icon', label: 'Icon' },
      { name: 'title', label: 'Title' },
      { name: 'desc', label: 'Description', multiline: true }
    ],
    blank: { icon: 'info', title: '', desc: '' }
  },
  complaint_reasons: {
    title: 'Complaint reasons',
    note: 'Existing codes can be renamed but not removed. New codes: capitals and _, e.g. NOT_CLEAN.',
    fields: [
      { name: 'value', label: 'Code' },
      { name: 'label', label: 'What the customer sees' }
    ],
    blank: { value: '', label: '' }
  }
};

const inputClass = 'w-full border border-slate-200 rounded-lg p-2 bg-white';

const SectionTitle = ({ children }) => (
  <h2 className="text-xs font-extrabold text-[#0b1c30] uppercase tracking-wide pt-2">
    {children}
  </h2>
);

const ContentEditor = ({ contentKey, items, onSaved }) => {
  const { showToast } = useApp();
  const spec = CONTENT[contentKey];

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(items.map((item) => ({ ...item })));
  }, [open, items]);

  const update = (index, field, value) =>
    setDraft((previous) =>
      previous.map((item, i) =>
        i === index
          ? { ...item, [field.name]: field.lines ? value.split('\n') : value }
          : item
      )
    );

  const save = async () => {
    setSaving(true);

    try {
      // Drop blank lines from list fields
      const cleaned = draft.map((item) =>
        Object.fromEntries(
          Object.entries(item).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.map((line) => line.trim()).filter(Boolean) : value
          ])
        )
      );

      await authorizedFetch(`/admin/content/${contentKey}`, {
        method: 'PUT',
        body: JSON.stringify(cleaned)
      });
      showToast(`${spec.title} saved.`);
      setOpen(false);
      onSaved();
    } catch (error) {
      showToast(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-3.5 space-y-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <p className="font-bold text-[#0b1c30]">{`${spec.title} (${items.length})`}</p>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="font-bold text-[#a14000]"
        >
          {open ? 'Close' : 'Edit'}
        </button>
      </div>

      {open && (
        <>
          {spec.note && <p className="text-slate-400">{spec.note}</p>}

          {draft.map((item, index) => (
            <div key={index} className="rounded-xl bg-[#f8f9ff] p-2.5 space-y-1.5">
              {spec.fields.map((field) => {
                const value = field.lines
                  ? (item[field.name] || []).join('\n')
                  : item[field.name] || '';

                return field.multiline ? (
                  <textarea
                    key={field.name}
                    rows={field.lines ? 4 : 3}
                    value={value}
                    placeholder={field.label}
                    onChange={(event) => update(index, field, event.target.value)}
                    className={inputClass}
                  />
                ) : (
                  <input
                    key={field.name}
                    value={value}
                    placeholder={field.label}
                    onChange={(event) => update(index, field, event.target.value)}
                    className={inputClass}
                  />
                );
              })}

              <button
                type="button"
                onClick={() => setDraft((previous) => previous.filter((_, i) => i !== index))}
                className="font-bold text-red-500"
              >
                Remove
              </button>
            </div>
          ))}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDraft((previous) => [...previous, { ...spec.blank }])}
              className="flex-1 font-bold text-[#4e5c92] border border-slate-200 rounded-lg py-2"
            >
              Add
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="flex-1 font-bold text-white bg-[#006c49] rounded-lg py-2 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// KOODAM staff: fees, limits and the app's text, all stored in the database
export const AdminAppSettings = () => {
  const { showToast, appContent, loadAppSettings } = useApp();

  const [values, setValues] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadValues = () =>
    fetch(`${BACKEND_URL}/config`)
      .then((response) => response.json())
      .then((config) =>
        setValues(Object.fromEntries(SETTINGS.map(({ key }) => [key, String(config[key])])))
      )
      .catch(() => showToast("Couldn't load the app settings."));

  useEffect(() => {
    loadValues();
  }, []);

  const saveSettings = async () => {
    setSaving(true);

    try {
      await authorizedFetch('/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(
          Object.fromEntries(SETTINGS.map(({ key }) => [key, Number(values[key])]))
        )
      });
      showToast('Settings saved. New bookings use them straight away.');
      loadAppSettings();
      loadValues();
    } catch (error) {
      showToast(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SectionTitle>App settings</SectionTitle>
      <div className="bg-white rounded-2xl border border-slate-100 p-3.5 space-y-2 text-[11px]">
        {!values ? (
          <p className="text-slate-400">Loading...</p>
        ) : (
          <>
            {SETTINGS.map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between gap-3">
                <span className="text-[#0b1c30] font-bold">{label}</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={values[key]}
                  onChange={(event) => setValues((previous) => ({ ...previous, [key]: event.target.value }))}
                  className="w-24 border border-slate-200 rounded-lg p-2 text-right"
                />
              </label>
            ))}
            <button
              type="button"
              disabled={saving}
              onClick={saveSettings}
              className="w-full font-bold text-white bg-[#006c49] rounded-lg py-2 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save settings'}
            </button>
          </>
        )}
      </div>

      <SectionTitle>App content</SectionTitle>
      {Object.keys(CONTENT).map((key) => (
        <ContentEditor
          key={key}
          contentKey={key}
          items={appContent[key] || []}
          onSaved={loadAppSettings}
        />
      ))}
    </>
  );
};
