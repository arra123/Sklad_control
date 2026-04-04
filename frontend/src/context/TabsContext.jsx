import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const TabsContext = createContext(null);
const STORAGE_KEY = 'browser_tabs_v2';

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function save(tabs, activeId) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeId }));
}

export function TabsProvider({ children }) {
  const [tabs, setTabs] = useState(() => {
    const s = load();
    return s?.tabs?.length > 0 ? s.tabs : [{ id: 1, path: '/admin/warehouse', title: 'Склады' }];
  });
  const [activeId, setActiveId] = useState(() => load()?.activeId || 1);
  const nextIdRef = useRef(Math.max(...(load()?.tabs?.map(t => t.id) || [1])) + 1);
  const switchingRef = useRef(false); // true during tab switch to prevent URL overwrite

  useEffect(() => { save(tabs, activeId); }, [tabs, activeId]);

  const activeTab = tabs.find(t => t.id === activeId) || tabs[0];

  // Update active tab's URL — called on route change, but NOT during tab switch
  const updateActiveUrl = useCallback((path, title) => {
    if (switchingRef.current) return; // ignore during switch
    setTabs(prev => prev.map(t => t.id === activeId ? { ...t, path, title: title || t.title } : t));
  }, [activeId]);

  // Switch tab — sets flag to prevent URL sync
  const switchTab = useCallback((id) => {
    switchingRef.current = true;
    setActiveId(id);
    // Clear flag after navigation completes
    setTimeout(() => { switchingRef.current = false; }, 100);
  }, []);

  // Create new tab
  const createTab = useCallback(() => {
    const id = nextIdRef.current++;
    switchingRef.current = true;
    setTabs(prev => [...prev, { id, path: '/admin/new-tab', title: 'Новая вкладка' }]);
    setActiveId(id);
    setTimeout(() => { switchingRef.current = false; }, 100);
    return id;
  }, []);

  // Close tab
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

  return (
    <TabsContext.Provider value={{ tabs, activeTab, activeId, switchTab, createTab, closeTab, updateActiveUrl, isSwitching: () => switchingRef.current }}>
      {children}
    </TabsContext.Provider>
  );
}

export function useTabs() { return useContext(TabsContext); }
