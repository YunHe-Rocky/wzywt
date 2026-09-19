export { useRouter, usePathname, useSearchParams } from "./routing-shim";
export function useParams() { return { id: location.pathname.includes("equipment") ? "1136" : "105", slug: "版本更新" }; }
