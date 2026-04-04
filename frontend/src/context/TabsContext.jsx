import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const TabsContext = createContext(null);
const STORAGE_KEY = 'browser_tabs_v3';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function save(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

export function TabsProvider({ children }) {
  const [tabs, setTabs] = useState(() => {
    const s = load();
    return s?.tabs?.length > 0 ? s.tabs : [{ id: 1, path: '/admin/warehouse', title: 'Склады', state: {} }];
  });
  const [activeId, setActiveId] = useState(() => load()?.activeId || 1);
  const nextIdRef = useRef(Math.max(...(load()?.tabs?.map(t => t.id) || [1])) + 1);
  const switchingRef = useRef(false);

  useEffect(() => { save({ tabs, activeId }); }, [tabs, activeId]);

  // Get/set tab-scoped state
  const getTabState = useCallback((key, defaultValue) => {
    const tab = tabs.find(t => t.id === activeId);
    if (!tab?.state || !(key in tab.state)) return defaultValue;
    return tab.state[key];
  }, [tabs, activeId]);

  const setTabState = useCallback((key, value) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== activeId) return t;
      return { ...t, state: { ...t.state, [key]: typeof value === 'function' ? value(t.state?.[key]) : value } };
    }));
  }, [activeId]);

  const updateActiveUrl = useCallback((path, title) => {
    if (switchingRef.current) return;
    setTabs(prev => prev.map(t => t.id === activeId ? { ...t, path, title: title || t.title } : t));
  }, [activeId]);

  const switchTab = useCallback((id) => {
    switchingRef.current = true;
    setActiveId(id);
    setTimeout(() => { switchingRef.current = false; }, 150);
  }, []);

  const createTab = useCallback(() => {
    const id = nextIdRef.current++;
    switchingRef.current = true;
    setTabs(prev => [...prev, { id, path: '/admin/new-tab', title: 'Новая вкладка', state: {} }]);
    setActiveId(id);
    setTimeout(() => { switchingRef.current = false; }, 150);
    return id;
  }, []);

  const closeTab = useCallback((id) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(t => t.id === id);
      const next = prev.filter(t => t.id !== id);
      if (id === activeId) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveId(next[newIdx].id);
      }
      return next;
    });
  }, [activeId]);

  const isSwitching = useCallback(() => switchingRef.current, []);

  return (
    <TabsContext.Provider value={{ tabs, activeId, switchTab, createTab, closeTab, updateActiveUrl, getTabState, setTabState, isSwitching }}>
      {children}
    </TabsContext.Provider>
  );
}

export function useTabs() { return useContext(TabsContext); }
