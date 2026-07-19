import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import { IconButton } from "./ui/icon-button";
import { cn } from "@/lib/utils";

type ResponsiveMasterDetailProps = {
  hasSelection: boolean;
  mobileDetailOpen?: boolean;
  listLabel: string;
  detailLabel: string;
  list: ReactNode;
  detail: ReactNode;
  emptyDetail?: ReactNode;
  onBackToList: () => void;
  canLeaveDetail?: () => boolean;
  onBlockedLeave?: () => void;
  listWidthClassName?: string;
  className?: string;
};

export function ResponsiveMasterDetail({
  hasSelection,
  mobileDetailOpen = hasSelection,
  listLabel,
  detailLabel,
  list,
  detail,
  emptyDetail,
  onBackToList,
  canLeaveDetail,
  onBlockedLeave,
  listWidthClassName = "md:w-80",
  className,
}: ResponsiveMasterDetailProps) {
  const requestBack = () => {
    if (canLeaveDetail && !canLeaveDetail()) {
      onBlockedLeave?.();
      return;
    }
    onBackToList();
  };

  return (
    <div className={cn("min-h-[calc(100dvh-8rem)] overflow-hidden rounded-xl border border-border bg-card md:flex", className)}>
      <section
        aria-label={listLabel}
        className={cn(
          "min-h-0 flex-col overflow-hidden md:flex md:shrink-0 md:border-r md:border-border",
          mobileDetailOpen ? "hidden" : "flex",
          listWidthClassName,
        )}
      >
        {list}
      </section>
      <section
        aria-label={detailLabel}
        className={cn("min-h-0 min-w-0 flex-1 flex-col overflow-hidden", mobileDetailOpen ? "flex" : "hidden md:flex")}
      >
        {hasSelection ? (
          <>
            <div className="flex min-h-12 items-center gap-2 border-b border-border px-3 md:hidden">
              <IconButton label={`Back to ${listLabel}`} variant="ghost" onClick={requestBack}>
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </IconButton>
              <span className="text-sm font-medium">{detailLabel}</span>
            </div>
            {detail}
          </>
        ) : emptyDetail}
      </section>
    </div>
  );
}
