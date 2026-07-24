"use client";

import Link from "next/link";
import { Copy, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import type { Asset } from "@/types";

import { formatAssetSize, resolveAssetDownloadURL } from "../helpers";
import type { AssetReference } from "../hooks/useAssets";
import { AssetPreview } from "./AssetPreview";

function References({
  assetID,
  references,
  loading,
  error,
  onRetry,
}: {
  assetID: string;
  references: AssetReference[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <PageState
        compact
        kind="error"
        title="Could not load references"
        description="The asset details remain available."
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }
  if (loading) return <PageState compact kind="loading" title="Loading references" />;
  if (references.length === 0) {
    return <p className="text-sm text-muted-foreground">No notes reference this asset.</p>;
  }
  return (
    <ul className="space-y-2">
      {references.map((reference) => (
        <li key={`${assetID}-${reference.document_id}`}>
          <Link
            href={`/docs/${reference.document_id}`}
            className="block rounded-md border border-border p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="truncate text-sm font-medium">{reference.title || "Untitled"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{reference.document_id.slice(0, 8)}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AssetDetail({
  asset,
  references,
  loadingReferences,
  referencesError,
  onRetryReferences,
  onCopyURL,
  onCopyMarkdown,
}: {
  asset: Asset | null;
  references: AssetReference[];
  loadingReferences: boolean;
  referencesError: boolean;
  onRetryReferences: () => void;
  onCopyURL: () => void;
  onCopyMarkdown: () => void;
}) {
  if (!asset) {
    return (
      <PageState
        kind="empty"
        title="Select an asset"
        description="Choose a file from the list to preview it and inspect references."
      />
    );
  }
  const url = resolveAssetDownloadURL(asset.file_key);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 md:p-5">
      <div className="space-y-6">
        <section aria-labelledby="asset-preview-heading">
          <h2 id="asset-preview-heading" className="mb-3 text-base font-semibold">Preview</h2>
          <AssetPreview key={`${asset.id}-${asset.url}`} asset={asset} />
        </section>

        <section aria-labelledby="asset-metadata-heading">
          <h2 id="asset-metadata-heading" className="mb-3 text-base font-semibold">Details</h2>
          <dl className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Name</dt>
              <dd className="mt-1 break-words font-medium">{asset.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Type and size</dt>
              <dd className="mt-1">{asset.content_type} · {formatAssetSize(asset.size)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">URL</dt>
              <dd className="mt-1 overflow-x-auto whitespace-nowrap pb-1 text-xs text-muted-foreground">
                {url || "Download unavailable"}
              </dd>
            </div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={!url}
              onClick={onCopyURL}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy URL
            </Button>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={!url}
              onClick={onCopyMarkdown}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy Markdown
            </Button>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${asset.name} in a new tab`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-10"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open
              </a>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="asset-references-heading">
          <h2 id="asset-references-heading" className="mb-3 text-base font-semibold">References</h2>
          <References
            assetID={asset.id}
            references={references}
            loading={loadingReferences}
            error={referencesError}
            onRetry={onRetryReferences}
          />
        </section>
      </div>
    </div>
  );
}
