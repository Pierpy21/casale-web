import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { capitalize, formatIt, toDate } from "@/components/agenda/agenda-utils";
import { inventoryPdfHref } from "@/components/inventory/inventory-links";
import { MarkSeenButton, ShareReportButton } from "@/components/inventory/ReportActions";
import { Badge, buttonClasses } from "@/components/ui";
import { isUuid } from "@/lib/action-utils";
import { requireProfile } from "@/lib/auth";
import { getInventoryReport } from "@/lib/data/inventory";
import { canManageInventory, canUseInventory } from "@/lib/permissions";
import type { InventoryReportLine } from "@/lib/types";

export const metadata: Metadata = {
  title: "Giacenza · Casale del Notaio",
};

/** Quantità con virgola decimale italiana, senza zeri inutili. */
function formatQuantity(value: number): string {
  return String(value).replace(".", ",");
}

function LineList({ lines, emptyText, tone }: { lines: InventoryReportLine[]; emptyText: string; tone: "order" | "present" }) {
  if (lines.length === 0) {
    return <p className="text-[18px] text-slate-dark">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-sand border-2 border-ink bg-paper">
      {lines.map((line) => (
        <li key={line.id} className="flex min-w-0 items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={tone === "order" ? "text-[22px] font-bold leading-snug text-ink wrap-anywhere" : "text-[20px] leading-snug text-ink wrap-anywhere"}>
              {line.product_name}
            </span>
            {line.unit && <span className="text-[15px] text-slate-dark">{line.unit}</span>}
          </div>
          <span className="shrink-0 font-serif text-3xl tabular-nums text-ink sm:text-4xl">×{formatQuantity(line.quantity)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function InventoryReportPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  if (!canUseInventory(profile)) redirect("/admin/agenda");

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const report = await getInventoryReport(id);
  if (!report) notFound();

  const toOrder = report.lines.filter((line) => line.state === "da_ordinare");
  const present = report.lines.filter((line) => line.state === "presente");
  const seen = report.status === "visto";
  const seenAt = report.seen_at ? formatIt(new Date(report.seen_at), "d MMM yyyy 'alle' HH:mm") : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex min-w-0 flex-col gap-5 border-b border-sand pb-6">
        <Link href="/admin/giacenza" className="w-fit rounded-[2px] text-[13px] font-medium text-petrol underline-offset-4 hover:underline">
          ← Giacenza
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={seen ? "success" : "neutral"}>{seen ? "Visto" : "Inviato"}</Badge>
          <span className="text-[14px] text-slate-dark">
            <span className="font-semibold text-ink">{toOrder.length}</span> da ordinare · {present.length} presenti
          </span>
        </div>

        <h1 className="text-3xl leading-tight wrap-anywhere sm:text-4xl lg:text-5xl">
          {capitalize(formatIt(toDate(report.report_date), "EEEE d MMMM yyyy"))}
        </h1>
        <p className="text-[14px] text-slate-dark">
          Compilata da {report.created_by_name}
          {seenAt ? ` · visto il ${seenAt}` : ""}
        </p>
        {report.notes && <p className="whitespace-pre-line wrap-anywhere text-[15px] leading-relaxed text-ink">{report.notes}</p>}

        <div className="no-print flex flex-wrap items-start gap-3">
          <a href={inventoryPdfHref(report.id)} target="_blank" rel="noopener" className={buttonClasses("outline", "md")}>
            Apri PDF
          </a>
          <ShareReportButton reportId={report.id} reportDate={report.report_date} />
          {canManageInventory(profile) && <MarkSeenButton reportId={report.id} seen={seen} />}
        </div>
      </header>

      <section aria-labelledby="da-ordinare" className="flex min-w-0 flex-col gap-4">
        <h2 id="da-ordinare" className="text-[14px] font-bold uppercase tracking-[0.12em] text-ink">
          Da ordinare <span className="tabular-nums">({toOrder.length})</span>
        </h2>
        <LineList lines={toOrder} emptyText="Niente da ordinare." tone="order" />
      </section>

      <section aria-labelledby="presenti" className="flex min-w-0 flex-col gap-4">
        <h2 id="presenti" className="text-[14px] font-medium uppercase tracking-[0.12em] text-slate-dark">
          Presenti <span className="tabular-nums">({present.length})</span>
        </h2>
        <LineList lines={present} emptyText="Nessun prodotto presente segnalato." tone="present" />
      </section>
    </div>
  );
}
