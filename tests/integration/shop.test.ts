import { makeFunctionReference } from "convex/server";
import type { GenericId } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  adjustShopStockRef,
  cancelFlashSaleRef,
  createFlashSaleRef,
  createShopItemRef,
  generateShopImageUploadUrlRef,
  getShopCustomerRef,
  listFlashSalesRef,
  listInventoryAdjustmentsRef,
  listShopCatalogForVolunteerRef,
  listShopItemsAdminRef,
  listShopRedemptionsRef,
  listShopVolunteersRef,
  previewShopPurchaseRef,
  purchaseShopItemRef,
  refundShopRedemptionRef,
  resolveQrForScanRef,
  setShopItemStatusRef,
  setVolunteerShopAccessRef,
  updateFlashSaleRef,
  updateShopItemRef,
} from "../../src/convex/adminApi";
import { computeLedgerPoints } from "../../convex/admin/pointsLedger";
import { SHOP_MAX_QUANTITY } from "../../shared/admin/shopRules";
import { expectAdminErrorCode } from "../helpers/adminErrors";
import { createConvexTest } from "../helpers/convexTestContext";
import { seedApplicant, seedStaff } from "../helpers/reviewTestKit";

const QR_TOKEN = "ab".repeat(32);
const UNKNOWN_TOKEN = "cd".repeat(32);
const NOW = Date.UTC(2026, 10, 14, 15);
const MINUTE = 60_000;

const listShopRef = makeFunctionReference<"query">("admin/participantShop:listShop");
const getMyShopHistoryRef = makeFunctionReference<"query">("admin/participantShop:getMyShopHistory");
const listMyAnnouncementsRef = makeFunctionReference<"query">("admin/participantShop:listMyAnnouncements");

