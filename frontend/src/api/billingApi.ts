import axiosInstance from './axiosInstance';
import type { BillingReport } from '../types';

export const billingApi = {
  getReport: async (year: number, month: number): Promise<BillingReport> => {
    const { data } = await axiosInstance.get<BillingReport>('/billing/report', {
      params: { year, month },
    });
    return data;
  },
};

export default billingApi;
