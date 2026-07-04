import { useEffect, useState } from "react"

import { apiJson } from "@/lib/api"

export function useIntraopFavourites() {
  const [favouriteDrugs, setFavouriteDrugs] = useState<string[]>([])
  const [favouriteInfusions, setFavouriteInfusions] = useState<string[]>([])

  useEffect(() => {
    apiJson<{ preferences?: { intraopFavouriteDrugs?: string[]; intraopFavouriteInfusions?: string[] } }>("/api/user")
      .then(data => {
        setFavouriteDrugs(data.preferences?.intraopFavouriteDrugs ?? [])
        setFavouriteInfusions(data.preferences?.intraopFavouriteInfusions ?? [])
      })
      .catch(() => {})
  }, [])

  return {
    favouriteDrugs,
    favouriteInfusions,
  }
}
