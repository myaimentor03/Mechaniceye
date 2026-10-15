export function isDurablyPersistedDiagnosisResponse(status: number, body: unknown): boolean {
  return status >= 200
    && status < 300
    && typeof body === "object"
    && body !== null
    && "persisted" in body
    && body.persisted === true;
}

export function requiresCustomerReauthentication(status: number, body: unknown): boolean {
  return status === 401
    && typeof body === "object"
    && body !== null
    && "code" in body
    && body.code === "CUSTOMER_AUTH_REQUIRED";
}