let keyCounter = 0;
function newKey() {
  keyCounter += 1;
  return `purchase-key-${keyCounter.toString().padStart(8, "0")}`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

async function seedShop(options: { points?: number; status?: string } = {}) {
  const t = createConvexTest();
  const admin = await seedStaff(t, { role: "admin" });
  const volunteer = await seedStaff(t, { role: "volunteer" });
  await t.run((ctx) => ctx.db.patch(volunteer.adminId, { canRedeemShop: true }));
  const { applicationId, userId } = await seedApplicant(t, { review: { status: options.status ?? "accepted" } });
  const participantId = await t.run((ctx) =>
    ctx.db.insert("participants", {
      applicationId,
      authUserId: userId,
      acceptedAt: 1,
      acceptedBy: admin.adminId,
      qrCodeToken: QR_TOKEN,
      points: options.points ?? 100,
      createdAt: 1,
      updatedAt: 1,
    }),
  );
  return { t, admin, volunteer, participantId, userId };
}

type Shop = Awaited<ReturnType<typeof seedShop>>;

async function createItem(
  shop: Shop,
  fields: { name?: string; pointsCost?: number; stockQuantity?: number; active?: boolean } = {},
) {
  const { itemId } = await shop.t.mutation(createShopItemRef, {
    sessionToken: shop.admin.sessionToken,
    name: fields.name ?? "Sticker pack",
    description: "Five stickers",
    pointsCost: fields.pointsCost ?? 20,
    stockQuantity: fields.stockQuantity ?? 5,
    featured: false,
    ...(fields.active !== undefined ? { active: fields.active } : {}),
  });
  return itemId;
}

function purchase(
  shop: Shop,
  itemId: GenericId<"shopItems">,
  fields: { quantity?: number; expected?: number; key?: string; qr?: string; sessionToken?: string } = {},
) {
  return shop.t.mutation(purchaseShopItemRef, {
    sessionToken: fields.sessionToken ?? shop.volunteer.sessionToken,
    qrCodeToken: fields.qr ?? QR_TOKEN,
    itemId,
    quantity: fields.quantity ?? 1,
    expectedUnitPointsCost: fields.expected ?? 20,
    idempotencyKey: fields.key ?? newKey(),
  });
}

async function state(shop: Shop, itemId: GenericId<"shopItems">) {
  return shop.t.run(async (ctx) => ({
    points: (await ctx.db.get(shop.participantId))?.points,
    stock: (await ctx.db.get(itemId))?.stockQuantity,
    redemptions: (await ctx.db.query("shopRedemptions").collect()).length,
    adjustments: (await ctx.db.query("shopInventoryAdjustments").collect()).length,
    ledger: (await ctx.db.query("volunteerActionLogs").collect()).length,
  }));
}

describe("admin shop items", () => {
  it("creates an item with an audited initial stock count", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop, { stockQuantity: 7 });

    const list = await shop.t.query(listShopItemsAdminRef, { sessionToken: shop.admin.sessionToken });
    expect(list.items).toMatchObject([{
      itemId, name: "Sticker pack", pointsCost: 20, effectivePointsCost: 20, stockQuantity: 7,
      stockStatus: "in_stock", status: "active", featured: false,
    }]);
    const adjustments = await shop.t.query(listInventoryAdjustmentsRef, {
      sessionToken: shop.admin.sessionToken, paginationOpts: { numItems: 10, cursor: null }, itemId,
    });
    expect(adjustments.page).toMatchObject([{ kind: "initial", previousQuantity: 0, newQuantity: 7, delta: 7 }]);
    const log = await shop.t.run((ctx) => ctx.db.query("staffConfigLogs").first());
    expect(log).toMatchObject({ action: "shop_item_created", targetShopItemId: itemId, actorAdminId: shop.admin.adminId });
  });

  it("rejects bad item fields", async () => {
    const shop = await seedShop();
    const base = { sessionToken: shop.admin.sessionToken, description: "", featured: false, stockQuantity: 1 };
    await expectAdminErrorCode(shop.t.mutation(createShopItemRef, { ...base, name: " ", pointsCost: 5 }), "INVALID_SHOP_ITEM");
    await expectAdminErrorCode(shop.t.mutation(createShopItemRef, { ...base, name: "Hat", pointsCost: 0 }), "INVALID_SHOP_ITEM");
    await expectAdminErrorCode(shop.t.mutation(createShopItemRef, { ...base, name: "Hat", pointsCost: 1.5 }), "INVALID_SHOP_ITEM");
    await expectAdminErrorCode(
      shop.t.mutation(createShopItemRef, { ...base, name: "Hat", pointsCost: 5, stockQuantity: -1 }),
      "INVALID_SHOP_ITEM",
    );
  });

  it("edits, archives, and filters items", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop);
    const edit = {
      sessionToken: shop.admin.sessionToken, itemId, name: "Sticker pack", description: "Ten stickers",
      pointsCost: 30, featured: true, lowStockThreshold: 10,
    };
    expect(await shop.t.mutation(updateShopItemRef, edit)).toEqual({ ok: true, changed: true });
    expect(await shop.t.mutation(updateShopItemRef, edit)).toEqual({ ok: true, changed: false });
    expect(await shop.t.mutation(setShopItemStatusRef, { sessionToken: shop.admin.sessionToken, itemId, status: "archived" }))
      .toEqual({ ok: true, changed: true });

    const archived = await shop.t.query(listShopItemsAdminRef, { sessionToken: shop.admin.sessionToken, status: "archived" });
    expect(archived.items).toMatchObject([{ pointsCost: 30, featured: true, stockStatus: "low", status: "archived" }]);
    const active = await shop.t.query(listShopItemsAdminRef, { sessionToken: shop.admin.sessionToken, status: "active" });
    expect(active.items).toEqual([]);
    const searched = await shop.t.query(listShopItemsAdminRef, { sessionToken: shop.admin.sessionToken, search: "hoodie" });
    expect(searched.items).toEqual([]);
  });

  it("rejects non-image uploads and deletes a removed image", async () => {
    const shop = await seedShop();
    // convex-test stores no content type, so an upload here always fails the image check.
    const text = await shop.t.run((ctx) => ctx.storage.store(new Blob(["hello"], { type: "text/plain" })));
    const base = { sessionToken: shop.admin.sessionToken, name: "Hat", description: "", pointsCost: 5, featured: false };

    await expectAdminErrorCode(
      shop.t.mutation(createShopItemRef, { ...base, stockQuantity: 0, imageStorageId: text }),
      "INVALID_SHOP_IMAGE",
    );
    const itemId = await createItem(shop, { name: "Hat", pointsCost: 5, stockQuantity: 0 });
    await shop.t.run((ctx) => ctx.db.patch(itemId, { imageStorageId: text }));
    const list = await shop.t.query(listShopItemsAdminRef, { sessionToken: shop.admin.sessionToken });
    expect(list.items[0]).not.toHaveProperty("imageUrl");
    expect(await shop.t.run((ctx) => ctx.db.get(itemId))).toMatchObject({ imageStorageId: text });

    await expectAdminErrorCode(shop.t.mutation(updateShopItemRef, { ...base, itemId, imageStorageId: text }), "INVALID_SHOP_IMAGE");
    await shop.t.mutation(updateShopItemRef, { ...base, itemId, imageStorageId: null });
    expect(await shop.t.run((ctx) => ctx.db.system.get(text))).toBeNull();
    expect(await shop.t.mutation(generateShopImageUploadUrlRef, { sessionToken: shop.admin.sessionToken })).toEqual(expect.any(String));
  });

  it("is admin only", async () => {
    const shop = await seedShop();
    const reviewer = await seedStaff(shop.t, { role: "reviewer" });
    const itemId = await createItem(shop);
    await expectAdminErrorCode(
      shop.t.query(listShopItemsAdminRef, { sessionToken: reviewer.sessionToken }),
      "ADMIN_ONLY",
    );
    await expectAdminErrorCode(
      shop.t.mutation(adjustShopStockRef, { sessionToken: shop.volunteer.sessionToken, itemId, kind: "manual", delta: 1, reason: "x" }),
      "NOT_AUTHORIZED",
    );
  });
});

