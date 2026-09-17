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
  } | null;
};
export type Routes = {
  Phone: undefined;
  Otp: { phone: string };
  Vehicles: undefined;
  Home: { vehicleId: string };
  Chargers: { searchId: string; vehicleId: string };
  Detail: { charger: Charger; vehicleId: string };
  Quote: { orderId: string };
  Activity: undefined;
  Profile: undefined;
  Scanner: undefined;
  ActiveCharging: undefined;
};
