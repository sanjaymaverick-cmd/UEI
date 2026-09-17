import { describe, expect, it } from "vitest";
import { calculateBill } from "../packages/domain/src/settlement";
import { parseChargerQr } from "../apps/mobile/src/chargerQr";

describe("Billing and charger QR boundaries", () => {
  it("rounds integer energy/tax amounts at the currency boundary", () => {
    expect(calculateBill(1000, 2200, 0)).toEqual({ subtotalPaise: 2200, taxPaise: 0, totalPaise: 2200 });
    expect(calculateBill(333, 2200, 1800)).toEqual({ subtotalPaise: 733, taxPaise: 132, totalPaise: 865 });
    expect(() => calculateBill(-1, 2200, 0)).toThrow();
    expect(() => calculateBill(2147483647, 2147483647, 0)).toThrow();
  });
  it("accepts only the simulator QR format and never accepts payment or web redirects", () => {
    expect(parseChargerQr("uei-demo://charger?provider=sim-a&item=sim-a-ccs&lat=12.97&lon=77.59")).toMatchObject({ providerId: "sim-a", latitude: 12.97 });
    for (const value of ["https://evil.example", "upi://pay?pa=test", "uei-demo://charger?provider=sim-a&item=sim-a-ccs&lat=NaN&lon=77", "uei-demo://charger?provider=sim-a&item=sim-a-ccs&lat=12&lon=77&lat=13"])
      expect(() => parseChargerQr(value)).toThrow();
  });
});