describe("admin stock adjustments", () => {
  it("audits increases, decreases, and absolute counts", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop, { stockQuantity: 5 });
    const adjust = (fields: { delta?: number; newQuantity?: number; kind?: "manual" | "restock"; reason?: string }) =>
      shop.t.mutation(adjustShopStockRef, {
        sessionToken: shop.admin.sessionToken, itemId, kind: fields.kind ?? "manual", reason: fields.reason ?? "Counted",
        ...(fields.delta !== undefined ? { delta: fields.delta } : {}),
        ...(fields.newQuantity !== undefined ? { newQuantity: fields.newQuantity } : {}),
      });

    expect(await adjust({ delta: 10, kind: "restock", reason: " Box arrived " })).toEqual({ ok: true, previousQuantity: 5, newQuantity: 15 });
    expect(await adjust({ delta: -3 })).toEqual({ ok: true, previousQuantity: 15, newQuantity: 12 });
    expect(await adjust({ newQuantity: 4 })).toEqual({ ok: true, previousQuantity: 12, newQuantity: 4 });

    const rows = await shop.t.run((ctx) => ctx.db.query("shopInventoryAdjustments").collect());
    expect(rows.slice(1)).toMatchObject([
      { kind: "restock", previousQuantity: 5, newQuantity: 15, delta: 10, reason: "Box arrived", actorAdminId: shop.admin.adminId },
      { kind: "manual", previousQuantity: 15, newQuantity: 12, delta: -3, reason: "Counted" },
      { kind: "manual", previousQuantity: 12, newQuantity: 4, delta: -8 },
    ]);
  });

  it("never lets stock go negative and rejects unclear changes", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop, { stockQuantity: 2 });
    const base = { sessionToken: shop.admin.sessionToken, itemId, reason: "Counted" };
    await expectAdminErrorCode(shop.t.mutation(adjustShopStockRef, { ...base, kind: "manual", delta: -3 }), "INVALID_STOCK_ADJUSTMENT");
    await expectAdminErrorCode(shop.t.mutation(adjustShopStockRef, { ...base, kind: "manual", newQuantity: -1 }), "INVALID_STOCK_ADJUSTMENT");
    await expectAdminErrorCode(shop.t.mutation(adjustShopStockRef, { ...base, kind: "manual", delta: 0 }), "INVALID_STOCK_ADJUSTMENT");
    await expectAdminErrorCode(shop.t.mutation(adjustShopStockRef, { ...base, kind: "manual" }), "INVALID_STOCK_ADJUSTMENT");
    await expectAdminErrorCode(
      shop.t.mutation(adjustShopStockRef, { ...base, kind: "manual", delta: 1, newQuantity: 3 }),
      "INVALID_STOCK_ADJUSTMENT",
    );
    await expectAdminErrorCode(shop.t.mutation(adjustShopStockRef, { ...base, kind: "restock", delta: -1 }), "INVALID_STOCK_ADJUSTMENT");
    await expectAdminErrorCode(shop.t.mutation(adjustShopStockRef, { ...base, kind: "manual", delta: 1, reason: " " }), "INVALID_SHOP_REASON");
    expect((await state(shop, itemId)).stock).toBe(2);
  });

  it("keeps stock non-negative across random sequences of changes", async () => {
    const shop = await seedShop({ points: 10_000 });
    const itemId = await createItem(shop, { stockQuantity: 3, pointsCost: 1 });
    let seed = 7;
    const random = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    for (let step = 0; step < 30; step += 1) {
      const roll = random();
      if (roll < 0.4) {
        await purchase(shop, itemId, { quantity: 1 + Math.floor(random() * 3), expected: 1 });
      } else if (roll < 0.7) {
        await shop.t.mutation(adjustShopStockRef, {
          sessionToken: shop.admin.sessionToken, itemId, kind: "manual", delta: -1 - Math.floor(random() * 3), reason: "Shrink",
        }).catch(() => undefined);
      } else {
        await shop.t.mutation(adjustShopStockRef, {
          sessionToken: shop.admin.sessionToken, itemId, kind: "restock", delta: 1 + Math.floor(random() * 2), reason: "Restock",
        });
      }
      expect((await state(shop, itemId)).stock).toBeGreaterThanOrEqual(0);
    }
    const adjustments = await shop.t.run((ctx) => ctx.db.query("shopInventoryAdjustments").collect());
    expect((await state(shop, itemId)).stock).toBe(adjustments.reduce((sum, row) => sum + row.delta, 0));
  });
});

