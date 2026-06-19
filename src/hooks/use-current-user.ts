import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/analyses.functions";

export type Role = "admin" | "coordenador" | "lider" | "usuario";

export function useCurrentUser() {
  const fetchProfile = useServerFn(getMyProfile);
  return useQuery({
    queryKey: ["me"],
    queryFn: () => fetchProfile(),
    staleTime: 60_000,
  });
}
