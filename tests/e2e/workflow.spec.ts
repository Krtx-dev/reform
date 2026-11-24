import { expect, test, type Page } from "@playwright/test";

/** One continuous judge-style session: the whole REFORM workflow, end to end. */
test.describe.configure({ mode: "serial" });

async function loadDemo(page: Page) {
  await page.goto("/workspace");
  await page.getByRole("heading", { name: "Explore the demonstration factory" }).click();
  await expect(page.getByRole("heading", { name: "Operational overview" })).toBeVisible();
  // close the judge guide so it does not cover controls
  await page.getByRole("button", { name: "Close judge guide" }).click();
}

async function nav(page: Page, label: string) {
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: label, exact: true }).click();
}

async function runOptimizer(page: Page) {
  await page.getByTestId("run-optimization").click();
  await expect(page.locator("text=VALID").first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Material utilization", { exact: false }).first()).toBeVisible();
}

test("full workflow: demo → inventory → product → optimize → baseline → plan → export → persist → replan", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // 1–2. open app and load demo factory
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Waste is a design constraint/ })).toBeVisible();
  await loadDemo(page);

  // 3. create a remnant
  await nav(page, "Inventory");
  await expect(page.getByTestId("inventory-table")).toBeVisible();
  await page.getByTestId("add-remnant").click();
  await page.locator("#r-name").fill("E2E linen offcut");
  await page.locator("#r-fab").selectOption("linen");
  await page.locator("#r-w").fill("800");
  await page.locator("#r-h").fill("600");
  await page.getByTestId("save-remnant").click();
  await expect(page.getByText("E2E linen offcut").first()).toBeVisible();

  // 4. create a product
  await nav(page, "Products");
  await page.getByTestId("new-product").click();
  await page.locator("#p-name").fill("E2E napkin");
  await page.getByTestId("save-product").click();
  await expect(page.getByRole("heading", { name: "E2E napkin" })).toBeVisible();

  // 5–6. run optimization and inspect canvas
  await nav(page, "Optimizer");
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await runOptimizer(page);
  await expect(page.getByText("Only complete products counted")).toBeVisible();
  await page.getByRole("radio", { name: "Technical" }).click();
  await page.getByRole("button", { name: "Jump to best solution" }).click();

  // 7. baseline comparison
  await page.getByRole("button", { name: /Compare baseline/ }).click();
  await expect(page.getByText(/Baseline \(shelf\)/)).toBeVisible({ timeout: 60_000 });

  // 8. save plan
  await page.getByRole("button", { name: "Save plan" }).click();
  await page.getByTestId("confirm-save-plan").click();
  await nav(page, "Plans");
  await expect(page.getByText("draft").first()).toBeVisible();

  // 9. exports
  for (const id of ["export-svg", "export-csv", "export-pdf"]) {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId(id).click()]);
    expect(dl.suggestedFilename()).toMatch(/\.(svg|csv|pdf)$/);
  }

  // commit once, refuse the second commit
  await page.getByTestId("commit-plan").click();
  await page.getByTestId("confirm-commit").click();
  await expect(page.getByText(/deducted from inventory/)).toBeVisible();
  await page.getByTestId("commit-plan-again").click();
  await expect(page.getByText(/already committed/)).toBeVisible();

  // 10. reload — data persists
  await page.reload();
  await expect(page.getByText("committed").first()).toBeVisible();
  await nav(page, "Inventory");
  await expect(page.getByText("E2E linen offcut").first()).toBeVisible();

  // 11–12. modify inventory → outdated → re-run → valid again
  await nav(page, "Optimizer");
  await page.getByRole("tab", { name: "materials" }).click();
  await page.getByLabel("Include Tablecloth second").uncheck();
  await expect(page.getByTestId("outdated-banner")).toBeVisible();
  await page.getByTestId("run-optimization").click();
  await expect(page.getByTestId("outdated-banner")).toBeHidden({ timeout: 60_000 });
  await expect(page.locator("text=VALID").first()).toBeVisible();

  expect(errors.filter((e) => !/favicon|Download the React DevTools/.test(e))).toEqual([]);
});

test("benchmark laboratory runs real algorithms", async ({ page }) => {
  await loadDemo(page);
  await nav(page, "Benchmark");
  // keep it quick: only the first dataset
  for (const name of ["Small tailoring shop", "Mixed remnant inventory", "Uniform fabric batch", "Fragmented textile inventory", "Defect-heavy fabric batch", "Rotation-restricted batch", "High-volume manufacturing batch"]) {
    await page.getByLabel(name).uncheck();
  }
  await page.getByTestId("run-benchmark").click();
  await expect(page.getByTestId("benchmark-table")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("benchmark-table")).toContainText("Baseline · First-Fit Shelf");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-benchmark").click()]);
  expect(dl.suggestedFilename()).toMatch(/\.md$/);
});
