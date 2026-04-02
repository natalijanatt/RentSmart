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
    CREATED: 'Created',
    INVITED: 'Invited',
    ACCEPTED: 'Accepted',
    ACTIVE: 'Active',
    PENDING: 'Pending',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    REJECTED: 'Rejected',
  };
  return labels[status] || status;
};

export const getAuditEventLabel = (eventType: string): string => {
  const labels: Record<string, string> = {
    CONTRACT_CREATED: 'Contract created',
    CONTRACT_INVITED: 'Invitation sent',
    CONTRACT_ACCEPTED: 'Contract accepted',
    DEPOSIT_LOCKED: 'Deposit locked',
    CHECKIN_STARTED: 'Check-in started',
    CHECKIN_COMPLETED: 'Check-in completed',
    CHECKOUT_STARTED: 'Check-out started',
    CHECKOUT_COMPLETED: 'Check-out completed',
    ANALYSIS_STARTED: 'Analysis started',
    ANALYSIS_COMPLETED: 'Analysis completed',
    SETTLEMENT_CREATED: 'Settlement created',
    SETTLEMENT_PROPOSED: 'Settlement proposed',
    SETTLEMENT_APPROVED: 'Settlement approved',
    SETTLEMENT_FINALIZED: 'Settlement finalized',
    PAYMENT_INITIATED: 'Payment initiated',
    PAYMENT_COMPLETED: 'Payment completed',
    SETTLEMENT_VIEWED: 'Settlement viewed',
  };
  return labels[eventType] || eventType;
};

export const getSeverityLabel = (severity: string): string => {
  const labels: Record<string, string> = {
    MINOR: 'Minor damage',
    MEDIUM: 'Medium damage',
    MAJOR: 'Major damage',
  };
  return labels[severity] || severity;
};

export const getConditionLabel = (condition: string): string => {
  const labels: Record<string, string> = {
    EXCELLENT: 'Excellent condition',
    GOOD: 'Good condition',
    FAIR: 'Fair condition',
    POOR: 'Poor condition',
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
    dnevna_soba: 'Living room',
    spavaca_soba: 'Bedroom',
    kupatilo: 'Bathroom',
    kuhinja: 'Kitchen',
    kupatilo_prazenje: 'Bathroom (drainage)',
    terasa: 'Terrace',
    balkon: 'Balcony',
    garaža: 'Garage',
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
