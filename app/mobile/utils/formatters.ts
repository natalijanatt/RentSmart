export const formatCurrency = (
  amount: number,
  currency: string = 'EUR'
): string => {
  if (!amount && amount !== 0) return `0 ${currency}`;
  const formatted = new Intl.NumberFormat('sr-RS', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  return formatted;
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('sr-RS', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

export const formatDateTime = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('sr-RS', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const formatTime = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('sr-RS', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const getInitials = (name: string): string => {
  if (!name) return '';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

export const truncateString = (str: string, length: number): string => {
  if (!str) return '';
  return str.length > length ? str.substring(0, length) + '...' : str;
};

export const getContractStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    draft: 'Nacrt',
    pending_acceptance: 'Čeka prihvatanje',
    accepted: 'Prihvaćen',
    checkin_in_progress: 'Check-in u toku',
    checkin_pending_approval: 'Check-in čeka odobrenje',
    checkin_rejected: 'Check-in odbijen',
    active: 'Aktivan',
    checkout_in_progress: 'Check-out u toku',
    checkout_pending_approval: 'Check-out čeka odobrenje',
    checkout_rejected: 'Check-out odbijen',
    pending_analysis: 'Analiza u toku',
    settlement: 'Poravnanje',
    completed: 'Završen',
    cancelled: 'Otkazan',
    // Legacy uppercase keys
    CREATED: 'Kreirano',
    INVITED: 'Pozvan',
    ACCEPTED: 'Prihvaćen',
    ACTIVE: 'Aktivan',
    PENDING: 'U čekanju',
    COMPLETED: 'Završen',
    CANCELLED: 'Otkazan',
    REJECTED: 'Odbijen',
  };
  return labels[status] || status;
};

export const getAuditEventLabel = (eventType: string): string => {
  const labels: Record<string, string> = {
    CONTRACT_CREATED: 'Ugovor kreiran',
    CONTRACT_INVITED: 'Poziv poslat',
    CONTRACT_ACCEPTED: 'Ugovor prihvaćen',
    DEPOSIT_LOCKED: 'Depozit zakljuchan',
    CHECKIN_STARTED: 'Ulazak počeo',
    CHECKIN_COMPLETED: 'Ulazak završen',
    CHECKOUT_STARTED: 'Izlazak počeo',
    CHECKOUT_COMPLETED: 'Izlazak završen',
    ANALYSIS_STARTED: 'Analiza počela',
    ANALYSIS_COMPLETED: 'Analiza završena',
    SETTLEMENT_CREATED: 'Poravnanje kreirano',
    SETTLEMENT_PROPOSED: 'Poravnanje predloženo',
    SETTLEMENT_APPROVED: 'Poravnanje odobreno',
    SETTLEMENT_FINALIZED: 'Poravnanje završeno',
    PAYMENT_INITIATED: 'Plaćanje je inicirano',
    PAYMENT_COMPLETED: 'Plaćanje je završeno',
    SETTLEMENT_VIEWED: 'Poravnanje pregledano',
  };
  return labels[eventType] || eventType;
};

export const getSeverityLabel = (severity: string): string => {
  const labels: Record<string, string> = {
    MINOR: 'Mala šteta',
    MEDIUM: 'Srednja šteta',
    MAJOR: 'Velika šteta',
  };
  return labels[severity] || severity;
};

export const getConditionLabel = (condition: string): string => {
  const labels: Record<string, string> = {
    EXCELLENT: 'Odličnog stanja',
    GOOD: 'Dobrog stanja',
    FAIR: 'Zadovoljavajućeg stanja',
    POOR: 'Lošeg stanja',
  };
  return labels[condition] || condition;
};

export const getSeverityColor = (severity: string): string => {
  switch (severity.toUpperCase()) {
    case 'MINOR':
      return '#1B5E20';
    case 'MEDIUM':
      return '#F57C00';
    case 'MAJOR':
      return '#B3261E';
    default:
      return '#666666';
  }
};

export const getConditionColor = (condition: string): string => {
  switch (condition.toUpperCase()) {
    case 'EXCELLENT':
      return '#1B5E20';
    case 'GOOD':
      return '#0277BD';
    case 'FAIR':
      return '#F57C00';
    case 'POOR':
      return '#B3261E';
    default:
      return '#666666';
  }
};

export const getRoomTypeLabel = (roomType: string): string => {
  const labels: Record<string, string> = {
    dnevna_soba: 'Dnevna soba',
    spavaca_soba: 'Spavaća soba',
    kupatilo: 'Kupatilo',
    kuhinja: 'Kuhinja',
    kupatilo_prazenje: 'Kupatilo (pražnjenje)',
    terasa: 'Terasa',
    balkon: 'Balkon',
    garaža: 'Garaža',
  };
  return labels[roomType] || roomType;
};

export const calculateDaysUntil = (date: string): number => {
  if (!date) return 0;
  const targetDate = new Date(date);
  const today = new Date();
  const diffTime = targetDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};
