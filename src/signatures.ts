import { createHmac, timingSafeEqual } from "node:crypto";

const signaturePrefix = "sha256=";

export function signPayload(payload: string, secret: string): string {
  const digest = createHmac("sha256", secret).update(payload).digest("hex");

  return `${signaturePrefix}${digest}`;
}

export function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature?.startsWith(signaturePrefix)) {
    return false;
  }

  const expected = Buffer.from(signPayload(payload, secret));
  const received = Buffer.from(signature);

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
