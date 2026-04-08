import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Users, UserCog, Pencil, Trash2, Eye, EyeOff, Package, ChevronDown, ChevronRight, Search, Copy, Check, X, Shield } from 'lucide-react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { qty, fmtDate } from '../../utils/fmt';
import { getTypeMeta, fmtSource as movFmtSource } from '../../utils/movementTypes';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import SortTh from '../../components/ui/SortTh';
import { useSort } from '../../hooks/useSort';
import { useToast } from '../../components/ui/Toast';
import EmployeeDetailView from './staff/EmployeeDetailView';
import { EmployeeModal, AddEmployeeModal, EditUserModal, UserModal } from './staff/StaffModals';

// Modals moved to ./staff/StaffModals.jsx

// ─── Employee Detail View (drill-in) ─────────────────────────────────────────
// ─── Copy credentials inline button ──────────────────────────────────────────
function CopyCredentialsBtn({ employeeId }) {
  const toast = useToast();
  const [state, setState] = useState('idle'); // idle | loading | done

  const handleCopy = async () => {
    setState('loading');
    try {
      const res = await api.get(`/staff/employees/${employeeId}/credentials`);
      const text = `Логин: ${res.data.login}\nПароль: ${res.data.password_plain}`;
      await navigator.clipboard.writeText(text);
      setState('done');
      toast.success('Скопировано');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      toast.error('Не удалось');
      setState('idle');
    }
  };

  return (
    <button onClick={handleCopy} disabled={state === 'loading'}
      className="p-1.5 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all"
      title="Скопировать логин и пароль">
      {state === 'loading' ? <Spinner size="xs" /> : state === 'done' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

// ─── Employees Table ──────────────────────────────────────────────────────────
function EmployeesTable({ employees, onEdit, onDelete, onDrill }) {
  const { sorted, sort, toggle } = useSort(employees, 'full_name');

  if (employees.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center h-32 text-gray-400">
        <Users size={32} className="mb-2 opacity-30" />
        <p className="text-sm">Нет сотрудников</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <SortTh label="ФИО" sortKey="full_name" sort={sort} onSort={toggle} />
            <SortTh label="Должность" sortKey="position" sort={sort} onSort={toggle} />
            <th>Логин</th>
            <th>Роль</th>
            <SortTh label="Статус" sortKey="active" sort={sort} onSort={toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(emp => {
            const inv = Array.isArray(emp.inventory) ? emp.inventory.filter(i => i.quantity > 0) : [];
            return (
              <tr key={emp.id} className="cursor-pointer hover:bg-gray-50" onClick={() => onDrill(emp)}>
                <td className="font-medium text-gray-900">{emp.full_name}</td>
                <td className="text-gray-500 text-xs">{emp.position || '—'}</td>
                <td className="text-xs font-mono text-gray-600">{emp.username || <span className="text-gray-300">—</span>}</td>
                <td className="text-xs">
                  {emp.role_name ? <Badge variant={emp.role === 'admin' ? 'primary' : emp.role === 'manager' ? 'info' : 'default'}>{emp.role_name}</Badge>
                    : emp.username ? <Badge variant="default">{emp.role === 'admin' ? 'Админ' : emp.role === 'manager' ? 'Менеджер' : 'Сотрудник'}</Badge>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td>
                  <Badge variant={emp.active ? 'success' : 'default'} dot>
                    {emp.active ? 'Активен' : 'Неактивен'}
                  </Badge>
                </td>
                <td>
                  <div className="flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                    {emp.username && <CopyCredentialsBtn employeeId={emp.id} />}
                    <button onClick={() => onEdit(emp)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => onDelete(emp.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-all">
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Simple Person Avatar ────────────────────────────────────────────────────
function PersonAvatar() {
  return (
    <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center border border-gray-100">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6d28d9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    </div>
  );
}


// ─── Copy Button ─────────────────────────────────────────────────────────────
function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

function CopyBtn({ text, label }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e.stopPropagation();
    copyToClipboard(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy} title={`Копировать ${label}`}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
        copied
          ? 'bg-green-100 text-green-700 ring-1 ring-green-300'
          : 'bg-gray-50 text-gray-600 hover:bg-primary-50 hover:text-primary-600'
      }`}>
      <span className="max-w-[140px] truncate">{text}</span>
      {copied ? <Check size={12} className="text-green-600 flex-shrink-0" /> : <Copy size={12} className="text-gray-300 flex-shrink-0" />}
    </button>
  );
}

// ─── Users Table (переключаемая группировка) ─────────────────────────────────
//
// Источники users (все 156):
// - users_d — общая таблица с сайтом сотрудников
// - pending_applicants_d — заявки на трудоустройство
// - sklad_service_users_s — служебные аккаунты склада
// - employees_s «сироты» — архив (удалены на сайте сотрудников)
//
// Пользователь сам выбирает режим группировки: Должность / Отдел / Роль / Статус.
// Каждая группа — отдельная карточка в 2-колоночном grid'е, сворачивается.
const GROUP_MODES = [
  { key: 'position',   label: 'По должности' },
  { key: 'department', label: 'По отделу' },
  { key: 'role',       label: 'По роли склада' },
  { key: 'status',     label: 'По статусу' },
];

const STATUS_LABELS = {
  active: 'Работают',
  internship: 'Стажёры',
  pending_employment: 'Оформляются',
  pending_fired: 'Готовятся к увольнению',
  service: 'Служебные',
  unknown: 'Без сотрудника',
  fired: 'Уволенные',
  rejected: 'Не приняты',
  applicant_pending: 'Заявки (ожидают)',
  applicant_approved: 'Заявки (одобрены)',
  applicant_rejected: 'Заявки (отклонены)',
  archived: 'Архив склада',
};

// Какие статусы считать «полноценно работающими» (без dim'а)
const ACTIVE_STATUSES = new Set(['active', 'internship', 'pending_employment', 'pending_fired', 'service', 'unknown']);

function UsersTable({ users, employees, onEdit, onDelete, onDrill }) {
  const [groupBy, setGroupBy] = useState(() => localStorage.getItem('staff_group_by') || 'position');
  const [collapsed, setCollapsed] = useState({}); // { groupKey: true } — свёрнутые
  const setMode = (m) => { setGroupBy(m); localStorage.setItem('staff_group_by', m); };
  const toggle = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  if (users.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center h-32 text-gray-400">
        <UserCog size={32} className="mb-2 opacity-30" />
        <p className="text-sm">Нет пользователей</p>
      </div>
    );
  }

  // Получить ключ группы для пользователя в выбранном режиме
  const getGroupKey = (u) => {
    switch (groupBy) {
      case 'position':   return u.position || '— без должности —';
      case 'department': return u.department || '— без отдела —';
      case 'role':       return u.role_name || '— без роли склада —';
      case 'status':     return STATUS_LABELS[u.employee_status] || u.employee_status || '— без статуса —';
      default:           return '—';
    }
  };

  // Группируем
  const groups = {};
  for (const u of users) {
    const key = getGroupKey(u);
    if (!groups[key]) groups[key] = [];
    groups[key].push(u);
  }

  // Сортируем группы по количеству DESC, потом по алфавиту
  // Кроме режима «по статусу» — там фиксированный порядок (работающие → проблемные → архив)
  const STATUS_ORDER = [
    'Работают', 'Стажёры', 'Оформляются', 'Готовятся к увольнению',
    'Служебные', 'Без сотрудника',
    'Заявки (ожидают)', 'Заявки (одобрены)', 'Заявки (отклонены)',
    'Уволенные', 'Не приняты', 'Архив склада',
  ];
  const sortedGroups = Object.entries(groups).sort(([a, la], [b, lb]) => {
    if (groupBy === 'status') {
      const ai = STATUS_ORDER.indexOf(a); const bi = STATUS_ORDER.indexOf(b);
      if (ai !== -1 || bi !== -1) {
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      }
    }
    // Заглушки «без …» в конец
    const aDash = a.startsWith('—'); const bDash = b.startsWith('—');
    if (aDash !== bDash) return aDash ? 1 : -1;
    if (lb.length !== la.length) return lb.length - la.length;
    return a.localeCompare(b, 'ru');
  });

  // Внутри группы — сортируем по ФИО
  for (const [, list] of sortedGroups) {
    list.sort((a, b) =>
      (a.employee_name || a.username || '').localeCompare(b.employee_name || b.username || '', 'ru')
    );
  }

  // Какие группы свёрнуты по умолчанию: те, в которых преобладают неактивные
  const isDefaultCollapsed = (list) => {
    const blocked = list.filter(u => !ACTIVE_STATUSES.has(u.employee_status || 'active')).length;
    return blocked >= list.length * 0.5; // >= половина неактивных → свёрнута
  };

  const renderRow = (user, dim = false) => (
    <div key={user.id}
      onClick={() => onDrill?.(user)}
      className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 cursor-pointer ${dim ? 'opacity-60' : ''}`}>
      <div className="relative flex-shrink-0">
        <PersonAvatar />
        {user.last_active_at && (Date.now() - new Date(user.last_active_at).getTime()) < 600000 && (
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-medium truncate ${dim ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
            {user.employee_name || user.username}
          </p>
          {user.employee_status === 'internship' && (
            <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">
              стажёр
            </span>
          )}
        </div>
        {user.position && <p className="text-[11px] text-gray-400 truncate">{user.position}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <CopyBtn text={user.username} label="логин" />
        {user.password_plain && <CopyBtn text={user.password_plain} label="пароль" />}
      </div>
      <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
        <button onClick={() => onEdit(user)}
          className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
          <Pencil size={13} />
        </button>
        <button onClick={() => onDelete(user.id)}
          className="p-1.5 rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-all">
          <Trash2 size={13} />
        </button>
      </div>
      <ChevronRight size={14} className="text-gray-200 flex-shrink-0" />
    </div>
  );

  // Карточка одной группы — заголовок (кнопка-сворачиваем) + список
  const renderGroupCard = ([groupKey, list]) => {
    const isOpen = collapsed[groupKey] !== undefined ? !collapsed[groupKey] : !isDefaultCollapsed(list);
    const allBlocked = list.every(u => !ACTIVE_STATUSES.has(u.employee_status || 'active'));
    const headerClass = allBlocked
      ? 'bg-gray-50 hover:bg-gray-100 border-gray-100 text-gray-500'
      : 'bg-gray-50 hover:bg-gray-100 border-gray-100 text-gray-700';
    return (
      <div key={groupKey} className="card overflow-hidden break-inside-avoid">
        <button onClick={() => toggle(groupKey)}
          className={`w-full px-4 py-2.5 ${headerClass} border-b flex items-center justify-between transition-colors`}>
          <div className="flex items-center gap-2 min-w-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={allBlocked ? '#9ca3af' : '#6d28d9'}
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
            </svg>
            <span className="text-xs font-bold truncate">{groupKey}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] text-gray-400 font-medium">{list.length} чел.</span>
            <ChevronDown size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {isOpen && list.map(u => renderRow(u, !ACTIVE_STATUSES.has(u.employee_status || 'active')))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Переключатель режима группировки */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 mr-1">Группировать:</span>
        {GROUP_MODES.map(m => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              groupBy === m.key
                ? 'bg-primary-50 border-primary-200 text-primary-700 font-semibold'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}>
            {m.label}
          </button>
        ))}
        <button onClick={() => setCollapsed({})}
          className="text-xs text-gray-400 hover:text-gray-600 ml-auto">
          Сбросить состояние
        </button>
      </div>

      {/* 2-колоночный grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 [grid-auto-flow:dense]">
        {sortedGroups.map(renderGroupCard)}
      </div>
    </div>
  );
}

// ─── All available permissions ────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  { key: 'dashboard', label: 'Дашборд', group: 'Общее' },
  { key: 'analytics', label: 'Аналитика', group: 'Общее' },
  { key: 'settings', label: 'Настройки', group: 'Общее' },
  { key: 'products.view', label: 'Просмотр товаров', group: 'Товары' },
  { key: 'products.edit', label: 'Редактирование товаров', group: 'Товары' },
  { key: 'warehouse.view', label: 'Просмотр склада', group: 'Склад' },
  { key: 'warehouse.edit', label: 'Редактирование склада', group: 'Склад' },
  { key: 'tasks.view', label: 'Просмотр заданий', group: 'Задания' },
  { key: 'tasks.create', label: 'Создание заданий', group: 'Задания' },
  { key: 'tasks.execute', label: 'Выполнение заданий', group: 'Задания' },
  { key: 'staff.view', label: 'Просмотр сотрудников', group: 'Персонал' },
  { key: 'staff.edit', label: 'Управление сотрудниками', group: 'Персонал' },
  { key: 'roles.manage', label: 'Управление ролями', group: 'Персонал' },
  { key: 'movements.view', label: 'История перемещений', group: 'Перемещения' },
  { key: 'movements.edit', label: 'Перемещение товаров', group: 'Перемещения' },
  { key: 'errors', label: 'Ошибки сканирования', group: 'Прочее' },
];

function groupPermissions() {
  const groups = {};
  for (const p of ALL_PERMISSIONS) {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  }
  return groups;
}

// ─── Role Form Modal ─────────────────────────────────────────────────────────
function RoleFormModal({ open, onClose, role, onSuccess }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [perms, setPerms] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (role) { setName(role.name); setPerms(role.permissions || []); }
    else { setName(''); setPerms([]); }
  }, [open, role]);

  const toggle = (key) => {
    setPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  const toggleAll = () => {
    if (perms.length === ALL_PERMISSIONS.length) setPerms([]);
    else setPerms(ALL_PERMISSIONS.map(p => p.key));
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Введите название'); return; }
    setLoading(true);
    try {
      if (role) {
        await api.put(`/staff/roles/${role.id}`, { name, permissions: perms });
        toast.success('Роль обновлена');
      } else {
        await api.post('/staff/roles', { name, permissions: perms });
        toast.success('Роль создана');
      }
      onSuccess(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setLoading(false); }
  };

  const groups = groupPermissions();

  return (
    <Modal open={open} onClose={onClose} title={role ? 'Редактировать роль' : 'Создать роль'} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button onClick={handleSave} loading={loading}>{role ? 'Сохранить' : 'Создать'}</Button></>}>
      <div className="space-y-4">
        <Input label="Название роли" placeholder="Например: Старший кладовщик" value={name} onChange={e => setName(e.target.value)} />
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Права доступа</p>
            <button onClick={toggleAll} className="text-xs text-primary-600 hover:text-primary-800 font-medium">
              {perms.length === ALL_PERMISSIONS.length ? 'Снять все' : 'Выбрать все'}
            </button>
          </div>
          <div className="space-y-4">
            {Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <p className="text-xs font-semibold text-gray-500 mb-2">{group}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {items.map(p => (
                    <label key={p.key} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg cursor-pointer hover:bg-primary-50/50 transition-colors">
                      <input type="checkbox" checked={perms.includes(p.key)} onChange={() => toggle(p.key)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                      <span className="text-sm text-gray-700">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Roles Manager ───────────────────────────────────────────────────────────
function RolesManager() {
  const toast = useToast();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRole, setEditRole] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/staff/roles').then(r => setRoles(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/staff/roles/${deleteTarget.id}`);
      toast.success('Роль удалена');
      setDeleteTarget(null);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setDeleting(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Роли ({roles.length})</p>
        <button onClick={() => { setEditRole(null); setShowForm(true); }}
          className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
          <Plus size={13} /> Создать роль
        </button>
      </div>
      {roles.length === 0 ? (
        <div className="card p-8 text-center text-gray-300">
          <Shield size={32} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Нет ролей</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map(role => (
            <div key={role.id} className="card p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <Shield size={16} className="text-primary-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{role.name}</p>
                  <p className="text-xs text-gray-400">{(role.permissions || []).length} прав</p>
                </div>
                <button onClick={() => { setEditRole(role); setShowForm(true); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all">
                  <Pencil size={14} />
                </button>
                <button onClick={() => setDeleteTarget(role)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                {(role.permissions || []).map(p => {
                  const info = ALL_PERMISSIONS.find(a => a.key === p);
                  return <span key={p} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-md">{info?.label || p}</span>;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <RoleFormModal open={showForm} onClose={() => { setShowForm(false); setEditRole(null); }} role={editRole} onSuccess={load} />
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Удалить роль"
        footer={<><Button variant="ghost" onClick={() => setDeleteTarget(null)}>Отмена</Button><Button variant="danger-solid" onClick={confirmDelete} loading={deleting}>Удалить</Button></>}>
        <p className="text-sm text-gray-600">Удалить роль «{deleteTarget?.name}»? Это действие нельзя отменить.</p>
      </Modal>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StaffPage() {
  const toast = useToast();
  const { user } = useAuth();
  const userPerms = user?.permissions || [];
  const isAdmin = user?.role === 'admin';
  const canEditStaff = isAdmin || userPerms.includes('staff.edit');
  const canManageRoles = isAdmin || userPerms.includes('roles.manage');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'users';
  const setTab = (t) => setSearchParams({ tab: t });
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [search, setSearch] = useState('');
  const drillId = searchParams.get('employee');
  const setDrillEmployee = (emp) => {
    if (emp) setSearchParams({ tab, employee: emp.id });
    else setSearchParams({ tab });
  };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [emp, usr] = await Promise.allSettled([
        api.get('/staff/employees'),
        api.get('/staff/users'),
      ]);
      if (emp.status === 'fulfilled') setEmployees(emp.value.data.filter(e => e.active !== false));
      // НЕ фильтруем users по active — нужно показать всех (включая уволенных,
      // не принятых, заявки и архив). UsersTable сам разнесёт их по группам.
      if (usr.status === 'fulfilled') setUsers(usr.value.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, []);

  const deleteEmployee = async (id) => {
    if (!confirm('Удалить сотрудника?')) return;
    try {
      await api.delete(`/staff/employees/${id}`);
      toast.success('Сотрудник удалён');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('Удалить пользователя?')) return;
    try {
      await api.delete(`/staff/users/${id}`);
      toast.success('Пользователь удалён');
      loadAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    }
  };

  // Filter users/employees by search
  const searchLower = search.toLowerCase();
  const filteredUsers = searchLower
    ? users.filter(u => (u.employee_name || u.username || '').toLowerCase().includes(searchLower) ||
        (u.username || '').toLowerCase().includes(searchLower) ||
        (u.role_name || '').toLowerCase().includes(searchLower))
    : users;
  // Employees without user accounts (not visible in UsersTable)
  const userEmpIds = new Set(users.map(u => u.employee_id).filter(Boolean));
  const employeesWithoutAccount = employees.filter(e => !userEmpIds.has(e.id));
  const filteredNoAccount = searchLower
    ? employeesWithoutAccount.filter(e => e.full_name.toLowerCase().includes(searchLower) ||
        (e.position || '').toLowerCase().includes(searchLower))
    : employeesWithoutAccount;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Сотрудники</h1>
          <p className="text-gray-500 text-sm mt-1">
            {(() => {
              const onlineCount = users.filter(u => u.last_active_at && (Date.now() - new Date(u.last_active_at).getTime()) < 600000).length;
              return onlineCount > 0
                ? <><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />{onlineCount} онлайн · {users.length} всего</>
                : `${users.length} сотрудников`;
            })()}
          </p>
        </div>
        {tab === 'users' && canEditStaff && (
          <Button icon={<Plus size={15} />} size="sm" onClick={() => setShowAddEmpModal(true)}>
            Добавить сотрудника
          </Button>
        )}
      </div>

      {/* Tabs */}
      {canManageRoles && (
        <div className="flex gap-1 mb-5 bg-gray-50 p-1.5 rounded-2xl w-fit border border-gray-200">
          {[
            { value: 'users', label: `Сотрудники (${users.length})`, icon: Users, active: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
            { value: 'roles', label: 'Роли', icon: Shield, active: 'bg-amber-50 text-amber-700 border-amber-200' },
          ].map(({ value, label, icon: Icon, active }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all border ${
                tab === value ? `${active} shadow-sm` : 'text-gray-500 hover:text-gray-700 border-transparent'
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      {tab === 'users' && !drillId && (
        <div className="mb-4">
          <Input placeholder="Поиск по имени, логину, роли..." value={search} onChange={e => setSearch(e.target.value)}
            icon={<Search size={15} />}
            iconRight={search && (
              <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
            )} />
        </div>
      )}

      {drillId && employees.find(e => String(e.id) === drillId) ? (
        <EmployeeDetailView employee={employees.find(e => String(e.id) === drillId)} onBack={() => { setDrillEmployee(null); loadAll(); }} />
      ) : loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : tab === 'users' ? (
        <>
          <UsersTable users={filteredUsers} employees={employees} onEdit={u => setEditUser(u)} onDelete={deleteUser}
            onDrill={(user) => { const emp = employees.find(e => e.id === user.employee_id); if (emp) setDrillEmployee(emp); }} />
          {/* Employees without user accounts */}
          {filteredNoAccount.length > 0 && (
            <div className="mt-3 card overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-gray-400" />
                  <span className="text-xs font-bold text-gray-500">Без учётной записи</span>
                </div>
                <span className="text-[10px] text-gray-400 font-medium">{filteredNoAccount.length} чел.</span>
              </div>
              {filteredNoAccount.map(emp => {
                return (
                  <div key={emp.id} onClick={() => setDrillEmployee(emp)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0 cursor-pointer">
                    <PersonAvatar />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{emp.full_name}</p>
                      {emp.position && <p className="text-[11px] text-gray-400 truncate">{emp.position}</p>}
                    </div>
                    <Badge variant="default">Нет аккаунта</Badge>
                    <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setEditEmployee(emp); setShowEmpModal(true); }}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => deleteEmployee(emp.id)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-all">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <ChevronRight size={14} className="text-gray-200 flex-shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : tab === 'roles' ? (
        <RolesManager />
      ) : null}

      <EmployeeModal open={showEmpModal} onClose={() => { setShowEmpModal(false); setEditEmployee(null); }} employee={editEmployee} onSuccess={loadAll} />
      <AddEmployeeModal open={showAddEmpModal} onClose={() => setShowAddEmpModal(false)} onSuccess={loadAll} />
      <UserModal open={showUserModal} onClose={() => setShowUserModal(false)} onSuccess={loadAll} employees={employees} />
      <EditUserModal open={!!editUser} onClose={() => setEditUser(null)} user={editUser} onSuccess={loadAll} employees={employees} />
    </div>
  );
}
