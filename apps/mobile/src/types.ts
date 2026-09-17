export type Variant = {
  id: string;
  name: string;
  connectors: { connector: string }[];
};
export type Make = {
  id: string;
  name: string;
  models: { id: string; name: string; variants: Variant[] }[];
};
export type Vehicle = {
  id: string;
  nickname: string;
  variant: Variant & { model: { name: string } };
};
export type Charger = {
  id: string;
  name: string;
  connector: string;
  pricePaise: number;
  providerId: string;
  itemId: string;
  latitude: string | number;
  longitude: string | number;
};
export type Search = {
  id: string;
  status: string;
  message: string | null;
  results: Charger[];
};
export type Order = {
  id: string;
  state: string;
  transactionId: string;
  needsReconciliation?: boolean;
  quotes: { amountPaise: number; expiresAt: string }[];
  paymentTerms: {
    collector: string;
    method: string;
    prepayment: boolean;
  } | null;
  payment: {
    state: string;
    amountPaise: number;
    method: string;
    capturedPaise: number;
    releasedPaise: number;
    refunds: { id: string; amountPaise: number; state: string }[];
  } | null;
  fulfillment: { session: {
    id: string; state: string; startedAt: string | null; endedAt: string | null;
    energyWh: number; measuredAt: string | null;
  } | null } | null;
  invoice: { id: string; state: string; energyWh: number; subtotalPaise: number; taxPaise: number; totalPaise: number; mode: string } | null;
};
export type Routes = {
  Phone: undefined;
  Otp: { phone: string };
  Vehicles: undefined;
  Home: { vehicleId: string };
  Chargers: { searchId: string; vehicleId: string; target?: { providerId: string; itemId: string } };
  Detail: { charger: Charger; vehicleId: string };
  Quote: { orderId: string };
  Activity: undefined;
  Profile: undefined;
  Scanner: { vehicleId: string };
  ActiveCharging: { orderId: string };
};
