import { AuditTrailResponse } from '@rentsmart/contracts';
import api from './api';

class AuditService {
  async getAuditTrail(contractId: string): Promise<AuditTrailResponse> {
    const response = await api.get<AuditTrailResponse>(`/contracts/${contractId}/audit`);
    return response.data;
  }
}

export const auditService = new AuditService();
