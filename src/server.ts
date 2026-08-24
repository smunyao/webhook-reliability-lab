import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { WebhookReceiver } from "./receiver.js";

const maximumPayloadBytes = 1_000_000;

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;

    if (size > maximumPayloadBytes) {
      throw new Error("payload_too_large");
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function createReceiverServer(receiver: WebhookReceiver) {
  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/webhooks") {
      sendJson(response, 404, { message: "Route not found." });
      return;
    }

    try {
      const payload = await readBody(request);
      const signatureHeader = request.headers["x-webhook-signature"];
      const signature = Array.isArray(signatureHeader)
        ? signatureHeader[0]
        : signatureHeader;
      const result = receiver.handle(payload, signature);

      sendJson(response, result.status, {
        outcome: result.outcome,
        message: result.message,
      });
    } catch (error) {
      const payloadTooLarge =
        error instanceof Error && error.message === "payload_too_large";

      sendJson(response, payloadTooLarge ? 413 : 500, {
        message: payloadTooLarge
          ? "The webhook payload is too large."
          : "The receiver could not process the request.",
      });
    }
  });
}

export async function startReceiverServer(receiver: WebhookReceiver): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = createReceiverServer(receiver);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("The receiver server did not expose a TCP address.");
  }

  return {
    url: `http://127.0.0.1:${address.port}/webhooks`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
