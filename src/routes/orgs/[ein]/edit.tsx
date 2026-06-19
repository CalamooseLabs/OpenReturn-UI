import { define } from "../../../utils.ts";
import { page } from "fresh";
import { ApiError } from "../../../lib/api/mod.ts";
import { Layout } from "../../../components/templates.tsx";
import {
  Card,
  ErrorAlert,
  Field,
  Flash,
  InfoAlert,
  PageHeader,
  Section,
  Select,
} from "../../../components/molecules.tsx";
import { LinkButton } from "../../../components/atoms.tsx";
import SubmitButton from "../../../islands/SubmitButton.tsx";
import { formatEin } from "../../../lib/format.ts";
import { can } from "../../../lib/auth.ts";
import type { OrgFull, Sector } from "../../../lib/types.ts";

interface Data {
  ein: string;
  org?: OrgFull;
  sectors: Sector[];
  notFound?: boolean;
  error?: string;
  err?: string;
}

export const handler = define.handlers({
  async GET(ctx) {
    const ein = ctx.params.ein.replace(/\D/g, "");
    const api = ctx.state.api;
    const err = ctx.url.searchParams.get("err") ?? undefined;
    const sectorsP = api.orgs.sectors();
    let org: OrgFull;
    try {
      org = await api.orgs.full(ein);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e;
      if (e instanceof ApiError && e.status === 404) {
        return page<Data>({ ein, sectors: [], notFound: true });
      }
      return page<Data>({
        ein,
        sectors: [],
        error: e instanceof Error ? e.message : "Failed to load organization.",
      });
    }
    const sectorsR = await Promise.allSettled([sectorsP]);
    const sectors = sectorsR[0].status === "fulfilled"
      ? sectorsR[0].value.sectors ?? []
      : [];
    return page<Data>({ ein, org, sectors, err });
  },

  async POST(ctx) {
    const ein = ctx.params.ein.replace(/\D/g, "");
    if (!ctx.state.principal) return ctx.redirect("/login");
    const form = await ctx.req.formData();
    const s = (k: string) => {
      const v = form.get(k);
      return v === null ? "" : String(v).trim();
    };
    const body = {
      ein,
      name: s("name"),
      website: s("website"),
      main_email: s("main_email"),
      sector_code: s("sector_code"),
      physical_address: {
        street: s("street"),
        street2: s("street2"),
        city: s("city"),
        state: s("state"),
        zip: s("zip"),
      },
      mailing_address: {
        street: s("mail_street"),
        street2: s("mail_street2"),
        city: s("mail_city"),
        state: s("mail_state"),
        zip: s("mail_zip"),
      },
    };
    try {
      const res = await ctx.state.api.orgs.edit(body) as { error?: string };
      if (res && res.error) {
        return ctx.redirect(
          `/orgs/${ein}/edit?err=${encodeURIComponent(res.error)}`,
        );
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        return ctx.redirect("/login");
      }
      const msg = err instanceof Error ? err.message : "Save failed.";
      return ctx.redirect(`/orgs/${ein}/edit?err=${encodeURIComponent(msg)}`);
    }
    return ctx.redirect(
      `/orgs/${ein}?msg=${encodeURIComponent("Organization updated.")}`,
    );
  },
});

export default define.page<typeof handler>((ctx) => {
  const { data, state } = ctx;
  const path = ctx.url.pathname;

  if (data.notFound) {
    return (
      <Layout principal={state.principal} path={path}>
        <ErrorAlert
          message={`No organization with EIN ${formatEin(data.ein)}.`}
        />
      </Layout>
    );
  }
  if (!data.org) {
    return (
      <Layout principal={state.principal} path={path}>
        <ErrorAlert message={data.error ?? "Failed to load organization."} />
      </Layout>
    );
  }
  if (!can(state.principal, "org:write")) {
    return (
      <Layout principal={state.principal} path={path}>
        <PageHeader title="Edit organization" eyebrow={formatEin(data.ein)} />
        <InfoAlert>
          You need the <code>org:write</code> permission to edit organizations.
        </InfoAlert>
        <div class="mt-4">
          <LinkButton href={`/orgs/${data.ein}`} variant="secondary">
            Back to profile
          </LinkButton>
        </div>
      </Layout>
    );
  }

  const org = data.org;
  const a = org.address ?? {};
  const m = org.mailing_address ?? {};
  const sectorOptions = data.sectors.map((s) => ({
    value: s.code,
    label: `${s.code} — ${s.name}`,
  }));

  return (
    <Layout principal={state.principal} path={path}>
      <PageHeader
        title="Edit organization"
        eyebrow={formatEin(data.ein)}
        subtitle={org.name}
        actions={
          <LinkButton href={`/orgs/${data.ein}`} variant="secondary" size="sm">
            Cancel
          </LinkButton>
        }
      />
      <Flash err={data.err} />
      <form method="POST">
        <div class="grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Card>
            <Section title="Identity">
              <Field label="Name" name="name" value={org.name} required />
              <Field
                label="Website"
                name="website"
                value={org.website ?? ""}
                type="url"
                placeholder="https://example.org"
              />
              <Field
                label="Main email"
                name="main_email"
                value={org.main_email ?? ""}
                type="email"
              />
              <Select
                label="Sector"
                name="sector_code"
                value={org.sector_code ?? ""}
                options={sectorOptions}
                placeholder="— none —"
              />
            </Section>
          </Card>

          <Card>
            <Section title="Physical address">
              <Field label="Street" name="street" value={a.street ?? ""} />
              <Field label="Street 2" name="street2" value={a.street2 ?? ""} />
              <div
                class="grid gap-3"
                style={{ gridTemplateColumns: "2fr 1fr 1fr" }}
              >
                <Field label="City" name="city" value={a.city ?? ""} />
                <Field label="State" name="state" value={a.state ?? ""} />
                <Field label="ZIP" name="zip" value={a.zip ?? ""} />
              </div>
            </Section>
            <Section title="Mailing address">
              <Field label="Street" name="mail_street" value={m.street ?? ""} />
              <Field
                label="Street 2"
                name="mail_street2"
                value={m.street2 ?? ""}
              />
              <div
                class="grid gap-3"
                style={{ gridTemplateColumns: "2fr 1fr 1fr" }}
              >
                <Field label="City" name="mail_city" value={m.city ?? ""} />
                <Field label="State" name="mail_state" value={m.state ?? ""} />
                <Field label="ZIP" name="mail_zip" value={m.zip ?? ""} />
              </div>
            </Section>
          </Card>
        </div>

        <div class="mt-6 flex gap-3">
          <SubmitButton variant="primary" pendingLabel="Saving…">
            Save changes
          </SubmitButton>
          <LinkButton href={`/orgs/${data.ein}`} variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Layout>
  );
});
