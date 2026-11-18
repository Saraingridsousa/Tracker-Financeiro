import type { KeyboardEvent } from 'react';
export type MainTab = 'overview' | 'investments' | 'cards' | 'connections';
const tabs = [{ key: 'overview', label: 'Visão Geral' }, { key: 'investments', label: 'Investimentos' }, { key: 'cards', label: 'Cartões' }, { key: 'connections', label: 'Conexões' }] as const;
export function MainTabs({ active, onChange }: { active: MainTab; onChange: (tab: MainTab) => void }) {
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); onChange(tabs[next].key);
    document.getElementById('tab-' + tabs[next].key)?.focus();
  }
  return <nav role="tablist" aria-label="Navegação principal" className="flex w-full gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900 sm:w-fit">
    {tabs.map((tab, index) => <button key={tab.key} id={'tab-' + tab.key} type="button" role="tab" aria-controls={'panel-' + tab.key} aria-selected={active === tab.key} tabIndex={active === tab.key ? 0 : -1} onClick={() => onChange(tab.key)} onKeyDown={e => navigate(e, index)} className={'flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600 ' + (active === tab.key ? 'bg-cyan-500 text-slate-950' : 'hover:bg-slate-100 dark:hover:bg-slate-800')}>{tab.label}</button>)}
  </nav>;
}
