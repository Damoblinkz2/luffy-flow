import * as z from "zod/v3"

import { entityIdSchema, isoDateTimeSchema } from "./common"

export const tokenPackIdSchema = z.enum(["starter", "value", "power"])
export const paymentGatewaySchema = z.enum(["paystack", "crypto"])
export const billingProviderSchema = z.enum(["paystack", "nowpayments"])

/** Public token packs expose quantities and display prices, while the backend remains authoritative. */
export const tokenPackSchema = z.object({
  id: tokenPackIdSchema,
  tokens: z.number().int().positive(),
  priceNgnMinor: z.number().int().positive(),
  priceUsd: z.number().positive(),
})

export const tokenPacksResponseSchema = z.object({ items: z.array(tokenPackSchema).max(20) })

/** The wallet is the only balance shown to users; reminder-cycle internals never leave the API. */
export const tokenWalletSchema = z.object({
  userId: entityIdSchema,
  balance: z.number().int().nonnegative(),
  lifetimePurchased: z.number().int().nonnegative(),
  lifetimeSpent: z.number().int().nonnegative(),
  lowBalanceReminder: z.object({
    enabled: z.boolean(),
    threshold: z.number().int().min(0).max(1_000_000),
    lastSentAt: isoDateTimeSchema.optional(),
  }),
  updatedAt: isoDateTimeSchema,
})

export const tokenReminderRequestSchema = z.object({
  enabled: z.boolean(),
  threshold: z.number().int().min(0).max(1_000_000),
})

/** Every prompt attempt receives one idempotent debit keyed by prompt ID and retry attempt. */
export const tokenDebitRequestSchema = z.object({
  promptId: entityIdSchema,
  attempt: z.number().int().nonnegative(),
})

export const purchaseRecordSchema = z.object({
  id: entityIdSchema,
  transactionId: entityIdSchema,
  packId: tokenPackIdSchema,
  tokenAmount: z.number().int().positive(),
  provider: billingProviderSchema,
  reference: z.string().min(1).max(256),
  status: z.enum(["pending", "paid", "failed", "expired"]),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  createdAt: isoDateTimeSchema,
  paidAt: isoDateTimeSchema.optional(),
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

/** Hosted checkout never accepts card details, wallet seeds, token quantities, or client prices. */
export const checkoutRequestSchema = z.object({
  packId: tokenPackIdSchema,
  gateway: paymentGatewaySchema,
  returnUrl: checkoutReturnUrlSchema,
  payCurrency: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{2,16}$/)
    .optional(),
})

export const checkoutResultSchema = z.object({
  provider: billingProviderSchema,
  status: z.literal("pending"),
  paymentId: entityIdSchema,
  packId: tokenPackIdSchema,
  tokenAmount: z.number().int().positive(),
  checkoutReference: z.string().min(1).max(256),
  checkoutUrl: z.string().url().max(2_048).optional(),
})

export type TokenPackId = z.infer<typeof tokenPackIdSchema>
export type PaymentGateway = z.infer<typeof paymentGatewaySchema>
export type TokenPack = z.infer<typeof tokenPackSchema>
export type TokenWallet = z.infer<typeof tokenWalletSchema>
export type TokenReminderRequest = z.infer<typeof tokenReminderRequestSchema>
export type TokenDebitRequest = z.infer<typeof tokenDebitRequestSchema>
export type PurchaseRecord = z.infer<typeof purchaseRecordSchema>
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>
export type CheckoutResult = z.infer<typeof checkoutResultSchema>