describe("volunteer shop access", () => {
  it("denies volunteers without canRedeemShop on every shop API", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop);
    const other = await seedStaff(shop.t, { role: "volunteer" });
    await shop.t.run((ctx) => ctx.db.patch(other.adminId, { canCheckIn: true, canFoodCheckIn: true }));
    const sessionToken = other.sessionToken;

    await expectAdminErrorCode(shop.t.query(listShopCatalogForVolunteerRef, { sessionToken }), "CAPABILITY_DENIED");
    await expectAdminErrorCode(shop.t.query(getShopCustomerRef, { sessionToken, participantId: shop.participantId }), "CAPABILITY_DENIED");
    await expectAdminErrorCode(
      shop.t.query(previewShopPurchaseRef, { sessionToken, participantId: shop.participantId, itemId, quantity: 1 }),
      "CAPABILITY_DENIED",
    );
    await expectAdminErrorCode(purchase(shop, itemId, { sessionToken }), "CAPABILITY_DENIED");
    expect(await shop.t.mutation(resolveQrForScanRef, { sessionToken, qrCodeToken: QR_TOKEN, purpose: "shop" }))
      .toEqual({ status: "not_authorized" });
    expect((await state(shop, itemId)).redemptions).toBe(0);
  });

  it("rejects reviewers, admins, and expired sessions", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop);
    const reviewer = await seedStaff(shop.t, { role: "reviewer" });
    const expired = await seedStaff(shop.t, { role: "volunteer", expiresAt: NOW - 1 });
    await shop.t.run((ctx) => ctx.db.patch(expired.adminId, { canRedeemShop: true }));

    await expectAdminErrorCode(purchase(shop, itemId, { sessionToken: reviewer.sessionToken }), "VOLUNTEER_ONLY");
    await expectAdminErrorCode(purchase(shop, itemId, { sessionToken: shop.admin.sessionToken }), "VOLUNTEER_ONLY");
    await expectAdminErrorCode(purchase(shop, itemId, { sessionToken: expired.sessionToken }), "NOT_AUTHENTICATED");
  });

  it("previews a scanned participant with their balance", async () => {
    const shop = await seedShop({ points: 42 });
    expect(await shop.t.mutation(resolveQrForScanRef, {
      sessionToken: shop.volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "shop",
    })).toEqual({
      status: "ok", purpose: "shop", participant: { participantId: shop.participantId, name: "Taylor Student", points: 42 },
    });
    expect(await shop.t.query(getShopCustomerRef, { sessionToken: shop.volunteer.sessionToken, participantId: shop.participantId }))
      .toEqual({ participantId: shop.participantId, name: "Taylor Student", points: 42 });
  });

  it("blocks volunteers from buying for their own participant record", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop);
    await shop.t.run((ctx) => ctx.db.patch(shop.volunteer.adminId, { participantId: shop.participantId }));

    expect(await shop.t.mutation(resolveQrForScanRef, {
      sessionToken: shop.volunteer.sessionToken, qrCodeToken: QR_TOKEN, purpose: "shop",
    })).toEqual({ status: "self_purchase_denied" });
    expect(await shop.t.query(previewShopPurchaseRef, {
      sessionToken: shop.volunteer.sessionToken, participantId: shop.participantId, itemId, quantity: 1,
    })).toEqual({ status: "self_purchase_denied" });
    expect(await purchase(shop, itemId)).toEqual({ status: "self_purchase_denied" });
    expect((await state(shop, itemId)).redemptions).toBe(0);
  });

  it("toggles canRedeemShop from the admin panel with an audit row", async () => {
    const shop = await seedShop();
    const target = await seedStaff(shop.t, { role: "volunteer", name: "Avery" });
    const set = (canRedeemShop: boolean) =>
      shop.t.mutation(setVolunteerShopAccessRef, { sessionToken: shop.admin.sessionToken, volunteerAdminId: target.adminId, canRedeemShop });

    expect(await set(true)).toEqual({ ok: true, changed: true });
    expect(await set(true)).toEqual({ ok: true, changed: false });
    const volunteers = await shop.t.query(listShopVolunteersRef, { sessionToken: shop.admin.sessionToken });
    expect(volunteers.find((row) => row.adminId === target.adminId)).toMatchObject({ name: "Avery", canRedeemShop: true });
    const log = await shop.t.run((ctx) => ctx.db.query("staffConfigLogs").collect());
    expect(log.at(-1)).toMatchObject({
      action: "volunteer_capabilities_updated", targetAdminId: target.adminId,
      details: JSON.stringify({ changedFields: ["canRedeemShop"], before: { canRedeemShop: false }, after: { canRedeemShop: true } }),
    });
    await expectAdminErrorCode(
      shop.t.mutation(setVolunteerShopAccessRef, { sessionToken: shop.admin.sessionToken, volunteerAdminId: shop.admin.adminId, canRedeemShop: true }),
      "VOLUNTEER_NOT_FOUND",
    );
  });
});

