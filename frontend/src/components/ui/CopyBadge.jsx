import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

function copyToClipboard(text) {
  // execCommand first — works on HTTP without Secure Context
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    if (ok) return Promise.resolve();
  } catch {}
  // Fallback to Clipboard API (works on HTTPS / localhost)
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error('Copy failed'));
}

export default function CopyBadge({ value, label, className = '' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!value) return;
    copyToClipboard(String(value)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Скопировать: ${value}`}
      aria-label={`Скопировать ${value}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono
        bg-gray-100 dark:bg-gray-700 hover:bg-primary-50 dark:hover:bg-primary-900/30
        text-gray-600 dark:text-gray-300 hover:text-primary-700 dark:hover:text-primary-300
        border border-transparent hover:border-primary-200 dark:hover:border-primary-700
        transition-all cursor-pointer select-none active:scale-95 ${className}`}
    >
      {copied ? (
        <>
          <Check size={10} className="text-green-500 flex-shrink-0" />
          <span className="text-green-600 dark:text-green-400 font-sans font-medium">Скопировано</span>
        </>
      ) : (
        <>
          <Copy size={10} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <span>{label !== undefined ? label : value}</span>
        </>
      )}
    </button>
  );
}

export { copyToClipboard };
