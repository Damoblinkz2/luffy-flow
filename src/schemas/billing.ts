import * as z from "zod/v3"

import { entityIdSchema, isoDateTimeSchema } from "./common"

/** Plan identifiers stay provider-neutral so a hosted checkout can replace the mock. */
export const planIdSchema = z.enum(["free", "pro", "business"])
export const billingStatusSchema = z.enum(["active", "trialing", "past_due", "cancelled"])

export const subscriptionSchema = z.object({
  id: entityIdSchema,
  userId: entityIdSchema,
  planId: planIdSchema,
  billingStatus: billingStatusSchema,
  monthlyLimit: z.number().int().nonnegative(),
  currentPeriodStart: isoDateTimeSchema,
  currentPeriodEnd: isoDateTimeSchema,
  cancelAtPeriodEnd: z.boolean(),
  provider: z.literal("mock"),
  updatedAt: isoDateTimeSchema,
})

/** Remaining usage is supplied explicitly and checked against used/limit by services. */
export const usageSchema = z.object({
  userId: entityIdSchema,
  periodStart: isoDateTimeSchema,
  periodEnd: isoDateTimeSchema,
  used: z.number().int().nonnegative(),
  limit: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  updatedAt: isoDateTimeSchema,
})

export const invoicePlaceholderSchema = z.object({
  id: entityIdSchema,
  date: isoDateTimeSchema,
  description: z.string().min(1).max(500),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(["paid", "open", "void"]),
})

/** Checkout return URLs are limited to safe web or installed-extension origins. */
const checkoutReturnUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine((value) => {
    try {
      const url = new URL(value)
      if (url.protocol === "https:" || url.protocol === "chrome-extension:") return true
      return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    } catch {
      return false
    }
  }, "Checkout return URL must use HTTPS, a local development origin, or this extension.")

/** Checkout is a hosted-provider-shaped placeholder and never contains card data. */
export const checkoutRequestSchema = z.object({
  planId: z.enum(["pro", "business"]),
  returnUrl: checkoutReturnUrlSchema,
})

export const checkoutResultSchema = z.object({
  provider: z.literal("mock"),
  status: z.literal("completed"),
  checkoutReference: z.string().min(1).max(128),
})

export const changePlanRequestSchema = z.object({ planId: planIdSchema })

export type PlanId = z.infer<typeof planIdSchema>
export type BillingStatus = z.infer<typeof billingStatusSchema>
export type Subscription = z.infer<typeof subscriptionSchema>
export type Usage = z.infer<typeof usageSchema>
export type InvoicePlaceholder = z.infer<typeof invoicePlaceholderSchema>
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>
export type CheckoutResult = z.infer<typeof checkoutResultSchema>