describe("volunteer purchases", () => {
  it("deducts points and stock and writes every record together", async () => {
    const shop = await seedShop({ points: 100 });
    const itemId = await createItem(shop, { pointsCost: 20, stockQuantity: 5 });

    const preview = await shop.t.query(previewShopPurchaseRef, {
      sessionToken: shop.volunteer.sessionToken, participantId: shop.participantId, itemId, quantity: 3,
    });
    expect(preview).toMatchObject({
      status: "ok", unitPointsCost: 20, totalPointsCost: 60, points: 100, pointsAfter: 40, hasEnoughPoints: true, hasEnoughStock: true,
    });

    const result = await purchase(shop, itemId, { quantity: 3 });
    expect(result).toEqual({
      status: "success",
      receipt: {
        redemptionId: expect.any(String), itemId, itemName: "Sticker pack", quantity: 3, unitPointsCost: 20, basePointsCost: 20,
        totalPointsSpent: 60, pointsBefore: 100, pointsAfter: 40, flashSaleId: null, redeemedAt: NOW,
      },
    });
    expect(await state(shop, itemId)).toMatchObject({ points: 40, stock: 2, redemptions: 1 });
    const rows = await shop.t.run(async (ctx) => ({
      adjustment: (await ctx.db.query("shopInventoryAdjustments").collect()).at(-1),
      ledger: await ctx.db.query("volunteerActionLogs").first(),
    }));
    expect(rows.adjustment).toMatchObject({ kind: "purchase", previousQuantity: 5, newQuantity: 2, delta: -3 });
    expect(rows.ledger).toMatchObject({
      action: "shop_purchase", actorAdminId: shop.volunteer.adminId, pointsDelta: -60, previousPoints: 100, newPoints: 40,
    });
  });

  it("charges once for a repeated idempotency key", async () => {
    const shop = await seedShop({ points: 100 });
    const itemId = await createItem(shop);
    const key = newKey();
    const first = await purchase(shop, itemId, { key });
    const second = await purchase(shop, itemId, { key });

    expect(first.status).toBe("success");
    expect(second).toEqual({ status: "duplicate", receipt: "receipt" in first ? first.receipt : null });
    expect(await state(shop, itemId)).toMatchObject({ points: 80, stock: 4, redemptions: 1 });
    expect(await purchase(shop, itemId, { key, quantity: 2 })).toEqual({ status: "invalid_request" });
    expect(await purchase(shop, itemId, { key: "short" })).toEqual({ status: "invalid_request" });
  });

  it("rejects short points or stock without writing anything", async () => {
    const shop = await seedShop({ points: 30 });
    const itemId = await createItem(shop, { pointsCost: 20, stockQuantity: 1 });
    const before = await state(shop, itemId);

    expect(await purchase(shop, itemId, { quantity: 2 })).toEqual({ status: "insufficient_stock", stockQuantity: 1 });
    const pricey = await createItem(shop, { name: "Hoodie", pointsCost: 50, stockQuantity: 3 });
    expect(await purchase(shop, pricey, { expected: 50 })).toEqual({ status: "insufficient_points", points: 30, totalPointsCost: 50 });
    expect(await state(shop, itemId)).toMatchObject({ points: before.points, stock: 1, redemptions: 0, ledger: 0 });
    expect((await state(shop, pricey)).stock).toBe(3);
  });

  it("rejects bad quantities, inactive items, and unknown or ineligible participants", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop);
    const inactive = await createItem(shop, { name: "Mug", active: false });
    expect(await purchase(shop, itemId, { quantity: SHOP_MAX_QUANTITY + 1 }))
      .toEqual({ status: "invalid_quantity", maxQuantity: SHOP_MAX_QUANTITY });
    expect(await purchase(shop, itemId, { quantity: 0 })).toEqual({ status: "invalid_quantity", maxQuantity: SHOP_MAX_QUANTITY });
    expect(await purchase(shop, inactive)).toEqual({ status: "item_unavailable" });
    expect(await purchase(shop, itemId, { qr: UNKNOWN_TOKEN })).toEqual({ status: "qr_not_found" });

    await shop.t.run(async (ctx) => {
      const participant = await ctx.db.get(shop.participantId);
      const review = await ctx.db.query("applicationReviews")
        .withIndex("by_application", (q) => q.eq("applicationId", participant!.applicationId)).unique();
      await ctx.db.patch(review!._id, { status: "rejected" });
    });
    expect(await purchase(shop, itemId)).toEqual({ status: "participant_not_eligible" });
    expect(await shop.t.query(getShopCustomerRef, { sessionToken: shop.volunteer.sessionToken, participantId: shop.participantId }))
      .toBeNull();
    expect((await state(shop, itemId)).redemptions).toBe(0);
  });

  it("asks for reconfirmation when the price changed after preview", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop, { pointsCost: 20 });
    await shop.t.mutation(updateShopItemRef, {
      sessionToken: shop.admin.sessionToken, itemId, name: "Sticker pack", description: "Five stickers", pointsCost: 25, featured: false,
    });
    expect(await purchase(shop, itemId, { quantity: 2, expected: 20 }))
      .toEqual({ status: "price_changed", unitPointsCost: 25, totalPointsCost: 50 });
    expect((await state(shop, itemId)).redemptions).toBe(0);
    expect((await purchase(shop, itemId, { quantity: 2, expected: 25 })).status).toBe("success");
  });

  it("never oversells when two purchases race for the last unit", async () => {
    const shop = await seedShop({ points: 100 });
    const itemId = await createItem(shop, { stockQuantity: 1 });
    const results = await Promise.all([purchase(shop, itemId), purchase(shop, itemId)]);

    expect(results.map((result) => result.status).sort()).toEqual(["insufficient_stock", "success"]);
    expect(await state(shop, itemId)).toMatchObject({ stock: 0, points: 80, redemptions: 1 });
  });

  it("keeps the charged price when the item price changes later", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop, { pointsCost: 20 });
    await purchase(shop, itemId);
    await shop.t.mutation(updateShopItemRef, {
      sessionToken: shop.admin.sessionToken, itemId, name: "Renamed", description: "", pointsCost: 99, featured: false,
    });
    const history = await shop.t.query(listShopRedemptionsRef, {
      sessionToken: shop.admin.sessionToken, paginationOpts: { numItems: 10, cursor: null },
    });
    expect(history.page).toMatchObject([{
      item: { itemId, name: "Sticker pack" }, unitPointsCost: 20, totalPointsSpent: 20,
      participant: { name: "Taylor Student" }, flashSale: null, refund: null,
    }]);
  });

  it("filters and searches purchase history", async () => {
    const shop = await seedShop({ points: 500 });
    const stickers = await createItem(shop);
    const hoodie = await createItem(shop, { name: "Hoodie", pointsCost: 50 });
    await purchase(shop, stickers);
    await purchase(shop, hoodie, { expected: 50 });
    const list = (fields: Record<string, unknown>) => shop.t.query(listShopRedemptionsRef, {
      sessionToken: shop.admin.sessionToken, paginationOpts: { numItems: 10, cursor: null }, ...fields,
    });

    expect((await list({ itemId: hoodie })).page.map((row) => row.item.name)).toEqual(["Hoodie"]);
    expect((await list({ search: "sticker" })).page.map((row) => row.item.name)).toEqual(["Sticker pack"]);
    expect((await list({ search: "taylor" })).page).toHaveLength(2);
    expect((await list({ participantId: shop.participantId, itemId: stickers })).page).toHaveLength(1);
    expect((await list({ volunteerAdminId: shop.volunteer.adminId })).page).toHaveLength(2);
    expect((await list({ volunteerAdminId: shop.admin.adminId })).page).toHaveLength(0);
  });

  it("lists an ordered catalog for the volunteer", async () => {
    const shop = await seedShop();
    await createItem(shop, { name: "Sticker pack", stockQuantity: 6 });
    const featured = await createItem(shop, { name: "Hoodie", pointsCost: 50, stockQuantity: 0 });
    await shop.t.run((ctx) => ctx.db.patch(featured, { featured: true }));
    await createItem(shop, { name: "Mug", active: false });

    const catalog = await shop.t.query(listShopCatalogForVolunteerRef, { sessionToken: shop.volunteer.sessionToken });
    expect(catalog.items.map((item) => [item.name, item.stockStatus])).toEqual([["Hoodie", "out"], ["Sticker pack", "in_stock"]]);
    expect(catalog.maxQuantity).toBe(SHOP_MAX_QUANTITY);
    expect(catalog.nextPriceChangeAt).toBeNull();
  });
});

