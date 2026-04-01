import {
  CreateContractBody,
  ContractResponse,
  ContractsResponse,
  InspectionImagesResponse,
} from '@rentsmart/contracts';
import api from './api';

class ContractsService {
  async createContract(body: CreateContractBody): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>('/contracts', body);
    return response.data;
  }

  async getContracts(): Promise<ContractsResponse> {
    const response = await api.get<ContractsResponse>('/contracts');
    return response.data;
  }

  async getContract(contractId: string): Promise<ContractResponse> {
    const response = await api.get<ContractResponse>(`/contracts/${contractId}`);
    return response.data;
  }

  async acceptContract(contractId: string, inviteCode: string): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>(`/contracts/${contractId}/accept`, { invite_code: inviteCode });
    return response.data;
  }

  async cancelContract(contractId: string): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>(`/contracts/${contractId}/cancel`);
    return response.data;
  }

  async getContractByInviteCode(code: string): Promise<ContractResponse> {
    const response = await api.get<ContractResponse>(`/contracts/invite/${code}`);
    return response.data;
  }

  async uploadInspectionImages(
    contractId: string,
    roomId: string,
    inspectionType: 'checkin' | 'checkout',
    files: Array<{ uri: string; timestamp: number; gps: { lat: number; lng: number }; deviceId: string; note?: string }>
  ): Promise<InspectionImagesResponse> {
    const formData = new FormData();
    formData.append('room_id', roomId);
    files.forEach((file, index) => {
      const filename = file.uri.split('/').pop() ?? `image_${index}.jpg`;
      // RN FormData file blob shape — 'as any' is standard for React Native
      formData.append('images', { uri: file.uri, name: filename, type: 'image/jpeg' } as any);
      formData.append('captured_at', new Date(file.timestamp).toISOString());
      formData.append('gps_lat', String(file.gps.lat));
      formData.append('gps_lng', String(file.gps.lng));
      formData.append('device_id', file.deviceId);
      if (file.note !== undefined) formData.append('notes', file.note);
    });
    const endpoint = inspectionType === 'checkin'
      ? `/contracts/${contractId}/checkin/images`
      : `/contracts/${contractId}/checkout/images`;
    const response = await api.post<InspectionImagesResponse>(endpoint, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  async startCheckin(contractId: string): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>(`/contracts/${contractId}/checkin/start`);
    return response.data;
  }

  async completeCheckin(contractId: string): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>(`/contracts/${contractId}/checkin/complete`);
    return response.data;
  }

  async startCheckout(contractId: string): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>(`/contracts/${contractId}/checkout/start`);
    return response.data;
  }

  async completeCheckout(contractId: string): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>(`/contracts/${contractId}/checkout/complete`);
    return response.data;
  }

  async approveCheckout(contractId: string): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>(`/contracts/${contractId}/checkout/approve`);
    return response.data;
  }

  async rejectCheckout(contractId: string, comment: string): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>(`/contracts/${contractId}/checkout/reject`, { comment });
    return response.data;
  }

  async approveCheckin(contractId: string): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>(`/contracts/${contractId}/checkin/approve`);
    return response.data;
  }

  async rejectCheckin(contractId: string, comment: string): Promise<ContractResponse> {
    const response = await api.post<ContractResponse>(`/contracts/${contractId}/checkin/reject`, { comment });
    return response.data;
  }

  async getInspectionImages(contractId: string, inspectionType: 'checkin' | 'checkout'): Promise<InspectionImagesResponse> {
    const endpoint = inspectionType === 'checkin'
      ? `/contracts/${contractId}/checkin/images`
      : `/contracts/${contractId}/checkout/images`;
    const response = await api.get<InspectionImagesResponse>(endpoint);
    return response.data;
  }
}

export const contractsService = new ContractsService();
