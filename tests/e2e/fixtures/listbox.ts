import { expect, type Page } from "@playwright/test";

export async function selectAdminListbox(page: Page, label: string, value: string) {
  const trigger = page.getByLabel(label, { exact: true });
  await trigger.click();
  const listboxId = await trigger.getAttribute("aria-controls");
  const option = listboxId
    ? page.locator(`#${listboxId} [data-value="${value}"]`)
    : page.locator(`[role="listbox"] [data-value="${value}"]`).first();
  await expect(option).toBeVisible();
  await option.click();
}

export async function expectAdminListboxValue(page: Page, label: string, value: string) {
  await expect(page.getByLabel(label, { exact: true })).toHaveAttribute("data-value", value);
}
