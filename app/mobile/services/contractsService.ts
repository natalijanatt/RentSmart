import {
  Contract,
  CreateContractBody,
  ContractResponse,
  ContractsResponse,
  Room,
  RoomType,
  InspectionImage,
  InspectionImagesResponse,
} from '@rentsmart/contracts';

class ContractsService {
  private baseURL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

  private generateMockContracts(userId: string): Contract[] {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const endDate = new Date(now.getFullYear() + 1, now.getMonth() + 1, 0).toISOString();

    return [
      {
        id: 'contract-001',
        landlord_id: userId,
        tenant_id: 'user-tenant-001',
        invite_code: 'ABC123DEF',
        property_address: 'Kneza Miloša 1, Beograd',
        property_gps_lat: 44.8176,
        property_gps_lng: 20.4554,
        rent_monthly_eur: 600,
        deposit_amount_eur: 1200,
        start_date: startDate,
        end_date: endDate,
        deposit_rules: 'Tenant pays deposit at signing. Deductions for damages beyond normal wear and tear.',
        notes: 'Quiet building, parking available',
        plain_language_summary: 'Apartment rental for 1 year with €1,200 deposit.',
        status: 'active',
        deposit_status: 'locked',
        contract_hash: '0xabc123def456',
        rejection_comment: null,
        created_at: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        rooms: [
          {
            id: 'room-001',
            contract_id: 'contract-001',
            room_type: 'dnevna_soba',
            custom_name: 'Living Room',
            is_mandatory: true,
            display_order: 1,
          },
          {
            id: 'room-002',
            contract_id: 'contract-001',
            room_type: 'spavaca_soba',
            custom_name: null,
            is_mandatory: true,
            display_order: 2,
          },
          {
            id: 'room-003',
            contract_id: 'contract-001',
            room_type: 'kupatilo',
            custom_name: null,
            is_mandatory: true,
            display_order: 3,
          },
          {
            id: 'room-004',
            contract_id: 'contract-001',
            room_type: 'kuhinja',
            custom_name: null,
            is_mandatory: true,
            display_order: 4,
          },
        ],
      },
      {
        id: 'contract-004',
        landlord_id: userId,
        tenant_id: 'user-tenant-004',
        invite_code: 'CHECKIN001',
        property_address: 'Nemanjina 5, Beograd',
        property_gps_lat: 44.8031,
        property_gps_lng: 20.4610,
        rent_monthly_eur: 700,
        deposit_amount_eur: 1400,
        start_date: startDate,
        end_date: endDate,
        deposit_rules: null,
        notes: 'Tenant accepted, ready for check-in',
        plain_language_summary: 'Apartment rental, check-in pending.',
        status: 'accepted',
        deposit_status: 'locked',
        contract_hash: null,
        rejection_comment: null,
        created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        rooms: [
          {
            id: 'room-040',
            contract_id: 'contract-004',
            room_type: 'dnevna_soba',
            custom_name: 'Living Room',
            is_mandatory: true,
            display_order: 1,
          },
          {
            id: 'room-041',
            contract_id: 'contract-004',
            room_type: 'spavaca_soba',
            custom_name: null,
            is_mandatory: true,
            display_order: 2,
          },
          {
            id: 'room-042',
            contract_id: 'contract-004',
            room_type: 'kupatilo',
            custom_name: null,
            is_mandatory: true,
            display_order: 3,
          },
        ],
      },
      {
        id: 'contract-002',
        landlord_id: 'user-landlord-002',
        tenant_id: userId,
        invite_code: 'XYZ789GHI',
        property_address: 'Terazije 10, Beograd',
        property_gps_lat: 44.8141,
        property_gps_lng: 20.4589,
        rent_monthly_eur: 800,
        deposit_amount_eur: 1600,
        start_date: startDate,
        end_date: endDate,
        deposit_rules: null,
        notes: 'City center location',
        plain_language_summary: 'Studio apartment in city center.',
        status: 'pending_acceptance',
        deposit_status: 'pending',
        contract_hash: null,
        rejection_comment: null,
        created_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        rooms: [
          {
            id: 'room-010',
            contract_id: 'contract-002',
            room_type: 'dnevna_soba',
            custom_name: null,
            is_mandatory: true,
            display_order: 1,
          },
        ],
      },
      {
        id: 'contract-003',
        landlord_id: userId,
        tenant_id: 'user-tenant-003',
        invite_code: 'JKL456MNO',
        property_address: 'Vlajkovićeva 25, Beograd',
        property_gps_lat: 44.8260,
        property_gps_lng: 20.4695,
        rent_monthly_eur: 500,
        deposit_amount_eur: 1000,
        start_date: new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        deposit_rules: null,
        notes: null,
        plain_language_summary: 'Completed rental.',
        status: 'completed',
        deposit_status: 'released',
        contract_hash: '0xdef789ghi012',
        rejection_comment: null,
        created_at: new Date(now.getTime() - 4 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        updated_at: new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        rooms: [
          {
            id: 'room-020',
            contract_id: 'contract-003',
            room_type: 'dnevna_soba',
            custom_name: null,
            is_mandatory: true,
            display_order: 1,
          },
        ],
      },
    ];
  }

  async createContract(userId: string, body: CreateContractBody): Promise<ContractResponse> {
    const now = new Date();
    const startDate = new Date(body.start_date);
    const endDate = new Date(body.end_date);

    const contract: Contract = {
      id: 'contract-' + Math.random().toString(36).substring(7),
      landlord_id: userId,
      tenant_id: null,
      invite_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
      property_address: body.property_address,
      property_gps_lat: body.property_gps?.lat || null,
      property_gps_lng: body.property_gps?.lng || null,
      rent_monthly_eur: body.rent_monthly_eur,
      deposit_amount_eur: body.deposit_amount_eur,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      deposit_rules: body.deposit_rules || null,
      notes: body.notes || null,
      plain_language_summary: `Apartment rental at ${body.property_address} for €${body.rent_monthly_eur}/month with €${body.deposit_amount_eur} deposit.`,
      status: 'draft',
      deposit_status: 'pending',
      contract_hash: null,
      rejection_comment: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      rooms: body.rooms.map((room, index) => ({
        id: 'room-' + Math.random().toString(36).substring(7),
        contract_id: '', // Will be set server-side
        room_type: room.room_type,
        custom_name: room.custom_name || null,
        is_mandatory: room.is_mandatory,
        display_order: index + 1,
      })),
    };

    return { contract };
  }

  async getContracts(userId: string): Promise<ContractsResponse> {
    const contracts = this.generateMockContracts(userId);
    return { contracts };
  }

  async getContract(contractId: string): Promise<ContractResponse> {
    const mockContracts = this.generateMockContracts('user-123');
    const contract = mockContracts.find((c) => c.id === contractId) || mockContracts[0];
    return { contract };
  }

  async acceptContract(contractId: string): Promise<ContractResponse> {
    const contract = (await this.getContract(contractId)).contract;
    contract.status = 'accepted' as const;
    contract.updated_at = new Date().toISOString();
    return { contract };
  }

  async cancelContract(contractId: string): Promise<ContractResponse> {
    const contract = (await this.getContract(contractId)).contract;
    contract.status = 'cancelled' as const;
    contract.updated_at = new Date().toISOString();
    return { contract };
  }

  async getContractByInviteCode(code: string): Promise<ContractResponse> {
    const mockContracts = this.generateMockContracts('user-landlord-002');
    const contract = mockContracts.find((c) => c.invite_code === code) || mockContracts[1];
    contract.invite_code = code;
    return { contract };
  }

  async uploadInspectionImages(
    contractId: string,
    roomId: string,
    inspectionType: 'checkin' | 'checkout',
    files: Array<{ uri: string; timestamp: number; gps: { lat: number; lng: number }; deviceId: string; note?: string }>
  ): Promise<InspectionImagesResponse> {
    const images: InspectionImage[] = files.map((file, index) => ({
      id: 'image-' + Math.random().toString(36).substring(7),
      contract_id: contractId,
      room_id: roomId,
      inspection_type: inspectionType,
      image_url: file.uri,
      image_hash: 'hash-' + Math.random().toString(36).substring(7),
      captured_at: new Date(file.timestamp).toISOString(),
      gps_lat: file.gps.lat,
      gps_lng: file.gps.lng,
      device_id: file.deviceId,
      note: file.note || null,
      image_index: index + 1,
      uploaded_by: 'current-user-id',
    }));

    return { images };
  }

  async getInspectionImages(contractId: string, inspectionType: 'checkin' | 'checkout'): Promise<InspectionImagesResponse> {
    const images: InspectionImage[] = [
      {
        id: 'image-001',
        contract_id: contractId,
        room_id: 'room-001',
        inspection_type: inspectionType,
        image_url: 'https://via.placeholder.com/400x300?text=Room+1',
        image_hash: 'hash-abc123',
        captured_at: new Date().toISOString(),
        gps_lat: 44.8176,
        gps_lng: 20.4554,
        device_id: 'device-123',
        note: null,
        image_index: 1,
        uploaded_by: 'landlord-user-id',
      },
    ];

    return { images };
  }
}

export const contractsService = new ContractsService();
