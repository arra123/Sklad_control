import { useCallback } from 'react';
import { useTabs } from '../context/TabsContext';

/**
 * useState replacement that stores state per-tab.
 * Each tab gets independent values.
 *
 * Usage: const [value, setValue] = useTabState('selectedWarehouse', null);
 */
export function useTabState(key, defaultValue) {
  const { getTabState, setTabState } = useTabs();
  const value = getTabState(key, defaultValue);
  const setValue = useCallback((v) => setTabState(key, v), [key, setTabState]);
  return [value, setValue];
}
