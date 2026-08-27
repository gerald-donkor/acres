import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ApiClientError } from "@/lib/api/envelope";
import {
  getDataset,
  getSession,
  listDatasets,
  listDatasetVersions,
  listOrganizations,
} from "@/lib/api/server";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  selectActiveOrganizationId,
} from "@/lib/app/active-organization";

export async function loadDatasetsState(returnTo: string) {
  try {
    const session = await getSession();
    if (!session.authenticated || session.account === null) {
      return {
        session,
        organizations: [],
        activeOrganization: null,
        datasets: [],
      };
    }
    const organizations = await listOrganizations();
    const cookieStore = await cookies();
    const preferredId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
    const activeId = selectActiveOrganizationId(organizations, preferredId);
    const activeOrganization =
      activeId === null
        ? null
        : organizations.find((organization) => organization.id === activeId) ??
          null;
    const datasets =
      activeOrganization === null
        ? []
        : await listDatasets(activeOrganization.id);
    return { session, organizations, activeOrganization, datasets };
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "UNAUTHENTICATED") {
      redirect(`/login?returnTo=${returnTo}`);
    }
    return { error };
  }
}

export async function loadDatasetDetailState(
  datasetId: string,
  returnTo: string,
) {
  try {
    const session = await getSession();
    if (!session.authenticated || session.account === null) {
      return {
        session,
        organizations: [],
        activeOrganization: null,
        dataset: null,
        versions: [],
      };
    }
    const organizations = await listOrganizations();
    const cookieStore = await cookies();
    const preferredId = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value;
    const activeId = selectActiveOrganizationId(organizations, preferredId);
    const activeOrganization =
      activeId === null
        ? null
        : organizations.find((organization) => organization.id === activeId) ??
          null;
    const [dataset, versions] =
      activeOrganization === null
        ? [null, []]
        : await Promise.all([
            getDataset(activeOrganization.id, datasetId),
            listDatasetVersions(activeOrganization.id, datasetId),
          ]);
    return { session, organizations, activeOrganization, dataset, versions };
  } catch (error) {
    if (error instanceof ApiClientError && error.code === "UNAUTHENTICATED") {
      redirect(`/login?returnTo=${returnTo}`);
    }
    return { error };
  }
}