describe("refunds", () => {
  it("restores points, optionally restocks, and refunds only once", async () => {
    const shop = await seedShop({ points: 100 });
    const itemId = await createItem(shop, { stockQuantity: 5 });
    const first = await purchase(shop, itemId, { quantity: 2 });
    const second = await purchase(shop, itemId, { quantity: 1 });
    if (first.status !== "success" || second.status !== "success") throw new Error("purchase failed");
    const refund = (redemptionId: GenericId<"shopRedemptions">, restock: boolean, reason = "Wrong size") =>
      shop.t.mutation(refundShopRedemptionRef, { sessionToken: shop.admin.sessionToken, redemptionId, reason, restock });

    expect(await refund(first.receipt.redemptionId, true))
      .toEqual({ ok: true, previousPoints: 40, newPoints: 80, pointsRestored: 40, restocked: true });
    expect(await state(shop, itemId)).toMatchObject({ points: 80, stock: 4 });
    expect(await refund(second.receipt.redemptionId, false))
      .toEqual({ ok: true, previousPoints: 80, newPoints: 100, pointsRestored: 20, restocked: false });
    expect(await state(shop, itemId)).toMatchObject({ points: 100, stock: 4 });

    await expectAdminErrorCode(refund(first.receipt.redemptionId, true), "REDEMPTION_ALREADY_REFUNDED");
    await expectAdminErrorCode(refund(first.receipt.redemptionId, true, " "), "INVALID_SHOP_REASON");
    expect(await state(shop, itemId)).toMatchObject({ points: 100, stock: 4 });

    const logs = await shop.t.run((ctx) => ctx.db.query("volunteerActionLogs").collect());
    expect(logs.map((log) => [log.action, log.pointsDelta])).toEqual([
      ["shop_purchase", -40], ["shop_purchase", -20], ["shop_refund", 40], ["shop_refund", 20],
    ]);
    expect(await shop.t.run((ctx) => computeLedgerPoints(ctx, shop.participantId))).toBe(0);
    const history = await shop.t.query(listShopRedemptionsRef, {
      sessionToken: shop.admin.sessionToken, paginationOpts: { numItems: 10, cursor: null },
    });
    expect(history.page.at(-1)?.refund).toMatchObject({
      reason: "Wrong size", restocked: true, pointsRestored: 40, refundedBy: { adminId: shop.admin.adminId },
    });
  });

  it("is admin only", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop);
    const result = await purchase(shop, itemId);
    if (result.status !== "success") throw new Error("purchase failed");
    await expectAdminErrorCode(
      shop.t.mutation(refundShopRedemptionRef, {
        sessionToken: shop.volunteer.sessionToken, redemptionId: result.receipt.redemptionId, reason: "x", restock: false,
      }),
      "NOT_AUTHORIZED",
    );
  });
});

