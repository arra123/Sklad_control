import { useState, useRef, useEffect } from 'react';
import { cn } from '../../utils/cn';

export default function SearchSelect({ label, value, onChange, options, placeholder = 'Поиск...', emptyText = 'Ничего не найдено' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find(o => String(o.value) === String(value));

  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (opt) => {
    if (opt.disabled) return;
    onChange(String(opt.value));
    setOpen(false);
    setSearch('');
  };

  const handleClear = () => {
    onChange('');
    setSearch('');
  };

  return (
    <div className="flex flex-col gap-1.5" ref={wrapRef}>
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <div className="relative">
        {selected && !open ? (
          <button
            type="button"
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="w-full text-left rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 hover:border-primary-300 transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100 flex items-center justify-between"
          >
            <span className="truncate">{selected.label}</span>
            <span onClick={(e) => { e.stopPropagation(); handleClear(); }} className="text-gray-300 hover:text-red-400 ml-2 flex-shrink-0 text-xs cursor-pointer">✕</span>
          </button>
        ) : (
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={selected ? selected.label : placeholder}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-all dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
          />
        )}
        {open && (
          <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400">{emptyText}</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-sm transition-colors',
                    opt.disabled
                      ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-900'
                      : String(opt.value) === String(value)
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
                  )}
                >
                  <span className="truncate block">{opt.label}</span>
                  {opt.hint && <span className="text-xs text-gray-400 block truncate">{opt.hint}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
