import { test, expect } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("damaged session drafts cannot crash the workspace and can be explicitly discarded", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "reach-out-drafts-v2",
      JSON.stringify({
        "host-profile": {
          base: "{}",
          value: { name: {}, extraPeriods: "damaged" },
        },
        invalid: null,
      }),
    ),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Mijn profiel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mijn profiel opslaan" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Actuele gegevens laden" }).click();
  await expect(page.locator(".draft-banner")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Nederlandse werkstroom: conceptbehoud, tekstherkenning, eisen, dossier, afspraken en herstel", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Workaway Reach Out");
  await expect(page.locator("html")).toHaveAttribute("lang", "nl");
  await page.getByRole("button", { name: "Mijn profiel instellen" }).click();
  await page.getByLabel("Jouw naam / hostnaam").fill("Test Host");
  await page.getByLabel("Locatie", { exact: true }).fill("Nederland");
  await page
    .getByLabel("Jouw project en wat je biedt")
    .fill("Wij delen onze moestuin en koken samen.");
  await page.getByLabel("Gewenste vaardigheden").fill("tuinieren, koken");
  await page.getByLabel("Talen (komma’s)", { exact: true }).fill("Engels");
  await page.getByLabel("Beschikbaar vanaf").fill("2026-10-01");
  await page.getByLabel("Beschikbaar tot").fill("2026-10-31");
  await page.getByRole("button", { name: "Overzicht", exact: true }).click();
  await page.getByRole("button", { name: "Mijn profiel", exact: true }).click();
  await expect(page.getByLabel("Jouw naam / hostnaam")).toHaveValue(
    "Test Host",
  );
  await page.getByText("Harde eisen en voorkeuren", { exact: true }).click();
  await page.getByLabel("Vereiste vaardigheden").fill("gardening");
  await page.getByLabel("Minimaal aaneengesloten beschikbare dagen").fill("10");
  await page.getByRole("button", { name: "Mijn profiel opslaan" }).click();
  await expect(page.locator(".draft-banner")).toHaveCount(0);
  await page.getByRole("button", { name: "Kandidaten", exact: true }).click();
  await page.getByRole("button", { name: "Kandidaat toevoegen" }).click();
  await page.getByText("Profieltekst herkennen", { exact: true }).click();
  await page
    .getByLabel("Oorspronkelijke profieltekst")
    .fill(
      "Naam: Test Reiziger\nLocatie: Nederland\nIk kan tuinieren en koken.\nTalen: Engels\nBeschikbaar 2026-10-10 tot 2026-10-31\nIk spreek geen Duits.",
    );
  await page.getByRole("button", { name: "Voorstellen bekijken" }).click();
  await expect(page.getByLabel("Naam", { exact: true })).toHaveValue("");
  for (const check of await page.locator(".suggestion input").all())
    await check.check();
  await page
    .getByRole("button", { name: "Geselecteerde voorstellen overnemen" })
    .click();
  await expect(page.getByLabel("Naam", { exact: true })).toHaveValue(
    "Test Reiziger",
  );
  await expect(
    page.getByLabel("Talen (komma’s)", { exact: true }),
  ).not.toHaveValue(/german/);
  await page.getByRole("button", { name: "Kandidaat opslaan" }).click();
  await page.getByRole("button", { name: /Test Reiziger Nederland/ }).click();
  await expect(
    page.getByText("100% match · 100% gegevensdekking"),
  ).toBeVisible();
  await page.getByLabel("Kandidaatstatus").selectOption("shortlisted");
  await expect(page.getByLabel("Kandidaatstatus")).toHaveValue("shortlisted");
  await page
    .getByLabel("Wat spreekt je specifiek aan")
    .fill("Jouw ervaring met een moestuin past goed bij ons project.");
  await page
    .getByRole("button", { name: "Concept voorbereiden", exact: true })
    .click();
  await page.getByRole("button", { name: "Berichten", exact: true }).click();
  await expect(page.getByLabel("Bericht aan Test Reiziger")).toHaveValue(
    /moestuin/,
  );
  await expect(
    page.getByRole("button", { name: "Als verzonden vastleggen" }),
  ).toBeDisabled();
  await page.getByLabel("Ik heb dit exacte bericht").check();
  await page.getByRole("button", { name: "Als verzonden vastleggen" }).click();
  await expect(
    page.getByRole("heading", { name: "Wachten op een reactie" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reactie in dossier vastleggen" })
    .click();
  await page.getByLabel("Soort dossierregel").selectOption("reply");
  await page.getByLabel("Datum en tijd contactmoment").fill("2026-09-12T12:00");
  await page
    .getByLabel("Tekst voor het dossier")
    .fill("Dank je, ik kom graag meer over jullie tuin te weten.");
  // Actual current time may be later than the fixed environment date. A fresh timestamp ensures this reply follows the recorded send.
  const date = await page.evaluate(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  await page.getByLabel("Datum en tijd contactmoment").fill(date);
  await page.getByRole("button", { name: "Dossierregel opslaan" }).click();
  await expect(
    page.getByText("Dank je, ik kom graag meer over jullie tuin te weten.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Kandidaatstatus")).toHaveValue("replied");
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page.getByLabel("Titel afspraak").fill("Kennismaken");
  await page.getByLabel("Datum en tijd afspraak").fill("2026-10-15T14:00");
  await page.getByRole("button", { name: "Afspraak opslaan" }).click();
  await expect(page.getByText("Kennismaken", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Wijzigen", exact: true }).click();
  await page.getByLabel("Titel afspraak").fill("Kennismaken in de tuin");
  await page.getByRole("button", { name: "Afspraak opslaan" }).click();
  await expect(
    page.getByText("Kennismaken in de tuin", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Afspraak annuleren" }).click();
  await expect(page.getByText(/Test Reiziger · Geannuleerd/)).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Agenda exporteren" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "reach-out-calendar.ics",
  );
  await page.getByRole("button", { name: "Instellingen", exact: true }).click();
  await expect(
    page.getByLabel("Automatisch herstelpunt").locator("option"),
  ).not.toHaveCount(1);
  await page.getByLabel("Automatisch herstelpunt").selectOption({ index: 1 });
  await expect(
    page.getByRole("button", { name: "Volledige back-up herstellen" }),
  ).toBeDisabled();
  await page.getByLabel("Ik wil deze volledige back-up").check();
  await page
    .getByRole("button", { name: "Volledige back-up herstellen" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Controle vóór herstel" }),
  ).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Kandidaten", exact: true }).click();
  await page.getByRole("button", { name: /Test Reiziger Nederland/ }).click();
  await expect(
    page.getByText("Dank je, ik kom graag meer over jullie tuin te weten.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: join(tmpdir(), "reach-out-v2-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: join(tmpdir(), "reach-out-v2-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("stale save is rejected while local edits survive refresh and navigation", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mijn profiel", exact: true }).click();
  await page
    .getByLabel("Jouw project en wat je biedt")
    .fill("Mijn onopgeslagen wijziging blijft behouden.");
  const before = await (await request.get("/api/state")).json();
  const r = await request.post("/api/action", {
    headers: { "Content-Type": "application/json", "X-Reach-Out": "1" },
    data: {
      revision: before.revision,
      type: "profile.save",
      payload: {
        ...before.profile,
        description: "Wijziging uit een ander tabblad.",
      },
    },
  });
  expect(r.ok()).toBe(true);
  await page.getByRole("button", { name: "Mijn profiel opslaan" }).click();
  await expect(page.getByRole("alert")).toContainText("ander tabblad");
  await page.getByRole("button", { name: "Werkruimte vernieuwen" }).click();
  await expect(page.getByLabel("Jouw project en wat je biedt")).toHaveValue(
    "Mijn onopgeslagen wijziging blijft behouden.",
  );
  await expect(
    page.getByRole("button", { name: "Mijn profiel opslaan" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Actuele gegevens laden" }).click();
  await expect(page.getByLabel("Jouw project en wat je biedt")).toHaveValue(
    "Wijziging uit een ander tabblad.",
  );
  await page
    .getByLabel("Jouw project en wat je biedt")
    .fill("Deze invoer blijft ook na herladen behouden.");
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Mijn profiel", exact: true }).click();
  await expect(page.getByLabel("Jouw project en wat je biedt")).toHaveValue(
    "Deze invoer blijft ook na herladen behouden.",
  );
  await page.getByRole("button", { name: "Mijn profiel opslaan" }).click();
  await expect(page.locator(".draft-banner")).toHaveCount(0);
});

test("typing while a save is pending is not erased by the older save response", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Mijn profiel", exact: true }).click();
  await page
    .getByLabel("Jouw project en wat je biedt")
    .fill("Deze versie wordt opgeslagen.");
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  let requestArrived;
  const arrived = new Promise((resolve) => (requestArrived = resolve));
  await page.route("**/api/action", async (route) => {
    const response = await route.fetch();
    requestArrived();
    await gate;
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Mijn profiel opslaan" }).click();
  await arrived;
  await page
    .getByLabel("Jouw project en wat je biedt")
    .fill("Nieuwere tekst tijdens de opslagactie.");
  release();
  await expect(page.getByLabel("Jouw project en wat je biedt")).toHaveValue(
    "Nieuwere tekst tijdens de opslagactie.",
  );
  await expect(
    page.getByRole("button", { name: "Actuele gegevens laden" }),
  ).toBeVisible();
  await expect(page.locator(".draft-banner")).toBeVisible();
});
