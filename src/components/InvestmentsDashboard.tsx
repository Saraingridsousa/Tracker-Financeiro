import {
  ArrowDownRight,
  ArrowUpRight,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  Coins,
  Landmark,
  Plus,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import type { AssetPosition, AssetType, InvestmentOrder } from '../types/finance';

const assetTypeMeta: Record<AssetType, { color: string; icon: typeof Wallet }> = {
  Ações: { color: '#38bdf8', icon: TrendingUp },
  FIIs: { color: '#a78bfa', icon: Landmark },
  'Tesouro Direto': { color: '#34d399', icon: Wallet },
  Criptomoedas: { color: '#f59e0b', icon: Coins },
  ETFs: { color: '#f472b6', icon: BriefcaseBusiness },
  'Renda Fixa': { color: '#f97316', icon: ArrowDownRight },
  Outros: { color: '#94a3b8', icon: ChevronDown },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const typeOrder: AssetType[] = ['Ações', 'FIIs', 'Tesouro Direto', 'Criptomoedas', 'ETFs', 'Renda Fixa', 'Outros'];

type Props = {
  assets: AssetPosition[];
  orders: InvestmentOrder[];
  onAddAsset: (asset: Omit<AssetPosition, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => AssetPosition;
  onUpdateAsset: (assetId: string, updates: Partial<AssetPosition>) => void;
  onDeleteAsset: (assetId: string) => void;
  onAddOrder: (order: Omit<InvestmentOrder, 'id'> & { id?: string }) => InvestmentOrder;
  onDeleteOrder: (orderId: string) => void;
  onImportCsv: (csvText: string) => AssetPosition[];
};

export function InvestmentsDashboard({
  assets,
  orders,
  onAddAsset,
  onUpdateAsset,
  onDeleteAsset,
  onAddOrder,
  onDeleteOrder,
  onImportCsv,
}: Props) {
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedType, setExpandedType] = useState<AssetType | null>('Ações');
  const [form, setForm] = useState({
    tickerOrName: '',
    type: 'Ações' as AssetType,
    quantity: '1',
    avgPrice: '0',
    currentPrice: '0',
    targetAllocationPercent: '0',
    operation: 'BUY' as 'BUY' | 'SELL',
    date: new Date().toISOString().slice(0, 10),
  });

  const summary = useMemo(() => {
    const totalInvested = assets.reduce((sum, asset) => sum + asset.avgPrice * asset.quantity, 0);
    const totalCurrentValue = assets.reduce((sum, asset) => sum + asset.currentPrice * asset.quantity, 0);
    const totalProfit = totalCurrentValue - totalInvested;
    const distinctCount = assets.length;

    const allocation = typeOrder.map((type) => {
      const group = assets.filter((asset) => asset.type === type);
      const value = group.reduce((sum, asset) => sum + asset.currentPrice * asset.quantity, 0);
      const invested = group.reduce((sum, asset) => sum + asset.avgPrice * asset.quantity, 0);
      const profit = value - invested;
      const target = group.reduce((sum, asset) => sum + (asset.targetAllocationPercent ?? 0), 0);

      return {
        type,
        value,
        invested,
        profit,
        profitPercent: invested > 0 ? (profit / invested) * 100 : 0,
        currentPercent: totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0,
        targetPercent: target,
        count: group.length,
      };
    });

    return {
      totalInvested,
      totalCurrentValue,
      totalProfit,
      totalProfitPercent: totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0,
      distinctCount,
      allocation,
    };
  }, [assets]);

  const pieData = summary.allocation
    .filter((item) => item.value > 0)
    .map((item) => ({
      name: item.type,
      value: item.value,
      color: assetTypeMeta[item.type].color,
    }));

  const toggleExpanded = (type: AssetType) => {
    setExpandedType((current) => (current === type ? null : type));
  };

  const submitAsset = () => {
    if (!form.tickerOrName.trim()) return;

    const quantity = Number(form.quantity) || 0;
    const avgPrice = Number(form.avgPrice) || 0;
    const currentPrice = Number(form.currentPrice) || 0;

    const nextAsset = {
      tickerOrName: form.tickerOrName.trim(),
      type: form.type,
      quantity,
      avgPrice,
      currentPrice,
      targetAllocationPercent: Number(form.targetAllocationPercent) || undefined,
    };

    const existing = assets.find(
      (asset) => asset.tickerOrName.toLowerCase() === nextAsset.tickerOrName.toLowerCase() && asset.type === nextAsset.type,
    );

    const assetId = existing?.id ?? onAddAsset(nextAsset).id;

    if (form.operation === 'BUY' || form.operation === 'SELL') {
      onAddOrder({
        assetId,
        ticker: nextAsset.tickerOrName,
        type: nextAsset.type,
        operation: form.operation,
        date: form.date,
        quantity,
        unitPrice: currentPrice || avgPrice,
        totalValue: quantity * (currentPrice || avgPrice),
      });
    }

    if (existing && form.operation === 'BUY') {
      const mergedQuantity = existing.quantity + quantity;
      const newAverage = (existing.avgPrice * existing.quantity + avgPrice * quantity) / mergedQuantity;
      onUpdateAsset(existing.id, {
        quantity: mergedQuantity,
        avgPrice: newAverage,
        currentPrice,
      });
    }

    if (existing && form.operation === 'SELL') {
      onUpdateAsset(existing.id, {
        quantity: Math.max(0, existing.quantity - quantity),
        currentPrice,
      });
    }

    setForm({
      tickerOrName: '',
      type: 'Ações',
      quantity: '1',
      avgPrice: '0',
      currentPrice: '0',
      targetAllocationPercent: '0',
      operation: 'BUY',
      date: new Date().toISOString().slice(0, 10),
    });
    setIsModalOpen(false);
  };

  const handleCsvImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    onImportCsv(text);
    event.target.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <p className="text-sm text-slate-500 dark:text-slate-400">Patrimônio Total Investido</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatCurrency(summary.totalInvested)}</h3>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <p className="text-sm text-slate-500 dark:text-slate-400">Rentabilidade acumulada</p>
          <div className="mt-2 flex items-center gap-2">
            <h3 className="text-2xl font-semibold text-slate-900 dark:text-white">{formatCurrency(summary.totalProfit)}</h3>
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${summary.totalProfit >= 0 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
              {summary.totalProfit >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {formatPercent(summary.totalProfitPercent)}
            </span>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <p className="text-sm text-slate-500 dark:text-slate-400">Ativos cadastrados</p>
          <h3 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{summary.distinctCount}</h3>
        </article>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1.8fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Alocação patrimonial</h3>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400"
            >
              <Plus className="h-4 w-4" />
              Novo Aporte / Ativo
            </button>
          </div>

          {pieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={2}>
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-slate-500 dark:text-slate-400">Ainda não há ativos na carteira.</div>
          )}

          <div className="mt-4 space-y-2">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-950/70">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-slate-700 dark:text-slate-200">{item.name}</span>
                </div>
                <span className="text-sm text-slate-500 dark:text-slate-400">{formatPercent(summary.allocation.find((entry) => entry.type === item.name)?.currentPercent ?? 0)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Classes de ativos</h3>
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              Importar CSV
            </button>
            <input ref={csvInputRef} type="file" accept=".csv" hidden onChange={handleCsvImport} />
          </div>

          <div className="space-y-3">
            {typeOrder.map((type) => {
              const item = summary.allocation.find((entry) => entry.type === type)!;
              const Icon = assetTypeMeta[type].icon;
              const isExpanded = expandedType === type;

              return (
                <div key={type} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950/60">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(type)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl p-2" style={{ backgroundColor: `${assetTypeMeta[type].color}22` }}>
                        <Icon className="h-4 w-4" style={{ color: assetTypeMeta[type].color }} />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{type}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{item.count} ativos</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{formatCurrency(item.value)}</div>
                      <div className={`text-xs ${item.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                        {formatPercent(item.profitPercent)}
                      </div>
                    </div>

                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-700">
                      <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <div>Aplicado: {formatCurrency(item.invested)}</div>
                        <div>Meta: {formatPercent(item.targetPercent || 0)}</div>
                        <div>% atual: {formatPercent(item.currentPercent)}</div>
                        <div>% real: {formatPercent(item.currentPercent)}</div>
                      </div>

                      {assets.filter((asset) => asset.type === type).length > 0 ? (
                        <div className="space-y-2">
                          {assets
                            .filter((asset) => asset.type === type)
                            .map((asset) => {
                              const market = asset.currentPrice * asset.quantity;
                              const invested = asset.avgPrice * asset.quantity;
                              const delta = market - invested;
                              return (
                                <div key={asset.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                                  <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{asset.tickerOrName}</div>
                                      <div className="text-xs text-slate-500 dark:text-slate-400">
                                        {asset.quantity} unidades · {formatCurrency(asset.currentPrice)} atual
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{formatCurrency(market)}</div>
                                      <div className={`text-xs ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        {formatCurrency(delta)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => onDeleteAsset(asset.id)}
                                      className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400"
                                    >
                                      Excluir
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-500 dark:text-slate-400">Nenhum ativo nessa categoria.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Novo aporte / ativo</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-slate-700 dark:text-slate-300">
                ✕
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2 text-sm text-slate-600 dark:text-slate-300">
                Ticker / nome do ativo
                <input
                  value={form.tickerOrName}
                  onChange={(event) => setForm((current) => ({ ...current, tickerOrName: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 outline-none ring-0 focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>

              <label className="text-sm text-slate-600 dark:text-slate-300">
                Tipo
                <select
                  value={form.type}
                  onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as AssetType }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  {typeOrder.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-600 dark:text-slate-300">
                Operação
                <select
                  value={form.operation}
                  onChange={(event) => setForm((current) => ({ ...current, operation: event.target.value as 'BUY' | 'SELL' }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                >
                  <option value="BUY">Compra</option>
                  <option value="SELL">Venda</option>
                </select>
              </label>

              <label className="text-sm text-slate-600 dark:text-slate-300">
                Quantidade
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.quantity}
                  onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>

              <label className="text-sm text-slate-600 dark:text-slate-300">
                Preço médio
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.avgPrice}
                  onChange={(event) => setForm((current) => ({ ...current, avgPrice: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>

              <label className="text-sm text-slate-600 dark:text-slate-300">
                Cotação atual
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.currentPrice}
                  onChange={(event) => setForm((current) => ({ ...current, currentPrice: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>

              <label className="text-sm text-slate-600 dark:text-slate-300">
                Meta de alocação (%)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.targetAllocationPercent}
                  onChange={(event) => setForm((current) => ({ ...current, targetAllocationPercent: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>

              <label className="text-sm text-slate-600 dark:text-slate-300">
                Data
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                Cancelar
              </button>
              <button type="button" onClick={submitAsset} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400">
                Salvar ativo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
