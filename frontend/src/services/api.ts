import axios from 'axios';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Branch = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST' | 'CENTRAL';
export const BRANCHES: Branch[] = ['NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL'];

export interface CustomerCreate {
    customer_id:   string;
    customer_name: string;
    password:      string;
}

export interface CustomerResponse {
    customer_id:   string;
    customer_name: string;
    created_at?:   string;
}

/** Matches AccountCreate Pydantic model — no customer_name (taken from customers collection) */
export interface AccountCreate {
    customer_id:     string;
    branch:          Branch;
    initial_balance: number;
}

/** Matches AccountResponse Pydantic model returned by all endpoints */
export interface AccountResponse {
    id:                string;
    account_number:    string;
    account_title:     string;
    customer_id:       string;
    branch:            string;
    available_balance: number;
    locked_balance:    number;
    status:            string;
    created_at?:       string;
}

/** idempotency_key is now required (min 10 chars) */
export interface TransferRequest {
    initiator_id:      string;
    source_branch:     Branch;
    source_account_id: string;
    target_branch:     Branch;
    target_account_id: string;
    amount:            number;
    idempotency_key:   string;   // required — auto-generated if not provided by user
}

export interface GlobalQueryRequest {
    customer_id?: string;
    status?:      'ACTIVE' | 'INACTIVE' | 'FROZEN';
    min_balance?: number;
}

/** TX states: INITIATED -> PREPARED -> COMMITTED / ABORTED */
export interface TransactionLogEntry {
    id:                string;
    type:              string;
    initiator_id:      string;
    source_branch?:    string;
    source_account_id?: string;
    target_branch?:    string;
    target_account_id?: string;
    amount?:           number;
    state:             string;   // 'INITIATED' | 'PREPARED' | 'COMMITTED' | 'ABORTED'
    idempotency_key:   string;
    error?:            string;
    created_at?:       string;
    updated_at?:       string;
}

// ── Axios client ──────────────────────────────────────────────────────────────

const API_KEY = 'dev-secret-key-change-in-production';

const api = axios.create({
    baseURL: 'http://127.0.0.1:8000',
    headers: {
        'Content-Type': 'application/json',
        'X-API-Key':    API_KEY,
    },
});

// ── Service ───────────────────────────────────────────────────────────────────

export const bankingService = {

    // ── Authentication ──────────────────────────────────────────────────────
    login: async (customerId: string, password: string) => {
        const r = await api.post('/auth/login', { customer_id: customerId, password });
        return r.data as {
            customer_id:    string;
            customer_name:  string;
            total_accounts: number;
            accounts:       AccountResponse[];
        };
    },

    // ── Customer registry ───────────────────────────────────────────────────
    registerCustomer: async (data: CustomerCreate): Promise<CustomerResponse> => {
        const r = await api.post('/customers/', data);
        return r.data;
    },
    getCustomer: async (customerId: string): Promise<CustomerResponse> => {
        const r = await api.get(`/customers/${customerId}`);
        return r.data;
    },

    // ── Health ───────────────────────────────────────────────────────────────
    checkHealth: async () => {
        const r = await api.get('/');
        return r.data as { message: string; version: string };
    },
    checkDetailedHealth: async () => {
        const r = await api.get('/health');
        return r.data as { branches: Record<string, string>; timestamp: string };
    },

    // ── Accounts ─────────────────────────────────────────────────────────────
    createAccount: async (data: AccountCreate): Promise<AccountResponse> => {
        const r = await api.post('/accounts/', data);
        return r.data;
    },
    listAccounts: async (branch: Branch, status?: string): Promise<AccountResponse[]> => {
        const params = status ? { status } : {};
        const r = await api.get(`/accounts/${branch}`, { params });
        return r.data;
    },
    getAccount: async (branch: Branch, accountId: string): Promise<AccountResponse> => {
        const r = await api.get(`/accounts/${branch}/${accountId}`);
        return r.data;
    },
    updateAccountStatus: async (branch: Branch, accountId: string, newStatus: string) => {
        const r = await api.patch(`/accounts/${branch}/${accountId}/status`, null, {
            params: { new_status: newStatus },
        });
        return r.data;
    },

    // ── Distributed queries ───────────────────────────────────────────────────
    globalQuery: async (req: GlobalQueryRequest) => {
        const r = await api.post('/query/global', req);
        return r.data as {
            total_results:    number;
            branches_queried: string[];
            branch_errors:    Record<string, string>;
            accounts:         AccountResponse[];
            query_filter:     Record<string, unknown>;
        };
    },
    findCustomerAcrossBranches: async (customerId: string) => {
        const r = await api.get(`/query/customer/${customerId}`);
        return r.data as {
            customer_id:    string;
            customer_name:  string;
            total_accounts: number;
            accounts:       AccountResponse[];
        };
    },

    // ── Transfers ─────────────────────────────────────────────────────────────
    executeTransfer: async (data: TransferRequest) => {
        const r = await api.post('/transfer/', data);
        return r.data as {
            message:        string;
            transaction_id: string;
            phase:          string;
            amount:         number;
            source_branch:  string;
            target_branch:  string;
            idempotent?:    boolean;
        };
    },

    // ── Ledger ────────────────────────────────────────────────────────────────
    listTransactions: async (stateFilter?: string, limit = 50): Promise<TransactionLogEntry[]> => {
        const params: Record<string, unknown> = { limit };
        if (stateFilter) params.state = stateFilter;
        const r = await api.get('/transactions/', { params });
        return r.data;
    },
};