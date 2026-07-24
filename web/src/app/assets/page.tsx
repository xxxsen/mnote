"use client";

import { useRouter } from "next/navigation";

import { AppPage } from "@/components/app-page";
import { ResponsiveMasterDetail } from "@/components/responsive-master-detail";
import { PageState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";

import { AssetDetail } from "./components/AssetDetail";
import { AssetList } from "./components/AssetList";
import { useAssets } from "./hooks/useAssets";

export default function AssetsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const assets = useAssets(toast);

  return (
    <AppPage
      title="Assets"
      description="Browse uploaded files and the notes that reference them."
      width="wide"
    >
      <ResponsiveMasterDetail
        className="md:h-[calc(100dvh-8rem)]"
        hasSelection={Boolean(assets.selected)}
        mobileDetailOpen={assets.mobileDetailOpen}
        listLabel="Assets"
        detailLabel={assets.selected?.name || "Asset details"}
        listWidthClassName="md:w-80"
        onBackToList={assets.closeMobileDetail}
        list={(
          <AssetList
            assets={assets.assets}
            selectedID={assets.selectedID}
            search={assets.search}
            debouncedSearch={assets.debouncedSearch}
            loading={assets.loading}
            loadingMore={assets.loadingMore}
            initialError={assets.initialError}
            loadMoreError={assets.loadMoreError}
            hasMore={assets.hasMore}
            onSearchChange={assets.setSearch}
            onClearSearch={assets.clearSearch}
            onSelect={assets.selectAsset}
            onRetryInitial={assets.retryInitial}
            onLoadMore={assets.loadMore}
            onBackToNotes={() => router.push("/docs")}
          />
        )}
        detail={(
          <AssetDetail
            asset={assets.selected}
            references={assets.references}
            loadingReferences={assets.loadingReferences}
            referencesError={assets.referencesError}
            onRetryReferences={() => void assets.retryReferences()}
            onCopyURL={assets.copyURL}
            onCopyMarkdown={assets.copyMarkdown}
          />
        )}
        emptyDetail={(
          <PageState
            kind="empty"
            title="Select an asset"
            description="Choose a file to preview it and inspect references."
          />
        )}
      />
    </AppPage>
  );
}
