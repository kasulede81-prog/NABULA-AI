import Stripe from "stripe";
import { env } from "../config/env";

let client: InstanceType<typeof Stripe> | undefined;

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function getStripe(): InstanceType<typeof Stripe> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}
