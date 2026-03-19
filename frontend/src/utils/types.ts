// types.ts

export type Notice = {
    index: number;
    input: {
        index: number;
    };
    payload: string;
};

export type Report = {
    index: number;
    input: {
        index: number;
    };
    payload: string;
};

export type Voucher = {
    index: number;
    input: {
        index: number;
        /** Input timestamp (ISO string or Unix seconds). Used for "due for execution" estimate. */
        timestamp?: string;
        /** L1 block number when input was added. Used for epoch-end estimate. */
        blockNumber?: number;
    };
    destination: string;
    payload: string;
};

export type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};