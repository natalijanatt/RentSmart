import {
  SettlementResponse,
  ApproveSettlementResponse,
  AnalysisResultsResponse,
} from '@rentsmart/contracts';
import api from './api';

class AnalysisService {
  async getAnalysisResults(contractId: string): Promise<AnalysisResultsResponse> {
    const response = await api.get<AnalysisResultsResponse>(`/contracts/${contractId}/analysis`);
    return response.data;
  }

  async getSettlement(contractId: string): Promise<SettlementResponse> {
    const response = await api.get<SettlementResponse>(`/contracts/${contractId}/settlement`);
    return response.data;
  }

  async approveSettlement(contractId: string): Promise<ApproveSettlementResponse> {
    const response = await api.post<ApproveSettlementResponse>(`/contracts/${contractId}/settlement/approve`);
    return response.data;
  }
}

export const analysisService = new AnalysisService();
