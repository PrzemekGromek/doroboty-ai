import { Link, useLocation, useParams, useSearchParams } from "react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Users, MapPin, BriefcaseBusiness, Bookmark } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Search, ArrowRight, Monitor, X } from "lucide-react";
import { BackLink } from "@/components/back-link";
import { ResponsivePanel } from "@/components/responsive-panel";
import { SalaryFact } from "@/features/jobs/salary-fact";
import { functionLabels } from "@/features/jobs/presentation";
import peopleArt from "../../../docs/design-system/agent-kit/assets/people.png";
import { CompanyLogo } from "@/features/jobs/company-logo";
import { JobCard } from "@/features/jobs/job-card";
import { JobFiltersForm } from "@/features/jobs/job-filters";
import { JobPagination } from "@/features/jobs/job-pagination";
import { JobDescription } from "@/features/jobs/job-description";
import { filterJobs, parseJobFilters } from "@/features/jobs/filters";
import { paginateJobs, jobListingHref } from "@/features/jobs/pagination";
import {
  categoryLabels,
  remoteLabels,
  seniorityLabels,
  contractLabels,
} from "@/features/jobs/presentation";
import type { JobWithCompany } from "@/features/jobs/types";
import posthog from "posthog-js";
import { posthogIsConfigured, usePrototype } from "./store";
import { currentPerson, publishedJobs } from "./model";
import { NotFound } from "./shell";
import { cn } from "@/lib/utils";

