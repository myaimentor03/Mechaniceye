import {
  CommerceContractError,
  type PaymentProviderAdapter,
} from "./order-contract.js";

/**
 * Safe default until an authenticated server-side payment provider is configured.
 * It cannot normalize a payload or create verified commerce state.
 */
export class DisabledPaymentProviderAdapter implements PaymentProviderAdapter {
  readonly adapterId = "payments_disabled";
  readonly capabilities = Object.freeze({
    configured: false,
    serverSideOnly: true,
    verifiesAuthenticity: false,
    bindsOrderIdFromAuthenticatedMetadata: false,
  });

  async verifyAndNormalize(_payload: unknown): Promise<never> {
    throw new CommerceContractError(
      "provider_unavailable",
      "Payments are not configured",
    );
  }
}
