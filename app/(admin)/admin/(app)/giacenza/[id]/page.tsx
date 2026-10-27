import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { capitalize, formatIt, toDate } from "@/components/agenda/agenda-utils";
import { inventoryPdfFileName, inventoryPdfHref } from "@/components/inventory/inventory-links";
import { InventoryReportSections, type InventoryReportGrouping } from "@/components/inventory/InventoryReportSections";
import { MarkSeenButton } from "@/components/inventory/ReportActions";
import { Badge, DocumentDownload, buttonClasses } from "@/components/ui";
import { isUuid } from "@/lib/action-utils";
import { requireProfile } from "@/lib/auth";
import { mergeReportLines } from "@/lib/inventory-utils";
import { getInventoryReport } from "@/lib/data/inventory";
import { canManageInventory, canUseInventory } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Giacenza · Casale del Notaio",
};

export default async function InventoryReportPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  if (!canUseInventory(profile)) redirect("/admin/agenda");

  const { id } = await params;
  if (!isUuid(id)) notFound();

  const report = await getInventoryReport(id);
  if (!report) notFound();

  const admin = canManageInventory(profile);
  const grouping: InventoryReportGrouping = admin ? "supplier" : "category";
  const rows = mergeReportLines(report.lines);
  const toOrderCount = rows.filter((row) => (row.to_order ?? 0) > 0).length;
  const presentCount = rows.filter((row) => (row.stock ?? 0) > 0).length;
  const seen = report.status === "visto";
  const seenAt = report.seen_at ? formatIt(new Date(report.seen_at), "d MMM yyyy 'alle' HH:mm") : null;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <header className="flex min-w-0 flex-col gap-5 border-b border-sand pb-6">
        <Link href="/admin/giacenza" className="w-fit rounded-[2px] text-[13px] font-medium text-petrol underline-offset-4 hover:underline">
          ← Giacenza
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={seen ? "success" : "neutral"}>{seen ? "Visto" : "Inviato"}</Badge>
          <span className="text-[14px] text-slate-dark">
            <span className="font-semibold text-ink tabular-nums">{toOrderCount}</span> da ordinare · <span className="tabular-nums">{presentCount}</span> presenti
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
          <DocumentDownload
            href={inventoryPdfHref(report.id)}
            fileName={inventoryPdfFileName(report.report_date)}
            mimeType="application/pdf"
            className={buttonClasses("outline", "md", "min-h-11")}
          >
            PDF completo
          </DocumentDownload>
          {admin && <MarkSeenButton reportId={report.id} seen={seen} />}
        </div>
      </header>

      <InventoryReportSections report={report} grouping={grouping} />
    </div>
  );
}