function LocalMap({ jobs }: { jobs: JobWithCompany[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const job = jobs.find((x) => x.id === selected);
  const located = jobs.filter((x) => x.coordinates);
  const locationKey = (x: JobWithCompany) => x.locations[0].trim().toLocaleLowerCase("pl");
  const markers = located.filter(
    (x, index) => located.findIndex((other) => locationKey(other) === locationKey(x)) === index,
  );
  const locationCount = (x: JobWithCompany) =>
    located.filter((other) => locationKey(other) === locationKey(x)).length;
  return (
    <div className="prototype-map-layout">
      <div className="prototype-map" role="region" aria-label="Mapa ofert w Polsce">
        <svg viewBox="0 0 600 520" aria-hidden="true">
          <path
            d="M140 45 220 65 320 40 375 60 440 50 505 150 480 240 520 335 440 420 355 435 310 480 230 435 150 445 90 350 70 260 95 160Z"
            fill="var(--gui-surface-muted)"
            stroke="var(--gui-edge)"
            strokeWidth="2"
          />
        </svg>
        {markers.map((x) => (
          <Button
            key={x.id}
            className="prototype-map-pin"
            size="icon-sm"
            variant={selected === x.id ? "default" : "outline"}
            style={{
              left: `${((x.coordinates!.longitude - 14) / 11) * 80 + 10}%`,
              top: `${((55 - x.coordinates!.latitude) / 6) * 80 + 10}%`,
            }}
            aria-label={`${x.locations.join(" / ")}: ${locationCount(x)} ofert`}
            aria-pressed={selected === x.id}
            onClick={() => setSelected(x.id)}
          >
            {locationCount(x) > 1 ? locationCount(x) : <MapPin />}
          </Button>
        ))}
      </div>
      <div className="prototype-panel">
        {job ? (
          <>
            <h2>{job.title}</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Oferty w tej lokalizacji: {locationCount(job)}
            </p>
            <p className="my-3">
              {job.company.name} · {job.locations.join(" / ")}
            </p>
            <Link to={`/oferty/${job.slug}`} className={buttonVariants({ variant: "outline" })}>
              Zobacz rolę
            </Link>
          </>
        ) : (
          <p>Wybierz znacznik, aby zobaczyć ofertę.</p>
        )}
        <ul className="mt-5 space-y-3">
          {jobs.map((x) => (
            <li key={x.id}>
              <Link className="text-[var(--gui-link)] underline" to={`/oferty/${x.slug}`}>
                {x.title} · {x.company.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
export function JobsPage() {
  const { state } = usePrototype();
  const person = currentPerson(state);
  const [params, setParams] = useSearchParams();
  const filters = parseJobFilters(Object.fromEntries(params));
  const chipButtons = useRef(new Map<string, HTMLButtonElement>());
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const pendingChipFocus = useRef<string | null>(null);
  useEffect(() => {
    const target = pendingChipFocus.current;
    if (!target) return;
    (chipButtons.current.get(target) ?? resultsHeading.current)?.focus();
    pendingChipFocus.current = null;
  }, [params]);
  const all = publishedJobs(state);
  const jobs = filterJobs(all, filters);
  const pagination = paginateJobs(jobs, filters.page);
  const view = params.get("view") === "map" ? "map" : "list";
  const savedIds =
    person?.role === "candidate"
      ? new Set(state.saved.filter((x) => x.candidateId === person.id).map((x) => x.jobId))
      : undefined;
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    next.delete("page");
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  function removeFilter(key: string) {
    const keys = Object.entries(filters)
      .filter(([name, value]) => name !== "page" && value)
      .map(([name]) => name);
    const index = keys.indexOf(key);
    pendingChipFocus.current = keys[index + 1] ?? keys[index - 1] ?? "results";
    change(key, "");
  }
  function reset() {
    setParams(view === "map" ? { view: "map" } : {});
  }
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const next = new URLSearchParams(params);
    next.delete("page");
    for (const key of ["query", "location"]) {
      const value = String(data.get(key) ?? "").trim();
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const searchFilters = parseJobFilters(Object.fromEntries(next));
    if (posthogIsConfigured()) {
      posthog.capture("job_search_submitted", {
        has_location: Boolean(searchFilters.location),
        has_query: Boolean(searchFilters.query),
        result_count: filterJobs(all, searchFilters).length,
      });
    }
    setParams(next);
  }
  const locations = [...new Set(all.flatMap((x) => x.locations))];
  return (
    <>
      <section className="pp-intro-section">
        <div className="pp-container">
          <div className="pp-intro-grid">
            <div className="pp-intro-copy">
              <h1>
                Dobra robota.
                <br />
                <span>Z AI w środku.</span>
              </h1>
              <p>
                Dla ludzi, którzy tworzą, wdrażają i rozwijają AI.
                <br />
                Znajdź rolę, w której zrobisz coś dobrego.
              </p>
            </div>
            <img
              className="pp-people-art"
              src={peopleArt}
              alt="Dwie osoby pracujące razem z laptopem"
            />
          </div>
          <form
            key={`${filters.query ?? ""}:${filters.location ?? ""}`}
            className="pp-search-form"
            onSubmit={search}
          >
            <label className="pp-search-field">
              <span>
                <Search className="pp-icon" />
              </span>
              <span className="sr-only">Szukaj ofert</span>
              <input
                name="query"
                aria-label="Szukaj ofert"
                maxLength={100}
                defaultValue={filters.query ?? ""}
                placeholder="Stanowisko, firma lub słowo kluczowe"
              />
            </label>
            <label className="pp-location-field">
              <span>
                <MapPin className="pp-icon" />
              </span>
              <select
                name="location"
                aria-label="Lokalizacja"
                defaultValue={filters.location ?? ""}
              >
                <option value="">Cała Polska</option>
                {[...new Set([...locations, ...(filters.location ? [filters.location] : [])])].map(
                  (x) => (
                    <option key={x}>{x}</option>
                  ),
                )}
              </select>
            </label>
            <Button type="submit" className="pp-search-submit">
              Szukaj <ArrowRight className="pp-icon" />
            </Button>
          </form>
          <div className="pp-category-tabs" aria-label="Kategorie ofert">
            {(
              [
                ["", "Wszystkie oferty", ""],
                ["build", "Build", "Twórz AI"],
                ["apply", "Apply", "Wdrażaj AI"],
                ["lead", "Lead", "Wyznaczaj kierunek"],
              ] as const
            ).map(([key, label, description]) => (
              <button
                key={key}
                className={cn("pp-category-tab", (filters.category ?? "") === key && "pp-selected")}
                aria-pressed={(filters.category ?? "") === key}
                onClick={() => change("category", key)}
              >
                <span>
                  <b>{label}</b>
                  <small>{description}</small>
                </span>
                <span className="pp-category-count">
                  {filterJobs(all, { ...filters, category: key || undefined }).length}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="pp-container pp-board-layout">
        <div className="pp-filter-position">
          <ResponsivePanel
            title="Filtry"
            description="Wyniki zmieniają się od razu. W każdej grupie wybierz jeden warunek."
            resultCount={jobs.length}
          >
            <JobFiltersForm filters={filters} onChange={change} onReset={reset} />
          </ResponsivePanel>
        </div>
        <div className="pp-results-column">
          <div className="pp-results-heading">
            <div className="pp-results-title">
              <h2 ref={resultsHeading} tabIndex={-1}>
                Oferty pracy
              </h2>
              <span role="status">{jobs.length}</span>
            </div>
            <div className="pp-results-controls">
              <span className="pp-sort-label">Najnowsze</span>
              <Link
                className="pp-view-link"
                aria-current={view === "list" ? "page" : undefined}
                to={jobListingHref(filters)}
              >
                Lista
              </Link>
              <Link
                className="pp-view-link"
                aria-current={view === "map" ? "page" : undefined}
                to={jobListingHref(filters, 1, "map")}
              >
                Mapa
              </Link>
            </div>
          </div>
          {Object.entries(filters).some(([k, v]) => k !== "page" && v) && (
            <div className="pp-active-filters">
              {Object.entries(filters)
                .filter(([k, v]) => k !== "page" && v)
                .map(([key, value]) => (
                  <button
                    className="pp-filter-chip"
                    key={key}
                    aria-label={`Usuń filtr: ${value}`}
                    ref={(element) => {
                      if (element) chipButtons.current.set(key, element);
                      else chipButtons.current.delete(key);
                    }}
                    onClick={() => removeFilter(key)}
                  >
                    {String(value)} <X className="pp-icon" />
                  </button>
                ))}
              <button className="pp-text-button" onClick={reset}>
                Wyczyść
              </button>
            </div>
          )}
          {jobs.length ? (
            view === "map" ? (
              <LocalMap jobs={jobs} />
            ) : (
              <>
                <div className="pp-job-list">
                  {pagination.items.map((job) => (
                    <JobCard key={job.id} job={job} saved={savedIds?.has(job.id)} />
                  ))}
                </div>
                <JobPagination pagination={pagination} filters={filters} />
              </>
            )
          ) : (
            <div className="pp-empty-state">
              <span className="pp-empty-mark">
                <Search className="pp-icon" />
              </span>
              <h3>Brak ofert dla tych filtrów</h3>
              <p>Wyczyść część kryteriów i spróbuj ponownie.</p>
              <Button onClick={reset}>Pokaż wszystkie oferty</Button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function JobPage() {
  const { slug } = useParams();
  const location = useLocation();
  useEffect(() => {
    const target =
      location.hash === "#role" ? "role" : location.hash === "#employer" ? "employer" : null;
    if (!target) return;
    // Run after the shell's route focus handling, including direct deep links.
    const frame = requestAnimationFrame(() => {
      const section = document.getElementById(target);
      section?.focus({ preventScroll: true });
      section?.scrollIntoView({ behavior: "instant", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash, location.key, slug]);
  const { state, run } = usePrototype();
  const person = currentPerson(state);
  const job = publishedJobs(state).find((x) => x.slug === slug);
  if (!job) return <NotFound />;
  const saved = state.saved.some((x) => x.candidateId === person?.id && x.jobId === job.id);
  const submitted = state.applications.find(
    (x) => x.candidateId === person?.id && x.jobId === job.id,
  );
  const related = publishedJobs(state)
    .filter((x) => x.id !== job.id)
    .sort((a, b) => Number(b.category === job.category) - Number(a.category === job.category))
    .slice(0, 3);
  return (
    <article className="pp-offer-page pp-container pp-offer-main">
      <nav className="pp-offer-breadcrumb" aria-label="Powrót do ofert">
        <BackLink to="/oferty">Wróć do ofert</BackLink>
        <span>{job.company.name}</span>
      </nav>
      <div className="pp-offer-grid">
        <header className="pp-offer-hero">
          <div className="pp-offer-identity">
            <CompanyLogo company={job.company} />
            <div>
              <Link className="pp-offer-company-link" to={`/firmy/${job.company.slug}`}>
                {job.company.name}
                <ArrowUpRight className="pp-icon" />
              </Link>
              <p className="pp-offer-date">
                Opublikowano {new Intl.DateTimeFormat("pl-PL").format(new Date(job.publishedAt))}
              </p>
            </div>
            <span className="pp-offer-category">{categoryLabels[job.category]}</span>
          </div>
          <h1>{job.title}</h1>
          <div className="pp-offer-key-facts">
            <span>
              <MapPin className="pp-icon" />
              {job.locations.join(" / ")}
            </span>
            <span>
              <Monitor className="pp-icon" />
              {remoteLabels[job.remoteStatus]}
            </span>
            <span>
              <BriefcaseBusiness className="pp-icon" />
              {seniorityLabels[job.seniority]}
            </span>
          </div>
          <div className="pp-offer-skill-row">
            <span>{functionLabels[job.function]}</span>
          </div>
          <div className="pp-offer-hero-bottom">
            <span>{job.summary}</span>
          </div>
        </header>
        <aside className="pp-offer-sidebar">
          <div className="pp-offer-action-card">
            <div className="pp-offer-pay">
              <p className="pp-offer-eyebrow">Wynagrodzenie</p>
              <SalaryFact job={job} />
            </div>
            <h2 className="sr-only">Konkrety</h2>
            <dl className="pp-offer-terms">
              {[
                ["Forma współpracy", contractLabels[job.contract]],
                ["Tryb pracy", remoteLabels[job.remoteStatus]],
                ["Lokalizacja", job.locations.join(" / ")],
                ["Doświadczenie", seniorityLabels[job.seniority]],
              ].map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="pp-offer-actions">
              {person?.role === "candidate" ? (
                <>
                  <Link
                    className={buttonVariants()}
                    to={submitted ? `/app/aplikacje/${submitted.id}` : `/aplikuj/${job.slug}`}
                  >
                    {submitted ? "Zobacz swoją aplikację" : "Aplikuj"}
                    <ArrowRight />
                  </Link>
                  <Button
                    variant="outline"
                    aria-label="Zapisz ofertę"
                    aria-pressed={saved}
                    onClick={() => {
                      if (
                        run({ type: "toggle_saved", jobId: job.id }) &&
                        !saved &&
                        posthogIsConfigured()
                      ) {
                        posthog.capture("job_saved", {
                          job_category: job.category,
                          remote_status: job.remoteStatus,
                        });
                      }
                    }}
                  >
                    <Bookmark className={cn(saved && "fill-current")} />
                    Zapisz ofertę
                  </Button>
                </>
              ) : !person ? (
                <Link
                  className={buttonVariants()}
                  to={`/auth/sign-in?audience=candidate&next=${encodeURIComponent(`/aplikuj/${job.slug}`)}`}
                >
                  Wybierz osobę i aplikuj
                </Link>
              ) : (
                <p>Aplikacje są dostępne z profilu kandydata.</p>
              )}
              <p>Prototyp: aplikacja zostaje w tym przeglądarkowym scenariuszu.</p>
            </div>
          </div>
        </aside>
        <div className="pp-offer-description">
          <nav className="pp-offer-section-nav" aria-label="Sekcje oferty">
            <Link to={{ pathname: `/oferty/${job.slug}`, hash: "#role" }}>O roli</Link>
            <Link to={{ pathname: `/oferty/${job.slug}`, hash: "#employer" }}>O firmie</Link>
          </nav>
          <div className="pp-offer-reading">
            <section id="role" tabIndex={-1} className="pp-offer-section">
              <h2>O roli</h2>
              <JobDescription description={job.description} />
            </section>
          </div>
        </div>
        <section className="pp-offer-employer" id="employer" tabIndex={-1}>
          <div className="pp-employer-top">
            <CompanyLogo company={job.company} />
            <div>
              <p className="pp-offer-eyebrow">Poznaj firmę</p>
              <h2>{job.company.name}</h2>
            </div>
          </div>
          <div className="pp-employer-copy">
            <div>
              <p>{job.company.description}</p>
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                to={`/firmy/${job.company.slug}`}
              >
                Oferty tej firmy <ArrowRight />
              </Link>
            </div>
            <img src={peopleArt} alt="" />
          </div>
        </section>
      </div>
      {related.length > 0 && (
        <section className="pp-offer-related">
          <div className="pp-offer-related-heading">
            <h2>Może też Cię zainteresować</h2>
            <Link to="/oferty">
              Wszystkie oferty <ArrowRight className="pp-icon" />
            </Link>
          </div>
          <div className="pp-job-list">
            {related.map((x) => (
              <JobCard key={x.id} job={x} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

export function CompanyPage() {
  const { slug } = useParams();
  const { state } = usePrototype();
  const company = state.companies.find((x) => x.slug === slug);
  if (!company) return <NotFound />;
  const jobs = publishedJobs(state).filter((x) => x.companyId === company.id);
  return (
    <article className="mx-auto max-w-[1360px] px-5 py-14 lg:px-8 lg:py-20">
      <div className="grid gap-8 pb-12 shadow-[var(--gui-divider-bottom-shadow)] lg:grid-cols-[1fr_320px]">
        <div>
          <CompanyLogo company={company} size="large" />
          <h1 className="mt-3 text-4xl font-semibold tracking-[var(--gui-tracking-s)] sm:text-5xl">
            {company.name}
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-relaxed">{company.summary}</p>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-muted-foreground">
            {company.description}
          </p>
        </div>
        <dl className="h-fit rounded-xl bg-muted/35 p-6 text-sm">
          <div className="flex gap-2">
            <MapPin className="size-5" />
            <div>
              <dt className="font-medium">Lokalizacja</dt>
              <dd className="mt-1 text-muted-foreground">{company.location}</dd>
            </div>
          </div>
          <div className="mt-5 flex gap-2">
            <Users className="size-5" />
            <div>
              <dt className="font-medium">Wielkość</dt>
              <dd className="mt-1 text-muted-foreground">{company.sizeLabel}</dd>
            </div>
          </div>
          {/^https?:\/\//i.test(company.websiteUrl) && (
            <a
              className="mt-6 inline-flex items-center gap-2 font-medium text-[var(--gui-link)] hover:underline"
              href={company.websiteUrl}
              target="_blank"
              rel="noreferrer"
            >
              Strona firmy <ArrowUpRight className="size-4" />
            </a>
          )}
        </dl>
      </div>
      <section className="py-12">
        <h2 className="text-2xl font-semibold">Otwarte role</h2>
        {jobs.length > 0 ? (
          <div className="mt-7 pp-job-list">
            {jobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <p className="mt-5 text-lg">Ta firma nie ma teraz aktywnych ofert.</p>
        )}
      </section>
    </article>
  );
}
