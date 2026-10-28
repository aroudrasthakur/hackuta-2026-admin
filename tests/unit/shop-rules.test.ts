import { describe, expect, it } from "vitest";
import {
  isValidIdempotencyKey,
  isValidPurchaseQuantity,
  normalizeFlashSaleInput,
  normalizeShopItemInput,
  normalizeShopReason,
  SHOP_MAX_QUANTITY,
} from "../../shared/admin/shopRules";
import { expectAdminErrorCode } from "../helpers/adminErrors";

const sale = { title: "Lunch", message: "", startsAt: 1, endsAt: 2, items: [{ itemId: "a", salePointsCost: 5 }] };

describe("shop rules", () => {
  it("checks purchase quantities and idempotency keys", () => {
    expect(isValidPurchaseQuantity(1)).toBe(true);
    expect(isValidPurchaseQuantity(SHOP_MAX_QUANTITY)).toBe(true);
    expect(isValidPurchaseQuantity(SHOP_MAX_QUANTITY + 1)).toBe(false);
    expect(isValidPurchaseQuantity(1.5)).toBe(false);
    expect(isValidIdempotencyKey("3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90")).toBe(true);
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidIdempotencyKey("has spaces in the key!!")).toBe(false);
  });

  it("trims item fields and rejects bad ones", async () => {
    expect(normalizeShopItemInput({ name: " Hat ", description: " Warm ", pointsCost: 5 }))
      .toEqual({ name: "Hat", description: "Warm", pointsCost: 5 });
    expect(normalizeShopItemInput({ name: "Hat", description: "", pointsCost: 5 })).toEqual({
      name: "Hat", description: "", pointsCost: 5,
    });
    await expectAdminErrorCode(async () => normalizeShopItemInput({ name: "Hat", description: "x".repeat(501), pointsCost: 5 }), "INVALID_SHOP_ITEM");
    await expectAdminErrorCode(async () => normalizeShopItemInput({ name: 5 as never, description: "", pointsCost: 5 }), "INVALID_SHOP_ITEM");
  });

  it("requires a short reason", async () => {
    expect(normalizeShopReason(" Wrong size ")).toBe("Wrong size");
    await expectAdminErrorCode(async () => normalizeShopReason("x".repeat(201)), "INVALID_SHOP_REASON");
  });

  it("checks sale text, window, and items", async () => {
    expect(normalizeFlashSaleInput({ ...sale, title: " Lunch " }).title).toBe("Lunch");
    await expectAdminErrorCode(async () => normalizeFlashSaleInput({ ...sale, title: "" }), "INVALID_FLASH_SALE");
    await expectAdminErrorCode(async () => normalizeFlashSaleInput({ ...sale, startsAt: 1.5 }), "INVALID_FLASH_SALE");
    await expectAdminErrorCode(
      async () => normalizeFlashSaleInput({ ...sale, items: [...sale.items, { itemId: "a", salePointsCost: 4 }] }),
      "INVALID_FLASH_SALE",
    );
    await expectAdminErrorCode(
      async () => normalizeFlashSaleInput({ ...sale, items: [{ itemId: "a", salePointsCost: 0 }] }),
      "INVALID_FLASH_SALE",
    );
  });
});
