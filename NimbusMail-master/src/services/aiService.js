import { logger } from "../utils/logger.js";

// When AI_PERSONALISATION_ENABLED=true the worker will call this module to
// rewrite email body content per recipient before sending.
// ENGINEER A: import Anthropic SDK and initialise with ANTHROPIC_API_KEY.

const enabled = process.env.AI_PERSONALISATION_ENABLED === "true";

export async function personalise(recipient, baseContent) {
  if (!enabled) return baseContent;
  logger.info("AI personalisation requested", { recipient });
  // TODO: call Anthropic API with the recipient context and baseContent
  return baseContent;
}
