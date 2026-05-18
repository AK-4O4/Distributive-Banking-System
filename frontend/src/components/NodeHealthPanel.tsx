import { useState, useEffect, useCallback } from 'react';
import { bankingService } from '../services/api';

interface HealthData {
    branches: Record<string, string>;
    timestamp: string;
}

const BRANCH_LABELS: Record<string, string> = {
    north: 'North', south: 'South', east: 'East', west: 'West', central: 'Central',
};

export default function NodeHealthPanel() {
    const [health, setHealth] = useState<HealthData | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await bankingService.checkDetailedHealth();
            setHealth(data);
        } catch {
            setHealth(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                    Live connectivity check — each ping hits the respective MongoDB Atlas node.
                </p>
                <button
                    onClick={refresh}
                    disabled={loading}
                    className="text-xs px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                    {loading ? '⟳' : '↻ Ping'}
                </button>
            </div>

            <div className="grid grid-cols-5 gap-2">
                {Object.entries(BRANCH_LABELS).map(([key, label]) => {
                    const status = health?.branches?.[key];
                    const isOk = status === 'ok';
                    const isUnknown = status === undefined;
                    return (
                        <div
                            key={key}
                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-colors ${isUnknown ? 'border-slate-200 bg-slate-50' :
                                    isOk ? 'border-emerald-200 bg-emerald-50' :
                                        'border-red-200 bg-red-50'
                                }`}
                        >
                            <div className={`w-2.5 h-2.5 rounded-full ${isUnknown ? 'bg-slate-300' :
                                    isOk ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                                }`} />
                            <span className="text-xs font-semibold text-slate-700">{label}</span>
                            <span className={`text-xs font-mono ${isOk ? 'text-emerald-600' :
                                    isUnknown ? 'text-slate-400' : 'text-red-600'
                                }`}>
                                {isUnknown ? '—' : isOk ? 'OK' : 'ERR'}
                            </span>
                        </div>
                    );
                })}
            </div>

            {health?.timestamp && (
                <p className="text-xs text-slate-400">
                    Last checked: {new Date(health.timestamp).toLocaleTimeString()}
                </p>
            )}
        </div>
    );
}
