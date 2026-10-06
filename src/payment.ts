export class PaymentDeclinedError extends Error {}

export interface PaymentGateway {
  /** Resolves when the charge succeeded. Throws PaymentDeclinedError if the card was declined. */
  charge(amountSubunits: number, reference: string): Promise<void>;
}

const delayMs = Number(process.env.PAYMENT_DELAY_MS ?? 50);

/** Stand-in for a real provider: always approves, after a delay like a network call. */
export const fakeGateway: PaymentGateway = {
  async charge() {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  },
};

let gateway: PaymentGateway = fakeGateway;

export function getPaymentGateway(): PaymentGateway {
  return gateway;
}

/** Tests use this to simulate declines and slow payments. */
export function setPaymentGateway(next: PaymentGateway): void {
  gateway = next;
}
