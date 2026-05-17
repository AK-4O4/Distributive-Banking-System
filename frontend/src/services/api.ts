import axios from 'axios';

export interface AccountCreate {
    customer_id: string;
    customer_name: string;
    branch_id: 'north' | 'south' | 'east' | 'west' | 'central';
    initial_balance: number;
}

export interface TransferRequest {
    initiator_id: string;
    source_branch: 'north' | 'south' | 'east' | 'west' | 'central';
    source_account_id: string;
    target_branch: 'north' | 'south' | 'east' | 'west' | 'central';
    target_account_id: string;
    amount: number;
}

const api = axios.create({
    baseURL: 'http://127.0.0.1:8000',
    headers: { 'Content-Type': 'application/json' },
});

export const bankingService = {
    checkHealth: async (): Promise<{ message: string }> => {
        const response = await api.get('/');
        return response.data;
    },
    createAccount: async (accountData: AccountCreate) => {
        const response = await api.post('/accounts/', accountData);
        return response.data;
    },
    executeTransfer: async (transferData: TransferRequest) => {
        const response = await api.post('/transfer/', transferData);
        return response.data;
    }
};

export default api;