import axios from 'axios';

export type Branch = 'north' | 'south' | 'east' | 'west' | 'central';
export const BRANCHES: Branch[] = ['north', 'south', 'east', 'west', 'central'];

export interface AccountCreate {
    customer_id: string;
    customer_name: string;
    branch_id: Branch;
    initial_balance: number;
}

export interface AccountResponse {
    id: string;
    customer_id: string;
    customer_name: string;
    branch_id: string;
    available_balance: number;
    locked_balance: number;
    status: string;
    created_at?: string;
}

export interface TransferRequest {
    initiator_id: string;
    source_branch: Branch;
    source_account_id: string;
    target_branch: Branch;
    target_account_id: string;
    amount: number;
    idempotency_key?: string;
}

export interface GlobalQueryRequest {
    customer_id?: string;
    status?: 'ACTIVE' | 'INACTIVE' | 'FROZEN';
    min_balance?: number;
}

export interface TransactionLogEntry {
    id: string;
    type: string;
    source_branch?: string;
    target_branch?: string;
    amount?: number;
    state: string;
    error?: string;
    created_at?: string;
    committed_at?: string;
}

let _apiKey = 'dev-secret-key-change-in-production';

// Use ReturnType to avoid any AxiosInstance type annotation entirely
let api = axios.create({
    baseURL: 'http://127.0.0.1:8000',
    headers: {
        'Content-Type': 'application/json',
        'X-API-Key': _apiKey,
    },
});

function _rebuildClient() {
    api = axios.create({
        baseURL: 'http://127.0.0.1:8000',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': _apiKey,
        },
    });
}

export function setApiKey(key: string) {
    _apiKey = key;
    _rebuildClient();
}

export const bankingService = {
    checkHealth: async () => {
        const r = await api.get('/');
        return r.data as { message: string; version: string };
    },
    checkDetailedHealth: async () => {
        const r = await api.get('/health');
        return r.data as { branches: Record<string, string>; timestamp: string };
    },
    createAccount: async (data: AccountCreate): Promise<AccountResponse> => {
        const r = await api.post('/accounts/', data);
        return r.data;
    },
    listAccounts: async (branchId: Branch, status?: string): Promise<AccountResponse[]> => {
        const params = status ? { status } : {};
        const r = await api.get(`/accounts/${branchId}`, { params });
        return r.data;
    },
    getAccount: async (branchId: Branch, accountId: string): Promise<AccountResponse> => {
        const r = await api.get(`/accounts/${branchId}/${accountId}`);
        return r.data;
    },
    updateAccountStatus: async (branchId: Branch, accountId: string, newStatus: string) => {
        const r = await api.patch(`/accounts/${branchId}/${accountId}/status`, null, {
            params: { new_status: newStatus },
        });
        return r.data;
    },
    globalQuery: async (req: GlobalQueryRequest) => {
        const r = await api.post('/query/global', req);
        return r.data as {
            total_results: number;
            branches_queried: string[];
            branch_errors: Record<string, string>;
            accounts: AccountResponse[];
            query_filter: Record<string, unknown>;
        };
    },
    findCustomerAcrossBranches: async (customerId: string) => {
        const r = await api.get(`/query/customer/${customerId}`);
        return r.data as { customer_id: string; total_accounts: number; accounts: AccountResponse[] };
    },
    executeTransfer: async (data: TransferRequest) => {
        const r = await api.post('/transfer/', data);
        return r.data as {
            message: string;
            transaction_id: string;
            phase: string;
            amount: number;
            source_branch: string;
            target_branch: string;
            idempotent?: boolean;
        };
    },
    listTransactions: async (state?: string, limit = 50): Promise<TransactionLogEntry[]> => {
        const params: Record<string, unknown> = { limit };
        if (state) params.state = state;
        const r = await api.get('/transactions/', { params });
        return r.data;
    },
};