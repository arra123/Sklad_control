import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../utils/cn';
import { ChevronDown, X } from 'lucide-react';

export default function SearchSelect({ label, value, onChange, options, placeholder = 'Поиск...', emptyText = 'Ничего не найдено' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find(o => String(o.value) === String(value) && o.value !== '');

  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  const handleSelect = useCallback((opt) => {
    if (opt.disabled) return;
    onChange(String(opt.value));
    setOpen(false);
    setSearch('');
  }, [onChange]);

  const handleClear = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    onChange('');
    setSearch('');
    setOpen(false);
  }, [onChange]);

  const toggleOpen = useCallback(() => {
    setOpen(v => {
      if (!v) setTimeout(() => inputRef.current?.focus(), 10);
      return !v;
    });
  }, []);

  return (
    <div className="flex flex-col gap-1.5" ref={wrapRef}>
      {label && <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}
      <div className="relative">
        {/* Trigger button — always visible */}
        <div
          className={cn(
            'w-full rounded-xl border bg-white px-3 py-2 text-sm flex items-center gap-2 cursor-pointer transition-all',
            'dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100',
            open ? 'border-primary-400 ring-2 ring-primary-100' : 'border-gray-200 hover:border-primary-300'
          )}
          onClick={toggleOpen}
        >
          {open ? (
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
              placeholder={selected ? selected.label : placeholder}
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 min-w-0"
              autoComplete="off"
            />
          ) : (
            <span className={cn('flex-1 truncate', selected ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400')}>
              {selected ? selected.label : placeholder}
            </span>
          )}
          {selected && !open ? (
            <button type="button" onPointerDown={handleClear} className="text-gray-300 hover:text-red-400 flex-shrink-0 p-0.5">
              <X size={14} />
            </button>
          ) : (
            <ChevronDown size={14} className={cn('text-gray-400 flex-shrink-0 transition-transform', open && 'rotate-180')} />
          )}
        </div>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full left-0 right-0 z-[100] mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400">{emptyText}</div>
            ) : (
              filtered.map(opt => (
                <div
                  key={opt.value}
                  onPointerDown={(e) => { e.preventDefault(); handleSelect(opt); }}
                  className={cn(
                    'w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer',
                    opt.disabled
                      ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-900'
                      : String(opt.value) === String(value)
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
                  )}
                >
                  <span className="truncate block">{opt.label}</span>
                  {opt.hint && <span className="text-xs text-gray-400 block truncate">{opt.hint}</span>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
