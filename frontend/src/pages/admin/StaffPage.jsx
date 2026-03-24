import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Users, UserCog, Pencil, Trash2, Eye, EyeOff, Package, ChevronDown, ChevronRight, Search, Copy, Check, X, Shield } from 'lucide-react';
import api from '../../api/client';
import { qty } from '../../utils/fmt';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import SortTh from '../../components/ui/SortTh';
import { useSort } from '../../hooks/useSort';
import { useToast } from '../../components/ui/Toast';

// ─── Employee Modal (edit existing) ──────────────────────────────────────────
function EmployeeModal({ open, onClose, employee, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({ full_name: '', position: '', phone: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (employee) setForm({ full_name: employee.full_name, position: employee.position || '', phone: employee.phone || '' });
  }, [employee, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.put(`/staff/employees/${employee.id}`, form);
      toast.success('Сотрудник обновлён');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Редактировать сотрудника"
      footer={<><Button variant="ghost" onClick={onClose}>Отмена</Button><Button form="emp-form" type="submit" loading={loading}>Сохранить</Button></>}>
      <form id="emp-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="ФИО" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
        <Input label="Должность" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} />
        <Input label="Телефон" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
      </form>
    </Modal>
  );
}

// ─── Add Employee from External DB Modal ─────────────────────────────────────
function AddEmployeeModal({ open, onClose, onSuccess }) {
  const toast = useToast();
  const [extEmployees, setExtEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ role: 'employee', role_id: '' });
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    if (!open) { setSearch(''); setSelected(null); setForm({ role: 'employee', role_id: '' }); return; }
    api.get('/staff/roles').then(r => setRoles(r.data)).catch(() => {});
    setLoading(true);
    api.get('/staff/external-employees')
      .then(r => setExtEmployees(r.data))
      .catch(() => toast.error('Не удалось загрузить список сотрудников'))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = extEmployees.filter(e =>
    !e.already_added && e.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (ext) => {
    setSelected(ext);
    const empRole = roles.find(r => r.name === 'Сотрудник');
    setForm({ role: 'employee', role_id: empRole ? String(empRole.id) : '' });
  };

  const handleSave = async () => {
    if (!selected.login) { toast.error('У сотрудника нет логина во внешней БД'); return; }
    setSaving(true);
    try {
      await api.post('/staff/employees', {
        full_name: selected.full_name,
        position: selected.position_name || '',
        phone: selected.phone || '',
        external_employee_id: selected.id,
        username: selected.login,
        password: selected.password_plain,
        role: form.role,
        role_id: form.role_id ? parseInt(form.role_id) : null,
      });
      toast.success(`${selected.full_name} добавлен`);
      setExtEmployees(prev => prev.map(e => e.id === selected.id ? { ...e, already_added: true } : e));
      setSelected(null);
      setForm({ username: '', password: '', role: 'employee' });
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally { setSaving(false); }
  };

  const alreadyCount = extEmployees.filter(e => e.already_added).length;

  return (
    <Modal open={open} onClose={onClose} title="Добавить сотрудника" size="lg"
      footer={selected
        ? <><Button variant="ghost" onClick={() => setSelected(null)}>Назад</Button><Button onClick={handleSave} loading={saving}>Создать</Button></>
        : <Button variant="ghost" onClick={onClose}>Закрыть</Button>
      }>
      {selected ? (
        <div className="space-y-4">
          <div className="bg-primary-50 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-800">{selected.full_name}</p>
            <p className="text-xs text-gray-500">{selected.position_name || '—'}{selected.phone ? ` · ${selected.phone}` : ''}</p>
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Доступ в систему</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-400 mb-0.5">Логин</p>
              <p className="text-sm font-mono font-medium text-gray-800">{selected.login || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-xl px-3 py-2">
              <p className="text-xs text-gray-400 mb-0.5">Пароль</p>
              <p className="text-sm font-mono font-medium text-gray-800">{selected.password_plain || '—'}</p>
            </div>
          </div>
          <Select label="Роль" value={form.role_id} onChange={e => {
            const rid = e.target.value;
            const r = roles.find(x => String(x.id) === rid);
            setForm(f => ({ ...f, role_id: rid, role: r?.name === 'Администратор' ? 'admin' : r?.name === 'Менеджер' ? 'manager' : 'employee' }));
          }}>
            <option value="">Выберите роль</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
      ) : (
        <div className="space-y-3">
          <Input placeholder="Поиск по имени..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search size={15} />} />
          <p className="text-xs text-gray-400">
            Доступно: {filtered.length} · Уже добавлено: {alreadyCount}
          </p>
          {loading ? (
            <div className="flex justify-center py-8"><Spinner size="lg" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-gray-300">
              <Users size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">{search ? 'Не найдено' : 'Все сотрудники уже добавлены'}</p>
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-1">
              {filtered.map(ext => (
                <button key={ext.id} onClick={() => handleSelect(ext)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl hover:bg-primary-50/40 transition-colors text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{ext.full_name}</p>
                    <p className="text-xs text-gray-400">{ext.position_name || '—'}{ext.phone ? ` · ${ext.phone}` : ''}</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────
function EditUserModal({ open, onClose, user, onSuccess, employees }) {
  const toast = useToast();
  const [form, setForm] = useState({ username: '', role: 'employee', role_id: '', employee_id: '', active: true });
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    if (open) api.get('/staff/roles').then(r => setRoles(r.data)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (user && open) {
      setForm({
        username: user.username || '',
        role: user.role || 'employee',
        role_id: user.role_id ? String(user.role_id) : '',
        employee_id: user.employee_id ? String(user.employee_id) : '',
        active: user.active !== false,
      });
    }
  }, [user, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        username: form.username,
        role: form.role,
        role_id: form.role_id ? parseInt(form.role_id) : null,
        employee_id: form.employee_id ? parseInt(form.employee_id) : null,
        active: form.active,
      };
      await api.put(`/staff/users/${user.id}`, payload);
      toast.success('Пользователь обновлён');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Редактировать пользователя"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button form="edit-user-form" type="submit" loading={loading}>Сохранить</Button>
      </>}
    >
      <form id="edit-user-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Логин" value={form.username}
          onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
        <Select label="Роль" value={form.role_id} onChange={e => {
          const rid = e.target.value;
          const r = roles.find(x => String(x.id) === rid);
          setForm(f => ({ ...f, role_id: rid, role: r?.name === 'Администратор' ? 'admin' : r?.name === 'Менеджер' ? 'manager' : 'employee' }));
        }}>
          <option value="">Выберите роль</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
        <Select label="Привязать к сотруднику" value={form.employee_id}
          onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
          <option value="">Не привязывать</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.full_name}</option>
          ))}
        </Select>
        <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
          <input
            type="checkbox"
            checked={form.active}
            onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
            className="w-4 h-4 rounded accent-primary-600"
          />
          <span className="text-sm font-medium text-gray-700">Активен (может входить в систему)</span>
        </label>
      </form>
    </Modal>
  );
}

// ─── User Modal ───────────────────────────────────────────────────────────────
function UserModal({ open, onClose, onSuccess, employees }) {
  const toast = useToast();
  const [form, setForm] = useState({ username: '', password: '', role: 'employee', employee_id: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/staff/users', { ...form, employee_id: form.employee_id || null });
      toast.success('Пользователь создан');
      onSuccess();
      onClose();
      setForm({ username: '', password: '', role: 'employee', employee_id: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Создать пользователя"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Отмена</Button>
        <Button form="user-form" type="submit" loading={loading}>Создать</Button>
      </>}
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
        <Input label="Логин" placeholder="ivanov" value={form.username}
          onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
        <Input
          label="Пароль"
          type={showPass ? 'text' : 'password'}
          placeholder="Минимум 6 символов"
          value={form.password}
          onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          required
          iconRight={
            <button type="button" onClick={() => setShowPass(s => !s)}>
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          }
        />
        <Select label="Роль" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
          <option value="employee">Сотрудник</option>
          <option value="manager">Менеджер (создаёт задачи)</option>
          <option value="admin">Администратор</option>
        </Select>
        <Select label="Привязать к сотруднику" value={form.employee_id}
          onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}>
          <option value="">Не привязывать</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.full_name}</option>
          ))}
        </Select>
      </form>
    </Modal>
  );
}

// ─── Employee Detail View (drill-in) ─────────────────────────────────────────
function EmployeeDetailView({ employee, onBack }) {
  const toast = useToast();
  const [inventory, setInventory] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState(null);
  const [editQty, setEditQty] = useState('');
  const [saving, setSaving] = useState(false);
  // Add product
  const [showAdd, setShowAdd] = useState(false);
  const [addSearch, setAddSearch] = useState('');
  const [addResults, setAddResults] = useState([]);
  const [addSelected, setAddSelected] = useState(null);
  const [addQty, setAddQty] = useState('1');
  const [addLoading, setAddLoading] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const debRef = useRef(null);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get(`/movements/employee-inventory/${employee.id}`).then(r => setInventory(r.data)).catch(() => {}),
      api.get(`/movements/history?employee_id=${employee.id}&limit=50`).then(r => setHistory(r.data.items || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [employee.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveQty = async () => {
    const newQty = parseFloat(editQty);
    if (isNaN(newQty) || newQty < 0) return;
    setSaving(true);
    try {
      if (newQty <= 0) {
        await api.delete(`/movements/employee-inventory/${employee.id}/${editItem.product_id}`);
        toast.success('Товар убран');
      } else {
        await api.put(`/movements/employee-inventory/${employee.id}/${editItem.product_id}`, { quantity: newQty });
        toast.success('Количество обновлено');
      }
      setEditItem(null);
      loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!confirm(`Убрать «${item.product_name}» у сотрудника?`)) return;
    try {
      await api.delete(`/movements/employee-inventory/${employee.id}/${item.product_id}`);
      toast.success('Товар убран');
      loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
  };

  const searchProducts = (q) => {
    setAddSearch(q);
    clearTimeout(debRef.current);
    if (q.length < 2) { setAddResults([]); return; }
    debRef.current = setTimeout(async () => {
      setAddLoading(true);
      try {
        const res = await api.get('/products', { params: { search: q, limit: 10 } });
        setAddResults(res.data.items || []);
      } finally { setAddLoading(false); }
    }, 300);
  };

  const handleAddProduct = async () => {
    if (!addSelected || !addQty) return;
    setAddSaving(true);
    try {
      await api.post(`/movements/employee-inventory/${employee.id}`, { product_id: addSelected.id, quantity: parseFloat(addQty) });
      toast.success('Товар добавлен');
      setShowAdd(false); setAddSearch(''); setAddResults([]); setAddSelected(null); setAddQty('1');
      loadData();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
    finally { setAddSaving(false); }
  };

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all">
          <ChevronRight size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">{employee.full_name}</h2>
          <p className="text-sm text-gray-400">{employee.position || 'Сотрудник'}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <div className="space-y-6">
          {/* Inventory */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Товар на руках {inventory.length > 0 && <span className="text-primary-500 ml-1">({inventory.length})</span>}
              </p>
              {!showAdd && (
                <button onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium">
                  <Plus size={13} /> Добавить товар
                </button>
              )}
            </div>

            {/* Add product form */}
            {showAdd && (
              <div className="card p-4 mb-3 bg-primary-50 border border-primary-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Добавить товар сотруднику</p>
                {!addSelected ? (
                  <div className="space-y-2">
                    <Input placeholder="Поиск товара..." value={addSearch} onChange={e => searchProducts(e.target.value)} icon={<Search size={15} />} />
                    {addLoading && <div className="text-center py-2"><Spinner size="sm" /></div>}
                    {addResults.length > 0 && (
                      <div className="max-h-48 overflow-y-auto space-y-1 bg-white rounded-xl p-1">
                        {addResults.map(p => (
                          <button key={p.id} onClick={() => setAddSelected(p)}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary-50 transition-colors flex items-center gap-2">
                            <Package size={14} className="text-gray-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                              {p.code && <p className="text-xs text-gray-400">{p.code}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    <button onClick={() => { setShowAdd(false); setAddSearch(''); setAddResults([]); }}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium">Отмена</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl">
                      <Package size={14} className="text-primary-500 flex-shrink-0" />
                      <p className="text-sm font-medium text-gray-800 flex-1 truncate">{addSelected.name}</p>
                      <button onClick={() => setAddSelected(null)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                    </div>
                    <div className="flex items-end gap-3">
                      <div style={{ width: 100 }}>
                        <Input label="Кол-во" type="number" min="1" value={addQty} onChange={e => setAddQty(e.target.value)} />
                      </div>
                      <Button onClick={handleAddProduct} loading={addSaving} size="sm">Добавить</Button>
                      <Button variant="ghost" size="sm" onClick={() => { setShowAdd(false); setAddSelected(null); setAddSearch(''); setAddResults([]); setAddQty('1'); }}>Отмена</Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {inventory.length === 0 && !showAdd ? (
              <div className="card p-8 text-center text-gray-300">
                <Package size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">Нет товаров на руках</p>
              </div>
            ) : (
              <div className="space-y-2">
                {inventory.map(item => (
                  <div key={item.id} className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                      <Package size={18} className="text-primary-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{item.product_name}</p>
                      {item.product_code && <p className="text-xs text-gray-400">{item.product_code}</p>}
                    </div>
                    {editItem?.product_id === item.product_id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <input type="number" min="0" step="1" value={editQty}
                          onChange={e => setEditQty(e.target.value)} autoFocus
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveQty(); if (e.key === 'Escape') setEditItem(null); }}
                          className="w-16 text-center text-sm font-bold border border-primary-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary-300" />
                        <button onClick={handleSaveQty} disabled={saving} className="p-1 rounded-lg text-green-500 hover:bg-green-50">
                          {saving ? <Spinner size="xs" /> : <Check size={14} />}
                        </button>
                        <button onClick={() => setEditItem(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X size={14} /></button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-lg font-black text-primary-600">{qty(item.quantity)}</span>
                        <span className="text-xs text-gray-400">шт.</span>
                        <button onClick={() => { setEditItem(item); setEditQty(String(parseFloat(item.quantity))); }}
                          className="p-1 rounded-lg text-gray-400 hover:text-primary-500 hover:bg-primary-50 transition-all">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(item)}
                          className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Access info */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Доступ</p>
            {employee.user_id ? (
              <div className="card p-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-gray-400">Логин</p>
                      <p className="text-sm font-mono font-medium text-gray-800">{employee.username}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Роль</p>
                      <p className="text-sm font-medium text-gray-800">{employee.role === 'admin' ? 'Администратор' : employee.role === 'manager' ? 'Менеджер' : 'Сотрудник'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Статус</p>
                      <Badge variant={employee.user_active ? 'success' : 'default'} dot>{employee.user_active ? 'Активен' : 'Неактивен'}</Badge>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card p-4 text-center text-gray-300">
                <p className="text-sm">Нет учётной записи</p>
              </div>
            )}
          </div>

          {/* Movement history */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              История перемещений {history.length > 0 && <span className="text-primary-500 ml-1">({history.length})</span>}
            </p>
            {history.length === 0 ? (
              <p className="text-sm text-gray-300 text-center py-4">Нет перемещений</p>
            ) : (
              <div className="card overflow-hidden divide-y divide-gray-50">
                {history.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{m.product_name || '—'}</p>
                      <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-400 flex-wrap">
                        {m.from_shelf_code && <span>{m.from_shelf_code}</span>}
                        {m.from_pallet_name && <span>{m.from_pallet_name}</span>}
                        {m.from_employee_name && <span>{m.from_employee_name}</span>}
                        <span className="text-gray-300">→</span>
                        {m.to_shelf_code && <span>{m.to_shelf_code}</span>}
                        {m.to_pallet_name && <span>{m.to_pallet_name}</span>}
                        {m.to_employee_name && <span>{m.to_employee_name}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-primary-600">{qty(m.quantity)} шт.</p>
                      <p className="text-xs text-gray-400">{fmtDate(m.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
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

// ─── Users Table ──────────────────────────────────────────────────────────────
function UsersTable({ users, onEdit, onDelete }) {
  const { sorted, sort, toggle } = useSort(users, 'username');

  if (users.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center h-32 text-gray-400">
        <UserCog size={32} className="mb-2 opacity-30" />
        <p className="text-sm">Нет пользователей</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <SortTh label="Логин" sortKey="username" sort={sort} onSort={toggle} />
            <SortTh label="Роль" sortKey="role" sort={sort} onSort={toggle} />
            <SortTh label="Сотрудник" sortKey="employee_name" sort={sort} onSort={toggle} />
            <SortTh label="Статус" sortKey="active" sort={sort} onSort={toggle} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(user => (
            <tr key={user.id}>
              <td className="font-mono font-medium text-gray-900">{user.username}</td>
              <td>
                <Badge variant={user.role === 'admin' ? 'primary' : 'info'}>
                  {user.role === 'admin' ? 'Администратор' : 'Сотрудник'}
                </Badge>
              </td>
              <td className="text-gray-500 text-xs">{user.employee_name || '—'}</td>
              <td>
                <Badge variant={user.active ? 'success' : 'default'} dot>
                  {user.active ? 'Активен' : 'Неактивен'}
                </Badge>
              </td>
              <td>
                <div className="flex items-center gap-1 justify-end">
                  <button onClick={() => onEdit(user)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-primary-500 hover:bg-primary-50 transition-all">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => onDelete(user.id)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

  const load = useCallback(() => {
    setLoading(true);
    api.get('/staff/roles').then(r => setRoles(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (role) => {
    if (!confirm(`Удалить роль «${role.name}»?`)) return;
    try {
      await api.delete(`/staff/roles/${role.id}`);
      toast.success('Роль удалена');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Ошибка'); }
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
                <button onClick={() => handleDelete(role)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all">
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
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function StaffPage() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'employees';
  const setTab = (t) => setSearchParams({ tab: t });
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [editEmployee, setEditEmployee] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [drillEmployee, setDrillEmployee] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [emp, usr] = await Promise.all([
        api.get('/staff/employees'),
        api.get('/staff/users'),
      ]);
      setEmployees(emp.data);
      setUsers(usr.data);
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Сотрудники</h1>
          <p className="text-gray-500 text-sm mt-1">Управление сотрудниками и доступами</p>
        </div>
        {tab === 'employees' && (
          <Button icon={<Plus size={15} />} size="sm" onClick={() => setShowAddEmpModal(true)}>
            Добавить сотрудника
          </Button>
        )}
        {tab === 'users' && (
          <Button icon={<Plus size={15} />} size="sm" onClick={() => setShowUserModal(true)}>
            Добавить пользователя
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-xl w-fit">
        {[
          { value: 'employees', label: `Сотрудники (${employees.length})`, icon: Users },
          { value: 'users', label: `Доступы (${users.length})`, icon: UserCog },
          { value: 'roles', label: 'Роли', icon: Shield },
        ].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {drillEmployee ? (
        <EmployeeDetailView employee={drillEmployee} onBack={() => { setDrillEmployee(null); loadAll(); }} />
      ) : loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size="lg" /></div>
      ) : tab === 'employees' ? (
        <EmployeesTable
          employees={employees}
          onEdit={(emp) => { setEditEmployee(emp); setShowEmpModal(true); }}
          onDelete={deleteEmployee}
          onDrill={setDrillEmployee}
        />
      ) : tab === 'users' ? (
        <UsersTable users={users} onEdit={u => setEditUser(u)} onDelete={deleteUser} />
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
