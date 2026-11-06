// Application browser journeys share the same public role/panel navigation.
const applicationRoute = (application, panel = "documents") => {
  const section = ["submitted", "rejected"].includes(application.status)
    ? application.status
    : "active";
  const query = new URLSearchParams({
    view: "applications",
    section,
    application: application.id,
    panel,
  });
  if (application.archived) query.set("history", "true");
  return `/discover/?${query}`;
};

const workbench = (page) => page.locator(".opportunities-workbench:visible");
const applicationCard = (page, application) =>
  workbench(page).locator(`[data-application-id="${application.id}"]`);
const roleCard = (page, application) =>
  page.locator(".discover-card").filter({
    has: page.locator(`[data-opportunity-id="${application.job_id}"]`),
  });
const showPanel = async (page, panel) => {
  const name = panel[0].toUpperCase() + panel.slice(1);
  const scope = (await workbench(page).count())
    ? workbench(page)
    : page.locator(".discover-inspector");
  await scope.getByRole("button", { name, exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("panel") === panel);
  if (panel !== "overview") await workbench(page).waitFor();
};
const selectApplication = async (page, application, panel = "activity") => {
  await roleCard(page, application).locator(".discover-card-open").click();
  await showPanel(page, panel);
  await applicationCard(page, application).waitFor();
};
const openApplication = async (
  page,
  base,
  application,
  panel = "documents",
) => {
  await page.goto(base + applicationRoute(application, panel));
  await applicationCard(page, application).waitFor();
};

module.exports = {
  applicationRoute,
  applicationCard,
  roleCard,
  workbench,
  showPanel,
  selectApplication,
  openApplication,
};
