/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { dbService } from '../services/db'
import defaultLogo from '../assets/images/default-logo.svg'
import { setPrintPdfIdentity } from '../utils/printPdf'

export const DEFAULT_GARAGE_NAME = 'نٸام إدارة الكراح'

interface GarageIdentityContextType {
  garageName: string
  garageLogo: string
  displayLogo: string
  refreshIdentity: () => Promise<void>
  updateIdentity: (updates: { name?: string; logo?: string }) => Promise<void>
  pickLogo: () => Promise<string | null>
}

const GarageIdentityContext = createContext<GarageIdentityContextType | null>(null)

export function GarageIdentityProvider({ children }: { children: ReactNode }) {
  const [garageName, setGarageName] = useState<string>(DEFAULT_GARAGE_NAME)
  const [garageLogo, setGarageLogo] = useState<string>('')

  const refreshIdentity = useCallback(async () => {
    try {
      const res = await dbService.garageIdentity.get()
      const name = res.name?.trim() || DEFAULT_GARAGE_NAME
      const logo = res.logo || ''
      setGarageName(name)
      setGarageLogo(logo)
      setPrintPdfIdentity(name, logo || defaultLogo)
    } catch (err) {
      console.warn('Failed to load garage identity:', err)
      setPrintPdfIdentity(DEFAULT_GARAGE_NAME, defaultLogo)
    }
  }, [])

  useEffect(() => {
    void refreshIdentity()
  }, [refreshIdentity])

  const updateIdentity = useCallback(async (updates: { name?: string; logo?: string }) => {
    const res = await dbService.garageIdentity.update(updates)
    const name = res.name?.trim() || DEFAULT_GARAGE_NAME
    const logo = res.logo || ''
    setGarageName(name)
    setGarageLogo(logo)
    setPrintPdfIdentity(name, logo || defaultLogo)
  }, [])

  const pickLogo = useCallback(async () => {
    const res = await dbService.garageIdentity.pickLogo()
    if (res) {
      setGarageLogo(res)
      setPrintPdfIdentity(garageName, res)
    }
    return res
  }, [garageName])

  const displayLogo = garageLogo || defaultLogo

  return (
    <GarageIdentityContext.Provider
      value={{
        garageName,
        garageLogo,
        displayLogo,
        refreshIdentity,
        updateIdentity,
        pickLogo,
      }}
    >
      {children}
    </GarageIdentityContext.Provider>
  )
}

export function useGarageIdentity(): GarageIdentityContextType {
  const ctx = useContext(GarageIdentityContext)
  if (!ctx) {
    return {
      garageName: DEFAULT_GARAGE_NAME,
      garageLogo: '',
      displayLogo: defaultLogo,
      refreshIdentity: async () => {},
      updateIdentity: async () => {},
      pickLogo: async () => null,
    }
  }
  return ctx
}
