import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  admins: defineTable({
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("reviewer"), v.literal("admin")),
    active: v.boolean(),
    createdAt: v.float64(),
    updatedAt: v.float64(),
  })
    .index("by_email", ["email"])
    .index("by_role", ["role"]),
});
