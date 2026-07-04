import { logger } from "../utils/logger.js";

const enabled = process.env.AI_PERSONALISATION_ENABLED === "true";

export async function personalise(recipient, baseContent) {
  if (!enabled) return baseContent;
  logger.info("AI personalisation requested", { recipient });
  return baseContent;
}
