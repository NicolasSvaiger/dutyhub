import axiosInstance from './axiosInstance';
import type { BillingReport } from '../types';

export type BillingExportFormat = 'pdf' | 'xlsx';

export const billingApi = {
  getReport: async (year: number, month: number): Promise<BillingReport> => {
    const { data } = await axiosInstance.get<BillingReport>('/billing/report', {
      params: { year, month },
    });
    return data;
  },

  /**
   * Baixa o relatório de faturamento do mês em PDF ou Excel. responseType=blob
   * porque um <a href> direto não carrega o Bearer token. Preserva o filename
   * do Content-Disposition e dispara o download via <a download>.
   */
  downloadReport: async (format: BillingExportFormat, year: number, month: number): Promise<void> => {
    const response = await axiosInstance.get<Blob>('/billing/report/export', {
      params: { format, year, month },
      responseType: 'blob',
    });

    const disposition = response.headers['content-disposition'] ?? '';
    const filename =
      /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? `relatorio-faturamento.${format}`;

    const url = URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

export default billingApi;
