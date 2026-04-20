import { trpc } from "@/trpc";

type Variant = "original" | "sm";

export const useSignedUrl = (
    fileId: string | null | undefined,
    opts?: { variant?: Variant }
) => {
    const variant: Variant = opts?.variant ?? "original";
    const query = trpc.file.getDownloadUrl.useQuery(
        { fileId: fileId ?? "", variant },
        {
            enabled: Boolean(fileId),
            // Presigned URLs expire in 15 min server-side; refresh at 12 min.
            staleTime: 12 * 60 * 1000,
            refetchOnWindowFocus: false,
        }
    );
    return {
        url: query.data?.url,
        mimeType: query.data?.mimeType,
        isLoading: query.isLoading,
    };
};
