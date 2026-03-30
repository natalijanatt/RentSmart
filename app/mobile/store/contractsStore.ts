import { create } from 'zustand';
import { Contract, InspectionImage, Settlement, AnalysisResult } from '@rentsmart/contracts';

interface Inspection {
  contractId: string;
  inspectionType: 'checkin' | 'checkout';
  images: InspectionImage[];
  roomId: string | null;
  isLoading: boolean;
}

interface ContractsState {
  contracts: Contract[];
  selectedContract: Contract | null;
  inspections: Map<string, Inspection>;
  settlement: Settlement | null;
  analysis: AnalysisResult[] | null;
  isLoading: boolean;
  error: string | null;

  setContracts: (contracts: Contract[]) => void;
  addContract: (contract: Contract) => void;
  setSelectedContract: (contract: Contract | null) => void;
  updateContract: (contract: Contract) => void;
  setInspection: (contractId: string, inspection: Inspection) => void;
  addInspectionImage: (contractId: string, image: InspectionImage) => void;
  getInspection: (contractId: string) => Inspection | undefined;
  setSettlement: (settlement: Settlement | null) => void;
  setAnalysis: (analysis: AnalysisResult[] | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useContractsStore = create<ContractsState>((set, get) => ({
  contracts: [],
  selectedContract: null,
  inspections: new Map(),
  settlement: null,
  analysis: null,
  isLoading: false,
  error: null,

  setContracts: (contracts) => set({ contracts }),
  addContract: (contract) => set((state) => ({
    contracts: [contract, ...state.contracts],
  })),
  setSelectedContract: (contract) => set({ selectedContract: contract }),
  updateContract: (contract) => set((state) => ({
    contracts: state.contracts.map((c) => (c.id === contract.id ? contract : c)),
    selectedContract: state.selectedContract?.id === contract.id ? contract : state.selectedContract,
  })),
  setInspection: (contractId, inspection) => {
    set((state) => {
      const newInspections = new Map(state.inspections);
      newInspections.set(contractId, inspection);
      return { inspections: newInspections };
    });
  },
  addInspectionImage: (contractId, image) => {
    set((state) => {
      const newInspections = new Map(state.inspections);
      const existing = newInspections.get(contractId);
      if (existing) {
        newInspections.set(contractId, {
          ...existing,
          images: [...existing.images, image],
        });
      }
      return { inspections: newInspections };
    });
  },
  getInspection: (contractId) => get().inspections.get(contractId),
  setSettlement: (settlement) => set({ settlement }),
  setAnalysis: (analysis) => set({ analysis }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  reset: () => set({
    contracts: [],
    selectedContract: null,
    inspections: new Map(),
    settlement: null,
    analysis: null,
    isLoading: false,
    error: null,
  }),
}));
