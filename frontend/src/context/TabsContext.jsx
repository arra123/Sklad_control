import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const TabsContext = createContext(null);
const STORAGE_KEY = 'browser_tabs';

function loadTabs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
function saveTabs(tabs, activeId) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ tabs, activeId }));
}

export function TabsProvider({ children }) {
  const [tabs, setTabs] = useState(() => {
    const saved = loadTabs();
    if (saved?.tabs?.length > 0) return saved.tabs;
    return [{ id: 1, path: '/admin/warehouse', title: 'Склады' }];
  });
  const [activeId, setActiveId] = useState(() => {
    const saved = loadTabs();
    return saved?.activeId || 1;
  });
  const [nextId, setNextId] = useState(() => {
    const saved = loadTabs();
    return saved?.tabs ? Math.max(...saved.tabs.map(t => t.id)) + 1 : 2;
  });

  // Save on change
  useEffect(() => { saveTabs(tabs, activeId); }, [tabs, activeId]);

  const activeTab = tabs.find(t => t.id === activeId) || tabs[0];

  // Update current tab's URL (called on every navigation)
  const updateActiveUrl = useCallback((path, title) => {
    setTabs(prev => prev.map(t => t.id === activeId ? { ...t, path, title: title || t.title } : t));
  }, [activeId]);

  // Switch to a tab
  const switchTab = useCallback((id) => {
    setActiveId(id);
  }, []);

  // Create new tab (opens "new tab page")
  const createTab = useCallback(() => {
    const id = nextId;
    setNextId(id + 1);
    setTabs(prev => [...prev, { id, path: '/admin/new-tab', title: 'Новая вкладка' }]);
    setActiveId(id);
    return id;
  }, [nextId]);

  // Close tab
  const closeTab = useCallback((id) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev; // keep at least 1
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
    <TabsContext.Provider value={{ tabs, activeTab, activeId, switchTab, createTab, closeTab, updateActiveUrl }}>
      {children}
    </TabsContext.Provider>
  );
}

export function useTabs() {
  return useContext(TabsContext);
}
