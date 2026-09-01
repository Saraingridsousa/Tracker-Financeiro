import { useEffect, useMemo, useState } from 'react';

import type { AssetPosition, AssetType, InvestmentBackupPayload, InvestmentOrder } from '../types/finance';

const ASSETS_KEY = 'tracker-financeiro:investments';
const ORDERS_KEY = 'tracker-financeiro:investment-orders';

const readAssets = (): AssetPosition[] => {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(ASSETS_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as AssetPosition[];
  } catch {
    return [];
  }
};

const readOrders = (): InvestmentOrder[] => {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(ORDERS_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as InvestmentOrder[];
  } catch {
    return [];
  }
};

const persistAssets = (assets: AssetPosition[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ASSETS_KEY, JSON.stringify(assets));
};

const persistOrders = (orders: InvestmentOrder[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
};

const parseCsvValue = (value: string) => value.trim();

export const useInvestments = () => {
  const [assets, setAssets] = useState<AssetPosition[]>(readAssets());
  const [orders, setOrders] = useState<InvestmentOrder[]>(readOrders());

  useEffect(() => {
    persistAssets(assets);
  }, [assets]);

  useEffect(() => {
    persistOrders(orders);
  }, [orders]);

  const addAsset = (asset: Omit<AssetPosition, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
    const normalized: AssetPosition = {
      id: asset.id ?? crypto.randomUUID(),
      tickerOrName: parseCsvValue(asset.tickerOrName),
      type: asset.type,
      quantity: Number(asset.quantity) || 0,
      avgPrice: Number(asset.avgPrice) || 0,
      currentPrice: Number(asset.currentPrice) || 0,
      targetAllocationPercent: asset.targetAllocationPercent,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setAssets((prev) => {
      const existing = prev.find(
        (item) => item.tickerOrName.toLowerCase() === normalized.tickerOrName.toLowerCase() && item.type === normalized.type,
      );

      if (!existing) {
        return [...prev, normalized];
      }

      return prev.map((item) =>
        item.id === existing.id
          ? {
              ...item,
              quantity: Number(item.quantity) + Number(normalized.quantity),
              avgPrice: Number(item.avgPrice) || 0,
              currentPrice: Number(normalized.currentPrice) || Number(item.currentPrice) || 0,
              targetAllocationPercent: normalized.targetAllocationPercent ?? item.targetAllocationPercent,
              updatedAt: new Date().toISOString(),
            }
          : item,
      );
    });

    return normalized;
  };

  const updateAsset = (assetId: string, updates: Partial<AssetPosition>) => {
    setAssets((prev) =>
      prev.map((asset) =>
        asset.id === assetId
          ? {
              ...asset,
              ...updates,
              tickerOrName: updates.tickerOrName ? parseCsvValue(updates.tickerOrName) : asset.tickerOrName,
              quantity: Number(updates.quantity ?? asset.quantity),
              avgPrice: Number(updates.avgPrice ?? asset.avgPrice),
              currentPrice: Number(updates.currentPrice ?? asset.currentPrice),
              updatedAt: new Date().toISOString(),
            }
          : asset,
      ),
    );
  };

  const deleteAsset = (assetId: string) => {
    setAssets((prev) => prev.filter((asset) => asset.id !== assetId));
    setOrders((prev) => prev.filter((order) => order.assetId !== assetId));
  };

  const addOrder = (order: Omit<InvestmentOrder, 'id'> & { id?: string }) => {
    const nextOrder: InvestmentOrder = {
      id: order.id ?? crypto.randomUUID(),
      assetId: order.assetId,
      ticker: parseCsvValue(order.ticker),
      type: order.type,
      operation: order.operation,
      date: order.date,
      quantity: Number(order.quantity) || 0,
      unitPrice: Number(order.unitPrice) || 0,
      totalValue: Number(order.totalValue) || 0,
    };

    setOrders((prev) => [...prev, nextOrder]);
    return nextOrder;
  };

  const deleteOrder = (orderId: string) => {
    setOrders((prev) => prev.filter((order) => order.id !== orderId));
  };

  const importAssetsFromCsv = (csvText: string) => {
    const rows = csvText
      .split(/\r?\n/)
      .map((row) => row.trim())
      .filter(Boolean);

    if (rows.length < 2) return [];

    const header = rows[0].split(',').map((entry) => entry.trim().toLowerCase());
    const fieldMap = {
      tickeorname: 'tickerOrName',
      ticker: 'tickerOrName',
      name: 'tickerOrName',
      type: 'type',
      quantity: 'quantity',
      avgprice: 'avgPrice',
      currentprice: 'currentPrice',
      targetallocation: 'targetAllocationPercent',
      targetallocationpercent: 'targetAllocationPercent',
    } as const;

    const created: AssetPosition[] = [];

    for (let index = 1; index < rows.length; index += 1) {
      const columns = rows[index].split(',').map((entry) => entry.trim());
      const record = Object.fromEntries(
        header.map((key, headerIndex) => {
          const mappedKey = fieldMap[key as keyof typeof fieldMap] ?? key;
          return [mappedKey, columns[headerIndex] ?? ''];
        }),
      );

      if (!record.tickerOrName || !record.type) continue;

      const asset = {
        tickerOrName: record.tickerOrName,
        type: record.type as AssetType,
        quantity: Number(record.quantity) || 0,
        avgPrice: Number(record.avgPrice) || 0,
        currentPrice: Number(record.currentPrice) || 0,
        targetAllocationPercent: record.targetAllocationPercent ? Number(record.targetAllocationPercent) : undefined,
      };

      created.push(addAsset(asset));
    }

    return created;
  };

  const portfolioSummary = useMemo(() => {
    const totalInvested = assets.reduce((sum, asset) => sum + asset.avgPrice * asset.quantity, 0);
    const totalCurrentValue = assets.reduce((sum, asset) => sum + asset.currentPrice * asset.quantity, 0);
    const totalProfit = totalCurrentValue - totalInvested;
    const totalProfitPct = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
    const byType = Object.values(['Ações', 'FIIs', 'Tesouro Direto', 'Criptomoedas', 'ETFs', 'Renda Fixa', 'Outros'] as AssetType[]).reduce(
      (acc, type) => {
        const group = assets.filter((asset) => asset.type === type);
        const value = group.reduce((sum, asset) => sum + asset.currentPrice * asset.quantity, 0);
        const invested = group.reduce((sum, asset) => sum + asset.avgPrice * asset.quantity, 0);
        const targetPercent = group.reduce((sum, asset) => sum + (asset.targetAllocationPercent ?? 0), 0);

        acc[type] = {
          type,
          assetsCount: group.length,
          totalValue: value,
          totalInvested: invested,
          totalProfit: value - invested,
          totalProfitPct: invested > 0 ? ((value - invested) / invested) * 100 : 0,
          currentPercent: totalCurrentValue > 0 ? (value / totalCurrentValue) * 100 : 0,
          targetPercent,
        };

        return acc;
      },
      {} as Record<AssetType, { type: AssetType; assetsCount: number; totalValue: number; totalInvested: number; totalProfit: number; totalProfitPct: number; currentPercent: number; targetPercent: number }>,
    );

    return {
      totalInvested,
      totalCurrentValue,
      totalProfit,
      totalProfitPct,
      distinctAssets: assets.length,
      byType,
    };
  }, [assets]);

  const resetAllData = () => {
    setAssets([]);
    setOrders([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ASSETS_KEY);
      window.localStorage.removeItem(ORDERS_KEY);
    }
  };

  const importBackup = (payload: InvestmentBackupPayload) => {
    setAssets(payload.assets ?? []);
    setOrders(payload.investmentOrders ?? []);
  };

  const exportBackup = (): InvestmentBackupPayload => ({
    assets,
    investmentOrders: orders,
    exportedAt: new Date().toISOString(),
  });

  return {
    assets,
    orders,
    addAsset,
    updateAsset,
    deleteAsset,
    addOrder,
    deleteOrder,
    importAssetsFromCsv,
    portfolioSummary,
    resetAllData,
    importBackup,
    exportBackup,
  };
};