describe("flash sales", () => {
  async function createSale(
    shop: Shop,
    itemId: GenericId<"shopItems">,
    fields: { startsAt?: number; endsAt?: number; salePointsCost?: number } = {},
  ) {
    return shop.t.mutation(createFlashSaleRef, {
      sessionToken: shop.admin.sessionToken,
      title: "Lunch rush",
      message: "Stickers half off",
      startsAt: fields.startsAt ?? NOW,
      endsAt: fields.endsAt ?? NOW + 30 * MINUTE,
      items: [{ itemId, salePointsCost: fields.salePointsCost ?? 10 }],
    });
  }

  it("charges the sale price only inside the window", async () => {
    const shop = await seedShop({ points: 100 });
    const itemId = await createItem(shop, { pointsCost: 20 });
    const { flashSaleId } = await createSale(shop, itemId, { startsAt: NOW + 10 * MINUTE, endsAt: NOW + 20 * MINUTE });
    const catalogPrice = async () =>
      (await shop.t.query(listShopCatalogForVolunteerRef, { sessionToken: shop.volunteer.sessionToken })).items[0];

    expect(await catalogPrice()).toMatchObject({ unitPointsCost: 20, flashSaleId: null });
    expect((await shop.t.query(listShopCatalogForVolunteerRef, { sessionToken: shop.volunteer.sessionToken })).nextPriceChangeAt)
      .toBe(NOW + 10 * MINUTE);

    vi.setSystemTime(NOW + 10 * MINUTE);
    expect(await catalogPrice()).toMatchObject({ unitPointsCost: 10, basePointsCost: 20, flashSaleId, saleEndsAt: NOW + 20 * MINUTE });
    const result = await purchase(shop, itemId, { expected: 10 });
    expect(result).toMatchObject({ status: "success", receipt: { unitPointsCost: 10, basePointsCost: 20, flashSaleId } });
    const history = await shop.t.query(listShopRedemptionsRef, {
      sessionToken: shop.admin.sessionToken, paginationOpts: { numItems: 10, cursor: null },
    });
    expect(history.page[0]?.flashSale).toEqual({ flashSaleId, title: "Lunch rush" });

    vi.setSystemTime(NOW + 20 * MINUTE);
    expect(await catalogPrice()).toMatchObject({ unitPointsCost: 20, flashSaleId: null });
    expect(await purchase(shop, itemId, { expected: 10 })).toMatchObject({ status: "price_changed", unitPointsCost: 20 });
    const sales = await shop.t.query(listFlashSalesRef, { sessionToken: shop.admin.sessionToken });
    expect(sales).toMatchObject([{ flashSaleId, status: "ended", items: [{ itemId, salePointsCost: 10, pointsCost: 20 }] }]);
  });

  it("rejects overlaps, empty sales, and prices that are not discounts", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop, { pointsCost: 20 });
    const other = await createItem(shop, { name: "Hoodie", pointsCost: 50 });
    await createSale(shop, itemId, { startsAt: NOW, endsAt: NOW + 30 * MINUTE });

    await expectAdminErrorCode(createSale(shop, itemId, { startsAt: NOW + 29 * MINUTE, endsAt: NOW + 60 * MINUTE }), "FLASH_SALE_OVERLAP");
    expect(await createSale(shop, itemId, { startsAt: NOW + 30 * MINUTE, endsAt: NOW + 60 * MINUTE }))
      .toEqual({ flashSaleId: expect.any(String) });
    await expectAdminErrorCode(createSale(shop, other, { salePointsCost: 50 }), "INVALID_FLASH_SALE");
    await expectAdminErrorCode(createSale(shop, other, { startsAt: NOW - 20 * MINUTE, endsAt: NOW - MINUTE }), "INVALID_FLASH_SALE");
    await expectAdminErrorCode(createSale(shop, other, { startsAt: NOW + MINUTE, endsAt: NOW }), "INVALID_FLASH_SALE");
    await expectAdminErrorCode(
      shop.t.mutation(createFlashSaleRef, {
        sessionToken: shop.admin.sessionToken, title: "Empty", message: "", startsAt: NOW, endsAt: NOW + MINUTE, items: [],
      }),
      "INVALID_FLASH_SALE",
    );
  });

  it("cancels a live sale, restoring prices and withdrawing the announcement", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop, { pointsCost: 20 });
    const { flashSaleId } = await createSale(shop, itemId);
    const asParticipant = shop.t.withIdentity({ subject: shop.userId, email: "taylor@example.com" });

    expect(await asParticipant.query(listMyAnnouncementsRef, {})).toMatchObject([
      { kind: "flash_sale", title: "Lunch rush", body: "Stickers half off", publishedAt: NOW, active: true },
    ]);
    const live = await asParticipant.query(listShopRef, {});
    expect(live).toMatchObject({
      items: [{ itemId, pointsCost: 10, basePointsCost: 20, onSale: true }],
      activeSales: [{ flashSaleId, title: "Lunch rush" }],
      points: 100,
    });

    await shop.t.mutation(cancelFlashSaleRef, { sessionToken: shop.admin.sessionToken, flashSaleId });
    expect(await asParticipant.query(listMyAnnouncementsRef, {})).toEqual([]);
    expect(await asParticipant.query(listShopRef, {})).toMatchObject({ items: [{ pointsCost: 20, onSale: false }], activeSales: [] });
    await expectAdminErrorCode(
      shop.t.mutation(cancelFlashSaleRef, { sessionToken: shop.admin.sessionToken, flashSaleId }),
      "FLASH_SALE_NOT_EDITABLE",
    );
    expect(await createSale(shop, itemId)).toEqual({ flashSaleId: expect.any(String) });
  });

  it("edits only scheduled sales and publishes the announcement at the start", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop, { pointsCost: 20 });
    const { flashSaleId } = await createSale(shop, itemId, { startsAt: NOW + 10 * MINUTE, endsAt: NOW + 20 * MINUTE });
    const asParticipant = shop.t.withIdentity({ subject: shop.userId, email: "taylor@example.com" });
    const edit = {
      sessionToken: shop.admin.sessionToken, flashSaleId, title: "Dinner rush", message: "Cheaper stickers",
      startsAt: NOW + 15 * MINUTE, endsAt: NOW + 25 * MINUTE, items: [{ itemId, salePointsCost: 15 }],
    };

    expect(await asParticipant.query(listMyAnnouncementsRef, {})).toEqual([]);
    expect(await shop.t.mutation(updateFlashSaleRef, edit)).toEqual({ ok: true });
    vi.setSystemTime(NOW + 15 * MINUTE);
    expect(await asParticipant.query(listMyAnnouncementsRef, {})).toMatchObject([{ title: "Dinner rush", publishedAt: NOW + 15 * MINUTE }]);
    expect((await asParticipant.query(listShopRef, {}))?.items[0]).toMatchObject({ pointsCost: 15 });
    await expectAdminErrorCode(shop.t.mutation(updateFlashSaleRef, edit), "FLASH_SALE_NOT_EDITABLE");
  });
});

describe("participant shop API", () => {
  it("returns null when signed out and only the caller's own history", async () => {
    const shop = await seedShop();
    const itemId = await createItem(shop);
    await purchase(shop, itemId);
    const asParticipant = shop.t.withIdentity({ subject: shop.userId, email: "taylor@example.com" });

    expect(await shop.t.query(listShopRef, {})).toBeNull();
    expect(await shop.t.query(listMyAnnouncementsRef, {})).toBeNull();
    expect(await shop.t.query(getMyShopHistoryRef, {})).toEqual([]);
    const history = await asParticipant.query(getMyShopHistoryRef, {});
    expect(history).toMatchObject([{ itemName: "Sticker pack", quantity: 1, totalPointsSpent: 20, onSale: false, refunded: false }]);
    expect(JSON.stringify(history)).not.toMatch(/redeemedBy|volunteer|qrCodeToken/);
  });
});
