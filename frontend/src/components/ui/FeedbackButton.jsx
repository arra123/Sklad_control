import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import FeedbackModal from '../feedback/FeedbackModal';

export default function FeedbackButton({ position = 'admin' }) {
  const [open, setOpen] = useState(false);
  const bottom = position === 'employee' ? 'bottom-24' : 'bottom-6';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`fixed ${bottom} right-6 z-30 w-12 h-12 rounded-full bg-primary-600 text-white shadow-lg hover:bg-primary-700 hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center group`}
        title="Обратная связь"
      >
        <MessageSquarePlus size={20} />
        <span className="absolute right-full mr-3 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Сообщить об ошибке
        </span>
      </button>
      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
