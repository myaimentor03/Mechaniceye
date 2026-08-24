type IdentityBearingCase = {
  email?: string;
  customerEmail?: string;
  description: string;
};

export function authenticatedCaseOwnerId(value: unknown): string {
  const userId = typeof value === "string" ? value.trim() : "";
  if (!userId) throw new Error("Authenticated case owner is required");
  return userId;
}

export function applyAuthenticatedCaseIdentity<T extends IdentityBearingCase>(input: T, emailValue: unknown): T {
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  if (!email || !email.includes("@")) throw new Error("Authenticated delivery email is required");
  const replacement = `Customer Email: ${email}`;
  const description = /(^|\n)Customer Email:\s*.*(?=\n|$)/i.test(input.description)
    ? input.description.replace(/(^|\n)Customer Email:\s*.*(?=\n|$)/i, `$1${replacement}`)
    : `${input.description}\n${replacement}`.trim();
  return { ...input, email, customerEmail: email, description };
}
