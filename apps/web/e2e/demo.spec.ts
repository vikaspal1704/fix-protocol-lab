import { expect, test, type Page } from "@playwright/test";

async function live(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("status").first()).toHaveText(/Live/);
  await expect(page.getByRole("button", { name: "Send NewOrderSingle" })).toBeEnabled();
}

const flow = (page: Page) => page.getByRole("list", { name: "FIX messages in time order" });

test("visitor sends an order and sees it filled", async ({ page }) => {
  await live(page);

  await page.getByRole("button", { name: "Send NewOrderSingle" }).click();

  await expect(flow(page).getByRole("button", { name: /NewOrderSingle \(35=D\), MsgSeqNum 2, delivered/ })).toBeVisible();
  await expect(flow(page).getByRole("button", { name: /ExecutionReport/ })).toHaveCount(3);
  await expect(page.getByRole("region", { name: /Orders/ }).getByText("filled", { exact: true })).toBeVisible();
});

test("visitor triggers gap recovery", async ({ page }) => {
  await live(page);

  await page.getByRole("button", { name: "Lose a message" }).click();

  await expect(flow(page).getByRole("button", { name: /dropped in transit/ })).toHaveCount(1);
  await expect(flow(page).getByRole("button", { name: /ResendRequest \(35=2\)/ })).toBeVisible();
  await expect(flow(page).getByRole("button", { name: /possible duplicate/ }).first()).toBeVisible();
  await expect(page.getByText("ACTIVE")).toHaveCount(2);
});

test("layout fits a 390px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await live(page);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

  expect(overflow).toBe(false);
});
